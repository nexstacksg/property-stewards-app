"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import type { Contract } from "./types"

interface WorkOrderSummaryProps {
  selectedContract: Contract | null
  canSubmit: boolean
  loading: boolean
}

export function WorkOrderSummary({ selectedContract, canSubmit, loading }: WorkOrderSummaryProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Work Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant="info">SCHEDULED</Badge>
            <p className="text-xs text-muted-foreground mt-1">
              Work order will be created as scheduled
            </p>
          </div>

          {selectedContract && (
            <>
              <div>
                <p className="text-sm text-muted-foreground">Property Type</p>
                <Badge variant="outline">{selectedContract.address.propertyType}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Property Size</p>
                <Badge variant="secondary">
                  {selectedContract.address.propertySize.replace(/_/g, " ")}
                </Badge>
              </div>
            </>
          )}

          <div className="pt-4 space-y-2">
            <Button type="submit" className="w-full" disabled={!canSubmit || loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Work Order
            </Button>
            <Link href="/work-orders" className="block">
              <Button type="button" variant="outline" className="w-full">
                Cancel
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Next Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="text-sm space-y-2 text-muted-foreground">
            <li>1. Work order created as SCHEDULED</li>
            <li>2. Inspector receives notification</li>
            <li>3. Inspector starts inspection</li>
            <li>4. Complete checklist items</li>
            <li>5. Customer signs off</li>
          </ol>
        </CardContent>
      </Card>
    </>
  )
}
