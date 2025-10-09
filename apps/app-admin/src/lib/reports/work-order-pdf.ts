import { readFileSync } from "node:fs"
import { join } from "node:path"

export const COLUMN_WIDTHS = [40, 95, 150, 90, 150]
export const TABLE_MARGIN = 36
const TABLE_WIDTH = COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0)
const CELL_PADDING = 8
const PHOTO_HEIGHT = 40
const PHOTO_CAPTION_GAP = 2
const PHOTO_CAPTION_FONT_SIZE = 8
const PHOTO_CAPTION_COLOR = "#475569"
const VIDEO_HEIGHT = 48
const MAX_MEDIA_LINKS = 4
const MEDIA_PER_ROW = 2
const MEDIA_GUTTER = 8
const SEGMENT_SPACING = 12
const LOGO_PATH = join(process.cwd(), "public", "logo.png")
const LOGO_ORIGINAL_WIDTH = 2560
const LOGO_ORIGINAL_HEIGHT = 986
export const LOGO_ASPECT_RATIO = LOGO_ORIGINAL_HEIGHT / LOGO_ORIGINAL_WIDTH

let LOGO_BUFFER: Buffer | null | undefined
let PDFDocumentCtor: any | null = null

export async function getPDFDocumentCtor() {
  if (!PDFDocumentCtor) {
    const pdfkitModule = await import("pdfkit")
    PDFDocumentCtor = (pdfkitModule as any).default ?? pdfkitModule
  }

  return PDFDocumentCtor
}

export function getLogoBuffer() {
  if (LOGO_BUFFER === undefined) {
    try {
      LOGO_BUFFER = readFileSync(LOGO_PATH)
    } catch (error) {
      console.error("Failed to load report logo", error)
      LOGO_BUFFER = null
    }
  }

  return LOGO_BUFFER ?? undefined
}

export function formatDateTime(value?: Date | string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("en-SG", {
    dateStyle: "medium",
    timeStyle: "short"
  })
}

export function formatDate(value?: Date | string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-SG", { dateStyle: "medium" })
}

export function formatScheduleRange(start?: Date | string | null, end?: Date | string | null) {
  const startStr = formatDateTime(start)
  const endStr = formatDateTime(end)

  if (startStr && endStr) {
    return `${startStr} - ${endStr}`
  }

  return startStr || endStr || ""
}

export function formatEnum(value?: string | null) {
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
  media?: {
    url?: string | null
    caption?: string | null
    type?: string | null
    order?: number | null
  }[] | null
}

type VideoItem = {
  url: string
  label: string
}

type CellSegment = {
  text?: string
  photos?: Buffer[]
  photoCaptions?: (string | null)[]
  videos?: VideoItem[]
}

type TableCell = {
  text?: string
  bold?: boolean
  photos?: Buffer[]
  photoCaptions?: (string | null)[]
  videos?: VideoItem[]
  segments?: CellSegment[]
}

type TableRow = [TableCell, TableCell, TableCell, TableCell, TableCell]

type TableRowInfo = {
  cells: TableRow
  summaryMedia?: CellSegment
}

function normalizeConditionValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  return text.toUpperCase()
}

function isConditionAllowed(value: unknown, allowed?: Set<string>): boolean {
  if (!allowed || allowed.size === 0) return true
  const normalized = normalizeConditionValue(value)
  if (!normalized) return true
  return allowed.has(normalized)
}

async function fetchImage(url: string): Promise<Buffer | null> {
  if (!url) return null

  try {
    if (url.startsWith("data:")) {
      const base64 = url.split(",")[1]
      return Buffer.from(base64, "base64")
    }

    if (!/^https?:/i.test(url)) {
      return null
    }

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    return null
  }
}

function preparePhotoLayout(
  doc: any,
  photoCount: number,
  captions: (string | null)[] | undefined,
  availableWidth: number
) {
  if (photoCount === 0) {
    const usableWidth = availableWidth - MEDIA_GUTTER * (MEDIA_PER_ROW - 1)
    const thumbWidth = usableWidth / MEDIA_PER_ROW
    return {
      thumbWidth,
      rowHeights: [] as number[],
      totalHeight: 0,
    }
  }

  const usableWidth = availableWidth - MEDIA_GUTTER * (MEDIA_PER_ROW - 1)
  const thumbWidth = usableWidth / MEDIA_PER_ROW
  const rows = Math.ceil(photoCount / MEDIA_PER_ROW)
  const rowHeights = new Array(rows).fill(PHOTO_HEIGHT)
  const normalizedCaptions = captions ?? []

  doc.save()
  doc.font("Helvetica").fontSize(PHOTO_CAPTION_FONT_SIZE)
  for (let index = 0; index < photoCount; index += 1) {
    const row = Math.floor(index / MEDIA_PER_ROW)
    const captionValue = normalizedCaptions[index]
    const caption = typeof captionValue === 'string' ? captionValue.trim() : ''
    if (!caption) continue
    const captionHeight = doc.heightOfString(caption, {
      width: thumbWidth,
      align: 'center'
    })
    const blockHeight = PHOTO_HEIGHT + PHOTO_CAPTION_GAP + captionHeight
    rowHeights[row] = Math.max(rowHeights[row], blockHeight)
  }
  doc.restore()

  let totalHeight = 0
  for (let row = 0; row < rowHeights.length; row += 1) {
    totalHeight += rowHeights[row]
    if (row < rowHeights.length - 1) {
      totalHeight += MEDIA_GUTTER
    }
  }

  return { thumbWidth, rowHeights, totalHeight }
}

