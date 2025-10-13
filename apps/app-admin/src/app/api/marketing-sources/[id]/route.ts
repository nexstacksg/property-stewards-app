import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// DELETE /api/marketing-sources/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const row = await prisma.marketingSource.findUnique({ where: { id } })
    if (!row) {
      return NextResponse.json({ error: 'Marketing source not found' }, { status: 404 })
    }

    await prisma.marketingSource.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Failed to remove marketing source', e)
    return NextResponse.json({ error: 'Failed to remove marketing source' }, { status: 500 })
  }
}

