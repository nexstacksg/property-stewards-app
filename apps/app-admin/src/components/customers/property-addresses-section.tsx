"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import PropertyTypeSelect from '@/components/property-type-select'
import { Plus, X, Pencil } from "lucide-react"

interface Address {
  id?: string
  address: string
  postalCode: string
  propertyType: string
  propertySize: string
  remarks?: string
  status?: string
}

interface Option { code: string; name: string }

type Props = {
  showAddressForm: boolean
  setShowAddressForm: (v: boolean) => void
  newAddress: Address
  setNewAddress: (a: Address) => void
  newSizeOptions: Option[]
  addresses: Address[]
  removeAddress: (index: number) => void
  startEditAddress: (index: number) => void
  editingAddressIndex: number | null
  editedAddress: Address | null
  setEditedAddress: (a: Address | null) => void
  editSizeOptions: Option[]
  addAddress: () => void
  saveEditedAddress: () => void
  cancelEditAddress: () => void
}

export function PropertyAddressesSection({
  showAddressForm,
  setShowAddressForm,
  newAddress,
  setNewAddress,
  newSizeOptions,
  addresses,
  removeAddress,
  startEditAddress,
  editingAddressIndex,
  editedAddress,
  setEditedAddress,
  editSizeOptions,
  addAddress,
  saveEditedAddress,
  cancelEditAddress,
}: Props) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Property Addresses</CardTitle>
            <CardDescription>Manage property addresses for this customer</CardDescription>
          </div>
          {!showAddressForm && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddressForm(true)}>
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
                <Input value={newAddress.address} onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })} placeholder="Block 123, Street Name, #01-01" />
              </div>
              <div className="space-y-2">
                <Label>Postal Code</Label>
                <Input value={newAddress.postalCode} onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })} placeholder="123456" />
              </div>
              <div className="space-y-2">
                <Label>Property Type</Label>
                <PropertyTypeSelect
                  value={newAddress.propertyType}
                  onChange={(value) => setNewAddress({ ...newAddress, propertyType: value, propertySize: '' })}
                />
              </div>
              <div className="space-y-2">
                <Label>Property Size</Label>
                <Select value={newAddress.propertySize} onValueChange={(value) => setNewAddress({ ...newAddress, propertySize: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {newSizeOptions.map((option) => (
                      <SelectItem key={option.code} value={option.code}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Remarks</Label>
                <Input value={newAddress.remarks || ''} onChange={(e) => setNewAddress({ ...newAddress, remarks: e.target.value })} placeholder="Optional notes for this address" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={addAddress}>Add</Button>
              <Button type="button" variant="outline" onClick={() => setShowAddressForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {addresses.map((addr, index) => (
            <div key={index} className="border rounded-lg p-4">
              {editingAddressIndex === index ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Address</Label>
                      <Input value={editedAddress?.address || ''} onChange={(e) => setEditedAddress({ ...(editedAddress as Address), address: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Postal Code</Label>
                      <Input value={editedAddress?.postalCode || ''} onChange={(e) => setEditedAddress({ ...(editedAddress as Address), postalCode: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Property Type</Label>
                      <PropertyTypeSelect value={editedAddress?.propertyType || ''} onChange={(value) => setEditedAddress({ ...(editedAddress as Address), propertyType: value, propertySize: '' })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Property Size</Label>
                      <Select value={editedAddress?.propertySize || ''} onValueChange={(value) => setEditedAddress({ ...(editedAddress as Address), propertySize: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {editSizeOptions.map((option) => (
                            <SelectItem key={option.code} value={option.code}>
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Remarks</Label>
                      <Input value={editedAddress?.remarks || ''} onChange={(e) => setEditedAddress({ ...(editedAddress as Address), remarks: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={saveEditedAddress}>Save</Button>
                    <Button type="button" variant="outline" onClick={cancelEditAddress}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{addr.address}</p>
                    <p className="text-sm text-muted-foreground">{addr.postalCode} • {addr.propertyType} • {addr.propertySize}</p>
                    {addr.remarks && <p className="text-sm text-muted-foreground mt-1">{addr.remarks}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="icon" onClick={() => startEditAddress(index)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="destructive" size="icon" onClick={() => removeAddress(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {addresses.length === 0 && (
            <p className="text-sm text-muted-foreground">No property addresses added yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

