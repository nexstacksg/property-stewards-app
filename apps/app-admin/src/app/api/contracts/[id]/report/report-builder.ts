import { PassThrough } from "node:stream"

import {
  appendWorkOrderSection,
  getLogoBuffer,
  getPDFDocumentCtor,
  TABLE_MARGIN,
  formatEnum,
  formatScheduleRange,
  LOGO_ASPECT_RATIO,
  formatDateTime,
  drawFooter
} from "@/lib/reports/work-order-pdf"

const WATERMARK_OPACITY = 0.15

export type ReportBuildOptions = {
  titleOverride?: string | null
  versionLabel: string
  generatedOn: Date
  allowedConditions?: string[] | null
  // When true, include only entry-level remarks that match allowedConditions
  // and suppress location remarks, task-level media-only blocks, and synthetic
  // "No remarks recorded." rows.
  entryOnly?: boolean
}

function applyWatermark(doc: any, logoBuffer?: Buffer) {
  if (!logoBuffer) return

  const draw = () => {
    const pageW = doc.page.width
    const pageH = doc.page.height

    // Target smaller logos; aim for 2–3 per page stacked vertically
    const angleDeg = -45
    const theta = (angleDeg * Math.PI) / 180

    // Pick a base unrotated width as a fraction of page width (slightly larger)
    let baseWidth = pageW * 0.42
    baseWidth = Math.max(120, Math.min(baseWidth, pageW * 0.6))
    let wmWidth = baseWidth
    let wmHeight = wmWidth * LOGO_ASPECT_RATIO

    // Compute rotated bounding box
    const rotBounds = (w: number, h: number) => {
      const rotW = Math.abs(w * Math.cos(theta)) + Math.abs(h * Math.sin(theta))
      const rotH = Math.abs(w * Math.sin(theta)) + Math.abs(h * Math.cos(theta))
      return { rotW, rotH }
    }

    const { rotW, rotH } = rotBounds(wmWidth, wmHeight)
    const maxW = pageW * 0.9
    const maxH = pageH * 0.9
    const scale = Math.min(maxW / rotW, maxH / rotH, 1)
    wmWidth *= scale
    wmHeight *= scale
    const { rotH: slotH } = rotBounds(wmWidth, wmHeight)

    // Decide how many logos fit vertically (2 or 3)
    const gapY = slotH * 0.25
    const usableH = pageH * 0.9
    let count = Math.floor((usableH + gapY) / (slotH + gapY))
    count = Math.max(2, Math.min(3, count))

    const totalH = count * slotH + (count - 1) * gapY
    const startY = (pageH - totalH) / 2 + slotH / 2
    const cx = pageW / 2

    doc.save()
    doc.opacity(WATERMARK_OPACITY)
    for (let i = 0; i < count; i += 1) {
      const cy = startY + i * (slotH + gapY)
      doc.save()
      doc.translate(cx, cy)
      doc.rotate(angleDeg)
      doc.image(logoBuffer, -wmWidth / 2, -wmHeight / 2, { width: wmWidth })
      doc.restore()
    }
    doc.opacity(1)
    doc.restore()
  }

  doc.on("pageAdded", draw)
  draw()
}

function applyFooter(doc: any) {
  // Use the centralized footer renderer so we keep layout consistent
  let drawing = false
  const draw = () => {
    if (drawing) return
    drawing = true
    try {
      drawFooter(doc)
    } catch {
      // no-op; footer drawing should never block report generation
    } finally {
      drawing = false
    }
  }

  // Draw on current and all subsequently added pages
  doc.on("pageAdded", draw)
  draw()
}

function appendSignOffSection(doc: any, contract: any) {
  const heading = "Sign-Off"
  const customerName = contract?.customer?.name || "Customer"
  const companyName = "Property Stewards PTE. LTD"

  const availableSpace = doc.page.height - TABLE_MARGIN - doc.y
  const boxHeight = 110
  if (availableSpace < boxHeight + 40) {
    doc.addPage()
  }

  doc.moveDown(3)
  doc.font("Helvetica-Bold").fontSize(12).text(heading)
  doc.moveDown(0.5)

  const gap = 16
  const boxWidth = (doc.page.width - TABLE_MARGIN * 2 - gap) / 2
  const topY = doc.y
  const leftX = TABLE_MARGIN
  const rightX = TABLE_MARGIN + boxWidth + gap

  const drawBox = (x: number, label: string) => {
    const lineY1 = topY + 42
    const lineY2 = topY + 78
    doc.save()
    doc.roundedRect(x, topY, boxWidth, boxHeight, 6).stroke()
    doc.font("Helvetica-Bold").fontSize(10).text(label, x + 10, topY + 10, { width: boxWidth - 20 })
    doc.font("Helvetica").fontSize(10)
    doc.text("Signature:", x + 10, topY + 28)
    doc.moveTo(x + 80, lineY1).lineTo(x + boxWidth - 10, lineY1).stroke()
    doc.text("Date:", x + 10, topY + 64)
    doc.moveTo(x + 80, lineY2).lineTo(x + boxWidth - 10, lineY2).stroke()
    doc.restore()
  }

  drawBox(leftX, `Customer: ${customerName}`)
  drawBox(rightX, companyName)

  doc.y = topY + boxHeight
  doc.moveDown(0.5)
}

async function writeContractReport(doc: any, contract: any, options: ReportBuildOptions) {
  const workOrders = contract.workOrders || []

  const logoBuffer = getLogoBuffer()

  applyWatermark(doc, logoBuffer ?? undefined)
  // Ensure footer appears on every page
  applyFooter(doc)
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

  const workOrderLabels = workOrders.map((wo: any) => wo.id )
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
    .map((wo: any) => `${wo.id}: ${formatEnum(wo.status) || wo.status}`)
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
    filterByWorkOrderId: null,
    allowedConditions: options.allowedConditions ?? undefined,
    entryOnly: options.entryOnly ?? false,
  })


  // Final page sign-off
  appendSignOffSection(doc, contract)
  // drawFooter(doc)

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
