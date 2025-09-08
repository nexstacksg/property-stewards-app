"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, X, Loader2, Save, Pencil } from "lucide-react"
import { PhoneInput } from "@/components/ui/phone-input"
import { DatePicker } from "@/components/ui/date-picker"

interface Address {
  id?: string
  address: string
  postalCode: string
  propertyType: string
  propertySize: string
  remarks?: string
  status?: string
}

interface Customer {
  id: string
  name: string
  type: string
  personInCharge: string
  email: string
  phone: string
  billingAddress: string
  isMember: boolean
  memberTier?: string
  memberSince?: string
  memberExpiredOn?: string
  remarks?: string
  status: string
  addresses: Address[]
}

export default function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  
  // Form fields
  const [name, setName] = useState("")
  const [type, setType] = useState<string>("INDIVIDUAL")
  const [personInCharge, setPersonInCharge] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [billingAddress, setBillingAddress] = useState("")
  const [isMember, setIsMember] = useState(false)
  const [memberTier, setMemberTier] = useState<string>("")
  const [memberSince, setMemberSince] = useState("")
  const [memberExpiredOn, setMemberExpiredOn] = useState("")
  const [remarks, setRemarks] = useState("")
  const [status, setStatus] = useState("ACTIVE")
  
  // Addresses
  const [addresses, setAddresses] = useState<Address[]>([])
  const [deletedAddressIds, setDeletedAddressIds] = useState<string[]>([])
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [newAddress, setNewAddress] = useState<Address>({
    address: "",
    postalCode: "",
    propertyType: "HDB",
    propertySize: "HDB_3_ROOM",
    remarks: ""
  })
  // Editing existing address
  const [editingAddressIndex, setEditingAddressIndex] = useState<number | null>(null)
  const [editedAddress, setEditedAddress] = useState<Address | null>(null)
  const [propertyOptions, setPropertyOptions] = useState<Array<{ id: string; code: string; name: string }>>([])

  useEffect(() => {
    const loadCustomer = async () => {
      const resolvedParams = await params
      setCustomerId(resolvedParams.id)
      await fetchCustomer(resolvedParams.id)
    }
    loadCustomer()
  }, [params])

  // Load property types
  useEffect(() => {
    const loadProps = async () => {
      try {
        const res = await fetch('/api/properties')
        if (!res.ok) return
        const data = await res.json()
        setPropertyOptions(data)
      } catch (e) {
        console.error('Failed to load properties', e)
      }
    }
    loadProps()
  }, [])

  const fetchCustomer = async (id: string) => {
    try {
      const response = await fetch(`/api/customers/${id}`)
      if (!response.ok) throw new Error("Failed to fetch customer")
      
      const customer: Customer = await response.json()
      
      setName(customer.name)
      setType(customer.type)
      setPersonInCharge(customer.personInCharge)
      setEmail(customer.email)
      setPhone(customer.phone)
      setBillingAddress(customer.billingAddress)
      setIsMember(customer.isMember)
      setMemberTier(customer.memberTier || "")
      setMemberSince(customer.memberSince ? customer.memberSince.split('T')[0] : "")
      setMemberExpiredOn(customer.memberExpiredOn ? customer.memberExpiredOn.split('T')[0] : "")
      setRemarks(customer.remarks || "")
      setStatus(customer.status)
      setAddresses(customer.addresses)
      
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer")
      setLoading(false)
    }
  }

  const handleTypeChange = (value: string) => {
    setType(value)
    if (value === "INDIVIDUAL" && !personInCharge) {
      setPersonInCharge(name)
    }
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value
    setName(newName)
    if (type === "INDIVIDUAL") {
      setPersonInCharge(newName)
    }
  }

  const addAddress = () => {
    if (newAddress.address && newAddress.postalCode) {
      setAddresses([...addresses, { ...newAddress, status: "ACTIVE" }])
      setNewAddress({
        address: "",
        postalCode: "",
        propertyType: "HDB",
        propertySize: "HDB_3_ROOM",
        remarks: ""
      })
      setShowAddressForm(false)
    }
  }

  const removeAddress = (index: number) => {
    const address = addresses[index]
    if (address.id) {
      setDeletedAddressIds([...deletedAddressIds, address.id])
    }
    setAddresses(addresses.filter((_, i) => i !== index))
  }

  const startEditAddress = (index: number) => {
    setEditingAddressIndex(index)
    setEditedAddress({ ...addresses[index] })
  }

  const cancelEditAddress = () => {
    setEditingAddressIndex(null)
    setEditedAddress(null)
  }

  const saveEditedAddress = () => {
    if (editingAddressIndex === null || !editedAddress) return
    const updated = [...addresses]
    updated[editingAddressIndex] = { ...updated[editingAddressIndex], ...editedAddress }
    setAddresses(updated)
    setEditingAddressIndex(null)
    setEditedAddress(null)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId) return
    
    setError("")
    setSaving(true)

    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          personInCharge,
          email,
          phone,
          billingAddress,
          isMember,
          memberTier: isMember ? memberTier : null,
          memberSince: isMember && memberSince ? memberSince : null,
          memberExpiredOn: isMember && memberExpiredOn ? memberExpiredOn : null,
          remarks,
          status,
          addresses,
          deletedAddressIds
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update customer")
      }

      router.push(`/customers/${customerId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={customerId ? `/customers/${customerId}` : "/customers"}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Customer</h1>
          <p className="text-muted-foreground mt-1">Update customer information</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Basic Information */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>Update the customer's basic details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
                    {error}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="type">Customer Type *</Label>
                    <Select value={type} onValueChange={handleTypeChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                        <SelectItem value="COMPANY">Company</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">
                      {type === "COMPANY" ? "Company Name" : "Full Name"} *
                    </Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={handleNameChange}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="personInCharge">Person in Charge *</Label>
                    <Input
                      id="personInCharge"
                      value={personInCharge}
                      onChange={(e) => setPersonInCharge(e.target.value)}
                      required
                      disabled={type === "INDIVIDUAL"}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone *</Label>
                    <PhoneInput
                      value={phone}
                      onChange={setPhone}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="billingAddress">Billing Address *</Label>
                    <Input
                      id="billingAddress"
                      value={billingAddress}
                      onChange={(e) => setBillingAddress(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="remarks">Remarks</Label>
                    <textarea
                      id="remarks"
                      className="w-full min-h-[80px] px-3 py-2 border rounded-md"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Optional notes about this customer"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Property Addresses */}
            <Card className="mt-6">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Property Addresses</CardTitle>
                    <CardDescription>Manage property addresses for this customer</CardDescription>
                  </div>
                  {!showAddressForm && (
                    <Button
                      type="button"
                      variant="outline"
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
                            {propertyOptions.map((p: any) => (
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
                        type="button"
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
                        type="button"
                        size="sm"
                        onClick={addAddress}
                        disabled={!newAddress.address || !newAddress.postalCode}
                      >
                        Add Address
                      </Button>
                    </div>
                  </div>
                )}

                {addresses.length > 0 ? (
                  <div className="space-y-3">
                    {addresses.map((addr, index) => {
                      const isEditing = editingAddressIndex === index && editedAddress
                      return (
                        <div key={addr.id || index} className="border rounded-lg p-3">
                          {isEditing ? (
                            <div className="space-y-3">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2 md:col-span-2">
                                  <Label>Address</Label>
                                  <Input
                                    value={editedAddress!.address}
                                    onChange={(e) => setEditedAddress({ ...editedAddress!, address: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Postal Code</Label>
                                  <Input
                                    value={editedAddress!.postalCode}
                                    onChange={(e) => setEditedAddress({ ...editedAddress!, postalCode: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Property Type</Label>
                                  <Select
                                    value={editedAddress!.propertyType}
                                    onValueChange={(value) => {
                                      const options = getPropertySizeOptions(value)
                                      setEditedAddress({
                                        ...editedAddress!,
                                        propertyType: value,
                                        propertySize: options[0]?.value || ""
                                      })
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {propertyOptions.map((p: any) => (
                                        <SelectItem key={p.id} value={p.code}>{p.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Property Size</Label>
                                  <Select
                                    value={editedAddress!.propertySize}
                                    onValueChange={(value) => setEditedAddress({ ...editedAddress!, propertySize: value })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getPropertySizeOptions(editedAddress!.propertyType).map(option => (
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
                                    value={editedAddress!.remarks || ""}
                                    onChange={(e) => setEditedAddress({ ...editedAddress!, remarks: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={cancelEditAddress}>
                                  Cancel
                                </Button>
                                <Button type="button" size="sm" onClick={saveEditedAddress} disabled={!editedAddress!.address || !editedAddress!.postalCode}>
                                  Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium">{addr.address}</p>
                                <p className="text-sm text-muted-foreground">
                                  {addr.postalCode} • {addr.propertyType} • {addr.propertySize.replace(/_/g, ' ')}
                                </p>
                                {addr.remarks && (
                                  <p className="text-sm text-muted-foreground mt-1">{addr.remarks}</p>
                                )}
                                {addr.status && (
                                  <Badge 
                                    variant={addr.status === 'ACTIVE' ? 'success' : 'secondary'} 
                                    className="mt-2"
                                  >
                                    {addr.status}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => startEditAddress(index)}
                                  aria-label="Edit address"
                                  title="Edit address"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeAddress(index)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  !showAddressForm && (
                    <p className="text-muted-foreground text-center py-4">
                      No addresses added yet
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          </div>

          {/* Membership Information */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Membership</CardTitle>
                <CardDescription>Update membership status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isMember"
                    checked={isMember}
                    onChange={(e) => setIsMember(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="isMember">Is Member</Label>
                </div>

                {isMember && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="memberTier">Member Tier</Label>
                      <Select value={memberTier} onValueChange={setMemberTier}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select tier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BRONZE">Bronze</SelectItem>
                          <SelectItem value="SILVER">Silver</SelectItem>
                          <SelectItem value="GOLD">Gold</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="memberSince">Member Since</Label>
                      <DatePicker
                        value={memberSince}
                        onChange={(date) => setMemberSince(date ? date.toISOString().split('T')[0] : '')}
                        placeholder="Select member since date"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="memberExpiredOn">Expires On</Label>
                      <DatePicker
                        value={memberExpiredOn}
                        onChange={(date) => setMemberExpiredOn(date ? date.toISOString().split('T')[0] : '')}
                        placeholder="Select expiry date"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Form Actions */}
            <div className="mt-6 flex gap-2">
              <Button
                type="submit"
                className="flex-1"
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
              <Link href={customerId ? `/customers/${customerId}` : "/customers"} className="flex-1">
                <Button type="button" variant="outline" className="w-full">
                  Cancel
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
