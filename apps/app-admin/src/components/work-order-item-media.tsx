"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import UploadAnyIcon from '@/components/upload-any-icon'

interface Props {
  itemId: string
  workOrderId: string
  photos?: string[]
  videos?: string[]
  itemName?: string
}

export default function WorkOrderItemMedia({ itemId, workOrderId, photos = [], videos = [], itemName }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'photos' | 'videos'>('photos')

  const hasPhotos = Array.isArray(photos) && photos.length > 0
  const hasVideos = Array.isArray(videos) && videos.length > 0
  const openPhotos = () => { if (!hasPhotos) return; setMode('photos'); setOpen(true) }
  const openVideos = () => { if (!hasVideos) return; setMode('videos'); setOpen(true) }

  return (
    <div className="flex items-center gap-3">
      {hasPhotos ? (
        <button onClick={openPhotos} className="text-sm underline underline-offset-4 text-primary bg-transparent p-0">
          {photos.length} photo(s)
        </button>
      ) : (
        <span className="text-sm text-muted-foreground">0 photo(s)</span>
      )}
      <span>•</span>
      {hasVideos ? (
        <button onClick={openVideos} className="text-sm underline underline-offset-4 text-primary bg-transparent p-0">
          {videos.length} video(s)
        </button>
      ) : (
        <span className="text-sm text-muted-foreground">0 video(s)</span>
      )}
      <UploadAnyIcon itemId={itemId} workOrderId={workOrderId} title="Upload photo or video" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl h-[60vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>
              {itemName ? `${itemName} — ` : ''}{mode === 'photos' ? 'Photos' : 'Videos'}
            </DialogTitle>
          </DialogHeader>
          {mode === 'photos' ? (
            photos && photos.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={url} alt={`Photo ${i + 1}`} className="h-48 w-full rounded object-cover border" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No photos available.</p>
            )
          ) : (
            videos && videos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {videos.map((url, i) => (
                  <video key={i} src={url} controls className="w-full h-64 md:h-80 rounded border" />
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
