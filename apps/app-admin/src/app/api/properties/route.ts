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

