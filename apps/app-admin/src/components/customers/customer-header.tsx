"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Crown, Edit } from "lucide-react"
import { CustomerRecord } from "@/types/customer"

interface CustomerHeaderProps {
  customer: CustomerRecord
}

export function CustomerHeader({ customer }: CustomerHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-4">
        <Link href="/customers">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{customer.name}</h1>
            {customer.isMember && customer.memberTier && (
              <Badge variant="warning">
                <Crown className="h-3 w-3 mr-1" />
                {customer.memberTier}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">Customer Details</p>
        </div>
      </div>
      <div className="flex gap-2 w-full sm:w-auto justify-end">
        <Link href={`/customers/${customer.id}/edit`} className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Edit className="h-4 w-4 mr-2" />
            Edit Customer
          </Button>
        </Link>
      </div>
    </div>
  )
}
