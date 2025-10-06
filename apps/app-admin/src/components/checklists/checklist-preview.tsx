"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type ChecklistPreviewTask = {
  name: string
  details: string
}

export type ChecklistPreviewLocation = {
  location: string
  category: string
  isRequired: boolean
  order: number
  tasks: ChecklistPreviewTask[]
}

type Props = {
  locations: ChecklistPreviewLocation[]
  draftLocation?: ChecklistPreviewLocation
}

export function ChecklistPreview({ locations, draftLocation }: Props) {
  const draft = draftLocation && draftLocation.location.trim().length > 0
    ? [{
        ...draftLocation,
        order: locations.length + 1,
      }]
    : []

  const previewLocations = [...locations, ...draft].filter(
    (location) => location.location.trim().length > 0,
  )

  if (previewLocations.length === 0) return null

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-sm">Checklist Preview</CardTitle>
        <CardDescription className="text-xs">
          Inspectors will see locations and tasks in this order
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {previewLocations.map((location) => {
          const sanitizedTasks = location.tasks
            .map((task) => ({
              name: task.name.trim(),
              details: task.details.trim(),
            }))
            .filter((task) => task.name.length > 0 || task.details.length > 0)

          return (
            <div
              key={`${location.location}-${location.order}`}
              className="space-y-2"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {location.order}. {location.location}
                  {location.isRequired && (
                    <span className="text-red-500 ml-1" title="Required">
                      *
                    </span>
                  )}
                </p>
                <span className="text-xs text-muted-foreground">
                  {location.category}
                </span>
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {sanitizedTasks.length === 0 ? (
                  <li>No tasks configured</li>
                ) : (
                  sanitizedTasks.map((task, index) => (
                    <li key={`${location.location}-task-${index}`}>
                      <span className="font-medium text-muted-foreground">
                        {task.name}
                      </span>
                      {task.details && ` — ${task.details}`}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )
        })}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Total: {previewLocations.length} location
            {previewLocations.length === 1 ? "" : "s"}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
