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

## File Organization
```
src/
├── extension.ts          # Activation & command registration
├── tools.ts             # Memory tool implementation
├── storage.ts           # Storage backends
├── pinManager.ts        # PIN state management
├── activityLogger.ts    # Operation tracking
├── views.ts             # UI tree providers
├── types.ts             # TypeScript interfaces
└── lib/
    ├── pathValidation.ts  # Security validation
    └── utils.ts          # Text utilities
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

## Dependencies
- **Engine**: VS Code ^1.105.0 (for Tool APIs + Secret Storage `keys()`)
- **Runtime**: None (pure VS Code extension)
- **Dev**: TypeScript 5.9, Jest 30, ESLint 9

---
**CRITICAL**: This is living documentation. Update when architecture changes.
