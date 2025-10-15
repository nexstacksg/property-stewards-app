import { executeTool } from './toolkit'
import { getSessionState, updateSessionState, type ChatSessionState } from '@/lib/chat-session'

function perfLog(label: string, ms: number) {
  if (process.env.WHATSAPP_PERF_LOG === 'true') {
    console.log(`[perf] ${label}: ${ms}ms`)
  }
}

function dbgFast(...args: any[]) {
  const on = (process.env.WHATSAPP_DEBUG || '').toLowerCase()
  if (on === 'true' || on === 'verbose') console.log('[wh-fast]', ...args)
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
      dbgFast('intent:jobs matched; resetting session context')
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
      dbgFast('tool:getTodayJobs done')
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

    // 1.5) Guard: If awaiting explicit confirmation (job), hold position until valid input
    if (session?.jobStatus === 'confirming' && session?.workOrderId) {
      const latest = await getSessionState(phone)
      const inJobEditFlow = (latest as any)?.jobEditMode === 'menu' || (latest as any)?.jobEditMode === 'await_value'
      // Allow explicit yes/no text below, numeric handled in section 2; otherwise, re-prompt
      if (!inJobEditFlow && !(selectedNumber && (selectedNumber === 1 || selectedNumber === 2)) && !['yes', 'y', 'no', 'n'].includes(lower)) {
        return 'I need your confirmation to continue.\n\nReply [1] to confirm, or [2] to choose another job or make changes.'
      }
    }

    // 2) Number selection routing (job/location/sub-location) or textual "go back"
    if ((selectedNumber && selectedNumber > 0) || isGoBackText) {
      // If we are confirming a job, treat [1]/[2] as yes/no
      if (session?.jobStatus === 'confirming' && session?.workOrderId) {
        if (selectedNumber === 1) {
          const t0 = Date.now()
          const res = await executeTool('startJob', { jobId: session.workOrderId }, undefined, phone)
          perfLog('tool:startJob', Date.now() - t0)
          dbgFast('flow:confirm yes → startJob')
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
          // Enter job edit menu
          await updateSessionState(phone, { lastMenu: 'confirm', jobEditMode: 'menu', jobEditType: undefined })
          const lines: string[] = []
          lines.push('What would you like to change about the job? Here are some options:')
          lines.push('')
          lines.push('[1] Different job selection')
          lines.push('[2] Customer name update')
          lines.push('[3] Property address change')
          lines.push('[4] Time rescheduling')
          lines.push('[5] Work order status change (SCHEDULED/STARTED/CANCELLED/COMPLETED)')
          lines.push('')
          lines.push('Next: reply [1-5] with your choice.')
          return lines.join('\n')
        }
        // Any other numeric value → hold position and re-prompt for [1]/[2]
        if (selectedNumber && selectedNumber !== 1 && selectedNumber !== 2) {
          return 'That option isn\'t valid here.\n\nReply [1] to confirm this job, or [2] to pick another one.'
        }
      }

      // If the last menu was 'jobs', treat numbers as a job selection regardless of stale state
      if (session?.lastMenu === 'jobs' || !session?.workOrderId) {
        const t0 = Date.now()
        const res = await executeTool('getTodayJobs', { inspectorPhone: phone }, undefined, phone)
        perfLog('tool:getTodayJobs', Date.now() - t0)
        dbgFast('flow:number→job selection')
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

      if (session?.lastMenu === 'locations' || (session?.workOrderId && !session?.currentLocation)) {
        dbgFast('flow:number→location selection', { selectedNumber })
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
          dbgFast('location has sub-locations; listing')
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
      if (session?.lastMenu === 'sublocations' || (session?.workOrderId && session?.currentLocation && !session?.currentSubLocationId)) {
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
          dbgFast('flow:number→sub-location selection', { selectedNumber })
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

    // 2.5) Job edit menu actions while confirming
    if (session?.jobStatus === 'confirming' && session?.workOrderId) {
      const latest = await getSessionState(phone)
      if ((latest as any)?.jobEditMode === 'menu') {
        // Expect a number 1..5
        if (selectedNumber && selectedNumber >= 1 && selectedNumber <= 5) {
          if (selectedNumber === 1) {
            // Different job selection → show today jobs
            await updateSessionState(phone, { jobEditMode: undefined, jobEditType: undefined })
            const t0 = Date.now()
            const res = await executeTool('getTodayJobs', { inspectorPhone: phone }, undefined, phone)
            perfLog('tool:getTodayJobs', Date.now() - t0)
            dbgFast('flow:confirm no → relist jobs (via edit menu)')
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
          // 2..5 → set edit type and prompt for value
          const typeMap: Record<number, 'customer' | 'address' | 'time' | 'status'> = { 2: 'customer', 3: 'address', 4: 'time', 5: 'status' }
          const chosen = typeMap[selectedNumber]
          await updateSessionState(phone, { jobEditMode: 'await_value', jobEditType: chosen })
          const prompts: Record<typeof chosen, string> = {
            customer: 'Please enter the new customer name.',
            address: 'Please enter the new property address (you can include postal code after a comma).',
            time: 'Please enter the new time (e.g., 14:30 or 2:30 pm).',
            status: 'Please enter the new work order status: SCHEDULED, STARTED, CANCELLED, or COMPLETED.'
          }
          return `${prompts[chosen]}\n\nNext: send the new ${chosen} value.`
        }
        // Invalid input in edit menu → re-show menu
        const lines: string[] = []
        lines.push('Please choose one of the following options:')
        lines.push('')
        lines.push('[1] Different job selection')
        lines.push('[2] Customer name update')
        lines.push('[3] Property address change')
        lines.push('[4] Time rescheduling')
        lines.push('[5] Work order status change (SCHEDULED/STARTED/CANCELLED/COMPLETED)')
        lines.push('')
        lines.push('Next: reply [1-5] with your choice.')
        return lines.join('\n')
      }
      if ((latest as any)?.jobEditMode === 'await_value' && (latest as any)?.jobEditType) {
        const updateType = (latest as any).jobEditType as 'customer' | 'address' | 'time' | 'status'
        const newValue = msg.trim()
        if (!newValue) return `Please provide a ${updateType} value.`
        const ok = await executeTool('updateJobDetails', { jobId: session.workOrderId, updateType, newValue }, undefined, phone)
        const okData = safeParseJSON(ok)
        // Reset edit state regardless of outcome
        await updateSessionState(phone, { jobEditMode: undefined, jobEditType: undefined })
        if (!okData?.success) {
          return `I couldn't update the ${updateType}. Please try again or pick another option.`
        }
        // Show updated confirmation again
        const cRes = await executeTool('confirmJobSelection', { jobId: session.workOrderId }, undefined, phone)
        const cData = safeParseJSON(cRes)
        if (!cData?.success) return 'Update saved. Please ask for jobs again to continue.'
        const lines: string[] = []
        lines.push('Here are the updated job details. Please confirm before starting the inspection:')
        lines.push('')
        lines.push(`🏠 Property: ${cData.jobDetails?.property}`)
        lines.push(`⏰ Time: ${cData.jobDetails?.time}`)
        lines.push(`👤 Customer: ${cData.jobDetails?.customer}`)
        lines.push(`Status: ${cData.jobDetails?.status}`)
        lines.push('')
        lines.push('[1] Yes')
        lines.push('[2] No')
        lines.push('')
        lines.push('Next: reply [1] to confirm or [2] to make more changes.')
        return lines.join('\n')
      }
    }

    // 2.6) Guard: If we were listing locations and no valid number provided, repeat the list
    if (session?.workOrderId && (session?.lastMenu === 'locations' || (!session?.currentLocation && !session?.taskFlowStage))) {
      const locRes = await executeTool('getJobLocations', { jobId: session.workOrderId }, undefined, phone)
      const locData = safeParseJSON(locRes)
      const formattedLocations: string[] = locData?.locationsFormatted || []
      if (formattedLocations.length > 0) {
        const header = 'Here are the locations available for inspection:'
        return [header, '', ...formattedLocations, '', 'Next: reply with the location number to continue.'].join('\n')
      }
    }

    // 2.7) Guard: If we were listing sub-locations and no valid number provided, repeat the options
    if (session?.workOrderId && session?.currentLocation && (session?.lastMenu === 'sublocations') && !session?.taskFlowStage) {
      const currentItemId = session.currentLocationId
      if (currentItemId) {
        const subRes = await executeTool('getSubLocations', { workOrderId: session.workOrderId, contractChecklistItemId: currentItemId, locationName: session.currentLocation }, undefined, phone)
        const subData = safeParseJSON(subRes)
        const formatted: string[] = subData?.subLocationsFormatted || []
        if (formatted.length > 0) {
          const withBack = [...formatted, `[${formatted.length + 1}] Go back`]
          const header = `You\'re at ${session.currentLocation}. Here are the sub-locations:`
          return [header, '', ...withBack, '', `Next: reply with your sub-location choice, or [${withBack.length}] to go back.`].join('\n')
        }
      }
    }

    // 3) Simple yes/no in confirming stage (without numbers) — optional via env
    if (session?.jobStatus === 'confirming' && session?.workOrderId) {
      const allowTextConfirm = (process.env.WHATSAPP_CONFIRM_TEXT ?? 'false').toLowerCase() === 'true'
      if (allowTextConfirm && ['yes', 'y'].includes(lower)) {
        dbgFast('flow:text confirm yes')
        const res = await executeTool('startJob', { jobId: session.workOrderId }, undefined, phone)
        const data = safeParseJSON(res)
        if (!data?.success) return null
        const locations: string[] = data.locationsFormatted || []
        const header = `Job started. Here are the locations available for inspection:`
        const next = 'Reply with the number of the location you want to inspect next.'
        return [header, '', ...locations, '', `Next: ${next}`].join('\n')
      }
      if (allowTextConfirm && ['no', 'n'].includes(lower)) {
        dbgFast('flow:text confirm no')
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

      // 4.0) Guard: If we are on tasks list (lastMenu === 'tasks') and no valid number provided, re-show tasks
      if ((latest as any)?.lastMenu === 'tasks' && !selectedNumber && !isGoBackText && !ctx.stage) {
        const tasksRes = await executeTool('getTasksForLocation', { workOrderId: ctx.workOrderId, location: ctx.locationName, contractChecklistItemId: ctx.itemId, subLocationId: ctx.subLocationId }, undefined, phone)
        const body = formatTasksResponse(ctx.locationName, tasksRes)
        if (body) return body
      }

      // 4.1) Guard: If we are on condition stage and no valid [1-5], prompt again
      if (ctx.stage === 'condition' && !(selectedNumber && selectedNumber >= 1 && selectedNumber <= 5)) {
        return [
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
        dbgFast('flow:finalize', { completed: selectedNumber === 1 })
        const finalize = await executeTool('completeTask', { phase: 'finalize', workOrderId: ctx.workOrderId, taskId: ctx.currentTaskId, completed: selectedNumber === 1 }, undefined, phone)
        const f = safeParseJSON(finalize)
        if (!f?.success && typeof f?.error === 'string') {
          return `${f.error}\n\nNext: send the required media or add a remark.`
        }
        const tasksRes = await executeTool('getTasksForLocation', { workOrderId: ctx.workOrderId, location: ctx.locationName, contractChecklistItemId: ctx.itemId, subLocationId: ctx.subLocationId }, undefined, phone)
        const header = (f?.message as string | undefined) || undefined
        const body = formatTasksResponse(ctx.locationName, tasksRes)
        return header ? `${header}\n\n${body}` : body
      }
      // a.1) Guard: In finalize step but invalid/no number → re-prompt
      if (ctx.stage === 'confirm' && !(selectedNumber === 1 || selectedNumber === 2)) {
        return 'Please confirm: reply [1] if this task is complete, or [2] if you still have more to do for it.'
      }

      // b) Condition selection (1..5)
      if (ctx.stage === 'condition' && selectedNumber && selectedNumber >= 1 && selectedNumber <= 5) {
        dbgFast('flow:set_condition', { selectedNumber })
        const setCond = await executeTool('completeTask', { phase: 'set_condition', workOrderId: ctx.workOrderId, taskId: ctx.currentTaskId, conditionNumber: selectedNumber }, undefined, phone)
        const s = safeParseJSON(setCond)
        if (!s?.success && typeof s?.error === 'string') return s.error
        if (s?.taskFlowStage === 'cause' || s?.message?.toLowerCase().includes('cause')) {
          return 'Please describe the cause for this issue.'
        }
        // Only mention 'skip' when condition is Not Applicable
        const cond = String(s?.condition || (latest as any)?.currentTaskCondition || '').toUpperCase()
        const allowSkip = cond === 'NOT_APPLICABLE'
        return allowSkip
          ? `Condition saved. Please send any photos/videos now — you can add remarks in the same message as a caption. Or type 'skip' to continue.\n\nNext: send media with a caption (remarks) or reply 'skip'.`
          : `Condition saved. Please send any photos/videos now — you can add remarks in the same message as a caption.\n\nNext: send media with a caption (remarks).`
      }

      // c) Media step: skip
      if (ctx.stage === 'media' && (lower === 'skip' || lower === 'no')) {
        dbgFast('flow:skip_media')
        const skip = await executeTool('completeTask', { phase: 'skip_media', workOrderId: ctx.workOrderId, taskId: ctx.currentTaskId }, undefined, phone)
        const sk = safeParseJSON(skip)
        if (!sk?.success && typeof sk?.error === 'string') return sk.error
        return sk?.message || `Okay, skipping media for now.\n\nNext: reply [1] if this task is complete, [2] if you still have more to do for it.`
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
        {
          const allowSkip = String((latest as any)?.currentTaskCondition || '').toUpperCase() === 'NOT_APPLICABLE'
          return r?.message || (allowSkip
            ? `Resolution saved. Please send any photos/videos now (you can add extra notes as a caption), or type 'skip' to continue.`
            : `Resolution saved. Please send any photos/videos now (you can add extra notes as a caption).`)
        }
      }

      if ((ctx.stage === 'remarks' || ctx.stage === 'media') && msg && !selectedNumber) {
        dbgFast('flow:set_remarks')
        const setRemarks = await executeTool('completeTask', { phase: 'set_remarks', workOrderId: ctx.workOrderId, taskId: ctx.currentTaskId, remarks: msg }, undefined, phone)
        const r = safeParseJSON(setRemarks)
        if (!r?.success && typeof r?.error === 'string') return r.error
        return `Got it — I saved your remark.\n\nNext: reply [1] if this task is complete, [2] if you still have more to do for it.`
      }

      // d.5) Guard: In media/remarks but user sent an unrelated token (e.g., punctuation only)
      if ((ctx.stage === 'remarks' || ctx.stage === 'media') && !selectedNumber) {
        const allowSkip = String((latest as any)?.currentTaskCondition || '').toUpperCase() === 'NOT_APPLICABLE'
        return allowSkip
          ? `Please send photos/videos now (you can add a caption for remarks), or reply 'skip' to continue.\n\nNext: send media with a caption (remarks) or reply 'skip'.`
          : `Please send photos/videos now (you can add a caption for remarks).\n\nNext: send media with a caption (remarks).`
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
