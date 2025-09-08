import { PrismaClient } from '@prisma/client'

// Cast to any to avoid type errors before generating Prisma client
const prisma: any = new PrismaClient()

async function main() {
  console.log('Seeding Property types...')
  const propertyTypes = [
    { code: 'HDB', name: 'HDB' },
    { code: 'CONDO', name: 'Condo' },
    { code: 'EC', name: 'EC' },
    { code: 'APARTMENT', name: 'Apartment' },
    { code: 'LANDED', name: 'Landed' }
  ]

  // Upsert to avoid duplicates and keep id stable-ish by code
  for (const p of propertyTypes) {
    await prisma.property.upsert({
      where: { code: p.code },
      update: { name: p.name, status: 'ACTIVE' },
      create: { code: p.code, name: p.name, status: 'ACTIVE' }
    })
  }

  console.log('Property types seeded.')
}

main()
  .catch((e) => {
    console.error('Error seeding Property types:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
