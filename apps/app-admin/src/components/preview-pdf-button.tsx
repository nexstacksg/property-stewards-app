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

      // Build preview endpoints robustly, preserving existing query params
      const toPreviewUrl = (baseHref: string, opts?: { json?: boolean; check?: boolean }) => {
        const u = new URL(baseHref, window.location.origin)
        u.pathname = u.pathname.replace(/\/report$/, '/report/preview')
        if (opts?.json) u.searchParams.set('format', 'json')
        if (opts?.check) u.searchParams.set('check', '1')
        return u.toString()
      }
      // Generate preview first via GET (format=json) to avoid CORS on redirect to Spaces
      const jsonUrl = toPreviewUrl(href, { json: true })
      const redirectUrl = toPreviewUrl(href)

      // Request JSON preview; allow long-running server work without aborting
      let fileUrl: string | undefined
      try {
        const resp = await fetch(jsonUrl, { method: 'GET', cache: 'no-store' })
        let data: { fileUrl?: string; error?: string } | null = null
        if (resp.headers.get('content-type')?.includes('application/json')) {
          try { data = await resp.json() } catch {}
        }
        if (!resp.ok) {
          const message = data?.error || `Failed to generate preview (${resp.status})`
          throw new Error(message)
        }
        if (data?.fileUrl) fileUrl = data.fileUrl
      } catch (e) {
        // ignore; we will poll the lightweight check endpoint instead
      }

      // If no URL yet, poll the check endpoint (does not generate) for up to 2 minutes
      if (!fileUrl) {
        const checkUrl = toPreviewUrl(href, { json: true, check: true })
        const started = Date.now()
        const timeoutMs = 120000
        const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))
        while (!fileUrl && Date.now() - started < timeoutMs) {
          try {
            const r = await fetch(checkUrl, { method: 'GET', cache: 'no-store' })
            if (r.ok && r.headers.get('content-type')?.includes('application/json')) {
              const j = await r.json().catch(() => ({})) as any
              if (j?.fileUrl) {
                fileUrl = j.fileUrl
                break
              }
            }
          } catch {}
          await sleep(3000)
        }
      }

      if (!fileUrl) {
        throw new Error('Preview not ready yet — please try again shortly')
      }
      setReadyUrl(fileUrl)
      showToast({ title: 'Preview ready', description: 'Click “Open Preview” to view in a new tab.', variant: 'success' })
    } catch (error) {
      console.error('Failed to generate PDF', error)
      showToast({ title: 'Preview not ready', description: error instanceof Error ? error.message : 'Please try again shortly.', variant: 'error' })
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
