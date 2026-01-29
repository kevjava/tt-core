import {
  TaskScheduler,
  ScheduledTask,
  DailyPlan,
  CompletionData,
} from '@kevjava/task-parser';
import { TTDatabase } from './database';
import { TTScheduledTaskWithTags, SessionWithTags } from './types';

/**
 * TTScheduler implements TaskScheduler with simple FIFO + priority ordering.
 *
 * Ordering logic:
 * 1. Incomplete/paused sessions (highest priority - resume work in progress)
 * 2. Urgent tasks (scheduled for today or overdue)
 * 3. Important tasks (priority != 5)
 * 4. Oldest tasks (FIFO for everything else)
 */
export class TTScheduler implements TaskScheduler {
  constructor(private db: TTDatabase) {}

  getDailyPlan(_date: Date, options?: { limit?: number }): DailyPlan {
    const selection = this.db.getScheduledTasksForSelection();
    const limit = options?.limit ?? 20;

    // Convert to ScheduledTask format and deduplicate
    const seen = new Set<string>();
    const tasks: ScheduledTask[] = [];

    // Helper to add task if not already seen
    const addTask = (task: ScheduledTask) => {
      const key = `task-${task.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        tasks.push(task);
      }
    };

    // Helper to add session if not already seen
    const addSession = (
      session: SessionWithTags & { totalMinutes?: number; chainSessionCount?: number }
    ) => {
      const key = `session-${session.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        tasks.push(this.sessionToScheduledTask(session));
      }
    };

    // 1. Incomplete sessions first (work in progress)
    for (const session of selection.incomplete) {
      if (tasks.length >= limit) break;
      addSession(session);
    }

    // 2. Urgent tasks (scheduled for today or overdue)
    for (const task of selection.urgent) {
      if (tasks.length >= limit) break;
      addTask(this.ttTaskToScheduledTask(task));
    }

    // 3. Important tasks (priority != 5)
    for (const task of selection.important) {
      if (tasks.length >= limit) break;
      addTask(this.ttTaskToScheduledTask(task));
    }

    // 4. Oldest tasks (FIFO)
    for (const task of selection.oldest) {
      if (tasks.length >= limit) break;
      addTask(this.ttTaskToScheduledTask(task));
    }

    // Calculate totals
    let totalMinutes = 0;
    for (const task of tasks) {
      totalMinutes += task.estimateMinutes ?? 0;
    }

    // Assume 8-hour workday for remaining calculation
    const workdayMinutes = 8 * 60;
    const remainingMinutes = Math.max(0, workdayMinutes - totalMinutes);

    return {
      tasks,
      totalMinutes,
      remainingMinutes,
    };
  }

  getTask(id: number): ScheduledTask | null {
    const task = this.db.getScheduledTaskById(id);
    if (task) {
      return this.ttTaskToScheduledTask(task);
    }

    // Check if it's a session ID
    const session = this.db.getSessionById(id);
    if (session && (session.state === 'paused' || session.state === 'working')) {
      return this.sessionToScheduledTask(session);
    }

    return null;
  }

  completeTask(completion: CompletionData): void {
    // Try to delete from scheduled_tasks first
    const task = this.db.getScheduledTaskById(completion.taskId);
    if (task) {
      this.db.deleteScheduledTask(completion.taskId);
      return;
    }

    // If it's a session, mark it as completed
    const session = this.db.getSessionById(completion.taskId);
    if (session) {
      this.db.updateSession(completion.taskId, {
        state: 'completed',
        endTime: completion.completedAt,
      });
    }
  }

  addTask(task: Omit<ScheduledTask, 'id'>): ScheduledTask {
    const id = this.db.insertScheduledTask({
      description: task.title,
      project: task.project,
      estimateMinutes: task.estimateMinutes,
      priority: task.priority ?? 5,
      scheduledDateTime: task.scheduledDateTime ?? task.deadline,
    });

    if (task.tags.length > 0) {
      this.db.insertScheduledTaskTags(id, task.tags);
    }

    return {
      ...task,
      id,
    };
  }

  removeTask(id: number): void {
    // Try scheduled task first
    const task = this.db.getScheduledTaskById(id);
    if (task) {
      this.db.deleteScheduledTask(id);
      return;
    }

    // Try session
    const session = this.db.getSessionById(id);
    if (session) {
      this.db.deleteSession(id);
    }
  }

  isAvailable(): boolean {
    return true;
  }

  // ============ Conversion Helpers ============

  private ttTaskToScheduledTask(task: TTScheduledTaskWithTags): ScheduledTask {
    return {
      id: task.id!,
      title: task.description,
      project: task.project,
      tags: task.tags,
      estimateMinutes: task.estimateMinutes,
      priority: task.priority,
      scheduledDateTime: task.scheduledDateTime,
      deadline: task.scheduledDateTime,
    };
  }

  private sessionToScheduledTask(
    session: SessionWithTags & { totalMinutes?: number; chainSessionCount?: number }
  ): ScheduledTask {
    return {
      id: session.id!,
      title: session.description,
      project: session.project,
      tags: session.tags,
      estimateMinutes: session.estimateMinutes,
      priority: 1, // Incomplete sessions get highest priority
    };
  }
}
