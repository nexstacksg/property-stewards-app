
import prisma from '@/lib/prisma'
import { Status } from '@prisma/client'
import { cacheDel } from '@/lib/memcache'
import type { ChatSessionState } from '@/lib/chat-session'
import { getSessionState, updateSessionState } from '@/lib/chat-session'
import {
  getTodayJobsForInspector,
  getWorkOrderById,
  updateWorkOrderStatus,
  getTasksByLocation,
  getLocationsWithCompletionStatus,
  getChecklistLocationsForItem,
  getInspectorByPhone,
  updateWorkOrderDetails,
  completeAllTasksForLocation,
  getWorkOrderProgress,
  getContractChecklistItemIdByLocation,
  getTaskMedia as getTaskMediaService,
  refreshChecklistItemCache,
  refreshChecklistItemsForWorkOrder
} from '@/lib/services/inspectorService'
import { resolveInspectorIdForSession } from './utils'

export const assistantTools = [
  {
    type: 'function' as const,
    function: {
      name: 'getTodayJobs',
      description: "Get today's inspection jobs",
      parameters: {
        type: 'object',
        properties: {
          inspectorId: { type: 'string' },
          inspectorPhone: { type: 'string' },
          reset: { type: 'boolean', description: 'If true, clear job/location/task context and set lastMenu=jobs' }
        },
        required: []
      }
    }
  },
  { type: 'function' as const, function: { name: 'confirmJobSelection', description: 'Confirm job selection and show job details', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'startJob', description: 'Start the job', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'getJobLocations', description: 'Get locations for inspection', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'setLocationCondition', description: 'Set condition for the current location by number (1=Good,2=Fair,3=Un-Satisfactory,4=Un-Observable,5=Not Applicable,)', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, location: { type: 'string' }, conditionNumber: { type: 'number' } }, required: ['workOrderId', 'conditionNumber'] } } },
  { type: 'function' as const, function: { name: 'addLocationRemarks', description: 'Save remarks for current location and create/update an ItemEntry for the inspector', parameters: { type: 'object', properties: { remarks: { type: 'string' } }, required: ['remarks'] } } },
  { type: 'function' as const, function: { name: 'getSubLocations', description: 'Get sub-locations for a checklist item', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, contractChecklistItemId: { type: 'string' }, locationName: { type: 'string' } }, required: ['workOrderId', 'contractChecklistItemId'] } } },
  { type: 'function' as const, function: { name: 'getTasksForLocation', description: 'Get tasks for a location', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, location: { type: 'string' }, contractChecklistItemId: { type: 'string' }, subLocationId: { type: 'string' } }, required: ['workOrderId', 'location'] } } },
  { type: 'function' as const, function: { name: 'setSubLocationConditions', description: 'Set conditions for all tasks under a specific sub-location in one message. Does not complete tasks.', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, contractChecklistItemId: { type: 'string' }, subLocationId: { type: 'string' }, conditionsText: { type: 'string', description: 'User input like "1 Good, 2 Good, 3 Fair" or "Good Good Fair"' } }, required: ['workOrderId', 'contractChecklistItemId', 'subLocationId', 'conditionsText'] } } },
  { type: 'function' as const, function: { name: 'setSubLocationCause', description: 'Capture cause text for the current sub-location flow', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, contractChecklistItemId: { type: 'string' }, subLocationId: { type: 'string' }, cause: { type: 'string' } }, required: ['workOrderId', 'contractChecklistItemId', 'subLocationId', 'cause'] } } },
  { type: 'function' as const, function: { name: 'setSubLocationResolution', description: 'Capture resolution text for the current sub-location flow', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, contractChecklistItemId: { type: 'string' }, subLocationId: { type: 'string' }, resolution: { type: 'string' } }, required: ['workOrderId', 'contractChecklistItemId', 'subLocationId', 'resolution'] } } },
  { type: 'function' as const, function: { name: 'setSubLocationCauseResolution', description: 'Capture both cause and resolution in one message for the current sub-location flow', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, contractChecklistItemId: { type: 'string' }, subLocationId: { type: 'string' }, text: { type: 'string' } }, required: ['workOrderId', 'contractChecklistItemId', 'subLocationId', 'text'] } } },
  { type: 'function' as const, function: { name: 'setSubLocationRemarks', description: 'Create/update a remark entry at the sub-location level (stored in ItemEntry at item level, tagged in text). Returns entryId for attaching media.', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, contractChecklistItemId: { type: 'string' }, subLocationId: { type: 'string' }, subLocationName: { type: 'string' }, remarks: { type: 'string' } }, required: ['workOrderId', 'contractChecklistItemId', 'subLocationId', 'remarks'] } } },
  {
    type: 'function' as const,
    function: {
      name: 'completeTask',
      description: 'Handle per-task completion workflow (condition → media → remarks)',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          workOrderId: { type: 'string' },
          notes: { type: 'string' },
          phase: { type: 'string', enum: ['start', 'set_condition', 'skip_media', 'set_remarks', 'finalize'] },
          conditionNumber: { type: 'number' },
          remarks: { type: 'string' },
          completed: { type: 'boolean' }
        },
        required: ['workOrderId']
      }
    }
  },
  { type: 'function' as const, function: { name: 'updateJobDetails', description: 'Update job details', parameters: { type: 'object', properties: { jobId: { type: 'string' }, updateType: { type: 'string', enum: ['customer', 'address', 'time', 'status'] }, newValue: { type: 'string' } }, required: ['jobId', 'updateType', 'newValue'] } } },
  { type: 'function' as const, function: { name: 'collectInspectorInfo', description: 'Collect and validate inspector name and phone number for identification', parameters: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' } }, required: ['name', 'phone'] } } },
  { type: 'function' as const, function: { name: 'getTaskMedia', description: 'Get photos and videos for a specific task', parameters: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] } } },
  { type: 'function' as const, function: { name: 'getLocationMedia', description: 'Get photos and videos for a specific location by selection number or name', parameters: { type: 'object', properties: { locationNumber: { type: 'number' }, locationName: { type: 'string' }, workOrderId: { type: 'string' } }, required: ['workOrderId'] } } },
  { type: 'function' as const, function: { name: 'markLocationComplete', description: 'Mark a location (ContractChecklistItem) complete when all tasks are done', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, contractChecklistItemId: { type: 'string' } }, required: ['workOrderId', 'contractChecklistItemId'] } } }
  ,{ type: 'function' as const, function: { name: 'markSubLocationComplete', description: 'Mark a sub-location (ContractChecklistLocation) complete', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, contractChecklistItemId: { type: 'string' }, subLocationId: { type: 'string' } }, required: ['workOrderId', 'contractChecklistItemId', 'subLocationId'] } } }
]

