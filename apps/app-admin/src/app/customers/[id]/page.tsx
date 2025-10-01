"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { DEFAULT_PROPERTY_RELATIONSHIP, DEFAULT_PROPERTY_SIZE_RANGE } from "@/lib/property-address"
import { CustomerAddressSection } from "@/components/customers/customer-address-section"
import { CustomerContractsCard } from "@/components/customers/customer-contracts-card"
import { CustomerHeader } from "@/components/customers/customer-header"
import { CustomerInfoCard } from "@/components/customers/customer-info-card"
import { CustomerMembershipCard } from "@/components/customers/customer-membership-card"
import { CustomerStatsRow } from "@/components/customers/customer-stats-row"
import { CustomerRecord, NewCustomerAddress } from "@/types/customer"

const INITIAL_ADDRESS: NewCustomerAddress = {
  address: "",
  postalCode: "",
  propertyType: "HDB",
  propertySize: "HDB_3_ROOM",
  propertySizeRange: DEFAULT_PROPERTY_SIZE_RANGE,
  relationship: DEFAULT_PROPERTY_RELATIONSHIP,
  remarks: "",
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [customerId, setCustomerId] = useState<string>("")
  const [customer, setCustomer] = useState<CustomerRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [addingAddress, setAddingAddress] = useState(false)
  const [newAddress, setNewAddress] = useState<NewCustomerAddress>(INITIAL_ADDRESS)
  const [sizeOptions, setSizeOptions] = useState<Array<{ code: string; name: string }>>([])

  useEffect(() => {
    params.then((p) => setCustomerId(p.id))
  }, [params])

  useEffect(() => {
    const loadSizes = async () => {
      try {
        if (!newAddress.propertyType) {
          setSizeOptions([])
          return
        }
        const res = await fetch(`/api/property-sizes?type=${encodeURIComponent(newAddress.propertyType)}`)
        if (!res.ok) return
        const data = await res.json()
        const mapped = Array.isArray(data) ? data.map((item: any) => ({ code: item.code, name: item.name })) : []
        setSizeOptions(mapped)
        if (mapped.length > 0) {
          setNewAddress((prev) => ({ ...prev, propertySize: mapped[0].code }))
        } else {
          setNewAddress((prev) => ({ ...prev, propertySize: "" }))
        }
      } catch (error) {
        console.error("Failed to load property sizes", error)
      }
    }

    if (showAddressForm) {
      loadSizes()
    }
  }, [newAddress.propertyType, showAddressForm])

  useEffect(() => {
    if (!customerId) return

    const fetchCustomer = async () => {
      try {
        const response = await fetch(`/api/customers/${customerId}`)
        if (!response.ok) {
          throw new Error("Customer not found")
        }
        const data: CustomerRecord = await response.json()
        setCustomer(data)
      } catch (error) {
        console.error("Error fetching customer:", error)
        router.push("/customers")
      } finally {
        setLoading(false)
      }
    }

    fetchCustomer()
  }, [customerId, router])

  const handleAddressChange = (updates: Partial<NewCustomerAddress>) => {
    setNewAddress((prev) => ({ ...prev, ...updates }))
  }

  const handleCancelAddressForm = () => {
    setShowAddressForm(false)
    setNewAddress(INITIAL_ADDRESS)
  }

  const addAddress = async () => {
    if (
      !newAddress.address ||
      !newAddress.postalCode ||
      !newAddress.propertySize ||
      !newAddress.propertySizeRange ||
      !newAddress.relationship
    ) {
      return
    }

    setAddingAddress(true)
    try {
      const response = await fetch(`/api/customers/${customerId}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAddress),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to add address")
      }

      setNewAddress(INITIAL_ADDRESS)
      setShowAddressForm(false)

      const refreshed = await fetch(`/api/customers/${customerId}`)
      if (refreshed.ok) {
        const data: CustomerRecord = await refreshed.json()
        setCustomer(data)
      }
    } catch (error) {
      console.error("Error adding address:", error)
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
      <CustomerHeader customer={customer} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <CustomerInfoCard customer={customer} />
          <CustomerMembershipCard customer={customer} />
        </div>

        <div className="lg:col-span-2 space-y-6">
          <CustomerAddressSection
            addresses={customer.addresses}
            showForm={showAddressForm}
            onShowForm={() => setShowAddressForm(true)}
            onCancelForm={handleCancelAddressForm}
            newAddress={newAddress}
            onUpdateAddress={handleAddressChange}
            sizeOptions={sizeOptions}
            addingAddress={addingAddress}
            onAddAddress={addAddress}
          />

          <CustomerContractsCard contracts={customer.contracts} />

          <CustomerStatsRow customer={customer} />
        </div>
      </div>
    </div>
  )
}
