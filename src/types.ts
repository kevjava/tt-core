/**
 * Session state values
 */
export type SessionState = 'working' | 'paused' | 'completed' | 'abandoned';

/**
 * Represents a time tracking session
 */
export interface Session {
  id?: number;
  startTime: Date;
  endTime?: Date;
  description: string;
  project?: string;
  tags?: string[];
  estimateMinutes?: number;
  explicitDurationMinutes?: number;
  remark?: string;
  state: SessionState;
  parentSessionId?: number;
  continuesSessionId?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Session with tags always present (returned from database queries)
 */
export interface SessionWithTags extends Session {
  tags: string[];
}

/**
 * Represents a tag associated with a session
 */
export interface SessionTag {
  sessionId: number;
  tag: string;
}

/**
 * Represents a scheduled task in tt-time-tracker
 */
export interface TTScheduledTask {
  id?: number;
  description: string;
  project?: string;
  tags?: string[];
  estimateMinutes?: number;
  priority: number; // 1-9, default 5
  scheduledDateTime?: Date;
  createdAt?: Date;
}

/**
 * Scheduled task with tags always present
 */
export interface TTScheduledTaskWithTags extends TTScheduledTask {
  tags: string[];
}

/**
 * Base error class for TT
 */
export class TTError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when database operations fail
 */
export class DatabaseError extends TTError {}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends TTError {}
