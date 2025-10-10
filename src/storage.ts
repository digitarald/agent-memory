import * as vscode from 'vscode';
import * as path from 'path';
import { IMemoryStorage, IMemoryFileInfo, IPinManager } from './types.js';
import { validateMemoryPath, getMemoriesDir, normalizeMemoryPath } from './lib/pathValidation.js';
import { TextUtils } from './lib/utils.js';

const MEMORIES_DIR = getMemoriesDir();

/**
 * Workspace state storage implementation using VS Code's Memento API
 * Provides workspace-scoped persistent storage across VS Code sessions
 */
export class WorkspaceStateStorage implements IMemoryStorage {
	private memento: vscode.Memento;
	private workspaceFolder: vscode.WorkspaceFolder;
	private pinManager?: IPinManager;

	constructor(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder) {
		this.memento = context.workspaceState;
		this.workspaceFolder = workspaceFolder;
		this.ensureInitialized();
	}

	private async ensureInitialized(): Promise<void> {
		// Initialize storage structure if not exists
		const filesKey = this.getStorageKey('files');
		if (!this.memento.get(filesKey)) {
			await this.memento.update(filesKey, {});
		}
		const dirsKey = this.getStorageKey('directories');
		if (!this.memento.get(dirsKey)) {
			await this.memento.update(dirsKey, { [MEMORIES_DIR]: true });
		}
		const accessKey = this.getStorageKey('access');
		if (!this.memento.get(accessKey)) {
			await this.memento.update(accessKey, {});
		}
		const modifiedKey = this.getStorageKey('modified');
		if (!this.memento.get(modifiedKey)) {
			await this.memento.update(modifiedKey, {});
		}
		const tldrKey = this.getStorageKey('tldr');
		if (!this.memento.get(tldrKey)) {
			await this.memento.update(tldrKey, {});
		}
	}

	private getStorageKey(type: 'files' | 'directories' | 'access' | 'modified' | 'tldr'): string {
		return `agent-memory:${this.workspaceFolder.name}:${type}`;
	}

	private getFiles(): Record<string, { content: string; modified: string }> {
		return this.memento.get(this.getStorageKey('files'), {});
	}

	private async setFiles(files: Record<string, { content: string; modified: string }>): Promise<void> {
		await this.memento.update(this.getStorageKey('files'), files);
	}

	private getDirectories(): Record<string, boolean> {
		return this.memento.get(this.getStorageKey('directories'), { [MEMORIES_DIR]: true });
	}

	private async setDirectories(dirs: Record<string, boolean>): Promise<void> {
		await this.memento.update(this.getStorageKey('directories'), dirs);
	}

	private getAccessTimes(): Record<string, string> {
		return this.memento.get(this.getStorageKey('access'), {});
	}

	private async setAccessTimes(times: Record<string, string>): Promise<void> {
		await this.memento.update(this.getStorageKey('access'), times);
	}

	private getModifiedTimes(): Record<string, string> {
		return this.memento.get(this.getStorageKey('modified'), {});
	}

	private async setModifiedTimes(times: Record<string, string>): Promise<void> {
		await this.memento.update(this.getStorageKey('modified'), times);
	}

	private getTldrs(): Record<string, string> {
		return this.memento.get(this.getStorageKey('tldr'), {});
	}

	private async setTldrs(tldrs: Record<string, string>): Promise<void> {
		await this.memento.update(this.getStorageKey('tldr'), tldrs);
	}

	setPinManager(pinManager: IPinManager): void {
		this.pinManager = pinManager;
	}

	getWorkspaceId(): string {
		return this.workspaceFolder.name;
	}

	private getFullPath(memoryPath: string): string {
		validateMemoryPath(memoryPath);
		// Normalize path: remove trailing slash (except for root)
		const normalized = normalizeMemoryPath(memoryPath);
		// Normalize path to always start with /memories
		if (!normalized.startsWith(MEMORIES_DIR)) {
			return path.posix.join(MEMORIES_DIR, normalized);
		}
		return normalized;
	}

	private async ensureParentDirectories(filePath: string): Promise<void> {
		const directories = this.getDirectories();
		const parentDir = path.posix.dirname(filePath);
		if (!directories[parentDir]) {
			await this.ensureParentDirectories(parentDir);
			directories[parentDir] = true;
			await this.setDirectories(directories);
		}
	}

	async view(memoryPath: string, viewRange?: [number, number]): Promise<string> {
		const fullPath = this.getFullPath(memoryPath);
		const accessTimes = this.getAccessTimes();
		accessTimes[fullPath] = new Date().toISOString();
		await this.setAccessTimes(accessTimes);

		try {
			const directories = this.getDirectories();
			// Check if it's a directory
			if (directories[fullPath]) {
				// List directory contents
				const items: string[] = [];
				const files = this.getFiles();

				// Find all subdirectories in this directory
				for (const dirPath of Object.keys(directories)) {
					if (dirPath !== fullPath && dirPath.startsWith(fullPath + '/')) {
						const relativePath = dirPath.slice(fullPath.length + 1);
						if (!relativePath.includes('/')) {
							items.push(relativePath + '/');
						}
					}
				}

				// Find all files in this directory
				for (const filePath of Object.keys(files)) {
					if (filePath.startsWith(fullPath + '/')) {
						const relativePath = filePath.slice(fullPath.length + 1);
						if (!relativePath.includes('/')) {
							items.push(relativePath);
						}
					}
				}

				if (items.length === 0 && fullPath === MEMORIES_DIR) {
					return `Directory: ${memoryPath}\n(empty - no files created yet)`;
				}

				items.sort();
				return `Directory: ${memoryPath}\n${items.map(item => `- ${item}`).join('\n')}`;
			}

			// Check if it's a file
			const files = this.getFiles();
			const fileEntry = files[fullPath];
			if (!fileEntry) {
				throw new Error(`The file '${memoryPath}' does not exist yet. Use the 'create' command to create it first, or use 'view' on the parent directory '/memories' to see available files.`);
			}

			const text = fileEntry.content;
			const lines = text.split('\n');

			let displayLines = lines;
			let startNum = 1;

			if (viewRange && viewRange.length === 2) {
				const startLine = Math.max(1, viewRange[0]) - 1;
				const endLine = viewRange[1] === -1 ? lines.length : viewRange[1];
				displayLines = lines.slice(startLine, endLine);
				startNum = startLine + 1;
			}

			const numberedLines = displayLines.map(
				(line, i) => `${String(i + startNum).padStart(4, ' ')}: ${line}`
			);

			return numberedLines.join('\n');
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error(`Unexpected error viewing '${memoryPath}': ${String(error)}`);
		}
	}

	async readRaw(memoryPath: string): Promise<string> {
		const fullPath = this.getFullPath(memoryPath);
		const accessTimes = this.getAccessTimes();
		accessTimes[fullPath] = new Date().toISOString();
		await this.setAccessTimes(accessTimes);

		const files = this.getFiles();
		const fileEntry = files[fullPath];
		if (!fileEntry) {
			throw new Error(`The file '${memoryPath}' does not exist.`);
		}

		return fileEntry.content;
	}

	async create(memoryPath: string, content: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);

		// Ensure parent directories exist
		await this.ensureParentDirectories(fullPath);

		// Store the file
		const now = new Date().toISOString();
		const files = this.getFiles();
		files[fullPath] = { content, modified: now };
		await this.setFiles(files);

		const accessTimes = this.getAccessTimes();
		accessTimes[fullPath] = now;
		await this.setAccessTimes(accessTimes);

