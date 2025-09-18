"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Loader2 } from "lucide-react"
import { PhoneInput } from "@/components/ui/phone-input"

export default function NewInspectorPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  
  // Form fields
  const [name, setName] = useState("")
  const [mobilePhone, setMobilePhone] = useState("")
  const [type, setType] = useState<string>("FULL_TIME")
  const [specialization, setSpecialization] = useState("")
  const [remarks, setRemarks] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

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
