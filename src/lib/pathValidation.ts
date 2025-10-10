import * as path from 'path';

const MEMORIES_DIR = '/memories';

/**
 * Validates that a path is within the /memories directory
 * Prevents path traversal attacks
 *
 * @param memoryPath - The path to validate
 * @throws {Error} If the path is invalid or attempts directory traversal
 */
export function validateMemoryPath(memoryPath: string): void {
	// Decode any URL-encoded characters first (prevents %2e%2e bypasses)
	let decoded = memoryPath;
	try {
		decoded = decodeURIComponent(memoryPath);
	} catch {
		// If decoding fails, use original path
	}

	// Normalize the path
	const normalized = path.posix.normalize(decoded);

	// Must start with /memories
	if (!normalized.startsWith(MEMORIES_DIR)) {
		throw new Error(`Invalid path: must be within ${MEMORIES_DIR} directory`);
	}

	// Check for traversal attempts (should be redundant after normalization, but defense in depth)
	if (normalized.includes('..')) {
		throw new Error('Invalid path: directory traversal not allowed');
	}

	// Additional check: prevent null bytes and other control characters
	// eslint-disable-next-line no-control-regex
	if (/[\x00-\x1f]/.test(memoryPath)) {
		throw new Error('Invalid path: contains illegal characters');
	}
}

/**
 * Gets the relative path within the memories directory
 *
 * @param memoryPath - The full memory path
 * @returns The relative path without the /memories prefix
 */
export function getRelativePath(memoryPath: string): string {
	return memoryPath.startsWith(MEMORIES_DIR)
		? memoryPath.slice(MEMORIES_DIR.length)
		: memoryPath;
}

/**
 * Get the memories directory constant
 */
export function getMemoriesDir(): string {
	return MEMORIES_DIR;
}

/**
 * Normalizes a memory path by removing trailing slashes
 * This ensures consistent path handling across all storage backends
 *
 * @param memoryPath - The path to normalize
 * @returns The normalized path without trailing slash (except for root '/')
 */
export function normalizeMemoryPath(memoryPath: string): string {
	// Remove trailing slash (except for root '/')
	if (memoryPath.endsWith('/') && memoryPath !== '/') {
		return memoryPath.slice(0, -1);
	}
	return memoryPath;
}
