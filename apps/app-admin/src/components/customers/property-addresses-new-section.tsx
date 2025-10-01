"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import PropertyTypeSelect from '@/components/property-type-select'
import { Plus, X } from "lucide-react"
import {
  DEFAULT_PROPERTY_RELATIONSHIP,
  DEFAULT_PROPERTY_SIZE_RANGE,
  PROPERTY_SIZE_RANGE_OPTIONS,
  PROPERTY_RELATIONSHIP_OPTIONS,
  formatPropertySizeRange,
  formatPropertyRelationship
} from '@/lib/property-address'

interface Address {
  address: string
  postalCode: string
  propertyType: string
  propertySize: string
  propertySizeRange?: string
  relationship?: string
  remarks?: string
}

interface Option { id: string; code: string; name: string }

type Props = {
  showAddressForm: boolean
  setShowAddressForm: (v: boolean) => void
  newAddress: Address
  setNewAddress: (a: Address) => void
  sizeOptions: Option[]
  addresses: Address[]
  addAddress: () => void
  removeAddress: (index: number) => void
}

export function PropertyAddressesNewSection({
  showAddressForm,
  setShowAddressForm,
  newAddress,
  setNewAddress,
  sizeOptions,
  addresses,
  addAddress,
  removeAddress,
}: Props) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Property Addresses</CardTitle>
            <CardDescription>Add property addresses for this customer</CardDescription>
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
                  onChange={(value) => setNewAddress({
                    ...newAddress,
                    propertyType: value,
                    propertySize: '',
                    propertySizeRange: newAddress.propertySizeRange || DEFAULT_PROPERTY_SIZE_RANGE,
                    relationship: newAddress.relationship || DEFAULT_PROPERTY_RELATIONSHIP
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label>Property Size</Label>
                <Select value={newAddress.propertySize} onValueChange={(value) => setNewAddress({ ...newAddress, propertySize: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sizeOptions.map((opt) => (
                      <SelectItem key={opt.code} value={opt.code}>{opt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Property Size Range</Label>
                <Select
                  value={newAddress.propertySizeRange || undefined}
                  onValueChange={(value) => setNewAddress({ ...newAddress, propertySizeRange: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select size range" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPERTY_SIZE_RANGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Relationship</Label>
                <Select
                  value={newAddress.relationship || undefined}
                  onValueChange={(value) => setNewAddress({ ...newAddress, relationship: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select relationship" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPERTY_RELATIONSHIP_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
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
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddressForm(false)}>Cancel</Button>
              <Button
                type="button"
                size="sm"
                onClick={addAddress}
                disabled={
                  !newAddress.address ||
                  !newAddress.postalCode ||
                  !newAddress.propertySize ||
                  !newAddress.propertySizeRange ||
                  !newAddress.relationship
                }
              >
                Add Address
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {addresses.map((addr, index) => (
            <div key={index} className="border rounded-lg p-3 flex items-start justify-between">
              <div>
                <p className="font-medium">{addr.address}</p>
                <p className="text-sm text-muted-foreground">
                  {addr.postalCode} • {addr.propertyType} • {addr.propertySize}
                  {addr.propertySizeRange && ` • ${formatPropertySizeRange(addr.propertySizeRange)}`}
                </p>
                {addr.relationship && (
                  <p className="text-sm text-muted-foreground">Relationship: {formatPropertyRelationship(addr.relationship)}</p>
                )}
                {addr.remarks && <p className="text-sm text-muted-foreground mt-1">{addr.remarks}</p>}
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeAddress(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {addresses.length === 0 && !showAddressForm && (
            <p className="text-sm text-muted-foreground text-center">No addresses added yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
