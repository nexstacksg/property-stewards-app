import { prisma } from '@/lib/prisma'
import { cacheGetLargeArray } from '@/lib/memcache'
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

// Debug helper; set INSPECTOR_DEBUG=0 to silence
function debugLog(...args: any[]) {
  if (process.env.INSPECTOR_DEBUG === '0') return
  console.log('[inspectorService]', ...args)
}

// Optimized select fields to reduce data transfer
const INSPECTOR_SELECT = {
  id: true,
  name: true,
  mobilePhone: true,
  status: true
} as const


async function getCachedInspectors() {
  return (await cacheGetLargeArray<any>('mc:inspectors:all')) || null
}

async function getCachedWorkOrders() {
  return (await cacheGetLargeArray<any>('mc:work-orders:all')) || null
}


async function getCachedCustomers() {
  return (await cacheGetLargeArray<any>('mc:customers:all')) || null
}

async function getCachedAddresses() {
  return (await cacheGetLargeArray<any>('mc:customer-addresses:all')) || null
}

async function getCachedChecklistItems() {
  return (await cacheGetLargeArray<any>('mc:contract-checklist-items:all')) || null
}

export async function getInspectorByPhone(phone: string) {
  try {
    // Prefer MemCachier if available
    const inspectors = await getCachedInspectors()
    if (inspectors) {
      const found = inspectors.find((i: any) => i.mobilePhone === phone && i.status === 'ACTIVE')
      if (found) return found
    }

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
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0)
    const endOfDay = new Date(); endOfDay.setHours(23,59,59,999)

    const workOrders = await getCachedWorkOrders()
    if (!workOrders) {
      debugLog('getTodayJobsForInspector: workOrders cache missing')
      return []
    }
    debugLog('getTodayJobsForInspector: cached workOrders =', workOrders.length)
    const todays = workOrders
      .filter((wo: any) => wo.inspectorId === inspectorId && new Date(wo.scheduledStartDateTime) >= startOfDay && new Date(wo.scheduledStartDateTime) <= endOfDay)
      .sort((a: any, b: any) => new Date(a.scheduledStartDateTime).getTime() - new Date(b.scheduledStartDateTime).getTime())
    debugLog('getTodayJobsForInspector: todays =', todays.length, 'inspectorId=', inspectorId)

    return todays.map((wo: any) => ({
      id: wo.id,
      property_address: wo.address ? `${wo.address.address}, ${wo.address.postalCode}` : 'Unknown address',
      customer_name: wo.customer?.name || 'Unknown',
      scheduled_date: new Date(wo.scheduledStartDateTime),
      inspection_type: wo.address ? `${wo.address.propertyType} Inspection` : 'Inspection',
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
    const [workOrders, items, inspectors] = await Promise.all([
      getCachedWorkOrders(), getCachedChecklistItems(), getCachedInspectors()
    ])
    if (!workOrders) {
      debugLog('getWorkOrderById: workOrders cache missing')
      return null
    }
    const wo = workOrders.find((w: any) => w.id === workOrderId)
    if (!wo) {
      debugLog('getWorkOrderById: workOrder not found in cache', workOrderId)
      return null
    }
    const inspector = inspectors?.find((i: any) => i.id === wo.inspectorId)
    const relatedItems = (items || [])
      .filter((it: any) => Array.isArray(it.workOrderIds) && it.workOrderIds.includes(workOrderId))
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
    debugLog('getWorkOrderById: relatedItems length =', relatedItems.length)

    const addr = wo.address
    const customerName = wo.customer?.name

    return {
      id: wo.id,
      property_address: addr ? `${addr.address}, ${addr.postalCode}` : 'Unknown address',
      customer_name: customerName || 'Unknown',
      inspection_type: addr ? `${addr.propertyType} Inspection` : 'Inspection',
      status: wo.status,
      inspector_name: inspector?.name || 'Unknown',
      scheduled_start: new Date(wo.scheduledStartDateTime),
      scheduled_end: new Date(wo.scheduledEndDateTime),
      checklist_items: relatedItems
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

    // Cache-only: use precomputed workOrderIds index on items
    const itemsCache = await getCachedChecklistItems()
    if (itemsCache) {
      debugLog('getLocationsWithCompletionStatus: cache items =', itemsCache.length, 'workOrderId =', workOrderId)
      const items = itemsCache
        .filter((it: any) => Array.isArray(it.workOrderIds) && it.workOrderIds.includes(workOrderId))
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      debugLog('getLocationsWithCompletionStatus: matched items =', items.length)

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
    }

    // Cache required; no DB fallback
    debugLog('getLocationsWithCompletionStatus: no cache or no items matched for workOrderId =', workOrderId)
    return []
  } catch (error) {
    console.error('Error fetching locations with status:', error)
    return []
  }
}

export async function getTasksByLocation(workOrderId: string, location: string, contractChecklistItemId?: string) {
  try {
    const cacheKey = `tasks:${workOrderId}:${location}`
    const cached = locationCache.get(cacheKey)
    if (cached) return cached

    // Cache-only
    const itemsCache = await getCachedChecklistItems()
    let checklistItem: any = null
    if (itemsCache) {
      debugLog('getTasksByLocation: cache items =', itemsCache.length, 'workOrderId =', workOrderId, 'location =', location, 'itemId =', contractChecklistItemId)
      if (contractChecklistItemId) {
        checklistItem = itemsCache.find((it: any) => it.id === contractChecklistItemId)
        // sanity: ensure it belongs to the work order
        if (checklistItem && !(Array.isArray(checklistItem.workOrderIds) && checklistItem.workOrderIds.includes(workOrderId))) {
          debugLog('getTasksByLocation: provided itemId does not belong to workOrder')
          checklistItem = null
        }
      }
      if (!checklistItem) {
        checklistItem = itemsCache.find((it: any) => Array.isArray(it.workOrderIds) && it.workOrderIds.includes(workOrderId) && it.name === location)
      }
      debugLog('getTasksByLocation: found checklistItem =', Boolean(checklistItem), checklistItem ? { id: checklistItem.id, name: checklistItem.name } : null)
    }

    if (!checklistItem) {
      return []
    }

    let result
    if (checklistItem.tasks && typeof checklistItem.tasks === 'object') {
      const tasks = Array.isArray(checklistItem.tasks) ? checklistItem.tasks : []
      debugLog('getTasksByLocation: tasks length =', tasks.length)
      
      result = tasks.map((task: any, index: number) => ({
        id: `${checklistItem.id}_task_${index}`,
        location: checklistItem.name,
        action: typeof task === 'string' ? task : (task.task || task.action || 'Inspect area'),
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

    const itemsCache = await getCachedChecklistItems()
    let item: any = null
    if (itemsCache) {
      item = itemsCache.find((it: any) => Array.isArray(it.workOrderIds) && it.workOrderIds.includes(workOrderId) && it.name === location)
    }

    if (item) {
      const id = item.id || (item as any)?.id
      if (id) {
        locationCache.set(cacheKey, id)
        return id
      }
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
    if (taskId.includes('_task_')) actualTaskId = taskId.split('_task_')[0]

    // Try cache first
    const itemsCache = await getCachedChecklistItems()
    let item: any = null
    if (itemsCache) {
      item = itemsCache.find((it: any) => it.id === actualTaskId)
      debugLog('getTaskMedia: lookup id =', actualTaskId, 'found =', Boolean(item))
    }

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
    // Cache-only using items linked by workOrderIds
    const items = await getCachedChecklistItems()
    if (items) {
      const related = items.filter((it: any) => Array.isArray(it.workOrderIds) && it.workOrderIds.includes(workOrderId))
      const total = related.length
      const completed = related.filter((it: any) => it.enteredOn != null).length
      return {
        total_tasks: total,
        completed_tasks: completed,
        pending_tasks: total - completed,
        in_progress_tasks: 0
      }
    }
    // Cache required; no DB fallback
    return { total_tasks: 0, completed_tasks: 0, pending_tasks: 0, in_progress_tasks: 0 }
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
