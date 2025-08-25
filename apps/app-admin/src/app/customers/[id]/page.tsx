import { notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  ArrowLeft, 
  Edit, 
  MapPin, 
  Mail, 
  Phone, 
  Building2, 
  User, 
  Calendar,
  DollarSign,
  FileText,
  Crown,
  Plus,
  Home
} from "lucide-react"
import prisma from "@/lib/prisma"

async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      addresses: {
        orderBy: { createdOn: 'desc' }
      },
      contracts: {
        include: {
          address: true,
          workOrders: {
            include: {
              inspector: true
            }
          }
        },
        orderBy: { createdOn: 'desc' }
      }
    }
  })

  if (!customer) {
    notFound()
  }

  return customer
}

function formatDate(date: Date | string | null) {
  if (!date) return 'N/A'
  return new Date(date).toLocaleDateString('en-SG', {
    dateStyle: 'medium'
  })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD'
  }).format(amount)
}

function getContractStatusVariant(status: string): any {
  switch (status) {
    case 'DRAFT': return 'outline'
    case 'CONFIRMED': return 'secondary'
    case 'SCHEDULED': return 'info'
    case 'COMPLETED': return 'success'
    case 'CLOSED': return 'default'
    case 'CANCELLED': return 'destructive'
    default: return 'default'
  }
}

function getPropertyTypeIcon(type: string) {
  switch (type) {
    case 'HDB': return <Home className="h-4 w-4" />
    case 'CONDO':
    case 'EC':
    case 'APARTMENT': return <Building2 className="h-4 w-4" />
    default: return <Home className="h-4 w-4" />
  }
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const customer = await getCustomer(resolvedParams.id)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/customers">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{customer.name}</h1>
              {customer.isMember && customer.memberTier && (
                <Badge variant="warning">
                  <Crown className="h-3 w-3 mr-1" />
                  {customer.memberTier}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">Customer Details</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/customers/${customer.id}/edit`}>
            <Button>
              <Edit className="h-4 w-4 mr-2" />
              Edit Customer
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Customer Information */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <div className="flex items-center gap-2 mt-1">
                  {customer.type === 'COMPANY' ? 
                    <Building2 className="h-4 w-4" /> : 
                    <User className="h-4 w-4" />
                  }
                  <span className="font-medium">{customer.type}</span>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Person in Charge</p>
                <p className="font-medium">{customer.personInCharge}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-primary hover:underline">
                  <Mail className="h-4 w-4" />
                  {customer.email}
                </a>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-primary hover:underline">
                  <Phone className="h-4 w-4" />
                  {customer.phone}
                </a>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Billing Address</p>
                <p className="font-medium">{customer.billingAddress}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={customer.status === 'ACTIVE' ? 'success' : 'secondary'}>
                  {customer.status}
                </Badge>
              </div>

              {customer.remarks && (
                <div>
                  <p className="text-sm text-muted-foreground">Remarks</p>
                  <p className="text-sm">{customer.remarks}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Membership Information */}
          {customer.isMember && (
            <Card>
              <CardHeader>
                <CardTitle>Membership Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Tier</p>
                  <Badge variant="warning">
                    <Crown className="h-3 w-3 mr-1" />
                    {customer.memberTier}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p className="font-medium">{formatDate(customer.memberSince)}</p>
                </div>
                {customer.memberExpiredOn && (
                  <div>
                    <p className="text-sm text-muted-foreground">Expires On</p>
                    <p className="font-medium">{formatDate(customer.memberExpiredOn)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Addresses and Contracts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Property Addresses */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Property Addresses</CardTitle>
                  <CardDescription>{customer.addresses.length} registered properties</CardDescription>
                </div>
                <Link href={`/customers/${customer.id}/addresses/new`}>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Address
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {customer.addresses.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No addresses registered</p>
              ) : (
                <div className="space-y-3">
                  {customer.addresses.map((address) => (
                    <div key={address.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{address.address}</p>
                              <p className="text-sm text-muted-foreground">
                                {address.postalCode}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getPropertyTypeIcon(address.propertyType)}
                            <Badge variant="outline">{address.propertyType}</Badge>
                            <Badge variant="secondary">{address.propertySize.replace(/_/g, ' ')}</Badge>
                          </div>
                          {address.remarks && (
                            <p className="text-sm text-muted-foreground">{address.remarks}</p>
                          )}
                        </div>
                        <Badge variant={address.status === 'ACTIVE' ? 'success' : 'secondary'}>
                          {address.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contracts */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Contracts</CardTitle>
                  <CardDescription>{customer.contracts.length} total contracts</CardDescription>
                </div>
                <Link href={`/contracts/new?customerId=${customer.id}`}>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New Contract
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {customer.contracts.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No contracts yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract ID</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.contracts.map((contract) => (
                      <TableRow key={contract.id}>
                        <TableCell className="font-medium">
                          #{contract.id.slice(-8).toUpperCase()}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{contract.address.address}</p>
                            <p className="text-xs text-muted-foreground">
                              {contract.address.postalCode}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{formatCurrency(Number(contract.value))}</TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{formatDate(contract.scheduledStartDate)}</p>
                            <p className="text-xs text-muted-foreground">
                              {contract.workOrders.length} work order(s)
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getContractStatusVariant(contract.status)}>
                            {contract.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link href={`/contracts/${contract.id}`}>
                            <Button variant="outline" size="sm">View</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Statistics */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Total Contracts</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{customer.contracts.length}</div>
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
                <div className="text-2xl font-bold">
                  {formatCurrency(
                    customer.contracts.reduce((sum, c) => sum + Number(c.value), 0)
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Member Since</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">
                  {formatDate(customer.createdOn)}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}