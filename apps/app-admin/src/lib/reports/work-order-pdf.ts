import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isPdfKitCompatibleImage, loadNormalizedImage, ensurePdfSupportedImage } from "@/lib/image"
const PHOTO_CONCURRENCY = Math.max(2, Math.min(16, Number.parseInt(process.env.PDF_IMAGE_CONCURRENCY || '8', 10) || 8))

export const TABLE_MARGIN = 36
// Space reserved at the bottom of every page for footer/version/paging
export const FOOTER_RESERVED = 36
// Base weights for 4 columns [Location, Item, Subtasks, Condition]
// Previously: [S/N, 120, 120, 120, 123] — S/N removed
// We now scale these to fill the full printable width dynamically (portrait/landscape).
const BASE_COLUMN_WEIGHTS = [120, 120, 120, 123] as const

function getAvailableTableWidth(doc: any): number {
  return Math.max(0, (doc?.page?.width || 0) - TABLE_MARGIN * 2)
}

function getColumnWidths(doc: any): number[] {
  const available = getAvailableTableWidth(doc)
  const totalWeight = BASE_COLUMN_WEIGHTS.reduce((a, b) => a + b, 0)
  // First pass: proportional widths
  const provisional = BASE_COLUMN_WEIGHTS.map(w => Math.floor((available * w) / totalWeight))
  // Fix rounding by assigning remainder to the last column
  const used = provisional.reduce((a, b) => a + b, 0)
  const remainder = Math.max(0, available - used)
  provisional[provisional.length - 1] += remainder
  return provisional
}

function getTableWidth(doc: any): number {
  return getAvailableTableWidth(doc)
}
const CELL_PADDING = 8
const PHOTO_HEIGHT = 100
const PHOTO_CAPTION_GAP = 2
const PHOTO_CAPTION_FONT_SIZE = 8
const PHOTO_CAPTION_COLOR = "#475569"
const VIDEO_HEIGHT = 64
const MAX_MEDIA_LINKS = 9999
const MEDIA_PER_ROW = 4
const MEDIA_GUTTER = 8
const SEGMENT_SPACING = 12
const LOGO_PATH = join(process.cwd(), "public", "logo.png")
const LOGO_ORIGINAL_WIDTH = 2560
const LOGO_ORIGINAL_HEIGHT = 986
export const LOGO_ASPECT_RATIO = LOGO_ORIGINAL_HEIGHT / LOGO_ORIGINAL_WIDTH

let LOGO_BUFFER: Buffer | null | undefined
let PDFDocumentCtor: any | null = null

export function drawFooter(doc: any) {
  const text = "Prepared by Property Stewards PTE. LTD © 2025"
  const width = doc.page.width - TABLE_MARGIN * 2
  const x = TABLE_MARGIN
  const prevY = doc.y

  doc.save()
  doc.font("Helvetica").fontSize(8).fillColor("#6b7280")

  // Compute a safe Y inside the content area so PDFKit
  // never paginates while drawing the footer.
  const lineHeight = typeof (doc as any).currentLineHeight === 'function'
    ? (doc as any).currentLineHeight()
    : 10
  const contentBottom = doc.page.height - TABLE_MARGIN
  const y = contentBottom - lineHeight - 2 // a tiny padding above content bottom

  try {
    doc.text(text, x, y, { width, align: "center", lineBreak: false })
  } catch {
    // Footer must never block report generation
  }

  doc.restore()
  // restore pointer so footer drawing never affects layout
  doc.y = prevY
}

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
  cause?:string
  resolution?:string
  caption?:any
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

type TableRow = [TableCell, TableCell, TableCell, TableCell]

type TableRowInfo = {
  cells: TableRow
  summaryMedia?: CellSegment | CellSegment[]
  // Marks primary task rows (for alternating background)
  isTaskRow?: boolean
  // When true, do not render a bordered table row, only the media block
  mediaOnly?: boolean
  // Second-level grouping key (e.g., sub-location) for color alternation
  groupKey?: string | null
  // When true, draw a single outer border for the row and
  // suppress inner vertical cell borders (merging columns visually).
  mergeColumns?: boolean
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
  // When a filter set is provided, omit tasks without a condition
  if (!normalized) return false
  return allowed.has(normalized)
}

async function fetchImage(url: string): Promise<Buffer | null> {
  // Normalize every remote/data image into PNG/JPEG so PDFKit always accepts it
  return loadNormalizedImage(url)
}

function prepareGridLayout(
  doc: any,
  itemCount: number,
  captions: (string | null)[] | undefined,
  availableWidth: number,
  tileHeight: number
) {
  const usableWidth = availableWidth - MEDIA_GUTTER * (MEDIA_PER_ROW - 1)
  const tileWidth = MEDIA_PER_ROW > 0 ? usableWidth / MEDIA_PER_ROW : usableWidth

  if (itemCount === 0) {
    return { tileWidth, rowHeights: [] as number[], totalHeight: 0 }
  }

  const rows = Math.ceil(itemCount / MEDIA_PER_ROW)
  const rowHeights = new Array(rows).fill(tileHeight)
  const normalizedCaptions = captions ?? []

  doc.save()
  doc.font("Helvetica").fontSize(PHOTO_CAPTION_FONT_SIZE)
  for (let index = 0; index < itemCount; index += 1) {
    const row = Math.floor(index / MEDIA_PER_ROW)
    const captionValue = normalizedCaptions[index]
    const caption = typeof captionValue === 'string' ? captionValue.trim() : ''
    if (!caption) continue
    const captionHeight = doc.heightOfString(caption, {
      width: tileWidth,
      align: 'center'
    })
    const blockHeight = tileHeight + PHOTO_CAPTION_GAP + captionHeight
    rowHeights[row] = Math.max(rowHeights[row], blockHeight)
  }
  doc.restore()

  let totalHeight = 0
  for (let row = 0; row < rowHeights.length; row += 1) {
    totalHeight += rowHeights[row]
    if (row < rowHeights.length - 1) totalHeight += MEDIA_GUTTER
  }

  return { tileWidth, rowHeights, totalHeight }
}

