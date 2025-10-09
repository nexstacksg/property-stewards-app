"use client"

import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export interface ChecklistTagTaskTemplate {
  label: string
  subtasks?: string[]
}

export interface ChecklistTag {
  id: string
  label: string
  taskTemplates?: ChecklistTagTaskTemplate[] | null
}

interface ChecklistTagLibraryProps {
  onApplyTag: (tag: ChecklistTag) => void
}

export function ChecklistTagLibrary({ onApplyTag }: ChecklistTagLibraryProps) {
  const [tags, setTags] = useState<ChecklistTag[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [newTag, setNewTag] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadTags()
  }, [])

  const loadTags = async (query?: string) => {
    try {
      setLoading(true)
      const url = query ? `/api/checklist-tags?q=${encodeURIComponent(query)}` : "/api/checklist-tags"
      const response = await fetch(url, { cache: "no-store" })
      if (!response.ok) throw new Error("Failed to fetch tags")
      const data = await response.json()
      setTags(Array.isArray(data.tags) ? data.tags : [])
    } catch (error) {
      console.error("Error fetching checklist tags", error)
      setTags([])
    } finally {
      setLoading(false)
    }
  }

  const filteredTags = useMemo(() => {
    if (!search.trim()) return tags
    const lookup = search.trim().toLowerCase()
    return tags.filter((tag) => tag.label.toLowerCase().includes(lookup))
  }, [tags, search])

  const handleCreateTag = async () => {
    const label = newTag.trim()
    if (!label) return

    setCreating(true)
    try {
      const response = await fetch("/api/checklist-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || "Failed to create tag")
      }
      setNewTag("")
      await loadTags(search.trim() || undefined)
    } catch (error) {
      console.error("Error creating checklist tag", error)
    } finally {
      setCreating(false)
    }
  }

  const handleApply = (tag: ChecklistTag) => {
    onApplyTag(tag)
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Common checklist tags</p>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tags"
            className="h-8 w-40"
          />
          <Input
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            placeholder="Add new"
            className="h-8 w-40"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                handleCreateTag()
              }
            }}
          />
          <Button type="button" size="sm" onClick={handleCreateTag} disabled={creating}>
            {creating ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading tags…</p>
        ) : filteredTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags found.</p>
        ) : (
          filteredTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="cursor-pointer select-none"
              onDoubleClick={() => handleApply(tag)}
              onClick={() => handleApply(tag)}
              title="Click to apply this tag"
            >
              {tag.label}
            </Badge>
          ))
        )}
      </div>
    </div>
  )
}
