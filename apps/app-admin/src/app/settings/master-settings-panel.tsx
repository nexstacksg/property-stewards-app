"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, Database, UserCog, Plus, Trash2, Loader2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { Status } from "@prisma/client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export type UserSummary = {
  id: string
  username: string
  email: string
  confirmed: boolean
}

export type PropertySummary = {
  id: string
  code: string
  name: string
  status: Status
  sizes: Array<{
    id: string
    code: string
    name: string
    status: Status
  }>
}

export type MasterSettingsSectionKey =
  | "user-settings"
  | "data-settings"
  | "documentation"

export type MasterSettingsPanelProps = {
  sections: MasterSettingsSectionKey[]
  currentUser: UserSummary | null
  properties: PropertySummary[]
}

const SECTION_METADATA: Record<MasterSettingsSectionKey, {
  title: string
  description: string
  icon: LucideIcon
}> = {
  "user-settings": {
    title: "My Account",
    description: "Update your administrator email, username, and passwords.",
    icon: UserCog,
  },
  "data-settings": {
    title: "Data Settings",
    description: "Maintain property types and size options used across contracts.",
    icon: Database,
  },
  documentation: {
    title: "Workspace Documentation",
    description: "Review internal references that guide assistant and admin workflows.",
    icon: BookOpen,
  },
}

const statusVariantMap: Record<Status, "default" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "outline",
}

const documentationResources = [
  {
    title: "Property Inspector Assistant v0.2",
    description:
      "Architecture notes for Property Stewards' inspection assistant and the operational tooling that supports inspectors.",
    filePath: "apps/app-admin/docs/openai.md",
    url: "https://github.com/property-stewards-app/property-stewards-app/blob/main/apps/app-admin/docs/openai.md",
    highlights: [
      "Explains how the inspection assistant guides property teams through daily work using structured prompts and responses.",
      "Documents the four custom tools (getTodayJobs, selectJob, getJobLocations, completeTask) that keep inspections in sync with the platform.",
      "Outlines thread lifecycle management so chats retain context across runs and deployments.",
      "Lists required environment variables (OPENAI_API_KEY, TEST_INSPECTOR_PHONE, TEST_INSPECTOR_ID) for local and staging setups.",
    ],
  },
]

