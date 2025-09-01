import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { 
  getTodayJobsForInspector,
  getWorkOrderById,
  updateWorkOrderStatus,
  getTasksByLocation,
  getLocationsWithCompletionStatus,
  updateTaskStatus,
  getInspectorByPhone,
  updateWorkOrderDetails,
  completeAllTasksForLocation,
  getWorkOrderProgress
} from '@/lib/services/inspectorService';
import prisma from '@/lib/prisma';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Cache for processed messages (prevents duplicates)
const processedMessages = new Map<string, {
  timestamp: number;
  responseId: string;
  responded: boolean;
}>();

// Thread management for WhatsApp conversations
const whatsappThreads = new Map<string, string>();

// Reuse assistant ID
let assistantId: string | null = null;

// Clean up old processed messages every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [msgId, data] of processedMessages.entries()) {
    if (now - data.timestamp > 300000) { // 5 minutes
      processedMessages.delete(msgId);
    }
  }
}, 60000); // Check every minute

// GET - Webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  if (secret === process.env.WASSENGER_WEBHOOK_SECRET) {
    console.log('✅ Wassenger webhook verified');
    return new Response('OK', { status: 200 });
  }
  
  return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
}

// POST - Handle incoming messages
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Verify webhook secret
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    if (secret !== process.env.WASSENGER_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const event = body.event;
    
    // Only process incoming messages
    if (event !== 'message:in:new') {
      console.log(`⏭️ Ignoring event: ${event}`);
      return NextResponse.json({ success: true });
    }

    const { data } = body;
    
    // Skip outgoing messages (safety check)
    if (data.fromMe || data.self === 1 || data.flow === 'outbound') {
      console.log('⏭️ Skipping outgoing message');
      return NextResponse.json({ success: true });
    }
    
    const messageId = data.id || `${Date.now()}-${Math.random()}`;
    const phoneNumber = data.fromNumber || data.from;
    const message = data.body || data.message?.text?.body || '';
    
    // Check if already processed
    const processed = processedMessages.get(messageId);
    if (processed && processed.responded) {
      console.log(`⏭️ Message ${messageId} already processed and responded`);
      return NextResponse.json({ success: true });
    }
    
    // Mark as being processed
    processedMessages.set(messageId, {
      timestamp: Date.now(),
      responseId: `resp-${Date.now()}`,
      responded: false
    });
    
    // Skip empty messages
    if (!message || !message.trim()) {
      console.log('⏭️ Empty message, skipping');
      return NextResponse.json({ success: true });
    }

    console.log(`📨 Processing message from ${phoneNumber}: "${message}" (ID: ${messageId})`);

    // Process with OpenAI Assistant - optimized for speed
    const assistantResponse = await processWithAssistant(phoneNumber, message);
    
    if (assistantResponse && assistantResponse.trim()) {
      // Send response via Wassenger
      await sendWhatsAppResponse(phoneNumber, assistantResponse);
      
      // Mark as responded
      const msgData = processedMessages.get(messageId);
      if (msgData) {
        msgData.responded = true;
        processedMessages.set(messageId, msgData);
      }
      
      console.log(`✅ Response sent to ${phoneNumber} in ${Date.now() - startTime}ms`);
    }

    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    // Return success to prevent webhook retries
    return NextResponse.json({ success: true });
  }
}

