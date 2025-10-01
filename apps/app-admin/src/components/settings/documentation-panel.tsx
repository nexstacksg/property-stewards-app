"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

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

export function DocumentationPanel() {
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
            <div key={resource.title} className="space-y-4 rounded-lg border bg-muted/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{resource.title}</h3>
                  <p className="text-sm text-muted-foreground">{resource.description}</p>
                </div>
                <Badge variant="outline">Markdown</Badge>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Highlights</p>
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