export async function executeTool(toolName: string, args: any, threadId?: string, sessionId?: string): Promise<string> {
  try {
    const dbgOn = (process.env.WHATSAPP_DEBUG || '').toLowerCase()
    const dbg = (...a: any[]) => { if (dbgOn === 'true' || dbgOn === 'verbose') console.log('[wh-tool]', ...a) }
    let metadata: ChatSessionState = {}
    if (sessionId) metadata = await getSessionState(sessionId)

    switch (toolName) {
      case 'getTodayJobs': {
        const t0 = Date.now()
        const { inspectorId, inspectorPhone } = args
        let finalInspectorId = metadata.inspectorId

        // Normalize inputs
        const candidate = typeof inspectorId === 'string' ? inspectorId.trim() : ''
        const looksLikeId = /^[a-z0-9]{20,}$/i.test(candidate)
        const hasSpaces = /\s/.test(candidate)
        const candidateName = !looksLikeId || hasSpaces ? candidate : ''
        const rawPhone = typeof inspectorPhone === 'string' ? inspectorPhone.replace(/[\s-]/g, '') : ''
        // Build robust phone candidates without forcing +65 for non-SG numbers
        const phoneCandidates: string[] = []
        if (rawPhone) phoneCandidates.push(rawPhone)
        if (rawPhone && !rawPhone.startsWith('+')) phoneCandidates.push('+' + rawPhone)
        // If looks like an 8-digit SG local number, also try +65 prefix
        if (/^\d{8}$/.test(rawPhone)) phoneCandidates.push('+65' + rawPhone)
        // If begins with '65' and 10 digits, also try with '+'
        if (/^65\d{8}$/.test(rawPhone)) phoneCandidates.push('+' + rawPhone)
        // Remove leading zeros variant
        if (/^0+\d+$/.test(rawPhone)) phoneCandidates.push(rawPhone.replace(/^0+/, ''))

        // Combined name+phone resolution if both provided
        if (!finalInspectorId && candidateName && rawPhone) {
          try {
            const variants = [rawPhone, rawPhone.startsWith('+') ? rawPhone.slice(1) : ('+' + rawPhone)]
            const found = await prisma.inspector.findFirst({ where: { status: Status.ACTIVE, name: { equals: candidateName, mode: 'insensitive' }, OR: variants.map(v => ({ mobilePhone: v })) }, select: { id: true, name: true, mobilePhone: true } })
            if (found?.id) {
              finalInspectorId = found.id
              if (sessionId) await updateSessionState(sessionId, { inspectorId: found.id, inspectorName: found.name, inspectorPhone: found.mobilePhone || inspectorPhone })
            }
          } catch {}
        }

        // If explicit id looks valid, accept
        if (!finalInspectorId && looksLikeId && !hasSpaces) finalInspectorId = candidate

        // Resolve by phone if needed
        if (!finalInspectorId && phoneCandidates.length > 0) {
          const tried = new Set<string>()
          for (const p of phoneCandidates) {
            if (!p || tried.has(p)) continue
            tried.add(p)
            const match = await getInspectorByPhone(p) as any
            if (match) {
              finalInspectorId = match.id
              if (sessionId) await updateSessionState(sessionId, { inspectorId: match.id, inspectorName: match.name, inspectorPhone: match.mobilePhone || p })
              break
            }
          }
        }

        // Resolve by name if needed
        if (!finalInspectorId && candidateName) {
          try {
            const byName = await prisma.inspector.findFirst({ where: { status: Status.ACTIVE, name: { equals: candidateName, mode: 'insensitive' } }, select: { id: true, name: true, mobilePhone: true } })
            if (byName?.id) {
              finalInspectorId = byName.id
              if (sessionId) await updateSessionState(sessionId, { inspectorId: byName.id, inspectorName: byName.name, inspectorPhone: byName.mobilePhone })
            }
          } catch {}
        }

        if (!finalInspectorId) {
          if (sessionId) await updateSessionState(sessionId, { inspectorId: undefined })
          return JSON.stringify({ success: false, identifyRequired: true, nextAction: 'collectInspectorInfo' })
        }
        const jobs = await getTodayJobsForInspector(finalInspectorId) as any[]
        // // Reset stale inspection context and mark lastMenu for numeric routing
        // if (sessionId) {
        //   try {
        //     await updateSessionState(sessionId, {
        //       // keep identity, reset job and inspection context
        //       jobStatus: 'none',
        //       workOrderId: undefined,
        //       customerName: undefined,
        //       propertyAddress: undefined,
        //       postalCode: undefined,
        //       currentLocation: undefined,
        //       currentLocationId: undefined,
        //       currentSubLocationId: undefined,
        //       currentSubLocationName: undefined,
        //       currentItemId: undefined,
        //       currentTaskId: undefined,
        //       currentTaskName: undefined,
        //       currentTaskItemId: undefined,
        //       currentTaskEntryId: undefined,
        //       currentTaskCondition: undefined,
        //       currentTaskLocationId: undefined,
        //       currentTaskLocationName: undefined,
        //       currentLocationCondition: undefined,
        //       taskFlowStage: undefined,
        //       pendingTaskRemarks: undefined,
        //       pendingTaskCause: undefined,
        //       pendingTaskResolution: undefined,
        //       locationSubLocations: undefined,
        //       lastMenu: 'jobs',
        //       lastMenuAt: new Date().toISOString(),
        //     })
        //   } catch {}
        // }
        dbg('getTodayJobs', { tookMs: Date.now() - t0, count: jobs.length, inspectorId: finalInspectorId })
        const jobsFormatted = jobs.map((job: any, index: number) => {
          const raw = job.scheduled_date
          const date = raw instanceof Date ? raw : (raw ? new Date(raw) : null)
          const time = date ? date.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''
          return {
            id: job.id,
            jobNumber: index + 1,
            selectionNumber: `[${index + 1}]`,
            property: job.property_address,
            customer: job.customer_name,
            time,
            status: job.status,
            priority: job.priority
          }
        })
        return JSON.stringify({ success: true, jobs: jobsFormatted, count: jobs.length })
      }
      case 'confirmJobSelection': {
        const t0 = Date.now()
        const workOrder = await getWorkOrderById(args.jobId) as any
        dbg('confirmJobSelection', { tookMs: Date.now() - t0, jobId: args.jobId, found: !!workOrder })
        if (!workOrder) return JSON.stringify({ success: false, error: 'Job not found' })
        if (sessionId) {
          const postalCodeMatch = workOrder.property_address.match(/\b(\d{6})\b/)
          const updatedMetadata: Partial<ChatSessionState> = {
            workOrderId: args.jobId,
            customerName: workOrder.customer_name,
            propertyAddress: workOrder.property_address,
            postalCode: postalCodeMatch ? (postalCodeMatch[1] as string) : 'unknown',
            jobStatus: 'confirming',
            lastMenu: 'confirm',
            lastMenuAt: new Date().toISOString(),
            // Reset inspection context for a clean start
          }
          await updateSessionState(sessionId, updatedMetadata)
        }
        return JSON.stringify({
          success: true,
          confirmationRequired: true,
          prompt: 'Please confirm the destination details before starting the inspection.',
          options: [
            { value: 'confirm_yes', label: '[1] Yes' },
            { value: 'confirm_no', label: '[2] No' }
          ],
          jobDetails: {
            id: args.jobId,
            property: workOrder.property_address,
            customer: workOrder.customer_name,
            time: workOrder.scheduled_start.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true }),
            status: workOrder.status
          }
        })
      }
      case 'startJob': {
        // Guard: only allow after an explicit confirmation step
        if (sessionId) {
          const s = await getSessionState(sessionId)
          if (s?.jobStatus !== 'confirming') {
            return JSON.stringify({ success: false, error: 'Please confirm the destination first. Reply [1] Yes or [2] No to the confirmation prompt.' })
          }
        }
        const perf = process.env.WHATSAPP_PERF_LOG === 'true'
        const t0 = Date.now()
        // Resolve a valid work order id robustly to avoid P2025
        let targetJobId: string | undefined = args.jobId
        try {
          if ((!targetJobId || typeof targetJobId !== 'string' || targetJobId.trim().length === 0) && sessionId) {
            const s = await getSessionState(sessionId)
            if (s?.workOrderId) targetJobId = s.workOrderId
          }
          // If still ambiguous or not found, try to map selection numbers to real ids from today's jobs
          let exists = null as null | { id: string }
          if (targetJobId) {
            exists = await prisma.workOrder.findUnique({ where: { id: targetJobId }, select: { id: true } }) as any
          }
          const looksLikeSelection = targetJobId && /^\s*\d+\s*$/.test(targetJobId)
          if (!exists && (looksLikeSelection || !targetJobId) && sessionId) {
            const s = await getSessionState(sessionId)
            const inspectorId = s?.inspectorId
            if (inspectorId) {
              const jobs = await getTodayJobsForInspector(inspectorId) as any[]
              if (Array.isArray(jobs) && jobs.length > 0) {
                if (looksLikeSelection) {
                  const idx = Math.max(1, Number((targetJobId as string).trim())) - 1
                  const chosen = jobs[idx]
                  if (chosen?.id) targetJobId = chosen.id
                }
                // If still not found, but a previous confirmation stored the id, keep it
              }
            }
            if (targetJobId) exists = await prisma.workOrder.findUnique({ where: { id: targetJobId }, select: { id: true } }) as any
          }
          if (!targetJobId || !exists) {
            return JSON.stringify({ success: false, error: 'Invalid or unknown job id. Please pick a job again.' })
          }
        } catch (e) {
          console.error('startJob: failed to resolve job id', e)
          return JSON.stringify({ success: false, error: 'Failed to resolve job id' })
        }

        await updateWorkOrderStatus(targetJobId, 'in_progress')
        if (perf) console.log('[perf] tool:startJob updateWorkOrderStatus:', Date.now() - t0, 'ms')
        dbg('startJob:status-updated', { jobId: targetJobId })
        if (sessionId) {
          await updateSessionState(sessionId, { jobStatus: 'started' })
          try {
            const s = await getSessionState(sessionId)
            if (!s.inspectorId) {
              const wo = await prisma.workOrder.findUnique({ where: { id: targetJobId }, select: { inspectors: { select: { id: true } } } }) as any
              const derived = wo?.inspectors?.[0]?.id
              if (derived) await updateSessionState(sessionId, { inspectorId: derived })
            }
          } catch {}
        }
        const t1 = Date.now()
        const includeProgress = (process.env.WHATSAPP_PROGRESS_ON_START ?? 'false').toLowerCase() !== 'false'
        const [locations, progress] = await Promise.all([
          getLocationsWithCompletionStatus(targetJobId) as Promise<any[]>,
          includeProgress ? (getWorkOrderProgress(targetJobId) as Promise<any>) : Promise.resolve(null)
        ])
        dbg('startJob:locations-loaded', { locations: locations.length, includeProgress })
        if (perf) console.log('[perf] tool:startJob locations:', Date.now() - t1, 'ms', 'includeProgress=', includeProgress)
        if (sessionId) {
          try { await updateSessionState(sessionId, { lastMenu: 'locations', lastMenuAt: new Date().toISOString() }) } catch {}
        }
        const locationsFormatted = locations.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
        return JSON.stringify({ success: true, locations: locations.map(loc => loc.displayName), locationsFormatted, locationsDetail: locations, progress })
      }
      case 'getJobLocations': {
        // Guard: only after job has been started
        if (sessionId) {
          const s = await getSessionState(sessionId)
          if (s?.jobStatus !== 'started') {
            return JSON.stringify({ success: false, error: 'Please start the job first (confirm the destination and reply [1]).' })
          }
        }
        const { jobId } = args
        const locationsWithStatus = await getLocationsWithCompletionStatus(jobId) as any[]
        const locationsFormatted = locationsWithStatus.map((loc, index) => `[${index + 1}] ${loc.isCompleted ? `${loc.name} (Done)` : loc.name}`)
        const nextPrompt = 'Reply with the number of the location you want to inspect next.'
        if (sessionId) {
          const subLocationMap: Record<string, Array<{ id: string; name: string; status: string }>> = {}
          for (const loc of locationsWithStatus) {
            if (Array.isArray(loc.subLocations) && loc.subLocations.length > 0) {
              subLocationMap[loc.contractChecklistItemId] = loc.subLocations.map((sub: any) => ({
                id: sub.id,
                name: sub.name,
                status: sub.status
              }))
            }
          }
          await updateSessionState(sessionId, {
            locationSubLocations: Object.keys(subLocationMap).length > 0 ? subLocationMap : undefined,
            lastMenu: 'locations',
            lastMenuAt: new Date().toISOString()
          })
        }
        return JSON.stringify({
          success: true,
          locations: locationsWithStatus.map((loc, index) => ({
            number: index + 1,
            name: loc.name,
            displayName: loc.displayName,
            contractChecklistItemId: loc.contractChecklistItemId,
            status: loc.isCompleted ? 'completed' : (loc.completedTasks > 0 ? 'in_progress' : 'pending'),
            tasks: loc.totalTasks,
            completed: loc.completedTasks,
            pending: loc.totalTasks - loc.completedTasks,
            subLocations: Array.isArray(loc.subLocations) ? loc.subLocations : []
          })),
          locationsFormatted,
          nextPrompt
        })
      }
      case 'getSubLocations': {
        // Guard: only after job has been started
        if (sessionId) {
          const s = await getSessionState(sessionId)
          if (s?.jobStatus !== 'started') {
            return JSON.stringify({ success: false, error: 'Please start the job first (confirm the destination and reply [1]).' })
          }
        }
        const { workOrderId, contractChecklistItemId, locationName } = args
        const subLocations = await getChecklistLocationsForItem(contractChecklistItemId) as any[]
        let derivedName = locationName as string | undefined
        if (!derivedName) {
          try {
            const item = await prisma.contractChecklistItem.findUnique({ where: { id: contractChecklistItemId }, select: { name: true } })
            derivedName = item?.name || undefined
          } catch {}
        }
        if (sessionId) {
          await updateSessionState(sessionId, {
            currentLocation: derivedName,
            currentLocationId: contractChecklistItemId,
            currentSubLocationId: undefined,
            currentSubLocationName: undefined,
            currentTaskId: undefined,
            currentTaskName: undefined,
            currentTaskItemId: contractChecklistItemId,
            currentTaskEntryId: undefined,
            currentTaskCondition: undefined,
            currentTaskLocationId: undefined,
            currentTaskLocationName: undefined,
            taskFlowStage: undefined,
            lastMenu: 'sublocations',
            lastMenuAt: new Date().toISOString()
          })
        }
        if (subLocations.length === 0) {
          return JSON.stringify({ success: true, subLocations: [], subLocationsFormatted: [], nextPrompt: 'No sub-locations found. Proceed to task selection.' })
        }
        const formatted = subLocations.map((loc: any, index: number) => ({
          id: loc.id,
          number: index + 1,
          name: loc.name,
          status: loc.status,
          totalTasks: loc.totalTasks,
          completedTasks: loc.completedTasks
        }))
        const formattedStrings = formatted.map(loc => `[${loc.number}] ${loc.name}${loc.status === 'completed' ? ' (Done)' : ''}`)
        return JSON.stringify({ success: true, subLocations: formatted, subLocationsFormatted: formattedStrings, nextPrompt: 'Reply with the sub-location number you want to inspect.' })
      }
      case 'getTasksForLocation': {
        // Guard: only after job has been started
        if (sessionId) {
          const s = await getSessionState(sessionId)
          if (s?.jobStatus !== 'started') {
            return JSON.stringify({ success: false, error: 'Please start the job first (confirm the destination and reply [1]).' })
          }
        }
        const { workOrderId, location, contractChecklistItemId, subLocationId } = args
        let effectiveSubLocationId = subLocationId as string | undefined
        let subLocationOptions: Array<{ id: string; name: string; status: string }> | undefined
        if (sessionId) {
          await updateSessionState(sessionId, {
            currentLocation: location,
            currentLocationId: contractChecklistItemId,
            currentSubLocationId: subLocationId || undefined,
            currentSubLocationName: undefined,
            currentTaskId: undefined,
            currentTaskName: undefined,
            currentTaskEntryId: undefined,
            currentTaskCondition: undefined,
            // enter sub-location condition collection by default
            taskFlowStage: 'condition',
            lastMenu: 'tasks',
            lastMenuAt: new Date().toISOString()
          })
          const latest = await getSessionState(sessionId)
          const lookup = (latest as any).locationSubLocations as Record<string, Array<{ id: string; name: string; status: string }>> | undefined
          if (lookup && contractChecklistItemId && lookup[contractChecklistItemId]) {
            subLocationOptions = lookup[contractChecklistItemId]
            if (!effectiveSubLocationId && Array.isArray(subLocationOptions)) {
              const activeOptions = subLocationOptions.filter(option => option.status !== 'completed')
              const candidates = activeOptions.length > 0 ? activeOptions : subLocationOptions
              if (candidates.length === 1) {
                effectiveSubLocationId = candidates[0].id
                await updateSessionState(sessionId, {
                  currentSubLocationId: candidates[0].id,
                  currentSubLocationName: candidates[0].name
                })
              }
            }
          }
        }
        if (!effectiveSubLocationId && Array.isArray(subLocationOptions) && subLocationOptions.length > 1) {
          const formattedStrings = subLocationOptions.map((loc, index) => `[${index + 1}] ${loc.name}${loc.status === 'completed' ? ' (Done)' : ''}`)
          return JSON.stringify({ success: false, requiresSubLocationSelection: true, subLocations: subLocationOptions.map((loc, index) => ({ id: loc.id, number: index + 1, name: loc.name, status: loc.status })), subLocationsFormatted: formattedStrings, message: 'Select a sub-location before inspecting the tasks.' })
        }

        const tasks = await getTasksByLocation(workOrderId, location, contractChecklistItemId, effectiveSubLocationId) as any[]
        const formattedTasks = tasks.map((task: any, index: number) => {
          const prefix = task.locationName && task.locationName !== location ? `${task.locationName}: ` : ''
          return {
            id: task.id,
            number: index + 1,
            description: (task.action ? `${prefix}${task.action}` : `Check ${location.toLowerCase()} condition`),
            status: task.status,
            displayStatus: task.status === 'completed' ? 'done' : 'pending',
            notes: task.notes || null,
            locationId: task.locationId,
            locationName: task.locationName
          }
        })
        const completedTasksInLocation = formattedTasks.filter((t: any) => t.status === 'completed').length
        const totalTasksInLocation = formattedTasks.length
        const allTasksCompleted = completedTasksInLocation === totalTasksInLocation && totalTasksInLocation > 0
        const tasksFormatted = formattedTasks.map((t: any) => `[${t.number}] ${t.description}${t.displayStatus === 'done' ? ' (Done)' : ''}`)
        const markCompleteNumber = allTasksCompleted ? (formattedTasks.length + 1) : null
        const goBackNumber = allTasksCompleted ? (formattedTasks.length + 2) : (formattedTasks.length + 1)
        // New flow: prompt for bulk conditions entry for sub-location instead of per-task selection
        const nextPrompt = `Please go through the checklist for ${effectiveSubLocationId ? (formattedTasks[0]?.locationName || location) : location}.

Reply in ONE message with the condition for each item in order, e.g.:
"1 Good, 2 Good, 3 Fair" or "Good Good Fair".

You can omit any numbers you want to leave unset.`
        const firstTask = tasks[0]
        if (sessionId && firstTask?.locationId) {
          await updateSessionState(sessionId, {
            currentSubLocationId: firstTask.locationId,
            currentSubLocationName: firstTask.locationName
          })
        }
        return JSON.stringify({
          success: true,
          location,
          allTasksCompleted,
          tasks: formattedTasks,
          tasksFormatted,
          markCompleteNumber,
          goBackNumber,
          locationProgress: { completed: completedTasksInLocation, total: totalTasksInLocation },
          locationNotes: tasks.length > 0 && firstTask?.notes ? firstTask.notes : null,
          locationStatus: tasks.length > 0 && firstTask?.locationStatus === 'completed' ? 'done' : 'pending',
          nextPrompt
        })
      }
      case 'setSubLocationConditions': {
        const { workOrderId, contractChecklistItemId, subLocationId, conditionsText } = args
        if (!workOrderId || !contractChecklistItemId || !subLocationId || !conditionsText) {
          return JSON.stringify({ success: false, error: 'Missing required parameters' })
        }
        // Load tasks for that sub-location in stable order
        const tasks = await prisma.checklistTask.findMany({
          where: { locationId: subLocationId },
          orderBy: { createdOn: 'asc' },
          select: { id: true, name: true }
        })
        if (tasks.length === 0) return JSON.stringify({ success: false, error: 'No tasks found for this sub-location.' })

        const normalize = (s: string) => s.trim().toLowerCase()
        const mapWord = (w: string): string | null => {
          const t = normalize(w)
          const canon = t.replace(/[^a-z]/g, '')
          // Numeric shortcuts
          if (t === '1') return 'GOOD'
          if (t === '2') return 'FAIR'
          if (t === '3') return 'UNSATISFACTORY'
          if (t === '4') return 'UN_OBSERVABLE'
          if (t === '5') return 'NOT_APPLICABLE'
          // Textual variants (accept hyphens/spaces/punctuation)
          if (canon === 'good' || t === 'g' || t === 'ok' || t === 'okay') return 'GOOD'
          if (canon === 'fair' || t === 'f') return 'FAIR'
          if (canon.startsWith('unsatisfactory') || canon.startsWith('unsat') || canon === 'poor' || canon === 'bad') return 'UNSATISFACTORY'
          if (canon === 'unobservable' || canon === 'unobserved') return 'UN_OBSERVABLE'
          if (canon === 'notapplicable' || t.includes('not applicable') || t === 'na' || t === 'n/a') return 'NOT_APPLICABLE'
          return null
        }
        const text = String(conditionsText || '')
        const pairs: Array<{ index: number; cond: string }> = []
        // Enumerated pairs: "1 Good", "2: Fair", etc.
        const re = /(\d{1,2})\s*[:.)-]?\s*([a-zA-Z/\- _]+|[1-5])/g
        let m: RegExpExecArray | null
        while ((m = re.exec(text)) !== null) {
          const idx = Number(m[1])
          const cond = mapWord(m[2])
          if (idx >= 1 && idx <= tasks.length && cond) pairs.push({ index: idx, cond })
        }
        if (pairs.length === 0) {
          // Try bare list: "Good, Good, Fair"
          const words = text.split(/[\s,;\n]+/).filter(Boolean)
          let pos = 1
          for (const w of words) {
            const cond = mapWord(w)
            if (!cond) continue
            if (pos > tasks.length) break
            pairs.push({ index: pos, cond })
            pos++
          }
        }
        if (pairs.length === 0) {
          const allowed = 'Good, Fair, Un-Satisfactory, Un-Observable, Not Applicable'
          return JSON.stringify({ success: false, error: `No valid conditions detected. Reply like "1 Good, 2 Good, 3 Fair" or "Good Good Fair". Allowed values: ${allowed}. You can send any natural phrasing; I will interpret each in order.` })
        }
        // Deduplicate by last occurrence per index
        const byIndex = new Map<number, string>()
        for (const p of pairs) byIndex.set(p.index, p.cond)
        const updates: Array<{ number: number; taskId: string; name: string; condition: string }> = []
        let i = 1
        for (const t of tasks) {
          if (byIndex.has(i)) {
            const cond = byIndex.get(i)!
            try { await prisma.checklistTask.update({ where: { id: t.id }, data: { condition: cond as any } }) } catch (e) { console.error('setSubLocationConditions: update failed', e) }
            updates.push({ number: i, taskId: t.id, name: t.name, condition: cond })
          }
          i++
        }
        try { await refreshChecklistItemCache(contractChecklistItemId) } catch {}
        const hasIssues = updates.some(u => u.condition === 'FAIR' || u.condition === 'UNSATISFACTORY')
        if (sessionId) {
          await updateSessionState(sessionId, { taskFlowStage: hasIssues ? 'cause' : 'remarks', currentTaskId: undefined, currentTaskName: undefined, currentTaskEntryId: undefined, currentTaskItemId: contractChecklistItemId })
        }
        // Resolve sub-location name for a nicer message
        let subName = ''
        try {
          const loc = await prisma.contractChecklistLocation.findUnique({ where: { id: subLocationId }, select: { name: true } })
          subName = loc?.name || ''
        } catch {}
        const lines: string[] = []
        lines.push(`✅ Conditions updated${subName ? ` for ${subName}` : ''}.`)
        if (updates.length > 0) {
          for (const u of updates) lines.push(`- [${u.number}] ${u.name}: ${u.condition}`)
        }
        lines.push('')
        if (hasIssues) {
          lines.push('Please provide the cause and resolution in ONE message. For example:')
          lines.push('1: misaligned hinges, 2: re-adjusted and tightened hinges')
          lines.push('or')
          lines.push('Cause: misaligned hinges  Resolution: re-adjusted and tightened hinges')
        } else {
          lines.push('Next: please enter your remarks for this sub-location (a short sentence is fine).')
        }
        return JSON.stringify({ success: true, updatedCount: updates.length, requiresCause: hasIssues, message: lines.join('\\n') })
      }
      case 'setSubLocationCauseResolution': {
        const { workOrderId, contractChecklistItemId, subLocationId, text } = args
        if (!workOrderId || !contractChecklistItemId || !subLocationId || !text) return JSON.stringify({ success: false, error: 'Missing required parameters' })
        const raw = String(text)
        const extract = () => {
          // Prefer explicit labels first
          let causeMatch = /cause\s*[:\-]\s*([^]+?)(?=resolution\s*[:\-]|$)/i.exec(raw)
          let resMatch = /resolution\s*[:\-]\s*([^]+)$/i.exec(raw)
          let cause = causeMatch ? causeMatch[1].trim() : undefined
          let resolution = resMatch ? resMatch[1].trim() : undefined
          // Support numeric labels: 1: <cause>, 2: <resolution>
          if (!cause || !resolution) {
            const nCause = /(?:^|[\s,;])1\s*[:\-]\s*([^]+?)(?=(?:^|[\s,;])2\s*[:\-]|$)/i.exec(raw)
            const nRes = /(?:^|[\s,;])2\s*[:\-]\s*([^]+)$/i.exec(raw)
            if (nCause && !cause) cause = nCause[1].trim()
            if (nRes && !resolution) resolution = nRes[1].trim()
          }
          // Fallback: split by comma/semicolon/newline into two parts
          if ((!cause || !resolution)) {
            const parts = raw.split(/[\n;]+|,(?=(?:\s*[^\)]*\)|[^\(]*$))/).map(s => s.trim()).filter(Boolean)
            if (parts.length >= 2) {
              if (!cause) cause = parts[0]
              if (!resolution) resolution = parts[1]
            }
          }
          return { cause, resolution }
        }
        const { cause, resolution } = extract()
        if (!cause && !resolution) {
          return JSON.stringify({ success: false, error: 'Please send both in one message. Try "1: <cause>, 2: <resolution>" or "Cause: ... Resolution: ..."' })
        }
        if (sessionId) {
          await updateSessionState(sessionId, {
            pendingTaskCause: cause || undefined,
            pendingTaskResolution: resolution || undefined,
            taskFlowStage: 'remarks'
          })
        }
        return JSON.stringify({ success: true, message: 'Thanks. Cause and resolution saved. Please enter the remarks for this sub-location.' })
      }
      case 'setSubLocationCause': {
        const { workOrderId, contractChecklistItemId, subLocationId, cause } = args
        if (!workOrderId || !contractChecklistItemId || !subLocationId || !cause) return JSON.stringify({ success: false, error: 'Missing required parameters' })
        if (sessionId) {
          await updateSessionState(sessionId, { pendingTaskCause: String(cause).trim(), taskFlowStage: 'resolution' })
        }
        return JSON.stringify({ success: true, message: 'Thanks. Please provide the resolution.' })
      }
      case 'setSubLocationResolution': {
        const { workOrderId, contractChecklistItemId, subLocationId, resolution } = args
        if (!workOrderId || !contractChecklistItemId || !subLocationId || !resolution) return JSON.stringify({ success: false, error: 'Missing required parameters' })
        if (sessionId) {
          await updateSessionState(sessionId, { pendingTaskResolution: String(resolution).trim(), taskFlowStage: 'remarks' })
        }
        return JSON.stringify({ success: true, message: 'Resolution saved. Please enter the remarks for this sub-location.' })
      }
      case 'setSubLocationRemarks': {
        const { workOrderId, contractChecklistItemId, subLocationId, subLocationName, remarks } = args
        if (!workOrderId || !contractChecklistItemId || !subLocationId || !remarks) return JSON.stringify({ success: false, error: 'Missing required parameters' })
        let inspectorId: string | null = null
        if (sessionId) {
          const s = await getSessionState(sessionId)
          inspectorId = s.inspectorId || null
          if (!inspectorId) {
            inspectorId = await resolveInspectorIdForSession(sessionId, s as any, workOrderId, s.inspectorPhone || sessionId)
          }
        }
        // Create a new ItemEntry at item level, tagged in the remarks header with the sub-location name
        const prefix = subLocationName ? `[${subLocationName}] ` : ''
        // If cause/resolution were captured earlier in the sub-location flow, persist them on creation
        let cause: string | undefined
        let resolution: string | undefined
        try {
          if (sessionId) {
            const s = await getSessionState(sessionId)
            cause = s.pendingTaskCause || undefined
            resolution = s.pendingTaskResolution || undefined
          }
        } catch {}
        const entry = await prisma.itemEntry.create({ data: { itemId: contractChecklistItemId, inspectorId: inspectorId || undefined, locationId: subLocationId, remarks: `${prefix}${remarks}`, cause, resolution } as any })
        try { await refreshChecklistItemCache(contractChecklistItemId) } catch {}
        if (sessionId) {
          await updateSessionState(sessionId, { currentTaskEntryId: entry.id, currentTaskItemId: contractChecklistItemId, taskFlowStage: 'media', pendingTaskCause: undefined, pendingTaskResolution: undefined })
        }
        const whereName = subLocationName || 'this sub-location'
        return JSON.stringify({ success: true, entryId: entry.id, message: `📝 Remarks saved for ${whereName}.\n\nNext: please provide photos/videos (captions will be saved per media).` })
      }
      case 'markLocationComplete': {
        const { workOrderId, contractChecklistItemId } = args
        if (!workOrderId || !contractChecklistItemId) return JSON.stringify({ success: false, error: 'Missing location context' })
        // Validate all tasks complete for this item
        try {
          const tasks = await getTasksByLocation(workOrderId, '', contractChecklistItemId, undefined) as any[]
          const total = tasks.length
          const done = tasks.filter(t => t.status === 'completed').length
          if (!(total > 0 && total === done)) {
            return JSON.stringify({ success: false, error: 'Location cannot be marked complete yet — some tasks are still pending.' })
          }
        } catch (e) {
          console.error('markLocationComplete: failed to load tasks', e)
        }
        // Update item status
        try {
          const s = sessionId ? await getSessionState(sessionId) : ({} as ChatSessionState)
          const exist = await prisma.contractChecklistItem.findUnique({ where: { id: contractChecklistItemId }, select: { id: true } })
          if (!exist) return JSON.stringify({ success: false, error: 'Checklist item not found.' })
          await prisma.contractChecklistItem.update({
            where: { id: contractChecklistItemId },
            data: { status: 'COMPLETED', enteredOn: new Date(), enteredById: s.inspectorId || undefined }
          })
          // Refresh caches so subsequent reads reflect the latest status without a full cold miss
          try {
            await refreshChecklistItemCache(contractChecklistItemId)
            await refreshChecklistItemsForWorkOrder(workOrderId)
          } catch (e) { console.error('markLocationComplete: refresh cache failed', e) }
          // Keep session context consistent with UI flow
          if (sessionId) {
            try {
              await updateSessionState(sessionId, {
                // remain in locations menu after mark-complete
                lastMenu: 'locations',
                lastMenuAt: new Date().toISOString(),
                // clear task context if it belonged to this location
                currentTaskId: s.currentTaskId && s.currentTaskItemId === contractChecklistItemId ? undefined : s.currentTaskId,
                currentTaskName: s.currentTaskId && s.currentTaskItemId === contractChecklistItemId ? undefined : s.currentTaskName,
                currentTaskEntryId: s.currentTaskId && s.currentTaskItemId === contractChecklistItemId ? undefined : s.currentTaskEntryId,
                taskFlowStage: s.currentTaskId && s.currentTaskItemId === contractChecklistItemId ? undefined : s.taskFlowStage
              })
            } catch {}
          }
          // Return an updated locations list to ensure the UI can refresh immediately
          try {
            const refreshed = await getLocationsWithCompletionStatus(workOrderId) as any[]
            const locationsFormatted = refreshed.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
            return JSON.stringify({ success: true, message: '✅ Location marked complete.', locationsFormatted })
          } catch {
            return JSON.stringify({ success: true, message: '✅ Location marked complete.' })
          }
        } catch (error) {
          console.error('markLocationComplete: failed to update item', error)
          return JSON.stringify({ success: false, error: 'Failed to mark location complete.' })
        }
      }
      case 'markSubLocationComplete': {
        const { workOrderId, contractChecklistItemId, subLocationId } = args
        if (!workOrderId || !contractChecklistItemId || !subLocationId) {
          return JSON.stringify({ success: false, error: 'Missing sub-location context' })
        }
        try {
          const loc = await prisma.contractChecklistLocation.findUnique({ where: { id: subLocationId }, select: { id: true, itemId: true, name: true } })
          if (!loc || loc.itemId !== contractChecklistItemId) {
            return JSON.stringify({ success: false, error: 'Sub-location not found for this location.' })
          }
          await prisma.contractChecklistLocation.update({ where: { id: subLocationId }, data: { status: 'COMPLETED' } })
          // If all sub-locations for the item are completed, mark the item completed as well
          try {
            const remainingForItem = await prisma.contractChecklistLocation.count({ where: { itemId: contractChecklistItemId, status: { not: 'COMPLETED' } } })
            if (remainingForItem === 0) {
              await prisma.contractChecklistItem.update({ where: { id: contractChecklistItemId }, data: { status: 'COMPLETED', enteredOn: new Date() } })
            }
          } catch (e) { console.error('markSubLocationComplete: failed to update parent item status', e) }
          try {
            await refreshChecklistItemCache(contractChecklistItemId)
            await refreshChecklistItemsForWorkOrder(workOrderId)
            // Invalidate per-item cache so subsequent reads reflect latest status
            try { await cacheDel(`mc:contract-checklist-items:item:${contractChecklistItemId}`) } catch {}
          } catch (e) { console.error('markSubLocationComplete: cache refresh failed', e) }
          // Return refreshed sub-locations for UI, prefixed with completion message
          try {
            const subLocations = await getChecklistLocationsForItem(contractChecklistItemId) as any[]
            const formattedStrings = (subLocations || []).map((l: any, i: number) => `[${i + 1}] ${l.name}${l.status === 'completed' ? ' (Done)' : ''}`)
            const name = loc?.name || 'This area'
            return JSON.stringify({ success: true, message: `✅ ${name} marked complete.`, subLocations, subLocationsFormatted: formattedStrings, nextPrompt: 'Reply with your sub-location choice, or pick another area.' })
          } catch {
            const name = loc?.name || 'This area'
            return JSON.stringify({ success: true, message: `✅ ${name} marked complete.` })
          }
        } catch (error) {
          console.error('markSubLocationComplete: failed', error)
          return JSON.stringify({ success: false, error: 'Failed to mark sub-location complete.' })
        }
      }
      case 'completeTask': {
        const phase = (args.phase as string | undefined) || 'start'
        const workOrderId = args.workOrderId as string | undefined
        if (!workOrderId) return JSON.stringify({ success: false, error: 'Missing work order context' })
        const session = sessionId ? await getSessionState(sessionId) : ({} as ChatSessionState)

        const mapCondition = (num?: number) => {
          const lookup: Record<number, string> = { 1: 'GOOD', 2: 'FAIR', 3: 'UNSATISFACTORY', 4: 'UN_OBSERVABLE', 5: 'NOT_APPLICABLE' }
          return num ? lookup[num] : undefined
        }

        if (phase === 'start') {
          const taskId = args.taskId as string | undefined
          if (!taskId) return JSON.stringify({ success: false, error: 'Missing task identifier' })
          // 'complete_all_tasks' flow disabled by request
          if (taskId === 'complete_all_tasks') {
            return JSON.stringify({ success: false, error: 'Bulk complete is disabled. Please complete tasks individually or use Go back.' })
          }

          const task = await prisma.checklistTask.findUnique({ where: { id: taskId }, select: { id: true, name: true, itemId: true, locationId: true, location: { select: { name: true } } } })
          let taskName = task?.name
          let taskItemId = task?.itemId

          if (!task) {
            const item = await prisma.contractChecklistItem.findUnique({ where: { id: taskId }, select: { id: true, name: true } })
            if (!item) return JSON.stringify({ success: false, error: 'Task not found' })
            taskName = item.name
            taskItemId = item.id
          }

          if (sessionId) {
            await updateSessionState(sessionId, {
              currentTaskId: taskId,
              currentTaskName: taskName,
              currentTaskItemId: taskItemId,
              // Avoid duplicating sub-location context — rely on currentSubLocationId/Name
              currentTaskLocationId: undefined,
              currentTaskLocationName: undefined,
              currentTaskEntryId: undefined,
              currentTaskCondition: undefined,
              taskFlowStage: 'condition'
            })

            try {
              const inspectorForEntry = session.inspectorId
              if (taskItemId && inspectorForEntry && task?.id) {
                const orphan = await prisma.itemEntry.findFirst({ where: { itemId: taskItemId, inspectorId: inspectorForEntry, taskId: null }, orderBy: { createdOn: 'desc' } })
                if (orphan) {
                  await prisma.itemEntry.update({ where: { id: orphan.id }, data: { taskId: task.id } })
                  await updateSessionState(sessionId, { currentTaskEntryId: orphan.id })
                }
              }
            } catch (error) {
              console.error('Failed to link existing item entry to task', error)
            }
          }

          dbg('completeTask:start', { taskId, taskName, taskItemId, locationId: task?.locationId })
          return JSON.stringify({ success: true, taskFlowStage: 'condition', taskName })
        }

        if (phase === 'set_condition') {
          const condition = mapCondition(Number(args.conditionNumber))
          if (!condition) return JSON.stringify({ success: false, error: 'Invalid condition number. Please use 1-5.' })
          const taskId = (args.taskId as string | undefined) || session.currentTaskId
          const taskItemId = session.currentTaskItemId
          let taskLocationId = session.currentTaskLocationId as string | undefined
          // Prefer sub-location context if available; do not mirror into currentTaskLocationId to avoid duplication
          if (!taskLocationId && session.currentSubLocationId) {
            taskLocationId = session.currentSubLocationId
          }
          if (!taskLocationId && taskId) {
            try {
              const lookup = await prisma.checklistTask.findUnique({ where: { id: taskId }, select: { locationId: true } })
              taskLocationId = lookup?.locationId || undefined
              // Do not persist currentTaskLocationId to avoid duplicating sub-location state
            } catch (error) {
              console.error('Failed to load task location for condition phase', error)
            }
          }
          if (!taskId || !taskItemId) {
            return JSON.stringify({ success: false, error: 'Task context missing. Please restart the task completion flow.' })
          }

          let inspectorId = session.inspectorId || null
          if (!inspectorId && sessionId) inspectorId = await resolveInspectorIdForSession(sessionId, session, workOrderId, session.inspectorPhone || sessionId)

          let entryId = session.currentTaskEntryId || null
          if (!entryId && inspectorId) {
            const existingEntry = await prisma.itemEntry.findFirst({ where: { taskId, inspectorId } })
            entryId = existingEntry?.id || null
          }
          if (!entryId && inspectorId && taskItemId) {
            const orphan = await prisma.itemEntry.findFirst({ where: { itemId: taskItemId, inspectorId, taskId: null }, orderBy: { createdOn: 'desc' } })
            if (orphan) {
              await prisma.itemEntry.update({ where: { id: orphan.id }, data: { taskId } })
              entryId = orphan.id
            }
          }

          if (entryId) {
            await prisma.itemEntry.update({ where: { id: entryId }, data: { condition: condition as any, inspectorId: inspectorId || undefined } })
          }

          try {
            await prisma.checklistTask.update({ where: { id: taskId }, data: { condition: condition as any } })
          } catch (error) {
            console.error('Failed to persist checklist task condition', error)
          }

          if (sessionId) {
            // If FAIR or UNSATISFACTORY, branch to cause -> resolution -> remarks -> media
            const nextStage = (condition === 'FAIR' || condition === 'UNSATISFACTORY') ? 'cause' : 'remarks'
            await updateSessionState(sessionId, { currentTaskEntryId: entryId || undefined, currentTaskCondition: condition, taskFlowStage: nextStage, pendingTaskCause: undefined, pendingTaskResolution: undefined })
            dbg('completeTask:set_condition', { taskId, condition, nextStage })
            if (nextStage === 'cause') {
              return JSON.stringify({ success: true, taskFlowStage: 'cause', message: 'Please describe the cause for this issue.' })
            }
          }

          return JSON.stringify({ success: true, taskFlowStage: 'remarks', condition })
        }

        if (phase === 'set_cause') {
          if (!sessionId) return JSON.stringify({ success: false, error: 'Session required for capturing cause' })
          const causeRaw = String(args.cause ?? args.remarks ?? args.notes ?? '').trim()
          if (!causeRaw) return JSON.stringify({ success: false, error: 'Please provide a brief cause description.' })
          try {
            const latest = await getSessionState(sessionId)
            const taskId = latest.currentTaskId
            const taskItemId = latest.currentTaskItemId
            let entryId = latest.currentTaskEntryId
            if (taskId && taskItemId) {
              if (!entryId) {
                const locId = latest.currentTaskLocationId || latest.currentSubLocationId || undefined
                const created = await prisma.itemEntry.create({ data: { taskId, itemId: taskItemId, inspectorId: latest.inspectorId || undefined, locationId: locId, condition: (latest.currentTaskCondition as any) || undefined, cause: causeRaw } as any })
                entryId = created.id
              } else {
                await prisma.itemEntry.update({ where: { id: entryId }, data: { cause: causeRaw } })
              }
              await updateSessionState(sessionId, { currentTaskEntryId: entryId })
            }
          } catch (e) { console.error('Failed to persist cause to item entry', e) }
          await updateSessionState(sessionId, { pendingTaskCause: causeRaw, taskFlowStage: 'resolution' })
          return JSON.stringify({ success: true, taskFlowStage: 'resolution', message: 'Thanks. Please provide the resolution.' })
        }

        if (phase === 'set_resolution') {
          if (!sessionId) return JSON.stringify({ success: false, error: 'Session required for capturing resolution' })
          const resolutionRaw = String(args.resolution ?? args.remarks ?? args.notes ?? '').trim()
          if (!resolutionRaw) return JSON.stringify({ success: false, error: 'Please provide a brief resolution description.' })
          const latest = await getSessionState(sessionId)
          const taskId = latest.currentTaskId
          const taskItemId = latest.currentTaskItemId
          let entryId = latest.currentTaskEntryId
          let inspectorId = latest.inspectorId || null
          if (!taskId || !taskItemId) return JSON.stringify({ success: false, error: 'Task context missing. Please restart the task completion flow.' })
          if (!inspectorId) inspectorId = await resolveInspectorIdForSession(sessionId, latest, workOrderId, latest.inspectorPhone || sessionId)
          if (!entryId && inspectorId) {
            const orphan = await prisma.itemEntry.findFirst({ where: { itemId: taskItemId, inspectorId, taskId: null }, orderBy: { createdOn: 'desc' } })
            if (orphan) entryId = orphan.id
          }
          // Create or update entry with explicit fields only; do not inject default 'Cause'/'Resolution' text into remarks.
          if (!entryId) {
            const locId = latest.currentTaskLocationId || latest.currentSubLocationId || undefined
            const created = await prisma.itemEntry.create({
              data: {
                taskId,
                itemId: taskItemId,
                inspectorId: inspectorId || undefined,
                locationId: locId,
                condition: (latest.currentTaskCondition as any) || undefined,
                // Persist resolution and optional cause separately
                cause: latest.pendingTaskCause || undefined,
                resolution: resolutionRaw
              } as any
            })
            entryId = created.id
          } else {
            const updateData: any = { resolution: resolutionRaw }
            if (latest.pendingTaskCause) updateData.cause = latest.pendingTaskCause
            await prisma.itemEntry.update({ where: { id: entryId }, data: updateData })
          }
          await updateSessionState(sessionId, { currentTaskEntryId: entryId, pendingTaskCause: undefined, pendingTaskResolution: undefined, taskFlowStage: 'remarks' })
          const condUpper = String(latest.currentTaskCondition || '').toUpperCase()
          const msg = condUpper === 'NOT_APPLICABLE'
            ? 'Resolution saved. Please add any remarks for this task (or type \"skip\").'
            : 'Resolution saved. Please add remarks for this task.'
          return JSON.stringify({ success: true, taskFlowStage: 'remarks', message: msg })
        }

        if (phase === 'skip_media') {
          if (!sessionId) return JSON.stringify({ success: false, error: 'Session required to skip media.' })
          const latest = await getSessionState(sessionId)
          const cond = (latest.currentTaskCondition || '').toUpperCase()
          if (cond !== 'NOT_APPLICABLE') {
            return JSON.stringify({ success: false, error: 'Media is required for this condition. Please send at least one photo (you can add remarks as a caption).' })
          }
          await updateSessionState(sessionId, { taskFlowStage: 'confirm', pendingTaskRemarks: undefined })
          return JSON.stringify({ success: true, taskFlowStage: 'confirm', mediaSkipped: true, message: 'Okay, skipping media for this Not Applicable condition.\n\nNext: reply [1] if this task is complete, [2] if you still have more to do for it.' })
        }

        if (phase === 'set_remarks') {
          const taskId = (args.taskId as string | undefined) || session.currentTaskId
          const taskItemId = session.currentTaskItemId
          if (!taskId || !taskItemId) return JSON.stringify({ success: false, error: 'Task context missing. Please restart the task completion flow.' })

          const remarksRaw = (args.remarks ?? args.notes ?? '') as string
          const remarks = remarksRaw.trim()
          const condUpper = (session.currentTaskCondition || '').toUpperCase()
          const allowSkip = condUpper === 'NOT_APPLICABLE'
          const shouldSkipRemarks = allowSkip && (!remarks || remarks.toLowerCase() === 'skip' || remarks.toLowerCase() === 'no')

          let inspectorId = session.inspectorId || null
          if (!inspectorId && sessionId) inspectorId = await resolveInspectorIdForSession(sessionId, session, workOrderId, session.inspectorPhone || sessionId)

          let entryId = session.currentTaskEntryId
          if (!entryId && inspectorId) {
            const orphan = await prisma.itemEntry.findFirst({ where: { itemId: taskItemId, inspectorId, taskId: null }, orderBy: { createdOn: 'desc' } })
            if (orphan) {
              await prisma.itemEntry.update({ where: { id: orphan.id }, data: { taskId, condition: (session.currentTaskCondition as any) || undefined, remarks: shouldSkipRemarks ? null : remarks || null } })
              entryId = orphan.id
            }
          }

          if (!entryId) {
            const locId = session.currentTaskLocationId || session.currentSubLocationId || undefined
            const created = await prisma.itemEntry.create({ data: { taskId, itemId: taskItemId, inspectorId, locationId: locId, condition: (session.currentTaskCondition as any) || undefined, remarks: shouldSkipRemarks ? null : remarks || null } as any })
            entryId = created.id
          } else if (!shouldSkipRemarks) {
            await prisma.itemEntry.update({ where: { id: entryId }, data: { remarks } })
          }

          if (shouldSkipRemarks && entryId && remarks) {
            await prisma.itemEntry.update({ where: { id: entryId }, data: { remarks: null } })
          }

          if (sessionId) {
            await updateSessionState(sessionId, {
              taskFlowStage: 'media',
              currentTaskEntryId: entryId || undefined,
              pendingTaskRemarks: shouldSkipRemarks ? undefined : (remarks || undefined)
            })
          }

          const nextMsg = allowSkip
            ? 'Thanks. You can now send photos/videos (captions will be saved per media), or type \"skip\" to continue.'
            : 'Thanks. Please send photos/videos now (captions will be saved per media).'
          return JSON.stringify({ success: true, taskFlowStage: 'media', message: nextMsg })
        }

        if (phase === 'finalize') {
          const taskId = (args.taskId as string | undefined) || session.currentTaskId
          const taskItemId = session.currentTaskItemId
          const taskLocationId = session.currentTaskLocationId
          if (!taskId || !taskItemId) return JSON.stringify({ success: false, error: 'Task context missing. Please restart the task completion flow.' })

          if (typeof args.completed !== 'boolean') {
            return JSON.stringify({ success: false, error: 'Missing completion decision. Provide completed=true or completed=false.' })
          }

          const completed = args.completed

          let inspectorId = session.inspectorId || null
          if (!inspectorId && sessionId) inspectorId = await resolveInspectorIdForSession(sessionId, session, workOrderId, session.inspectorPhone || sessionId)

          const condition = session.currentTaskCondition || 'GOOD'
          let entryId = session.currentTaskEntryId

          let task = await prisma.checklistTask.findUnique({ where: { id: taskId }, select: { id: true, itemId: true, inspectorId: true, locationId: true, name: true } })
          let targetItemId = task?.itemId || taskItemId

          if (task) {
            await prisma.checklistTask.update({
              where: { id: taskId },
              data: {
                status: completed ? 'COMPLETED' : 'PENDING',
                condition: condition as any,
                inspectorId: inspectorId || task.inspectorId,
                updatedOn: new Date()
              }
            })
            if (task.locationId) {
              try {
                const remainingForLocation = await prisma.checklistTask.count({ where: { locationId: task.locationId, status: { not: 'COMPLETED' } } })
                await prisma.contractChecklistLocation.update({
                  where: { id: task.locationId },
                  data: {
                    status: remainingForLocation === 0 ? 'COMPLETED' : 'PENDING'
                  }
                })
              } catch (error) {
                console.error('Failed to update checklist location status', error)
              }
            }
          } else {
            // Treat taskId as a possible contractChecklistItem id (no checklistTask found)
            const itemCheck = await prisma.contractChecklistItem.findUnique({ where: { id: taskId }, select: { id: true } })
            if (!itemCheck) {
              console.error('finalize: neither checklistTask nor checklistItem found', { taskId })
              return JSON.stringify({ success: false, error: 'Task not found for completion.' })
            }
            await prisma.contractChecklistItem.update({
              where: { id: taskId },
              data: {
                status: completed ? 'COMPLETED' : 'PENDING',
                condition: condition as any,
                enteredOn: completed ? new Date() : null,
                enteredById: inspectorId || undefined
              }
            })
            }

          let entryRecord: { photos?: string[]; remarks?: string | null; cause?: string | null; resolution?: string | null } | null = null
          if (entryId) {
            try {
              entryRecord = await prisma.itemEntry.findUnique({ where: { id: entryId }, select: { photos: true, remarks: true, cause: true, resolution: true } })
            } catch (error) {
              console.error('Failed to load entry for validation', error)
            }
          }

          if (completed) {
            dbg('completeTask:finalize start', { taskId, targetItemId, entryId, condition, locationId: task?.locationId })
            const requiresPhoto = condition !== 'NOT_APPLICABLE'
            const requiresCauseResolution = condition === 'FAIR' || condition === 'UNSATISFACTORY'
            const photoCount = entryRecord?.photos?.length ?? 0
            let causeText = entryRecord?.cause?.trim() ?? ''
            let resolutionText = entryRecord?.resolution?.trim() ?? ''
            if ((!causeText || !resolutionText) && entryRecord?.remarks) {
              try {
                const m = entryRecord.remarks.match(/Cause:\s*(.*)\nResolution:\s*(.*)/i)
                if (m) {
                  causeText = causeText || m[1].trim()
                  resolutionText = resolutionText || m[2].trim()
                }
              } catch {}
            }
            if ((!causeText || !resolutionText) && sessionId) {
              try {
                const latest2 = await getSessionState(sessionId)
                if (!causeText && latest2.pendingTaskCause) causeText = latest2.pendingTaskCause
                if (!resolutionText && latest2.pendingTaskResolution) resolutionText = latest2.pendingTaskResolution
              } catch {}
            }

            if (requiresPhoto && photoCount === 0) {
              return JSON.stringify({ success: false, error: 'Please send at least one photo for this status before marking the task complete.' })
            }

            if (requiresCauseResolution && (!causeText || !resolutionText)) {
              return JSON.stringify({ success: false, error: 'Please provide both cause and resolution before marking the task complete.' })
            }

            if (!targetItemId) {
              console.error('finalize: missing targetItemId for completion', { taskId })
              return JSON.stringify({ success: false, error: 'Unable to derive checklist item for this task.' })
            }
            const itemExists = await prisma.contractChecklistItem.findUnique({ where: { id: targetItemId }, select: { id: true } })
            if (!itemExists) {
              console.error('finalize: contractChecklistItem not found', { targetItemId, taskId })
              return JSON.stringify({ success: false, error: 'Checklist location not found for this task.' })
            }
            // Create an ItemEntry as a fallback if none exists yet
            if (!entryId) {
              try {
                const locId = task?.locationId || session.currentTaskLocationId || session.currentSubLocationId || undefined
                const created = await prisma.itemEntry.create({ data: { taskId, itemId: targetItemId, inspectorId: inspectorId || undefined, locationId: locId, condition: condition as any, remarks: entryRecord?.remarks || undefined, cause: causeText || undefined, resolution: resolutionText || undefined } as any })
                entryId = created.id
              } catch (e) { console.error('completeTask:finalize failed to create fallback ItemEntry', e) }
            }

            const remaining = await prisma.checklistTask.count({ where: { itemId: targetItemId, status: { not: 'COMPLETED' } } })
            await prisma.contractChecklistItem.update({
              where: { id: targetItemId },
              data: {
                status: remaining === 0 ? 'COMPLETED' : 'PENDING',
                enteredOn: remaining === 0 ? new Date() : null
              }
            })
            if (task?.locationId) {
              try {
                const remainingForLocation = await prisma.checklistTask.count({ where: { locationId: task.locationId, status: { not: 'COMPLETED' } } })
                await prisma.contractChecklistLocation.update({
                  where: { id: task.locationId },
                  data: {
                    status: remainingForLocation === 0 ? 'COMPLETED' : 'PENDING'
                  }
                })
              } catch (error) {
                console.error('Failed to update checklist location status after completion', error)
              }
            }
          } else {
            if (targetItemId) {
              try {
                await prisma.contractChecklistItem.update({ where: { id: targetItemId }, data: { status: 'PENDING' } })
              } catch (e) {
                console.error('finalize: failed to reset contractChecklistItem status', { targetItemId, error: e })
              }
            }
            if (task?.locationId) {
              try {
                await prisma.contractChecklistLocation.update({ where: { id: task.locationId }, data: { status: 'PENDING' } })
              } catch (error) {
                console.error('Failed to reset checklist location status', error)
              }
            }
          }

          if (entryId) {
            await prisma.itemEntry.update({
              where: { id: entryId },
              data: {
                condition: condition as any,
                inspectorId: inspectorId || undefined
              }
            })
          }

          if (sessionId) {
            await updateSessionState(sessionId, {
              taskFlowStage: undefined,
              currentTaskId: undefined,
              currentTaskName: undefined,
              currentTaskEntryId: entryId || undefined,
              currentTaskCondition: undefined,
              currentTaskItemId: targetItemId,
              // avoid duplicating sub-location context when finalizing
              currentTaskLocationId: undefined,
              currentTaskLocationName: undefined,
              pendingTaskRemarks: undefined
            })
          }

          // Invalidate memcache so next task listing reflects completion immediately
          try { await cacheDel('mc:contract-checklist-items:all') } catch {}

          const taskName = task?.name || session.currentTaskName || 'Task'
          if (completed) {
            return JSON.stringify({ success: true, taskCompleted: true, message: `✅ ${taskName} marked complete.` })
          }

          return JSON.stringify({ success: true, taskCompleted: false, message: `✅ ${taskName} updated.` })
        }

        return JSON.stringify({ success: false, error: `Unknown phase: ${phase}` })
      }
      case 'setLocationCondition': {
        const s = sessionId ? await getSessionState(sessionId) : ({} as ChatSessionState)
        const loc = args.location || (s.currentLocation as string) || ''
        if (!loc) return JSON.stringify({ success: false, error: 'No location in context' })
        const map: Record<number, string> = { 1: 'GOOD', 2: 'FAIR', 3: 'UNSATISFACTORY', 4: 'UN_OBSERVABLE', 5: 'NOT_APPLICABLE' }
        const condition = map[Number(args.conditionNumber)]
        if (!condition) return JSON.stringify({ success: false, error: 'Invalid condition number' })
        let itemId = (s as any).currentItemId as string
        if (!itemId) itemId = (await getContractChecklistItemIdByLocation(args.workOrderId, loc)) as any
        if (!itemId) return JSON.stringify({ success: false, error: 'Unable to resolve checklist item' })
        const exists = await prisma.contractChecklistItem.findUnique({ where: { id: itemId }, select: { id: true } })
        if (!exists) return JSON.stringify({ success: false, error: 'Checklist item not found' })
        // Only persist condition; do not mark the entire location complete here
        await prisma.contractChecklistItem.update({ where: { id: itemId }, data: { condition: condition as any } })
        try { await cacheDel('mc:contract-checklist-items:all') } catch {}
        if (sessionId) {
          try { await updateSessionState(sessionId, { currentLocationCondition: condition as any }) } catch {}
        }
        const mediaRequired = condition !== 'GOOD' && condition !== 'NOT_APPLICABLE' && condition !== 'UN_OBSERVABLE'
        const locs2 = await getLocationsWithCompletionStatus(args.workOrderId) as any[]
        const locationsFormatted = locs2.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
        return JSON.stringify({ success: true, condition, mediaRequired, locationsFormatted })
      }
      case 'addLocationRemarks': {
        const s = sessionId ? await getSessionState(sessionId) : ({} as ChatSessionState)
        const inspectorId = (s as any).inspectorId as string
        const itemId = (s as any).currentItemId as string
        if (!inspectorId || !itemId) return JSON.stringify({ success: false, error: 'Missing inspector or item context' })
        const entry = await prisma.itemEntry.create({ data: { itemId, inspectorId, remarks: args.remarks } })
        const workOrderId = (s as any).workOrderId as string
        const locs3 = workOrderId ? (await getLocationsWithCompletionStatus(workOrderId)) as any[] : []
        const locationsFormatted = locs3.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
        return JSON.stringify({ success: true, entryId: entry.id, locationsFormatted })
      }
      case 'updateJobDetails': {
        const updateSuccess = await updateWorkOrderDetails(args.jobId, args.updateType, args.newValue)
        if (updateSuccess && sessionId) {
          try {
            const updates: Partial<ChatSessionState> = {}
            if (args.updateType === 'customer') updates.customerName = args.newValue
            if (args.updateType === 'address') updates.propertyAddress = args.newValue
            if (args.updateType === 'status') {
              const v = String(args.newValue || '').toUpperCase()
              updates.jobStatus = (v === 'STARTED') ? 'started' : (v === 'SCHEDULED' ? 'none' : 'none')
            }
            if (Object.keys(updates).length > 0) {
              await updateSessionState(sessionId, updates)
            }
          } catch (e) {
            console.error('updateJobDetails: failed to update session', e)
          }
        }
        return JSON.stringify({ success: updateSuccess })
      }
      case 'collectInspectorInfo': {
        const { name, phone } = args
        const providedName = String(name || '').trim()
        const providedPhoneRaw = String(phone || '').trim()
        if (!providedName || !providedPhoneRaw) {
          return JSON.stringify({ success: false, error: 'Please provide both your full name and your phone number (with country code).' })
        }
        let normalizedPhone = providedPhoneRaw.replace(/[\s-]/g, '')
        if (!normalizedPhone.startsWith('+')) normalizedPhone = '+65' + normalizedPhone
        const phoneVariants = [normalizedPhone]
        // Add variant without plus for robustness
        const noPlus = normalizedPhone.startsWith('+') ? normalizedPhone.slice(1) : normalizedPhone
        phoneVariants.push(noPlus)

        // Try to resolve a single inspector matching BOTH name (case-insensitive) and phone variants
        let inspector: any = null
        try {
          inspector = await prisma.inspector.findFirst({
            where: {
              status: Status.ACTIVE,
              name: { equals: providedName, mode: 'insensitive' },
              OR: phoneVariants.map(p => ({ mobilePhone: p }))
            },
            select: { id: true, name: true, mobilePhone: true }
          })
        } catch {}

        // If still not found, try by phone first then verify name
        if (!inspector) {
          const byPhone = await getInspectorByPhone(normalizedPhone) as any
          if (byPhone && typeof byPhone.name === 'string' && byPhone.name.localeCompare(providedName, undefined, { sensitivity: 'accent', usage: 'search' }) === 0) {
            inspector = byPhone
          }
        }

        // If still not found, try by name first then verify phone
        if (!inspector) {
          try {
            const byName = await prisma.inspector.findMany({
              where: { status: Status.ACTIVE, name: { equals: providedName, mode: 'insensitive' } },
              select: { id: true, name: true, mobilePhone: true }
            })
            const match = (byName || []).find((i: any) => phoneVariants.includes(i.mobilePhone))
            if (match) inspector = match
          } catch {}
        }

        if (!inspector) {
          return JSON.stringify({ success: false, error: "We couldn't find an inspector matching both the provided name and phone number. Please check both and try again, or contact admin for registration." })
        }

        const finalPhone = inspector.mobilePhone || normalizedPhone
        if (sessionId) {
          await updateSessionState(sessionId, { phoneNumber: finalPhone, inspectorId: inspector.id, inspectorName: inspector.name, inspectorPhone: finalPhone, identifiedAt: new Date().toISOString() })
        }
        return JSON.stringify({ success: true, inspector: { id: inspector.id, name: inspector.name, phone: finalPhone } })
      }
      case 'getTaskMedia': {
        try {
          if (args.taskId === (metadata as any).inspectorId) {
            if ((metadata as any).currentLocation && (metadata as any).workOrderId) {
              const actualTaskId = await getContractChecklistItemIdByLocation((metadata as any).workOrderId!, (metadata as any).currentLocation!)
              if (actualTaskId) {
                const mediaInfo = await getTaskMediaService(actualTaskId) as any
                if (mediaInfo) return JSON.stringify({ success: true, taskId: actualTaskId, taskName: mediaInfo.name, remarks: mediaInfo.remarks, photos: mediaInfo.photos, videos: mediaInfo.videos, photoCount: mediaInfo.photoCount, videoCount: mediaInfo.videoCount })
              }
            }
            return JSON.stringify({ success: false, error: 'Could not find media for the current location. Please make sure you are in a specific room/location first.' })
          }
          const mediaInfo = await getTaskMediaService(args.taskId) as any
          if (!mediaInfo) return JSON.stringify({ success: false, error: 'Task not found or no media available.' })
          return JSON.stringify({ success: true, taskId: args.taskId, taskName: mediaInfo.name, remarks: mediaInfo.remarks, photos: mediaInfo.photos, videos: mediaInfo.videos, photoCount: mediaInfo.photoCount, videoCount: mediaInfo.videoCount })
        } catch (error) {
          console.error('❌ Error in WhatsApp getTaskMedia:', error)
          return JSON.stringify({ success: false, error: 'Failed to get media.' })
        }
      }
      case 'getLocationMedia': {
        try {
          const locationsWithStatus = await getLocationsWithCompletionStatus(args.workOrderId) as any[]
          let targetLocation: any = null
          if (args.locationNumber && args.locationNumber > 0 && args.locationNumber <= locationsWithStatus.length) targetLocation = locationsWithStatus[args.locationNumber - 1]
          else if (args.locationName) targetLocation = locationsWithStatus.find((loc: any) => loc.name.toLowerCase() === args.locationName.toLowerCase())
          if (!targetLocation) return JSON.stringify({ success: false, error: `Location not found. Available locations: ${locationsWithStatus.map((loc: any, index: number) => `[${index + 1}] ${loc.name}`).join(', ')}` })
          const locationMediaInfo = await getTaskMediaService(targetLocation.contractChecklistItemId) as any
          if (!locationMediaInfo) return JSON.stringify({ success: false, error: `No media found for ${targetLocation.name}.` })
          return JSON.stringify({ success: true, location: targetLocation.name, locationNumber: locationsWithStatus.indexOf(targetLocation) + 1, taskId: targetLocation.contractChecklistItemId, taskName: locationMediaInfo.name, remarks: locationMediaInfo.remarks, photos: locationMediaInfo.photos, videos: locationMediaInfo.videos, photoCount: locationMediaInfo.photoCount, videoCount: locationMediaInfo.videoCount })
        } catch (error) {
          console.error('❌ Error in WhatsApp getLocationMedia:', error)
          return JSON.stringify({ success: false, error: 'Failed to get location media.' })
        }
      }
      default:
        return JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` })
    }
  } catch (error) {
    console.error(`Tool execution error for ${toolName}:`, error)
    return JSON.stringify({ success: false, error: 'Tool execution failed' })
  }
}
