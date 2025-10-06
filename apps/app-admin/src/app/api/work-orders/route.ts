import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { parseActionIntoTasks } from '@/lib/utils/taskParser'
import type { Task as ParsedTask } from '@/lib/utils/taskParser'

type TaskSeed = {
  itemId: string
  name: string
  tasks?: ParsedTask[]
}

async function ensureTasksForItem(itemId: string, name: string, tasks?: ParsedTask[]) {
  const taskDelegate = (prisma as any).checklistTask
  if (!taskDelegate) {
    throw new Error('ChecklistTask model not available. Run `pnpm prisma generate` after updating the schema.')
  }

  const existingTasks = await taskDelegate.count({ where: { itemId } })
  if (existingTasks > 0) {
    return
  }

  const parsed = Array.isArray(tasks) && tasks.length > 0
    ? tasks
    : [{ task: name || 'Inspect area', status: 'pending' as const }]

  await Promise.all(parsed.map((task) => taskDelegate.create({
    data: {
      itemId,
      name: task.task,
      status: task.status === 'done' ? 'COMPLETED' : 'PENDING'
    }
  })))
}

// GET /api/work-orders - Get all work orders
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const inspectorId = searchParams.get('inspectorId')
    const contractId = searchParams.get('contractId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const skip = (page - 1) * limit

    const where: any = {}
    
    if (status) {
      // Handle multiple statuses (comma-separated)
      if (status.includes(',')) {
        where.status = { in: status.split(',') }
      } else {
        where.status = status
      }
    }
    
    if (inspectorId) {
      where.inspectors = { some: { id: inspectorId } }
    }
    
    if (contractId) {
      where.contractId = contractId
    }
    
    if (startDate || endDate) {
      where.scheduledStartDateTime = {}
      if (startDate) {
        where.scheduledStartDateTime.gte = new Date(startDate)
      }
      if (endDate) {
        where.scheduledStartDateTime.lte = new Date(endDate)
      }
    }

    const trimmedSearch = search?.trim()
    if (trimmedSearch) {
      const like = { contains: trimmedSearch, mode: 'insensitive' as const }
      where.OR = [
        { id: like },
        { contract: { customer: { name: like } } },
        { contract: { address: { address: like } } },
        { inspectors: { some: { name: like } } }
      ]
    }

    const [workOrders, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        include: {
          contract: {
            include: {
              customer: true,
              address: true
            }
          },
          inspectors: true
        },
        orderBy: { scheduledStartDateTime: 'desc' },
        skip,
        take: limit
      }),
      prisma.workOrder.count({ where })
    ])

    return NextResponse.json({
      workOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching work orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch work orders' },
      { status: 500 }
    )
  }
}

