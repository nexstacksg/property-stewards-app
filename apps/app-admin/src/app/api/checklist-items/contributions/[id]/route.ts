import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// PATCH update a contribution (remarks / includeInReport)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { remarks, includeInReport } = body as { remarks?: string; includeInReport?: boolean }

    const data: any = {}
    if (typeof remarks === 'string') data.remarks = remarks
    if (typeof includeInReport === 'boolean') data.includeInReport = includeInReport
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

    const updated = await prisma.itemEntry.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating contribution:', error)
    return NextResponse.json({ error: 'Failed to update contribution' }, { status: 500 })
  }
}
