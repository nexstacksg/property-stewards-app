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
import { PreviewPdfButton } from "@/components/preview-pdf-button"
import { GenerateContractReportButton } from "@/components/generate-contract-report-button"
import { ContractFollowUpRemarks } from "@/components/contract-follow-up-remarks"
import { buildContractReportFilename } from "@/lib/filename"
import { ContractGeneratedReports } from "@/components/contract-generated-reports"

async function getContract(id: string) {
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      customer: true,
      address: true,
      contactPersons: true,
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
      },
      followUpRemarks: {
        orderBy: { createdOn: 'desc' },
        include: {
          createdBy: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        }
      },
      reports: {
        include: {
          generatedBy: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        },
        orderBy: { generatedOn: 'desc' }
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

function formatDateTime(date: Date | string | null) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function getContractStatusVariant(status: string): any {
  switch (status) {
    case 'DRAFT': return 'outline'
    case 'CONFIRMED': return 'secondary'
    case 'SCHEDULED': return 'info'
    case 'COMPLETED': return 'success'
    case 'TERMINATED': return 'default'
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

const formatEnumLabel = (value?: string | null) => {
  if (!value) return '—'
  if (value.startsWith('RANGE_')) {
    const range = value.replace('RANGE_', '').replace(/_/g, ' ')
    if (range.toLowerCase().includes('plus')) {
      return `${range.replace(/plus/i, 'Plus')} sqft`
    }
    const parts = range.split(' ')
    if (parts.length === 2) {
      return `${parts[0]} - ${parts[1]} sqft`
    }
    return `${range} sqft`
  }
  return value
    .toLowerCase()
    .split('_')
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
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
  const defaultReportTitle = `${contractTypeLabel} Report`
  const reports = Array.isArray(contract.reports)
    ? contract.reports.map((report: any) => ({
        ...report,
        generatedOn: new Date(report.generatedOn).toISOString(),
      }))
    : []
  const referenceContracts = Array.isArray(contract.referenceIds) ? contract.referenceIds : []
  const contactPersons = Array.isArray(contract.contactPersons) ? contract.contactPersons : []
  const remarkEntries = Array.isArray(contract.followUpRemarks)
    ? contract.followUpRemarks.map((entry: any) => ({
        ...entry,
        createdOn: new Date(entry.createdOn).toISOString(),
      }))
    : []
  const marketingSourceLabel = contract.marketingSource ? formatEnumLabel(contract.marketingSource) : null
  const showPdfActions = !(contract.status === 'DRAFT' && totalWorkOrders === 0)

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap items-start gap-3 sm:items-center sm:gap-4">
          <Link href="/contracts">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
                Contract #{contract.id}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getContractStatusVariant(contract.status)}>{contract.status}</Badge>
                <Badge variant={contract.contractType === 'REPAIR' ? 'outline' : 'secondary'}>
                  {contractTypeLabel}
                </Badge>
              </div>
            </div>
            <p className="text-muted-foreground mt-1">Contract Details</p>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Link href={`/contracts/${contract.id}/edit`} className="flex-1 sm:flex-none">
            <Button variant="outline" className="w-full sm:w-auto">
              <Edit className="h-4 w-4 mr-2" />
              Edit Contract
            </Button>
          </Link>
          {showPdfActions && (
            <div className="flex flex-1 flex-wrap gap-2 sm:flex-none">
              <PreviewPdfButton
                href={`/api/contracts/${contract.id}/report`}
                fileName={contractReportFileName}
                label="Preview PDF"
                className="flex-1 sm:flex-none"
              />
              <GenerateContractReportButton
                contractId={contract.id}
                defaultTitle={defaultReportTitle}
                defaultFileName={contractReportFileName}
                className="flex-1 sm:flex-none"
              />
            </div>
          )}
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
                      {contract.address.propertySizeRange && (
                        <Badge variant="secondary">{formatEnumLabel(contract.address.propertySizeRange)}</Badge>
                      )}
                      {contract.address.relationship && (
                        <Badge variant="outline">{formatEnumLabel(contract.address.relationship)}</Badge>
                      )}
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

              {marketingSourceLabel && (
                <div>
                  <p className="text-sm text-muted-foreground">Source of Marketing</p>
                  <Badge variant="outline">{marketingSourceLabel}</Badge>
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

              {referenceContracts.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">Reference Contracts</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {referenceContracts.map((refId: string) => (
                      <Link key={refId} href={`/contracts/${refId}`} className="font-mono text-xs text-primary hover:underline">
                        #{refId }
                      </Link>
                    ))}
                  </div>
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

          <ContractFollowUpRemarks contractId={contract.id} initialRemarks={remarkEntries} />
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
                          #{workOrder.id }
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

        {/* Contact Persons */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Persons</CardTitle>
            <CardDescription>Key people linked to this contract</CardDescription>
          </CardHeader>
          <CardContent>
            {contactPersons.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No contact persons added</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Relation</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contactPersons.map((person: any) => (
                    <TableRow key={person.id}>
                      <TableCell className="font-medium">{person.name}</TableCell>
                      <TableCell>{person.relation || '—'}</TableCell>
                      <TableCell>{person.phone || '—'}</TableCell>
                      <TableCell>{person.email || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <ContractGeneratedReports
          contractId={contract.id}
          reports={reports}
          customerName={contract.customer?.name}
          customerEmail={contract.customer?.email}
          customerPhone={contract.customer?.phone}
          contactPersons={contactPersons}
        />

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
