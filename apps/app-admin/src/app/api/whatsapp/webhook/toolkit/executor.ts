import prisma from '@/lib/prisma'
import { Status } from '@prisma/client'
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
import { resolveInspectorIdForSession } from '../utils'
import { resolveChecklistItemIdForLocation } from '../utils'

export async function executeTool(toolName: string, args: any, threadId?: string, sessionId?: string) {
  try {
    const metadata = sessionId ? await getSessionState(sessionId) : {}
    const dbg = (...a: any[]) => {
      const on = (process.env.WHATSAPP_DEBUG || '').toLowerCase()
      if (on === 'true' || on === 'verbose') console.log('[wh-tools]', ...a)
    }
    switch (toolName) {
      case 'setLocationCondition': {
        const workOrderId = String(args.workOrderId || '')
        const locationName = String(args.location || '')
        const conditionNumber = Number(args.conditionNumber)
        const mapCondition: Record<number, any> = { 1: 'GOOD', 2: 'FAIR', 3: 'UNSATISFACTORY', 4: 'UN_OBSERVABLE', 5: 'NOT_APPLICABLE' }
        const condition = mapCondition[conditionNumber]
        if (!workOrderId || !locationName || !condition) return JSON.stringify({ success: false, error: 'Missing workOrderId/location or invalid condition number (1-5).' })
        const itemId = await resolveChecklistItemIdForLocation(workOrderId, locationName)
        if (!itemId) return JSON.stringify({ success: false, error: 'Location not found for this job.' })
        await prisma.contractChecklistItem.update({ where: { id: itemId }, data: { condition } })
        return JSON.stringify({ success: true, itemId, condition })
      }
      case 'addLocationRemarks': {
        const remarks = String(args.remarks || '').trim()
        if (!remarks) return JSON.stringify({ success: false, error: 'Remarks text is required.' })
        if (!sessionId) return JSON.stringify({ success: false, error: 'Session required to add remarks.' })
        const s = await getSessionState(sessionId)
        const itemId = s.currentLocationId
        if (!itemId) return JSON.stringify({ success: false, error: 'No current location in session.' })
        try {
          await prisma.contractChecklistItem.update({ where: { id: itemId }, data: { remarks } })
        } catch (e) {
          return JSON.stringify({ success: false, error: 'Failed to save remarks.' })
        }
        return JSON.stringify({ success: true })
      }
      case 'getTodayJobs': {
        const t0 = Date.now()
        const inspectorId = (args.inspectorId as string | undefined) || undefined
        const inspectorPhone = (args.inspectorPhone as string | undefined) || undefined
        const reset = Boolean(args.reset)

        // Optionally reset context when listing jobs
        if (reset && sessionId) {
          try {
            await updateSessionState(sessionId, {
              jobStatus: 'none',
              workOrderId: undefined,
              customerName: undefined,
              propertyAddress: undefined,
              postalCode: undefined,
              currentLocation: undefined,
              currentLocationId: undefined,
              currentSubLocationId: undefined,
              currentSubLocationName: undefined,
              currentItemId: undefined,
              currentTaskId: undefined,
              currentTaskName: undefined,
              currentTaskItemId: undefined,
              currentTaskEntryId: undefined,
              currentTaskCondition: undefined,
              currentTaskLocationId: undefined,
              currentTaskLocationName: undefined,
              currentLocationCondition: undefined,
              taskFlowStage: undefined,
              pendingTaskRemarks: undefined,
              pendingTaskCause: undefined,
              pendingTaskResolution: undefined,
              locationSubLocations: undefined,
              lastMenu: 'jobs',
              lastMenuAt: new Date().toISOString()
            })
          } catch {}
        }

        // Resolve inspector identity
        let finalInspectorId: string | undefined = inspectorId
        if (!finalInspectorId && inspectorPhone) {
          const variants = [inspectorPhone, inspectorPhone.startsWith('+') ? inspectorPhone.slice(1) : `+${inspectorPhone}`]
          for (const p of variants) {
            const match = (await getInspectorByPhone(p)) as any
            if (match?.id) {
              finalInspectorId = match.id
              if (sessionId) await updateSessionState(sessionId, { inspectorId: match.id, inspectorName: match.name, inspectorPhone: match.mobilePhone || p })
              break
            }
          }
        }

        // Resolve by name if needed
        if (!finalInspectorId && args.name) {
          try {
            const byName = await prisma.inspector.findFirst({ where: { status: Status.ACTIVE, name: { equals: String(args.name), mode: 'insensitive' } }, select: { id: true, name: true, mobilePhone: true } })
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

        const jobs = (await getTodayJobsForInspector(finalInspectorId)) as any[]
        dbg('getTodayJobs', { tookMs: Date.now() - t0, count: jobs.length, inspectorId: finalInspectorId })
        const jobsFormatted = jobs.map((job: any, index: number) => {
          const raw = job.scheduled_date
          const date = raw instanceof Date ? raw : raw ? new Date(raw) : null
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
        const workOrder = (await getWorkOrderById(args.jobId)) as any
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
        if (sessionId) {
          const s = await getSessionState(sessionId)
          if (s?.jobStatus !== 'confirming') {
            return JSON.stringify({ success: false, error: 'Please confirm the destination first. Reply [1] Yes or [2] No to the confirmation prompt.' })
          }
        }
        const perf = process.env.WHATSAPP_PERF_LOG === 'true'
        const t0 = Date.now()
        let targetJobId: string | undefined = args.jobId
        try {
          if ((!targetJobId || typeof targetJobId !== 'string' || targetJobId.trim().length === 0) && sessionId) {
            const s = await getSessionState(sessionId)
            if (s?.workOrderId) targetJobId = s.workOrderId
          }
          let exists = null as null | { id: string }
          if (targetJobId) {
            exists = (await prisma.workOrder.findUnique({ where: { id: targetJobId }, select: { id: true } })) as any
          }
          const looksLikeSelection = targetJobId && /^\s*\d+\s*$/.test(targetJobId)
          if (!exists && (looksLikeSelection || !targetJobId) && sessionId) {
            const s = await getSessionState(sessionId)
            const inspectorId = s?.inspectorId
            if (inspectorId) {
              const jobs = (await getTodayJobsForInspector(inspectorId)) as any[]
              if (Array.isArray(jobs) && jobs.length > 0) {
                if (looksLikeSelection) {
                  const idx = Math.max(1, Number((targetJobId as string).trim())) - 1
                  const chosen = jobs[idx]
                  if (chosen?.id) targetJobId = chosen.id
                }
              }
            }
            if (targetJobId) exists = (await prisma.workOrder.findUnique({ where: { id: targetJobId }, select: { id: true } })) as any
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
        if (sessionId) {
          await updateSessionState(sessionId, { jobStatus: 'started' })
          try {
            const s = await getSessionState(sessionId)
            if (!s.inspectorId) {
              const wo = (await prisma.workOrder.findUnique({ where: { id: targetJobId }, select: { inspectors: { select: { id: true } } } })) as any
              const derived = wo?.inspectors?.[0]?.id
              if (derived) await updateSessionState(sessionId, { inspectorId: derived })
            }
          } catch {}
        }
        const t1 = Date.now()
        const includeProgress = (process.env.WHATSAPP_PROGRESS_ON_START ?? 'false').toLowerCase() !== 'false'
        const [locations, progress] = await Promise.all([
          (getLocationsWithCompletionStatus(targetJobId) as Promise<any[]>),
          includeProgress ? ((getWorkOrderProgress(targetJobId) as Promise<any>)) : Promise.resolve(null)
        ])
        if (perf) console.log('[perf] tool:startJob locations:', Date.now() - t1, 'ms', 'includeProgress=', includeProgress)
        if (sessionId) {
          try {
            await updateSessionState(sessionId, { lastMenu: 'locations', lastMenuAt: new Date().toISOString() })
          } catch {}
        }
        const locationsFormatted = locations.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
        return JSON.stringify({ success: true, locations: locations.map((loc) => loc.displayName), locationsFormatted, locationsDetail: locations, progress })
      }
      case 'getJobLocations': {
        if (sessionId) {
          const s = await getSessionState(sessionId)
          if (s?.jobStatus !== 'started') {
            return JSON.stringify({ success: false, error: 'Please start the job first (confirm the destination and reply [1]).' })
          }
        }
        const { jobId } = args
        const locationsWithStatus = (await getLocationsWithCompletionStatus(jobId)) as any[]
        const locationsFormatted = locationsWithStatus.map((loc, index) => `[${index + 1}] ${loc.isCompleted ? `${loc.name} (Done)` : loc.name}`)
        if (sessionId) {
          const subLocationMap: Record<string, Array<{ id: string; name: string; status: string }>> = {}
          for (const loc of locationsWithStatus) {
            if (Array.isArray(loc.subLocations) && loc.subLocations.length > 0) {
              subLocationMap[loc.contractChecklistItemId] = loc.subLocations.map((sub: any) => ({ id: sub.id, name: sub.name, status: sub.status }))
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
            status: loc.isCompleted ? 'completed' : loc.completedTasks > 0 ? 'in_progress' : 'pending',
            tasks: loc.totalTasks,
            completed: loc.completedTasks,
            pending: loc.totalTasks - loc.completedTasks,
            subLocations: Array.isArray(loc.subLocations) ? loc.subLocations : []
          })),
          locationsFormatted,
          nextPrompt: 'Reply with the number of the location you want to inspect next.'
        })
      }
      case 'getSubLocations': {
        if (sessionId) {
          const s = await getSessionState(sessionId)
          if (s?.jobStatus !== 'started') {
            return JSON.stringify({ success: false, error: 'Please start the job first (confirm the destination and reply [1]).' })
          }
        }
        const { workOrderId, contractChecklistItemId, locationName } = args
        const subLocations = (await getChecklistLocationsForItem(contractChecklistItemId)) as any[]
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
        const formatted = subLocations.map((loc: any, index: number) => ({ id: loc.id, number: index + 1, name: loc.name, status: loc.status, totalTasks: loc.totalTasks, completedTasks: loc.completedTasks }))
        const formattedStrings = formatted.map((loc) => `[${loc.number}] ${loc.name}${loc.status === 'completed' ? ' (Done)' : ''}`)
        return JSON.stringify({ success: true, subLocations: formatted, subLocationsFormatted: formattedStrings, nextPrompt: 'Reply with the sub-location number you want to inspect.' })
      }
      case 'getTasksForLocation': {
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
            lastMenu: 'tasks',
            lastMenuAt: new Date().toISOString()
          })
          const s = await getSessionState(sessionId)
          const map = (s.locationSubLocations || {}) as Record<string, Array<{ id: string; name: string; status: string }>>
          if (contractChecklistItemId && map[contractChecklistItemId]) subLocationOptions = map[contractChecklistItemId]
        }
        if (effectiveSubLocationId === undefined && subLocationOptions && subLocationOptions.length > 0) {
          effectiveSubLocationId = subLocationOptions[0]?.id
        }
        const tasks = (await getTasksByLocation(workOrderId, location, contractChecklistItemId, effectiveSubLocationId)) as any[]
        const formatted = tasks.map((task: any, index: number) => ({ id: task.id, number: index + 1, locationId: task.locationId, description: task.action, displayStatus: task.status === 'completed' ? 'Done' : 'Pending' }))
        return JSON.stringify({ success: true, tasks: formatted, nextPrompt: 'Reply with the task number to continue.' })
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
            await updateSessionState(sessionId, { currentTaskId: taskId, currentTaskName: taskName, currentTaskItemId: taskItemId, currentTaskLocationId: undefined, currentTaskLocationName: undefined, currentTaskEntryId: undefined, currentTaskCondition: undefined, taskFlowStage: 'condition' })
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
          if (!taskLocationId && session.currentSubLocationId) {
            taskLocationId = session.currentSubLocationId
          }
          if (!taskLocationId && taskId) {
            try {
              const lookup = await prisma.checklistTask.findUnique({ where: { id: taskId }, select: { locationId: true } })
              taskLocationId = lookup?.locationId || undefined
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
            await prisma.itemEntry.update({ where: { id: entryId }, data: { condition: (condition as any), inspectorId: inspectorId || undefined } })
          }
          try {
            await prisma.checklistTask.update({ where: { id: taskId }, data: { condition: (condition as any) } })
          } catch (error) {
            console.error('Failed to persist checklist task condition', error)
          }
          if (sessionId) {
            const nextStage = condition === 'FAIR' || condition === 'UNSATISFACTORY' ? 'cause' : 'remarks'
            await updateSessionState(sessionId, { currentTaskEntryId: entryId || undefined, currentTaskCondition: condition, taskFlowStage: nextStage, pendingTaskCause: undefined, pendingTaskResolution: undefined })
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
                const created = await prisma.itemEntry.create({ data: { taskId, itemId: taskItemId, inspectorId: latest.inspectorId || undefined, condition: (latest.currentTaskCondition as any) || undefined, cause: causeRaw } })
                entryId = created.id
              } else {
                await prisma.itemEntry.update({ where: { id: entryId }, data: { cause: causeRaw } })
              }
              await updateSessionState(sessionId, { currentTaskEntryId: entryId })
            }
          } catch (e) {
            console.error('Failed to persist cause to item entry', e)
          }
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
          if (!entryId) {
            const created = await prisma.itemEntry.create({ data: { taskId, itemId: taskItemId, inspectorId: inspectorId || undefined, condition: (latest.currentTaskCondition as any) || undefined, cause: latest.pendingTaskCause || undefined, resolution: resolutionRaw } })
            entryId = created.id
          } else {
            const updateData: any = { resolution: resolutionRaw }
            if (latest.pendingTaskCause) updateData.cause = latest.pendingTaskCause
            await prisma.itemEntry.update({ where: { id: entryId }, data: updateData })
          }
          await updateSessionState(sessionId, { currentTaskEntryId: entryId, pendingTaskCause: undefined, pendingTaskResolution: undefined, taskFlowStage: 'remarks' })
          const condUpper = String(latest.currentTaskCondition || '').toUpperCase()
          const msg = condUpper === 'NOT_APPLICABLE' ? 'Resolution saved. Please add any remarks for this task (or type "skip").' : 'Resolution saved. Please add remarks for this task.'
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
          const remarksRaw = String(args.remarks ?? args.notes ?? '').trim()
          if (!taskId || remarksRaw.length === 0) {
            return JSON.stringify({ success: false, error: 'Please provide a short remark for this task.' })
          }
          if (sessionId) {
            await updateSessionState(sessionId, { pendingTaskRemarks: remarksRaw, taskFlowStage: 'media' })
          }
          return JSON.stringify({ success: true, taskFlowStage: 'media', message: 'Thanks. Please send any photos/videos now — you can include remarks in the same message as a caption. Or type "skip" if Not Applicable.' })
        }

        if (phase === 'finalize') {
          const completed = Boolean(args.completed)
          const latest = sessionId ? await getSessionState(sessionId) : ({} as ChatSessionState)
          const taskId = (args.taskId as string | undefined) || latest.currentTaskId
          if (!taskId) return JSON.stringify({ success: false, error: 'Task context missing for finalize.' })
          if (completed) {
            try {
              // Mark task (or item) complete
              const existingTask = await prisma.checklistTask.findUnique({ where: { id: taskId }, select: { id: true, itemId: true } })
              if (existingTask) {
                await prisma.checklistTask.update({ where: { id: taskId }, data: { status: 'COMPLETED', updatedOn: new Date() } })
                const remaining = await prisma.checklistTask.count({ where: { itemId: existingTask.itemId, status: { not: 'COMPLETED' } } })
                await prisma.contractChecklistItem.update({ where: { id: existingTask.itemId }, data: { status: remaining === 0 ? 'COMPLETED' : 'PENDING', enteredOn: remaining === 0 ? new Date() : null } })
                await refreshChecklistItemCache(existingTask.itemId)
                await refreshChecklistItemsForWorkOrder(workOrderId)
              } else {
                await prisma.contractChecklistItem.update({ where: { id: taskId }, data: { status: 'COMPLETED', enteredOn: new Date() } })
                await refreshChecklistItemCache(taskId)
                await refreshChecklistItemsForWorkOrder(workOrderId)
              }
            } catch (e) {
              console.error('finalize: failed to update completion', e)
            }
          }
          if (sessionId) {
            await updateSessionState(sessionId, { taskFlowStage: undefined, currentTaskId: undefined, currentTaskName: undefined, currentTaskEntryId: undefined, currentTaskCondition: undefined, pendingTaskRemarks: undefined })
          }
          try {
            const locs3 = workOrderId ? ((await getLocationsWithCompletionStatus(workOrderId)) as any[]) : []
            const locationsFormatted = locs3.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
            return JSON.stringify({ success: true, locationsFormatted })
          } catch {}
          return JSON.stringify({ success: true })
        }
        return JSON.stringify({ success: false, error: `Unknown phase: ${phase}` })
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
              updates.jobStatus = v === 'STARTED' ? 'started' : 'none'
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
        const noPlus = normalizedPhone.startsWith('+') ? normalizedPhone.slice(1) : normalizedPhone
        phoneVariants.push(noPlus)
        let inspector: any = null
        try {
          inspector = await prisma.inspector.findFirst({ where: { status: Status.ACTIVE, name: { equals: providedName, mode: 'insensitive' }, OR: phoneVariants.map((p) => ({ mobilePhone: p })) }, select: { id: true, name: true, mobilePhone: true } })
        } catch {}
        if (!inspector) {
          const byPhone = (await getInspectorByPhone(normalizedPhone)) as any
          if (byPhone && typeof byPhone.name === 'string' && byPhone.name.localeCompare(providedName, undefined, { sensitivity: 'accent', usage: 'search' }) === 0) {
            inspector = byPhone
          }
        }
        if (!inspector) {
          try {
            const byName = await prisma.inspector.findMany({ where: { status: Status.ACTIVE, name: { equals: providedName, mode: 'insensitive' } }, select: { id: true, name: true, mobilePhone: true } })
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
                const mediaInfo = (await getTaskMediaService(actualTaskId)) as any
                if (mediaInfo) return JSON.stringify({ success: true, taskId: actualTaskId, taskName: mediaInfo.name, remarks: mediaInfo.remarks, photos: mediaInfo.photos, videos: mediaInfo.videos, photoCount: mediaInfo.photoCount, videoCount: mediaInfo.videoCount })
              }
            }
            return JSON.stringify({ success: false, error: 'Could not find media for the current location. Please make sure you are in a specific room/location first.' })
          }
          const mediaInfo = (await getTaskMediaService(args.taskId)) as any
          if (!mediaInfo) return JSON.stringify({ success: false, error: 'Task not found or no media available.' })
          return JSON.stringify({ success: true, taskId: args.taskId, taskName: mediaInfo.name, remarks: mediaInfo.remarks, photos: mediaInfo.photos, videos: mediaInfo.videos, photoCount: mediaInfo.photoCount, videoCount: mediaInfo.videoCount })
        } catch (error) {
          console.error('❌ Error in WhatsApp getTaskMedia:', error)
          return JSON.stringify({ success: false, error: 'Failed to get media.' })
        }
      }
      case 'getLocationMedia': {
        try {
          const locationsWithStatus = (await getLocationsWithCompletionStatus(args.workOrderId)) as any[]
          let targetLocation: any = null
          if (args.locationNumber && args.locationNumber > 0 && args.locationNumber <= locationsWithStatus.length) targetLocation = locationsWithStatus[args.locationNumber - 1]
          else if (args.locationName) targetLocation = locationsWithStatus.find((loc: any) => loc.name.toLowerCase() === args.locationName.toLowerCase())
          if (!targetLocation) return JSON.stringify({ success: false, error: `Location not found. Available locations: ${locationsWithStatus.map((loc: any, index: number) => `[${index + 1}] ${loc.name}`).join(', ')}` })
          const locationMediaInfo = (await getTaskMediaService(targetLocation.contractChecklistItemId)) as any
          if (!locationMediaInfo) return JSON.stringify({ success: false, error: `No media found for ${targetLocation.name}.` })
          return JSON.stringify({ success: true, location: targetLocation.name, locationNumber: locationsWithStatus.indexOf(targetLocation) + 1, taskId: targetLocation.contractChecklistItemId, taskName: locationMediaInfo.name, remarks: locationMediaInfo.remarks, photos: locationMediaInfo.photos, videos: locationMediaInfo.videos, photoCount: locationMediaInfo.photoCount, videoCount: locationMediaInfo.videoCount })
        } catch (error) {
          console.error('❌ Error in WhatsApp getLocationMedia:', error)
          return JSON.stringify({ success: false, error: 'Failed to get location media.' })
        }
      }
      case 'markLocationComplete': {
        const { workOrderId, contractChecklistItemId } = args
        // Attempt to complete all underlying tasks (best effort)
        try {
          const session = sessionId ? await getSessionState(sessionId) : ({} as ChatSessionState)
          await completeAllTasksForLocation(workOrderId, session.currentLocation || '', session.inspectorId)
          try { await refreshChecklistItemCache(contractChecklistItemId) } catch {}
          try { await refreshChecklistItemsForWorkOrder(workOrderId) } catch {}
        } catch (e) {
          console.error('markLocationComplete: failed to load tasks', e)
        }
        // Update item status
        try {
          const s = sessionId ? await getSessionState(sessionId) : ({} as ChatSessionState)
          const exist = await prisma.contractChecklistItem.findUnique({ where: { id: contractChecklistItemId }, select: { id: true } })
          if (!exist) return JSON.stringify({ success: false, error: 'Checklist item not found.' })
          await prisma.contractChecklistItem.update({ where: { id: contractChecklistItemId }, data: { status: 'COMPLETED', enteredOn: new Date(), enteredById: s.inspectorId || undefined } })
          try {
            await refreshChecklistItemCache(contractChecklistItemId)
            await refreshChecklistItemsForWorkOrder(workOrderId)
          } catch (e) {
            console.error('markLocationComplete: refresh cache failed', e)
          }
          if (sessionId) {
            try {
              await updateSessionState(sessionId, { lastMenu: 'locations', lastMenuAt: new Date().toISOString(), currentTaskId: undefined, currentTaskName: undefined, currentTaskEntryId: undefined, taskFlowStage: undefined })
            } catch {}
          }
          try {
            const refreshed = (await getLocationsWithCompletionStatus(workOrderId)) as any[]
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
      default:
        return JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` })
    }
  } catch (error) {
    console.error(`Tool execution error for ${toolName}:`, error)
    return JSON.stringify({ success: false, error: 'Tool execution failed' })
  }
}