function DocumentationPanel() {
  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Internal References</CardTitle>
          <CardDescription>
            Key documents that outline how assistants integrate with inspection operations and the supporting infrastructure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {documentationResources.map((resource) => (
            <div
              key={resource.title}
              className="space-y-4 rounded-lg border bg-muted/10 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {resource.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {resource.description}
                  </p>
                </div>
                <Badge variant="outline">Markdown</Badge>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Highlights
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {resource.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">
                Document location:
                <span className="ml-1 font-mono text-[11px] text-foreground">{resource.filePath}</span>
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function UserAccountForm({ user }: { user: UserSummary | null }) {
  const [username, setUsername] = useState(user?.username ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [newPassword, setNewPassword] = useState("")

  if (!user) {
    return (
      <p className="text-sm text-muted-foreground">
        No administrator profile detected. Add an admin user first.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white/80 p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="account-username">Username</Label>
            <Input
              id="account-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              This name appears in audit logs and PDF exports.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-email">Email</Label>
            <Input
              id="account-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Used for login credentials and notification delivery.
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="account-password">New Password</Label>
            <Input
              id="account-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Generate a new password or leave blank"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button size="sm">Save Account Changes</Button>
          <Button size="sm" variant="outline">
            Send Password Reset Email
          </Button>
        </div>
      </div>
    </div>
  )
}

function DataSettingsPanel({ properties }: { properties: PropertySummary[] }) {
  const router = useRouter()
  const [propertyList, setPropertyList] = useState<PropertySummary[]>(properties)
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    () => properties[0]?.id ?? ""
  )
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
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '')

  const handleAddPropertyType: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    if (propertyPending) return

    const name = newPropertyName.trim()
    const rawCode = newPropertyCode.trim()
    if (!name || !rawCode) {
      setPropertyFeedback('Display name and code are required')
      return
    }

    const code = normalizedCode(rawCode)
    if (!code) {
      setPropertyFeedback('Code must contain letters or numbers')
      return
    }

    setPropertyFeedback(null)

    startPropertyTransition(async () => {
      try {
        const response = await fetch('/api/properties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, code })
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setPropertyFeedback(data.error || 'Failed to add property type')
          return
        }

        const created: PropertySummary = await response.json()
        const enriched: PropertySummary = { ...created, sizes: [] }

        setPropertyList((prev) =>
          [...prev, enriched].sort((a, b) => a.name.localeCompare(b.name))
        )
        setSelectedPropertyId(enriched.id)
        setNewPropertyName('')
        setNewPropertyCode('')
        setPropertyFeedback('Property type added')
        router.refresh()
      } catch (error) {
        console.error('Failed to add property type', error)
        setPropertyFeedback('Failed to add property type')
      }
    })
  }

  const handleDeleteProperty = (propertyId: string) => {
    if (propertyPending) return
    const confirmed = typeof window === 'undefined' ? true : window.confirm('Delete this property type? Related size options will be archived.')
    if (!confirmed) return
    setPropertyFeedback(null)

    startPropertyTransition(async () => {
      try {
        const response = await fetch(`/api/properties/${propertyId}`, {
          method: 'DELETE'
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setPropertyFeedback(data.error || 'Failed to remove property type')
          return
        }

        let nextSelected = selectedPropertyId
        setPropertyList((prev) => {
          const next = prev.filter((property) => property.id !== propertyId)
          if (!next.some((property) => property.id === selectedPropertyId)) {
            nextSelected = next[0]?.id ?? ''
          }
          return next
        })
        if (nextSelected !== selectedPropertyId) {
          setSelectedPropertyId(nextSelected)
        }
        setPropertyFeedback('Property type removed')
        router.refresh()
      } catch (error) {
        console.error('Failed to remove property type', error)
        setPropertyFeedback('Failed to remove property type')
      }
    })
  }

  const handleAddSize = () => {
    if (!activeProperty || sizePending) return
    const label = newSizeLabel.trim()
    if (!label) {
      setSizeFeedback('Size label is required')
      return
    }

    const code = normalizedCode(label)
    if (!code) {
      setSizeFeedback('Size label must contain letters or numbers')
      return
    }

    setSizeFeedback(null)
    startSizeTransition(async () => {
      try {
        const response = await fetch('/api/property-sizes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyCode: activeProperty.code,
            code,
            name: label,
          }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setSizeFeedback(data.error || 'Failed to add size option')
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
        setNewSizeLabel('')
        setSizeFeedback('Size option added')
        router.refresh()
      } catch (error) {
        console.error('Failed to add size option', error)
        setSizeFeedback('Failed to add size option')
      }
    })
  }

  const handleRemoveSize = (sizeId: string) => {
    if (!activeProperty || sizePending) return
    const confirmed = typeof window === 'undefined' ? true : window.confirm('Remove this size option?')
    if (!confirmed) return
    setSizeFeedback(null)

    startSizeTransition(async () => {
      try {
        const response = await fetch(`/api/property-sizes/${sizeId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          setSizeFeedback(data.error || 'Failed to remove size option')
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
        setSizeFeedback('Size option removed')
        router.refresh()
      } catch (error) {
        console.error('Failed to remove size option', error)
        setSizeFeedback('Failed to remove size option')
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
                            <p className="text-sm font-medium text-foreground truncate">
                              {property.name}
                            </p>
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
                    <h3 className="text-lg font-semibold text-foreground">
                      {activeProperty.name}
                    </h3>
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
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Size Options
                  </p>
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
                      <Button size="sm" variant="outline" onClick={() => setNewSizeLabel("")} disabled={sizePending}>
                        Clear
                      </Button>
                    </div>
                  </div>
                  {sizeFeedback && (
                    <p className={cn('text-xs', sizeFeedback.includes('Failed') ? 'text-destructive' : 'text-green-600')}>
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
              <p className={cn('text-xs', propertyFeedback.includes('Failed') ? 'text-destructive' : 'text-green-600')}>
                {propertyFeedback}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function MasterSettingsPanel({
  sections,
  currentUser,
  properties,
}: MasterSettingsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const toggleSection = (key: string) => {
    setExpandedSections((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const renderSectionContent = (key: MasterSettingsSectionKey) => {
    switch (key) {
      case "user-settings":
        return <UserAccountForm user={currentUser} />
      case "data-settings":
        return <DataSettingsPanel properties={properties} />
      case "documentation":
        return <DocumentationPanel />
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {sections.map((sectionKey) => {
        const config = SECTION_METADATA[sectionKey]
        const Icon = config.icon
        const isOpen = expandedSections[sectionKey] ?? false

        return (
          <div
            key={sectionKey}
            className="rounded-lg border bg-white/90 p-4 shadow-sm transition"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <Icon className="mt-1 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {config.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {config.description}
                  </p>
                </div>
              </div>
              <Button
                variant={isOpen ? "secondary" : "outline"}
                size="sm"
                onClick={() => toggleSection(sectionKey)}
                aria-expanded={isOpen}
              >
                {isOpen ? "Close" : "Manage"}
              </Button>
            </div>
            {isOpen && (
              <div className="mt-4 border-t pt-4">
                {renderSectionContent(sectionKey)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
