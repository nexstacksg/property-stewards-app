import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { 
  getTodayJobsForInspector, 
  getWorkOrderById, 
  updateWorkOrderStatus,
  getTasksByLocation,
  getDistinctLocationsForWorkOrder,
  updateTaskStatus,
  addTaskPhoto,
  getWorkOrderProgress,
  getInspectorByPhone,
  updateWorkOrderDetails
} from '@/lib/services/inspectorService';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Store for thread management (in production, use Redis or database)
const threadStore = new Map<string, string>();

// Create assistant once and reuse - reset to null to force recreation with new formatting
let assistantId: string | null = null; // Reset to force recreation with job confirmation flow

async function getOrCreateAssistant() {
  if (assistantId) {
    return assistantId;
  }

  const assistant = await openai.beta.assistants.create({
    name: 'Property Inspector Assistant v0.2',
    instructions: `You are a helpful Property Stewards inspection assistant v0.2. You help property inspectors manage their daily inspection tasks via chat.

Key capabilities:
- Show today's inspection jobs for an inspector
- Help select and start specific inspection jobs
- Allow job detail modifications before starting
- Guide through room-by-room inspection workflow
- Track task completion and progress

CONVERSATION FLOW GUIDELINES:

1. Showing Today's Jobs:
   - Greet the inspector by name (e.g., "Hi Ken")
   - Format each job clearly with emojis: 🏠 property, ⏰ time, ⭐ priority, 👤 customer
   - Include address, postal code, customer name, status, and any notes
   - Use separator lines (---) between jobs for clarity
   - End with numbered selection options like [1], [2] for each property

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
   - Guide through task completion workflow

5. General Guidelines:
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
  console.log('Created assistant:', assistantId);
  return assistantId;
}

// Define tools for OpenAI Assistant API
const assistantTools = [
  {
    type: 'function' as const,
    function: {
      name: 'getTodayJobs',
      description: 'Get the list of inspection jobs assigned for today',
      parameters: {
        type: 'object',
        properties: {
          inspectorId: {
            type: 'string',
            description: 'Inspector ID - required to fetch jobs'
          },
          inspectorPhone: {
            type: 'string',
            description: 'Inspector phone to lookup ID if not provided'
          }
        },
        required: ['inspectorId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'selectJob',
      description: 'Select a specific job to start inspection',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The work order ID to select'
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
      description: 'Get rooms/areas for the current inspection job',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The work order ID'
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
      description: 'Get specific tasks for a location/room',
      parameters: {
        type: 'object',
        properties: {
          workOrderId: {
            type: 'string',
            description: 'The work order ID'
          },
          location: {
            type: 'string',
            description: 'The location/room name'
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
      description: 'Mark a specific inspection task as complete',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The task ID to complete'
          },
          notes: {
            type: 'string',
            description: 'Any additional notes about the task'
          },
          workOrderId: {
            type: 'string',
            description: 'Work order ID to get next tasks'
          }
        },
        required: ['taskId', 'workOrderId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'confirmJobSelection',
      description: 'Get job details for confirmation before starting',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The work order ID to confirm'
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
      description: 'Start the confirmed job and update status to STARTED',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The work order ID to start'
          }
        },
        required: ['jobId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'updateJobDetails',
      description: 'Update job details like customer, address, time, or status',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The work order ID to update'
          },
          updateType: {
            type: 'string',
            description: 'Type of update: customer, address, time, status',
            enum: ['customer', 'address', 'time', 'status']
          },
          newValue: {
            type: 'string',
            description: 'The new value to set'
          }
        },
        required: ['jobId', 'updateType', 'newValue']
      }
    }
  }
];

// Tool execution functions
async function executeTool(toolName: string, args: any) {
  switch (toolName) {
    case 'getTodayJobs':
      try {
        const { inspectorId, inspectorPhone } = args;
        let finalInspectorId = inspectorId;
        
        if (!finalInspectorId && inspectorPhone) {
          const inspector = await getInspectorByPhone(inspectorPhone);
          if (!inspector) {
            return JSON.stringify({
              success: false,
              error: 'Inspector not found. Please contact admin for registration.',
            });
          }
          finalInspectorId = inspector.id;
        }

        const jobs = await getTodayJobsForInspector(finalInspectorId);
        
        return JSON.stringify({
          success: true,
          jobs: jobs.map(job => ({
            id: job.id,
            property: job.property_address,
            customer: job.customer_name,
            time: job.scheduled_date.toLocaleTimeString('en-SG', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: true 
            }),
            type: job.inspection_type,
            status: job.status,
            priority: job.priority,
            notes: job.notes
          })),
          count: jobs.length
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to fetch today\'s jobs. Please try again.',
        });
      }

    case 'selectJob':
      try {
        const { jobId } = args;
        const workOrder = await getWorkOrderById(jobId);
        if (!workOrder) {
          return JSON.stringify({
            success: false,
            error: 'Job not found. Please check the job ID.',
          });
        }

        // Don't start immediately, just return job details for confirmation
        return JSON.stringify({
          success: true,
          message: `Job ${jobId} selected. Please use confirmJobSelection to confirm.`,
          jobDetails: {
            id: jobId,
            property: workOrder.property_address,
            customer: workOrder.customer_name,
            type: workOrder.inspection_type,
            status: workOrder.status
          }
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to select job. Please try again.',
        });
      }

    case 'getJobLocations':
      try {
        const { jobId } = args;
        const locations = await getDistinctLocationsForWorkOrder(jobId);
        
        const locationDetails = await Promise.all(
          locations.map(async (location) => {
            const tasks = await getTasksByLocation(jobId, location);
            const completedTasks = tasks.filter(t => t.status === 'completed').length;
            const totalTasks = tasks.length;
            
            let locationStatus = 'pending';
            if (completedTasks === totalTasks && totalTasks > 0) {
              locationStatus = 'completed';
            } else if (completedTasks > 0) {
              locationStatus = 'in_progress';
            }

            return {
              name: location,
              status: locationStatus,
              tasks: totalTasks,
              completed: completedTasks,
              pending: totalTasks - completedTasks
            };
          })
        );

        return JSON.stringify({
          success: true,
          locations: locationDetails
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to fetch job locations. Please try again.',
        });
      }

    case 'getTasksForLocation':
      try {
        const { workOrderId, location } = args;
        const tasks = await getTasksByLocation(workOrderId, location);
        
        return JSON.stringify({
          success: true,
          location: location,
          tasks: tasks.map((task, index) => ({
            id: task.id, // Use the actual checklist item ID
            number: index + 1,
            description: task.action || `Check ${location.toLowerCase()} condition`,
            status: task.status,
            notes: task.notes
          }))
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to fetch tasks for this location.',
        });
      }

    case 'completeTask':
      try {
        const { taskId, notes, workOrderId } = args;
        const success = await updateTaskStatus(taskId, 'completed', notes);
        
        if (!success) {
          return JSON.stringify({
            success: false,
            error: 'Failed to complete task. Task may not exist.',
          });
        }

        const progress = await getWorkOrderProgress(workOrderId);
        
        return JSON.stringify({
          success: true,
          message: `Task ${taskId} marked as complete`,
          notes: notes || 'No additional notes',
          progress: {
            total: progress.total_tasks,
            completed: progress.completed_tasks,
            remaining: progress.pending_tasks + progress.in_progress_tasks
          },
          nextAction: progress.pending_tasks > 0 
            ? 'Continue with remaining tasks' 
            : 'All tasks completed! Ready to finalize inspection.'
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to complete task. Please try again.',
        });
      }

    case 'confirmJobSelection':
      try {
        const { jobId } = args;
        const workOrder = await getWorkOrderById(jobId);
        
        if (!workOrder) {
          return JSON.stringify({
            success: false,
            error: 'Job not found. Please check the job ID.',
          });
        }
        
        return JSON.stringify({
          success: true,
          message: 'Please confirm the destination',
          jobDetails: {
            id: jobId,
            property: workOrder.property_address,
            customer: workOrder.customer_name,
            time: workOrder.scheduled_start.toLocaleTimeString('en-SG', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            }),
            status: workOrder.status,
            type: workOrder.inspection_type
          }
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to get job details.',
        });
      }

    case 'startJob':
      try {
        const { jobId } = args;
        
        // Update status to STARTED
        await updateWorkOrderStatus(jobId, 'in_progress');
        
        // Get locations for the job
        const locations = await getDistinctLocationsForWorkOrder(jobId);
        const progress = await getWorkOrderProgress(jobId);
        
        return JSON.stringify({
          success: true,
          message: 'Job started successfully! Ready for inspection.',
          locations: locations,
          progress: {
            total: progress.total_tasks,
            completed: progress.completed_tasks,
            pending: progress.pending_tasks
          }
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to start job.',
        });
      }

    case 'updateJobDetails':
      try {
        const { jobId, updateType, newValue } = args;
        
        const success = await updateWorkOrderDetails(jobId, updateType, newValue);
        
        if (!success) {
          return JSON.stringify({
            success: false,
            error: `Failed to update ${updateType}.`,
          });
        }
        
        // Get updated job details
        const updatedJob = await getWorkOrderById(jobId);
        
        return JSON.stringify({
          success: true,
          message: `Successfully updated ${updateType} to: ${newValue}`,
          updatedJob: updatedJob ? {
            id: jobId,
            property: updatedJob.property_address,
            customer: updatedJob.customer_name,
            time: updatedJob.scheduled_start.toLocaleTimeString('en-SG', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            }),
            status: updatedJob.status
          } : null
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to update job details.',
        });
      }

    default:
      return JSON.stringify({
        success: false,
        error: `Unknown tool: ${toolName}`
      });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, history, sessionId = 'default' } = await request.json();

    // Get or create thread for this session
    let threadId = threadStore.get(sessionId);
    
    if (!threadId) {
      console.log('Creating new thread for session:', sessionId);
      const thread = await openai.beta.threads.create();
      threadId = thread.id;
      threadStore.set(sessionId, threadId);
      console.log('Created thread:', threadId);
    } else {
      console.log('Using existing thread:', threadId);
    }

    // Verify threadId is valid
    if (!threadId) {
      throw new Error('Failed to create or retrieve thread ID');
    }

    // Add user message to thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: message
    });

    // Get or create assistant
    const currentAssistantId = await getOrCreateAssistant();

    // Run the assistant
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: currentAssistantId
    });

    const finalThreadId = threadId; // Store in const to avoid any scope issues
    const runId = run.id;

    console.log('Created run:', runId, 'for thread:', finalThreadId);

    // Wait for completion and handle tool calls
    console.log('About to retrieve run status for thread:', finalThreadId, 'run:', runId);
    let runStatus = await openai.beta.threads.runs.retrieve(runId, {
      thread_id: finalThreadId
    });
    console.log('Initial run status:', runStatus.status);
    
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait
    
    while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('About to retrieve run status in loop for thread:', finalThreadId, 'run:', runId);
      runStatus = await openai.beta.threads.runs.retrieve(runId, {
        thread_id: finalThreadId
      });
      attempts++;
      console.log('Run status:', runStatus.status, 'attempt:', attempts);
    }
    
    if (attempts >= maxAttempts) {
      throw new Error('Run timed out after 30 seconds');
    }

    if (runStatus.status === 'requires_action') {
      const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || [];
      const toolOutputs = [];
      
      console.log('Processing', toolCalls.length, 'tool calls');

      for (const toolCall of toolCalls) {
        try {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
          console.log('Executing tool:', functionName, 'with args:', functionArgs);
          
          const output = await executeTool(functionName, functionArgs);
          console.log('Tool output:', output);
          
          toolOutputs.push({
            tool_call_id: toolCall.id,
            output: output
          });
        } catch (error) {
          console.error('Tool execution error:', error);
          toolOutputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify({
              success: false,
              error: 'Tool execution failed: ' + (error instanceof Error ? error.message : 'Unknown error')
            })
          });
        }
      }

      // Submit tool outputs
      await openai.beta.threads.runs.submitToolOutputs(runId, {
        thread_id: finalThreadId,
        tool_outputs: toolOutputs
      });

      // Wait for final completion
      attempts = 0;
      console.log('About to retrieve final run status for thread:', finalThreadId, 'run:', runId);
      runStatus = await openai.beta.threads.runs.retrieve(runId, {
        thread_id: finalThreadId
      });
      while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('About to retrieve final run status in loop for thread:', finalThreadId, 'run:', runId);
        runStatus = await openai.beta.threads.runs.retrieve(runId, {
          thread_id: finalThreadId
        });
        attempts++;
        console.log('Final run status:', runStatus.status, 'attempt:', attempts);
      }
    }

    // Get the latest assistant message
    const messages = await openai.beta.threads.messages.list(finalThreadId);
    const lastMessage = messages.data[0];
    
    console.log('Last message:', lastMessage);
    console.log('Messages data length:', messages.data.length);

    if (lastMessage && lastMessage.role === 'assistant') {
      const content = lastMessage.content[0];
      console.log('Content type:', content.type);
      if (content.type === 'text') {
        console.log('Returning assistant response:', content.text.value);
        return NextResponse.json({
          content: content.text.value,
          threadId: finalThreadId,
          sessionId: sessionId
        });
      }
    }

    console.log('No valid assistant response found, returning fallback');
    return NextResponse.json({
      content: 'I apologize, but I encountered an issue processing your request. Please try again.',
      threadId: finalThreadId,
      sessionId: sessionId
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}