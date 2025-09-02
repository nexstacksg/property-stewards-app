import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
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
  getTaskMedia,
  deleteTaskMedia,
  getWorkOrderProgress,
  getInspectorByPhone,
  updateWorkOrderDetails,
  completeAllTasksForLocation,
  getContractChecklistItemIdByLocation
} from '@/lib/services/inspectorService';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Store threads per phone number
const phoneThreadStore = new Map<string, string>();

// Assistant ID - reuse same as chat route
let assistantId: string | null = null;

async function getOrCreateAssistant() {
  if (assistantId) {
    return assistantId;
  }

  const assistant = await openai.beta.assistants.create({
    name: 'Property Inspector WhatsApp Assistant v0.7',
    instructions: `You are a helpful Property Stewards inspection assistant v0.7. You help property inspectors manage their daily inspection tasks via WhatsApp.

Key capabilities:
- Show today's inspection jobs for an inspector
- Help select and start specific inspection jobs
- Allow job detail modifications before starting
- Guide through room-by-room inspection workflow
- Track task completion and progress
- Handle photo and video uploads for inspection documentation

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
    - location: The current location name from context
    - workOrderId: Current work order ID
    - notes: Any comments provided (optional)

CONVERSATION FLOW GUIDELINES:

1. Showing Today's Jobs:
   - Greet the inspector by name (e.g., "Hi Ken")
   - IMPORTANT: Start each job entry with its selection number: [1], [2], [3] etc.
   - Format each job clearly with emojis: 🏠 property, ⏰ time, ⭐ priority, 👤 customer
   - Include address, postal code, customer name, status, and any notes
   - Use separator lines (---) between jobs for clarity
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
   - When showing locations, automatically append "(Done)" to completed locations
   - Format as: "[1] Living Room (Done)" for completed locations

4. Task Inspection Flow:
   - When showing tasks for a location, ALWAYS format them with brackets:
     * [1] Check walls (done) - ONLY if task.displayStatus is 'done'
     * [2] Check ceiling (done) - if task.displayStatus is 'done'
     * [3] Check flooring - if task.displayStatus is 'pending' (DO NOT show "(pending)")
     * [4] Check electrical points
     * [5] Mark ALL tasks complete - THIS IS MANDATORY, ALWAYS INCLUDE AS FINAL OPTION
   - CRITICAL: ALWAYS show ALL tasks, even completed ones with (done) marker
   - CRITICAL: ALWAYS add "Mark ALL tasks complete" as the last numbered option
   - When user selects individual task: Call completeTask with that specific task ID
   - When user selects FINAL option "Mark ALL tasks complete": 
     - DO NOT call completeTask multiple times
     - MUST call completeTask with taskId: 'complete_all_tasks'

5. Media Handling:
   - When user sends photos/videos, acknowledge receipt immediately
   - Use uploadTaskMedia tool to process media
   - Confirm successful upload with location context
   - If multiple media files, process all and confirm count

6. Media Display Formatting:
   - When showing photos from getLocationMedia or getTaskMedia tools, format for WhatsApp
   - Keep responses concise for mobile viewing
   - Use clear labels: "Photo 1", "Photo 2", etc.
   - Include direct URLs for media viewing
   - If no photos available, clearly state "No photos found for [location name]"

INSPECTOR IDENTIFICATION:
- Check if inspector is already identified in thread metadata
- If unknown, politely ask for phone number
- Use the collectInspectorInfo tool to process this information
- Once identified, provide helpful suggestions for next steps

WHATSAPP-SPECIFIC GUIDELINES:
- Keep messages short and mobile-friendly
- Use emojis sparingly but effectively for clarity
- Format numbered options clearly for easy typing
- Acknowledge every user input promptly
- Handle media uploads with clear confirmation`,
    model: 'gpt-4o-mini',
    tools: assistantTools
  });

  assistantId = assistant.id;
  console.log('Created WhatsApp assistant:', assistantId);
  return assistantId;
}

