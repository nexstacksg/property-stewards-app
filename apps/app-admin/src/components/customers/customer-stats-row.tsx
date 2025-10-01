"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, DollarSign, FileText } from "lucide-react"
import { CustomerRecord } from "@/types/customer"
import { formatCurrency, formatSingaporeDate } from "@/lib/formatters"

interface CustomerStatsRowProps {
  customer: CustomerRecord
}

export function CustomerStatsRow({ customer }: CustomerStatsRowProps) {
  const totalValue = customer.contracts.reduce((sum, contract) => sum + Number(contract.value), 0)

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Total Contracts</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{customer.contracts.length}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Member Since</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-xl font-bold">{formatSingaporeDate(customer.memberSince)}</div>
        </CardContent>
      </Card>
    </div>
  )
}