function formatEntryLine(entry: EntryLike) {
  const metaParts: string[] = []

  if (entry.inspector?.name) {
    metaParts.push(`Inspector: ${entry.inspector.name}`)
  }

  const userName = entry.user?.username || entry.user?.email
  if (userName) {
    metaParts.push(`Admin: ${userName}`)
  }

  const recordedAt = formatDateTime(entry.createdOn)
  if (recordedAt) {
    metaParts.push(`Recorded: ${recordedAt}`)
  }

  if (metaParts.length === 0) {
    metaParts.push("Inspector: Team member")
  }

  const lines = [metaParts.join(" • ")]
  const remarkText = entry.remarks?.trim()
  if (remarkText && remarkText.length > 0) {
    lines.push(`Remarks: ${remarkText}`)
  }

  return lines.join("\n")
}

function truncateUrl(url: string, maxLength = 80) {
  if (url.length <= maxLength) return url
  return `${url.slice(0, maxLength - 3)}...`
}

function getCellSegments(cell: TableCell): CellSegment[] {
  if (cell.segments && cell.segments.length > 0) {
    return cell.segments
  }

  if ((cell.text && cell.text.trim().length > 0) || (cell.photos && cell.photos.length) || (cell.videos && cell.videos.length)) {
    return [{
      text: cell.text,
      photos: cell.photos,
      photoCaptions: cell.photoCaptions,
      videos: cell.videos
    }]
  }

  return []
}

function buildVideoItems(urls: string[]) {
  const visible = urls.slice(0, MAX_MEDIA_LINKS)
  const items: VideoItem[] = visible.map((url, index) => ({ url, label: `Video ${index + 1}` }))
  const overflowCount = urls.length - visible.length
  return {
    items,
    overflowLines:
      overflowCount > 0
        ? [`• +${overflowCount} more video link(s)`]
        : []
  }
}

function buildInspectorMeta(inspectorName?: string | null, recordedOn?: Date | string | null) {
  const parts: string[] = []
  parts.push(`Inspector: ${inspectorName || "Team member"}`)
  const recorded = formatDateTime(recordedOn)
  if (recorded) {
    parts.push(`Recorded: ${recorded}`)
  }
  return parts.join(' • ')
}

async function buildRemarkSegment({
  text,
  photoUrls = [],
  photoEntries,
  videoUrls = [],
  imageCache,
  seenPhotos,
  seenVideos
}: {
  text?: string
  photoUrls?: string[]
  photoEntries?: {
    url?: string | null
    caption?: string | null
  }[]
  videoUrls?: string[]
  imageCache: Map<string, Buffer>
  seenPhotos?: Set<string>
  seenVideos?: Set<string>
}): Promise<CellSegment | null> {
  const photoSourcesRaw = Array.isArray(photoEntries) && photoEntries.length > 0
    ? photoEntries
    : Array.isArray(photoUrls)
      ? photoUrls.map((url) => ({ url }))
      : []

  const filteredPhotoSources = photoSourcesRaw
    .map((entry) => ({
      url: typeof entry?.url === 'string' ? entry.url.trim() : '',
      caption: typeof entry?.caption === 'string' ? entry.caption.trim() : null,
    }))
    .filter((entry) => entry.url.length > 0)

  const uniquePhotoSources = filteredPhotoSources.filter((entry) => {
    if (!seenPhotos) return true
    if (seenPhotos.has(entry.url)) {
      return false
    }
    return true
  })

  uniquePhotoSources.forEach((entry) => seenPhotos?.add(entry.url))

  const normalizedVideos = Array.isArray(videoUrls) ? videoUrls : []
  const uniqueVideos = normalizedVideos.filter((url) => {
    if (!seenVideos) return true
    return !seenVideos.has(url)
  })

  uniqueVideos.forEach((url) => seenVideos?.add(url))

  const images: Buffer[] = []
  const photoCaptions: (string | null)[] = []

  for (const source of uniquePhotoSources) {
    if (!source.url) continue
    let buffer: Buffer | undefined
    if (imageCache.has(source.url)) {
      buffer = imageCache.get(source.url)!
    } else {
      const fetched = await fetchImage(source.url)
      if (fetched) {
        imageCache.set(source.url, fetched)
        buffer = fetched
      }
    }
    if (buffer) {
      images.push(buffer)
      photoCaptions.push(source.caption && source.caption.length > 0 ? source.caption : null)
    }
  }

  const lines: string[] = []
  const hasRemark = Boolean(text && text.trim().length > 0)
  if (hasRemark) {
    lines.push(text!.trim())
  }

  if (!hasRemark && images.length === 0) {
    return null
  }

  return {
    text: lines.length > 0 ? lines.join("\n") : undefined,
    photos: images,
    photoCaptions,
    videos: []
  }
}

