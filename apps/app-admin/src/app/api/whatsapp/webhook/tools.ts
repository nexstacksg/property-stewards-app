import prisma from '@/lib/prisma'
import type { ChatSessionState } from '@/lib/chat-session'
import { getSessionState, updateSessionState } from '@/lib/chat-session'
import {
  getTodayJobsForInspector,
  getWorkOrderById,
  updateWorkOrderStatus,
  getTasksByLocation,
  getLocationsWithCompletionStatus,
  updateTaskStatus,
  getInspectorByPhone,
  updateWorkOrderDetails,
  completeAllTasksForLocation,
  getWorkOrderProgress,
  getContractChecklistItemIdByLocation,
  getTaskMedia as getTaskMediaService
} from '@/lib/services/inspectorService'

export const assistantTools = [
  {
    type: 'function' as const,
    function: { name: 'getTodayJobs', description: "Get today's inspection jobs", parameters: { type: 'object', properties: { inspectorId: { type: 'string' }, inspectorPhone: { type: 'string' } }, required: [] } }
  },
  { type: 'function' as const, function: { name: 'confirmJobSelection', description: 'Confirm job selection and show job details', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'startJob', description: 'Start the job', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'getJobLocations', description: 'Get locations for inspection', parameters: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } } },
  { type: 'function' as const, function: { name: 'setLocationCondition', description: 'Set condition for the current location by number (1=Good,2=Fair,3=Unsatisfactory,4=Not Applicable,5=Un-Observable)', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, location: { type: 'string' }, conditionNumber: { type: 'number' } }, required: ['workOrderId', 'conditionNumber'] } } },
  { type: 'function' as const, function: { name: 'addLocationRemarks', description: 'Save remarks for current location and create/update an ItemEntry for the inspector', parameters: { type: 'object', properties: { remarks: { type: 'string' } }, required: ['remarks'] } } },
  { type: 'function' as const, function: { name: 'getTasksForLocation', description: 'Get tasks for a location', parameters: { type: 'object', properties: { workOrderId: { type: 'string' }, location: { type: 'string' } }, required: ['workOrderId', 'location'] } } },
  { type: 'function' as const, function: { name: 'completeTask', description: 'Mark task as complete', parameters: { type: 'object', properties: { taskId: { type: 'string' }, workOrderId: { type: 'string' }, notes: { type: 'string' } }, required: ['taskId', 'workOrderId'] } } },
  { type: 'function' as const, function: { name: 'updateJobDetails', description: 'Update job details', parameters: { type: 'object', properties: { jobId: { type: 'string' }, updateType: { type: 'string', enum: ['customer', 'address', 'time', 'status'] }, newValue: { type: 'string' } }, required: ['jobId', 'updateType', 'newValue'] } } },
  { type: 'function' as const, function: { name: 'collectInspectorInfo', description: 'Collect and validate inspector name and phone number for identification', parameters: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' } }, required: ['name', 'phone'] } } },
  { type: 'function' as const, function: { name: 'getTaskMedia', description: 'Get photos and videos for a specific task', parameters: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] } } },
  { type: 'function' as const, function: { name: 'getLocationMedia', description: 'Get photos and videos for a specific location by selection number or name', parameters: { type: 'object', properties: { locationNumber: { type: 'number' }, locationName: { type: 'string' }, workOrderId: { type: 'string' } }, required: ['workOrderId'] } } }
]

