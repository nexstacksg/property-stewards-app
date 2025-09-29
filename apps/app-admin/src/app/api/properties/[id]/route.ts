import { NextRequest, NextResponse } from 'next/server'

import prisma from '@/lib/prisma'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const property = await prisma.property.findUnique({
      where: { id },
      select: { id: true }
    })

    if (!property) {
      return NextResponse.json({ error: 'Property type not found' }, { status: 404 })
    }

    await prisma.property.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove property type', error)
    return NextResponse.json({ error: 'Failed to remove property type' }, { status: 500 })
  }
}
