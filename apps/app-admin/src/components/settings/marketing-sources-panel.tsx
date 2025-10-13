"use client"

import { useEffect, useState, useTransition } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type MarketingSourceRow = {
  id: string
  code: string
  name: string
  status: string
}

export function MarketingSourcesPanel() {
  const [loading, setLoading] = useState(true)
  const [sources, setSources] = useState<MarketingSourceRow[]>([])
  const [newCode, setNewCode] = useState("")
  const [newName, setNewName] = useState("")
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    void load()
  }, [])

  function normalizeCode(value: string) {
    return String(value).trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_')
  }

  async function load() {
    try {
      setLoading(true)
      const res = await fetch('/api/marketing-sources', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load marketing sources')
      const data = await res.json().catch(() => ({}))
      setSources(Array.isArray(data.sources) ? data.sources : [])
    } catch (e) {
      console.error('load marketing sources failed', e)
      setSources([])
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setNewCode("")
    setNewName("")
    setFeedback(null)
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    const code = normalizeCode(newCode)
    const name = newName.trim()
    if (!code || !name) {
      setFeedback('Code and name are required')
      return
    }
    setFeedback(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/marketing-sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, name })
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setFeedback(data?.error || 'Failed to add source')
          return
        }
        setSources((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
        resetForm()
        setFeedback('Marketing source added')
      } catch (e) {
        console.error('create marketing source failed', e)
        setFeedback('Failed to add source')
      }
    })
  }

  function handleDelete(id: string) {
    if (pending) return
    const confirmed = typeof window === 'undefined' ? true : window.confirm('Delete this marketing source?')
    if (!confirmed) return
    setFeedback(null)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/marketing-sources/${id}`, { method: 'DELETE' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setFeedback(data?.error || 'Failed to remove source')
          return
        }
        setSources((prev) => prev.filter((s) => s.id !== id))
        setFeedback('Marketing source removed')
      } catch (e) {
        console.error('delete marketing source failed', e)
        setFeedback('Failed to remove source')
      }
    })
  }

  const count = sources.length

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Marketing Sources</CardTitle>
              <CardDescription>Values used for the contract marketing source field.</CardDescription>
            </div>
            <Badge variant="outline" className="font-medium">{count} option{count === 1 ? '' : 's'}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : count === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No marketing sources defined.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sources.map((s) => (
                <div key={s.id} className="rounded-lg border bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground uppercase">{s.code}</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(s.id)} aria-label="Delete source">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle>Add Marketing Source</CardTitle>
          <CardDescription>Create a new selectable marketing source for contracts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[2fr_minmax(0,1fr)_auto_auto]" onSubmit={handleCreate}>
            <div className="space-y-1">
              <Label htmlFor="ms-name">Display Name</Label>
              <Input id="ms-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Google" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ms-code">Code</Label>
              <Input id="ms-code" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="GOOGLE" />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" type="submit" disabled={pending || !newName.trim() || !normalizeCode(newCode)}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="sr-only">Add marketing source</span>
              </Button>
              <Button size="sm" type="button" variant="outline" onClick={resetForm} disabled={pending}>Clear</Button>
            </div>
            {feedback && (
              <div className={`self-end text-xs ${feedback.includes('Failed') ? 'text-destructive' : 'text-green-600'}`}>{feedback}</div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

