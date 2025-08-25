import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/checklists/[id] - Get a single checklist
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const checklist = await prisma.checklist.findUnique({
      where: { id: params.id },
      include: {
        items: {
          orderBy: { order: 'asc' }
        },
        contracts: {
          include: {
            customer: true,
            address: true
          },
          take: 5,
          orderBy: { createdOn: 'desc' }
        }
      }
    })

    if (!checklist) {
      return NextResponse.json(
        { error: 'Checklist not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(checklist)
  } catch (error) {
    console.error('Error fetching checklist:', error)
    return NextResponse.json(
      { error: 'Failed to fetch checklist' },
      { status: 500 }
    )
  }
}

// PATCH /api/checklists/[id] - Update a checklist
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    
    const {
      name,
      propertyType,
      remarks,
      status,
      items
    } = body

    // Update checklist
    const checklist = await prisma.checklist.update({
      where: { id: params.id },
      data: {
        name,
        propertyType,
        remarks,
        status
      }
    })

    // If items are provided, update them
    if (items && Array.isArray(items)) {
      // Delete existing items
      await prisma.checklistItem.deleteMany({
        where: { checklistId: params.id }
      })

      // Create new items
      await prisma.checklistItem.createMany({
        data: items.map((item: any, index: number) => ({
          checklistId: params.id,
          name: item.name,
          action: item.action,
          order: item.order || index + 1
        }))
      })
    }

    // Fetch and return updated checklist with items
    const updatedChecklist = await prisma.checklist.findUnique({
      where: { id: params.id },
      include: {
        items: {
          orderBy: { order: 'asc' }
        }
      }
    })

    return NextResponse.json(updatedChecklist)
  } catch (error) {
    console.error('Error updating checklist:', error)
    return NextResponse.json(
      { error: 'Failed to update checklist' },
      { status: 500 }
    )
  }
}

// DELETE /api/checklists/[id] - Delete a checklist
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if checklist is used in contracts
    const contractCount = await prisma.contract.count({
      where: { basedOnChecklistId: params.id }
    })

    if (contractCount > 0) {
      // Soft delete - mark as inactive
      const checklist = await prisma.checklist.update({
        where: { id: params.id },
        data: { status: 'INACTIVE' }
      })
      
      return NextResponse.json({ 
        message: 'Checklist marked as inactive due to existing contracts',
        checklist 
      })
    } else {
      // Hard delete if not used
      await prisma.$transaction([
        prisma.checklistItem.deleteMany({
          where: { checklistId: params.id }
        }),
        prisma.checklist.delete({
          where: { id: params.id }
        })
      ])
      
      return NextResponse.json({ 
        message: 'Checklist deleted successfully' 
      })
    }
  } catch (error) {
    console.error('Error deleting checklist:', error)
    return NextResponse.json(
      { error: 'Failed to delete checklist' },
      { status: 500 }
    )
  }
}