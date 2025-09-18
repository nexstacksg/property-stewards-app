"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { PhoneInput } from "@/components/ui/phone-input"

interface Inspector {
  id: string
  name: string
  mobilePhone: string
  type: string
  specialization: string | null
  remarks?: string
  status: string
}

export default function EditInspectorPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [inspectorId, setInspectorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  
  // Form fields
  const [name, setName] = useState("")
  const [mobilePhone, setMobilePhone] = useState("")
  const [type, setType] = useState<string>("EMPLOYEE")
  const [specialization, setSpecialization] = useState("")
  const [remarks, setRemarks] = useState("")
  const [status, setStatus] = useState("ACTIVE")

  useEffect(() => {
    const loadInspector = async () => {
      const resolvedParams = await params
      setInspectorId(resolvedParams.id)
      await fetchInspector(resolvedParams.id)
    }
    loadInspector()
  }, [params])

  const fetchInspector = async (id: string) => {
    try {
      const response = await fetch(`/api/inspectors/${id}`)
      if (!response.ok) throw new Error("Failed to fetch inspector")
      
      const inspector: Inspector = await response.json()
      
      setName(inspector.name)
      setMobilePhone(inspector.mobilePhone)
      setType(inspector.type)
      setSpecialization(
        Array.isArray(inspector.specialization)
          ? inspector.specialization.join(', ')
          : inspector.specialization || ""
      )
      setRemarks(inspector.remarks || "")
      setStatus(inspector.status)
      
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inspector")
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inspectorId) return
    
    setError("")
    setSaving(true)

    try {
      const response = await fetch(`/api/inspectors/${inspectorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mobilePhone,
          type,
          specialization,
          remarks,
          status
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update inspector")
      }

      router.push(`/inspectors/${inspectorId}`)
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
        <Link href={inspectorId ? `/inspectors/${inspectorId}` : "/inspectors"}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Inspector</h1>
          <p className="text-muted-foreground mt-1">Update inspector information</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Inspector Information</CardTitle>
              <CardDescription>Update the inspector's details</CardDescription>
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
                  <Label htmlFor="specialization">Specialization</Label>
                  <Input
                    id="specialization"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    placeholder="e.g., Electrical Safety"
                  />
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
                  disabled={saving}
                >
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
                <Link href={inspectorId ? `/inspectors/${inspectorId}` : "/inspectors"}>
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
