"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Trash2 } from "lucide-react"
import { PROPERTY_SIZE_RANGE_OPTIONS } from "@/lib/property-address"

type Option = { code: string; label: string; order: number; status?: string }

export function SizeRangePanel() {
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<Option[]>([])
  const [saving, startSaving] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/size-range-options', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        const rows: Option[] = Array.isArray(data?.options) ? data.options : []
        setList(rows)
      } catch {
        setList([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const addOrUpdate = (payload: { code: string; label: string; order?: number; status?: 'ACTIVE' | 'INACTIVE' }) => {
    startSaving(async () => {
      setFeedback(null)
      try {
        const res = await fetch('/api/size-range-options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error || 'Failed to save')
        }
        const saved = await res.json()
        setList((prev) => {
          const next = prev.filter((r) => r.code !== saved.code)
          next.push(saved)
          return next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        })
        setFeedback('Saved')
      } catch (e: any) {
        setFeedback(e?.message || 'Failed to save')
      }
    })
  }

  const remove = (code: string) => {
    startSaving(async () => {
      setFeedback(null)
      try {
        const res = await fetch(`/api/size-range-options/${encodeURIComponent(code)}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to delete')
        setList((prev) => prev.filter((r) => r.code !== code))
        setFeedback('Deleted')
      } catch (e: any) {
        setFeedback(e?.message || 'Failed to delete')
      }
    })
  }

  // New row state
  const [showNew, setShowNew] = useState(false)
  const [newCode, setNewCode] = useState<string>("")
  const [newLabel, setNewLabel] = useState<string>("")

  useEffect(() => {
    if (!showNew) return
    // Reset inputs when opening
    setNewCode("")
    setNewLabel("")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNew])

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Property Size (Area)</CardTitle>
        <CardDescription>Manage the list of size ranges. Add new or delete rows.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowNew((v) => !v)}>{showNew ? 'Cancel' : 'Add Size Option'}</Button>
          {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
        </div>

        {showNew && (
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div className="space-y-1">
                <label className="text-sm font-medium">Code</label>
                <Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} placeholder="e.g., RANGE_500_699" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Label</label>
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g., 500–699 sqft" />
              </div>
              <div className="flex items-end">
                <Button size="sm" onClick={() => addOrUpdate({ code: newCode, label: newLabel, order: list.length })} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
                </Button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((row) => (
              <div key={row.code} className="rounded-lg border bg-white p-4 shadow-sm flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-lg font-semibold truncate">{row.label}</p>
                  <p className="text-sm text-muted-foreground font-mono">{row.code}</p>
                </div>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => remove(row.code)} disabled={saving} aria-label="Delete size option">
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
