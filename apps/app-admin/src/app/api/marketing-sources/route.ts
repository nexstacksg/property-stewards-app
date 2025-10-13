import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/marketing-sources - return active marketing sources
export async function GET() {
  try {
    const rows = await prisma.marketingSource.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, status: true }
    })
    return NextResponse.json({ sources: rows })
  } catch (e) {
    console.error('Error fetching marketing sources:', e)
    return NextResponse.json({ error: 'Failed to fetch marketing sources' }, { status: 500 })
  }
}

// POST /api/marketing-sources - create a new marketing source
// Body: { code: string; name: string }
export async function POST(request: NextRequest) {
  try {
    const { code, name } = await request.json()
    if (!code || !name) {
      return NextResponse.json({ error: 'Code and name are required' }, { status: 400 })
    }

    const payload = {
      code: String(code).trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_'),
      name: String(name).trim(),
      status: 'ACTIVE' as const,
    }

    const created = await prisma.marketingSource.upsert({
      where: { code: payload.code },
      update: { name: payload.name, status: payload.status },
      create: payload,
      select: { id: true, code: true, name: true, status: true }
    })

    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    console.error('Error creating marketing source:', e)
    const msg = e?.message?.includes('Unique') ? 'Code already exists' : 'Failed to create marketing source'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