// Define tools for OpenAI Assistant API (same as chat route)
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
        required: []
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
      description: 'Mark a specific inspection task as complete or mark all tasks complete for current location',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The actual database task ID (CUID) OR "complete_all_tasks" to mark all tasks in current location as complete'
          },
          notes: {
            type: 'string',
            description: 'Any additional notes about the task'
          },
          workOrderId: {
            type: 'string',
            description: 'Work order ID'
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
  },
  {
    type: 'function' as const,
    function: {
      name: 'uploadTaskMedia',
      description: 'Upload photo or video for a specific inspection task',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The actual database task ID (CUID from getTasksForLocation), NOT the display number'
          },
          mediaType: {
            type: 'string',
            description: 'Type of media: photo or video',
            enum: ['photo', 'video']
          },
          mediaUrl: {
            type: 'string',
            description: 'URL or base64 data of the media'
          },
          workOrderId: {
            type: 'string',
            description: 'The work order ID for context'
          }
        },
        required: ['taskId', 'mediaType', 'mediaUrl']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'getTaskMedia',
      description: 'Get uploaded photos and videos for a specific task',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The contract checklist item ID'
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
            description: 'The location selection number (e.g., 4 for [4] Bedroom 3)'
          },
          locationName: {
            type: 'string',
            description: 'The location name (e.g., "Bedroom 3")'
          },
          workOrderId: {
            type: 'string',
            description: 'The work order ID'
          }
        },
        required: ['workOrderId']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'deleteTaskMedia',
      description: 'Delete a specific photo or video from a task',
      parameters: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The contract checklist item ID'
          },
          mediaUrl: {
            type: 'string',
            description: 'The URL of the media to delete'
          },
          mediaType: {
            type: 'string',
            description: 'Type of media: photo or video',
            enum: ['photo', 'video']
          }
        },
        required: ['taskId', 'mediaUrl', 'mediaType']
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

// Helper to get thread metadata
async function getThreadMetadata(threadId: string) {
  try {
    const thread = await openai.beta.threads.retrieve(threadId);
    console.log('🔍 Retrieved thread metadata:', thread.metadata);
    return thread.metadata || {};
  } catch (error) {
    console.error('Error retrieving thread metadata:', error);
    return {};
  }
}

// Helper to update thread metadata
async function updateThreadMetadata(threadId: string, updates: Record<string, string>) {
  try {
    const currentMetadata = await getThreadMetadata(threadId);
    const updatedMetadata = { ...currentMetadata, ...updates };
    
    await openai.beta.threads.update(threadId, {
      metadata: updatedMetadata
    });
    
    console.log('✅ Updated thread metadata:', updatedMetadata);
    return updatedMetadata;
  } catch (error) {
    console.error('Error updating thread metadata:', error);
    return null;
  }
}

