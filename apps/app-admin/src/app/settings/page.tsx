import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { prisma } from "@/lib/prisma"

import MasterSettingsPanel, {
  type ChecklistSummary,
  type MasterSettingsSectionKey,
  type PropertySummary,
  type UserSummary
} from "./master-settings-panel"

const masterSections: MasterSettingsSectionKey[] = [
  "user-settings",
  "master-data",
  "permission",
]

export default async function SettingsPage() {
  const [users, properties, checklists] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        confirmed: true,
      },
      orderBy: { username: "asc" },
    }),
    prisma.property.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        sizes: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.checklist.findMany({
      select: {
        id: true,
        name: true,
        propertyType: true,
        status: true,
      },
      orderBy: { name: "asc" },
    }),
  ])

  const userSummaries: UserSummary[] = users.map((user) => ({ ...user }))
  const propertySummaries: PropertySummary[] = properties.map((property) => ({
    ...property,
    sizes: property.sizes.map((size) => ({ ...size })),
  }))
  const checklistSummaries: ChecklistSummary[] = checklists.map((checklist) => ({
    ...checklist,
  }))

  return (
    <div className="space-y-6 bg-slate-50/60 p-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold leading-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure user settings, master data records, and workspace permissions.
            </p>
          </div>
        </div>
        <Badge variant="secondary">Admin access</Badge>
      </header>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Master Settings</CardTitle>
          <CardDescription>Core configuration areas that govern the entire workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <MasterSettingsPanel
            sections={masterSections}
            users={userSummaries}
            properties={propertySummaries}
            checklists={checklistSummaries}
          />
        </CardContent>
      </Card>
    </div>
  )
}
