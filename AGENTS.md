# Agent Memory Extension - Architecture Guide

## What This Extension Does
VS Code extension that provides a persistent memory system for AI agents through the Language Model Tools API. Agents can store and retrieve information across conversations using file-based operations, all scoped to `/memories` directory with security protections.

## Core Architecture

### Memory Tool (`tools.ts`)
Single comprehensive tool registered as `memory` supporting 6 commands:
- **view**: Read files/directories (with optional line ranges)
- **create**: Create/overwrite files
- **str_replace**: Replace text in files
- **insert**: Insert text at specific line
- **delete**: Remove files/directories
- **rename**: Move/rename files

Tool registration: `vscode.lm.registerTool()` + declaration in `package.json` under `contributes.languageModelTools`

### Core Components
- **MemoryTool** (`tools.ts`): Main tool implementation supporting 6 commands (view, create, str_replace, insert, delete, rename)
- **Storage Layer** (`storage.ts`): Abstracted storage interface with three backends:
  - `InMemoryStorage`: Ephemeral storage using VS Code's `memfs://` scheme (workspace-scoped)
  - `DiskMemoryStorage`: Persistent storage in `.vscode/memory` directory
  - `SecretMemoryStorage`: Encrypted storage via VS Code Secret Storage API
- **Activity Logger** (`activityLogger.ts`): Tracks all memory operations with metadata and timestamps
- **AGENTS.md Sync** (`agentsMdSync.ts`): Auto-syncs memory files to workspace AGENTS.md file when enabled
- **Tree View Providers** (`views.ts`): Real-time UI for memory files and activity logs
- **Path Validation** (`lib/pathValidation.ts`): Security layer preventing directory traversal attacks
- **Text Utils** (`lib/utils.ts`): Text manipulation utilities for string replacement and insertion

### Storage Backends (`storage.ts`)
Abstracted `IMemoryStorage` interface with three implementations:
- **InMemoryStorage**: Ephemeral Map-based storage (workspace-scoped)
- **DiskMemoryStorage**: Persistent storage in `.vscode/memory/`
- **SecretMemoryStorage**: Encrypted storage via VS Code Secret Storage API (uses `keys()` method from VS Code 1.100+)

### Supporting Components
- **PinManager** (`pinManager.ts`): Persists pinned files using Memento API
- **ActivityLogger** (`activityLogger.ts`): Tracks all operations with timestamps
- **Views** (`views.ts`): Tree views for files and activity log
- **Path Validation** (`lib/pathValidation.ts`): Prevents directory traversal attacks

### Testing Strategy
- **Unit Tests**: Comprehensive test coverage in `src/__tests__/` and `src/lib/__tests__/`
- **Test Files**:
  - `storage.test.ts`: Tests for both InMemory and Disk storage backends
  - `secretStorage.test.ts`: Secret storage with mocks
  - `activityLogger.test.ts`: Activity logging functionality
  - `agentsMdSync.test.ts`: AGENTS.md auto-sync functionality
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
- **Storage Backends**: `storage.ts` - InMemory, Disk, and Secret storage implementations
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

## Key Development Commands
```bash
npm run watch           # Incremental compilation
npm test               # Run Jest tests
npm run test:watch     # Continuous testing
npm run test:coverage  # Generate coverage reports
```

## TypeScript Conventions
- **Module System**: Node16 (use `.js` extensions in imports)
- **Naming**:
  - Tools: Simple descriptive names (e.g., `memory`)
  - Interfaces: `I` prefix (e.g., `IMemoryStorage`)
  - Commands: Namespace with `agentMemory.*`
- **Variables**: CAPITALIZE all variable names (per instruction.instructions.md)

## Security Model
All paths validated via `validateMemoryPath()`:
- Operations restricted to `/memories` directory
- Path normalization prevents `../` attacks
- No absolute paths allowed outside scope

## Testing
Comprehensive Jest test suite in `src/__tests__/`:
- `storage.test.ts` - InMemory and Disk backends
- `secretStorage.test.ts` - Secret storage with mocks
- `pinManager.test.ts` - PIN functionality
- `activityLogger.test.ts` - Operation logging
- `lib/__tests__/` - Path validation and utilities

## Extension Points

### Adding New Commands
1. Add command to `MemoryTool.invoke()` switch statement in `tools.ts`
2. Update `inputSchema` in tool registration
3. Add tests for new command

### Adding UI Features
Register commands in `extension.ts` + declare in `package.json`:
- `contributes.commands` - Command definitions
- `contributes.menus` - Context menu items
- `contributes.views` - Tree view containers

### AGENTS.md Auto-Sync
The `AgentsMdSyncManager` class provides automatic synchronization of memory files to the workspace's AGENTS.md file:

**Configuration:**
- Controlled by `agentMemory.autoSyncToAgentsMd` setting (default: `false`)
- Config updates are detected via `onDidChangeConfiguration` event

**Format:**
- Memory section wrapped in `<memories hint="Manage via memory tool">...</memories>` tags
- Each file wrapped in `<memory path="/memories/...">...</memory>` tags
- Existing memory sections are replaced, other AGENTS.md content is preserved
- Empty memory shows `(No memory files yet)` placeholder

**Trigger Points:**
- After successful `create`, `str_replace`, `insert`, `delete`, `rename` operations
- After batch operations (`clearAllMemoryFiles`, `deleteMemoryFile`)
- Sync failures are logged but don't break memory operations

**Implementation Notes:**
- Uses `storage.listFiles()` to get all memory files
- Reads file content via `storage.readRaw()` (without line numbers)
- Escapes `</memory>` tags in content to prevent XML parsing issues
- Creates AGENTS.md if it doesn't exist

## Dependencies
- **Engine**: VS Code ^1.105.0 (for Tool APIs + Secret Storage `keys()`)
- **Runtime**: None (pure VS Code extension)
- **Dev**: TypeScript 5.9, Jest 30, ESLint 9

---
**CRITICAL**: This is living documentation. Update when architecture changes.
