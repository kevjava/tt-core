import { TTDatabase } from './database';
import { SessionWithTags, ValidationError } from './types';

/**
 * Options for starting a new session
 */
export interface StartSessionOptions {
  description: string;
  project?: string;
  tags?: string[];
  estimateMinutes?: number;
  startTime?: Date;
  /** If true, pause the current active session instead of failing */
  pauseActive?: boolean;
  /** ID of session this continues (for resume functionality) */
  continuesSessionId?: number;
  /** ID of parent session (for interruptions) */
  parentSessionId?: number;
}

/**
 * Options for stopping a session
 */
export interface StopSessionOptions {
  endTime?: Date;
  remark?: string;
  /** If provided, override the calculated duration */
  explicitDurationMinutes?: number;
}

/**
 * Result of starting a session
 */
export interface StartSessionResult {
  session: SessionWithTags;
  pausedSession?: SessionWithTags;
}

/**
 * TimeTrackingService manages session lifecycle: start, stop, pause, resume.
 */
export class TimeTrackingService {
  constructor(private db: TTDatabase) {}

  /**
   * Start a new working session
   */
  startSession(options: StartSessionOptions): StartSessionResult {
    const startTime = options.startTime ?? new Date();
    let pausedSession: SessionWithTags | undefined;

    // Check for active session
    const activeSession = this.db.getActiveSession();
    if (activeSession) {
      if (options.pauseActive) {
        // Pause the active session
        this.db.updateSession(activeSession.id!, {
          state: 'paused',
          endTime: startTime,
        });
        pausedSession = this.db.getSessionById(activeSession.id!)!;
      } else {
        throw new ValidationError(
          `Cannot start session: already tracking "${activeSession.description}". ` +
            `Use pauseActive option to pause it first.`
        );
      }
    }

    // Create the new session
    const sessionId = this.db.insertSession({
      startTime,
      description: options.description,
      project: options.project,
      estimateMinutes: options.estimateMinutes,
      state: 'working',
      continuesSessionId: options.continuesSessionId,
      parentSessionId: options.parentSessionId,
    });

    // Add tags
    if (options.tags && options.tags.length > 0) {
      this.db.insertSessionTags(sessionId, options.tags);
    }

    const session = this.db.getSessionById(sessionId)!;

    return { session, pausedSession };
  }

  /**
   * Stop the current active session
   */
  stopSession(options?: StopSessionOptions): SessionWithTags {
    const activeSession = this.db.getActiveSession();
    if (!activeSession) {
      throw new ValidationError('No active session to stop');
    }

    const endTime = options?.endTime ?? new Date();

    this.db.updateSession(activeSession.id!, {
      state: 'completed',
      endTime,
      remark: options?.remark,
      explicitDurationMinutes: options?.explicitDurationMinutes,
    });

    return this.db.getSessionById(activeSession.id!)!;
  }

  /**
   * Pause the current active session
   */
  pauseSession(endTime?: Date): SessionWithTags {
    const activeSession = this.db.getActiveSession();
    if (!activeSession) {
      throw new ValidationError('No active session to pause');
    }

    this.db.updateSession(activeSession.id!, {
      state: 'paused',
      endTime: endTime ?? new Date(),
    });

    return this.db.getSessionById(activeSession.id!)!;
  }

  /**
   * Resume a paused session (creates a new session that continues the chain)
   */
  resumeSession(sessionId: number, startTime?: Date): StartSessionResult {
    const session = this.db.getSessionById(sessionId);
    if (!session) {
      throw new ValidationError(`Session ${sessionId} not found`);
    }

    if (session.state !== 'paused') {
      throw new ValidationError(
        `Cannot resume session in state "${session.state}". Only paused sessions can be resumed.`
      );
    }

    // Find the chain root - the original session this chain started from
    const chainRoot = this.db.getChainRoot(sessionId);
    const continuesId = chainRoot?.id ?? sessionId;

    // Start a new session that continues the chain
    return this.startSession({
      description: session.description,
      project: session.project,
      tags: session.tags,
      estimateMinutes: session.estimateMinutes,
      startTime: startTime ?? new Date(),
      pauseActive: true, // Auto-pause any active session
      continuesSessionId: continuesId,
    });
  }

  /**
   * Abandon a session (mark as abandoned without completing)
   */
  abandonSession(sessionId: number): SessionWithTags {
    const session = this.db.getSessionById(sessionId);
    if (!session) {
      throw new ValidationError(`Session ${sessionId} not found`);
    }

    if (session.state === 'completed' || session.state === 'abandoned') {
      throw new ValidationError(`Cannot abandon session that is already ${session.state}`);
    }

    this.db.updateSession(sessionId, {
      state: 'abandoned',
      endTime: session.endTime ?? new Date(),
    });

    return this.db.getSessionById(sessionId)!;
  }

  /**
   * Get the currently active session
   */
  getActiveSession(): SessionWithTags | null {
    return this.db.getActiveSession();
  }

  /**
   * Get all incomplete continuation chains
   */
  getIncompleteChains(): SessionWithTags[] {
    return this.db.getIncompleteChains();
  }

  /**
   * Get the full continuation chain for a session
   */
  getContinuationChain(sessionId: number): SessionWithTags[] {
    return this.db.getContinuationChain(sessionId);
  }

  /**
   * Find a paused session to resume based on criteria
   */
  findPausedSession(
    description?: string,
    project?: string,
    primaryTag?: string
  ): SessionWithTags | null {
    return this.db.findPausedSessionToResume(description, project, primaryTag);
  }

  /**
   * Calculate total time spent on a session chain
   */
  getChainTotalMinutes(sessionId: number): number {
    const chain = this.db.getContinuationChain(sessionId);
    let totalMinutes = 0;

    for (const session of chain) {
      if (session.endTime) {
        totalMinutes += (session.endTime.getTime() - session.startTime.getTime()) / 60000;
      } else if (session.state === 'working') {
        // Active session - count time so far
        totalMinutes += (new Date().getTime() - session.startTime.getTime()) / 60000;
      }
    }

    return Math.round(totalMinutes);
  }
}