// Process message with OpenAI Assistant
async function processWithAssistant(phoneNumber: string, message: string): Promise<string> {
  try {
    const cleanPhone = phoneNumber.replace(/[\s+]/g, '');
    
    // Get or create thread
    let threadId = whatsappThreads.get(cleanPhone);
    
    if (!threadId) {
      const inspector = await getInspectorByPhone(cleanPhone);
      
      const thread = await openai.beta.threads.create({
        metadata: {
          channel: 'whatsapp',
          phoneNumber: cleanPhone,
          inspectorId: inspector?.id || '',
          inspectorName: inspector?.name || '',
          workOrderId: '',
          currentLocation: '',
          createdAt: new Date().toISOString()
        }
      });
      
      threadId = thread.id;
      whatsappThreads.set(cleanPhone, threadId);
      console.log(`🆕 Created thread ${threadId} for ${cleanPhone}`);
    }

    // Add message to thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });

    // Get or create assistant
    if (!assistantId) {
      assistantId = await createAssistant();
    }

    // Run assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId
    });

    // Wait for completion
    let runStatus = await waitForRunCompletion(threadId, run.id);

    // Handle tool calls
    if (runStatus.status === 'requires_action') {
      await handleToolCalls(threadId, run.id, runStatus, cleanPhone);
      runStatus = await waitForRunCompletion(threadId, run.id);
    }

    // Get assistant's response
    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data[0];
    
    if (lastMessage && lastMessage.role === 'assistant') {
      const content = lastMessage.content[0];
      if (content.type === 'text') {
        return content.text.value;
      }
    }

    return '';
    
  } catch (error) {
    console.error('Error processing with assistant:', error);
    return 'Sorry, I encountered an error processing your request. Please try again.';
  }
}

// Wait for run completion - maximum speed
async function waitForRunCompletion(threadId: string, runId: string) {
  let attempts = 0;
  const maxAttempts = 50; // 5 seconds max (100ms intervals)
  
  let runStatus = await openai.beta.threads.runs.retrieve(runId, {
    thread_id: threadId
  });
  
  while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100)); // Very fast polling
    runStatus = await openai.beta.threads.runs.retrieve(runId, {
      thread_id: threadId
    });
    attempts++;
  }
  
  return runStatus;
}

// Handle tool calls
async function handleToolCalls(threadId: string, runId: string, runStatus: any, phoneNumber: string) {
  const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || [];
  const toolOutputs = [];

  for (const toolCall of toolCalls) {
    const functionName = toolCall.function.name;
    const functionArgs = JSON.parse(toolCall.function.arguments);
    
    // Add phone number for relevant tools
    if (functionName === 'getTodayJobs' && !functionArgs.inspectorPhone) {
      functionArgs.inspectorPhone = phoneNumber;
    }
    
    if (functionName === 'collectInspectorInfo' && !functionArgs.phone) {
      functionArgs.phone = phoneNumber;
    }
    
    const output = await executeTool(functionName, functionArgs, threadId);
    
    toolOutputs.push({
      tool_call_id: toolCall.id,
      output: output
    });
  }

  await openai.beta.threads.runs.submitToolOutputs(runId, {
    thread_id: threadId,
    tool_outputs: toolOutputs
  });
}

