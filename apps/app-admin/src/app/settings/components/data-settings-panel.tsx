"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { PropertySummary } from "../types"

const statusVariantMap: Record<PropertySummary["status"], "default" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "outline",
}

interface DataSettingsPanelProps {
  properties: PropertySummary[]
}

export function DataSettingsPanel({ properties }: DataSettingsPanelProps) {
  const router = useRouter()
  const [propertyList, setPropertyList] = useState<PropertySummary[]>(properties)
  const [selectedPropertyId, setSelectedPropertyId] = useState(() => properties[0]?.id ?? "")
  const [newPropertyName, setNewPropertyName] = useState("")
  const [newPropertyCode, setNewPropertyCode] = useState("")
  const [newSizeLabel, setNewSizeLabel] = useState("")
  const [sizeFeedback, setSizeFeedback] = useState<string | null>(null)
  const [sizePending, startSizeTransition] = useTransition()
  const [propertyFeedback, setPropertyFeedback] = useState<string | null>(null)
  const [propertyPending, startPropertyTransition] = useTransition()

  useEffect(() => {
    setPropertyList(properties)
    if (!properties.some((property) => property.id === selectedPropertyId)) {
      setSelectedPropertyId(properties[0]?.id ?? "")
    }
  }, [properties, selectedPropertyId])

  const activeProperty = useMemo(
    () => propertyList.find((property) => property.id === selectedPropertyId),
    [propertyList, selectedPropertyId]
  )
  const propertyCount = propertyList.length
  const hasProperties = propertyCount > 0

  const normalizedCode = (value: string) =>
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "")

  const handleAddPropertyType: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    if (propertyPending) return

    const name = newPropertyName.trim()
    const rawCode = newPropertyCode.trim()
    if (!name || !rawCode) {
      setPropertyFeedback("Display name and code are required")
      return
    }

    const code = normalizedCode(rawCode)
    if (!code) {
      setPropertyFeedback("Code must contain letters or numbers")
      return
    }

    setPropertyFeedback(null)

    startPropertyTransition(async () => {
      try {
        const response = await fetch("/api/properties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, code }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setPropertyFeedback(data.error || "Failed to add property type")
          return
        }

        const created: PropertySummary = await response.json()
        const enriched: PropertySummary = { ...created, sizes: [] }

        setPropertyList((prev) => [...prev, enriched].sort((a, b) => a.name.localeCompare(b.name)))
        setSelectedPropertyId(enriched.id)
        setNewPropertyName("")
        setNewPropertyCode("")
        setPropertyFeedback("Property type added")
        router.refresh()
      } catch (error) {
        console.error("Failed to add property type", error)
        setPropertyFeedback("Failed to add property type")
      }
    })
  }

  const handleDeleteProperty = (propertyId: string) => {
    if (propertyPending) return
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            "Delete this property type? Related size options will be archived."
          )
    if (!confirmed) return
    setPropertyFeedback(null)

    startPropertyTransition(async () => {
      try {
        const response = await fetch(`/api/properties/${propertyId}`, {
          method: "DELETE",
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setPropertyFeedback(data.error || "Failed to remove property type")
          return
        }

        let nextSelected = selectedPropertyId
        setPropertyList((prev) => {
          const next = prev.filter((property) => property.id !== propertyId)
          if (!next.some((property) => property.id === selectedPropertyId)) {
            nextSelected = next[0]?.id ?? ""
          }
          return next
        })
        if (nextSelected !== selectedPropertyId) {
          setSelectedPropertyId(nextSelected)
        }
        setPropertyFeedback("Property type removed")
        router.refresh()
      } catch (error) {
        console.error("Failed to remove property type", error)
        setPropertyFeedback("Failed to remove property type")
      }
    })
  }

  const handleAddSize = () => {
    if (!activeProperty || sizePending) return
    const label = newSizeLabel.trim()
    if (!label) {
      setSizeFeedback("Size label is required")
      return
    }

    const code = normalizedCode(label)
    if (!code) {
      setSizeFeedback("Size label must contain letters or numbers")
      return
    }

    setSizeFeedback(null)
    startSizeTransition(async () => {
      try {
        const response = await fetch("/api/property-sizes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyCode: activeProperty.code,
            code,
            name: label,
          }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setSizeFeedback(data.error || "Failed to add size option")
          return
        }

        const created = await response.json()
        setPropertyList((prev) =>
          prev.map((property) =>
            property.id === activeProperty.id
              ? {
                  ...property,
                  sizes: [...property.sizes, created].sort((a, b) => a.name.localeCompare(b.name)),
                }
              : property
          )
        )
        setNewSizeLabel("")
        setSizeFeedback("Size option added")
        router.refresh()
      } catch (error) {
        console.error("Failed to add size option", error)
        setSizeFeedback("Failed to add size option")
      }
    })
  }

  const handleRemoveSize = (sizeId: string) => {
    if (!activeProperty || sizePending) return
    const confirmed =
      typeof window === "undefined" ? true : window.confirm("Remove this size option?")
    if (!confirmed) return
    setSizeFeedback(null)

    startSizeTransition(async () => {
      try {
        const response = await fetch(`/api/property-sizes/${sizeId}`, {
          method: "DELETE",
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setSizeFeedback(data.error || "Failed to remove size option")
          return
        }

        setPropertyList((prev) =>
          prev.map((property) =>
            property.id === activeProperty.id
              ? {
                  ...property,
                  sizes: property.sizes.filter((size) => size.id !== sizeId),
                }
              : property
          )
        )
        setSizeFeedback("Size option removed")
        router.refresh()
      } catch (error) {
        console.error("Failed to remove size option", error)
        setSizeFeedback("Failed to remove size option")
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Property Catalogue</CardTitle>
              <CardDescription>Review existing property types and their status.</CardDescription>
            </div>
            <Badge variant="outline" className="font-medium">
              {propertyCount} type{propertyCount === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Property Types</p>
            {hasProperties ? (
              <ScrollArea className="h-[280px] rounded-lg border bg-muted/10 p-2">
                <div className="space-y-2">
                  {propertyList.map((property) => {
                    const isActive = selectedPropertyId === property.id
                    return (
                      <button
                        key={property.id}
                        type="button"
                        onClick={() => setSelectedPropertyId(property.id)}
                        className={cn(
                          "w-full rounded-md border bg-white p-3 text-left transition hover:border-primary hover:bg-primary/5",
                          isActive && "border-primary bg-primary/10"
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="truncate">
                            <p className="text-sm font-medium text-foreground truncate">{property.name}</p>
                            <p className="text-xs text-muted-foreground uppercase">{property.code}</p>
                          </div>
                          <Badge variant={statusVariantMap[property.status]} className="uppercase">
                            {property.status.toLowerCase()}
                          </Badge>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                No property types configured yet. Add one below to get started.
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Select a property type to update its size options or remove it from the catalogue.
            </p>
          </div>
          <div className="space-y-5">
            {activeProperty ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{activeProperty.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Code · <span className="font-medium">{activeProperty.code}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariantMap[activeProperty.status]} className="uppercase">
                      {activeProperty.status.toLowerCase()}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => handleDeleteProperty(activeProperty.id)}
                      disabled={propertyPending}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Size Options</p>
                  {activeProperty.sizes.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                      No size options configured for this property type yet.
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {activeProperty.sizes.map((size) => (
                        <div
                          key={size.id}
                          className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3 shadow-sm"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">{size.name}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">{size.code}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveSize(size.id)}
                            disabled={sizePending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border border-dashed bg-muted/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Plus className="h-4 w-4" />
                    Add Size Option
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[2fr_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <Label htmlFor="new-size-label">Label</Label>
                      <Input
                        id="new-size-label"
                        placeholder="e.g. 1200 sqft"
                        value={newSizeLabel}
                        onChange={(event) => setNewSizeLabel(event.target.value)}
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button size="sm" onClick={handleAddSize} disabled={sizePending}>
                        {sizePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        <span className="sr-only">Add size option</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setNewSizeLabel("")}
                        disabled={sizePending}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  {sizeFeedback && (
                    <p
                      className={cn(
                        "text-xs",
                        sizeFeedback.includes("Failed") ? "text-destructive" : "text-green-600"
                      )}
                    >
                      {sizeFeedback}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                Add a property type to begin managing its size options.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle>Add Property Type</CardTitle>
          <CardDescription>Create a new property type with a unique display name and code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleAddPropertyType}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-property-name">Display Name</Label>
                <Input
                  id="new-property-name"
                  placeholder="e.g. Industrial Warehouse"
                  value={newPropertyName}
                  onChange={(event) => setNewPropertyName(event.target.value)}
                  disabled={propertyPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-property-code">Code</Label>
                <Input
                  id="new-property-code"
                  placeholder="IW-01"
                  value={newPropertyCode}
                  onChange={(event) => setNewPropertyCode(event.target.value)}
                  disabled={propertyPending}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-property-notes">Internal Notes</Label>
              <Textarea
                id="new-property-notes"
                placeholder="Optional context or instructions for this property type."
                rows={3}
                disabled={propertyPending}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="gap-2" type="submit" disabled={propertyPending}>
                {propertyPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Property Type
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => {
                  setNewPropertyName("")
                  setNewPropertyCode("")
                  setPropertyFeedback(null)
                }}
                disabled={propertyPending}
              >
                Clear
              </Button>
            </div>
            {propertyFeedback && (
              <p
                className={cn(
                  "text-xs",
                  propertyFeedback.includes("Failed") ? "text-destructive" : "text-green-600"
                )}
              >
                {propertyFeedback}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
