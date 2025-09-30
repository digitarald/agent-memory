import * as vscode from 'vscode';
import * as path from 'path';
import { IMemoryStorage, IMemoryFileInfo, IPinManager } from './types.js';
import { validateMemoryPath, getMemoriesDir } from './lib/pathValidation.js';
import { TextUtils } from './lib/utils.js';

const MEMORIES_DIR = getMemoriesDir();

/**
 * In-memory storage implementation using Map-based storage
 * Provides workspace-scoped ephemeral storage without requiring VS Code's memfs scheme
 */
export class InMemoryStorage implements IMemoryStorage {
	private fileMap = new Map<string, { content: Uint8Array; modified: Date }>();
	private directorySet = new Set<string>();
	private lastAccessMap = new Map<string, Date>();
	private lastModifiedMap = new Map<string, Date>();
	private pinManager?: IPinManager;

	constructor(private workspaceFolder: vscode.WorkspaceFolder) {
		// Initialize with root memories directory
		this.directorySet.add(MEMORIES_DIR);
	}

	setPinManager(pinManager: IPinManager): void {
		this.pinManager = pinManager;
	}

	getWorkspaceId(): string {
		return this.workspaceFolder.name;
	}

	private getFullPath(memoryPath: string): string {
		validateMemoryPath(memoryPath);
		// Normalize path to always start with /memories
		if (!memoryPath.startsWith(MEMORIES_DIR)) {
			return path.posix.join(MEMORIES_DIR, memoryPath);
		}
		return memoryPath;
	}

	private ensureParentDirectories(filePath: string): void {
		const parentDir = path.posix.dirname(filePath);
		if (!this.directorySet.has(parentDir)) {
			this.ensureParentDirectories(parentDir);
			this.directorySet.add(parentDir);
		}
	}

