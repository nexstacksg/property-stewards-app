import { prisma } from '@/lib/prisma'
import { WorkOrderStatus, Status } from '@prisma/client'

export async function getInspectorByPhone(phone: string) {
  try {
    const inspector = await prisma.inspector.findUnique({
      where: {
        mobilePhone: phone,
        status: Status.ACTIVE
      }
    })
    return inspector
  } catch (error) {
    console.error('Error fetching inspector by phone:', error)
    return null
  }
}

export async function getTodayJobsForInspector(inspectorId: string) {
  try {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    const workOrders = await prisma.workOrder.findMany({
      where: {
        inspectorId: inspectorId,
        scheduledStartDateTime: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        contract: {
          include: {
            customer: true,
            address: true
          }
        }
      },
      orderBy: {
        scheduledStartDateTime: 'asc'
      }
    })

    return workOrders.map(wo => ({
      id: wo.id,
      property_address: `${wo.contract.address.address}, ${wo.contract.address.postalCode}`,
      customer_name: wo.contract.customer.name,
      scheduled_date: wo.scheduledStartDateTime,
      inspection_type: `${wo.contract.address.propertyType} Inspection`,
      status: wo.status,
      priority: wo.status === WorkOrderStatus.STARTED ? 'high' : 'normal',
      notes: wo.remarks || ''
    }))
  } catch (error) {
    console.error('Error fetching today\'s jobs:', error)
    return []
  }
}

export async function getWorkOrderById(workOrderId: string) {
  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        contract: {
          include: {
            customer: true,
            address: true,
            contractChecklist: {
              include: {
                items: true
              }
            }
          }
        },
        inspector: true
      }
    })

    if (!workOrder) return null

    return {
      id: workOrder.id,
      property_address: `${workOrder.contract.address.address}, ${workOrder.contract.address.postalCode}`,
      customer_name: workOrder.contract.customer.name,
      inspection_type: `${workOrder.contract.address.propertyType} Inspection`,
      status: workOrder.status,
      inspector_name: workOrder.inspector.name,
      scheduled_start: workOrder.scheduledStartDateTime,
      scheduled_end: workOrder.scheduledEndDateTime,
      checklist_items: workOrder.contract.contractChecklist?.items || []
    }
  } catch (error) {
    console.error('Error fetching work order:', error)
    return null
  }
}

export async function updateWorkOrderStatus(workOrderId: string, status: 'in_progress' | 'completed' | 'cancelled') {
  try {
    const statusMap = {
      'in_progress': WorkOrderStatus.STARTED,
      'completed': WorkOrderStatus.COMPLETED,
      'cancelled': WorkOrderStatus.CANCELLED
    }

    const updateData: any = {
      status: statusMap[status]
    }

    if (status === 'in_progress' && !await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { actualStart: true } }).then(wo => wo?.actualStart)) {
      updateData.actualStart = new Date()
    }

    if (status === 'completed') {
      updateData.actualEnd = new Date()
    }

    const updated = await prisma.workOrder.update({
      where: { id: workOrderId },
      data: updateData
    })

    return updated
  } catch (error) {
    console.error('Error updating work order status:', error)
    return null
  }
}