async function buildTableRows(
  items: any[],
  imageCache: Map<string, Buffer>,
  allowedConditions?: Set<string>
): Promise<TableRowInfo[]> {
  const rows: TableRowInfo[] = []

  type PhotoEntry = { url: string; caption?: string | null }

  const toPhotoEntries = (value: any): PhotoEntry[] => {
    if (!Array.isArray(value)) return []
    return value
      .map((url: any) => (typeof url === 'string' ? url.trim() : ''))
      .filter((url: string) => url.length > 0)
      .map((url: string) => ({ url, caption: null }))
  }

  const fromMedia = (media: any): PhotoEntry[] => {
    if (!Array.isArray(media)) return []
    return media
      .filter((entry: any) => entry && entry.type === 'PHOTO' && typeof entry.url === 'string')
      .sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0))
      .map((entry: any) => ({
        url: entry.url.trim(),
        caption: typeof entry.caption === 'string' && entry.caption.trim().length > 0 ? entry.caption.trim() : null
      }))
      .filter((entry: { url: string }) => entry.url.length > 0)
  }

  const mergePhotoEntries = (
    ...lists: Array<PhotoEntry[]>
  ): PhotoEntry[] => {
    const seen = new Set<string>()
    const merged: PhotoEntry[] = []
    lists.forEach((list) => {
      list.forEach((entry) => {
        const url = entry.url.trim()
        if (!url || seen.has(url)) return
        seen.add(url)
        merged.push({ url, caption: entry.caption ?? null })
      })
    })
    return merged
  }

  const entryPhotoEntries = (entry: EntryLike): PhotoEntry[] => {
    const mediaEntries = fromMedia((entry as any)?.media)
    const legacy = toPhotoEntries(entry.photos)
    if (mediaEntries.length > 0) {
      return mergePhotoEntries(mediaEntries, legacy)
    }
    return mergePhotoEntries(legacy)
  }

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]
    const standaloneEntries = (item.contributions || []).filter((entry: any) => !entry.taskId)
    const reportEntries = standaloneEntries
      .filter((entry: any) => entry?.includeInReport !== false)
      .filter((entry: any) => isConditionAllowed(entry?.condition, allowedConditions))

    const itemSummarySegments: CellSegment[] = []
    const seenItemPhotos = new Set<string>()
    const seenItemVideos = new Set<string>()

    const itemPhotoEntries = mergePhotoEntries(
      fromMedia((item as any)?.media),
      toPhotoEntries(item.photos)
    )

    const itemMetaLine = buildInspectorMeta(item.enteredBy?.name, item.enteredOn)

    let summaryMedia: CellSegment | undefined

    if (typeof item.remarks === "string" && item.remarks.trim().length > 0) {
      const summaryLines: string[] = []
      if (itemMetaLine && !itemMetaLine.startsWith('Inspector: Team member')) {
        summaryLines.push(itemMetaLine)
      }
      summaryLines.push(`Summary - ${item.remarks.trim()}`)
      const summaryRemarkSegment = await buildRemarkSegment({
        text: summaryLines.join("\n"),
        photoUrls: [],
        videoUrls: [],
        imageCache,
        seenPhotos: undefined,
        seenVideos: undefined
      })
      if (summaryRemarkSegment) {
        itemSummarySegments.push(summaryRemarkSegment)
      }

      const summaryMediaSegment = await buildRemarkSegment({
        text: undefined,
        photoEntries: itemPhotoEntries,
        videoUrls: Array.isArray(item.videos) ? item.videos : [],
        imageCache,
        seenPhotos: seenItemPhotos,
        seenVideos: seenItemVideos
      })
      if (summaryMediaSegment) {
        summaryMediaSegment.text = undefined
        summaryMedia = summaryMediaSegment
      }
    } else if (
      (Array.isArray(item.photos) && item.photos.length > 0) ||
      (Array.isArray(item.videos) && item.videos.length > 0)
    ) {
      const mediaOnlySegment = await buildRemarkSegment({
        text: itemMetaLine || undefined,
        photoEntries: itemPhotoEntries,
        videoUrls: Array.isArray(item.videos) ? item.videos : [],
        imageCache,
        seenPhotos: seenItemPhotos,
        seenVideos: seenItemVideos
      })
      if (mediaOnlySegment) {
        itemSummarySegments.push(mediaOnlySegment)
      }
    }

    for (const entry of reportEntries as EntryLike[]) {
      const entrySegment = await buildRemarkSegment({
        text: formatEntryLine(entry),
        photoEntries: entryPhotoEntries(entry),
        videoUrls: Array.isArray(entry.videos) ? (entry.videos as string[]) : [],
        imageCache,
        seenPhotos: seenItemPhotos,
        seenVideos: seenItemVideos
      })
      if (entrySegment) {
        itemSummarySegments.push(entrySegment)
      }
    }

    const itemName = item.name || item.item || `Checklist Item ${itemIndex + 1}`
    const formattedItemStatus = formatEnum(item.status ?? undefined)
    const itemStatusFallback = formattedItemStatus || "N/A"
    const itemNumber = itemIndex + 1
    const itemStatusSuffix = formattedItemStatus ? ` (${formattedItemStatus.toLowerCase()})` : ""
    const itemLocations = Array.isArray(item.locations) ? item.locations : []
    const hasItemSummary = itemSummarySegments.length > 0 || Boolean(summaryMedia)
    const hasLocationRemarks = itemLocations.some((loc: any) => typeof loc?.remarks === 'string' && loc.remarks.trim().length > 0)
    const hasRemarkContent = hasItemSummary || hasLocationRemarks
    const tasks = Array.isArray(item.checklistTasks) ? [...item.checklistTasks] : []
    if (!tasks.some((task: any) => typeof task?.name === 'string' && task.name.trim().toLowerCase() === 'others')) {
      tasks.push({
        id: `synthetic-${item.id || itemIndex}`,
        name: 'Others',
        status: 'PENDING',
        condition: undefined,
        photos: [],
        videos: [],
        entries: [],
      })
    }

    type TaskGroup = { key: string; label: string; tasks: any[]; location?: any }
    const groups: TaskGroup[] = []
    const groupIndex = new Map<string, TaskGroup>()

    const generalLabel = itemName ? `${itemName} — General` : 'General'

    tasks.forEach((task: any) => {
      const locationId = task?.location?.id
      const rawLocationName = typeof task?.location?.name === 'string' ? task.location.name.trim() : ''
      const locationMeta = locationId ? itemLocations.find((loc: any) => loc?.id === locationId) : undefined
      const isOthers = typeof task?.name === 'string' && task.name.trim().toLowerCase() === 'others'
      const locationKey = locationId
        ? `loc-${locationId}`
        : rawLocationName
          ? `locname-${rawLocationName.toLowerCase()}`
          : isOthers
            ? 'others'
            : 'general'
      const locationLabel = isOthers
        ? 'Others'
        : locationMeta?.name?.trim() || rawLocationName || generalLabel

      if (!groupIndex.has(locationKey)) {
        const group: TaskGroup = { key: locationKey, label: locationLabel, tasks: [], location: locationMeta }
        groupIndex.set(locationKey, group)
        groups.push(group)
      }

      groupIndex.get(locationKey)!.tasks.push(task)
      if (locationMeta && !groupIndex.get(locationKey)!.location) {
        groupIndex.get(locationKey)!.location = locationMeta
      }
    })

    itemLocations.forEach((location: any) => {
      if (!location) return
      const locationKey = location.id ? `loc-${location.id}` : location.name ? `locname-${location.name.trim().toLowerCase()}` : null
      if (!locationKey) return
      if (!groupIndex.has(locationKey)) {
        const group: TaskGroup = {
          key: locationKey,
          label: location.name?.trim() || generalLabel,
          tasks: [],
          location
        }
        groupIndex.set(locationKey, group)
        groups.push(group)
      } else {
        const existing = groupIndex.get(locationKey)!
        if (!existing.location) {
          existing.location = location
        }
        if (!existing.label || existing.label === generalLabel) {
          existing.label = location.name?.trim() || existing.label
        }
      }
    })

    if (groups.length === 0) {
      const remarkCell: TableCell = hasRemarkContent
        ? itemSummarySegments.length
          ? { segments: itemSummarySegments }
          : summaryMedia
            ? { text: "See media below." }
            : { text: "See item remarks." }
        : { text: "No remarks provided." }

      rows.push({
        cells: [
          { text: String(itemNumber), bold: true },
          { text: `${itemName}${itemStatusSuffix}`, bold: true },
          { text: `${itemNumber}. ${itemName}${itemStatusSuffix}` },
          { text: itemStatusFallback },
          remarkCell
        ],
        summaryMedia
      })

      continue
    }

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex]
      const locationStatusRaw = group.location?.status ?? group.tasks.find((task: any) => task?.location)?.location?.status
      const locationStatus = formatEnum(locationStatusRaw ?? undefined) || itemStatusFallback
      const locationRemarkText = typeof group.location?.remarks === 'string' ? group.location.remarks.trim() : ''
      const locationSegments: CellSegment[] = []
      if (locationRemarkText.length > 0) {
        locationSegments.push({ text: locationRemarkText })
      }
      const combinedSegments: CellSegment[] = [...locationSegments]
      if (itemSummarySegments.length) {
        combinedSegments.push(...itemSummarySegments)
      }
      const locationRemarkCell: TableCell = combinedSegments.length
        ? { segments: combinedSegments }
        : summaryMedia
          ? { text: "See media below." }
          : { text: "" }
      const locationSummaryMedia = groupIndex === 0 ? summaryMedia : undefined

      const locationIndex = groupIndex + 1
      const locationNumber = `${itemNumber}.${locationIndex}`

      if (groupIndex === 0) {
        const itemLine = `${itemNumber}. ${itemName}${itemStatusSuffix}`
        const locationLine = `${locationNumber} ${group.label}`
        const combinedItemText = `${locationLine}`

        rows.push({
          cells: [
            { text: String(itemNumber), bold: true },
            { text: `${itemName}${itemStatusSuffix}`, bold: true },
            { text: combinedItemText, bold: true },
            { text: locationStatus },
            locationRemarkCell
          ],
          summaryMedia: locationSummaryMedia
        })
      } else {
        rows.push({
          cells: [
            { text: "" },
            { text: "" },
            { text: `${locationNumber} ${group.label}` },
            { text: locationStatus },
            locationRemarkCell
          ],
          summaryMedia: locationSummaryMedia
        })
      }

      for (let taskIdx = 0; taskIdx < group.tasks.length; taskIdx += 1) {
        const task = group.tasks[taskIdx]
        const taskConditionAllowed = isConditionAllowed(task?.condition, allowedConditions)
        const entries = Array.isArray(task.entries) ? task.entries : []
        const filteredEntries = entries
          .filter((entry: EntryLike) => (entry as any)?.includeInReport !== false)
          .filter((entry: EntryLike) => isConditionAllowed((entry as any)?.condition, allowedConditions))
        const taskSegments: CellSegment[] = []

        if (
          taskConditionAllowed &&
          ((Array.isArray(task.photos) && task.photos.length > 0) ||
            (Array.isArray(task.videos) && task.videos.length > 0))
        ) {
          const taskMetaLine = buildInspectorMeta(task.inspector?.name, task.createdOn)
          const taskMediaSegment = await buildRemarkSegment({
            text: taskMetaLine,
            photoEntries: mergePhotoEntries(
              fromMedia((task as any)?.media),
              toPhotoEntries(task.photos)
            ),
            videoUrls: Array.isArray(task.videos) ? task.videos : [],
            imageCache,
            seenPhotos: seenItemPhotos,
            seenVideos: seenItemVideos
          })
          if (taskMediaSegment) {
            taskSegments.push(taskMediaSegment)
          }
        }

        for (const entry of filteredEntries as EntryLike[]) {
          const taskEntrySegment = await buildRemarkSegment({
            text: formatEntryLine(entry),
            photoEntries: entryPhotoEntries(entry),
            videoUrls: Array.isArray(entry.videos) ? (entry.videos as string[]) : [],
            imageCache,
            seenPhotos: seenItemPhotos,
            seenVideos: seenItemVideos
          })
          if (taskEntrySegment) {
            taskSegments.push(taskEntrySegment)
          }
        }

        const conditionText = formatEnum(task.condition ?? undefined) || "N/A"
        const taskNumber = `${locationNumber}.${taskIdx + 1}`
        const taskLabel = `${taskNumber} ${task.name || "Subtask"}`

        if (!taskConditionAllowed && taskSegments.length === 0) {
          continue
        }

        rows.push({
          cells: [
            { text: "" },
            { text: "" },
            { text: taskLabel },
            { text: conditionText },
            taskSegments.length ? { segments: taskSegments } : { text: "" }
          ]
        })
      }
    }
  }

  return rows
}

