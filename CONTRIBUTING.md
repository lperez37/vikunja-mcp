# Contributing to Vikunja-MCP

Thanks for your interest in contributing!

## Development Setup

```bash
# Clone the repo
$ git clone https://github.com/0xK3vin/vikunja-mcp.git
$ cd vikunja-mcp

# Install dependencies
$ npm install

# Set up environment
$ cp .env.example .env
# Edit .env with your Vikunja credentials

# Run tests
$ npm test

# Build
$ npm run build
```

## Code Style

This project uses:
- **ESLint** for linting
- **Prettier** for formatting
- **Husky** + **lint-staged** for pre-commit hooks

The pre-commit hook automatically runs linting and formatting on staged files.

```bash
# Manual lint check
$ npm run lint

# Auto-fix lint issues
$ npm run lint:fix

# Format code
$ npm run format
```

## Testing

```bash
# Run tests once
$ npm run test:run

# Run tests in watch mode
$ npm test

# Run tests with coverage
$ npm run test:coverage
```

Coverage thresholds are enforced at 80% for statements, branches, functions, and lines.

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** for your feature: `git checkout -b feature/your-feature`
3. **Make changes** and add tests if applicable
4. **Run tests**: `npm test`
5. **Commit** with a clear message
6. **Push** to your fork
7. **Open a Pull Request**

### Commit Messages

Use clear, descriptive commit messages:

```
Add retry logic to API client

- Implement exponential backoff
- Handle 5xx and 429 errors
- Add tests for retry scenarios
```

## Reporting Issues

When opening an issue, please include:

- **Description** of the problem or feature request
- **Steps to reproduce** (for bugs)
- **Expected vs actual behavior**
- **Environment**: OS, Node version, Vikunja version

## Project Structure

```
vikunja-mcp/
├── src/
│   ├── index.ts           # MCP server + tool handlers
│   ├── vikunja-client.ts  # API client with retry logic
│   └── types.ts           # TypeScript types
├── tests/
│   ├── vikunja-client.test.ts
│   ├── tools.test.ts
│   └── setup.test.ts
├── docs/
│   └── API.md             # Full API reference
└── skills/
    └── vikunja-tasks.md   # AI task management skill
```

## Questions?

Open an issue or reach out via GitHub.
