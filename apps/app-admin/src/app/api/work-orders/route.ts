import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { parseActionIntoTasks } from '@/lib/utils/taskParser'

// GET /api/work-orders - Get all work orders
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const inspectorId = searchParams.get('inspectorId')
    const contractId = searchParams.get('contractId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
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
              { scheduledEndDateTime: { gte: new Date(scheduledStartDateTime) } }
            ]
          },
          {
            AND: [
              { scheduledStartDateTime: { lte: new Date(scheduledEndDateTime) } },
              { scheduledEndDateTime: { gte: new Date(scheduledEndDateTime) } }
            ]
          },
          {
            AND: [
              { scheduledStartDateTime: { gte: new Date(scheduledStartDateTime) } },
              { scheduledEndDateTime: { lte: new Date(scheduledEndDateTime) } }
            ]
          }
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
          tasks: parseActionIntoTasks(item.action) as any
        }))
      : []

    // Create work order in a transaction (with extended timeout)
    const workOrder = await prisma.$transaction(async (tx) => {
      // First, ensure contract checklist exists
      let contractChecklist = contract.contractChecklist
      
      if (!contractChecklist && contract.basedOnChecklist) {
        // Create contract checklist from template
        contractChecklist = await tx.contractChecklist.create({
          data: {
            contractId
          }
        })
        
        // Create checklist items from template
        if (itemsFromTemplate.length > 0 && contractChecklist) {
          const checklistId = contractChecklist.id
          await tx.contractChecklistItem.createMany({
            data: itemsFromTemplate.map(d => ({ ...d, contractChecklistId: checklistId }))
          })
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
      
      return newWorkOrder
    }, { timeout: 20000, maxWait: 10000 })

    return NextResponse.json(workOrder, { status: 201 })
  } catch (error) {
    console.error('Error creating work order:', error)
    return NextResponse.json(
      { error: 'Failed to create work order' },
      { status: 500 }
    )
  }
}
