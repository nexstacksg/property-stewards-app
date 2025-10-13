import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PROPERTY_SIZE_RANGE_OPTIONS } from '@/lib/property-address'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toList() {
  return PROPERTY_SIZE_RANGE_OPTIONS.map((opt, idx) => ({ code: opt.value, label: opt.label, order: idx }))
}

export async function GET() {
  try {
    // Prefer DB-managed options; fall back to static list
    const rows = await prisma.propertySizeRangeOption.findMany({
      where: { status: 'ACTIVE' as any },
      orderBy: [{ order: 'asc' }, { updatedOn: 'desc' }],
      select: { code: true, label: true, order: true },
    }).catch(() => [])

    if (Array.isArray(rows) && rows.length > 0) {
      return NextResponse.json({ options: rows })
    }
    return NextResponse.json({ options: toList() })
  } catch (error) {
    return NextResponse.json({ options: toList() })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { code?: string; label?: string; order?: number; status?: 'ACTIVE' | 'INACTIVE' }
    const rawCode = String(body.code || '').trim().toUpperCase()
    const label = String(body.label || '').trim()
    const order = Number.isFinite(body.order) ? Number(body.order) : 0
    const status = body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'

    if (!rawCode || !label) {
      return NextResponse.json({ error: 'code and label are required' }, { status: 400 })
    }

    const saved = await prisma.propertySizeRangeOption.upsert({
      where: { code: rawCode as any },
      update: { label, order, status: status as any },
      create: { code: rawCode as any, label, order, status: status as any },
      select: { code: true, label: true, order: true, status: true },
    })
    return NextResponse.json(saved, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save size range option' }, { status: 500 })
  }
}
