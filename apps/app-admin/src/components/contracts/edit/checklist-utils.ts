"use client"

import { parseActionIntoTasks } from "@/lib/utils/taskParser"
import type { ChecklistDraftItem, ChecklistTemplate } from "@/components/contracts/types"

export const CATEGORIES = [
  "GENERAL",
  "ELECTRICAL",
  "PLUMBING",
  "STRUCTURAL",
  "SAFETY",
  "EXTERIOR",
  "INTERIOR",
  "APPLIANCES",
] as const

export const DEFAULT_CATEGORY = "GENERAL"

export const createEmptyTask = () => ({ name: "", details: "" })

export const createEmptyLocation = (order: number): ChecklistDraftItem => ({
  item: "",
  description: "",
  category: DEFAULT_CATEGORY,
  isRequired: true,
  order,
  tasks: [],
})

export const sanitiseTasks = (tasks: NonNullable<ChecklistDraftItem["tasks"]>) =>
  tasks
    .map((task) => ({
      ...task,
      name: (task.name || "").trim(),
      details: (task.details || "").trim(),
    }))
    .filter((task) => task.name.length > 0 || task.details.length > 0)

export const buildActionFromTasks = (tasks: NonNullable<ChecklistDraftItem["tasks"]>) =>
  tasks
    .map((task) => {
      const name = task.name.trim()
      const details = task.details.trim()
      if (!name) return details
      return details ? `${name}: ${details}` : name
    })
    .filter((entry) => entry.length > 0)
    .join("; ")

export const parseActionToTasks = (action?: string | null) => {
  if (!action) return [] as NonNullable<ChecklistDraftItem["tasks"]>
  const parsed = parseActionIntoTasks(action)
  return parsed
    .map((task) => task.task.trim())
    .filter((name) => name.length > 0 && name.toLowerCase() !== "others")
    .map((name) => ({ name, details: "" }))
}

export const extractActionTasksFromItem = (item: any): NonNullable<ChecklistDraftItem["tasks"]> => {
  const locationEntries = Array.isArray(item?.locations)
    ? item.locations
        .map((location: any) => {
          const name = typeof location?.name === "string" ? location.name.trim() : ""
          const subtaskNames = Array.isArray(location?.tasks)
            ? location.tasks
                .map((task: any) => (typeof task?.name === "string" ? task.name.trim() : ""))
                .filter((entry: string) => entry.length > 0)
            : []

          return {
            name,
            details: subtaskNames.join(", "),
          }
        })
        .filter((entry: { name: string; details: string }) => entry.name.length > 0 || entry.details.length > 0)
    : []

  const tasksFromLocations = sanitiseTasks(locationEntries)
  if (tasksFromLocations.length > 0) {
    return tasksFromLocations
  }

  if (Array.isArray(item?.checklistTasks) && item.checklistTasks.length > 0) {
    const grouped = new Map<string, string[]>()

    for (const rawTask of item.checklistTasks) {
      const subtaskName = typeof rawTask?.name === "string" ? rawTask.name.trim() : ""
      if (!subtaskName) continue
      const locationName = typeof rawTask?.location?.name === "string"
        ? rawTask.location.name.trim()
        : item.name
      const key = locationName && locationName.length > 0 ? locationName : item.name
      const existing = grouped.get(key) ?? []
      existing.push(subtaskName)
      grouped.set(key, existing)
    }

    if (grouped.size > 0) {
      const entries = Array.from(grouped.entries()).map(([name, subtasks]) => ({
        name,
        details: subtasks.filter((entry) => entry.length > 0).join(", "),
      }))
      return sanitiseTasks(entries)
    }
  }

  if (typeof item?.remarks === "string" && item.remarks.trim().length > 0) {
    return sanitiseTasks(parseActionToTasks(item.remarks))
  }

  return [] as NonNullable<ChecklistDraftItem["tasks"]>
}

export const mapTemplateItemToDraft = (item: any, index: number): ChecklistDraftItem => {
  const tasksFromTemplate = Array.isArray(item.tasks)
    ? item.tasks
        .map((task: any) => ({
          name: typeof task?.name === "string" ? task.name.trim() : "",
          details: Array.isArray(task?.actions)
            ? task.actions.filter((detail: any) => typeof detail === "string").join(", ")
            : typeof task?.details === "string"
            ? task.details.trim()
            : "",
        }))
        .filter((task) => task.name.length > 0 || task.details.length > 0)
    : []

  const rawTasks = tasksFromTemplate.length > 0 ? tasksFromTemplate : parseActionToTasks(item.action)
  const tasks = sanitiseTasks(rawTasks)
  const descriptionFromTasks = tasks.length > 0 ? buildActionFromTasks(tasks) : item.action || ""

  return {
    item: item.name || item.item || "",
    description: descriptionFromTasks,
    order: item.order ?? index + 1,
    isRequired: item.isRequired ?? true,
    category: item.category || DEFAULT_CATEGORY,
    tasks,
  }
}

