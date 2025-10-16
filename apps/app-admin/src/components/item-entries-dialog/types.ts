export type Task = {
  id: string
  name?: string | null
  status?: string | null
  condition?: string | null
  photos?: string[] | null
  videos?: string[] | null
  entries?: { id: string }[] | null
  location?: { id: string; name?: string | null } | null
}

export type EntryMedia = {
  id: string
  url: string
  caption?: string | null
  type: 'PHOTO' | 'VIDEO'
  order?: number | null
}

export type Entry = {
  id: string
  remarks?: string | null
  cause?: string | null
  resolution?: string | null
  includeInReport?: boolean | null
  inspector?: { id: string; name: string } | null
  user?: { id: string; username?: string | null; email?: string | null } | null
  condition?: string | null
  task?: Task | null
  photos?: string[] | null
  videos?: string[] | null
  media?: EntryMedia[] | null
  location?: any
}

export type DisplayEntry = Entry & {
  task: Task | undefined
  photos: import("@/components/work-order-item-media").MediaAttachment[]
  videos: import("@/components/work-order-item-media").MediaAttachment[]
}

export type PendingMediaFile = {
  file: File
  caption: string
}

