import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/checklists - Get all checklist templates
export async function GET() {
  try {
    const checklists = await prisma.checklist.findMany({
      where: { status: 'ACTIVE' },
      include: {
        items: {
          orderBy: { order: 'asc' }
        },
        _count: {
          select: {
            contracts: true
          }
        }
      },
      orderBy: { createdOn: 'desc' }
    })

    return NextResponse.json(checklists)
  } catch (error) {
    console.error('Error fetching checklists:', error)
    return NextResponse.json(
      { error: 'Failed to fetch checklists' },
      { status: 500 }
    )
  }
}

// POST /api/checklists - Create a new checklist template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      name,
      propertyType,
      remarks,
      items
    } = body

    // Validate required fields
    if (!name || !propertyType || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const checklist = await prisma.checklist.create({
      data: {
        name,
        propertyType,
        remarks,
        items: {
          create: items.map((item: any, index: number) => ({
            name: item.name,
            action: item.action,
            order: item.order || index + 1
          }))
        }
      },
      include: {
        items: {
          orderBy: { order: 'asc' }
        }
      }
    })

    return NextResponse.json(checklist, { status: 201 })
  } catch (error) {
    console.error('Error creating checklist:', error)
    return NextResponse.json(
      { error: 'Failed to create checklist' },
      { status: 500 }
    )
  }
}