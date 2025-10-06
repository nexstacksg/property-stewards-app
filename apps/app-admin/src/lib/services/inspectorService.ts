import { prisma } from '@/lib/prisma'
import { cacheGetLargeArray, cacheDel, cacheSetLargeArray } from '@/lib/memcache'
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

// Cache instances with unified 12-hour TTL
const inspectorCache = new SimpleCache(300) // 5 minutes for inspector data
const workOrderCache = new SimpleCache(60) // 1 minute for work orders
const locationCache = new SimpleCache(120) // 2 minutes for locations

const DEFAULT_TTL_SECONDS = Number(process.env.MEMCACHE_DEFAULT_TTL ?? 21600)

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
    // Compute today in Asia/Singapore (UTC+8) by default
    const tzOffsetHours = Number(process.env.LOCAL_TZ_OFFSET_HOURS ?? 8)
    const now = new Date()
    const sgNow = new Date(now.getTime() + tzOffsetHours * 60 * 60 * 1000)
    const sgStartLocal = new Date(Date.UTC(sgNow.getUTCFullYear(), sgNow.getUTCMonth(), sgNow.getUTCDate(), 0, 0, 0))
    const startOfDay = new Date(sgStartLocal.getTime() - tzOffsetHours * 60 * 60 * 1000)
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1)

    const workOrders = await getCachedWorkOrders()
    if (!workOrders) {
      debugLog('getTodayJobsForInspector: workOrders cache missing')
      return []
    }
    debugLog('getTodayJobsForInspector: cached workOrders =', workOrders.length)
    const todays = workOrders
      .filter((wo: any) => {
        if (wo.inspectorId !== inspectorId) return false

        const startRaw = wo.scheduledStartDateTime ? new Date(wo.scheduledStartDateTime) : null
        const endRaw = wo.scheduledEndDateTime ? new Date(wo.scheduledEndDateTime) : null

        if (!startRaw && !endRaw) return false

        const start = startRaw || endRaw
        const end = endRaw || startRaw

        if (!start || !end) return false

        // Normalize ordering
        const startTime = Math.min(start.getTime(), end.getTime())
        const endTime = Math.max(start.getTime(), end.getTime())

        return startTime <= endOfDay.getTime() && endTime >= startOfDay.getTime()
      })
      .sort((a: any, b: any) => {
        const aStart = a.scheduledStartDateTime ? new Date(a.scheduledStartDateTime) : (a.scheduledEndDateTime ? new Date(a.scheduledEndDateTime) : new Date(0))
        const bStart = b.scheduledStartDateTime ? new Date(b.scheduledStartDateTime) : (b.scheduledEndDateTime ? new Date(b.scheduledEndDateTime) : new Date(0))
        return aStart.getTime() - bStart.getTime()
      })
    debugLog('getTodayJobsForInspector: todays =', todays.length, 'inspectorId=', inspectorId)

    return todays.map((wo: any) => {
      const scheduledStart = wo.scheduledStartDateTime ? new Date(wo.scheduledStartDateTime) : null
      const scheduledEnd = wo.scheduledEndDateTime ? new Date(wo.scheduledEndDateTime) : null
      const primaryDate = scheduledStart || scheduledEnd || new Date()
      return {
        id: wo.id,
        property_address: wo.address ? `${wo.address.address}, ${wo.address.postalCode}` : 'Unknown address',
        customer_name: wo.customer?.name || 'Unknown',
        scheduled_date: primaryDate,
        scheduled_start: scheduledStart || null,
        scheduled_end: scheduledEnd || null,
        inspection_type: wo.address ? `${wo.address.propertyType} Inspection` : 'Inspection',
        status: wo.status,
        priority: wo.status === WorkOrderStatus.STARTED ? 'high' : 'normal',
      notes: wo.remarks || ''
    }
    })
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
    // Also invalidate Memcache collections to avoid stale results
    try { await cacheDel('mc:work-orders:all') } catch {}

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
    const items = await prisma.contractChecklistItem.findMany({
      where: {
        contractChecklist: {
          contract: { workOrders: { some: { id: workOrderId } } }
        }
      },
      select: {
        id: true,
        name: true,
        order: true,
        status: true,
        checklistTasks: {
          select: { id: true, status: true }
        },
        locations: {
          select: {
            id: true,
            name: true,
            status: true,
            order: true,
            tasks: {
              select: { id: true, status: true }
            }
          }
        }
      }
    })

    const sorted = items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    const result = sorted.map(item => {
      const hasLocations = Array.isArray(item.locations) && item.locations.length > 0
      const locationSummaries = hasLocations
        ? item.locations.map(loc => {
            const tasks = Array.isArray(loc.tasks) ? loc.tasks : []
            const totalTasks = tasks.length
            const completedTasks = tasks.filter(task => task.status === 'COMPLETED').length
            const isCompleted = loc.status === 'COMPLETED' || (totalTasks > 0 && completedTasks === totalTasks)
            return {
              id: loc.id,
              name: loc.name,
              order: loc.order ?? 0,
              status: isCompleted ? 'COMPLETED' : 'PENDING',
              totalTasks,
              completedTasks
            }
          })
        : []

      let totalTasks = 0
      let completedTasks = 0

      if (hasLocations) {
        for (const loc of locationSummaries) {
          totalTasks += loc.totalTasks
          completedTasks += loc.completedTasks
        }
      } else {
        const tasks = Array.isArray(item.checklistTasks) ? item.checklistTasks : []
        totalTasks = tasks.length || 1
        completedTasks = tasks.filter(task => task.status === 'COMPLETED').length
      }

      const isCompleted = hasLocations
        ? locationSummaries.length > 0 && locationSummaries.every(loc => loc.status === 'COMPLETED')
        : item.status === 'COMPLETED' || (totalTasks > 0 && completedTasks === totalTasks)

      return {
        id: item.id,
        name: item.name,
        displayName: isCompleted ? `${item.name} (Done)` : item.name,
        isCompleted,
        totalTasks,
        completedTasks,
        contractChecklistItemId: item.id,
        subLocations: locationSummaries.sort((a, b) => a.order - b.order)
      }
    })

    locationCache.set(`locations-status:${workOrderId}`, result)
    return result
  } catch (error) {
    console.error('Error fetching locations with status:', error)
    return []
  }
}

