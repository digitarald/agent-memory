import * as vscode from 'vscode';
import { IPinManager } from './types.js';

/**
 * PIN manager implementation using VSCode's storage APIs
 */
export class PinManager implements IPinManager {
	private static readonly PIN_STORAGE_KEY = 'pinnedMemoryFiles';
	private context: vscode.ExtensionContext;
	private workspaceFolder: vscode.WorkspaceFolder;
	private useGlobalStorage: boolean;

	constructor(
		context: vscode.ExtensionContext,
		workspaceFolder: vscode.WorkspaceFolder,
		useGlobalStorage = false
	) {
		this.context = context;
		this.workspaceFolder = workspaceFolder;
		this.useGlobalStorage = useGlobalStorage;
	}

	getWorkspaceId(): string {
		return this.workspaceFolder.name;
	}

	private getStorageKey(): string {
		if (this.useGlobalStorage) {
			return PinManager.PIN_STORAGE_KEY;
		}
		return `${PinManager.PIN_STORAGE_KEY}_${this.workspaceFolder.name}`;
	}

	private getStorage(): vscode.Memento {
		return this.useGlobalStorage ? this.context.globalState : this.context.workspaceState;
	}

	async getPinnedFiles(): Promise<string[]> {
		const storage = this.getStorage();
		const pinnedFiles = storage.get<string[]>(this.getStorageKey(), []);
		return pinnedFiles;
	}

	async isPinned(path: string): Promise<boolean> {
		const pinnedFiles = await this.getPinnedFiles();
		return pinnedFiles.includes(path);
	}

	async pinFile(path: string): Promise<void> {
		const storage = this.getStorage();
		const pinnedFiles = await this.getPinnedFiles();

		if (!pinnedFiles.includes(path)) {
			pinnedFiles.push(path);
			await storage.update(this.getStorageKey(), pinnedFiles);
		}
	}

	async unpinFile(path: string): Promise<void> {
		const storage = this.getStorage();
		const pinnedFiles = await this.getPinnedFiles();

		const index = pinnedFiles.indexOf(path);
		if (index !== -1) {
			pinnedFiles.splice(index, 1);
			await storage.update(this.getStorageKey(), pinnedFiles);
		}
	}

	/**
	 * Update the PIN state when a file is renamed
	 */
	async updatePinnedPath(oldPath: string, newPath: string): Promise<void> {
		const isPinned = await this.isPinned(oldPath);
		if (isPinned) {
			await this.unpinFile(oldPath);
			await this.pinFile(newPath);
		}
	}

	/**
	 * Clean up PIN state when a file is deleted
	 */
	async removePinnedPath(path: string): Promise<void> {
		await this.unpinFile(path);
	}

	/**
	 * Change storage scope for PIN manager
	 */
	setGlobalStorage(useGlobal: boolean): void {
		this.useGlobalStorage = useGlobal;
	}
}