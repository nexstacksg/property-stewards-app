"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, FileText, DollarSign, Calendar, MapPin, ChevronLeft, ChevronRight, Filter } from "lucide-react"

interface Contract {
  id: string
  value: number
  firstPaymentOn: string
  finalPaymentOn?: string
  scheduledStartDate: string
  scheduledEndDate: string
  actualStartDate?: string
  actualEndDate?: string
  servicePackage?: string
  contractType: string
  customerRating?: number
  status: string
  marketingSource?: 'GOOGLE' | 'REFERRAL' | 'OTHERS'
  referenceIds?: string[]
  customer: {
    id: string
    name: string
    type: string
  }
  address: {
    address: string
    postalCode: string
    propertyType: string
    propertySizeRange?: string | null
    relationship?: 'AGENT' | 'OWNER' | 'TENANT' | null
  }
  workOrders: any[]
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const limit = 10

  useEffect(() => {
    fetchContracts()
  }, [page, statusFilter])

  const fetchContracts = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })
      
      if (statusFilter) {
        params.append('status', statusFilter)
      }

      const response = await fetch(`/api/contracts?${params}`)
      const data = await response.json()
      
      setContracts(data.contracts)
      setTotalPages(data.pagination.totalPages)
    } catch (error) {
      console.error('Error fetching contracts:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusVariant = (status: string): any => {
    switch (status) {
      case 'DRAFT':
        return 'outline'
      case 'CONFIRMED':
        return 'secondary'
      case 'SCHEDULED':
        return 'info'
      case 'COMPLETED':
        return 'success'
      case 'TERMINATED':
        return 'default'
      case 'CANCELLED':
        return 'destructive'
      default:
        return 'default'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-SG', {
      dateStyle: 'medium'
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD'
    }).format(amount)
  }

  const formatEnumLabel = (value?: string | null) => {
    if (!value) return ''
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
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ')
  }

  // Calculate statistics
  const totalValue = contracts.reduce((sum, c) => sum + Number(c.value), 0)
  const activeContracts = contracts.filter(c => ['CONFIRMED', 'SCHEDULED'].includes(c.status)).length
  const completedContracts = contracts.filter(c => c.status === 'COMPLETED').length

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Contracts</h1>
          <p className="text-muted-foreground mt-2">Manage inspection contracts and agreements</p>
        </div>
        <Link href="/contracts/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Contract
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Total Contracts</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contracts.length}</div>
            <p className="text-xs text-muted-foreground">
              All time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <Calendar className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">{activeContracts}</div>
            <p className="text-xs text-muted-foreground">
              Ongoing contracts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <FileText className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{completedContracts}</div>
            <p className="text-xs text-muted-foreground">
              Finished contracts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
            <p className="text-xs text-muted-foreground">
              Contract value
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Contract List</CardTitle>
              <CardDescription>
                {statusFilter ? `Showing ${statusFilter.toLowerCase()} contracts` : 'All contracts'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border rounded-md"
              >
                <option value="">All Status</option>
                <option value="DRAFT">Draft</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="TERMINATED">Terminated</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              {statusFilter && (
                <Button variant="outline" size="sm" onClick={() => setStatusFilter('')}>
                  <Filter className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contract ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contracts.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium">
                        #{contract.id.slice(-8).toUpperCase()}
                      </TableCell>
                      <TableCell>
                        <Link 
                          href={`/customers/${contract.customer.id}`}
                          className="hover:underline"
                        >
                          <div>
                            <div className="font-medium">{contract.customer.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {contract.customer.type}
                            </div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
                          <div>
                            <div className="text-sm">{contract.address.address}</div>
                            <div className="text-xs text-muted-foreground">
                              {contract.address.postalCode} • {contract.address.propertyType}
                            </div>
                            {(contract.address.relationship || contract.address.propertySizeRange) && (
                              <div className="text-xs text-muted-foreground">
                                {contract.address.relationship && (
                                  <span>Rel: {formatEnumLabel(contract.address.relationship)}</span>
                                )}
                                {contract.address.relationship && contract.address.propertySizeRange && ' • '}
                                {contract.address.propertySizeRange && (
                                  <span>Size: {formatEnumLabel(contract.address.propertySizeRange)}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(Number(contract.value))}</TableCell>
                      <TableCell>
                        <Badge variant={contract.contractType === 'REPAIR' ? 'outline' : 'secondary'}>
                          {contract.contractType === 'REPAIR' ? 'Repair' : 'Inspection'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            {formatDate(contract.scheduledStartDate)}
                          </div>
                          {contract.actualStartDate && (
                            <div className="text-xs text-muted-foreground">
                              Started: {formatDate(contract.actualStartDate)}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="text-sm">{contract.servicePackage || 'Standard'}</div>
                          <div className="text-xs text-muted-foreground">
                            {contract.workOrders.length} work order(s)
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(contract.status)}>
                          {contract.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Link href={`/contracts/${contract.id}`}>
                            <Button variant="outline" size="sm">View</Button>
                          </Link>
                          {contract.status === 'DRAFT' && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                // Update status to CONFIRMED
                                fetch(`/api/contracts/${contract.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: 'CONFIRMED' })
                                }).then(() => fetchContracts())
                              }}
                            >
                              Confirm
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {contracts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No contracts found
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-4">
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
