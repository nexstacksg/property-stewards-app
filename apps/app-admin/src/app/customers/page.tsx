"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, ChevronLeft, ChevronRight, Building2, User, Crown } from "lucide-react"

interface Customer {
  id: string
  name: string
  type: string
  personInCharge: string
  email: string
  phone: string
  isMember: boolean
  memberTier?: string
  status: string
  addresses: any[]
  _count: {
    contracts: number
  }
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const limit = 10

  useEffect(() => {
    fetchCustomers()
  }, [page, searchTerm])

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })
      
      if (searchTerm) {
        params.append('search', searchTerm)
      }

      const response = await fetch(`/api/customers?${params}`)
      const data = await response.json()
      
      setCustomers(data?.customers)
      setTotalPages(data?.pagination?.totalPages || 1)
    } catch (error) {
      console.error('Error fetching customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPage(1)
    fetchCustomers()
  }

  const getMemberBadge = (customer: Customer) => {
    if (!customer.isMember) return null
    
    const tierColors = {
      GOLD: "warning",
      SILVER: "secondary",
      BRONZE: "outline"
    } as const

    return (
      <Badge variant={tierColors[customer.memberTier as keyof typeof tierColors] || "default"}>
        <Crown className="h-3 w-3 mr-1" />
        {customer.memberTier}
      </Badge>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">Customers</h1>
          <p className="text-muted-foreground mt-2">Manage your customer database</p>
        </div>
        <Link href="/customers/new" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Customer List</CardTitle>
              <CardDescription>View and manage all customers</CardDescription>
            </div>
            <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-[260px] md:w-[320px] lg:w-[360px]">
              <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-2 border rounded-md w-full"
              />
              <Button type="submit" variant="outline" className="shrink-0">
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact Person</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Contracts</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {customer.type === 'COMPANY' ? (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="block max-w-[220px] truncate" title={customer.name}>
                            {customer.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {customer.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-[200px] truncate" title={customer.personInCharge}>
                          {customer.personInCharge}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-[260px] truncate" title={customer.email}>
                          {customer.email}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-[140px] truncate" title={customer.phone}>
                          {customer.phone}
                        </span>
                      </TableCell>
                      <TableCell>{getMemberBadge(customer)}</TableCell>
                      <TableCell>{customer._count.contracts}</TableCell>
                      <TableCell>
                        <Badge variant={customer.status === 'ACTIVE' ? 'success' : 'secondary'}>
                          {customer.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Link href={`/customers/${customer.id}`}>
                            <Button variant="outline" size="sm">View</Button>
                          </Link>
                          <Link href={`/customers/${customer.id}/edit`}>
                            <Button variant="outline" size="sm">Edit</Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>

              {customers.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No customers found
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
