#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { getClient } from "./vikunja-client.js";
import type {
  Project,
  Task,
  Label,
  TaskComment,
  Team,
  User,
  Notification,
  TaskRelation,
  ProjectView,
  Message,
} from "./types.js";

// Helper to format responses
function formatResponse(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

// Helper to prefix task ID with # for easy reference in conversation.
// Strips `identifier` (project-scoped index like "PROJ-42") and `index` to
// avoid confusion with the global `id` which is the canonical reference.
function prefixTaskId(task: Task): Record<string, unknown> {
  const {
    identifier: _identifier,
    index: _index,
    ...rest
  } = task as unknown as Record<string, unknown>;
  return { ...rest, id: `#${task.id}` };
}

// Helper to prefix task IDs in an array
function prefixTaskIds(tasks: Task[]): Array<Record<string, unknown>> {
  return tasks.map(prefixTaskId);
}

// Fields on a Task response that must not round-trip back as updates:
// nested collections, relations, computed values, and server timestamps.
// Sending these in a POST /tasks/:id body can corrupt the task's relations or
// get rejected by validation.
const TASK_UPDATE_STRIP_FIELDS = [
  "assignees",
  "labels",
  "attachments",
  "reminders",
  "related_tasks",
  "created_by",
  "subscription",
  "reactions",
  "comments",
  "comment_count",
  "buckets",
  "created",
  "updated",
  "done_at",
  "is_unread",
  "identifier",
  "index",
] as const;

// Build a full-object update body by stripping read-only fields from the
// current task, then overlaying only the caller-provided updates. Used to
// work around Vikunja's POST /tasks/:id, which zeroes any field absent from
// the body (see tasks_update / tasks_complete handlers).
function buildTaskUpdateBody(
  current: Task,
  updates: Record<string, unknown>
): Record<string, unknown> {
  const base = { ...(current as unknown as Record<string, unknown>) };
  for (const field of TASK_UPDATE_STRIP_FIELDS) {
    delete base[field];
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) base[key] = value;
  }
  return base;
}

// Helper to format error responses
function formatError(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: true, message }, null, 2),
      },
    ],
    isError: true,
  };
}

