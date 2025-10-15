import prisma from '@/lib/prisma'

export async function saveMediaForItem(itemId: string, inspectorId: string | null, publicUrl: string, mediaType: 'photo' | 'video') {
  if (inspectorId) {
    let entry = await prisma.itemEntry.findFirst({ where: { itemId, inspectorId }, orderBy: { createdOn: 'desc' } })
    if (!entry) entry = await prisma.itemEntry.create({ data: { itemId, inspectorId } })

    await prisma.itemEntry.update({
      where: { id: entry.id },
      data: mediaType === 'photo' ? { photos: { push: publicUrl } } : { videos: { push: publicUrl } }
    })
    return
  }

  await prisma.contractChecklistItem.update({
    where: { id: itemId },
    data: mediaType === 'photo' ? { photos: { push: publicUrl } } : { videos: { push: publicUrl } }
  })
}

export async function saveMediaToItemEntry(entryId: string, publicUrl: string, mediaType: 'photo' | 'video', caption?: string) {
  const entry = await prisma.itemEntry.update({
    where: { id: entryId },
    data: mediaType === 'photo' ? { photos: { push: publicUrl } } : { videos: { push: publicUrl } },
    select: { taskId: true }
  })

  try {
    await prisma.itemEntryMedia.create({
      data: {
        entryId,
        url: publicUrl,
        caption: caption && caption.trim().length > 0 ? caption.trim() : null,
        type: mediaType === 'photo' ? 'PHOTO' : 'VIDEO'
      }
    })
  } catch (e) {
    console.error('Failed to create ItemEntryMedia record', e)
  }

  if (entry.taskId) {
    await prisma.checklistTask.update({
      where: { id: entry.taskId },
      data: mediaType === 'photo' ? { photos: { push: publicUrl } } : { videos: { push: publicUrl } }
    })
  }
}

