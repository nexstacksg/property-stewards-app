import { NextRequest, NextResponse } from 'next/server'
import { cacheGetLargeArray } from '@/lib/memcache'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const workOrderId = url.searchParams.get('workOrderId') || undefined

    // Pull known datasets from MemCachier
    const [inspectors, workOrders, customers, addresses, items] = await Promise.all([
      cacheGetLargeArray<any>('mc:inspectors:all'),
      cacheGetLargeArray<any>('mc:work-orders:all'),
      cacheGetLargeArray<any>('mc:customers:all'),
      cacheGetLargeArray<any>('mc:customer-addresses:all'),
      cacheGetLargeArray<any>('mc:contract-checklist-items:all'),
    ])

    // Summaries
    const counts = {
      inspectors: inspectors?.length || 0,
      workOrders: workOrders?.length || 0,
      customers: customers?.length || 0,
      addresses: addresses?.length || 0,
      checklistItems: items?.length || 0,
    }

    const result: any = { ok: true, counts }

    // Verify mapping for a specific work order
    if (workOrderId) {
      const itemsForWO = (items || []).filter((it: any) => Array.isArray(it.workOrderIds) && it.workOrderIds.includes(workOrderId))
      result.workOrder = {
        id: workOrderId,
        items: itemsForWO.length,
        locations: itemsForWO.slice(0, 50).map((it: any) => ({ id: it.id, name: it.name, hasTasks: Array.isArray(it.tasks) })),
        note: itemsForWO.length > 50 ? 'trimmed to 50' : undefined,
      }
    } else {
      // Global coverage sample: top 10 workOrders with item counts
      const byWO = new Map<string, number>()
      for (const it of items || []) {
        for (const wo of (it.workOrderIds || [])) {
          byWO.set(wo, (byWO.get(wo) || 0) + 1)
        }
      }
      const coverage = Array.from(byWO.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([wo, n]) => ({ workOrderId: wo, checklistItems: n }))
      result.coverageSample = coverage
    }

    // Quick shape checks
    result.shape = {
      workOrdersEnriched: !!(workOrders && workOrders[0] && (workOrders[0].customer || workOrders[0].address)),
      itemsHaveWorkOrderIds: !!(items && items[0] && Array.isArray(items[0].workOrderIds)),
    }

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

