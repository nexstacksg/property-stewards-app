/**
 * Task object structure for inspection tasks
 */
export interface Task {
  task: string;
  status: 'pending' | 'done';
}

/**
 * Parse action text into individual tasks array with status
 * Examples:
 * "Check walls, ceiling, flooring" => [{task: "Check walls", status: "pending"}, {task: "Check ceiling", status: "pending"}, ...]
 * "Inspect walls, windows, aircon" => [{task: "Inspect walls", status: "pending"}, {task: "Inspect windows", status: "pending"}, ...]
 * "Test all electrical outlets" => [{task: "Test all electrical outlets", status: "pending"}]
 */
export function parseActionIntoTasks(action: string): Task[] {
  if (!action) {
    return [{ task: 'Others', status: 'pending' }];
  }
  
  // Common action verbs that start inspection tasks
  const actionVerbs = ['check', 'inspect', 'test', 'verify', 'examine', 'assess', 'review'];
  
  // Find if the action starts with a common verb
  const lowerAction = action.toLowerCase();
  let verb = '';
  let remainingText = action;
  
  for (const v of actionVerbs) {
    if (lowerAction.startsWith(v + ' ')) {
      verb = action.substring(0, v.length);
      remainingText = action.substring(v.length + 1);
      break;
    }
  }
  
  // If no verb found, return as single task
  if (!verb) {
    const singleTask: Task[] = [{ task: action, status: 'pending' }];
    ensureOthersTask(singleTask);
    return singleTask;
  }
  
  // Split by commas and 'and'
  const items = remainingText
    .split(/,|\sand\s/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
  
  // If only one item or no commas/and found, return original
  if (items.length <= 1) {
    const singleTask: Task[] = [{ task: action, status: 'pending' }];
    ensureOthersTask(singleTask);
    return singleTask;
  }
  
  // Combine verb with each item
  const tasks: Task[] = [];
  for (const item of items) {
    // Skip if item is empty or just whitespace
    if (!item || item.length === 0) continue;
    
    // Capitalize first letter of verb
    const capitalizedVerb = verb.charAt(0).toUpperCase() + verb.slice(1);
    
    // Create task object with verb + item and pending status
    tasks.push({
      task: `${capitalizedVerb} ${item}`,
      status: 'pending'
    });
  }
  
  if (tasks.length === 0) {
    const fallback: Task[] = [{ task: action, status: 'pending' }];
    ensureOthersTask(fallback);
    return fallback;
  }

  ensureOthersTask(tasks);
  return tasks;
}

function ensureOthersTask(list: Task[]) {
  const hasOthers = list.some((task) => task.task.trim().toLowerCase() === 'others');
  if (!hasOthers) {
    list.push({ task: 'Others', status: 'pending' });
  }
}

// Test examples
/*
console.log(parseActionIntoTasks("Check walls, ceiling, flooring, windows, and electrical points"));
// Output: [
//   {task: "Check walls", status: "pending"},
//   {task: "Check ceiling", status: "pending"},
//   {task: "Check flooring", status: "pending"},
//   {task: "Check windows", status: "pending"},
//   {task: "Check electrical points", status: "pending"}
// ]

console.log(parseActionIntoTasks("Inspect walls, windows, aircon, built-in wardrobe"));
// Output: [
//   {task: "Inspect walls", status: "pending"},
//   {task: "Inspect windows", status: "pending"},
//   {task: "Inspect aircon", status: "pending"},
//   {task: "Inspect built-in wardrobe", status: "pending"}
// ]

console.log(parseActionIntoTasks("Test smart home systems if applicable"));
// Output: [{task: "Test smart home systems if applicable", status: "pending"}]

console.log(parseActionIntoTasks("Check cabinets, sink, stove, hood, tiles, plumbing"));
// Output: [
//   {task: "Check cabinets", status: "pending"},
//   {task: "Check sink", status: "pending"},
//   {task: "Check stove", status: "pending"},
//   {task: "Check hood", status: "pending"},
//   {task: "Check tiles", status: "pending"},
//   {task: "Check plumbing", status: "pending"}
// ]
*/
