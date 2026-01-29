import { TTDatabase } from '../src/database';
import { SessionState } from '../src/types';

describe('TTDatabase', () => {
  let db: TTDatabase;

  beforeEach(() => {
    db = new TTDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('Session Operations', () => {
    test('insertSession and getSessionById', () => {
      const id = db.insertSession({
        startTime: new Date('2024-01-01T10:00:00'),
        description: 'Test session',
        project: 'test-project',
        estimateMinutes: 30,
        state: 'working' as SessionState,
      });

      const session = db.getSessionById(id);
      expect(session).not.toBeNull();
      expect(session!.description).toBe('Test session');
      expect(session!.project).toBe('test-project');
      expect(session!.estimateMinutes).toBe(30);
      expect(session!.state).toBe('working');
    });

    test('insertSessionTags and getSessionTags', () => {
      const id = db.insertSession({
        startTime: new Date(),
        description: 'Tagged session',
        state: 'working' as SessionState,
      });

      db.insertSessionTags(id, ['tag1', 'tag2', 'tag1']); // duplicate should be deduped

      const tags = db.getSessionTags(id);
      expect(tags).toHaveLength(2);
      expect(tags).toContain('tag1');
      expect(tags).toContain('tag2');
    });

    test('updateSession updates fields', () => {
      const startTime = new Date('2024-01-01T10:00:00');
      const id = db.insertSession({
        startTime,
        description: 'Original',
        state: 'working' as SessionState,
      });

      const endTime = new Date('2024-01-01T11:00:00');
      db.updateSession(id, {
        description: 'Updated',
        endTime,
        state: 'completed' as SessionState,
        remark: 'Done!',
      });

      const session = db.getSessionById(id);
      expect(session!.description).toBe('Updated');
      expect(session!.endTime?.toISOString()).toBe(endTime.toISOString());
      expect(session!.state).toBe('completed');
      expect(session!.remark).toBe('Done!');
    });

    test('updateSession with no fields does nothing', () => {
      const id = db.insertSession({
        startTime: new Date(),
        description: 'Test',
        state: 'working' as SessionState,
      });

      db.updateSession(id, {});

      const session = db.getSessionById(id);
      expect(session!.description).toBe('Test');
    });

    test('updateSessionTags replaces all tags', () => {
      const id = db.insertSession({
        startTime: new Date(),
        description: 'Test',
        state: 'working' as SessionState,
      });

      db.insertSessionTags(id, ['old1', 'old2']);
      db.updateSessionTags(id, ['new1', 'new2', 'new3']);

      const tags = db.getSessionTags(id);
      expect(tags).toHaveLength(3);
      expect(tags).not.toContain('old1');
      expect(tags).toContain('new1');
    });

    test('getActiveSession returns working session', () => {
      const pastStart = new Date(Date.now() - 60000); // 1 minute ago
      db.insertSession({
        startTime: pastStart,
        description: 'Completed',
        endTime: new Date(),
        state: 'completed' as SessionState,
      });

      const activeId = db.insertSession({
        startTime: new Date(),
        description: 'Active',
        state: 'working' as SessionState,
      });

      const active = db.getActiveSession();
      expect(active).not.toBeNull();
      expect(active!.id).toBe(activeId);
      expect(active!.description).toBe('Active');
    });

    test('getActiveSession returns null when no active session', () => {
      db.insertSession({
        startTime: new Date('2024-01-01T10:00:00'),
        endTime: new Date('2024-01-01T11:00:00'),
        description: 'Completed',
        state: 'completed' as SessionState,
      });

      const active = db.getActiveSession();
      expect(active).toBeNull();
    });

    test('getAllActiveSessions returns sessions without end time', () => {
      db.insertSession({
        startTime: new Date(),
        description: 'Active 1',
        state: 'working' as SessionState,
      });

      db.insertSession({
        startTime: new Date(),
        description: 'Active 2',
        state: 'paused' as SessionState,
      });

      db.insertSession({
        startTime: new Date('2024-01-01T10:00:00'),
        endTime: new Date('2024-01-01T11:00:00'),
        description: 'Completed',
        state: 'completed' as SessionState,
      });

      const active = db.getAllActiveSessions();
      expect(active).toHaveLength(2);
    });

    test('getSessionsByTimeRange filters by date', () => {
      const day1 = new Date('2024-01-01T10:00:00');
      const day2 = new Date('2024-01-02T10:00:00');
      const day3 = new Date('2024-01-03T10:00:00');

      db.insertSession({
        startTime: day1,
        description: 'Day 1',
        state: 'completed' as SessionState,
      });

      db.insertSession({
        startTime: day2,
        description: 'Day 2',
        state: 'completed' as SessionState,
      });

      db.insertSession({
        startTime: day3,
        description: 'Day 3',
        state: 'completed' as SessionState,
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2024-01-01T00:00:00'),
        new Date('2024-01-02T23:59:59')
      );

      expect(sessions).toHaveLength(2);
    });

    test('getSessionsByTimeRange filters by project', () => {
      db.insertSession({
        startTime: new Date('2024-01-01T10:00:00'),
        description: 'Project A',
        project: 'project-a',
        state: 'completed' as SessionState,
      });

      db.insertSession({
        startTime: new Date('2024-01-01T11:00:00'),
        description: 'Project B',
        project: 'project-b',
        state: 'completed' as SessionState,
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2024-01-01T00:00:00'),
        new Date('2024-01-01T23:59:59'),
        { project: 'project-a' }
      );

      expect(sessions).toHaveLength(1);
      expect(sessions[0].project).toBe('project-a');
    });

    test('getSessionsByTimeRange filters by tags', () => {
      const id1 = db.insertSession({
        startTime: new Date('2024-01-01T10:00:00'),
        description: 'With tag',
        state: 'completed' as SessionState,
      });
      db.insertSessionTags(id1, ['important']);

      db.insertSession({
        startTime: new Date('2024-01-01T11:00:00'),
        description: 'Without tag',
        state: 'completed' as SessionState,
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2024-01-01T00:00:00'),
        new Date('2024-01-01T23:59:59'),
        { tags: ['important'] }
      );

      expect(sessions).toHaveLength(1);
      expect(sessions[0].description).toBe('With tag');
    });

    test('getSessionsByTimeRange filters by state', () => {
      db.insertSession({
        startTime: new Date('2024-01-01T10:00:00'),
        description: 'Completed',
        state: 'completed' as SessionState,
      });

      db.insertSession({
        startTime: new Date('2024-01-01T11:00:00'),
        description: 'Abandoned',
        state: 'abandoned' as SessionState,
      });

      const sessions = db.getSessionsByTimeRange(
        new Date('2024-01-01T00:00:00'),
        new Date('2024-01-01T23:59:59'),
        { state: 'completed' as SessionState }
      );

      expect(sessions).toHaveLength(1);
      expect(sessions[0].state).toBe('completed');
    });

    test('deleteSession removes session', () => {
      const id = db.insertSession({
        startTime: new Date(),
        description: 'To delete',
        state: 'working' as SessionState,
      });

      db.deleteSession(id);

      const session = db.getSessionById(id);
      expect(session).toBeNull();
    });

    test('findPausedSessionToResume finds matching session', () => {
      const startTime = new Date(Date.now() - 60000);
      const id = db.insertSession({
        startTime,
        endTime: new Date(),
        description: 'Paused work',
        project: 'my-project',
        state: 'paused' as SessionState,
      });
      db.insertSessionTags(id, ['coding']);

      const found = db.findPausedSessionToResume('Paused work', 'my-project');
      expect(found).not.toBeNull();
      expect(found!.id).toBe(id);
    });

    test('findPausedSessionToResume returns null for wrong primaryTag', () => {
      const startTime = new Date(Date.now() - 60000);
      const id = db.insertSession({
        startTime,
        endTime: new Date(),
        description: 'Paused work',
        state: 'paused' as SessionState,
      });
      db.insertSessionTags(id, ['coding']);

      const found = db.findPausedSessionToResume('Paused work', undefined, 'different-tag');
      expect(found).toBeNull();
    });
  });

  describe('Continuation Chains', () => {
    test('getContinuationChain returns full chain', () => {
      const startTime1 = new Date('2024-01-01T10:00:00');
      const endTime1 = new Date('2024-01-01T10:30:00');
      const startTime2 = new Date('2024-01-01T11:00:00');
      const endTime2 = new Date('2024-01-01T11:30:00');

      const rootId = db.insertSession({
        startTime: startTime1,
        endTime: endTime1,
        description: 'Root session',
        state: 'paused' as SessionState,
      });

      db.insertSession({
        startTime: startTime2,
        endTime: endTime2,
        description: 'Continuation',
        state: 'completed' as SessionState,
        continuesSessionId: rootId,
      });

      const chain = db.getContinuationChain(rootId);
      expect(chain).toHaveLength(2);
      expect(chain[0].description).toBe('Root session');
      expect(chain[1].description).toBe('Continuation');
    });

    test('getChainRoot returns root of chain', () => {
      const startTime1 = new Date('2024-01-01T10:00:00');
      const endTime1 = new Date('2024-01-01T10:30:00');
      const startTime2 = new Date('2024-01-01T11:00:00');

      const rootId = db.insertSession({
        startTime: startTime1,
        endTime: endTime1,
        description: 'Root',
        state: 'paused' as SessionState,
      });

      const childId = db.insertSession({
        startTime: startTime2,
        description: 'Child',
        state: 'working' as SessionState,
        continuesSessionId: rootId,
      });

      const root = db.getChainRoot(childId);
      expect(root).not.toBeNull();
      expect(root!.id).toBe(rootId);
    });

    test('getIncompleteChains returns chains with paused sessions', () => {
      const startTime = new Date(Date.now() - 60000);
      db.insertSession({
        startTime,
        endTime: new Date(),
        description: 'Incomplete',
        state: 'paused' as SessionState,
      });

      db.insertSession({
        startTime: new Date('2024-01-01T10:00:00'),
        endTime: new Date('2024-01-01T11:00:00'),
        description: 'Complete',
        state: 'completed' as SessionState,
      });

      const incomplete = db.getIncompleteChains();
      expect(incomplete).toHaveLength(1);
      expect(incomplete[0].description).toBe('Incomplete');
    });
  });

  describe('Scheduled Task Operations', () => {
    test('insertScheduledTask and getScheduledTaskById', () => {
      const id = db.insertScheduledTask({
        description: 'Scheduled task',
        project: 'project',
        estimateMinutes: 60,
        priority: 2,
        scheduledDateTime: new Date('2024-01-15T09:00:00'),
      });

      const task = db.getScheduledTaskById(id);
      expect(task).not.toBeNull();
      expect(task!.description).toBe('Scheduled task');
      expect(task!.priority).toBe(2);
    });

    test('insertScheduledTaskTags adds tags', () => {
      const id = db.insertScheduledTask({
        description: 'Task',
        priority: 5,
      });

      db.insertScheduledTaskTags(id, ['urgent', 'review']);

      const tags = db.getScheduledTaskTags(id);
      expect(tags).toHaveLength(2);
      expect(tags).toContain('urgent');
    });

    test('getAllScheduledTasks returns all tasks', () => {
      db.insertScheduledTask({ description: 'Task 1', priority: 5 });
      db.insertScheduledTask({ description: 'Task 2', priority: 3 });

      const tasks = db.getAllScheduledTasks();
      expect(tasks).toHaveLength(2);
    });

    test('updateScheduledTask updates fields', () => {
      const id = db.insertScheduledTask({
        description: 'Original',
        priority: 5,
      });

      db.updateScheduledTask(id, {
        description: 'Updated',
        priority: 1,
        estimateMinutes: 45,
      });

      const task = db.getScheduledTaskById(id);
      expect(task!.description).toBe('Updated');
      expect(task!.priority).toBe(1);
      expect(task!.estimateMinutes).toBe(45);
    });

    test('updateScheduledTask with no fields does nothing', () => {
      const id = db.insertScheduledTask({
        description: 'Test',
        priority: 5,
      });

      db.updateScheduledTask(id, {});

      const task = db.getScheduledTaskById(id);
      expect(task!.description).toBe('Test');
    });

    test('updateScheduledTaskTags replaces tags', () => {
      const id = db.insertScheduledTask({
        description: 'Task',
        priority: 5,
      });

      db.insertScheduledTaskTags(id, ['old']);
      db.updateScheduledTaskTags(id, ['new1', 'new2']);

      const tags = db.getScheduledTaskTags(id);
      expect(tags).toHaveLength(2);
      expect(tags).not.toContain('old');
    });

    test('deleteScheduledTask removes task', () => {
      const id = db.insertScheduledTask({
        description: 'To delete',
        priority: 5,
      });

      db.deleteScheduledTask(id);

      const task = db.getScheduledTaskById(id);
      expect(task).toBeNull();
    });

    test('getScheduledTasksForSelection categorizes tasks', () => {
      // Oldest
      db.insertScheduledTask({ description: 'Old task', priority: 5 });

      // Important (priority != 5)
      db.insertScheduledTask({ description: 'Important', priority: 1 });

      // Urgent (scheduled for today)
      const today = new Date();
      db.insertScheduledTask({
        description: 'Urgent',
        priority: 5,
        scheduledDateTime: today,
      });

      const selection = db.getScheduledTasksForSelection();
      expect(selection.oldest.length).toBeGreaterThan(0);
      expect(selection.important.length).toBeGreaterThan(0);
      expect(selection.urgent.length).toBeGreaterThan(0);
    });
  });
});
