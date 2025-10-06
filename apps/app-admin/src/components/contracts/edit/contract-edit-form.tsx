"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/ui/date-picker"
import type {
  ContractAddressSummary,
  ContractCustomerSummary,
  ContractReferenceOption,
  ContractStatus,
  ContractType,
  MarketingSource,
} from "@/components/contracts/types"

interface ContractEditFormProps {
  error: string
  customer: ContractCustomerSummary | null
  address: ContractAddressSummary | null
  value: string
  onValueChange: (value: string) => void
  servicePackage: string
  onServicePackageChange: (value: string) => void
  contractType: ContractType
  onContractTypeChange: (value: ContractType) => void
  marketingSource: MarketingSource
  onMarketingSourceChange: (value: MarketingSource) => void
  status: ContractStatus
  onStatusChange: (value: ContractStatus) => void
  scheduledStartDate: string
  onScheduledStartDateChange: (value: string) => void
  scheduledEndDate: string
  onScheduledEndDateChange: (value: string) => void
  actualStartDate: string
  onActualStartDateChange: (value: string) => void
  actualEndDate: string
  onActualEndDateChange: (value: string) => void
  firstPaymentOn: string
  onFirstPaymentOnChange: (value: string) => void
  finalPaymentOn: string
  onFinalPaymentOnChange: (value: string) => void
  remarks: string
  onRemarksChange: (value: string) => void
  availableReferences: ContractReferenceOption[]
  selectedReferenceIds: string[]
  onReferenceIdsChange: (ids: string[]) => void
}

const STATUS_OPTIONS: ContractStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "SCHEDULED",
  "COMPLETED",
  "TERMINATED",
  "CANCELLED",
]

export function ContractEditForm({
  error,
  customer,
  address,
  value,
  onValueChange,
  servicePackage,
  onServicePackageChange,
  contractType,
  onContractTypeChange,
  marketingSource,
  onMarketingSourceChange,
  status,
  onStatusChange,
  scheduledStartDate,
  onScheduledStartDateChange,
  scheduledEndDate,
  onScheduledEndDateChange,
  actualStartDate,
  onActualStartDateChange,
  actualEndDate,
  onActualEndDateChange,
  firstPaymentOn,
  onFirstPaymentOnChange,
  finalPaymentOn,
  onFinalPaymentOnChange,
  remarks,
  onRemarksChange,
  availableReferences,
  selectedReferenceIds,
  onReferenceIdsChange,
}: ContractEditFormProps) {
  const formatPropertyDetails = () => {
    if (!address) return ""
    const parts = [
      address.postalCode,
      address.propertyType,
      address.propertySize.replace(/_/g, " "),
    ]
    if (address.propertySizeRange) {
      parts.push(address.propertySizeRange.replace(/_/g, " "))
    }
    if (address.relationship) {
      const formatted = address.relationship
        .toLowerCase()
        .replace(/(^|\s)[a-z]/g, (char) => char.toUpperCase())
      parts.push(formatted)
    }
    return parts.filter(Boolean).join(" • ")
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="border rounded-lg p-4 bg-accent/50">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Customer</Label>
            <p className="font-medium">{customer?.name}</p>
            <p className="text-sm text-muted-foreground">
              {customer?.email} • {customer?.phone}
            </p>
          </div>
          <div>
            <Label className="text-xs">Property Address</Label>
            <p className="font-medium">{address?.address}</p>
            <p className="text-sm text-muted-foreground">{formatPropertyDetails()}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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
          <Select value={contractType} onValueChange={(value) => onContractTypeChange(value as ContractType)}>
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
          <Label htmlFor="status">Status *</Label>
          <Select value={status} onValueChange={(value) => onStatusChange(value as ContractStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option.charAt(0) + option.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Label htmlFor="scheduledEndDate">Scheduled End Date *</Label>
          <DatePicker
            value={scheduledEndDate}
            onChange={(date) =>
              onScheduledEndDateChange(date ? date.toISOString().split("T")[0] : "")
            }
            placeholder="Select end date"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="actualStartDate">Actual Start Date</Label>
          <DatePicker
            value={actualStartDate}
            onChange={(date) =>
              onActualStartDateChange(date ? date.toISOString().split("T")[0] : "")
            }
            placeholder="Select actual start date"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="actualEndDate">Actual End Date</Label>
          <DatePicker
            value={actualEndDate}
            onChange={(date) =>
              onActualEndDateChange(date ? date.toISOString().split("T")[0] : "")
            }
            placeholder="Select actual end date"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="firstPaymentOn">First Payment Due *</Label>
          <DatePicker
            value={firstPaymentOn}
            onChange={(date) =>
              onFirstPaymentOnChange(date ? date.toISOString().split("T")[0] : "")
            }
            placeholder="Select first payment date"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="finalPaymentOn">Final Payment Due</Label>
          <DatePicker
            value={finalPaymentOn}
            onChange={(date) =>
              onFinalPaymentOnChange(date ? date.toISOString().split("T")[0] : "")
            }
            placeholder="Select final payment date"
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

      {customer && (
        <div className="space-y-2">
          <Label>Reference Contracts</Label>
          {availableReferences.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other contracts for this customer.</p>
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
    </div>
  )
}
