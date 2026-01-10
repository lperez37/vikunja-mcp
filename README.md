# Vikunja MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that provides comprehensive integration with [Vikunja](https://vikunja.io), the open-source task management system. This server enables AI assistants like Claude to interact with your Vikunja instance for managing projects, tasks, labels, and more.

## Features

The Vikunja MCP server provides access to the full range of Vikunja's functionality through the following tool categories:

- **Project Management** - Create, read, update, delete, and archive projects with hierarchical organization
- **Task Management** - Full CRUD operations for tasks with filtering, sorting, and searching capabilities
- **Label System** - Create and manage labels, attach/remove them from tasks
- **Comments** - Add and retrieve comments on tasks
- **Task Assignments** - Manage task assignees and track who's working on what
- **Task Relations** - Create relationships between tasks (subtasks, blocking, dependencies, etc.)
- **Kanban Boards** - Manage kanban buckets and move tasks between them
- **Project Views** - Access different views (list, kanban, table, etc.) for projects
- **Team Collaboration** - List teams and manage team-based projects
- **User Search** - Find users by username, name, or email
- **Notifications** - Access and manage user notifications
- **Connectivity Testing** - Built-in ping tool to verify server connectivity

## Installation

### Prerequisites

- Node.js 18 or higher
- A running Vikunja instance (self-hosted or cloud)
- Vikunja API token

### Option 1: NPM Installation

```bash
npm install -g vikunja-mcp-server
```

### Option 2: Manual Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/vikunja-mcp-server.git
cd vikunja-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project (if TypeScript):
```bash
npm run build
```

## Configuration

The server requires two environment variables to connect to your Vikunja instance:

- `VIKUNJA_URL` - The base URL of your Vikunja instance (e.g., `https://try.vikunja.io` or `http://localhost:3456`)
- `VIKUNJA_API_TOKEN` - Your Vikunja API token

### Obtaining a Vikunja API Token

1. Log in to your Vikunja instance
2. Go to **Settings** → **API Tokens**
3. Click **Create a new token**
4. Give it a descriptive name (e.g., "MCP Server")
5. Copy the generated token

## Usage

### Using with Claude Desktop

