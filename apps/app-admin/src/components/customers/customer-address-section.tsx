"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import PropertyTypeSelect from "@/components/property-type-select"
import { Building2, Home, Loader2, MapPin, Plus } from "lucide-react"
import {
  DEFAULT_PROPERTY_RELATIONSHIP,
  DEFAULT_PROPERTY_SIZE_RANGE,
  PROPERTY_RELATIONSHIP_OPTIONS,
  PROPERTY_SIZE_RANGE_OPTIONS,
  formatPropertyRelationship,
  formatPropertySizeRange,
} from "@/lib/property-address"
import { CustomerAddress, NewCustomerAddress } from "@/types/customer"

interface SizeOption {
  code: string
  name: string
}

interface CustomerAddressSectionProps {
  addresses: CustomerAddress[]
  showForm: boolean
  onShowForm: () => void
  onCancelForm: () => void
  newAddress: NewCustomerAddress
  onUpdateAddress: (updates: Partial<NewCustomerAddress>) => void
  sizeOptions: SizeOption[]
  addingAddress: boolean
  onAddAddress: () => void
}

function getPropertyTypeIcon(type: string) {
  switch (type) {
    case "HDB":
      return <Home className="h-4 w-4" />
    case "CONDO":
    case "EC":
    case "APARTMENT":
      return <Building2 className="h-4 w-4" />
    case "LANDED":
      return <Home className="h-4 w-4" />
    default:
      return <Home className="h-4 w-4" />
  }
}

export function CustomerAddressSection({
  addresses,
  showForm,
  onShowForm,
  onCancelForm,
  newAddress,
  onUpdateAddress,
  sizeOptions,
  addingAddress,
  onAddAddress,
}: CustomerAddressSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Property Addresses</CardTitle>
            <CardDescription>{addresses.length} registered properties</CardDescription>
          </div>
          {!showForm && (
            <Button size="sm" onClick={onShowForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add Address
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="border rounded-lg p-4 mb-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Address</Label>
                <Input
                  value={newAddress.address}
                  onChange={(event) => onUpdateAddress({ address: event.target.value })}
                  placeholder="Block 123, Street Name, #01-01"
                />
              </div>

              <div className="space-y-2">
                <Label>Postal Code</Label>
                <Input
                  value={newAddress.postalCode}
                  onChange={(event) => onUpdateAddress({ postalCode: event.target.value })}
                  placeholder="123456"
                />
              </div>

              <div className="space-y-2">
                <Label>Property Type</Label>
                <PropertyTypeSelect
                  value={newAddress.propertyType}
                  onChange={(value) =>
                    onUpdateAddress({
                      propertyType: value,
                      propertySize: "",
                      propertySizeRange: newAddress.propertySizeRange || DEFAULT_PROPERTY_SIZE_RANGE,
                      relationship: newAddress.relationship || DEFAULT_PROPERTY_RELATIONSHIP,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Property Size</Label>
                <Select
                  value={newAddress.propertySize}
                  onValueChange={(value) => onUpdateAddress({ propertySize: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sizeOptions.map((option) => (
                      <SelectItem key={option.code} value={option.code}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Property Size Range</Label>
                <Select
                  value={newAddress.propertySizeRange || undefined}
                  onValueChange={(value) => onUpdateAddress({ propertySizeRange: value })}
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
                  onValueChange={(value) => onUpdateAddress({ relationship: value })}
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
                <Input
                  value={newAddress.remarks || ""}
                  onChange={(event) => onUpdateAddress({ remarks: event.target.value })}
                  placeholder="Optional notes about this property"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onCancelForm}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={onAddAddress}
                disabled={
                  !newAddress.address ||
                  !newAddress.postalCode ||
                  !newAddress.propertySize ||
                  !newAddress.propertySizeRange ||
                  !newAddress.relationship ||
                  addingAddress
                }
              >
                {addingAddress && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Address
              </Button>
            </div>
          </div>
        )}

        {addresses.length === 0 && !showForm ? (
          <p className="text-muted-foreground text-center py-4">No addresses registered</p>
        ) : (
          addresses.length > 0 && (
            <div className="space-y-3">
              {addresses.map((address) => (
                <div key={address.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{address.address}</p>
                          <p className="text-sm text-muted-foreground">{address.postalCode}</p>
                        </div>
                      </div>
                      <div className="flex items-center flex-wrap gap-2">
                        {getPropertyTypeIcon(address.propertyType)}
                        <Badge variant="outline">{address.propertyType}</Badge>
                        <Badge variant="secondary">{address.propertySize.replace(/_/g, " ")}</Badge>
                        {address.propertySizeRange && (
                          <Badge variant="outline">{formatPropertySizeRange(address.propertySizeRange)}</Badge>
                        )}
                        {address.relationship && (
                          <Badge variant="secondary">{formatPropertyRelationship(address.relationship)}</Badge>
                        )}
                      </div>
                      {address.remarks && (
                        <p className="text-sm text-muted-foreground">{address.remarks}</p>
                      )}
                    </div>
                    <Badge variant={address.status === "ACTIVE" ? "success" : "secondary"}>
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
  )
}
