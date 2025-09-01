import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { 
  getTodayJobsForInspector,
  getWorkOrderById,
  getTasksByLocation,
  getLocationsWithCompletionStatus,
  updateTaskStatus,
  getInspectorByPhone,
  completeAllTasksForLocation
} from '@/lib/services/inspectorService';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Store for WhatsApp threads (in production, use Redis or database)
const whatsappThreads = new Map<string, string>();

// Reuse assistant from chat or create dedicated one
let assistantId: string | null = null;

// GET - Webhook verification (Wassenger uses query params for verification)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  // Verify the secret matches
  if (secret === process.env.WASSENGER_WEBHOOK_SECRET) {
    console.log('✅ Webhook verified');
    return new Response('OK', { status: 200 });
  }

  return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
}

// POST - Handle incoming WhatsApp messages from Wassenger
export async function POST(request: NextRequest) {
  try {
    // Verify secret in query params
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    
    if (secret !== process.env.WASSENGER_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    console.log('📱 WhatsApp webhook received:', JSON.stringify(body, null, 2));

    // Wassenger webhook format
    if (body.event === 'message:in:new') {
      const { data } = body;
      
      // Extract message details
      const phoneNumber = data.fromNumber || data.from;
      const message = data.body || data.message?.text?.body || '';
      // const messageId = data.id; // Unused variable
      
      // Skip if no message content
      if (!message) {
        return NextResponse.json({ success: true });
      }

      console.log(`📨 Message from ${phoneNumber}: ${message}`);

      // Process with OpenAI and send response
      const response = await processMessageWithAssistant(phoneNumber, message);
      
      // Send response back via Wassenger
      if (response) {
        await sendWhatsAppMessage(phoneNumber, response);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function processMessageWithAssistant(phoneNumber: string, message: string): Promise<string> {
  try {
    // Clean phone number (remove + and spaces)
    const cleanPhone = phoneNumber.replace(/[\s+]/g, '');
    
    // Get or create thread for this phone number
    let threadId = whatsappThreads.get(cleanPhone);
    
    if (!threadId) {
      // Look up inspector by phone
      const inspector = await getInspectorByPhone(cleanPhone);
      
      const thread = await openai.beta.threads.create({
        metadata: {
          channel: 'whatsapp',
          phoneNumber: cleanPhone,
          inspectorId: inspector?.id || '',
          inspectorName: inspector?.name || '',
          createdAt: new Date().toISOString()
        }
      });
      threadId = thread.id;
      whatsappThreads.set(cleanPhone, threadId);
      console.log(`🆕 Created thread for ${cleanPhone}: ${threadId}`);
    }

    // Add message to thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });

    // Get or create assistant
    const currentAssistantId = await getOrCreateWhatsAppAssistant();

    // Run assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: currentAssistantId
    });

    // Wait for completion
    let runStatus = await openai.beta.threads.runs.retrieve(run.id, {
      thread_id: threadId
    });
    let attempts = 0;
    const maxAttempts = 30;

    while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(run.id, {
        thread_id: threadId
      });
      attempts++;
    }

    // Handle tool calls if required
    if (runStatus.status === 'requires_action') {
      const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || [];
      const toolOutputs = [];

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        // Add inspector phone if not provided
        if (!functionArgs.inspectorPhone) {
          functionArgs.inspectorPhone = cleanPhone;
        }
        
        console.log('Executing tool:', functionName, functionArgs);
        const output = await executeTool(functionName, functionArgs);
        
        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: output
        });
      }

      // Submit tool outputs
      await openai.beta.threads.runs.submitToolOutputs(run.id, {
        thread_id: threadId,
        tool_outputs: toolOutputs
      });

      // Wait for final completion
      attempts = 0;
      runStatus = await openai.beta.threads.runs.retrieve(run.id, {
        thread_id: threadId
      });
      while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(run.id, {
          thread_id: threadId
        });
        attempts++;
      }
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

    return 'Sorry, I could not process your request. Please try again.';
  } catch (error) {
    console.error('Error processing message:', error);
    return 'An error occurred. Please try again or contact support.';
  }
}