Add the following configuration to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vikunja": {
      "command": "npx",
      "args": ["-y", "vikunja-mcp-server"],
      "env": {
        "VIKUNJA_URL": "https://try.vikunja.io",
        "VIKUNJA_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

If you installed manually, use this configuration instead:

```json
{
  "mcpServers": {
    "vikunja": {
      "command": "node",
      "args": ["/path/to/vikunja-mcp-server/dist/index.js"],
      "env": {
        "VIKUNJA_URL": "https://try.vikunja.io",
        "VIKUNJA_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

### Using with Other MCP Clients

For other MCP clients, configure them to run the server with the appropriate environment variables. For example:

```bash
VIKUNJA_URL=https://try.vikunja.io VIKUNJA_API_TOKEN=your_token npx vikunja-mcp-server
```

### Testing the Connection

Once configured, you can test the connection by asking Claude:

```
Can you ping the Vikunja server to verify connectivity?
```

## API Tools Reference

### Utility Tools

#### `ping`
Test if the MCP server is working and can communicate.

**Parameters:** None

**Returns:** Status message with timestamp

---

### Project Tools

#### `projects_list`
List all projects the user has access to.

**Parameters:**
- `page` (number, optional) - Page number for pagination (default: 1)
- `perPage` (number, optional) - Number of items per page (default: 50)
- `search` (string, optional) - Search projects by title
- `isArchived` (boolean, optional) - If true, also return archived projects

**Returns:** Array of projects with pagination info

#### `projects_get`
Get a single project by ID.

**Parameters:**
- `projectId` (number, required) - The project ID

**Returns:** Project object with full details

#### `projects_create`
Create a new project.

**Parameters:**
- `title` (string, required) - Project title
- `description` (string, optional) - Project description
- `color` (string, optional) - Hex color (e.g., 'ff0000')
- `parentProjectId` (number, optional) - Parent project ID for nesting

**Returns:** Created project object

#### `projects_update`
Update an existing project.

**Parameters:**
- `projectId` (number, required) - The project ID
- `title` (string, optional) - New project title
- `description` (string, optional) - New project description
- `color` (string, optional) - New hex color
- `isArchived` (boolean, optional) - Archive or unarchive the project
- `isFavorite` (boolean, optional) - Mark as favorite

**Returns:** Updated project object

#### `projects_delete`
Delete a project.

**Parameters:**
- `projectId` (number, required) - The project ID to delete

**Returns:** Success confirmation message

---

### Task Tools

#### `tasks_list`
List all tasks (optionally filtered by project).

**Parameters:**
- `projectId` (number, optional) - Filter by project ID (if not provided, returns all tasks)
- `page` (number, optional) - Page number for pagination (default: 1)
- `perPage` (number, optional) - Number of items per page (default: 50)
- `search` (string, optional) - Search tasks by text
- `sortBy` (string, optional) - Sort field: id, title, done, due_date, priority, created, updated
- `orderBy` (string, optional) - Sort order: asc or desc
- `filter` (string, optional) - Filter query (e.g., 'done = false')

**Returns:** Array of tasks with pagination info

#### `tasks_get`
Get a single task by ID.

**Parameters:**
- `taskId` (number, required) - The task ID

**Returns:** Task object with full details

#### `tasks_create`
Create a new task in a project.

**Parameters:**
- `projectId` (number, required) - Project ID to create the task in
- `title` (string, required) - Task title
- `description` (string, optional) - Task description
- `dueDate` (string, optional) - Due date (ISO 8601 format, e.g., '2024-12-31T23:59:59Z')
- `startDate` (string, optional) - Start date (ISO 8601 format)
- `endDate` (string, optional) - End date (ISO 8601 format)
- `priority` (number, optional) - Priority level (higher = more important)
- `done` (boolean, optional) - Whether the task is completed
- `color` (string, optional) - Hex color for the task
- `percentDone` (number, optional) - Completion percentage (0-1)
- `assignees` (array of numbers, optional) - Array of user IDs to assign
- `labels` (array of numbers, optional) - Array of label IDs to add

**Returns:** Created task object

#### `tasks_update`
Update an existing task.

**Parameters:**
- `taskId` (number, required) - The task ID
- `title` (string, optional) - New task title
- `description` (string, optional) - New task description
- `dueDate` (string, optional) - New due date (ISO 8601 format)
- `startDate` (string, optional) - New start date (ISO 8601 format)
- `endDate` (string, optional) - New end date (ISO 8601 format)
- `priority` (number, optional) - New priority level
- `done` (boolean, optional) - Mark as done or not done
- `color` (string, optional) - New hex color
- `percentDone` (number, optional) - New completion percentage (0-1)
- `projectId` (number, optional) - Move task to a different project
- `isFavorite` (boolean, optional) - Mark as favorite

**Returns:** Updated task object

#### `tasks_delete`
Delete a task.

**Parameters:**
- `taskId` (number, required) - The task ID to delete

**Returns:** Success confirmation message

---

### Label Tools

#### `labels_list`
List all labels the user has access to.

**Parameters:**
- `page` (number, optional) - Page number for pagination
- `perPage` (number, optional) - Number of items per page
- `search` (string, optional) - Search labels by title

**Returns:** Array of labels with pagination info

#### `labels_create`
Create a new label.

**Parameters:**
- `title` (string, required) - Label title
- `description` (string, optional) - Label description
- `color` (string, optional) - Hex color (e.g., 'ff0000')

**Returns:** Created label object

#### `labels_delete`
Delete a label.

**Parameters:**
- `labelId` (number, required) - The label ID to delete

**Returns:** Success confirmation message

#### `task_labels_add`
Add a label to a task.

**Parameters:**
- `taskId` (number, required) - The task ID
- `labelId` (number, required) - The label ID to add

**Returns:** Label object

#### `task_labels_remove`
Remove a label from a task.

**Parameters:**
- `taskId` (number, required) - The task ID
- `labelId` (number, required) - The label ID to remove

**Returns:** Success confirmation message

---

### Comment Tools

#### `task_comments_list`
List all comments on a task.

**Parameters:**
- `taskId` (number, required) - The task ID

**Returns:** Array of comment objects

#### `task_comments_add`
Add a comment to a task.

**Parameters:**
- `taskId` (number, required) - The task ID
- `comment` (string, required) - The comment text

**Returns:** Created comment object

---

### Assignee Tools

#### `task_assignees_list`
List all assignees on a task.

**Parameters:**
- `taskId` (number, required) - The task ID

**Returns:** Array of user objects

#### `task_assignees_add`
Add an assignee to a task.

**Parameters:**
- `taskId` (number, required) - The task ID
- `userId` (number, required) - The user ID to assign

**Returns:** User object

#### `task_assignees_remove`
Remove an assignee from a task.

**Parameters:**
- `taskId` (number, required) - The task ID
- `userId` (number, required) - The user ID to remove

**Returns:** Success confirmation message

---

### Task Relation Tools

#### `task_relations_add`
Create a relation between two tasks.

**Parameters:**
- `taskId` (number, required) - The source task ID
- `otherTaskId` (number, required) - The target task ID
- `relationKind` (string, required) - Relation type: `subtask`, `parenttask`, `related`, `duplicateof`, `duplicates`, `blocking`, `blocked`, `precedes`, `follows`, `copiedfrom`, `copiedto`

**Returns:** Task relation object

#### `task_relations_remove`
Remove a relation between two tasks.

**Parameters:**
- `taskId` (number, required) - The source task ID
- `otherTaskId` (number, required) - The target task ID
- `relationKind` (string, required) - Relation type to remove

**Returns:** Success confirmation message

---

### Project View Tools

#### `project_views_list`
List all views for a project.

**Parameters:**
- `projectId` (number, required) - The project ID

**Returns:** Array of project view objects

---

### Bucket (Kanban) Tools

#### `buckets_list`
List all kanban buckets for a project view.

**Parameters:**
- `projectId` (number, required) - The project ID
- `viewId` (number, required) - The project view ID (must be a kanban view)

**Returns:** Array of bucket objects

#### `buckets_create`
Create a new kanban bucket.

**Parameters:**
- `projectId` (number, required) - The project ID
- `viewId` (number, required) - The project view ID (must be a kanban view)
- `title` (string, required) - Bucket title
- `limit` (number, optional) - Max tasks in bucket (0 = unlimited)

**Returns:** Created bucket object

#### `buckets_delete`
Delete a kanban bucket.

**Parameters:**
- `projectId` (number, required) - The project ID
- `viewId` (number, required) - The project view ID
- `bucketId` (number, required) - The bucket ID to delete

**Returns:** Success confirmation message

#### `task_move_to_bucket`
Move a task to a different kanban bucket.

**Parameters:**
- `projectId` (number, required) - The project ID
- `viewId` (number, required) - The project view ID
- `bucketId` (number, required) - The target bucket ID
- `taskId` (number, required) - The task ID to move
- `position` (number, optional) - Position within the bucket

**Returns:** Updated task object

---

### Team Tools

#### `teams_list`
List all teams the user belongs to.

**Parameters:**
- `page` (number, optional) - Page number for pagination
- `perPage` (number, optional) - Number of items per page
- `search` (string, optional) - Search teams by name

**Returns:** Array of team objects with pagination info

---

### User Tools

#### `users_search`
Search for users by username, name, or email.

**Parameters:**
- `search` (string, required) - Search term

**Returns:** Array of user objects

---

### Notification Tools

#### `notifications_list`
List all notifications for the current user.

**Parameters:**
- `page` (number, optional) - Page number for pagination
- `perPage` (number, optional) - Number of items per page

**Returns:** Array of notification objects with pagination info

---

## Development

### Running from Source

1. Clone the repository
2. Install dependencies: `npm install`
3. Set environment variables:
   ```bash
   export VIKUNJA_URL=https://try.vikunja.io
   export VIKUNJA_API_TOKEN=your_token_here
   ```
4. Run the development server:
   ```bash
   npm start
   ```

### Testing with MCP Inspector

The MCP Inspector is a useful tool for testing and debugging your MCP server:

```bash
npm run inspect
```

This will start the server with the MCP Inspector, allowing you to interact with the tools directly in a web interface.

### Project Structure

```
vikunja-mcp-server/
├── src/
│   ├── index.ts           # Main server implementation
│   ├── vikunja-client.ts  # Vikunja API client
│   └── types.ts           # TypeScript type definitions
├── package.json
├── tsconfig.json
└── README.md
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes and commit them with clear, descriptive messages
4. Push to your fork and submit a pull request

### Development Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting a PR

### Reporting Issues

If you encounter any bugs or have feature requests, please [open an issue](https://github.com/yourusername/vikunja-mcp-server/issues) with:

- A clear description of the problem or feature
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Your environment details (OS, Node version, Vikunja version)

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- Integrates with [Vikunja](https://vikunja.io), the open-source task management system
- Inspired by the growing ecosystem of MCP servers

## Support

- **Documentation**: [Vikunja API Docs](https://vikunja.io/docs/api-overview/)
- **MCP Documentation**: [Model Context Protocol](https://modelcontextprotocol.io)
- **Issues**: [GitHub Issues](https://github.com/yourusername/vikunja-mcp-server/issues)

## Roadmap

Future enhancements being considered:

- [ ] Support for file attachments on tasks
- [ ] Advanced filtering and search capabilities
- [ ] Webhook support for real-time updates
- [ ] Bulk operations for tasks and projects
- [ ] Custom field support
- [ ] Recurring task management
- [ ] Time tracking integration

---

Made with ❤️ for the Vikunja and MCP communities