function calculateRowHeight(doc: any, cells: TableCell[]) {
  let rowHeight = 0

  cells.forEach((cell, index) => {
    const width = COLUMN_WIDTHS[index] - CELL_PADDING * 2
    const segments = getCellSegments(cell)
    let cellHeight = 0

    segments.forEach((segment, segmentIndex) => {
      let segmentHeight = 0
      let mediaHeight = 0

      if (segment.photos && segment.photos.length) {
        const { totalHeight } = preparePhotoLayout(doc, segment.photos.length, segment.photoCaptions, width)
        mediaHeight += totalHeight
      }

      if (segment.videos && segment.videos.length) {
        if (mediaHeight > 0) {
          mediaHeight += MEDIA_GUTTER
        }
        const videoRows = Math.ceil(segment.videos.length / MEDIA_PER_ROW)
        mediaHeight += videoRows * VIDEO_HEIGHT + (videoRows - 1) * MEDIA_GUTTER
      }

      let textHeight = 0
      if (segment.text && segment.text.trim().length > 0) {
        doc.font(cell.bold ? "Helvetica-Bold" : "Helvetica")
        textHeight = doc.heightOfString(segment.text, {
          width,
          align: "left"
        })
      }

      segmentHeight += mediaHeight

      if (textHeight > 0 && mediaHeight > 0) {
        segmentHeight += MEDIA_GUTTER
      }

      segmentHeight += textHeight

      cellHeight += segmentHeight

      if (segmentIndex < segments.length - 1) {
        cellHeight += SEGMENT_SPACING
      }
    })

    rowHeight = Math.max(rowHeight, cellHeight)
  })

  return Math.max(rowHeight + CELL_PADDING * 2, 24)
}

