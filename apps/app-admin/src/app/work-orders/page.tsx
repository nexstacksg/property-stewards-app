"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Plus, 
  Calendar, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Filter,
  MapPin,
  User
} from "lucide-react"

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
        return <Clock className="h-3.5 w-3.5" />
      case 'STARTED':
        return <AlertCircle className="h-3.5 w-3.5" />
      case 'COMPLETED':
        return <CheckCircle className="h-3.5 w-3.5" />
      case 'CANCELLED':
        return <XCircle className="h-3.5 w-3.5" />
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-SG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(date)
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-SG', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date).toLowerCase()
  }

  const handleStartJob = async (workOrderId: string) => {
    try {
      await fetch(`/api/work-orders/${workOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'STARTED',
          actualStart: new Date().toISOString()
        })
      })
      fetchWorkOrders()
    } catch (error) {
      console.error('Error starting work order:', error)
    }
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
          className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'SCHEDULED' ? 'border-blue-500 shadow-md' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'SCHEDULED' ? '' : 'SCHEDULED')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {workOrders.filter(w => w.status === 'SCHEDULED').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Upcoming inspections</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'STARTED' ? 'border-orange-500 shadow-md' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'STARTED' ? '' : 'STARTED')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {workOrders.filter(w => w.status === 'STARTED').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Currently active</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'COMPLETED' ? 'border-green-500 shadow-md' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'COMPLETED' ? '' : 'COMPLETED')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {workOrders.filter(w => w.status === 'COMPLETED').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Finished today</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'CANCELLED' ? 'border-red-500 shadow-md' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'CANCELLED' ? '' : 'CANCELLED')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cancelled</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {workOrders.filter(w => w.status === 'CANCELLED').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Cancelled orders</p>
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
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading work orders...</div>
          ) : workOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <p>No work orders found</p>
              <p className="text-sm mt-2">Create a new work order to get started</p>
            </div>
          ) : (
            <>
              {/* Single table for all dates */}
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-56">
                        Time
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-32">
                        Status
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-40">
                        Customer
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Property
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-56">
                        Inspector
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Service
                      </th>
                      <th className="text-center px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-40">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedWorkOrders).map(([date, orders]) => (
                      <>
                        {/* Date Header Row */}
                        <tr key={`date-${date}`} className="bg-muted/50">
                          <td colSpan={7} className="px-6 py-2 font-medium text-sm">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {date}
                            </div>
                          </td>
                        </tr>
                        
                        {/* Work Order Rows for this date */}
                        {(orders as WorkOrder[]).map((workOrder) => (
                          <tr key={workOrder.id} className="border-b hover:bg-muted/10">
                            {/* Time */}
                            <td className="px-6 py-3 align-top">
                              <div className="text-sm leading-5">
                                <div className="font-medium">
                                  {formatTime(workOrder.scheduledStartDateTime)} – {formatTime(workOrder.scheduledEndDateTime)}
                                </div>
                               
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-6 py-3 align-top">
                              <Badge variant={getStatusVariant(workOrder.status)} className="font-medium">
                                <span className="flex items-center gap-1">
                                  {getStatusIcon(workOrder.status)}
                                  {workOrder.status}
                                </span>
                              </Badge>
                            </td>

                            {/* Customer */}
                            <td className="px-6 py-3 align-top">
                              <Link href={`/customers/${workOrder.contract.customer.id}`} className="text-sm font-medium hover:text-primary truncate block" title={workOrder.contract.customer.name}>
                                {workOrder.contract.customer.name}
                              </Link>
                            </td>

                            {/* Property */}
                            <td className="px-6 py-3 align-top">
                              <div className="text-sm leading-5">
                                <div className="font-medium flex items-start gap-1 truncate">
                                  <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                                  <span className="truncate" title={workOrder.contract.address.address}>{workOrder.contract.address.address}</span>
                                </div>
                                <div className="text-xs text-muted-foreground ml-4">
                                  {workOrder.contract.address.postalCode} • {workOrder.contract.address.propertyType}
                                </div>
                              </div>
                            </td>

                            {/* Inspector */}
                            <td className="px-6 py-3 align-top">
                              <div className="text-sm leading-5">
                                <div className="font-medium flex items-center gap-1 truncate">
                                  <User className="h-3 w-3 text-muted-foreground" />
                                  <span className="truncate" title={workOrder.inspector.name}>{workOrder.inspector.name}</span>
                                </div>
                                <div className="text-xs text-muted-foreground truncate" title={workOrder.inspector.mobilePhone}>
                                  {workOrder.inspector.mobilePhone}
                                </div>
                              </div>
                            </td>

                            {/* Service */}
                            <td className="px-6 py-3 align-top">
                              <Badge variant="outline" className="font-normal">
                                {workOrder.contract.servicePackage || 'Basic'}
                              </Badge>
                            </td>

                            {/* Actions */}
                            <td className="px-6 py-3 align-top">
                              <div className="w-full flex items-center justify-center">
                                <div className="inline-flex gap-2 w-36 justify-end">
                                  <Link href={`/work-orders/${workOrder.id}`}>
                                    <Button variant="outline" size="sm" className="w-16">View</Button>
                                  </Link>
                                  {workOrder.status === 'SCHEDULED' ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-16"
                                      onClick={() => handleStartJob(workOrder.id)}
                                    >
                                      Start
                                    </Button>
                                  ) : (
                                    <div className="w-16" aria-hidden="true" />
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 py-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
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
