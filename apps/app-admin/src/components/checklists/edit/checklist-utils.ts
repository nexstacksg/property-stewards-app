"use client"

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

export interface ChecklistTaskDraft {
  id?: string
  name: string
  details: string
}

export interface ChecklistLocationDraft {
  id?: string
  location: string
  category: string
  isRequired: boolean
  order: number
  status?: string
  tasks: ChecklistTaskDraft[]
}

export const createEmptyTask = (): ChecklistTaskDraft => ({ name: "", details: "" })

export const createEmptyLocation = (order: number): ChecklistLocationDraft => ({
  location: "",
  category: DEFAULT_CATEGORY,
  isRequired: true,
  order,
  tasks: [],
})

export const sanitiseTasks = (tasks: ChecklistTaskDraft[]) =>
  tasks
    .map((task) => ({
      ...task,
      name: (task.name || "").trim(),
      details: (task.details || "").trim(),
    }))
    .filter((task) => task.name.length > 0 || task.details.length > 0)