		const modifiedTimes = this.getModifiedTimes();
		modifiedTimes[fullPath] = now;
		await this.setModifiedTimes(modifiedTimes);
	}

	async strReplace(memoryPath: string, oldStr: string, newStr: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);

		const files = this.getFiles();
		const fileEntry = files[fullPath];
		if (!fileEntry) {
			throw new Error(`Cannot modify '${memoryPath}' because it does not exist. Use 'create' to create the file first, or 'view' to check available files in '/memories'.`);
		}

		const text = fileEntry.content;
		const newText = TextUtils.replaceFirst(text, oldStr, newStr, memoryPath);

		const now = new Date().toISOString();
		files[fullPath] = { content: newText, modified: now };
		await this.setFiles(files);

		const accessTimes = this.getAccessTimes();
		accessTimes[fullPath] = now;
		await this.setAccessTimes(accessTimes);

		const modifiedTimes = this.getModifiedTimes();
		modifiedTimes[fullPath] = now;
		await this.setModifiedTimes(modifiedTimes);
	}

	async insert(memoryPath: string, insertLine: number, insertText: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);

		const files = this.getFiles();
		const fileEntry = files[fullPath];
		if (!fileEntry) {
			throw new Error(`Cannot insert text into '${memoryPath}' because the file does not exist. Use 'create' to create the file first, or 'view' to check available files in '/memories'.`);
		}

		const text = fileEntry.content;
		const newText = TextUtils.insertAtLine(text, insertLine, insertText);

		const now = new Date().toISOString();
		files[fullPath] = { content: newText, modified: now };
		await this.setFiles(files);

		const accessTimes = this.getAccessTimes();
		accessTimes[fullPath] = now;
		await this.setAccessTimes(accessTimes);

		const modifiedTimes = this.getModifiedTimes();
		modifiedTimes[fullPath] = now;
		await this.setModifiedTimes(modifiedTimes);
	}

	async delete(memoryPath: string): Promise<string> {
		const fullPath = this.getFullPath(memoryPath);
		const directories = this.getDirectories();

		// Check if it's a directory
		if (directories[fullPath]) {
			const files = this.getFiles();
			const accessTimes = this.getAccessTimes();
			const modifiedTimes = this.getModifiedTimes();
			const tldrs = this.getTldrs();

			// Delete all files within this directory
			const filesToDelete = Object.keys(files).filter(path => path.startsWith(fullPath + '/'));
			for (const filePath of filesToDelete) {
				delete files[filePath];
				delete accessTimes[filePath];
				delete modifiedTimes[filePath];
				delete tldrs[filePath];
				// Remove PIN state for deleted files
				if (this.pinManager) {
					await this.pinManager.removePinnedPath(filePath);
				}
			}

			// Delete all subdirectories
			const dirsToDelete = Object.keys(directories).filter(path => path.startsWith(fullPath + '/'));
			for (const dirPath of dirsToDelete) {
				delete directories[dirPath];
			}

			// Don't delete the root memories directory
			if (fullPath !== MEMORIES_DIR) {
				delete directories[fullPath];
			}

			await this.setFiles(files);
			await this.setAccessTimes(accessTimes);
			await this.setModifiedTimes(modifiedTimes);
			await this.setTldrs(tldrs);
			await this.setDirectories(directories);

			return `Directory deleted: ${memoryPath}`;
		}
		// Check if it's a file
		else {
			const files = this.getFiles();
			if (files[fullPath]) {
				const accessTimes = this.getAccessTimes();
				const modifiedTimes = this.getModifiedTimes();
				const tldrs = this.getTldrs();

				delete files[fullPath];
				delete accessTimes[fullPath];
				delete modifiedTimes[fullPath];
				delete tldrs[fullPath];

				await this.setFiles(files);
				await this.setAccessTimes(accessTimes);
				await this.setModifiedTimes(modifiedTimes);
				await this.setTldrs(tldrs);

				// Remove PIN state for deleted file
				if (this.pinManager) {
					await this.pinManager.removePinnedPath(fullPath);
				}

				return `File deleted: ${memoryPath}`;
			} else {
				throw new Error(`Cannot delete '${memoryPath}' because it does not exist. Use 'view' on '/memories' to see what files are available to delete.`);
			}
		}
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const oldFullPath = this.getFullPath(oldPath);
		const newFullPath = this.getFullPath(newPath);

		// Ensure parent directories exist for new path
		await this.ensureParentDirectories(newFullPath);

		const files = this.getFiles();
		const directories = this.getDirectories();
		const accessTimes = this.getAccessTimes();
		const modifiedTimes = this.getModifiedTimes();
		const tldrs = this.getTldrs();

		// Check if it's a file
		if (files[oldFullPath]) {
			const fileEntry = files[oldFullPath];

			// Move the file
			files[newFullPath] = fileEntry;
			delete files[oldFullPath];

			// Update metadata
			if (accessTimes[oldFullPath]) {
				accessTimes[newFullPath] = accessTimes[oldFullPath];
				delete accessTimes[oldFullPath];
			}
			if (modifiedTimes[oldFullPath]) {
				modifiedTimes[newFullPath] = modifiedTimes[oldFullPath];
				delete modifiedTimes[oldFullPath];
			}
			if (tldrs[oldFullPath]) {
				tldrs[newFullPath] = tldrs[oldFullPath];
				delete tldrs[oldFullPath];
			}

			await this.setFiles(files);
			await this.setAccessTimes(accessTimes);
			await this.setModifiedTimes(modifiedTimes);
			await this.setTldrs(tldrs);

			// Update PIN state for renamed file
			if (this.pinManager) {
				await this.pinManager.updatePinnedPath(oldFullPath, newFullPath);
			}
		}
		// Check if it's a directory
		else if (directories[oldFullPath]) {
			// Move the directory and all its contents
			directories[newFullPath] = true;
			delete directories[oldFullPath];

			// Move all files in the directory
			const filesToMove = Object.keys(files).filter(path => path.startsWith(oldFullPath + '/'));
			for (const filePath of filesToMove) {
				const newFilePath = newFullPath + filePath.slice(oldFullPath.length);
				files[newFilePath] = files[filePath];
				delete files[filePath];

				// Update metadata
				if (accessTimes[filePath]) {
					accessTimes[newFilePath] = accessTimes[filePath];
					delete accessTimes[filePath];
				}
				if (modifiedTimes[filePath]) {
					modifiedTimes[newFilePath] = modifiedTimes[filePath];
					delete modifiedTimes[filePath];
				}
				if (tldrs[filePath]) {
					tldrs[newFilePath] = tldrs[filePath];
					delete tldrs[filePath];
				}

				// Update PIN state for renamed files in directory
				if (this.pinManager) {
					await this.pinManager.updatePinnedPath(filePath, newFilePath);
				}
			}

			// Move all subdirectories
			const dirsToMove = Object.keys(directories).filter(path => path.startsWith(oldFullPath + '/'));
			for (const dirPath of dirsToMove) {
				const newDirPath = newFullPath + dirPath.slice(oldFullPath.length);
				directories[newDirPath] = true;
				delete directories[dirPath];
			}

			await this.setFiles(files);
			await this.setDirectories(directories);
			await this.setAccessTimes(accessTimes);
			await this.setModifiedTimes(modifiedTimes);
			await this.setTldrs(tldrs);
		}
		else {
			throw new Error(`Cannot rename '${oldPath}' because it does not exist. Use 'view' on '/memories' to see what files are available to rename.`);
		}
	}

	async listFiles(): Promise<IMemoryFileInfo[]> {
		const filesData: IMemoryFileInfo[] = [];
		const directories = this.getDirectories();
		const files = this.getFiles();
		const accessTimes = this.getAccessTimes();
		const modifiedTimes = this.getModifiedTimes();
		const tldrs = this.getTldrs();

		// Add all directories
		for (const dirPath of Object.keys(directories)) {
			if (dirPath === MEMORIES_DIR) {
				continue; // Skip root directory
			}

			const info: IMemoryFileInfo = {
				path: dirPath,
				name: path.posix.basename(dirPath),
				isDirectory: true,
				size: 0,
				lastAccessed: accessTimes[dirPath] ? new Date(accessTimes[dirPath]) : new Date(),
				lastModified: modifiedTimes[dirPath] ? new Date(modifiedTimes[dirPath]) : new Date(),
				isPinned: this.pinManager ? await this.pinManager.isPinned(dirPath) : false
			};
			filesData.push(info);
		}

		// Add all files
		for (const [filePath, fileEntry] of Object.entries(files)) {
			const modified = new Date(fileEntry.modified);
			const info: IMemoryFileInfo = {
				path: filePath,
				name: path.posix.basename(filePath),
				isDirectory: false,
				size: Buffer.from(fileEntry.content, 'utf8').length,
				lastAccessed: accessTimes[filePath] ? new Date(accessTimes[filePath]) : modified,
				lastModified: modifiedTimes[filePath] ? new Date(modifiedTimes[filePath]) : modified,
				isPinned: this.pinManager ? await this.pinManager.isPinned(filePath) : false,
				tldr: tldrs[filePath]
			};
			filesData.push(info);
		}

		return filesData.sort((a, b) => a.path.localeCompare(b.path));
	}

	async getTldr(memoryPath: string): Promise<string | undefined> {
		const fullPath = this.getFullPath(memoryPath);
		const tldrs = this.getTldrs();
		return tldrs[fullPath];
	}

	async setTldr(memoryPath: string, tldr: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);
		const tldrs = this.getTldrs();
		tldrs[fullPath] = tldr;
		await this.setTldrs(tldrs);
	}

	async deleteTldr(memoryPath: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);
		const tldrs = this.getTldrs();
		delete tldrs[fullPath];
		await this.setTldrs(tldrs);
	}
}

