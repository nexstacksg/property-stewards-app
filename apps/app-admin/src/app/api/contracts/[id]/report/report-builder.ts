import { PassThrough } from "node:stream"

import {
  appendWorkOrderSection,
  getLogoBuffer,
  getPDFDocumentCtor,
  TABLE_MARGIN,
  FOOTER_RESERVED,
  formatEnum,
  formatScheduleRange,
  LOGO_ASPECT_RATIO,
  formatDateTime,
  formatDate,
  drawFooter
} from "@/lib/reports/work-order-pdf"

// Make watermark subtler to avoid obscuring table content in landscape
const WATERMARK_OPACITY = 0.1

export type ReportBuildOptions = {
  titleOverride?: string | null
  versionLabel: string
  generatedOn: Date
  allowedConditions?: string[] | null
  // When true, include only entry-level remarks that match allowedConditions
  // and suppress location remarks, task-level media-only blocks, and synthetic
  // "No remarks recorded." rows.
  entryOnly?: boolean
  filterByWorkOrderId?: string | null
  includePhotos?: boolean
}

function applyWatermark(doc: any, logoBuffer?: Buffer) {
  if (!logoBuffer) return

  const draw = () => {
    const pageW = doc.page.width
    const pageH = doc.page.height

    // 3x3 grid watermark (rotated, subtle)
    const rows = 3
    const cols = 3
    const angleDeg = -45

    // Compute cell size and pick a logo width that comfortably fits within each cell
    const cellW = pageW / cols
    const cellH = pageH / rows
    // Leave a bit of padding inside each cell
    const maxLogoW = cellW * 0.7
    const maxLogoH = cellH * 0.7
    const logoWByH = maxLogoH / LOGO_ASPECT_RATIO
    const wmWidth = Math.min(maxLogoW, logoWByH)
    const wmHeight = wmWidth * LOGO_ASPECT_RATIO

    doc.save()
    doc.opacity(WATERMARK_OPACITY)
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const cx = (c + 0.5) * cellW
        const cy = (r + 0.5) * cellH
        doc.save()
        doc.translate(cx, cy)
        doc.rotate(angleDeg)
        doc.image(logoBuffer, -wmWidth / 2, -wmHeight / 2, { width: wmWidth })
        doc.restore()
      }
    }
    doc.opacity(1)
    doc.restore()
  }

  doc.on("pageAdded", draw)
  draw()
}

function applyFooter(doc: any) {
  // Keep default footer (center message) if needed elsewhere
  let drawing = false
  const draw = () => {
    if (drawing) return
    drawing = true
    try { drawFooter(doc) } catch {} finally { drawing = false }
  }
  doc.on("pageAdded", draw)
  draw()
}

// New: write version (left) and page X of Y (right) on each page footer
function stampFooterVersionAndPaging(doc: any, versionLabel: string) {
  const range = typeof doc.bufferedPageRange === 'function' ? doc.bufferedPageRange() : undefined
  const count = range?.count ?? (doc._pageBuffer?.length ?? 1)
  for (let i = 0; i < count; i += 1) {
    if (typeof doc.switchToPage === 'function') doc.switchToPage(i)
    try { drawFooter(doc) } catch {}
    const leftX = TABLE_MARGIN
    const rightX = doc.page.width - TABLE_MARGIN
    const y = doc.page.height - TABLE_MARGIN - 10
    const pageLabel = `Page ${i + 1}${count ? ` of ${count}` : ''}`
    doc.save()
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
    try { doc.text(`Version: ${versionLabel}`, leftX, y, { width: 200, align: 'left', lineBreak: false }) } catch {}
    try { doc.text(pageLabel, rightX - 200, y, { width: 200, align: 'right', lineBreak: false }) } catch {}
    doc.restore()
  }
}

