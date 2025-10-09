import { executeTool } from './tools'
import { getSessionState, updateSessionState, type ChatSessionState } from '@/lib/chat-session'

function perfLog(label: string, ms: number) {
  if (process.env.WHATSAPP_PERF_LOG === 'true') {
    console.log(`[perf] ${label}: ${ms}ms`)
  }
}

function isJobsIntent(text: string): boolean {
  const t = text.toLowerCase().trim()
  if (!t) return false
  // Direct keywords
  const keywords = [
    'jobs', 'job', 'schedule', 'today', 'my jobs', 'my schedule', 'what are my jobs',
    'work order', 'work orders', 'workorder', 'workorders', 'wo', 'inspections', 'inspection',
    'assignments', 'appointments', 'tasks today', 'today list', 'show jobs', 'show schedule', 'list jobs'
  ]
  if (keywords.some(k => t === k || t.includes(k))) return true
  // Patterns like "today's jobs", "today schedule"
  if (/today'?s?\s+(jobs?|schedule|inspections?|work\s*orders?)/.test(t)) return true
  // Questions like "what's my schedule" or "what jobs today"
  if (/(what('?s)?|show)\s+(my\s+)?(jobs?|schedule|inspections?)/.test(t)) return true
  return false
}

export async function tryHandleWithoutAI(phone: string, rawMessage: string, session: ChatSessionState): Promise<string | null> {
  try {
    const msg = (rawMessage || '').trim()
    if (!msg) return null
    const lower = msg.toLowerCase()
    const match = /^\s*(?:\[\s*(\d{1,2})\s*\]|option\s+(\d{1,2})|(\d{1,2}))\s*([).,;-])?\s*$/.exec(msg)
    const selectedNumber = match ? Number(match[1] || match[2] || match[3]) : null
    const isGoBackText = ['go back', 'back', 'b'].includes(lower.trim())

    const wantsJobs = isJobsIntent(lower)

    // 1) Jobs list (no AI)
    if (wantsJobs) {
      // Reset job/location/task context so a new selection starts fresh
      try {
        await updateSessionState(phone, {
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
          locationSubLocations: undefined
        })
      } catch {}
      const t0 = Date.now()
      const res = await executeTool('getTodayJobs', { inspectorPhone: phone }, undefined, phone)
      perfLog('tool:getTodayJobs', Date.now() - t0)
      const data = safeParseJSON(res)
      if (!data?.success) return null
      const s = await getSessionState(phone)
      const inspectorName = s.inspectorName || ''
      const jobs = Array.isArray(data.jobs) ? data.jobs : []
      if (jobs.length === 0) return `Hi${inspectorName ? ' ' + inspectorName : ''}! You have no inspection jobs scheduled for today.\n\nNext: reply [1] to refresh your jobs.`
      const lines: string[] = []
      lines.push(`Hi${inspectorName ? ' ' + inspectorName : ''}! Here are your jobs for today:`)
      for (const j of jobs) {
        lines.push('')
        lines.push(`${j.selectionNumber}`)
        lines.push(`🏠 Property: ${j.property}`)
        lines.push(`⏰ Time: ${j.time}`)
        lines.push(`  👤 Customer: ${j.customer}`)
        lines.push(`  ⭐ Priority: ${j.priority}`)
        lines.push(`  Status: ${j.status}`)
        lines.push('---')
      }
      lines.push(`Type ${jobs.map((j: any) => j.selectionNumber).join(', ')} to select a job.`)
      return lines.join('\n')
    }

    // 2) Number selection routing (job/location/sub-location) or textual "go back"
    if ((selectedNumber && selectedNumber > 0) || isGoBackText) {
      // If we are confirming a job, treat [1]/[2] as yes/no
      if (session?.jobStatus === 'confirming' && session?.workOrderId) {
        if (selectedNumber === 1) {
          const t0 = Date.now()
          const res = await executeTool('startJob', { jobId: session.workOrderId }, undefined, phone)
          perfLog('tool:startJob', Date.now() - t0)
          const data = safeParseJSON(res)
          if (!data?.success) return null
          try {
            await updateSessionState(phone, {
              currentLocation: undefined,
              currentLocationId: undefined,
              currentSubLocationId: undefined,
              currentSubLocationName: undefined,
              taskFlowStage: undefined,
              currentTaskId: undefined,
              currentTaskName: undefined,
              currentTaskItemId: undefined,
              currentTaskEntryId: undefined,
              currentTaskCondition: undefined,
              currentTaskLocationId: undefined,
              currentTaskLocationName: undefined
            })
          } catch {}
          const locations: string[] = data.locationsFormatted || []
          const header = `Job started. Here are the locations available for inspection:`
          const next = 'Reply with the number of the location you want to inspect next.'
          return [header, '', ...locations, '', `Next: ${next}`].join('\n')
        }
        if (selectedNumber === 2) {
          const t0 = Date.now()
          const res = await executeTool('getTodayJobs', { inspectorPhone: phone }, undefined, phone)
          perfLog('tool:getTodayJobs', Date.now() - t0)
          const data = safeParseJSON(res)
          if (!data?.success) return null
          const jobs = Array.isArray(data.jobs) ? data.jobs : []
          if (jobs.length === 0) return `Okay. You have no inspection jobs scheduled for today.\n\nNext: reply [1] to refresh your jobs.`
          const lines: string[] = []
          lines.push(`Okay, let’s choose another job. Here are your jobs for today:`)
          for (const j of jobs) {
            lines.push('')
            lines.push(`${j.selectionNumber}`)
            lines.push(`🏠 Property: ${j.property}`)
            lines.push(`⏰ Time: ${j.time}`)
            lines.push(`  👤 Customer: ${j.customer}`)
            lines.push(`  ⭐ Priority: ${j.priority}`)
            lines.push(`  Status: ${j.status}`)
            lines.push('---')
          }
          lines.push(`Type ${jobs.map((j: any) => j.selectionNumber).join(', ')} to select a job.`)
          return lines.join('\n')
        }
      }

      // If no job selected yet: treat as job selection
      if (!session?.workOrderId) {
        const t0 = Date.now()
        const res = await executeTool('getTodayJobs', { inspectorPhone: phone }, undefined, phone)
        perfLog('tool:getTodayJobs', Date.now() - t0)
        const data = safeParseJSON(res)
        const jobs = Array.isArray(data?.jobs) ? data.jobs : []
        if (jobs.length === 0) return null
        if (selectedNumber > jobs.length) {
          return `The selection [${selectedNumber}] is not available. Please choose ${jobs.map((j: any) => j.selectionNumber).join(', ')}.`
        }
        const chosen = jobs[selectedNumber - 1]
        const t1 = Date.now()
        const cRes = await executeTool('confirmJobSelection', { jobId: chosen.id }, undefined, phone)
        perfLog('tool:confirmJobSelection', Date.now() - t1)
        const cData = safeParseJSON(cRes)
        if (!cData?.success) return null
        const lines: string[] = []
        lines.push('Please confirm the destination details before starting the inspection:')
        lines.push('')
        lines.push(`🏠 Property: ${cData.jobDetails?.property}`)
        lines.push(`⏰ Time: ${cData.jobDetails?.time}`)
        lines.push(`👤 Customer: ${cData.jobDetails?.customer}`)
        lines.push(`Status: ${cData.jobDetails?.status}`)
        lines.push('')
        lines.push('[1] Yes')
        lines.push('[2] No')
        lines.push('')
        lines.push('Next: reply [1] to confirm or [2] to pick another job.')
        return lines.join('\n')
      }

      // If job is started and no currentLocation picked yet → location selection
      if (isGoBackText && session?.workOrderId && session?.currentLocation && !session?.currentSubLocationId) {
        // textual go back from sub-location stage → locations list
        const locRes = await executeTool('getJobLocations', { jobId: session.workOrderId }, undefined, phone)
        const locData = safeParseJSON(locRes)
        const formattedLocations: string[] = locData?.locationsFormatted || []
        const header = 'Here are the locations available for inspection:'
        return [header, '', ...formattedLocations, '', 'Next: reply with the location number to continue.'].join('\n')
      }

      if (session?.workOrderId && !session?.currentLocation) {
        const locRes = await executeTool('getJobLocations', { jobId: session.workOrderId }, undefined, phone)
        const locData = safeParseJSON(locRes)
        const list = Array.isArray(locData?.locations) ? locData.locations : []
        if (list.length === 0) return null
        if (selectedNumber > list.length) {
          const options = (locData?.locationsFormatted || []).join('\n')
          return `That location number isn't valid.\n\n${options}\n\nNext: reply with the number of the location you want to inspect.`
        }
        const chosen = list[selectedNumber - 1]
        const hasSubs = Array.isArray(chosen?.subLocations) && chosen.subLocations.length > 0
        if (hasSubs) {
          const subRes = await executeTool('getSubLocations', { workOrderId: session.workOrderId, contractChecklistItemId: chosen.contractChecklistItemId, locationName: chosen.name }, undefined, phone)
          const subData = safeParseJSON(subRes)
          const formatted: string[] = subData?.subLocationsFormatted || []
          if (!formatted.length) {
            const tasksRes = await executeTool('getTasksForLocation', { workOrderId: session.workOrderId, location: chosen.name, contractChecklistItemId: chosen.contractChecklistItemId }, undefined, phone)
            return formatTasksResponse(chosen.name, tasksRes)
          }
          const header = `You've selected ${chosen.name}. Here are the available sub-locations:`
          const withBack = [...formatted, `[${formatted.length + 1}] Go back`]
          return [header, '', ...withBack, '', `Next: reply with your sub-location choice, or [${withBack.length}] to go back.`].join('\n')
        }
        const tasksRes = await executeTool('getTasksForLocation', { workOrderId: session.workOrderId, location: chosen.name, contractChecklistItemId: chosen.contractChecklistItemId }, undefined, phone)
        return formatTasksResponse(chosen.name, tasksRes)
      }

      // If location is set but sub-location not chosen and we have sub-location options cached
      if (session?.workOrderId && session?.currentLocation && !session?.currentSubLocationId) {
        if (isGoBackText) {
          // textual go back → locations
          const locRes = await executeTool('getJobLocations', { jobId: session.workOrderId }, undefined, phone)
          const locData = safeParseJSON(locRes)
          const formattedLocations: string[] = locData?.locationsFormatted || []
          const header = 'Here are the locations available for inspection:'
          return [header, '', ...formattedLocations, '', 'Next: reply with the location number to continue.'].join('\n')
        }
        const latest = await getSessionState(phone)
        const currentItemId = latest?.currentLocationId
        let subOptions: Array<{ id: string; name: string; status: string }> | undefined
        const subMap = (latest as any)?.locationSubLocations as Record<string, Array<{ id: string; name: string; status: string }>> | undefined
        if (subMap && currentItemId && subMap[currentItemId]) subOptions = subMap[currentItemId]
        if (!subOptions) {
          const locRes = await executeTool('getJobLocations', { jobId: session.workOrderId }, undefined, phone)
          const locData = safeParseJSON(locRes)
          const list = Array.isArray(locData?.locations) ? locData.locations : []
          const match = list.find((l: any) => l.contractChecklistItemId === currentItemId)
          if (match && Array.isArray(match.subLocations)) subOptions = match.subLocations
        }
        if (Array.isArray(subOptions) && subOptions.length > 0) {
          const backNumber = subOptions.length + 1
          if (selectedNumber === backNumber) {
            // Go back to locations
            try {
              await updateSessionState(phone, {
                currentLocation: undefined,
                currentLocationId: undefined,
                currentSubLocationId: undefined,
                currentSubLocationName: undefined,
              })
            } catch {}
            const locRes2 = await executeTool('getJobLocations', { jobId: session.workOrderId }, undefined, phone)
            const locData2 = safeParseJSON(locRes2)
            const formattedLocations: string[] = locData2?.locationsFormatted || []
            const header = 'Here are the locations available for inspection:'
            return [header, '', ...formattedLocations, '', 'Next: reply with the location number to continue.'].join('\n')
          }
          if (selectedNumber > backNumber) {
            const formatted = subOptions.map((s, i) => `[${i + 1}] ${s.name}${s.status === 'completed' ? ' (Done)' : ''}`)
            const withBack = [...formatted, `[${formatted.length + 1}] Go back`]
            return `That sub-location number isn't valid.\n\n${withBack.join('\n')}\n\nNext: reply with your sub-location choice, or [${withBack.length}] to go back.`
          }
          const chosen = subOptions[selectedNumber - 1]
          const tasksRes = await executeTool('getTasksForLocation', { workOrderId: session.workOrderId, location: session.currentLocation, contractChecklistItemId: currentItemId, subLocationId: chosen.id }, undefined, phone)
          return formatTasksResponse(session.currentLocation, tasksRes)
        }
      }
    }

    // 3) Simple yes/no in confirming stage (without numbers)
    if (session?.jobStatus === 'confirming' && session?.workOrderId) {
      if (['yes', 'y'].includes(lower)) {
        const res = await executeTool('startJob', { jobId: session.workOrderId }, undefined, phone)
        const data = safeParseJSON(res)
        if (!data?.success) return null
        const locations: string[] = data.locationsFormatted || []
        const header = `Job started. Here are the locations available for inspection:`
        const next = 'Reply with the number of the location you want to inspect next.'
        return [header, '', ...locations, '', `Next: ${next}`].join('\n')
      }
      if (['no', 'n'].includes(lower)) {
        const res = await executeTool('getTodayJobs', { inspectorPhone: phone }, undefined, phone)
        const data = safeParseJSON(res)
        if (!data?.success) return null
        const jobs = Array.isArray(data.jobs) ? data.jobs : []
        if (jobs.length === 0) return `Okay. You have no inspection jobs scheduled for today.\n\nNext: reply [1] to refresh your jobs.`
        const lines: string[] = []
        lines.push(`Okay, let’s choose another job. Here are your jobs for today:`)
        for (const j of jobs) {
          lines.push('')
          lines.push(`${j.selectionNumber}`)
          lines.push(`🏠 Property: ${j.property}`)
          lines.push(`⏰ Time: ${j.time}`)
          lines.push(`  👤 Customer: ${j.customer}`)
          lines.push(`  ⭐ Priority: ${j.priority}`)
          lines.push(`  Status: ${j.status}`)
          lines.push('---')
        }
        lines.push(`Type ${jobs.map((j: any) => j.selectionNumber).join(', ')} to select a job.`)
        return lines.join('\n')
      }
    }

    // 4) Task-flow fast path (condition → media → remarks → confirm)
    if ((process.env.WHATSAPP_FAST_TASK_FLOW ?? 'true').toLowerCase() !== 'false' && session?.workOrderId && session?.currentLocation) {
      const latest = await getSessionState(phone)
      const ctx = {
        workOrderId: latest.workOrderId!,
        locationName: latest.currentLocation!,
        itemId: latest.currentLocationId,
        subLocationId: latest.currentSubLocationId,
        stage: latest.taskFlowStage,
        currentTaskId: latest.currentTaskId
      }

      if (isGoBackText) {
        // From tasks flow: go back to sub-locations if present; else locations
        if (ctx.subLocationId) {
          const subs = await executeTool('getSubLocations', { workOrderId: ctx.workOrderId, contractChecklistItemId: ctx.itemId, locationName: ctx.locationName }, undefined, phone)
          const subData = safeParseJSON(subs)
          const formatted: string[] = subData?.subLocationsFormatted || []
          const withBack = [...formatted, `[${formatted.length + 1}] Go back`]
          const header = `You're back at ${ctx.locationName}. Here are the sub-locations:`
          return [header, '', ...withBack, '', `Next: reply with your sub-location choice, or [${withBack.length}] to go back.`].join('\n')
        }
        const locs = await executeTool('getJobLocations', { jobId: ctx.workOrderId }, undefined, phone)
        const locData = safeParseJSON(locs)
        const formattedLocations: string[] = locData?.locationsFormatted || []
        const header = 'Here are the locations available for inspection:'
        return [header, '', ...formattedLocations, '', 'Next: reply with the location number to continue.'].join('\n')
      }

      // a) Finalize step ([1] completed, [2] not yet)
      if (ctx.stage === 'confirm' && selectedNumber && (selectedNumber === 1 || selectedNumber === 2)) {
        const finalize = await executeTool('completeTask', { phase: 'finalize', workOrderId: ctx.workOrderId, taskId: ctx.currentTaskId, completed: selectedNumber === 1 }, undefined, phone)
        const f = safeParseJSON(finalize)
        if (!f?.success && typeof f?.error === 'string') {
          return `${f.error}\n\nNext: send the required media or add a remark, or type 'skip' to continue without media.`
        }
        const tasksRes = await executeTool('getTasksForLocation', { workOrderId: ctx.workOrderId, location: ctx.locationName, contractChecklistItemId: ctx.itemId, subLocationId: ctx.subLocationId }, undefined, phone)
        return formatTasksResponse(ctx.locationName, tasksRes)
      }

      // b) Condition selection (1..5)
      if (ctx.stage === 'condition' && selectedNumber && selectedNumber >= 1 && selectedNumber <= 5) {
        const setCond = await executeTool('completeTask', { phase: 'set_condition', workOrderId: ctx.workOrderId, taskId: ctx.currentTaskId, conditionNumber: selectedNumber }, undefined, phone)
        const s = safeParseJSON(setCond)
        if (!s?.success && typeof s?.error === 'string') return s.error
        if (s?.taskFlowStage === 'cause' || s?.message?.toLowerCase().includes('cause')) {
          return 'Please describe the cause for this issue.'
        }
        return `Condition saved. Please send any photos/videos now — you can add remarks in the same message as a caption. Or type 'skip' to continue.\n\nNext: send media with a caption (remarks) or reply 'skip'.`
      }

      // c) Media step: skip
      if (ctx.stage === 'media' && (lower === 'skip' || lower === 'no')) {
        const skip = await executeTool('completeTask', { phase: 'skip_media', workOrderId: ctx.workOrderId, taskId: ctx.currentTaskId }, undefined, phone)
        const sk = safeParseJSON(skip)
        if (!sk?.success && typeof sk?.error === 'string') return sk.error
        return `Okay, skipping media for now.\n\nNext: reply [1] if this task is complete, [2] if you still have more to do for it.`
      }

      // d) Cause/Resolution/Remarks while in media/remarks stage
      if (ctx.stage === 'cause' && msg && !selectedNumber) {
        const res = await executeTool('completeTask', { phase: 'set_cause', workOrderId: ctx.workOrderId, taskId: ctx.currentTaskId, cause: msg }, undefined, phone)
        const r = safeParseJSON(res)
        if (!r?.success && typeof r?.error === 'string') return r.error
        return r?.message || 'Thanks. Please provide the resolution.'
      }

      if (ctx.stage === 'resolution' && msg && !selectedNumber) {
        const res = await executeTool('completeTask', { phase: 'set_resolution', workOrderId: ctx.workOrderId, taskId: ctx.currentTaskId, resolution: msg }, undefined, phone)
        const r = safeParseJSON(res)
        if (!r?.success && typeof r?.error === 'string') return r.error
        return r?.message || `Resolution saved. Please send any photos/videos now (you can add extra notes as a caption), or type 'skip' to continue.`
      }

      if ((ctx.stage === 'remarks' || ctx.stage === 'media') && msg && !selectedNumber) {
        const setRemarks = await executeTool('completeTask', { phase: 'set_remarks', workOrderId: ctx.workOrderId, taskId: ctx.currentTaskId, remarks: msg }, undefined, phone)
        const r = safeParseJSON(setRemarks)
        if (!r?.success && typeof r?.error === 'string') return r.error
        return `Got it — I saved your remark.\n\nNext: reply [1] if this task is complete, [2] if you still have more to do for it.`
      }

      // e) Task selection by number (last option = Go back one step)
      if (selectedNumber && selectedNumber > 0) {
        const tasksRes = await executeTool('getTasksForLocation', { workOrderId: ctx.workOrderId, location: ctx.locationName, contractChecklistItemId: ctx.itemId, subLocationId: ctx.subLocationId }, undefined, phone)
        const data = safeParseJSON(tasksRes)
        const tasks = Array.isArray(data?.tasks) ? data.tasks : []
        if (tasks.length === 0) return null
        const backNumber = tasks.length + 1
        if (selectedNumber > backNumber) {
          return `That task number isn't valid.\n\n${formatTasksResponse(ctx.locationName, tasksRes)}`
        }
        if (selectedNumber === backNumber) {
          // Go back to sub-locations if present; otherwise to locations
          if (ctx.subLocationId) {
            const subs = await executeTool('getSubLocations', { workOrderId: ctx.workOrderId, contractChecklistItemId: ctx.itemId, locationName: ctx.locationName }, undefined, phone)
            const subData = safeParseJSON(subs)
            const formatted: string[] = subData?.subLocationsFormatted || []
            const header = `You're back at ${ctx.locationName}. Here are the sub-locations:`
            if (formatted.length > 0) return [header, '', ...formatted, '', 'Next: reply with your sub-location choice.'].join('\n')
          }
          const locs = await executeTool('getJobLocations', { jobId: ctx.workOrderId }, undefined, phone)
          const locData = safeParseJSON(locs)
          const formatted: string[] = locData?.locationsFormatted || []
          const header = 'Here are the locations available for inspection:'
          return [header, '', ...formatted, '', 'Next: reply with the location number to continue.'].join('\n')
        }
        const chosen = tasks[selectedNumber - 1]
        const start = await executeTool('completeTask', { phase: 'start', workOrderId: ctx.workOrderId, taskId: chosen.id }, undefined, phone)
        const st = safeParseJSON(start)
        if (!st?.success && typeof st?.error === 'string') return st.error
        return [
          `Starting: ${chosen.description || 'Selected task'}`,
          '',
          'Set the condition for this task:',
          '[1] Good',
          '[2] Fair',
          '[3] Un-Satisfactory',
          '[4] Un-Observable',
          '[5] Not Applicable',
          '',
          'Next: reply 1–5 to set the condition.'
        ].join('\n')
      }
    }

    return null
  } catch (e) {
    console.error('fast-path error:', e)
    return null
  }
}

function safeParseJSON(text: string | null | undefined): any {
  if (!text) return null
  try { return JSON.parse(text) } catch { return null }
}

function formatTasksResponse(locationName: string, toolOutput: string): string | null {
  const data = safeParseJSON(toolOutput)
  if (!data?.success) return null
  const tasks = Array.isArray(data.tasks) ? data.tasks : []
  const lines: string[] = []
  lines.push(`In ${locationName}, here are the tasks available for inspection:`)
  lines.push('')
  for (const t of tasks) {
    const status = t.displayStatus === 'done' ? ' (Done)' : ''
    lines.push(`[${t.number}] ${t.description}${status}`)
  }
  // Replace old "mark all complete" with "Go back" option
  lines.push(`[${tasks.length + 1}] Go back`)
  const next = `Reply with the task number to continue, or [${tasks.length + 1}] to go back.`
  lines.push('')
  lines.push(`Next: ${next}`)
  return lines.join('\n')
}
