import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { normalizePropertySize } from '@/lib/property-size'

// GET /api/property-sizes?type=HDB
// Returns size options for a given property type code
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')?.trim().toUpperCase()

    if (!type) {
      return NextResponse.json({ error: 'Missing type parameter' }, { status: 400 })
    }

    // Find options by related Property code
    const sizes = await (prisma as any).propertySizeOption.findMany({
      where: { property: { code: type }, status: 'ACTIVE' },
      select: { id: true, code: true, name: true },
      orderBy: [{ name: 'asc' }]
    })

    const seen = new Map<string, { id: string; code: string; name: string }>()

    for (const size of sizes) {
      try {
        const normalizedCode = normalizePropertySize(type, size.code)
        const candidate = { ...size, code: normalizedCode }
        const existing = seen.get(normalizedCode)

        if (!existing || size.code === normalizedCode) {
          seen.set(normalizedCode, candidate)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown property size error'
        console.warn(`Skipping property size option ${size.code}: ${message}`)
      }
    }

    return NextResponse.json(Array.from(seen.values()))
  } catch (e) {
    console.error('Error fetching property sizes:', e)
    return NextResponse.json({ error: 'Failed to fetch property sizes' }, { status: 500 })
  }
}

// POST /api/property-sizes - create a new size option for a property
// Body: { propertyCode: string; code: string; name: string }
export async function POST(request: Request) {
  try {
    const { propertyCode, code, name } = await request.json()

    if (!propertyCode || !code || !name) {
      return NextResponse.json({ error: 'propertyCode, code and name are required' }, { status: 400 })
    }

    const prop = await (prisma as any).property.findUnique({ where: { code: String(propertyCode).toUpperCase() } })
    if (!prop) {
      return NextResponse.json({ error: 'Property type not found' }, { status: 404 })
    }

    const payload = {
      propertyId: prop.id,
      code: String(code).trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_'),
      name: String(name).trim(),
      status: 'ACTIVE'
    }

    const created = await (prisma as any).propertySizeOption.upsert({
      where: { propertyId_code: { propertyId: payload.propertyId, code: payload.code } },
      update: { name: payload.name, status: payload.status },
      create: payload
    })

    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    console.error('Error creating property size:', e)
    return NextResponse.json({ error: 'Failed to create property size' }, { status: 500 })
  }
}
