import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AddChecklistButton } from "@/components/add-checklist-button"
import { 
  ArrowLeft, 
  Edit, 
  User,
  MapPin,
  Calendar,
  DollarSign,
  FileText,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react"
import prisma from "@/lib/prisma"
import { GeneratePdfButton } from "@/components/generate-pdf-button"
import { buildContractReportFilename } from "@/lib/filename"

async function getContract(id: string) {
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      customer: true,
      address: true,
      contractChecklist: {
        include: {
          items: true
        }
      },
      workOrders: {
        include: {
          inspectors: true
        },
        orderBy: { scheduledStartDateTime: 'asc' }
      }
    }
  })

  if (!contract) {
    notFound()
  }

  return contract
}

function formatDate(date: Date | string | null) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('en-SG', {
    dateStyle: 'medium'
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD'
  }).format(amount)
}

function getContractStatusVariant(status: string): any {
  switch (status) {
    case 'DRAFT': return 'outline'
    case 'CONFIRMED': return 'secondary'
    case 'SCHEDULED': return 'info'
    case 'COMPLETED': return 'success'
    case 'CLOSED': return 'default'
    case 'CANCELLED': return 'destructive'
    default: return 'default'
  }
}


function getWorkOrderStatusVariant(status: string): any {
  switch (status) {
    case 'SCHEDULED': return 'info'
    case 'STARTED': return 'warning'
    case 'COMPLETED': return 'success'
    case 'CANCELLED': return 'destructive'
    default: return 'default'
  }
}

