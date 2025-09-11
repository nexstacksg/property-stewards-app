import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  ArrowLeft, 
  Edit, 
  User,
  MapPin,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  UserCheck,
  PenTool,
  List
} from "lucide-react"
import prisma from "@/lib/prisma"
import WorkOrderItemMedia from "@/components/work-order-item-media"
import EditChecklistItemDialog from "@/components/edit-checklist-item-dialog"

async function getWorkOrder(id: string) {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      contract: {
        include: {
          customer: true,
          address: true,
          contractChecklist: {
            include: {
              items: {
                orderBy: { order: 'asc' }
              }
            }
          }
        }
      },
      inspector: true,
      checklistItems: {
        include: {
          contractChecklist: true,
          enteredBy: true
        }
      }
    }
  })

  if (!workOrder) {
    notFound()
  }

  return workOrder
}

function formatDate(date: Date | string | null) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('en-SG', {
    dateStyle: 'medium'
  })
}

function formatDateTime(date: Date | string | null) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
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

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const workOrder = await getWorkOrder(resolvedParams.id) as any

  // Calculate checklist progress - use contract checklist if available
  const checklistItems = workOrder.contract?.contractChecklist?.items || []
  const completedItems = checklistItems.filter((item: any) => item.enteredOn !== null).length
  const totalItems = checklistItems.length
  const progressRate = totalItems > 0 ? (completedItems / totalItems) * 100 : 0
  
  // Calculate sub-items from tasks array
  let totalSubItems = 0
  checklistItems.forEach((item: any) => {
    // Use tasks array if available, otherwise fall back to parsing remarks
    if (item.tasks && Array.isArray(item.tasks)) {
      // Count pending tasks only
      const pendingTasks = item.tasks.filter((task: any) => task.status === 'pending')
      totalSubItems += pendingTasks.length
    } else {
      // Fallback to old behavior for legacy data
      const description = item.description || item.remarks || ''
      const subItems = description.split(/[,;]|\sand\s|\n/).filter((s: string) => s.trim().length > 0)
      const subItemCount = subItems.length > 0 ? subItems.length : 1
      totalSubItems += subItemCount
    }
  })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/work-orders">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">Work Order #{workOrder.id.slice(-8).toUpperCase()}</h1>
              <div className="flex items-center gap-1">
                {getWorkOrderStatusIcon(workOrder.status)}
                <Badge variant={getWorkOrderStatusVariant(workOrder.status)}>
                  {workOrder.status}
                </Badge>
              </div>
            </div>
            <p className="text-muted-foreground mt-1">Work Order Details</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/work-orders/${workOrder.id}/edit`}>
            <Button>
              <Edit className="h-4 w-4 mr-2" />
              Edit Work Order
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Work Order Information */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Work Order Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Contract</p>
                <Link 
                  href={`/contracts/${workOrder.contractId}`}
                  className="text-primary hover:underline"
                >
                  #{workOrder.contract.id.slice(-8).toUpperCase()}
                </Link>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Customer</p>
                <Link 
                  href={`/customers/${workOrder.contract.customerId}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <User className="h-4 w-4" />
                  {workOrder.contract.customer.name}
                </Link>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Property Address</p>
                <div className="flex items-start gap-2 mt-1">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{workOrder.contract.address.address}</p>
                    <p className="text-sm text-muted-foreground">
                      {workOrder.contract.address.postalCode}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline">{workOrder.contract.address.propertyType}</Badge>
                      <Badge variant="secondary">
                        {workOrder.contract.address.propertySize.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Inspector</p>
                {workOrder.inspector ? (
                  <Link 
                    href={`/inspectors/${workOrder.inspectorId}`}
                    className="flex items-center gap-2 text-primary hover:underline"
                  >
                    <UserCheck className="h-4 w-4" />
                    {workOrder.inspector.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </div>

              {workOrder.remarks && (
                <div>
                  <p className="text-sm text-muted-foreground">Remarks</p>
                  <p className="text-sm">{workOrder.remarks}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Schedule Information */}
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Scheduled Start</p>
                <p className="font-medium">{formatDateTime(workOrder.scheduledStartDateTime)}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Scheduled End</p>
                <p className="font-medium">{formatDateTime(workOrder.scheduledEndDateTime)}</p>
              </div>

              {workOrder.actualStart && (
                <div>
                  <p className="text-sm text-muted-foreground">Actual Start</p>
                  <p className="font-medium">{formatDateTime(workOrder.actualStart)}</p>
                </div>
              )}

              {workOrder.actualEnd && (
                <div>
                  <p className="text-sm text-muted-foreground">Actual End</p>
                  <p className="font-medium">{formatDateTime(workOrder.actualEnd)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sign-off Information */}
          {workOrder.signOffBy && (
            <Card>
              <CardHeader>
                <CardTitle>Sign-off</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Signed Off By</p>
                  <div className="flex items-center gap-2">
                    <PenTool className="h-4 w-4" />
                    <p className="font-medium">{workOrder.signOffBy}</p>
                  </div>
                </div>
                
                {workOrder.signature && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Signature</p>
                    <div className="border rounded-lg p-2 bg-accent/50">
                      <img 
                        src={workOrder.signature} 
                        alt="Signature" 
                        className="max-h-24 mx-auto"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Checklist Items */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Checklist Items</CardTitle>
                  <CardDescription>{workOrder.checklistItems.length} inspection item(s)</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                  <span>Progress</span>
                  <span className="font-medium">{progressRate.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${progressRate}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {completedItems} of {totalItems} items completed
                </p>
              </div>

              {/* Statistics - Moved to top */}
              <div className="grid gap-4 md:grid-cols-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalItems}</div>
                    <p className="text-xs text-muted-foreground">All checklist items</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">Sub-items</CardTitle>
                      <List className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">{totalSubItems}</div>
                    <p className="text-xs text-muted-foreground">
                      Individual checks
                    </p>
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
                    <div className="text-2xl font-bold text-green-600">{completedItems}</div>
                    <p className="text-xs text-muted-foreground">{progressRate.toFixed(0)}% done</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">Pending</CardTitle>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">
                      {totalItems - completedItems}
                    </div>
                    <p className="text-xs text-muted-foreground">To be checked</p>
                  </CardContent>
                </Card>
              </div>

              {checklistItems.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No checklist items assigned</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Media</TableHead>
                      <TableHead>Edit</TableHead>

                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checklistItems.map((item: any, index: number) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.name || item.item}</p>
                            {(() => {
                              // Don't show  count if item is completed
                              if (item.enteredOn) {
                                return null
                              }
                              
                              // Use tasks array if available
                              if (item.tasks && Array.isArray(item.tasks)) {
                                const pendingTasks = item.tasks.filter((task: any) => task.status === 'pending')
                                const taskCount = pendingTasks.length
                                return taskCount > 0 && (
                                  <Badge variant="secondary" className="text-xs mt-1 mr-2">
                                    {taskCount} checks
                                  </Badge>
                                )
                              }
                              
                              // Fallback to old behavior for legacy data
                              const description = item.description || item.remarks || ''
                              const subItems = description.split(/[,;]|\sand\s|\n/).filter((s: string) => s.trim().length > 0)
                              const subItemCount = subItems.length > 0 ? subItems.length : 1
                              // return subItemCount > 1 && (
                              //   <Badge variant="secondary" className="text-xs mt-1 mr-2">
                              //     {subItemCount} checks
                              //   </Badge>
                              // )
                            })()}
                            {item.category && (
                              <Badge variant="outline" className="text-xs mt-1">
                                {item.category}
                              </Badge>
                            )}
                            {item.remarks || item.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {item.remarks || item.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(item.status ? item.status === 'COMPLETED' : Boolean(item.enteredOn)) ? (
                            <Badge variant="success">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Completed
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.condition ? (
                            <Badge variant="outline" className="text-xs">
                              {item.condition.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m: string) => m.toUpperCase())}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <WorkOrderItemMedia 
                            itemId={item.id}
                            workOrderId={workOrder.id}
                            photos={item.photos}
                            videos={item.videos}
                            itemName={item.name || item.item}
                          />
                        </TableCell>
                        <TableCell>
                          <EditChecklistItemDialog
                            itemId={item.id}
                            initialName={item.name || item.item}
                            initialRemarks={item.remarks || item.description}
                            initialStatus={item.status || (item.enteredOn ? 'COMPLETED' : 'PENDING')}
                            initialCondition={item.condition}
                          />
                        </TableCell>
                        
                      </TableRow>
                    ))}
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
