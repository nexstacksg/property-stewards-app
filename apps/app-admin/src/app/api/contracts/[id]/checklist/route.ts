import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { parseActionIntoTasks } from '@/lib/utils/taskParser'

function toChecklistTaskPayload(action: string | undefined) {
  const parsed = parseActionIntoTasks(action ?? '')
  return parsed.length > 0
    ? parsed.map(task => ({
        name: task.task,
        status: task.status === 'done' ? 'COMPLETED' : 'PENDING',
      }))
    : []
}

// POST /api/contracts/[id]/checklist - Add a checklist to a contract
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const body = await request.json()
    const { templateId, items } = body as { templateId?: string, items?: Array<{ name: string; action?: string; order?: number }> }

    if (!templateId && (!items || items.length === 0)) {
      return NextResponse.json(
        { error: 'Provide either templateId or items' },
        { status: 400 }
      )
    }

    // Check if contract exists and doesn't already have a checklist
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { contractChecklist: true }
    })

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    if (contract.contractChecklist) {
      return NextResponse.json(
        { error: 'Contract already has a checklist' },
        { status: 400 }
      )
    }

    // Create the checklist in a transaction
    const contractChecklist = await prisma.$transaction(async (tx) => {
      // If templateId provided, store reference on contract
      if (templateId) {
        await tx.contract.update({
          where: { id: contractId },
          data: { basedOnChecklistId: templateId }
        })
      }

      // Create contract checklist
      const checklist = await tx.contractChecklist.create({
        data: {
          contractId
        }
      })

      // Determine source items: custom items (preferred) or template items
      let sourceItems: Array<{ name: string; action?: string; order?: number }> = []
      if (items && items.length > 0) {
        sourceItems = items
      } else if (templateId) {
        const template = await tx.checklist.findUnique({
          where: { id: templateId },
          include: { items: true }
        })
        if (!template) {
          throw new Error('Template not found')
        }
        sourceItems = template.items.map(it => ({ name: it.name, action: it.action, order: it.order }))
      }

      if (sourceItems.length > 0) {
        for (const [index, item] of sourceItems.entries()) {
          const tasks = toChecklistTaskPayload(item.action)
          await tx.contractChecklistItem.create({
            data: {
              contractChecklistId: checklist.id,
              name: item.name,
              order: item.order ?? index + 1,
              remarks: item.action ?? '',
              checklistTasks: tasks.length > 0 ? {
                create: tasks
              } : undefined
            }
          })
        }
      }

      return await tx.contractChecklist.findUnique({
        where: { id: checklist.id },
        include: {
          items: {
            orderBy: { order: 'asc' }
          }
        }
      })
    }, { timeout: 15000, maxWait: 10000 })

    return NextResponse.json(contractChecklist, { status: 201 })
  } catch (error) {
    console.error('Error adding checklist to contract:', error)
    return NextResponse.json(
      { error: 'Failed to add checklist' },
      { status: 500 }
    )
  }
}

// PUT /api/contracts/[id]/checklist - Replace or upsert checklist items for a contract
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const body = await request.json()
    const { templateId, items } = body as { templateId?: string, items?: Array<{ name: string; action?: string; order?: number }> }

    // Ensure contract exists
    const contract = await prisma.contract.findUnique({ where: { id: contractId } })
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    const updatedChecklist = await prisma.$transaction(async (tx) => {
      // Upsert checklist container
      let checklist = await tx.contractChecklist.findUnique({ where: { contractId } as any })
      if (!checklist) {
        checklist = await tx.contractChecklist.create({ data: { contractId } })
      }

      // Update contract reference to template if provided
      if (templateId) {
        await tx.contract.update({ where: { id: contractId }, data: { basedOnChecklistId: templateId } })
      }

      // Replace items if provided
      if (items && items.length > 0) {
        await tx.contractChecklistItem.deleteMany({ where: { contractChecklistId: checklist.id } })
        for (const [index, item] of items.entries()) {
          const tasks = toChecklistTaskPayload(item.action)
          await tx.contractChecklistItem.create({
            data: {
              contractChecklistId: checklist!.id,
              name: item.name,
              order: item.order ?? index + 1,
              remarks: item.action ?? '',
              checklistTasks: tasks.length > 0 ? {
                create: tasks
              } : undefined
            }
          })
        }
      }

      return await tx.contractChecklist.findUnique({
        where: { id: checklist.id },
        include: { items: { orderBy: { order: 'asc' } } }
      })
    }, { timeout: 15000, maxWait: 10000 })

    return NextResponse.json(updatedChecklist)
  } catch (error) {
    console.error('Error updating checklist for contract:', error)
    return NextResponse.json(
      { error: 'Failed to update checklist' },
      { status: 500 }
    )
  }
}
