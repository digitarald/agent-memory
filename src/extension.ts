import * as vscode from 'vscode';
import { registerMemoryTool } from './tools.js';
import { MemoryActivityLogger } from './activityLogger.js';
import { MemoryFilesProvider, ActivityLogProvider } from './views.js';

export function activate(context: vscode.ExtensionContext) {
	// Initialize activity logger
	const activityLogger = new MemoryActivityLogger();
	context.subscriptions.push(activityLogger);

	// Register memory tool
	const memoryTool = registerMemoryTool(context, activityLogger);

	// Register tree view providers
	const memoryFilesProvider = new MemoryFilesProvider(memoryTool, activityLogger);
	const activityLogProvider = new ActivityLogProvider(activityLogger);

	// Register tree views
	const memoryFilesView = vscode.window.createTreeView('agentMemory.files', {
		treeDataProvider: memoryFilesProvider,
		showCollapseAll: true
	});

	const activityLogView = vscode.window.createTreeView('agentMemory.activityLog', {
		treeDataProvider: activityLogProvider,
		showCollapseAll: false
	});

	context.subscriptions.push(memoryFilesView, activityLogView);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('agentMemory.refresh', () => {
			memoryFilesProvider.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentMemory.clearLogs', () => {
			activityLogger.clear();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentMemory.openMemoryFile', async (fileInfo) => {
			if (!fileInfo || fileInfo.isDirectory) {
				return;
			}

			// For in-memory storage, we need to create a virtual document
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				return;
			}

		const storage = memoryTool.getStorageForWorkspace(workspaceFolders[0]);
		const content = await storage.readRaw(fileInfo.path);

		// Create and show a new untitled document with the content
			const doc = await vscode.workspace.openTextDocument({
				content,
				language: 'plaintext'
			});
			await vscode.window.showTextDocument(doc);
		})
	);

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('agentMemory.storageBackend')) {
				memoryTool.clearStorageCache();
				memoryFilesProvider.refresh();
			}
		})
	);
}

export function deactivate() { }
