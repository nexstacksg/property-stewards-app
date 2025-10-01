"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function StatusGuideCard() {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-sm">Status Guide</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>• <strong>Draft:</strong> Initial contract creation</li>
          <li>• <strong>Confirmed:</strong> Customer confirmed</li>
          <li>• <strong>Scheduled:</strong> Work orders created</li>
          <li>• <strong>Completed:</strong> All work done</li>
          <li>• <strong>Terminated:</strong> Contract ended before completion</li>
          <li>• <strong>Cancelled:</strong> Contract cancelled</li>
        </ul>
      </CardContent>
    </Card>
  )
}
