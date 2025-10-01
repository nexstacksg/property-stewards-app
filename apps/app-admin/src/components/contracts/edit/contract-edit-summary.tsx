"use client"

import Link from "next/link"
import { Loader2, Save } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ContractStatus, ContractType, MarketingSource } from "@/components/contracts/types"

interface ContractEditSummaryProps {
  contractId: string | null
  status: ContractStatus
  contractType: ContractType
  contractTypeLabel: string
  value: string
  marketingSource: MarketingSource
  saving: boolean
}

const STATUS_BADGE_VARIANT: Record<ContractStatus, "outline" | "secondary" | "default" | "success" | "destructive"> = {
  DRAFT: "outline",
  CONFIRMED: "secondary",
  SCHEDULED: "default",
  COMPLETED: "success",
  TERMINATED: "default",
  CANCELLED: "destructive",
}

export function ContractEditSummary({
  contractId,
  status,
  contractType,
  contractTypeLabel,
  value,
  marketingSource,
  saving,
}: ContractEditSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contract Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Contract ID</p>
          <p className="font-mono text-sm">
            #{contractId ? contractId.slice(-8).toUpperCase() : ""}
          </p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Current Status</p>
          <Badge variant={STATUS_BADGE_VARIANT[status]}>{status}</Badge>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Type</p>
          <Badge variant={contractType === "REPAIR" ? "outline" : "secondary"}>
            {contractTypeLabel}
          </Badge>
        </div>

        {value && (
          <div>
            <p className="text-sm text-muted-foreground">Total Value</p>
            <p className="text-2xl font-bold">SGD {parseFloat(value).toFixed(2)}</p>
          </div>
        )}

        {marketingSource !== "NONE" && (
          <div>
            <p className="text-sm text-muted-foreground">Source of Marketing</p>
            <Badge variant="outline">
              {marketingSource === "GOOGLE"
                ? "Google"
                : marketingSource === "REFERRAL"
                ? "Referral"
                : "Others"}
            </Badge>
          </div>
        )}

        <div className="pt-4 space-y-2">
          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
          <Link href={contractId ? `/contracts/${contractId}` : "/contracts"} className="block">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
