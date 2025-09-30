"use client"

import { useState } from "react"
import { Download, Mail, MessageCircle, Loader2 } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { showToast } from "@/lib/toast"

interface ReportActionsProps {
  contractId: string
  report: {
    id: string
    fileUrl: string | null
    version: number | string
  }
  customerEmail?: string | null
  customerName?: string | null
  customerPhone?: string | null
}

export function ReportActions({ contractId, report, customerEmail, customerName, customerPhone }: ReportActionsProps) {
  const [isEmailing, setIsEmailing] = useState(false)
  const [isMessaging, setIsMessaging] = useState(false)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false)
  const [emailTo, setEmailTo] = useState(customerEmail ?? "")
  const [emailCc, setEmailCc] = useState("")
  const [whatsAppNumber, setWhatsAppNumber] = useState(customerPhone ?? "")
  const [customMessage, setCustomMessage] = useState("")

  const parseEmails = (value: string) =>
    value
      .split(/[,\n;]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)

  const handleSend = async (channel: "email" | "whatsapp") => {
    if (!report.fileUrl) {
      showToast({ title: "Report file unavailable", variant: "error" })
      return
    }
    try {
      if (channel === "email") {
        setIsEmailing(true)
      } else {
        setIsMessaging(true)
      }

      const endpoint = `/api/contracts/${contractId}/reports/${report.id}/${channel}`

      const payload = channel === "email"
        ? {
            to: parseEmails(emailTo).length ? parseEmails(emailTo) : undefined,
            cc: parseEmails(emailCc)
          }
        : {
            phone: whatsAppNumber,
            message: customMessage || undefined
          }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || `Failed to send ${channel}`)
      }

      showToast({
        title: channel === "email" ? "Email sent" : "WhatsApp message sent",
        description: `Report ${channel === "email" ? "emailed" : "shared"} successfully.`,
        variant: "success"
      })

      if (channel === "email") {
        setEmailDialogOpen(false)
      } else {
        setWhatsappDialogOpen(false)
      }
    } catch (error) {
      console.error(`Failed to send report via ${channel}`, error)
      showToast({
        title: `Failed to send via ${channel}`,
        description: error instanceof Error ? error.message : undefined,
        variant: "error"
      })
    } finally {
      if (channel === "email") {
        setIsEmailing(false)
      } else {
        setIsMessaging(false)
      }
    }
  }

  const versionLabel = `v${Number(report.version).toFixed(1)}`
  const defaultWhatsAppMessage = () => {
    const greeting = customerName ? `Hi ${customerName},` : "Hi there,"
    const lines = [
      greeting,
      `We've prepared your contract report (Version ${versionLabel}) for your review and records.`,
      report.fileUrl ? `Download: ${report.fileUrl}` : undefined,
      'If you have any questions or would like to discuss any details, please let us know—happy to help.',
      '— Property Stewards'
    ].filter(Boolean)
    return lines.join('\n\n')
  }

  const hasPrimaryEmail = parseEmails(emailTo).length > 0 || (!!customerEmail && !emailTo.trim())
  const hasWhatsAppNumber = whatsAppNumber.trim().length > 0

  return (
    <div className="flex items-center gap-2">
      <Button asChild size="icon" variant="outline" disabled={!report.fileUrl} aria-label="Download report">
        <Link href={report.fileUrl ?? "#"} target="_blank" rel="noopener noreferrer">
          <Download className="h-4 w-4" />
        </Link>
      </Button>
      <Button
        size="icon"
        variant="outline"
        disabled={!report.fileUrl}
        onClick={() => {
          setEmailTo(customerEmail ?? "")
          setEmailCc("")
          setEmailDialogOpen(true)
        }}
        aria-label="Send report via email"
      >
        <Mail className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        disabled={!report.fileUrl}
        onClick={() => {
          setWhatsAppNumber(customerPhone ?? "")
          setCustomMessage(defaultWhatsAppMessage())
          setWhatsappDialogOpen(true)
        }}
        aria-label="Send report via WhatsApp"
      >
        <MessageCircle className="h-4 w-4" />
      </Button>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send report via email</DialogTitle>
            <DialogDescription>Version {versionLabel}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">To</label>
              <Input
                value={emailTo}
                onChange={(event) => setEmailTo(event.target.value)}
                placeholder="customer@example.com, second@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">CC</label>
              <Input
                value={emailCc}
                onChange={(event) => setEmailCc(event.target.value)}
                placeholder="Optional comma-separated emails"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={isEmailing}>Cancel</Button>
            <Button onClick={() => handleSend("email")} disabled={isEmailing || !hasPrimaryEmail}>
              {isEmailing ? <LoaderIcon /> : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send report via WhatsApp</DialogTitle>
            <DialogDescription>Version {versionLabel}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">WhatsApp number</label>
              <Input
                value={whatsAppNumber}
                onChange={(event) => setWhatsAppNumber(event.target.value)}
                placeholder="+65..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Message (optional)</label>
              <Textarea
                value={customMessage}
                onChange={(event) => setCustomMessage(event.target.value)}
                placeholder={`Hi ${customerName ?? "there"},...`}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setWhatsappDialogOpen(false)} disabled={isMessaging}>Cancel</Button>
            <Button onClick={() => handleSend("whatsapp")} disabled={isMessaging || !hasWhatsAppNumber}>
              {isMessaging ? <LoaderIcon /> : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LoaderIcon() {
  return (
    <span className="h-4 w-4 animate-spin border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full" />
  )
}