export async function getChecklistLocationsForItem(itemId: string) {
  try {
    const locations = await prisma.contractChecklistLocation.findMany({
      where: { itemId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        name: true,
        status: true,
        order: true,
        tasks: {
          select: { id: true, status: true }
        }
      }
    })

    return locations.map((loc, index) => {
      const tasks = Array.isArray(loc.tasks) ? loc.tasks : []
      const totalTasks = tasks.length
      const completedTasks = tasks.filter(task => task.status === 'COMPLETED').length
      return {
        id: loc.id,
        number: index + 1,
        name: loc.name,
        status: loc.status === 'COMPLETED' || (totalTasks > 0 && completedTasks === totalTasks) ? 'completed' : 'pending',
        totalTasks,
        completedTasks
      }
    })
  } catch (error) {
    console.error('Error fetching checklist locations:', error)
    return []
  }
}

type NormalisedTask = {
  id: string
  locationId: string | null
  locationName: string
  action: string
  status: 'completed' | 'pending'
  notes: string | null
  photos: string[]
  videos: string[]
  completed_at: Date | null
  completed_by: string | null
  isSubTask: boolean
  taskIndex: number
  locationStatus: 'completed' | 'pending'
}

export async function getTasksByLocation(workOrderId: string, location: string, contractChecklistItemId?: string, subLocationId?: string) {
  try {
    const item = await prisma.contractChecklistItem.findFirst({
      where: {
        OR: [
          { id: contractChecklistItemId || '' },
          {
            AND: [
              { name: location },
              { contractChecklist: { contract: { workOrders: { some: { id: workOrderId } } } } }
            ]
          }
        ]
      },
      select: {
        id: true,
        name: true,
        remarks: true,
        photos: true,
        videos: true,
        status: true,
        enteredOn: true,
        enteredById: true,
        checklistTasks: {
          orderBy: { createdOn: 'asc' },
          select: {
            id: true,
            name: true,
            status: true,
            inspectorId: true,
            photos: true,
            videos: true,
            updatedOn: true,
            entries: {
              select: {
                id: true,
                remarks: true
              }
            },
            location: {
              select: {
                id: true,
                name: true,
                status: true,
                order: true,
                tasks: {
                  select: { id: true }
                }
              }
            }
          }
        },
        locations: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            status: true,
            order: true,
            tasks: {
              orderBy: { createdOn: 'asc' },
              select: {
                id: true,
                name: true,
                status: true,
                inspectorId: true,
                photos: true,
                videos: true,
                updatedOn: true,
                entries: {
                  select: { remarks: true }
                }
              }
            }
          }
        }
      }
    }) as any

    if (!item) return []

    const flattenTasks = (): NormalisedTask[] => {
      const hasLocations = Array.isArray(item.locations) && item.locations.length > 0
      if (!hasLocations) {
        const tasks = Array.isArray(item.checklistTasks) ? item.checklistTasks : []
        if (tasks.length === 0) {
          return [{
            id: item.id,
            locationId: null,
            locationName: item.name,
            action: item.remarks || 'Inspect area',
            status: item.status === 'COMPLETED' ? 'completed' : 'pending',
            notes: item.remarks,
            photos: item.photos ?? [],
            videos: item.videos ?? [],
            completed_at: item.enteredOn ?? null,
            completed_by: item.enteredById ?? null,
            isSubTask: false,
            taskIndex: 0,
            locationStatus: item.status === 'COMPLETED' ? 'completed' : 'pending'
          }]
        }

        return tasks.map((task: any, index: number) => ({
          id: task.id,
          locationId: null,
          locationName: item.name,
          action: task.name || `Task ${index + 1}`,
          status: task.status === 'COMPLETED' ? 'completed' : 'pending',
          notes: (task.entries?.[0]?.remarks as string | undefined) || item.remarks || null,
          photos: task.photos ?? [],
          videos: task.videos ?? [],
          completed_at: task.updatedOn,
          completed_by: task.inspectorId,
          isSubTask: true,
          taskIndex: index,
          locationStatus: item.status === 'COMPLETED' ? 'completed' : 'pending'
        }))
      }

      const output: NormalisedTask[] = []
      let taskIndex = 0
      const orderedLocations = [...item.locations].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))

      const filterBySubLocation = subLocationId && subLocationId.trim().length > 0

      for (const loc of orderedLocations) {
        if (filterBySubLocation && loc.id !== subLocationId) continue
        const tasks = Array.isArray(loc.tasks) ? loc.tasks : []
        if (tasks.length === 0) {
          output.push({
            id: loc.id,
            locationId: loc.id,
            locationName: loc.name,
            action: loc.name,
            status: loc.status === 'COMPLETED' ? 'completed' : 'pending',
            notes: null,
            photos: [],
            videos: [],
            completed_at: null,
            completed_by: null,
            isSubTask: false,
            taskIndex: taskIndex++,
            locationStatus: loc.status === 'COMPLETED' ? 'completed' : 'pending'
          })
          continue
        }

        const locationCompleted = loc.status === 'COMPLETED' || tasks.every((t: any) => t.status === 'COMPLETED')

        for (const task of tasks) {
          output.push({
            id: task.id,
            locationId: loc.id,
            locationName: loc.name,
            action: task.name || `${loc.name} task ${taskIndex + 1}`,
            status: task.status === 'COMPLETED' ? 'completed' : 'pending',
            notes: (task.entries?.[0]?.remarks as string | undefined) || null,
            photos: task.photos ?? [],
            videos: task.videos ?? [],
            completed_at: task.updatedOn,
            completed_by: task.inspectorId,
            isSubTask: true,
            taskIndex: taskIndex++,
            locationStatus: locationCompleted ? 'completed' : 'pending'
          })
        }
      }

      return output
    }

    return flattenTasks()
  } catch (error) {
    console.error('Error fetching tasks by location:', error)
    return []
  }
}

