import * as vscode from 'vscode';

/**
 * Service for generating TL;DR summaries using VS Code's Language Model API
 */
export class TldrService {
	private static readonly DEFAULT_MODEL = 'gpt-5-mini';
	private static readonly PROMPT = `You are a super concise summarizer. Generate a brief TL;DR (1-2 sentences, max 150 characters) for the following content. Focus on the main purpose and key information without any intro, fillers, or unnecessary details. Do not include "TL;DR:" prefix in your response.

Content:
`;

	/**
	 * Check if TL;DR generation is enabled in settings
	 */
	static isEnabled(): boolean {
		const config = vscode.workspace.getConfiguration('agentMemory');
		return config.get<boolean>('tldr.enabled', true);
	}

	/**
	 * Get minimum word count for TL;DR generation
	 */
	static getMinWordCount(): number {
		const config = vscode.workspace.getConfiguration('agentMemory');
		return config.get<number>('tldr.minWordCount', 100);
	}

	/**
	 * Count words in content
	 */
	private static countWords(content: string): number {
		return content.trim().split(/\s+/).filter(word => word.length > 0).length;
	}

	/**
	 * Generate a TL;DR summary for the given content
	 * @param content The file content to summarize
	 * @param filePath The file path (for context/logging)
	 * @returns The generated TL;DR summary, or undefined if generation failed
	 */
	static async generateTldr(content: string, filePath: string): Promise<string | undefined> {
		// Check if TL;DR is enabled
		if (!this.isEnabled()) {
			return undefined;
		}

		// Check word count constraint
		const wordCount = this.countWords(content);
		const minWordCount = this.getMinWordCount();

		if (wordCount < minWordCount) {
			return undefined;
		}

		try {
			// Select the language model
			const models = await vscode.lm.selectChatModels({
				vendor: 'copilot',
				family: this.DEFAULT_MODEL
			});

			if (models.length === 0) {
				console.warn(`[TldrService] No language model available for TL;DR generation`);
				return undefined;
			}

			const model = models[0];

			// Prepare the chat messages
			const messages = [
				vscode.LanguageModelChatMessage.User(this.PROMPT + content)
			];

			// Send the request
			const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

			// Collect the response
			let tldr = '';
			for await (const chunk of response.text) {
				tldr += chunk;
			}

			// Clean up the response
			tldr = tldr.trim();

			// Remove "TL;DR:" prefix if present
			tldr = tldr.replace(/^TL;?DR:?\s*/i, '');

			// Truncate to reasonable length if needed
			if (tldr.length > 200) {
				tldr = tldr.substring(0, 197) + '...';
			}

			return tldr || undefined;

		} catch (error) {
			console.error(`[TldrService] Failed to generate TL;DR for ${filePath}:`, error);
			return undefined;
		}
	}

	/**
	 * Check if a file should have a TL;DR based on its content
	 */
	static shouldGenerateTldr(content: string): boolean {
		if (!this.isEnabled()) {
			return false;
		}

		const wordCount = this.countWords(content);
		const minWordCount = this.getMinWordCount();

		return wordCount >= minWordCount;
	}
}
