"use client"

import { useState } from "react"
import { BookOpen, Database, UserCog } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

import { DocumentationPanel } from "./components/documentation-panel"
import { DataSettingsPanel } from "./components/data-settings-panel"
import { UserAccountForm } from "./components/user-account-form"
import type {
  MasterSettingsPanelProps,
  MasterSettingsSectionKey,
} from "./types"

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
