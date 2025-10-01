"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Crown } from "lucide-react"
import { CustomerRecord } from "@/types/customer"
import { formatSingaporeDate } from "@/lib/formatters"

interface CustomerMembershipCardProps {
  customer: CustomerRecord
}

export function CustomerMembershipCard({ customer }: CustomerMembershipCardProps) {
  if (!customer.isMember) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membership Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Tier</p>
          <Badge variant="warning">
            <Crown className="h-3 w-3 mr-1" />
            {customer.memberTier}
          </Badge>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Member Since</p>
          <p className="font-medium">{formatSingaporeDate(customer.memberSince)}</p>
        </div>
        {customer.memberExpiredOn && (
          <div>
            <p className="text-sm text-muted-foreground">Expires On</p>
            <p className="font-medium">{formatSingaporeDate(customer.memberExpiredOn)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
