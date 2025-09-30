import * as vscode from 'vscode';
import { IMemoryFileInfo } from './types.js';
import { MemoryTool } from './tools.js';
import { MemoryActivityLogger } from './activityLogger.js';
import { formatSize, formatRelativeTime } from './lib/utils.js';

/**
 * Tree item for memory files view
 */
class MemoryFileTreeItem extends vscode.TreeItem {
	constructor(
		public readonly fileInfo: IMemoryFileInfo,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(fileInfo.name, collapsibleState);

		this.tooltip = this.getTooltip();
		this.description = this.getDescription();

		// Set context value based on type and PIN state for menu commands
		if (fileInfo.isDirectory) {
			this.contextValue = fileInfo.isPinned ? 'memoryDirectoryPinned' : 'memoryDirectory';
		} else {
			this.contextValue = fileInfo.isPinned ? 'memoryFilePinned' : 'memoryFile';
		}

		if (!fileInfo.isDirectory) {
			this.command = {
				command: 'agentMemory.openMemoryFile',
				title: 'Open Memory File',
				arguments: [fileInfo]
			};
		}

		// Set icon based on file type and PIN state
		if (fileInfo.isDirectory) {
			this.iconPath = fileInfo.isPinned
				? new vscode.ThemeIcon('folder-active')
				: new vscode.ThemeIcon('folder');
		} else {
			this.iconPath = fileInfo.isPinned
				? new vscode.ThemeIcon('pinned', new vscode.ThemeColor('charts.yellow'))
				: new vscode.ThemeIcon('file');
		}
	}

	private getTooltip(): string {
		const size = formatSize(this.fileInfo.size);
		const accessed = formatRelativeTime(this.fileInfo.lastAccessed);
		const modified = formatRelativeTime(this.fileInfo.lastModified);
		const pinned = this.fileInfo.isPinned ? ' (PINNED)' : '';

		return `${this.fileInfo.path}${pinned}\n` +
			`Size: ${size}\n` +
			`Last accessed: ${accessed}\n` +
			`Last modified: ${modified}`;
	}

	private getDescription(): string {
		if (this.fileInfo.isDirectory) {
			return '';
		}
		return `${formatSize(this.fileInfo.size)} • ${formatRelativeTime(this.fileInfo.lastAccessed)}`;
	}
}

/**
 * Tree data provider for memory files
 */
export class MemoryFilesProvider implements vscode.TreeDataProvider<MemoryFileTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<MemoryFileTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(
		private memoryTool: MemoryTool,
		activityLogger: MemoryActivityLogger
	) {
		// Refresh when activity happens
		activityLogger.onDidChange(() => this.refresh());
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: MemoryFileTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: MemoryFileTreeItem): Promise<MemoryFileTreeItem[]> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return [];
		}

		const storage = this.memoryTool.getStorageForWorkspace(workspaceFolders[0]);
		const allFiles = await storage.listFiles();

		if (!element) {
			// Root level - show top-level items
			const rootItems = allFiles.filter(f => {
				const pathParts = f.path.replace('/memories/', '').split('/');
				return pathParts.length === 1;
			});

			return rootItems.map(f => new MemoryFileTreeItem(
				f,
				f.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
			));
		} else {
			// Children of a directory
			const parentPath = element.fileInfo.path;
			const children = allFiles.filter(f => {
				const relativePath = f.path.replace('/memories/', '');
				const parentRelative = parentPath.replace('/memories/', '');
				return relativePath.startsWith(parentRelative + '/') &&
					   relativePath.slice(parentRelative.length + 1).split('/').length === 1;
			});

			return children.map(f => new MemoryFileTreeItem(
				f,
				f.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
			));
		}
	}
}

/**
 * Tree item for activity log view
 */
class ActivityLogTreeItem extends vscode.TreeItem {
	constructor(
		public readonly timestamp: Date,
		public readonly logCommand: string,
		public readonly path: string,
		public readonly success: boolean,
		public readonly details?: string
	) {
		super(`${logCommand}: ${path}`, vscode.TreeItemCollapsibleState.None);

		const timeStr = this.formatTime(timestamp);
		this.description = `${timeStr} • ${success ? '✓' : '✗'}`;
		this.tooltip = this.getTooltip();
		this.iconPath = new vscode.ThemeIcon(
			success ? 'pass' : 'error',
			success ? undefined : new vscode.ThemeColor('errorForeground')
		);
	}

	private formatTime(date: Date): string {
		return date.toLocaleTimeString();
	}

	private getTooltip(): string {
		let tooltip = `${this.logCommand} ${this.path}\n` +
			`Time: ${this.timestamp.toLocaleString()}\n` +
			`Status: ${this.success ? 'Success' : 'Failed'}`;

		if (this.details) {
			tooltip += `\nDetails: ${this.details}`;
		}

		return tooltip;
	}
}

/**
 * Tree data provider for activity logs
 */
export class ActivityLogProvider implements vscode.TreeDataProvider<ActivityLogTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<ActivityLogTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private activityLogger: MemoryActivityLogger) {
		activityLogger.onDidChange(() => this.refresh());
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: ActivityLogTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<ActivityLogTreeItem[]> {
		const logs = this.activityLogger.getLogs();
		return logs.map(log => new ActivityLogTreeItem(
			log.timestamp,
			log.command,
			log.path,
			log.success,
			log.details
		));
	}
}
