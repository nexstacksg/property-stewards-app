"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, GripVertical, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Badge } from "@/components/ui/badge"
import { ContractEditForm } from "@/components/contracts/edit/contract-edit-form"
import { ContractEditSummary } from "@/components/contracts/edit/contract-edit-summary"
import { ContactPersonsCard } from "@/components/contracts/edit/contact-persons-card"
import { StatusGuideCard } from "@/components/contracts/edit/status-guide-card"
import { ChecklistTagLibrary, type ChecklistTag } from "@/components/checklists/checklist-tag-library"
import { showToast } from "@/lib/toast"
import { parseActionIntoTasks } from "@/lib/utils/taskParser"
import type {
  ChecklistDraftItem,
  ChecklistTemplate,
  ContractAddressSummary,
  ContractCustomerSummary,
  ContractReferenceOption,
  ContactPersonDraft,
  ContractStatus,
  ContractType,
  MarketingSource,
} from "@/components/contracts/types"

const CATEGORIES = [
  "GENERAL",
  "ELECTRICAL",
  "PLUMBING",
  "STRUCTURAL",
  "SAFETY",
  "EXTERIOR",
  "INTERIOR",
  "APPLIANCES",
] as const

const DEFAULT_CATEGORY = "GENERAL"

type InspectorRatingValue = 'GOOD' | 'FAIR' | 'BAD'

type ContractInspectorSummary = {
  id: string
  name: string
  mobilePhone?: string | null
}

type RatingSelectValue = InspectorRatingValue | 'NONE'

const RATING_LABELS: Record<InspectorRatingValue, string> = {
  GOOD: 'Good',
  FAIR: 'Fair',
  BAD: 'Bad',
}

const RATING_BADGE_VARIANT: Record<InspectorRatingValue, 'success' | 'warning' | 'destructive'> = {
  GOOD: 'success',
  FAIR: 'warning',
  BAD: 'destructive',
}

const RATING_SELECT_OPTIONS: Array<{ value: RatingSelectValue; label: string }> = [
  { value: 'GOOD', label: RATING_LABELS.GOOD },
  { value: 'FAIR', label: RATING_LABELS.FAIR },
  { value: 'BAD', label: RATING_LABELS.BAD },
  { value: 'NONE', label: 'Clear rating' },
]

const createEmptyTask = () => ({ name: "", details: "" })

const createEmptyLocation = (order: number): ChecklistDraftItem => ({
  item: "",
  description: "",
  category: DEFAULT_CATEGORY,
  isRequired: true,
  order,
  tasks: [],
})

const sanitiseTasks = (tasks: NonNullable<ChecklistDraftItem["tasks"]>) =>
  tasks
    .map((task) => ({
      ...task,
      name: (task.name || "").trim(),
      details: (task.details || "").trim(),
    }))
    .filter((task) => task.name.length > 0 || task.details.length > 0)

const buildActionFromTasks = (tasks: NonNullable<ChecklistDraftItem["tasks"]>) =>
  tasks
    .map((task) => {
      const name = task.name.trim()
      const details = task.details.trim()
      if (!name) return details
      return details ? `${name}: ${details}` : name
    })
    .filter((entry) => entry.length > 0)
    .join("; ")

const parseActionToTasks = (action?: string | null) => {
  if (!action) return [] as NonNullable<ChecklistDraftItem["tasks"]>
  const parsed = parseActionIntoTasks(action)
  return parsed
    .map((task) => task.task.trim())
    .filter((name) => name.length > 0 && name.toLowerCase() !== "others")
    .map((name) => ({ name, details: "" }))
}

