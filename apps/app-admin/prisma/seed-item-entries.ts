import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('[seed-item-entries] start')

  // Get a few existing checklist items to attach entries to
  const items = await prisma.contractChecklistItem.findMany({
    orderBy: { order: 'asc' },
    take: 5,
    select: { id: true, contractChecklistId: true, order: true }
  })
  if (items.length === 0) {
    console.log('[seed-item-entries] no checklist items found; nothing to seed')
    return
  }

  // Get some active inspectors
  const inspectors = await prisma.inspector.findMany({
    where: { status: 'ACTIVE' },
    take: 3,
    select: { id: true, name: true }
  })
  if (inspectors.length === 0) {
    console.log('[seed-item-entries] no active inspectors; nothing to seed')
    return
  }

  const [i1, i2, i3] = inspectors
  const updates: any[] = []

  // First item: two inspectors
  const first = items[0]
  if (first && i1 && i2) {
    updates.push(
      prisma.itemEntry.upsert({
        where: { itemId_inspectorId: { itemId: first.id, inspectorId: i1.id } },
        update: { remarks: `${i1.name}: Sample remark — hairline crack near window.` },
        create: {
          itemId: first.id,
          inspectorId: i1.id,
          remarks: `${i1.name}: Sample remark — hairline crack near window.`,
          photos: ['https://spaces.example.com/seed/ie1.jpg'],
          includeInReport: true
        }
      }),
      prisma.itemEntry.upsert({
        where: { itemId_inspectorId: { itemId: first.id, inspectorId: i2.id } },
        update: { remarks: `${i2.name}: Sample remark — sockets/lighting OK.` },
        create: {
          itemId: first.id,
          inspectorId: i2.id,
          remarks: `${i2.name}: Sample remark — sockets/lighting OK.`,
          photos: ['https://spaces.example.com/seed/ie2.jpg'],
          includeInReport: false
        }
      })
    )
  }

  // Second item: third inspector, with video
  const second = items[1]
  if (second && i3) {
    updates.push(
      prisma.itemEntry.upsert({
        where: { itemId_inspectorId: { itemId: second.id, inspectorId: i3.id } },
        update: { remarks: `${i3.name}: Sample remark — AC minor vibration.` },
        create: {
          itemId: second.id,
          inspectorId: i3.id,
          remarks: `${i3.name}: Sample remark — AC minor vibration.`,
          videos: ['https://spaces.example.com/seed/ie3.mp4'],
          includeInReport: true
        }
      })
    )
  }

  if (updates.length === 0) {
    console.log('[seed-item-entries] nothing to upsert')
    return
  }

  await prisma.$transaction(updates)
  console.log('[seed-item-entries] done; upserted', updates.length, 'entries')
}

main().catch((e) => {
  console.error('[seed-item-entries] error', e)
  process.exit(1)
}).finally(async () => {
  await prisma.$disconnect()
})
