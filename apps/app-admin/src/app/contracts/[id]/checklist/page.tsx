import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ArrowLeft,
  DollarSign,
  Hash,
  User,
  MapPin,
  CheckCircle,
  Clock
} from "lucide-react"
import prisma from "@/lib/prisma"

async function getContract(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      customer: true,
      address: true,
      contractChecklist: {
        include: {
          items: {
            include: {
              enteredBy: true,
              checklistTasks: true
            },
            orderBy: { order: "asc" }
          }
        }
      }
    }
  })

  if (!contract || !contract.contractChecklist) {
    notFound()
  }

  return contract
}

function formatDate(date: Date | string | null) {
  if (!date) return "N/A"
  return new Date(date).toLocaleDateString("en-SG", {
    dateStyle: "medium"
  })
}

function formatCurrency(amount: number | string | null | undefined) {
  if (amount === null || typeof amount === "undefined") return "—"
  const numeric = typeof amount === "string" ? Number(amount) : amount
  if (Number.isNaN(numeric)) return "—"
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD"
  }).format(numeric)
}

const formatEnumLabel = (value?: string | null) => {
  if (!value) return ""
  if (value.startsWith("RANGE_")) {
    const range = value.replace("RANGE_", "").replace(/_/g, " ")
    if (range.toLowerCase().includes("plus")) {
      return `${range.replace(/plus/i, "Plus")} sqft`
    }
    const parts = range.split(" ")
    if (parts.length === 2) {
      return `${parts[0]} - ${parts[1]} sqft`
    }
    return `${range} sqft`
  }
  return value
    .toLowerCase()
    .split("_")
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ")
}

function getStatusVariant(status: string): any {
  switch (status) {
    case "DRAFT":
      return "outline"
    case "CONFIRMED":
      return "secondary"
    case "SCHEDULED":
      return "info"
    case "COMPLETED":
      return "success"
    case "TERMINATED":
      return "default"
    case "CANCELLED":
      return "destructive"
    default:
      return "default"
  }
}

function getChecklistItemStatusVariant(status: string | null | undefined): any {
  switch (status) {
    case "COMPLETED":
      return "success"
    case "IN_PROGRESS":
      return "warning"
    default:
      return "secondary"
  }
}

export default async function ContractChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const contract = await getContract(resolvedParams.id) as any
  const checklist = contract.contractChecklist
  const items = Array.isArray(checklist?.items) ? checklist.items : []

  const completedItems = items.filter((item: any) => item.status === "COMPLETED").length
  const totalTasks = items.reduce((sum: number, item: any) => {
    const tasks = Array.isArray(item.checklistTasks) ? item.checklistTasks.length : 0
    return sum + tasks
  }, 0)
  const pendingItems = items.length - completedItems

  const contractLabel = `#${contract.id.slice(-8).toUpperCase()}`
  const contractTypeLabel = contract.contractType === "REPAIR" ? "Repair" : "Inspection"

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href={`/contracts/${contract.id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">Contract Checklist</h1>
              <Badge variant={getStatusVariant(contract.status)}>{contract.status}</Badge>
              <Badge variant={contract.contractType === "REPAIR" ? "outline" : "secondary"}>
                {contractTypeLabel}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">Checklist assigned to {contractLabel}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Contract Information */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contract Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Contract</p>
                <Link href={`/contracts/${contract.id}`} className="font-mono text-sm text-primary hover:underline">
                  {contractLabel}
                </Link>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Customer</p>
                <Link
                  href={`/customers/${contract.customerId}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <User className="h-4 w-4" />
                  {contract.customer?.name}
                </Link>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Property</p>
                <div className="flex items-start gap-2 mt-1">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{contract.address?.address}</p>
                    <p className="text-sm text-muted-foreground">{contract.address?.postalCode}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {contract.address?.propertyType && (
                        <Badge variant="outline">{contract.address.propertyType}</Badge>
                      )}
                      {contract.address?.propertySize && (
                        <Badge variant="secondary">{contract.address.propertySize.replace(/_/g, " ")}</Badge>
                      )}
                      {contract.address?.propertySizeRange && (
                        <Badge variant="secondary">{formatEnumLabel(contract.address.propertySizeRange)}</Badge>
                      )}
                      {contract.address?.relationship && (
                        <Badge variant="outline">{formatEnumLabel(contract.address.relationship)}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {contract.servicePackage && (
                <div>
                  <p className="text-sm text-muted-foreground">Service Package</p>
                  <Badge>{contract.servicePackage}</Badge>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground">Contract Value</p>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{formatCurrency(contract.value)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Scheduled Start</p>
                  <p className="font-medium">{formatDate(contract.scheduledStartDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">First Payment</p>
                  <p className="font-medium">{formatDate(contract.firstPaymentOn)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Final Payment</p>
                  <p className="font-medium">{formatDate(contract.finalPaymentOn)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Completed On</p>
                  <p className="font-medium">{formatDate(contract.actualEndDate)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Checklist Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Checklist Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Items</span>
                </div>
                <span className="text-lg font-semibold">{items.length}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-muted-foreground">Completed</span>
                </div>
                <span className="text-lg font-semibold text-green-600">{completedItems}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Pending</span>
                </div>
                <span className="text-lg font-semibold text-orange-600">{pendingItems}</span>
              </div>

            
            </CardContent>
          </Card>
        </div>

        {/* Checklist Items */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Checklist Items</CardTitle>
                  <CardDescription>{items.length} inspection item(s)</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No checklist items assigned to this contract</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Remarks</TableHead>
                      <TableHead>Inspector</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item: any) => {
                      const inspectorName = item.enteredBy?.name || "—"
                      const tasks = Array.isArray(item.checklistTasks) ? item.checklistTasks : []
                      const taskNames = tasks
                        .map((task: any) => task?.name)
                        .filter((name: string | null | undefined) => Boolean(name))
                        .map((name: string) => name.trim())
                      const hasTasks = taskNames.length > 0

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.order}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.name || item.item}</p>
                              {hasTasks && (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {taskNames.join(" • ")}
                                </p>
                              )}
                              {item.description && (
                                <p className="mt-1 text-sm text-muted-foreground/80 italic">{item.description}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getChecklistItemStatusVariant(item.status)}>{item.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {item.remarks ? (
                              <p className="text-sm text-muted-foreground max-w-[200px] truncate" title={item.remarks}>
                                {item.remarks}
                              </p>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>{inspectorName}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
