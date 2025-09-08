import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/properties - return active property types
export async function GET() {
  try {
    const props = await (prisma as any).property.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' }
    })
    return NextResponse.json(props)
  } catch (e) {
    console.error('Error fetching properties:', e)
    return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 })
  }
}

// POST /api/properties - create a new property type
export async function POST(request: Request) {
  try {
    const { name, code } = await request.json()
    if (!name || !code) {
      return NextResponse.json({ error: 'Name and code are required' }, { status: 400 })
    }
    const payload = {
      name: String(name).trim(),
      code: String(code).trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_')
    }

    // Prefer Prisma model; fall back to raw query if needed
    let created: any = null
    try {
      created = await (prisma as any).property.create({ data: { ...payload, status: 'ACTIVE' } })
    } catch (err) {
      // Unique constraint fallback handling using raw
      const rows = await prisma.$queryRawUnsafe<any[]>(
        'INSERT INTO "Property" (id, code, name, status, "createdOn", "updatedOn") VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW()) RETURNING id, code, name, status, "createdOn", "updatedOn"',
        payload.code,
        payload.name,
        'ACTIVE'
      )
      created = rows?.[0]
    }

    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    const msg = e?.message?.includes('Unique constraint') ? 'Code already exists' : 'Failed to create property'
    console.error('Error creating property:', e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
