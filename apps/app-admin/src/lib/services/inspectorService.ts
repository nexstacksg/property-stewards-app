import { prisma } from '@/lib/prisma'
import { WorkOrderStatus, Status } from '@prisma/client'
import { cacheHelpers, CACHE_TTL, cache } from '@/lib/memory-cache'

export async function getInspectorByPhone(phone: string) {
  try {
    // Check cache first
    const cached = await cacheHelpers.getInspector(phone)
    if (cached) {
      console.log('✅ Returning cached inspector for:', phone)
      return cached
    }

    const inspector = await prisma.inspector.findUnique({
      where: {
        mobilePhone: phone,
        status: Status.ACTIVE
      }
    })
    
    // Cache the result
    if (inspector) {
      await cacheHelpers.setInspector(phone, inspector)
    }
    
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
    
    // Create cache key with date
    const dateKey = startOfDay.toISOString().split('T')[0]
    
    // Check cache first
    const cached = await cacheHelpers.getTodayJobs(inspectorId, dateKey)
    if (cached) {
      console.log('✅ Returning cached today jobs for inspector:', inspectorId)
      return cached
    }

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

    const jobs = workOrders.map(wo => ({
      id: wo.id,
      property_address: `${wo.contract.address.address}, ${wo.contract.address.postalCode}`,
      customer_name: wo.contract.customer.name,
      scheduled_date: wo.scheduledStartDateTime,
      inspection_type: `${wo.contract.address.propertyType} Inspection`,
      status: wo.status,
      priority: wo.status === WorkOrderStatus.STARTED ? 'high' : 'normal',
      notes: wo.remarks || ''
    }))
    
    // Cache the result using already defined dateKey
    await cacheHelpers.setTodayJobs(inspectorId, dateKey, jobs)
    
    return jobs
  } catch (error) {
    console.error('Error fetching today\'s jobs:', error)
    return []
  }
}