function resolveEntryAuthor(entry: EntryLike) {
  const inspectorName = entry.inspector?.name?.trim()
  if (inspectorName) return inspectorName
  const userName = entry.user?.username?.trim()
  if (userName) return userName
  const userEmail = entry.user?.email?.trim()
  if (userEmail) return userEmail
  return "Team member"
}

function formatEntryLine(entry: EntryLike) {
  const lines: string[] = []

  const recordedAt = formatDateTime(entry.createdOn)
  if (recordedAt) {
    lines.push(`Recorded on: ${recordedAt}`)
  }

  lines.push(`Recorded by: ${resolveEntryAuthor(entry)}`)

  const condition = formatEnum(entry.condition) || "N/A"
  // Keep condition out of remark details; shown in table columns

  const remarks = entry.remarks?.trim() ?? ""
  lines.push(`Remarks: ${remarks.length > 0 ? remarks : '—'}`)

  // Do not print cause/resolution in remark rows; these move to Condition column

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
      const caption = (typeof source.caption === 'string' && source.caption.trim().length > 0)
        ? source.caption.trim()
        : null
      photoCaptions.push(caption)
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

  const videoItems: VideoItem[] = uniqueVideos.map((url) => ({ url, label: '' }))

  return {
    text: lines.length > 0 ? lines.join("\n") : undefined,
    photos: images,
    photoCaptions,
    videos: videoItems
  }
}

