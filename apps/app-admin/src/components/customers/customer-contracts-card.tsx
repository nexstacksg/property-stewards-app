"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"
import { CustomerContractSummary } from "@/types/customer"
import { formatCurrency, formatSingaporeDate, getContractStatusVariant } from "@/lib/formatters"

interface CustomerContractsCardProps {
  contracts: CustomerContractSummary[]
}

export function CustomerContractsCard({ contracts }: CustomerContractsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Contracts</CardTitle>
            <CardDescription>{contracts.length} contract(s)</CardDescription>
          </div>
          <Link href="/contracts/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Contract
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {contracts.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No contracts yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract ID</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-medium">#{contract.id }</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{contract.address.address}</p>
                      <p className="text-xs text-muted-foreground">{contract.address.postalCode}</p>
                    </div>
                  </TableCell>
                  <TableCell>{formatCurrency(contract.value)}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{formatSingaporeDate(contract.scheduledStartDate)}</p>
                      <p className="text-xs text-muted-foreground">{contract.workOrders.length} work order(s)</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getContractStatusVariant(contract.status)}>
                      {contract.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/contracts/${contract.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
