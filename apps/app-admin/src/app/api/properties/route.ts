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
    const body = await request.json()
    const { name, code, sizeCodes, sizes } = body || {}
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

    // Optionally create related size options
    const toPretty = (raw: string) => {
      const c = String(raw).toUpperCase()
      // HDB patterns
      const m = c.match(/^HDB_(\d)_ROOM$/)
      if (m) return `${m[1]} Room`
      if (c === 'HDB_EXECUTIVE') return 'Executive'
      if (c === 'HDB_JUMBO') return 'Jumbo'
      // Apartment patterns
      if (c === 'STUDIO') return 'Studio'
      if (c === 'ONE_BEDROOM') return '1 Bedroom'
      if (c === 'TWO_BEDROOM') return '2 Bedroom'
      if (c === 'THREE_BEDROOM') return '3 Bedroom'
      if (c === 'FOUR_BEDROOM') return '4 Bedroom'
      if (c === 'PENTHOUSE') return 'Penthouse'
      // Landed patterns
      if (c === 'TERRACE') return 'Terrace'
      if (c === 'SEMI_DETACHED') return 'Semi-Detached'
      if (c === 'DETACHED') return 'Detached'
      if (c === 'BUNGALOW') return 'Bungalow'
      if (c === 'GOOD_CLASS_BUNGALOW') return 'Good Class Bungalow'
      // Fallback: Title Case
      return c.split('_').map(s => s.charAt(0) + s.slice(1).toLowerCase()).join(' ')
    }

    const list: Array<{ code: string; name: string }> = Array.isArray(sizes)
      ? sizes
      : Array.isArray(sizeCodes)
        ? sizeCodes.map((c: string) => ({ code: String(c), name: toPretty(String(c)) }))
        : []

    if (list.length > 0) {
      const toCreate = list.map((s) => ({
        propertyId: created.id,
        code: String(s.code).toUpperCase().replace(/[^A-Z0-9_]+/g, '_'),
        name: String(s.name)
      }))
      for (const s of toCreate) {
        try {
          await (prisma as any).propertySizeOption.upsert({
            where: { propertyId_code: { propertyId: created.id, code: s.code } },
            update: { name: s.name, status: 'ACTIVE' },
            create: { ...s, status: 'ACTIVE' }
          })
        } catch {
          // ignore per-item errors to avoid failing the whole request
        }
      }
    }

    return NextResponse.json(created, { status: 201 })
  } catch (e: any) {
    const msg = e?.message?.includes('Unique constraint') ? 'Code already exists' : 'Failed to create property'
    console.error('Error creating property:', e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
