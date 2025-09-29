/**
 * Formats a file size in bytes to a human-readable string
 *
 * @param bytes - The size in bytes
 * @returns Formatted size string (e.g., "1.5 KB", "2.3 MB")
 */
export function formatSize(bytes: number): string {
	if (bytes === 0) {
		return '0 B';
	}
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
}

/**
 * Formats a date as a relative time string (e.g., "2m ago", "3d ago")
 *
 * @param date - The date to format
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (seconds < 60) {
		return 'just now';
	}
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	if (hours < 24) {
		return `${hours}h ago`;
	}
	if (days < 7) {
		return `${days}d ago`;
	}

	return date.toLocaleDateString();
}

/**
 * Text manipulation utilities
 */
export class TextUtils {
	/**
	 * Replaces the first occurrence of oldStr with newStr in text
	 * Throws if the string is not found or appears multiple times
	 *
	 * @param text - The text to search in
	 * @param oldStr - The string to find (must appear exactly once)
	 * @param newStr - The replacement string
	 * @param filePath - Optional file path for better error messages
	 * @returns The modified text
	 * @throws {Error} If oldStr is not found or appears multiple times
	 */
	static replaceFirst(text: string, oldStr: string, newStr: string, filePath?: string): string {
		const count = text.split(oldStr).length - 1;

		const fileContext = filePath ? ` in ${filePath}` : '';

		if (count === 0) {
			throw new Error(`Text not found${fileContext}. Check that the exact text exists, including whitespace and capitalization. Use 'view' to see the current file contents.`);
		} else if (count > 1) {
			throw new Error(`Text appears ${count} times${fileContext}. Must be unique. Use 'view' to see all occurrences and provide more context to make the match unique.`);
		}

		return text.replace(oldStr, newStr);
	}

	/**
	 * Inserts text at a specific line number
	 *
	 * @param text - The original text
	 * @param lineNumber - The line number to insert at (0-based)
	 * @param insertText - The text to insert
	 * @returns The modified text
	 * @throws {Error} If line number is invalid
	 */
	static insertAtLine(text: string, lineNumber: number, insertText: string): string {
		const lines = text.split('\n');

		if (lineNumber < 0 || lineNumber > lines.length) {
			throw new Error(`Line number ${lineNumber} is invalid. The file has ${lines.length} lines (valid range: 1-${lines.length + 1}). Use 'view' to see the current file structure.`);
		}

		lines.splice(lineNumber, 0, insertText);
		return lines.join('\n');
	}

	/**
	 * Extracts a range of lines from text
	 *
	 * @param text - The text to extract from
	 * @param start - Start line (1-based)
	 * @param end - End line (1-based, inclusive)
	 * @returns The extracted lines
	 */
	static extractLines(text: string, start: number, end: number): string {
		const lines = text.split('\n');
		const selectedLines = lines.slice(start - 1, end);
		return selectedLines.join('\n');
	}
}
