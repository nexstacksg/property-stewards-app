"use client"

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

type ChecklistItem = { item: string; description: string; category: string; isRequired: boolean; order: number }

type Props = {
  items: ChecklistItem[]
  editingItems: ChecklistItem[]
}

export function ChecklistPreview({ items, editingItems }: Props) {
  const allItems = [
    ...items,
    ...editingItems.filter(item => item.item.trim() !== '')
  ]

  if (allItems.length === 0) return null

  const categories = Array.from(new Set(allItems.map(item => item.category)))

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-sm">Checklist Preview</CardTitle>
        <CardDescription className="text-xs">How inspectors will see this checklist</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {categories.map(category => {
            const categoryItems = allItems.filter(item => item.category === category)
            return (
              <div key={category}>
                <p className="text-xs font-medium text-orange-600 mb-1">{category}</p>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {categoryItems.map((item, idx) => (
                    <li key={`${category}-${idx}`} className="flex items-start">
                      <span className="text-orange-400 mr-1">•</span>
                      <span className="text-xs">
                        {item.item}
                        {item.isRequired && <span className="text-red-500 ml-0.5">*</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">Total: {allItems.length} items</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

