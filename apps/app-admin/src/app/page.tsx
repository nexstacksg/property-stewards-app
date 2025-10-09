import Link from "next/link"

import { ContractRemarkStatus } from "@prisma/client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Users, UserCheck, FileText, Calendar, DollarSign, Clock, CheckCircle } from "lucide-react"
import prisma from "@/lib/prisma"

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getDashboardStats() {
  
  try {
    // Execute queries sequentially to avoid connection overload on Vercel
    const customerCount = await prisma.customer.count({ where: { status: 'ACTIVE' } })
    const inspectorCount = await prisma.inspector.count({ where: { status: 'ACTIVE' } })
    const contractCount = await prisma.contract.count()
    const workOrderCount = await prisma.workOrder.count()
    
    const activeContracts = await prisma.contract.count({ where: { status: { in: ['CONFIRMED', 'SCHEDULED'] } } })
    const completedWorkOrders = await prisma.workOrder.count({ where: { status: 'COMPLETED' } })
    const scheduledWorkOrders = await prisma.workOrder.count({ where: { status: 'SCHEDULED' } })
    
    const totalRevenue = await prisma.contract.aggregate({
      _sum: { value: true },
      where: { status: { not: 'CANCELLED' } }
    })
    
    const recentWorkOrders = await prisma.workOrder.findMany({
      take: 5,
      orderBy: { scheduledStartDateTime: 'desc' },
      include: {
        contract: {
          include: {
            customer: true,
            address: true
          }
        },
        inspectors: true
      }
    })

    const openFollowUpItems = await prisma.contractRemark.findMany({
      where: {
        status: ContractRemarkStatus.OPEN
      },
      take: 5,
      orderBy: { createdOn: 'desc' },
      include: {
        contract: {
          select: {
            id: true,
            customer: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    })

    const openFollowUpCount = await prisma.contractRemark.count({
      where: {
        status: ContractRemarkStatus.OPEN
      }
    })

    return {
      customerCount,
      inspectorCount,
      contractCount,
      workOrderCount,
      activeContracts,
      completedWorkOrders,
      scheduledWorkOrders,
      totalRevenue: totalRevenue._sum.value || 0,
      recentWorkOrders,
      openFollowUpCount,
      openFollowUps: openFollowUpItems.map((remark) => ({
        id: remark.id,
        body: remark.body,
        createdOn: remark.createdOn.toISOString(),
        contractId: remark.contractId,
        type: remark.type,
        contract: {
          id: remark.contract.id,
          customer: remark.contract.customer,
        },
      })),
      fetchedAt: new Date().toISOString()
    }
  } catch (error) {
    console.error('Dashboard stats error:', error)
    // Return default values if database is unavailable
    return {
      customerCount: 0,
      inspectorCount: 0,
      contractCount: 0,
      workOrderCount: 0,
      activeContracts: 0,
      completedWorkOrders: 0,
      scheduledWorkOrders: 0,
      totalRevenue: 0,
      recentWorkOrders: [],
      openFollowUpCount: 0,
      openFollowUps: [],
      fetchedAt: new Date().toISOString()
    }
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'SCHEDULED': return 'bg-blue-500'
    case 'STARTED': return 'bg-orange-500'
    case 'COMPLETED': return 'bg-green-500'
    case 'CANCELLED': return 'bg-red-500'
    default: return 'bg-gray-500'
  }
}

function getStatusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase()
}

export default async function DashboardPage() {
  let stats
  let error = null
  
  try {
    stats = await getDashboardStats()
  } catch (e) {
    console.error('Failed to load dashboard:', e)
    error = 'Unable to load dashboard data. Please check your connection.'
    stats = {
      customerCount: 0,
      inspectorCount: 0,
      contractCount: 0,
      workOrderCount: 0,
      activeContracts: 0,
      completedWorkOrders: 0,
      scheduledWorkOrders: 0,
      totalRevenue: 0,
      recentWorkOrders: [],
      openFollowUpCount: 0,
      openFollowUps: [],
      fetchedAt: new Date().toISOString()
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Welcome to Property Stewards Admin Portal</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p className="font-medium">Connection Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.customerCount}</div>
            <p className="text-xs text-muted-foreground">Active customers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Inspectors</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inspectorCount}</div>
            <p className="text-xs text-muted-foreground">Available for assignments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contracts</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.contractCount}</div>
            <p className="text-xs text-muted-foreground">{stats.activeContracts} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Excluding cancelled</p>
          </CardContent>
        </Card>
      </div>

      {/* Work Order Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scheduledWorkOrders}</div>
            <p className="text-xs text-muted-foreground">Upcoming inspections</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedWorkOrders}</div>
            <p className="text-xs text-muted-foreground">Finished inspections</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Work Orders</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.workOrderCount}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
      </div>

      {/* Open Follow-up Tasks */}
      <Card>
        <CardHeader>
          <CardTitle>Open Follow-up Tasks</CardTitle>
          <CardDescription>
            {stats.openFollowUpCount === 0
              ? 'All follow-up tasks are completed'
              : `${stats.openFollowUpCount} open follow-up${stats.openFollowUpCount > 1 ? 's' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.openFollowUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open follow-up remarks. Great job staying on top of things!</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Remark</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Logged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.openFollowUps.map((remark) => (
                  <TableRow key={remark.id}>
                    <TableCell className="text-sm">
                      {remark.contract.customer ? (
                        <Link
                          href={`/customers/${remark.contract.customer.id}`}
                          className="text-primary hover:underline"
                        >
                          {remark.contract.customer.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        href={`/contracts/${remark.contract.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        #{remark.contract.id}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-md text-sm">
                      <span className="block truncate" title={remark.body}>
                        {remark.body}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge variant={remark.type === 'FOLLOW_UP' ? 'secondary' : 'outline'}>
                        {remark.type === 'FOLLOW_UP' ? 'Follow Up' : 'FYI'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(remark.createdOn).toLocaleString('en-SG', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Work Orders */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Work Orders</CardTitle>
          <CardDescription>Latest scheduled inspections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.recentWorkOrders.map((workOrder) => (
              <div key={workOrder.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{workOrder.contract.customer.name}</p>
                    <span className={`px-2 py-1 text-xs rounded-full text-white ${getStatusColor(workOrder.status)}`}>
                      {getStatusLabel(workOrder.status)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {workOrder.contract.address.address}, {workOrder.contract.address.postalCode}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Inspectors: {workOrder.inspectors && workOrder.inspectors.length > 0 ? workOrder.inspectors.map((i: any) => i.name).slice(0,2).join(', ') : 'Unassigned'} • {new Date(workOrder.scheduledStartDateTime).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
            {stats.recentWorkOrders.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No work orders yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
