import { prisma } from '@/lib/prisma'
import { WorkOrderStatus, Status, Prisma } from '@prisma/client'

// Simple in-memory cache with TTL
class SimpleCache<T> {
  private cache = new Map<string, { data: T; expiry: number }>()
  private readonly ttl: number

  constructor(ttlSeconds: number = 60) {
    this.ttl = ttlSeconds * 1000
  }

  get(key: string): T | null {
    const item = this.cache.get(key)
    if (!item) return null
    if (Date.now() > item.expiry) {
      this.cache.delete(key)
      return null
    }
    return item.data
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.ttl
    })
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      return
    }
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }
}

// Cache instances with different TTLs
const inspectorCache = new SimpleCache(300) // 5 minutes for inspector data
const workOrderCache = new SimpleCache(60) // 1 minute for work orders
const locationCache = new SimpleCache(120) // 2 minutes for locations

// Optimized select fields to reduce data transfer
const INSPECTOR_SELECT = {
  id: true,
  name: true,
  mobilePhone: true,
  status: true
} as const


export async function getInspectorByPhone(phone: string) {
  try {
    const cacheKey = `inspector:${phone}`
    const cached = inspectorCache.get(cacheKey)
    if (cached) return cached

    const inspector = await prisma.inspector.findUnique({
      where: {
        mobilePhone: phone,
        status: Status.ACTIVE
      },
      select: INSPECTOR_SELECT
    })
    
    if (inspector) {
      inspectorCache.set(cacheKey, inspector)
    }
    return inspector
  } catch (error) {
    console.error('Error fetching inspector by phone:', error)
    return null
  }
}

export async function getTodayJobsForInspector(inspectorId: string) {
  try {
    // NO CACHING for work orders - they need to be real-time
    // const cacheKey = `jobs:${inspectorId}:${new Date().toDateString()}`
    // const cached = workOrderCache.get(cacheKey)
    // if (cached) return cached

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    // Optimized query with only necessary fields
    const workOrders = await prisma.workOrder.findMany({
      where: {
        inspectorId: inspectorId,
        scheduledStartDateTime: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      select: {
        id: true,
        status: true,
        scheduledStartDateTime: true,
        remarks: true,
        contract: {
          select: {
            customer: {
              select: { name: true }
            },
            address: {
              select: { 
                address: true, 
                postalCode: true,
                propertyType: true
              }
            }
          }
        }
      },
      orderBy: {
        scheduledStartDateTime: 'asc'
      }
    })

    const result = workOrders.map(wo => ({
      id: wo.id,
      property_address: `${wo.contract.address.address}, ${wo.contract.address.postalCode}`,
      customer_name: wo.contract.customer.name,
      scheduled_date: wo.scheduledStartDateTime,
      inspection_type: `${wo.contract.address.propertyType} Inspection`,
      status: wo.status,
      priority: wo.status === WorkOrderStatus.STARTED ? 'high' : 'normal',
      notes: wo.remarks || ''
    }))

    // NO CACHING - work orders must be real-time
    // workOrderCache.set(cacheKey, result)
    return result
  } catch (error) {
    console.error('Error fetching today\'s jobs:', error)
    return []
  }
}

export async function getWorkOrderById(workOrderId: string) {
  try {
    // NO CACHING - work orders must be real-time
    // const cacheKey = `wo:${workOrderId}`
    // const cached = workOrderCache.get(cacheKey)
    // if (cached) return cached

    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        status: true,
        scheduledStartDateTime: true,
        scheduledEndDateTime: true,
        contract: {
          select: {
            customer: {
              select: { name: true }
            },
            address: {
              select: {
                address: true,
                postalCode: true,
                propertyType: true
              }
            },
            contractChecklist: {
              select: {
                items: {
                  select: {
                    id: true,
                    name: true,
                    order: true,
                    enteredOn: true,
                    remarks: true,
                    photos: true,
                    videos: true,
                    tasks: true
                  },
                  orderBy: { order: 'asc' }
                }
              }
            }
          }
        },
        inspector: {
          select: { name: true }
        }
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

    // NO CACHING - work orders must be real-time
    // workOrderCache.set(cacheKey, result)
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

    // Single query to check and update
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { actualStart: true }
    })

    const updateData: Prisma.WorkOrderUpdateInput = {
      status: statusMap[status]
    }

    if (status === 'in_progress' && !workOrder?.actualStart) {
      updateData.actualStart = new Date()
    }

    if (status === 'completed') {
      updateData.actualEnd = new Date()
    }

    const updated = await prisma.workOrder.update({
      where: { id: workOrderId },
      data: updateData
    })

    // Invalidate relevant caches
    workOrderCache.invalidate(workOrderId)
    locationCache.invalidate(workOrderId)

    return updated
  } catch (error) {
    console.error('Error updating work order status:', error)
    return null
  }
}

