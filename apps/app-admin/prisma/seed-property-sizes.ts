import { PrismaClient } from '@prisma/client'

// Cast to any to be resilient pre-generation
const prisma: any = new PrismaClient()

const SIZE_OPTIONS: Record<string, Array<{ code: string; name: string }>> = {
  HDB: [
    { code: 'HDB_1_ROOM', name: '1 Room' },
    { code: 'HDB_2_ROOM', name: '2 Room' },
    { code: 'HDB_3_ROOM', name: '3 Room' },
    { code: 'HDB_4_ROOM', name: '4 Room' },
    { code: 'HDB_5_ROOM', name: '5 Room' },
    { code: 'HDB_EXECUTIVE', name: 'Executive' },
    { code: 'HDB_JUMBO', name: 'Jumbo' }
  ],
  CONDO: [
    { code: 'STUDIO', name: 'Studio' },
    { code: 'ONE_BEDROOM', name: '1 Bedroom' },
    { code: 'TWO_BEDROOM', name: '2 Bedroom' },
    { code: 'THREE_BEDROOM', name: '3 Bedroom' },
    { code: 'FOUR_BEDROOM', name: '4 Bedroom' },
    { code: 'PENTHOUSE', name: 'Penthouse' }
  ],
  EC: [
    { code: 'STUDIO', name: 'Studio' },
    { code: 'ONE_BEDROOM', name: '1 Bedroom' },
    { code: 'TWO_BEDROOM', name: '2 Bedroom' },
    { code: 'THREE_BEDROOM', name: '3 Bedroom' },
    { code: 'FOUR_BEDROOM', name: '4 Bedroom' },
    { code: 'PENTHOUSE', name: 'Penthouse' }
  ],
  APARTMENT: [
    { code: 'STUDIO', name: 'Studio' },
    { code: 'ONE_BEDROOM', name: '1 Bedroom' },
    { code: 'TWO_BEDROOM', name: '2 Bedroom' },
    { code: 'THREE_BEDROOM', name: '3 Bedroom' },
    { code: 'FOUR_BEDROOM', name: '4 Bedroom' },
    { code: 'PENTHOUSE', name: 'Penthouse' }
  ],
  LANDED: [
    { code: 'TERRACE', name: 'Terrace' },
    { code: 'SEMI_DETACHED', name: 'Semi-Detached' },
    { code: 'DETACHED', name: 'Detached' },
    { code: 'BUNGALOW', name: 'Bungalow' },
    { code: 'GOOD_CLASS_BUNGALOW', name: 'Good Class Bungalow' }
  ]
}

async function main() {
  console.log('Seeding Property size options...')

  // Load all property types (by code)
  const properties = await prisma.property.findMany({ select: { id: true, code: true } })
  const propertyByCode = new Map<string, string>(properties.map((p: any) => [p.code, p.id]))

  for (const [propCode, sizes] of Object.entries(SIZE_OPTIONS)) {
    const propertyId = propertyByCode.get(propCode)
    if (!propertyId) {
      console.warn(`Property type ${propCode} not found; skipping its sizes.`)
      continue
    }

    for (const s of sizes) {
      await prisma.propertySizeOption.upsert({
        where: { propertyId_code: { propertyId, code: s.code } },
        update: { name: s.name, status: 'ACTIVE' },
        create: { propertyId, code: s.code, name: s.name, status: 'ACTIVE' }
      })
    }
  }

  console.log('Property size options seeded.')
}

main()
  .catch((e) => {
    console.error('Error seeding Property sizes:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

