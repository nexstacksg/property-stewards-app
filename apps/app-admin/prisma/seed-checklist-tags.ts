import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

type TagTemplate = {
  label: string
  tasks?: Array<{ label: string; subtasks?: string[] }>
}

const COMMON_TAGS: TagTemplate[] = [
  {
    label: "Walls",
    tasks: [{ label: "Walls", subtasks: ["Cracks", "Paint", "Stains"] }],
  },
  {
    label: "Ceiling",
    tasks: [{ label: "Ceiling", subtasks: ["Cracks", "Leaks", "Paint"] }],
  },
  {
    label: "Flooring",
    tasks: [{ label: "Floor", subtasks: ["Tiles", "Grout", "Scratches"] }],
  },
  {
    label: "Windows",
    tasks: [{ label: "Windows", subtasks: ["Lock", "Glass", "Paint"] }],
  },
  {
    label: "Doors",
    tasks: [{ label: "Door", subtasks: ["Lock", "Alignment", "Paint"] }],
  },
  {
    label: "Electrical Outlets",
    tasks: [{ label: "Electrical Outlets", subtasks: ["Power", "Cover", "Wiring"] }],
  },
  {
    label: "Light Fixtures",
    tasks: [{ label: "Light Fixtures", subtasks: ["Bulbs", "Covers", "Switches"] }],
  },
  {
    label: "Water Heater",
    tasks: [{ label: "Water Heater", subtasks: ["Operation", "Leaks", "Rust"] }],
  },
  {
    label: "Air-conditioning",
    tasks: [{ label: "Air-conditioning", subtasks: ["Filter", "Cooling", "Remote"] }],
  },
  {
    label: "Plumbing Fixtures",
    tasks: [{ label: "Plumbing", subtasks: ["Leaks", "Drainage", "Sealant"] }],
  },
  {
    label: "Cabinets",
    tasks: [{ label: "Cabinet", subtasks: ["Hinges", "Doors", "Shelves"] }],
  },
  {
    label: "Countertops",
    tasks: [{ label: "Countertop", subtasks: ["Surface", "Edges", "Sealant"] }],
  },
  {
    label: "Appliances",
    tasks: [{ label: "Appliance", subtasks: ["Function", "Cleanliness", "Damage"] }],
  },
  {
    label: "Balcony",
    tasks: [{ label: "Balcony", subtasks: ["Flooring", "Railing", "Drainage"] }],
  },
  {
    label: "Gate & Grilles",
    tasks: [{ label: "Gate & Grilles", subtasks: ["Alignment", "Lock", "Rust"] }],
  },
  {
    label: "Smoke Detector",
    tasks: [{ label: "Smoke Detector", subtasks: ["Power", "Alarm", "Expiry Date"] }],
  },
  {
    label: "Pest Inspection",
    tasks: [{ label: "Pest", subtasks: ["Droppings", "Damage", "Entry Points"] }],
  },
  {
    label: "Roof",
    tasks: [{ label: "Roof", subtasks: ["Tiles", "Flashing", "Leaks"] }],
  },
  {
    label: "Gutter",
    tasks: [{ label: "Gutter", subtasks: ["Blockage", "Alignment", "Leaks"] }],
  },
  {
    label: "Water Pressure",
    tasks: [{ label: "Water Pressure", subtasks: ["Taps", "Showers", "Flow"] }],
  },
]

async function main() {
  console.log(`Seeding ${COMMON_TAGS.length} checklist tags...`)

  for (const tag of COMMON_TAGS) {
    const normalized = tag.label.trim()
    if (!normalized) continue

    await prisma.checklistTag.upsert({
      where: { label: normalized },
      update: {
        updatedOn: new Date(),
        taskTemplates: tag.tasks ?? undefined,
      },
      create: {
        label: normalized,
        taskTemplates: tag.tasks ?? undefined,
      },
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