async function buildTableRows(
  items: any[],
  imageCache: Map<string, Buffer>,
  allowedConditions?: Set<string>,
  entryOnly: boolean = false,
  includePhotos: boolean = true
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
    // Location-level or item-level entries (not linked to a task)
    const standaloneEntries = (item.contributions || []).filter((entry: any) => !entry.taskId)
    // Location-level entries: include when marked for report; do NOT filter by condition
    const reportEntries = standaloneEntries
      .filter((entry: any) => entry?.includeInReport === true)

    const seenItemPhotos = new Set<string>()
    const seenItemVideos = new Set<string>()

    const itemName = item.name || item.item || `Checklist Item ${itemIndex + 1}`
    const formattedItemStatus = formatEnum(item.status ?? undefined)
    const itemStatusFallback = formattedItemStatus || "N/A"
    const itemNumber = itemIndex + 1
    const itemStatusSuffix = formattedItemStatus ? ` (${formattedItemStatus.toLowerCase()})` : ""
    const locationDisplayName = `${itemName}${itemStatusSuffix}`
    const itemLocations = Array.isArray(item.locations) ? item.locations : []
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
      rows.push({
        cells: [
          { text: `${itemNumber} ${locationDisplayName}`, bold: true },
          { text: `${itemNumber}. ${itemName}` },
          { text: 'No subtasks' },
          { text: itemStatusFallback }
        ]
      })
      continue
    }

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
      const group = groups[groupIndex]
      const locationIndex = groupIndex + 1
      const locationNumber = `${itemNumber}.${locationIndex}`
      const itemColumnText = `${locationNumber} ${group.label}`
      const locationRemarkText = typeof group.location?.remarks === 'string' ? group.location.remarks.trim() : ''
    const locationSegments: CellSegment[] = []
    if (!entryOnly && locationRemarkText.length > 0) {
      locationSegments.push({ text: `Remarks: ${locationRemarkText}` })
    }

      const locationTasks = group.tasks
      // Prepare to combine itemEntry remarks across this location and task-linked entries
      const groupLocationId = (group.location && (group.location.id || group.location?.id)) || null
      const locationLevelEntries: EntryLike[] = Array.isArray(reportEntries)
        ? (reportEntries as any[]).filter((e: any) => {
            const locId = (e?.locationId ?? (e?.location?.id)) || null
            return groupLocationId && locId === groupLocationId
          })
        : []
      const collectedGroupEntries: EntryLike[] = []

      for (let taskIdx = 0; taskIdx < locationTasks.length; taskIdx += 1) {
        const task = locationTasks[taskIdx]
        const taskConditionAllowed = isConditionAllowed(task?.condition, allowedConditions)
        const entries = Array.isArray(task.entries) ? task.entries : []
        // Task entries: include when marked for report; do NOT filter by condition for remarks/photos
        const filteredEntries = entries
          .filter((entry: EntryLike) => (entry as any)?.includeInReport === true)

        // Rows: always filter by task condition — if not allowed, skip the task row entirely
        if (allowedConditions && allowedConditions.size > 0 && !taskConditionAllowed) {
          // Do not collect entries for disallowed tasks; remarks/media filtering must rely on the task condition
          continue
        }

        const rowSegments: CellSegment[] = []

        if (locationSegments.length && taskIdx === 0) {
          rowSegments.push(...locationSegments)
        }
        // Do not include task-level media on each task row; we'll render
        // a consolidated row per location that contains all subtask photos.

        // Compute condition column text with latest cause/resolution when available
        const conditionBase = formatEnum(task.condition ?? undefined) || "N/A"

        const pickLatestCauseResolution = (): { cause?: string | null; resolution?: string | null } => {
          // 1) Prefer entries marked for report; else any entries linked to this task
          const candidates = (filteredEntries.length > 0 ? filteredEntries : entries) as any[]
          for (let i = candidates.length - 1; i >= 0; i -= 1) {
            const e = candidates[i] || {}
            const findings = Array.isArray((e as any).findings) ? (e as any).findings : []
            const found = findings.find((f: any) => f && (f.taskId === task.id))
            const det = found && typeof found.details === 'object' && found.details !== null ? found.details as any : null
            const causeFromFinding = typeof det?.cause === 'string' ? det.cause.trim() : ''
            const resFromFinding = typeof det?.resolution === 'string' ? det.resolution.trim() : ''
            if (causeFromFinding || resFromFinding) {
              return { cause: causeFromFinding || null, resolution: resFromFinding || null }
            }
            const legacyCause = typeof (e as any).cause === 'string' ? (e as any).cause.trim() : ''
            const legacyRes = typeof (e as any).resolution === 'string' ? (e as any).resolution.trim() : ''
            if (legacyCause || legacyRes) {
              return { cause: legacyCause || null, resolution: legacyRes || null }
            }
          }
          // 2) If none from task-linked entries, check task-level findings (handles location-bulk remarks)
          const tf = Array.isArray((task as any).findings) ? (task as any).findings : []
          if (tf.length > 0) {
            // Prefer ones whose parent entry is included-in-report; else take the newest by createdOn
            const withMeta = tf.map((row: any) => ({
              cause: typeof row?.details?.cause === 'string' ? row.details.cause.trim() : '',
              resolution: typeof row?.details?.resolution === 'string' ? row.details.resolution.trim() : '',
              included: Boolean(row?.entry?.includeInReport),
              createdOn: row?.entry?.createdOn ? new Date(row.entry.createdOn).getTime() : 0,
            }))
            const filt = withMeta.filter((r: any) => r.cause || r.resolution)
            if (filt.length > 0) {
              const prefer = filt.filter((r: any) => r.included)
              const pool = prefer.length > 0 ? prefer : filt
              pool.sort((a: any, b: any) => a.createdOn - b.createdOn)
              const last = pool[pool.length - 1]
              return { cause: last.cause || null, resolution: last.resolution || null }
            }
          }
          return {}
        }

        const { cause: latestCause, resolution: latestResolution } = pickLatestCauseResolution()
        const condLines: string[] = [conditionBase]
        if (latestCause) condLines.push(`• Causes: ${latestCause}`)
        if (latestResolution) condLines.push(`• Resolution: ${latestResolution}`)
        const conditionText = condLines.join('\n')
        const taskNumber = `${locationNumber}.${taskIdx + 1}`
        const subtaskLabel = `${taskNumber} ${task.name || 'Subtask'}`

        if (!taskConditionAllowed && !entryOnly && rowSegments.length === 0 && filteredEntries.length === 0) {
          continue
        }

        // In entry-only mode, suppress synthetic placeholder remarks
        // if (!entryOnly) {
        //   if (rowSegments.length === 0 && taskConditionAllowed && filteredEntries.length === 0) {
        //     rowSegments.push({ text: "No remarks recorded." })
        //   }
        // }

        const baseRow: TableRow = [
          { text: `${itemNumber} ${locationDisplayName}` },
          { text: itemColumnText },
          { text: subtaskLabel },
          { text: conditionText }
        ]

        rows.push({
          cells: baseRow,
          summaryMedia: entryOnly ? undefined : (rowSegments.length ? [...rowSegments] : undefined),
          isTaskRow: true,
          groupKey: group.key,
        })

        if (filteredEntries.length > 0) {
          collectedGroupEntries.push(...(filteredEntries as EntryLike[]))
        }
      }
      // After tasks: render combined media + entries for this location group
      const combinedGroupEntries: EntryLike[] = (() => {
        const map = new Map<string, EntryLike>()
        const add = (e: any) => {
          const key = typeof e?.id === 'string' ? e.id : JSON.stringify(e)
          if (!map.has(key)) map.set(key, e)
        }
        // Only include location-level entries if this location has any task rows allowed by the filter
        const hasAllowedTaskInGroup = (allowedConditions && allowedConditions.size > 0)
          ? (group.tasks || []).some((t: any) => isConditionAllowed(t?.condition, allowedConditions))
          : true
        if (hasAllowedTaskInGroup) locationLevelEntries.forEach(add)
        collectedGroupEntries.forEach(add)
        return Array.from(map.values()) as EntryLike[]
      })()

      {
        // Group per entry by recorded date and recorder; render two rows per group (heading once)
        const taskMeta = new Map<string, { num: string; name: string }>()
        for (let tIndex = 0; tIndex < locationTasks.length; tIndex += 1) {
          const t = locationTasks[tIndex]
          const tNum = `${locationNumber}.${tIndex + 1}`
          const tName = typeof t?.name === 'string' ? t.name.trim() : ''
          if (t?.id) taskMeta.set(t.id, { num: tNum, name: tName })
        }

        type G = { key: string; title: string; noTask: Array<{ url: string; caption: string | null }>; task: Array<{ url: string; caption: string | null }> }
        const groups: Map<string, G> = new Map()
        const keyFor = (e: any) => {
          const dateOnly = formatDate(e?.createdOn) || ''
          const by = resolveEntryAuthor(e)
          const title = dateOnly ? `Recorded on: ${dateOnly}${by ? `, recorded by ${by}` : ''}` : (by ? `Recorded by ${by}` : 'Recorded')
          const key = `${dateOnly}|${by}`
          return { key, title }
        }

        for (const e of combinedGroupEntries as any[]) {
          const media = Array.isArray((e as any)?.media) ? (e as any).media : []
          const photos = media
            .filter((m: any) => m && m.type === 'PHOTO' && typeof m.url === 'string' && m.url.trim().length > 0)
            .sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0))
          const { key, title } = keyFor(e)
          if (!groups.has(key)) groups.set(key, { key, title, noTask: [], task: [] })
          for (const m of photos) {
            const url = String(m.url).trim()
            const rawCaption = typeof m.caption === 'string' ? m.caption.trim() : ''
            const taskId = (m as any)?.taskId || null
            if (!taskId) {
              const cap = `${locationNumber} ${group.label}${rawCaption ? `: ${rawCaption}` : ''}`
              groups.get(key)!.noTask.push({ url, caption: cap })
            } else if (taskMeta.has(taskId)) {
              const meta = taskMeta.get(taskId)!
              const cap = `${meta.num} ${meta.name}${rawCaption ? `: ${rawCaption}` : ''}`.trim()
              groups.get(key)!.task.push({ url, caption: cap })
            }
          }
        }

        if (includePhotos) {
          const ordered = Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key))
          for (const g of ordered) {
            if (g.noTask.length > 0) {
              const seg1 = await buildRemarkSegment({ text: g.title, photoEntries: g.noTask, videoUrls: [], imageCache, seenPhotos: seenItemPhotos, seenVideos: seenItemVideos })
              if (seg1 && (seg1.photos?.length || seg1.videos?.length)) {
                rows.push({ cells: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], summaryMedia: seg1, mediaOnly: true })
              }
            }
            if (g.task.length > 0) {
              const seg2 = await buildRemarkSegment({ text: undefined, photoEntries: g.task, videoUrls: [], imageCache, seenPhotos: seenItemPhotos, seenVideos: seenItemVideos })
              if (seg2 && (seg2.photos?.length || seg2.videos?.length)) {
                rows.push({ cells: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], summaryMedia: seg2, mediaOnly: true })
              }
            }
          }
        }
      }

      if (combinedGroupEntries.length > 0) {
        const entrySegments: (CellSegment | null)[] = []
        for (const entry of combinedGroupEntries as EntryLike[]) {
          const entrySegment = await buildRemarkSegment({
            text: formatEntryLine(entry),
            photoEntries: [],
            videoUrls: [],
            imageCache,
            seenPhotos: seenItemPhotos,
            seenVideos: seenItemVideos
          })
          entrySegments.push(entrySegment)
        }
        const chunkSize = 4
        for (let offset = 0; offset < entrySegments.length; offset += chunkSize) {
          const chunk = entrySegments.slice(offset, offset + chunkSize)
          const chunkCells: TableRow = [
            { text: '' },
            { text: '' },
            { text: '' },
            { text: '' }
          ]
          chunk.forEach((segment, segmentIndex) => {
            if (!segment) return
            chunkCells[segmentIndex] = { segments: [segment] }
          })
          // Mark as merged to remove inner borders for remark rows
          rows.push({ cells: chunkCells, mergeColumns: true })
        }
      }
    }

    // Render any remaining general (unassigned) item-level entries not tied to a location or task
    const generalEntries: EntryLike[] = Array.isArray(reportEntries)
      ? (reportEntries as any[]).filter((e: any) => !e?.locationId && !(e?.location && e.location?.id))
      : []
    if (generalEntries.length > 0) {
      // Group general entry photos by recorded date/author; render heading once then task photos
      const allTasks = tasks
      const taskIndex = new Map<string, { num: string; name: string }>()
      for (let tIdx = 0; tIdx < allTasks.length; tIdx += 1) {
        const t = allTasks[tIdx]
        const num = `${itemNumber}.${tIdx + 1}`
        const tName = typeof t?.name === 'string' ? t.name.trim() : ''
        if (t?.id) taskIndex.set(t.id, { num, name: tName })
      }

      type G = { key: string; title: string; noTask: Array<{ url: string; caption: string | null }>; task: Array<{ url: string; caption: string | null }> }
      const groups: Map<string, G> = new Map()
      const keyFor = (e: any) => {
        const dateOnly = formatDate(e?.createdOn) || ''
        const by = resolveEntryAuthor(e)
        const title = dateOnly ? `Recorded on: ${dateOnly}${by ? `, recorded by ${by}` : ''}` : (by ? `Recorded by ${by}` : 'Recorded')
        const key = `${dateOnly}|${by}`
        return { key, title }
      }
      for (const e of generalEntries as any[]) {
        const med = Array.isArray((e as any)?.media) ? (e as any).media : []
        const photos = med
          .filter((m: any) => m && m.type === 'PHOTO' && typeof m.url === 'string' && m.url.trim().length > 0)
          .sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0))
        const { key, title } = keyFor(e)
        if (!groups.has(key)) groups.set(key, { key, title, noTask: [], task: [] })
        for (const m of photos) {
          const url = String(m.url).trim()
          const rawCaption = typeof m.caption === 'string' ? m.caption.trim() : ''
          const taskId = (m as any)?.taskId || null
          if (!taskId) {
            groups.get(key)!.noTask.push({ url, caption: `${itemNumber} ${itemName}${rawCaption ? `: ${rawCaption}` : ''}` })
          } else if (taskIndex.has(taskId)) {
            const meta = taskIndex.get(taskId)!
            groups.get(key)!.task.push({ url, caption: `${meta.num} ${meta.name}${rawCaption ? `: ${rawCaption}` : ''}` })
          } else {
            groups.get(key)!.task.push({ url, caption: (rawCaption || '').trim() || null })
          }
        }
      }
      if (includePhotos) {
        const ordered = Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key))
        for (const g of ordered) {
          if (g.noTask.length > 0) {
            const s1 = await buildRemarkSegment({ text: g.title, photoEntries: g.noTask, videoUrls: [], imageCache, seenPhotos: seenItemPhotos, seenVideos: seenItemVideos })
            if (s1 && (s1.photos?.length || s1.videos?.length)) rows.push({ cells: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], summaryMedia: s1, mediaOnly: true })
          }
          if (g.task.length > 0) {
            const s2 = await buildRemarkSegment({ text: undefined, photoEntries: g.task, videoUrls: [], imageCache, seenPhotos: seenItemPhotos, seenVideos: seenItemVideos })
            if (s2 && (s2.photos?.length || s2.videos?.length)) rows.push({ cells: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], summaryMedia: s2, mediaOnly: true })
          }
        }
      }

      const entrySegments: (CellSegment | null)[] = []
      for (const entry of generalEntries as EntryLike[]) {
        const entrySegment = await buildRemarkSegment({
          text: formatEntryLine(entry),
          photoEntries: [],
          videoUrls: [],
          imageCache,
          seenPhotos: seenItemPhotos,
          seenVideos: seenItemVideos
        })
        entrySegments.push(entrySegment)
      }
      const chunkSize = 4
      for (let offset = 0; offset < entrySegments.length; offset += chunkSize) {
        const chunk = entrySegments.slice(offset, offset + chunkSize)
        const chunkCells: TableRow = [
          { text: '' },
          { text: '' },
          { text: '' },
          { text: '' }
        ]
        chunk.forEach((segment, segmentIndex) => {
          if (!segment) return
          chunkCells[segmentIndex] = { segments: [segment] }
        })
        // Mark as merged to remove inner borders for remark rows
        rows.push({ cells: chunkCells, mergeColumns: true })
      }
    }
  }

  return rows
}

