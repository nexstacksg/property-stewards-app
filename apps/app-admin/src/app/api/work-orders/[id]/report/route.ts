import { NextRequest } from "next/server"
import { PassThrough, Readable } from "node:stream"

import prisma from "@/lib/prisma"
import { buildWorkOrderReportFilename } from "@/lib/filename"
import {
  appendWorkOrderSection,
  formatEnum,
  formatScheduleRange,
  LOGO_ASPECT_RATIO,
  getLogoBuffer,
  getPDFDocumentCtor,
  TABLE_MARGIN
} from "@/lib/reports/work-order-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function getWorkOrder(id: string) {
  return prisma.workOrder.findUnique({
    where: { id },
    include: {
      contract: {
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
                      },
                      media: {
                        orderBy: { order: 'asc' }
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
                          },
                          media: {
                            orderBy: { order: 'asc' }
                          }
                        },
                        orderBy: { createdOn: "asc" }
                      }
                    },
                    orderBy: { createdOn: "asc" }
                  }
                },
                orderBy: { order: "asc" }
              }
            }
          }
        }
      },
      inspectors: true
    }
  } as any)
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const workOrder = (await getWorkOrder(id)) as any

  if (!workOrder) {
    return new Response("Work order not found", { status: 404 })
  }

  const PDFDocument = await getPDFDocumentCtor()
  const doc: any = new PDFDocument({ size: "A4", margin: TABLE_MARGIN })
  const stream = new PassThrough()
  doc.pipe(stream)

  const logoBuffer = getLogoBuffer()
  if (logoBuffer) {
    const logoWidth = 220
    const logoHeight = logoWidth * LOGO_ASPECT_RATIO
    const logoX = (doc.page.width - logoWidth) / 2
    const logoY = doc.y
    doc.image(logoBuffer, logoX, logoY, { width: logoWidth })
    doc.y = logoY + logoHeight + 12
  }

  const contractTypeLabel = formatEnum(workOrder.contract?.contractType ?? undefined) || "Inspection"
  doc.font("Helvetica-Bold").fontSize(18).text(`Title: ${contractTypeLabel} Report`, {
    align: "center"
  })
  doc.moveDown()

  doc.font("Helvetica").fontSize(12)
  doc.text(`Status: ${formatEnum(workOrder.status)}`)
  const scheduledLine = formatScheduleRange(
    workOrder.scheduledStartDateTime,
    workOrder.scheduledEndDateTime
  )
  if (scheduledLine) {
    doc.text(`Scheduled: ${scheduledLine}`)
  }

  if (workOrder.contract) {
    doc.text(`Customer: ${workOrder.contract.customer?.name ?? "N/A"}`)

    const address = workOrder.contract.address
    if (address) {
      doc.text(`Property: ${address.address}`)
      doc.text(`Postal Code: ${address.postalCode}`)
    }
  }

  doc.moveDown(1)

  const imageCache = new Map<string, Buffer>()
  await appendWorkOrderSection(doc, workOrder, imageCache, {
    heading: "Inspection Checklist",
    includeMeta: false
  })

  doc.end()

  const customerName = workOrder.contract?.customer?.name
  const postalCode = workOrder.contract?.address?.postalCode
  const fileName = buildWorkOrderReportFilename(customerName, postalCode, workOrder.id)

  return new Response(Readable.toWeb(stream) as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${fileName}\"`
    }
  })
}
