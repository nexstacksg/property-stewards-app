"use client"

import Link from "next/link"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ContractType } from "../types"

interface ContractSummaryProps {
  contractType: ContractType
  contractTypeLabel: string
  value: string
  marketingSourceName: string | null
  canSubmit: boolean
  loading: boolean
}

export function ContractSummary({
  contractType,
  contractTypeLabel,
  value,
  marketingSourceName,
  canSubmit,
  loading,
}: ContractSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contract Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Status</p>
          <Badge variant="outline">DRAFT</Badge>
          <p className="text-xs text-muted-foreground mt-1">
            Contract will be created as draft
          </p>
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

        {marketingSourceName && (
          <div>
            <p className="text-sm text-muted-foreground">Source of Marketing</p>
            <Badge variant="outline">{marketingSourceName}</Badge>
          </div>
        )}

        <div className="pt-4 space-y-2">
          <Button type="submit" className="w-full" disabled={!canSubmit || loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Contract
          </Button>
          <Link href="/contracts" className="block">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