function calculateRowHeight(doc: any, cells: TableCell[]) {
  let rowHeight = 0

  const colWidths = getColumnWidths(doc)
  cells.forEach((cell, index) => {
    const width = colWidths[index] - CELL_PADDING * 2
    const segments = getCellSegments(cell)
    let cellHeight = 0

    segments.forEach((segment, segmentIndex) => {
      let segmentHeight = 0
      let mediaHeight = 0

      if (segment.photos && segment.photos.length) {
        const { totalHeight } = prepareGridLayout(doc, segment.photos.length, segment.photoCaptions, width, PHOTO_HEIGHT)
        mediaHeight += totalHeight
      }

      if (segment.videos && segment.videos.length) {
        if (mediaHeight > 0) mediaHeight += MEDIA_GUTTER
        const { totalHeight } = prepareGridLayout(doc, segment.videos.length, undefined, width, VIDEO_HEIGHT)
        mediaHeight += totalHeight
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

function drawTableRow(
  doc: any,
  y: number,
  cells: TableCell[],
  options: { header?: boolean; background?: string | null; mergeColumns?: boolean } = {}
) {
  const { header = false, mergeColumns = false } = options
  const rowHeight = calculateRowHeight(doc, cells)
  let x = TABLE_MARGIN

  const colWidths2 = getColumnWidths(doc)
  // When merging columns, paint background and outer border once
  if (!header && mergeColumns) {
    if (options.background) {
      doc.save()
      try {
        doc.fillColor(options.background)
        if (typeof (doc as any).opacity === 'function') (doc as any).opacity(0.6)
        doc.rect(TABLE_MARGIN, y, getTableWidth(doc), rowHeight).fill()
      } finally {
        if (typeof (doc as any).opacity === 'function') (doc as any).opacity(1)
        doc.restore()
      }
    }
    // Draw a single outer border for the merged row
    doc.rect(TABLE_MARGIN, y, getTableWidth(doc), rowHeight).stroke()
  }

  cells.forEach((cell, index) => {
    const width = colWidths2[index]
    doc.lineWidth(0.7)

    if (header) {
      doc.save()
      try {
        if (typeof (doc as any).opacity === 'function') (doc as any).opacity(0.6)
        doc.rect(x, y, width, rowHeight).fill("#e2e8f0")
      } finally {
        if (typeof (doc as any).opacity === 'function') (doc as any).opacity(1)
        doc.restore()
      }
      doc.rect(x, y, width, rowHeight).stroke()
      doc.font("Helvetica-Bold")
    } else {
      if (!mergeColumns) {
        if (options.background) {
          // Light, semi-transparent fill so watermark remains visible
          doc.save()
          try {
            doc.fillColor(options.background)
            if (typeof (doc as any).opacity === 'function') (doc as any).opacity(0.6)
            doc.rect(x, y, width, rowHeight).fill()
          } finally {
            if (typeof (doc as any).opacity === 'function') (doc as any).opacity(1)
            doc.restore()
          }
        }
        // Draw per-cell border only when not merged
        doc.rect(x, y, width, rowHeight).stroke()
      }
      doc.font(cell.bold ? "Helvetica-Bold" : "Helvetica")
    }

    doc.fillColor("#111827")

    let contentTop = y + CELL_PADDING

    const drawPhotos = (startY: number, photos?: Buffer[], captions?: (string | null)[]) => {
      if (!photos || photos.length === 0) return 0
      const availableWidth = width - CELL_PADDING * 2
      const { tileWidth, rowHeights, totalHeight } = prepareGridLayout(doc, photos.length, captions, availableWidth, PHOTO_HEIGHT)
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
        const row = Math.floor(index / MEDIA_PER_ROW)
        const col = index % MEDIA_PER_ROW
        const drawX = x + CELL_PADDING + col * (tileWidth + MEDIA_GUTTER)
        const drawY = rowStartYs[row]

        try {
          if (!buffer || buffer.length < 32 || !isPdfKitCompatibleImage(buffer)) {
            throw new Error('unsupported-image-buffer')
          }
          doc.image(buffer, drawX, drawY, {
            fit: [tileWidth, PHOTO_HEIGHT],
            align: "center",
            valign: "top"
          })
        } catch (error) {
          console.warn("Skipped an invalid photo while rendering PDF", (error as Error)?.message)
          doc.save()
          doc.rect(drawX, drawY, tileWidth, PHOTO_HEIGHT).stroke("#ef4444")
          doc.font("Helvetica").fontSize(8).fillColor("#ef4444")
          doc.text("Photo unavailable", drawX + 4, drawY + 4, {
            width: tileWidth - 8,
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
            width: tileWidth,
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
      const availableWidth = width - CELL_PADDING * 2
      const { tileWidth, rowHeights, totalHeight } = prepareGridLayout(doc, videos.length, undefined, availableWidth, VIDEO_HEIGHT)
      const rowStartYs: number[] = []
      let pointerY = startY
      for (let row = 0; row < rowHeights.length; row += 1) {
        rowStartYs[row] = pointerY
        pointerY += rowHeights[row]
        if (row < rowHeights.length - 1) pointerY += MEDIA_GUTTER
      }

      videos.forEach((video, index) => {
        const row = Math.floor(index / MEDIA_PER_ROW)
        const col = index % MEDIA_PER_ROW
        const drawX = x + CELL_PADDING + col * (tileWidth + MEDIA_GUTTER)
        const drawY = rowStartYs[row]
        doc.save()
        doc.roundedRect(drawX, drawY, tileWidth, VIDEO_HEIGHT, 8).fill("#1e293b")

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

        // No video labels
      })
      return totalHeight
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

  const contentWidth = getTableWidth(doc) - CELL_PADDING * 2
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
      const { totalHeight } = prepareGridLayout(doc, photos.length, photoCaptions, contentWidth, PHOTO_HEIGHT)
      mediaHeight += totalHeight
    }
    if (hasVideos) {
      if (mediaHeight > 0) mediaHeight += MEDIA_GUTTER
      const { totalHeight } = prepareGridLayout(doc, videos.length, undefined, contentWidth, VIDEO_HEIGHT)
      mediaHeight += totalHeight
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

  const contentWidth = getTableWidth(doc) - CELL_PADDING * 2
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
    let photoLayout: ReturnType<typeof prepareGridLayout> | null = null
    if (hasPhotos) {
      photoLayout = prepareGridLayout(doc, photos.length, photoCaptions, contentWidth, PHOTO_HEIGHT)
      photoHeight = photoLayout.totalHeight
    }

    let videoHeight = 0
    if (hasVideos) {
      if (photoHeight > 0) {
        videoHeight += MEDIA_GUTTER
      }
      const rows = videos.length
      videoHeight += rows * VIDEO_HEIGHT + (rows - 1) * MEDIA_GUTTER
    }

    let blockHeight = CELL_PADDING * 2 + textHeight + photoHeight + videoHeight
    if (textHeight > 0 && (photoHeight > 0 || videoHeight > 0)) {
      blockHeight += MEDIA_GUTTER
    }

    doc.lineWidth(0.7)
    doc.rect(TABLE_MARGIN, currentY, getTableWidth(doc), blockHeight).stroke()

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

    const drawFullWidthPhotos = (start: number, layout: ReturnType<typeof prepareGridLayout>) => {
      if (!hasPhotos || layout.rowHeights.length === 0) return 0
      const { tileWidth, rowHeights } = layout
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
        const row = Math.floor(photoIndex / MEDIA_PER_ROW)
        const col = photoIndex % MEDIA_PER_ROW
        const drawX = TABLE_MARGIN + CELL_PADDING + col * (tileWidth + MEDIA_GUTTER)
        const drawY = rowStartYs[row]

        try {
          if (!buffer || buffer.length < 32 || !isPdfKitCompatibleImage(buffer)) {
            throw new Error('unsupported-image-buffer')
          }
          doc.image(buffer, drawX, drawY, {
            fit: [tileWidth, PHOTO_HEIGHT],
            align: "center",
            valign: "top"
          })
        } catch (error) {
          console.warn("Skipped an invalid photo while rendering PDF", (error as Error)?.message)
          doc.save()
          doc.rect(drawX, drawY, tileWidth, PHOTO_HEIGHT).stroke("#ef4444")
          doc.font("Helvetica").fontSize(8).fillColor("#ef4444")
          doc.text("Photo unavailable", drawX + 4, drawY + 4, {
            width: tileWidth - 8,
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
            width: tileWidth,
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
      const { tileWidth, rowHeights, totalHeight } = prepareGridLayout(doc, videos.length, undefined, contentWidth, VIDEO_HEIGHT)
      const rowStartYs: number[] = []
      let pointerY = start
      for (let row = 0; row < rowHeights.length; row += 1) {
        rowStartYs[row] = pointerY
        pointerY += rowHeights[row]
        if (row < rowHeights.length - 1) pointerY += MEDIA_GUTTER
      }

      videos.forEach((video, videoIndex) => {
        const row = Math.floor(videoIndex / MEDIA_PER_ROW)
        const col = videoIndex % MEDIA_PER_ROW
        const drawX = TABLE_MARGIN + CELL_PADDING + col * (tileWidth + MEDIA_GUTTER)
        const drawY = rowStartYs[row]
        doc.save()
        doc.roundedRect(drawX, drawY, tileWidth, VIDEO_HEIGHT, 8).fill("#1e293b")

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

        // No video labels
      })
      return totalHeight
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
    entryOnly?: boolean
    includePhotos?: boolean
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

  const tableRows = await buildTableRows(scopedItems, imageCache, allowedConditionSet, options.entryOnly === true, options.includePhotos !== false)

  if (tableRows.length === 0) {
    doc.text("No checklist items found for this work order.", { italic: true })
    doc.moveDown()
    return
  }

  doc.fontSize(10)
  let y = doc.y

  const headerRow: TableCell[] = [
    { text: "Location", bold: true },
    { text: "Item", bold: true },
    { text: "Subtasks", bold: true },
    { text: "Condition", bold: true }
  ]

  const headerHeight = drawTableRow(doc, y, headerRow, { header: true })
  y += headerHeight

  // Alternate background by second-level group (sub-location)
  let lastGroupKey: string | null = null
  let groupToggle = false
  // Carry the last task-row background color to media and remark rows
  let currentTaskBackground: string | undefined = undefined
  tableRows.forEach((rowInfo) => {
    const remainingSpace = doc.page.height - TABLE_MARGIN - FOOTER_RESERVED - y
    const rowH = rowInfo.mediaOnly ? 0 : calculateRowHeight(doc, rowInfo.cells)
    const mediaH = calculateMediaBlocksHeight(doc, rowInfo.summaryMedia)

    // Pagination rule:
    // - If the table row itself doesn't fit, start a new page before the row.
    // - Otherwise draw the row now and let media paginate independently below.
    // - For media-only rows, decide based on media height only.
    const needsRowPageBreak = !rowInfo.mediaOnly && rowH > remainingSpace

    if (needsRowPageBreak) {
      doc.addPage()
      y = TABLE_MARGIN
      const headerAgainHeight = drawTableRow(doc, y, headerRow, { header: true })
      y += headerAgainHeight
    }

    if (!rowInfo.mediaOnly) {
      // Flip toggle when the group changes and this is a task row
      if (rowInfo.isTaskRow) {
        const g = (rowInfo as any).groupKey || null
        if (g !== lastGroupKey) {
          groupToggle = !groupToggle
          lastGroupKey = g
        }
      }
      // Task rows alternate; non-task rows inherit the last task background
      const background = rowInfo.isTaskRow
        ? (groupToggle ? '#f1f5f9' /* white */ : '#ffffff' /* slate-100: slightly darker grey */)
        : currentTaskBackground
          const consumedHeight = drawTableRow(doc, y, rowInfo.cells, { background, mergeColumns: rowInfo.mergeColumns === true })
          y += consumedHeight
          if (rowInfo.isTaskRow) currentTaskBackground = background
        }

    if (rowInfo.summaryMedia) {
      // Split very large media blocks across pages so photos never overlap the footer
      // and so we can show all photos, even when there are hundreds.
      const normalizedSegments = normalizeSegments(rowInfo.summaryMedia)

      // Iterate each segment and paginate it if necessary
      for (let segIndex = 0; segIndex < normalizedSegments.length; segIndex += 1) {
        const original = normalizedSegments[segIndex]
        let remainingPhotos = Array.isArray(original.photos) ? original.photos.slice() : []
        let remainingCaptions = Array.isArray(original.photoCaptions) ? original.photoCaptions.slice() : []
        let includeText = Boolean(original.text && original.text.trim())
        const videos = Array.isArray(original.videos) ? original.videos.slice() : []

        // Helper to add a page and redraw the header
        const ensureNewPageWithHeader = () => {
          doc.addPage()
          y = TABLE_MARGIN
          const headerAgainHeight = drawTableRow(doc, y, headerRow, { header: true })
          y += headerAgainHeight
        }

        while (includeText || remainingPhotos.length > 0 || videos.length > 0) {
          // Available space on the current page (below current y), respecting footer area
          let remainingSpace = doc.page.height - TABLE_MARGIN - FOOTER_RESERVED - y
          const headerHeight = calculateRowHeight(doc, headerRow)
          const maxPerFreshPage = (doc.page.height - TABLE_MARGIN - FOOTER_RESERVED) - (TABLE_MARGIN + headerHeight)

          if (remainingSpace <= 16) {
            // Not enough space to draw anything meaningful, go to the next page with header
            ensureNewPageWithHeader()
            remainingSpace = doc.page.height - TABLE_MARGIN - FOOTER_RESERVED - y
          }

          const contentWidth = getTableWidth(doc) - CELL_PADDING * 2

          // Compute text block height (if needed)
          let textHeight = 0
          const textValue = includeText ? (original.text?.trim() || "") : ""
          if (textValue) {
            doc.font("Helvetica").fontSize(10)
            textHeight = doc.heightOfString(textValue, { width: contentWidth, align: 'left' })
          }

          // Base padding for the media block
          const basePadding = CELL_PADDING * 2

          // Determine how many photo rows can fit into remainingSpace
          let rowsToTake = 0
          let photosToTake = 0

          const hasPhotosRemaining = remainingPhotos.length > 0
          const hasVideosRemaining = videos.length > 0

          // Space budget after base + text + optional gutter if media exists
          const needGutter = textHeight > 0 && (hasPhotosRemaining || hasVideosRemaining)
          let availableForMedia = remainingSpace - basePadding - textHeight - (needGutter ? MEDIA_GUTTER : 0)

          if (hasPhotosRemaining && availableForMedia > 0) {
            // Compute row heights for remaining photos and include as many rows as possible
            const layout = prepareGridLayout(doc, remainingPhotos.length, remainingCaptions, contentWidth, PHOTO_HEIGHT)
            let acc = 0
            for (let r = 0; r < layout.rowHeights.length; r += 1) {
              const rowHeight = layout.rowHeights[r]
              if (r > 0) acc += MEDIA_GUTTER
              if (acc + rowHeight > availableForMedia) break
              acc += rowHeight
              rowsToTake += 1
            }
            photosToTake = Math.min(remainingPhotos.length, rowsToTake * MEDIA_PER_ROW)
          }

          // If no photos can fit but we still have text, render text-only chunk once
          if (photosToTake === 0 && textHeight > 0 && remainingSpace >= basePadding + textHeight) {
            const chunk: CellSegment = {
              text: textValue,
              photos: [],
              photoCaptions: [],
              videos: []
            }
            const chunkHeight = calculateMediaBlocksHeight(doc, chunk)
            if (chunkHeight > remainingSpace) {
              // Even text alone doesn't fit—move to next page
              ensureNewPageWithHeader()
              continue
            }
            // Background paint
            if (currentTaskBackground) {
              doc.save()
              try {
            doc.fillColor(currentTaskBackground)
            if (typeof (doc as any).opacity === 'function') (doc as any).opacity(0.6)
            doc.rect(TABLE_MARGIN, y, getTableWidth(doc), chunkHeight).fill()
          } finally {
            if (typeof (doc as any).opacity === 'function') (doc as any).opacity(1)
            doc.restore()
          }
            }
            const consumed = drawMediaBlocks(doc, y, chunk)
            y += consumed
            includeText = false
            continue
          }

          // If still nothing fits and the block is simply larger than a single fresh page,
          // we must force a new page and try again (the loop will continue chunking rows).
          if (photosToTake === 0 && hasPhotosRemaining) {
            // Not enough space on current page even for a single row of photos → move to a fresh page
            ensureNewPageWithHeader()
            continue
          }

          // Compose the chunk segment
          const chunkPhotos = remainingPhotos.slice(0, photosToTake)
          const chunkCaptions = remainingCaptions.slice(0, photosToTake)
          const chunk: CellSegment = {
            text: includeText ? textValue : undefined,
            photos: chunkPhotos,
            photoCaptions: chunkCaptions,
            videos: []
          }
          let chunkHeight = calculateMediaBlocksHeight(doc, chunk)

          // If chunk still exceeds remaining space, push to next page
          if (chunkHeight > remainingSpace) {
            ensureNewPageWithHeader()
            continue
          }

          // Paint matching background
          if (currentTaskBackground) {
            doc.save()
            try {
            doc.fillColor(currentTaskBackground)
            if (typeof (doc as any).opacity === 'function') (doc as any).opacity(0.6)
            doc.rect(TABLE_MARGIN, y, getTableWidth(doc), chunkHeight).fill()
          } finally {
            if (typeof (doc as any).opacity === 'function') (doc as any).opacity(1)
            doc.restore()
          }
          }

          // Draw and advance pointers
          const consumed = drawMediaBlocks(doc, y, chunk)
          y += consumed
          includeText = false
          remainingPhotos = remainingPhotos.slice(photosToTake)
          remainingCaptions = remainingCaptions.slice(photosToTake)
        }
      }
    }
  })

}
 