export async function executeTool(toolName: string, args: any, threadId?: string, sessionId?: string): Promise<string> {
  try {
    let metadata: ChatSessionState = {}
    if (sessionId) metadata = await getSessionState(sessionId)

    switch (toolName) {
      case 'getTodayJobs': {
        const { inspectorId, inspectorPhone } = args
        let finalInspectorId = inspectorId || metadata.inspectorId
        if (!finalInspectorId && inspectorPhone) {
          let match = await getInspectorByPhone(inspectorPhone) as any
          if (!match && inspectorPhone.startsWith('+')) match = await getInspectorByPhone(inspectorPhone.slice(1)) as any
          if (!match && !inspectorPhone.startsWith('+')) match = await getInspectorByPhone('+' + inspectorPhone) as any
          if (match) finalInspectorId = match.id
        }
        if (!finalInspectorId) {
          if (sessionId) await updateSessionState(sessionId, { inspectorId: undefined })
          return JSON.stringify({ success: false, identifyRequired: true, message: 'Hello! To assign you today\'s inspection jobs, I need your details. Please provide:\n[1] Your full name\n[2] Your phone number (with country code, e.g., +65 for Singapore).', nextAction: 'collectInspectorInfo' })
        }
        const jobs = await getTodayJobsForInspector(finalInspectorId) as any[]
        return JSON.stringify({ success: true, jobs: jobs.map((job, index) => ({ id: job.id, jobNumber: index + 1, selectionNumber: `[${index + 1}]`, property: job.property_address, customer: job.customer_name, time: job.scheduled_date.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true }), status: job.status, priority: job.priority })), count: jobs.length, instructions: 'User can select a job by typing its number (1, 2, 3, etc.)' })
      }
      case 'confirmJobSelection': {
        const workOrder = await getWorkOrderById(args.jobId) as any
        if (!workOrder) return JSON.stringify({ success: false, error: 'Job not found' })
        if (sessionId) {
          const postalCodeMatch = workOrder.property_address.match(/\b(\d{6})\b/)
          const updatedMetadata: Partial<ChatSessionState> = { workOrderId: args.jobId, customerName: workOrder.customer_name, propertyAddress: workOrder.property_address, postalCode: postalCodeMatch ? (postalCodeMatch[1] as string) : 'unknown', jobStatus: 'confirming' }
          await updateSessionState(sessionId, updatedMetadata)
        }
        return JSON.stringify({ success: true, message: 'Please confirm the destination', jobDetails: { id: args.jobId, property: workOrder.property_address, customer: workOrder.customer_name, time: workOrder.scheduled_start.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true }), status: workOrder.status } })
      }
      case 'startJob': {
        await updateWorkOrderStatus(args.jobId, 'in_progress')
        if (sessionId) {
          await updateSessionState(sessionId, { jobStatus: 'started' })
          try {
            const s = await getSessionState(sessionId)
            if (!s.inspectorId) {
              const wo = await prisma.workOrder.findUnique({ where: { id: args.jobId }, select: { inspectors: { select: { id: true } } } }) as any
              const derived = wo?.inspectors?.[0]?.id
              if (derived) await updateSessionState(sessionId, { inspectorId: derived })
            }
          } catch {}
        }
        const locations = await getLocationsWithCompletionStatus(args.jobId) as any[]
        const progress = await getWorkOrderProgress(args.jobId) as any
        const locationsFormatted = locations.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
        return JSON.stringify({ success: true, message: 'Job started successfully!', locations: locations.map(loc => loc.displayName), locationsFormatted, locationsDetail: locations, progress })
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
        const completedTasksInLocation = formattedTasks.filter((t: any) => t.status === 'completed').length
        const totalTasksInLocation = formattedTasks.length
        return JSON.stringify({ success: true, location, allTasksCompleted: completedTasksInLocation === totalTasksInLocation && totalTasksInLocation > 0, tasks: formattedTasks, locationProgress: { completed: completedTasksInLocation, total: totalTasksInLocation }, locationNotes: tasks.length > 0 && tasks[0].notes ? tasks[0].notes : null, locationStatus: tasks.length > 0 && tasks[0].locationStatus === 'completed' ? 'done' : 'pending' })
      }
      case 'completeTask': {
        const { taskId, notes, workOrderId } = args
        if (taskId === 'complete_all_tasks') {
          let location = ''
          if (sessionId) { const s = await getSessionState(sessionId); location = s.currentLocation || '' }
          if (!location) return JSON.stringify({ success: false, error: 'Could not determine current location' })
          const success = await completeAllTasksForLocation(workOrderId, location)
          let itemIdForSession: string | null = null
          try { itemIdForSession = await getContractChecklistItemIdByLocation(workOrderId, location) as any } catch {}
          if (sessionId && itemIdForSession) await updateSessionState(sessionId, { currentItemId: itemIdForSession })
          if (success) {
            if (notes) {
              const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId }, include: { contract: { include: { contractChecklist: { include: { items: { where: { name: location } } } } } } } })
              if ((workOrder as any)?.contract?.contractChecklist?.items[0]) {
                await prisma.contractChecklistItem.update({ where: { id: (workOrder as any).contract.contractChecklist.items[0].id }, data: { remarks: notes } })
              }
            }
            return JSON.stringify({ success: true, message: `All tasks for ${location} have been marked complete!`, allTasksCompletedForLocation: true, locationCompleted: true, nextAction: 'Please select the condition for this location: [1] Good, [2] Fair, [3] Unsatisfactory, [4] Not Applicable, [5] Un-Observable. Reply with the number.' })
          }
          return JSON.stringify({ success: false, error: 'Failed to complete all tasks. Please try again.' })
        }
        const success = await updateTaskStatus(taskId, 'completed', notes)
        if (!success) return JSON.stringify({ success: false, error: 'Failed to complete task. Task may not exist.' })
        const progress = await getWorkOrderProgress(workOrderId) as any
        return JSON.stringify({ success: true, message: 'Task marked as complete', taskCompleted: true, notes: notes || 'No additional notes', progress: { total: progress.total_tasks, completed: progress.completed_tasks, remaining: progress.pending_tasks + progress.in_progress_tasks }, nextAction: 'Task completed. Show updated list or select another task.' })
      }
      case 'setLocationCondition': {
        const s = sessionId ? await getSessionState(sessionId) : ({} as ChatSessionState)
        const loc = args.location || (s.currentLocation as string) || ''
        if (!loc) return JSON.stringify({ success: false, error: 'No location in context' })
        const map: Record<number, string> = { 1: 'GOOD', 2: 'FAIR', 3: 'UNSATISFACTORY', 4: 'NOT_APPLICABLE', 5: 'UN_OBSERVABLE' }
        const condition = map[Number(args.conditionNumber)]
        if (!condition) return JSON.stringify({ success: false, error: 'Invalid condition number' })
        let itemId = (s as any).currentItemId as string
        if (!itemId) itemId = (await getContractChecklistItemIdByLocation(args.workOrderId, loc)) as any
        if (!itemId) return JSON.stringify({ success: false, error: 'Unable to resolve checklist item' })
        await prisma.contractChecklistItem.update({ where: { id: itemId }, data: { condition: condition as any, status: 'COMPLETED' } })
        const mediaRequired = !(condition === 'GOOD' || condition === 'UN_OBSERVABLE')
        const locs2 = await getLocationsWithCompletionStatus(args.workOrderId) as any[]
        const locationsFormatted = locs2.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
        return JSON.stringify({ success: true, condition, mediaRequired, locationsFormatted, message: mediaRequired ? 'Please provide remarks and upload photos/videos.' : `Condition recorded.\n\n${locationsFormatted.join('\n')}` })
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
        return JSON.stringify({ success: true, entryId: entry.id, locationsFormatted, message: `Remarks saved.\n\n${locationsFormatted.join('\n')}` })
      }
      case 'updateJobDetails': {
        const updateSuccess = await updateWorkOrderDetails(args.jobId, args.updateType, args.newValue)
        return JSON.stringify({ success: updateSuccess, message: updateSuccess ? `Updated ${args.updateType}` : 'Failed to update' })
      }
      case 'collectInspectorInfo': {
        const { name, phone } = args
        let normalizedPhone = phone.replace(/[\s-]/g, '')
        if (!normalizedPhone.startsWith('+')) normalizedPhone = '+65' + normalizedPhone
        let inspector = await getInspectorByPhone(normalizedPhone) as any
        if (!inspector) inspector = await getInspectorByPhone(phone) as any
        if (!inspector) {
          const inspectors = await prisma.inspector.findMany({ where: { name: { contains: name, mode: 'insensitive' } } })
          inspector = inspectors[0] || null
        }
        if (!inspector) return JSON.stringify({ success: false, error: 'Inspector not found in our system. Please contact admin for registration.' })
        if (sessionId) {
          await updateSessionState(sessionId, { phoneNumber: normalizedPhone, inspectorId: inspector.id, inspectorName: inspector.name, inspectorPhone: inspector.mobilePhone || normalizedPhone, identifiedAt: new Date().toISOString() })
        }
        return JSON.stringify({ success: true, message: `Welcome ${inspector.name}! I've identified you in our system.\n\nTry: "What are my jobs today?" or "Show me pending inspections"`, inspector: { id: inspector.id, name: inspector.name, phone: inspector.mobilePhone } })
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
