import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  ArrowLeft, 
  Edit, 
  Phone, 
  User, 
  Calendar,
  Clock,
  Award,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react"
import prisma from "@/lib/prisma"
import { summarizeRatings } from "@/lib/rating-utils"

async function getInspector(id: string) {
  const inspector = await prisma.inspector.findUnique({
    where: { id },
    include: {
      workOrders: {
        include: {
          contract: {
            include: {
              customer: true,
              address: true
            }
          }
        },
        orderBy: { scheduledStartDateTime: 'desc' },
        take: 10
      }
    }
  })

  if (!inspector) {
    notFound()
  }

  // Compute rating summary from Contract.inspectorRatings JSON
  const contracts = await prisma.contract.findMany({
    where: { workOrders: { some: { inspectors: { some: { id } } } } },
    select: { inspectorRatings: true },
  })
  const ratingsArray = [] as { rating: any }[]
  for (const c of contracts) {
    const map = (c as any).inspectorRatings as Record<string, number> | null | undefined
    const value = map && typeof map === 'object' ? map[id] : null
    if (value) ratingsArray.push({ rating: value })
  }
  const ratingSummary = summarizeRatings(ratingsArray)

  const { /*ratings,*/ ...rest } = inspector as any

  return {
    ...rest,
    specialization: Array.isArray(inspector.specialization)
      ? inspector.specialization.join(', ')
      : inspector.specialization,
    ratingAverage: ratingSummary.average,
    ratingCount: ratingSummary.count,
  }
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

export default async function InspectorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const inspector = await getInspector(resolvedParams.id)

  // Calculate statistics
  const stats = {
    total: inspector.workOrders.length,
    completed: inspector.workOrders.filter(wo => wo.status === 'COMPLETED').length,
    scheduled: inspector.workOrders.filter(wo => wo.status === 'SCHEDULED').length,
    inProgress: inspector.workOrders.filter(wo => wo.status === 'STARTED').length
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <Link href="/inspectors">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{inspector.name}</h1>
              <Badge variant={inspector.status === 'ACTIVE' ? 'success' : 'secondary'}>
                {inspector.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">Inspector Details</p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto justify-end">
          <Link href={`/inspectors/${inspector.id}/edit`} className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">
              <Edit className="h-4 w-4 mr-2" />
              Edit Inspector
            </Button>
          </Link>
        </div>
      </div>
      {/* Top row: Information and Work Statistics */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inspector Information */}
        <Card>
          <CardHeader>
            <CardTitle>Inspector Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Mobile Phone</p>
                  <a href={`tel:${inspector.mobilePhone}`} className="flex items-center gap-2 text-primary hover:underline">
                    <Phone className="h-4 w-4" />
                    {inspector.mobilePhone}
                  </a>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <Badge variant="outline">{inspector.type}</Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Specialization</p>
                  <p className="text-sm mt-1 truncate" title={inspector.specialization || undefined}>
                    {inspector.specialization ? inspector.specialization : '—'}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Average Rating</p>
                  {inspector.ratingCount > 0 && inspector.ratingAverage !== null ? (
                    <p className="text-2xl font-bold">
                      {inspector.ratingAverage?.toFixed(1)}
                      <span className="text-xs text-muted-foreground ml-2">({inspector.ratingCount})</span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">No ratings yet</p>
                  )}
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Remarks</p>
                  <p className="text-sm">{inspector.remarks || '—'}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Joined Date</p>
                  <p className="font-medium">{formatDate(inspector.createdOn)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Work Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Work Statistics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Jobs</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Scheduled</p>
                <p className="text-2xl font-bold text-blue-600">{stats.scheduled}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-orange-600">{stats.inProgress}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Second row: Recent Work Orders */}
      <div>
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Recent Work Orders</CardTitle>
                <CardDescription>Latest 10 work orders</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {inspector.workOrders.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No work orders assigned yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspector.workOrders.map((workOrder) => (
                      <TableRow key={workOrder.id}>
                        <TableCell className="font-medium">
                          #{workOrder.id }
                        </TableCell>
                        <TableCell>
                          <Link 
                            href={`/customers/${workOrder.contract.customerId}`}
                            className="text-primary hover:underline"
                          >
                            {workOrder.contract.customer.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm max-w-[320px] truncate" title={workOrder.contract.address.address}>
                              {workOrder.contract.address.address}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {workOrder.contract.address.postalCode}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{formatDate(workOrder.scheduledStartDateTime)}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(workOrder.scheduledStartDateTime).split(',')[1]}
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
