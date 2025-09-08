"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PhoneInput } from "@/components/ui/phone-input"
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
  Home,
  Loader2
} from "lucide-react"

interface Address {
  id: string
  address: string
  postalCode: string
  propertyType: string
  propertySize: string
  remarks?: string | null
  status: string
}

interface NewAddress {
  address: string
  postalCode: string
  propertyType: string
  propertySize: string
  remarks?: string
}

type PropertyOption = { id: string; code: string; name: string }

interface Customer {
  id: string
  name: string
  type: string
  personInCharge: string
  email: string
  phone: string
  billingAddress: string
  status: string
  isMember: boolean
  memberTier?: string | null
  memberSince?: string | null
  memberExpiredOn?: string | null
  remarks?: string | null
  createdOn: string
  addresses: Address[]
  contracts: any[]
}

function formatDate(date: Date | string | null) {
  if (!date) return 'N/A'
  
  // Parse the date and adjust for Singapore timezone
  const d = new Date(date)
  
  // If the date appears to be at midnight UTC, it's likely a date-only value
  // Add 12 hours to ensure we're displaying the correct date in Singapore
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
    d.setUTCHours(12)
  }
  
  return d.toLocaleDateString('en-SG', {
    dateStyle: 'medium',
    timeZone: 'Asia/Singapore'
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

const getPropertySizeOptions = (propertyType: string) => {
  switch (propertyType) {
    case "HDB":
      return [
        { value: "HDB_1_ROOM", label: "1 Room" },
        { value: "HDB_2_ROOM", label: "2 Room" },
        { value: "HDB_3_ROOM", label: "3 Room" },
        { value: "HDB_4_ROOM", label: "4 Room" },
        { value: "HDB_5_ROOM", label: "5 Room" },
        { value: "HDB_EXECUTIVE", label: "Executive" },
        { value: "HDB_JUMBO", label: "Jumbo" }
      ]
    case "CONDO":
    case "EC":
    case "APARTMENT":
      return [
        { value: "STUDIO", label: "Studio" },
        { value: "ONE_BEDROOM", label: "1 Bedroom" },
        { value: "TWO_BEDROOM", label: "2 Bedroom" },
        { value: "THREE_BEDROOM", label: "3 Bedroom" },
        { value: "FOUR_BEDROOM", label: "4 Bedroom" },
        { value: "PENTHOUSE", label: "Penthouse" }
      ]
    case "LANDED":
      return [
        { value: "TERRACE", label: "Terrace" },
        { value: "SEMI_DETACHED", label: "Semi-Detached" },
        { value: "DETACHED", label: "Detached" },
        { value: "BUNGALOW", label: "Bungalow" },
        { value: "GOOD_CLASS_BUNGALOW", label: "Good Class Bungalow" }
      ]
    default:
      return []
  }
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [customerId, setCustomerId] = useState<string>('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [addingAddress, setAddingAddress] = useState(false)
  const [newAddress, setNewAddress] = useState<NewAddress>({
    address: "",
    postalCode: "",
    propertyType: "HDB",
    propertySize: "HDB_3_ROOM",
    remarks: ""
  })
  const [propertyOptions, setPropertyOptions] = useState<PropertyOption[]>([])

  useEffect(() => {
    params.then(p => setCustomerId(p.id))
  }, [params])

  useEffect(() => {
    const loadProps = async () => {
      try {
        const res = await fetch('/api/properties')
        if (!res.ok) return
        const data = await res.json()
        setPropertyOptions(data)
      } catch (e) {
        console.error('Failed to load property types', e)
      }
    }
    loadProps()
  }, [])

  useEffect(() => {
    if (customerId) {
      fetchCustomer()
    }
  }, [customerId])

  const fetchCustomer = async () => {
    try {
      const response = await fetch(`/api/customers/${customerId}`)
      if (!response.ok) {
        throw new Error('Customer not found')
      }
      const data = await response.json()
      setCustomer(data)
    } catch (error) {
      console.error('Error fetching customer:', error)
      router.push('/customers')
    } finally {
      setLoading(false)
    }
  }

  const addAddress = async () => {
    if (!newAddress.address || !newAddress.postalCode) return

    setAddingAddress(true)
    try {
      const response = await fetch(`/api/customers/${customerId}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAddress)
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add address")
      }

      // Reset form
      setNewAddress({
        address: "",
        postalCode: "",
        propertyType: "HDB",
        propertySize: "HDB_3_ROOM",
        remarks: ""
      })
      setShowAddressForm(false)
      
      // Refresh customer data
      await fetchCustomer()
    } catch (err) {
      console.error('Error adding address:', err)
    } finally {
      setAddingAddress(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="p-6">
        <p>Customer not found</p>
      </div>
    )
  }

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
                  <p className="font-medium">{formatDate(customer?.memberSince || "")}</p>
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
                {!showAddressForm && (
                  <Button
                    size="sm"
                    onClick={() => setShowAddressForm(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Address
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {showAddressForm && (
                <div className="border rounded-lg p-4 mb-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Address</Label>
                      <Input
                        value={newAddress.address}
                        onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                        placeholder="Block 123, Street Name, #01-01"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Postal Code</Label>
                      <Input
                        value={newAddress.postalCode}
                        onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                        placeholder="123456"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Property Type</Label>
                      <Select
                        value={newAddress.propertyType}
                        onValueChange={(value) => {
                          setNewAddress({ 
                            ...newAddress, 
                            propertyType: value,
                            propertySize: getPropertySizeOptions(value)[0]?.value || ""
                          })
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {propertyOptions.map((p) => (
                            <SelectItem key={p.id} value={p.code}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Property Size</Label>
                      <Select
                        value={newAddress.propertySize}
                        onValueChange={(value) => setNewAddress({ ...newAddress, propertySize: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getPropertySizeOptions(newAddress.propertyType).map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Remarks</Label>
                      <Input
                        value={newAddress.remarks}
                        onChange={(e) => setNewAddress({ ...newAddress, remarks: e.target.value })}
                        placeholder="Optional notes about this property"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddressForm(false)
                        setNewAddress({
                          address: "",
                          postalCode: "",
                          propertyType: "HDB",
                          propertySize: "HDB_3_ROOM",
                          remarks: ""
                        })
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={addAddress}
                      disabled={!newAddress.address || !newAddress.postalCode || addingAddress}
                    >
                      {addingAddress && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Add Address
                    </Button>
                  </div>
                </div>
              )}

              {customer.addresses.length === 0 && !showAddressForm ? (
                <p className="text-muted-foreground text-center py-4">No addresses registered</p>
              ) : (
                customer.addresses.length > 0 && (
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
                )
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
                  {formatDate(customer.memberSince || "")}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