function drawTableRow(doc: any, y: number, cells: TableCell[], options: { header?: boolean } = {}) {
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

    let contentTop = y + CELL_PADDING

    const drawPhotos = (startY: number, photos?: Buffer[], captions?: (string | null)[]) => {
      if (!photos || photos.length === 0) return 0
      const availableWidth = width - CELL_PADDING * 2
      const { thumbWidth, rowHeights, totalHeight } = preparePhotoLayout(doc, photos.length, captions, availableWidth)
      if (rowHeights.length === 0) return 0

      const rowStartYs: number[] = []
      let pointerY = startY
      for (let row = 0; row < rowHeights.length; row += 1) {
        rowStartYs[row] = pointerY
        pointerY += rowHeights[row]
        if (row < rowHeights.length - 1) {
          pointerY += MEDIA_GUTTER
        }
      }

      photos.forEach((buffer, index) => {
        const col = index % MEDIA_PER_ROW
        const row = Math.floor(index / MEDIA_PER_ROW)
        const drawX = x + CELL_PADDING + col * (thumbWidth + MEDIA_GUTTER)
        const drawY = rowStartYs[row]

        try {
          doc.image(buffer, drawX, drawY, {
            fit: [thumbWidth, PHOTO_HEIGHT],
            align: "center",
            valign: "top"
          })
        } catch (error) {
          console.error("Failed to render photo in PDF", error)
          doc.save()
          doc.rect(drawX, drawY, thumbWidth, PHOTO_HEIGHT).stroke("#ef4444")
          doc.font("Helvetica").fontSize(8).fillColor("#ef4444")
          doc.text("Photo unavailable", drawX + 4, drawY + 4, {
            width: thumbWidth - 8,
            align: "left"
          })
          doc.fillColor("#111827").restore()
        }

        const captionValue = captions && captions.length > index ? captions[index] : null
        const caption = typeof captionValue === 'string' ? captionValue.trim() : ''
        if (caption) {
          doc.save()
          doc.font("Helvetica").fontSize(PHOTO_CAPTION_FONT_SIZE).fillColor(PHOTO_CAPTION_COLOR)
          doc.text(caption, drawX, drawY + PHOTO_HEIGHT + PHOTO_CAPTION_GAP, {
            width: thumbWidth,
            align: 'center'
          })
          doc.restore()
          doc.fillColor("#111827")
        }
      })

      return totalHeight
    }

    const drawVideos = (startY: number, videos?: VideoItem[]) => {
      if (!videos || videos.length === 0) return 0
      const usableWidth = width - CELL_PADDING * 2 - MEDIA_GUTTER * (MEDIA_PER_ROW - 1)
      const cardWidth = usableWidth / MEDIA_PER_ROW
      const rows = Math.ceil(videos.length / MEDIA_PER_ROW)
      videos.forEach((_video, index) => {
        const col = index % MEDIA_PER_ROW
        const row = Math.floor(index / MEDIA_PER_ROW)
        const drawX = x + CELL_PADDING + col * (cardWidth + MEDIA_GUTTER)
        const drawY = startY + row * (VIDEO_HEIGHT + MEDIA_GUTTER)
        doc.save()
        doc.roundedRect(drawX, drawY, cardWidth, VIDEO_HEIGHT, 8).fill("#1e293b")

        const centerY = drawY + VIDEO_HEIGHT / 2
        const iconRadius = 12
        const iconCenterX = drawX + iconRadius + 10
        doc.circle(iconCenterX, centerY, iconRadius).fill("#0ea5e9")
        doc.fillColor("#ffffff")
        doc.moveTo(iconCenterX - 4, centerY - 6)
        doc.lineTo(iconCenterX + 6, centerY)
        doc.lineTo(iconCenterX - 4, centerY + 6)
        doc.closePath().fill("#ffffff")

        doc.restore()
        doc.fillColor("#111827")
      })
      return rows * VIDEO_HEIGHT + (rows - 1) * MEDIA_GUTTER
    }

    const segments = getCellSegments(cell)

    segments.forEach((segment, segmentIndex) => {
      let segmentTop = contentTop

      const photos = segment.photos
      const photoCaptions = segment.photoCaptions
      const videos = segment.videos
      const segmentText = segment.text?.trim()
      const textWidth = width - CELL_PADDING * 2
      let textHeight = 0

      if (segmentText && segmentText.length > 0) {
        doc.font(cell.bold ? "Helvetica-Bold" : "Helvetica")
        textHeight = doc.heightOfString(segmentText, {
          width: textWidth,
          align: "left"
        })
      }

      const photoHeight = drawPhotos(segmentTop, photos, photoCaptions)
      if (photoHeight > 0) {
        segmentTop += photoHeight
      }

      if (photoHeight > 0 && videos && videos.length) {
        segmentTop += MEDIA_GUTTER
      }

      const videoHeight = drawVideos(segmentTop, videos)
      if (videoHeight > 0) {
        segmentTop += videoHeight
      }

      const hasMedia = Boolean((photoHeight > 0) || (videoHeight > 0))
      if (hasMedia && textHeight > 0) {
        segmentTop += MEDIA_GUTTER
      }

      if (textHeight > 0 && segmentText) {
        doc.font(cell.bold ? "Helvetica-Bold" : "Helvetica")
        doc.fillColor("#111827")
        doc.text(segmentText, x + CELL_PADDING, segmentTop, {
          width: textWidth,
          align: "left"
        })
        segmentTop += textHeight
      }

      contentTop = segmentTop

      if (segmentIndex < segments.length - 1) {
        contentTop += SEGMENT_SPACING
      }
    })

    x += width
  })

  return rowHeight
}