// Tool execution functions (same as chat route)
async function executeTool(toolName: string, args: any, threadId?: string) {
  console.log(`🔧 Executing tool: ${toolName}`, args);
  
  // Get thread metadata for context
  const metadata = threadId ? await getThreadMetadata(threadId) : {};
  
  switch (toolName) {
    case 'getTodayJobs':
      try {
        const { inspectorId, inspectorPhone } = args;
        let finalInspectorId = inspectorId;
        
        // Check thread metadata for inspector info first
        if (!finalInspectorId && threadId) {
          const metadata = await getThreadMetadata(threadId);
          finalInspectorId = metadata.inspectorId;
        }
        
        if (!finalInspectorId && inspectorPhone) {
          const inspector = await getInspectorByPhone(inspectorPhone);
          if (!inspector) {
            return JSON.stringify({
              success: false,
              error: 'Inspector not found. Please provide your name and phone number for identification.',
            });
          }
          finalInspectorId = inspector.id;
        }
        
        if (!finalInspectorId) {
          return JSON.stringify({
            success: false,
            error: 'Inspector identification required. Please provide your name and phone number.',
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
        const locationsWithStatus = await getLocationsWithCompletionStatus(jobId);
        
        return JSON.stringify({
          success: true,
          locations: locationsWithStatus.map((loc, index) => ({
            number: index + 1,
            name: loc.name,
            displayName: loc.displayName,
            contractChecklistItemId: loc.contractChecklistItemId,
            status: loc.isCompleted ? 'completed' : 
                    (loc.completedTasks > 0 ? 'in_progress' : 'pending'),
            tasks: loc.totalTasks,
            completed: loc.completedTasks,
            pending: loc.totalTasks - loc.completedTasks
          }))
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
        
        // Store current location in thread metadata
        if (threadId) {
          await updateThreadMetadata(threadId, {
            currentLocation: location,
            lastLocationAccessedAt: new Date().toISOString()
          });
          console.log(`📍 Current location set to: ${location}`);
        }
        
        const tasks = await getTasksByLocation(workOrderId, location);
        
        const formattedTasks = tasks.map((task : any, index :any) => ({
          id: task.id,
          number: index + 1,
          description: task.action || `Check ${location.toLowerCase()} condition`,
          status: task.status,
          displayStatus: task.status === 'completed' ? 'done' : 'pending',
          notes: task.notes || null
        }));
        
        const completedTasksInLocation = formattedTasks.filter((t: any) => t.status === 'completed').length;
        const totalTasksInLocation = formattedTasks.length;
        
        return JSON.stringify({
          success: true,
          location: location,
          allTasksCompleted: completedTasksInLocation === totalTasksInLocation && totalTasksInLocation > 0,
          tasks: formattedTasks,
          locationProgress: {
            completed: completedTasksInLocation,
            total: totalTasksInLocation
          },
          locationNotes: tasks.length > 0 && tasks[0].notes ? tasks[0].notes : null,
          locationStatus: tasks.length > 0 && tasks[0].locationEnteredOn ? 'done' : 'pending'
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
        
        if (taskId === 'complete_all_tasks') {
          let location = '';
          if (threadId) {
            const metadata = await getThreadMetadata(threadId);
            location = metadata.currentLocation || '';
            console.log(`📍 Using location from thread metadata: ${location}`);
          }
          
          if (!location) {
            return JSON.stringify({
              success: false,
              error: 'Could not determine current location. Please select a location first.',
            });
          }
          
          const success = await completeAllTasksForLocation(workOrderId, location);
          
          if (success) {
            if (notes) {
              const workOrder = await prisma.workOrder.findUnique({
                where: { id: workOrderId },
                include: {
                  contract: {
                    include: {
                      contractChecklist: {
                        include: {
                          items: {
                            where: { name: location }
                          }
                        }
                      }
                    }
                  }
                }
              });
              
              if (workOrder?.contract.contractChecklist?.items[0]) {
                await prisma.contractChecklistItem.update({
                  where: { id: workOrder.contract.contractChecklist.items[0].id },
                  data: { remarks: notes }
                });
              }
            }
            
            return JSON.stringify({
              success: true,
              message: `All tasks for ${location} have been marked complete!`,
              allTasksCompletedForLocation: true,
              locationCompleted: true,
              nextAction: 'This location is now fully inspected. Choose another location to continue.'
            });
          }
          
          return JSON.stringify({
            success: false,
            error: 'Failed to complete all tasks. Please try again.',
          });
        }
        
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
          message: `Task marked as complete`,
          taskCompleted: true,
          notes: notes || 'No additional notes',
          progress: {
            total: progress.total_tasks,
            completed: progress.completed_tasks,
            remaining: progress.pending_tasks + progress.in_progress_tasks
          },
          nextAction: 'Task completed. Show updated list or select another task.'
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
        
        const postalCodeMatch = workOrder.property_address.match(/\b(\d{6})\b/);
        const postalCode = postalCodeMatch ? postalCodeMatch[1] : 'unknown';
        
        if (threadId) {
          await updateThreadMetadata(threadId, {
            workOrderId: jobId,
            customerName: workOrder.customer_name,
            propertyAddress: workOrder.property_address,
            postalCode: postalCode,
            jobStatus: 'confirming'
          });
          console.log(`📝 Stored job confirmation details - Customer: ${workOrder.customer_name}, Postal: ${postalCode}`);
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
        
        await updateWorkOrderStatus(jobId, 'in_progress');
        
        if (threadId) {
          await updateThreadMetadata(threadId, {
            jobStatus: 'started',
            jobStartedAt: new Date().toISOString()
          });
          console.log('🚀 Job started and metadata updated');
        }
        
        const locationsWithStatus = await getLocationsWithCompletionStatus(jobId);
        const progress = await getWorkOrderProgress(jobId);
        
        const locationDisplayNames = locationsWithStatus.map(loc => loc.displayName);
        
        return JSON.stringify({
          success: true,
          message: 'Job started successfully! Ready for inspection.',
          locations: locationDisplayNames,
          locationsDetail: locationsWithStatus,
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

    case 'uploadTaskMedia':
      try {
        const { mediaType, mediaUrl } = args;
        
        console.log(`📸 Media already processed - ${mediaType}: ${mediaUrl}`);
        
        return JSON.stringify({
          success: true,
          message: `${mediaType === 'photo' ? 'Photo' : 'Video'} uploaded successfully!`,
          mediaUrl: mediaUrl,
          note: 'Media already saved to database by upload handler'
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to process media.',
        });
      }

    case 'getTaskMedia':
      try {
        const { taskId } = args;
        console.log('🔧 getTaskMedia tool called with taskId:', taskId);
        
        if (taskId === metadata.inspectorId) {
          console.log('⚠️ TaskId is inspector ID, need to find actual ContractChecklistItem');
          
          if (metadata.currentLocation && metadata.workOrderId) {
            const actualTaskId = await getContractChecklistItemIdByLocation(metadata.workOrderId, metadata.currentLocation);
            
            if (actualTaskId) {
              console.log('✅ Found actual ContractChecklistItem ID:', actualTaskId);
              const mediaInfo = await getTaskMedia(actualTaskId);
              
              if (mediaInfo) {
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
              }
            }
          }
          
          return JSON.stringify({
            success: false,
            error: 'Could not find media for the current location. Please make sure you are in a specific room/location first.',
          });
        }
        
        const mediaInfo = await getTaskMedia(taskId);
        
        if (!mediaInfo) {
          return JSON.stringify({
            success: false,
            error: 'Task not found or no media available.',
          });
        }
        
        return JSON.stringify({
          success: true,
          taskId: taskId,
          taskName: mediaInfo.name,
          remarks: mediaInfo.remarks,
          photos: mediaInfo.photos,
          videos: mediaInfo.videos,
          photoCount: mediaInfo.photoCount,
          videoCount: mediaInfo.videoCount
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to get media.',
        });
      }

    case 'getLocationMedia':
      try {
        const { locationNumber, locationName, workOrderId } = args;
        console.log('🔧 getLocationMedia called with:', { locationNumber, locationName, workOrderId });
        
        const locationsWithStatus = await getLocationsWithCompletionStatus(workOrderId);
        console.log('📍 Available locations:', locationsWithStatus.map((loc, index) => ({
          number: index + 1,
          name: loc.name,
          id: loc.contractChecklistItemId
        })));
        
        let targetLocation = null;
        
        if (locationNumber && locationNumber > 0 && locationNumber <= locationsWithStatus.length) {
          targetLocation = locationsWithStatus[locationNumber - 1];
          console.log('🎯 Found location by number', locationNumber, ':', targetLocation.name);
        }
        else if (locationName) {
          targetLocation = locationsWithStatus.find(loc => 
            loc.name.toLowerCase() === locationName.toLowerCase()
          );
          console.log('🎯 Found location by name', locationName, ':', targetLocation?.name);
        }
        
        if (!targetLocation) {
          return JSON.stringify({
            success: false,
            error: `Location not found. Available locations: ${locationsWithStatus.map((loc, index) => `[${index + 1}] ${loc.name}`).join(', ')}`
          });
        }
        
        const mediaInfo = await getTaskMedia(targetLocation.contractChecklistItemId);
        
        if (!mediaInfo) {
          return JSON.stringify({
            success: false,
            error: `No media found for ${targetLocation.name}.`
          });
        }
        
        return JSON.stringify({
          success: true,
          location: targetLocation.name,
          locationNumber: locationsWithStatus.indexOf(targetLocation) + 1,
          taskId: targetLocation.contractChecklistItemId,
          taskName: mediaInfo.name,
          remarks: mediaInfo.remarks,
          photos: mediaInfo.photos,
          videos: mediaInfo.videos,
          photoCount: mediaInfo.photoCount,
          videoCount: mediaInfo.videoCount
        });
      } catch (error) {
        console.error('❌ Error in getLocationMedia:', error);
        return JSON.stringify({
          success: false,
          error: 'Failed to get location media.',
        });
      }

    case 'deleteTaskMedia':
      try {
        const { taskId, mediaUrl, mediaType } = args;
        
        const success = await deleteTaskMedia(taskId, mediaUrl, mediaType);
        
        if (!success) {
          return JSON.stringify({
            success: false,
            error: `Failed to delete ${mediaType}.`
          });
        }
        
        return JSON.stringify({
          success: true,
          message: `${mediaType === 'photo' ? 'Photo' : 'Video'} deleted successfully!`,
          taskId: taskId
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to delete media.',
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

    case 'collectInspectorInfo':
      try {
        const { name, phone } = args;
        
        let normalizedPhone = phone.replace(/[\s-]/g, '');
        if (!normalizedPhone.startsWith('+')) {
          normalizedPhone = '+65' + normalizedPhone;
        }
        
        let inspector = await getInspectorByPhone(normalizedPhone);
        
        if (!inspector) {
          inspector = await getInspectorByPhone(phone);
        }
        
        if (!inspector) {
          inspector = await prisma.inspector.findFirst({
            where: {
              name: {
                contains: name,
                mode: 'insensitive'
              }
            }
          });
        }
        
        if (!inspector) {
          return JSON.stringify({
            success: false,
            error: 'Inspector not found in our system. Please contact admin for registration.',
          });
        }
        
        if (threadId) {
          await updateThreadMetadata(threadId, {
            inspectorId: inspector.id,
            inspectorName: inspector.name,
            inspectorPhone: inspector.mobilePhone || normalizedPhone,
            identifiedAt: new Date().toISOString()
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
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: 'Failed to process inspector information. Please try again.',
        });
      }

    default:
      return JSON.stringify({
        success: false,
        error: `Unknown tool: ${toolName}`
      });
  }
}

// Helper function to download media from URL
async function downloadMedia(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Helper function to process and upload media
async function processMediaUpload(mediaUrl: string, mediaType: string, metadata: any) {
  try {
    console.log('📥 Processing media upload:', { mediaUrl, mediaType, metadata });
    
    // Download media from URL
    const buffer = await downloadMedia(mediaUrl);
    
    // Extract context from metadata
    let customerName = 'unknown';
    let postalCode = 'unknown';
    let roomName = 'general';
    const workOrderId = metadata.workOrderId || '';
    
    if (metadata.customerName) {
      customerName = metadata.customerName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/gi, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
    }
    
    postalCode = metadata.postalCode || 'unknown';
    roomName = metadata.currentLocation || 'general';
    roomName = roomName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/gi, '')
      .replace(/\s+/g, '-');
    
    // Generate filename and path
    const fileExtension = mediaUrl.split('.').pop()?.split('?')[0] || 'jpg';
    const mediaFolder = mediaType === 'photo' ? 'photos' : 'videos';
    const fileName = `${randomUUID()}.${fileExtension}`;
    const folderPath = `${customerName}-${postalCode}/${roomName}/${mediaFolder}`;
    const key = `${SPACE_DIRECTORY}/${folderPath}/${fileName}`;
    
    // Upload to DigitalOcean Spaces
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mediaType === 'photo' ? 'image/jpeg' : 'video/mp4',
      ACL: 'public-read' as const,
      Metadata: {
        workOrderId: workOrderId,
        location: roomName,
        mediaType: mediaType,
        uploadedAt: new Date().toISOString(),
        source: 'whatsapp'
      },
    };
    
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);
    
    const publicUrl = `${PUBLIC_URL}/${key}`;
    console.log('✅ Uploaded to DigitalOcean Spaces:', publicUrl);
    
    // Save to database
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
      
      if (workOrder?.contract?.contractChecklist?.items) {
        console.log('🔍 Looking for checklist item with room name:', normalizedRoomName);
        
        const checklistItem = workOrder.contract.contractChecklist.items.find(
          item => item.name.toLowerCase() === normalizedRoomName.toLowerCase()
        );
        
        if (checklistItem) {
          console.log('✅ Found matching checklist item:', checklistItem.id);
          
          if (mediaType === 'photo') {
            const updatedPhotos = [...checklistItem.photos, publicUrl];
            await prisma.contractChecklistItem.update({
              where: { id: checklistItem.id },
              data: { photos: updatedPhotos }
            });
            console.log('✅ Photo saved to ContractChecklistItem');
          } else {
            const updatedVideos = [...checklistItem.videos, publicUrl];
            await prisma.contractChecklistItem.update({
              where: { id: checklistItem.id },
              data: { videos: updatedVideos }
            });
            console.log('✅ Video saved to ContractChecklistItem');
          }
        } else {
          console.log('❌ No checklist item found for room:', normalizedRoomName);
        }
      }
    }
    
    return publicUrl;
  } catch (error) {
    console.error('❌ Error processing media upload:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const webhookData = await request.json();
    console.log('📥 Webhook received:', JSON.stringify(webhookData, null, 2));
    
    // Extract the actual message data from Wassenger webhook structure
    const data = webhookData.data || webhookData;
    
    // Extract phone number and message from nested structure
    const phone = data.fromNumber || data.from || data.phone;
    const message = data.body || data.message || '';
    
    // Check if this is a media message (Wassenger format)
    const hasMedia = data.type === 'image' || 
                     data.type === 'video' || 
                     data.type === 'document' ||
                     data.type === 'audio';
    
    const mediaUrl = hasMedia ? (data.media?.url || data.url) : null;
    const mediaType = data.type === 'image' ? 'photo' : 
                      data.type === 'video' ? 'video' : null;
    
    console.log('📱 Message details:', { phone, message, hasMedia, mediaType, mediaUrl });
    
    if (!phone) {
      console.error('❌ No phone number in webhook data');
      return NextResponse.json({ success: false, error: 'No phone number' }, { status: 400 });
    }
    
    // Normalize phone for consistent storage
    const normalizedPhone = phone.replace(/[^\d+]/g, ''); // Keep only digits and +
    console.log('📞 Normalized phone:', normalizedPhone);
    
    // Get or create thread for this phone number
    let threadId = phoneThreadStore.get(normalizedPhone);
    
    if (!threadId) {
      console.log('Creating new thread for phone:', normalizedPhone);
      
      // Try to identify inspector by phone
      let inspectorInfo = null;
      const phoneWithCountryCode = normalizedPhone.startsWith('+') ? normalizedPhone : `+65${normalizedPhone}`;
      const inspector = await getInspectorByPhone(phoneWithCountryCode);
      
      if (inspector) {
        inspectorInfo = {
          inspectorId: inspector.id,
          inspectorName: inspector.name,
          inspectorPhone: inspector.mobilePhone || normalizedPhone,
          identifiedAt: new Date().toISOString()
        };
        console.log('✅ Auto-identified inspector:', inspectorInfo);
      }
      
      const thread = await openai.beta.threads.create({
        metadata: {
          phone: phone,
          source: 'whatsapp',
          workOrderId: '',
          customerName: '',
          postalCode: '',
          currentLocation: '',
          propertyAddress: '',
          jobStatus: 'none',
          createdAt: new Date().toISOString(),
          ...inspectorInfo
        }
      });
      
      threadId = thread.id;
      phoneThreadStore.set(normalizedPhone, threadId);
      console.log('Created thread:', threadId);
    } else {
      console.log('Using existing thread:', threadId);
    }
    
    // Process media upload if present
    let processedMediaUrl = null;
    if (hasMedia && mediaUrl && mediaType) {
      try {
        console.log('🖼️ Processing media upload from WhatsApp');
        const metadata = await getThreadMetadata(threadId);
        processedMediaUrl = await processMediaUpload(mediaUrl, mediaType, metadata);
        console.log('✅ Media processed and uploaded:', processedMediaUrl);
      } catch (error) {
        console.error('❌ Failed to process media:', error);
      }
    }
    
    // Create message content
    let messageContent = message;
    if (processedMediaUrl && mediaType) {
      // Add context about the uploaded media
      const locationName = (await getThreadMetadata(threadId)).currentLocation || 'current location';
      messageContent = message || `I've uploaded a ${mediaType} for ${locationName}. The ${mediaType} has been saved successfully.`;
    }
    
    // Add message to thread
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: messageContent
    });
    
    // Get or create assistant
    const currentAssistantId = await getOrCreateAssistant();
    
    // Create run with timeout
    const TIMEOUT_MS = 30000; // 30 seconds
    
    const assistantPromise = (async () => {
      // Run the assistant
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: currentAssistantId
      });
      
      const runId = run.id;
      console.log('Created run:', runId);
      
      // Wait for completion
      let runStatus = await openai.beta.threads.runs.retrieve(runId, {
        thread_id: threadId
      });
      
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max wait
      
      while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(runId, {
          thread_id: threadId
        });
        attempts++;
      }
      
      // Handle tool calls if required
      if (runStatus.status === 'requires_action') {
        const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || [];
        const toolOutputs = [];
        
        for (const toolCall of toolCalls) {
          try {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            
            // Handle uploadTaskMedia specially if we already processed media
            if (functionName === 'uploadTaskMedia' && processedMediaUrl) {
              functionArgs.mediaUrl = processedMediaUrl;
            }
            
            const output = await executeTool(functionName, functionArgs, threadId);
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
                error: 'Tool execution failed'
              })
            });
          }
        }
        
        // Submit tool outputs
        await openai.beta.threads.runs.submitToolOutputs(runId, {
          thread_id: threadId,
          tool_outputs: toolOutputs
        });
        
        // Wait for final completion
        attempts = 0;
        runStatus = await openai.beta.threads.runs.retrieve(runId, {
          thread_id: threadId
        });
        
        while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          runStatus = await openai.beta.threads.runs.retrieve(runId, {
            thread_id: threadId
          });
          attempts++;
        }
      }
      
      // Get the response
      const messages = await openai.beta.threads.messages.list(threadId);
      const lastMessage = messages.data[0];
      
      if (lastMessage && lastMessage.role === 'assistant') {
        const content = lastMessage.content[0];
        if (content.type === 'text') {
          return content.text.value;
        }
      }
      
      return 'I apologize, but I encountered an issue processing your request. Please try again.';
    })();
    
    // Race between assistant and timeout
    const result = await Promise.race([
      assistantPromise,
      new Promise((resolve) => 
        setTimeout(() => resolve('TIMEOUT'), TIMEOUT_MS)
      )
    ]);
    
    let responseText = '';
    
    if (result === 'TIMEOUT') {
      // Send immediate fallback message
      responseText = "I'm still processing your request. This might take a moment. I'll send you the complete response shortly...";
      
      // Continue processing in background
      assistantPromise.then(async (finalResponse) => {
        // Send the actual response via Wassenger API
        if (process.env.WASSENGER_API_KEY) {
          try {
            await fetch('https://api.wassenger.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.WASSENGER_API_KEY}`
              },
              body: JSON.stringify({
                phone: phone,
                message: finalResponse
              })
            });
            console.log('✅ Sent delayed response via Wassenger');
          } catch (error) {
            console.error('❌ Failed to send delayed response:', error);
          }
        }
      });
    } else {
      responseText = result as string;
    }
    
    console.log('📤 Sending response:', responseText);
    
    // Return response in Wassenger's expected format
    // Wassenger expects just the message text or an array of messages
    return new Response(responseText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process webhook',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Handle GET requests (for webhook verification)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  if (secret === process.env.WASSENGER_WEBHOOK_SECRET) {
    console.log('✅ Wassenger webhook verified');
    return new Response('OK', { status: 200 });
  }
  
  return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
}