/**
 * Branch-state storage implementation using VS Code's Memento API
 * Provides workspace and git branch-scoped persistent storage
 * Isolates memory per branch for better context separation
 */
export class BranchStateStorage implements IMemoryStorage {
	private memento: vscode.Memento;
	private workspaceFolder: vscode.WorkspaceFolder;
	private pinManager?: IPinManager;
	private currentBranch: string = 'unknown';
	private branchChangeListener?: vscode.Disposable;

	constructor(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder) {
		this.memento = context.workspaceState;
		this.workspaceFolder = workspaceFolder;
		this.initializeBranch();
	}

	private async initializeBranch(): Promise<void> {
		this.currentBranch = await this.getCurrentGitBranch();
		await this.ensureInitialized();
		this.setupBranchChangeListener();
	}

	private async getCurrentGitBranch(): Promise<string> {
		try {
			// Method 1: Use VS Code Git Extension API (preferred)
			const gitExtension = vscode.extensions.getExtension('vscode.git');
			if (gitExtension) {
				const git = gitExtension.exports;
				const api = git.getAPI(1);
				const repo = api.repositories.find((r: any) =>
					r.rootUri.toString() === this.workspaceFolder.uri.toString()
				);
				if (repo?.state.HEAD?.name) {
					return this.sanitizeBranchName(repo.state.HEAD.name);
				}
			}

			// Method 2: Fallback to reading .git/HEAD file
			const gitHeadUri = vscode.Uri.joinPath(this.workspaceFolder.uri, '.git', 'HEAD');
			const headContent = await vscode.workspace.fs.readFile(gitHeadUri);
			const headText = Buffer.from(headContent).toString('utf8').trim();

			if (headText.startsWith('ref: refs/heads/')) {
				const branchName = headText.substring('ref: refs/heads/'.length);
				return this.sanitizeBranchName(branchName);
			}

			return 'detached-head';
		} catch (error) {
			console.warn('Failed to detect git branch:', error);
			return 'no-git';
		}
	}

	private sanitizeBranchName(branchName: string): string {
		// Hash the branch name to avoid issues with special characters
		// Use a simple hash function for consistent, safe storage keys
		let hash = 0;
		for (let i = 0; i < branchName.length; i++) {
			const char = branchName.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		// Return a combination of hash and sanitized name for readability in debugging
		const sanitized = branchName.replace(/[^a-zA-Z0-9-]/g, '-');
		return `${sanitized.substring(0, 20)}-${Math.abs(hash).toString(16)}`;
	}

	private setupBranchChangeListener(): void {
		try {
			const gitExtension = vscode.extensions.getExtension('vscode.git');
			if (!gitExtension) {
				return;
			}

			const git = gitExtension.exports;
			const api = git.getAPI(1);
			const repo = api.repositories.find((r: any) =>
				r.rootUri.toString() === this.workspaceFolder.uri.toString()
			);

			if (!repo) {
				return;
			}

			this.branchChangeListener = repo.state.onDidChange(async () => {
				const newBranch = repo.state.HEAD?.name ? this.sanitizeBranchName(repo.state.HEAD.name) : 'unknown';
				if (newBranch !== this.currentBranch) {
					console.log(`Branch changed from ${this.currentBranch} to ${newBranch}`);
					this.currentBranch = newBranch;
					await this.ensureInitialized();
					// Auto-refresh the memory tree view
					vscode.commands.executeCommand('agentMemory.refresh');
				}
			});
		} catch (error) {
			console.warn('Failed to setup branch change listener:', error);
		}
	}

	dispose(): void {
		this.branchChangeListener?.dispose();
	}

	private async ensureInitialized(): Promise<void> {
		// Initialize storage structure if not exists
		const filesKey = this.getStorageKey('files');
		if (!this.memento.get(filesKey)) {
			await this.memento.update(filesKey, {});
		}
		const dirsKey = this.getStorageKey('directories');
		if (!this.memento.get(dirsKey)) {
			await this.memento.update(dirsKey, { [MEMORIES_DIR]: true });
		}
		const accessKey = this.getStorageKey('access');
		if (!this.memento.get(accessKey)) {
			await this.memento.update(accessKey, {});
		}
		const modifiedKey = this.getStorageKey('modified');
		if (!this.memento.get(modifiedKey)) {
			await this.memento.update(modifiedKey, {});
		}
		const tldrKey = this.getStorageKey('tldr');
		if (!this.memento.get(tldrKey)) {
			await this.memento.update(tldrKey, {});
		}
	}

	private getStorageKey(type: 'files' | 'directories' | 'access' | 'modified' | 'tldr'): string {
		return `agent-memory:${this.workspaceFolder.name}:${this.currentBranch}:${type}`;
	}

	private getFiles(): Record<string, { content: string; modified: string }> {
		return this.memento.get(this.getStorageKey('files'), {});
	}

	private async setFiles(files: Record<string, { content: string; modified: string }>): Promise<void> {
		await this.memento.update(this.getStorageKey('files'), files);
	}

	private getDirectories(): Record<string, boolean> {
		return this.memento.get(this.getStorageKey('directories'), { [MEMORIES_DIR]: true });
	}

	private async setDirectories(dirs: Record<string, boolean>): Promise<void> {
		await this.memento.update(this.getStorageKey('directories'), dirs);
	}

	private getAccessTimes(): Record<string, string> {
		return this.memento.get(this.getStorageKey('access'), {});
	}

	private async setAccessTimes(times: Record<string, string>): Promise<void> {
		await this.memento.update(this.getStorageKey('access'), times);
	}

	private getModifiedTimes(): Record<string, string> {
		return this.memento.get(this.getStorageKey('modified'), {});
	}

	private async setModifiedTimes(times: Record<string, string>): Promise<void> {
		await this.memento.update(this.getStorageKey('modified'), times);
	}

	private getTldrs(): Record<string, string> {
		return this.memento.get(this.getStorageKey('tldr'), {});
	}

	private async setTldrs(tldrs: Record<string, string>): Promise<void> {
		await this.memento.update(this.getStorageKey('tldr'), tldrs);
	}

	setPinManager(pinManager: IPinManager): void {
		this.pinManager = pinManager;
	}

	getWorkspaceId(): string {
		return `${this.workspaceFolder.name}:${this.currentBranch}`;
	}

	private getFullPath(memoryPath: string): string {
		validateMemoryPath(memoryPath);
		// Normalize path: remove trailing slash (except for root)
		const normalized = normalizeMemoryPath(memoryPath);
		// Normalize path to always start with /memories
		if (!normalized.startsWith(MEMORIES_DIR)) {
			return path.posix.join(MEMORIES_DIR, normalized);
		}
		return normalized;
	}

	private async ensureParentDirectories(filePath: string): Promise<void> {
		const directories = this.getDirectories();
		const parentDir = path.posix.dirname(filePath);
		if (!directories[parentDir]) {
			await this.ensureParentDirectories(parentDir);
			directories[parentDir] = true;
			await this.setDirectories(directories);
		}
	}

	async view(memoryPath: string, viewRange?: [number, number]): Promise<string> {
		const fullPath = this.getFullPath(memoryPath);
		const accessTimes = this.getAccessTimes();
		accessTimes[fullPath] = new Date().toISOString();
		await this.setAccessTimes(accessTimes);

		try {
			const directories = this.getDirectories();
			// Check if it's a directory
			if (directories[fullPath]) {
				// List directory contents
				const items: string[] = [];
				const files = this.getFiles();

				// Find all subdirectories in this directory
				for (const dirPath of Object.keys(directories)) {
					if (dirPath !== fullPath && dirPath.startsWith(fullPath + '/')) {
						const relativePath = dirPath.slice(fullPath.length + 1);
						if (!relativePath.includes('/')) {
							items.push(relativePath + '/');
						}
					}
				}

				// Find all files in this directory
				for (const filePath of Object.keys(files)) {
					if (filePath.startsWith(fullPath + '/')) {
						const relativePath = filePath.slice(fullPath.length + 1);
						if (!relativePath.includes('/')) {
							items.push(relativePath);
						}
					}
				}

				if (items.length === 0 && fullPath === MEMORIES_DIR) {
					return `Directory: ${memoryPath}\n(empty - no files created yet)`;
				}

				items.sort();
				return `Directory: ${memoryPath}\n${items.map(item => `- ${item}`).join('\n')}`;
			}

			// Check if it's a file
			const files = this.getFiles();
			const fileEntry = files[fullPath];
			if (!fileEntry) {
				throw new Error(`The file '${memoryPath}' does not exist yet. Use the 'create' command to create it first, or use 'view' on the parent directory '/memories' to see available files.`);
			}

			const text = fileEntry.content;
			const lines = text.split('\n');

			let displayLines = lines;
			let startNum = 1;

			if (viewRange && viewRange.length === 2) {
				const startLine = Math.max(1, viewRange[0]) - 1;
				const endLine = viewRange[1] === -1 ? lines.length : viewRange[1];
				displayLines = lines.slice(startLine, endLine);
				startNum = startLine + 1;
			}

			const numberedLines = displayLines.map(
				(line, i) => `${String(i + startNum).padStart(4, ' ')}: ${line}`
			);

			return numberedLines.join('\n');
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error(`Unexpected error viewing '${memoryPath}': ${String(error)}`);
		}
	}

	async readRaw(memoryPath: string): Promise<string> {
		const fullPath = this.getFullPath(memoryPath);
		const accessTimes = this.getAccessTimes();
		accessTimes[fullPath] = new Date().toISOString();
		await this.setAccessTimes(accessTimes);

		const files = this.getFiles();
		const fileEntry = files[fullPath];
		if (!fileEntry) {
			throw new Error(`The file '${memoryPath}' does not exist.`);
		}

		return fileEntry.content;
	}

	async create(memoryPath: string, content: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);

		// Ensure parent directories exist
		await this.ensureParentDirectories(fullPath);

		// Store the file
		const now = new Date().toISOString();
		const files = this.getFiles();
		files[fullPath] = { content, modified: now };
		await this.setFiles(files);

		const accessTimes = this.getAccessTimes();
		accessTimes[fullPath] = now;
		await this.setAccessTimes(accessTimes);

		const modifiedTimes = this.getModifiedTimes();
		modifiedTimes[fullPath] = now;
		await this.setModifiedTimes(modifiedTimes);
	}

