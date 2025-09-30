# VS Code Language Model Tools Development Guide

## Project Overview
This is a VS Code extension (`agent-memory`) that implements Claude's memory tool for Language Model agents. The extension provides a single comprehensive tool (`memory`) that enables AI agents to store and retrieve information across conversations through a persistent memory file system. All memory operations are scoped to the `/memories` directory with path traversal protection for security.

## Architecture

### Tool Registration System
- **Tool Registration**: Tools are registered via `vscode.lm.registerTool()` in `tools.ts` and declared in `package.json` under `contributes.languageModelTools`
- **Tool Schema**: Each tool requires `inputSchema` (JSON Schema), `modelDescription`, and optional `tags` for filtering
- **Tool Discovery**: Chat participants discover tools via `vscode.lm.tools` API and can filter by tags
- **Tool Invocation**: Tools are invoked by chat participants when the LLM requests them during conversation

### Core Components
- **MemoryTool** (`tools.ts`): Main tool implementation supporting 6 commands (view, create, str_replace, insert, delete, rename)
- **Storage Layer** (`storage.ts`): Abstracted storage interface with two backends:
  - `InMemoryStorage`: Ephemeral storage using VS Code's `memfs://` scheme (workspace-scoped)
  - `DiskMemoryStorage`: Persistent storage in `.vscode/memory` directory
- **Activity Logger** (`activityLogger.ts`): Tracks all memory operations with metadata and timestamps
- **Tree View Providers** (`views.ts`): Real-time UI for memory files and activity logs
- **Path Validation** (`lib/pathValidation.ts`): Security layer preventing directory traversal attacks
- **Text Utils** (`lib/utils.ts`): Text manipulation utilities for string replacement and insertion

## Key Developer Workflows

### Build & Run
- **Watch mode**: `npm run watch` (compiles TypeScript incrementally)
- **Debug**: Use "Run Extension" launch config - auto-starts watch task and opens Extension Development Host
- **Test**: `npm test` (Jest test suite with coverage support)
- **Test Watch**: `npm run test:watch` (continuous testing during development)
- **Coverage**: `npm run test:coverage` (generates coverage reports in `coverage/` directory)

### Testing Strategy
- **Unit Tests**: Comprehensive test coverage in `src/__tests__/` and `src/lib/__tests__/`
- **Test Files**:
  - `storage.test.ts`: Tests for both InMemory and Disk storage backends
  - `activityLogger.test.ts`: Activity logging functionality
  - `pathValidation.test.ts`: Path security and validation
  - `utils.test.ts`: Text manipulation utilities
- **Mocking**: Mock storage implementation in `mockStorage.ts` for testing
- **Configuration**: Jest with TypeScript support (`jest.config.js`, `ts-jest`)

### Adding a New Tool
1. Create tool class implementing `vscode.LanguageModelTool<TParams>` in `tools.ts`
2. Implement `invoke()` (required) and `prepareInvocation()` (optional, for confirmation UX)
3. Register in `registerMemoryTool()` via `vscode.lm.registerTool(name, instance)`
4. Declare in `package.json` under `contributes.languageModelTools` with schema and metadata
5. Tools are auto-discovered by participants using `vscode.lm.tools` API

### Adding UI Components
1. **Tree Views**: Registered in `package.json` under `contributes.views.explorer`
   - `agentMemory.files`: Memory files tree view
   - `agentMemory.activityLog`: Activity log tree view
2. **Commands**: Register in `extension.ts` and declare in `package.json` under `contributes.commands`
3. **Configuration**: Add settings in `package.json` under `contributes.configuration`

### CI/CD Workflows
- **Build & Test** (`build-test.yml`): Reusable workflow for running tests and compilation
- **Build & Release** (`build-release.yml`): Automatically builds and creates GitHub releases on every push to main
  - Generates build version (e.g., `0.1.0-build.2+768e41f`)
  - Creates VSIX package
  - Creates GitHub Release with VSIX as pre-release
  - Uploads VSIX as workflow artifact (30 days retention)