function appendSignOffSection(doc: any, contract: any) {
  const companyName = "Property Stewards PTE. LTD"

  const rows = 2
  const cols = 2
  const gapX = 16
  const gapY = 16
  const boxHeight = 110

  const required = rows * boxHeight + (rows - 1) * gapY
  const availableSpace = doc.page.height - TABLE_MARGIN - FOOTER_RESERVED - doc.y
  if (availableSpace < required + 40) {
    doc.addPage()
  }

  doc.moveDown(3)

  const boxWidth = (doc.page.width - TABLE_MARGIN * 2 - gapX) / cols
  const topY = doc.y
  const startX = TABLE_MARGIN

  const drawBox = (x: number, y: number, label?: string) => {
    // Give more breathing room between the label and the Name field
    const nameLabelY = y + 26
    const nameLineY = y + 40
    const sigLabelY = y + 58
    const sigLineY = y + 74
    const dateLabelY = y + 90
    const dateLineY = y + 106
    doc.save()
    doc.roundedRect(x, y, boxWidth, boxHeight, 6).stroke()
    if (label && label.trim()) {
      doc.font("Helvetica-Bold").fontSize(10).text(label, x + 10, y + 8, { width: boxWidth - 20 })
    }
    doc.font("Helvetica").fontSize(10)
    doc.text("Name:", x + 10, nameLabelY)
    doc.moveTo(x + 60, nameLineY).lineTo(x + boxWidth - 10, nameLineY).stroke()
    doc.text("Signature:", x + 10, sigLabelY)
    doc.moveTo(x + 60, sigLineY).lineTo(x + boxWidth - 10, sigLineY).stroke()
    doc.text("Date:", x + 10, dateLabelY)
    doc.moveTo(x + 60, dateLineY).lineTo(x + boxWidth - 10, dateLineY).stroke()
    doc.restore()
  }

  // 2 x 2 grid: three free boxes (no label) and one labeled for company
  const positions: Array<{ r: number; c: number; label?: string }> = [
    { r: 0, c: 0, label: companyName },
    { r: 0, c: 1 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
  ]
  positions.forEach(({ r, c, label }) => {
    const x = startX + c * (boxWidth + gapX)
    const y = topY + r * (boxHeight + gapY)
    drawBox(x, y, label)
  })

  doc.y = topY + required
  doc.moveDown(0.5)

  // Add a full-width Remarks box below the signatures
  const remarksHeight = 160
  const gapBelowSign = 12
  let remarksY = doc.y + gapBelowSign
  let available = doc.page.height - TABLE_MARGIN - FOOTER_RESERVED - remarksY
  if (available < remarksHeight) {
    doc.addPage()
    remarksY = TABLE_MARGIN
  }

  const remarksWidth = doc.page.width - TABLE_MARGIN * 2
  const remarksX = TABLE_MARGIN
  doc.save()
  try {
    doc.roundedRect(remarksX, remarksY, remarksWidth, remarksHeight, 6).stroke()
    // Title
    doc.font('Helvetica-Bold').fontSize(10)
    doc.text('Remarks', remarksX + 10, remarksY + 8, { width: remarksWidth - 20 })
  } finally {
    doc.restore()
  }

  doc.y = remarksY + remarksHeight
  doc.moveDown(0.5)
}

async function writeContractReport(doc: any, contract: any, options: ReportBuildOptions) {
  const workOrders = contract.workOrders || []

  const logoBuffer = getLogoBuffer()

  applyWatermark(doc, logoBuffer ?? undefined)
  // Footer center text will be applied later along with version/paging
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
  const generatedDateOnly = formatDate(options.generatedOn) || new Date(options.generatedOn).toLocaleDateString("en-SG", { dateStyle: "medium" })
  // Per updated spec: include Generated (date only) and Contract ID
  doc.text(`Generated: ${generatedDateOnly}`)
  doc.text(`Contract ID: ${contract.id}`)
  // Remove contract-level schedule line per request

  if (contract.customer) {
    doc.text(`Customer: ${contract.customer.name}`)
  }

  if (contract.address) {
    const combined = [contract.address.address, contract.address.postalCode].filter(Boolean).join(', ')
    doc.text(`Property: ${combined}`)
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

  // Remove explicit Work Orders heading line per spec
  const combinedSchedule = formatScheduleRange(minScheduledStart, maxScheduledEnd)
  // if (combinedSchedule) {
  //   doc.font("Helvetica").fontSize(11).text(`Schedule: ${combinedSchedule}`)
  // }
  const actualRange = formatScheduleRange(minActualStart, maxActualEnd)
  // if (actualRange) {
  //   doc.text(`Actual: ${actualRange}`)
  // }
  // Add explicit inspection start date (earliest actualStart among work orders)
  if (minActualStart) {
    const inspectionStart = formatDateTime(minActualStart)
    if (inspectionStart) {
      doc.text(`Inspection Start: ${inspectionStart}`)
    }
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
    filterByWorkOrderId: options.filterByWorkOrderId ?? null,
    allowedConditions: options.allowedConditions ?? undefined,
    entryOnly: options.entryOnly ?? false,
    includePhotos: options.includePhotos !== false,
  })


  // Final page sign-off
  appendSignOffSection(doc, contract)
  // drawFooter(doc)

}

export async function createContractReportBuffer(contract: any, options: ReportBuildOptions) {
  const PDFDocument = await getPDFDocumentCtor()
  // Buffer pages so we can stamp version + paging after layout
  const doc: any = new PDFDocument({ size: "A4", layout: 'landscape', margin: TABLE_MARGIN, bufferPages: true })
  const stream = new PassThrough()
  const chunks: Buffer[] = []

  doc.pipe(stream)
  stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)))

  const completionPromise = new Promise<Buffer>((resolve, reject) => {
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", reject)
  })

  await writeContractReport(doc, contract, options)
  // Stamp version + paging footer on all pages
  try { stampFooterVersionAndPaging(doc, options.versionLabel) } catch {}
  doc.end()

  return completionPromise
}