	async strReplace(memoryPath: string, oldStr: string, newStr: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);

		const files = this.getFiles();
		const fileEntry = files[fullPath];
		if (!fileEntry) {
			throw new Error(`Cannot modify '${memoryPath}' because it does not exist. Use 'create' to create the file first, or 'view' to check available files in '/memories'.`);
		}

		const text = fileEntry.content;
		const newText = TextUtils.replaceFirst(text, oldStr, newStr, memoryPath);

		const now = new Date().toISOString();
		files[fullPath] = { content: newText, modified: now };
		await this.setFiles(files);

		const accessTimes = this.getAccessTimes();
		accessTimes[fullPath] = now;
		await this.setAccessTimes(accessTimes);

		const modifiedTimes = this.getModifiedTimes();
		modifiedTimes[fullPath] = now;
		await this.setModifiedTimes(modifiedTimes);
	}

	async insert(memoryPath: string, insertLine: number, insertText: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);

		const files = this.getFiles();
		const fileEntry = files[fullPath];
		if (!fileEntry) {
			throw new Error(`Cannot insert text into '${memoryPath}' because the file does not exist. Use 'create' to create the file first, or 'view' to check available files in '/memories'.`);
		}

		const text = fileEntry.content;
		const newText = TextUtils.insertAtLine(text, insertLine, insertText);

		const now = new Date().toISOString();
		files[fullPath] = { content: newText, modified: now };
		await this.setFiles(files);

		const accessTimes = this.getAccessTimes();
		accessTimes[fullPath] = now;
		await this.setAccessTimes(accessTimes);

		const modifiedTimes = this.getModifiedTimes();
		modifiedTimes[fullPath] = now;
		await this.setModifiedTimes(modifiedTimes);
	}

	async delete(memoryPath: string): Promise<string> {
		const fullPath = this.getFullPath(memoryPath);
		const directories = this.getDirectories();

		// Check if it's a directory
		if (directories[fullPath]) {
			const files = this.getFiles();
			const accessTimes = this.getAccessTimes();
			const modifiedTimes = this.getModifiedTimes();
			const tldrs = this.getTldrs();

			// Delete all files within this directory
			const filesToDelete = Object.keys(files).filter(path => path.startsWith(fullPath + '/'));
			for (const filePath of filesToDelete) {
				delete files[filePath];
				delete accessTimes[filePath];
				delete modifiedTimes[filePath];
				delete tldrs[filePath];
				// Remove PIN state for deleted files
				if (this.pinManager) {
					await this.pinManager.removePinnedPath(filePath);
				}
			}

			// Delete all subdirectories
			const dirsToDelete = Object.keys(directories).filter(path => path.startsWith(fullPath + '/'));
			for (const dirPath of dirsToDelete) {
				delete directories[dirPath];
			}

			// Don't delete the root memories directory
			if (fullPath !== MEMORIES_DIR) {
				delete directories[fullPath];
			}

			await this.setFiles(files);
			await this.setAccessTimes(accessTimes);
			await this.setModifiedTimes(modifiedTimes);
			await this.setTldrs(tldrs);
			await this.setDirectories(directories);

			return `Directory deleted: ${memoryPath}`;
		}
		// Check if it's a file
		else {
			const files = this.getFiles();
			if (files[fullPath]) {
				const accessTimes = this.getAccessTimes();
				const modifiedTimes = this.getModifiedTimes();
				const tldrs = this.getTldrs();

				delete files[fullPath];
				delete accessTimes[fullPath];
				delete modifiedTimes[fullPath];
				delete tldrs[fullPath];

				await this.setFiles(files);
				await this.setAccessTimes(accessTimes);
				await this.setModifiedTimes(modifiedTimes);
				await this.setTldrs(tldrs);

				// Remove PIN state for deleted file
				if (this.pinManager) {
					await this.pinManager.removePinnedPath(fullPath);
				}

				return `File deleted: ${memoryPath}`;
			} else {
				throw new Error(`Cannot delete '${memoryPath}' because it does not exist. Use 'view' on '/memories' to see what files are available to delete.`);
			}
		}
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const oldFullPath = this.getFullPath(oldPath);
		const newFullPath = this.getFullPath(newPath);

		// Ensure parent directories exist for new path
		await this.ensureParentDirectories(newFullPath);

		const files = this.getFiles();
		const directories = this.getDirectories();
		const accessTimes = this.getAccessTimes();
		const modifiedTimes = this.getModifiedTimes();
		const tldrs = this.getTldrs();

		// Check if it's a file
		if (files[oldFullPath]) {
			const fileEntry = files[oldFullPath];

			// Move the file
			files[newFullPath] = fileEntry;
			delete files[oldFullPath];

			// Update metadata
			if (accessTimes[oldFullPath]) {
				accessTimes[newFullPath] = accessTimes[oldFullPath];
				delete accessTimes[oldFullPath];
			}
			if (modifiedTimes[oldFullPath]) {
				modifiedTimes[newFullPath] = modifiedTimes[oldFullPath];
				delete modifiedTimes[oldFullPath];
			}
			if (tldrs[oldFullPath]) {
				tldrs[newFullPath] = tldrs[oldFullPath];
				delete tldrs[oldFullPath];
			}

			await this.setFiles(files);
			await this.setAccessTimes(accessTimes);
			await this.setModifiedTimes(modifiedTimes);
			await this.setTldrs(tldrs);

			// Update PIN state for renamed file
			if (this.pinManager) {
				await this.pinManager.updatePinnedPath(oldFullPath, newFullPath);
			}
		}
		// Check if it's a directory
		else if (directories[oldFullPath]) {
			// Move the directory and all its contents
			directories[newFullPath] = true;
			delete directories[oldFullPath];

			// Move all files in the directory
			const filesToMove = Object.keys(files).filter(path => path.startsWith(oldFullPath + '/'));
			for (const filePath of filesToMove) {
				const newFilePath = newFullPath + filePath.slice(oldFullPath.length);
				files[newFilePath] = files[filePath];
				delete files[filePath];

				// Update metadata
				if (accessTimes[filePath]) {
					accessTimes[newFilePath] = accessTimes[filePath];
					delete accessTimes[filePath];
				}
				if (modifiedTimes[filePath]) {
					modifiedTimes[newFilePath] = modifiedTimes[filePath];
					delete modifiedTimes[filePath];
				}
				if (tldrs[filePath]) {
					tldrs[newFilePath] = tldrs[filePath];
					delete tldrs[filePath];
				}

				// Update PIN state for renamed files in directory
				if (this.pinManager) {
					await this.pinManager.updatePinnedPath(filePath, newFilePath);
				}
			}

			// Move all subdirectories
			const dirsToMove = Object.keys(directories).filter(path => path.startsWith(oldFullPath + '/'));
			for (const dirPath of dirsToMove) {
				const newDirPath = newFullPath + dirPath.slice(oldFullPath.length);
				directories[newDirPath] = true;
				delete directories[dirPath];
			}

			await this.setFiles(files);
			await this.setDirectories(directories);
			await this.setAccessTimes(accessTimes);
			await this.setModifiedTimes(modifiedTimes);
			await this.setTldrs(tldrs);
		}
		else {
			throw new Error(`Cannot rename '${oldPath}' because it does not exist. Use 'view' on '/memories' to see what files are available to rename.`);
		}
	}

	async listFiles(): Promise<IMemoryFileInfo[]> {
		const filesData: IMemoryFileInfo[] = [];
		const directories = this.getDirectories();
		const files = this.getFiles();
		const accessTimes = this.getAccessTimes();
		const modifiedTimes = this.getModifiedTimes();
		const tldrs = this.getTldrs();

		// Add all directories
		for (const dirPath of Object.keys(directories)) {
			if (dirPath === MEMORIES_DIR) {
				continue; // Skip root directory
			}

			const info: IMemoryFileInfo = {
				path: dirPath,
				name: path.posix.basename(dirPath),
				isDirectory: true,
				size: 0,
				lastAccessed: accessTimes[dirPath] ? new Date(accessTimes[dirPath]) : new Date(),
				lastModified: modifiedTimes[dirPath] ? new Date(modifiedTimes[dirPath]) : new Date(),
				isPinned: this.pinManager ? await this.pinManager.isPinned(dirPath) : false
			};
			filesData.push(info);
		}

		// Add all files
		for (const [filePath, fileEntry] of Object.entries(files)) {
			const modified = new Date(fileEntry.modified);
			const info: IMemoryFileInfo = {
				path: filePath,
				name: path.posix.basename(filePath),
				isDirectory: false,
				size: Buffer.from(fileEntry.content, 'utf8').length,
				lastAccessed: accessTimes[filePath] ? new Date(accessTimes[filePath]) : modified,
				lastModified: modifiedTimes[filePath] ? new Date(modifiedTimes[filePath]) : modified,
				isPinned: this.pinManager ? await this.pinManager.isPinned(filePath) : false,
				tldr: tldrs[filePath]
			};
			filesData.push(info);
		}

		return filesData.sort((a, b) => a.path.localeCompare(b.path));
	}

	async getTldr(memoryPath: string): Promise<string | undefined> {
		const fullPath = this.getFullPath(memoryPath);
		const tldrs = this.getTldrs();
		return tldrs[fullPath];
	}

	async setTldr(memoryPath: string, tldr: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);
		const tldrs = this.getTldrs();
		tldrs[fullPath] = tldr;
		await this.setTldrs(tldrs);
	}

	async deleteTldr(memoryPath: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);
		const tldrs = this.getTldrs();
		delete tldrs[fullPath];
		await this.setTldrs(tldrs);
	}
}

