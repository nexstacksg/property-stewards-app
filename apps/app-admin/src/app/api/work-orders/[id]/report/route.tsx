import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { renderToStream } from '@react-pdf/renderer'
import { Readable } from 'stream'

export const runtime = 'nodejs'

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#0f172a',
    lineHeight: 1.35
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12
  },
  summary: {
    marginBottom: 14
  },
  summaryText: {
    marginBottom: 2
  },
  section: {
    marginBottom: 18
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2
  },
  sectionMeta: {
    fontSize: 10,
    color: '#334155',
    marginBottom: 2
  },
  table: {
    borderWidth: 1,
    borderColor: '#1f2937',
    marginTop: 6
  },
  tableRow: {
    flexDirection: 'row'
  },
  headerRow: {
    backgroundColor: '#f1f5f9'
  },
  headerCell: {
    borderRightWidth: 1,
    borderRightColor: '#1f2937',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    paddingVertical: 6,
    paddingHorizontal: 6,
    justifyContent: 'center'
  },
  cell: {
    borderRightWidth: 1,
    borderRightColor: '#cbd5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 6,
    paddingHorizontal: 6,
    justifyContent: 'center',
    minHeight: 26
  },
  lastColumn: {
    borderRightWidth: 0
  },
  lastRow: {
    borderBottomWidth: 0
  },
  headerText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  cellText: {
    fontSize: 10
  },
  centerText: {
    textAlign: 'center'
  }
})

type TableRow = {
  serial: string
  item: string
  status: string
  remarks: string
}

type TableGroup = {
  location: string
  rows: TableRow[]
}

type Column = {
  label: string
  width: number
  align?: 'left' | 'center'
  getValue: (group: TableGroup, row: TableRow, rowIndex: number) => string
}

const TABLE_COLUMNS: Column[] = [
  {
    label: 'Location',
    width: 140,
    getValue: (group, _row, rowIndex) => (rowIndex === 0 ? group.location : '')
  },
  {
    label: 'S/N',
    width: 40,
    align: 'center',
    getValue: (_group, row) => row.serial
  },
  {
    label: 'Item',
    width: 210,
    getValue: (_group, row) => row.item
  },
  {
    label: 'Status',
    width: 80,
    align: 'center',
    getValue: (_group, row) => row.status
  },
  {
    label: 'Remarks / Defects Noted',
    width: 62,
    getValue: (_group, row) => row.remarks
  }
]

const DEFAULT_STATUS_OPTIONS = 'Good / Fair / Unsatisfactory / N/A'
const DEFAULT_REMARKS_VALUE = 'N/A'

const checklistItemInclude = {
  checklistTasks: {
    orderBy: { name: 'asc' as const },
    include: { entries: true }
  },
  contributions: true
} satisfies Prisma.ContractChecklistItemInclude

const workOrderInclude = {
  inspectors: true,
  contract: {
    include: {
      customer: true,
      address: true,
      contractChecklist: {
        include: {
          items: {
            orderBy: { order: 'asc' },
            include: checklistItemInclude
          }
        }
      }
    }
  },
  checklistItems: {
    orderBy: { order: 'asc' },
    include: checklistItemInclude
  }
} satisfies Prisma.WorkOrderInclude

type ChecklistItemWithRelations = Prisma.ContractChecklistItemGetPayload<{ include: typeof checklistItemInclude }>
type WorkOrderWithRelations = Prisma.WorkOrderGetPayload<{ include: typeof workOrderInclude }>

function tidyTaskName(value: string | null | undefined) {
  if (!value) return 'Task'
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  const verbs = ['check', 'inspect', 'test', 'verify', 'assess', 'review', 'document']
  const matchedVerb = verbs.find((verb) => lower.startsWith(`${verb} `))
  if (matchedVerb) {
    const remainder = trimmed.slice(matchedVerb.length + 1)
    return remainder.charAt(0).toUpperCase() + remainder.slice(1)
  }
  return trimmed
}

