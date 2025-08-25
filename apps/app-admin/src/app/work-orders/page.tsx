"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Calendar, Clock, CheckCircle, XCircle, AlertCircle, ChevronLeft, ChevronRight, Filter } from "lucide-react"

interface WorkOrder {
  id: string
  scheduledStartDateTime: string
  scheduledEndDateTime: string
  actualStart?: string
  actualEnd?: string
  status: string
  remarks?: string
  contract: {
    id: string
    servicePackage?: string
    customer: {
      id: string
      name: string
    }
    address: {
      address: string
      postalCode: string
      propertyType: string
    }
  }
  inspector: {
    id: string
    name: string
    mobilePhone: string
  }
}

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const limit = 10

  useEffect(() => {
    fetchWorkOrders()
  }, [page, statusFilter])

  const fetchWorkOrders = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })
      
      if (statusFilter) {
        params.append('status', statusFilter)
      }

      const response = await fetch(`/api/work-orders?${params}`)
      const data = await response.json()
      
      setWorkOrders(data.workOrders)
      setTotalPages(data.pagination.totalPages)
    } catch (error) {
      console.error('Error fetching work orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return <Clock className="h-4 w-4" />
      case 'STARTED':
        return <AlertCircle className="h-4 w-4" />
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4" />
      case 'CANCELLED':
        return <XCircle className="h-4 w-4" />
      default:
        return null
    }
  }

  const getStatusVariant = (status: string): any => {
    switch (status) {
      case 'SCHEDULED':
        return 'info'
      case 'STARTED':
        return 'warning'
      case 'COMPLETED':
        return 'success'
      case 'CANCELLED':
        return 'destructive'
      default:
        return 'default'
    }
  }

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-SG', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-SG', {
      dateStyle: 'medium'
    }).format(date)
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-SG', {
      timeStyle: 'short'
    }).format(date)
  }

  // Group work orders by date
  const groupedWorkOrders = workOrders.reduce((groups: any, workOrder) => {
    const date = formatDate(workOrder.scheduledStartDateTime)
    if (!groups[date]) {
      groups[date] = []
    }
    groups[date].push(workOrder)
    return groups
  }, {})

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Work Orders</h1>
          <p className="text-muted-foreground mt-2">Manage inspection schedules and assignments</p>
        </div>
        <Link href="/work-orders/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Schedule Work Order
          </Button>
        </Link>
      </div>

      {/* Status Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card 
          className={`cursor-pointer transition-colors ${statusFilter === 'SCHEDULED' ? 'border-blue-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'SCHEDULED' ? '' : 'SCHEDULED')}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {workOrders.filter(w => w.status === 'SCHEDULED').length}
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-colors ${statusFilter === 'STARTED' ? 'border-orange-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'STARTED' ? '' : 'STARTED')}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {workOrders.filter(w => w.status === 'STARTED').length}
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-colors ${statusFilter === 'COMPLETED' ? 'border-green-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'COMPLETED' ? '' : 'COMPLETED')}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {workOrders.filter(w => w.status === 'COMPLETED').length}
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-colors ${statusFilter === 'CANCELLED' ? 'border-red-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'CANCELLED' ? '' : 'CANCELLED')}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {workOrders.filter(w => w.status === 'CANCELLED').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Work Orders List */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Work Order Schedule</CardTitle>
              <CardDescription>
                {statusFilter ? `Showing ${statusFilter.toLowerCase()} work orders` : 'All work orders'}
              </CardDescription>
            </div>
            {statusFilter && (
              <Button variant="outline" size="sm" onClick={() => setStatusFilter('')}>
                <Filter className="h-4 w-4 mr-2" />
                Clear Filter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <>
              <div className="space-y-6">
                {Object.entries(groupedWorkOrders).map(([date, orders]) => (
                  <div key={date}>
                    <h3 className="font-semibold text-sm text-muted-foreground mb-3 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {date}
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Property</TableHead>
                          <TableHead>Inspector</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(orders as WorkOrder[]).map((workOrder) => (
                          <TableRow key={workOrder.id}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-medium">
                                  {formatTime(workOrder.scheduledStartDateTime)} - {formatTime(workOrder.scheduledEndDateTime)}
                                </div>
                                {workOrder.actualStart && (
                                  <div className="text-xs text-muted-foreground">
                                    Actual: {formatTime(workOrder.actualStart)}
                                    {workOrder.actualEnd && ` - ${formatTime(workOrder.actualEnd)}`}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getStatusVariant(workOrder.status)}>
                                <span className="flex items-center gap-1">
                                  {getStatusIcon(workOrder.status)}
                                  {workOrder.status}
                                </span>
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Link 
                                href={`/customers/${workOrder.contract.customer.id}`}
                                className="hover:underline"
                              >
                                {workOrder.contract.customer.name}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{workOrder.contract.address.address}</div>
                                <div className="text-xs text-muted-foreground">
                                  {workOrder.contract.address.postalCode} • {workOrder.contract.address.propertyType}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{workOrder.inspector.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {workOrder.inspector.mobilePhone}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {workOrder.contract.servicePackage || 'Standard'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Link href={`/work-orders/${workOrder.id}`}>
                                  <Button variant="outline" size="sm">View</Button>
                                </Link>
                                {workOrder.status === 'SCHEDULED' && (
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => {
                                      // Update status to STARTED
                                      fetch(`/api/work-orders/${workOrder.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ 
                                          status: 'STARTED',
                                          actualStart: new Date().toISOString()
                                        })
                                      }).then(() => fetchWorkOrders())
                                    }}
                                  >
                                    Start
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>

              {workOrders.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No work orders found
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}