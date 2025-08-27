import { query } from '../db';

export interface Inspector {
  id: string;
  name: string;
  phone: string;
  email?: string;
  specialization?: string;
  status: 'active' | 'inactive';
  created_at: Date;
}

export interface WorkOrder {
  id: string;
  inspector_id: string;
  property_address: string;
  customer_name: string;
  customer_phone?: string;
  inspection_type: string;
  scheduled_date: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  estimated_duration?: number;
  notes?: string;
  created_at: Date;
}

export interface Task {
  id: string;
  work_order_id: string;
  location: string;
  task_name: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  priority: number;
  photos?: string[];
  notes?: string;
  completed_at?: Date;
}

// Inspector functions
export async function getInspectorByPhone(phone: string): Promise<Inspector | null> {
  try {
    const result = await query(
      'SELECT * FROM inspectors WHERE phone = $1 AND status = $2',
      [phone, 'active']
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching inspector by phone:', error);
    throw error;
  }
}

export async function getInspectorById(id: string): Promise<Inspector | null> {
  try {
    const result = await query(
      'SELECT * FROM inspectors WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching inspector by ID:', error);
    throw error;
  }
}

// Work Order functions
export async function getTodayJobsForInspector(inspectorId: string): Promise<WorkOrder[]> {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const result = await query(`
      SELECT * FROM work_orders 
      WHERE inspector_id = $1 
      AND scheduled_date >= $2 
      AND scheduled_date < $3 
      AND status IN ('pending', 'in_progress')
      ORDER BY scheduled_date ASC, priority DESC
    `, [inspectorId, startOfDay, endOfDay]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching today jobs:', error);
    throw error;
  }
}

export async function getWorkOrderById(id: string): Promise<WorkOrder | null> {
  try {
    const result = await query(
      'SELECT * FROM work_orders WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching work order:', error);
    throw error;
  }
}

export async function updateWorkOrderStatus(id: string, status: WorkOrder['status']): Promise<boolean> {
  try {
    const result = await query(
      'UPDATE work_orders SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
    return result.rowCount > 0;
  } catch (error) {
    console.error('Error updating work order status:', error);
    throw error;
  }
}

// Task functions
export async function getTasksForWorkOrder(workOrderId: string): Promise<Task[]> {
  try {
    // Return basic location-based tasks
    const result = await query(`
      SELECT 
        id,
        work_order_id,
        location_name as location,
        location_name as task_name,
        description,
        'pending' as status,
        order_sequence as priority,
        created_at
      FROM work_order_locations 
      WHERE work_order_id = $1 
      ORDER BY order_sequence ASC
    `, [workOrderId]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching tasks for work order:', error);
    throw error;
  }
}

export async function getTasksByLocation(workOrderId: string, location: string): Promise<Task[]> {
  try {
    // Return basic location-based task
    const result = await query(`
      SELECT 
        id,
        work_order_id,
        location_name as location,
        location_name as task_name,
        description,
        'pending' as status,
        order_sequence as priority,
        created_at
      FROM work_order_locations 
      WHERE work_order_id = $1 AND location_name = $2 
      ORDER BY order_sequence ASC
    `, [workOrderId, location]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching tasks by location:', error);
    throw error;
  }
}

export async function updateTaskStatus(
  taskId: string, 
  status: Task['status'], 
  notes?: string
): Promise<boolean> {
  try {
    // For now, just return true as task status updates aren't fully implemented
    console.log(`Task ${taskId} marked as ${status}`, notes ? `with notes: ${notes}` : '');
    return true;
  } catch (error) {
    console.error('Error updating task status:', error);
    throw error;
  }
}

export async function addTaskPhoto(taskId: string, photoUrl: string): Promise<boolean> {
  try {
    // For now, just log the photo addition
    console.log(`Photo ${photoUrl} added to task ${taskId}`);
    return true;
  } catch (error) {
    console.error('Error adding task photo:', error);
    throw error;
  }
}

// Utility functions
export async function getDistinctLocationsForWorkOrder(workOrderId: string): Promise<string[]> {
  try {
    const result = await query(`
      SELECT location_name
      FROM work_order_locations 
      WHERE work_order_id = $1 
      ORDER BY order_sequence
    `, [workOrderId]);

    return result.rows.map(row => row.location_name);
  } catch (error) {
    console.error('Error fetching locations:', error);
    throw error;
  }
}

export async function getWorkOrderProgress(workOrderId: string) {
  try {
    // For now, return basic progress based on locations
    const result = await query(`
      SELECT 
        COUNT(*) as total_tasks,
        0 as completed_tasks,
        0 as in_progress_tasks,
        COUNT(*) as pending_tasks
      FROM work_order_locations 
      WHERE work_order_id = $1
    `, [workOrderId]);

    return result.rows[0];
  } catch (error) {
    console.error('Error fetching work order progress:', error);
    throw error;
  }
}