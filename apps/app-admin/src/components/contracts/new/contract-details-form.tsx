"use client"

import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type {
  Customer,
  ContractReferenceOption,
  ContractType,
  MarketingSource,
} from "../types"

interface ContractDetailsFormProps {
  servicePackage: string
  contractType: ContractType
  marketingSource: MarketingSource
  value: string
  scheduledStartDate: string
  scheduledEndDate: string
  firstPaymentOn: string
  remarks: string
  availableReferences: ContractReferenceOption[]
  selectedReferenceIds: string[]
  selectedCustomer: Customer | null
  onServicePackageChange: (value: string) => void
  onContractTypeChange: (value: ContractType) => void
  onMarketingSourceChange: (value: MarketingSource) => void
  onValueChange: (value: string) => void
  onScheduledStartDateChange: (value: string) => void
  onScheduledEndDateChange: (value: string) => void
  onFirstPaymentOnChange: (value: string) => void
  onRemarksChange: (value: string) => void
  onReferenceIdsChange: (ids: string[]) => void
}

export function ContractDetailsForm({
  servicePackage,
  contractType,
  marketingSource,
  value,
  scheduledStartDate,
  scheduledEndDate,
  firstPaymentOn,
  remarks,
  availableReferences,
  selectedReferenceIds,
  selectedCustomer,
  onServicePackageChange,
  onContractTypeChange,
  onMarketingSourceChange,
  onValueChange,
  onScheduledStartDateChange,
  onScheduledEndDateChange,
  onFirstPaymentOnChange,
  onRemarksChange,
  onReferenceIdsChange,
}: ContractDetailsFormProps) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="servicePackage">Service Package</Label>
          <Input
            id="servicePackage"
            value={servicePackage}
            onChange={(event) => onServicePackageChange(event.target.value)}
            placeholder="e.g., Premium Inspection"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contractType">Contract Type</Label>
          <Select
            value={contractType}
            onValueChange={(value) => onContractTypeChange(value as ContractType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INSPECTION">Inspection</SelectItem>
              <SelectItem value="REPAIR">Repair</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Source of Marketing</Label>
          <Select
            value={marketingSource}
            onValueChange={(value) => onMarketingSourceChange(value as MarketingSource)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">Not specified</SelectItem>
              <SelectItem value="GOOGLE">Google</SelectItem>
              <SelectItem value="REFERRAL">Referral</SelectItem>
              <SelectItem value="OTHERS">Others</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="value">Contract Value (SGD) *</Label>
          <Input
            id="value"
            type="number"
            step="0.01"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="scheduledStartDate">Scheduled Start Date *</Label>
          <DatePicker
            value={scheduledStartDate}
            onChange={(date) =>
              onScheduledStartDateChange(date ? date.toISOString().split("T")[0] : "")
            }
            placeholder="Select start date"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="scheduledEndDate">Scheduled End Date</Label>
          <DatePicker
            value={scheduledEndDate}
            onChange={(date) =>
              onScheduledEndDateChange(date ? date.toISOString().split("T")[0] : "")
            }
            placeholder="Select end date"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="firstPaymentOn">First Payment Due</Label>
          <DatePicker
            value={firstPaymentOn}
            onChange={(date) =>
              onFirstPaymentOnChange(date ? date.toISOString().split("T")[0] : "")
            }
            placeholder="Select payment due date"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="remarks">Remarks</Label>
        <textarea
          id="remarks"
          className="w-full min-h-[80px] px-3 py-2 border rounded-md"
          value={remarks}
          onChange={(event) => onRemarksChange(event.target.value)}
          placeholder="Optional notes about this contract"
        />
      </div>

      {selectedCustomer && (
        <div className="space-y-2">
          <Label>Reference Contracts</Label>
          {availableReferences.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No existing contracts for this customer yet.
            </p>
          ) : (
            <>
              <select
                multiple
                value={selectedReferenceIds}
                onChange={(event) => {
                  const options = Array.from(event.target.selectedOptions)
                  onReferenceIdsChange(options.map((option) => option.value))
                }}
                className="w-full min-h-[120px] border rounded-md px-3 py-2"
              >
                {availableReferences.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Hold Ctrl/Cmd to select multiple contracts.
              </p>
            </>
          )}
        </div>
      )}
    </>
  )
}
