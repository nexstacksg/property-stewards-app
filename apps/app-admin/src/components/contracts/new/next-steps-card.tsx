"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function NextStepsCard() {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-sm">Next Steps</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="text-sm space-y-2 text-muted-foreground">
          <li>1. Contract will be created as DRAFT</li>
          <li>2. Add inspection checklists</li>
          <li>3. Create work orders</li>
          <li>4. Assign inspectors</li>
          <li>5. Confirm contract to start</li>
        </ol>
      </CardContent>
    </Card>
  )
}
