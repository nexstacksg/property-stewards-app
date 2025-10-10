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
  getTaskMedia as getTaskMediaService
} from '@/lib/services/inspectorService'
import { resolveInspectorIdForSession } from './utils'

export const assistantTools = [
  {
    type: 'function' as const,
    function: { name: 'getTodayJobs', description: "Get today's inspection jobs", parameters: { type: 'object', properties: { inspectorId: { type: 'string' }, inspectorPhone: { type: 'string' } }, required: [] } }
  },
  { type: 'function' as const, function: { name: 'confirmJobSelection', description: 'Confirm job selection and show job details', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'startJob', description: 'Start the job', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'getJobLocations', description: 'Get locations for inspection', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'setLocationCondition', description: 'Set condition for the current location by number (1=Good,2=Fair,3=Un-Satisfactory,4=Un-Observable,5=Not Applicable,)', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, location: { type: 'string' }, conditionNumber: { type: 'number' } }, required: ['workOrderId', 'conditionNumber'] } } },
  { type: 'function' as const, function: { name: 'addLocationRemarks', description: 'Save remarks for current location and create/update an ItemEntry for the inspector', parameters: { type: 'object', properties: { remarks: { type: 'string' } }, required: ['remarks'] } } },
  { type: 'function' as const, function: { name: 'getSubLocations', description: 'Get sub-locations for a checklist item', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, contractChecklistItemId: { type: 'string' }, locationName: { type: 'string' } }, required: ['workOrderId', 'contractChecklistItemId'] } } },
  { type: 'function' as const, function: { name: 'getTasksForLocation', description: 'Get tasks for a location', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, location: { type: 'string' }, contractChecklistItemId: { type: 'string' }, subLocationId: { type: 'string' } }, required: ['workOrderId', 'location'] } } },
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
        let phone = typeof inspectorPhone === 'string' ? inspectorPhone.replace(/[\s-]/g, '') : ''
        if (phone && !phone.startsWith('+')) phone = '+65' + phone

        // Combined name+phone resolution if both provided
        if (!finalInspectorId && candidateName && phone) {
          try {
            const variants = [phone, phone.startsWith('+') ? phone.slice(1) : ('+' + phone)]
            const found = await prisma.inspector.findFirst({ where: { status: Status.ACTIVE, name: { equals: candidateName, mode: 'insensitive' }, OR: variants.map(v => ({ mobilePhone: v })) }, select: { id: true, name: true, mobilePhone: true } })
            if (found?.id) {
              finalInspectorId = found.id
              if (sessionId) await updateSessionState(sessionId, { inspectorId: found.id, inspectorName: found.name, inspectorPhone: found.mobilePhone || phone })
            }
          } catch {}
        }

        // If explicit id looks valid, accept
        if (!finalInspectorId && looksLikeId && !hasSpaces) finalInspectorId = candidate

        // Resolve by phone if needed
        if (!finalInspectorId && phone) {
          let match = await getInspectorByPhone(phone) as any
          if (!match && phone.startsWith('+')) match = await getInspectorByPhone(phone.slice(1)) as any
          if (!match && !phone.startsWith('+')) match = await getInspectorByPhone('+' + phone) as any
          if (match) {
            finalInspectorId = match.id
            if (sessionId) await updateSessionState(sessionId, { inspectorId: match.id, inspectorName: match.name, inspectorPhone: match.mobilePhone || phone })
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
            lastMenuAt: new Date().toISOString()
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
            taskFlowStage: undefined,
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
        const nextPrompt = allTasksCompleted
          ? `All tasks for ${location} are done. Reply with a task number to review, [${markCompleteNumber}] to mark this location complete, or [${goBackNumber}] to go back.`
          : `Reply with a number to work on a task (or ${goBackNumber} to go back) when you're ready.`
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
          await prisma.contractChecklistItem.update({
            where: { id: contractChecklistItemId },
            data: { status: 'COMPLETED', enteredOn: new Date(), enteredById: s.inspectorId || undefined }
          })
          try { await cacheDel('mc:contract-checklist-items:all') } catch {}
          return JSON.stringify({ success: true, message: '✅ Location marked complete.' })
        } catch (error) {
          console.error('markLocationComplete: failed to update item', error)
          return JSON.stringify({ success: false, error: 'Failed to mark location complete.' })
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
              currentTaskLocationId: task?.locationId || undefined,
              currentTaskLocationName: task?.location?.name || undefined,
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

          return JSON.stringify({ success: true, taskFlowStage: 'condition', taskName })
        }

        if (phase === 'set_condition') {
          const condition = mapCondition(Number(args.conditionNumber))
          if (!condition) return JSON.stringify({ success: false, error: 'Invalid condition number. Please use 1-5.' })
          const taskId = (args.taskId as string | undefined) || session.currentTaskId
          const taskItemId = session.currentTaskItemId
          let taskLocationId = session.currentTaskLocationId as string | undefined
          if (!taskLocationId && taskId) {
            try {
              const lookup = await prisma.checklistTask.findUnique({ where: { id: taskId }, select: { locationId: true } })
              taskLocationId = lookup?.locationId || undefined
              if (taskLocationId && sessionId) {
                await updateSessionState(sessionId, { currentTaskLocationId: taskLocationId })
              }
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
            // If FAIR or UNSATISFACTORY, branch to cause -> resolution -> media
            const nextStage = (condition === 'FAIR' || condition === 'UNSATISFACTORY') ? 'cause' : 'media'
            await updateSessionState(sessionId, { currentTaskEntryId: entryId || undefined, currentTaskCondition: condition, taskFlowStage: nextStage, pendingTaskCause: undefined, pendingTaskResolution: undefined })
            if (nextStage === 'cause') {
              return JSON.stringify({ success: true, taskFlowStage: 'cause', message: 'Please describe the cause for this issue.' })
            }
          }

          return JSON.stringify({ success: true, taskFlowStage: 'media', condition })
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
                const created = await prisma.itemEntry.create({ data: { taskId, itemId: taskItemId, inspectorId: latest.inspectorId || undefined, condition: (latest.currentTaskCondition as any) || undefined, cause: causeRaw } })
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
          const combinedRemarks = `Cause: ${latest.pendingTaskCause || '-'}\nResolution: ${resolutionRaw}`
          if (!entryId) {
            const created = await prisma.itemEntry.create({ data: { taskId, itemId: taskItemId, inspectorId: inspectorId || undefined, condition: (latest.currentTaskCondition as any) || undefined, remarks: combinedRemarks, cause: latest.pendingTaskCause || undefined, resolution: resolutionRaw } })
            entryId = created.id
          } else {
            await prisma.itemEntry.update({ where: { id: entryId }, data: { remarks: combinedRemarks, cause: latest.pendingTaskCause || undefined, resolution: resolutionRaw } })
          }
          await updateSessionState(sessionId, { currentTaskEntryId: entryId, pendingTaskCause: undefined, pendingTaskResolution: undefined, taskFlowStage: 'media' })
          return JSON.stringify({ success: true, taskFlowStage: 'media', message: 'Resolution saved. You can now send photos/videos with remarks (as caption), or type \"skip\" to continue.' })
        }

        if (phase === 'skip_media') {
          let message: string | undefined
          if (sessionId) {
            const latest = await getSessionState(sessionId)
            const cond = (latest.currentTaskCondition || '').toUpperCase()
            await updateSessionState(sessionId, { taskFlowStage: 'confirm', pendingTaskRemarks: undefined })
            if (cond === 'FAIR' || cond === 'UNSATISFACTORY') {
              let cause = latest.pendingTaskCause || ''
              let resolution = latest.pendingTaskResolution || ''
              if (latest.currentTaskEntryId && (!cause || !resolution)) {
                try {
                  const entry = await prisma.itemEntry.findUnique({ where: { id: latest.currentTaskEntryId }, select: { cause: true, resolution: true } })
                  cause = cause || (entry?.cause || '')
                  resolution = resolution || (entry?.resolution || '')
                } catch {}
              }
              const crLine = `\n📝 Cause: ${cause || '-'} | Resolution: ${resolution || '-'}`
              message = `Okay, skipping media for now.${crLine}\n\nNext: reply [1] if this task is complete, [2] if you still have more to do for it.`
            }
          }
          return JSON.stringify({ success: true, taskFlowStage: 'confirm', mediaSkipped: true, message: message || 'Okay, skipping media for now.\n\nNext: reply [1] if this task is complete, [2] if you still have more to do for it.' })
        }

        if (phase === 'set_remarks') {
          const taskId = (args.taskId as string | undefined) || session.currentTaskId
          const taskItemId = session.currentTaskItemId
          if (!taskId || !taskItemId) return JSON.stringify({ success: false, error: 'Task context missing. Please restart the task completion flow.' })

          const remarksRaw = (args.remarks ?? args.notes ?? '') as string
          const remarks = remarksRaw.trim()
          const shouldSkipRemarks = !remarks || remarks.toLowerCase() === 'skip' || remarks.toLowerCase() === 'no'

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
            const created = await prisma.itemEntry.create({ data: { taskId, itemId: taskItemId, inspectorId, condition: (session.currentTaskCondition as any) || undefined, remarks: shouldSkipRemarks ? null : remarks || null } })
            entryId = created.id
          } else if (!shouldSkipRemarks) {
            await prisma.itemEntry.update({ where: { id: entryId }, data: { remarks } })
          }

          if (shouldSkipRemarks && entryId && remarks) {
            await prisma.itemEntry.update({ where: { id: entryId }, data: { remarks: null } })
          }

          if (sessionId) {
            await updateSessionState(sessionId, {
              taskFlowStage: 'confirm',
              currentTaskEntryId: entryId || undefined,
              pendingTaskRemarks: shouldSkipRemarks ? undefined : (remarks || undefined)
            })
          }

          return JSON.stringify({ success: true, taskFlowStage: 'confirm' })
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
          const entryId = session.currentTaskEntryId

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
            await prisma.contractChecklistItem.update({ where: { id: targetItemId }, data: { status: 'PENDING' } })
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
              currentTaskLocationId: task?.locationId || session.currentTaskLocationId,
              currentTaskLocationName: session.currentTaskLocationName,
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
        await prisma.contractChecklistItem.update({ where: { id: itemId }, data: { condition: condition as any, status: 'COMPLETED' } })
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