- **Publish Pre-release** (`publish-prerelease.yml`): Publishes pre-release to VS Code Marketplace on push to main
- **Publish** (`publish.yml`): Publishes stable release to VS Code Marketplace on version tags (e.g., `v1.0.0`)

## Project-Specific Conventions

### TypeScript Configuration
- **Module system**: `Node16` (use `.js` extensions in imports for local files)
- **Target**: ES2024 for modern JavaScript features
- **Strict Mode**: Enabled for type safety

### File Organization
- **Main Extension**: `extension.ts` - Activation, registration, and command setup
- **Tool Implementation**: `tools.ts` - Memory tool class and registration
- **Storage Backends**: `storage.ts` - InMemory and Disk storage implementations
- **Types**: `types.ts` - TypeScript interfaces and type definitions
- **UI Components**: `views.ts` - Tree view providers for files and activity logs
- **Utilities**: `lib/` directory
  - `pathValidation.ts`: Path security and validation
  - `utils.ts`: Text manipulation utilities (replaceFirst, insertAtLine)
- **Tests**: `__tests__/` directories alongside source files

### Naming Patterns
- Tool names: `{extensionId}_{toolName}` (e.g., `agent-memory_memory`)
- Unused parameters: Prefix with `_` to satisfy linter
- Interfaces: Prefix with `I` (e.g., `IMemoryStorage`, `IMemoryParameters`)
- Commands: Namespace with extension name (e.g., `agentMemory.refresh`)

### Security Considerations
- **Path Validation**: All paths validated through `validateMemoryPath()` to prevent directory traversal
- **Scoped Operations**: All file operations restricted to `/memories` directory
- **Path Normalization**: Paths normalized to prevent `../` and absolute path attacks

### Error Handling
- Always catch `vscode.LanguageModelError` - includes `code`, `message`, `cause`
- Check for specific error causes like `'off_topic'` in `.cause.message`
- Storage errors: Handle `FileSystemError` with specific error codes (e.g., `FileNotFound`)
- In-memory storage: Special handling for "No file system provider" errors when files don't exist
- All errors logged to activity logger with success=false flag
- User-friendly error messages returned via `LanguageModelToolResult`

## Memory Tool Commands

### View Command
Read directory contents or file contents with optional line ranges.
```json
{
  "command": "view",
  "path": "/memories/notes.txt",
  "view_range": [1, 10]  // Optional
}
```

### Create Command
Create or overwrite a file with content.
```json
{
  "command": "create",
  "path": "/memories/notes.txt",
  "file_text": "Content here"
}
```

### String Replace Command
Replace the first occurrence of old_str with new_str in a file.
```json
{
  "command": "str_replace",
  "path": "/memories/file.txt",
  "old_str": "old text",
  "new_str": "new text"
}
```

### Insert Command
Insert text at a specific line number (1-indexed).
```json
{
  "command": "insert",
  "path": "/memories/file.txt",
  "insert_line": 5,
  "insert_text": "New line text"
}
```

### Delete Command
Delete a file or directory (recursive).
```json
{
  "command": "delete",
  "path": "/memories/file.txt"
}
```

### Rename Command
Rename or move a file/directory.
```json
{
  "command": "rename",
  "old_path": "/memories/old.txt",
  "new_path": "/memories/new.txt"
}
```

## Integration Points

### Tool Invocation Token
- `request.toolInvocationToken` required for user confirmation flow
- Pass through to `vscode.lm.invokeTool()` to enable `prepareInvocation()` confirmations

### Extensions & Dependencies
- Engine requirement: `^1.100.0` for latest Tool APIs

## Testing Notes
- **Tool filtering**: Tools can be filtered by tags using `vscode.lm.tools.filter(tool => tool.tags.includes('tag-name'))`
- **Tool references**: Chat participants can force specific tool invocation using `request.toolReferences`


**CRITICAL**: Treat as living documentation and UPDATE as needed when APIs or patterns change.
