import { NextRequest } from "next/server"
import { PassThrough, Readable } from "node:stream"
import prisma from "@/lib/prisma"
import { buildWorkOrderReportFilename } from "@/lib/filename"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COLUMN_WIDTHS = [40, 150, 80, 140, 110]
const TABLE_MARGIN = 36
const CELL_PADDING = 8
const MAX_IMAGES_PER_CELL = 1
const PHOTO_HEIGHT = 60
const MAX_MEDIA_LINKS = 4

let PDFDocumentCtor: any | null = null

async function getPDFDocumentCtor() {
  if (!PDFDocumentCtor) {
    const pdfkitModule = await import("pdfkit")
    PDFDocumentCtor = (pdfkitModule as any).default ?? pdfkitModule
  }

  return PDFDocumentCtor
}

function formatDate(value?: Date | string | null) {
  if (!value) return "N/A"
  try {
    return new Date(value).toLocaleString("en-SG", {
      dateStyle: "medium",
      timeStyle: "short"
    })
  } catch (error) {
    return String(value)
  }
}

function formatEnum(value?: string | null) {
  if (!value) return ""
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

type EntryLike = {
  inspector?: { name?: string | null } | null
  user?: { username?: string | null; email?: string | null } | null
  remarks?: string | null
  condition?: string | null
  createdOn?: Date | string | null
  photos?: string[] | null
  videos?: string[] | null
}

type TableCell = {
  text?: string
  bold?: boolean
  images?: Buffer[]
}

type TableRow = [TableCell, TableCell, TableCell, TableCell, TableCell]

async function fetchImage(url: string): Promise<Buffer | null> {
  if (!url) return null

  try {
    if (url.startsWith("data:")) {
      const base64 = url.split(",")[1]
      return Buffer.from(base64, "base64")
    }

    const response = await fetch(url)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    return null
  }
}

async function loadImages(urls: string[], cache: Map<string, Buffer>): Promise<Buffer[]> {
  const result: Buffer[] = []

  for (const url of urls.slice(0, MAX_IMAGES_PER_CELL)) {
    if (!url) continue
    if (cache.has(url)) {
      result.push(cache.get(url)!)
      continue
    }

    const buffer = await fetchImage(url)
    if (buffer) {
      cache.set(url, buffer)
      result.push(buffer)
    }
  }

  return result
}

function formatEntryLine(entry: EntryLike) {
  const reporter = entry.inspector?.name || entry.user?.username || entry.user?.email || "Team member"
  const remarkText = entry.remarks?.trim()
  return remarkText && remarkText.length > 0 ? `${reporter} - ${remarkText}` : `${reporter}`
}

function collectMediaFromEntries(entries: EntryLike[]) {
  const photos = new Set<string>()
  const videos = new Set<string>()
  entries.forEach((entry) => {
    if (Array.isArray(entry.photos)) {
      entry.photos.forEach((photo) => {
        if (photo) photos.add(photo)
      })
    }
    if (Array.isArray(entry.videos)) {
      entry.videos.forEach((video) => {
        if (video) videos.add(video)
      })
    }
  })
  return { photos, videos }
}

function buildMediaCell(photos: string[], videos: string[], images: Buffer[]): TableCell {
  const remainingPhotoUrls = photos.slice(images.length)
  const lines: string[] = []

  if (remainingPhotoUrls.length > 0) {
    lines.push("Photos:")
    remainingPhotoUrls.slice(0, MAX_MEDIA_LINKS).forEach((url, index) => {
      lines.push(`• Photo ${images.length + index + 1}: ${url}`)
    })
    if (remainingPhotoUrls.length > MAX_MEDIA_LINKS) {
      lines.push(`• +${remainingPhotoUrls.length - MAX_MEDIA_LINKS} more photo link(s)`)
    }
  }

  if (videos.length > 0) {
    lines.push(lines.length ? "Videos:" : "Videos:")
    videos.slice(0, MAX_MEDIA_LINKS).forEach((url, index) => {
      lines.push(`• Video ${index + 1}: ${url}`)
    })
    if (videos.length > MAX_MEDIA_LINKS) {
      lines.push(`• +${videos.length - MAX_MEDIA_LINKS} more video link(s)`)
    }
  }

  return {
    images,
    text: lines.length ? lines.join("\n") : ""
  }
}

async function buildTableRows(items: any[], imageCache: Map<string, Buffer>): Promise<TableRow[]> {
  const rows: TableRow[] = []

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]
    const standaloneEntries = (item.contributions || []).filter((entry: any) => !entry.taskId)
    const itemRemarkLines: string[] = []

    if (typeof item.remarks === "string" && item.remarks.trim().length > 0) {
      itemRemarkLines.push(`Summary - ${item.remarks.trim()}`)
    }

    standaloneEntries.forEach((entry: EntryLike) => {
      itemRemarkLines.push(formatEntryLine(entry))
    })

    const { photos: entryPhotos, videos: entryVideos } = collectMediaFromEntries(standaloneEntries)
    const itemPhotoUrls = new Set<string>(Array.isArray(item.photos) ? item.photos : [])
    entryPhotos.forEach((photo) => itemPhotoUrls.add(photo))

    const itemVideoUrls = new Set<string>(Array.isArray(item.videos) ? item.videos : [])
    entryVideos.forEach((video) => itemVideoUrls.add(video))

    const itemImages = await loadImages(Array.from(itemPhotoUrls), imageCache)
    const itemMediaCell = buildMediaCell(Array.from(itemPhotoUrls), Array.from(itemVideoUrls), itemImages)

    rows.push([
      { text: String(itemIndex + 1), bold: true },
      { text: item.name || item.item || `Checklist Item ${itemIndex + 1}`, bold: true },
      { text: formatEnum(item.status ?? undefined) || "N/A", bold: true },
      { text: itemRemarkLines.length ? itemRemarkLines.join("\n") : "No remarks provided." },
      itemMediaCell
    ])

    const tasks = Array.isArray(item.checklistTasks) ? item.checklistTasks : []

    for (let taskIndex = 0; taskIndex < tasks.length; taskIndex += 1) {
      const task = tasks[taskIndex]
      const label = `${String.fromCharCode(97 + taskIndex)}. ${task.name || "Subtask"}`
      const entries = Array.isArray(task.entries) ? task.entries : []

      const { photos: taskEntryPhotos, videos: taskEntryVideos } = collectMediaFromEntries(entries)
      const taskRemarkLines = entries.map((entry: EntryLike) => formatEntryLine(entry)).filter((line) => Boolean(line))
      const taskPhotoUrls = new Set<string>(Array.isArray(task.photos) ? task.photos : [])
      taskEntryPhotos.forEach((photo) => taskPhotoUrls.add(photo))

      const taskVideoUrls = new Set<string>(Array.isArray(task.videos) ? task.videos : [])
      taskEntryVideos.forEach((video) => taskVideoUrls.add(video))

      const taskImages = await loadImages(Array.from(taskPhotoUrls), imageCache)
      const taskMediaCell = buildMediaCell(Array.from(taskPhotoUrls), Array.from(taskVideoUrls), taskImages)
      const conditionText = formatEnum(task.condition ?? undefined) || formatEnum(task.status ?? undefined) || "N/A"

      rows.push([
        { text: "" },
        { text: label },
        { text: conditionText },
        { text: taskRemarkLines.length ? taskRemarkLines.join("\n") : "" },
        taskMediaCell
      ])
    }
  }

  return rows
}

