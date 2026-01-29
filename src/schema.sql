-- TT Core Database Schema

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  description TEXT NOT NULL,
  project TEXT,
  estimate_minutes INTEGER,
  explicit_duration_minutes INTEGER,
  remark TEXT,
  state TEXT NOT NULL DEFAULT 'working',
  parent_session_id INTEGER,
  continues_session_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (continues_session_id) REFERENCES sessions(id) ON DELETE SET NULL,
  CHECK (state IN ('working', 'paused', 'completed', 'abandoned')),
  CHECK (end_time IS NULL OR end_time > start_time)
);

CREATE TABLE IF NOT EXISTS session_tags (
  session_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (session_id, tag),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_end_time ON sessions(end_time);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_continues ON sessions(continues_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_time_range ON sessions(start_time, end_time, project);
CREATE INDEX IF NOT EXISTS idx_session_tags_tag ON session_tags(tag);

-- Scheduled Tasks (future tasks that can be used as templates)
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  project TEXT,
  estimate_minutes INTEGER,
  priority INTEGER DEFAULT 5,
  scheduled_date_time DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (priority >= 1 AND priority <= 9)
);

CREATE TABLE IF NOT EXISTS scheduled_task_tags (
  scheduled_task_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (scheduled_task_id, tag),
  FOREIGN KEY (scheduled_task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
);

-- Indexes for scheduled tasks
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_priority ON scheduled_tasks(priority ASC);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_scheduled_date ON scheduled_tasks(scheduled_date_time ASC);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_created_at ON scheduled_tasks(created_at ASC);
