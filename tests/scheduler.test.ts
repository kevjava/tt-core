import { TTDatabase, TTScheduler, TimeTrackingService } from '../src';

describe('TTScheduler', () => {
  let db: TTDatabase;
  let scheduler: TTScheduler;

  beforeEach(() => {
    db = new TTDatabase(':memory:');
    scheduler = new TTScheduler(db);
  });

  afterEach(() => {
    db.close();
  });

  test('isAvailable returns true', () => {
    expect(scheduler.isAvailable()).toBe(true);
  });

  test('getDailyPlan returns empty plan when no tasks', () => {
    const plan = scheduler.getDailyPlan(new Date());
    expect(plan.tasks).toHaveLength(0);
    expect(plan.totalMinutes).toBe(0);
    expect(plan.remainingMinutes).toBe(480); // 8 hours
  });

  test('addTask creates a scheduled task', () => {
    const task = scheduler.addTask({
      title: 'Test task',
      tags: ['test'],
      estimateMinutes: 30,
    });

    expect(task.id).toBeDefined();
    expect(task.title).toBe('Test task');
    expect(task.tags).toEqual(['test']);
    expect(task.estimateMinutes).toBe(30);
  });

  test('getTask retrieves a task by ID', () => {
    const created = scheduler.addTask({
      title: 'Test task',
      tags: [],
    });

    const retrieved = scheduler.getTask(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe('Test task');
  });

  test('getDailyPlan includes added tasks', () => {
    scheduler.addTask({
      title: 'Task 1',
      tags: [],
      estimateMinutes: 60,
    });
    scheduler.addTask({
      title: 'Task 2',
      tags: [],
      estimateMinutes: 30,
    });

    const plan = scheduler.getDailyPlan(new Date());
    expect(plan.tasks).toHaveLength(2);
    expect(plan.totalMinutes).toBe(90);
    expect(plan.remainingMinutes).toBe(390); // 480 - 90
  });

  test('removeTask deletes a task', () => {
    const task = scheduler.addTask({
      title: 'To be deleted',
      tags: [],
    });

    scheduler.removeTask(task.id);

    const retrieved = scheduler.getTask(task.id);
    expect(retrieved).toBeNull();
  });

  test('completeTask removes scheduled task', () => {
    const task = scheduler.addTask({
      title: 'To be completed',
      tags: [],
    });

    scheduler.completeTask({
      taskId: task.id,
      completedAt: new Date(),
      actualMinutes: 45,
    });

    const retrieved = scheduler.getTask(task.id);
    expect(retrieved).toBeNull();
  });
});

describe('TimeTrackingService', () => {
  let db: TTDatabase;
  let service: TimeTrackingService;

  beforeEach(() => {
    db = new TTDatabase(':memory:');
    service = new TimeTrackingService(db);
  });

  afterEach(() => {
    db.close();
  });

  test('startSession creates a working session', () => {
    const result = service.startSession({
      description: 'Working on feature',
      project: 'myproject',
      tags: ['coding'],
    });

    expect(result.session.id).toBeDefined();
    expect(result.session.description).toBe('Working on feature');
    expect(result.session.project).toBe('myproject');
    expect(result.session.tags).toEqual(['coding']);
    expect(result.session.state).toBe('working');
  });

  test('getActiveSession returns current session', () => {
    service.startSession({ description: 'Active work' });

    const active = service.getActiveSession();
    expect(active).not.toBeNull();
    expect(active!.description).toBe('Active work');
  });

  test('stopSession completes the active session', () => {
    const startTime = new Date(Date.now() - 60000); // 1 minute ago
    service.startSession({ description: 'Work to stop', startTime });

    const stopped = service.stopSession();
    expect(stopped.state).toBe('completed');
    expect(stopped.endTime).toBeDefined();
  });

  test('pauseSession pauses the active session', () => {
    const startTime = new Date(Date.now() - 60000); // 1 minute ago
    service.startSession({ description: 'Work to pause', startTime });

    const paused = service.pauseSession();
    expect(paused.state).toBe('paused');
    expect(paused.endTime).toBeDefined();
  });

  test('resumeSession creates continuation', () => {
    const startTime = new Date(Date.now() - 60000); // 1 minute ago
    const { session } = service.startSession({ description: 'Original work', startTime });
    service.pauseSession();

    const result = service.resumeSession(session.id!);
    expect(result.session.description).toBe('Original work');
    expect(result.session.continuesSessionId).toBe(session.id);
    expect(result.session.state).toBe('working');
  });

  test('abandonSession marks session as abandoned', () => {
    const startTime = new Date(Date.now() - 60000); // 1 minute ago
    const { session } = service.startSession({ description: 'Work to abandon', startTime });

    const abandoned = service.abandonSession(session.id!);
    expect(abandoned.state).toBe('abandoned');
  });

  test('getChainTotalMinutes calculates correctly', () => {
    const start1 = new Date('2024-01-01T10:00:00');
    const end1 = new Date('2024-01-01T10:30:00'); // 30 minutes

    const { session } = service.startSession({
      description: 'Chain work',
      startTime: start1,
    });
    service.pauseSession(end1);

    const totalMinutes = service.getChainTotalMinutes(session.id!);
    expect(totalMinutes).toBe(30);
  });
});
