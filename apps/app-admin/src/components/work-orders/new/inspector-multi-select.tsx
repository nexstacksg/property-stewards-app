"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Inspector } from "./types"

interface InspectorMultiSelectProps {
  inspectors: Inspector[]
  selectedInspectorIds: string[]
  loadingInspectors: boolean
  propertyType?: string
  onSelectionChange: (inspectorIds: string[]) => void
}

export function InspectorMultiSelect({
  inspectors,
  selectedInspectorIds,
  loadingInspectors,
  propertyType,
  onSelectionChange
}: InspectorMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [triggerWidth, setTriggerWidth] = useState<number>(0)

  useEffect(() => {
    const update = () => setTriggerWidth(triggerRef.current?.offsetWidth || 0)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const filteredInspectors = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return inspectors
    return inspectors.filter((inspector) => {
      return (
        inspector.name.toLowerCase().includes(trimmed) ||
        inspector.mobilePhone.toLowerCase().includes(trimmed)
      )
    })
  }, [inspectors, query])

  const selectedInspectors = useMemo(() => {
    return inspectors.filter((inspector) => selectedInspectorIds.includes(inspector.id))
  }, [inspectors, selectedInspectorIds])

  const buttonLabel = useMemo(() => {
    if (loadingInspectors) return "Loading inspectors..."
    if (selectedInspectors.length === 0) return "Select inspectors"
    const names = selectedInspectors.map((inspector) => inspector.name)
    return names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2} more` : "")
  }, [loadingInspectors, selectedInspectors])

  const toggleInspector = (id: string) => {
    onSelectionChange(
      selectedInspectorIds.includes(id)
        ? selectedInspectorIds.filter((currentId) => currentId !== id)
        : [...selectedInspectorIds, id]
    )
  }

  const clearSelection = () => onSelectionChange([])

  return (
    <div className="space-y-2">
      <Label>Assign Inspectors *</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            ref={triggerRef}
            disabled={loadingInspectors}
          >
            {buttonLabel}
            <span className="text-muted-foreground">▾</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          style={{ width: triggerWidth }}
          className="p-3"
        >
          <div className="space-y-3">
            <div className="relative">
              <Input
                placeholder="Search by name or phone"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pr-8"
              />
              <Search className="h-4 w-4 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2" />
            </div>
            <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
              {loadingInspectors ? (
                <div className="p-3 text-sm text-muted-foreground">Loading inspectors...</div>
              ) : inspectors.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No inspectors available</div>
              ) : (
                filteredInspectors.map((inspector) => {
                  const checked = selectedInspectorIds.includes(inspector.id)
                  const specialized =
                    propertyType && inspector.specialization?.includes(propertyType)
                  return (
                    <label
                      key={inspector.id}
                      className="flex items-center justify-between gap-3 p-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={checked}
                          onChange={() => toggleInspector(inspector.id)}
                        />
                        <div>
                          <p className="text-sm font-medium">
                            {inspector.name} <span className="text-xs text-muted-foreground">({inspector.type})</span>
                          </p>
                          <p className="text-xs text-muted-foreground">{inspector.mobilePhone}</p>
                        </div>
                      </div>
                      {specialized && <span className="text-xs text-green-600">✓ Specialized</span>}
                    </label>
                  )
                })
              )}
            </div>
            <div className="flex justify-between pt-1">
              <Button type="button" variant="ghost" onClick={clearSelection}>
                Clear selection
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {selectedInspectorIds.length === 0 && (
        <p className="text-xs text-destructive">Select at least one inspector</p>
      )}
    </div>
  )
}
