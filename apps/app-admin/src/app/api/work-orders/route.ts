import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { upsertWorkOrderCaches } from '@/lib/services/inspectorService'
import { generateWorkOrderId } from '@/lib/id-generator'

type LocationSeed = {
  name: string
  subtasks: string[]
}

const MAX_TRANSACTION_ATTEMPTS = 3

const isRetryableTransactionError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'

type WorkOrderTransactionResult = {
  workOrder: Awaited<ReturnType<typeof prisma.workOrder.create>>
  contractChecklistId?: string
}

function extractActionStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === 'string'
          ? entry.replace(/^[•\-\u2022\u2023\u25E6\u2043\s]+/, '').trim()
          : '',
      )
      .filter((entry) => entry.length > 0)
  }

  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((entry) => entry.replace(/^[•\-\u2022\u2023\u25E6\u2043\s]+/, '').trim())
      .filter((entry) => entry.length > 0)
  }

  return []
}

function normaliseSubTasks(fallbackName: string, fallbackSource?: string | string[]): string[] {
  let entries: string[] = []

  if (Array.isArray(fallbackSource)) {
    entries = fallbackSource
      .filter((entry) => typeof entry === 'string')
      .map((entry: string) => entry.trim())
      .filter((entry) => entry.length > 0)
  } else if (typeof fallbackSource === 'string') {
    entries = extractActionStrings(fallbackSource)
  }

  if (entries.length === 0) {
    const baseName = fallbackName && fallbackName.trim().length > 0 ? fallbackName.trim() : 'Inspect area'
    entries = [baseName]
  }

  const unique = Array.from(new Set(entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0)))

  return unique.length > 0 ? unique : [fallbackName && fallbackName.trim().length > 0 ? fallbackName.trim() : 'Inspect area']
}

async function ensureLocationsForItem(itemId: string, fallbackName: string, seeds?: LocationSeed[]) {
      const locationDelegate = (prisma as any).contractChecklistLocation
      const taskDelegate = (prisma as any).checklistTask

  if (!locationDelegate || !taskDelegate) {
    throw new Error('Checklist location/task delegates unavailable. Run `pnpm prisma generate`.')
  }

  const existingLocations = await locationDelegate.count({ where: { itemId } })
  if (existingLocations > 0) {
    return
  }

  const fallbackSeed: LocationSeed = {
    name: fallbackName && fallbackName.trim().length > 0 ? fallbackName.trim() : 'General',
    subtasks: normaliseSubTasks(fallbackName, undefined),
  }

  const finalSeeds: LocationSeed[] = Array.isArray(seeds) && seeds.length > 0 ? seeds : [fallbackSeed]

  const existingTasks = await taskDelegate.findMany({ where: { itemId } })

  let order = 1

  if (existingTasks.length > 0) {
    const [firstSeed, ...remainingSeeds] = finalSeeds
    const primarySeed = firstSeed ?? fallbackSeed

    const primaryLocation = await locationDelegate.create({
      data: {
        itemId,
        name: primarySeed.name,
        status: 'PENDING',
        order: order++,
      },
    })

    await taskDelegate.updateMany({
      where: { itemId },
      data: { locationId: primaryLocation.id },
    })

      for (const seed of remainingSeeds) {
        const location = await locationDelegate.create({
          data: {
            itemId,
            name: seed.name,
            status: 'PENDING',
            order: order++,
          },
        })

        for (let sidx = 0; sidx < seed.subtasks.length; sidx++) {
          const subtaskName = seed.subtasks[sidx]
          await taskDelegate.create({
            data: {
              itemId,
              locationId: location.id,
              name: subtaskName,
              status: 'PENDING',
              order: sidx + 1,
            },
          })
        }
      }

    return
  }

  for (const seed of finalSeeds) {
    const location = await locationDelegate.create({
      data: {
        itemId,
        name: seed.name,
        status: 'PENDING',
        order: order++,
      },
    })

    for (const subtaskName of seed.subtasks) {
      await taskDelegate.create({
        data: {
          itemId,
          locationId: location.id,
          name: subtaskName,
          status: 'PENDING',
        },
      })
    }
  }
}

