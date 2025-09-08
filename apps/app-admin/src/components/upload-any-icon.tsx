"use client"

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props {
  itemId: string
  workOrderId: string
  title?: string
}

export default function UploadAnyIcon({ itemId, workOrderId, title = 'Upload media' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [uploading, setUploading] = useState(false)

  const onClick = () => inputRef.current?.click()

  const onChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const isVideo = file.type?.startsWith('video/')
      const endpoint = isVideo ? 'videos' : 'photos'
      const form = new FormData()
      form.set('file', file)
      form.set('workOrderId', workOrderId)
      const res = await fetch(`/api/checklist-items/${itemId}/${endpoint}`, { method: 'POST', body: form })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Upload failed')
      }
      router.refresh()
    } catch (err) {
      console.error(err)
      alert((err as Error).message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={onChange} />
      <Button type="button" variant="ghost" size="icon" onClick={onClick} title={title} aria-label={title}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      </Button>
    </>
  )
}