export async function getDistinctLocationsForWorkOrder(workOrderId: string) {
  try {
    const cacheKey = `locations:${workOrderId}`
    const cached = locationCache.get(cacheKey)
    if (cached) return cached

    // Optimized query - only fetch names
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
      distinct: ['name']
    })

    const locations = items.map(item => item.name)
    locationCache.set(cacheKey, locations)
    return locations
  } catch (error) {
    console.error('Error fetching locations:', error)
    return []
  }
}

export async function getLocationsWithCompletionStatus(workOrderId: string) {
  try {
    const cacheKey = `locations-status:${workOrderId}`
    const cached = locationCache.get(cacheKey)
    if (cached) return cached

    // Single optimized query
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
      select: {
        id: true,
        name: true,
        enteredOn: true,
        tasks: true
      },
      orderBy: { order: 'asc' }
    })

    // Process with Map for O(n) complexity
    const locationMap = new Map<string, {
      total: number
      completed: number
      contractChecklistItemId: string
    }>()
    
    for (const item of items) {
      const location = item.name
      if (!locationMap.has(location)) {
        locationMap.set(location, {
          total: 0,
          completed: 0,
          contractChecklistItemId: item.id
        })
      }
      const locData = locationMap.get(location)!
      locData.total++
      if (item.enteredOn !== null) {
        locData.completed++
      }
    }

    const locationsWithStatus = Array.from(locationMap.entries()).map(([name, data]) => {
      const isCompleted = data.completed === data.total && data.total > 0
      return {
        name,
        displayName: isCompleted ? `${name} (Done)` : name,
        isCompleted,
        totalTasks: data.total,
        completedTasks: data.completed,
        contractChecklistItemId: data.contractChecklistItemId
      }
    })

    locationCache.set(cacheKey, locationsWithStatus)
    return locationsWithStatus
  } catch (error) {
    console.error('Error fetching locations with status:', error)
    return []
  }
}

