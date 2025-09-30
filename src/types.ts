/**
 * Types and interfaces for Claude's memory tool implementation
 */

/**
 * Base interface for memory command parameters
 */
export interface IMemoryCommandBase {
	command: 'view' | 'create' | 'str_replace' | 'insert' | 'delete' | 'rename';
}

/**
 * View command - shows directory contents or file contents with optional line ranges
 */
export interface IMemoryViewCommand extends IMemoryCommandBase {
	command: 'view';
	path: string;
	view_range?: [number, number]; // Optional: view specific lines
}

/**
 * Create command - create or overwrite a file
 */
export interface IMemoryCreateCommand extends IMemoryCommandBase {
	command: 'create';
	path: string;
	file_text: string;
}

/**
 * String replace command - replace text in a file
 */
export interface IMemoryStrReplaceCommand extends IMemoryCommandBase {
	command: 'str_replace';
	path: string;
	old_str: string;
	new_str: string;
}

/**
 * Insert command - insert text at a specific line
 */
export interface IMemoryInsertCommand extends IMemoryCommandBase {
	command: 'insert';
	path: string;
	insert_line: number;
	insert_text: string;
}

/**
 * Delete command - delete a file or directory
 */
export interface IMemoryDeleteCommand extends IMemoryCommandBase {
	command: 'delete';
	path: string;
}

/**
 * Rename command - rename or move a file/directory
 */
export interface IMemoryRenameCommand extends IMemoryCommandBase {
	command: 'rename';
	old_path: string;
	new_path: string;
}

/**
 * Union type of all memory command parameters
 */
export type IMemoryParameters =
	| IMemoryViewCommand
	| IMemoryCreateCommand
	| IMemoryStrReplaceCommand
	| IMemoryInsertCommand
	| IMemoryDeleteCommand
	| IMemoryRenameCommand;

/**
 * File metadata for tree view display
 */
export interface IMemoryFileInfo {
	path: string;
	name: string;
	isDirectory: boolean;
	size: number;
	lastAccessed: Date;
	lastModified: Date;
	isPinned?: boolean;
}

/**
 * Activity log entry for memory operations
 */
export interface IMemoryActivityLog {
	timestamp: Date;
	command: string;
	path: string;
	details?: string;
	success: boolean;
}

/**
 * PIN manager interface for persisting PIN states
 */
export interface IPinManager {
	/**
	 * Check if a file is pinned
	 */
	isPinned(path: string): Promise<boolean>;

	/**
	 * Pin a file to persist it
	 */
	pinFile(path: string): Promise<void>;

	/**
	 * Unpin a file
	 */
	unpinFile(path: string): Promise<void>;

	/**
	 * Get all pinned file paths
	 */
	getPinnedFiles(): Promise<string[]>;

	/**
	 * Get the workspace ID this PIN manager is for
	 */
	getWorkspaceId(): string;

	/**
	 * Update the PIN state when a file is renamed
	 */
	updatePinnedPath(oldPath: string, newPath: string): Promise<void>;

	/**
	 * Clean up PIN state when a file is deleted
	 */
	removePinnedPath(path: string): Promise<void>;
}

/**
 * Storage backend interface
 */
export interface IMemoryStorage {
	/**
	 * View directory contents or file contents (with line numbers for AI)
	 */
	view(path: string, viewRange?: [number, number]): Promise<string>;

	/**
	 * Read raw file content without line numbers (for editor display)
	 */
	readRaw(path: string): Promise<string>;

	/**
	 * Create or overwrite a file
	 */
	create(path: string, content: string): Promise<void>;

	/**
	 * Replace text in a file
	 */
	strReplace(path: string, oldStr: string, newStr: string): Promise<void>;

	/**
	 * Insert text at a specific line
	 */
	insert(path: string, insertLine: number, insertText: string): Promise<void>;

	/**
	 * Delete a file or directory
	 * @returns A message indicating what was deleted (e.g., "File deleted: /memories/file.txt")
	 */
	delete(path: string): Promise<string>;

	/**
	 * Rename or move a file/directory
	 */
	rename(oldPath: string, newPath: string): Promise<void>;

	/**
	 * List all memory files with metadata
	 */
	listFiles(): Promise<IMemoryFileInfo[]>;

	/**
	 * Get workspace identifier
	 */
	getWorkspaceId(): string;

	/**
	 * Set PIN manager for this storage instance
	 */
	setPinManager(pinManager: IPinManager): void;
}
