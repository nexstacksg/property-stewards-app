"use client"

import { useState } from "react"
import { FileDown, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { showToast } from "@/lib/toast"

interface PreviewPdfButtonProps {
  href: string
  fileName: string
  label?: string
  className?: string
}

export function PreviewPdfButton({ href, fileName, label = "Preview PDF", className }: PreviewPdfButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [readyUrl, setReadyUrl] = useState<string | null>(null)

  const handleGenerate = async () => {
    try {
      if (isLoading) return
      // If URL is ready, only open it now
      if (readyUrl) {
        let opened = false
        try { opened = !!window.open(readyUrl, '_blank', 'noopener,noreferrer') } catch {}
        if (!opened) {
          try {
            const a = document.createElement('a')
            a.href = readyUrl
            a.target = '_blank'
            a.rel = 'noopener noreferrer'
            document.body.appendChild(a)
            a.click()
            a.remove()
            opened = true
          } catch {}
        }
        if (!opened) {
          showToast({ title: 'Popup blocked', description: 'Please allow popups for this site and click again.', variant: 'info' })
        }
        return
      }

      setIsLoading(true)
      // Generate preview first via GET (format=json) to avoid POST 405 on some deployments
      const apiUrl = href.replace(/\/report(?:\?.*)?$/, (m) => `${m.replace('/report', '/report/preview')}?format=json`)
      const resp = await fetch(apiUrl, { method: 'GET', cache: 'no-store' })
      if (!resp.ok || !resp.headers.get('content-type')?.includes('application/json')) {
        throw new Error(`Failed to generate preview (${resp.status})`)
      }
      const data = await resp.json().catch(() => null) as { fileUrl?: string }
      if (!data?.fileUrl) throw new Error('No file URL returned')

      // Do not auto-open. Store URL and switch button to Open Preview.
      setReadyUrl(data.fileUrl)
      showToast({ title: 'Preview ready', description: 'Click “Open Preview” to view in a new tab.', variant: 'success' })
    } catch (error) {
      console.error('Failed to generate PDF', error)
      showToast({ title: 'Failed to generate PDF', description: 'Please try again.', variant: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button onClick={handleGenerate} variant="outline" disabled={isLoading} type="button" className={className}>
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <FileDown className="mr-2 h-4 w-4" />
          {readyUrl ? 'Open Preview' : label}
        </>
      )}
    </Button>
  )
}