// Send message back via Wassenger API
async function sendWhatsAppMessage(to: string, message: string) {
  try {
    // Split long messages (WhatsApp has a 4096 character limit)
    const maxLength = 4000;
    const messages = message.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [message];

    for (const msgPart of messages) {
      const response = await fetch('https://api.wassenger.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Token': process.env.WASSENGER_API_KEY!
        },
        body: JSON.stringify({
          phone: to,
          message: msgPart  // Changed from 'body' to 'message' per Wassenger API docs
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Wassenger API error: ${response.status} - ${error}`);
      }

      const result = await response.json();
      console.log(`✅ Message sent to ${to}`);
      
      // Small delay between messages to avoid rate limiting
      if (messages.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    throw error;
  }
}

// Create or get WhatsApp assistant (reuse from chat)
async function getOrCreateWhatsAppAssistant(): Promise<string> {
  if (assistantId) return assistantId;

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

3. Handling Changes:
   - If user says no or wants changes, be helpful
   - Offer options to modify:
     * Different job selection
     * Customer name update
     * Property address change
     * Time rescheduling
     * Work order status change (SCHEDULED/STARTED/CANCELLED/COMPLETED)
   - Use updateJobDetails tool to save changes
   - Show updated job list after modifications

4. Starting Inspection:
   - Once confirmed, use startJob tool
   - Update status to STARTED automatically
   - Display available rooms/locations for inspection
   - When showing locations, automatically append "(Done)" to locations where all tasks are completed
   - Format as: "[1] Living Room (Done)" for completed locations
   - If user selects a completed location:
     * Inform them: "This location has already been completed!"
     * Suggest: "Please select another location that needs inspection"
     * Show list of pending locations
   - Guide through task completion workflow

5. Task Inspection Flow:
   - When showing tasks for a location, ALWAYS format them with brackets:
     * [1] Check walls (done) - ONLY if task.displayStatus is 'done' 
     * [2] Check ceiling (done) - if task.displayStatus is 'done'
     * [3] Check flooring - if task.displayStatus is 'pending' (DO NOT show "(pending)")
     * [4] Check electrical points
     * [5] Mark ALL tasks complete - THIS IS MANDATORY, ALWAYS INCLUDE AS FINAL OPTION
   - CRITICAL: ALWAYS show ALL tasks, even completed ones with (done) marker
   - CRITICAL: ALWAYS add "Mark ALL tasks complete" as the last numbered option
   - DO NOT show task completion count during task inspection (no "X out of Y completed")
   - The final option number should be one more than the task count (e.g., 4 tasks = [5] for complete all)
   - Simply list the tasks and explain:
     * "Type the number to mark that task as complete"
     * "You can also add notes or upload photos/videos for this location (optional)"
     * "Type [5] to mark ALL tasks complete and finish this location" (adjust number based on task count)
   - Show location status from locationStatus field:
     * "**Status:** Done" if locationStatus is 'done'
     * "**Status:** Pending" if locationStatus is 'pending'
   - If there are notes available (from locationNotes field), show them after the task list:
     * "**Note:** [notes content]" (not "Location Note")
   - IMPORTANT WORKFLOW:
     * When user selects individual task (1,2,3,4 etc): Call completeTask with that specific task ID
     * When user selects FINAL option "Mark ALL tasks complete": 
       - DO NOT call completeTask multiple times
       - MUST call completeTask with TWO parameters:
         1. taskId: 'complete_all_tasks' (REQUIRED)
         2. workOrderId: current work order ID (REQUIRED)
       - Location is automatically retrieved from thread context
       - This will mark all tasks done AND set enteredOn timestamp
     * If user provides any text comments, pass as notes parameter
     * After marking tasks, show updated list with (done) indicators
   - ALWAYS include "Mark ALL tasks complete" as the last numbered option when showing tasks

6. General Guidelines:
   - Always use numbered brackets [1], [2], [3] for selections
   - Be friendly and professional
   - Adapt your language naturally while following the flow
   - Remember context from previous messages
   - Handle errors gracefully with helpful messages

For testing, use inspector ID 'cmeps0xtz0006m35wcrtr8wx9' for Ken.`,
    model: 'gpt-4o-mini',
    tools: assistantTools
  });

  assistantId = assistant.id;
  console.log('Created WhatsApp assistant:', assistantId);
  return assistantId;
}

// Tool definitions (same as chat but adapted for WhatsApp)
const assistantTools = [
  {
    type: 'function' as const,
    function: {
      name: 'getTodayJobs',
      description: 'Get today\'s inspection jobs',
      parameters: {
        type: 'object',
        properties: {
          inspectorPhone: {
            type: 'string',
            description: 'Inspector phone number'
          }
        },
        required: ['inspectorPhone']
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
  }
];

// Tool execution (simplified version of chat tools)
async function executeTool(toolName: string, args: any): Promise<string> {
  try {
    switch (toolName) {
      case 'getTodayJobs':
        const { inspectorPhone } = args;
        const inspector = await getInspectorByPhone(inspectorPhone);
        
        if (!inspector) {
          return JSON.stringify({
            success: false,
            error: 'Inspector not found. Please contact admin.'
          });
        }

        const jobs = await getTodayJobsForInspector(inspector.id);
        
        return JSON.stringify({
          success: true,
          jobs: jobs.map((job, index) => ({
            id: job.id,
            number: index + 1,
            property: job.property_address,
            customer: job.customer_name,
            time: job.scheduled_date.toLocaleTimeString('en-SG', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            }),
            status: job.status
          })),
          count: jobs.length
        });

      case 'selectJob':
        const { jobId } = args;
        const workOrder = await getWorkOrderById(jobId);
        
        if (!workOrder) {
          return JSON.stringify({
            success: false,
            error: 'Job not found'
          });
        }

        return JSON.stringify({
          success: true,
          job: {
            id: jobId,
            property: workOrder.property_address,
            customer: workOrder.customer_name,
            status: workOrder.status
          }
        });

      case 'getJobLocations':
        const locations = await getLocationsWithCompletionStatus(args.jobId);
        return JSON.stringify({
          success: true,
          locations: locations.map(loc => ({
            name: loc.name,
            displayName: loc.displayName,
            isCompleted: loc.isCompleted,
            tasks: loc.totalTasks,
            completed: loc.completedTasks
          }))
        });

      case 'getTasksForLocation':
        const tasks = await getTasksByLocation(args.workOrderId, args.location);
        return JSON.stringify({
          success: true,
          location: args.location,
          tasks: tasks.map((task: any, index: number) => ({
            id: task.id,
            number: index + 1,
            description: task.action,
            status: task.status,
            isCompleted: task.status === 'completed'
          }))
        });

      case 'completeTask':
        if (args.taskId === 'complete_all_tasks') {
          const success = await completeAllTasksForLocation(args.workOrderId, args.location || '');
          return JSON.stringify({
            success,
            message: success ? 'All tasks completed!' : 'Failed to complete tasks'
          });
        } else {
          const success = await updateTaskStatus(args.taskId, 'completed', args.notes);
          return JSON.stringify({
            success,
            message: success ? 'Task completed!' : 'Failed to complete task'
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