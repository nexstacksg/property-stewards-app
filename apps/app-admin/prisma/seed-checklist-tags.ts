import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const COMMON_TAGS = [
  "Walls",
  "Ceiling",
  "Flooring",
  "Windows",
  "Doors",
  "Electrical Outlets",
  "Light Fixtures",
  "Water Heater",
  "Air-conditioning",
  "Plumbing Fixtures",
  "Cabinets",
  "Countertops",
  "Appliances",
  "Balcony",
  "Gate & Grilles",
  "Smoke Detector",
  "Pest Inspection",
  "Roof",
  "Gutter",
  "Water Pressure",
]

async function main() {
  console.log(`Seeding ${COMMON_TAGS.length} checklist tags...`)

  for (const label of COMMON_TAGS) {
    const normalized = label.trim()
    if (!normalized) continue

    await prisma.checklistTag.upsert({
      where: { label: normalized },
      update: { updatedOn: new Date() },
      create: { label: normalized },
    })
  }

  const total = await prisma.checklistTag.count()
  console.log(`Checklist tag seeding complete. Total tags in database: ${total}`)
}

main()
  .catch((error) => {
    console.error("Failed to seed checklist tags", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