/**
 * Secret storage backend
 * Stores memory files encrypted in VS Code's secret storage
 * File metadata is stored in a separate secret for efficient listing
 */
export class SecretMemoryStorage implements IMemoryStorage {
	private secretStorage: vscode.SecretStorage;
	private workspaceFolder: vscode.WorkspaceFolder;
	private pinManager?: IPinManager;
	private readonly METADATA_KEY = 'agent-memory:metadata';
	private readonly KEY_PREFIX = 'agent-memory:file:';

	constructor(context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder) {
		this.secretStorage = context.secrets;
		this.workspaceFolder = workspaceFolder;
	}

	setPinManager(PINMANAGER: IPinManager): void {
		this.pinManager = PINMANAGER;
	}

	getWorkspaceId(): string {
		return this.workspaceFolder.name;
	}

	private getSecretKey(memoryPath: string): string {
		validateMemoryPath(memoryPath);
		const normalizedPath = memoryPath.startsWith(MEMORIES_DIR)
			? memoryPath
			: path.posix.join(MEMORIES_DIR, memoryPath);
		return `${this.KEY_PREFIX}${this.workspaceFolder.name}:${normalizedPath}`;
	}

	private getTldrSecretKey(memoryPath: string): string {
		return this.getSecretKey(memoryPath) + ':tldr';
	}

	private getFullPath(memoryPath: string): string {
		validateMemoryPath(memoryPath);
		// Normalize path: remove trailing slash (except for root)
		const normalized = normalizeMemoryPath(memoryPath);
		if (!normalized.startsWith(MEMORIES_DIR)) {
			return path.posix.join(MEMORIES_DIR, normalized);
		}
		return normalized;
	}

	private async getMetadata(): Promise<Map<string, { isDirectory: boolean; size: number; modified: Date; accessed: Date }>> {
		const METADATAKEY = `${this.METADATA_KEY}:${this.workspaceFolder.name}`;
		const METADATAJSON = await this.secretStorage.get(METADATAKEY);

		if (!METADATAJSON) {
			return new Map();
		}

		try {
			const METADATAOBJ = JSON.parse(METADATAJSON);
			const METADATAMAP = new Map<string, { isDirectory: boolean; size: number; modified: Date; accessed: Date }>();

			for (const [PATH, DATA] of Object.entries(METADATAOBJ)) {
				const ENTRY = DATA as { isDirectory: boolean; size: number; modified: string; accessed: string };
				METADATAMAP.set(PATH, {
					isDirectory: ENTRY.isDirectory,
					size: ENTRY.size,
					modified: new Date(ENTRY.modified),
					accessed: new Date(ENTRY.accessed)
				});
			}

			return METADATAMAP;
		} catch {
			return new Map();
		}
	}

	private async saveMetadata(METADATA: Map<string, { isDirectory: boolean; size: number; modified: Date; accessed: Date }>): Promise<void> {
		const METADATAKEY = `${this.METADATA_KEY}:${this.workspaceFolder.name}`;
		const METADATAOBJ: Record<string, { isDirectory: boolean; size: number; modified: string; accessed: string }> = {};

		for (const [PATH, DATA] of METADATA.entries()) {
			METADATAOBJ[PATH] = {
				isDirectory: DATA.isDirectory,
				size: DATA.size,
				modified: DATA.modified.toISOString(),
				accessed: DATA.accessed.toISOString()
			};
		}

		await this.secretStorage.store(METADATAKEY, JSON.stringify(METADATAOBJ));
	}

	private async updateFileMetadata(FULLPATH: string, SIZE: number): Promise<void> {
		const METADATA = await this.getMetadata();
		const NOW = new Date();

		// Ensure parent directories exist in metadata
		let PARENTDIR = path.posix.dirname(FULLPATH);
		while (PARENTDIR !== '/' && PARENTDIR !== MEMORIES_DIR) {
			if (!METADATA.has(PARENTDIR)) {
				METADATA.set(PARENTDIR, {
					isDirectory: true,
					size: 0,
					modified: NOW,
					accessed: NOW
				});
			}
			PARENTDIR = path.posix.dirname(PARENTDIR);
		}

		// Ensure root memories directory exists
		if (!METADATA.has(MEMORIES_DIR)) {
			METADATA.set(MEMORIES_DIR, {
				isDirectory: true,
				size: 0,
				modified: NOW,
				accessed: NOW
			});
		}

		METADATA.set(FULLPATH, {
			isDirectory: false,
			size: SIZE,
			modified: NOW,
			accessed: NOW
		});

		await this.saveMetadata(METADATA);
	}

