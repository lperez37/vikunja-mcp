---
name: vikunja-tasks
description: "Manage tasks in Vikunja during work sessions. Use when starting work, completing tasks, discovering bugs, getting blocked, or when user mentions tasks, TODOs, or work items. Keeps task board in sync with actual work."
license: MIT
metadata:
  version: "2.0"
---

# Vikunja Task Management

## When to Use This Skill

- User says "let's work on X" → find and start task
- Work completes → mark done, move to Done bucket
- Bug or issue discovered → create task immediately
- Getting blocked → mark blocked, note why, suggest alternatives
- User mentions TODO or "we should" → capture as task
- Session starts → check what's currently in progress
- Session ends → update tasks with current status

## Core Principles

1. **Tasks reflect reality** — update as work happens, not after
2. **Working column is sacred** — respect WIP limits, don't overload
3. **Don't ask, do** — update status automatically when work completes
4. **Capture everything** — any mentioned TODO, bug, or idea becomes a task
5. **Context is king** — always note why something is blocked or deferred
6. **Buckets matter** — moving tasks between buckets is as important as updating status

## Kanban Flow

Standard columns in order:

```
Backlog → Ready → Working → Review → Done
```

- **Backlog**: Ideas, future work, not yet committed
- **Ready**: Prioritized, next up when capacity opens
- **Working**: Actively in progress (limit: 2-3 tasks)
- **Review**: Needs verification, testing, or sign-off
- **Done**: Completed work

### WIP Limits

- If Working is full, ask what to pause before starting new work
- Never silently exceed the limit
- Blocked tasks move back to Ready, not stay in Working

## MCP Tool Usage

### Discovering Board Structure

Before moving tasks, understand the board:

1. Get project views: `project_views_list` with projectId
2. Find the Kanban view (look for `view_kind: "kanban"`)
3. Get buckets: `buckets_list` with projectId and viewId
4. Cache bucket IDs for the session (Backlog, Ready, Working, Review, Done)

### State Change Actions

Every state change requires **both** a status update **and** a bucket move:

| State Change | MCP Actions |
|-------------|-------------|
| Starting task | `task_move_to_bucket` → Working bucket |
| Task blocked | `task_comments_add` (explain blocker), `task_move_to_bucket` → Ready bucket |
| Task complete | `tasks_update` (done=true), `task_comments_add` (summary), `task_move_to_bucket` → Done bucket |
| Needs review | `task_move_to_bucket` → Review bucket |
| Deprioritized | `task_move_to_bucket` → Backlog bucket |

### Task Lifecycle Example

**Starting a task:**
```
1. tasks_get (taskId) — confirm task details
2. task_move_to_bucket (projectId, viewId, workingBucketId, taskId)
```

**Completing a task:**
```
1. tasks_update (taskId, done=true)
2. task_comments_add (taskId, "Completed in commit abc123\n\n- What was done\n- Key changes")
3. task_move_to_bucket (projectId, viewId, doneBucketId, taskId)
```

**Task gets blocked:**
```
1. task_comments_add (taskId, "Blocked: waiting on API credentials from DevOps")
2. task_move_to_bucket (projectId, viewId, readyBucketId, taskId)
```

### Label Management

Use labels for cross-cutting concerns:

- `task_labels_add` — apply when task type/status needs visibility
- `task_labels_remove` — clean up when no longer applicable

Common label uses:
- Task type: bug, feature, docs, maintenance
- Status: blocked, urgent, needs-review
- Category: frontend, backend, devops

### Creating Tasks

When creating new tasks:

```
1. tasks_create (projectId, title, description, priority, labels)
2. task_move_to_bucket — place in appropriate bucket (usually Backlog or Ready)
```

### Querying Tasks

- `tasks_list` with projectId — get all tasks for a project
- `tasks_list` with filter — e.g., `done = false` for open tasks
- `tasks_get` — get single task with full details including relations

## Automatic vs Confirmed Actions

### Do Automatically
- Move task to Working when user starts it
- Mark done and move to Done when work completes
- Add blocked status when work can't continue
- Create tasks for discovered bugs/issues
- Add progress notes via comments
- Update task status at session end
- Move tasks between buckets to reflect state

### Confirm With User First
- Changing priority
- Deleting tasks
- Splitting into multiple tasks
- Significant scope changes
- Reassigning to someone else

## Session Patterns

### Starting a Session

1. List tasks currently in Working bucket
2. Show what's next in Ready bucket
3. Ask user what they want to focus on
4. If they pick something new and Working is full, ask what to pause

**Example prompt:**
```
You have 2 tasks in Working:
- #12: Fix auth timeout
- #15: Add error logging

Ready queue has 4 tasks. Continue with one of these, or start something new?
```

