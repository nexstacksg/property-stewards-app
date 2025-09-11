import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// PATCH /api/checklist-items/[id] - Update a contract checklist item (e.g., name/remarks)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { remarks, name, tasks, status, condition } = body as { remarks?: string; name?: string; tasks?: unknown; status?: string; condition?: string }

    const data: any = {}
    if (typeof remarks === 'string') data.remarks = remarks
    if (typeof name === 'string' && name.trim()) data.name = name
    if (typeof tasks !== 'undefined') data.tasks = tasks

    // Status
    if (typeof status === 'string') {
      const upper = status.toUpperCase()
      if (upper === 'PENDING' || upper === 'COMPLETED') {
        (data as any).status = upper
      }
    }
    // Condition
    if (typeof condition === 'string') {
      const upper = condition.toUpperCase().replace(/\s|-/g, '_')
      ;(data as any).condition = upper
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
    }

    const item = await prisma.contractChecklistItem.update({
      where: { id },
      data
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error('Error updating checklist item:', error)
    return NextResponse.json({ error: 'Failed to update checklist item' }, { status: 500 })
  }
}
