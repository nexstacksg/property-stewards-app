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
import { 
  storeThread, 
  getThread, 
  getThreadMetadata, 
  updateThreadMetadata,
  cacheInspector,
  getCachedInspector,
  cacheWorkOrder,
  getCachedWorkOrder,
  type ThreadMetadata 
} from '@/lib/redis-thread-store';

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

// Global assistant ID - created ONCE and reused for ALL users
// DO NOT RESET THIS TO NULL - it causes recreating assistant every time
let assistantId: string | null = null;
let isCreatingAssistant = false;
let assistantCreationPromise: Promise<string> | null = null;

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
    // Normalize phone number to consistent format (remove + and spaces)
    const rawPhone = data.fromNumber || data.from;
    const phoneNumber = rawPhone?.replace(/[\s+-]/g, '').replace(/^0+/, '').replace('@c.us', '') || '';
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
      // First check Redis for thread
      let threadId :any= await getThread(phoneNumber);
      
      // Fallback to memory cache if not in Redis
      if (!threadId) {
        threadId = whatsappThreads.get(phoneNumber);
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
      
      // Pass normalized phone number to media handler
      const mediaResponse = await handleMediaMessage(data, phoneNumber);
      if (mediaResponse) {
        // Send response via Wassenger
        await sendWhatsAppResponse(phoneNumber, mediaResponse);
        
        // Also notify the assistant about the media upload
        // Check both Redis and memory for thread
        let threadIdForNotify : any = await getThread(phoneNumber);
        if (!threadIdForNotify) {
          threadIdForNotify = whatsappThreads.get(phoneNumber);
        }
        
        if (threadIdForNotify && mediaResponse.includes('successfully')) {
          // Add a message to the thread for context
          await openai.beta.threads.messages.create(threadIdForNotify, {
            role: 'assistant',
            content: mediaResponse
          });
        }
        
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

    // Process with OpenAI Assistant - wait for actual response without timeout message
    try {
      // Pre-warm cache by fetching inspector data in background
      getCachedInspector(phoneNumber).catch(() => {});
      
      // Start the assistant processing with normalized phone number
      const assistantResponse = await processWithAssistant(phoneNumber, message || 'User uploaded media');
      
      if (assistantResponse && assistantResponse.trim()) {
        // Send the response
        await sendWhatsAppResponse(phoneNumber, assistantResponse);
        
        // Mark as responded
        const msgData = processedMessages.get(messageId);
        if (msgData) {
          msgData.responded = true;
          processedMessages.set(messageId, msgData);
        }
        
        console.log(`✅ Response sent to ${phoneNumber} in ${Date.now() - startTime}ms`);
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
    // Phone number is already normalized from the caller
    const cleanPhone = phoneNumber;
    
    // First check Redis for existing thread
    let threadId :any = await getThread(cleanPhone);
    let metadata = await getThreadMetadata(cleanPhone);
    
    if (threadId) {
      console.log(`📌 Using Redis-cached thread ${threadId} for ${cleanPhone}`);
      // Also cache in memory for this request
      whatsappThreads.set(cleanPhone, threadId);
    } else {
      // Check memory cache as fallback
      threadId = whatsappThreads.get(cleanPhone);
      if (threadId) {
        console.log(`📌 Using memory-cached thread ${threadId} for ${cleanPhone}`);
      }
    }
    
    if (!threadId) {
      console.log(`🆕 No existing thread found, creating new one for ${cleanPhone}...`);
      // Check cache first for inspector
      let inspector = await getCachedInspector(cleanPhone);
      
      if (!inspector) {
        // Try to find inspector by phone (with and without +)
        inspector = await getInspectorByPhone('+' + cleanPhone) as any;
        if (!inspector) {
          inspector = await getInspectorByPhone(cleanPhone) as any;
        }
        // Cache inspector data if found
        if (inspector) {
          await cacheInspector(cleanPhone, inspector);
        }
      }
      
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
      
      // Store in Redis for persistence
      await storeThread(cleanPhone, threadId, {
        phoneNumber: cleanPhone,
        channel: 'whatsapp',
        inspectorId: inspector?.id || '',
        inspectorName: inspector?.name || '',
        workOrderId: '',
        currentLocation: '',
        createdAt: new Date().toISOString()
      });
      
      // Also cache in memory
      whatsappThreads.set(cleanPhone, threadId);
      console.log(`✅ Created new thread ${threadId} for ${cleanPhone} and stored in Redis`);
    }

    // Add message to thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });

    // Get or create assistant - SINGLETON PATTERN with proper promise handling
    if (!assistantId) {
      if (!assistantCreationPromise) {
        console.log('🔧 Creating assistant for first time...');
        assistantCreationPromise = createAssistant();
      } else {
        console.log('⏳ Waiting for assistant creation from another request...');
      }
      
      try {
        assistantId = await assistantCreationPromise;
        console.log('✅ Assistant ready:', assistantId);
      } catch (error) {
        console.error('❌ Failed to get assistant:', error);
        assistantCreationPromise = null; // Reset to allow retry
        return 'Service initialization failed. Please try again.';
      }
    }
    
    console.log('📌 Using cached assistant:', assistantId);

    // Run assistant with optimizations
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      model: 'gpt-4o-mini', // Force fastest model
      temperature: 0.3, // Lower temperature = faster, more deterministic
      max_prompt_tokens: 2000, // Limit context size for speed
      max_completion_tokens: 500, // Limit response size
    });

    // Wait for completion and handle multiple rounds of tool calls
    let runStatus = await waitForRunCompletion(threadId, run.id);
    let toolCallRounds = 0;
    const maxToolCallRounds = 5; // Prevent infinite loops

    // Handle tool calls in a loop until run completes
    while (runStatus.status === 'requires_action' && toolCallRounds < maxToolCallRounds) {
      console.log(`🔧 Run requires action (round ${toolCallRounds + 1}), handling tool calls...`);
      await handleToolCalls(threadId, run.id, runStatus, cleanPhone);
      console.log('⏳ Waiting for run completion after tool execution...');
      runStatus = await waitForRunCompletion(threadId, run.id);
      console.log('📋 Run status after tool execution:', runStatus.status);
      toolCallRounds++;
    }

    // Check if we hit the max rounds limit
    if (toolCallRounds >= maxToolCallRounds) {
      console.error('❌ Too many tool call rounds, aborting');
      return 'Sorry, the request is taking too long to process. Please try again.';
    }

    // Check if run completed successfully
    if (runStatus.status !== 'completed') {
      console.error('❌ Run did not complete successfully. Status:', runStatus.status);
      if (runStatus.status === 'failed') {
        console.error('❌ Run failed with error:', runStatus.last_error);
      }
      return 'Sorry, I encountered an issue processing your request. Please try again.';
    }

    // Get assistant's response - optimized to only fetch latest
    console.log('📨 Getting assistant response from thread:', threadId);
    const messages = await openai.beta.threads.messages.list(threadId, {
      limit: 1, // Only fetch the latest message for speed
      order: 'desc'
    });
    const lastMessage = messages.data[0];
    
    if (lastMessage && lastMessage.role === 'assistant') {
      const content = lastMessage.content[0];
      if (content.type === 'text') {
        console.log('✅ Assistant response ready');
        return content.text.value;
      }
    }

    console.error('❌ No assistant response found in messages');
    return 'I processed your information but couldn\'t generate a response. Please try again.';
    
  } catch (error) {
    console.error('Error processing with assistant:', error);
    return 'Sorry, I encountered an error processing your request. Please try again.';
  }
}

