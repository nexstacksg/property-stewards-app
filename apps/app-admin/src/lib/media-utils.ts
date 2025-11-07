export type MediaAttachment = {
  url: string
  caption?: string | null
  order?: number | null
  // Optional linkage to a specific subtask for indexing
  taskId?: string | null
  // Optional source to influence sorting (entry -> task -> item)
  source?: 'entry' | 'task' | 'item'
  // Optional location linkage for location-level ItemEntry media
  locationId?: string | null
}

type EntryMediaRecord = {
  url?: string | null
  caption?: string | null
  type?: string | null
  order?: number | null
  // Present when media was attached to a specific checklist task
  taskId?: string | null
}

type EntryWithMedia = {
  media?: EntryMediaRecord[] | null
  photos?: string[] | null
  videos?: string[] | null
}

export function stringsToAttachments(values: unknown, startOrder = 0): MediaAttachment[] {
  if (!Array.isArray(values)) return []
  return (values as unknown[])
    .map((value, index) => {
      if (typeof value !== 'string') return null
      const url = value.trim()
      if (!url) return null
      return { url, caption: null, order: startOrder + index, source: 'item', locationId: null, taskId: null }
    })
    .filter((entry): entry is MediaAttachment => Boolean(entry))
}

// New: include taskId on attachments generated from a task's legacy arrays
export function stringsToAttachmentsWithTask(values: unknown, taskId?: string | null, startOrder = 0): MediaAttachment[] {
  if (!Array.isArray(values)) return []
  return (values as unknown[])
    .map((value, index) => {
      if (typeof value !== 'string') return null
      const url = value.trim()
      if (!url) return null
      return { url, caption: null, order: startOrder + index, taskId: taskId ?? null, source: 'task', locationId: null }
    })
    .filter((entry): entry is MediaAttachment => Boolean(entry))
}

export function mergeMediaLists(groups: Array<MediaAttachment[] | undefined | null>): MediaAttachment[] {
  const ordered: MediaAttachment[] = []
  const seen = new Map<string, MediaAttachment>()

  groups.forEach((group) => {
    if (!Array.isArray(group)) return
    group.forEach((item) => {
      if (!item?.url) return
      if (!seen.has(item.url)) {
        const order = typeof item.order === 'number' ? item.order : ordered.length
        const next: MediaAttachment = {
          url: item.url,
          caption: item.caption ?? null,
          order,
          taskId: typeof item.taskId === 'string' ? item.taskId : (item.taskId ?? null) as any,
          source: (item as any).source || undefined,
          locationId: typeof (item as any).locationId === 'string' ? (item as any).locationId : ((item as any).locationId ?? null) as any,
        }
        ordered.push(next)
        seen.set(item.url, next)
        return
      }

      const existing = seen.get(item.url)!
      if (!existing.caption && item.caption) {
        existing.caption = item.caption
      }
      if (!existing.taskId && item.taskId) {
        existing.taskId = item.taskId
      }
      if (!existing.source && (item as any).source) {
        existing.source = (item as any).source
      }
      if (!existing.locationId && (item as any).locationId) {
        existing.locationId = (item as any).locationId as any
      }
    })
  })

  return ordered.sort((a, b) => {
    const aOrder = typeof a.order === 'number' ? a.order : 0
    const bOrder = typeof b.order === 'number' ? b.order : 0
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.url.localeCompare(b.url)
  })
}

export function extractEntryMedia(entry: EntryWithMedia | null | undefined, type: 'PHOTO' | 'VIDEO'): MediaAttachment[] {
  if (!entry) return []
  const entryLocId = (entry as any)?.location?.id || (entry as any)?.locationId || null
  const typedMedia = Array.isArray(entry.media)
    ? entry.media
        .filter((media) => media && media.type === type && typeof media.url === 'string')
        .map((media, index) => {
          const caption = typeof media.caption === 'string' && media.caption.trim().length > 0
            ? media.caption.trim()
            : null
          const order = typeof media.order === 'number' ? media.order : index
          const taskId = (media as any)?.taskId ?? null
          // For location-level media rows (no taskId), attach locationId for indexing in table view
          const locationId = taskId ? null : entryLocId
          return { url: media.url as string, caption, order, taskId, source: 'entry', locationId }
        })
    : []

  const fallbackUrls = type === 'PHOTO' ? entry.photos : entry.videos
  const fallbackAttachments = stringsToAttachments(fallbackUrls).map((a, i) => ({
    ...a,
    source: 'entry' as const,
    order: typeof a.order === 'number' ? a.order : i,
    locationId: entryLocId,
  }))

  return mergeMediaLists([typedMedia, fallbackAttachments])
}

export function normalizeMediaInput(input?: MediaAttachment[] | string[] | null | undefined): MediaAttachment[] {
  if (!Array.isArray(input)) return []
  return input
    .map((entry, index) => {
      if (typeof entry === 'string') {
        const url = entry.trim()
        if (!url) return null
        return { url, caption: null, order: index, source: 'item', locationId: null, taskId: null }
      }
      const url = typeof entry?.url === 'string' ? entry.url : ''
      if (!url) return null
      const caption = typeof entry.caption === 'string' && entry.caption.trim().length > 0
        ? entry.caption.trim()
        : null
      const order = typeof entry.order === 'number' ? entry.order : index
      const taskId = typeof (entry as any).taskId === 'string' ? (entry as any).taskId : (entry as any).taskId ?? null
      const source = (entry as any).source as any
      const locationId = typeof (entry as any).locationId === 'string' ? (entry as any).locationId : (entry as any).locationId ?? null
      return { url, caption, order, taskId, source, locationId }
    })
    .filter((entry): entry is MediaAttachment => Boolean(entry))
}
