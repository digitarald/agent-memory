# Agent Memory

A VS Code extension that implements Claude's memory tool for Language Model agents. This extension enables AI agents to store and retrieve information across conversations through a persistent memory file system.

## Features

### Memory Tool

The extension provides a `memory` tool that AI agents (like GitHub Copilot) can use to:

- **View**: Read directory contents or file contents with optional line ranges
- **Create**: Create or overwrite files in the memory directory
- **String Replace**: Replace specific text within files
- **Insert**: Insert text at specific line numbers
- **Delete**: Remove files or directories
- **Rename**: Rename or move files and directories

All operations are scoped to the `/memories` directory with path traversal protection for security.

### Storage Backends

Choose between three storage options via settings (`agentMemory.storageBackend`):

1. **In-Memory (default)**: Ephemeral storage per workspace, cleared when VS Code closes
2. **Disk**: Persistent storage in `.vscode/memory` directory within your workspace
3. **Secret**: Encrypted persistent storage using VS Code's Secret Storage API - ideal for sensitive information

### Visual Interface

#### Memory Files View
- Tree view showing all memory files and directories
- Display file size and last access time
- Click to open and view file contents
- **Pin/Unpin Files**: Pin important files to keep them at the top of the tree view
- Automatic refresh when memory operations occur
- Context menu actions: pin/unpin, delete, save as markdown

#### Activity Log View
- Real-time log of all memory operations
- Shows command type, path, timestamp, and success/failure
- Clear logs with one click
- Visual indicators for successful vs failed operations

### AGENTS.md Auto-Sync

When enabled via the `agentMemory.autoSyncToAgentsMd` setting, the extension automatically synchronizes all memory files to your workspace's `AGENTS.md` file. This provides a centralized, readable view of all agent memory in a format that's easy to review and version control.

**Features:**
- Memory content is wrapped in `<memory hint="Manage via memory tool">...</memory>` tags
- Each file is enclosed in `<file path="/memories/...">...</file>` tags
- Automatically updates when memory files are created, modified, or deleted
- Preserves existing AGENTS.md content outside the memory section
- If no AGENTS.md exists, one will be created automatically

**Example AGENTS.md output:**
```markdown
# My Project Documentation

<memory hint="Manage via memory tool">
<file path="/memories/preferences.txt">
- Prefers TypeScript for new projects
- Uses ESLint for code quality
</file>

<file path="/memories/context.txt">
Project is a VS Code extension for AI agent memory management.
</file>
</memory>
```

## Usage

### For AI Agents

The memory tool is automatically available to AI agents in your workspace. Agents can reference it using the tool name `memory` or via the `#memory` tool reference.

Example agent interaction:
```
User: "Remember that I prefer using TypeScript for new projects"

Agent: I'll store that preference in memory.
[calls memory tool with command: "create", path: "/memories/preferences.txt", file_text: "- Prefers TypeScript for new projects"]
```

### Commands

- **Agent Memory: Refresh Memory Files** - Manually refresh the memory files view
- **Agent Memory: Clear Activity Logs** - Clear the activity log
- **Agent Memory: Clear All Memory Files** - Delete all memory files and directories
- **Agent Memory: Delete Memory File** - Delete a specific memory file (available in context menu)
- **Agent Memory: Open Memory File** - Open a memory file for viewing
- **Agent Memory: Pin File** - Pin a file to keep it at the top of the tree view
- **Agent Memory: Unpin File** - Remove pin from a file
- **Agent Memory: Save as Markdown** - Export a memory file as a markdown document

### Settings

- `agentMemory.storageBackend`: Choose between `memory` (default), `disk`, or `secret` storage
- `agentMemory.autoSyncToAgentsMd`: Automatically sync all memory files to the workspace's AGENTS.md file as memory changes (default: `false`)

## Memory Tool API

### View Command
```json
{
  "command": "view",
  "path": "/memories",
  "view_range": [1, 10]  // Optional
}
```

### Create Command
```json
{
  "command": "create",
  "path": "/memories/notes.txt",
  "file_text": "Content here"
}
```

### String Replace Command
```json
{
  "command": "str_replace",
  "path": "/memories/file.txt",
  "old_str": "old text",
  "new_str": "new text"
}
```

### Insert Command
```json
{
  "command": "insert",
  "path": "/memories/file.txt",
  "insert_line": 5,
  "insert_text": "New line text"
}
```

### Delete Command
```json
{
  "command": "delete",
  "path": "/memories/file.txt"
}
```

### Rename Command
```json
{
  "command": "rename",
  "old_path": "/memories/old.txt",
  "new_path": "/memories/new.txt"
}
```

## Security

- All paths are validated to prevent directory traversal attacks
- Memory operations are restricted to the `/memories` directory only
- Path normalization prevents access outside the memory directory

### Secret Storage Backend

The secret storage backend uses VS Code's built-in Secret Storage API, which:
- Encrypts memory files using the platform's secure credential storage (Keychain on macOS, Credential Vault on Windows, Secret Service on Linux)
- Stores file metadata separately for efficient listing operations
- Provides workspace-scoped secrets that persist across VS Code sessions
- Ideal for storing sensitive information like API keys, tokens, or personal notes

## Running the Extension

- Run `npm install` in terminal to install dependencies
- Run the `Run Extension` target in the Debug View. This will:
	- Start a task `npm: watch` to compile the code
	- Run the extension in a new VS Code window
	- The memory tool will be registered and available to any chat participant

## Architecture

- **Storage Layer**: Abstracted storage interface supporting multiple backends (in-memory, disk, and secret)
- **Activity Logger**: Tracks all memory operations with metadata
- **Tree Providers**: Real-time UI updates for files and activity logs
- **Tool Integration**: Native VS Code Language Model Tool API

See [tools.ts](src/tools.ts) for the memory tool implementation, [storage.ts](src/storage.ts) for storage backends, and [views.ts](src/views.ts) for the UI components.

## Requirements

- VS Code 1.105.0 or higher
- A workspace folder must be open to use memory features

## Credits

Based on Claude's memory tool specification from Anthropic and the VS Code Language Model Tools API.

## License

MIT
