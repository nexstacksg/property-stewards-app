import prisma from '@/lib/prisma'
import { getSessionState, updateSessionState } from '@/lib/chat-session'
import {
  getTodayJobsForInspector,
  getWorkOrderById,
  updateWorkOrderStatus,
  getTasksByLocation,
  getLocationsWithCompletionStatus,
  updateTaskStatus,
  getTaskMedia,
  deleteTaskMedia,
  getWorkOrderProgress,
  getInspectorByPhone,
  updateWorkOrderDetails,
  completeAllTasksForLocation,
  getContractChecklistItemIdByLocation
} from '@/lib/services/inspectorService'

export const assistantTools = [
  { type: 'function' as const, function: { name: 'getSessionContext', description: 'Get session-scoped context', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function' as const, function: { name: 'setLocationCondition', description: 'Set location condition', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, location: { type: 'string' }, conditionNumber: { type: 'number' } }, required: ['workOrderId', 'conditionNumber'] } } },
  { type: 'function' as const, function: { name: 'addLocationRemarks', description: 'Add remarks for current location', parameters: { type: 'object', properties: { remarks: { type: 'string' } }, required: ['remarks'] } } },
  { type: 'function' as const, function: { name: 'getTodayJobs', description: "Get today's jobs", parameters: { type: 'object', properties: { inspectorId: { type: 'string' }, inspectorPhone: { type: 'string' } }, required: [] } } },
  { type: 'function' as const, function: { name: 'selectJob', description: 'Select a job', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'getJobLocations', description: 'Get rooms/areas for the job', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'getTasksForLocation', description: 'Get tasks for a location', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, location: { type: 'string' }, contractChecklistItemId: { type: 'string' } }, required: ['workOrderId', 'location'] } } },
  { type: 'function' as const, function: { name: 'completeTask', description: 'Mark a task as complete', parameters: { type: 'object', properties: { taskId: { type: 'string' }, notes: { type: 'string' }, workOrderId: { type: 'string' } }, required: ['taskId', 'workOrderId'] } } },
  { type: 'function' as const, function: { name: 'confirmJobSelection', description: 'Confirm job selection', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'startJob', description: 'Start the job and set STARTED', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'updateJobDetails', description: 'Update job details', parameters: { type: 'object', properties: { jobId: { type: 'string' }, updateType: { type: 'string', enum: ['customer','address','time','status'] }, newValue: { type: 'string' } }, required: ['jobId','updateType','newValue'] } } },
  { type: 'function' as const, function: { name: 'uploadTaskMedia', description: 'Upload media for task (used by UI)', parameters: { type: 'object', properties: { taskId: { type: 'string' }, mediaType: { type: 'string', enum: ['photo','video'] }, mediaUrl: { type: 'string' }, workOrderId: { type: 'string' } }, required: ['taskId','mediaType','mediaUrl'] } } },
  { type: 'function' as const, function: { name: 'getTaskMedia', description: 'Get media for task', parameters: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] } } },
  { type: 'function' as const, function: { name: 'getLocationMedia', description: 'Get media for location', parameters: { type: 'object', properties: { locationNumber: { type: 'number' }, locationName: { type: 'string' }, workOrderId: { type: 'string' } }, required: ['workOrderId'] } } },
  { type: 'function' as const, function: { name: 'deleteTaskMedia', description: 'Delete a media item', parameters: { type: 'object', properties: { taskId: { type: 'string' }, mediaUrl: { type: 'string' }, mediaType: { type: 'string', enum: ['photo','video'] } }, required: ['taskId','mediaUrl','mediaType'] } } },
  { type: 'function' as const, function: { name: 'collectInspectorInfo', description: 'Collect inspector identity', parameters: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' } }, required: ['name','phone'] } } }
]

export async function executeTool(toolName: string, args: any, threadId?: string, sessionId?: string) {
  try {
    const metadata = sessionId ? await getSessionState(sessionId) : {}
    switch (toolName) {
      case 'getSessionContext': {
        const s = sessionId ? await getSessionState(sessionId) : {}
        return JSON.stringify({ success: true, session: { inspectorId: s.inspectorId || null, inspectorName: s.inspectorName || null, inspectorPhone: s.inspectorPhone || null, workOrderId: s.workOrderId || null, jobStatus: s.jobStatus || 'none', currentLocation: s.currentLocation || null } })
      }
      case 'getTodayJobs': {
        const { inspectorId, inspectorPhone } = args
        let finalInspectorId = inspectorId || (metadata as any).inspectorId
        if (!finalInspectorId && inspectorPhone) {
          const inspector = await getInspectorByPhone(inspectorPhone) as any
          if (!inspector) return JSON.stringify({ success: false, error: 'Inspector not found. Please provide your name and phone number for identification.' })
          finalInspectorId = inspector.id
        }
        if (!finalInspectorId) return JSON.stringify({ success: false, error: 'Inspector identification required. Please provide your name and phone number.' })
        const jobs = await getTodayJobsForInspector(finalInspectorId) as any[]
        return JSON.stringify({ success: true, jobs: jobs.map((job, index) => ({ id: job.id, jobNumber: index + 1, property: job.property_address, customer: job.customer_name, time: job.scheduled_date.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true }), type: job.inspection_type, status: job.status, priority: job.priority, notes: job.notes })), count: jobs.length })
      }
      case 'selectJob': {
        const { jobId } = args
        const workOrder = await getWorkOrderById(jobId) as any
        if (!workOrder) return JSON.stringify({ success: false, error: 'Job not found. Please check the job ID.' })
        return JSON.stringify({ success: true, message: `Job ${jobId} selected. Please use confirmJobSelection to confirm.`, jobDetails: { id: jobId, property: workOrder.property_address, customer: workOrder.customer_name, type: workOrder.inspection_type, status: workOrder.status } })
      }
      case 'getJobLocations': {
        const { jobId } = args
        const locationsWithStatus = await getLocationsWithCompletionStatus(jobId) as any[]
        const locationsFormatted = locationsWithStatus.map((loc, index) => `[${index + 1}] ${loc.isCompleted ? `${loc.name} (Done)` : loc.name}`)
        return JSON.stringify({ success: true, locations: locationsWithStatus.map((loc, index) => ({ number: index + 1, name: loc.name, displayName: loc.displayName, contractChecklistItemId: loc.contractChecklistItemId, status: loc.isCompleted ? 'completed' : (loc.completedTasks > 0 ? 'in_progress' : 'pending'), tasks: loc.totalTasks, completed: loc.completedTasks, pending: loc.totalTasks - loc.completedTasks })), locationsFormatted })
      }
      case 'getTasksForLocation': {
        const { workOrderId, location, contractChecklistItemId } = args
        if (sessionId) await updateSessionState(sessionId, { currentLocation: location })
        const tasks = await getTasksByLocation(workOrderId, location, contractChecklistItemId) as any[]
        const formattedTasks = tasks.map((task: any, index: number) => ({ id: task.id, number: index + 1, description: task.action || `Check ${location.toLowerCase()} condition`, status: task.status, displayStatus: task.status === 'completed' ? 'done' : 'pending', notes: task.notes || null }))
        const completed = formattedTasks.filter((t: any) => t.status === 'completed').length
        const total = formattedTasks.length
        return JSON.stringify({ success: true, location, allTasksCompleted: completed === total && total > 0, tasks: formattedTasks, locationProgress: { completed, total }, locationNotes: tasks.length > 0 && tasks[0].notes ? tasks[0].notes : null, locationStatus: tasks.length > 0 && tasks[0].locationStatus === 'completed' ? 'done' : 'pending' })
      }
      case 'completeTask': {
        const { taskId, notes, workOrderId } = args
        if (taskId === 'complete_all_tasks') {
          let location = ''
          if (sessionId) { const s = await getSessionState(sessionId); location = (s as any).currentLocation || '' }
          if (!location) return JSON.stringify({ success: false, error: 'Could not determine current location. Please select a location first.' })
          const success = await completeAllTasksForLocation(workOrderId, location)
          let itemIdForSession: string | null = null
          try { itemIdForSession = await getContractChecklistItemIdByLocation(workOrderId, location) as any } catch {}
          if (sessionId && itemIdForSession) await updateSessionState(sessionId, { currentItemId: itemIdForSession })
          if (success) {
            if (notes) {
              const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId }, include: { contract: { include: { contractChecklist: { include: { items: { where: { name: location } } } } } } } })
              if ((workOrder as any)?.contract?.contractChecklist?.items[0]) await prisma.contractChecklistItem.update({ where: { id: (workOrder as any).contract.contractChecklist.items[0].id }, data: { remarks: notes } })
            }
            return JSON.stringify({ success: true, message: `All tasks for ${location} have been marked complete!`, allTasksCompletedForLocation: true, locationCompleted: true, nextAction: 'Please select the condition for this location: [1] Good, [2] Fair, [3] Un-Satisfactory, [4] Not Applicable, [5] Unobservable. Reply with the number.' })
          }
          return JSON.stringify({ success: false, error: 'Failed to complete all tasks. Please try again.' })
        }
        const success = await updateTaskStatus(taskId, 'completed', notes)
        if (!success) return JSON.stringify({ success: false, error: 'Failed to complete task. Task may not exist.' })
        const progress = await getWorkOrderProgress(workOrderId) as any
        return JSON.stringify({ success: true, message: 'Task marked as complete', taskCompleted: true, notes: notes || 'No additional notes', progress: { total: progress.total_tasks, completed: progress.completed_tasks, remaining: progress.pending_tasks + progress.in_progress_tasks }, nextAction: 'Task completed. Show updated list or select another task.' })
      }
      case 'setLocationCondition': {
        const { workOrderId, location, conditionNumber } = args
        const s = sessionId ? await getSessionState(sessionId) : {}
        const loc = location || (s as any).currentLocation || ''
        if (!loc) return JSON.stringify({ success: false, error: 'No location in context. Please select a location first.' })
        const map: Record<number, string> = { 1: 'GOOD', 2: 'FAIR', 3: 'UNSATISFACTORY', 4: 'NOT_APPLICABLE', 5: 'UNOBSERVABLE' }
        const condition = map[Number(conditionNumber)]
        if (!condition) return JSON.stringify({ success: false, error: 'Invalid condition number' })
        let itemId = (s as any).currentItemId as string
        if (!itemId) itemId = (await getContractChecklistItemIdByLocation(workOrderId, loc)) as any
        if (!itemId) return JSON.stringify({ success: false, error: 'Unable to resolve checklist item for location' })
        await prisma.contractChecklistItem.update({ where: { id: itemId }, data: { condition: condition as any, status: 'COMPLETED' } })
        let locationsFormatted: string[] = []
        if (workOrderId) {
          const locs = await getLocationsWithCompletionStatus(workOrderId) as any[]
          locationsFormatted = locs.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
        }
        const mediaRequired = condition !== 'GOOD' && condition !== 'NOT_APPLICABLE' && condition !== 'UNOBSERVABLE'
        return JSON.stringify({ success: true, itemId, condition, mediaRequired, locationsFormatted, message: mediaRequired ? 'Please provide remarks and upload photos/videos for this location.' : `Condition recorded. No media required.\n\nHere are the locations available for inspection:\n${locationsFormatted.join('\n')}` })
      }
      case 'addLocationRemarks': {
        const { remarks } = args
        const s = sessionId ? await getSessionState(sessionId) : {}
        const inspectorId = (s as any).inspectorId as string
        const itemId = (s as any).currentItemId as string
        if (!inspectorId || !itemId) return JSON.stringify({ success: false, error: 'Missing inspector or item context' })
        const entry = await (prisma as any).itemEntry.upsert({ where: { itemId_inspectorId: { itemId, inspectorId } }, update: { remarks }, create: { itemId, inspectorId, remarks, photos: [], videos: [] } })
        let locationsFormatted: string[] = []
        const workOrderId = (s as any).workOrderId as string
        if (workOrderId) {
          const locs = await getLocationsWithCompletionStatus(workOrderId) as any[]
          locationsFormatted = locs.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
        }
        return JSON.stringify({ success: true, entryId: entry.id, locationsFormatted, message: `Remarks saved.\n\n${locationsFormatted.join('\n')}` })
      }
      case 'updateJobDetails': {
        const { jobId, updateType, newValue } = args
        const success = await updateWorkOrderDetails(jobId, updateType, newValue)
        if (!success) return JSON.stringify({ success: false, error: `Failed to update ${updateType}.` })
        const updatedJob = await getWorkOrderById(jobId) as any
        return JSON.stringify({ success: true, message: `Successfully updated ${updateType} to: ${newValue}`, updatedJob: updatedJob ? { id: jobId, property: updatedJob.property_address, customer: updatedJob.customer_name, time: updatedJob.scheduled_start.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true }), status: updatedJob.status } : null })
      }
      case 'collectInspectorInfo': {
        const { name, phone } = args
        let normalizedPhone = phone.replace(/[\s-]/g, '')
        if (!normalizedPhone.startsWith('+')) normalizedPhone = '+65' + normalizedPhone
        let inspector = await getInspectorByPhone(normalizedPhone) as any
        if (!inspector) inspector = await getInspectorByPhone(phone) as any
        if (!inspector) inspector = await prisma.inspector.findFirst({ where: { name: { contains: name, mode: 'insensitive' } } }) as any
        if (!inspector) return JSON.stringify({ success: false, error: 'Inspector not found in our system. Please contact admin for registration.' })
        if (sessionId) await updateSessionState(sessionId, { inspectorId: inspector.id, inspectorName: inspector.name, inspectorPhone: inspector.mobilePhone || normalizedPhone })
        return JSON.stringify({ success: true, message: `Welcome ${inspector.name}! I've identified you in our system.\n\nTry: "What are my jobs today?" or "Show me pending inspections"`, inspector: { id: inspector.id, name: inspector.name, phone: inspector.mobilePhone } })
      }
      case 'getTaskMedia': {
        try {
          const { taskId } = args
          if (taskId === (metadata as any).inspectorId) {
            if ((metadata as any).currentLocation && (metadata as any).workOrderId) {
              const actualTaskId = await getContractChecklistItemIdByLocation((metadata as any).workOrderId, (metadata as any).currentLocation)
              if (actualTaskId) {
                const mediaInfo = await getTaskMedia(actualTaskId) as any
                if (mediaInfo) return JSON.stringify({ success: true, taskId: actualTaskId, taskName: mediaInfo.name, remarks: mediaInfo.remarks, photos: mediaInfo.photos, videos: mediaInfo.videos, photoCount: mediaInfo.photoCount, videoCount: mediaInfo.videoCount })
              }
            }
            return JSON.stringify({ success: false, error: 'Could not find media for the current location. Please make sure you are in a specific room/location first.' })
          }
          const mediaInfo = await getTaskMedia(taskId) as any
          if (!mediaInfo) return JSON.stringify({ success: false, error: 'Task not found or no media available.' })
          return JSON.stringify({ success: true, taskId, taskName: mediaInfo.name, remarks: mediaInfo.remarks, photos: mediaInfo.photos, videos: mediaInfo.videos, photoCount: mediaInfo.photoCount, videoCount: mediaInfo.videoCount })
        } catch (error) {
          return JSON.stringify({ success: false, error: 'Failed to get media.' })
        }
      }
      case 'getLocationMedia': {
        try {
          const { locationNumber, locationName, workOrderId } = args
          const locationsWithStatus = await getLocationsWithCompletionStatus(workOrderId) as any[]
          let targetLocation = null as any
          if (locationNumber && locationNumber > 0 && locationNumber <= locationsWithStatus.length) targetLocation = locationsWithStatus[locationNumber - 1]
          else if (locationName) targetLocation = locationsWithStatus.find((loc: any) => loc.name.toLowerCase() === locationName.toLowerCase())
          if (!targetLocation) return JSON.stringify({ success: false, error: `Location not found. Available locations: ${locationsWithStatus.map((loc: any, index: number) => `[${index + 1}] ${loc.name}`).join(', ')}` })
          const mediaInfo = await getTaskMedia(targetLocation.contractChecklistItemId) as any
          if (!mediaInfo) return JSON.stringify({ success: false, error: `No media found for ${targetLocation.name}.` })
          return JSON.stringify({ success: true, location: targetLocation.name, locationNumber: locationsWithStatus.indexOf(targetLocation) + 1, taskId: targetLocation.contractChecklistItemId, taskName: mediaInfo.name, remarks: mediaInfo.remarks, photos: mediaInfo.photos, videos: mediaInfo.videos, photoCount: mediaInfo.photoCount, videoCount: mediaInfo.videoCount })
        } catch (error) {
          return JSON.stringify({ success: false, error: 'Failed to get location media.' })
        }
      }
      case 'deleteTaskMedia': {
        const { taskId, mediaUrl, mediaType } = args
        const success = await deleteTaskMedia(taskId, mediaUrl, mediaType)
        if (!success) return JSON.stringify({ success: false, error: `Failed to delete ${mediaType}.` })
        return JSON.stringify({ success: true, message: `${mediaType === 'photo' ? 'Photo' : 'Video'} deleted successfully!`, taskId })
      }
      default:
        return JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` })
    }
  } catch (error) {
    return JSON.stringify({ success: false, error: 'Tool execution failed' })
  }
}
