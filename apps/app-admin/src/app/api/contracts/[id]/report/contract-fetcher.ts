import prisma from "@/lib/prisma"

export async function getContractWithWorkOrders(id: string) {
  return prisma.contract.findUnique({
    where: { id },
    include: {
      customer: true,
      address: true,
      contractChecklist: {
        include: {
          items: {
            include: {
              contributions: {
                include: {
                  inspector: true,
                  user: {
                    select: {
                      id: true,
                      username: true,
                      email: true
                    }
                  }
                },
                orderBy: { createdOn: "asc" }
              },
              checklistTasks: {
                include: {
                  entries: {
                    include: {
                      inspector: true,
                      user: {
                        select: {
                          id: true,
                          username: true,
                          email: true
                        }
                      }
                    },
                    orderBy: { createdOn: "asc" }
                  },
                  location: true
                },
                orderBy: { createdOn: "asc" }
              },
              locations: {
                orderBy: { order: "asc" }
              }
            },
            orderBy: { order: "asc" }
          }
        }
      },
      workOrders: {
        include: {
          inspectors: true
        },
        orderBy: { scheduledStartDateTime: "asc" }
      },
      reports: {
        orderBy: { generatedOn: "desc" }
      }
    }
  }) as any
}
