import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const {
      remark,
      taskId,
      condition,
    } = body as {
      remark?: string
      taskId?: string
      condition?: string
    }

    const normalizedTaskId = typeof taskId === 'string' && taskId.trim().length > 0
      ? taskId.trim()
      : null

    if (!normalizedTaskId) {
      return NextResponse.json({ error: 'Subtask is required' }, { status: 400 })
    }

    const normalizedCondition = typeof condition === 'string' && condition.trim().length > 0
      ? condition.trim().toUpperCase().replace(/\s|-/g, '_')
      : undefined

    if (normalizedCondition && !['GOOD', 'FAIR', 'UNSATISFACTORY', 'NOT_APPLICABLE', 'UN_OBSERVABLE'].includes(normalizedCondition)) {
      return NextResponse.json({ error: 'Invalid condition value' }, { status: 400 })
    }

    const targetTask = await prisma.checklistTask.findUnique({
      where: { id: normalizedTaskId },
      select: { id: true, itemId: true, entryId: true },
    })

    if (!targetTask || targetTask.itemId !== id) {
      return NextResponse.json({ error: 'Selected subtask was not found for this checklist item' }, { status: 400 })
    }

    if (targetTask.entryId) {
      return NextResponse.json({
        error: 'Selected subtask is already linked to a remark',
        conflicts: [targetTask.id],
      }, { status: 409 })
    }

    const entry = await prisma.itemEntry.create({
      data: {
        itemId: id,
        remarks: remark && remark.trim().length > 0 ? remark.trim() : null,
      },
    })

    const updateData: any = {
      entry: {
        connect: { id: entry.id },
      },
    }
    if (typeof normalizedCondition !== 'undefined') {
      updateData.condition = normalizedCondition || null
    }

    try {
      await prisma.checklistTask.update({
        where: { id: targetTask.id },
        data: updateData,
      })
    } catch (error) {
      const message = (error as Error).message || ''
      const validationError = error instanceof Prisma.PrismaClientValidationError
        && message.includes('Unknown argument `condition`')

      if (validationError) {
        await prisma.checklistTask.update({
          where: { id: targetTask.id },
          data: {
            entry: {
              connect: { id: entry.id },
            },
          },
        })
      } else {
        throw error
      }
    }

    const fetchEntry = async (includeCondition: boolean) =>
      prisma.itemEntry.findUnique({
        where: { id: entry.id },
        include: {
          tasks: {
            select: includeCondition
              ? {
                  id: true,
                  name: true,
                  status: true,
                  photos: true,
                  videos: true,
                  entryId: true,
                  condition: true,
                }
              : {
                  id: true,
                  name: true,
                  status: true,
                  photos: true,
                  videos: true,
                  entryId: true,
                },
          },
        },
      })

    let responseEntry = null
    try {
      responseEntry = await fetchEntry(true)
    } catch (error) {
      const message = (error as Error).message || ''
      const validationError = error instanceof Prisma.PrismaClientValidationError
        && message.includes('Unknown field `condition`')

      if (!validationError) {
        throw error
      }

      responseEntry = await fetchEntry(false)
    }

    return NextResponse.json(responseEntry)
  } catch (error) {
    console.error('Error saving checklist item remark:', error)
    return NextResponse.json({ error: 'Failed to save remark' }, { status: 500 })
  }
}
