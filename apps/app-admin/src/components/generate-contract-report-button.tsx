"use client"

import { useEffect, useState } from "react"
import { Loader2, FilePlus } from "lucide-react"
import { useRouter } from "next/navigation"
import { showToast } from "@/lib/toast"

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
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle)
    }
  }, [open, defaultTitle])

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const response = await fetch(`/api/contracts/${contractId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      })

      if (!response.ok) {
        throw new Error(`Failed to generate PDF (${response.status})`)
      }

      const data = await response.json()
      const downloadUrl: string | undefined = data?.fileUrl
      if (downloadUrl) {
        const link = document.createElement("a")
        link.href = downloadUrl
        link.target = "_blank"
        link.download = downloadUrl.split("/").pop() || defaultFileName
        document.body.appendChild(link)
        link.click()
        link.remove()
        showToast({ title: "Report generated", description: "PDF downloaded and saved.", variant: "success" })
      } else {
        showToast({ title: "Report generated", description: "Stored in history.", variant: "success" })
      }

      setOpen(false)
      router.refresh()
    } catch (error) {
      console.error("Failed to generate PDF", error)
      showToast({ title: "Failed to generate PDF", description: error instanceof Error ? error.message : undefined, variant: "error" })
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
