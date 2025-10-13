import { PrismaClient } from '@prisma/client'
import { PROPERTY_SIZE_RANGE_OPTIONS } from '../src/lib/property-address'

const prisma = new PrismaClient()

async function main() {
  const defaults = PROPERTY_SIZE_RANGE_OPTIONS
  console.log(`[seed] upserting ${defaults.length} PropertySizeRangeOption rows`)
  let order = 0
  for (const opt of defaults) {
    await prisma.propertySizeRangeOption.upsert({
      where: { code: opt.value as any },
      update: { label: opt.label, order: order++, status: 'ACTIVE' as any },
      create: { code: opt.value as any, label: opt.label, order: order++, status: 'ACTIVE' as any },
    })
  }
  const count = await prisma.propertySizeRangeOption.count()
  console.log(`[seed] PropertySizeRangeOption total: ${count}`)
}

main().catch((e) => {
  console.error('Seed size ranges failed', e)
  process.exit(1)
}).finally(async () => {
  await prisma.$disconnect()
})

