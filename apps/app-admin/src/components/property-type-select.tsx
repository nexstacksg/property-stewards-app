"use client"

import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

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
  const [selectedSizes, setSelectedSizes] = useState<string[]>([])

  // Static size options (shared defaults)
  const HDB_SIZES = [
    { code: 'HDB_1_ROOM', name: '1 Room' },
    { code: 'HDB_2_ROOM', name: '2 Room' },
    { code: 'HDB_3_ROOM', name: '3 Room' },
    { code: 'HDB_4_ROOM', name: '4 Room' },
    { code: 'HDB_5_ROOM', name: '5 Room' },
    { code: 'HDB_EXECUTIVE', name: 'Executive' },
    { code: 'HDB_JUMBO', name: 'Jumbo' }
  ] as const

  const APARTMENT_SIZES = [
    { code: 'STUDIO', name: 'Studio' },
    { code: 'ONE_BEDROOM', name: '1 Bedroom' },
    { code: 'TWO_BEDROOM', name: '2 Bedroom' },
    { code: 'THREE_BEDROOM', name: '3 Bedroom' },
    { code: 'FOUR_BEDROOM', name: '4 Bedroom' },
    { code: 'PENTHOUSE', name: 'Penthouse' }
  ] as const

  const LANDED_SIZES = [
    { code: 'TERRACE', name: 'Terrace' },
    { code: 'SEMI_DETACHED', name: 'Semi-Detached' },
    { code: 'DETACHED', name: 'Detached' },
    { code: 'BUNGALOW', name: 'Bungalow' },
    { code: 'GOOD_CLASS_BUNGALOW', name: 'Good Class Bungalow' }
  ] as const

  const ALL_SIZE_OPTIONS = [
    { group: 'HDB', options: HDB_SIZES },
    { group: 'Apartment', options: APARTMENT_SIZES },
    { group: 'Landed', options: LANDED_SIZES }
  ]

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
    const trimmed = name.trim()
    const all = [...HDB_SIZES, ...APARTMENT_SIZES, ...LANDED_SIZES]
    const lookup = new Map(all.map((o) => [o.code, o.name]))
    const sizes = selectedSizes.map((code) => ({ code, name: lookup.get(code) || code.replace(/_/g, ' ') }))
    const payload = { name: trimmed, code: trimmed, sizes }
    if (!trimmed || sizes.length === 0) return
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

  const toggleSize = (code: string) => {
    setSelectedSizes((prev) => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const usePreset = (preset: 'HDB' | 'APARTMENT' | 'LANDED' | 'CLEAR') => {
    if (preset === 'CLEAR') { setSelectedSizes([]); return }
    const list = preset === 'HDB' ? HDB_SIZES : preset === 'APARTMENT' ? APARTMENT_SIZES : LANDED_SIZES
    setSelectedSizes(list.map(o => o.code))
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add New Property Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Terrace House" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="shrink-0">Property Sizes</Label>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => usePreset('HDB')}>HDB Preset</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => usePreset('APARTMENT')}>Apartment Preset</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => usePreset('LANDED')}>Landed Preset</Button>
                </div>
              </div>
              <ScrollArea className="h-56 rounded-md border">
                <div className="p-3 space-y-3">
                  {ALL_SIZE_OPTIONS.map(group => (
                    <div key={group.group}>
                      <div className="text-xs text-muted-foreground mb-1">{group.group}</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {group.options.map(opt => (
                          <label key={opt.code} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="rounded"
                              checked={selectedSizes.includes(opt.code)}
                              onChange={() => toggleSize(opt.code)}
                            />
                            <span>{opt.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!name || selectedSizes.length === 0 || saving}>
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