export async function getDistinctLocationsForWorkOrder(workOrderId: string) {
  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        contract: {
          include: {
            contractChecklist: {
              include: {
                items: {
                  orderBy: {
                    order: 'asc'
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!workOrder?.contract.contractChecklist) {
      return []
    }

    const locations = [...new Set(workOrder.contract.contractChecklist.items.map(item => item.name))]
    return locations
  } catch (error) {
    console.error('Error fetching locations:', error)
    return []
  }
}

export async function getLocationsWithCompletionStatus(workOrderId: string) {
  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        contract: {
          include: {
            contractChecklist: {
              include: {
                items: {
                  orderBy: {
                    order: 'asc'
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!workOrder?.contract.contractChecklist) {
      return []
    }

    // Group items by location and check if all tasks for each location are completed
    const locationMap = new Map<string, { total: number, completed: number }>()
    
    for (const item of workOrder.contract.contractChecklist.items) {
      const location = item.name
      if (!locationMap.has(location)) {
        locationMap.set(location, { total: 0, completed: 0 })
      }
      const locData = locationMap.get(location)!
      locData.total++
      if (item.enteredOn !== null) {
        locData.completed++
      }
    }

    // Convert to array with completion status
    const locationsWithStatus = Array.from(locationMap.entries()).map(([name, data]) => {
      const isCompleted = data.completed === data.total && data.total > 0
      return {
        name: name,
        displayName: isCompleted ? `${name} (Done)` : name,
        isCompleted: isCompleted,
        totalTasks: data.total,
        completedTasks: data.completed
      }
    })

    return locationsWithStatus
  } catch (error) {
    console.error('Error fetching locations with status:', error)
    return []
  }
}

export async function getTasksByLocation(workOrderId: string, location: string) {
  try {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        contract: {
          include: {
            contractChecklist: {
              include: {
                items: {
                  where: {
                    name: location
                  },
                  orderBy: {
                    order: 'asc'
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!workOrder?.contract.contractChecklist) {
      return []
    }

    // Get the first item for this location (there should only be one per location)
    const checklistItem = workOrder.contract.contractChecklist.items[0] as any
    if (!checklistItem) {
      return []
    }

    // Parse tasks from JSON field if it exists
    if (checklistItem.tasks && typeof checklistItem.tasks === 'object') {
      const tasks = Array.isArray(checklistItem.tasks) ? checklistItem.tasks : []
      
      // Return individual tasks from the tasks array
      return tasks.map((task: any, index: number) => ({
        id: `${checklistItem.id}_task_${index}`,
        location: checklistItem.name,
        action: typeof task === 'string' ? task : (task.task || 'Inspect area'),
        status: typeof task === 'object' && task.status === 'done' ? 'completed' : 'pending',
        notes: checklistItem.remarks,
        photos: checklistItem.photos,
        videos: checklistItem.videos,
        completed_at: checklistItem.enteredOn,
        completed_by: checklistItem.enteredById,
        isSubTask: true,
        taskIndex: index,
        locationEnteredOn: checklistItem.enteredOn  // Pass the enteredOn for overall status
      }))
    }
    
    // Fallback to old behavior if no tasks JSON - treat remarks as single task
    return [{
      id: checklistItem.id,
      location: checklistItem.name,
      action: checklistItem.remarks || 'Inspect area',
      status: checklistItem.enteredOn ? 'completed' : 'pending',
      notes: checklistItem.remarks,
      photos: checklistItem.photos,
      videos: checklistItem.videos,
      completed_at: checklistItem.enteredOn,
      completed_by: checklistItem.enteredById,
      isSubTask: false
    }]
  } catch (error) {
    console.error('Error fetching tasks by location:', error)
    return []
  }
}

export async function updateTaskStatus(taskId: string, status: 'completed' | 'pending', notes?: string) {
  try {
    // Check if this is marking a single subtask
    if (taskId.includes('_task_')) {
      const [checklistItemId, , taskIndexStr] = taskId.split('_')
      const taskIndex = parseInt(taskIndexStr)
      
      // Get the checklist item
      const item = await prisma.contractChecklistItem.findUnique({
        where: { id: checklistItemId }
      }) as any
      
      if (!item) return false
      
      // Update the specific task in the tasks array
      let tasks = item.tasks || []
      if (Array.isArray(tasks) && tasks[taskIndex]) {
        tasks[taskIndex] = {
          ...tasks[taskIndex],
          status: status === 'completed' ? 'done' : 'pending'
        }
        
        // Prepare update data
        const updateData: any = { tasks }
        
        // If notes are provided, update the remarks field for the entire location
        if (notes) {
          updateData.remarks = notes
        }
        
        // Update the item with new tasks array and optional remarks
        await prisma.contractChecklistItem.update({
          where: { id: checklistItemId },
          data: updateData
        })
        
        return true
      }
      return false
    }
    
    // Original behavior for completing entire location
    const updateData: any = {}
    
    if (status === 'completed') {
      updateData.enteredOn = new Date()
      if (notes) {
        updateData.remarks = notes
      }
    } else {
      updateData.enteredOn = null
      updateData.enteredById = null
    }

    const updated = await prisma.contractChecklistItem.update({
      where: { id: taskId },
      data: updateData
    })

    return true
  } catch (error) {
    console.error('Error updating task status:', error)
    return false
  }
}

// New function to mark all tasks complete for a location
export async function completeAllTasksForLocation(workOrderId: string, location: string, inspectorId?: string) {
  try {
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
    })

    if (!workOrder?.contract.contractChecklist) {
      return false
    }

    const checklistItem = workOrder.contract.contractChecklist.items[0] as any
    if (!checklistItem) {
      return false
    }

    // Mark all tasks in the array as done
    let tasks = checklistItem.tasks || []
    if (Array.isArray(tasks)) {
      tasks = tasks.map((task: any) => ({
        ...task,
        status: 'done'
      }))
    }

    // Update the checklist item with all tasks done and set enteredOn
    await prisma.contractChecklistItem.update({
      where: { id: checklistItem.id },
      data: {
        tasks: tasks,
        enteredOn: new Date(),
        enteredById: inspectorId || checklistItem.enteredById
      }
    })

    return true
  } catch (error) {
    console.error('Error completing all tasks for location:', error)
    return false
  }
}

export async function addTaskPhoto(taskId: string, photoUrl: string) {
  try {
    const item = await prisma.contractChecklistItem.findUnique({
      where: { id: taskId }
    })

    if (!item) return false

    const updated = await prisma.contractChecklistItem.update({
      where: { id: taskId },
      data: {
        photos: {
          push: photoUrl
        }
      }
    })

    return true
  } catch (error) {
    console.error('Error adding task photo:', error)
    return false
  }
}

export async function addTaskVideo(taskId: string, videoUrl: string) {
  try {
    const item = await prisma.contractChecklistItem.findUnique({
      where: { id: taskId }
    })

    if (!item) return false

    await prisma.contractChecklistItem.update({
      where: { id: taskId },
      data: {
        videos: {
          push: videoUrl
        }
      }
    })

    return true
  } catch (error) {
    console.error('Error adding task video:', error)
    return false
  }
}

export async function getTaskMedia(taskId: string) {
  try {
    const item = await prisma.contractChecklistItem.findUnique({
      where: { id: taskId },
      select: {
        photos: true,
        videos: true,
        name: true,
        remarks: true
      }
    })

    if (!item) return null

    return {
      taskId: taskId,
      name: item.name,
      remarks: item.remarks,
      photos: item.photos || [],
      videos: item.videos || [],
      photoCount: item.photos?.length || 0,
      videoCount: item.videos?.length || 0
    }
  } catch (error) {
    console.error('Error getting task media:', error)
    return null
  }
}

export async function deleteTaskMedia(taskId: string, mediaUrl: string, mediaType: 'photo' | 'video') {
  try {
    const item = await prisma.contractChecklistItem.findUnique({
      where: { id: taskId }
    })

    if (!item) return false

    if (mediaType === 'photo') {
      const updatedPhotos = item.photos.filter(photo => photo !== mediaUrl)
      await prisma.contractChecklistItem.update({
        where: { id: taskId },
        data: {
          photos: updatedPhotos
        }
      })
    } else {
      const updatedVideos = item.videos.filter(video => video !== mediaUrl)
      await prisma.contractChecklistItem.update({
        where: { id: taskId },
        data: {
          videos: updatedVideos
        }
      })
    }

    return true
  } catch (error) {
    console.error('Error deleting task media:', error)
    return false
  }
}

export async function getWorkOrderProgress(workOrderId: string) {
  try {
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
    })

    if (!workOrder?.contract.contractChecklist) {
      return {
        total_tasks: 0,
        completed_tasks: 0,
        pending_tasks: 0,
        in_progress_tasks: 0
      }
    }

    const items = workOrder.contract.contractChecklist.items
    const total = items.length
    const completed = items.filter(item => item.enteredOn !== null).length
    const pending = total - completed

    return {
      total_tasks: total,
      completed_tasks: completed,
      pending_tasks: pending,
      in_progress_tasks: 0
    }
  } catch (error) {
    console.error('Error fetching work order progress:', error)
    throw error
  }
}

export async function updateWorkOrderDetails(
  workOrderId: string, 
  updateType: 'customer' | 'address' | 'time' | 'status',
  newValue: string
) {
  try {
    switch (updateType) {
      case 'status':
        // Update work order status
        const statusMap: Record<string, WorkOrderStatus> = {
          'SCHEDULED': WorkOrderStatus.SCHEDULED,
          'STARTED': WorkOrderStatus.STARTED,
          'CANCELLED': WorkOrderStatus.CANCELLED,
          'COMPLETED': WorkOrderStatus.COMPLETED
        };
        
        await prisma.workOrder.update({
          where: { id: workOrderId },
          data: { 
            status: statusMap[newValue.toUpperCase()] || WorkOrderStatus.SCHEDULED
          }
        });
        break;
        
      case 'time':
        // Update scheduled time - handle various time formats
        const workOrderForTime = await prisma.workOrder.findUnique({
          where: { id: workOrderId }
        });
        
        if (!workOrderForTime) break;
        
        // Get the existing date
        const existingDate = new Date(workOrderForTime.scheduledStartDateTime);
        
        // Parse the time value (e.g., "10:00 am", "10am", "14:30")
        let hours = 0;
        let minutes = 0;
        
        // Remove extra spaces and convert to lowercase
        const timeStr = newValue.trim().toLowerCase();
        
        // Try to parse different time formats
        const timeMatch = timeStr.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm)?/);
        
        if (timeMatch) {
          hours = parseInt(timeMatch[1]);
          minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
          
          // Handle AM/PM
          if (timeMatch[3]) {
            if (timeMatch[3] === 'pm' && hours !== 12) {
              hours += 12;
            } else if (timeMatch[3] === 'am' && hours === 12) {
              hours = 0;
            }
          }
        }
        
        // Create new date with updated time
        const newDateTime = new Date(existingDate);
        newDateTime.setHours(hours, minutes, 0, 0);
        
        // Create end time (2 hours later)
        const endDateTime = new Date(newDateTime.getTime() + 2 * 60 * 60 * 1000);
        
        await prisma.workOrder.update({
          where: { id: workOrderId },
          data: { 
            scheduledStartDateTime: newDateTime,
            scheduledEndDateTime: endDateTime
          }
        });
        break;
        
      case 'customer':
        // Update customer name through the contract
        const workOrderForCustomer = await prisma.workOrder.findUnique({
          where: { id: workOrderId },
          include: { contract: true }
        });
        
        if (workOrderForCustomer) {
          await prisma.customer.update({
            where: { id: workOrderForCustomer.contract.customerId },
            data: { name: newValue }
          });
        }
        break;
        
      case 'address':
        // Update address through the contract
        const workOrderForAddress = await prisma.workOrder.findUnique({
          where: { id: workOrderId },
          include: { contract: true }
        });
        
        if (workOrderForAddress) {
          // Parse address and postal code
          const parts = newValue.split(',').map(p => p.trim());
          const address = parts[0] || newValue;
          const postalCode = parts[1] || '';
          
          await prisma.customerAddress.update({
            where: { id: workOrderForAddress.contract.addressId },
            data: { 
              address: address,
              postalCode: postalCode
            }
          });
        }
        break;
    }
    
    return true;
  } catch (error) {
    console.error('Error updating work order details:', error);
    return false;
  }
}