"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Loader2, Plus, Trash2, Pencil } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
// import { Textarea } from "@/components/ui/textarea"

import type { ChecklistTag as LibraryChecklistTag, ChecklistTagTaskTemplate } from "@/components/checklists/checklist-tag-library"

type ChecklistTag = LibraryChecklistTag

function toSingleTemplate(label: string, subtasksText: string): ChecklistTagTaskTemplate | null {
  const cleanedLabel = (label || "").trim()
  const subtasks = (subtasksText || "")
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!cleanedLabel && subtasks.length === 0) return null
  return { label: cleanedLabel, subtasks: subtasks.length > 0 ? subtasks : undefined }
}

export function ChecklistTagsPanel() {
  const [loading, setLoading] = useState(true)
  const [tags, setTags] = useState<ChecklistTag[]>([])
  const [search, setSearch] = useState("")
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // New tag state
  const [newLabel, setNewLabel] = useState("")
  const [newTemplateLabel, setNewTemplateLabel] = useState("")
  const [newTemplateSubtasks, setNewTemplateSubtasks] = useState("")

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [editTemplateLabel, setEditTemplateLabel] = useState("")
  const [editTemplateSubtasks, setEditTemplateSubtasks] = useState("")

  useEffect(() => {
    void loadTags()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tags
    return tags.filter((t) => t.label.toLowerCase().includes(q))
  }, [tags, search])

  const displayTags = useMemo(() => {
    return editingId ? filtered.filter((t) => t.id !== editingId) : filtered
  }, [filtered, editingId])

  async function loadTags(query?: string) {
    try {
      setLoading(true)
      const url = query ? `/api/checklist-tags?q=${encodeURIComponent(query)}` : "/api/checklist-tags"
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) throw new Error("Failed to load checklist tags")
      const data = await res.json().catch(() => ({}))
      setTags(Array.isArray(data.tags) ? data.tags : [])
    } catch (e) {
      console.error("ChecklistTagsPanel: load failed", e)
      setTags([])
    } finally {
      setLoading(false)
    }
  }

  function beginEdit(tag: ChecklistTag) {
    setEditingId(tag.id)
    setEditLabel(tag.label)
    const first = Array.isArray(tag.taskTemplates) && tag.taskTemplates.length > 0 ? tag.taskTemplates[0] : undefined
    setEditTemplateLabel((first?.label ?? tag.label ?? "").trim())
    setEditTemplateSubtasks(Array.isArray(first?.subtasks) ? first!.subtasks.join(", ") : "")
    setFeedback(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditLabel("")
    setEditTemplateLabel("")
    setEditTemplateSubtasks("")
    setFeedback(null)
  }

  function resetNewForm() {
    setNewLabel("")
    setNewTemplateLabel("")
    setNewTemplateSubtasks("")
    setFeedback(null)
  }

  function summarizeTemplates(tpl?: ChecklistTagTaskTemplate[] | null) {
    if (!Array.isArray(tpl) || tpl.length === 0) return "No task templates"
    const parts = tpl.map((t) => {
      const base = t.label?.trim() || "Untitled"
      const details = Array.isArray(t.subtasks) && t.subtasks.length > 0 ? ` (${t.subtasks.join(", ")})` : ""
      return `${base}${details}`
    })
    return parts.join("; ")
  }

  async function handleCreateTag(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    const label = newLabel.trim()
    if (!label) {
      setFeedback("Label is required")
      return
    }
    const template = toSingleTemplate(newTemplateLabel || newLabel, newTemplateSubtasks)
    const taskTemplates = template ? [template] : undefined
    setFeedback(null)
    startTransition(async () => {
      try {
        const res = await fetch("/api/checklist-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, taskTemplates }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setFeedback(data?.error || "Failed to create tag")
          return
        }
        await loadTags(search.trim() || undefined)
        resetNewForm()
        setFeedback("Tag created")
      } catch (e) {
        console.error("Create tag failed", e)
        setFeedback("Failed to create tag")
      }
    })
  }

  async function handleSaveEdit() {
    if (!editingId || pending) return
    const label = editLabel.trim()
    if (!label) {
      setFeedback("Label is required")
      return
    }
    const template = toSingleTemplate(editTemplateLabel || editLabel, editTemplateSubtasks)
    const taskTemplates = template ? [template] : []
    setFeedback(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/checklist-tags/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, taskTemplates }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setFeedback(data?.error || "Failed to update tag")
          return
        }
        await loadTags(search.trim() || undefined)
        cancelEdit()
        setFeedback("Tag updated")
      } catch (e) {
        console.error("Update tag failed", e)
        setFeedback("Failed to update tag")
      }
    })
  }

  async function handleDeleteTag(id: string) {
    if (pending) return
    const confirmed = typeof window === "undefined" ? true : window.confirm("Delete this tag? This cannot be undone.")
    if (!confirmed) return
    setFeedback(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/checklist-tags/${id}`, { method: "DELETE" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setFeedback(data?.error || "Failed to delete tag")
          return
        }
        setTags((prev) => prev.filter((t) => t.id !== id))
        if (editingId === id) cancelEdit()
        setFeedback("Tag deleted")
      } catch (e) {
        console.error("Delete tag failed", e)
        setFeedback("Failed to delete tag")
      }
    })
  }

  const tagCount = tags.length

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Checklist Tags</CardTitle>
              <CardDescription>Common tags to speed up checklist authoring.</CardDescription>
            </div>
            <Badge variant="outline" className="font-medium">{tagCount} tag{tagCount === 1 ? "" : "s"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="w-full max-w-xs">
              <Label htmlFor="tag-search" className="sr-only">Search tags</Label>
              <Input
                id="tag-search"
                value={search}
                placeholder="Search tags"
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {editingId && (
            <div className="rounded-lg border bg-white p-4">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Label *</Label>
                    <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Template Label</Label>
                    <Input value={editTemplateLabel} onChange={(e) => setEditTemplateLabel(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Subtasks (comma-separated)</Label>
                    <Input value={editTemplateSubtasks} placeholder="Filter, Cooling, Remote" onChange={(e) => setEditTemplateSubtasks(e.target.value)} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>Cancel</Button>
                  <Button type="button" size="sm" onClick={handleSaveEdit} disabled={pending || !editLabel.trim()}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading tags…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No tags found.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {displayTags.map((tag) => (
                <div key={tag.id} className="rounded-lg border bg-white p-3 h-full">
                  <div className="flex items-start justify-between gap-3 h-full">
                    <div className="space-y-1">
                      <p className="font-medium">{tag.label}</p>
                      <p className="text-xs text-muted-foreground">{summarizeTemplates(tag.taskTemplates)}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => beginEdit(tag)} aria-label="Edit tag">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteTag(tag.id)} aria-label="Delete tag">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle>Add Tag</CardTitle>
          <CardDescription>Create a new tag with a single template.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleCreateTag}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Label *</Label>
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g., Walls" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Template Label</Label>
                <Input value={newTemplateLabel || newLabel} onChange={(e) => setNewTemplateLabel(e.target.value)} placeholder="defaults to label" />
              </div>
              <div className="space-y-1">
                <Label>Subtasks (comma-separated)</Label>
                <Input value={newTemplateSubtasks} placeholder="Filter, Cooling, Remote" onChange={(e) => setNewTemplateSubtasks(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={pending || !newLabel.trim()}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Create Tag
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={resetNewForm} disabled={pending}>
                Clear
              </Button>
            </div>
            {feedback && (
              <p className={`text-xs ${feedback.includes("Failed") ? "text-destructive" : "text-green-600"}`}>{feedback}</p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