function statusLabel(value: string | null | undefined) {
  if (!value) return 'Pending'
  switch (value) {
    case 'COMPLETED': return 'Completed'
    case 'PENDING': return 'Pending'
    case 'GOOD': return 'Good'
    case 'FAIR': return 'Fair'
    case 'UNSATISFACTORY': return 'Unsatisfactory'
    case 'NOT_APPLICABLE': return 'N/A'
    case 'UN_OBSERVABLE': return 'Unobservable'
    default: return value
  }
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

function collectTaskRemarks(item: ChecklistItemWithRelations, taskId: string) {
  const contributions = Array.isArray(item.contributions) ? item.contributions : []
  const remarks = contributions
    .filter((entry) => entry.taskId === taskId)
    .map((entry) => entry.remarks)
    .filter((remark): remark is string => Boolean(remark))
  return remarks.join('; ') || DEFAULT_REMARKS_VALUE
}

function collectStandaloneRemarks(item: ChecklistItemWithRelations) {
  const contributions = Array.isArray(item.contributions) ? item.contributions : []
  const remarks = contributions
    .filter((entry) => !entry.taskId)
    .map((entry) => entry.remarks)
    .filter((remark): remark is string => Boolean(remark))
  return remarks.join('; ') || null
}

function buildGroupForItem(item: ChecklistItemWithRelations, index: number): TableGroup {
  const rows: TableRow[] = []
  const tasks = Array.isArray(item.checklistTasks) ? item.checklistTasks : []
  const serialPrefix = (index + 1).toString()

  if (tasks.length > 0) {
    tasks.forEach((task, taskIndex) => {
      const letter = String.fromCharCode(97 + taskIndex)
      const derivedStatus = statusLabel(task.entries?.[0]?.condition || task.condition || null)
      const status = derivedStatus === 'N/A' ? DEFAULT_STATUS_OPTIONS : derivedStatus
      const remarks = collectTaskRemarks(item, task.id)
      rows.push({
        serial: `${serialPrefix}${letter}.`,
        item: tidyTaskName(task.name) || 'Subtask',
        status,
        remarks: remarks || DEFAULT_REMARKS_VALUE
      })
    })
  } else {
    rows.push({
      serial: `${serialPrefix}a.`,
      item: tidyTaskName(item.name) || 'Checklist Item',
      status: statusLabel(item.status || 'PENDING'),
      remarks: item.remarks || DEFAULT_REMARKS_VALUE
    })
  }

  const standalone = collectStandaloneRemarks(item)
  if (standalone) {
    rows.push({
      serial: `${serialPrefix}R`,
      item: 'Additional Remarks',
      status: 'N/A',
      remarks: standalone
    })
  }

  return {
    location: `${index + 1}. ${item.name || 'Checklist Item'}`,
    rows
  }
}

const ReportDocument = (
  { workOrder, checklistItems }: { workOrder: WorkOrderWithRelations; checklistItems: ChecklistItemWithRelations[] }
) => (
  <Document>
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.title}>Property Stewards Inspection Checklist</Text>
      <View style={styles.summary}>
        <Text style={styles.summaryText}>Work Order ID: {workOrder.id}</Text>
        <Text style={styles.summaryText}>Status: {statusLabel(workOrder.status)}</Text>
        <Text style={styles.summaryText}>
          Scheduled: {formatDateTime(workOrder.scheduledStartDateTime)} – {formatDateTime(workOrder.scheduledEndDateTime)}
        </Text>
        {workOrder.actualStart || workOrder.actualEnd ? (
          <Text style={styles.summaryText}>
            Actual: {formatDateTime(workOrder.actualStart)} – {formatDateTime(workOrder.actualEnd)}
          </Text>
        ) : null}
        {workOrder.inspectors.length > 0 ? (
          <Text style={styles.summaryText}>
            Inspectors: {workOrder.inspectors.map((inspector) => inspector.name).join(', ')}
          </Text>
        ) : null}
        {workOrder.contract?.address ? (
          <Text style={styles.summaryText}>
            Property: {workOrder.contract.address.address} ({workOrder.contract.address.propertyType})
          </Text>
        ) : null}
      </View>

      <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>Checklist Summary</Text>

      {checklistItems.length === 0 ? (
        <Text>No checklist items have been assigned to this work order.</Text>
      ) : (
        checklistItems.map((item, index) => {
          const group = buildGroupForItem(item, index)
          return (
            <View key={item.id ?? `${index}`} style={styles.section} wrap={false}>
              <Text style={styles.sectionTitle}>{group.location}</Text>
              <Text style={styles.sectionMeta}>Status: {statusLabel(item.status || 'PENDING')}</Text>
              {item.remarks ? (
                <Text style={styles.sectionMeta}>Overview: {item.remarks}</Text>
              ) : null}

              <View style={styles.table}>
                <View style={[styles.tableRow, styles.headerRow]}>
                  {TABLE_COLUMNS.map((column, columnIndex) => (
                    <View
                      key={column.label}
                      style={[
                        styles.headerCell,
                        { width: column.width },
                        columnIndex === TABLE_COLUMNS.length - 1 ? styles.lastColumn : null
                      ]}
                    >
                      <Text
                        style={[
                          styles.headerText,
                          column.align === 'center' ? styles.centerText : null
                        ]}
                      >
                        {column.label}
                      </Text>
                    </View>
                  ))}
                </View>

                {group.rows.map((row, rowIndex) => (
                  <View style={styles.tableRow} key={`${row.serial}-${rowIndex}`}>
                    {TABLE_COLUMNS.map((column, columnIndex) => (
                      <View
                        key={`${column.label}-${rowIndex}`}
                        style={[
                          styles.cell,
                          { width: column.width },
                          columnIndex === TABLE_COLUMNS.length - 1 ? styles.lastColumn : null,
                          rowIndex === group.rows.length - 1 ? styles.lastRow : null
                        ]}
                      >
                        <Text
                          style={[
                            styles.cellText,
                            column.align === 'center' ? styles.centerText : null
                          ]}
                        >
                          {column.getValue(group, row, rowIndex)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          )
        })
      )}
    </Page>
  </Document>
)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
      include: workOrderInclude
    }) as WorkOrderWithRelations | null

    if (!workOrder) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
    }

    const checklistItems = workOrder.contract?.contractChecklist?.items?.length
      ? (workOrder.contract.contractChecklist.items as ChecklistItemWithRelations[])
      : (workOrder.checklistItems as ChecklistItemWithRelations[] | undefined) || []

    const nodeStream = await renderToStream(
      <ReportDocument workOrder={workOrder} checklistItems={checklistItems} />
    )
    const webStream = Readable.toWeb(nodeStream as unknown as NodeJS.ReadableStream)

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="work-order-${workOrder.id}.pdf"`
      }
    })
  } catch (error) {
    console.error('Error generating work order report:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
