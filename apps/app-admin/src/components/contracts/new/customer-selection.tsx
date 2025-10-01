"use client"

import { Loader2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Customer } from "../types"

interface CustomerSelectionProps {
  selectedCustomer: Customer | null
  customers: Customer[]
  searchTerm: string
  searching: boolean
  addressId: string
  onSearchTermChange: (term: string) => void
  onSelectCustomer: (customer: Customer) => void
  onResetCustomer: () => void
  onAddressChange: (addressId: string) => void
}

export function CustomerSelection({
  selectedCustomer,
  customers,
  searchTerm,
  searching,
  addressId,
  onSearchTermChange,
  onSelectCustomer,
  onResetCustomer,
  onAddressChange,
}: CustomerSelectionProps) {
  if (!selectedCustomer) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Search Customer *</Label>
          <div className="relative">
            <Input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Start typing to search by name, email, or phone"
              className="pr-10"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : searchTerm ? (
                <Search className="h-4 w-4 text-muted-foreground" />
              ) : null}
            </div>
          </div>
        </div>

        {customers.length > 0 && (
          <div className="border rounded-lg divide-y">
            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="w-full p-3 text-left hover:bg-accent"
                onClick={() => onSelectCustomer(customer)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {customer.email} • {customer.phone}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {customer.addresses.length} address(es)
                    </p>
                  </div>
                  <Badge variant="outline">{customer.type}</Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const activeAddresses = selectedCustomer.addresses.filter((address) => address.status === "ACTIVE")

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-accent/50">
        <div className="flex justify-between items-start">
          <div>
            <Label className="text-xs">Selected Customer</Label>
            <p className="font-medium">{selectedCustomer.name}</p>
            <p className="text-sm text-muted-foreground">
              {selectedCustomer.email} • {selectedCustomer.phone}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onResetCustomer}>
            Change
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Property Address *</Label>
        <Select value={addressId} onValueChange={onAddressChange} required>
          <SelectTrigger>
            <SelectValue placeholder="Select property address" />
          </SelectTrigger>
          <SelectContent>
            {activeAddresses.map((address) => (
              <SelectItem key={address.id} value={address.id}>
                {address.address} - {address.postalCode} ({address.propertyType})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
