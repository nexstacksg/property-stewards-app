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

const CONDITION_OPTIONS = [
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "UNSATISFACTORY", label: "Un-satisfactory" },
  { value: "UN_OBSERVABLE", label: "Un-observable" },
  { value: "NOT_APPLICABLE", label: "Not applicable" },
]

interface GenerateContractReportButtonProps {
  contractId: string
  defaultTitle: string
  defaultFileName: string
  className?: string
}

export function GenerateContractReportButton({
  contractId,
  defaultTitle,
  defaultFileName,
  className,
}: GenerateContractReportButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [selectedConditions, setSelectedConditions] = useState<string[]>(CONDITION_OPTIONS.map((option) => option.value))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle)
      setSelectedConditions(CONDITION_OPTIONS.map((option) => option.value))
    }
  }, [open, defaultTitle])

  const toggleCondition = (value: string) => {
    setSelectedConditions((prev) =>
      prev.includes(value)
        ? prev.filter((entry) => entry !== value)
        : [...prev, value]
    )
  }

  const handleSubmit = async () => {
    if (submitting) return
    if (selectedConditions.length === 0) {
      showToast({
        title: "Select at least one condition",
        description: "Choose one or more conditions to include in the report.",
        variant: "error"
      })
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch(`/api/contracts/${contractId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          conditions: selectedConditions,
        })
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
        <Button type="button" className={className}>
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
          <div className="space-y-2">
            <Label>Include conditions</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {CONDITION_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded-sm border border-input text-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    checked={selectedConditions.includes(option.value)}
                    onChange={() => toggleCondition(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || title.trim().length === 0 || selectedConditions.length === 0}
            >
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