	async view(memoryPath: string, viewRange?: [number, number]): Promise<string> {
		const FULLPATH = this.getFullPath(memoryPath);
		const METADATA = await this.getMetadata();
		const ENTRY = METADATA.get(FULLPATH);

		if (!ENTRY) {
			// Check if path is the root memories directory
			if (FULLPATH === MEMORIES_DIR) {
			const ITEMS: string[] = [];
			for (const [PATH, DATA] of METADATA.entries()) {
				if (PATH !== MEMORIES_DIR && PATH.startsWith(MEMORIES_DIR + '/')) {
					const RELATIVEPATH = PATH.slice(MEMORIES_DIR.length + 1);
					if (!RELATIVEPATH.includes('/')) {
						if (DATA.isDirectory) {
							ITEMS.push(`${RELATIVEPATH}/`);
						} else {
							const TLDRSECRETKEY = this.getTldrSecretKey(PATH);
							const TLDR = await this.secretStorage.get(TLDRSECRETKEY);
							if (TLDR) {
								ITEMS.push(`${RELATIVEPATH} - ${TLDR}`);
							} else {
								ITEMS.push(RELATIVEPATH);
							}
						}
					}
				}
			}

			if (ITEMS.length === 0) {
				return `Directory: ${memoryPath}\n(empty - no files created yet)`;
			}

			ITEMS.sort();
			return `Directory: ${memoryPath}\n${ITEMS.map(ITEM => `- ${ITEM}`).join('\n')}`;
		}			throw new Error(`The file '${memoryPath}' does not exist yet. Use the 'create' command to create it first, or use 'view' on the parent directory '/memories' to see available files.`);
		}

		if (ENTRY.isDirectory) {
			const ITEMS: string[] = [];
			for (const [PATH, DATA] of METADATA.entries()) {
				if (PATH !== FULLPATH && PATH.startsWith(FULLPATH + '/')) {
					const RELATIVEPATH = PATH.slice(FULLPATH.length + 1);
					if (!RELATIVEPATH.includes('/')) {
						if (DATA.isDirectory) {
							ITEMS.push(`${RELATIVEPATH}/`);
						} else {
							const TLDRSECRETKEY = this.getTldrSecretKey(PATH);
							const TLDR = await this.secretStorage.get(TLDRSECRETKEY);
							if (TLDR) {
								ITEMS.push(`${RELATIVEPATH} - ${TLDR}`);
							} else {
								ITEMS.push(RELATIVEPATH);
							}
						}
					}
				}
			}

			ITEMS.sort();
			return `Directory: ${memoryPath}\n${ITEMS.map(ITEM => `- ${ITEM}`).join('\n')}`;
		}

		// Update access time
		ENTRY.accessed = new Date();
		await this.saveMetadata(METADATA);

		// Read file content
		const SECRETKEY = this.getSecretKey(memoryPath);
		const CONTENT = await this.secretStorage.get(SECRETKEY);

		if (!CONTENT) {
			throw new Error(`The file '${memoryPath}' does not exist yet. Use the 'create' command to create it first, or use 'view' on the parent directory '/memories' to see available files.`);
		}

		const LINES = CONTENT.split('\n');
		let DISPLAYLINES = LINES;
		let STARTNUM = 1;

		if (viewRange && viewRange.length === 2) {
			const STARTLINE = Math.max(1, viewRange[0]) - 1;
			const ENDLINE = viewRange[1] === -1 ? LINES.length : viewRange[1];
			DISPLAYLINES = LINES.slice(STARTLINE, ENDLINE);
			STARTNUM = STARTLINE + 1;
		}

		const NUMBEREDLINES = DISPLAYLINES.map(
			(LINE, I) => `${String(I + STARTNUM).padStart(4, ' ')}: ${LINE}`
		);

		return NUMBEREDLINES.join('\n');
	}

	async readRaw(memoryPath: string): Promise<string> {
		const FULLPATH = this.getFullPath(memoryPath);
		const METADATA = await this.getMetadata();
		const ENTRY = METADATA.get(FULLPATH);

		if (!ENTRY || ENTRY.isDirectory) {
			throw new Error(`The file '${memoryPath}' does not exist.`);
		}

		// Update access time
		ENTRY.accessed = new Date();
		await this.saveMetadata(METADATA);

		const SECRETKEY = this.getSecretKey(memoryPath);
		const CONTENT = await this.secretStorage.get(SECRETKEY);

		if (!CONTENT) {
			throw new Error(`The file '${memoryPath}' does not exist.`);
		}

		return CONTENT;
	}

	async create(memoryPath: string, content: string): Promise<void> {
		const FULLPATH = this.getFullPath(memoryPath);
		const SECRETKEY = this.getSecretKey(memoryPath);

		await this.secretStorage.store(SECRETKEY, content);
		await this.updateFileMetadata(FULLPATH, Buffer.from(content, 'utf8').length);
	}

	async strReplace(memoryPath: string, oldStr: string, newStr: string): Promise<void> {
		const FULLPATH = this.getFullPath(memoryPath);
		const METADATA = await this.getMetadata();
		const ENTRY = METADATA.get(FULLPATH);

		if (!ENTRY || ENTRY.isDirectory) {
			throw new Error(`Cannot modify '${memoryPath}' because it does not exist. Use 'create' to create the file first, or 'view' to check available files in '/memories'.`);
		}

		const TEXT = await this.readRaw(memoryPath);
		const NEWTEXT = TextUtils.replaceFirst(TEXT, oldStr, newStr, memoryPath);

		const SECRETKEY = this.getSecretKey(memoryPath);
		await this.secretStorage.store(SECRETKEY, NEWTEXT);
		await this.updateFileMetadata(FULLPATH, Buffer.from(NEWTEXT, 'utf8').length);
	}

	async insert(memoryPath: string, insertLine: number, insertText: string): Promise<void> {
		const FULLPATH = this.getFullPath(memoryPath);
		const METADATA = await this.getMetadata();
		const ENTRY = METADATA.get(FULLPATH);

		if (!ENTRY || ENTRY.isDirectory) {
			throw new Error(`Cannot insert text into '${memoryPath}' because the file does not exist. Use 'create' to create the file first, or 'view' to check available files in '/memories'.`);
		}

		const TEXT = await this.readRaw(memoryPath);
		const NEWTEXT = TextUtils.insertAtLine(TEXT, insertLine, insertText);

		const SECRETKEY = this.getSecretKey(memoryPath);
		await this.secretStorage.store(SECRETKEY, NEWTEXT);
		await this.updateFileMetadata(FULLPATH, Buffer.from(NEWTEXT, 'utf8').length);
	}

