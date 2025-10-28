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
          showToast({ title: 'Popup blocked', description: 'Please allow popups for this site and click again.' })
        }
        return
      }

      setIsLoading(true)
      // Generate preview first via GET (format=json) to avoid POST 405 on some deployments
      const jsonUrl = href.replace(/\/report(?:\?.*)?$/, (m) => `${m.replace('/report', '/report/preview')}?format=json`)
      const redirectUrl = href.replace(/\/report(?:\?.*)?$/, (m) => m.replace('/report', '/report/preview'))

      // Add a 60s safety timeout to avoid hanging fetch in the browser
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000)
      let resp: Response
      try {
        resp = await fetch(jsonUrl, { method: 'GET', cache: 'no-store', signal: controller.signal })
      } finally {
        clearTimeout(timeout)
      }
      let data: { fileUrl?: string; error?: string } | null = null
      // Only try to parse JSON when server declares it
      if (resp.headers.get('content-type')?.includes('application/json')) {
        try { data = await resp.json() } catch {}
      }
      if (!resp.ok) {
        const message = data?.error || `Failed to generate preview (${resp.status})`
        throw new Error(message)
      }
      // If JSON parse failed or no fileUrl is provided, fall back to 302 route
      if (!data?.fileUrl) {
        setReadyUrl(redirectUrl)
        showToast({ title: 'Preview ready', description: 'Click “Open Preview” to view in a new tab.', variant: 'success' })
        return
      }

      // Do not auto-open. Store URL and switch button to Open Preview.
      setReadyUrl(data.fileUrl)
      showToast({ title: 'Preview ready', description: 'Click “Open Preview” to view in a new tab.', variant: 'success' })
    } catch (error) {
      console.error('Failed to generate PDF', error)
      // As a final fallback, offer opening the redirect route directly
      try {
        const fallbackUrl = href.replace(/\/report(?:\?.*)?$/, (m) => m.replace('/report', '/report/preview'))
        setReadyUrl(fallbackUrl)
        showToast({ title: 'Preview queued', description: 'Click “Open Preview” to open in a new tab.', variant: 'success' })
      } catch {
        showToast({ title: 'Failed to generate PDF', description: error instanceof Error ? error.message : 'Please try again.', variant: 'error' })
      }
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