export async function updateTaskStatus(taskId: string, status: 'completed' | 'pending', notes?: string) {
  try {
    const existingTask = await prisma.checklistTask.findUnique({
      where: { id: taskId },
      select: { id: true, itemId: true }
    })

    if (!existingTask) {
      const updateData: Prisma.ContractChecklistItemUpdateInput = {
        status: status === 'completed' ? 'COMPLETED' : 'PENDING',
        enteredOn: status === 'completed' ? new Date() : null
      }
      if (notes) updateData.remarks = notes

      await prisma.contractChecklistItem.update({
        where: { id: taskId },
        data: updateData
      })

      locationCache.invalidate(taskId)
      try { await cacheDel('mc:contract-checklist-items:all') } catch {}
      return true
    }

    const task = await prisma.checklistTask.update({
      where: { id: taskId },
      data: {
        status: status === 'completed' ? 'COMPLETED' : 'PENDING',
        updatedOn: new Date()
      },
      select: {
        id: true,
        itemId: true
      }
    })

    if (notes) {
      await prisma.contractChecklistItem.update({
        where: { id: task.itemId },
        data: { remarks: notes }
      })
    }

    const remaining = await prisma.checklistTask.count({
      where: {
        itemId: task.itemId,
        status: { not: 'COMPLETED' }
      }
    })

    await prisma.contractChecklistItem.update({
      where: { id: task.itemId },
      data: {
        status: remaining === 0 ? 'COMPLETED' : 'PENDING',
        enteredOn: remaining === 0 ? new Date() : null
      }
    })

    // Invalidate cache
    locationCache.invalidate(task.itemId)
    try { await cacheDel('mc:contract-checklist-items:all') } catch {}
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
        checklistTasks: {
          select: { id: true }
        },
        locations: {
          select: {
            id: true,
            tasks: {
              select: { id: true }
            }
          }
        },
        enteredById: true
      },
      take: 1
    })

    const checklistItem = items[0] as any
    if (!checklistItem) {
      return false
    }

    await prisma.$transaction(async tx => {
      await tx.checklistTask.updateMany({
        where: { itemId: checklistItem.id },
        data: {
          status: 'COMPLETED',
          condition: 'GOOD',
          updatedOn: new Date()
        }
      })

      if (Array.isArray(checklistItem.locations) && checklistItem.locations.length > 0) {
        const locationIds = checklistItem.locations.map((loc: any) => loc.id)
        if (locationIds.length > 0) {
          await tx.contractChecklistLocation.updateMany({
            where: { id: { in: locationIds } },
            data: {
              status: 'COMPLETED',
              updatedOn: new Date()
            }
          })
        }
      }

      await tx.contractChecklistItem.update({
        where: { id: checklistItem.id },
        data: {
          enteredOn: new Date(),
          enteredById: inspectorId || checklistItem.enteredById,
          status: 'COMPLETED',
          condition: 'GOOD'
        }
      })
    })

    // Invalidate cache
    locationCache.invalidate(workOrderId)
    locationCache.invalidate(checklistItem.id)
    try { await cacheDel('mc:contract-checklist-items:all') } catch {}
    return true
  } catch (error) {
    console.error('Error completing all tasks for location:', error)
    return false
  }
}