function deriveLocationSeeds(
  sourceTasks: Array<{ name?: string | null; actions?: any; details?: string | null }>,
  fallbackName: string,
  fallbackActions?: string | string[] | null,
): LocationSeed[] {
  const seeds: LocationSeed[] = []

  for (const rawTask of sourceTasks) {
    const taskName = typeof rawTask?.name === 'string' ? rawTask.name.trim() : ''
    const locationName = taskName.length > 0 ? taskName : fallbackName

    const actionStrings = Array.isArray(rawTask?.actions)
      ? rawTask.actions
      : typeof rawTask?.details === 'string'
      ? rawTask.details
      : undefined

    const subtasks = extractActionStrings(actionStrings)
    const uniqueSubtasks = Array.from(new Set(subtasks.map((entry) => entry.trim()).filter((entry) => entry.length > 0)))

    seeds.push({
      name: locationName,
      subtasks: uniqueSubtasks.length > 0 ? uniqueSubtasks : [locationName],
    })
  }

  if (seeds.length === 0) {
    const fallbackSubtasks = normaliseSubTasks(fallbackName, fallbackActions)
    seeds.push({
      name: fallbackName,
      subtasks: fallbackSubtasks,
    })
  }

  return seeds
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
              items: {
                orderBy: { order: 'asc' },
                include: {
                  tasks: {
                    orderBy: { order: 'asc' }
                  }
                }as any
              }
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
      ? contract.basedOnChecklist.items.map((item: any) => {
          const templateTasks = Array.isArray((item as any).tasks) ? (item as any).tasks : []
          const fallbackAction = typeof (item as any)?.action === 'string' ? (item as any).action : undefined
          const locations = deriveLocationSeeds(templateTasks, item.name, fallbackAction)
          const originalRemarks = typeof (item as any)?.remarks === 'string' ? (item as any).remarks : undefined

          return {
            name: item.name,
            order: item.order,
            remarks: originalRemarks || undefined,
            locations,
          }
        })
      : []

    // Create work order in a transaction (with extended timeout)
    let transactionResult: WorkOrderTransactionResult | null = null

    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        transactionResult = await prisma.$transaction(
          async (tx) => {
            // First, ensure contract checklist exists
            let contractChecklist = contract.contractChecklist

            if (!contractChecklist && contract.basedOnChecklist) {
              contractChecklist = await tx.contractChecklist.create({
                data: {
                  contractId,
                },
              })

              if (itemsFromTemplate.length > 0 && contractChecklist) {
                for (const templateItem of itemsFromTemplate) {
                  const createdItem = await tx.contractChecklistItem.create({
                    data: {
                      contractChecklistId: contractChecklist.id,
                      name: templateItem.name,
                      remarks: templateItem.remarks,
                      order: templateItem.order,
                    },
                  })

                  let locationOrder = 1
                  for (const seed of templateItem.locations) {
                    const location = await tx.contractChecklistLocation.create({
                      data: {
                        itemId: createdItem.id,
                        name: seed.name,
                        status: 'PENDING',
                        order: locationOrder++,
                      },
                    })

                    for (let sidx = 0; sidx < seed.subtasks.length; sidx++) {
                      const subtaskName = seed.subtasks[sidx]
                      await tx.checklistTask.create({
                        data: {
                          itemId: createdItem.id,
                          locationId: location.id,
                          name: subtaskName,
                          status: 'PENDING',
                          order: sidx + 1,
                        },
                      })
                    }
                  }
                }
              }
            }

            // Create the work order
            const generatedId = await generateWorkOrderId(tx)
            const newWorkOrder = await tx.workOrder.create({
              data: {
                id: generatedId,
                contractId,
                scheduledStartDateTime: new Date(scheduledStartDateTime),
                scheduledEndDateTime: new Date(scheduledEndDateTime),
                remarks,
                status: 'SCHEDULED',
                inspectors: {
                  connect: inspectorIds.map((id: string) => ({ id })),
                },
              },
              include: {
                contract: {
                  include: {
                    customer: true,
                    address: true,
                    contractChecklist: {
                      include: {
                        items: {
                          orderBy: { order: 'asc' },
                          include: {
                            locations: {
                              orderBy: { order: 'asc' },
                              include: {
                                tasks: {
                                  orderBy: [
                                    { order: 'asc' },
                                    { createdOn: 'asc' }
                                  ],
                                },
                              },
                            },
                            checklistTasks: {
                              orderBy: [
                                { order: 'asc' },
                                { createdOn: 'asc' }
                              ],
                              include: {
                                location: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                inspectors: true,
              },
            })

            return { workOrder: newWorkOrder, contractChecklistId: contractChecklist?.id }
          },
          {
            timeout: 60000,
            maxWait: 20000,
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        )
        break
      } catch (transactionError) {
        if (isRetryableTransactionError(transactionError) && attempt < MAX_TRANSACTION_ATTEMPTS - 1) {
          continue
        }
        throw transactionError
      }
    }

    if (!transactionResult) {
      throw new Error('Unable to create work order after retrying transaction')
    }

    if (transactionResult.contractChecklistId) {
      const checklistItems = await prisma.contractChecklistItem.findMany({
        where: { contractChecklistId: transactionResult.contractChecklistId },
        select: { id: true, name: true, remarks: true }
      })

      const templateLookup = new Map(
        (contract.basedOnChecklist?.items || []).map((item) => {
          const templateTasks = Array.isArray((item as any).tasks) ? (item as any).tasks : []
          const fallbackAction = typeof (item as any)?.action === 'string' ? (item as any).action : undefined
          return [
            typeof item.name === 'string' ? item.name.trim().toLowerCase() : '',
            deriveLocationSeeds(templateTasks, item.name, fallbackAction),
          ]
        }),
      )

      for (const item of checklistItems) {
        const templateSeeds = templateLookup.get(item.name?.trim().toLowerCase() || '')
        const fallbackSeeds = templateSeeds ?? deriveLocationSeeds([], item.name, item.remarks)
        await ensureLocationsForItem(item.id, item.name, fallbackSeeds)
      }
    }

    try { await upsertWorkOrderCaches(transactionResult.workOrder, []) } catch (e) { console.error('work-order create: upsert caches failed', e) }
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
