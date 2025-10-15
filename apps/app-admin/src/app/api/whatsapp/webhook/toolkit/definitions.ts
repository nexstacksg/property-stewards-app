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

