"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import UploadAnyIcon from '@/components/upload-any-icon'
import { normalizeMediaInput, type MediaAttachment } from '@/lib/media-utils'

interface Props {
  itemId: string
  workOrderId: string
  photos?: MediaAttachment[] | string[]
  videos?: MediaAttachment[] | string[]
  itemName?: string
  contributionId?: string
  enableUpload?: boolean
  uploadTarget?: 'item' | 'task'
  // Optional indexing context for captions (location.task indexes)
  itemNumber?: number
  locationOptions?: Array<{ id: string; name?: string | null; tasks?: Array<{ id: string; name?: string | null }> }>
  // For remark (ItemEntry) viewer: use this when media has no taskId
  defaultLocationId?: string
}

export default function WorkOrderItemMedia({
  itemId,
  workOrderId,
  photos = [],
  videos = [],
  itemName,
  contributionId,
  enableUpload,
  uploadTarget = 'task',
  itemNumber,
  locationOptions = [],
  defaultLocationId,
}: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'photos' | 'videos'>('photos')

  const normalizedPhotos = normalizeMediaInput(photos)
  const normalizedVideos = normalizeMediaInput(videos)
  const hasPhotos = normalizedPhotos.length > 0
  const hasVideos = normalizedVideos.length > 0
  const openPhotos = () => { if (!hasPhotos) return; setMode('photos'); setOpen(true) }
  const openVideos = () => { if (!hasVideos) return; setMode('videos'); setOpen(true) }

  const taskIndexById = new Map<string, { loc: number; idx: number; name?: string | null }>()
  locationOptions.forEach((loc, locPos) => {
    (loc.tasks || []).forEach((t, tPos) => {
      if (t?.id) taskIndexById.set(t.id, { loc: locPos + 1, idx: tPos + 1, name: t.name })
    })
  })
  // Resolve location index from a provided location id (for location-level media)
  const locationIndexFromId = (locId?: string | null): number | null => {
    if (!locId) return null
    const idx = locationOptions.findIndex((l) => l.id === locId)
    return idx >= 0 ? idx + 1 : null
  }
  const buildIndexLabel = (taskId?: string | null, locIdForNoTask?: string | null): string | null => {
    if (taskId) {
      const match = taskIndexById.get(taskId)
      if (!match) return null
      return itemNumber ? `${match.loc}.${itemNumber}.${match.idx}` : `${match.loc}.${match.idx}`
    }
    // location-level numbering style: "loc.item location N"
    const locIdx = locationIndexFromId(locIdForNoTask || defaultLocationId)
    if (!locIdx || !itemNumber) return null
    return `${locIdx}.${itemNumber}`
  }
  const buildCaption = (att: MediaAttachment, _locSeq?: number | null): string | null => {
    const idx = buildIndexLabel(att.taskId, att.locationId ?? defaultLocationId)
    const taskName = att.taskId ? taskIndexById.get(att.taskId)?.name : undefined
    const base = att.caption || null
    if (idx && base) return `${idx} ${base}`
    if (idx) return idx
    return base ?? null
  }

  // Sort media: entry media first, then task media, then item media
  const sortKey = (att: MediaAttachment): [number, number, number, number, string] => {
    // If we are in remarks context, force: ItemEntry media first, then task, then item
    if (contributionId) {
      const bucketForced = att.taskId ? 1 : 0
      const idxF = att.taskId ? taskIndexById.get(att.taskId as string) : undefined
      const locF = idxF?.loc ?? Number.MAX_SAFE_INTEGER
      const taskF = idxF?.idx ?? Number.MAX_SAFE_INTEGER
      const orderF = typeof att.order === 'number' ? att.order : Number.MAX_SAFE_INTEGER
      return [bucketForced, locF, taskF, orderF, att.url]
    }
    const src = (att as any).source as ('entry'|'task'|'item'|undefined)
    let bucket = 2
    if (src === 'entry') bucket = 0
    else if (src === 'task') bucket = 1
    else if (src === 'item') bucket = 2
    else bucket = att.taskId ? 1 : 2
    const order = typeof att.order === 'number' ? att.order : Number.MAX_SAFE_INTEGER
    const idx = att.taskId ? taskIndexById.get(att.taskId as string) : undefined
    const loc = idx?.loc ?? Number.MAX_SAFE_INTEGER
    const task = idx?.idx ?? Number.MAX_SAFE_INTEGER
    return [bucket, loc, task, order, att.url]
  }
  const sortedPhotos = [...normalizedPhotos].sort((a, b) => {
    const ka = sortKey(a); const kb = sortKey(b)
    for (let i = 0; i < ka.length; i++) { if (ka[i] !== kb[i]) return ka[i] - kb[i] }
    return 0
  })
  const sortedVideos = [...normalizedVideos].sort((a, b) => {
    const ka = sortKey(a); const kb = sortKey(b)
    for (let i = 0; i < ka.length; i++) { if (ka[i] !== kb[i]) return ka[i] - kb[i] }
    return 0
  })

  return (
    <div className="flex items-center gap-3 relative z-10">
      {hasPhotos ? (
        <button onClick={openPhotos} className="text-sm underline underline-offset-4 text-primary bg-transparent p-0 cursor-pointer">
          {normalizedPhotos.length} photo(s)
        </button>
      ) : (
        <span className="text-sm text-muted-foreground">0 photo(s)</span>
      )}
      <span>•</span>
      {hasVideos ? (
        <button onClick={openVideos} className="text-sm underline underline-offset-4 text-primary bg-transparent p-0 cursor-pointer">
          {normalizedVideos.length} video(s)
        </button>
      ) : (
        <span className="text-sm text-muted-foreground">0 video(s)</span>
      )}
      {enableUpload && (
        <UploadAnyIcon
          itemId={itemId}
          workOrderId={workOrderId}
          title="Upload photo or video"
          contributionId={contributionId}
          target={uploadTarget}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl md:max-w-5xl w-full h-[72vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {itemName ? `${itemName} — ` : ''}{mode === 'photos' ? 'Photos' : 'Videos'}
            </DialogTitle>
          </DialogHeader>
          {mode === 'photos' ? (
            hasPhotos ? (
              <div
                className="grid grid-cols-2 md:grid-cols-3 gap-3"
                onMouseDown={() => {
                  // Blur any previously focused element (e.g., the dialog close button)
                  const el = document.activeElement as HTMLElement | null
                  if (el && typeof el.blur === 'function') el.blur()
                }}
              >
                {(() => {
                  return sortedPhotos.map((photo, index) => (
                  <div key={photo.url} className="space-y-2">
                    <a
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                      onMouseDown={(e) => {
                        const el = document.activeElement as HTMLElement | null
                        if (el && typeof el.blur === 'function') el.blur()
                      }}
                    >
                      <img
                        src={photo.url}
                        alt={(buildCaption(photo, null) || `Photo ${index + 1}`) + ` (Photo ${index + 1})`}
                        className="h-48 w-full rounded object-cover border"
                      />
                    </a>
                    {(() => { const c = buildCaption(photo, null); return c ? (<p className="text-xs text-muted-foreground">{c}</p>) : null })()}
                  </div>
                  ))
                })()}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No photos available.</p>
            )
          ) : (
            hasVideos ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(() => {
                  return sortedVideos.map((video, index) => (
                  <div key={video.url} className="space-y-2">
                    <video src={video.url} controls className="w-full h-64 md:h-80 rounded border" />
                    {(() => { const c = buildCaption(video, null); return c ? (<p className="text-xs text-muted-foreground">{c}</p>) : null })()}
                  </div>
                  ))
                })()}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No videos available.</p>
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
