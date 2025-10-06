import { PassThrough } from "node:stream"

import {
  appendWorkOrderSection,
  getLogoBuffer,
  getPDFDocumentCtor,
  TABLE_MARGIN,
  formatEnum,
  formatScheduleRange,
  LOGO_ASPECT_RATIO,
  formatDateTime
} from "@/lib/reports/work-order-pdf"

const WATERMARK_OPACITY = 0.15

export type ReportBuildOptions = {
  titleOverride?: string | null
  versionLabel: string
  generatedOn: Date
}

function applyWatermark(doc: any, logoBuffer?: Buffer) {
  if (!logoBuffer) return

  const draw = () => {
    const maxWidth = doc.page.width * 0.95
    const maxHeight = doc.page.height * 0.95
    let watermarkWidth = maxWidth
    let watermarkHeight = watermarkWidth * LOGO_ASPECT_RATIO

    if (watermarkHeight > maxHeight) {
      watermarkHeight = maxHeight
      watermarkWidth = watermarkHeight / LOGO_ASPECT_RATIO
    }

    const x = (doc.page.width - watermarkWidth) / 2
    const y = (doc.page.height - watermarkHeight) / 2

    doc.save()
    doc.opacity(WATERMARK_OPACITY)
    doc.image(logoBuffer, x, y, { width: watermarkWidth })
    doc.opacity(1)
    doc.restore()
  }

  doc.on("pageAdded", draw)
  draw()
}

async function writeContractReport(doc: any, contract: any, options: ReportBuildOptions) {
  const workOrders = contract.workOrders || []

  const logoBuffer = getLogoBuffer()
  applyWatermark(doc, logoBuffer ?? undefined)
  if (logoBuffer) {
    const logoWidth = 220
    const logoHeight = logoWidth * LOGO_ASPECT_RATIO
    const logoX = (doc.page.width - logoWidth) / 2
    const logoY = doc.y
    doc.image(logoBuffer, logoX, logoY, { width: logoWidth })
    doc.y = logoY + logoHeight + 12
  }

  const contractTypeLabel = formatEnum(contract.contractType) || "Inspection"
  const headingTitle = options.titleOverride && options.titleOverride.trim().length > 0
    ? options.titleOverride.trim()
    : `${contractTypeLabel} Report`
  doc.font("Helvetica-Bold").fontSize(18).text(`${headingTitle}`, { align: "center" })
  doc.moveDown()

  doc.font("Helvetica").fontSize(12)
  const generatedStamp = formatDateTime(options.generatedOn) || new Date(options.generatedOn).toLocaleString("en-SG", {
    dateStyle: "medium",
    timeStyle: "short"
  })
  doc.text(`Version: ${options.versionLabel}`)
  doc.text(`Generated: ${generatedStamp}`)
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

export async function createContractReportBuffer(contract: any, options: ReportBuildOptions) {
  const PDFDocument = await getPDFDocumentCtor()
  const doc: any = new PDFDocument({ size: "A4", margin: TABLE_MARGIN })
  const stream = new PassThrough()
  const chunks: Buffer[] = []

  doc.pipe(stream)
  stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)))

  const completionPromise = new Promise<Buffer>((resolve, reject) => {
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", reject)
  })

  await writeContractReport(doc, contract, options)
  doc.end()

  return completionPromise
}
