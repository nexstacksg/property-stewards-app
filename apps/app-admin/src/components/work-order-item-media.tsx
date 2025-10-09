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
}

export default function WorkOrderItemMedia({
  itemId,
  workOrderId,
  photos = [],
  videos = [],
  itemName,
  contributionId,
  enableUpload,
  uploadTarget = 'task'
}: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'photos' | 'videos'>('photos')

  const normalizedPhotos = normalizeMediaInput(photos)
  const normalizedVideos = normalizeMediaInput(videos)
  const hasPhotos = normalizedPhotos.length > 0
  const hasVideos = normalizedVideos.length > 0
  const openPhotos = () => { if (!hasPhotos) return; setMode('photos'); setOpen(true) }
  const openVideos = () => { if (!hasVideos) return; setMode('videos'); setOpen(true) }

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
        <DialogContent className="sm:max-w-2xl h-[60vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {itemName ? `${itemName} — ` : ''}{mode === 'photos' ? 'Photos' : 'Videos'}
            </DialogTitle>
          </DialogHeader>
          {mode === 'photos' ? (
            hasPhotos ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {normalizedPhotos.map((photo, index) => (
                  <div key={photo.url} className="space-y-2">
                    <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block">
                      <img
                        src={photo.url}
                        alt={photo.caption ? `${photo.caption} (Photo ${index + 1})` : `Photo ${index + 1}`}
                        className="h-48 w-full rounded object-cover border"
                      />
                    </a>
                    {photo.caption ? (
                      <p className="text-xs text-muted-foreground">{photo.caption}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No photos available.</p>
            )
          ) : (
            hasVideos ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {normalizedVideos.map((video, index) => (
                  <div key={video.url} className="space-y-2">
                    <video src={video.url} controls className="w-full h-64 md:h-80 rounded border" />
                    {video.caption ? (
                      <p className="text-xs text-muted-foreground">{video.caption}</p>
                    ) : null}
                  </div>
                ))}
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