function getWorkOrderStatusIcon(status: string) {
  switch (status) {
    case 'SCHEDULED': return <Clock className="h-4 w-4" />
    case 'STARTED': return <AlertCircle className="h-4 w-4" />
    case 'COMPLETED': return <CheckCircle className="h-4 w-4" />
    case 'CANCELLED': return <XCircle className="h-4 w-4" />
    default: return null
  }
}

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const contract = await getContract(resolvedParams.id) as any

  // Calculate completion rate
  const completedWorkOrders = contract.workOrders.filter((wo: any) => wo.status === 'COMPLETED').length
  const totalWorkOrders = contract.workOrders.length
  const completionRate = totalWorkOrders > 0 ? (completedWorkOrders / totalWorkOrders) * 100 : 0
  const contractTypeLabel = contract.contractType === 'REPAIR' ? 'Repair' : 'Inspection'
  const contractReportFileName = buildContractReportFilename(
    contract.customer?.name,
    contract.address?.postalCode,
    contract.id
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/contracts">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">Contract #{contract.id.slice(-8).toUpperCase()}</h1>
              <Badge variant={getContractStatusVariant(contract.status)}>
                {contract.status}
              </Badge>
              <Badge variant={contract.contractType === 'REPAIR' ? 'outline' : 'secondary'}>
                {contractTypeLabel}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">Contract Details</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/contracts/${contract.id}/edit`}>
            <Button>
              <Edit className="h-4 w-4 mr-2" />
              Edit Contract
            </Button>
          </Link>
          <Link href={`/work-orders/new?contractId=${contract.id}`}>
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Work Order
            </Button>
          </Link>
          <GeneratePdfButton
            href={`/api/contracts/${contract.id}/report`}
            fileName={contractReportFileName}
            label="Generate PDF"
          />
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
                <p className="text-sm text-muted-foreground">Customer</p>
                <Link 
                  href={`/customers/${contract.customerId}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <User className="h-4 w-4" />
                  {contract.customer.name}
                </Link>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Property Address</p>
                <div className="flex items-start gap-2 mt-1">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{contract.address.address}</p>
                    <p className="text-sm text-muted-foreground">
                      {contract.address.postalCode}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline">{contract.address.propertyType}</Badge>
                      <Badge variant="secondary">{contract.address.propertySize.replace(/_/g, ' ')}</Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Contract Value</p>
                <p className="text-2xl font-bold">{formatCurrency(Number(contract.value))}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Contract Type</p>
                <Badge variant={contract.contractType === 'REPAIR' ? 'outline' : 'secondary'}>
                  {contractTypeLabel}
                </Badge>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">First Payment Due</p>
                <p className="font-medium">{formatDate(contract.firstPaymentOn)}</p>
              </div>

              {contract.finalPaymentOn && (
                <div>
                  <p className="text-sm text-muted-foreground">Final Payment Due</p>
                  <p className="font-medium">{formatDate(contract.finalPaymentOn)}</p>
                </div>
              )}

              {contract.servicePackage && (
                <div>
                  <p className="text-sm text-muted-foreground">Service Package</p>
                  <Badge>{contract.servicePackage}</Badge>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground">Scheduled Start</p>
                <p className="font-medium">{formatDate(contract.scheduledStartDate)}</p>
              </div>

              {contract.actualEndDate && (
                <div>
                  <p className="text-sm text-muted-foreground">Completed On</p>
                  <p className="font-medium">{formatDate(contract.actualEndDate)}</p>
                </div>
              )}

              {contract.remarks && (
                <div>
                  <p className="text-sm text-muted-foreground">Remarks</p>
                  <p className="text-sm">{contract.remarks}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Progress */}
          <Card>
            <CardHeader>
              <CardTitle>Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Completion</span>
                  <span className="font-medium">{completionRate.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {completedWorkOrders} of {totalWorkOrders} work orders completed
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Work Orders and Checklists */}
        <div className="lg:col-span-2 space-y-6">
          {/* Work Orders */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Work Orders</CardTitle>
                  <CardDescription>{contract.workOrders.length} work order(s)</CardDescription>
                </div>
                <Link href={`/work-orders/new?contractId=${contract.id}`}>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Work Order
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {contract.workOrders.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No work orders created yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Order ID</TableHead>
                      <TableHead>Inspectors</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contract.workOrders.map((workOrder: any) => (
                      <TableRow key={workOrder.id}>
                        <TableCell className="font-medium">
                          #{workOrder.id.slice(-8).toUpperCase()}
                        </TableCell>
                        <TableCell>
                          {workOrder.inspectors && workOrder.inspectors.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {workOrder.inspectors.slice(0, 2).map((ins: any) => (
                                <Link key={ins.id} href={`/inspectors/${ins.id}`} className="text-primary hover:underline">
                                  {ins.name}
                                </Link>
                              ))}
                              {workOrder.inspectors.length > 2 && (
                                <span className="text-xs text-muted-foreground">+{workOrder.inspectors.length - 2} more</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{formatDate(workOrder.scheduledStartDateTime)}</p>
                            <p className="text-xs text-muted-foreground">
                              {workOrder.actualStart ? 'Started' : 'Pending'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getWorkOrderStatusIcon(workOrder.status)}
                            <Badge variant={getWorkOrderStatusVariant(workOrder.status)}>
                              {workOrder.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link href={`/work-orders/${workOrder.id}`}>
                            <Button variant="outline" size="sm">View</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Checklist */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Inspection Checklist</CardTitle>
                  <CardDescription>
                    {contract.contractChecklist ? 'Checklist assigned' : 'No checklist assigned'}
                  </CardDescription>
                </div>
                {!contract.contractChecklist && (
                  <AddChecklistButton 
                    contractId={contract.id}
                    propertyType={contract.address.propertyType}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!contract.contractChecklist ? (
                <p className="text-muted-foreground text-center py-4">No checklist assigned yet</p>
              ) : (
                <div className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">Contract Checklist</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {contract.contractChecklist.items.length} inspection items
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="secondary">
                          {contract.contractChecklist.items.filter((item: any) => item.isCompleted).length} completed
                        </Badge>
                        <Badge variant="outline">
                          {contract.contractChecklist.items.filter((item: any) => !item.isCompleted).length} pending
                        </Badge>
                      </div>
                    </div>
                    <Link href={`/contracts/${contract.id}/checklist`}>
                      <Button variant="outline" size="sm">
                        <FileText className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Contract Value</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(Number(contract.value))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Work Orders</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {contract.workOrders.length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Completed</CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {completedWorkOrders}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
