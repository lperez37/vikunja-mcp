---
name: vikunja-tasks
description: "Manage tasks in Vikunja during work sessions. Keeps task board in sync with actual work."
license: MIT
metadata:
  version: "2.1"
---

# Vikunja Task Management

## Core Principles

1. **Tasks reflect reality** — update as work happens, not after
2. **Buckets matter** — always move tasks to match their state
3. **Don't ask, do** — update status automatically when work completes
4. **Capture everything** — any TODO, bug, or idea becomes a task

## Kanban Flow

```
Backlog → Ready → Working (limit: 2-3) → Review → Done
```

## MCP Tool Patterns

### Setup (Once Per Session)

Get bucket IDs before moving tasks:
1. `project_views_list` → find Kanban view (`view_kind: "kanban"`)
2. `buckets_list` → cache bucket IDs (Backlog, Ready, Working, Done)

### State Changes

Every state change requires **status update + bucket move**:

| Action | MCP Calls |
|--------|-----------|
| Start task | `task_move_to_bucket` → Working |
| Complete task | `tasks_update` (done=true), `task_comments_add`, `task_move_to_bucket` → Done |
| Blocked | `task_comments_add` (explain why), `task_move_to_bucket` → Ready |
| Create task | `tasks_create`, `task_move_to_bucket` → Backlog/Ready |

### Completion Comments

Always add a comment when completing:
```
✅ Completed in commit <hash>

- What was done
- Key changes
```

## Automatic Actions

Do without asking:
- Move to Working when starting
- Mark done + comment + move to Done when completing
- Create tasks for discovered bugs
- Add blocker comments when stuck

Confirm first:
- Changing priority
- Deleting tasks
- Significant scope changes

## Session Patterns

### Starting
1. Check Working bucket for in-progress tasks
2. Show Ready queue
3. If Working full and user wants new task, ask what to pause

### Completing
```
✓ #12: Fix auth timeout
  - Extended timeout to 60s
  Moved to Done. Continue with #15?
```

### Blocked
```
#12 blocked: waiting on API credentials
Moved to Ready. Switch to #15?
```

### Discovering Issues
1. `tasks_create` with description
2. Move to Ready (urgent) or Backlog
3. Ask: fix now or continue current task?

### Ending Session
1. Comment on in-progress tasks with current state
2. Verify completed tasks are in Done bucket
3. Summarize: completed, in-progress, created

## User Request Mapping

| User Says | Action |
|-----------|--------|
| "Work on X" | Move to Working, begin |
| "Done with X" | Update + comment + move to Done |
| "I'm stuck" | Comment blocker, move to Ready |
| "Remind me to X" | Create in Backlog |
| "What's next?" | Show Ready queue |

## Things to Avoid

- Marking done without moving to Done bucket
- Leaving completed tasks in Working
- Exceeding WIP limits silently
- Creating duplicates (search first)
- Skipping completion comments
