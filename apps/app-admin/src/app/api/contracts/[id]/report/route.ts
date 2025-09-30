import { NextRequest } from "next/server"
import { PassThrough, Readable } from "node:stream"

import prisma from "@/lib/prisma"
import { buildContractReportFilename } from "@/lib/filename"
import {
  appendWorkOrderSection,
  getLogoBuffer,
  getPDFDocumentCtor,
  TABLE_MARGIN,
  formatEnum,
  formatScheduleRange,
  LOGO_ASPECT_RATIO
} from "@/lib/reports/work-order-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function getContractWithWorkOrders(id: string) {
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
                  }
                },
                orderBy: { createdOn: "asc" }
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
      }
    }
  }) as any
}

async function writeContractReport(doc: any, contract: any, customTitle?: string | null) {
  const workOrders = contract.workOrders || []

  const logoBuffer = getLogoBuffer()
  if (logoBuffer) {
    const logoWidth = 220
    const logoHeight = logoWidth * LOGO_ASPECT_RATIO
    const logoX = (doc.page.width - logoWidth) / 2
    const logoY = doc.y
    doc.image(logoBuffer, logoX, logoY, { width: logoWidth })
    doc.y = logoY + logoHeight + 12
  }

  const contractTypeLabel = formatEnum(contract.contractType) || "Inspection"
  const headingTitle = customTitle && customTitle.trim().length > 0
    ? customTitle.trim()
    : `${contractTypeLabel} Report`
  doc.font("Helvetica-Bold").fontSize(18).text(` ${headingTitle}`, { align: "center" })
  doc.moveDown()

  doc.font("Helvetica").fontSize(12)
  doc.text(`Contract ID: ${contract.id}`)
  doc.text(`Status: ${formatEnum(contract.status) || contract.status}`)
  const contractSchedule = formatScheduleRange(contract.scheduledStartDate, contract.scheduledEndDate)
  if (contractSchedule) {
    doc.text(`Schedule: ${contractSchedule}`)
  }

  if (contract.customer) {
    doc.text(`Customer: ${contract.customer.name}`)
  }

  if (contract.address) {
    doc.text(`Property: ${contract.address.address}`)
    doc.text(`Postal Code: ${contract.address.postalCode}`)
  }

  doc.moveDown()

  const imageCache = new Map<string, Buffer>()

  const workOrderLabels = workOrders.map((wo: any) => wo.id.slice(-8).toUpperCase())
  const combinedHeading = `Work Orders: ${workOrderLabels.join(' -- ')}`
  const scheduleStart = workOrders
    .map((wo: any) => (wo.scheduledStartDateTime ? new Date(wo.scheduledStartDateTime).getTime() : undefined))
    .filter((value: any): value is number => typeof value === 'number')
  const scheduleEnd = workOrders
    .map((wo: any) => (wo.scheduledEndDateTime ? new Date(wo.scheduledEndDateTime).getTime() : undefined))
    .filter((value: any): value is number => typeof value === 'number')

  const minScheduledStart = scheduleStart.length ? new Date(Math.min(...scheduleStart)).toISOString() : null
  const maxScheduledEnd = scheduleEnd.length ? new Date(Math.max(...scheduleEnd)).toISOString() : null

  const actualStarts = workOrders
    .map((wo: any) => (wo.actualStart ? new Date(wo.actualStart).getTime() : undefined))
    .filter((value: any): value is number => typeof value === 'number')
  const actualEnds = workOrders
    .map((wo: any) => (wo.actualEnd ? new Date(wo.actualEnd).getTime() : undefined))
    .filter((value: any): value is number => typeof value === 'number')

  const minActualStart = actualStarts.length ? new Date(Math.min(...actualStarts)).toISOString() : null
  const maxActualEnd = actualEnds.length ? new Date(Math.max(...actualEnds)).toISOString() : null

  const inspectorsMap = new Map<string, any>()
  workOrders.forEach((wo: any) => {
    (wo.inspectors || []).forEach((ins: any) => {
      if (!inspectorsMap.has(ins.id)) {
        inspectorsMap.set(ins.id, ins)
      }
    })
  })
  const combinedInspectors = Array.from(inspectorsMap.values())

  doc.font("Helvetica-Bold").fontSize(12).text(combinedHeading)
  const combinedSchedule = formatScheduleRange(minScheduledStart, maxScheduledEnd)
  if (combinedSchedule) {
    doc.font("Helvetica").fontSize(11).text(`Schedule: ${combinedSchedule}`)
  }
  const actualRange = formatScheduleRange(minActualStart, maxActualEnd)
  if (actualRange) {
    doc.text(`Actual: ${actualRange}`)
  }
  const workOrderStatusSummary = workOrders
    .map((wo: any) => `${wo.id.slice(-8).toUpperCase()}: ${formatEnum(wo.status) || wo.status}`)
    .join(' | ')
  if (workOrderStatusSummary) {
    doc.text(`Statuses: ${workOrderStatusSummary}`)
  }
  if (combinedInspectors.length) {
    const inspectorNames = combinedInspectors.map((ins: any) => ins.name).filter(Boolean).join(', ')
    if (inspectorNames) {
      doc.text(`Inspectors: ${inspectorNames}`)
    }
  }

  doc.moveDown()

  const combinedWorkOrder = {
    id: combinedHeading,
    status: workOrders.length === 1 ? workOrders[0].status : 'MULTIPLE',
    scheduledStartDateTime: minScheduledStart,
    scheduledEndDateTime: maxScheduledEnd,
    actualStart: minActualStart,
    actualEnd: maxActualEnd,
    inspectors: combinedInspectors,
    contract: {
      ...contract,
      workOrders: undefined
    }
  }

  await appendWorkOrderSection(doc, combinedWorkOrder, imageCache, {
    heading: 'Inspection Checklist',
    includeMeta: false,
    filterByWorkOrderId: null
  })
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const contract = await getContractWithWorkOrders(id)

  if (!contract) {
    return new Response("Contract not found", { status: 404 })
  }

  const workOrders = contract.workOrders || []
  if (workOrders.length === 0) {
    return new Response("No work orders linked to this contract", { status: 404 })
  }

  const PDFDocument = await getPDFDocumentCtor()
  const doc: any = new PDFDocument({ size: "A4", margin: TABLE_MARGIN })
  const stream = new PassThrough()
  doc.pipe(stream)

  const { searchParams } = new URL(request.url)
  const customTitle = searchParams.get("title")

  await writeContractReport(doc, contract, customTitle)

  doc.end()

  const fileName = buildContractReportFilename(contract.customer?.name, contract.address?.postalCode, contract.id)

  return new Response(Readable.toWeb(stream) as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${fileName}\"`
    }
  })
}
