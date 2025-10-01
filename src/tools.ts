import * as vscode from 'vscode';
import { IMemoryParameters, IMemoryStorage } from './types.js';
import { InMemoryStorage, DiskMemoryStorage, SecretMemoryStorage } from './storage.js';
import { MemoryActivityLogger } from './activityLogger.js';
import { PinManager } from './pinManager.js';

/**
 * Gets the configured storage backend for a workspace
 */
function getStorageBackend(_workspaceFolder: vscode.WorkspaceFolder): 'memory' | 'disk' | 'secret' {
	const config = vscode.workspace.getConfiguration('agentMemory');
	return config.get<'memory' | 'disk' | 'secret'>('storageBackend', 'memory');
}

/**
 * Removes the /memories/ prefix from a path for cleaner display
 */
function cleanPath(path: string): string {
	return path.replace(/^\/memories\//, '');
}

/**
 * Memory Tool - Implements Claude's memory tool commands
 */
export class MemoryTool implements vscode.LanguageModelTool<IMemoryParameters> {
	private storageMap = new Map<string, IMemoryStorage>();
	private pinManagerMap = new Map<string, PinManager>();
	private activityLogger: MemoryActivityLogger;
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext, activityLogger: MemoryActivityLogger) {
		this.context = context;
		this.activityLogger = activityLogger;
	}

	private getStorage(workspaceFolder: vscode.WorkspaceFolder): IMemoryStorage {
		const workspaceId = workspaceFolder.uri.toString();

		if (!this.storageMap.has(workspaceId)) {
			const backend = getStorageBackend(workspaceFolder);
			let storage: IMemoryStorage;

			if (backend === 'disk') {
				storage = new DiskMemoryStorage(workspaceFolder);
			} else if (backend === 'secret') {
				storage = new SecretMemoryStorage(this.context, workspaceFolder);
			} else {
				storage = new InMemoryStorage(workspaceFolder);
			}

			// Create and associate PIN manager
			const pinManager = new PinManager(this.context, workspaceFolder, false); // workspace-scoped by default
			storage.setPinManager(pinManager);

			this.storageMap.set(workspaceId, storage);
			this.pinManagerMap.set(workspaceId, pinManager);
		}

		return this.storageMap.get(workspaceId)!;
	}

	/**
	 * Get PIN manager for a specific workspace
	 */
	getPinManagerForWorkspace(workspaceFolder: vscode.WorkspaceFolder): PinManager {
		const workspaceId = workspaceFolder.uri.toString();
		this.getStorage(workspaceFolder); // Ensure storage and PIN manager are initialized
		return this.pinManagerMap.get(workspaceId)!;
	}

	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<IMemoryParameters>,
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelToolResult> {
		const params = options.input;

		// Get the workspace folder from context
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			const errorMsg = 'No workspace folder is open. Memory tool requires an open workspace.';
			this.activityLogger.log(params.command, '', false, errorMsg);
			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(errorMsg)
			]);
		}

		// Use the first workspace folder (could be enhanced to support multi-root)
		const workspaceFolder = workspaceFolders[0];
		const storage = this.getStorage(workspaceFolder);

		try {
			let result: string;

			switch (params.command) {
				case 'view': {
					result = await storage.view(params.path, params.view_range);
					this.activityLogger.log('view', params.path, true);
					break;
				}

			case 'create': {
				await storage.create(params.path, params.file_text);
				result = `File created successfully: ${cleanPath(params.path)}`;
				this.activityLogger.log('create', params.path, true, `Size: ${params.file_text.length} bytes`);
				break;
			}

			case 'str_replace': {
				await storage.strReplace(params.path, params.old_str, params.new_str);
				result = `String replaced successfully in ${cleanPath(params.path)}`;
				this.activityLogger.log('str_replace', params.path, true);
				break;
			}

			case 'insert': {
				await storage.insert(params.path, params.insert_line, params.insert_text);
				result = `Text inserted successfully at line ${params.insert_line} in ${cleanPath(params.path)}`;
				this.activityLogger.log('insert', params.path, true, `Line: ${params.insert_line}`);
				break;
			}

			case 'delete': {
				result = await storage.delete(params.path);
				this.activityLogger.log('delete', params.path, true);
				break;
			}

			case 'rename': {
				await storage.rename(params.old_path, params.new_path);
				result = `Renamed successfully: ${cleanPath(params.old_path)} → ${cleanPath(params.new_path)}`;
				this.activityLogger.log('rename', params.old_path, true, `New path: ${params.new_path}`);
				break;
			}

			default: {
					const errorMsg = `Unknown command: ${(params as { command: string }).command}`;
					this.activityLogger.log('unknown', '', false, errorMsg);
					return new vscode.LanguageModelToolResult([
						new vscode.LanguageModelTextPart(errorMsg)
					]);
				}
			}

			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(result)
			]);

		} catch (error) {
			let errorMsg = error instanceof Error ? error.message : String(error);
			const path = 'path' in params ? params.path : ('old_path' in params ? params.old_path : '');

			// Add context-specific guidance for common error patterns
			if (errorMsg.includes('Invalid line number')) {
				errorMsg += '\n\nTip: Line numbers start at 1. Use the "view" command first to see the current file structure and determine valid line numbers.';
			} else if (errorMsg.includes('text was not found')) {
				errorMsg += '\n\nTip: Text replacement requires exact matches, including whitespace and capitalization. Use the "view" command to see the current file contents and ensure your search text is exact.';
			} else if (errorMsg.includes('does not exist')) {
				if (params.command === 'view' && path === '/memories') {
					errorMsg = 'The memories directory is empty. No files have been created yet. Use the "create" command to add your first memory file.';
				}
			}

			this.activityLogger.log(params.command, path, false, errorMsg);

			return new vscode.LanguageModelToolResult([
				new vscode.LanguageModelTextPart(errorMsg)
			]);
		}
	}

	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<IMemoryParameters>,
		_token: vscode.CancellationToken
	): Promise<vscode.PreparedToolInvocation> {
		const params = options.input;

		let message = '';
		let confirmationMessage = '';

		switch (params.command) {
			case 'view': {
				const path = cleanPath(params.path);
				message = `Reading ${path}`;
				confirmationMessage = `View contents of \`${path}\`?`;
				break;
			}
			case 'create': {
				const path = cleanPath(params.path);
				message = `Creating file ${path}`;
				confirmationMessage = `Create or overwrite file \`${path}\`?`;
				break;
			}
			case 'str_replace': {
				const path = cleanPath(params.path);
				message = `Replacing text in ${path}`;
				confirmationMessage = `Replace text in \`${path}\`?`;
				break;
			}
			case 'insert': {
				const path = cleanPath(params.path);
				message = `Inserting text at line ${params.insert_line} in ${path}`;
				confirmationMessage = `Insert text at line ${params.insert_line} in \`${path}\`?`;
				break;
			}
			case 'delete': {
				const path = cleanPath(params.path);
				message = `Deleting ${path}`;
				confirmationMessage = `Delete \`${path}\`?`;
				break;
			}
			case 'rename': {
				const oldPath = cleanPath(params.old_path);
				const newPath = cleanPath(params.new_path);
				message = `Renaming ${oldPath} to ${newPath}`;
				confirmationMessage = `Rename \`${oldPath}\` to \`${newPath}\`?`;
				break;
			}
		}

		return {
			invocationMessage: message,
			confirmationMessages: confirmationMessage ? {
				title: 'Memory Operation',
				message: new vscode.MarkdownString(confirmationMessage)
			} : undefined
		};
	}

	/**
	 * Get storage for a specific workspace (for use by views)
	 */
	getStorageForWorkspace(workspaceFolder: vscode.WorkspaceFolder): IMemoryStorage {
		return this.getStorage(workspaceFolder);
	}

	/**
	 * Clear all storage instances (useful when settings change)
	 */
	clearStorageCache(): void {
		this.storageMap.clear();
		this.pinManagerMap.clear();
	}

	/**
	 * Clear all memory files in the current workspace
	 */
	async clearAllMemoryFiles(): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			throw new Error('No workspace folder is open');
		}

		const storage = this.getStorage(workspaceFolders[0]);
		const files = await storage.listFiles();

		// Delete all files (not directories)
		for (const file of files) {
			if (!file.isDirectory) {
				try {
					await storage.delete(file.path);
					this.activityLogger.log('delete', file.path, true, 'Cleared via Clear All');
				} catch (error) {
					this.activityLogger.log('delete', file.path, false, error instanceof Error ? error.message : String(error));
				}
			}
		}
	}

	/**
	 * Delete a specific memory file
	 */
	async deleteMemoryFile(filePath: string): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			throw new Error('No workspace folder is open');
		}

		const storage = this.getStorage(workspaceFolders[0]);
		try {
			await storage.delete(filePath);
			this.activityLogger.log('delete', filePath, true);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.activityLogger.log('delete', filePath, false, errorMsg);
			throw error;
		}
	}
}

/**
 * Register the memory tool
 */
export function registerMemoryTool(context: vscode.ExtensionContext, activityLogger: MemoryActivityLogger): MemoryTool {
	const memoryTool = new MemoryTool(context, activityLogger);
	context.subscriptions.push(
		vscode.lm.registerTool('memory', memoryTool)
	);
	return memoryTool;
}