	async delete(memoryPath: string): Promise<string> {
		const FULLPATH = this.getFullPath(memoryPath);
		const METADATA = await this.getMetadata();
		const ENTRY = METADATA.get(FULLPATH);

		if (!ENTRY) {
			throw new Error(`Cannot delete '${memoryPath}' because it does not exist. Use 'view' on '/memories' to see what files are available to delete.`);
		}

		if (ENTRY.isDirectory) {
			// Delete all files and subdirectories within this directory
			const PATHSTODELETE: string[] = [];
			for (const PATH of METADATA.keys()) {
				if (PATH.startsWith(FULLPATH + '/')) {
					PATHSTODELETE.push(PATH);
				}
			}

			for (const PATH of PATHSTODELETE) {
				const ITEMENTRY = METADATA.get(PATH);
				if (ITEMENTRY && !ITEMENTRY.isDirectory) {
					const SECRETKEY = this.getSecretKey(PATH);
					const TLDRSECRETKEY = this.getTldrSecretKey(PATH);
					await this.secretStorage.delete(SECRETKEY);
					await this.secretStorage.delete(TLDRSECRETKEY);

					if (this.pinManager) {
						await this.pinManager.removePinnedPath(PATH);
					}
				}
				METADATA.delete(PATH);
			}

			// Don't delete the root memories directory from metadata
			if (FULLPATH !== MEMORIES_DIR) {
				METADATA.delete(FULLPATH);
			}

			await this.saveMetadata(METADATA);
			return `Directory deleted: ${memoryPath}`;
		} else {
			const SECRETKEY = this.getSecretKey(memoryPath);
			const TLDRSECRETKEY = this.getTldrSecretKey(memoryPath);
			await this.secretStorage.delete(SECRETKEY);
			await this.secretStorage.delete(TLDRSECRETKEY);

			if (this.pinManager) {
				await this.pinManager.removePinnedPath(FULLPATH);
			}

			METADATA.delete(FULLPATH);
			await this.saveMetadata(METADATA);

			return `File deleted: ${memoryPath}`;
		}
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const OLDFULLPATH = this.getFullPath(oldPath);
		const NEWFULLPATH = this.getFullPath(newPath);
		const METADATA = await this.getMetadata();
		const ENTRY = METADATA.get(OLDFULLPATH);

		if (!ENTRY) {
			throw new Error(`Cannot rename '${oldPath}' because it does not exist. Use 'view' on '/memories' to see what files are available to rename.`);
		}

		if (ENTRY.isDirectory) {
			// Rename directory and all its contents
			const PATHSTORENAME: Array<[string, string]> = [];
			for (const PATH of METADATA.keys()) {
				if (PATH === OLDFULLPATH || PATH.startsWith(OLDFULLPATH + '/')) {
					const NEWITEMPATH = NEWFULLPATH + PATH.slice(OLDFULLPATH.length);
					PATHSTORENAME.push([PATH, NEWITEMPATH]);
				}
			}

			for (const [OLDITEMPATH, NEWITEMPATH] of PATHSTORENAME) {
				const ITEMENTRY = METADATA.get(OLDITEMPATH)!;

				if (!ITEMENTRY.isDirectory) {
					// Move the secret
					const OLDSECRETKEY = this.getSecretKey(OLDITEMPATH);
					const NEWSECRETKEY = this.getSecretKey(NEWITEMPATH);
					const OLDTLDRSECRETKEY = this.getTldrSecretKey(OLDITEMPATH);
					const NEWTLDRSECRETKEY = this.getTldrSecretKey(NEWITEMPATH);
					const CONTENT = await this.secretStorage.get(OLDSECRETKEY);

					if (CONTENT) {
						await this.secretStorage.store(NEWSECRETKEY, CONTENT);
						await this.secretStorage.delete(OLDSECRETKEY);
					}

					// Move TL;DR if it exists
					const TLDR = await this.secretStorage.get(OLDTLDRSECRETKEY);
					if (TLDR) {
						await this.secretStorage.store(NEWTLDRSECRETKEY, TLDR);
						await this.secretStorage.delete(OLDTLDRSECRETKEY);
					}

					if (this.pinManager) {
						await this.pinManager.updatePinnedPath(OLDITEMPATH, NEWITEMPATH);
					}
				}

				METADATA.set(NEWITEMPATH, ITEMENTRY);
				METADATA.delete(OLDITEMPATH);
			}
		} else {
			// Rename file
			const OLDSECRETKEY = this.getSecretKey(oldPath);
			const NEWSECRETKEY = this.getSecretKey(newPath);
			const OLDTLDRSECRETKEY = this.getTldrSecretKey(oldPath);
			const NEWTLDRSECRETKEY = this.getTldrSecretKey(newPath);
			const CONTENT = await this.secretStorage.get(OLDSECRETKEY);

			if (!CONTENT) {
				throw new Error(`Cannot rename '${oldPath}' because it does not exist. Use 'view' on '/memories' to see what files are available to rename.`);
			}

			await this.secretStorage.store(NEWSECRETKEY, CONTENT);
			await this.secretStorage.delete(OLDSECRETKEY);

			// Move TL;DR if it exists
			const TLDR = await this.secretStorage.get(OLDTLDRSECRETKEY);
			if (TLDR) {
				await this.secretStorage.store(NEWTLDRSECRETKEY, TLDR);
				await this.secretStorage.delete(OLDTLDRSECRETKEY);
			}

			if (this.pinManager) {
				await this.pinManager.updatePinnedPath(OLDFULLPATH, NEWFULLPATH);
			}

			METADATA.set(NEWFULLPATH, ENTRY);
			METADATA.delete(OLDFULLPATH);
		}

		await this.saveMetadata(METADATA);
	}

	async listFiles(): Promise<IMemoryFileInfo[]> {
		const METADATA = await this.getMetadata();
		const FILES: IMemoryFileInfo[] = [];

		for (const [PATH, DATA] of METADATA.entries()) {
			if (PATH === MEMORIES_DIR) {
				continue; // Skip root directory
			}

			let tldr: string | undefined;
			if (!DATA.isDirectory) {
				const TLDRSECRETKEY = this.getTldrSecretKey(PATH);
				tldr = await this.secretStorage.get(TLDRSECRETKEY);
			}

			const INFO: IMemoryFileInfo = {
				path: PATH,
				name: path.posix.basename(PATH),
				isDirectory: DATA.isDirectory,
				size: DATA.size,
				lastAccessed: DATA.accessed,
				lastModified: DATA.modified,
				isPinned: this.pinManager ? await this.pinManager.isPinned(PATH) : false,
				tldr
			};
			FILES.push(INFO);
		}

		return FILES.sort((A, B) => A.path.localeCompare(B.path));
	}

	async getTldr(memoryPath: string): Promise<string | undefined> {
		const TLDRSECRETKEY = this.getTldrSecretKey(memoryPath);
		return await this.secretStorage.get(TLDRSECRETKEY);
	}

	async setTldr(memoryPath: string, tldr: string): Promise<void> {
		const TLDRSECRETKEY = this.getTldrSecretKey(memoryPath);
		await this.secretStorage.store(TLDRSECRETKEY, tldr);
	}

	async deleteTldr(memoryPath: string): Promise<void> {
		const TLDRSECRETKEY = this.getTldrSecretKey(memoryPath);
		await this.secretStorage.delete(TLDRSECRETKEY);
	}
}

/**
 * Disk-based storage backend
 * Stores memory files in .vscode/memory directory
 */
export class DiskMemoryStorage implements IMemoryStorage {
	private fs: vscode.FileSystem;
	private workspaceUri: vscode.Uri;
	private pinManager?: IPinManager;

