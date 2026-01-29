import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  Session,
  SessionWithTags,
  SessionState,
  TTScheduledTask,
  TTScheduledTaskWithTags,
  DatabaseError,
} from './types';

/**
 * Database wrapper for TT time tracker core
 */
export class TTDatabase {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    try {
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('foreign_keys = ON');
      this.initialize();
    } catch (error) {
      throw new DatabaseError(`Failed to open database: ${error}`);
    }
  }

  private initialize(): void {
    try {
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);
    } catch (error) {
      throw new DatabaseError(`Failed to initialize schema: ${error}`);
    }
  }

  // ============ Session Methods ============

  insertSession(session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO sessions (
          start_time, end_time, description, project,
          estimate_minutes, explicit_duration_minutes,
          remark, state, parent_session_id, continues_session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        session.startTime.toISOString(),
        session.endTime?.toISOString() || null,
        session.description,
        session.project || null,
        session.estimateMinutes || null,
        session.explicitDurationMinutes || null,
        session.remark || null,
        session.state,
        session.parentSessionId || null,
        session.continuesSessionId || null
      );

      return result.lastInsertRowid as number;
    } catch (error) {
      throw new DatabaseError(`Failed to insert session: ${error}`);
    }
  }

  insertSessionTags(sessionId: number, tags: string[]): void {
    if (tags.length === 0) return;

    const uniqueTags = [...new Set(tags)];

    try {
      const stmt = this.db.prepare(`
        INSERT INTO session_tags (session_id, tag)
        VALUES (?, ?)
      `);

      const insertMany = this.db.transaction((sessionId: number, tags: string[]) => {
        for (const tag of tags) {
          stmt.run(sessionId, tag);
        }
      });

      insertMany(sessionId, uniqueTags);
    } catch (error) {
      throw new DatabaseError(`Failed to insert tags: ${error}`);
    }
  }

  updateSession(id: number, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.startTime !== undefined) {
      fields.push('start_time = ?');
      values.push(updates.startTime.toISOString());
    }
    if (updates.endTime !== undefined) {
      fields.push('end_time = ?');
      values.push(updates.endTime?.toISOString() || null);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.project !== undefined) {
      fields.push('project = ?');
      values.push(updates.project || null);
    }
    if (updates.estimateMinutes !== undefined) {
      fields.push('estimate_minutes = ?');
      values.push(updates.estimateMinutes || null);
    }
    if (updates.explicitDurationMinutes !== undefined) {
      fields.push('explicit_duration_minutes = ?');
      values.push(updates.explicitDurationMinutes || null);
    }
    if (updates.remark !== undefined) {
      fields.push('remark = ?');
      values.push(updates.remark || null);
    }
    if (updates.state !== undefined) {
      fields.push('state = ?');
      values.push(updates.state);
    }
    if (updates.parentSessionId !== undefined) {
      fields.push('parent_session_id = ?');
      values.push(updates.parentSessionId || null);
    }
    if (updates.continuesSessionId !== undefined) {
      fields.push('continues_session_id = ?');
      values.push(updates.continuesSessionId || null);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = CURRENT_TIMESTAMP');

    try {
      const stmt = this.db.prepare(`
        UPDATE sessions
        SET ${fields.join(', ')}
        WHERE id = ?
      `);

      stmt.run(...values, id);
    } catch (error) {
      throw new DatabaseError(`Failed to update session: ${error}`);
    }
  }

  updateSessionTags(sessionId: number, tags: string[]): void {
    try {
      const updateTags = this.db.transaction((sessionId: number, tags: string[]) => {
        const deleteStmt = this.db.prepare('DELETE FROM session_tags WHERE session_id = ?');
        deleteStmt.run(sessionId);

        if (tags.length > 0) {
          const insertStmt = this.db.prepare(`
            INSERT INTO session_tags (session_id, tag)
            VALUES (?, ?)
          `);

          for (const tag of tags) {
            insertStmt.run(sessionId, tag);
          }
        }
      });

      updateTags(sessionId, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to update tags: ${error}`);
    }
  }

  getSessionById(id: number): SessionWithTags | null {
    try {
      const stmt = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`);
      const row = stmt.get(id) as Record<string, unknown> | undefined;
      if (!row) return null;

      const tags = this.getSessionTags(id);
      return this.rowToSession(row, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to get session: ${error}`);
    }
  }

  getSessionTags(sessionId: number): string[] {
    try {
      const stmt = this.db.prepare(`SELECT tag FROM session_tags WHERE session_id = ?`);
      const rows = stmt.all(sessionId) as { tag: string }[];
      return rows.map((row) => row.tag);
    } catch (error) {
      throw new DatabaseError(`Failed to get session tags: ${error}`);
    }
  }

  getActiveSession(): SessionWithTags | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions
        WHERE state = 'working' AND end_time IS NULL
        ORDER BY start_time DESC
        LIMIT 1
      `);

      const row = stmt.get() as Record<string, unknown> | undefined;
      if (!row) return null;

      const tags = this.getSessionTags(row.id as number);
      return this.rowToSession(row, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to get active session: ${error}`);
    }
  }

  getAllActiveSessions(): SessionWithTags[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions
        WHERE end_time IS NULL
        ORDER BY start_time ASC
      `);

      const rows = stmt.all() as Record<string, unknown>[];
      return rows.map((row) => {
        const tags = this.getSessionTags(row.id as number);
        return this.rowToSession(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get all active sessions: ${error}`);
    }
  }

  getSessionsByTimeRange(
    startDate: Date,
    endDate: Date,
    options?: {
      project?: string;
      tags?: string[];
      state?: SessionState;
    }
  ): SessionWithTags[] {
    try {
      let query = `SELECT DISTINCT s.* FROM sessions s`;

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (options?.tags && options.tags.length > 0) {
        query += ` INNER JOIN session_tags st ON s.id = st.session_id`;
        conditions.push(`st.tag IN (${options.tags.map(() => '?').join(', ')})`);
        params.push(...options.tags);
      }

      conditions.push('s.start_time >= ?');
      conditions.push('s.start_time < ?');
      params.push(startDate.toISOString(), endDate.toISOString());

      if (options?.project) {
        conditions.push('s.project = ?');
        params.push(options.project);
      }

      if (options?.state) {
        conditions.push('s.state = ?');
        params.push(options.state);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += ' ORDER BY s.start_time ASC';

      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as Record<string, unknown>[];

      return rows.map((row) => {
        const tags = this.getSessionTags(row.id as number);
        return this.rowToSession(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get sessions by time range: ${error}`);
    }
  }

  findPausedSessionToResume(
    description?: string,
    project?: string,
    primaryTag?: string
  ): SessionWithTags | null {
    try {
      let query = `SELECT s.* FROM sessions s WHERE s.state = 'paused'`;
      const params: unknown[] = [];

      if (description) {
        query += ` AND s.description = ?`;
        params.push(description);
      }
      if (project) {
        query += ` AND s.project = ?`;
        params.push(project);
      }

      query += ` ORDER BY s.start_time DESC LIMIT 1`;

      const row = this.db.prepare(query).get(...params) as Record<string, unknown> | undefined;
      if (!row) return null;

      const tags = this.getSessionTags(row.id as number);

      if (primaryTag && tags[0] !== primaryTag) {
        return null;
      }

      return this.rowToSession(row, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to find paused session: ${error}`);
    }
  }

  getContinuationChain(sessionId: number): SessionWithTags[] {
    try {
      const root = this.getChainRoot(sessionId);
      if (!root || !root.id) return [];

      const stmt = this.db.prepare(`
        SELECT * FROM sessions
        WHERE id = ? OR continues_session_id = ?
        ORDER BY start_time ASC
      `);
      const rows = stmt.all(root.id, root.id) as Record<string, unknown>[];

      return rows.map((row) => {
        const tags = this.getSessionTags(row.id as number);
        return this.rowToSession(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get continuation chain: ${error}`);
    }
  }

  getChainRoot(sessionId: number): SessionWithTags | null {
    try {
      const session = this.getSessionById(sessionId);
      if (!session) return null;

      if (!session.continuesSessionId) return session;

      return this.getSessionById(session.continuesSessionId);
    } catch (error) {
      throw new DatabaseError(`Failed to get chain root: ${error}`);
    }
  }

  getIncompleteChains(): SessionWithTags[] {
    try {
      const stmt = this.db.prepare(`
        SELECT DISTINCT s1.*
        FROM sessions s1
        WHERE s1.continues_session_id IS NULL
          AND (
            s1.state IN ('paused', 'working')
            OR EXISTS (
              SELECT 1 FROM sessions s2
              WHERE s2.continues_session_id = s1.id
                AND s2.state IN ('paused', 'working')
            )
          )
        ORDER BY s1.start_time DESC
      `);
      const rows = stmt.all() as Record<string, unknown>[];

      return rows.map((row) => {
        const tags = this.getSessionTags(row.id as number);
        return this.rowToSession(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get incomplete chains: ${error}`);
    }
  }

  deleteSession(id: number): void {
    try {
      const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
      stmt.run(id);
    } catch (error) {
      throw new DatabaseError(`Failed to delete session: ${error}`);
    }
  }

  // ============ Scheduled Task Methods ============

  insertScheduledTask(task: Omit<TTScheduledTask, 'id' | 'createdAt'>): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO scheduled_tasks (
          description, project, estimate_minutes, priority, scheduled_date_time
        ) VALUES (?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        task.description,
        task.project || null,
        task.estimateMinutes || null,
        task.priority,
        task.scheduledDateTime?.toISOString() || null
      );

      return result.lastInsertRowid as number;
    } catch (error) {
      throw new DatabaseError(`Failed to insert scheduled task: ${error}`);
    }
  }

  insertScheduledTaskTags(taskId: number, tags: string[]): void {
    if (tags.length === 0) return;

    const uniqueTags = [...new Set(tags)];

    try {
      const stmt = this.db.prepare(`
        INSERT INTO scheduled_task_tags (scheduled_task_id, tag)
        VALUES (?, ?)
      `);

      const insertMany = this.db.transaction((taskId: number, tags: string[]) => {
        for (const tag of tags) {
          stmt.run(taskId, tag);
        }
      });

      insertMany(taskId, uniqueTags);
    } catch (error) {
      throw new DatabaseError(`Failed to insert scheduled task tags: ${error}`);
    }
  }

  getAllScheduledTasks(): TTScheduledTaskWithTags[] {
    try {
      const stmt = this.db.prepare(`SELECT * FROM scheduled_tasks ORDER BY created_at ASC`);
      const rows = stmt.all() as Record<string, unknown>[];

      return rows.map((row) => {
        const tags = this.getScheduledTaskTags(row.id as number);
        return this.rowToScheduledTask(row, tags);
      });
    } catch (error) {
      throw new DatabaseError(`Failed to get scheduled tasks: ${error}`);
    }
  }

  getScheduledTaskById(id: number): TTScheduledTaskWithTags | null {
    try {
      const stmt = this.db.prepare(`SELECT * FROM scheduled_tasks WHERE id = ?`);
      const row = stmt.get(id) as Record<string, unknown> | undefined;
      if (!row) return null;

      const tags = this.getScheduledTaskTags(id);
      return this.rowToScheduledTask(row, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to get scheduled task: ${error}`);
    }
  }

  getScheduledTaskTags(taskId: number): string[] {
    try {
      const stmt = this.db.prepare(`SELECT tag FROM scheduled_task_tags WHERE scheduled_task_id = ?`);
      const rows = stmt.all(taskId) as { tag: string }[];
      return rows.map((row) => row.tag);
    } catch (error) {
      throw new DatabaseError(`Failed to get scheduled task tags: ${error}`);
    }
  }

  updateScheduledTask(id: number, updates: Partial<Omit<TTScheduledTask, 'id' | 'createdAt'>>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if ('description' in updates) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if ('project' in updates) {
      fields.push('project = ?');
      values.push(updates.project || null);
    }
    if ('estimateMinutes' in updates) {
      fields.push('estimate_minutes = ?');
      values.push(updates.estimateMinutes || null);
    }
    if ('priority' in updates) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }
    if ('scheduledDateTime' in updates) {
      fields.push('scheduled_date_time = ?');
      values.push(updates.scheduledDateTime?.toISOString() || null);
    }

    if (fields.length === 0) return;

    try {
      const stmt = this.db.prepare(`
        UPDATE scheduled_tasks
        SET ${fields.join(', ')}
        WHERE id = ?
      `);

      stmt.run(...values, id);
    } catch (error) {
      throw new DatabaseError(`Failed to update scheduled task: ${error}`);
    }
  }

  updateScheduledTaskTags(taskId: number, tags: string[]): void {
    try {
      const updateTags = this.db.transaction((taskId: number, tags: string[]) => {
        const deleteStmt = this.db.prepare('DELETE FROM scheduled_task_tags WHERE scheduled_task_id = ?');
        deleteStmt.run(taskId);

        if (tags.length > 0) {
          const insertStmt = this.db.prepare(`
            INSERT INTO scheduled_task_tags (scheduled_task_id, tag)
            VALUES (?, ?)
          `);

          for (const tag of tags) {
            insertStmt.run(taskId, tag);
          }
        }
      });

      updateTags(taskId, tags);
    } catch (error) {
      throw new DatabaseError(`Failed to update scheduled task tags: ${error}`);
    }
  }

  deleteScheduledTask(id: number): void {
    try {
      const stmt = this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?');
      stmt.run(id);
    } catch (error) {
      throw new DatabaseError(`Failed to delete scheduled task: ${error}`);
    }
  }

  /**
   * Get scheduled tasks organized by category for selection
   */
  getScheduledTasksForSelection(): {
    oldest: TTScheduledTaskWithTags[];
    important: TTScheduledTaskWithTags[];
    urgent: TTScheduledTaskWithTags[];
    incomplete: (SessionWithTags & { totalMinutes?: number; chainSessionCount?: number })[];
  } {
    try {
      // Oldest: All tasks by creation date ascending (limit 10)
      const oldestStmt = this.db.prepare(`
        SELECT * FROM scheduled_tasks ORDER BY created_at ASC LIMIT 10
      `);
      const oldestRows = oldestStmt.all() as Record<string, unknown>[];
      const oldest = oldestRows.map((row) => {
        const tags = this.getScheduledTaskTags(row.id as number);
        return this.rowToScheduledTask(row, tags);
      });

      // Important: Tasks with priority set (not 5), ordered by priority asc
      const importantStmt = this.db.prepare(`
        SELECT * FROM scheduled_tasks
        WHERE priority != 5
        ORDER BY priority ASC, created_at ASC
        LIMIT 10
      `);
      const importantRows = importantStmt.all() as Record<string, unknown>[];
      const important = importantRows.map((row) => {
        const tags = this.getScheduledTaskTags(row.id as number);
        return this.rowToScheduledTask(row, tags);
      });

      // Urgent: Tasks with scheduled date today or overdue
      const now = new Date();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const urgentStmt = this.db.prepare(`
        SELECT * FROM scheduled_tasks
        WHERE scheduled_date_time IS NOT NULL
          AND datetime(scheduled_date_time) <= datetime(?)
        ORDER BY scheduled_date_time ASC
        LIMIT 10
      `);
      const urgentRows = urgentStmt.all(endOfToday.toISOString()) as Record<string, unknown>[];
      const urgent = urgentRows.map((row) => {
        const tags = this.getScheduledTaskTags(row.id as number);
        return this.rowToScheduledTask(row, tags);
      });

      // Incomplete: Paused continuation chains
      const incomplete = this.getIncompleteChainsForSelection();

      return { oldest, important, urgent, incomplete };
    } catch (error) {
      throw new DatabaseError(`Failed to get scheduled tasks for selection: ${error}`);
    }
  }

  private getIncompleteChainsForSelection(): (SessionWithTags & {
    totalMinutes?: number;
    chainSessionCount?: number;
  })[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions
        WHERE state = 'paused' AND parent_session_id IS NULL
        ORDER BY start_time DESC
      `);
      const rows = stmt.all() as Record<string, unknown>[];

      const chainMap = new Map<number, SessionWithTags[]>();

      for (const row of rows) {
        const session = this.rowToSession(row, []);
        const tags = this.getSessionTags(row.id as number);
        const sessionWithTags = { ...session, tags };

        if (!session.id) continue;

        const chainRootId = session.continuesSessionId || session.id;

        if (!chainMap.has(chainRootId)) {
          chainMap.set(chainRootId, []);
        }
        chainMap.get(chainRootId)!.push(sessionWithTags);
      }

      const incompleteTasks: (SessionWithTags & {
        totalMinutes?: number;
        chainSessionCount?: number;
      })[] = [];

      for (const [chainRootId] of chainMap.entries()) {
        const fullChain = this.getContinuationChain(chainRootId);
        if (fullChain.length === 0) continue;

        const mostRecent = fullChain[fullChain.length - 1];

        if (mostRecent.state === 'paused') {
          let totalMinutes = 0;
          for (const session of fullChain) {
            if (session.endTime) {
              const duration = (session.endTime.getTime() - session.startTime.getTime()) / 60000;
              totalMinutes += duration;
            }
          }

          incompleteTasks.push({
            ...mostRecent,
            totalMinutes,
            chainSessionCount: fullChain.length,
          });
        }
      }

      incompleteTasks.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
      return incompleteTasks.slice(0, 10);
    } catch (error) {
      throw new DatabaseError(`Failed to get incomplete chains for selection: ${error}`);
    }
  }

  // ============ Utility Methods ============

  private rowToSession(row: Record<string, unknown>, tags: string[]): SessionWithTags {
    return {
      id: row.id as number,
      startTime: new Date(row.start_time as string),
      endTime: row.end_time ? new Date(row.end_time as string) : undefined,
      description: row.description as string,
      project: (row.project as string) || undefined,
      estimateMinutes: (row.estimate_minutes as number) || undefined,
      explicitDurationMinutes: (row.explicit_duration_minutes as number) || undefined,
      remark: (row.remark as string) || undefined,
      state: row.state as SessionState,
      parentSessionId: (row.parent_session_id as number) || undefined,
      continuesSessionId: (row.continues_session_id as number) || undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      tags,
    };
  }

  private rowToScheduledTask(row: Record<string, unknown>, tags: string[]): TTScheduledTaskWithTags {
    return {
      id: row.id as number,
      description: row.description as string,
      project: (row.project as string) || undefined,
      estimateMinutes: (row.estimate_minutes as number) || undefined,
      priority: row.priority as number,
      scheduledDateTime: row.scheduled_date_time
        ? new Date(row.scheduled_date_time as string)
        : undefined,
      createdAt: new Date(row.created_at as string),
      tags,
    };
  }

  close(): void {
    try {
      this.db.pragma('wal_checkpoint(RESTART)');
    } catch {
      // Ignore checkpoint errors (e.g., :memory: database)
    }
    this.db.close();
  }
}
