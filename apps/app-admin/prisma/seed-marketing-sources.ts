import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding marketing sources...')
  const created = await Promise.all([
    prisma.marketingSource.upsert({
      where: { code: 'GOOGLE' },
      update: { name: 'Google', status: 'ACTIVE' },
      create: { code: 'GOOGLE', name: 'Google', status: 'ACTIVE' },
      select: { id: true, code: true, name: true, status: true },
    }),
    prisma.marketingSource.upsert({
      where: { code: 'REFERRAL' },
      update: { name: 'Referral', status: 'ACTIVE' },
      create: { code: 'REFERRAL', name: 'Referral', status: 'ACTIVE' },
      select: { id: true, code: true, name: true, status: true },
    }),
    prisma.marketingSource.upsert({
      where: { code: 'OTHERS' },
      update: { name: 'Others', status: 'ACTIVE' },
      create: { code: 'OTHERS', name: 'Others', status: 'ACTIVE' },
      select: { id: true, code: true, name: true, status: true },
    }),
  ])

  console.log('Seeded marketing sources:', created.map((s) => s.code).join(', '))
}

main()
  .catch((e) => {
    console.error('Marketing source seed failed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