function normalizeSegments(segments?: CellSegment | CellSegment[]): CellSegment[] {
  if (!segments) return []
  return Array.isArray(segments) ? segments : [segments]
}

function calculateMediaBlocksHeight(doc: any, segments?: CellSegment | CellSegment[]): number {
  const normalized = normalizeSegments(segments)
  if (normalized.length === 0) return 0

  const contentWidth = TABLE_WIDTH - CELL_PADDING * 2
  let total = 0

  normalized.forEach((segment, index) => {
    const photos = segment.photos || []
    const photoCaptions = segment.photoCaptions || []
    const videos = segment.videos || []
    const hasPhotos = photos.length > 0
    const hasVideos = videos.length > 0
    const text = segment.text?.trim()

    let blockHeight = CELL_PADDING * 2

    let textHeight = 0
    if (text) {
      doc.font("Helvetica").fontSize(10)
      textHeight = doc.heightOfString(text, {
        width: contentWidth,
        align: "left"
      })
      blockHeight += textHeight
    }

    let mediaHeight = 0
    if (hasPhotos) {
      const { totalHeight } = preparePhotoLayout(doc, photos.length, photoCaptions, contentWidth)
      mediaHeight += totalHeight
    }
    if (hasVideos) {
      if (mediaHeight > 0) {
        mediaHeight += MEDIA_GUTTER
      }
      const rows = Math.ceil(videos.length / MEDIA_PER_ROW)
      mediaHeight += rows * VIDEO_HEIGHT + (rows - 1) * MEDIA_GUTTER
    }

    if (textHeight > 0 && mediaHeight > 0) {
      blockHeight += MEDIA_GUTTER
    }

    blockHeight += mediaHeight

    total += blockHeight
    if (index < normalized.length - 1) {
      total += SEGMENT_SPACING
    }
  })

  return total
}