// Wait for run completion - aggressive polling for faster response
async function waitForRunCompletion(threadId: string, runId: string) {
  let attempts = 0;
  const maxAttempts = 2400; // 120 seconds max to handle complex operations
  
  let runStatus = await openai.beta.threads.runs.retrieve(runId, {
    thread_id: threadId
  });
  
  // If already completed, return immediately
  if (runStatus.status === 'completed' || runStatus.status === 'failed' || runStatus.status === 'cancelled') {
    return runStatus;
  }
  
  while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
    // Ultra-fast polling for first 2 seconds, then adaptive
    const delay = attempts < 40 ? 25 : attempts < 100 ? 50 : attempts < 200 ? 100 : 200;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    runStatus = await openai.beta.threads.runs.retrieve(runId, {
      thread_id: threadId
    });
    attempts++;
    
    // Early exit on completion
    if (runStatus.status === 'completed' || runStatus.status === 'failed' || runStatus.status === 'cancelled' || runStatus.status === 'requires_action') {
      console.log(`✅ Run status resolved after ${attempts} attempts (${Math.floor(attempts * delay / 1000)}s)`);
      return runStatus;
    }
    
    // Log progress every 5 seconds
    if (attempts % 100 === 0) {
      console.log(`⏳ Still waiting for run completion... (${Math.floor(attempts * delay / 1000)}s elapsed)`);
    }
  }
  
  if (attempts >= maxAttempts) {
    console.log(`⚠️ Run completion timed out after ${maxAttempts * 50 / 1000} seconds`);
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
    
    console.log(`🔧 Tool call requested: ${functionName}`, functionArgs);
    
    // Add phone number for relevant tools
    if (functionName === 'getTodayJobs' && !functionArgs.inspectorPhone) {
      functionArgs.inspectorPhone = phoneNumber;
    }
    
    if (functionName === 'collectInspectorInfo' && !functionArgs.phone) {
      functionArgs.phone = phoneNumber;
    }
    
    const output = await executeTool(functionName, functionArgs, threadId);
    
    console.log(`✅ Tool ${functionName} executed successfully`);
    console.log(`📊 Tool output length: ${output.length} characters`);
    
    toolOutputs.push({
      tool_call_id: toolCall.id,
      output: output
    });
  }

  console.log(`📤 Submitting ${toolOutputs.length} tool outputs to OpenAI`);
  await openai.beta.threads.runs.submitToolOutputs(runId, {
    thread_id: threadId,
    tool_outputs: toolOutputs
  });
  console.log('✅ Tool outputs submitted successfully');
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

