import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import prisma from '@/lib/prisma';
import { threadStore } from '@/lib/thread-store';
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

// Thread store is imported from shared module

// Create assistant once and reuse - reset to null to force recreation with new formatting
let assistantId: string | null = null; // Reset to force numbered location formatting recreation

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
            description: 'The actual database task ID (CUID from getTasksForLocation), NOT the display number like [7]'
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

// Tool execution functions
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
          const inspector = (await getInspectorByPhone(inspectorPhone)) as any;
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

        const jobs = (await getTodayJobsForInspector(finalInspectorId)) as any[];
        
        return JSON.stringify({
          success: true,
          jobs: jobs.map((job, index) => ({
            id: job.id,
            jobNumber: index + 1, // Add job number for display
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
        const workOrder = (await getWorkOrderById(jobId)) as any;
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
        const locationsWithStatus = (await getLocationsWithCompletionStatus(jobId)) as any[];
        
        return JSON.stringify({
          success: true,
          locations: locationsWithStatus.map((loc, index) => ({
            number: index + 1,  // Add selection number
            name: loc.name,
            displayName: loc.displayName,
            contractChecklistItemId: loc.contractChecklistItemId,  // Include the ID!
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
        
        const tasks = (await getTasksByLocation(workOrderId, location)) as any[];
        
        // Don't skip if all tasks are completed - show them with (done) markers
        // Format tasks with status indicators - ALWAYS show all tasks
        const formattedTasks = tasks.map((task : any, index :any) => ({
          id: task.id,
          number: index + 1,
          description: task.action || `Check ${location.toLowerCase()} condition`,
          status: task.status,
          displayStatus: task.status === 'completed' ? 'done' : 'pending',
          notes: task.notes || null
        }));
        
        // Count completed tasks for this location only
        const completedTasksInLocation = formattedTasks.filter((t: any) => t.status === 'completed').length;
        const totalTasksInLocation = formattedTasks.length;
        
        return JSON.stringify({
          success: true,
          location: location,
          allTasksCompleted: completedTasksInLocation === totalTasksInLocation && totalTasksInLocation > 0,
          tasks: formattedTasks,
          // Progress for THIS location only
          locationProgress: {
            completed: completedTasksInLocation,
            total: totalTasksInLocation
          },
          // Include notes separately if available (from remarks field)
          locationNotes: tasks.length > 0 && tasks[0].notes ? tasks[0].notes : null,
          // Include overall location status based on enteredOn field
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
        
        // Check if this is the "complete all" option
        if (taskId === 'complete_all_tasks') {
          // Get location from thread metadata
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
            // Update remarks if notes are provided
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
        
        // Normal single task completion
        const success = await updateTaskStatus(taskId, 'completed', notes);
        
        if (!success) {
          return JSON.stringify({
            success: false,
            error: 'Failed to complete task. Task may not exist.',
          });
        }

        const progress = (await getWorkOrderProgress(workOrderId)) as any;
        
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
        const workOrder = (await getWorkOrderById(jobId)) as any;
        
        if (!workOrder) {
          return JSON.stringify({
            success: false,
            error: 'Job not found. Please check the job ID.',
          });
        }
        
        // Extract postal code from property address
        const postalCodeMatch = workOrder.property_address.match(/\b(\d{6})\b/);
        const postalCode = postalCodeMatch ? postalCodeMatch[1] : 'unknown';
        
        // Store job details in thread metadata when job is selected for confirmation
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
        
        // Update status to STARTED
        await updateWorkOrderStatus(jobId, 'in_progress');
        
        // Update thread metadata to mark job as started
        if (threadId) {
          await updateThreadMetadata(threadId, {
            jobStatus: 'started',
            jobStartedAt: new Date().toISOString()
          });
          console.log('🚀 Job started and metadata updated');
        }
        
        // Get locations with completion status
        const locationsWithStatus = (await getLocationsWithCompletionStatus(jobId)) as any[];
        const progress = (await getWorkOrderProgress(jobId)) as any;
        
        // Extract display names for the response
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
        const { taskId, mediaType, mediaUrl, workOrderId } = args;
        
        // The media has ALREADY been uploaded to DO Spaces AND saved to database
        // by the upload handler in this same route. We just acknowledge it here.
        // DO NOT save again to avoid duplicates!
        
        console.log(`📸 Media already processed - ${mediaType}: ${mediaUrl}`);
        
        // Just return success since upload handler already saved everything
        const success = true;
        
        if (!success) {
          return JSON.stringify({
            success: false,
            error: `Failed to save ${mediaType} URL to database.`
          });
        }
        
        // Return success - media already saved by upload handler
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
        
        // Check if the taskId is actually an inspector ID (common mistake)
        if (taskId === metadata.inspectorId) {
          console.log('⚠️ TaskId is inspector ID, need to find actual ContractChecklistItem');
          console.log('🔍 Current location from metadata:', metadata.currentLocation);
          console.log('🔍 Work order from metadata:', metadata.workOrderId);
          
          if (metadata.currentLocation && metadata.workOrderId) {
            // Use the imported helper function
            const actualTaskId = (await getContractChecklistItemIdByLocation(metadata.workOrderId, metadata.currentLocation)) as string | null;
            
            if (actualTaskId) {
              console.log('✅ Found actual ContractChecklistItem ID:', actualTaskId);
              const mediaInfo = (await getTaskMedia(actualTaskId)) as any;
              
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
        
        // Normal case - try with the provided taskId
        const mediaInfo = (await getTaskMedia(taskId)) as any;
        
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
        
        // First get all locations to map the number to the ContractChecklistItem ID
        const locationsWithStatus = (await getLocationsWithCompletionStatus(workOrderId)) as any[];
        console.log('📍 Available locations:', locationsWithStatus.map((loc, index) => ({
          number: index + 1,
          name: loc.name,
          id: loc.contractChecklistItemId
        })));
        
        let targetLocation = null;
        
        // Find by number if provided
        if (locationNumber && locationNumber > 0 && locationNumber <= locationsWithStatus.length) {
          targetLocation = locationsWithStatus[locationNumber - 1];
          console.log('🎯 Found location by number', locationNumber, ':', targetLocation.name);
        }
        // Find by name if number not found or not provided
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
        
        // Get media using the ContractChecklistItem ID
        const mediaInfo = (await getTaskMedia(targetLocation.contractChecklistItemId)) as any;
        
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
        
        // Get updated job details
        const updatedJob = (await getWorkOrderById(jobId)) as any;
        
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
        
        // Normalize phone number - add +65 if no country code
        let normalizedPhone = phone.replace(/[\s-]/g, '');
        if (!normalizedPhone.startsWith('+')) {
          normalizedPhone = '+65' + normalizedPhone;
        }
        
        // Try to find inspector by normalized phone first
        let inspector = (await getInspectorByPhone(normalizedPhone)) as any;
        
        // Also try original phone format
        if (!inspector) {
          inspector = (await getInspectorByPhone(phone)) as any;
        }
        
        // If not found by phone, try by name
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
        
        // Store inspector details in thread metadata
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

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    // Handle file upload directly in chat route
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const mediaType = formData.get('mediaType') as string;
      const sessionId = formData.get('sessionId') as string;
      
      if (!file || !mediaType || !sessionId) {
        return NextResponse.json(
          { error: 'Missing required fields for upload' },
          { status: 400 }
        );
      }
      
      // Get thread and its metadata
      const threadId = threadStore.get(sessionId);
      if (!threadId) {
        return NextResponse.json(
          { error: 'No thread found for session' },
          { status: 400 }
        );
      }
      
      // Get thread metadata
      const metadata = await getThreadMetadata(threadId);
      console.log('📤 Upload with thread metadata:', metadata);
      
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
      const fileExtension = file.name.split('.').pop();
      const mediaFolder = mediaType === 'photo' ? 'photos' : 'videos';
      const fileName = `${randomUUID()}.${fileExtension}`;
      const folderPath = `${customerName}-${postalCode}/${roomName}/${mediaFolder}`;
      const key = `${SPACE_DIRECTORY}/${folderPath}/${fileName}`;
      
      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Upload to DigitalOcean Spaces
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        ACL: 'public-read' as const,
        Metadata: {
          workOrderId: workOrderId,
          location: roomName,
          mediaType: mediaType,
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
        },
      };
      
      const command = new PutObjectCommand(uploadParams);
      await s3Client.send(command);
      
      const publicUrl = `${PUBLIC_URL}/${key}`;
      console.log('✅ Uploaded to:', publicUrl);
      
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
          console.log('🔍 Available checklist items:', workOrder.contract.contractChecklist.items.map(item => ({
            id: item.id,
            name: item.name,
            photosCount: item.photos.length,
            videosCount: item.videos.length
          })));
          
          const checklistItem = workOrder.contract.contractChecklist.items.find(
            item => item.name.toLowerCase() === normalizedRoomName.toLowerCase()
          );
          
          if (checklistItem) {
            console.log('✅ Found matching checklist item:');
            console.log('  - ID:', checklistItem.id);
            console.log('  - Name:', checklistItem.name);
            console.log('  - Current photos:', checklistItem.photos);
            console.log('  - Current videos:', checklistItem.videos);
            console.log('  - Adding new URL:', publicUrl);
            
            if (mediaType === 'photo') {
              const updatedPhotos = [...checklistItem.photos, publicUrl];
              console.log('📷 Updating photos array to:', updatedPhotos);
              
              await prisma.contractChecklistItem.update({
                where: { id: checklistItem.id },
                data: { photos: updatedPhotos }
              });
              
              console.log('✅ Photo saved to ContractChecklistItem ID:', checklistItem.id);
            } else {
              const updatedVideos = [...checklistItem.videos, publicUrl];
              console.log('🎥 Updating videos array to:', updatedVideos);
              
              await prisma.contractChecklistItem.update({
                where: { id: checklistItem.id },
                data: { videos: updatedVideos }
              });
              
              console.log('✅ Video saved to ContractChecklistItem ID:', checklistItem.id);
            }
            console.log(`📷 Saved ${mediaType} to database for room: ${normalizedRoomName}`);
          } else {
            console.log('❌ No checklist item found for room:', normalizedRoomName);
            console.log('❌ Available room names:', workOrder.contract.contractChecklist.items.map(item => item.name));
          }
        } else {
          console.log('❌ No contract checklist items found in work order');
        }
      }
      
      return NextResponse.json({
        success: true,
        url: publicUrl,
        path: folderPath,
        filename: fileName
      });
    }
    
    // Normal chat message handling
    const { message, history, sessionId = 'default', mediaFiles, jobContext } = await request.json();
    
    console.log('📥 Received request with jobContext:', jobContext);

    // Get or create thread for this session
    let threadId = threadStore.get(sessionId);
    
    if (!threadId) {
      console.log('Creating new thread for session:', sessionId);
      // Create thread with metadata to store job context
      const thread = await openai.beta.threads.create({
        metadata: {
          sessionId: sessionId,
          workOrderId: '',
          customerName: '',
          postalCode: '',
          currentLocation: '',
          propertyAddress: '',
          jobStatus: 'none',
          createdAt: new Date().toISOString()
        }
      });
      threadId = thread.id;
      threadStore.set(sessionId, threadId);
      console.log('Created thread:', threadId);
      console.log('🆕 Thread created with initial metadata:', thread.metadata);
    } else {
      console.log('Using existing thread:', threadId);
      
      // Always get current metadata to see what's stored
      const currentMetadata = await getThreadMetadata(threadId);
      console.log('📊 Current thread state:', currentMetadata);
    }

    // Update thread metadata if job context is provided from chat page
    if (jobContext && threadId) {
      console.log('📝 Received job context from chat page:', jobContext);
      await updateThreadMetadata(threadId, jobContext);
    }

    // Verify threadId is valid
    if (!threadId) {
      throw new Error('Failed to create or retrieve thread ID');
    }

    // Add user message to thread with media context if present
    let messageContent = message;
    if (mediaFiles && mediaFiles.length > 0) {
      // Add media file information for assistant context
      // Note: We're not sending actual file data, just metadata
      messageContent = message;
      // The assistant will recognize the upload mentions in the message
    }
    
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: messageContent
    });

    // Get or create assistant
    if (!assistantId) {
      assistantId = await createAssistant();
    }
    const currentAssistantId = assistantId;

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
          
          // Pass threadId to executeTool for metadata access
          const output = await executeTool(functionName, functionArgs, finalThreadId);
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
      
      // Check if we need to handle more tool calls
      if (runStatus.status === 'requires_action') {
        console.log('🔄 Run still requires action after first tool execution, checking for more tool calls...');
        const additionalToolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || [];
        console.log('Additional tool calls needed:', additionalToolCalls.length);
        
        if (additionalToolCalls.length > 0) {
          console.log('🔧 Processing additional tool calls...');
          // Handle additional tool calls recursively
          const additionalToolOutputs = [];
          
          for (const toolCall of additionalToolCalls) {
            try {
              const functionName = toolCall.function.name;
              const functionArgs = JSON.parse(toolCall.function.arguments);
              console.log('Executing additional tool:', functionName, 'with args:', functionArgs);
              
              const output = await executeTool(functionName, functionArgs, finalThreadId);
              console.log('Additional tool output:', output);
              
              additionalToolOutputs.push({
                tool_call_id: toolCall.id,
                output: output
              });
            } catch (error) {
              console.error('Additional tool execution error:', error);
              additionalToolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify({
                  success: false,
                  error: 'Tool execution failed: ' + (error instanceof Error ? error.message : 'Unknown error')
                })
              });
            }
          }
          
          // Submit additional tool outputs
          await openai.beta.threads.runs.submitToolOutputs(runId, {
            thread_id: finalThreadId,
            tool_outputs: additionalToolOutputs
          });
          
          // Wait for final completion after additional tools
          attempts = 0;
          runStatus = await openai.beta.threads.runs.retrieve(runId, {
            thread_id: finalThreadId
          });
          while ((runStatus.status === 'queued' || runStatus.status === 'in_progress') && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await openai.beta.threads.runs.retrieve(runId, {
              thread_id: finalThreadId
            });
            attempts++;
            console.log('Final completion status:', runStatus.status, 'attempt:', attempts);
          }
        }
      }
    }

    // Get the latest assistant message
    const messages = await openai.beta.threads.messages.list(finalThreadId);
    const lastMessage = messages.data[0];
    
    console.log('📋 Final run status:', runStatus.status);
    console.log('📋 Last message:', lastMessage);
    console.log('📋 Messages data length:', messages.data.length);
    console.log('📋 All message roles:', messages.data.map(m => m.role));

    if (lastMessage && lastMessage.role === 'assistant') {
      const content = lastMessage.content[0];
      console.log('Content type:', content.type);
      if (content.type === 'text') {
        console.log('✅ Returning assistant response:', content.text.value);
        return NextResponse.json({
          content: content.text.value,
          threadId: finalThreadId,
          sessionId: sessionId
        });
      }
    }

    console.log('❌ No valid assistant response found, returning fallback');
    console.log('❌ Run status was:', runStatus.status);
    if (runStatus.status === 'requires_action') {
      console.log('❌ Required action:', runStatus.required_action);
    }
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