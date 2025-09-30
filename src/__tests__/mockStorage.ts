import { IMemoryStorage, IMemoryFileInfo, IPinManager } from '../types';
import { validateMemoryPath } from '../lib/pathValidation';
import { TextUtils } from '../lib/utils';

/**
 * Simple in-memory mock storage for testing
 * Does not rely on VS Code APIs
 */
export class MockMemoryStorage implements IMemoryStorage {
	private files = new Map<string, string>();
	private directories = new Set<string>();
	private workspaceId: string;
	private pinManager?: IPinManager;

	constructor(workspaceId = 'test-workspace') {
		this.workspaceId = workspaceId;
		// Initialize root directory
		this.directories.add('/memories');
	}

	setPinManager(pinManager: IPinManager): void {
		this.pinManager = pinManager;
	}

	getWorkspaceId(): string {
		return this.workspaceId;
	}

	async view(path: string, viewRange?: [number, number]): Promise<string> {
		validateMemoryPath(path);

		if (this.directories.has(path)) {
			// List directory contents
			const contents: string[] = [];
			const pathPrefix = path === '/memories' ? '/memories/' : `${path}/`;

			// Find immediate children
			for (const filePath of this.files.keys()) {
				if (filePath.startsWith(pathPrefix)) {
					const relativePart = filePath.slice(pathPrefix.length);
					if (!relativePart.includes('/')) {
						contents.push(relativePart);
					}
				}
			}

			for (const dirPath of this.directories) {
				if (dirPath !== path && dirPath.startsWith(pathPrefix)) {
					const relativePart = dirPath.slice(pathPrefix.length);
					if (!relativePart.includes('/')) {
						contents.push(`${relativePart}/`);
					}
				}
			}

			contents.sort();
			return `Directory: ${path}\n${contents.map(item => `- ${item}`).join('\n')}`;
		}

		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`File or directory not found: ${path}`);
		}

		const lines = content.split('\n');
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

	async readRaw(path: string): Promise<string> {
		validateMemoryPath(path);

		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`File not found: ${path}`);
		}

		return content;
	}

	async create(path: string, content: string): Promise<void> {
		validateMemoryPath(path);

		// Ensure parent directories exist
		const parts = path.split('/');
		let currentPath = '';
		for (let i = 0; i < parts.length - 1; i++) {
			currentPath += parts[i];
			if (i > 0) { // Skip empty first part
				this.directories.add(currentPath);
			}
			if (i < parts.length - 1) {
				currentPath += '/';
			}
		}

		this.files.set(path, content);
	}

	async strReplace(path: string, oldStr: string, newStr: string): Promise<void> {
		validateMemoryPath(path);

		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`File not found: ${path}`);
		}

		const newContent = TextUtils.replaceFirst(content, oldStr, newStr, path);
		this.files.set(path, newContent);
	}

	async insert(path: string, insertLine: number, insertText: string): Promise<void> {
		validateMemoryPath(path);

		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`File not found: ${path}`);
		}

		const newContent = TextUtils.insertAtLine(content, insertLine, insertText);
		this.files.set(path, newContent);
	}

	async delete(path: string): Promise<string> {
		validateMemoryPath(path);

		const isDirectory = this.directories.has(path);
		const isFile = this.files.has(path);

		if (!isDirectory && !isFile) {
			throw new Error(`File or directory not found: ${path}`);
		}

		if (isDirectory) {
			// Delete directory and all contents
			const pathPrefix = `${path}/`;

			// Delete all files in directory
			const filesToDelete: string[] = [];
			for (const filePath of this.files.keys()) {
				if (filePath.startsWith(pathPrefix)) {
					filesToDelete.push(filePath);
				}
			}
			filesToDelete.forEach(f => this.files.delete(f));

			// Delete all subdirectories
			const dirsToDelete: string[] = [];
			for (const dirPath of this.directories) {
				if (dirPath.startsWith(pathPrefix)) {
					dirsToDelete.push(dirPath);
				}
			}
			dirsToDelete.forEach(d => this.directories.delete(d));

			this.directories.delete(path);
			return `Directory deleted: ${path}`;
		} else {
			this.files.delete(path);
			return `File deleted: ${path}`;
		}
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		validateMemoryPath(oldPath);
		validateMemoryPath(newPath);

		const isDirectory = this.directories.has(oldPath);
		const isFile = this.files.has(oldPath);

		if (!isDirectory && !isFile) {
			throw new Error(`File or directory not found: ${oldPath}`);
		}

		// Ensure parent directories of new path exist
		const parts = newPath.split('/');
		let currentPath = '';
		for (let i = 0; i < parts.length - 1; i++) {
			currentPath += parts[i];
			if (i > 0) {
				this.directories.add(currentPath);
			}
			if (i < parts.length - 1) {
				currentPath += '/';
			}
		}

		if (isDirectory) {
			// Rename directory and all contents
			const oldPrefix = `${oldPath}/`;
			const newPrefix = `${newPath}/`;

			// Rename all files
			const filesToRename = new Map<string, string>();
			for (const [filePath, content] of this.files) {
				if (filePath.startsWith(oldPrefix)) {
					const newFilePath = filePath.replace(oldPrefix, newPrefix);
					filesToRename.set(newFilePath, content);
					this.files.delete(filePath);
				}
			}
			filesToRename.forEach((content, path) => this.files.set(path, content));

			// Rename all subdirectories
			const dirsToRename = new Set<string>();
			for (const dirPath of this.directories) {
				if (dirPath.startsWith(oldPrefix)) {
					const newDirPath = dirPath.replace(oldPrefix, newPrefix);
					dirsToRename.add(newDirPath);
					this.directories.delete(dirPath);
				}
			}
			dirsToRename.forEach(d => this.directories.add(d));

			this.directories.delete(oldPath);
			this.directories.add(newPath);
		} else {
			const content = this.files.get(oldPath)!;
			this.files.delete(oldPath);
			this.files.set(newPath, content);
		}
	}

	async listFiles(): Promise<IMemoryFileInfo[]> {
		const files: IMemoryFileInfo[] = [];
		const now = new Date();

		// Add all files
		for (const [path, content] of this.files) {
			const parts = path.split('/');
			const name = parts[parts.length - 1];
			files.push({
				path,
				name,
				isDirectory: false,
				size: Buffer.from(content).length,
				lastAccessed: now,
				lastModified: now,
				isPinned: this.pinManager ? await this.pinManager.isPinned(path) : false
			});
		}

		// Add all directories (except root)
		for (const path of this.directories) {
			if (path !== '/memories') {
				const parts = path.split('/');
				const name = parts[parts.length - 1];
				files.push({
					path,
					name,
					isDirectory: true,
					size: 0,
					lastAccessed: now,
					lastModified: now,
					isPinned: this.pinManager ? await this.pinManager.isPinned(path) : false
				});
			}
		}

		return files;
	}
}