function drawMediaBlocks(doc: any, startY: number, segments?: CellSegment | CellSegment[]): number {
  const normalized = normalizeSegments(segments)
  if (normalized.length === 0) return 0

  const contentWidth = TABLE_WIDTH - CELL_PADDING * 2
  let currentY = startY

  normalized.forEach((segment, index) => {
    const photos = segment.photos || []
    const photoCaptions = segment.photoCaptions || []
    const videos = segment.videos || []
    const hasPhotos = photos.length > 0
    const hasVideos = videos.length > 0
    const text = segment.text?.trim()

    let textHeight = 0
    if (text) {
      doc.font("Helvetica").fontSize(10)
      textHeight = doc.heightOfString(text, {
        width: contentWidth,
        align: "left"
      })
    }

    let photoHeight = 0
    let photoLayout: ReturnType<typeof preparePhotoLayout> | null = null
    if (hasPhotos) {
      photoLayout = preparePhotoLayout(doc, photos.length, photoCaptions, contentWidth)
      photoHeight = photoLayout.totalHeight
    }

    let videoHeight = 0
    if (hasVideos) {
      if (photoHeight > 0) {
        videoHeight += MEDIA_GUTTER
      }
      const rows = Math.ceil(videos.length / MEDIA_PER_ROW)
      videoHeight += rows * VIDEO_HEIGHT + (rows - 1) * MEDIA_GUTTER
    }

    let blockHeight = CELL_PADDING * 2 + textHeight + photoHeight + videoHeight
    if (textHeight > 0 && (photoHeight > 0 || videoHeight > 0)) {
      blockHeight += MEDIA_GUTTER
    }

    doc.lineWidth(0.7)
    doc.rect(TABLE_MARGIN, currentY, TABLE_WIDTH, blockHeight).stroke()

    let contentY = currentY + CELL_PADDING

    if (textHeight > 0 && text) {
      doc.font("Helvetica").fontSize(10).fillColor("#111827")
      doc.text(text, TABLE_MARGIN + CELL_PADDING, contentY, {
        width: contentWidth,
        align: "left"
      })
      contentY += textHeight
    }

    if (textHeight > 0 && (photoHeight > 0 || videoHeight > 0)) {
      contentY += MEDIA_GUTTER
    }

    const drawFullWidthPhotos = (start: number, layout: ReturnType<typeof preparePhotoLayout>) => {
      if (!hasPhotos || layout.rowHeights.length === 0) return 0
      const { thumbWidth, rowHeights } = layout
      const rowStartYs: number[] = []
      let pointerY = start
      for (let row = 0; row < rowHeights.length; row += 1) {
        rowStartYs[row] = pointerY
        pointerY += rowHeights[row]
        if (row < rowHeights.length - 1) {
          pointerY += MEDIA_GUTTER
        }
      }

      photos.forEach((buffer, photoIndex) => {
        const col = photoIndex % MEDIA_PER_ROW
        const row = Math.floor(photoIndex / MEDIA_PER_ROW)
        const drawX = TABLE_MARGIN + CELL_PADDING + col * (thumbWidth + MEDIA_GUTTER)
        const drawY = rowStartYs[row]

        try {
          doc.image(buffer, drawX, drawY, {
            fit: [thumbWidth, PHOTO_HEIGHT],
            align: "center",
            valign: "top"
          })
        } catch (error) {
          console.error("Failed to render photo in PDF", error)
          doc.save()
          doc.rect(drawX, drawY, thumbWidth, PHOTO_HEIGHT).stroke("#ef4444")
          doc.font("Helvetica").fontSize(8).fillColor("#ef4444")
          doc.text("Photo unavailable", drawX + 4, drawY + 4, {
            width: thumbWidth - 8,
            align: "left"
          })
          doc.fillColor("#111827").restore()
        }

        const captionValue = photoCaptions.length > photoIndex ? photoCaptions[photoIndex] : null
        const caption = typeof captionValue === 'string' ? captionValue.trim() : ''
        if (caption) {
          doc.save()
          doc.font("Helvetica").fontSize(PHOTO_CAPTION_FONT_SIZE).fillColor(PHOTO_CAPTION_COLOR)
          doc.text(caption, drawX, drawY + PHOTO_HEIGHT + PHOTO_CAPTION_GAP, {
            width: thumbWidth,
            align: 'center'
          })
          doc.restore()
          doc.fillColor("#111827")
        }
      })

      return layout.totalHeight
    }

    const drawFullWidthVideos = (start: number) => {
      if (!hasVideos) return 0
      const usableWidth = contentWidth - MEDIA_GUTTER * (MEDIA_PER_ROW - 1)
      const cardWidth = usableWidth / MEDIA_PER_ROW
      videos.forEach((_video, videoIndex) => {
        const col = videoIndex % MEDIA_PER_ROW
        const row = Math.floor(videoIndex / MEDIA_PER_ROW)
        const drawX = TABLE_MARGIN + CELL_PADDING + col * (cardWidth + MEDIA_GUTTER)
        const drawY = start + row * (VIDEO_HEIGHT + MEDIA_GUTTER)
        doc.save()
        doc.roundedRect(drawX, drawY, cardWidth, VIDEO_HEIGHT, 8).fill("#1e293b")

        const centerY = drawY + VIDEO_HEIGHT / 2
        const iconRadius = 12
        const iconCenterX = drawX + iconRadius + 10
        doc.circle(iconCenterX, centerY, iconRadius).fill("#0ea5e9")
        doc.fillColor("#ffffff")
        doc.moveTo(iconCenterX - 4, centerY - 6)
        doc.lineTo(iconCenterX + 6, centerY)
        doc.lineTo(iconCenterX - 4, centerY + 6)
        doc.closePath().fill("#ffffff")

        doc.restore()
        doc.fillColor("#111827")
      })
      return videoHeight
    }

    if (hasPhotos && photoLayout) {
      drawFullWidthPhotos(contentY, photoLayout)
      contentY += photoHeight
    }

    if (hasVideos) {
      if (hasPhotos) {
        contentY += MEDIA_GUTTER
      }
      drawFullWidthVideos(contentY)
      contentY += videoHeight
    }

    currentY += blockHeight

    if (index < normalized.length - 1) {
      currentY += SEGMENT_SPACING
    }
  })

  doc.fillColor("#111827").font("Helvetica").fontSize(10)
  return currentY - startY
}

