"use client"

import { useState } from "react"
import { Loader2, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { showToast } from "@/lib/toast"

interface ConfirmContractButtonProps {
  contractId: string
  className?: string
}

export function ConfirmContractButton({ contractId, className }: ConfirmContractButtonProps) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  const handleConfirm = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const response = await fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" })
      })

      if (!response.ok) {
        throw new Error(`Failed to confirm contract (${response.status})`)
      }

      showToast({ title: "Contract marked complete", description: "Status updated to CONFIRMED.", variant: "success" })
      router.refresh()
    } catch (error) {
      console.error("Failed to confirm contract", error)
      showToast({ title: "Failed to confirm", description: error instanceof Error ? error.message : undefined, variant: "error" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Button type="button" onClick={handleConfirm} className={className} disabled={submitting}>
      {submitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Marking...
        </>
      ) : (
        <>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Mark as Comfirm
        </>
      )}
    </Button>
  )
}
