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

// Response cache for common queries (5 minute TTL)
const responseCache = new Map<string, { response: string; timestamp: number }>();
const RESPONSE_CACHE_TTL = 300000; // 5 minutes

// Inspector cache for faster lookups
const inspectorCache = new Map<string, any>();

// Reuse assistant ID - reset to force recreation with media tools
let assistantId: string | null = null;

// Clean up caches periodically
setInterval(() => {
  const now = Date.now();
  
  // Clean processed messages
  for (const [msgId, data] of processedMessages.entries()) {
    if (now - data.timestamp > 300000) { // 5 minutes
      processedMessages.delete(msgId);
    }
  }
  
  // Clean response cache
  for (const [key, data] of responseCache.entries()) {
    if (now - data.timestamp > RESPONSE_CACHE_TTL) {
      responseCache.delete(key);
    }
  }
  
  // Clear inspector cache periodically (10 minutes)
  if (now % 600000 < 30000) {
    inspectorCache.clear();
  }
}, 30000); // Check every 30 seconds

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
    
    // Process both text and media messages
    if (event !== 'message:in:new') {
      console.log(`⏭️ Ignoring event: ${event} - only processing message:in:new`);
      return NextResponse.json({ success: true });
    }

    const { data } = body;
    
    // Skip outgoing messages (safety check)
    if (data.fromMe || data.self === 1 || data.flow === 'outbound') {
      console.log('⏭️ Skipping outgoing message');
      return NextResponse.json({ success: true });
    }
    
    const messageId = data.id || `${Date.now()}-${Math.random()}`;
    const rawPhoneNumber = data.fromNumber || data.from;
    // Normalize phone number - remove all spaces, dashes, and + signs for consistent lookup
    const phoneNumber = rawPhoneNumber ? rawPhoneNumber.replace(/[\s+\-]/g, '') : '';
    const message = data.body || data.message?.text?.body || '';
    
    console.log('📱 Phone number normalization:', {
      raw: rawPhoneNumber,
      normalized: phoneNumber
    });
    
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
      console.log('📱 Looking up thread for normalized phone:', phoneNumber);
      console.log('📋 Available threads:', Array.from(whatsappThreads.keys()));
      
      // Use existing thread if available, don't create new one to preserve context
      // Try multiple phone formats for backward compatibility
      let threadId = whatsappThreads.get(phoneNumber);
      
      // If not found, try with + prefix
      if (!threadId && !phoneNumber.startsWith('+')) {
        const withPlus = '+' + phoneNumber;
        threadId = whatsappThreads.get(withPlus);
        if (threadId) {
          console.log('✅ Found thread with + prefix:', withPlus);
        }
      }
      
      // If still not found, try without country code (last 8 digits for SG numbers)
      if (!threadId && phoneNumber.length > 8) {
        const lastEight = phoneNumber.slice(-8);
        for (const [key, value] of whatsappThreads.entries()) {
          if (key.endsWith(lastEight)) {
            threadId = value;
            console.log('✅ Found thread by matching last 8 digits:', key);
            break;
          }
        }
      }
      
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
    
    // Check response cache for common queries
    const cacheKey = `${phoneNumber}:${message.toLowerCase().trim()}`;
    const cached = responseCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < RESPONSE_CACHE_TTL)) {
      console.log('⚡ Cache hit - returning cached response instantly');
      await sendWhatsAppResponse(phoneNumber, cached.response);
      
      const msgData = processedMessages.get(messageId);
      if (msgData) {
        msgData.responded = true;
        processedMessages.set(messageId, msgData);
      }
      
      console.log(`✅ Cached response sent in ${Date.now() - startTime}ms`);
      return NextResponse.json({ success: true });
    }

    // Process with OpenAI Assistant with FAST timeout and immediate response
    const TIMEOUT_MS = 5000; // 5 seconds timeout for ultra-fast fallback
    
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
        
        // Send immediate processing message
        await sendWhatsAppResponse(phoneNumber, 
          '⏳ Processing...'
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
        // Cache the response for future use
        responseCache.set(cacheKey, {
          response: result,
          timestamp: Date.now()
        });
        
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

// Process message with OpenAI Assistant - OPTIMIZED
async function processWithAssistant(phoneNumber: string, message: string): Promise<string> {
  try {
    // Phone number is already normalized from the main handler
    const cleanPhone = phoneNumber;
    
    // Get or create thread
    let threadId = whatsappThreads.get(cleanPhone);
    
    if (!threadId) {
      // Quick inspector lookup with no await blocking
      const inspectorPromise = getInspectorByPhone(cleanPhone);
      const inspector = await inspectorPromise as any;
      
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

// Wait for run completion - ULTRA FAST polling
async function waitForRunCompletion(threadId: string, runId: string) {
  let attempts = 0;
  const maxAttempts = 100; // 5 seconds max (50ms intervals)
  
  let runStatus = await openai.beta.threads.runs.retrieve(runId, {
    thread_id: threadId
  });
  
  while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 50)); // Ultra fast 50ms polling
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
   - CRITICAL: ALWAYS format locations with numbered brackets [1], [2], [3] etc.
   - When showing locations, automatically append "(Done)" to locations where all tasks are completed
   - Format as: "[1] Living Room (Done)" for completed locations
   - Example format:
     "Here are the locations available for inspection:
     
     [1] Living Room
     [2] Master Bedroom  
     [3] Bedroom 2
     [4] Bedroom 3 (Done)
     [5] Kitchen
     
     Please select a location to continue the inspection."
   - If user selects a completed location:
     * Inform them: "This location has already been completed!"
     * Suggest: "Please select another location that needs inspection"
     * Show list of pending locations
   - Guide through task completion workflow

4. Task Inspection Flow:
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
- Be conversational and helpful throughout the identification process

MEDIA DISPLAY FORMATTING:
- When showing photos from getLocationMedia or getTaskMedia tools, provide clear photo information
- For WhatsApp, photos cannot be displayed inline, so provide descriptive information about photos
- Format photo responses clearly:
  "📸 Found 2 photos for Bedroom 3:
  
  Photo 1: https://property-stewards.sgp1.digitaloceanspaces.com/data/hang-822121/bedroom-3/photos/ed888645-7270-452c-9d01-fde5656d3e37.jpeg
  Photo 2: [URL if more photos exist]
  
  📝 Remarks: All tasks completed for Bedroom 3."
- Always include photo count and location name in the response
- If no photos available, clearly state "No photos found for [location name]"
- Provide clickable URLs for photos so inspectors can view them directly`,
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
          // Check cache first for ultra-fast lookup
          let inspector = inspectorCache.get(inspectorPhone);
          if (!inspector) {
            inspector = await getInspectorByPhone(inspectorPhone) as any;
            if (inspector) {
              inspectorCache.set(inspectorPhone, inspector);
            }
          }
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
          console.log('📢 Updating thread metadata with location:', args.location);
          await openai.beta.threads.update(threadId, {
            metadata: {
              ...metadata,
              currentLocation: args.location,
              lastLocationAccessedAt: new Date().toISOString()
            }
          });
          console.log('✅ Thread metadata updated - Current location:', args.location);
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
        
        // Try to find inspector by normalized phone first - with caching
        let inspector = inspectorCache.get(normalizedPhone);
        if (!inspector) {
          inspector = await getInspectorByPhone(normalizedPhone) as any;
          if (inspector) {
            inspectorCache.set(normalizedPhone, inspector);
          }
        }
        
        // Also try original phone format - with caching
        if (!inspector) {
          inspector = inspectorCache.get(phone);
          if (!inspector) {
            inspector = await getInspectorByPhone(phone) as any;
            if (inspector) {
              inspectorCache.set(phone, inspector);
            }
          }
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
    console.log('🔄 Processing WhatsApp media message from:', phoneNumber);
    
    // Phone number is already normalized from the main handler
    const cleanPhone = phoneNumber;
    
    // Get thread for this phone number
    let threadId = whatsappThreads.get(cleanPhone);
    console.log('🔍 Looking for thread with normalized phone:', cleanPhone);
    console.log('📋 Current thread map:', Array.from(whatsappThreads.keys()));
    console.log('🧵 Found thread ID:', threadId);
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
    
    console.log('📢 Current location from metadata:', currentLocation);
    console.log('🏠 Using room name for upload:', roomName);
    
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
      // Normalize room name - handle both hyphenated and space-separated formats
      const normalizedRoomName = roomName.replace(/-/g, ' ').trim();
      console.log('🏠 Attempting to save media to location:', normalizedRoomName);
      console.log('🔑 Work Order ID:', workOrderId);
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
        // Find ContractChecklistItem for this location (case-insensitive, trim spaces)
        const matchingItem = workOrder.contract.contractChecklist.items.find(
          (item: any) => item.name.toLowerCase().trim() === normalizedRoomName.toLowerCase().trim()
        );
        
        if (matchingItem) {
          // Update ContractChecklistItem with new media
          const currentPhotos = matchingItem.photos || [];
          const currentVideos = matchingItem.videos || [];
          
          if (mediaType === 'photo') {
            const updatedPhotos = [...currentPhotos, publicUrl];
            await prisma.contractChecklistItem.update({
              where: { id: matchingItem.id },
              data: {
                photos: updatedPhotos
              }
            });
            console.log('💾 Saved photo to database for location:', matchingItem.name);
            console.log('📷 Total photos for this location:', updatedPhotos.length);
          } else {
            const updatedVideos = [...currentVideos, publicUrl];
            await prisma.contractChecklistItem.update({
              where: { id: matchingItem.id },
              data: {
                videos: updatedVideos
              }
            });
            console.log('💾 Saved video to database for location:', matchingItem.name);
            console.log('🎥 Total videos for this location:', updatedVideos.length);
          }
        } else {
          console.log('⚠️ No matching ContractChecklistItem found for location:', normalizedRoomName);
          console.log('⚠️ Available locations:', workOrder.contract.contractChecklist.items.map((item: any) => item.name));
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