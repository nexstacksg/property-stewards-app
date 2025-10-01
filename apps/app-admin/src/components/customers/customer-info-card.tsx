"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Mail, Phone, User } from "lucide-react"
import { CustomerRecord } from "@/types/customer"

interface CustomerInfoCardProps {
  customer: CustomerRecord
}

export function CustomerInfoCard({ customer }: CustomerInfoCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Type</p>
          <div className="flex items-center gap-2 mt-1">
            {customer.type === "COMPANY" ? (
              <Building2 className="h-4 w-4" />
            ) : (
              <User className="h-4 w-4" />
            )}
            <span className="font-medium">{customer.type}</span>
          </div>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Person in Charge</p>
          <p className="font-medium">{customer.personInCharge}</p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Email</p>
          <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-primary hover:underline">
            <Mail className="h-4 w-4" />
            {customer.email}
          </a>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Phone</p>
          <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-primary hover:underline">
            <Phone className="h-4 w-4" />
            {customer.phone}
          </a>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Billing Address</p>
          <p className="font-medium">{customer.billingAddress}</p>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">Status</p>
          <Badge variant={customer.status === "ACTIVE" ? "success" : "secondary"}>
            {customer.status}
          </Badge>
        </div>

        {customer.remarks && (
          <div>
            <p className="text-sm text-muted-foreground">Remarks</p>
            <p className="text-sm">{customer.remarks}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
