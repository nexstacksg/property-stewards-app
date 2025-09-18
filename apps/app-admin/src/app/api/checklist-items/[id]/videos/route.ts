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

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Accept only video content types
    const contentType = file.type || 'application/octet-stream'
    if (!contentType.startsWith('video/')) {
      return NextResponse.json({ error: 'Only video uploads are allowed' }, { status: 400 })
    }

    const extension = (() => {
      const fromType = contentType.split('/')[1]
      if (fromType) return fromType
      const name = (file as any).name as string | undefined
      if (name && name.includes('.')) return name.split('.').pop() as string
      return 'mp4'
    })()
    const filename = `${randomUUID()}.${extension}`
    const key = `${SPACE_DIRECTORY}/work-orders/${workOrderId}/items/${id}/videos/${filename}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read'
    } as any)
    await s3Client.send(command)

    const publicUrl = `${PUBLIC_URL}/${key}`

    const updated = await prisma.contractChecklistItem.update({
      where: { id },
      data: {
        videos: { push: publicUrl }
      },
      select: { id: true, videos: true }
    })

    const entry = await prisma.itemEntry.create({
      data: {
        itemId: id,
        inspectorId: null,
        photos: [],
        videos: [publicUrl]
      },
      select: { id: true }
    })

    return NextResponse.json({ url: publicUrl, item: updated, entry })
  } catch (error) {
    console.error('Error uploading checklist item video:', error)
    return NextResponse.json({ error: 'Failed to upload video' }, { status: 500 })
  }
}