// Send WhatsApp response via Wassenger
async function sendWhatsAppResponse(to: string, message: string) {
  try {
    const response = await fetch('https://api.wassenger.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': process.env.WASSENGER_API_KEY!
      },
      body: JSON.stringify({
        phone: to,
        message: message // Wassenger uses 'message' field
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Wassenger API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    console.log(`✅ Message sent to ${to}`);
    return result;
    
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    throw error;
  }
}

// Create assistant optimized for WhatsApp speed
async function createAssistant() {
  const assistant = await openai.beta.assistants.create({
    name: 'Property Inspector Assistant v0.7',
    instructions: `You are a helpful Property Stewards inspection assistant v0.7. You help property inspectors manage their daily inspection tasks via chat.

Key capabilities:
- Show today's inspection jobs for an inspector
- Help select and start specific inspection jobs
- Allow job detail modifications before starting
- Guide through room-by-room inspection workflow
- Track task completion and progress

CRITICAL: Task ID Management
- Tasks have two identifiers:
  1. Display number: [1], [2], [3] shown to users for easy selection
  2. Database ID: Actual CUID like "cmeps0xtz0006m35wcrtr8wx9" used in all tool calls
- ALWAYS map user's selection (e.g., "7") to the actual task ID from getTasksForLocation
- NEVER pass display numbers as taskId parameters to tools
- When user selects the LAST option (Mark ALL tasks complete):
  * Recognize this is different from individual tasks
  * MUST call completeTask with:
    - taskId: 'complete_all_tasks'
    - location: The current location name from context (e.g., 'Kitchen', 'Master Bedroom')
    - workOrderId: Current work order ID
    - notes: Any comments provided (optional)
  * Remember: location parameter is REQUIRED - get it from the current context
  * This single call will update enteredOn and mark all tasks done

CONVERSATION FLOW GUIDELINES:

1. Showing Today's Jobs:
   - Greet the inspector by name (e.g., "Hi Ken")
   - IMPORTANT: Start each job entry with its selection number: [1], [2], [3] etc.
   - Format each job clearly with emojis: 🏠 property, ⏰ time, ⭐ priority, 👤 customer
   - Include address, postal code, customer name, status, and any notes
   - Use separator lines (---) between jobs for clarity
   - Example format:
     [1]
     🏠 Property: 123 Punggol Walk, 822121
     ⏰ Time: 08:00 am
     👤 Customer: Hang
     ⭐ Priority: High
     Status: STARTED
   - End with numbered selection prompt like "Type [1], [2] or [3] to select"

2. Job Selection and Confirmation:
   - When user selects a job, use confirmJobSelection tool
   - Display the destination details clearly
   - Ask for confirmation with options: [1] Yes [2] No
   - Be conversational: "Please confirm the destination" or similar

3. Starting Inspection:
   - Once confirmed, use startJob tool
   - Update status to STARTED automatically
   - Display available rooms/locations for inspection
   - When showing locations, automatically append "(Done)" to locations where all tasks are completed
   - Format as: "[1] Living Room (Done)" for completed locations

4. Task Inspection Flow:
   - When showing tasks for a location, ALWAYS format them with brackets
   - ALWAYS add "Mark ALL tasks complete" as the last numbered option
   - DO NOT show task completion count during task inspection

5. General Guidelines:
   - Always use numbered brackets [1], [2], [3] for selections
   - Be friendly and professional
   - Remember context from previous messages
   - Handle errors gracefully with helpful messages

INSPECTOR IDENTIFICATION:
- Check if inspector is already identified in thread metadata
- If unknown, politely ask: "Hello! To assign you today's inspection jobs, I need your details. Please provide:
  [1] Your full name
  [2] Your phone number (with country code, e.g., +65 for Singapore)"
- If no country code provided, assume Singapore (+65)
- Use the collectInspectorInfo tool to process this information
- Inspector phone number is automatically extracted from WhatsApp message
- Inspector can be found by either name OR phone number
- Once identified, provide helpful suggestions for next steps
- Be conversational and helpful throughout the identification process`,
    model: 'gpt-4o-mini', // Fast model for quick responses
    tools: assistantTools
  });

  console.log('Created assistant:', assistant.id);
  return assistant.id;
}

// Tool definitions (simplified for WhatsApp)
const assistantTools = [
  {
    type: 'function' as const,
    function: {
      name: 'getTodayJobs',
      description: 'Get today\'s inspection jobs',
      parameters: {
        type: 'object',
        properties: {
          inspectorId: {
            type: 'string',
            description: 'Inspector ID'
          },
          inspectorPhone: {
            type: 'string',
            description: 'Inspector phone number'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'selectJob',
      description: 'Select a job to inspect',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'Work order ID'
          }
        },
        required: ['jobId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'confirmJobSelection',
      description: 'Confirm job selection',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'Work order ID'
          }
        },
        required: ['jobId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'startJob',
      description: 'Start the job',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'Work order ID'
          }
        },
        required: ['jobId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'getJobLocations',
      description: 'Get locations for inspection',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'Work order ID'
          }
        },
        required: ['jobId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'getTasksForLocation',
      description: 'Get tasks for a location',
      parameters: {
        type: 'object',
        properties: {
          workOrderId: {
            type: 'string'
          },
          location: {
            type: 'string'
          }
        },
        required: ['workOrderId', 'location']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'completeTask',
      description: 'Mark task as complete',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string'
          },
          workOrderId: {
            type: 'string'
          },
          notes: {
            type: 'string'
          }
        },
        required: ['taskId', 'workOrderId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'updateJobDetails',
      description: 'Update job details',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string'
          },
          updateType: {
            type: 'string',
            enum: ['customer', 'address', 'time', 'status']
          },
          newValue: {
            type: 'string'
          }
        },
        required: ['jobId', 'updateType', 'newValue']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'collectInspectorInfo',
      description: 'Collect and validate inspector name and phone number for identification',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Inspector full name'
          },
          phone: {
            type: 'string',
            description: 'Inspector phone number with country code (e.g., +6512345678)'
          }
        },
        required: ['name', 'phone']
      }
    }
  }
];

