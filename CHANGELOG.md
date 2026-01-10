# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-10

### Added
- Initial release of Vikunja MCP Server
- Project management capabilities
  - List all projects with pagination and search
  - Get individual project details
  - Create new projects with customization options
  - Update existing projects
  - Delete projects
- Task management with comprehensive features
  - List tasks with filtering and sorting capabilities
  - Get detailed task information
  - Create tasks with full customization (due dates, priority, assignees, labels)
  - Update existing tasks
  - Delete tasks
- Label management system
  - List all available labels
  - Create custom labels with colors
  - Delete labels
  - Add labels to tasks
  - Remove labels from tasks
- Task comments functionality
  - List all comments on a task
  - Add comments to tasks
- Task assignees management
  - List task assignees
  - Add assignees to tasks
  - Remove assignees from tasks
- Task relations support
  - Multiple relation types: subtasks, parent tasks, related, duplicate, blocking, dependencies, and more
  - Add relations between tasks
  - Remove relations between tasks
- Project views
  - List all views for a project
- Kanban board functionality
  - List kanban buckets
  - Create new buckets
  - Delete buckets
  - Move tasks between buckets
- Team management
  - List all teams with search capabilities
- User search functionality
  - Search users by username, name, or email
- Notifications system
  - List all user notifications with pagination
- Full MCP (Model Context Protocol) protocol support
- TypeScript implementation for type safety and developer experience

[1.0.0]: https://github.com/yourusername/vikunja-mcp-server/releases/tag/v1.0.0