	async view(memoryPath: string, viewRange?: [number, number]): Promise<string> {
		const fullPath = this.getFullPath(memoryPath);
		this.lastAccessMap.set(fullPath, new Date());

		try {
			// Check if it's a directory
			if (this.directorySet.has(fullPath)) {
				// List directory contents
				const items: string[] = [];

				// Find all files and subdirectories in this directory
				for (const dirPath of this.directorySet) {
					if (dirPath !== fullPath && dirPath.startsWith(fullPath + '/')) {
						const relativePath = dirPath.slice(fullPath.length + 1);
						if (!relativePath.includes('/')) {
							items.push(relativePath + '/');
						}
					}
				}

				for (const filePath of this.fileMap.keys()) {
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
			const fileEntry = this.fileMap.get(fullPath);
			if (!fileEntry) {
				throw new Error(`The file '${memoryPath}' does not exist yet. Use the 'create' command to create it first, or use 'view' on the parent directory '/memories' to see available files.`);
			}

			const text = Buffer.from(fileEntry.content).toString('utf8');
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
		this.lastAccessMap.set(fullPath, new Date());

		const fileEntry = this.fileMap.get(fullPath);
		if (!fileEntry) {
			throw new Error(`The file '${memoryPath}' does not exist.`);
		}

		return Buffer.from(fileEntry.content).toString('utf8');
	}

	async create(memoryPath: string, content: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);

		// Ensure parent directories exist
		this.ensureParentDirectories(fullPath);

		// Store the file
		const now = new Date();
		this.fileMap.set(fullPath, {
			content: Buffer.from(content, 'utf8'),
			modified: now
		});
		this.lastAccessMap.set(fullPath, now);
		this.lastModifiedMap.set(fullPath, now);
	}

	async strReplace(memoryPath: string, oldStr: string, newStr: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);

		const fileEntry = this.fileMap.get(fullPath);
		if (!fileEntry) {
			throw new Error(`Cannot modify '${memoryPath}' because it does not exist. Use 'create' to create the file first, or 'view' to check available files in '/memories'.`);
		}

		const text = Buffer.from(fileEntry.content).toString('utf8');
		const newText = TextUtils.replaceFirst(text, oldStr, newStr, memoryPath);

		const now = new Date();
		this.fileMap.set(fullPath, {
			content: Buffer.from(newText, 'utf8'),
			modified: now
		});
		this.lastAccessMap.set(fullPath, now);
		this.lastModifiedMap.set(fullPath, now);
	}

	async insert(memoryPath: string, insertLine: number, insertText: string): Promise<void> {
		const fullPath = this.getFullPath(memoryPath);

		const fileEntry = this.fileMap.get(fullPath);
		if (!fileEntry) {
			throw new Error(`Cannot insert text into '${memoryPath}' because the file does not exist. Use 'create' to create the file first, or 'view' to check available files in '/memories'.`);
		}

		const text = Buffer.from(fileEntry.content).toString('utf8');
		const newText = TextUtils.insertAtLine(text, insertLine, insertText);

		const now = new Date();
		this.fileMap.set(fullPath, {
			content: Buffer.from(newText, 'utf8'),
			modified: now
		});
		this.lastAccessMap.set(fullPath, now);
		this.lastModifiedMap.set(fullPath, now);
	}

	async delete(memoryPath: string): Promise<string> {
		const fullPath = this.getFullPath(memoryPath);

		// Check if it's a directory
		if (this.directorySet.has(fullPath)) {
			// Delete all files and subdirectories within this directory
			const filesToDelete = Array.from(this.fileMap.keys()).filter(path => path.startsWith(fullPath + '/'));
			for (const filePath of filesToDelete) {
				this.fileMap.delete(filePath);
				this.lastAccessMap.delete(filePath);
				this.lastModifiedMap.delete(filePath);
				// Remove PIN state for deleted files
				if (this.pinManager) {
					await this.pinManager.removePinnedPath(filePath);
				}
			}

			const dirsToDelete = Array.from(this.directorySet).filter(path => path.startsWith(fullPath + '/'));
			for (const dirPath of dirsToDelete) {
				this.directorySet.delete(dirPath);
			}

			// Don't delete the root memories directory
			if (fullPath !== MEMORIES_DIR) {
				this.directorySet.delete(fullPath);
			}

			return `Directory deleted: ${memoryPath}`;
		}
		// Check if it's a file
		else if (this.fileMap.has(fullPath)) {
			this.fileMap.delete(fullPath);
			this.lastAccessMap.delete(fullPath);
			this.lastModifiedMap.delete(fullPath);

			// Remove PIN state for deleted file
			if (this.pinManager) {
				await this.pinManager.removePinnedPath(fullPath);
			}

			return `File deleted: ${memoryPath}`;
		}
		else {
			throw new Error(`Cannot delete '${memoryPath}' because it does not exist. Use 'view' on '/memories' to see what files are available to delete.`);
		}
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const oldFullPath = this.getFullPath(oldPath);
		const newFullPath = this.getFullPath(newPath);

		// Ensure parent directories exist for new path
		this.ensureParentDirectories(newFullPath);

		// Check if it's a file
		if (this.fileMap.has(oldFullPath)) {
			const fileEntry = this.fileMap.get(oldFullPath)!;

			// Move the file
			this.fileMap.set(newFullPath, fileEntry);
			this.fileMap.delete(oldFullPath);

			// Update metadata
			const accessTime = this.lastAccessMap.get(oldFullPath);
			const modifiedTime = this.lastModifiedMap.get(oldFullPath);

			this.lastAccessMap.delete(oldFullPath);
			this.lastModifiedMap.delete(oldFullPath);

			if (accessTime) {
				this.lastAccessMap.set(newFullPath, accessTime);
			}
			if (modifiedTime) {
				this.lastModifiedMap.set(newFullPath, modifiedTime);
			}

			// Update PIN state for renamed file
			if (this.pinManager) {
				await this.pinManager.updatePinnedPath(oldFullPath, newFullPath);
			}
		}
		// Check if it's a directory
		else if (this.directorySet.has(oldFullPath)) {
			// Move the directory and all its contents
			this.directorySet.add(newFullPath);
			this.directorySet.delete(oldFullPath);

			// Move all files in the directory
			const filesToMove = Array.from(this.fileMap.entries()).filter(([path]) => path.startsWith(oldFullPath + '/'));
			for (const [filePath, fileEntry] of filesToMove) {
				const newFilePath = newFullPath + filePath.slice(oldFullPath.length);
				this.fileMap.set(newFilePath, fileEntry);
				this.fileMap.delete(filePath);

				// Update metadata
				const accessTime = this.lastAccessMap.get(filePath);
				const modifiedTime = this.lastModifiedMap.get(filePath);
				this.lastAccessMap.delete(filePath);
				this.lastModifiedMap.delete(filePath);
				if (accessTime) {
					this.lastAccessMap.set(newFilePath, accessTime);
				}
				if (modifiedTime) {
					this.lastModifiedMap.set(newFilePath, modifiedTime);
				}

				// Update PIN state for renamed files in directory
				if (this.pinManager) {
					await this.pinManager.updatePinnedPath(filePath, newFilePath);
				}
			}

			// Move all subdirectories
			const dirsToMove = Array.from(this.directorySet).filter(path => path.startsWith(oldFullPath + '/'));
			for (const dirPath of dirsToMove) {
				const newDirPath = newFullPath + dirPath.slice(oldFullPath.length);
				this.directorySet.add(newDirPath);
				this.directorySet.delete(dirPath);
			}
		}
		else {
			throw new Error(`Cannot rename '${oldPath}' because it does not exist. Use 'view' on '/memories' to see what files are available to rename.`);
		}
	}

	async listFiles(): Promise<IMemoryFileInfo[]> {
		const files: IMemoryFileInfo[] = [];

		// Add all directories
		for (const dirPath of this.directorySet) {
			if (dirPath === MEMORIES_DIR) {
				continue; // Skip root directory
			}

			const info: IMemoryFileInfo = {
				path: dirPath,
				name: path.posix.basename(dirPath),
				isDirectory: true,
				size: 0,
				lastAccessed: new Date(),
				lastModified: new Date(),
				isPinned: this.pinManager ? await this.pinManager.isPinned(dirPath) : false
			};
			files.push(info);
		}

		// Add all files
		for (const [filePath, fileEntry] of this.fileMap.entries()) {
			const info: IMemoryFileInfo = {
				path: filePath,
				name: path.posix.basename(filePath),
				isDirectory: false,
				size: fileEntry.content.length,
				lastAccessed: this.lastAccessMap.get(filePath) || fileEntry.modified,
				lastModified: this.lastModifiedMap.get(filePath) || fileEntry.modified,
				isPinned: this.pinManager ? await this.pinManager.isPinned(filePath) : false
			};
			files.push(info);
		}

		return files.sort((a, b) => a.path.localeCompare(b.path));
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
		const relativePath = memoryPath.startsWith(MEMORIES_DIR)
			? memoryPath.slice(MEMORIES_DIR.length)
			: memoryPath;
		return vscode.Uri.joinPath(this.workspaceUri, relativePath);
	}

	async view(memoryPath: string, viewRange?: [number, number]): Promise<string> {
		const uri = this.getUri(memoryPath);

		try {
			const stat = await this.fs.stat(uri);

			if (stat.type === vscode.FileType.Directory) {
				// List directory contents
				const entries = await this.fs.readDirectory(uri);
				const items = entries
					.map(([name, type]) =>
						type === vscode.FileType.Directory ? `${name}/` : name
					)
					.sort();
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
					const stat = await this.fs.stat(uri);

					const info: IMemoryFileInfo = {
						path: fullPath,
						name,
						isDirectory: type === vscode.FileType.Directory,
						size: stat.size,
						lastAccessed: new Date(stat.mtime), // Use mtime as approximation
						lastModified: new Date(stat.mtime),
						isPinned: this.pinManager ? await this.pinManager.isPinned(fullPath) : false
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
}