function calculateRowHeight(doc: PDFDocument, cells: TableCell[]) {
  let rowHeight = 0

  cells.forEach((cell, index) => {
    const width = COLUMN_WIDTHS[index] - CELL_PADDING * 2
    let cellHeight = 0

    if (cell.text) {
      doc.font(cell.bold ? "Helvetica-Bold" : "Helvetica")
      const textHeight = doc.heightOfString(cell.text, {
        width,
        align: "left"
      })
      cellHeight = Math.max(cellHeight, textHeight)
    }

    if (cell.images && cell.images.length) {
      const imagesHeight = PHOTO_HEIGHT * cell.images.length + (cell.images.length - 1) * 6
      cellHeight = Math.max(cellHeight, imagesHeight)
    }

    rowHeight = Math.max(rowHeight, cellHeight)
  })

  return Math.max(rowHeight + CELL_PADDING * 2, 24)
}

function drawTableRow(doc: PDFDocument, y: number, cells: TableCell[], options: { header?: boolean } = {}) {
  const { header = false } = options
  const rowHeight = calculateRowHeight(doc, cells)
  let x = TABLE_MARGIN

  cells.forEach((cell, index) => {
    const width = COLUMN_WIDTHS[index]
    doc.lineWidth(0.7)

    if (header) {
      doc.save()
      doc.rect(x, y, width, rowHeight).fill("#e2e8f0")
      doc.restore()
      doc.rect(x, y, width, rowHeight).stroke()
      doc.font("Helvetica-Bold")
    } else {
      doc.rect(x, y, width, rowHeight).stroke()
      doc.font(cell.bold ? "Helvetica-Bold" : "Helvetica")
    }

    doc.fillColor("#111827")

    let textStartY = y + CELL_PADDING

    if (cell.images && cell.images.length) {
      let imageY = y + CELL_PADDING
      cell.images.forEach((buffer) => {
        doc.image(buffer, x + CELL_PADDING, imageY, {
          fit: [width - CELL_PADDING * 2, PHOTO_HEIGHT],
          align: "center",
          valign: "top"
        })
        imageY += PHOTO_HEIGHT + 6
      })
      textStartY = Math.max(textStartY, y + CELL_PADDING + cell.images.length * (PHOTO_HEIGHT + 6) - 6)
    }

    if (cell.text && cell.text.trim().length > 0) {
      doc.text(cell.text, x + CELL_PADDING, textStartY, {
        width: width - CELL_PADDING * 2,
        align: "left"
      })
    }

    x += width
  })

  return rowHeight
}

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
          }
        }
      },
      inspectors: true
    }
  })
}

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const workOrder = await getWorkOrder(id)

  if (!workOrder) {
    return new Response("Work order not found", { status: 404 })
  }

  const PDFDocument = await getPDFDocumentCtor()
  const doc = new PDFDocument({ size: "A4", margin: TABLE_MARGIN })
  const stream = new PassThrough()
  doc.pipe(stream)

  doc.font("Helvetica-Bold").fontSize(18).text("Work Order Inspection Report", {
    align: "center"
  })
  doc.moveDown()

  doc.font("Helvetica").fontSize(12)
  doc.text(`Status: ${formatEnum(workOrder.status)}`)
  doc.text(
    `Scheduled: ${formatDate(workOrder.scheduledStartDateTime)} – ${formatDate(workOrder.scheduledEndDateTime)}`
  )

  if (workOrder.contract) {
    doc.text(`Customer: ${workOrder.contract.customer?.name ?? "N/A"}`)

    const address = workOrder.contract.address
    if (address) {
      doc.text(`Property: ${address.address}`)
      doc.text(`Postal Code: ${address.postalCode}`)
    }
  }

  doc.moveDown(1.5)

  const items = workOrder.contract?.contractChecklist?.items ?? []
  const imageCache = new Map<string, Buffer>()
  const tableRows = await buildTableRows(items as any[], imageCache)

  doc.fontSize(10)
  let y = doc.y

  const headerRow: TableCell[] = [
    { text: "S/N", bold: true },
    { text: "Item / Subtask", bold: true },
    { text: "Status / Condition", bold: true },
    { text: "Remarks / Defects Noted", bold: true },
    { text: "Media", bold: true }
  ]

  const headerHeight = drawTableRow(doc, y, headerRow, { header: true })
  y += headerHeight

  tableRows.forEach((row) => {
    const remainingSpace = doc.page.height - TABLE_MARGIN - y
    const requiredHeight = calculateRowHeight(doc, row)

    if (requiredHeight > remainingSpace) {
      doc.addPage()
      y = TABLE_MARGIN
      const headerAgainHeight = drawTableRow(doc, y, headerRow, { header: true })
      y += headerAgainHeight
    }

    const consumedHeight = drawTableRow(doc, y, row)
    y += consumedHeight
  })

  if (items.length === 0) {
    doc.moveDown().font("Helvetica").text("No checklist items found for this work order.")
  }

  doc.end()

  const customerName = workOrder.contract?.customer?.name
  const postalCode = workOrder.contract?.address?.postalCode
  const fileName = buildWorkOrderReportFilename(customerName, postalCode, workOrder.id)

  return new Response(Readable.toWeb(stream), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${fileName}\"`
    }
  })
}
