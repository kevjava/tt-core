# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

tt-core is the core library for tt-time-tracker, a time-tracking system with scheduling capabilities. It provides session management, task scheduling, and SQLite database persistence.

## Commands

- `npm run build` - Compile TypeScript and copy schema.sql to dist
- `npm test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Type-check without emitting

Run a single test file:
```bash
npx jest tests/database.test.ts
```

Run a specific test by name:
```bash
npx jest -t "test name pattern"
```

## Architecture

### Core Components

**TTDatabase** (`src/database.ts`) - SQLite wrapper using better-sqlite3. Manages sessions, session tags, scheduled tasks, and task tags. Uses WAL mode with foreign key constraints.

**TimeTrackingService** (`src/time-tracking.ts`) - Session lifecycle: start, stop, pause, resume, abandon. Supports session chaining (resuming paused work) and parent/child sessions (interruptions).

**TTScheduler** (`src/scheduler.ts`) - Implements TaskScheduler interface from @kevjava/task-parser. Provides daily planning with FIFO + priority ordering.

### Session Chaining Model

Sessions can form chains via two relationships:
- `continuesSessionId` - Links to previous session in a resume chain
- `parentSessionId` - Links to an interrupting session

Use `getChainRoot()` to find the original session and `getContinuationChain()` to get all related sessions.

### Database Schema

Tables: `sessions`, `session_tags`, `scheduled_tasks`, `scheduled_task_tags`

Session states: `working`, `paused`, `completed`, `abandoned`

Task priority: 1-9 (lower = higher priority, default 5)

### Dependencies

- `@kevjava/task-parser` - Local file dependency at ../task-parser (provides TaskScheduler interface)
- `better-sqlite3` - SQLite database
- `date-fns` - Date utilities

## Testing

Tests use in-memory SQLite (`:memory:`). Each test creates a fresh database instance and calls `db.close()` in afterEach.
