export type MediaAttachment = {
  url: string
  caption?: string | null
  order?: number | null
}

type EntryMediaRecord = {
  url?: string | null
  caption?: string | null
  type?: string | null
  order?: number | null
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
      return { url, caption: null, order: startOrder + index }
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
        }
        ordered.push(next)
        seen.set(item.url, next)
        return
      }

      const existing = seen.get(item.url)!
      if (!existing.caption && item.caption) {
        existing.caption = item.caption
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
  const typedMedia = Array.isArray(entry.media)
    ? entry.media
        .filter((media) => media && media.type === type && typeof media.url === 'string')
        .map((media, index) => {
          const caption = typeof media.caption === 'string' && media.caption.trim().length > 0
            ? media.caption.trim()
            : null
          const order = typeof media.order === 'number' ? media.order : index
          return { url: media.url as string, caption, order }
        })
    : []

  const fallbackUrls = type === 'PHOTO' ? entry.photos : entry.videos
  const fallbackAttachments = stringsToAttachments(fallbackUrls)

  return mergeMediaLists([typedMedia, fallbackAttachments])
}

export function normalizeMediaInput(input?: MediaAttachment[] | string[] | null | undefined): MediaAttachment[] {
  if (!Array.isArray(input)) return []
  return input
    .map((entry, index) => {
      if (typeof entry === 'string') {
        const url = entry.trim()
        if (!url) return null
        return { url, caption: null, order: index }
      }
      const url = typeof entry?.url === 'string' ? entry.url : ''
      if (!url) return null
      const caption = typeof entry.caption === 'string' && entry.caption.trim().length > 0
        ? entry.caption.trim()
        : null
      const order = typeof entry.order === 'number' ? entry.order : index
      return { url, caption, order }
    })
    .filter((entry): entry is MediaAttachment => Boolean(entry))
}
