"use client"

import { useEffect, useState } from "react"
import { Loader2, FilePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface GenerateContractReportButtonProps {
  contractId: string
  defaultTitle: string
  defaultFileName: string
}

export function GenerateContractReportButton({
  contractId,
  defaultTitle,
  defaultFileName,
}: GenerateContractReportButtonProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle)
    }
  }, [open, defaultTitle])

  const buildDownloadName = () => {
    const base = title.trim().length > 0
      ? title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      : ""
    if (base) {
      return `${base}.pdf`
    }
    return defaultFileName.endsWith(".pdf") ? defaultFileName : `${defaultFileName}.pdf`
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const url = new URL(`/api/contracts/${contractId}/report`, window.location.origin)
      if (title.trim().length > 0) {
        url.searchParams.set("title", title.trim())
      }

      const response = await fetch(url.toString(), {
        cache: "no-store",
      })

      if (!response.ok) {
        throw new Error(`Failed to generate PDF (${response.status})`)
      }

      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = blobUrl
      link.download = buildDownloadName()
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)

      setOpen(false)
    } catch (error) {
      console.error("Failed to generate PDF", error)
      alert(error instanceof Error ? error.message : "Failed to generate PDF")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <FilePlus className="mr-2 h-4 w-4" />
          Generate PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Contract Report</DialogTitle>
          <DialogDescription>
            Enter a custom title for the PDF. The report will download immediately after generation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-title">Report title</Label>
            <Input
              id="report-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Inspection Report"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={submitting || title.trim().length === 0}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
