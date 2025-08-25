import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/contracts/[id] - Get a single contract
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        customer: true,
        address: true,
        basedOnChecklist: {
          include: { items: true }
        },
        contractChecklist: {
          include: {
            items: {
              include: {
                enteredBy: true,
                workOrder: true
              },
              orderBy: { order: 'asc' }
            }
          }
        },
        workOrders: {
          include: {
            inspector: true
          },
          orderBy: { scheduledStartDateTime: 'desc' }
        }
      }
    })

    if (!contract) {
      return NextResponse.json(
        { error: 'Contract not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(contract)
  } catch (error) {
    console.error('Error fetching contract:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contract' },
      { status: 500 }
    )
  }
}

// PATCH /api/contracts/[id] - Update a contract
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    const {
      value,
      firstPaymentOn,
      finalPaymentOn,
      scheduledStartDate,
      scheduledEndDate,
      actualStartDate,
      actualEndDate,
      servicePackage,
      remarks,
      customerComments,
      customerRating,
      status
    } = body

    const contract = await prisma.contract.update({
      where: { id },
      data: {
        value,
        firstPaymentOn: firstPaymentOn ? new Date(firstPaymentOn) : undefined,
        finalPaymentOn: finalPaymentOn ? new Date(finalPaymentOn) : null,
        scheduledStartDate: scheduledStartDate ? new Date(scheduledStartDate) : undefined,
        scheduledEndDate: scheduledEndDate ? new Date(scheduledEndDate) : undefined,
        actualStartDate: actualStartDate ? new Date(actualStartDate) : null,
        actualEndDate: actualEndDate ? new Date(actualEndDate) : null,
        servicePackage,
        remarks,
        customerComments,
        customerRating,
        status
      },
      include: {
        customer: true,
        address: true,
        workOrders: true
      }
    })

    return NextResponse.json(contract)
  } catch (error) {
    console.error('Error updating contract:', error)
    return NextResponse.json(
      { error: 'Failed to update contract' },
      { status: 500 }
    )
  }
}

// PUT is an alias for PATCH
export const PUT = PATCH

// DELETE /api/contracts/[id] - Delete a contract
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Check if contract has work orders
    const workOrderCount = await prisma.workOrder.count({
      where: { contractId: id }
    })

    if (workOrderCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete contract with existing work orders' },
        { status: 400 }
      )
    }

    // Delete contract and related data
    await prisma.$transaction([
      prisma.contractChecklistItem.deleteMany({
        where: {
          contractChecklist: {
            contractId: id
          }
        }
      }),
      prisma.contractChecklist.deleteMany({
        where: { contractId: id }
      }),
      prisma.contract.delete({
        where: { id }
      })
    ])

    return NextResponse.json({ 
      message: 'Contract deleted successfully' 
    })
  } catch (error) {
    console.error('Error deleting contract:', error)
    return NextResponse.json(
      { error: 'Failed to delete contract' },
      { status: 500 }
    )
  }
}