export async function getWorkOrderById(workOrderId: string) {
  try {
    // Check cache first
    const cached = await cacheHelpers.getWorkOrder(workOrderId)
    if (cached) {
      console.log('✅ Returning cached work order:', workOrderId)
      return cached
    }

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

    const result = {
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
    
    // Cache the result
    await cacheHelpers.setWorkOrder(workOrderId, result)
    
    return result
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

    // Only check actualStart if status is in_progress
    if (status === 'in_progress') {
      const wo = await prisma.workOrder.findUnique({ 
        where: { id: workOrderId }, 
        select: { actualStart: true } 
      })
      if (!wo?.actualStart) {
        updateData.actualStart = new Date()
      }
    }

    if (status === 'completed') {
      updateData.actualEnd = new Date()
    }

    const updated = await prisma.workOrder.update({
      where: { id: workOrderId },
      data: updateData
    })

    // Clear cache
    await cacheHelpers.clearWorkOrder(workOrderId)

    return updated
  } catch (error) {
    console.error('Error updating work order status:', error)
    return null
  }
}

export async function getDistinctLocationsForWorkOrder(workOrderId: string) {
  try {
    // Use cache from getLocationsWithCompletionStatus if available
    const cached = await cacheHelpers.getLocations(workOrderId)
    if (cached) {
      return [...new Set(cached.map((loc: any) => loc.name))]
    }

    // Only fetch the minimal data needed
    const items = await prisma.contractChecklistItem.findMany({
      where: {
        contractChecklist: {
          contract: {
            workOrders: {
              some: { id: workOrderId }
            }
          }
        }
      },
      select: { name: true },
      orderBy: { order: 'asc' }
    })

    const locations = [...new Set(items.map(item => item.name))]
    return locations
  } catch (error) {
    console.error('Error fetching locations:', error)
    return []
  }
}

export async function getLocationsWithCompletionStatus(workOrderId: string) {
  try {
    // Check cache first
    const cached = await cacheHelpers.getLocations(workOrderId)
    if (cached) {
      console.log('✅ Returning cached locations for work order:', workOrderId)
      return cached
    }

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

    // Optimize grouping with single pass
    const locationMap = new Map<string, { 
      total: number, 
      completed: number, 
      contractChecklistItemId: string 
    }>()
    
    // Single pass through items
    workOrder.contract.contractChecklist.items.forEach(item => {
      const locData = locationMap.get(item.name) || { 
        total: 0, 
        completed: 0, 
        contractChecklistItemId: item.id 
      }
      locData.total++
      if (item.enteredOn) locData.completed++
      locationMap.set(item.name, locData)
    })

    // Convert to array with completion status
    const locationsWithStatus = Array.from(locationMap.entries()).map(([name, data]) => ({
      name,
      displayName: data.completed === data.total && data.total > 0 ? `${name} (Done)` : name,
      isCompleted: data.completed === data.total && data.total > 0,
      totalTasks: data.total,
      completedTasks: data.completed,
      contractChecklistItemId: data.contractChecklistItemId
    }))

    // Cache the locations
    await cacheHelpers.setLocations(workOrderId, locationsWithStatus)

    return locationsWithStatus
  } catch (error) {
    console.error('Error fetching locations with status:', error)
    return []
  }
}

export async function getTasksByLocation(workOrderId: string, location: string) {
  try {
    // Create cache key for tasks
    const cacheKey = `tasks:${workOrderId}:${location}`
    const cachedTasks = cache.get(cacheKey)
    if (cachedTasks) {
      console.log('✅ Returning cached tasks for location:', location)
      return cachedTasks
    }

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

    // Get the first item for this location
    const checklistItem = workOrder.contract.contractChecklist.items[0] as any
    if (!checklistItem) {
      return []
    }

    // Parse tasks from JSON field if it exists
    if (checklistItem.tasks && Array.isArray(checklistItem.tasks)) {
      // Build task list efficiently
      const taskList = checklistItem.tasks.map((task: any, index: number) => ({
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
        locationEnteredOn: checklistItem.enteredOn
      }))
      
      // Cache and return
      cache.set(cacheKey, taskList, CACHE_TTL.LOCATIONS)
      return taskList
    }
    
    // Fallback to old behavior if no tasks JSON - treat remarks as single task
    const singleTask = [{
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
    
    // Cache the single task
    cache.set(cacheKey, singleTask, CACHE_TTL.LOCATIONS)
    return singleTask
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
      
      // Get item with minimal data
      const item = await prisma.contractChecklistItem.findUnique({
        where: { id: checklistItemId },
        select: { tasks: true }
      }) as any
      
      if (!item) return false
      
      // Update the specific task in the tasks array
      const tasks = item.tasks || []
      if (Array.isArray(tasks) && tasks[taskIndex] !== undefined) {
        tasks[taskIndex] = {
          ...tasks[taskIndex],
          status: status === 'completed' ? 'done' : 'pending'
        }
        
        // Build update data efficiently
        const updateData: any = { tasks }
        if (notes) updateData.remarks = notes
        
        // Update the item
        await prisma.contractChecklistItem.update({
          where: { id: checklistItemId },
          data: updateData
        })
        
        // Clear cache for this location
        cache.delPattern(`tasks:.*:.*`)
        
        return true
      }
      return false
    }
    
    // Original behavior for completing entire location
    const updateData: any = status === 'completed' 
      ? { enteredOn: new Date(), ...(notes && { remarks: notes }) }
      : { enteredOn: null, enteredById: null }

    // Update and get work order ID in single query
    const updated = await prisma.contractChecklistItem.update({
      where: { id: taskId },
      data: updateData,
      select: {
        name: true,
        contractChecklist: {
          select: {
            contract: {
              select: {
                workOrders: {
                  select: { id: true },
                  take: 1
                }
              }
            }
          }
        }
      }
    })
    
    // Clear caches if work order found
    const workOrderId = updated.contractChecklist?.contract?.workOrders?.[0]?.id
    if (workOrderId) {
      await cacheHelpers.clearWorkOrder(workOrderId)
      cache.del(`tasks:${workOrderId}:${updated.name}`)
    }

    return true
  } catch (error) {
    console.error('Error updating task status:', error)
    return false
  }
}

// Mark all tasks complete for a location
export async function completeAllTasksForLocation(workOrderId: string, location: string, inspectorId?: string) {
  try {
    // Get checklist item directly
    const checklistItem = await prisma.contractChecklistItem.findFirst({
      where: {
        name: location,
        contractChecklist: {
          contract: {
            workOrders: {
              some: { id: workOrderId }
            }
          }
        }
      },
      select: { id: true, tasks: true }
    }) as any

    if (!checklistItem) return false

    // Mark all tasks as done in single operation
    const tasks = Array.isArray(checklistItem.tasks) 
      ? checklistItem.tasks.map((task: any) => ({ ...task, status: 'done' }))
      : []

    // Update with all tasks complete
    await prisma.contractChecklistItem.update({
      where: { id: checklistItem.id },
      data: {
        tasks,
        enteredOn: new Date(),
        enteredById: inspectorId
      }
    })

    // Clear caches
    await cacheHelpers.clearWorkOrder(workOrderId)
    cache.del(`tasks:${workOrderId}:${location}`)

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

    await prisma.contractChecklistItem.update({
      where: { id: taskId },
      data: {
        photos: {
          push: photoUrl
        }
      }
    })
    
    // Clear media cache
    cache.del(`taskmedia:${taskId}`)

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

// Get ContractChecklistItem ID by location name
export async function getContractChecklistItemIdByLocation(workOrderId: string, location: string): Promise<string | null> {
  try {
    // Check cache first
    const cacheKey = `checklistitem:${workOrderId}:${location}`
    const cached = cache.get<string>(cacheKey)
    if (cached) return cached

    // Direct query for the checklist item
    const item = await prisma.contractChecklistItem.findFirst({
      where: {
        name: location,
        contractChecklist: {
          contract: {
            workOrders: {
              some: { id: workOrderId }
            }
          }
        }
      },
      select: { id: true }
    })

    if (item) {
      // Cache the result
      cache.set(cacheKey, item.id, CACHE_TTL.LOCATIONS)
      return item.id
    }
    
    return null
  } catch (error) {
    console.error('❌ Error finding ContractChecklistItem:', error);
    return null;
  }
}

export async function getTaskMedia(taskId: string) {
  try {
    console.log('🔍 getTaskMedia called with taskId:', taskId);
    
    // Handle virtual task IDs by extracting base checklist item ID
    let actualTaskId = taskId;
    if (taskId.includes('_task_')) {
      actualTaskId = taskId.split('_task_')[0];
      console.log('📝 Extracted base taskId from virtual ID:', actualTaskId);
    }
    
    // Check cache first
    const cached = await cacheHelpers.getTaskMedia(actualTaskId)
    if (cached) {
      console.log('✅ Returning cached task media for:', actualTaskId)
      // Return with original taskId for consistency
      return { ...cached, taskId }
    }
    
    console.log('🔍 Querying database for ContractChecklistItem with id:', actualTaskId);
    
    const item = await prisma.contractChecklistItem.findUnique({
      where: { id: actualTaskId }, // Use actual ID, not virtual ID
      select: {
        id: true,
        name: true,
        remarks: true,
        photos: true,
        videos: true,
        enteredOn: true,
        enteredById: true,
        contractChecklistId: true,
        order: true
      }
    })

    if (!item) return null;

    const result = {
      taskId: taskId, // Return original taskId for consistency
      name: item.name,
      remarks: item.remarks,
      photos: item.photos || [],
      videos: item.videos || [],
      photoCount: item.photos?.length || 0,
      videoCount: item.videos?.length || 0
    };

    // Cache the result (without taskId as it varies)
    const cacheData = { ...result }
    delete (cacheData as any).taskId
    await cacheHelpers.setTaskMedia(actualTaskId, cacheData)

    return result;
  } catch (error) {
    console.error('❌ Error getting task media:', error)
    return null
  }
}

export async function deleteTaskMedia(taskId: string, mediaUrl: string, mediaType: 'photo' | 'video') {
  try {
    // Get only the field we need
    const item = await prisma.contractChecklistItem.findUnique({
      where: { id: taskId },
      select: mediaType === 'photo' ? { photos: true } : { videos: true }
    }) as any

    if (!item) return false

    // Update in single operation
    const updateData = mediaType === 'photo'
      ? { photos: item.photos?.filter((photo: string) => photo !== mediaUrl) || [] }
      : { videos: item.videos?.filter((video: string) => video !== mediaUrl) || [] }

    await prisma.contractChecklistItem.update({
      where: { id: taskId },
      data: updateData
    })
    
    // Clear media cache
    cache.del(`taskmedia:${taskId}`)

    return true
  } catch (error) {
    console.error('Error deleting task media:', error)
    return false
  }
}

export async function getWorkOrderProgress(workOrderId: string) {
  try {
    // Check cache first
    const cacheKey = `progress:${workOrderId}`
    const cached = cache.get(cacheKey)
    if (cached) return cached

    // Only get the data we need
    const items = await prisma.contractChecklistItem.findMany({
      where: {
        contractChecklist: {
          contract: {
            workOrders: {
              some: { id: workOrderId }
            }
          }
        }
      },
      select: { enteredOn: true }
    })

    const total = items.length
    const completed = items.filter(item => item.enteredOn).length
    
    const result = {
      total_tasks: total,
      completed_tasks: completed,
      pending_tasks: total - completed,
      in_progress_tasks: 0
    }
    
    // Cache for short time since progress changes frequently
    cache.set(cacheKey, result, 30) // 30 seconds
    
    return result
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
        const status = newValue.toUpperCase() as keyof typeof WorkOrderStatus
        if (WorkOrderStatus[status]) {
          await prisma.workOrder.update({
            where: { id: workOrderId },
            data: { status: WorkOrderStatus[status] }
          })
          // Clear cache
          await cacheHelpers.clearWorkOrder(workOrderId)
        }
        break;
        
      case 'time':
        // Get existing work order date
        const wo = await prisma.workOrder.findUnique({
          where: { id: workOrderId },
          select: { scheduledStartDateTime: true }
        })
        if (!wo) break
        
        // Parse time efficiently
        const timeMatch = newValue.trim().toLowerCase().match(/(\d{1,2}):?(\d{0,2})\s*(am|pm)?/)
        if (!timeMatch) break
        
        let hours = parseInt(timeMatch[1])
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0
        
        // Handle AM/PM
        if (timeMatch[3] === 'pm' && hours !== 12) hours += 12
        else if (timeMatch[3] === 'am' && hours === 12) hours = 0
        
        // Create new date with updated time
        const newDateTime = new Date(wo.scheduledStartDateTime);
        newDateTime.setHours(hours, minutes, 0, 0);
        
        // Create end time (2 hours later)
        const endDateTime = new Date(newDateTime.getTime() + 2 * 60 * 60 * 1000);
        
        await prisma.workOrder.update({
          where: { id: workOrderId },
          data: { 
            scheduledStartDateTime: newDateTime,
            scheduledEndDateTime: endDateTime
          }
        })
        // Clear cache
        await cacheHelpers.clearWorkOrder(workOrderId)
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