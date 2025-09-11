import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/work-orders/[id] - Get a single work order
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
      include: {
        contract: {
          include: {
            customer: true,
            address: true,
            contractChecklist: {
              include: {
                items: {
                  where: { workOrderId: id },
                  include: {
                    enteredBy: true
                  },
                  orderBy: { order: 'asc' }
                }
              }
            }
          }
        },
        inspectors: true,
        checklistItems: true
      }
    })

    if (!workOrder) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(workOrder)
  } catch (error) {
    console.error('Error fetching work order:', error)
    return NextResponse.json(
      { error: 'Failed to fetch work order' },
      { status: 500 }
    )
  }
}

// PUT /api/work-orders/[id] - Update a work order (alias for PATCH)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return PATCH(request, { params });
}

// PATCH /api/work-orders/[id] - Update a work order
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    const {
      inspectorIds,
      scheduledStartDateTime,
      scheduledEndDateTime,
      actualStart,
      actualEnd,
      signature,
      signOffBy,
      remarks,
      status
    } = body

    // If changing inspectors, verify they exist and are active
    if (Array.isArray(inspectorIds)) {
      if (inspectorIds.length === 0) {
        return NextResponse.json({ error: 'At least one inspector is required' }, { status: 400 })
      }
      const inspectors = await prisma.inspector.findMany({ where: { id: { in: inspectorIds } } })
      if (!inspectors || inspectors.length !== inspectorIds.length) {
        return NextResponse.json({ error: 'One or more inspectors not found' }, { status: 404 })
      }
      const inactive = inspectors.find(i => i.status !== 'ACTIVE')
      if (inactive) {
        return NextResponse.json({ error: `Inspector ${inactive.name} is not active` }, { status: 400 })
      }
    }

    const workOrder = await prisma.workOrder.update({
      where: { id },
      data: {
        scheduledStartDateTime: scheduledStartDateTime ? new Date(scheduledStartDateTime) : undefined,
        scheduledEndDateTime: scheduledEndDateTime ? new Date(scheduledEndDateTime) : undefined,
        actualStart: actualStart ? new Date(actualStart) : null,
        actualEnd: actualEnd ? new Date(actualEnd) : null,
        signature,
        signOffBy,
        remarks,
        status,
        ...(Array.isArray(inspectorIds) ? { inspectors: { set: inspectorIds.map((iid: string) => ({ id: iid })) } } : {})
      },
      include: {
        contract: {
          include: {
            customer: true,
            address: true
          }
        },
        inspectors: true
      }
    })

    // If work order is marked as started, update contract status if needed
    if (status === 'STARTED') {
      await prisma.contract.update({
        where: { id: workOrder.contractId },
        data: {
          actualStartDate: workOrder.actualStart || new Date()
        }
      })
    }

    // If work order is completed, check if all work orders for the contract are completed
    if (status === 'COMPLETED') {
      const incompleteWorkOrders = await prisma.workOrder.count({
        where: {
          contractId: workOrder.contractId,
          status: { not: 'COMPLETED' },
          id: { not: id }
        }
      })

      if (incompleteWorkOrders === 0) {
        // All work orders are completed, update contract
        await prisma.contract.update({
          where: { id: workOrder.contractId },
          data: {
            actualEndDate: workOrder.actualEnd || new Date(),
            status: 'COMPLETED'
          }
        })
      }
    }

    return NextResponse.json(workOrder)
  } catch (error) {
    console.error('Error updating work order:', error)
    return NextResponse.json(
      { error: 'Failed to update work order' },
      { status: 500 }
    )
  }
}

// DELETE /api/work-orders/[id] - Delete a work order
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    const workOrder = await prisma.workOrder.findUnique({
      where: { id }
    })

    if (!workOrder) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      )
    }

    // Only allow deletion of scheduled or cancelled work orders
    if (workOrder.status === 'STARTED' || workOrder.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Cannot delete started or completed work orders' },
        { status: 400 }
      )
    }

    // Delete work order
    await prisma.workOrder.delete({
      where: { id }
    })

    return NextResponse.json({ 
      message: 'Work order deleted successfully' 
    })
  } catch (error) {
    console.error('Error deleting work order:', error)
    return NextResponse.json(
      { error: 'Failed to delete work order' },
      { status: 500 }
    )
  }
}
