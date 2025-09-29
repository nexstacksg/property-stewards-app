import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'Missing size identifier' }, { status: 400 })
    }

    const existing = await prisma.propertySizeOption.findUnique({
      where: { id },
      select: { id: true, status: true }
    })

    if (!existing) {
      return NextResponse.json({ error: 'Property size option not found' }, { status: 404 })
    }

    if (existing.status === 'INACTIVE') {
      return NextResponse.json({ success: true })
    }

    await prisma.propertySizeOption.update({
      where: { id },
      data: { status: 'INACTIVE' }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to archive property size option', error)
    return NextResponse.json({ error: 'Failed to remove property size option' }, { status: 500 })
  }
}