	constructor(private workspaceFolder: vscode.WorkspaceFolder) {
		this.fs = vscode.workspace.fs;
		this.workspaceUri = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'memory');
		this.ensureMemoriesDir();
	}

	setPinManager(pinManager: IPinManager): void {
		this.pinManager = pinManager;
	}

	getWorkspaceId(): string {
		return this.workspaceFolder.name;
	}

	private async ensureMemoriesDir(): Promise<void> {
		try {
			await this.fs.createDirectory(this.workspaceUri);
		} catch {
			// Directory might already exist
		}
	}

	private getUri(memoryPath: string): vscode.Uri {
		validateMemoryPath(memoryPath);
		let relativePath = memoryPath.startsWith(MEMORIES_DIR)
			? memoryPath.slice(MEMORIES_DIR.length)
			: memoryPath;
		
		// Remove leading slash to make it a proper relative path
		// This handles both "/memories" -> "" and "/memories/" -> "/"
		if (relativePath.startsWith('/')) {
			relativePath = relativePath.slice(1);
		}
		
		// If empty (i.e., the root /memories directory), use '.' for current directory
		if (relativePath === '') {
			relativePath = '.';
		}
		
		return vscode.Uri.joinPath(this.workspaceUri, relativePath);
	}

	private getTldrUri(memoryPath: string): vscode.Uri {
		const uri = this.getUri(memoryPath);
		return vscode.Uri.parse(uri.toString() + '.tldr');
	}

	async view(memoryPath: string, viewRange?: [number, number]): Promise<string> {
		const uri = this.getUri(memoryPath);

		try {
			const stat = await this.fs.stat(uri);

			if (stat.type === vscode.FileType.Directory) {
				// List directory contents
				const entries = await this.fs.readDirectory(uri);
				const items: string[] = [];
				for (const [name, type] of entries) {
					// Skip .tldr files in listing
					if (name.endsWith('.tldr')) {
						continue;
					}

					if (type === vscode.FileType.Directory) {
						items.push(`${name}/`);
					} else {
						// Try to read TL;DR for file
						try {
							const fileUri = vscode.Uri.joinPath(uri, name);
							const tldrUri = vscode.Uri.parse(fileUri.toString() + '.tldr');
							const tldrContent = await this.fs.readFile(tldrUri);
							const tldr = Buffer.from(tldrContent).toString('utf8');
							if (tldr) {
								items.push(`${name} - ${tldr}`);
							} else {
								items.push(name);
							}
						} catch {
							// No TL;DR file exists
							items.push(name);
						}
					}
				}
				items.sort();
				return `Directory: ${memoryPath}\n${items.map(item => `- ${item}`).join('\n')}`;
			} else {
				// Read file contents
				const content = await this.fs.readFile(uri);
				const text = Buffer.from(content).toString('utf8');
				const lines = text.split('\n');

				let displayLines = lines;
				let startNum = 1;

				if (viewRange && viewRange.length === 2) {
					const startLine = Math.max(1, viewRange[0]) - 1;
					const endLine = viewRange[1] === -1 ? lines.length : viewRange[1];
					displayLines = lines.slice(startLine, endLine);
					startNum = startLine + 1;
				}

				const numberedLines = displayLines.map(
					(line, i) => `${String(i + startNum).padStart(4, ' ')}: ${line}`
				);

				return numberedLines.join('\n');
			}
		} catch (error) {
			if ((error as vscode.FileSystemError).code === 'FileNotFound') {
				throw new Error(`The file '${memoryPath}' does not exist yet. Use the 'create' command to create it first, or use 'view' on the parent directory '/memories' to see available files.`);
			}
			throw error;
		}
	}

	async readRaw(memoryPath: string): Promise<string> {
		const uri = this.getUri(memoryPath);

		try {
			const content = await this.fs.readFile(uri);
			return Buffer.from(content).toString('utf8');
		} catch (error) {
			if ((error as vscode.FileSystemError).code === 'FileNotFound') {
				throw new Error(`The file '${memoryPath}' does not exist.`);
			}
			throw error;
		}
	}

	async create(memoryPath: string, content: string): Promise<void> {
		const uri = this.getUri(memoryPath);

		// Ensure parent directory exists
		const parentUri = vscode.Uri.joinPath(uri, '..');
		try {
			await this.fs.createDirectory(parentUri);
		} catch {
			// Parent might already exist
		}

		await this.fs.writeFile(uri, Buffer.from(content, 'utf8'));
	}

	async strReplace(memoryPath: string, oldStr: string, newStr: string): Promise<void> {
		const uri = this.getUri(memoryPath);

		try {
			const content = await this.fs.readFile(uri);
			const text = Buffer.from(content).toString('utf8');

			const newText = TextUtils.replaceFirst(text, oldStr, newStr, memoryPath);
			await this.fs.writeFile(uri, Buffer.from(newText, 'utf8'));
		} catch (error) {
			if ((error as vscode.FileSystemError).code === 'FileNotFound') {
				throw new Error(`Cannot modify '${memoryPath}' because it does not exist. Use 'create' to create the file first, or 'view' to check available files in '/memories'.`);
			}
			throw error;
		}
	}

	async insert(memoryPath: string, insertLine: number, insertText: string): Promise<void> {
		const uri = this.getUri(memoryPath);

		try {
			const content = await this.fs.readFile(uri);
			const text = Buffer.from(content).toString('utf8');

			const newText = TextUtils.insertAtLine(text, insertLine, insertText);

			await this.fs.writeFile(uri, Buffer.from(newText, 'utf8'));
		} catch (error) {
			if ((error as vscode.FileSystemError).code === 'FileNotFound') {
				throw new Error(`Cannot insert text into '${memoryPath}' because the file does not exist. Use 'create' to create the file first, or 'view' to check available files in '/memories'.`);
			}
			throw error;
		}
	}

	async delete(memoryPath: string): Promise<string> {
		const uri = this.getUri(memoryPath);

		try {
			const stat = await this.fs.stat(uri);
			const isDirectory = stat.type === vscode.FileType.Directory;

			// Remove PIN state before deletion
			if (this.pinManager) {
				const fullPath = this.getFullPath(memoryPath);
				if (isDirectory) {
					// Remove PIN state for all files in directory
					const allFiles = await this.listFiles();
					for (const file of allFiles.filter(f => f.path.startsWith(fullPath + '/'))) {
						await this.pinManager.removePinnedPath(file.path);
					}
				} else {
					await this.pinManager.removePinnedPath(fullPath);
					// Also delete TL;DR file if it exists
					try {
						const tldrUri = this.getTldrUri(memoryPath);
						await this.fs.delete(tldrUri);
					} catch {
						// TL;DR file might not exist
					}
				}
			}

			await this.fs.delete(uri, { recursive: true });

			return isDirectory ? `Directory deleted: ${memoryPath}` : `File deleted: ${memoryPath}`;
		} catch (error) {
			if ((error as vscode.FileSystemError).code === 'FileNotFound') {
				throw new Error(`Cannot delete '${memoryPath}' because it does not exist. Use 'view' on '/memories' to see what files are available to delete.`);
			}
			throw error;
		}
	}

	private getFullPath(memoryPath: string): string {
		// Normalize path to always start with /memories
		if (!memoryPath.startsWith(MEMORIES_DIR)) {
			return path.posix.join(MEMORIES_DIR, memoryPath);
		}
		return memoryPath;
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const oldUri = this.getUri(oldPath);
		const newUri = this.getUri(newPath);

		// Ensure parent directory of new path exists
		const parentUri = vscode.Uri.joinPath(newUri, '..');
		try {
			await this.fs.createDirectory(parentUri);
		} catch {
			// Parent might already exist
		}

		try {
			// Update PIN state before renaming
			if (this.pinManager) {
				const oldFullPath = this.getFullPath(oldPath);
				const newFullPath = this.getFullPath(newPath);

				const stat = await this.fs.stat(oldUri);
				if (stat.type === vscode.FileType.Directory) {
					// Handle directory renaming - update all files within
					const allFiles = await this.listFiles();
					for (const file of allFiles.filter(f => f.path.startsWith(oldFullPath + '/'))) {
						const newFilePath = newFullPath + file.path.slice(oldFullPath.length);
						await this.pinManager.updatePinnedPath(file.path, newFilePath);
					}
				} else {
					await this.pinManager.updatePinnedPath(oldFullPath, newFullPath);
					// Also rename TL;DR file if it exists
					try {
						const oldTldrUri = this.getTldrUri(oldPath);
						const newTldrUri = this.getTldrUri(newPath);
						await this.fs.rename(oldTldrUri, newTldrUri, { overwrite: false });
					} catch {
						// TL;DR file might not exist
					}
				}
			}

			await this.fs.rename(oldUri, newUri, { overwrite: false });
		} catch (error) {
			if ((error as vscode.FileSystemError).code === 'FileNotFound') {
				throw new Error(`Cannot rename '${oldPath}' because it does not exist. Use 'view' on '/memories' to see what files are available to rename.`);
			}
			throw error;
		}
	}

	async listFiles(): Promise<IMemoryFileInfo[]> {
		const files: IMemoryFileInfo[] = [];

		const processDirectory = async (dirUri: vscode.Uri, dirPath: string): Promise<void> => {
			try {
				const entries = await this.fs.readDirectory(dirUri);

				for (const [name, type] of entries) {
					const fullPath = path.posix.join(dirPath, name);
					const uri = vscode.Uri.joinPath(dirUri, name);

					// Skip .tldr files
					if (name.endsWith('.tldr')) {
						continue;
					}

					const stat = await this.fs.stat(uri);

					let tldr: string | undefined;
					if (type !== vscode.FileType.Directory) {
						// Try to read TL;DR file
						try {
							const tldrUri = vscode.Uri.parse(uri.toString() + '.tldr');
							const tldrContent = await this.fs.readFile(tldrUri);
							tldr = Buffer.from(tldrContent).toString('utf8');
						} catch {
							// TL;DR file doesn't exist
						}
					}

					const info: IMemoryFileInfo = {
						path: fullPath,
						name,
						isDirectory: type === vscode.FileType.Directory,
						size: stat.size,
						lastAccessed: new Date(stat.mtime), // Use mtime as approximation
						lastModified: new Date(stat.mtime),
						isPinned: this.pinManager ? await this.pinManager.isPinned(fullPath) : false,
						tldr
					};

					files.push(info);

					if (type === vscode.FileType.Directory) {
						await processDirectory(uri, fullPath);
					}
				}
			} catch {
				// Directory might not exist yet
			}
		};

		await processDirectory(this.workspaceUri, MEMORIES_DIR);
		return files;
	}

	async getTldr(memoryPath: string): Promise<string | undefined> {
		try {
			const tldrUri = this.getTldrUri(memoryPath);
			const content = await this.fs.readFile(tldrUri);
			return Buffer.from(content).toString('utf8');
		} catch {
			return undefined;
		}
	}

	async setTldr(memoryPath: string, tldr: string): Promise<void> {
		const tldrUri = this.getTldrUri(memoryPath);
		await this.fs.writeFile(tldrUri, Buffer.from(tldr, 'utf8'));
	}

	async deleteTldr(memoryPath: string): Promise<void> {
		try {
			const tldrUri = this.getTldrUri(memoryPath);
			await this.fs.delete(tldrUri);
		} catch {
			// TL;DR file might not exist
		}
	}
}
