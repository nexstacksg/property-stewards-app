"use client"

import { AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Inspector } from "./types"

interface InspectorScheduleProps {
  inspectors: Inspector[]
  selectedInspectorIds: string[]
  inspectorWorkOrders: Record<string, any[]>
  loadingInspectorJobs: boolean
}

export function InspectorSchedule({
  inspectors,
  selectedInspectorIds,
  inspectorWorkOrders,
  loadingInspectorJobs
}: InspectorScheduleProps) {
  if (selectedInspectorIds.length === 0) return null

  return (
    <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2 text-red-800">
        <AlertCircle className="h-4 w-4" />
        <p className="font-medium">Inspectors' Schedules</p>
      </div>
      {selectedInspectorIds.map((inspectorId) => {
        const inspector = inspectors.find((candidate) => candidate.id === inspectorId)
        const orders = inspectorWorkOrders[inspectorId] || []
        return (
          <div key={inspectorId} className="space-y-2">
            <p className="text-sm font-medium text-red-800">{inspector?.name || "Inspector"}</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-red-800">Date</TableHead>
                    <TableHead className="text-red-800">Time</TableHead>
                    <TableHead className="text-red-800">Customer</TableHead>
                    <TableHead className="text-red-800">Address</TableHead>
                    <TableHead className="text-red-800">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingInspectorJobs && !orders.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        No upcoming jobs
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((workOrder: any) => (
                      <TableRow key={workOrder.id} className="text-sm">
                        <TableCell className="text-red-700">
                          {new Date(workOrder.scheduledStartDateTime).toLocaleDateString("en-SG")}
                        </TableCell>
                        <TableCell className="text-red-700">
                          {new Date(workOrder.scheduledStartDateTime).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
                          {" - "}
                          {new Date(workOrder.scheduledEndDateTime).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell className="text-red-700">{workOrder.contract.customer.name}</TableCell>
                        <TableCell className="text-red-700">{workOrder.contract.address.address}</TableCell>
                        <TableCell>
                          <Badge variant={workOrder.status === "SCHEDULED" ? "info" : "warning"}>
                            {workOrder.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
