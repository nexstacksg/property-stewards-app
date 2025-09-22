"use client"

import { useMemo, useState } from "react"
import { Database, Shield, Users } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { PropertyType, Role, Status } from "@prisma/client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type UserSummary = {
  id: string
  username: string
  email: string
  role: Role
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

export type ChecklistSummary = {
  id: string
  name: string
  propertyType: PropertyType
  status: Status
}

export type MasterSettingsSectionKey =
  | "user-settings"
  | "master-data"
  | "permission"

export type MasterSettingsPanelProps = {
  sections: MasterSettingsSectionKey[]
  users: UserSummary[]
  properties: PropertySummary[]
  checklists: ChecklistSummary[]
}

const SECTION_METADATA: Record<MasterSettingsSectionKey, {
  title: string
  description: string
  icon: LucideIcon
}> = {
  "user-settings": {
    title: "User Settings",
    description: "Manage administrator accounts, profiles, and authentication.",
    icon: Users,
  },
  "master-data": {
    title: "Master Data CRUD",
    description: "Configure master records such as properties, clients, and asset catalogs.",
    icon: Database,
  },
  permission: {
    title: "Permission",
    description: "Define roles, access policies, and workspace-level guardrails.",
    icon: Shield,
  },
}

const statusVariantMap: Record<Status, "default" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "outline",
}

function UserSettingsForm({ users }: { users: UserSummary[] }) {
  if (!users.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No admin users found. Create a user to get started.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {users.map((user) => (
        <div
          key={user.id}
          className="space-y-4 rounded-lg border bg-white/80 p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{user.username}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Badge variant={user.confirmed ? "default" : "outline"}>
              {user.confirmed ? "Confirmed" : "Pending"}
            </Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`username-${user.id}`}>Username</Label>
              <Input
                id={`username-${user.id}`}
                defaultValue={user.username}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`email-${user.id}`}>Email</Label>
              <Input id={`email-${user.id}`} defaultValue={user.email} type="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`role-${user.id}`}>Role</Label>
              <Select defaultValue={user.role}>
                <SelectTrigger id={`role-${user.id}`}>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`password-${user.id}`}>Reset Password</Label>
              <Input
                id={`password-${user.id}`}
                placeholder="Generate new password"
                type="password"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Save Changes</Button>
            <Button size="sm" variant="outline">
              Send password reset email
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function MasterDataForm({
  properties,
  checklists,
}: {
  properties: PropertySummary[]
  checklists: ChecklistSummary[]
}) {
  const [selectedPropertyId, setSelectedPropertyId] = useState(
    () => properties[0]?.id ?? ""
  )
  const [selectedChecklistId, setSelectedChecklistId] = useState(
    () => checklists[0]?.id ?? ""
  )

  const activeProperty = useMemo(
    () => properties.find((property) => property.id === selectedPropertyId),
    [properties, selectedPropertyId]
  )
  const activeChecklist = useMemo(
    () => checklists.find((item) => item.id === selectedChecklistId),
    [checklists, selectedChecklistId]
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="property-select">Property Type</Label>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger id="property-select">
              <SelectValue placeholder="Select property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name} ({property.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="checklist-select">Checklist Template</Label>
          <Select value={selectedChecklistId} onValueChange={setSelectedChecklistId}>
            <SelectTrigger id="checklist-select">
              <SelectValue placeholder="Select checklist" />
            </SelectTrigger>
            <SelectContent>
              {checklists.map((checklist) => (
                <SelectItem key={checklist.id} value={checklist.id}>
                  {checklist.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {activeProperty ? (
        <div className="space-y-3 rounded-lg border bg-white/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {activeProperty.name} sizes
            </p>
            <Badge variant={statusVariantMap[activeProperty.status]}>
              {activeProperty.status.toLowerCase()}
            </Badge>
          </div>
          {activeProperty.sizes.length ? (
            <div className="flex flex-wrap gap-2">
              {activeProperty.sizes.map((size) => (
                <Badge
                  key={size.id}
                  variant={statusVariantMap[size.status]}
                  className="uppercase"
                >
                  {size.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No size options configured yet.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a property type to view available sizes.
        </p>
      )}

      {activeChecklist ? (
        <div className="space-y-2 rounded-lg border bg-white/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {activeChecklist.name}
            </p>
            <Badge variant="outline">{activeChecklist.propertyType}</Badge>
            <Badge variant={activeChecklist.status === "ACTIVE" ? "default" : "outline"}>
              {activeChecklist.status.toLowerCase()}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="checklist-name">Update name</Label>
              <Input id="checklist-name" defaultValue={activeChecklist.name} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="checklist-property">Property type</Label>
              <Input
                id="checklist-property"
                value={activeChecklist.propertyType}
                disabled
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Save Checklist</Button>
            <Button size="sm" variant="outline">
              Duplicate Template
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a checklist template to review its details.
        </p>
      )}
    </div>
  )
}

function PermissionForm({ users }: { users: UserSummary[] }) {
  const [roleDrafts, setRoleDrafts] = useState<Record<string, Role>>(() =>
    users.reduce<Record<string, Role>>((acc, user) => {
      acc[user.id] = user.role
      return acc
    }, {})
  )

  const availableRoles = useMemo(() => {
    const roles = new Set<Role>(users.map((user) => user.role))
    // Ensure ADMIN is always present while schema evolves
    roles.add("ADMIN")
    return Array.from(roles)
  }, [users])

  if (!users.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Role assignments will appear here once users are added.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="w-[160px]">Role</TableHead>
            <TableHead className="w-[120px] text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.username}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Select
                  value={roleDrafts[user.id]}
                  onValueChange={(value) =>
                    setRoleDrafts((draft) => ({
                      ...draft,
                      [user.id]: value as Role,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={user.confirmed ? "default" : "outline"}>
                  {user.confirmed ? "Active" : "Pending"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline">
          Discard Draft
        </Button>
        <Button size="sm">Apply Roles</Button>
      </div>
    </div>
  )
}

export default function MasterSettingsPanel({
  sections,
  users,
  properties,
  checklists,
}: MasterSettingsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const toggleSection = (key: string) => {
    setExpandedSections((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  const renderSectionContent = (key: string) => {
    switch (key) {
      case "user-settings":
        return <UserSettingsForm users={users} />
      case "master-data":
        return (
          <MasterDataForm
            properties={properties}
            checklists={checklists}
          />
        )
      case "permission":
        return <PermissionForm users={users} />
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
