import * as vscode from 'vscode';
import { registerMemoryTool } from './tools.js';
import { MemoryActivityLogger } from './activityLogger.js';
import { MemoryFilesProvider, ActivityLogProvider } from './views.js';
import { formatSize } from './lib/utils.js';
import { ReadonlyMemoryProvider } from './readonlyProvider.js';

export function activate(context: vscode.ExtensionContext) {
	// Initialize activity logger
	const activityLogger = new MemoryActivityLogger();
	context.subscriptions.push(activityLogger);

	// Register memory tool
	const memoryTool = registerMemoryTool(context, activityLogger);

	// Register readonly memory provider
	const readonlyProvider = new ReadonlyMemoryProvider(memoryTool);
	context.subscriptions.push(readonlyProvider.register(context));

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

	// Update memory view description with total bytes
	const updateMemoryViewDescription = (totalBytes: number) => {
		if (totalBytes === 0) {
			memoryFilesView.description = undefined;
		} else {
			const formatted = formatSize(totalBytes);
			memoryFilesView.description = formatted;
		}
	};

	// Listen for changes in total bytes
	context.subscriptions.push(
		memoryFilesProvider.onDidChangeTotalBytes(updateMemoryViewDescription)
	);

	// Initialize context state
	memoryFilesProvider.refresh();

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
		vscode.commands.registerCommand('agentMemory.clearAllMemoryFiles', async () => {
			try {
				await memoryTool.clearAllMemoryFiles();
				vscode.window.showInformationMessage('All memory files have been deleted.');
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to clear memory files: ${error instanceof Error ? error.message : String(error)}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentMemory.deleteMemoryFile', async (treeItem) => {
			if (!treeItem || treeItem.fileInfo.isDirectory) {
				return;
			}

			try {
				await memoryTool.deleteMemoryFile(treeItem.fileInfo.path);
				vscode.window.showInformationMessage(`Memory file '${treeItem.fileInfo.name}' has been deleted.`);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentMemory.openMemoryFile', async (item) => {
			// Handle both tree item (with fileInfo property) and direct fileInfo object
			const fileInfo = item.fileInfo || item;
			
			if (!fileInfo || fileInfo.isDirectory) {
				return;
			}

			// Open file using readonly provider in markdown preview mode
			const uri = readonlyProvider.createUri(fileInfo.path);
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, { preview: true });
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentMemory.pinFile', async (treeItem) => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				return;
			}

			const pinManager = memoryTool.getPinManagerForWorkspace(workspaceFolders[0]);
			await pinManager.pinFile(treeItem.fileInfo.path);
			memoryFilesProvider.refresh();

			vscode.window.showInformationMessage(`Pinned: ${treeItem.fileInfo.name}`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentMemory.unpinFile', async (treeItem) => {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				return;
			}

			const pinManager = memoryTool.getPinManagerForWorkspace(workspaceFolders[0]);
			await pinManager.unpinFile(treeItem.fileInfo.path);
			memoryFilesProvider.refresh();

			vscode.window.showInformationMessage(`Unpinned: ${treeItem.fileInfo.name}`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('agentMemory.saveAsMarkdown', async (treeItem) => {
			if (!treeItem || treeItem.fileInfo.isDirectory) {
				return;
			}

			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				return;
			}

			try {
				const storage = memoryTool.getStorageForWorkspace(workspaceFolders[0]);
				const content = await storage.readRaw(treeItem.fileInfo.path);

				// Prompt user for save location
				const defaultFileName = treeItem.fileInfo.name.endsWith('.md') 
					? treeItem.fileInfo.name 
					: `${treeItem.fileInfo.name}.md`;

				const defaultUri = vscode.Uri.joinPath(workspaceFolders[0].uri, defaultFileName);

				const saveUri = await vscode.window.showSaveDialog({
					defaultUri,
					filters: {
						'Markdown Files': ['md'],
						'All Files': ['*']
					},
					saveLabel: 'Save as Markdown'
				});

				if (saveUri) {
					// Write the content to the selected file
					await vscode.workspace.fs.writeFile(saveUri, Buffer.from(content, 'utf8'));
					vscode.window.showInformationMessage(`Memory saved to ${saveUri.fsPath}`);
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to save file: ${error instanceof Error ? error.message : String(error)}`);
			}
		})
	);

	// Listen for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('agentMemory.storageBackend')) {
				memoryTool.clearStorageCache();
				memoryFilesProvider.refresh();
			}
			if (e.affectsConfiguration('agentMemory.autoSyncToFile')) {
				// Configuration changed - the sync manager will pick up the change on next operation
				vscode.window.showInformationMessage('Auto-sync file setting updated.');
			}
		})
	);
}

export function deactivate() { }