export async function appendWorkOrderSection(
  doc: any,
  workOrder: any,
  imageCache: Map<string, Buffer>,
  options: {
    heading?: string
    startOnNewPage?: boolean
    includeMeta?: boolean
    filterByWorkOrderId?: string | null
    allowedConditions?: string[] | null
  } = {}
) {
  if (options.startOnNewPage) {
    doc.addPage()
  }

  const headingLabel =
    options.heading ?? `Work Order ${workOrder.id } (${formatEnum(workOrder.status)})`

  doc.font("Helvetica-Bold").fontSize(14).text(headingLabel, { align: "left" })
  doc.moveDown(0.25)

  const includeMeta = options.includeMeta ?? true

  if (includeMeta) {
    const scheduleLine = formatScheduleRange(
      workOrder.scheduledStartDateTime,
      workOrder.scheduledEndDateTime
    )
    doc.font("Helvetica").fontSize(10)
    if (scheduleLine) {
      doc.text(`Scheduled: ${scheduleLine}`)
    }

    const actualLine = formatScheduleRange(workOrder.actualStart, workOrder.actualEnd)
    if (actualLine) {
      doc.text(`Actual: ${actualLine}`)
    }

    if (Array.isArray(workOrder.inspectors) && workOrder.inspectors.length) {
      const inspectorNames = workOrder.inspectors.map((inspector: any) => inspector.name).filter(Boolean).join(", ")
      if (inspectorNames) {
        doc.text(`Inspectors: ${inspectorNames}`)
      }
    }

    doc.moveDown(0.75)
  } else {
    doc.moveDown(0.25)
  }

  const rawItems = Array.isArray(workOrder.contract?.contractChecklist?.items)
    ? workOrder.contract.contractChecklist.items
    : []

  const filterId = options.filterByWorkOrderId === undefined ? workOrder.id : options.filterByWorkOrderId
  const scopedItems = rawItems.filter((item: any) =>
    !item.workOrderId || !filterId || item.workOrderId === filterId
  )

  const allowedConditionSet = Array.isArray(options.allowedConditions) && options.allowedConditions.length > 0
    ? new Set(options.allowedConditions.map((value) => value.toUpperCase()))
    : undefined

  const tableRows = await buildTableRows(scopedItems, imageCache, allowedConditionSet)

  if (tableRows.length === 0) {
    doc.text("No checklist items found for this work order.", { italic: true })
    doc.moveDown()
    return
  }

  doc.fontSize(10)
  let y = doc.y

  const headerRow: TableCell[] = [
    { text: "S/N", bold: true },
    { text: "Location", bold: true },
    { text: "Item / Subtask", bold: true },
    { text: "Status / Condition", bold: true },
    { text: "Remarks / Media", bold: true }
  ]

  const headerHeight = drawTableRow(doc, y, headerRow, { header: true })
  y += headerHeight

  tableRows.forEach((rowInfo) => {
    const remainingSpace = doc.page.height - TABLE_MARGIN - y
    const requiredHeight = calculateRowHeight(doc, rowInfo.cells)
      + calculateMediaBlocksHeight(doc, rowInfo.summaryMedia)

    if (requiredHeight > remainingSpace) {
      doc.addPage()
      y = TABLE_MARGIN
      const headerAgainHeight = drawTableRow(doc, y, headerRow, { header: true })
      y += headerAgainHeight
    }

    const consumedHeight = drawTableRow(doc, y, rowInfo.cells)
    y += consumedHeight

    if (rowInfo.summaryMedia) {
      const mediaHeight = drawMediaBlocks(doc, y, rowInfo.summaryMedia)
      y += mediaHeight
    }
  })

  doc.moveDown()
}
 
