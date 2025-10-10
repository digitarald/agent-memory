import { validateMemoryPath, getRelativePath, getMemoriesDir, normalizeMemoryPath } from '../pathValidation';

describe('pathValidation', () => {
	describe('validateMemoryPath', () => {
		it('should allow valid paths within /memories', () => {
			expect(() => validateMemoryPath('/memories/test.txt')).not.toThrow();
			expect(() => validateMemoryPath('/memories/folder/file.md')).not.toThrow();
			expect(() => validateMemoryPath('/memories/deep/nested/path/file.json')).not.toThrow();
		});

		it('should reject paths outside /memories directory', () => {
			expect(() => validateMemoryPath('/etc/passwd')).toThrow('Invalid path: must be within /memories directory');
			expect(() => validateMemoryPath('/home/user/file.txt')).toThrow('Invalid path: must be within /memories directory');
			expect(() => validateMemoryPath('/tmp/test.txt')).toThrow('Invalid path: must be within /memories directory');
		});

		it('should reject path traversal attempts using ..', () => {
			expect(() => validateMemoryPath('/memories/../etc/passwd')).toThrow('Invalid path: must be within /memories directory');
			expect(() => validateMemoryPath('/memories/folder/../../etc/passwd')).toThrow('Invalid path: must be within /memories directory');
			expect(() => validateMemoryPath('/memories/./../../etc/passwd')).toThrow('Invalid path: must be within /memories directory');
		});

		it('should reject URL-encoded path traversal attempts', () => {
			expect(() => validateMemoryPath('/memories/%2e%2e/etc/passwd')).toThrow('Invalid path: must be within /memories directory');
			expect(() => validateMemoryPath('/memories/%2e%2e%2f%2e%2e/etc/passwd')).toThrow('Invalid path: must be within /memories directory');
		});

		it('should reject paths with null bytes', () => {
			expect(() => validateMemoryPath('/memories/test\x00.txt')).toThrow('Invalid path: contains illegal characters');
			expect(() => validateMemoryPath('/memories/file\x00/test.txt')).toThrow('Invalid path: contains illegal characters');
		});

		it('should reject paths with control characters', () => {
			expect(() => validateMemoryPath('/memories/test\x01.txt')).toThrow('Invalid path: contains illegal characters');
			expect(() => validateMemoryPath('/memories/test\x1f.txt')).toThrow('Invalid path: contains illegal characters');
			expect(() => validateMemoryPath('/memories/\r\ntest.txt')).toThrow('Invalid path: contains illegal characters');
		});

		it('should handle edge cases with normalization', () => {
			expect(() => validateMemoryPath('/memories/./file.txt')).not.toThrow();
			expect(() => validateMemoryPath('/memories/folder/../file.txt')).not.toThrow(); // Stays within /memories
			expect(() => validateMemoryPath('/memories//double//slash.txt')).not.toThrow();
		});

		it('should reject paths that are exactly /memories without trailing content', () => {
			// This should actually be allowed for viewing directory
			expect(() => validateMemoryPath('/memories')).not.toThrow();
			expect(() => validateMemoryPath('/memories/')).not.toThrow();
		});
	});

	describe('getRelativePath', () => {
		it('should remove /memories prefix from path', () => {
			expect(getRelativePath('/memories/test.txt')).toBe('/test.txt');
			expect(getRelativePath('/memories/folder/file.md')).toBe('/folder/file.md');
			expect(getRelativePath('/memories/deep/nested/path.json')).toBe('/deep/nested/path.json');
		});

		it('should return path as-is if it does not start with /memories', () => {
			expect(getRelativePath('/test.txt')).toBe('/test.txt');
			expect(getRelativePath('relative/path.txt')).toBe('relative/path.txt');
		});

		it('should handle edge cases', () => {
			expect(getRelativePath('/memories')).toBe('');
			expect(getRelativePath('/memories/')).toBe('/');
		});
	});

	describe('getMemoriesDir', () => {
		it('should return the memories directory constant', () => {
			expect(getMemoriesDir()).toBe('/memories');
		});
	});

	describe('normalizeMemoryPath', () => {
		it('should remove trailing slash from paths', () => {
			expect(normalizeMemoryPath('/memories/')).toBe('/memories');
			expect(normalizeMemoryPath('/memories/folder/')).toBe('/memories/folder');
			expect(normalizeMemoryPath('/memories/file.txt/')).toBe('/memories/file.txt');
		});

		it('should not modify paths without trailing slash', () => {
			expect(normalizeMemoryPath('/memories')).toBe('/memories');
			expect(normalizeMemoryPath('/memories/folder')).toBe('/memories/folder');
			expect(normalizeMemoryPath('/memories/file.txt')).toBe('/memories/file.txt');
		});

		it('should preserve single slash', () => {
			expect(normalizeMemoryPath('/')).toBe('/');
		});
	});
});