// Tool execution
async function executeTool(toolName: string, args: any, threadId?: string): Promise<string> {
  try {
    // Get thread metadata for context
    let metadata: any = {};
    if (threadId) {
      try {
        const thread = await openai.beta.threads.retrieve(threadId);
        metadata = thread.metadata || {};
      } catch (error) {
        console.error('Error getting thread metadata:', error);
      }
    }

    switch (toolName) {
      case 'getTodayJobs':
        const { inspectorId, inspectorPhone } = args;
        let finalInspectorId = inspectorId;
        
        // Check thread metadata for inspector info first
        if (!finalInspectorId && threadId) {
          const thread = await openai.beta.threads.retrieve(threadId);
          const metadata = thread.metadata || {};
          finalInspectorId = metadata.inspectorId;
        }
        
        if (!finalInspectorId && inspectorPhone) {
          const inspector = await getInspectorByPhone(inspectorPhone);
          if (!inspector) {
            return JSON.stringify({
              success: false,
              error: 'Inspector not found. Please provide your name and phone number for identification.'
            });
          }
          finalInspectorId = inspector.id;
        }
        
        if (!finalInspectorId) {
          return JSON.stringify({
            success: false,
            error: 'Inspector identification required. Please provide your name and phone number.'
          });
        }

        const jobs = await getTodayJobsForInspector(finalInspectorId);
        
        return JSON.stringify({
          success: true,
          jobs: jobs.map((job, index) => ({
            id: job.id,
            jobNumber: index + 1,
            property: job.property_address,
            customer: job.customer_name,
            time: job.scheduled_date.toLocaleTimeString('en-SG', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            }),
            status: job.status,
            priority: job.priority
          })),
          count: jobs.length
        });

      case 'confirmJobSelection':
        const workOrder = await getWorkOrderById(args.jobId);
        
        if (!workOrder) {
          return JSON.stringify({
            success: false,
            error: 'Job not found'
          });
        }
        
        // Update thread metadata
        if (threadId) {
          const postalCodeMatch = workOrder.property_address.match(/\b(\d{6})\b/);
          await openai.beta.threads.update(threadId, {
            metadata: {
              ...metadata,
              workOrderId: args.jobId,
              customerName: workOrder.customer_name,
              propertyAddress: workOrder.property_address,
              postalCode: postalCodeMatch ? postalCodeMatch[1] : 'unknown',
              jobStatus: 'confirming'
            }
          });
        }
        
        return JSON.stringify({
          success: true,
          message: 'Please confirm the destination',
          jobDetails: {
            id: args.jobId,
            property: workOrder.property_address,
            customer: workOrder.customer_name,
            time: workOrder.scheduled_start.toLocaleTimeString('en-SG', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            }),
            status: workOrder.status
          }
        });

      case 'startJob':
        await updateWorkOrderStatus(args.jobId, 'in_progress');
        
        if (threadId) {
          await openai.beta.threads.update(threadId, {
            metadata: {
              ...metadata,
              jobStatus: 'started',
              jobStartedAt: new Date().toISOString()
            }
          });
        }
        
        const locations = await getLocationsWithCompletionStatus(args.jobId);
        const progress = await getWorkOrderProgress(args.jobId);
        
        return JSON.stringify({
          success: true,
          message: 'Job started successfully!',
          locations: locations.map(loc => loc.displayName),
          locationsDetail: locations,
          progress: {
            total: progress.total_tasks,
            completed: progress.completed_tasks,
            pending: progress.pending_tasks
          }
        });

      case 'getJobLocations':
        const locs = await getLocationsWithCompletionStatus(args.jobId);
        return JSON.stringify({
          success: true,
          locations: locs.map(loc => ({
            name: loc.name,
            displayName: loc.displayName,
            isCompleted: loc.isCompleted,
            tasks: loc.totalTasks,
            completed: loc.completedTasks
          }))
        });

      case 'getTasksForLocation':
        // Update current location in thread
        if (threadId) {
          await openai.beta.threads.update(threadId, {
            metadata: {
              ...metadata,
              currentLocation: args.location,
              lastLocationAccessedAt: new Date().toISOString()
            }
          });
        }
        
        const tasks = await getTasksByLocation(args.workOrderId, args.location);
        
        return JSON.stringify({
          success: true,
          location: args.location,
          tasks: tasks.map((task: any, index: number) => ({
            id: task.id,
            number: index + 1,
            description: task.action,
            status: task.status,
            displayStatus: task.status === 'completed' ? 'done' : 'pending'
          }))
        });

      case 'completeTask':
        if (args.taskId === 'complete_all_tasks') {
          // Get location from thread metadata
          let location = metadata.currentLocation || '';
          
          if (!location) {
            return JSON.stringify({
              success: false,
              error: 'Could not determine current location'
            });
          }
          
          const success = await completeAllTasksForLocation(args.workOrderId, location);
          
          return JSON.stringify({
            success,
            message: success ? `All tasks for ${location} completed!` : 'Failed to complete tasks'
          });
        } else {
          const success = await updateTaskStatus(args.taskId, 'completed', args.notes);
          
          return JSON.stringify({
            success,
            message: success ? 'Task completed!' : 'Failed to complete task'
          });
        }

      case 'updateJobDetails':
        const updateSuccess = await updateWorkOrderDetails(args.jobId, args.updateType, args.newValue);
        
        return JSON.stringify({
          success: updateSuccess,
          message: updateSuccess ? `Updated ${args.updateType}` : 'Failed to update'
        });

      case 'collectInspectorInfo':
        const { name, phone } = args;
        
        // Normalize phone number - add +65 if no country code
        let normalizedPhone = phone.replace(/[\s-]/g, '');
        if (!normalizedPhone.startsWith('+')) {
          normalizedPhone = '+65' + normalizedPhone;
        }
        
        // Try to find inspector by normalized phone first
        let inspector = await getInspectorByPhone(normalizedPhone);
        
        // Also try original phone format
        if (!inspector) {
          inspector = await getInspectorByPhone(phone);
        }
        
        // If not found by phone, try by name
        if (!inspector) {
          const inspectors = await prisma.inspector.findMany({
            where: {
              name: {
                contains: name,
                mode: 'insensitive'
              }
            }
          });
          inspector = inspectors[0] || null;
        }
        
        if (!inspector) {
          return JSON.stringify({
            success: false,
            error: 'Inspector not found in our system. Please contact admin for registration.'
          });
        }
        
        // Store inspector details in thread metadata (non-blocking)
        if (threadId) {
          // Fast metadata update
          await openai.beta.threads.update(threadId, {
            metadata: {
              channel: 'whatsapp',
              phoneNumber: normalizedPhone,
              inspectorId: inspector.id,
              inspectorName: inspector.name,
              inspectorPhone: inspector.mobilePhone || normalizedPhone,
              identifiedAt: new Date().toISOString()
            }
          });
        }
        
        return JSON.stringify({
          success: true,
          message: `Welcome ${inspector.name}! I've identified you in our system.\n\nTry: "What are my jobs today?" or "Show me pending inspections"`,
          inspector: {
            id: inspector.id,
            name: inspector.name,
            phone: inspector.mobilePhone
          }
        });

      default:
        return JSON.stringify({
          success: false,
          error: `Unknown tool: ${toolName}`
        });
    }
  } catch (error) {
    console.error(`Tool execution error for ${toolName}:`, error);
    return JSON.stringify({
      success: false,
      error: 'Tool execution failed'
    });
  }
}