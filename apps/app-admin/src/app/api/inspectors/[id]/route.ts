import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/inspectors/[id] - Get a single inspector
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const inspector = await prisma.inspector.findUnique({
      where: { id },
      include: {
        workOrders: {
          include: {
            contract: {
              include: {
                customer: true,
                address: true
              }
            }
          },
          orderBy: { scheduledStartDateTime: 'desc' },
          take: 10
        }
      }
    })

    if (!inspector) {
      return NextResponse.json(
        { error: 'Inspector not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(inspector)
  } catch (error) {
    console.error('Error fetching inspector:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inspector' },
      { status: 500 }
    )
  }
}

// PUT /api/inspectors/[id] - Update an inspector
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    const {
      name,
      mobilePhone,
      type,
      specialization,
      remarks,
      status
    } = body

    // If mobile phone is being changed, check for duplicates
    if (mobilePhone) {
      const existing = await prisma.inspector.findFirst({
        where: {
          mobilePhone,
          id: { not: id }
        }
      })

      if (existing) {
        return NextResponse.json(
          { error: 'Mobile phone number already registered' },
          { status: 400 }
        )
      }
    }

    const inspector = await prisma.inspector.update({
      where: { id },
      data: {
        name,
        mobilePhone,
        type,
        specialization,
        remarks,
        status
      }
    })

    return NextResponse.json(inspector)
  } catch (error) {
    console.error('Error updating inspector:', error)
    return NextResponse.json(
      { error: 'Failed to update inspector' },
      { status: 500 }
    )
  }
}

// PATCH is an alias for PUT
export const PATCH = PUT

// DELETE /api/inspectors/[id] - Delete an inspector (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Check if inspector has work orders
    const workOrderCount = await prisma.workOrder.count({
      where: { inspectorId: id }
    })

    if (workOrderCount > 0) {
      // Soft delete - mark as inactive
      const inspector = await prisma.inspector.update({
        where: { id },
        data: { status: 'INACTIVE' }
      })
      
      return NextResponse.json({ 
        message: 'Inspector marked as inactive due to existing work orders',
        inspector 
      })
    } else {
      // Hard delete if no work orders
      await prisma.inspector.delete({
        where: { id }
      })
      
      return NextResponse.json({ 
        message: 'Inspector deleted successfully' 
      })
    }
  } catch (error) {
    console.error('Error deleting inspector:', error)
    return NextResponse.json(
      { error: 'Failed to delete inspector' },
      { status: 500 }
    )
  }
}