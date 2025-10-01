import * as vscode from 'vscode';
import { IMemoryStorage } from './types.js';

/**
 * Manages synchronization of memory files to workspace's AGENTS.md file
 */
export class AgentsMdSyncManager {
	private isEnabled: boolean = false;

	constructor() {
		this.updateConfig();
	}

	/**
	 * Update configuration settings
	 */
	updateConfig(): void {
		const config = vscode.workspace.getConfiguration('agentMemory');
		this.isEnabled = config.get<boolean>('autoSyncToAgentsMd', false);
	}

	/**
	 * Check if auto-sync is enabled
	 */
	isAutoSyncEnabled(): boolean {
		return this.isEnabled;
	}

	/**
	 * Sync memory files to AGENTS.md
	 */
	async syncToAgentsMd(storage: IMemoryStorage, workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
		if (!this.isEnabled) {
			return;
		}

		try {
			const agentsMdUri = vscode.Uri.joinPath(workspaceFolder.uri, 'AGENTS.md');
			const fs = vscode.workspace.fs;

			// Get all memory files
			const allFiles = await storage.listFiles();
			const memoryFiles = allFiles.filter(f => !f.isDirectory);

			// Generate memory section content
			const memoryContent = await this.generateMemorySection(storage, memoryFiles);

			// Read existing AGENTS.md or create new one
			let existingContent = '';
			try {
				const fileContent = await fs.readFile(agentsMdUri);
				existingContent = Buffer.from(fileContent).toString('utf8');
			} catch (error) {
				// File doesn't exist, will create new
				if ((error as vscode.FileSystemError).code !== 'FileNotFound') {
					throw error;
				}
			}

			// Replace or append memory section
			const updatedContent = this.updateMemorySection(existingContent, memoryContent);

			// Write back to AGENTS.md
			await fs.writeFile(agentsMdUri, Buffer.from(updatedContent, 'utf8'));
		} catch (error) {
			// Log error but don't throw - sync failures shouldn't break memory operations
			console.error('Failed to sync to AGENTS.md:', error);
		}
	}

	/**
	 * Generate the memory section content with all files
	 */
	private async generateMemorySection(
		storage: IMemoryStorage,
		memoryFiles: Array<{ path: string; name: string; isDirectory: boolean }>
	): Promise<string> {
		if (memoryFiles.length === 0) {
			return '<memory hint="Manage via memory tool">\n(No memory files yet)\n</memory>';
		}

		const fileSections: string[] = [];

		for (const file of memoryFiles) {
			try {
				const content = await storage.readRaw(file.path);
				// Escape any existing closing tags in content to prevent XML parsing issues
				const escapedContent = content.replace(/<\/file>/g, '&lt;/file&gt;');
				fileSections.push(`<file path="${file.path}">\n${escapedContent}\n</file>`);
			} catch (error) {
				// Skip files that can't be read
				console.error(`Failed to read ${file.path} for AGENTS.md sync:`, error);
			}
		}

		return `<memory hint="Manage via memory tool">\n${fileSections.join('\n\n')}\n</memory>`;
	}

	/**
	 * Update or insert memory section in AGENTS.md content
	 */
	private updateMemorySection(existingContent: string, memorySection: string): string {
		// Look for existing memory section
		const memoryRegex = /<memory\s+hint="Manage via memory tool">[\s\S]*?<\/memory>/;
		
		if (memoryRegex.test(existingContent)) {
			// Replace existing section
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
