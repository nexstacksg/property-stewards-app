import { prisma } from '@/lib/prisma'
import { cacheDel, cacheFlushAll, cacheGetJSON, cacheSetJSON, cacheSetLargeArray, getMemcacheClient } from '@/lib/memcache'
import { threadStore } from '@/lib/thread-store'

type WarmupResult = {
  ok: boolean
  skipped: boolean
  message: string
  keys?: string[]
}

export async function warmMemcacheAll(): Promise<{ ok: boolean; results: Record<string, WarmupResult> }> {
  const client = getMemcacheClient()
  if (!client) {
    return {
      ok: false,
      results: {
        all: {
          ok: false,
          skipped: true,
          message: 'MemCachier not configured (env vars missing)'
        }
      }
    }
  }

  // Default to 6 hours unless overridden
  const ttl = Number(process.env.MEMCACHE_DEFAULT_TTL ?? 21600)

  const results: Record<string, WarmupResult> = {}

  try {
    const flushed = await cacheFlushAll()
    results.cacheFlush = flushed
      ? { ok: true, skipped: false, message: 'Flushed entire Memcache store' }
      : { ok: false, skipped: false, message: 'Failed to flush Memcache store' }
  } catch (error) {
    results.cacheFlush = { ok: false, skipped: false, message: `Flush failed: ${(error as Error).message}` }
  }

  try {
    threadStore.clear()
    results.threadStore = { ok: true, skipped: false, message: 'Cleared in-memory OpenAI thread/session store' }
  } catch (error) {
    results.threadStore = { ok: false, skipped: false, message: `Failed to clear thread store: ${(error as Error).message}` }
  }

  const purgeKeyFamily = async (base: string) => {
    const client = getMemcacheClient()
    if (!client) return
    const seen = new Set<string>()

    const tryDelete = async (key: string) => {
      if (!key || seen.has(key)) return
      seen.add(key)
      try {
        await client.delete(key)
      } catch {}
    }

    await tryDelete(base)

    const indexKey = `${base}:index`
    let index: { keys?: string[] } | null = null
    try {
      index = await cacheGetJSON<{ keys?: string[] }>(indexKey)
    } catch (err) {
      console.error('[cache-warmup] failed to read index for', base, err)
    }

    if (index?.keys) {
      for (const key of index.keys) {
        await tryDelete(key)
      }
    }

    await tryDelete(indexKey)
  }

  // Fetch all datasets in parallel
  // Fetch enriched datasets for cache-only reads at runtime
  const [inspectors, workOrdersRaw, customers, customerAddresses, checklistItemsRaw] = await Promise.all([
    prisma.inspector.findMany({}),
    prisma.workOrder.findMany({
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
    }),
    prisma.customer.findMany({}),
    prisma.customerAddress.findMany({}),
    prisma.contractChecklistItem.findMany({
      select: {
        id: true,
        name: true,
        remarks: true,
        photos: true,
        videos: true,
        enteredOn: true,
        enteredById: true,
        status: true,
        condition:true,
        order: true,
        checklistTasks: {
          select: {
            id: true,
            name: true,
            status: true,
            condition: true,
            photos: true,
            videos: true,
            entries: { select: { id: true } }
          }
        },
        contributions: {
          select: {
            id: true,
            inspectorId: true,
            user: { select: { id: true, username: true, email: true } },
            remarks: true,
            includeInReport: true,
            condition: true,
            photos: true,
            videos: true,
            taskId: true,
            createdOn: true,
            updatedOn: true,
            inspector: { select: { id: true, name: true, mobilePhone: true } },
            task: {
              select: {
                id: true,
                name: true,
                status: true,
                condition: true,
                photos: true,
                videos: true
              }
            }
          }
        },
        contractChecklist: {
          select: {
            contract: {
              select: {
                workOrders: { select: { id: true } }
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
              orderBy: [
                { order: 'asc' },
                { createdOn: 'asc' }
              ],
              select: {
                id: true,
                name: true,
                status: true,
                condition: true,
                photos: true,
                videos: true
              }
            }
          }
        }
      },
      orderBy: { order: 'asc' }
    })
  ])

  // Enrich work orders to include customer/address summary for cache-only reads
  const workOrders = workOrdersRaw.map(wo => ({
    id: wo.id,
    inspectorId: Array.isArray(wo.inspectors) && wo.inspectors.length > 0 ? wo.inspectors[0].id : null,
    inspectorIds: Array.isArray(wo.inspectors) ? wo.inspectors.map((ins) => ins.id) : [],
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

  // Enrich checklist items to include all related workOrderIds (derived via contract relation)
  const checklistItems = checklistItemsRaw.map(it => ({
    id: it.id,
    name: it.name,
    remarks: it.remarks,
    photos: it.photos,
    videos: it.videos,
    enteredOn: it.enteredOn,
    enteredById: it.enteredById,
    order: it.order,
    checklistTasks: (it.checklistTasks || []).map(task => ({
      id: task.id,
      name: task.name,
      status: task.status,
      condition: task.condition,
      photos: task.photos,
      videos: task.videos,
      entryIds: (task.entries || []).map(entry => entry.id)
    })),
    locations: (it.locations || []).map(location => ({
      id: location.id,
      name: location.name,
      status: location.status,
      order: location.order,
      tasks: Array.isArray(location.tasks)
        ? location.tasks.map(task => ({
            id: task.id,
            name: task.name,
            status: task.status,
            condition: task.condition,
            photos: task.photos,
            videos: task.videos
          }))
        : []
    })),
    status: it.status,
    condition: it.condition,
    contributions: (it.contributions || []).map(entry => ({
      id: entry.id,
      inspectorId: entry.inspectorId,
      inspector: entry.inspector,
      user: entry.user,
      remarks: entry.remarks,
      includeInReport: entry.includeInReport,
      condition: entry.condition,
      photos: entry.photos,
      videos: entry.videos,
      taskId: entry.taskId,
      task: entry.task,
      createdOn: entry.createdOn,
      updatedOn: entry.updatedOn
    })),
    workOrderIds: it.contractChecklist.contract.workOrders.map(w => w.id)
  }))

  // Debug summary to verify cache data shape
  try {
    const itemsWithLinks = checklistItems.filter(i => Array.isArray(i.workOrderIds) && i.workOrderIds.length > 0).length
    const sample = checklistItems.slice(0, 5).map(i => ({ id: i.id, name: i.name, links: i.workOrderIds.length }))
    console.log('[cache-warmup] checklistItems total =', checklistItems.length, 'with workOrderIds =', itemsWithLinks, 'sample =', sample)
    const woSample = workOrders.slice(0, 3).map(w => ({ id: w.id, hasAddr: Boolean(w.address), hasCust: Boolean(w.customer) }))
    console.log('[cache-warmup] workOrders total =', workOrders.length, 'sample =', woSample)
  } catch {}

  // Helper to delete base and index keys so warmup always refreshes sets
  const delKeys = purgeKeyFamily

  // Inspectors
  try {
    const key = 'mc:inspectors:all'
    await delKeys(key)
    const { keys } = await cacheSetLargeArray(key, inspectors, undefined, { ttlSeconds: ttl })
    results.inspectors = { ok: true, skipped: false, message: `Cached ${inspectors.length} inspectors`, keys }
  } catch (e) {
    results.inspectors = { ok: false, skipped: false, message: `Failed: ${(e as Error).message}` }
  }

  // Work Orders (potentially large)
  try {
    const key = 'mc:work-orders:all'
    await delKeys(key)
    const { keys } = await cacheSetLargeArray(key, workOrders, undefined, { ttlSeconds: ttl })
    results.workOrders = { ok: true, skipped: false, message: `Cached ${workOrders.length} work orders`, keys }
  } catch (e) {
    results.workOrders = { ok: false, skipped: false, message: `Failed: ${(e as Error).message}` }
  }

  // Work Orders grouped by inspector for fast lookup
  try {
    const inspectorGroups = new Map<string, any[]>()
    for (const wo of workOrders) {
      const ids = Array.isArray(wo.inspectorIds) ? wo.inspectorIds : []
      for (const inspectorId of ids) {
        if (!inspectorId) continue
        if (!inspectorGroups.has(inspectorId)) inspectorGroups.set(inspectorId, [])
        inspectorGroups.get(inspectorId)!.push(wo)
      }
    }

    const storedInspectorKeys: string[] = []
    for (const [inspectorId, list] of inspectorGroups.entries()) {
      const inspectorKey = `mc:work-orders:inspector:${inspectorId}`
      const { keys } = await cacheSetLargeArray(inspectorKey, list, undefined, { ttlSeconds: ttl })
      storedInspectorKeys.push(inspectorKey, ...keys.filter(k => k !== inspectorKey))
    }

    results.workOrdersByInspector = {
      ok: true,
      skipped: false,
      message: `Cached work orders for ${inspectorGroups.size} inspectors`,
      keys: storedInspectorKeys.slice(0, 10) // store sample of keys for debugging
    }
  } catch (e) {
    results.workOrdersByInspector = { ok: false, skipped: false, message: `Failed to cache inspector work orders: ${(e as Error).message}` }
  }

  // Customers
  try {
    const key = 'mc:customers:all'
    await delKeys(key)
    const { keys } = await cacheSetLargeArray(key, customers, undefined, { ttlSeconds: ttl })
    results.customers = { ok: true, skipped: false, message: `Cached ${customers.length} customers`, keys }
  } catch (e) {
    results.customers = { ok: false, skipped: false, message: `Failed: ${(e as Error).message}` }
  }

  // Customer Addresses
  try {
    const key = 'mc:customer-addresses:all'
    await delKeys(key)
    const { keys } = await cacheSetLargeArray(key, customerAddresses, undefined, { ttlSeconds: ttl })
    results.customerAddresses = { ok: true, skipped: false, message: `Cached ${customerAddresses.length} addresses`, keys }
  } catch (e) {
    results.customerAddresses = { ok: false, skipped: false, message: `Failed: ${(e as Error).message}` }
  }

  // Contract Checklist Items (potentially large)
  try {
    const key = 'mc:contract-checklist-items:all'
    await delKeys(key)
    const { keys } = await cacheSetLargeArray(key, checklistItems, undefined, { ttlSeconds: ttl })
    results.contractChecklistItems = { ok: true, skipped: false, message: `Cached ${checklistItems.length} checklist items`, keys }
  } catch (e) {
    results.contractChecklistItems = { ok: false, skipped: false, message: `Failed: ${(e as Error).message}` }
  }

  try {
    const groupedByWorkOrder = new Map<string, any[]>()
    const groupedByItem = new Map<string, any>()

    for (const item of checklistItems) {
      groupedByItem.set(item.id, item)
      if (Array.isArray(item.workOrderIds)) {
        for (const woId of item.workOrderIds) {
          if (!groupedByWorkOrder.has(woId)) groupedByWorkOrder.set(woId, [])
          groupedByWorkOrder.get(woId)!.push(item)
        }
      }
    }

    const woKeys: string[] = []
    for (const [woId, itemsForWo] of groupedByWorkOrder.entries()) {
      const woKey = `mc:contract-checklist-items:workorder:${woId}`
      await delKeys(woKey)
      const { keys } = await cacheSetLargeArray(woKey, itemsForWo, undefined, { ttlSeconds: ttl })
      woKeys.push(woKey, ...keys.filter(k => k !== woKey))
    }

    const itemKeys: string[] = []
    for (const [itemId, itemData] of groupedByItem.entries()) {
      const itemKey = `mc:contract-checklist-items:item:${itemId}`
      await delKeys(itemKey)
      const { keys } = await cacheSetLargeArray(itemKey, [itemData], undefined, { ttlSeconds: ttl })
      itemKeys.push(itemKey, ...keys.filter(k => k !== itemKey))
    }

    results.contractChecklistItemsByWorkOrder = {
      ok: true,
      skipped: false,
      message: `Cached checklist items for ${groupedByWorkOrder.size} work orders`,
      keys: woKeys.slice(0, 10)
    }

    results.contractChecklistItemsByItem = {
      ok: true,
      skipped: false,
      message: `Cached checklist item detail keys for ${groupedByItem.size} items`,
      keys: itemKeys.slice(0, 10)
    }
  } catch (e) {
    results.contractChecklistItemsByWorkOrder = { ok: false, skipped: false, message: `Failed to cache checklist items by work order: ${(e as Error).message}` }
    results.contractChecklistItemsByItem = { ok: false, skipped: false, message: `Failed to cache checklist items by id: ${(e as Error).message}` }
  }

  // Clear assistant cache so a new assistant picks up latest instructions
  try {
    await cacheDel('assistant:id')
    await cacheDel('assistant:meta')
    results.assistant = { ok: true, skipped: false, message: 'Cleared assistant cache; next request will recreate assistant' }
  } catch (e) {
    results.assistant = { ok: false, skipped: false, message: `Failed to clear assistant cache: ${(e as Error).message}` }
  }

  
  // Write a manifest with counts and updatedAt
  try {
    await delKeys('mc:manifest:all')
    const manifest = {
      updatedAt: new Date().toISOString(),
      counts: {
        inspectors: inspectors.length,
        workOrders: workOrders.length,
        customers: customers.length,
        customerAddresses: customerAddresses.length,
        contractChecklistItems: checklistItems.length,
      }
    }
    await cacheSetJSON('mc:manifest:all', manifest, { ttlSeconds: ttl })
    results.manifest = { ok: true, skipped: false, message: 'Manifest written', keys: ['mc:manifest:all'] }
  } catch (e) {
    results.manifest = { ok: false, skipped: false, message: `Manifest failed: ${(e as Error).message}` }
  }

  const ok = Object.values(results).every(r => r.ok || r.skipped)
  return { ok, results }
}
