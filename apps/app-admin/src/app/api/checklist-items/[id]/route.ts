import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// PATCH /api/checklist-items/[id] - Update a contract checklist item (e.g., name/remarks)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { remarks, name, tasks, status, condition } = body as { remarks?: string; name?: string; tasks?: unknown; status?: string; condition?: string }

    const data: any = {}
    if (typeof remarks === 'string') data.remarks = remarks
    if (typeof name === 'string' && name.trim()) data.name = name

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

    const item = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.contractChecklistItem.update({
        where: { id },
        data
      })

      if (Array.isArray(tasks)) {
        const existingTasks = await tx.checklistTask.findMany({
          where: { itemId: id },
          select: { id: true, entries: { select: { id: true } } }
        } as any)

        const taskIdsToDelete = existingTasks
          .filter((task: any) => !Array.isArray(task.entries) || task.entries.length === 0)
          .map((task: any) => task.id)

        if (taskIdsToDelete.length > 0) {
          await tx.checklistTask.deleteMany({ where: { id: { in: taskIdsToDelete } } })
        }
        const parsedTasks = tasks.map((task: any, index: number) => {
          if (typeof task === 'string') {
            return {
              itemId: id,
              name: task,
              status: 'PENDING' as const,
              order: index
            }
          }
          const label = task?.task || task?.action || `Task ${index + 1}`
          const statusValue = typeof task?.status === 'string' && task.status.toLowerCase() === 'done'
            ? 'COMPLETED'
            : 'PENDING'
          return {
            itemId: id,
            name: label,
            status: statusValue as 'PENDING' | 'COMPLETED',
            order: index
          }
        })

        if (parsedTasks.length > 0) {
          await tx.checklistTask.createMany({
            data: parsedTasks.map(({ itemId, name, status }) => ({ itemId, name, status }))
          })
        } else {
          await tx.checklistTask.create({
            data: {
              itemId: id,
              name: updatedItem.name || 'Inspection task',
              status: 'PENDING'
            }
          })
        }
      }

      return updatedItem
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error('Error updating checklist item:', error)
    return NextResponse.json({ error: 'Failed to update checklist item' }, { status: 500 })
  }
}