export async function addTaskPhoto(taskId: string, photoUrl: string) {
  try {
    const task = await prisma.checklistTask.findUnique({
      where: { id: taskId },
      select: { id: true, itemId: true, photos: true }
    })

    if (task) {
      await prisma.checklistTask.update({
        where: { id: taskId },
        data: {
          photos: {
            push: photoUrl
          }
        }
      })
      locationCache.invalidate(task.itemId)
    } else {
      await prisma.contractChecklistItem.update({
        where: { id: taskId },
        data: {
          photos: {
            push: photoUrl
          }
        }
      })
      locationCache.invalidate(taskId)
    }

    try { await cacheDel('mc:contract-checklist-items:all') } catch {}
    return true
  } catch (error) {
    console.error('Error adding task photo:', error)
    return false
  }
}

export async function addTaskVideo(taskId: string, videoUrl: string) {
  try {
    const task = await prisma.checklistTask.findUnique({
      where: { id: taskId },
      select: { id: true, itemId: true, videos: true }
    })

    if (task) {
      await prisma.checklistTask.update({
        where: { id: taskId },
        data: {
          videos: {
            push: videoUrl
          }
        }
      })
      locationCache.invalidate(task.itemId)
    } else {
      await prisma.contractChecklistItem.update({
        where: { id: taskId },
        data: {
          videos: {
            push: videoUrl
          }
        }
      })
      locationCache.invalidate(taskId)
    }

    try { await cacheDel('mc:contract-checklist-items:all') } catch {}
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
    
    const dbItem = await prisma.contractChecklistItem.findFirst({
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

    if (dbItem?.id) {
      locationCache.set(cacheKey, dbItem.id)
      return dbItem.id
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

    // Try cache first
    const itemsCache = await getCachedChecklistItems()
    let item: any = null
    let task: any = null

    if (itemsCache) {
      for (const it of itemsCache) {
        if (it.id === taskId) {
          item = it
          break
        }
        if (Array.isArray(it.checklistTasks)) {
          const match = it.checklistTasks.find((t: any) => t.id === taskId)
          if (match) {
            item = it
            task = match
            break
          }
        }
      }
    }

    if (!item) {
      const dbTask = await prisma.checklistTask.findUnique({
        where: { id: taskId },
        include: {
          item: true,
          entries: {
            select: { id: true, remarks: true }
          }
        }
      }) as any
      if (dbTask) {
        task = dbTask
        item = dbTask.item
      }
    }

    if (!item) {
      item = await prisma.contractChecklistItem.findUnique({
        where: { id: taskId },
        include: {
          checklistTasks: true
        }
      }) as any
    }

    if (!item) {
      return null
    }

    const photos = task ? task.photos || [] : item.photos || []
    const videos = task ? task.videos || [] : item.videos || []
    const name = task ? task.name : item.name
    const remarks = (task?.entries && task.entries[0]?.remarks) || item.remarks

    const result = {
      taskId,
      name,
      remarks,
      photos,
      videos,
      photoCount: photos.length,
      videoCount: videos.length
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
    try { await cacheDel('mc:contract-checklist-items:all') } catch {}
    return true
  } catch (error) {
    console.error('Error deleting task media:', error)
    return false
  }
}

export async function getWorkOrderProgress(workOrderId: string) {
  try {
    const items = await prisma.contractChecklistItem.findMany({
      where: { contractChecklist: { contract: { workOrders: { some: { id: workOrderId } } } } },
      select: { status: true }
    })
    const total = items.length
    const completed = items.filter(i => i.status === 'COMPLETED').length
    return {
      total_tasks: total,
      completed_tasks: completed,
      pending_tasks: total - completed,
      in_progress_tasks: 0
    }
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
    try { await cacheDel('mc:work-orders:all') } catch {}
    if (updateType === 'customer' || updateType === 'address') {
      try { await cacheDel('mc:customers:all') } catch {}
      try { await cacheDel('mc:customer-addresses:all') } catch {}
    }

    // Refresh affected cache datasets so assistants don't see empty lists
    try {
      await refreshWorkOrdersCache()
      if (updateType === 'customer' || updateType === 'address') {
        await Promise.all([
          updateType === 'customer' ? refreshCustomersCache() : Promise.resolve(),
          refreshCustomerAddressesCache()
        ])
      } else if (updateType === 'status' || updateType === 'time') {
        // no additional datasets beyond work orders
      }
    } catch (error) {
      console.error('Error refreshing caches after work order update:', error)
    }

    return true
  } catch (error) {
    console.error('Error updating work order details:', error)
    return false
  }
}

async function refreshWorkOrdersCache() {
  const workOrdersRaw = await prisma.workOrder.findMany({
    select: {
      id: true,
      inspectors: { select: { id: true } },
      contractId: true,
      status: true,
      scheduledStartDateTime: true,
      scheduledEndDateTime: true,
      remarks: true,
      contract: {
        select: {
          customer: { select: { id: true, name: true } },
          address: { select: { id: true, address: true, postalCode: true, propertyType: true } }
        }
      }
    }
  })

  const workOrders = workOrdersRaw.map(wo => ({
    id: wo.id,
    inspectorId: Array.isArray(wo.inspectors) && wo.inspectors.length > 0 ? wo.inspectors[0].id : null,
    inspectorIds: Array.isArray(wo.inspectors) ? wo.inspectors.map(ins => ins.id) : [],
    contractId: wo.contractId,
    status: wo.status,
    scheduledStartDateTime: wo.scheduledStartDateTime,
    scheduledEndDateTime: wo.scheduledEndDateTime,
    remarks: wo.remarks,
    customer: wo.contract?.customer ? { id: wo.contract.customer.id, name: wo.contract.customer.name } : null,
    address: wo.contract?.address ? {
      id: wo.contract.address.id,
      address: wo.contract.address.address,
      postalCode: wo.contract.address.postalCode,
      propertyType: wo.contract.address.propertyType
    } : null
  }))

  await cacheSetLargeArray('mc:work-orders:all', workOrders, undefined, { ttlSeconds: DEFAULT_TTL_SECONDS })
}

async function refreshCustomersCache() {
  const customers = await prisma.customer.findMany({})
  await cacheSetLargeArray('mc:customers:all', customers, undefined, { ttlSeconds: DEFAULT_TTL_SECONDS })
}

async function refreshCustomerAddressesCache() {
  const addresses = await prisma.customerAddress.findMany({})
  await cacheSetLargeArray('mc:customer-addresses:all', addresses, undefined, { ttlSeconds: DEFAULT_TTL_SECONDS })
}
