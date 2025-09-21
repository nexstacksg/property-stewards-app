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

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    const contentType = file.type || 'application/octet-stream'
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are allowed' }, { status: 400 })
    }

    const extension = (() => {
      const fromType = contentType.split('/')[1]
      if (fromType) return fromType
      const name = (file as any).name as string | undefined
      if (name && name.includes('.')) return name.split('.').pop() as string
      return 'jpeg'
    })()
    const filename = `${randomUUID()}.${extension}`
    const key = `${SPACE_DIRECTORY}/work-orders/${workOrderId}/contributions/${id}/photos/${filename}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read'
    } as any))

    const publicUrl = `${PUBLIC_URL}/${key}`

    const entry = await prisma.itemEntry.findUnique({
      where: { id },
      include: {
        task: {
          select: {
            id: true,
            photos: true,
            videos: true,
            name: true,
            status: true,
            condition: true,
          }
        },
        item: { select: { name: true, status: true, id: true } },
        inspector: { select: { id: true } }
      }
    })

    if (!entry) {
      return NextResponse.json({ error: 'Contribution not found' }, { status: 404 })
    }

    let task = entry.task
    if (!task) {
      task = await prisma.checklistTask.create({
        data: {
          itemId: entry.itemId,
          inspectorId: entry.inspectorId ?? entry.inspector?.id ?? null,
          name: entry.item?.name ? `${entry.item.name} — notes` : 'Inspector notes',
          status: entry.item?.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING'
        }
      })

      await prisma.itemEntry.update({
        where: { id: entry.id },
        data: { taskId: task.id }
      })
    }

    const updatedTask = await prisma.checklistTask.update({
      where: { id: task.id },
      data: { photos: { push: publicUrl } },
      select: {
        id: true,
        photos: true,
        videos: true,
        condition: true,
        name: true,
        status: true
      }
    })

    const refreshedEntry = await prisma.itemEntry.findUnique({
      where: { id: entry.id },
      include: {
        inspector: { select: { id: true, name: true } },
        task: {
          select: {
            id: true,
            name: true,
            status: true,
            photos: true,
            videos: true,
            condition: true,
          }
        }
      }
    })

    return NextResponse.json({ url: publicUrl, task: updatedTask, entry: refreshedEntry })
  } catch (error) {
    console.error('Error uploading contribution photo:', error)
    return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 })
  }
}
