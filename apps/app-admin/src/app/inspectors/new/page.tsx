"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, X, Loader2 } from "lucide-react"
import { PhoneInput } from "@/components/ui/phone-input"

const SPECIALIZATIONS = [
  "HDB",
  "CONDO",
  "EC",
  "APARTMENT",
  "LANDED",
  "COMMERCIAL",
  "INDUSTRIAL"
]

export default function NewInspectorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  
  // Form fields
  const [name, setName] = useState("")
  const [mobilePhone, setMobilePhone] = useState("")
  const [type, setType] = useState<string>("FULL_TIME")
  const [specialization, setSpecialization] = useState<string[]>([])
  const [remarks, setRemarks] = useState("")
  
  // Specialization selection
  const [selectedSpec, setSelectedSpec] = useState("")

  const addSpecialization = () => {
    console.log('Adding specialization:', selectedSpec, 'to current:', specialization)
    if (selectedSpec && !specialization.includes(selectedSpec)) {
      const newSpecializations = [...specialization, selectedSpec]
      console.log('New specializations:', newSpecializations)
      setSpecialization(newSpecializations)
      setSelectedSpec("")
    }
  }

  const removeSpecialization = (spec: string) => {
    setSpecialization(specialization.filter(s => s !== spec))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    console.log('Submitting inspector with specialization:', specialization)

    try {
      const response = await fetch("/api/inspectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mobilePhone,
          type,
          specialization,
          remarks
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create inspector")
      }

      const inspector = await response.json()
      router.push(`/inspectors/${inspector.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/inspectors">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">New Inspector</h1>
          <p className="text-muted-foreground mt-1">Add a new inspector to the system</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Inspector Information</CardTitle>
              <CardDescription>Enter the inspector's details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md">
                  {error}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mobilePhone">Mobile Phone *</Label>
                  <PhoneInput
                    value={mobilePhone}
                    onChange={setMobilePhone}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Type *</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL_TIME">Full Time</SelectItem>
                      <SelectItem value="PART_TIME">Part Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Specialization</Label>
                  <div className="flex gap-2">
                    <Select value={selectedSpec} onValueChange={setSelectedSpec}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select specialization" />
                      </SelectTrigger>
                      <SelectContent>
                        {SPECIALIZATIONS.map(spec => (
                          <SelectItem 
                            key={spec} 
                            value={spec}
                            disabled={specialization.includes(spec)}
                          >
                            {spec}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addSpecialization}
                      disabled={!selectedSpec}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  {specialization.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {specialization.map(spec => (
                        <Badge 
                          key={spec}
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() => removeSpecialization(spec)}
                        >
                          {spec}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="remarks">Remarks</Label>
                  <textarea
                    id="remarks"
                    className="w-full min-h-[80px] px-3 py-2 border rounded-md"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Optional notes about this inspector"
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-2 pt-4">
                <Button
                  type="submit"
                  disabled={loading}
                >
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Inspector
                </Button>
                <Link href="/inspectors">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  )
}