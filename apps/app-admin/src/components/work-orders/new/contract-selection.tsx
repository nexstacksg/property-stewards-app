"use client"

import { Loader2, Search, User, MapPin } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Contract } from "./types"

interface ContractSelectionProps {
  contracts: Contract[]
  selectedContract: Contract | null
  searchTerm: string
  searching: boolean
  onSearchTermChange: (term: string) => void
  onSelectContract: (contract: Contract) => void
  onResetContract: () => void
}

export function ContractSelection({
  contracts,
  selectedContract,
  searchTerm,
  searching,
  onSearchTermChange,
  onSelectContract,
  onResetContract
}: ContractSelectionProps) {
  if (selectedContract) {
    return (
      <div className="space-y-4">
        <div className="border rounded-lg p-4 bg-accent/50">
          <div className="flex justify-between items-start">
            <div>
              <Label className="text-xs">Selected Contract</Label>
              <p className="font-medium">
                Contract #{selectedContract.id }
              </p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-3 w-3" />
                  <span>{selectedContract.customer.name}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-3 w-3 mt-0.5" />
                  <span>
                    {selectedContract.address.address}, {selectedContract.address.postalCode}
                  </span>
                </div>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onResetContract}>
              Change
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const contractStatusVariant = (status: string) => {
    if (status === "CONFIRMED") return "secondary" as const
    if (status === "SCHEDULED") return "default" as const
    return "outline" as const
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Select Contract *</Label>
        <div className="relative">
          <Input
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Start typing to search by customer name or contract ID"
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
        <p className="text-xs text-muted-foreground">
          Showing contracts with CONFIRMED status that need work orders
        </p>
      </div>

      {searching && contracts.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
          Loading available contracts...
        </div>
      ) : contracts.length > 0 ? (
        <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
          {contracts.map((contract) => (
            <button
              key={contract.id}
              type="button"
              className="w-full text-left p-3 hover:bg-accent"
              onClick={() => onSelectContract(contract)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">
                    Contract #{contract.id }
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {contract.customer.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {contract.address.address}, {contract.address.postalCode}
                  </p>
                </div>
                <Badge variant={contractStatusVariant(contract.status)}>
                  {contract.status}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-muted-foreground">
          No contracts available for work orders.
          <br />
          <span className="text-xs">Contracts must be in CONFIRMED status to create work orders.</span>
        </div>
      )}
    </div>
  )
}
