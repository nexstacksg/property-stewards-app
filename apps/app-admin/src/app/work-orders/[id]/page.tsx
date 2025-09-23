import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  ArrowLeft,
  Edit,
  Eye,
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
import ItemEntriesDialog from "@/components/item-entries-dialog"
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
                include: {
                  contributions: {
                    include: {
                      inspector: true,
                      user: {
                        select: {
                          id: true,
                          username: true,
                          email: true
                        }
                      },
                      task: {
                        select: {
                          id: true,
                          photos: true,
                          videos: true,
                          condition: true,
                          name: true,
                          status: true
                        }
                      }
                    }
                  },
                  checklistTasks: {
                    include: {
                      entries: {
                        select: { id: true }
                      }
                    }
                  }
                },
                orderBy: { order: 'asc' }
              }
            }
          }
        }
      },
      inspectors: true,
      checklistItems: {
        include: {
          contractChecklist: true,
          enteredBy: true
        }
      }
    } as any
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
  const completedItems = checklistItems.filter((item: any) => item.status === 'COMPLETED').length
  const totalItems = checklistItems.length
  const progressRate = totalItems > 0 ? (completedItems / totalItems) * 100 : 0
  
  // Calculate sub-items from checklist tasks if available, otherwise fallback to remarks parsing
  let totalSubItems = 0
  checklistItems.forEach((item: any) => {
    const tasks = Array.isArray(item.checklistTasks) ? item.checklistTasks : []
    if (tasks.length > 0) {
      totalSubItems += tasks.length
      return
    }

    const description = item.description || item.remarks || ''
    const subItems = description.split(/[,;]|\sand\s|\n/).filter((s: string) => s.trim().length > 0)
    const subItemCount = subItems.length > 0 ? subItems.length : 1
    totalSubItems += subItemCount
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

      {/* Top overview: Work Order Information + Schedule in one full-width card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Work Order Overview</CardTitle>
          <CardDescription>Key information and schedule</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-8 md:grid-cols-2">
            {/* Left: Work Order Information */}
            <div className="space-y-4">
              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/contracts/${workOrder.contractId}`} className="font-mono text-sm text-primary hover:underline">#{workOrder.contract.id.slice(-8).toUpperCase()}</Link>
                <Badge variant={getWorkOrderStatusVariant(workOrder.status)}>{workOrder.status}</Badge>
                {workOrder.contract.servicePackage && (
                  <Badge variant="outline">{workOrder.contract.servicePackage}</Badge>
                )}
              </div>

              {/* Customer */}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
                <Link href={`/customers/${workOrder.contract.customerId}`} className="mt-1 inline-flex items-center gap-2 text-primary hover:underline">
                  <User className="h-4 w-4" />
                  <span className="font-medium">{workOrder.contract.customer.name}</span>
                </Link>
              </div>

              {/* Address */}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Property Address</p>
                <div className="mt-1 flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{workOrder.contract.address.address}</p>
                    <p className="text-sm text-muted-foreground">{workOrder.contract.address.postalCode}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge variant="outline">{workOrder.contract.address.propertyType}</Badge>
                      <Badge variant="secondary">{workOrder.contract.address.propertySize.replace(/_/g, ' ')}</Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* (Moved inspectors to right column for a cleaner split) */}

              {/* Optional remarks */}
              {workOrder.remarks && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Remarks</p>
                  <p className="text-sm mt-1">{workOrder.remarks}</p>
                </div>
              )}
            </div>

            {/* Right: Schedule, Inspectors & Sign-off */}
            <div className="md:border-l md:pl-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled Start</p>
                  <p className="mt-1 font-medium">{formatDateTime(workOrder.scheduledStartDateTime)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled End</p>
                  <p className="mt-1 font-medium">{formatDateTime(workOrder.scheduledEndDateTime)}</p>
                </div>
              </div>
              {(workOrder.actualStart || workOrder.actualEnd) && (
                <div className="grid grid-cols-2 gap-4">
                  {workOrder.actualStart && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Actual Start</p>
                      <p className="mt-1 font-medium">{formatDateTime(workOrder.actualStart)}</p>
                    </div>
                  )}
                  {workOrder.actualEnd && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Actual End</p>
                      <p className="mt-1 font-medium">{formatDateTime(workOrder.actualEnd)}</p>
                    </div>
                  )}
                </div>
              )}
              {/* Inspectors (compact chips) */}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Inspectors</p>
                {workOrder.inspectors?.length ? (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {workOrder.inspectors.map((ins: any) => (
                      <Link key={ins.id} href={`/inspectors/${ins.id}`}>
                        <Badge variant="outline" className="inline-flex items-center gap-1">
                          <UserCheck className="h-3 w-3" />
                          {ins.name}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">Unassigned</p>
                )}
              </div>
              {workOrder.signOffBy && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Signed Off By</p>
                  <div className="mt-1 inline-flex items-center gap-2">
                    <PenTool className="h-4 w-4" />
                    <span className="font-medium">{workOrder.signOffBy}</span>
                  </div>
                  {workOrder.signature && (
                    <div className="mt-2 inline-block rounded border bg-accent/50 p-2">
                      <img src={workOrder.signature} alt="Signature" className="max-h-24" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Checklist Items - full width */}
      <div>
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
                      <TableHead>Media</TableHead>
                      <TableHead>Remarks</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Edit</TableHead>

                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checklistItems.map((item: any, index: number) => {
                      const primaryTasks = Array.isArray(item.checklistTasks)
                        ? item.checklistTasks
                        : []
                      const taskNames = primaryTasks
                        .map((task: any) => task?.name)
                        .filter((name: string | null | undefined) => Boolean(name))
                      const hasTasks = taskNames.length > 0
                      const taskLine = hasTasks ? taskNames.map((name: string) => `• ${name}`).join('  ') : ''
                      const description = typeof item.description === 'string' ? item.description.trim() : ''
                      const checklistRemarks = typeof item.remarks === 'string' ? item.remarks.trim() : ''

                      const uploadTarget = item?.contractChecklistId ? 'item' : 'task'

                      const itemPhotos = Array.isArray(item.photos) ? item.photos : []
                      const taskPhotos = Array.isArray(item.checklistTasks)
                        ? item.checklistTasks.flatMap((task: any) => task.photos || [])
                        : []
                      const contributionPhotos = (item.contributions || []).flatMap((entry: any) => {
                        const entryPhotos = Array.isArray(entry.photos) ? entry.photos : []
                        const taskPhotosFromEntry = entry.task && Array.isArray(entry.task.photos) ? entry.task.photos : []
                        return [...entryPhotos, ...taskPhotosFromEntry]
                      })
                      const combinedPhotos = Array.from(new Set([...itemPhotos, ...taskPhotos, ...contributionPhotos]))

                      const itemVideos = Array.isArray(item.videos) ? item.videos : []
                      const taskVideos = Array.isArray(item.checklistTasks)
                        ? item.checklistTasks.flatMap((task: any) => task.videos || [])
                        : []
                      const contributionVideos = (item.contributions || []).flatMap((entry: any) => {
                        const entryVideos = Array.isArray(entry.videos) ? entry.videos : []
                        const taskVideosFromEntry = entry.task && Array.isArray(entry.task.videos) ? entry.task.videos : []
                        return [...entryVideos, ...taskVideosFromEntry]
                      })
                      const combinedVideos = Array.from(new Set([...itemVideos, ...taskVideos, ...contributionVideos]))

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.name || item.item}</p>
                              {item.category && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  {item.category}
                                </Badge>
                              )}
                              {hasTasks ? (
                                <>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {taskLine}
                                  </p>
                                  {checklistRemarks && (
                                    <p className="text-sm text-muted-foreground/80 italic mt-1">
                                      {checklistRemarks}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <>
                                  {description && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {description}
                                    </p>
                                  )}
                                  {checklistRemarks && (
                                    <p className="text-sm text-muted-foreground/80 italic mt-1">
                                      {checklistRemarks}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {item.status === 'COMPLETED' ? (
                              <Badge variant="success">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 relative z-10">
                              <WorkOrderItemMedia
                                itemId={item.id}
                                workOrderId={workOrder.id}
                                photos={combinedPhotos}
                                videos={combinedVideos}
                                itemName={item.name || item.item}
                                enableUpload
                                uploadTarget={uploadTarget}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 relative z-10">
                              <ItemEntriesDialog
                                itemId={item.id}
                                workOrderId={workOrder.id}
                                entries={item.contributions || []}
                                tasks={item.checklistTasks || []}
                                itemName={item.name || item.item}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Link href={`/checklist-items/${item.id}`}>
                              <Button variant="ghost" size="icon" aria-label="View checklist item details">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div className="relative z-10 inline-flex">
                              <EditChecklistItemDialog
                                itemId={item.id}
                                initialName={item.name || item.item}
                                initialRemarks={item.remarks || item.description}
                                initialStatus={item.status || (item.enteredOn ? 'COMPLETED' : 'PENDING')}
                              />
                            </div>
                          </TableCell>
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
  )
}
