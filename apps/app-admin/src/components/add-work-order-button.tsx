"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { showToast } from "@/lib/toast"

interface AddWorkOrderButtonProps {
  contractId: string
  status: string
  className?: string
  size?: "sm" | "default" | "lg" | "icon"
}

export function AddWorkOrderButton({ contractId, status, className, size = "sm" }: AddWorkOrderButtonProps) {
  const router = useRouter()

  const handleClick = () => {
    const isConfirmed = status === "CONFIRMED"
    if (!isConfirmed) {
      showToast({
        title: "Cannot add work order",
        description: "Please confirm the contract first.",
      })
      return
    }
    router.push(`/work-orders/new?contractId=${contractId}`)
  }

  return (
    <Button size={size} onClick={handleClick} className={className} type="button">
      <Plus className="h-4 w-4 mr-2" />
      Add Work Order
    </Button>
  )
}

