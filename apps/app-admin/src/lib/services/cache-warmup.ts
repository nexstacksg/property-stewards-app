import { prisma } from '@/lib/prisma'
import { cacheSetJSON, cacheSetLargeArray, getMemcacheClient } from '@/lib/memcache'

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

  const ttl = Number(process.env.MEMCACHE_DEFAULT_TTL ?? 600)

  const results: Record<string, WarmupResult> = {}

  // Fetch all datasets in parallel
  // Fetch enriched datasets for cache-only reads at runtime
  const [inspectors, workOrdersRaw, customers, customerAddresses, checklistItemsRaw] = await Promise.all([
    prisma.inspector.findMany({}),
    prisma.workOrder.findMany({
      select: {
        id: true,
        inspectorId: true,
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
        order: true,
        tasks: true,
        contractChecklist: {
          select: {
            contract: {
              select: {
                workOrders: { select: { id: true } }
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
    inspectorId: wo.inspectorId,
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
    tasks: it.tasks,
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

  // Inspectors
  try {
    const key = 'mc:inspectors:all'
    const { keys } = await cacheSetLargeArray(key, inspectors, undefined, { ttlSeconds: ttl })
    results.inspectors = { ok: true, skipped: false, message: `Cached ${inspectors.length} inspectors`, keys }
  } catch (e) {
    results.inspectors = { ok: false, skipped: false, message: `Failed: ${(e as Error).message}` }
  }

  // Work Orders (potentially large)
  try {
    const key = 'mc:work-orders:all'
    const { keys } = await cacheSetLargeArray(key, workOrders, undefined, { ttlSeconds: ttl })
    results.workOrders = { ok: true, skipped: false, message: `Cached ${workOrders.length} work orders`, keys }
  } catch (e) {
    results.workOrders = { ok: false, skipped: false, message: `Failed: ${(e as Error).message}` }
  }

  // Customers
  try {
    const key = 'mc:customers:all'
    const { keys } = await cacheSetLargeArray(key, customers, undefined, { ttlSeconds: ttl })
    results.customers = { ok: true, skipped: false, message: `Cached ${customers.length} customers`, keys }
  } catch (e) {
    results.customers = { ok: false, skipped: false, message: `Failed: ${(e as Error).message}` }
  }

  // Customer Addresses
  try {
    const key = 'mc:customer-addresses:all'
    const { keys } = await cacheSetLargeArray(key, customerAddresses, undefined, { ttlSeconds: ttl })
    results.customerAddresses = { ok: true, skipped: false, message: `Cached ${customerAddresses.length} addresses`, keys }
  } catch (e) {
    results.customerAddresses = { ok: false, skipped: false, message: `Failed: ${(e as Error).message}` }
  }

  // Contract Checklist Items (potentially large)
  try {
    const key = 'mc:contract-checklist-items:all'
    const { keys } = await cacheSetLargeArray(key, checklistItems, undefined, { ttlSeconds: ttl })
    results.contractChecklistItems = { ok: true, skipped: false, message: `Cached ${checklistItems.length} checklist items`, keys }
  } catch (e) {
    results.contractChecklistItems = { ok: false, skipped: false, message: `Failed: ${(e as Error).message}` }
  }


  // Write a manifest with counts and updatedAt
  try {
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