export async function getTasksByLocation(workOrderId: string, location: string) {
  try {
    const cacheKey = `tasks:${workOrderId}:${location}`
    const cached = locationCache.get(cacheKey)
    if (cached) return cached

    // Direct query without nested includes
    const items = await prisma.contractChecklistItem.findMany({
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
      select: {
        id: true,
        name: true,
        remarks: true,
        photos: true,
        videos: true,
        enteredOn: true,
        enteredById: true,
        tasks: true
      },
      orderBy: { order: 'asc' },
      take: 1 // Only get first item since there should be one per location
    })

    const checklistItem = items[0] as any
    if (!checklistItem) {
      return []
    }

    let result
    if (checklistItem.tasks && typeof checklistItem.tasks === 'object') {
      const tasks = Array.isArray(checklistItem.tasks) ? checklistItem.tasks : []
      
      result = tasks.map((task: any, index: number) => ({
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
    } else {
      result = [{
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
    }

    locationCache.set(cacheKey, result)
    return result
  } catch (error) {
    console.error('Error fetching tasks by location:', error)
    return []
  }
}

export async function updateTaskStatus(taskId: string, status: 'completed' | 'pending', notes?: string) {
  try {
    // Handle subtask updates
    if (taskId.includes('_task_')) {
      const [checklistItemId, , taskIndexStr] = taskId.split('_')
      const taskIndex = parseInt(taskIndexStr)
      
      const item = await prisma.contractChecklistItem.findUnique({
        where: { id: checklistItemId },
        select: { tasks: true }
      }) as any
      
      if (!item) return false
      
      let tasks = item.tasks || []
      if (Array.isArray(tasks) && tasks[taskIndex]) {
        tasks[taskIndex] = {
          ...tasks[taskIndex],
          status: status === 'completed' ? 'done' : 'pending'
        }
        
        const updateData: any = { tasks }
        if (notes) {
          updateData.remarks = notes
        }
        
        await prisma.contractChecklistItem.update({
          where: { id: checklistItemId },
          data: updateData
        })
        
        // Invalidate cache
        locationCache.invalidate(checklistItemId)
        return true
      }
      return false
    }
    
    // Update entire location
    const updateData: Prisma.ContractChecklistItemUpdateInput = {}
    
    if (status === 'completed') {
      updateData.enteredOn = new Date()
      if (notes) {
        updateData.remarks = notes
      }
    } else {
      updateData.enteredOn = null
    }

    await prisma.contractChecklistItem.update({
      where: { id: taskId },
      data: updateData
    })

    // Invalidate cache
    locationCache.invalidate(taskId)
    return true
  } catch (error) {
    console.error('Error updating task status:', error)
    return false
  }
}

export async function completeAllTasksForLocation(workOrderId: string, location: string, inspectorId?: string) {
  try {
    // Direct query without nested includes
    const items = await prisma.contractChecklistItem.findMany({
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
      select: {
        id: true,
        tasks: true,
        enteredById: true
      },
      take: 1
    })

    const checklistItem = items[0] as any
    if (!checklistItem) {
      return false
    }

    let tasks = checklistItem.tasks || []
    if (Array.isArray(tasks)) {
      tasks = tasks.map((task: any) => ({
        ...task,
        status: 'done'
      }))
    }

    await prisma.contractChecklistItem.update({
      where: { id: checklistItem.id },
      data: {
        tasks: tasks,
        enteredOn: new Date(),
        enteredById: inspectorId || checklistItem.enteredById
      }
    })

    // Invalidate cache
    locationCache.invalidate(workOrderId)
    return true
  } catch (error) {
    console.error('Error completing all tasks for location:', error)
    return false
  }
}

export async function addTaskPhoto(taskId: string, photoUrl: string) {
  try {
    await prisma.contractChecklistItem.update({
      where: { id: taskId },
      data: {
        photos: {
          push: photoUrl
        }
      }
    })

    locationCache.invalidate(taskId)
    return true
  } catch (error) {
    console.error('Error adding task photo:', error)
    return false
  }
}

export async function addTaskVideo(taskId: string, videoUrl: string) {
  try {
    await prisma.contractChecklistItem.update({
      where: { id: taskId },
      data: {
        videos: {
          push: videoUrl
        }
      }
    })

    locationCache.invalidate(taskId)
    return true
  } catch (error) {
    console.error('Error adding task video:', error)
    return false
  }
}

export async function getContractChecklistItemIdByLocation(workOrderId: string, location: string): Promise<string | null> {
  try {
    const cacheKey = `itemid:${workOrderId}:${location}`
    const cached = locationCache.get(cacheKey)
    if (cached) return cached as string

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
      locationCache.set(cacheKey, item.id)
      return item.id
    }
    
    return null
  } catch (error) {
    console.error('Error finding ContractChecklistItem:', error)
    return null
  }
}

export async function getTaskMedia(taskId: string) {
  try {
    const cacheKey = `media:${taskId}`
    const cached = locationCache.get(cacheKey)
    if (cached) return cached

    let actualTaskId = taskId
    if (taskId.includes('_task_')) {
      actualTaskId = taskId.split('_task_')[0]
    }
    
    const item = await prisma.contractChecklistItem.findUnique({
      where: { id: actualTaskId },
      select: {
        id: true,
        name: true,
        remarks: true,
        photos: true,
        videos: true
      }
    })

    if (!item) {
      return null
    }

    const result = {
      taskId: taskId,
      name: item.name,
      remarks: item.remarks,
      photos: item.photos || [],
      videos: item.videos || [],
      photoCount: item.photos?.length || 0,
      videoCount: item.videos?.length || 0
    }

    locationCache.set(cacheKey, result)
    return result
  } catch (error) {
    console.error('Error getting task media:', error)
    return null
  }
}

export async function deleteTaskMedia(taskId: string, mediaUrl: string, mediaType: 'photo' | 'video') {
  try {
    const item = await prisma.contractChecklistItem.findUnique({
      where: { id: taskId },
      select: {
        photos: true,
        videos: true
      }
    })

    if (!item) return false

    if (mediaType === 'photo') {
      const updatedPhotos = item.photos.filter(photo => photo !== mediaUrl)
      await prisma.contractChecklistItem.update({
        where: { id: taskId },
        data: { photos: updatedPhotos }
      })
    } else {
      const updatedVideos = item.videos.filter(video => video !== mediaUrl)
      await prisma.contractChecklistItem.update({
        where: { id: taskId },
        data: { videos: updatedVideos }
      })
    }

    locationCache.invalidate(taskId)
    return true
  } catch (error) {
    console.error('Error deleting task media:', error)
    return false
  }
}

export async function getWorkOrderProgress(workOrderId: string) {
  try {
    // NO CACHING - work orders must be real-time
    // const cacheKey = `progress:${workOrderId}`
    // const cached = workOrderCache.get(cacheKey)
    // if (cached) return cached

    // Optimized aggregation query
    const result = await prisma.contractChecklistItem.aggregate({
      where: {
        contractChecklist: {
          contract: {
            workOrders: {
              some: { id: workOrderId }
            }
          }
        }
      },
      _count: {
        _all: true,
        enteredOn: true
      }
    })

    const progress = {
      total_tasks: result._count._all || 0,
      completed_tasks: result._count.enteredOn || 0,
      pending_tasks: (result._count._all || 0) - (result._count.enteredOn || 0),
      in_progress_tasks: 0
    }

    // NO CACHING - work orders must be real-time
    // workOrderCache.set(cacheKey, progress)
    return progress
  } catch (error) {
    console.error('Error fetching work order progress:', error)
    return {
      total_tasks: 0,
      completed_tasks: 0,
      pending_tasks: 0,
      in_progress_tasks: 0
    }
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
        const statusMap: Record<string, WorkOrderStatus> = {
          'SCHEDULED': WorkOrderStatus.SCHEDULED,
          'STARTED': WorkOrderStatus.STARTED,
          'CANCELLED': WorkOrderStatus.CANCELLED,
          'COMPLETED': WorkOrderStatus.COMPLETED
        }
        
        await prisma.workOrder.update({
          where: { id: workOrderId },
          data: { 
            status: statusMap[newValue.toUpperCase()] || WorkOrderStatus.SCHEDULED
          }
        })
        break
        
      case 'time':
        const workOrder = await prisma.workOrder.findUnique({
          where: { id: workOrderId },
          select: { scheduledStartDateTime: true }
        })
        
        if (!workOrder) break
        
        const existingDate = new Date(workOrder.scheduledStartDateTime)
        const timeStr = newValue.trim().toLowerCase()
        const timeMatch = timeStr.match(/(\d{1,2}):?(\d{0,2})\s*(am|pm)?/)
        
        if (timeMatch) {
          let hours = parseInt(timeMatch[1])
          const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0
          
          if (timeMatch[3]) {
            if (timeMatch[3] === 'pm' && hours !== 12) {
              hours += 12
            } else if (timeMatch[3] === 'am' && hours === 12) {
              hours = 0
            }
          }
          
          const newDateTime = new Date(existingDate)
          newDateTime.setHours(hours, minutes, 0, 0)
          const endDateTime = new Date(newDateTime.getTime() + 2 * 60 * 60 * 1000)
          
          await prisma.workOrder.update({
            where: { id: workOrderId },
            data: { 
              scheduledStartDateTime: newDateTime,
              scheduledEndDateTime: endDateTime
            }
          })
        }
        break
        
      case 'customer':
        const customerData = await prisma.workOrder.findUnique({
          where: { id: workOrderId },
          select: {
            contract: {
              select: { customerId: true }
            }
          }
        })
        
        if (customerData) {
          await prisma.customer.update({
            where: { id: customerData.contract.customerId },
            data: { name: newValue }
          })
        }
        break
        
      case 'address':
        const addressData = await prisma.workOrder.findUnique({
          where: { id: workOrderId },
          select: {
            contract: {
              select: { addressId: true }
            }
          }
        })
        
        if (addressData) {
          const parts = newValue.split(',').map(p => p.trim())
          await prisma.customerAddress.update({
            where: { id: addressData.contract.addressId },
            data: { 
              address: parts[0] || newValue,
              postalCode: parts[1] || ''
            }
          })
        }
        break
    }
    
    // Invalidate caches
    workOrderCache.invalidate(workOrderId)
    locationCache.invalidate(workOrderId)
    
    return true
  } catch (error) {
    console.error('Error updating work order details:', error)
    return false
  }
}