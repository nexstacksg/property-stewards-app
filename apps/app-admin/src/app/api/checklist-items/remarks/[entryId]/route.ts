import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'

function normalizeCondition(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.toUpperCase().replace(/\s|-/g, '_')
}

type TaskLinkOptions = {
  connectEntryId?: string
  disconnect?: boolean
  condition?: string | null | undefined
}

async function updateTaskLink(taskId: string, options: TaskLinkOptions) {
  const data: any = {}
  if (options.connectEntryId) {
    data.entry = { connect: { id: options.connectEntryId } }
  }
  if (options.disconnect) {
    data.entry = { disconnect: true }
  }

  if (Object.prototype.hasOwnProperty.call(options, 'condition')) {
    data.condition = options.condition ?? null
  }

  try {
    await prisma.checklistTask.update({ where: { id: taskId }, data })
  } catch (error) {
    const message = (error as Error).message || ''
    const validationError = error instanceof Prisma.PrismaClientValidationError
      && message.includes('Unknown argument `condition`')

    if (validationError && Object.prototype.hasOwnProperty.call(data, 'condition')) {
      const fallbackData = { ...data }
      delete (fallbackData as any).condition
      await prisma.checklistTask.update({ where: { id: taskId }, data: fallbackData })
      return
    }
    throw error
  }
}

async function fetchEntry(entryId: string, includeCondition: boolean) {
  return prisma.itemEntry.findUnique({
    where: { id: entryId },
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
}

async function fetchEntryWithFallback(entryId: string) {
  try {
    return await fetchEntry(entryId, true)
  } catch (error) {
    const message = (error as Error).message || ''
    const validationError = error instanceof Prisma.PrismaClientValidationError
      && message.includes('Unknown field `condition`')

    if (!validationError) throw error
    return fetchEntry(entryId, false)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await params
    const body = await request.json()
    const remark = typeof body.remark === 'string' ? body.remark.trim() : undefined
    const condition = normalizeCondition(body.condition)

    if (!remark && typeof condition === 'undefined') {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    const entry = await prisma.itemEntry.findUnique({
      where: { id: entryId },
      include: { tasks: { select: { id: true } } },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Remark not found' }, { status: 404 })
    }

    const updateData: any = {}
    if (typeof remark === 'string') {
      updateData.remarks = remark.length > 0 ? remark : null
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.itemEntry.update({ where: { id: entryId }, data: updateData })
    }

    const taskId = entry.tasks[0]?.id
    if (taskId && typeof condition !== 'undefined') {
      await updateTaskLink(taskId, { condition })
    }

    const responseEntry = await fetchEntryWithFallback(entryId)
    return NextResponse.json(responseEntry)
  } catch (error) {
    console.error('Error updating remark:', error)
    return NextResponse.json({ error: 'Failed to update remark' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await params
    const entry = await prisma.itemEntry.findUnique({
      where: { id: entryId },
      include: { tasks: { select: { id: true } } },
    })

    if (!entry) {
      return NextResponse.json({ error: 'Remark not found' }, { status: 404 })
    }

    const taskId = entry.tasks[0]?.id
    if (taskId) {
      await updateTaskLink(taskId, { disconnect: true, condition: null })
    }

    await prisma.itemEntry.delete({ where: { id: entryId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting remark:', error)
    return NextResponse.json({ error: 'Failed to delete remark' }, { status: 500 })
  }
}
