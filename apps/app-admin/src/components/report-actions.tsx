"use client"

import { useState } from "react"
import { Download, Mail, MessageCircle } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { showToast } from "@/lib/toast"

interface ReportActionsProps {
  contractId: string
  report: {
    id: string
    fileUrl: string | null
    version: number | string
  }
}

export function ReportActions({ contractId, report }: ReportActionsProps) {
  const [isEmailing, setIsEmailing] = useState(false)
  const [isMessaging, setIsMessaging] = useState(false)

  const handleSend = async (channel: "email" | "whatsapp") => {
    try {
      if (channel === "email") {
        setIsEmailing(true)
      } else {
        setIsMessaging(true)
      }

      const response = await fetch(`/api/contracts/${contractId}/reports/${report.id}/${channel}`, {
        method: "POST"
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
        disabled={isEmailing}
        onClick={() => handleSend("email")}
        aria-label="Send report via email"
      >
        {isEmailing ? <LoaderIcon /> : <Mail className="h-4 w-4" />}
      </Button>
      <Button
        size="icon"
        variant="outline"
        disabled={isMessaging}
        onClick={() => handleSend("whatsapp")}
        aria-label="Send report via WhatsApp"
      >
        {isMessaging ? <LoaderIcon /> : <MessageCircle className="h-4 w-4" />}
      </Button>
    </div>
  )
}

function LoaderIcon() {
  return (
    <span className="h-4 w-4 animate-spin border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full" />
  )
}
