import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { PropertyType } from '@prisma/client'

// GET /api/checklists - Get all checklist templates
export async function GET() {
  try {
    const checklists = await prisma.checklist.findMany({
      where: { status: 'ACTIVE' },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              orderBy: { order: 'asc' }
            }
          } as any
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
    if (!name || !propertyType || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const normalizedPropertyType = typeof propertyType === 'string'
      ? propertyType.trim().toUpperCase().replace(/\s+/g, '_')
      : propertyType

    if (!normalizedPropertyType || !Object.values(PropertyType).includes(normalizedPropertyType as PropertyType)) {
      return NextResponse.json(
        { error: 'Invalid propertyType value' },
        { status: 400 }
      )
    }

    const listWithTasks = items
      .filter((item: any) => item && (item.name || item.item || item.location))
      .map((item: any, index: number) => {
        const tasks = Array.isArray(item.tasks) ? item.tasks : []
        const sanitizedTasks = tasks
          .filter((task: any) => task && (task.name || task.title || task.summary))
          .map((task: any, taskIndex: number) => ({
            name: task.name || task.title || task.summary,
            order: task.order || taskIndex + 1,
            actions: Array.isArray(task.actions)
              ? task.actions.filter((action: any) => typeof action === 'string' && action.trim().length > 0)
              : []
          }))

        return {
          name: item.name || item.item || item.location,
          category: item.category || 'GENERAL',
          order: item.order || index + 1,
          tasks: sanitizedTasks
        }
      })

    if (listWithTasks.length === 0) {
      return NextResponse.json(
        { error: 'At least one checklist item with a valid name is required.' },
        { status: 400 }
      )
    }

    const checklist = await prisma.checklist.create({
      data: {
        name,
        propertyType: normalizedPropertyType as PropertyType,
        remarks,
        items: {
          create: listWithTasks.map((item) => ({
            name: item.name,
            category: item.category || 'GENERAL',
            order: item.order,
            tasks: {
              create: item.tasks.map((task :any) => ({
                name: task.name,
                order: task.order,
                actions: task.actions
              }))
            } 
          }))
        } as any
      },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              orderBy: { order: 'asc' }
            }
          }
        }
      } as any
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
