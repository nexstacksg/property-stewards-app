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
import { extractEntryMedia, mergeMediaLists, stringsToAttachments, stringsToAttachmentsWithTask, type MediaAttachment } from "@/lib/media-utils"
import ItemEntriesDialog from "@/components/item-entries-dialog"
import EditChecklistItemDialog from "@/components/edit-checklist-item-dialog"

type ChecklistDisplayItem = {
  item: any
  index: number
  locationSummaries: string[]
  fallbackNames: string[]
  uploadTarget: 'item' | 'task'
  combinedPhotos: MediaAttachment[]
  combinedVideos: MediaAttachment[]
  remarkLabel: string
}

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
                    orderBy: { createdOn: 'asc' },
                    include: {
                      inspector: true,
                      user: {
                        select: {
                          id: true,
                          username: true,
                          email: true
                        }
                      },
                      media: {
                        orderBy: { order: 'asc' }
                      },
                      findings: true,
                      location: true,
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
                    orderBy: [
                      { order: 'asc' },
                      { createdOn: 'asc' }
                    ],
                    include: {
                      entries: {
                        select: { id: true }
                      },
                      location: true
                    }
                  },
                  locations: {
                    orderBy: { order: 'asc' },
                    include: {
                      tasks: {
                        orderBy: [
                          { order: 'asc' },
                          { createdOn: 'asc' }
                        ]
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

import { formatDateLocal, formatDateTimeLocal } from "@/lib/time"

function formatDate(date: Date | string | null) {
  return formatDateLocal(date)
}

function formatDateTime(date: Date | string | null) {
  return formatDateTimeLocal(date)
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
    const locations = Array.isArray(item.locations) ? item.locations : []
    const locationTaskCount = locations.reduce((count: number, location: any) => {
      const subtasks = Array.isArray(location?.tasks) ? location.tasks : []
      return count + subtasks.length
    }, 0)

    if (locationTaskCount > 0) {
      totalSubItems += locationTaskCount
      return
    }

    const fallbackTasks = Array.isArray(item.checklistTasks) ? item.checklistTasks.length : 0
    if (fallbackTasks > 0) {
      totalSubItems += fallbackTasks
      return
    }

    const description = item.description || item.remarks || ''
    const subItems = description.split(/[,;]|\sand\s|\n/).filter((s: string) => s.trim().length > 0)
    const subItemCount = subItems.length > 0 ? subItems.length : 1
    totalSubItems += subItemCount
  })

  const checklistDisplayItems: ChecklistDisplayItem[] = (checklistItems as any[]).map((item: any, index: number) => {
    const locations = Array.isArray(item.locations) ? item.locations : []
    const locationTasks = locations.flatMap((location: any) =>
      Array.isArray(location?.tasks) ? location.tasks : [],
    )

    const fallbackTasks = Array.isArray(item.checklistTasks) ? item.checklistTasks : []

    const locationSummaries: string[] = locations
      .map((location: any) => {
        const name = typeof location?.name === 'string' ? location.name.trim() : ''
        const subtasks = Array.isArray(location?.tasks)
          ? location.tasks
              .map((task: any) => (typeof task?.name === 'string' ? task.name.trim() : ''))
              .filter((entry: string) => entry.length > 0)
          : []
        if (name && subtasks.length > 0) {
          return `${name}`
        }
        if (name) return name
        if (subtasks.length > 0) return subtasks.join(', ')
        return ''
      })
      .filter((entry: string) => entry.length > 0)

    const fallbackNames: string[] = fallbackTasks
      .map((task: any) => (typeof task?.name === 'string' ? task.name.trim() : ''))
      .filter((entry: string) => entry.length > 0)

    const uploadTarget = item?.contractChecklistId ? 'item' : 'task'

    const taskPhotosSource = locationTasks.length > 0 ? locationTasks : fallbackTasks
    const taskPhotoAttachments = mergeMediaLists(
      taskPhotosSource.map((task: any) => stringsToAttachmentsWithTask(task?.photos, task?.id))
    )
    const contributionPhotoAttachments = mergeMediaLists(
      (item.contributions || []).map((entry: any) =>
        mergeMediaLists([
          extractEntryMedia(entry, 'PHOTO'),
          stringsToAttachmentsWithTask(entry?.task?.photos, entry?.task?.id)
        ])
      )
    )
    const combinedPhotos = mergeMediaLists([
      stringsToAttachments(item.photos),
      taskPhotoAttachments,
      contributionPhotoAttachments
    ])

    const taskVideosSource = locationTasks.length > 0 ? locationTasks : fallbackTasks
    const taskVideoAttachments = mergeMediaLists(
      taskVideosSource.map((task: any) => stringsToAttachmentsWithTask(task?.videos, task?.id))
    )
    const contributionVideoAttachments = mergeMediaLists(
      (item.contributions || []).map((entry: any) =>
        mergeMediaLists([
          extractEntryMedia(entry, 'VIDEO'),
          stringsToAttachmentsWithTask(entry?.task?.videos, entry?.task?.id)
        ])
      )
    )
    const combinedVideos = mergeMediaLists([
      stringsToAttachments(item.videos),
      taskVideoAttachments,
      contributionVideoAttachments
    ])

    const remarkCount = Array.isArray(item.contributions) ? item.contributions.length : 0
    const remarkLabel = `Remarks (${remarkCount})`

    return {
      item,
      index,
      locationSummaries,
      fallbackNames,
      uploadTarget,
      combinedPhotos,
      combinedVideos,
      remarkLabel,
    } as ChecklistDisplayItem
  })

  return (
    <div className="px-4 py-6 space-y-6 sm:px-6 lg:px-10 lg:py-8">
      {/* Header */}
      <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-start gap-3 sm:items-center sm:gap-4">
          <Link href="/work-orders">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
                Work Order #{workOrder.id}
              </h1>
              <div className="flex items-center gap-1 text-sm sm:text-base">
                {getWorkOrderStatusIcon(workOrder.status)}
                <Badge variant={getWorkOrderStatusVariant(workOrder.status)}>
                  {workOrder.status}
                </Badge>
              </div>
            </div>
            <p className="text-muted-foreground mt-1">Work Order Details</p>
          </div>
        </div>
        <div className="flex w-full justify-end gap-2 self-stretch lg:w-auto lg:self-auto lg:justify-start">
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
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            {/* Left: Work Order Information */}
            <div className="space-y-4">
              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Link href={`/contracts/${workOrder.contractId}`} className="font-mono text-sm text-primary hover:underline">#{workOrder.contract.id }</Link>
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
            <div className="space-y-4 border-t pt-4 md:border-0 md:pt-0 md:pl-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled Start</p>
                  <p className="mt-1 font-medium">{formatDateTime(workOrder.scheduledStartDateTime)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Scheduled End</p>
                  <p className="mt-1 font-medium">{formatDateTime(workOrder.scheduledEndDateTime)}</p>
                </div>
              </div>
              {(workOrder.actualStart || workOrder.actualEnd) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {workOrder.actualStart && (
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Actual Start</p>
                      <p className="mt-1 font-medium">{formatDateTime(workOrder.actualStart)}</p>
                    </div>
                  )}
                  {workOrder.actualEnd && (
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Actual End</p>
                      <p className="mt-1 font-medium">{formatDateTime(workOrder.actualEnd)}</p>
                    </div>
                  )}
                </div>
              )}
              {/* Inspectors (compact chips) */}
              <div className="space-y-2">
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
              <div className="grid gap-4 mb-6 sm:grid-cols-2 xl:grid-cols-4">
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
                <>
                  <div className="space-y-4 lg:hidden">
                    {checklistDisplayItems.map(({ item, index, locationSummaries, fallbackNames, uploadTarget, combinedPhotos, combinedVideos, remarkLabel }) => {
                      const isCompleted = item.status === 'COMPLETED'
                      return (
                        <Card key={item.id} className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-xs uppercase text-muted-foreground">Item {index + 1}</p>
                              <h3 className="text-base font-semibold leading-snug break-words">
                                {item.name || item.item}
                              </h3>
                              {item.category && (
                                <Badge variant="outline" className="text-xs">
                                  {item.category}
                                </Badge>
                              )}
                            </div>
                            <Badge variant={isCompleted ? 'success' : 'secondary'} className="shrink-0">
                              {isCompleted ? (
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  Completed
                                </span>
                              ) : (
                                'Pending'
                              )}
                            </Badge>
                          </div>
                          {locationSummaries.length > 0 && (
                            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                              {locationSummaries.map((summary) => (
                                <p key={summary} className="leading-snug">
                                  • {summary}
                                </p>
                              ))}
                            </div>
                          )}
                          {locationSummaries.length === 0 && fallbackNames.length > 0 && (
                            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                              {fallbackNames.map((name) => (
                                <p key={name} className="leading-snug">
                                  • {name}
                                </p>
                              ))}
                            </div>
                          )}
                          <div className="mt-4 space-y-4">
                            <div className="flex flex-col gap-2">
                              <p className="text-xs uppercase text-muted-foreground">Media</p>
                              <WorkOrderItemMedia
                                itemId={item.id}
                                workOrderId={workOrder.id}
                                photos={combinedPhotos}
                                videos={combinedVideos}
                                itemName={item.name || item.item}
                                enableUpload
                                uploadTarget={uploadTarget}
                                itemNumber={index + 1}
                                locationOptions={(item.locations || []).map((l: any) => ({ id: l.id, name: l.name, tasks: (l.tasks || []).map((t: any) => ({ id: t.id, name: t.name, condition: t.condition })) }))}
                                defaultLocationId={(item.locations && item.locations[0]?.id) || undefined}
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <ItemEntriesDialog
                                itemId={item.id}
                                workOrderId={workOrder.id}
                                entries={item.contributions || []}
                                tasks={item.checklistTasks || []}
                                locations={item.locations || []}
                                itemName={item.name || item.item}
                                itemNumber={index + 1}
                                triggerLabel={remarkLabel}
                              />
                              <Link href={`/checklist-items/${item.id}`} className="flex-1 sm:flex-none">
                                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </Button>
                              </Link>
                              <EditChecklistItemDialog
                                itemId={item.id}
                                initialName={item.name || item.item}
                                initialRemarks={item.remarks || item.description}
                                initialStatus={item.status || (item.enteredOn ? 'COMPLETED' : 'PENDING')}
                                triggerVariant="outline"
                              />
                            </div>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                  <div className="hidden lg:block">
                    <div className="overflow-x-auto">
                      <Table className="min-w-[960px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">#</TableHead>
                            <TableHead>Locations</TableHead>
                            <TableHead className="w-40">Status</TableHead>
                            <TableHead className="w-48">Media</TableHead>
                            <TableHead className="w-40">Remarks</TableHead>
                            <TableHead className="w-32">Details</TableHead>
                            <TableHead className="w-24">Edit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {checklistDisplayItems.map(({ item, index, locationSummaries, fallbackNames, uploadTarget, combinedPhotos, combinedVideos, remarkLabel }) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                              <TableCell className="align-top">
                                <div className="space-y-1">
                                  <p className="font-medium leading-snug">{item.name || item.item}</p>
                                  {item.category && (
                                    <Badge variant="outline" className="text-xs">
                                      {item.category}
                                    </Badge>
                                  )}
                                  {locationSummaries.length > 0 && (
                                    <p className="text-sm text-muted-foreground">
                                      {locationSummaries.map((summary) => `• ${summary}`).join('  ')}
                                    </p>
                                  )}
                                  {locationSummaries.length === 0 && fallbackNames.length > 0 && (
                                    <p className="text-sm text-muted-foreground">
                                      {fallbackNames.map((name) => `• ${name}`).join('  ')}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                {item.status === 'COMPLETED' ? (
                                  <Badge variant="success">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Completed
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Pending</Badge>
                                )}
                              </TableCell>
                              <TableCell className="align-top">
                                <WorkOrderItemMedia
                                  itemId={item.id}
                                  workOrderId={workOrder.id}
                                  photos={combinedPhotos}
                                  videos={combinedVideos}
                                  itemName={item.name || item.item}
                                  enableUpload
                                  uploadTarget={uploadTarget}
                                  itemNumber={index + 1}
                                  locationOptions={(item.locations || []).map((l: any) => ({ id: l.id, name: l.name, tasks: (l.tasks || []).map((t: any) => ({ id: t.id, name: t.name, condition: t.condition })) }))}
                                  defaultLocationId={(item.locations && item.locations[0]?.id) || undefined}
                                />
                              </TableCell>
                              <TableCell className="align-top">
                                <ItemEntriesDialog
                                  itemId={item.id}
                                  workOrderId={workOrder.id}
                                  entries={item.contributions || []}
                                  tasks={item.checklistTasks || []}
                                  locations={item.locations || []}
                                  itemName={item.name || item.item}
                                  itemNumber={index + 1}
                                  triggerLabel={remarkLabel}
                                />
                              </TableCell>
                              <TableCell className="align-top">
                                <Link href={`/checklist-items/${item.id}`}>
                                  <Button variant="ghost" size="icon" aria-label="View checklist item details">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="inline-flex">
                                  <EditChecklistItemDialog
                                    itemId={item.id}
                                    initialName={item.name || item.item}
                                    initialRemarks={item.remarks || item.description}
                                    initialStatus={item.status || (item.enteredOn ? 'COMPLETED' : 'PENDING')}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
      </div>
    </div>
  )
}
