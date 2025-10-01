import * as vscode from 'vscode';
import { IMemoryStorage } from './types.js';

/**
 * Manages synchronization of memory files to a configured file in the workspace
 */
export class AgentsMdSyncManager {
	private syncFilePath = '';

	constructor() {
		this.updateConfig();
	}

	/**
	 * Update configuration settings
	 */
	updateConfig(): void {
		const config = vscode.workspace.getConfiguration('agentMemory');
		this.syncFilePath = config.get<string>('autoSyncToFile', '');
	}

	/**
	 * Check if auto-sync is enabled
	 */
	isAutoSyncEnabled(): boolean {
		return this.syncFilePath.length > 0;
	}

	/**
	 * Sync memory files to the configured file
	 */
	async syncToFile(storage: IMemoryStorage, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
		if (!this.isAutoSyncEnabled()) {
			return;
		}

		try {
			const targetFileUri = vscode.Uri.joinPath(workspaceFolder.uri, this.syncFilePath);
			const fs = vscode.workspace.fs;

			// Get all memory files
			const allFiles = await storage.listFiles();
			const memoryFiles = allFiles.filter(f => !f.isDirectory);

			// Check if target file is an .instructions.md file
			const isInstructionsFile = this.syncFilePath.endsWith('.instructions.md');

			// Generate memory section content
			const memoryContent = await this.generateMemorySection(storage, memoryFiles, isInstructionsFile);

			// Read existing file or create new one
			let existingContent = '';
			try {
				const fileContent = await fs.readFile(targetFileUri);
				existingContent = Buffer.from(fileContent).toString('utf8');
			} catch (error) {
				// File doesn't exist, will create new
				if ((error as vscode.FileSystemError).code !== 'FileNotFound') {
					throw error;
				}
			}

			// Replace or append memory section
			const updatedContent = this.updateMemorySection(existingContent, memoryContent);

			// Write back to target file
			await fs.writeFile(targetFileUri, Buffer.from(updatedContent, 'utf8'));
		} catch (error) {
			// Log error but don't throw - sync failures shouldn't break memory operations
			console.error(`Failed to sync to ${this.syncFilePath}:`, error);
		}
	}

	/**
	 * Generate the memory section content with all files
	 */
	private async generateMemorySection(
		storage: IMemoryStorage,
		memoryFiles: Array<{ path: string; name: string; isDirectory: boolean }>,
		isInstructionsFile: boolean
	): Promise<string> {
		let memorySection = '';

		// Add frontmatter prefix for .instructions.md files
		if (isInstructionsFile) {
			memorySection = '---\napplyTo: **\n---\n\n';
		}

		if (memoryFiles.length === 0) {
			return memorySection + '<memories hint="Manage via memory tool">\n(No memory files yet)\n</memories>';
		}

		const fileSections: string[] = [];

		for (const file of memoryFiles) {
			try {
				const content = await storage.readRaw(file.path);
				// Escape any existing closing tags in content to prevent XML parsing issues
				const escapedContent = content.replace(/<\/memory>/g, '&lt;/memory&gt;');
				fileSections.push(`<memory path="${file.path}">\n${escapedContent}\n</memory>`);
			} catch (error) {
				// Skip files that can't be read
				console.error(`Failed to read ${file.path} for sync:`, error);
			}
		}

		return memorySection + `<memories hint="Manage via memory tool">\n${fileSections.join('\n\n')}\n</memories>`;
	}

	/**
	 * Update or insert memory section in target file content
	 */
	private updateMemorySection(existingContent: string, memorySection: string): string {
		// Look for existing memory section (support both old and new tag names)
		const memoriesRegex = /<memories\s+hint="Manage via memory tool">[\s\S]*?<\/memories>/;
		const memoryRegex = /<memory\s+hint="Manage via memory tool">[\s\S]*?<\/memory>/;
		
		if (memoriesRegex.test(existingContent)) {
			// Replace existing section with new tag name
			return existingContent.replace(memoriesRegex, memorySection);
		} else if (memoryRegex.test(existingContent)) {
			// Replace old tag name with new tag name
			return existingContent.replace(memoryRegex, memorySection);
		} else {
			// Append to end of file with proper spacing
			const separator = existingContent.length > 0 && !existingContent.endsWith('\n\n') 
				? (existingContent.endsWith('\n') ? '\n' : '\n\n')
				: '';
			return existingContent + separator + memorySection + '\n';
		}
	}
}
