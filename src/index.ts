// Database
export { TTDatabase } from './database';

// Scheduler (implements TaskScheduler from task-parser)
export { TTScheduler } from './scheduler';

// Time tracking service
export {
  TimeTrackingService,
  StartSessionOptions,
  StopSessionOptions,
  StartSessionResult,
} from './time-tracking';

// Types
export {
  Session,
  SessionWithTags,
  SessionState,
  SessionTag,
  TTScheduledTask,
  TTScheduledTaskWithTags,
  TTError,
  DatabaseError,
  ValidationError,
} from './types';

// Re-export TaskScheduler interface from task-parser for convenience
export {
  TaskScheduler,
  ScheduledTask,
  DailyPlan,
  CompletionData,
} from '@kevjava/task-parser';