// Factory: create a new McpServer with all tools registered
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "vikunja",
    version: "1.0.0",
  });

  // ============================================================================
  // Ping Tool (for testing)
  // ============================================================================

  server.tool("ping", "Test if the MCP server is working", {}, async () => {
    return formatResponse({
      status: "ok",
      message: "pong",
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================================
  // Project Tools
  // ============================================================================

  server.tool(
    "projects_list",
    "List all projects the user has access to",
    {
      page: z.coerce.number().optional().describe("Page number for pagination (default: 1)"),
      perPage: z.coerce.number().optional().describe("Number of items per page (default: 50)"),
      search: z.string().optional().describe("Search projects by title"),
      isArchived: z.boolean().optional().describe("If true, also return archived projects"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.get<Project[]>("/projects", {
          page: args.page,
          per_page: args.perPage,
          s: args.search,
          is_archived: args.isArchived,
        });
        return formatResponse({ projects: response.data, pagination: response.pagination });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "projects_get",
    "Get a single project by ID",
    {
      projectId: z.coerce.number().describe("The project ID"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.get<Project>(`/projects/${args.projectId}`);
        return formatResponse(response.data);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "projects_create",
    "Create a new project",
    {
      title: z.string().describe("Project title (required)"),
      description: z.string().optional().describe("Project description"),
      color: z.string().optional().describe("Hex color (e.g., 'ff0000')"),
      parentProjectId: z.coerce.number().optional().describe("Parent project ID for nesting"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.put<Project>("/projects", {
          title: args.title,
          description: args.description,
          hex_color: args.color,
          parent_project_id: args.parentProjectId,
        });
        return formatResponse(response.data);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "projects_update",
    "Update an existing project",
    {
      projectId: z.coerce.number().describe("The project ID (required)"),
      title: z.string().optional().describe("New project title"),
      description: z.string().optional().describe("New project description"),
      color: z.string().optional().describe("New hex color"),
      isArchived: z.boolean().optional().describe("Archive or unarchive the project"),
      isFavorite: z.boolean().optional().describe("Mark as favorite"),
    },
    async (args) => {
      try {
        const client = getClient();
        const body: Record<string, unknown> = {};
        if (args.title !== undefined) body.title = args.title;
        if (args.description !== undefined) body.description = args.description;
        if (args.color !== undefined) body.hex_color = args.color;
        if (args.isArchived !== undefined) body.is_archived = args.isArchived;
        if (args.isFavorite !== undefined) body.is_favorite = args.isFavorite;

        const response = await client.post<Project>(`/projects/${args.projectId}`, body);
        return formatResponse(response.data);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "projects_delete",
    "Delete a project",
    {
      projectId: z.coerce.number().describe("The project ID to delete"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.delete<Message>(`/projects/${args.projectId}`);
        return formatResponse({ ...response.data, success: true, message: "Project deleted" });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================================================
  // Task Tools
  // ============================================================================

  server.tool(
    "tasks_list",
    "List all tasks (optionally filtered by project)",
    {
      projectId: z
        .number()
        .optional()
        .describe("Filter by project ID (if not provided, returns all tasks)"),
      page: z.coerce.number().optional().describe("Page number for pagination (default: 1)"),
      perPage: z.coerce.number().optional().describe("Number of items per page (default: 50)"),
      search: z.string().optional().describe("Search tasks by text"),
      sortBy: z
        .string()
        .optional()
        .describe("Sort field: id, title, done, due_date, priority, created, updated"),
      orderBy: z.string().optional().describe("Sort order: asc or desc"),
      filter: z.string().optional().describe("Filter query (e.g., 'done = false')"),
    },
    async (args) => {
      try {
        const client = getClient();
        const query: Record<string, string | number | boolean | undefined> = {
          page: args.page,
          per_page: args.perPage,
          s: args.search,
          sort_by: args.sortBy,
          order_by: args.orderBy,
          filter: args.filter,
        };

        let response;
        if (args.projectId) {
          // Get tasks for a specific project - need to get the first view
          const projectResponse = await client.get<Project>(`/projects/${args.projectId}`);
          const project = projectResponse.data;
          const firstView = project.views?.[0];
          if (!firstView) {
            return formatError(new Error("Project has no views"));
          }
          response = await client.get<Task[]>(
            `/projects/${args.projectId}/views/${firstView.id}/tasks`,
            query
          );
        } else {
          // Get all tasks
          response = await client.get<Task[]>("/tasks", query);
        }

        return formatResponse({
          tasks: prefixTaskIds(response.data),
          pagination: response.pagination,
        });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "tasks_get",
    "Get a single task by ID with full context: description, labels, assignees, and comments",
    {
      taskId: z.coerce.number().describe("The task ID"),
    },
    async (args) => {
      try {
        const client = getClient();
        const [taskResponse, commentsResponse] = await Promise.all([
          client.get<Task>(`/tasks/${args.taskId}`),
          client.get<TaskComment[]>(`/tasks/${args.taskId}/comments`),
        ]);
        return formatResponse({
          ...prefixTaskId(taskResponse.data),
          comments: commentsResponse.data,
        });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "tasks_create",
    "Create a new task in a project",
    {
      projectId: z.coerce.number().describe("Project ID to create the task in (required)"),
      title: z.string().describe("Task title (required)"),
      description: z.string().optional().describe("Task description"),
      dueDate: z
        .string()
        .optional()
        .describe("Due date (ISO 8601 format, e.g., '2024-12-31T23:59:59Z')"),
      startDate: z.string().optional().describe("Start date (ISO 8601 format)"),
      endDate: z.string().optional().describe("End date (ISO 8601 format)"),
      priority: z.coerce.number().optional().describe("Priority level (higher = more important)"),
      done: z.boolean().optional().describe("Whether the task is completed"),
      color: z.string().optional().describe("Hex color for the task"),
      percentDone: z.coerce.number().optional().describe("Completion percentage (0-1)"),
      assignees: z.array(z.coerce.number()).optional().describe("Array of user IDs to assign"),
      labels: z.array(z.coerce.number()).optional().describe("Array of label IDs to add"),
    },
    async (args) => {
      try {
        const client = getClient();
        const body: Record<string, unknown> = {
          title: args.title,
        };
        if (args.description !== undefined) body.description = args.description;
        if (args.dueDate !== undefined) body.due_date = args.dueDate;
        if (args.startDate !== undefined) body.start_date = args.startDate;
        if (args.endDate !== undefined) body.end_date = args.endDate;
        if (args.priority !== undefined) body.priority = args.priority;
        if (args.done !== undefined) body.done = args.done;
        if (args.color !== undefined) body.hex_color = args.color;
        if (args.percentDone !== undefined) body.percent_done = args.percentDone;
        if (args.assignees !== undefined) {
          body.assignees = args.assignees.map((id: number) => ({ id }));
        }
        if (args.labels !== undefined) {
          body.labels = args.labels.map((id: number) => ({ id }));
        }

        const response = await client.put<Task>(`/projects/${args.projectId}/tasks`, body);
        return formatResponse(prefixTaskId(response.data));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "tasks_update",
    "Update an existing task",
    {
      taskId: z.coerce.number().describe("The task ID (required)"),
      title: z.string().optional().describe("New task title"),
      description: z.string().optional().describe("New task description"),
      dueDate: z.string().optional().describe("New due date (ISO 8601 format)"),
      startDate: z.string().optional().describe("New start date (ISO 8601 format)"),
      endDate: z.string().optional().describe("New end date (ISO 8601 format)"),
      priority: z.coerce.number().optional().describe("New priority level"),
      done: z.boolean().optional().describe("Mark as done or not done"),
      color: z.string().optional().describe("New hex color"),
      percentDone: z.coerce.number().optional().describe("New completion percentage (0-1)"),
      projectId: z.coerce.number().optional().describe("Move task to a different project"),
      isFavorite: z.boolean().optional().describe("Mark as favorite"),
    },
    async (args) => {
      try {
        const client = getClient();

        // Vikunja's POST /tasks/:id deserialises the body into its Task struct
        // and writes it back wholesale — any field absent from the body gets
        // reset to the Go zero value (empty string, 0, false). To implement
        // partial updates safely we fetch the current task first and merge
        // the caller's changes onto it, then send the full object.
        const current = (await client.get<Task>(`/tasks/${args.taskId}`)).data;
        const body = buildTaskUpdateBody(current, {
          title: args.title,
          description: args.description,
          due_date: args.dueDate,
          start_date: args.startDate,
          end_date: args.endDate,
          priority: args.priority,
          done: args.done,
          hex_color: args.color,
          percent_done: args.percentDone,
          project_id: args.projectId,
          is_favorite: args.isFavorite,
        });

        const response = await client.post<Task>(`/tasks/${args.taskId}`, body);
        return formatResponse(prefixTaskId(response.data));
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "tasks_delete",
    "Delete a task",
    {
      taskId: z.coerce.number().describe("The task ID to delete"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.delete<Message>(`/tasks/${args.taskId}`);
        return formatResponse({ ...response.data, success: true, message: "Task deleted" });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================================================
  // Label Tools
  // ============================================================================

  server.tool(
    "labels_list",
    "List all labels the user has access to",
    {
      page: z.coerce.number().optional().describe("Page number for pagination"),
      perPage: z.coerce.number().optional().describe("Number of items per page"),
      search: z.string().optional().describe("Search labels by title"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.get<Label[]>("/labels", {
          page: args.page,
          per_page: args.perPage,
          s: args.search,
        });
        return formatResponse({ labels: response.data, pagination: response.pagination });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "labels_create",
    "Create a new label",
    {
      title: z.string().describe("Label title (required)"),
      description: z.string().optional().describe("Label description"),
      color: z.string().optional().describe("Hex color (e.g., 'ff0000')"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.put<Label>("/labels", {
          title: args.title,
          description: args.description,
          hex_color: args.color,
        });
        return formatResponse(response.data);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "labels_delete",
    "Delete a label",
    {
      labelId: z.coerce.number().describe("The label ID to delete"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.delete<Message>(`/labels/${args.labelId}`);
        return formatResponse({ ...response.data, success: true, message: "Label deleted" });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "task_labels_add",
    "Add a label to a task",
    {
      taskId: z.coerce.number().describe("The task ID"),
      labelId: z.coerce.number().describe("The label ID to add"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.put<Label>(`/tasks/${args.taskId}/labels`, {
          label_id: args.labelId,
        });
        return formatResponse(response.data);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "task_labels_remove",
    "Remove a label from a task",
    {
      taskId: z.coerce.number().describe("The task ID"),
      labelId: z.coerce.number().describe("The label ID to remove"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.delete<Message>(
          `/tasks/${args.taskId}/labels/${args.labelId}`
        );
        return formatResponse({
          ...response.data,
          success: true,
          message: "Label removed from task",
        });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================================================
  // Comment Tools
  // ============================================================================

  server.tool(
    "task_comments_list",
    "List all comments on a task",
    {
      taskId: z.coerce.number().describe("The task ID"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.get<TaskComment[]>(`/tasks/${args.taskId}/comments`);
        return formatResponse({ comments: response.data });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "task_comments_add",
    "Add a comment to a task",
    {
      taskId: z.coerce.number().describe("The task ID"),
      comment: z.string().describe("The comment text"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.put<TaskComment>(`/tasks/${args.taskId}/comments`, {
          comment: args.comment,
        });
        return formatResponse(response.data);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================================================
  // Task Relation Tools
  // ============================================================================

  server.tool(
    "task_relations_add",
    "Create a relation between two tasks",
    {
      taskId: z.coerce.number().describe("The source task ID"),
      otherTaskId: z.coerce.number().describe("The target task ID"),
      relationKind: z
        .string()
        .describe(
          "Relation type: subtask, parenttask, related, duplicateof, duplicates, blocking, blocked, precedes, follows, copiedfrom, copiedto"
        ),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.put<TaskRelation>(`/tasks/${args.taskId}/relations`, {
          other_task_id: args.otherTaskId,
          relation_kind: args.relationKind,
        });
        return formatResponse(response.data);
      } catch (error) {
        return formatError(error);
      }
    }
  );

  server.tool(
    "task_relations_remove",
    "Remove a relation between two tasks",
    {
      taskId: z.coerce.number().describe("The source task ID"),
      otherTaskId: z.coerce.number().describe("The target task ID"),
      relationKind: z.string().describe("Relation type to remove"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.delete<Message>(
          `/tasks/${args.taskId}/relations/${args.relationKind}/${args.otherTaskId}`
        );
        return formatResponse({
          ...response.data,
          success: true,
          message: "Task relation removed",
        });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================================================
  // Project View Tools
  // ============================================================================

  server.tool(
    "project_views_list",
    "List all views for a project",
    {
      projectId: z.coerce.number().describe("The project ID"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.get<ProjectView[]>(`/projects/${args.projectId}/views`);
        return formatResponse({ views: response.data });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================================================
  // Team Tools
  // ============================================================================

  server.tool(
    "teams_list",
    "List all teams the user belongs to",
    {
      page: z.coerce.number().optional().describe("Page number for pagination"),
      perPage: z.coerce.number().optional().describe("Number of items per page"),
      search: z.string().optional().describe("Search teams by name"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.get<Team[]>("/teams", {
          page: args.page,
          per_page: args.perPage,
          s: args.search,
        });
        return formatResponse({ teams: response.data, pagination: response.pagination });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================================================
  // User Tools
  // ============================================================================

  server.tool(
    "users_search",
    "Search for users by username, name, or email",
    {
      search: z.string().describe("Search term (required)"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.get<User[]>("/users", {
          s: args.search,
        });
        return formatResponse({ users: response.data });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================================================
  // Notification Tools
  // ============================================================================

  server.tool(
    "notifications_list",
    "List all notifications for the current user",
    {
      page: z.coerce.number().optional().describe("Page number for pagination"),
      perPage: z.coerce.number().optional().describe("Number of items per page"),
    },
    async (args) => {
      try {
        const client = getClient();
        const response = await client.get<Notification[]>("/notifications", {
          page: args.page,
          per_page: args.perPage,
        });
        return formatResponse({ notifications: response.data, pagination: response.pagination });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================================================
  // Complete Task (Shortcut)
  // ============================================================================

  server.tool(
    "tasks_complete",
    "Mark a task as done (shortcut for tasks_update with done=true)",
    {
      taskId: z.coerce.number().describe("The task ID to mark as done"),
    },
    async (args) => {
      try {
        const client = getClient();
        // Same merge-with-current trick as tasks_update — Vikunja's POST
        // /tasks/:id zeroes any unsent field, so we send the full object.
        const current = (await client.get<Task>(`/tasks/${args.taskId}`)).data;
        const body = buildTaskUpdateBody(current, { done: true });
        const response = await client.post<Task>(`/tasks/${args.taskId}`, body);
        return formatResponse({
          id: `#${response.data.id}`,
          title: response.data.title,
          done: response.data.done,
          message: "Task marked as done",
        });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  // ============================================================================
  // Daily Summary (Composite)
  // ============================================================================

  server.tool(
    "daily_summary",
    "Get a daily overview: overdue tasks + tasks due today, grouped by project. Shows priorities and description previews.",
    {},
    async () => {
      try {
        const client = getClient();

        // Fetch all incomplete tasks sorted by due date
        const tasksResponse = await client.get<Task[]>("/tasks", {
          filter: "done = false",
          sort_by: "due_date",
          order_by: "asc",
          per_page: 200,
        });

        // Fetch projects for grouping
        const projectsResponse = await client.get<Project[]>("/projects");
        const projectMap = new Map<number, string>();
        for (const p of projectsResponse.data) {
          projectMap.set(p.id, p.title);
        }

        const now = new Date();
        const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

        const overdue: Task[] = [];
        const dueToday: Task[] = [];
        const upcoming: Task[] = [];
        const noDueDate: Task[] = [];

        for (const task of tasksResponse.data) {
          if (!task.due_date || task.due_date === "0001-01-01T00:00:00Z") {
            noDueDate.push(task);
            continue;
          }
          const dueDateStr = task.due_date.split("T")[0];
          if (dueDateStr < todayStr) {
            overdue.push(task);
          } else if (dueDateStr === todayStr) {
            dueToday.push(task);
          } else {
            upcoming.push(task);
          }
        }

        const priorityLabels: Record<number, string> = {
          0: "unset",
          1: "low",
          2: "medium",
          3: "high",
          4: "urgent",
          5: "do-now",
        };

        const formatTask = (task: Task) => ({
          id: `#${task.id}`,
          title: task.title,
          priority: priorityLabels[task.priority ?? 0] ?? "unset",
          due_date: task.due_date,
          project: projectMap.get(task.project_id ?? 0) ?? "Unknown",
          has_description: !!(task.description && task.description.length > 0),
          description_preview: task.description ? task.description.slice(0, 120) : null,
        });

        return formatResponse({
          date: todayStr,
          summary: {
            overdue: overdue.length,
            due_today: dueToday.length,
            upcoming: upcoming.length,
            no_due_date: noDueDate.length,
            total_incomplete: tasksResponse.data.length,
          },
          overdue: overdue.map(formatTask),
          due_today: dueToday.map(formatTask),
          upcoming_next_7_days: upcoming
            .filter((t) => {
              const d = new Date(t.due_date!);
              const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
              return diff <= 7;
            })
            .map(formatTask),
        });
      } catch (error) {
        return formatError(error);
      }
    }
  );

  return server;
}

// Start the server
async function main() {
  const mode = process.env.MCP_TRANSPORT ?? "stdio";

  if (mode === "http") {
    const port = parseInt(process.env.PORT ?? "8847", 10);
    const authToken = process.env.MCP_AUTH_TOKEN;
    const sessions = new Map<
      string,
      { transport: StreamableHTTPServerTransport; server: McpServer }
    >();

    if (authToken) {
      console.error(
        `Vikunja MCP server (HTTP) auth enabled — requests to /mcp must present Authorization: Bearer <token>`
      );
    } else {
      console.error(
        `Vikunja MCP server (HTTP) auth DISABLED — MCP_AUTH_TOKEN not set. Anyone reaching the port can call tools.`
      );
    }

    // Timing-safe comparison of the caller's bearer token against the
    // configured MCP_AUTH_TOKEN. Returns false if either value is missing
    // or if lengths differ, without leaking which was the cause.
    const isAuthorized = (headerValue: string | undefined): boolean => {
      if (!authToken) return true;
      if (!headerValue) return false;
      const match = headerValue.match(/^Bearer\s+(.+)$/i);
      if (!match) return false;
      const provided = Buffer.from(match[1], "utf8");
      const expected = Buffer.from(authToken, "utf8");
      if (provided.length !== expected.length) return false;
      return timingSafeEqual(provided, expected);
    };

    const httpServer = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

      // Health check — intentionally unauthenticated so external monitors
      // can probe liveness without holding the shared secret.
      if (req.method === "GET" && url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            transport: "http",
            sessions: sessions.size,
            auth: authToken ? "required" : "disabled",
          })
        );
        return;
      }

      // MCP endpoint
      if (url.pathname === "/mcp") {
        if (!isAuthorized(req.headers.authorization)) {
          res.writeHead(401, {
            "Content-Type": "application/json",
            "WWW-Authenticate": 'Bearer realm="vikunja-mcp"',
          });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }

        // Check for existing session
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (sessionId && sessions.has(sessionId)) {
          // Existing session
          const session = sessions.get(sessionId)!;
          await session.transport.handleRequest(req, res);
          return;
        }

        // New session - only on POST (initialization)
        if (req.method === "POST") {
          const sessionServer = createMcpServer();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              sessions.delete(transport.sessionId);
            }
          };

          await sessionServer.connect(transport);
          await transport.handleRequest(req, res);

          if (transport.sessionId) {
            sessions.set(transport.sessionId, { transport, server: sessionServer });
          }
          return;
        }

        // GET without session (SSE listener) or DELETE
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No valid session. Send an initialize request first." }));
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(port, "0.0.0.0", () => {
      console.error(`Vikunja MCP server (HTTP) listening on port ${port}`);
    });
  } else {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Vikunja MCP server (stdio) started");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