// Create assistant - ONLY CALLED ONCE PER SERVER INSTANCE
async function createAssistant() {
  console.log('🚀 ONE-TIME ASSISTANT CREATION STARTING...');
  
  try {
    const assistant = await openai.beta.assistants.create({
    name: 'Property Inspector Assistant v1.0',
    instructions: `You are a Property Inspector Assistant. Be concise and direct.

CRITICAL JOB SELECTION:
- When showing jobs, each has a number: [1], [2], [3] and an ID (e.g., "cmeps0xtz0006m35wcrtr8wx9")
- When user types just a number like "1", you MUST:
  1. Look up which job was shown as [1] in the getTodayJobs result
  2. Get that job's ID from the response
  3. Call confirmJobSelection with the actual job ID (NOT the number "1")

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
   - CRITICAL: Remember the mapping between job numbers and job IDs for selection

2. Job Selection and Confirmation:
   - When user selects a job by typing just a number (e.g., "1", "2", "3"):
     * Map the number to the corresponding job from getTodayJobs result
     * Use the job's ID (NOT the number) with confirmJobSelection tool 
     * Example: If user types "1", use the ID from jobs[0].id
   - Display the destination details clearly  
   - Ask for confirmation with options: [1] Yes [2] No
   - Be conversational: "Please confirm the destination" or similar
   - IMPORTANT: There is NO selectJob tool - use confirmJobSelection directly with the job ID

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
    model: 'gpt-4o-mini', // Fastest model
    temperature: 0.3, // Lower = faster and more consistent
    tools: assistantTools
  });

    console.log('✅ ASSISTANT CREATED SUCCESSFULLY:', assistant.id);
    // CRITICAL: Return the ID to be cached
    return assistant.id;
  } catch (error) {
    console.error('❌ ASSISTANT CREATION FAILED:', error);
    throw error;
  }
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
      name: 'confirmJobSelection',
      description: 'Confirm job selection and show job details',
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
            selectionNumber: `[${index + 1}]`,
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
          count: jobs.length,
          instructions: "User can select a job by typing its number (1, 2, 3, etc.)"
        });

      case 'confirmJobSelection':
        // Check cache first
        let workOrder = await getCachedWorkOrder(args.jobId);
        if (!workOrder) {
          workOrder = await getWorkOrderById(args.jobId) as any;
          // Cache for future use
          if (workOrder) {
            await cacheWorkOrder(args.jobId, workOrder);
          }
        }
        
        if (!workOrder) {
          return JSON.stringify({
            success: false,
            error: 'Job not found'
          });
        }
        
        // Update thread metadata in both OpenAI and Redis
        if (threadId) {
          const postalCodeMatch = workOrder.property_address.match(/\b(\d{6})\b/);
          const updatedMetadata = {
            ...metadata,
            workOrderId: args.jobId,
            customerName: workOrder.customer_name,
            propertyAddress: workOrder.property_address,
            postalCode: postalCodeMatch ? postalCodeMatch[1] : 'unknown',
            jobStatus: 'confirming'
          };
          
          // Update OpenAI thread metadata
          await openai.beta.threads.update(threadId, {
            metadata: updatedMetadata
          });
          
          // Get phone number from metadata and update Redis
          const phoneNumber = metadata.phoneNumber;
          if (phoneNumber) {
            await updateThreadMetadata(phoneNumber, updatedMetadata);
          }
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
          const updatedMetadata = {
            ...metadata,
            jobStatus: 'started',
            jobStartedAt: new Date().toISOString()
          };
          
          // Update OpenAI thread metadata
          await openai.beta.threads.update(threadId, {
            metadata: updatedMetadata
          });
          
          // Update Redis metadata
          const phoneNumber = metadata.phoneNumber;
          if (phoneNumber) {
            await updateThreadMetadata(phoneNumber, updatedMetadata);
          }
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
        // Update current location in thread and Redis
        if (threadId) {
          const updatedMetadata = {
            ...metadata,
            currentLocation: args.location,
            lastLocationAccessedAt: new Date().toISOString()
          };
          
          // Update OpenAI thread metadata
          await openai.beta.threads.update(threadId, {
            metadata: updatedMetadata
          });
          
          // Update Redis metadata
          const phoneNumber = metadata.phoneNumber;
          if (phoneNumber) {
            await updateThreadMetadata(phoneNumber, updatedMetadata);
          }
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
        
        // Cache inspector data for faster future lookups
        const phoneForCache = normalizedPhone.replace(/[^0-9]/g, '');
        await cacheInspector(phoneForCache, inspector);
        
        // Store inspector details in thread metadata and Redis
        if (threadId) {
          const inspectorMetadata = {
            channel: 'whatsapp',
            phoneNumber: normalizedPhone,
            inspectorId: inspector.id,
            inspectorName: inspector.name,
            inspectorPhone: inspector.mobilePhone || normalizedPhone,
            identifiedAt: new Date().toISOString()
          };
          
          // Update OpenAI thread metadata
          await openai.beta.threads.update(threadId, {
            metadata: inspectorMetadata
          });
          
          // Update Redis metadata
          const phoneNumberForRedis = metadata.phoneNumber || normalizedPhone.replace(/[^\d]/g, '');
          if (phoneNumberForRedis) {
            await updateThreadMetadata(phoneNumberForRedis, inspectorMetadata);
          }
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
    console.log('🔄 Processing WhatsApp media message for phone:', phoneNumber);
    
    // Phone number is already normalized from the caller
    // First check Redis for thread
    let threadId:any = await getThread(phoneNumber);
    
    // Fallback to memory cache if not in Redis
    if (!threadId) {
      threadId = whatsappThreads.get(phoneNumber);
    }
    
    if (!threadId) {
      console.log('❌ No thread found for media upload for phone:', phoneNumber);
      return 'Please start a conversation first before uploading media.';
    }
    
    // Get thread metadata from Redis for better persistence
    let metadata: any = await getThreadMetadata(phoneNumber);
    
    // Fallback to OpenAI thread metadata if Redis is empty
    if (!metadata || Object.keys(metadata).length === 0) {
      const thread = await openai.beta.threads.retrieve(threadId);
      metadata = thread.metadata || {};
    }
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
      console.log('❌ No location selected for media upload');
      return '📍 Please select a location first before uploading photos.\n\nExample: Select "Living Room" from the locations list, then upload your photos.';
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
    if (workOrderId && currentLocation) {
      const normalizedRoomName = roomName.replace(/-/g, ' ');
      console.log('💾 Saving media to database for location:', normalizedRoomName);
      console.log('📍 Work Order ID:', workOrderId);
      
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
        console.log('✅ Found contract checklist with', workOrder.contract.contractChecklist.items.length, 'items');
        
        // Find ContractChecklistItem for this location
        const matchingItem = workOrder.contract.contractChecklist.items.find(
          (item: any) => item.name.toLowerCase() === normalizedRoomName.toLowerCase()
        );
        
        if (matchingItem) {
          console.log('✅ Found matching checklist item:', matchingItem.id, 'for location:', matchingItem.name);
          
          // Update ContractChecklistItem with new media
          const currentPhotos = matchingItem.photos || [];
          const currentVideos = matchingItem.videos || [];
          
          console.log('📷 Current photos count:', currentPhotos.length);
          console.log('🎥 Current videos count:', currentVideos.length);
          
          if (mediaType === 'photo') {
            const updatedPhotos = [...currentPhotos, publicUrl];
            await prisma.contractChecklistItem.update({
              where: { id: matchingItem.id },
              data: {
                photos: updatedPhotos
              }
            });
            console.log('✅ Photo saved to database. Total photos now:', updatedPhotos.length);
            console.log('📸 Photo URL added:', publicUrl);
          } else {
            const updatedVideos = [...currentVideos, publicUrl];
            await prisma.contractChecklistItem.update({
              where: { id: matchingItem.id },
              data: {
                videos: updatedVideos
              }
            });
            console.log('✅ Video saved to database. Total videos now:', updatedVideos.length);
            console.log('🎬 Video URL added:', publicUrl);
          }
        } else {
          console.log('❌ No matching ContractChecklistItem found for location:', normalizedRoomName);
          console.log('📋 Available locations:', workOrder.contract.contractChecklist.items.map((item: any) => item.name));
        }
      } else {
        console.log('❌ No contract checklist found for work order');
      }
    } else {
      console.log('⚠️ Skipping database save - missing workOrderId or currentLocation');
    }
    
    // Return success message
    const locationName = currentLocation === 'general' ? 'your current job' : currentLocation;
    return `✅ ${mediaType === 'photo' ? 'Photo' : 'Video'} uploaded successfully for ${locationName}!\n\nYou can continue with your inspection or upload more media.`;
    
  } catch (error) {
    console.error('❌ Error handling WhatsApp media:', error);
    return 'Failed to upload media. Please try again.';
  }
}