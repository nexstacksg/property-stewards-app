"use client"

import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

type Property = { id: string; code: string; name: string }

interface Props {
  value: string
  onChange: (code: string) => void
  placeholder?: string
}

const ADD_NEW_VALUE = '__add_new__'

export default function PropertyTypeSelect({ value, onChange, placeholder }: Props) {
  const [options, setOptions] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/properties')
        const data = await res.json()
        setOptions(data)
      } catch (e) {
        console.error('Failed fetching properties', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSelect = (val: string) => {
    if (val === ADD_NEW_VALUE) {
      setName('')
      setAddOpen(true)
      return
    }
    onChange(val)
  }

  const handleCreate = async () => {
    const payload = { name: name.trim(), code: name.trim() }
    if (!payload.name) return
    setSaving(true)
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create property')
      // Update options, select the new one
      setOptions((prev) => [...prev, data])
      onChange(data.code)
      setAddOpen(false)
    } catch (e) {
      console.error(e)
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Select value={value} onValueChange={handleSelect}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((p) => (
            <SelectItem key={p.id} value={p.code}>{p.name}</SelectItem>
          ))}
          <div className="my-1 border-t" />
          <SelectItem value={ADD_NEW_VALUE}>+ Add new property type</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Property Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Terrace House" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!name || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
