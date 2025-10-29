import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
type LocationSeed = {
  name: string
  subtasks: string[]
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

function deriveLocationSeeds(
  sourceTasks: Array<{ name?: string | null; actions?: any; details?: string | null }>,
  fallbackName: string,
  fallbackActions?: string | string[] | null,
): LocationSeed[] {
  const seeds: LocationSeed[] = []

  for (const rawTask of sourceTasks) {
    const rawName = typeof rawTask?.name === 'string' ? rawTask.name.trim() : ''
    const locationName = rawName.length > 0 ? rawName : fallbackName

    const actionSource = Array.isArray(rawTask?.actions)
      ? rawTask.actions
      : typeof rawTask?.details === 'string'
      ? rawTask.details
      : undefined

    const subtasks = extractActionStrings(actionSource)
    const uniqueSubtasks = Array.from(new Set(subtasks.map((entry) => entry.trim()).filter((entry) => entry.length > 0)))

    seeds.push({
      name: locationName,
      subtasks: uniqueSubtasks.length > 0 ? uniqueSubtasks : [locationName],
    })
  }

  if (seeds.length === 0) {
    const fallbackSubtasks = extractActionStrings(fallbackActions)
    const cleanedFallback = Array.from(new Set(fallbackSubtasks.map((entry) => entry.trim()).filter((entry) => entry.length > 0)))

    seeds.push({
      name: fallbackName,
      subtasks: cleanedFallback.length > 0 ? cleanedFallback : [fallbackName],
    })
  }

  return seeds
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
      let sourceItems: Array<{
        name: string
        action?: string
        order?: number
        tasks?: Array<{ name?: string | null; details?: string | null }>
      }> = []
      if (items && items.length > 0) {
        sourceItems = items
      } else if (templateId) {
        const template = await tx.checklist.findUnique({
          where: { id: templateId },
          include: {
            items: {
              include: {
                tasks: true,
              },
            },
          },
        })
        if (!template) {
          throw new Error('Template not found')
        }
        sourceItems = template.items.map((it)=> ({
          name: it.name,
          action: it.action,
          order: it.order,
          tasks: Array.isArray((it as any).tasks) ? (it as any).tasks : undefined,
        })) 
      } 

      if (sourceItems.length > 0) {
        for (const [index, item] of sourceItems.entries()) {
          const manualTaskEntries = Array.isArray((item as any).tasks)
            ? (item as any).tasks
                .map((task: any) => ({
                  name: typeof task?.name === 'string' ? task.name.trim() : '',
                  details: typeof task?.details === 'string' ? task.details.trim() : '',
                  actions: Array.isArray(task?.actions) ? task.actions : undefined,
                }))
                .filter((entry: { name: string }) => entry.name.length > 0)
            : []

          const fallbackAction = typeof item.action === 'string' ? item.action : undefined
          const locationSeeds = deriveLocationSeeds(manualTaskEntries, item.name, fallbackAction)

          const manualRemarks = manualTaskEntries
            .map((entry: any) => (entry.details ? `${entry.name} — ${entry.details}` : entry.name))
            .filter((value: string) => value && value.length > 0)

          const remarksSource = fallbackAction && fallbackAction.trim().length > 0
            ? fallbackAction
            : manualRemarks.length > 0
            ? manualRemarks.join('; ')
            : undefined

          const createdItem = await tx.contractChecklistItem.create({
            data: {
              contractChecklistId: checklist.id,
              name: item.name,
              order: item.order ?? index + 1,
              remarks: remarksSource,
            },
          })

          let locationOrder = 1
          for (const seed of locationSeeds) {
            const location = await tx.contractChecklistLocation.create({
              data: {
                itemId: createdItem.id,
                name: seed.name,
                status: 'PENDING',
                order: locationOrder++,
              },
            })

            // Batch insert tasks for this location to minimize transaction time
            const tasksData = seed.subtasks.map((subtaskName) => ({
              itemId: createdItem.id,
              locationId: location.id,
              name: subtaskName,
              status: 'PENDING' as const,
            }))
            if (tasksData.length > 0) {
              await tx.checklistTask.createMany({ data: tasksData })
            }
          }
        }
      }

      return await tx.contractChecklist.findUnique({
        where: { id: checklist.id },
        include: {
          items: {
            orderBy: { order: 'asc' },
            include: {
              checklistTasks: {
                orderBy: { createdOn: 'asc' },
                include: {
                  location: true,
                },
              },
              locations: {
                orderBy: { order: 'asc' },
                include: {
                  tasks: {
                    orderBy: { createdOn: 'asc' }
                  }
                }
              }
            }as any
          }
        }
      })
    }, { timeout: 180000, maxWait: 60000, isolationLevel: 'ReadCommitted' })

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
    const { templateId, items } = body as {
      templateId?: string
      items?: Array<{
        name: string
        action?: string
        order?: number
        tasks?: Array<{ name?: string | null; details?: string | null; actions?: string[] | null }>
      }>
    }

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
        const manualTaskEntries = Array.isArray((item as any).tasks)
          ? (item as any).tasks
              .map((task: any) => ({
                name: typeof task?.name === 'string' ? task.name.trim() : '',
                details: typeof task?.details === 'string' ? task.details.trim() : '',
                actions: Array.isArray(task?.actions) ? task.actions : undefined,
              }))
              .filter((entry: { name: string }) => entry.name.length > 0)
          : []

        const fallbackAction = typeof item.action === 'string' ? item.action : undefined
        const locationSeeds = deriveLocationSeeds(manualTaskEntries, item.name, fallbackAction)

        const manualRemarks = manualTaskEntries
          .map((entry: any) => (entry.details ? `${entry.name} — ${entry.details}` : entry.name))
          .filter((value: string) => value && value.length > 0)

        const remarksSource = fallbackAction && fallbackAction.trim().length > 0
          ? fallbackAction
          : manualRemarks.length > 0
          ? manualRemarks.join('; ')
          : undefined

        const createdItem = await tx.contractChecklistItem.create({
          data: {
            contractChecklistId: checklist!.id,
            name: item.name,
            order: item.order ?? index + 1,
            remarks: remarksSource,
          },
        })

        let locationOrder = 1
        for (const seed of locationSeeds) {
          const location = await tx.contractChecklistLocation.create({
            data: {
              itemId: createdItem.id,
              name: seed.name,
              status: 'PENDING',
              order: locationOrder++,
            },
          })

          // Batch insert tasks for this location
          const tasksData = seed.subtasks.map((subtaskName) => ({
            itemId: createdItem.id,
            locationId: location.id,
            name: subtaskName,
            status: 'PENDING' as const,
          }))
          if (tasksData.length > 0) {
            await tx.checklistTask.createMany({ data: tasksData })
          }
        }
      }
      }

      return await tx.contractChecklist.findUnique({
        where: { id: checklist.id },
        include: {
          items: {
            orderBy: { order: 'asc' },
            include: {
              checklistTasks: {
                orderBy: { createdOn: 'asc' },
                include: {
                  location: true,
                },
              },
              locations: {
                orderBy: { order: 'asc' },
                include: {
                  tasks: {
                    orderBy: { createdOn: 'asc' }
                  }
                }
              }
            }
          }
        }
      })
    }, { timeout: 180000, maxWait: 60000, isolationLevel: 'ReadCommitted' })

    return NextResponse.json(updatedChecklist)
  } catch (error) {
    console.error('Error updating checklist for contract:', error)
    return NextResponse.json(
      { error: 'Failed to update checklist' },
      { status: 500 }
    )
  }
}
