import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

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
      where.inspectorId = inspectorId
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
          inspector: true
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
      inspectorId,
      scheduledStartDateTime,
      scheduledEndDateTime,
      remarks
    } = body

    // Validate required fields
    if (!contractId || !inspectorId || !scheduledStartDateTime || !scheduledEndDateTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify contract and inspector exist, include checklist info
    const [contract, inspector] = await Promise.all([
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
      prisma.inspector.findUnique({ where: { id: inspectorId } })
    ])

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    if (!inspector) {
      return NextResponse.json(
        { error: 'Inspector not found' },
        { status: 404 }
      )
    }

    if (inspector.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Inspector is not active' },
        { status: 400 }
      )
    }

    // Check for scheduling conflicts for the inspector
    const conflictingWorkOrder = await prisma.workOrder.findFirst({
      where: {
        inspectorId,
        status: { in: ['SCHEDULED', 'STARTED'] },
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

    // Create work order in a transaction
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
        if (contract.basedOnChecklist.items && contract.basedOnChecklist.items.length > 0) {
          await tx.contractChecklistItem.createMany({
            data: contract.basedOnChecklist.items.map(item => ({
              contractChecklistId: contractChecklist.id,
              name: item.name,
              order: item.order,
              remarks: item.action
            }))
          })
        }
      }
      
      // Create the work order
      const newWorkOrder = await tx.workOrder.create({
        data: {
          contractId,
          inspectorId,
          scheduledStartDateTime: new Date(scheduledStartDateTime),
          scheduledEndDateTime: new Date(scheduledEndDateTime),
          remarks,
          status: 'SCHEDULED'
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
          inspector: true
        }
      })
      
      return newWorkOrder
    })

    return NextResponse.json(workOrder, { status: 201 })
  } catch (error) {
    console.error('Error creating work order:', error)
    return NextResponse.json(
      { error: 'Failed to create work order' },
      { status: 500 }
    )
  }
}