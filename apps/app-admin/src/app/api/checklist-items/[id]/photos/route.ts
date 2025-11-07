import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { s3Client, BUCKET_NAME, PUBLIC_URL, SPACE_DIRECTORY } from '@/lib/s3-client'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const form = await request.formData()
    const file = form.get('file') as File | null
    const workOrderId = (form.get('workOrderId') as string | null) || 'unknown'
    const target = (form.get('target') as string | null) || 'task'

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Basic content-type validation
    const contentType = file.type || 'application/octet-stream'
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are allowed' }, { status: 400 })
    }

    // Build key: data/work-orders/<woId>/items/<itemId>/photos/<uuid>.<ext>
    const extension = (() => {
      const fromType = contentType.split('/')[1]
      if (fromType) return fromType
      const name = (file as any).name as string | undefined
      if (name && name.includes('.')) return name.split('.').pop() as string
      return 'jpeg'
    })()
    const filename = `${randomUUID()}.${extension}`
    const key = `${SPACE_DIRECTORY}/work-orders/${workOrderId}/items/${id}/photos/${filename}`

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Spaces
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read'
    } as any)
    await s3Client.send(command)

    const publicUrl = `${PUBLIC_URL}/${key}`

    const item = await prisma.contractChecklistItem.findUnique({
      where: { id },
      include: {
        checklistTasks: {
          include: { entries: { select: { id: true } } },
          orderBy: [
            { order: 'asc' },
            { createdOn: 'asc' }
          ]
        },
        contractChecklist: { select: { contract: { select: { id: true } } } }
      }
    } as any)

    if (!item) {
      return NextResponse.json({ error: 'Checklist item not found' }, { status: 404 })
    }

    if (target === 'item') {
      const updatedItem = await prisma.contractChecklistItem.update({
        where: { id: item.id },
        data: { photos: { push: publicUrl } },
        select: { id: true, photos: true }
      })

      return NextResponse.json({ url: publicUrl, item: updatedItem })
    }

    let task = item.checklistTasks.find((task: any) => !Array.isArray(task.entries) || task.entries.length === 0)
    if (!task) {
      task = item.checklistTasks[0]
    }
    if (!task) {
      task = await prisma.checklistTask.create({
        data: {
          itemId: item.id,
          name: item.name || 'General inspection',
          status: item.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
          order: 1,
        }
      })
    }

    const updatedTask = await prisma.checklistTask.update({
      where: { id: task.id },
      data: { photos: { push: publicUrl } },
      select: { id: true, photos: true }
    })

    return NextResponse.json({ url: publicUrl, task: updatedTask })
  } catch (error) {
    console.error('Error uploading checklist item photo:', error)
    return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 })
  }
}
