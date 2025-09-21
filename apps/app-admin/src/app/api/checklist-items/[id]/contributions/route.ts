import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET list contributions for a checklist item (with inspector)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const contributions = await prisma.itemEntry.findMany({
      where: { itemId: id },
      include: { inspector: true, tasks: true },
      orderBy: { createdOn: 'asc' }
    })
    return NextResponse.json({ contributions })
  } catch (error) {
    console.error('Error listing contributions:', error)
    return NextResponse.json({ error: 'Failed to list contributions' }, { status: 500 })
  }
}

// POST upsert contribution for inspector for this item
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { inspectorId, remarks } = body as { inspectorId: string; remarks?: string }
    if (!inspectorId) return NextResponse.json({ error: 'inspectorId required' }, { status: 400 })
    
    // Ensure item and inspector exist (lightweight checks)
    const [item, inspector] = await Promise.all([
      prisma.contractChecklistItem.findUnique({ where: { id } }),
      prisma.inspector.findUnique({ where: { id: inspectorId } })
    ])
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    if (!inspector) return NextResponse.json({ error: 'Inspector not found' }, { status: 404 })

    const contribution = await prisma.itemEntry.upsert({
      where: { itemId_inspectorId: { itemId: id, inspectorId } },
      update: { remarks },
      create: { itemId: id, inspectorId, remarks }
    })
    return NextResponse.json(contribution)
  } catch (error) {
    console.error('Error upserting contribution:', error)
    return NextResponse.json({ error: 'Failed to upsert contribution' }, { status: 500 })
  }
}