### Starting a Task

1. Move task to Working bucket (if not already there)
2. Confirm the goal or acceptance criteria
3. Reference the task ID throughout the work

**Example:**
```
Working on #12: Fix auth timeout. Moving to Working bucket.

The goal is to extend the session timeout from 30s to 60s.
Where's the auth config located?
```

### Completing a Task

1. Mark task as done via `tasks_update`
2. Add completion comment via `task_comments_add`
3. Move to Done bucket via `task_move_to_bucket`
4. Inform user and suggest what's next

**Critical:** All three steps are required. Marking done without moving to Done bucket leaves the board in an inconsistent state.

**Example:**
```
✓ Completed #12: Fix auth timeout
  - Extended timeout to 60s in config
  - Added retry logic

Moved to Done bucket. Continue with #15 (error logging)?
```

### Completion Comments

When marking a task done, add a structured comment:

```
✅ Completed in commit <hash>

<Brief summary of what was done>

Key changes:
- Item 1
- Item 2

<Optional: metrics, test count, coverage>
```

### When Work Gets Blocked

1. Add comment explaining the blocker
2. Move task back to Ready bucket
3. Suggest alternative tasks

**Example:**
```
We need API credentials to continue. Marking #12 as blocked.

Added comment: "Blocked: Waiting on API key from DevOps - requested today"
Moved to Ready bucket.

Want to switch to:
1. #15: Add error logging
2. Something else from Ready?
```

### Discovering New Issues

When work reveals bugs or new requirements:

1. Create task immediately with `tasks_create`
2. Apply appropriate labels
3. Move to appropriate bucket (Backlog or Ready based on urgency)
4. Inform user briefly
5. Ask whether to fix now or continue current work

**Example:**
```
Found an issue — the retry logic doesn't handle timeouts.

Created #23: Handle timeout in retry loop
- Added label: bug
- Moved to Ready bucket

Fix now or continue with current task?
```

### Ending a Session

1. Update any in-progress tasks with current state via comments
2. Ensure all completed tasks are in Done bucket
3. Summarize what was accomplished

**Example:**
```
Wrapping up. Here's what happened:

✓ Completed: #12 Fix auth timeout (Done bucket)
◐ In progress: #15 Error logging (Working bucket - halfway done)
+ Created: #23 Handle timeout bug (Ready bucket)

#15 is still in Working for next time.
```

## Task Creation Guidelines

When creating tasks:

- **Title**: Action-oriented, specific (not "Fix bug" but "Fix timeout in auth retry")
- **Description**: Include context, steps to reproduce for bugs, acceptance criteria
- **Labels**: Always apply relevant type labels
- **Priority**: Set based on actual urgency

## Priority Guidelines

Use the priority field:

| Level | When to Use |
|-------|-------------|
| Critical/Highest | Security issues, data loss, production down |
| High | Blocking other work, due this week |
| Medium | Normal work, current sprint |
| Low | Nice to have, not urgent |
| Lowest | Someday/maybe, backlog filler |

## Handling User Requests

| User Says | Actions |
|-----------|---------|
| "Let's work on X" | Find task, `task_move_to_bucket` → Working, begin |
| "I finished X" | `tasks_update` done, `task_comments_add`, `task_move_to_bucket` → Done |
| "I'm stuck" | `task_comments_add` blocker, `task_move_to_bucket` → Ready |
| "Remind me to X" | `tasks_create` in Backlog bucket |
| "What should I do?" | Query Ready bucket, suggest top priority |
| "What did I do today?" | List tasks in Done bucket |
| "This is urgent" | Confirm, then update priority |
| "Never mind on X" | Confirm deletion or move to Backlog |

## Response Formats

### Task List
```
## Working (2/3)
- #12: Fix auth timeout [bug] P3
- #15: Add error logging [maintenance] P2

## Ready
- #8: Update API docs [docs] P4
- #9: Refactor user service [maintenance] P2
```

### Single Task
```
## Task #12: Fix auth timeout
- Status: Working
- Bucket: Working
- Priority: High
- Labels: bug
- Created: 2024-01-10

### Description
Session times out after 30s, should be 60s...
```

### Completion
```
✓ Completed #12: Fix auth timeout
  - Changed timeout to 60s
  - Added graceful retry

Marked done, added comment, moved to Done bucket.
1 task remaining in Working.
```

## Things to Avoid

- Marking done without moving to Done bucket
- Leaving completed tasks in Working bucket
- Moving tasks without updating status appropriately
- Creating duplicate tasks (search first)
- Exceeding WIP limits silently
- Forgetting to add completion comments
- Not explaining blockers when moving to Ready
- Asking permission for every small status update
- Verbose task descriptions (be concise)