// POST /api/work-orders - Create a new work order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      contractId,
      inspectorIds,
      scheduledStartDateTime,
      scheduledEndDateTime,
      remarks
    } = body

    // Validate required fields
    if (!contractId || !scheduledStartDateTime || !scheduledEndDateTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    if (!Array.isArray(inspectorIds) || inspectorIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one inspector is required' },
        { status: 400 }
      )
    }

    // Verify contract and inspector exist, include checklist info
    const [contract, inspectors] = await Promise.all([
      prisma.contract.findUnique({ 
        where: { id: contractId },
        include: {
          contractChecklist: true,
          basedOnChecklist: {
            include: {
              items: true
            }
          }
        }
      }),
      prisma.inspector.findMany({ where: { id: { in: inspectorIds } } })
    ])

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    if (!inspectors || inspectors.length !== inspectorIds.length) {
      return NextResponse.json(
        { error: 'One or more inspectors not found' },
        { status: 404 }
      )
    }
    const inactive = inspectors.find(i => i.status !== 'ACTIVE')
    if (inactive) {
      return NextResponse.json(
        { error: `Inspector ${inactive.name} is not active` },
        { status: 400 }
      )
    }

    // Check for scheduling conflicts for the inspector
    const conflictingWorkOrder = await prisma.workOrder.findFirst({
      where: {
        status: { in: ['SCHEDULED', 'STARTED'] },
        inspectors: { some: { id: { in: inspectorIds } } },
        OR: [
          {
            AND: [
              { scheduledStartDateTime: { lte: new Date(scheduledStartDateTime) } },
              { scheduledEndDateTime: { gte: new Date(scheduledStartDateTime) } },
              { scheduledStartDateTime: { gte: new Date(scheduledStartDateTime) } }

            ]
          },

        ]
      }
    })

    if (conflictingWorkOrder) {
      return NextResponse.json(
        { error: 'Inspector has a scheduling conflict' },
        { status: 400 }
      )
    }

    // Precompute checklist items outside of transaction to avoid timeouts
    const itemsFromTemplate = (!contract.contractChecklist && contract.basedOnChecklist?.items?.length)
      ? contract.basedOnChecklist.items.map(item => ({
          name: item.name,
          order: item.order,
          remarks: item.action,
          tasks: parseActionIntoTasks(item.action)
        }))
      : []

    const taskSeedQueue: TaskSeed[] = []

    // Create work order in a transaction (with extended timeout)
    const transactionResult = await prisma.$transaction(async (tx) => {
      // First, ensure contract checklist exists
      let contractChecklist = contract.contractChecklist
      
      if (!contractChecklist && contract.basedOnChecklist) {
        contractChecklist = await tx.contractChecklist.create({
          data: {
            contractId
          }
        })

        if (itemsFromTemplate.length > 0 && contractChecklist) {
          for (const templateItem of itemsFromTemplate) {
            const createdItem = await tx.contractChecklistItem.create({
              data: {
                contractChecklistId: contractChecklist.id,
                name: templateItem.name,
                remarks: templateItem.remarks,
                order: templateItem.order,
              }
            })
            taskSeedQueue.push({ itemId: createdItem.id, name: templateItem.name, tasks: templateItem.tasks })
          }
        }
      }

      // Create the work order
      const newWorkOrder = await tx.workOrder.create({
        data: {
          contractId,
          scheduledStartDateTime: new Date(scheduledStartDateTime),
          scheduledEndDateTime: new Date(scheduledEndDateTime),
          remarks,
          status: 'SCHEDULED',
          inspectors: {
            connect: inspectorIds.map((id: string) => ({ id }))
          }
        },
        include: {
          contract: {
            include: {
              customer: true,
              address: true,
              contractChecklist: {
                include: {
                  items: {
                    orderBy: { order: 'asc' }
                  }
                }
              }
            }
          },
          inspectors: true
        }
      })
      
      return { workOrder: newWorkOrder, contractChecklistId: contractChecklist?.id }
    }, { timeout: 20000, maxWait: 10000 })

    if (transactionResult?.contractChecklistId) {
      const checklistItems = await prisma.contractChecklistItem.findMany({
        where: { contractChecklistId: transactionResult.contractChecklistId },
        select: { id: true, name: true }
      })

      const templateLookup = new Map((contract.basedOnChecklist?.items || []).map((item) => [item.name, item]))

      const dedupe = new Map<string, TaskSeed>()
      for (const seed of taskSeedQueue) {
        dedupe.set(seed.itemId, seed)
      }

      for (const item of checklistItems) {
        if (!dedupe.has(item.id)) {
          const templateMatch = templateLookup.get(item.name)
          const tasks = templateMatch ? parseActionIntoTasks(templateMatch.action || '') : []
          dedupe.set(item.id, { itemId: item.id, name: item.name, tasks })
        }
      }

      for (const seed of dedupe.values()) {
        await ensureTasksForItem(seed.itemId, seed.name, seed.tasks)
      }
    }

    return NextResponse.json(transactionResult.workOrder, { status: 201 })
  } catch (error) {
    console.error('Error creating work order:', error)
    if (error instanceof Error && error.message.includes('ChecklistTask model not available')) {
      return NextResponse.json(
        { error: error.message, hint: 'Run `pnpm prisma generate` and push/migrate the updated schema so the ChecklistTask delegate exists.' },
        { status: 500 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create work order' },
      { status: 500 }
    )
  }
}
