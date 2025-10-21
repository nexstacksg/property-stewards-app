"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
  inspectors: Array<{
    id: string
    name: string
    mobilePhone: string
  }>
}

export default function WorkOrdersPage() {
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const limit = 10

  useEffect(() => {
    fetchWorkOrders()
  }, [])

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300)
    return () => clearTimeout(handler)
  }, [searchTerm])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, debouncedSearch])

  const filteredWorkOrders = useMemo(() => {
    let data = [...allWorkOrders]
    if (statusFilter) {
      data = data.filter((order) => order.status === statusFilter)
    }
    if (debouncedSearch) {
      const token = debouncedSearch.toLowerCase()
      data = data.filter((order) => {
        const idMatch = order.id?.toLowerCase().includes(token)
        const customerMatch = order.contract?.customer?.name?.toLowerCase().includes(token)
        const addressMatch = order.contract?.address?.address?.toLowerCase().includes(token)
        const inspectorMatch = order.inspectors?.some((inspector) => inspector.name.toLowerCase().includes(token))
        return idMatch || customerMatch || addressMatch || inspectorMatch
      })
    }
    return data
  }, [allWorkOrders, statusFilter, debouncedSearch])

  useEffect(() => {
    const newTotal = Math.max(1, Math.ceil(filteredWorkOrders.length / limit))
    setTotalPages(newTotal)
    setPage((prev) => Math.min(prev, newTotal))
  }, [filteredWorkOrders, limit])

  const currentWorkOrders = useMemo(() => {
    const start = (page - 1) * limit
    return filteredWorkOrders.slice(start, start + limit)
  }, [filteredWorkOrders, page, limit])

  const fetchWorkOrders = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: '1',
        limit: '200',
      })
      
      const response = await fetch(`/api/work-orders?${params}`)
      const data = await response.json()
      const items = Array.isArray(data.workOrders) ? data.workOrders : []
      setAllWorkOrders(items)
      setPage(1)
      setTotalPages(Math.max(1, Math.ceil(items.length / limit)))
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

  const groupedEntries = useMemo(() => {
    const map = new Map<string, WorkOrder[]>()
    currentWorkOrders.forEach((workOrder) => {
      const date = formatDate(workOrder.scheduledStartDateTime)
      const existing = map.get(date)
      if (existing) {
        existing.push(workOrder)
        return
      }
      map.set(date, [workOrder])
    })
    return Array.from(map.entries())
  }, [currentWorkOrders])

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold sm:text-3xl">Work Orders</h1>
          <p className="text-muted-foreground">Manage inspection schedules and assignments</p>
        </div>
        <Link href="/work-orders/new">
          <Button className="self-start">
            <Plus className="h-4 w-4 mr-2" />
            Schedule Work Order
          </Button>
        </Link>
      </div>

      {/* Status Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              {filteredWorkOrders.filter(w => w.status === 'SCHEDULED').length}
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
              {filteredWorkOrders.filter(w => w.status === 'STARTED').length}
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
              {filteredWorkOrders.filter(w => w.status === 'COMPLETED').length}
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
              {filteredWorkOrders.filter(w => w.status === 'CANCELLED').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Cancelled orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Work Orders List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Work Order Schedule</CardTitle>
              <CardDescription>
                {statusFilter ? `Showing ${statusFilter.toLowerCase()} work orders` : 'All work orders'}
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search work orders"
                className="w-full sm:w-60"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:border-gray-300 focus:outline-none focus:ring-0 sm:w-auto"
              >
                <option value="">All Status</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="STARTED">Started</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              {statusFilter && (
                <Button variant="outline" size="sm" onClick={() => setStatusFilter('')} className="w-full sm:w-auto">
                  <Filter className="h-4 w-4 mr-2" />
                  Clear Filter
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading work orders...</div>
          ) : filteredWorkOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <p>No work orders found</p>
              <p className="text-sm mt-2">Create a new work order to get started</p>
            </div>
          ) : (
            <Fragment>
              <div className="space-y-6 p-4 lg:hidden">
                {groupedEntries.map(([date, orders]) => (
                  <div key={date} className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {date}
                    </div>
                    <div className="space-y-3">
                      {orders.map((workOrder) => {
                        const isScheduled = workOrder.status === 'SCHEDULED'
                        const inspectors = Array.isArray(workOrder.inspectors) ? workOrder.inspectors : []
                        return (
                          <Card key={workOrder.id} className="border">
                            <CardContent className="space-y-4 p-4">
                              <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <Link href={`/work-orders/${workOrder.id}`} className="text-base font-semibold hover:text-primary">
                                      Work Order #{workOrder.id }
                                    </Link>
                                    <p className="text-sm text-muted-foreground">
                                      {formatTime(workOrder.scheduledStartDateTime)} – {formatTime(workOrder.scheduledEndDateTime)}
                                    </p>
                                  </div>
                                  <Badge variant={getStatusVariant(workOrder.status)} className="self-start">
                                    <span className="inline-flex items-center gap-1 text-xs font-medium">
                                      {getStatusIcon(workOrder.status)}
                                      {workOrder.status}
                                    </span>
                                  </Badge>
                                </div>
                                <div className="space-y-3 text-sm">
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
                                    <Link
                                      href={`/customers/${workOrder.contract.customer.id}`}
                                      className="font-medium hover:text-primary"
                                    >
                                      {workOrder.contract.customer.name}
                                    </Link>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Property</p>
                                    <div className="flex items-start gap-2 text-sm">
                                      <MapPin className="mt-1 h-4 w-4 text-muted-foreground" />
                                      <div>
                                        <p className="font-medium leading-snug">{workOrder.contract.address.address}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {workOrder.contract.address.postalCode} • {workOrder.contract.address.propertyType}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                                    <span>Inspectors</span>
                                    <div className="flex flex-wrap items-center gap-2 normal-case">
                                      {inspectors.length > 0 ? (
                                        inspectors.slice(0, 2).map((inspector) => (
                                          <Badge key={inspector.id} variant="outline" className="text-xs">
                                            {inspector.name}
                                          </Badge>
                                        ))
                                      ) : (
                                        <span className="text-xs text-muted-foreground">Unassigned</span>
                                      )}
                                      {inspectors.length > 2 && (
                                        <span className="text-xs text-muted-foreground">+{inspectors.length - 2} more</span>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Service</p>
                                    <Badge variant="secondary" className="mt-1">{workOrder.contract.servicePackage || 'Basic'}</Badge>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 justify-end">
                                <Link href={`/work-orders/${workOrder.id}`} className="flex-1 sm:flex-none">
                                  <Button variant="outline" size="sm" className="w-full sm:w-auto">
                                    View Details
                                  </Button>
                                </Link>
                                {isScheduled && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 sm:flex-none"
                                    onClick={() => handleStartJob(workOrder.id)}
                                  >
                                    Start
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <thead className="bg-muted/30 border-b">
                      <tr>
                      <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-56">
                        Contract Id
                      </th>
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
                        Inspectors
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
                    {groupedEntries.map(([date, orders]) => (
                      <Fragment key={date}>
                        
                        <tr className="bg-muted/50">
                          <td colSpan={7} className="px-6 py-2 text-sm font-medium">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {date}
                            </div>
                          </td>
                        </tr>
                        {orders.map((workOrder) => (
                          <tr key={workOrder.id} className="border-b hover:bg-muted/10">
                            {/* Time */}
                             <td className="px-6 py-3 align-top">
                              <p  className="text-sm font-medium hover:text-primary truncate block">
                                {workOrder.contract.id}
                              </p>
                            </td>
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

                            {/* Inspectors */}
                            <td className="px-6 py-3 align-top">
                              <div className="text-sm leading-5">
                                {workOrder.inspectors && workOrder.inspectors.length > 0 ? (
                                  <div className="space-y-1">
                                    {workOrder.inspectors.slice(0, 2).map((inspector) => (
                                      <div key={inspector.id} className="flex items-center gap-1 truncate">
                                        <User className="h-3 w-3 text-muted-foreground" />
                                        <span className="truncate" title={inspector.name}>{inspector.name}</span>
                                      </div>
                                    ))}
                                    {workOrder.inspectors.length > 2 && (
                                      <div className="text-xs text-muted-foreground">+{workOrder.inspectors.length - 2} more</div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Unassigned</span>
                                )}
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
                              <div className="flex items-center justify-end gap-2">
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
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            </Fragment>
          )}
        </CardContent>
        {!loading && filteredWorkOrders.length > 0 && totalPages > 1 && (
          <CardFooter className="flex justify-center items-center gap-4 border-t py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
