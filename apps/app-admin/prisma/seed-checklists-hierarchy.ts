import { PrismaClient, PropertyType } from '@prisma/client'

const prisma = new PrismaClient()

type ChecklistSeed = {
  name: string
  propertyType: PropertyType
  remarks?: string
  items: Array<{
    name: string
    category?: string
    tasks: Array<{
      name: string
      actions: string[]
    }>
  }>
}

const checklistSeeds: ChecklistSeed[] = [
  {
    name: 'Standard HDB Inspection',
    propertyType: 'HDB',
    remarks: 'Standard checklist for HDB flats with common room-by-room coverage.',
    items: [
      {
        name: 'Living Room',
        tasks: [
          {
            name: 'Structure',
            actions: [
              'Inspect walls for cracks, stains, and uneven paint',
              'Check ceiling for leaks or bulging',
              'Inspect flooring for hollow tiles and scratches'
            ]
          },
          {
            name: 'Fixtures',
            actions: [
              'Test windows for smooth operation and secure locks',
              'Verify electrical outlets and light switches are working'
            ]
          }
        ]
      },
      {
        name: 'Master Bedroom',
        tasks: [
          {
            name: 'Structure',
            actions: [
              'Inspect wall finish and ceiling condition',
              'Check windows and air conditioning unit'
            ]
          },
          {
            name: 'Built-ins',
            actions: [
              'Inspect built-in wardrobe for alignment and hinges',
              'Test electrical outlets around the bed area'
            ]
          }
        ]
      },
      {
        name: 'Kitchen',
        tasks: [
          {
            name: 'Cabinetry',
            actions: [
              'Inspect cabinet doors for alignment and water damage',
              'Check countertop integrity and backsplash sealing'
            ]
          },
          {
            name: 'Appliances & Plumbing',
            actions: [
              'Test sink taps for pressure and leaks',
              'Verify hob, hood, and electrical points are operational'
            ]
          }
        ]
      },
      {
        name: 'Bathrooms',
        tasks: [
          {
            name: 'Waterproofing',
            actions: [
              'Perform water ponding test on floor trap areas',
              'Inspect grout lines for gaps or discoloration'
            ]
          },
          {
            name: 'Fixtures',
            actions: [
              'Check toilet, sink, and shower operation',
              'Test ventilation fan and lighting'
            ]
          }
        ]
      },
      {
        name: 'Service Yard',
        tasks: [
          {
            name: 'Utility Points',
            actions: [
              'Inspect washing machine inlet and drainage',
              'Check ventilation and floor trap condition'
            ]
          }
        ]
      }
    ]
  },
  {
    name: 'Premium Condo Inspection',
    propertyType: 'CONDO',
    remarks: 'Comprehensive checklist tailored for condominium finishes.',
    items: [
      {
        name: 'Entrance Foyer',
        tasks: [
          {
            name: 'Structure & Finishes',
            actions: [
              'Inspect flooring transitions and skirting',
              'Check ceiling recess lighting and sensors'
            ]
          }
        ]
      },
      {
        name: 'Living & Dining',
        tasks: [
          {
            name: 'Structure',
            actions: [
              'Inspect walls for uneven paint or cracks',
              'Check balcony doors for alignment and sealing'
            ]
          },
          {
            name: 'Electrical & Smart Home',
            actions: [
              'Test power outlets, lighting, and dimmers',
              'Verify smart home controls for lights and curtains'
            ]
          }
        ]
      },
      {
        name: 'Bedrooms',
        tasks: [
          {
            name: 'Comfort',
            actions: [
              'Check air conditioning units and remotes',
              'Inspect window treatments and locks'
            ]
          },
          {
            name: 'Storage',
            actions: [
              'Inspect built-in wardrobes and drawers',
              'Check flooring for scratches or tile hollowness'
            ]
          }
        ]
      },
      {
        name: 'Kitchen & Utility',
        tasks: [
          {
            name: 'Appliances',
            actions: [
              'Test induction hob, oven, and dishwasher',
              'Verify hood suction and filter condition'
            ]
          },
          {
            name: 'Plumbing',
            actions: [
              'Check sink mixer and water pressure',
              'Inspect storage heater or instant heater units'
            ]
          }
        ]
      },
      {
        name: 'Bathrooms',
        tasks: [
          {
            name: 'Finishes',
            actions: [
              'Inspect marble or tile surfaces for chips',
              'Check vanity alignment and storage soft-close mechanisms'
            ]
          },
          {
            name: 'Wet Area',
            actions: [
              'Test shower mixers and rain shower',
              'Check glass enclosure sealing and drainage'
            ]
          }
        ]
      },
      {
        name: 'Balcony',
        tasks: [
          {
            name: 'Safety & Drainage',
            actions: [
              'Inspect railing stability and height compliance',
              'Check floor gradient and drainage outlets'
            ]
          }
        ]
      }
    ]
  }
]

async function main() {
  console.log('Seeding checklist templates with hierarchical tasks...')

  await prisma.checklistItemTask.deleteMany()
  await prisma.checklistItem.deleteMany()
  await prisma.checklist.deleteMany()

  for (const checklist of checklistSeeds) {
    await prisma.checklist.create({
      data: {
        name: checklist.name,
        propertyType: checklist.propertyType,
        remarks: checklist.remarks,
        status: 'ACTIVE',
        items: {
          create: checklist.items.map((item, itemIndex) => ({
            name: item.name,
            category: item.category || 'GENERAL',
            order: itemIndex + 1,
            tasks: {
              create: item.tasks.map((task, taskIndex) => ({
                name: task.name,
                order: taskIndex + 1,
                actions: task.actions
              }))
            }
          }))
        }
      }
    })
  }

  console.log('Checklist template seeding completed.')
}

main()
  .catch((error) => {
    console.error('Checklist template seeding failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