const extractActionTasksFromItem = (item: any): NonNullable<ChecklistDraftItem["tasks"]> => {
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

const mapTemplateItemToDraft = (item: any, index: number): ChecklistDraftItem => {
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

interface ContractResponse {
  id: string
  customerId: string
  addressId: string
  value: string | number
  firstPaymentOn: string
  finalPaymentOn?: string | null
  scheduledStartDate: string
  scheduledEndDate: string
  actualStartDate?: string | null
  actualEndDate?: string | null
  servicePackage?: string | null
  contractType?: ContractType | null
  remarks?: string | null
  status: ContractStatus
  marketingSource?: Exclude<MarketingSource, "NONE"> | null
  referenceIds?: string[]
  customer: ContractCustomerSummary
  address: ContractAddressSummary
  contactPersons?: Array<{
    id: string
    name: string
    phone?: string | null
    email?: string | null
    relation?: string | null
  }>
  basedOnChecklist?: {
    id: string
  }
  contractChecklist?: {
    items?: Array<{
      name: string
      remarks?: string | null
      order?: number | null
    }>
  }
  workOrders?: Array<{
    id: string
    inspectors?: ContractInspectorSummary[]
  }>
  inspectorRatings?: Array<{
    inspectorId: string
    rating: InspectorRatingValue
    inspector?: ContractInspectorSummary
  }>
}

export default function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [contractId, setContractId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [value, setValue] = useState("")
  const [servicePackage, setServicePackage] = useState("")
  const [contractType, setContractType] = useState<ContractType>("INSPECTION")
  const [scheduledStartDate, setScheduledStartDate] = useState("")
  const [scheduledEndDate, setScheduledEndDate] = useState("")
  const [actualStartDate, setActualStartDate] = useState("")
  const [actualEndDate, setActualEndDate] = useState("")
  const [firstPaymentOn, setFirstPaymentOn] = useState("")
  const [finalPaymentOn, setFinalPaymentOn] = useState("")
  const [status, setStatus] = useState<ContractStatus>("DRAFT")
  const [remarks, setRemarks] = useState("")

  const [customer, setCustomer] = useState<ContractCustomerSummary | null>(null)
  const [address, setAddress] = useState<ContractAddressSummary | null>(null)

  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [checklistItems, setChecklistItems] = useState<ChecklistDraftItem[]>([])
  const [rowEditIndex, setRowEditIndex] = useState<number | null>(null)
  const [rowEditItem, setRowEditItem] = useState<ChecklistDraftItem | null>(null)
  const [rowTaskEditIndex, setRowTaskEditIndex] = useState<number | null>(null)
  const [rowTaskDraft, setRowTaskDraft] = useState<{ name: string; details: string } | null>(null)

  const [showLocationForm, setShowLocationForm] = useState(false)
  const [newLocation, setNewLocation] = useState<ChecklistDraftItem>(
    createEmptyLocation(1),
  )
  const [newTaskEditIndex, setNewTaskEditIndex] = useState<number | null>(null)
  const [newTaskDraft, setNewTaskDraft] = useState<{ name: string; details: string } | null>(null)

  const [availableReferences, setAvailableReferences] = useState<ContractReferenceOption[]>([])
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([])
  const [marketingSource, setMarketingSource] = useState<MarketingSource>("NONE")

  const [contactPersons, setContactPersons] = useState<ContactPersonDraft[]>([])
  const [contactEditIndex, setContactEditIndex] = useState<number | null>(null)
  const [contactDraft, setContactDraft] = useState<ContactPersonDraft | null>(null)
  const [contactError, setContactError] = useState("")

  const [contractInspectors, setContractInspectors] = useState<ContractInspectorSummary[]>([])
  const [inspectorRatingsState, setInspectorRatingsState] = useState<Record<string, InspectorRatingValue | null>>({})
  const [ratingSavingState, setRatingSavingState] = useState<Record<string, boolean>>({})
  const [ratingError, setRatingError] = useState<string | null>(null)

  useEffect(() => {
    const loadContract = async () => {
      const resolvedParams = await params
      setContractId(resolvedParams.id)
      await fetchContract(resolvedParams.id)
    }
    loadContract()
  }, [params])

  const fetchContract = async (id: string) => {
    try {
      const response = await fetch(`/api/contracts/${id}`)
      if (!response.ok) throw new Error("Failed to fetch contract")

      const contract: ContractResponse = await response.json()

      setValue(contract.value.toString())
      setServicePackage(contract.servicePackage || "")
      setContractType(contract.contractType || "INSPECTION")
      setScheduledStartDate(contract.scheduledStartDate.split("T")[0])
      setScheduledEndDate(contract.scheduledEndDate.split("T")[0])
      setActualStartDate(contract.actualStartDate ? contract.actualStartDate.split("T")[0] : "")
      setActualEndDate(contract.actualEndDate ? contract.actualEndDate.split("T")[0] : "")
      setFirstPaymentOn(contract.firstPaymentOn.split("T")[0])
      setFinalPaymentOn(contract.finalPaymentOn ? contract.finalPaymentOn.split("T")[0] : "")
      setStatus(contract.status)
      setRemarks(contract.remarks || "")
      setCustomer(contract.customer)
      setAddress(contract.address)
      setMarketingSource(contract.marketingSource || "NONE")
      setSelectedReferenceIds(Array.isArray(contract.referenceIds) ? contract.referenceIds : [])
      setContactPersons(
        Array.isArray(contract.contactPersons)
          ? contract.contactPersons.map((person) => ({
              id: person.id,
              name: person.name || "",
              phone: person.phone || "",
              email: person.email || "",
              relation: person.relation || "",
            }))
          : [],
      )
      setContactEditIndex(null)
      setContactDraft(null)
      setContactError("")

      const inspectorMap = new Map<string, ContractInspectorSummary>()

      if (Array.isArray(contract.workOrders)) {
        contract.workOrders.forEach((workOrder) => {
          if (!workOrder || !Array.isArray(workOrder.inspectors)) return
          workOrder.inspectors.forEach((inspector) => {
            if (!inspector || typeof inspector.id !== 'string') return
            if (!inspectorMap.has(inspector.id)) {
              inspectorMap.set(inspector.id, {
                id: inspector.id,
                name: inspector.name || 'Inspector',
                mobilePhone: inspector.mobilePhone || null,
              })
            }
          })
        })
      }

      const ratingMap: Record<string, InspectorRatingValue | null> = {}

      if (Array.isArray(contract.inspectorRatings)) {
        contract.inspectorRatings.forEach((entry) => {
          if (!entry || typeof entry.inspectorId !== 'string') return
          if (entry.inspector && !inspectorMap.has(entry.inspector.id)) {
            inspectorMap.set(entry.inspector.id, {
              id: entry.inspector.id,
              name: entry.inspector.name || 'Inspector',
              mobilePhone: entry.inspector.mobilePhone || null,
            })
          }
          if (entry.rating) {
            ratingMap[entry.inspectorId] = entry.rating
          }
        })
      }

      setContractInspectors(Array.from(inspectorMap.values()))
      setInspectorRatingsState(ratingMap)
      setRatingSavingState({})
      setRatingError(null)

      fetchTemplates()
      fetchCustomerContracts(contract.customerId, contract.id)

      try {
        const basedOnId = contract.basedOnChecklist?.id
        if (basedOnId) setSelectedTemplateId(basedOnId)
        else setSelectedTemplateId("")
        const checklist = contract.contractChecklist
        if (checklist && Array.isArray(checklist.items)) {
          const items = checklist.items
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((item, index) => {
              const tasks = extractActionTasksFromItem(item)
              return {
                item: item.name,
                description: tasks.length > 0 ? buildActionFromTasks(tasks) : item.remarks || "",
                order: item.order ?? index + 1,
                isRequired: true,
                category: DEFAULT_CATEGORY,
                tasks,
              }
            })
          setChecklistItems(items)
          setNewLocation(createEmptyLocation(items.length + 1))
        } else {
          setChecklistItems([])
          setNewLocation(createEmptyLocation(1))
        }
        setShowLocationForm(false)
      } catch {
        setChecklistItems([])
        setNewLocation(createEmptyLocation(1))
        setShowLocationForm(false)
      }

      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contract")
      setLoading(false)
    }
  }

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/checklist-templates`)
      if (!res.ok) {
        setTemplates([])
        return
      }
      const data = await res.json()
      setTemplates(Array.isArray(data.templates) ? data.templates : [])
    } catch {
      setTemplates([])
    }
  }

  const fetchCustomerContracts = async (customerId: string, excludeId?: string) => {
    try {
      const res = await fetch(`/api/contracts?customerId=${customerId}&limit=100`)
      if (!res.ok) {
        setAvailableReferences([])
        return
      }
      const data = await res.json()
      const options: ContractReferenceOption[] = Array.isArray(data.contracts)
        ? data.contracts
            .filter(
              (contract: any) => contract && typeof contract.id === "string" && contract.id !== excludeId,
            )
            .map((contract: any) => ({
              id: contract.id,
              label: `#${contract.id } • ${contract.status}`,
            }))
        : []
      setAvailableReferences(options)
    } catch {
      setAvailableReferences([])
    }
  }

  const handleInspectorRatingChange = async (inspectorId: string, value: RatingSelectValue) => {
    if (!contractId) return
    const previousValue = inspectorRatingsState[inspectorId] ?? null
    const nextRating = value === 'NONE' ? null : (value as InspectorRatingValue)

    setRatingError(null)
    setInspectorRatingsState((prev) => {
      const next = { ...prev }
      if (nextRating) {
        next[inspectorId] = nextRating
      } else {
        delete next[inspectorId]
      }
      return next
    })
    setRatingSavingState((prev) => ({ ...prev, [inspectorId]: true }))

    try {
      const response = await fetch(`/api/contracts/${contractId}/ratings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectorId, rating: value === 'NONE' ? null : value }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update rating')
      }

      setInspectorRatingsState((prev) => {
        const next = { ...prev }
        if (data?.rating) {
          next[inspectorId] = data.rating as InspectorRatingValue
        } else {
          delete next[inspectorId]
        }
        return next
      })
    } catch (error) {
      console.error('Rating update failed', error)
      setInspectorRatingsState((prev) => {
        const next = { ...prev }
        if (previousValue) {
          next[inspectorId] = previousValue
        } else {
          delete next[inspectorId]
        }
        return next
      })
      setRatingError((error as Error).message)
    } finally {
      setRatingSavingState((prev) => {
        const next = { ...prev }
        delete next[inspectorId]
        return next
      })
    }
  }

  const loadTemplate = async (templateId: string) => {
    setSelectedTemplateId(templateId)
    if (!templateId) {
      setChecklistItems([])
      setShowLocationForm(false)
      setNewLocation(createEmptyLocation(1))
      setNewTaskEditIndex(null)
      setNewTaskDraft(null)
      setRowEditIndex(null)
      setRowEditItem(null)
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
      return
    }

    const local = templates.find((template) => template.id === templateId)
    if (local && Array.isArray(local.items)) {
      const items = local.items.map((item: any, index: number) => mapTemplateItemToDraft(item, index))
      setChecklistItems(items)
      setShowLocationForm(false)
      setNewLocation(createEmptyLocation(items.length + 1))
      setNewTaskEditIndex(null)
      setNewTaskDraft(null)
      setRowEditIndex(null)
      setRowEditItem(null)
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
      return
    }

    try {
      const res = await fetch(`/api/checklists/${templateId}`)
      if (!res.ok) return
      const tpl = await res.json()
      const items = (tpl.items || []).map((item: any, index: number) => mapTemplateItemToDraft(item, index))
      setChecklistItems(items)
      setShowLocationForm(false)
      setNewLocation(createEmptyLocation(items.length + 1))
      setNewTaskEditIndex(null)
      setNewTaskDraft(null)
      setRowEditIndex(null)
      setRowEditItem(null)
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
    } catch {
      /* noop */
    }
  }

  const addBlankChecklistItem = () => {
    setShowLocationForm(true)
    setNewLocation(createEmptyLocation(checklistItems.length + 1))
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const moveChecklistItem = (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === checklistItems.length - 1)) return
    const items = [...checklistItems]
    const target = direction === "up" ? index - 1 : index + 1
    ;[items[index], items[target]] = [items[target], items[index]]
    items.forEach((item, idx) => {
      item.order = idx + 1
    })
    setChecklistItems(items)
  }

  const removeChecklistItem = (index: number) => {
    const items = checklistItems
      .filter((_, currentIndex) => currentIndex !== index)
      .map((item, idx) => ({ ...item, order: idx + 1 }))
    setChecklistItems(items)
    if (rowEditIndex === index) {
      setRowEditIndex(null)
      setRowEditItem(null)
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
    } else if (rowEditIndex !== null && rowEditIndex > index) {
      setRowEditIndex(rowEditIndex - 1)
    }
  }

  const resetNewLocationForm = () => {
    setShowLocationForm(false)
    setNewLocation(createEmptyLocation(checklistItems.length + 1))
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const addLocation = () => {
    if (!newLocation.item.trim()) return

    const sanitizedTasks = sanitiseTasks(newLocation.tasks ?? [])
    const nextLocation: ChecklistDraftItem = {
      ...newLocation,
      item: newLocation.item.trim(),
      category: newLocation.category || DEFAULT_CATEGORY,
      isRequired: newLocation.isRequired ?? true,
      order: checklistItems.length + 1,
      tasks: sanitizedTasks,
      description: buildActionFromTasks(sanitizedTasks),
    }

    setChecklistItems((previous) => [...previous, nextLocation])
    resetNewLocationForm()
  }

  const addTaskToNewLocation = () => {
    const nextIndex = (newLocation.tasks ?? []).length
    setNewLocation((prev) => ({
      ...prev,
      tasks: [...(prev.tasks ?? []), createEmptyTask()],
    }))
    setNewTaskEditIndex(nextIndex)
    setNewTaskDraft(createEmptyTask())
  }

  const startEditNewTask = (index: number) => {
    const task = newLocation.tasks?.[index]
    if (!task) return
    setNewTaskEditIndex(index)
    setNewTaskDraft({ ...task })
  }

  const updateNewTaskDraft = (field: "name" | "details", value: string) => {
    setNewTaskDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const saveNewTaskEdit = (index: number) => {
    if (newTaskDraft === null) return
    const trimmedTask = {
      name: newTaskDraft.name.trim(),
      details: newTaskDraft.details.trim(),
    }
    setNewLocation((prev) => {
      const nextTasks = [...(prev.tasks ?? [])]
      nextTasks[index] = trimmedTask
      return { ...prev, tasks: nextTasks }
    })
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const cancelNewTaskEdit = (index: number) => {
    const task = newLocation.tasks?.[index]
    const isNewTask = task && !task.name.trim() && !task.details.trim()
    if (isNewTask) {
      setNewLocation((prev) => ({
        ...prev,
        tasks: (prev.tasks ?? []).filter((_, taskIndex) => taskIndex !== index),
      }))
    }
    setNewTaskEditIndex(null)
    setNewTaskDraft(null)
  }

  const removeNewLocationTask = (index: number) => {
    setNewLocation((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).filter((_, taskIndex) => taskIndex !== index),
    }))
    if (newTaskEditIndex === index) {
      setNewTaskEditIndex(null)
      setNewTaskDraft(null)
    } else if (newTaskEditIndex !== null && newTaskEditIndex > index) {
      setNewTaskEditIndex(newTaskEditIndex - 1)
    }
  }

  const startRowEdit = (index: number) => {
    const source = checklistItems[index]
    setRowEditIndex(index)
    setRowEditItem({
      ...source,
      tasks: (source.tasks ?? []).map((task) => ({ ...task })),
      category: source.category || DEFAULT_CATEGORY,
      isRequired: source.isRequired ?? true,
    })
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const addTaskToRowEdit = () => {
    setRowEditItem((prev) => {
      if (!prev) return prev
      const nextTasks = [...(prev.tasks ?? []), createEmptyTask()]
      setRowTaskEditIndex(nextTasks.length - 1)
      setRowTaskDraft(createEmptyTask())
      return { ...prev, tasks: nextTasks }
    })
  }

  const startRowTaskEdit = (index: number) => {
    const task = rowEditItem?.tasks?.[index]
    if (!task) return
    setRowTaskEditIndex(index)
    setRowTaskDraft({ ...task })
  }

  const updateRowTaskDraft = (field: "name" | "details", value: string) => {
    setRowTaskDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const saveRowTaskEdit = (index: number) => {
    if (!rowTaskDraft) return
    const trimmedTask = {
      name: rowTaskDraft.name.trim(),
      details: rowTaskDraft.details.trim(),
    }
    setRowEditItem((prev) => {
      if (!prev) return prev
      const nextTasks = [...(prev.tasks ?? [])]
      nextTasks[index] = trimmedTask
      return { ...prev, tasks: nextTasks }
    })
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const cancelRowTaskEdit = (index: number) => {
    const task = rowEditItem?.tasks?.[index]
    const isNewTask = task && !task.name.trim() && !task.details.trim()
    if (isNewTask) {
      setRowEditItem((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          tasks: (prev.tasks ?? []).filter((_, taskIndex) => taskIndex !== index),
        }
      })
    }
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const removeRowEditTask = (taskIndex: number) => {
    setRowEditItem((prev) => {
      if (!prev) return prev
      const nextTasks = (prev.tasks ?? []).filter((_, index) => index !== taskIndex)
      return { ...prev, tasks: nextTasks }
    })
    if (rowTaskEditIndex === taskIndex) {
      setRowTaskEditIndex(null)
      setRowTaskDraft(null)
    } else if (rowTaskEditIndex !== null && rowTaskEditIndex > taskIndex) {
      setRowTaskEditIndex(rowTaskEditIndex - 1)
    }
  }

  const cancelRowEdit = () => {
    setRowEditIndex(null)
    setRowEditItem(null)
    setRowTaskEditIndex(null)
    setRowTaskDraft(null)
  }

  const saveRowEdit = () => {
    if (rowEditIndex === null || !rowEditItem) return
    if (!rowEditItem.item.trim()) return
    if (rowTaskEditIndex !== null) return

    const sanitizedTasks = sanitiseTasks(rowEditItem.tasks ?? [])
    const items = [...checklistItems]
    items[rowEditIndex] = {
      ...rowEditItem,
      item: rowEditItem.item.trim(),
      category: rowEditItem.category || DEFAULT_CATEGORY,
      isRequired: rowEditItem.isRequired ?? true,
      tasks: sanitizedTasks,
      description: buildActionFromTasks(sanitizedTasks),
      order: rowEditIndex + 1,
    }
    setChecklistItems(items)
    cancelRowEdit()
  }

  const handleRowEditChange = (updates: Partial<ChecklistDraftItem>) => {
    setRowEditItem((previous) =>
      previous
        ? {
            ...previous,
            ...updates,
          }
        : previous,
    )
  }

  const buildTasksFromTag = (tag: ChecklistTag) => {
    const rawTemplates = tag.taskTemplates as unknown
    const templates = Array.isArray(rawTemplates)
      ? rawTemplates
      : rawTemplates && typeof rawTemplates === 'object' && Array.isArray((rawTemplates as any).templates)
      ? (rawTemplates as any).templates
      : []
    if (templates.length === 0) {
      return [{ name: tag.label, details: "" }]
    }

    return templates.map((entry) => {
      const name = entry.label?.trim() || tag.label
      const details = Array.isArray(entry.subtasks) && entry.subtasks.length > 0
        ? entry.subtasks.map((item) => item.trim()).filter(Boolean).join(', ')
        : ''
      return { name, details }
    })
  }

  const applyTagToChecklist = (tag: ChecklistTag) => {
    const tasksToAdd = buildTasksFromTag(tag)
    if (tasksToAdd.length === 0) return

    if (rowEditIndex === null && !showLocationForm) {
      showToast({
        title: "Select a location first",
        description: "Pick or add a checklist location before applying a tag.",
        variant: "error",
      })
      return
    }

    if (rowEditIndex !== null) {
      setRowEditItem((previous) =>
        previous
          ? {
              ...previous,
              tasks: [...(previous.tasks ?? []), ...tasksToAdd],
              description: buildActionFromTasks([...(previous.tasks ?? []), ...tasksToAdd]),
            }
          : previous,
      )
      return
    }

    if (showLocationForm) {
      setNewLocation((previous) => ({
        ...previous,
        tasks: [...(previous.tasks ?? []), ...tasksToAdd],
        description: buildActionFromTasks([...(previous.tasks ?? []), ...tasksToAdd]),
      }))
      return
    }

    if (!showLocationForm) {
      setShowLocationForm(true)
      setNewTaskEditIndex(null)
      setNewTaskDraft(null)
      setNewLocation(() => {
        const base = createEmptyLocation(checklistItems.length + 1)
        const tasks = [...(base.tasks ?? []), ...tasksToAdd]
        return {
          ...base,
          tasks,
          description: buildActionFromTasks(tasks),
        }
      })
    }
  }

  const beginAddContactPerson = () => {
    if (contactEditIndex !== null) {
      setContactError("Finish editing the current contact before adding a new one.")
      return
    }
    const newContact: ContactPersonDraft = {
      name: "",
      phone: "",
      email: "",
      relation: "",
      isNew: true,
    }
    const newIndex = contactPersons.length
    setContactPersons((previous) => [...previous, newContact])
    setContactEditIndex(newIndex)
    setContactDraft({ ...newContact })
    setContactError("")
  }

  const beginEditContactPerson = (index: number) => {
    if (contactEditIndex !== null) {
      setContactError("Finish editing the current contact before editing another.")
      return
    }
    const person = contactPersons[index]
    if (!person) return
    setContactEditIndex(index)
    setContactDraft({ ...person })
    setContactError("")
  }

  const handleContactDraftChange = (field: keyof ContactPersonDraft, value: string) => {
    setContactDraft((previous) => (previous ? { ...previous, [field]: value } : previous))
  }

  const handleCancelContact = () => {
    if (contactEditIndex === null) return
    setContactPersons((previous) => {
      const person = previous[contactEditIndex]
      if (person && person.isNew && !person.id) {
        return previous.filter((_, idx) => idx !== contactEditIndex)
      }
      return previous
    })
    setContactEditIndex(null)
    setContactDraft(null)
    setContactError("")
  }

  const handleSaveContact = () => {
    if (contactEditIndex === null || !contactDraft) return
    const name = contactDraft.name.trim()
    if (!name) {
      setContactError("Contact name is required.")
      return
    }

    const sanitized: ContactPersonDraft = {
      id: contactDraft.id,
      name,
      phone: contactDraft.phone.trim(),
      email: contactDraft.email.trim(),
      relation: contactDraft.relation.trim(),
    }

    setContactPersons((previous) =>
      previous.map((person, idx) => (idx === contactEditIndex ? sanitized : person)),
    )
    setContactEditIndex(null)
    setContactDraft(null)
    setContactError("")
  }

  const handleRemoveContact = (index: number) => {
    if (contactEditIndex !== null && contactEditIndex !== index) {
      setContactError("Finish editing the current contact before removing another.")
      return
    }
    setContactPersons((previous) => previous.filter((_, idx) => idx !== index))
    if (contactEditIndex !== null) {
      if (index === contactEditIndex) {
        setContactEditIndex(null)
        setContactDraft(null)
      } else if (index < contactEditIndex) {
        setContactEditIndex(contactEditIndex - 1)
      }
    }
    setContactError("")
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!contractId) return

    setError("")
    setSaving(true)

    if (contactEditIndex !== null) {
      setContactError("Save or cancel the contact person you are editing before saving the contract.")
      setSaving(false)
      return
    }

    setContactError("")

    try {
      const normalizedContactPersons = contactPersons
        .map((person) => {
          const name = person.name.trim()
          if (!name) return null
          const phone = person.phone.trim()
          const email = person.email.trim()
          const relation = person.relation.trim()
          return {
            name,
            phone: phone || undefined,
            email: email || undefined,
            relation: relation || undefined,
          }
        })
        .filter((person): person is {
          name: string
          phone: string | undefined
          email: string | undefined
          relation: string | undefined
        } => Boolean(person))

      const response = await fetch(`/api/contracts/${contractId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: parseFloat(value),
          servicePackage,
          contractType,
          scheduledStartDate,
          scheduledEndDate,
          actualStartDate: actualStartDate || null,
          actualEndDate: actualEndDate || null,
          firstPaymentOn,
          finalPaymentOn: finalPaymentOn || null,
          status,
          remarks,
          marketingSource: marketingSource !== "NONE" ? marketingSource : null,
          referenceIds: selectedReferenceIds.filter((id) => id !== (contractId ?? "")),
          contactPersons: normalizedContactPersons,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update contract")
      }

      if (checklistItems.length > 0) {
        try {
          await fetch(`/api/contracts/${contractId}/checklist`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              templateId: selectedTemplateId || undefined,
              items: checklistItems.map((item, index) => ({
                name: item.item.trim(),
                action:
                  buildActionFromTasks(sanitiseTasks(item.tasks ?? [])) ||
                  item.description.trim(),
                order: index + 1,
                category: item.category || DEFAULT_CATEGORY,
                isRequired: item.isRequired ?? true,
                tasks: sanitiseTasks(item.tasks ?? []).map((task, taskIndex) => ({
                  name: task.name.trim(),
                  details: task.details.trim(),
                  order: taskIndex + 1,
                })),
              })),
            }),
          })
        } catch {
          /* ignore errors when updating checklist */
        }
      }
      router.push(`/contracts/${contractId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const contractTypeLabel = contractType === "REPAIR" ? "Repair" : "Inspection"

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href={contractId ? `/contracts/${contractId}` : "/contracts"}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Contract</h1>
          <p className="text-muted-foreground mt-1">Update contract information</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Contract Information</CardTitle>
                <CardDescription>Update the contract details</CardDescription>
              </CardHeader>
              <CardContent>
                <ContractEditForm
                  error={error}
                  customer={customer}
                  address={address}
                  value={value}
                  onValueChange={setValue}
                  servicePackage={servicePackage}
                  onServicePackageChange={setServicePackage}
                  contractType={contractType}
                  onContractTypeChange={setContractType}
                  marketingSource={marketingSource}
                  onMarketingSourceChange={setMarketingSource}
                  status={status}
                  onStatusChange={setStatus}
                  scheduledStartDate={scheduledStartDate}
                  onScheduledStartDateChange={setScheduledStartDate}
                  scheduledEndDate={scheduledEndDate}
                  onScheduledEndDateChange={setScheduledEndDate}
                  actualStartDate={actualStartDate}
                  onActualStartDateChange={setActualStartDate}
                  actualEndDate={actualEndDate}
                  onActualEndDateChange={setActualEndDate}
                  firstPaymentOn={firstPaymentOn}
                  onFirstPaymentOnChange={setFirstPaymentOn}
                  finalPaymentOn={finalPaymentOn}
                  onFinalPaymentOnChange={setFinalPaymentOn}
                  remarks={remarks}
                  onRemarksChange={setRemarks}
                  availableReferences={availableReferences}
                  selectedReferenceIds={selectedReferenceIds}
                  onReferenceIdsChange={setSelectedReferenceIds}
                />

                <div className="border rounded-lg p-4 space-y-4 mt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">Checklist Locations</h3>
                      <p className="text-sm text-muted-foreground">
                        Select a template or edit locations and tasks for this contract
                      </p>
                    </div>
                    <Select value={selectedTemplateId} onValueChange={loadTemplate}>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Load template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <ChecklistTagLibrary onApplyTag={applyTagToChecklist} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addBlankChecklistItem}
                      disabled={showLocationForm || newTaskEditIndex !== null}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Location
                    </Button>
                  </div>

                  {showLocationForm && (
                    <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Location *</Label>
                          <Input
                            value={newLocation.item}
                            onChange={(event) =>
                              setNewLocation((prev) => ({
                                ...prev,
                                item: event.target.value,
                              }))
                            }
                            placeholder="e.g., Balcony"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Category *</Label>
                          <Select
                            value={newLocation.category || DEFAULT_CATEGORY}
                            onValueChange={(value) =>
                              setNewLocation((prev) => ({
                                ...prev,
                                category: value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map((category) => (
                                <SelectItem key={category} value={category}>
                                  {category}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2 md:col-span-2">
                          <input
                            type="checkbox"
                            id="edit-new-location-required"
                            checked={newLocation.isRequired ?? true}
                            onChange={(event) =>
                              setNewLocation((prev) => ({
                                ...prev,
                                isRequired: event.target.checked,
                              }))
                            }
                            className="rounded"
                          />
                          <Label htmlFor="edit-new-location-required">Required Location</Label>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="font-medium">Tasks</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addTaskToNewLocation}
                            disabled={newTaskEditIndex !== null}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Task
                          </Button>
                        </div>

                        {(newLocation.tasks ?? []).length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            Add the task names and optional details inspectors should follow for this location.
                          </p>
                        )}

                        {(newLocation.tasks ?? []).map((task, index) => {
                          const isEditing = newTaskEditIndex === index
                          const draftTask = isEditing && newTaskDraft ? newTaskDraft : task

                          return (
                            <div key={`edit-new-task-${index}`} className="border rounded-md p-3">
                              {isEditing ? (
                                <div className="space-y-3">
                                  <div className="space-y-2">
                                    <Label>Task Name *</Label>
                                    <Input
                                      value={draftTask.name}
                                      onChange={(event) => updateNewTaskDraft("name", event.target.value)}
                                      placeholder="e.g., Inspect railings"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Details (optional)</Label>
                                    <Input
                                      value={draftTask.details}
                                      onChange={(event) => updateNewTaskDraft("details", event.target.value)}
                                      placeholder="e.g., Check stability, Look for rust"
                                    />
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={() => cancelNewTaskEdit(index)}>
                                      Cancel
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => saveNewTaskEdit(index)}
                                      disabled={!draftTask.name.trim()}
                                    >
                                      Save
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1">
                                    <p className="font-medium text-sm">{task.name.trim() || "Untitled task"}</p>
                                    {task.details.trim() && (
                                      <p className="text-xs text-muted-foreground">{task.details.trim()}</p>
                                    )}
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => startEditNewTask(index)}
                                      aria-label="Edit task"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeNewLocationTask(index)}
                                      aria-label="Delete task"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={resetNewLocationForm}>
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={addLocation}
                          disabled={!newLocation.item.trim() || newTaskEditIndex !== null}
                        >
                          Add Location
                        </Button>
                      </div>
                    </div>
                  )}

                  {checklistItems.length > 0 ? (
                    <div className="space-y-2">
                      {checklistItems.map((location, index) => {
                        const taskSummaries = (location.tasks ?? [])
                          .map((task) => {
                            const name = task.name.trim()
                            const details = task.details.trim()
                            if (!name && !details) return ""
                            return details ? `${name} (${details})` : name
                          })
                          .filter((entry) => entry.length > 0)

                        return (
                          <div
                            key={location.item ? `${location.item}-${index}` : `location-${index}`}
                            className="border rounded-lg p-3 flex items-start gap-2"
                          >
                            <div className="flex flex-col gap-1 pt-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => moveChecklistItem(index, "up")}
                                disabled={index === 0}
                              >
                                ↑
                              </Button>
                              <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => moveChecklistItem(index, "down")}
                                disabled={index === checklistItems.length - 1}
                              >
                                ↓
                              </Button>
                            </div>

                            <div className="flex-1">
                              {rowEditIndex === index ? (
                                <div className="space-y-4">
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label>Location *</Label>
                                      <Input
                                        value={rowEditItem?.item || ""}
                                        onChange={(event) => handleRowEditChange({ item: event.target.value })}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Category</Label>
                                      <Select
                                        value={rowEditItem?.category || DEFAULT_CATEGORY}
                                        onValueChange={(value) => handleRowEditChange({ category: value })}
                                      >
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {CATEGORIES.map((category) => (
                                            <SelectItem key={category} value={category}>
                                              {category}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="flex items-center gap-2 md:col-span-2">
                                      <input
                                        type="checkbox"
                                        id={`edit-location-required-${index}`}
                                        checked={rowEditItem?.isRequired ?? true}
                                        onChange={(event) => handleRowEditChange({ isRequired: event.target.checked })}
                                        className="rounded"
                                      />
                                      <Label htmlFor={`edit-location-required-${index}`}>
                                        Required Location
                                      </Label>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                      <Label className="font-medium">Tasks</Label>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={addTaskToRowEdit}
                                        disabled={rowTaskEditIndex !== null}
                                      >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Task
                                      </Button>
                                    </div>

                                    {(!rowEditItem?.tasks || rowEditItem.tasks.length === 0) && (
                                      <p className="text-xs text-muted-foreground">
                                        Add at least one task to describe what needs to be inspected.
                                      </p>
                                    )}

                                    {rowEditItem?.tasks?.map((task, taskIndex) => {
                                      const isEditing = rowTaskEditIndex === taskIndex
                                      const draftTask = isEditing && rowTaskDraft ? rowTaskDraft : task

                                      return (
                                        <div
                                          key={task.id || `edit-task-${taskIndex}`}
                                          className="border rounded-md p-3"
                                        >
                                          {isEditing ? (
                                            <div className="space-y-3">
                                              <div className="space-y-2">
                                                <Label>Task Name *</Label>
                                                <Input
                                                  value={draftTask.name}
                                                  onChange={(event) => updateRowTaskDraft("name", event.target.value)}
                                                  placeholder="e.g., Inspect balcony doors"
                                                />
                                              </div>
                                              <div className="space-y-2">
                                                <Label>Details (optional)</Label>
                                                <Input
                                                  value={draftTask.details}
                                                  onChange={(event) => updateRowTaskDraft("details", event.target.value)}
                                                  placeholder="e.g., Check alignment, Test locks"
                                                />
                                              </div>
                                              <div className="flex justify-end gap-2">
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => cancelRowTaskEdit(taskIndex)}
                                                >
                                                  Cancel
                                                </Button>
                                                <Button
                                                  type="button"
                                                  size="sm"
                                                  onClick={() => saveRowTaskEdit(taskIndex)}
                                                  disabled={!draftTask.name.trim()}
                                                >
                                                  Save
                                                </Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="flex items-start justify-between gap-3">
                                              <div className="space-y-1">
                                                <p className="font-medium text-sm">{task.name.trim() || "Untitled task"}</p>
                                                {task.details.trim() && (
                                                  <p className="text-xs text-muted-foreground">{task.details.trim()}</p>
                                                )}
                                              </div>
                                              <div className="flex gap-1">
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => startRowTaskEdit(taskIndex)}
                                                  aria-label="Edit task"
                                                >
                                                  <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => removeRowEditTask(taskIndex)}
                                                  aria-label="Delete task"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>

                                  <div className="flex justify-end gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={cancelRowEdit}>
                                      Cancel
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={saveRowEdit}
                                      disabled={!rowEditItem?.item.trim() || rowTaskEditIndex !== null}
                                    >
                                      Save
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <p className="font-medium">{location.order}. {location.item}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {taskSummaries.length > 0 ? taskSummaries.join(", ") : "No tasks configured"}
                                    </p>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      <Badge variant={location.isRequired ? "default" : "secondary"}>
                                        {location.isRequired ? "Required" : "Optional"}
                                      </Badge>
                                      <Badge variant="outline">{location.category || DEFAULT_CATEGORY}</Badge>
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => startRowEdit(index)}
                                      aria-label="Edit location"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeChecklistItem(index)}
                                      aria-label="Remove location"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    !showLocationForm && (
                      <p className="text-sm text-muted-foreground">
                        No locations configured yet. Load a template or add one manually.
                      </p>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <ContractEditSummary
              contractId={contractId}
              status={status}
              contractType={contractType}
              contractTypeLabel={contractTypeLabel}
              value={value}
              marketingSource={marketingSource}
              saving={saving}
            />

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Inspector Ratings</CardTitle>
                <CardDescription>Track internal feedback per inspector.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {ratingError ? (
                  <p className="text-sm text-destructive">{ratingError}</p>
                ) : null}
                {contractInspectors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Ratings become available once inspectors are assigned to the contract's work orders.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {contractInspectors.map((inspector) => {
                      const currentRating = inspectorRatingsState[inspector.id] ?? null
                      return (
                        <div
                          key={inspector.id}
                          className="flex items-center justify-between gap-3 rounded-md border p-3"
                        >
                          <div>
                            <p className="font-medium">{inspector.name}</p>
                            {inspector.mobilePhone ? (
                              <p className="text-xs text-muted-foreground">{inspector.mobilePhone}</p>
                            ) : null}
                            {currentRating ? (
                              <Badge
                                variant={RATING_BADGE_VARIANT[currentRating]}
                                className="mt-2"
                              >
                                {RATING_LABELS[currentRating]}
                              </Badge>
                            ) : (
                              <p className="text-xs text-muted-foreground mt-2">Not rated</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={currentRating ?? 'NONE'}
                              onValueChange={(nextValue) =>
                                handleInspectorRatingChange(
                                  inspector.id,
                                  nextValue as RatingSelectValue,
                                )
                              }
                              disabled={Boolean(ratingSavingState[inspector.id] || saving)}
                            >
                              <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Set rating" />
                              </SelectTrigger>
                              <SelectContent>
                                {RATING_SELECT_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {ratingSavingState[inspector.id] ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <ContactPersonsCard
              contactPersons={contactPersons}
              contactEditIndex={contactEditIndex}
              contactDraft={contactDraft}
              contactError={contactError}
              onBeginAddContact={beginAddContactPerson}
              onBeginEditContact={beginEditContactPerson}
              onContactFieldChange={handleContactDraftChange}
              onCancelContact={handleCancelContact}
              onSaveContact={handleSaveContact}
              onRemoveContact={handleRemoveContact}
            />

            <StatusGuideCard />
          </div>
        </div>
      </form>
    </div>
  )
}
