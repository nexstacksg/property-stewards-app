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
      // Build robust preview URLs while preserving existing query params (e.g., wo=...)
      const buildPreviewUrl = (extraParams?: Record<string, string>) => {
        const url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
        // Replace trailing /report with /report/preview
        url.pathname = url.pathname.replace(/\/report$/, '/report/preview')
        url.searchParams.set('format', 'json')
        if (extraParams) {
          for (const [k, v] of Object.entries(extraParams)) {
            url.searchParams.set(k, v)
          }
        }
        return url.toString()
      }

      // Kick off preview generation asynchronously so the request returns immediately
      const jsonUrl = buildPreviewUrl({ async: '1' })

      // Request JSON preview; allow long-running server work without aborting
      let fileUrl: string | undefined
      try { await fetch(jsonUrl, { method: 'GET', cache: 'no-store' }) } catch {}

      // If no URL yet, poll the check endpoint (does not generate) for up to 2 minutes
      if (!fileUrl) {
        const checkUrl = buildPreviewUrl({ check: '1', async: '' })
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
        // Do not throw or log; show a subtle toast and exit quietly
        showToast({ title: 'Preview not ready', description: 'Please try again shortly.', variant: 'info' })
        return
      }
      setReadyUrl(fileUrl)
      showToast({ title: 'Preview ready', description: 'Click “Open Preview” to view in a new tab.', variant: 'success' })
    } catch {
      // Suppress console errors for gateway timeouts; show a gentle toast instead
      showToast({ title: 'Preview not ready', description: 'Please try again shortly.', variant: 'info' })
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
