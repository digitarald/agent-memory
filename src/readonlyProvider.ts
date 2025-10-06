import * as vscode from 'vscode';
import { MemoryTool } from './tools.js';

/**
 * Content provider for readonly memory files
 * Provides content for memory:// URIs to display memory files as read-only
 */
export class ReadonlyMemoryProvider implements vscode.TextDocumentContentProvider {
	private readonly scheme = 'memory-readonly';
	
	constructor(private memoryTool: MemoryTool) {}

	/**
	 * Provide content for a memory file URI
	 * URI format: memory-readonly:/memories/path/to/file.txt
	 */
	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return 'No workspace folder is open.';
		}

		const storage = this.memoryTool.getStorageForWorkspace(workspaceFolders[0]);
		
		try {
			// The URI path already contains the full memory path
			const content = await storage.readRaw(uri.path);
			return content;
		} catch (error) {
			return `Error reading memory file: ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	/**
	 * Register this provider with VS Code
	 */
	register(_context: vscode.ExtensionContext): vscode.Disposable {
		return vscode.workspace.registerTextDocumentContentProvider(this.scheme, this);
	}

	/**
	 * Create a URI for a memory file
	 */
	createUri(memoryPath: string): vscode.Uri {
		return vscode.Uri.parse(`${this.scheme}:${memoryPath}`);
	}
}
