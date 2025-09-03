import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME, SPACE_DIRECTORY, PUBLIC_URL } from '@/lib/s3-client';
import { randomUUID } from 'crypto';
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

// Reuse assistant ID - reset to force recreation with media tools
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
    
    console.log('🔐 Webhook secret verification:', {
      provided: secret ? 'present' : 'missing',
      expected: process.env.WASSENGER_WEBHOOK_SECRET ? 'configured' : 'not configured',
      matches: secret === process.env.WASSENGER_WEBHOOK_SECRET
    });
    
    if (secret !== process.env.WASSENGER_WEBHOOK_SECRET) {
      console.log('❌ Webhook secret mismatch or missing');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const event = body.event;
    
    // Log all events for debugging
    console.log(`📨 Received webhook event: ${event}`);
    
  

    const { data } = body;
    
    // Skip outgoing messages (safety check)
    if (data.fromMe || data.self === 1 || data.flow === 'outbound') {
      console.log('⏭️ Skipping outgoing message');
      return NextResponse.json({ success: true });
    }
    
    const messageId = data.id || `${Date.now()}-${Math.random()}`;
    const phoneNumber = data.fromNumber || data.from;
    const message = data.body || data.message?.text?.body || '';
    
    // Debug: Log key message properties first
    console.log('📋 Message summary:', {
      id: messageId,
      phone: phoneNumber,
      type: data.type,
      messageType: data.messageType,
      hasBody: !!data.body,
      bodyLength: message?.length || 0,
      hasMedia: !!(data.media || data.message?.imageMessage || data.message?.videoMessage),
      event: event
    });
    
    // Debug: Log the entire message data structure
    console.log('🔍 Full WhatsApp message data:', JSON.stringify(data, null, 2));
    
    // Check for media attachments - Wassenger specific detection
    const hasMedia = data.type === 'image' ||
                    data.type === 'video' ||
                    data.type === 'document' ||
                    data.type === 'audio' ||
                    data.hasMedia ||
                    data.media ||
                    data.message?.imageMessage ||
                    data.message?.videoMessage ||
                    data.message?.documentMessage;
                    
    console.log('🔍 Media detection check:', {
      hasMedia: data.hasMedia,
      media: data.media,
      type: data.type,
      messageType: data.messageType,
      imageMessage: data.message?.imageMessage,
      videoMessage: data.message?.videoMessage,
      documentMessage: data.message?.documentMessage,
      detectedMedia: hasMedia
    });
    
    if (hasMedia) {
      console.log('📎 Media detected in WhatsApp message - proceeding with media handling');
    }
    
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
    
    // Handle media messages
    if (hasMedia) {
      console.log('🔄 Processing media message...');
      
      // Use existing thread if available, don't create new one to preserve context
      let threadId = whatsappThreads.get(phoneNumber);
      
      if (!threadId) {
        console.log('⚠️ No existing thread found for media upload from phone:', phoneNumber);
        console.log('📝 User needs to start a conversation first to establish context');
        
        // Send helpful message instead of creating new thread
        await sendWhatsAppResponse(phoneNumber, 
          'Please start a conversation first before uploading media. Try saying "What are my jobs today?" to get started.'
        );
        
        const msgData = processedMessages.get(messageId);
        if (msgData) {
          msgData.responded = true;
          processedMessages.set(messageId, msgData);
        }
        
        return NextResponse.json({ success: true });
      }
      
      console.log('✅ Using existing thread for media upload:', threadId);
      
      const mediaResponse = await handleMediaMessage(data, phoneNumber);
      if (mediaResponse) {
        // Send response via Wassenger
        await sendWhatsAppResponse(phoneNumber, mediaResponse);
        
        // Mark as responded
        const msgData = processedMessages.get(messageId);
        if (msgData) {
          msgData.responded = true;
          processedMessages.set(messageId, msgData);
        }
        
        console.log(`✅ Media response sent to ${phoneNumber} in ${Date.now() - startTime}ms`);
        return NextResponse.json({ success: true });
      }
    }
    
    // Skip empty text messages (but allow media-only messages to pass through)
    if (!message || !message.trim()) {
      if (!hasMedia) {
        console.log('⏭️ Empty message with no media, skipping');
        return NextResponse.json({ success: true });
      } else {
        // Media message with no text - process as "uploaded media"
        console.log('📎 Media-only message detected');
      }
    }

    console.log(`📨 Processing message from ${phoneNumber}: "${message}" (ID: ${messageId})`);

    // Process with OpenAI Assistant with timeout and fallback
    const TIMEOUT_MS = 30000; // 30 seconds timeout
    
    try {
      // Start the assistant processing
      const assistantPromise = processWithAssistant(phoneNumber, message || 'User uploaded media');
      
      // Race between assistant response and timeout
      const result = await Promise.race([
        assistantPromise,
        new Promise((resolve) => 
          setTimeout(() => resolve('TIMEOUT'), TIMEOUT_MS)
        )
      ]);
      
      if (result === 'TIMEOUT') {
        console.log(`⏰ Assistant response timed out after ${TIMEOUT_MS}ms for ${phoneNumber}`);
        
        // Send immediate fallback message
        await sendWhatsAppResponse(phoneNumber, 
          'I\'m still processing your request. This might take a moment. Please wait, and I\'ll get back to you shortly! 🤖⏳'
        );
        
        // Mark as responded to prevent duplicate processing
        const msgData = processedMessages.get(messageId);
        if (msgData) {
          msgData.responded = true;
          processedMessages.set(messageId, msgData);
        }
        
        // Continue processing in background and send response when ready
        assistantPromise.then(async (assistantResponse) => {
          if (assistantResponse && assistantResponse.trim()) {
            await sendWhatsAppResponse(phoneNumber, assistantResponse);
            console.log(`📤 Delayed response sent to ${phoneNumber} in ${Date.now() - startTime}ms`);
          }
        }).catch(error => {
          console.error('❌ Error in delayed response:', error);
          sendWhatsAppResponse(phoneNumber, 'Sorry, I encountered an error processing your request. Please try again.');
        });
        
      } else if (result && typeof result === 'string' && result.trim()) {
        // Quick response received
        await sendWhatsAppResponse(phoneNumber, result);
        
        // Mark as responded
        const msgData = processedMessages.get(messageId);
        if (msgData) {
          msgData.responded = true;
          processedMessages.set(messageId, msgData);
        }
        
        console.log(`✅ Quick response sent to ${phoneNumber} in ${Date.now() - startTime}ms`);
      }
      
    } catch (error) {
      console.error('❌ Error in assistant processing:', error);
      await sendWhatsAppResponse(phoneNumber, 'Sorry, I encountered an error processing your request. Please try again.');
      
      // Mark as responded
      const msgData = processedMessages.get(messageId);
      if (msgData) {
        msgData.responded = true;
        processedMessages.set(messageId, msgData);
      }
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
      const inspector = await getInspectorByPhone(cleanPhone) as any;
      
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
    name: 'Property Inspector Assistant v1.2',
    instructions: `Property Stewards inspection assistant v1.2. Help inspectors manage daily tasks via WhatsApp.

CORE RULES:
• Use [1][2][3] format for ALL selections
• Map user selection numbers to actual database IDs from tools
• Last option "Mark ALL complete" uses taskId:'complete_all_tasks' + workOrderId
• Format: 🏠property ⏰time 👤customer ⭐priority

FLOWS:

1.JOBS: Greet by name→Show jobs with [#]→Each job: address,time,customer,status→End:"Type [1-3] to select"

2.CONFIRM: Show destination→Ask "[1]Yes [2]No"

3.START: Call startJob→List locations [1-5]→Add "(Done)" to completed→Handle completed location:"Already done, pick another"

4.TASKS: 
• List all tasks [1-4] + final "[5]Mark ALL complete"
• Show (done) for completed tasks only
• Selection 1-4: completeTask(taskId)
• Final option: completeTask(taskId:'complete_all_tasks',workOrderId)
• Allow notes/media upload

5.IDENTIFY: If unknown→Ask name+phone→collectInspectorInfo→+65 default

6.MEDIA: Show URLs with count→"📸2 photos for Room:\n[urls]\n📝Notes"

CRITICAL:
• ALWAYS include "Mark ALL complete" as last option
• Never use display numbers as IDs in tools
• Thread metadata stores context`,
    model: 'gpt-4o-mini',
    tools: assistantTools,
    temperature: 0.3,
    top_p: 0.8
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
  },
  {
    type: 'function' as const,
    function: {
      name: 'getTaskMedia',
      description: 'Get photos and videos for a specific task',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The ContractChecklistItem ID'
          }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'getLocationMedia',
      description: 'Get photos and videos for a specific location by selection number or name',
      parameters: {
        type: 'object',
        properties: {
          locationNumber: {
            type: 'number',
            description: 'The selection number for the location (e.g., 4 for "[4] Bedroom 3")'
          },
          locationName: {
            type: 'string',
            description: 'The name of the location (e.g., "Bedroom 3")'
          },
          workOrderId: {
            type: 'string',
            description: 'The work order ID'
          }
        },
        required: ['workOrderId']
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
          const inspector = await getInspectorByPhone(inspectorPhone) as any;
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

        const jobs = await getTodayJobsForInspector(finalInspectorId) as any[];
        
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
        const workOrder = await getWorkOrderById(args.jobId) as any;
        
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
        
        const locations = await getLocationsWithCompletionStatus(args.jobId) as any[];
        const progress = await getWorkOrderProgress(args.jobId) as any;
        
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
        const locs = await getLocationsWithCompletionStatus(args.jobId) as any[];
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
        let inspector = await getInspectorByPhone(normalizedPhone) as any;
        
        // Also try original phone format
        if (!inspector) {
          inspector = await getInspectorByPhone(phone) as any;
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

      case 'getTaskMedia':
        try {
          console.log('🔧 WhatsApp getTaskMedia called with taskId:', args.taskId);
          
          // Check if the taskId is actually an inspector ID (common mistake)
          if (args.taskId === metadata.inspectorId) {
            console.log('⚠️ TaskId is inspector ID, need to find actual ContractChecklistItem');
            console.log('🔍 Current location from metadata:', metadata.currentLocation);
            console.log('🔍 Work order from metadata:', metadata.workOrderId);
            
            if (metadata.currentLocation && metadata.workOrderId) {
              // Use the imported helper function
              const { getContractChecklistItemIdByLocation } = await import('@/lib/services/inspectorService');
              const actualTaskId = await getContractChecklistItemIdByLocation(metadata.workOrderId, metadata.currentLocation);
              
              if (actualTaskId) {
                console.log('✅ Found actual ContractChecklistItem ID:', actualTaskId);
                const { getTaskMedia } = await import('@/lib/services/inspectorService');
                const mediaInfo = await getTaskMedia(actualTaskId) as any;
                
                if (mediaInfo) {
                  console.log('📸 Found media for location:', metadata.currentLocation, 'photos:', mediaInfo.photoCount, 'videos:', mediaInfo.videoCount);
                  return JSON.stringify({
                    success: true,
                    taskId: actualTaskId,
                    taskName: mediaInfo.name,
                    remarks: mediaInfo.remarks,
                    photos: mediaInfo.photos,
                    videos: mediaInfo.videos,
                    photoCount: mediaInfo.photoCount,
                    videoCount: mediaInfo.videoCount
                  });
                } else {
                  console.log('❌ No media found for ContractChecklistItem ID:', actualTaskId);
                }
              } else {
                console.log('❌ Could not find ContractChecklistItem for location:', metadata.currentLocation);
              }
            }
            
            return JSON.stringify({
              success: false,
              error: 'Could not find media for the current location. Please make sure you are in a specific room/location first.',
            });
          }
          
          // Normal case - try with the provided taskId
          const { getTaskMedia } = await import('@/lib/services/inspectorService');
          const mediaInfo = await getTaskMedia(args.taskId) as any;
          
          if (!mediaInfo) {
            console.log('❌ No media found for taskId:', args.taskId);
            return JSON.stringify({
              success: false,
              error: 'Task not found or no media available.',
            });
          }
          
          console.log('📸 Found media for taskId:', args.taskId, 'photos:', mediaInfo.photoCount, 'videos:', mediaInfo.videoCount);
          return JSON.stringify({
            success: true,
            taskId: args.taskId,
            taskName: mediaInfo.name,
            remarks: mediaInfo.remarks,
            photos: mediaInfo.photos,
            videos: mediaInfo.videos,
            photoCount: mediaInfo.photoCount,
            videoCount: mediaInfo.videoCount
          });
        } catch (error) {
          console.error('❌ Error in WhatsApp getTaskMedia:', error);
          return JSON.stringify({
            success: false,
            error: 'Failed to get media.'
          });
        }

      case 'getLocationMedia':
        try {
          console.log('🔧 WhatsApp getLocationMedia called with:', { 
            locationNumber: args.locationNumber, 
            locationName: args.locationName, 
            workOrderId: args.workOrderId 
          });
          
          const locationsWithStatus = await getLocationsWithCompletionStatus(args.workOrderId) as any[];
          console.log('📍 Available locations in WhatsApp webhook:', locationsWithStatus.map((loc, index) => ({
            number: index + 1,
            name: loc.name,
            id: loc.contractChecklistItemId
          })));
          
          let targetLocation = null;
          
          // Find by number if provided
          if (args.locationNumber && args.locationNumber > 0 && args.locationNumber <= locationsWithStatus.length) {
            targetLocation = locationsWithStatus[args.locationNumber - 1];
            console.log('🎯 WhatsApp found location by number', args.locationNumber, ':', targetLocation.name);
          }
          // Find by name if number not found or not provided
          else if (args.locationName) {
            targetLocation = locationsWithStatus.find((loc: any) => 
              loc.name.toLowerCase() === args.locationName.toLowerCase()
            );
            console.log('🎯 WhatsApp found location by name', args.locationName, ':', targetLocation?.name);
          }
          
          if (!targetLocation) {
            console.log('❌ WhatsApp location not found');
            return JSON.stringify({
              success: false,
              error: `Location not found. Available locations: ${locationsWithStatus.map((loc: any, index: number) => `[${index + 1}] ${loc.name}`).join(', ')}`
            });
          }
          
          // Get media using the ContractChecklistItem ID
          console.log('📎 Getting media for ContractChecklistItem ID:', targetLocation.contractChecklistItemId);
          const { getTaskMedia: getTaskMediaFunc } = await import('@/lib/services/inspectorService');
          const locationMediaInfo = await getTaskMediaFunc(targetLocation.contractChecklistItemId) as any;
          
          if (!locationMediaInfo) {
            console.log('❌ No media found for WhatsApp location:', targetLocation.name);
            return JSON.stringify({
              success: false,
              error: `No media found for ${targetLocation.name}.`
            });
          }
          
          console.log('📸 WhatsApp found media for location:', targetLocation.name, 'photos:', locationMediaInfo.photoCount, 'videos:', locationMediaInfo.videoCount);
          return JSON.stringify({
            success: true,
            location: targetLocation.name,
            locationNumber: locationsWithStatus.indexOf(targetLocation) + 1,
            taskId: targetLocation.contractChecklistItemId,
            taskName: locationMediaInfo.name,
            remarks: locationMediaInfo.remarks,
            photos: locationMediaInfo.photos,
            videos: locationMediaInfo.videos,
            photoCount: locationMediaInfo.photoCount,
            videoCount: locationMediaInfo.videoCount
          });
        } catch (error) {
          console.error('❌ Error in WhatsApp getLocationMedia:', error);
          return JSON.stringify({
            success: false,
            error: 'Failed to get location media.'
          });
        }

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

// Handle WhatsApp media messages (photos/videos)
async function handleMediaMessage(data: any, phoneNumber: string): Promise<string | null> {
  try {
    console.log('🔄 Processing WhatsApp media message');
    
    // Get thread for this phone number
    let threadId = whatsappThreads.get(phoneNumber);
    if (!threadId) {
      console.log('❌ No thread found for media upload');
      return 'Please start a conversation first before uploading media.';
    }
    
    // Get thread metadata for context
    const thread = await openai.beta.threads.retrieve(threadId);
    const metadata = thread.metadata || {};
    console.log('📋 Thread metadata for media upload:', metadata);
    
    // Check if we have work order context
    const workOrderId = metadata.workOrderId;
    let currentLocation = metadata.currentLocation;
    
    console.log('🔍 Media upload context check:', {
      workOrderId: workOrderId,
      currentLocation: currentLocation,
      hasWorkOrder: !!workOrderId,
      hasLocation: !!currentLocation
    });
    
    if (!workOrderId) {
      console.log('⚠️ No work order context - media upload without job context');
      return 'Please select a job first before uploading media. Try saying "what are my jobs today?" to get started.';
    }
    
    if (!currentLocation) {
      console.log('⚠️ No specific location context - will try to find the active location or use general');
      
      // Try to find the most recent location from work order
      if (workOrderId) {
        try {
          const workOrder = await prisma.workOrder.findUnique({
            where: { id: workOrderId },
            include: {
              contract: {
                include: {
                  contractChecklist: {
                    include: {
                      items: {
                        orderBy: { order: 'asc' }
                      }
                    }
                  }
                }
              }
            }
          });
          
          if (workOrder?.contract.contractChecklist?.items.length) {
            // Find the first location that has some progress but isn't completed
            const activeItem = workOrder.contract.contractChecklist.items.find(
              item => item.enteredOn === null // Not completed yet
            );
            
            if (activeItem) {
              currentLocation = activeItem.name;
              console.log('✅ Found active location from work order:', currentLocation);
            } else {
              // All items are complete, use the last one
              const lastItem = workOrder.contract.contractChecklist.items[workOrder.contract.contractChecklist.items.length - 1];
              currentLocation = lastItem.name;
              console.log('✅ Using last location from work order:', currentLocation);
            }
          }
        } catch (error) {
          console.log('⚠️ Could not determine location from work order:', error);
        }
      }
      
      if (!currentLocation) {
        currentLocation = 'general';
        console.log('⚠️ Using general folder for media upload');
      }
    }
    
    // Extract media URL from WhatsApp data - Enhanced for multiple Wassenger formats
    let mediaUrl: string | null = null;
    let mediaType: 'photo' | 'video' = 'photo';
    
    // Check various possible media fields from Wassenger - prioritize type-based detection
    if (data.type === 'image') {
      // Wassenger image message
      mediaUrl = data.url || data.fileUrl || data.media?.url;
      mediaType = 'photo';
      console.log('📎 Found image via type=image:', { url: mediaUrl, type: data.type });
    } else if (data.type === 'video') {
      // Wassenger video message  
      mediaUrl = data.url || data.fileUrl || data.media?.url;
      mediaType = 'video';
      console.log('📎 Found video via type=video:', { url: mediaUrl, type: data.type });
    } else if (data.type === 'document' && (data.mimetype?.startsWith('image/') || data.mimeType?.startsWith('image/'))) {
      // Wassenger document that's actually an image
      mediaUrl = data.url || data.fileUrl || data.media?.url;
      mediaType = 'photo';
      console.log('📎 Found image via type=document:', { url: mediaUrl, mimetype: data.mimetype || data.mimeType });
    } else if (data.media && data.media.url) {
      mediaUrl = data.media.url;
      mediaType = data.media.mimetype?.startsWith('video/') ? 'video' : 'photo';
      console.log('📎 Found media in data.media:', { url: mediaUrl, mimetype: data.media.mimetype });
    } else if (data.message?.imageMessage?.url) {
      mediaUrl = data.message.imageMessage.url;
      mediaType = 'photo';
      console.log('📎 Found media in data.message.imageMessage:', mediaUrl);
    } else if (data.message?.videoMessage?.url) {
      mediaUrl = data.message.videoMessage.url;
      mediaType = 'video';
      console.log('📎 Found media in data.message.videoMessage:', mediaUrl);
    } else if (data.url) {
      mediaUrl = data.url;
      mediaType = (data.mimetype || data.mimeType)?.startsWith('video/') ? 'video' : 'photo';
      console.log('📎 Found media in data.url:', { url: mediaUrl, mimetype: data.mimetype || data.mimeType });
    } else if (data.fileUrl) {
      mediaUrl = data.fileUrl;
      mediaType = (data.mimetype || data.mimeType)?.startsWith('video/') ? 'video' : 'photo';
      console.log('📎 Found media in data.fileUrl:', { url: mediaUrl, mimetype: data.mimetype || data.mimeType });
    }
    
    console.log('🔍 Media extraction result:', { mediaUrl, mediaType });
    
    if (!mediaUrl) {
      console.log('❌ No media URL found in WhatsApp message');
      return 'Media upload failed - could not find media URL.';
    }
    
    console.log('📎 Found media:', { mediaUrl, mediaType });
    
    // Download media from WhatsApp/Wassenger
    console.log('⬇️ Downloading media from:', mediaUrl);
    console.log('📱 Attempting fetch with headers for Wassenger media...');
    
    const response = await fetch(mediaUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Property-Stewards-Bot/1.0',
        'Accept': 'image/*,video/*,*/*'
      }
    });
    
    console.log('📡 Media download response:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);
    
    console.log('📦 Downloaded media buffer size:', buffer.byteLength, 'bytes');
    
    // Extract context from metadata for DigitalOcean path
    let customerName = 'unknown';
    let postalCode = 'unknown';
    let roomName = currentLocation || 'general';
    
    if (metadata.customerName) {
      customerName = metadata.customerName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/gi, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
    }
    
    postalCode = metadata.postalCode || 'unknown';
    roomName = roomName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/gi, '')
      .replace(/\s+/g, '-');
    
    // Generate unique filename
    const uuid = randomUUID();
    const timestamp = Date.now();
    const extension = mediaType === 'video' ? 'mp4' : 'jpeg';
    const filename = `${uuid}-${timestamp}.${extension}`;
    
    // Create S3/DO Spaces path
    const key = `${SPACE_DIRECTORY}/data/${customerName}-${postalCode}/${roomName}/${mediaType === 'photo' ? 'photos' : 'videos'}/${filename}`;
    
    console.log('📤 Uploading to DigitalOcean Spaces:', key);
    
    // Upload to DigitalOcean Spaces
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: uint8Array,
      ContentType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
      ACL: 'public-read' as const,
      Metadata: {
        workOrderId: workOrderId,
        location: roomName,
        mediaType: mediaType,
        originalName: filename,
        uploadedAt: new Date().toISOString(),
        source: 'whatsapp'
      },
    };
    
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);
    
    const publicUrl = `${PUBLIC_URL}/${key}`;
    console.log('✅ Uploaded to DigitalOcean Spaces:', publicUrl);
    
    // Save to database - find ContractChecklistItem for this location
    if (workOrderId && roomName !== 'general') {
      const normalizedRoomName = roomName.replace(/-/g, ' ');
      const workOrder = await prisma.workOrder.findUnique({
        where: { id: workOrderId },
        include: {
          contract: {
            include: {
              contractChecklist: {
                include: {
                  items: true
                }
              }
            }
          }
        }
      });
      
      if (workOrder?.contract.contractChecklist) {
        // Find ContractChecklistItem for this location
        const matchingItem = workOrder.contract.contractChecklist.items.find(
          (item: any) => item.name.toLowerCase() === normalizedRoomName.toLowerCase()
        );
        
        if (matchingItem) {
          // Update ContractChecklistItem with new media
          const currentPhotos = matchingItem.photos || [];
          const currentVideos = matchingItem.videos || [];
          
          if (mediaType === 'photo') {
            await prisma.contractChecklistItem.update({
              where: { id: matchingItem.id },
              data: {
                photos: [...currentPhotos, publicUrl]
              }
            });
            console.log('💾 Saved photo to database');
          } else {
            await prisma.contractChecklistItem.update({
              where: { id: matchingItem.id },
              data: {
                videos: [...currentVideos, publicUrl]
              }
            });
            console.log('💾 Saved video to database');
          }
        } else {
          console.log('⚠️ No matching ContractChecklistItem found for location:', normalizedRoomName);
        }
      }
    }
    
    // Return success message
    const locationName = currentLocation === 'general' ? 'your current job' : currentLocation;
    return `✅ ${mediaType === 'photo' ? 'Photo' : 'Video'} uploaded successfully for ${locationName}!\n\nYou can continue with your inspection or upload more media.`;
    
  } catch (error) {
    console.error('❌ Error handling WhatsApp media:', error);
    return 'Failed to upload media. Please try again.';
  }
}