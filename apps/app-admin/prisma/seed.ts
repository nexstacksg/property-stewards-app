import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

type SeedChecklistTask = {
  name: string
  status: 'COMPLETED' | 'PENDING'
  photos?: string[]
  videos?: string[]
}

type SeedInspectorEntry = {
  inspectorId?: string
  userId?: string
  remarks?: string
  includeInReport?: boolean
  photos?: string[]
  videos?: string[]
  tasks?: SeedChecklistTask[]
}

type SeedChecklistItem = {
  contractChecklistId: string
  name: string
  remarks?: string
  condition?: 'GOOD' | 'FAIR' | 'UNSATISFACTORY' | 'NOT_APPLICABLE' | 'UNOBSERVABLE'
  enteredOn?: Date
  enteredById?: string
  order: number
  status: 'COMPLETED' | 'PENDING'
  photos?: string[]
  videos?: string[]
  tasks?: SeedChecklistTask[]
  inspectorEntries?: SeedInspectorEntry[]
}

async function main() {
  console.log('Starting seed...')

  // Clear existing data
  await prisma.propertySizeOption.deleteMany()
  await prisma.property.deleteMany()
  await prisma.checklistTask.deleteMany()
  await prisma.itemEntry.deleteMany()
  await prisma.contractChecklistItem.deleteMany()
  await prisma.contractChecklist.deleteMany()
  await prisma.workOrder.deleteMany()
  await prisma.contract.deleteMany()
  await prisma.checklistItem.deleteMany()
  await prisma.checklist.deleteMany()
  await prisma.customerAddress.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.inspector.deleteMany()
  await prisma.user.deleteMany()

  // Create Inspectors
  const inspector1 = await prisma.inspector.create({
    data: {
      name: 'John Tan',
      mobilePhone: '91234567',
      type: 'FULL_TIME',
      specialization: 'HDB, Condo, Electrical',
      remarks: 'Senior inspector with 5 years experience',
      status: 'ACTIVE'
    }
  })

  const inspector2 = await prisma.inspector.create({
    data: {
      name: 'Sarah Lim',
      mobilePhone: '98765432',
      type: 'FULL_TIME',
      specialization: 'Condo, Landed, Plumbing',
      remarks: 'Specializes in high-end properties',
      status: 'ACTIVE'
    }
  })

  const inspector3 = await prisma.inspector.create({
    data: {
      name: 'Ahmad Rahman',
      mobilePhone: '92345678',
      type: 'PART_TIME',
      specialization: 'HDB, General',
      remarks: 'Available weekends only',
      status: 'ACTIVE'
    }
  })

  console.log('Created inspectors:', { inspector1, inspector2, inspector3 })

  const adminPasswordHash = await bcrypt.hash('admin123', 10)
  const adminUser = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: adminPasswordHash,
      confirmed: true,
    }
  })

  console.log('Created admin user:', { id: adminUser.id, email: adminUser.email })

  // Create Customers
  const customer1 = await prisma.customer.create({
    data: {
      name: 'Tan Holdings Pte Ltd',
      type: 'COMPANY',
      personInCharge: 'Mr. Tan Wei Ming',
      email: 'tan.weiming@tanholdings.sg',
      phone: '62345678',
      isMember: true,
      memberSince: new Date('2023-01-15'),
      memberTier: 'GOLD',
      billingAddress: '1 Raffles Place, #20-01, Singapore 048616',
      remarks: 'VIP client - priority service',
      status: 'ACTIVE'
    }
  })

  const customer2 = await prisma.customer.create({
    data: {
      name: 'Rachel Wong',
      type: 'INDIVIDUAL',
      personInCharge: 'Rachel Wong',
      email: 'rachel.wong@gmail.com',
      phone: '97465867',
      isMember: true,
      memberSince: new Date('2024-03-01'),
      memberTier: 'SILVER',
      billingAddress: 'Block 123, Ang Mo Kio Ave 3, #10-456, Singapore 560123',
      remarks: 'Preferred inspection time: mornings',
      status: 'ACTIVE'
    }
  })

  const customer3 = await prisma.customer.create({
    data: {
      name: 'Bala Krishnan',
      type: 'INDIVIDUAL',
      personInCharge: 'Bala Krishnan',
      email: 'bala.k@outlook.com',
      phone: '94657354',
      isMember: false,
      billingAddress: '29 Jurong West Street 42, #15-09, Singapore 640029',
      status: 'ACTIVE'
    }
  })

  console.log('Created customers:', { customer1, customer2, customer3 })

  // Seed property catalogue (used for dropdowns and validation)
  const propertyHdb = await prisma.property.create({
    data: {
      code: 'HDB',
      name: 'HDB Flat',
      sizes: {
        create: [
          { code: '1_ROOM', name: '1-Room Flat' },
          { code: '2_ROOM', name: '2-Room Flat' },
          { code: '3_ROOM', name: '3-Room Flat' },
          { code: '4_ROOM', name: '4-Room Flat' },
          { code: '5_ROOM', name: '5-Room Flat' },
          { code: 'EXECUTIVE', name: 'Executive Flat' }
        ]
      }
    },
    include: { sizes: true }
  })

  const propertyCondo = await prisma.property.create({
    data: {
      code: 'CONDO',
      name: 'Condominium',
      sizes: {
        create: [
          { code: '1BR', name: '1 Bedroom' },
          { code: '2BR', name: '2 Bedroom' },
          { code: '3BR', name: '3 Bedroom' },
          { code: '4BR', name: '4 Bedroom' },
          { code: 'PENTHOUSE', name: 'Penthouse' }
        ]
      }
    },
    include: { sizes: true }
  })

  const propertyLanded = await prisma.property.create({
    data: {
      code: 'LANDED',
      name: 'Landed Property',
      sizes: {
        create: [
          { code: 'TERRACE', name: 'Terrace House' },
          { code: 'SEMI_DETACHED', name: 'Semi-Detached House' },
          { code: 'DETACHED', name: 'Detached House' },
          { code: 'GCB', name: 'Good Class Bungalow' }
        ]
      }
    },
    include: { sizes: true }
  })

  console.log('Seeded property catalogue:', {
    HDB: propertyHdb.sizes.length,
    CONDO: propertyCondo.sizes.length,
    LANDED: propertyLanded.sizes.length
  })

  // Create Customer Addresses
  const address1 = await prisma.customerAddress.create({
    data: {
      customerId: customer1.id,
      address: 'Block 9, Jalan Bahagia, #05-12',
      postalCode: '320009',
      propertyType: 'HDB',
      propertySize: 'HDB_4_ROOM',
      remarks: 'Corner unit, easy access',
      status: 'ACTIVE'
    }
  })

  const address2 = await prisma.customerAddress.create({
    data: {
      customerId: customer2.id,
      address: 'Block 27, Woodlands Drive 50, #04-05',
      postalCode: '730027',
      propertyType: 'HDB',
      propertySize: 'HDB_5_ROOM',
      remarks: 'Near MRT station',
      status: 'ACTIVE'
    }
  })

  const address3 = await prisma.customerAddress.create({
    data: {
      customerId: customer3.id,
      address: '29 Jurong Heights, #02-09',
      postalCode: '640029',
      propertyType: 'HDB',
      propertySize: 'HDB_3_ROOM',
      status: 'ACTIVE'
    }
  })

  const address4 = await prisma.customerAddress.create({
    data: {
      customerId: customer1.id,
      address: 'The Sail @ Marina Bay, Tower 1, #35-10',
      postalCode: '018988',
      propertyType: 'CONDO',
      propertySize: 'THREE_BEDROOM',
      remarks: 'Luxury unit with sea view',
      status: 'ACTIVE'
    }
  })

  console.log('Created addresses:', { address1, address2, address3, address4 })

  // Create Checklist Templates
  const checklistHDB = await prisma.checklist.create({
    data: {
      name: 'Standard HDB Inspection',
      propertyType: 'HDB',
      remarks: 'Standard checklist for HDB flats',
      status: 'ACTIVE',
      items: {
        create: [
          { name: 'Living Room', action: 'Check walls, ceiling, flooring, windows, and electrical points', order: 1 },
          { name: 'Master Bedroom', action: 'Inspect walls, windows, aircon, built-in wardrobe', order: 2 },
          { name: 'Bedroom 2', action: 'Inspect walls, windows, aircon, electrical points', order: 3 },
          { name: 'Bedroom 3', action: 'Inspect walls, windows, aircon, electrical points', order: 4 },
          { name: 'Kitchen', action: 'Check cabinets, sink, stove, hood, tiles, plumbing', order: 5 },
          { name: 'Bathroom 1', action: 'Check tiles, toilet, sink, shower, waterproofing', order: 6 },
          { name: 'Bathroom 2', action: 'Check tiles, toilet, sink, shower, waterproofing', order: 7 },
          { name: 'Service Yard', action: 'Check washing point, floor trap, ventilation', order: 8 },
          { name: 'Main Door', action: 'Check lock, hinges, door frame, peephole', order: 9 },
          { name: 'Windows', action: 'Check all windows for operation, seals, locks', order: 10 }
        ]
      }
    }
  })

  const checklistCondo = await prisma.checklist.create({
    data: {
      name: 'Premium Condo Inspection',
      propertyType: 'CONDO',
      remarks: 'Comprehensive checklist for condominium units',
      status: 'ACTIVE',
      items: {
        create: [
          { name: 'Entrance Foyer', action: 'Check flooring, walls, ceiling, lighting', order: 1 },
          { name: 'Living & Dining', action: 'Inspect flooring, walls, windows, balcony access', order: 2 },
          { name: 'Master Bedroom', action: 'Check walls, windows, aircon, walk-in wardrobe, ensuite', order: 3 },
          { name: 'Bedroom 2', action: 'Inspect walls, windows, aircon, built-ins', order: 4 },
          { name: 'Bedroom 3', action: 'Inspect walls, windows, aircon, built-ins', order: 5 },
          { name: 'Kitchen', action: 'Check appliances, cabinets, island, backsplash', order: 6 },
          { name: 'Master Bathroom', action: 'Check bathtub, shower, double vanity, tiles', order: 7 },
          { name: 'Common Bathroom', action: 'Check fixtures, tiles, ventilation', order: 8 },
          { name: 'Balcony', action: 'Check railings, flooring, drainage, ceiling', order: 9 },
          { name: 'Store Room', action: 'Check shelving, ventilation, electrical', order: 10 },
          { name: 'Smart Home', action: 'Test smart home systems if applicable', order: 11 }
        ]
      }
    }
  })

  console.log('Created checklists:', { checklistHDB, checklistCondo })

  // Create Contracts
  const contract1 = await prisma.contract.create({
    data: {
      customerId: customer1.id,
      addressId: address1.id,
      value: 850.00,
      firstPaymentOn: new Date('2024-08-20'),
      finalPaymentOn: new Date('2024-08-30'),
      basedOnChecklistId: checklistHDB.id,
      scheduledStartDate: new Date('2024-08-25T10:00:00Z'),
      scheduledEndDate: new Date('2024-08-25T12:00:00Z'),
      actualStartDate: new Date('2024-08-25T10:15:00Z'),
      actualEndDate: new Date('2024-08-25T11:45:00Z'),
      servicePackage: 'Premium Inspection',
      contractType: 'INSPECTION',
      customerComments: 'Very thorough inspection, satisfied with service',
      customerRating: 5,
      status: 'COMPLETED'
    }
  })

  const contract2 = await prisma.contract.create({
    data: {
      customerId: customer2.id,
      addressId: address2.id,
      value: 650.00,
      firstPaymentOn: new Date('2024-08-22'),
      basedOnChecklistId: checklistHDB.id,
      scheduledStartDate: new Date('2024-08-27T14:00:00Z'),
      scheduledEndDate: new Date('2024-08-27T16:00:00Z'),
      servicePackage: 'Standard Inspection',
      contractType: 'INSPECTION',
      status: 'SCHEDULED'
    }
  })

  const contract3 = await prisma.contract.create({
    data: {
      customerId: customer3.id,
      addressId: address3.id,
      value: 550.00,
      firstPaymentOn: new Date('2024-08-23'),
      basedOnChecklistId: checklistHDB.id,
      scheduledStartDate: new Date('2024-08-28T09:00:00Z'),
      scheduledEndDate: new Date('2024-08-28T11:00:00Z'),
      servicePackage: 'Basic Inspection',
      contractType: 'REPAIR',
      status: 'CONFIRMED'
    }
  })

  const contract4 = await prisma.contract.create({
    data: {
      customerId: customer1.id,
      addressId: address4.id,
      value: 1200.00,
      firstPaymentOn: new Date('2024-08-15'),
      basedOnChecklistId: checklistCondo.id,
      scheduledStartDate: new Date('2024-08-30T10:00:00Z'),
      scheduledEndDate: new Date('2024-08-30T13:00:00Z'),
      servicePackage: 'Luxury Property Inspection',
      contractType: 'INSPECTION',
      remarks: 'High-priority client, ensure senior inspector',
      status: 'CONFIRMED'
    }
  })

  console.log('Created contracts:', { contract1, contract2, contract3, contract4 })

  // Create Contract Checklists (for scheduled/completed contracts)
  const contractChecklist1 = await prisma.contractChecklist.create({
    data: {
      contractId: contract1.id,
      status: 'ACTIVE'
    }
  })

  await prisma.contractChecklist.create({
    data: {
      contractId: contract2.id,
      status: 'ACTIVE'
    }
  })

  const checklistItemSeeds: SeedChecklistItem[] = [
    {
      contractChecklistId: contractChecklist1.id,
      name: 'Living Room',
      remarks: 'Minor crack on ceiling near corner, paint peeling near window',
      condition: 'FAIR' as const,
      enteredOn: new Date('2024-08-25T10:30:00Z'),
      enteredById: inspector1.id,
      order: 1,
      status: 'COMPLETED' as const,
      photos: ['https://spaces.example.com/living-room-overview.jpg'],
      videos: [],
      tasks: [
        {
          name: 'Inspect walls and ceiling',
          status: 'COMPLETED',
          photos: ['https://spaces.example.com/photo1.jpg'],
          videos: []
        },
        {
          name: 'Test electrical outlets',
          status: 'COMPLETED',
          photos: ['https://spaces.example.com/photo2.jpg'],
          videos: []
        }
      ],
      inspectorEntries: [
        {
          inspectorId: inspector1.id,
          remarks: 'Recommend repainting within the month to prevent peeling.',
          includeInReport: true,
          tasks: [
            {
              name: 'Document ceiling crack',
              status: 'COMPLETED',
              photos: ['https://spaces.example.com/photo1-detail.jpg'],
              videos: []
            }
          ]
        },
        {
          inspectorId: inspector2.id,
          remarks: 'Scheduled painting contractor follow-up for next week.',
          includeInReport: false,
          tasks: [
            {
              name: 'Capture paint condition for contractor',
              status: 'PENDING',
              photos: ['https://spaces.example.com/photo1-contractor.jpg'],
              videos: []
            }
          ]
        },
        {
          userId: adminUser.id,
          remarks: 'Internal QA note: monitor for recurring moisture.',
          includeInReport: false,
          photos: [],
          videos: [],
          tasks: []
        },
      ]
    },
    {
      contractChecklistId: contractChecklist1.id,
      name: 'Master Bedroom',
      remarks: 'Aircon servicing needed, slight water stain on ceiling',
      condition: 'FAIR' as const,
      enteredOn: new Date('2024-08-25T10:45:00Z'),
      enteredById: inspector1.id,
      order: 2,
      status: 'COMPLETED' as const,
      photos: ['https://spaces.example.com/master-bedroom-overview.jpg'],
      videos: ['https://spaces.example.com/master-bedroom-walkthrough.mp4'],
      tasks: [
        {
          name: 'Check air-conditioning performance',
          status: 'COMPLETED',
          photos: ['https://spaces.example.com/photo3.jpg'],
          videos: []
        },
        {
          name: 'Record ceiling water stain',
          status: 'COMPLETED',
          videos: ['https://spaces.example.com/video1.mp4']
        }
      ],
      inspectorEntries: [
        {
          inspectorId: inspector1.id,
          remarks: 'Advised tenant to schedule servicing within two weeks.',
          includeInReport: true,
          tasks: [
            {
              name: 'Capture aircon serial number',
              status: 'COMPLETED',
              photos: [],
              videos: []
            }
          ]
        }
      ]
    },
    {
      contractChecklistId: contractChecklist1.id,
      name: 'Kitchen',
      remarks: 'All cabinets in good condition, sink tap slightly loose',
      condition: 'GOOD' as const,
      enteredOn: new Date('2024-08-25T11:00:00Z'),
      enteredById: inspector1.id,
      order: 3,
      status: 'COMPLETED' as const,
      photos: ['https://spaces.example.com/kitchen-overview.jpg'],
      videos: [],
      tasks: [
        {
          name: 'Inspect cabinetry alignment',
          status: 'COMPLETED',
          photos: ['https://spaces.example.com/photo4.jpg'],
          videos: []
        }
      ],
      inspectorEntries: [
        {
          inspectorId: inspector1.id,
          remarks: 'Loose tap needs tightening – noted for maintenance team.',
          includeInReport: true,
          tasks: [
            {
              name: 'Record loose tap condition',
              status: 'COMPLETED',
              photos: [],
              videos: []
            }
          ]
        }
      ]
    },
    {
      contractChecklistId: contractChecklist1.id,
      name: 'Bathroom 1',
      remarks: 'Excellent condition, no issues found',
      condition: 'GOOD' as const,
      enteredOn: new Date('2024-08-25T11:15:00Z'),
      enteredById: inspector1.id,
      order: 4,
      status: 'COMPLETED' as const,
      photos: ['https://spaces.example.com/bathroom1-overview.jpg'],
      videos: [],
      tasks: [
        {
          name: 'Confirm waterproofing and drainage',
          status: 'COMPLETED',
          photos: ['https://spaces.example.com/photo5.jpg'],
          videos: []
        }
      ],
      inspectorEntries: []
    }
  ]

  for (const itemSeed of checklistItemSeeds) {
    const item = await prisma.contractChecklistItem.create({
      data: {
        contractChecklistId: itemSeed.contractChecklistId,
        name: itemSeed.name,
        remarks: itemSeed.remarks,
        condition: itemSeed.condition,
        enteredOn: itemSeed.enteredOn,
        enteredById: itemSeed.enteredById,
        order: itemSeed.order,
        status: itemSeed.status,
        photos: itemSeed.photos ?? [],
        videos: itemSeed.videos ?? []
      }
    })

    for (const task of itemSeed.tasks || []) {
      await prisma.checklistTask.create({
        data: {
          itemId: item.id,
          name: task.name,
          status: task.status,
          photos: task.photos ?? [],
          videos: task.videos ?? []
        }
      })
    }

    for (const entrySeed of itemSeed.inspectorEntries || []) {
      if (!entrySeed.inspectorId && !entrySeed.userId) {
        throw new Error('Seed entry must include an inspectorId or userId')
      }

      const entry = await prisma.itemEntry.create({
        data: {
          itemId: item.id,
          inspectorId: entrySeed.inspectorId ?? undefined,
          userId: entrySeed.userId ?? undefined,
          remarks: entrySeed.remarks,
          includeInReport: entrySeed.includeInReport ?? false,
          photos: entrySeed.photos ?? [],
          videos: entrySeed.videos ?? []
        }
      })

      let linkedTaskId: string | undefined
      for (const task of entrySeed.tasks || []) {
        const createdTask = await prisma.checklistTask.create({
          data: {
            itemId: item.id,
            inspectorId: entrySeed.inspectorId ?? undefined,
            name: task.name,
            status: task.status,
            photos: task.photos ?? [],
            videos: task.videos ?? [],
            entries: {
              connect: { id: entry.id }
            }
          }
        })

        if (!linkedTaskId) {
          linkedTaskId = createdTask.id
        }
      }

      if (linkedTaskId) {
        await prisma.itemEntry.update({
          where: { id: entry.id },
          data: { taskId: linkedTaskId }
        })
      }
    }
  }

  // Create Work Orders
  const workOrder1 = await prisma.workOrder.create({
    data: {
      contractId: contract1.id,
      inspectors: { connect: [{ id: inspector1.id }] },
      scheduledStartDateTime: new Date('2024-08-25T10:00:00Z'),
      scheduledEndDateTime: new Date('2024-08-25T12:00:00Z'),
      actualStart: new Date('2024-08-25T10:15:00Z'),
      actualEnd: new Date('2024-08-25T11:45:00Z'),
      signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      signOffBy: 'Mr. Tan Wei Ming',
      remarks: 'Inspection completed successfully',
      status: 'COMPLETED'
    }
  })

  const workOrder2 = await prisma.workOrder.create({
    data: {
      contractId: contract2.id,
      inspectors: { connect: [{ id: inspector2.id }] },
      scheduledStartDateTime: new Date('2024-08-27T14:00:00Z'),
      scheduledEndDateTime: new Date('2024-08-27T16:00:00Z'),
      status: 'SCHEDULED'
    }
  })

  const workOrder3 = await prisma.workOrder.create({
    data: {
      contractId: contract3.id,
      inspectors: { connect: [{ id: inspector3.id }] },
      scheduledStartDateTime: new Date('2024-08-28T09:00:00Z'),
      scheduledEndDateTime: new Date('2024-08-28T11:00:00Z'),
      status: 'SCHEDULED'
    }
  })

  const workOrder4 = await prisma.workOrder.create({
    data: {
      contractId: contract4.id,
      inspectors: { connect: [{ id: inspector2.id }, { id: inspector1.id }] },
      scheduledStartDateTime: new Date('2024-08-30T10:00:00Z'),
      scheduledEndDateTime: new Date('2024-08-30T13:00:00Z'),
      remarks: 'Premium property - extra attention to detail required',
      status: 'SCHEDULED'
    }
  })

  console.log('Created work orders:', { workOrder1, workOrder2, workOrder3, workOrder4 })

  console.log('Seed completed successfully!')
  console.log('Summary:')
  console.log('- Property catalogue seeded (HDB, Condo, Landed) with',
    propertyHdb.sizes.length + propertyCondo.sizes.length + propertyLanded.sizes.length,
    'size options total')
  console.log('- 3 Inspectors created')
  console.log('- 3 Customers created')
  console.log('- 4 Customer addresses created')
  console.log('- 2 Checklist templates created (HDB & Condo)')
  console.log('- 4 Contracts created (1 completed, 2 scheduled, 1 confirmed)')
  console.log('- 4 Work orders created')
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
