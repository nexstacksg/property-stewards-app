import { NextRequest, NextResponse } from 'next/server'

import prisma from '@/lib/prisma'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const size = await prisma.propertySizeOption.findUnique({
      where: { id },
      select: { id: true }
    })

    if (!size) {
      return NextResponse.json({ error: 'Size option not found' }, { status: 404 })
    }

    await prisma.propertySizeOption.update({
      where: { id },
      data: { status: 'INACTIVE' }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove property size option', error)
    return NextResponse.json({ error: 'Failed to remove property size option' }, { status: 500 })
  }
}
