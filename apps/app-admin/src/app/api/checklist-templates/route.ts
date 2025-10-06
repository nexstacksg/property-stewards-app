import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/checklist-templates - Get all checklist templates
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyType = searchParams.get('propertyType')
    const search = searchParams.get('search')
    const status = searchParams.get('status') || 'ACTIVE'
    
    const where: any = { status }
    
    if (propertyType) {
      where.propertyType = propertyType
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { remarks: { contains: search, mode: 'insensitive' } }
      ]
    }

    const templates = await prisma.checklist.findMany({
      where,
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              orderBy: { order: 'asc' }
            }
          }
        },
        _count: {
          select: {
            contracts: true
          }
        }
      },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('Error fetching checklist templates:', error)
    return NextResponse.json(
      { error: 'Failed to fetch checklist templates' },
      { status: 500 }
    )
  }
}

// POST /api/checklist-templates - Create a new checklist template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      name,
      remarks,
      propertyType,
      items
    } = body

    // Validate required fields
    if (!name || !propertyType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const listWithTasks = (Array.isArray(items) ? items : [])
      .filter((item: any) => item && (item.name || item.location))
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
          name: item.name || item.location,
          category: item.category || 'GENERAL',
          order: item.order || index + 1,
          tasks: sanitizedTasks,
        }
      })

    const template = await prisma.checklist.create({
      data: {
        name,
        remarks,
        propertyType,
        items:
          listWithTasks.length > 0
            ? {
              create: listWithTasks.map((item) => ({
                name: item.name,
                category: item.category,
                order: item.order,
                tasks: {
                  create: item.tasks.map((task) => ({
                    name: task.name,
                    order: task.order,
                      actions: task.actions,
                    })),
                  },
                })),
              }
            : undefined,
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
      }
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('Error creating checklist template:', error)
    return NextResponse.json(
      { error: 'Failed to create checklist template' },
      { status: 500 }
    )
  }
}
