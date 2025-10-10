import { MockMemoryStorage } from './mockStorage';

describe('MockMemoryStorage', () => {
	let storage: MockMemoryStorage;

	beforeEach(() => {
		storage = new MockMemoryStorage('test-workspace');
	});

	describe('create and view operations', () => {
	it('should create and read a file', async () => {
		await storage.create('/memories/test.txt', 'Hello, world!');
		const content = await storage.view('/memories/test.txt');
		expect(content).toBe('   1: Hello, world!');
	});

	it('should read raw content without line numbers', async () => {
		await storage.create('/memories/test.txt', 'Hello, world!');
		const content = await storage.readRaw('/memories/test.txt');
		expect(content).toBe('Hello, world!');
	});

	it('should preserve original content when reading raw multiline files', async () => {
		const originalContent = 'Line 1\nLine 2\nLine 3';
		await storage.create('/memories/multiline.txt', originalContent);
		const content = await storage.readRaw('/memories/multiline.txt');
		expect(content).toBe(originalContent);
	});	it('should create files in nested directories', async () => {
		await storage.create('/memories/folder/subfolder/file.txt', 'Nested content');
		const content = await storage.view('/memories/folder/subfolder/file.txt');
		expect(content).toBe('   1: Nested content');
	});	it('should overwrite existing file with create', async () => {
		await storage.create('/memories/test.txt', 'Original content');
		await storage.create('/memories/test.txt', 'New content');
		const content = await storage.view('/memories/test.txt');
		expect(content).toBe('   1: New content');
	});		it('should throw error when viewing non-existent file', async () => {
			await expect(storage.view('/memories/missing.txt'))
				.rejects.toThrow('File or directory not found: /memories/missing.txt');
		});
	});

	describe('view with line ranges', () => {
		beforeEach(async () => {
			await storage.create('/memories/multiline.txt', 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
		});

	it('should view specific line range', async () => {
		const content = await storage.view('/memories/multiline.txt', [2, 4]);
		expect(content).toBe('   2: Line 2\n   3: Line 3\n   4: Line 4');
	});	it('should view single line', async () => {
		const content = await storage.view('/memories/multiline.txt', [3, 3]);
		expect(content).toBe('   3: Line 3');
	});		it('should view from beginning', async () => {
			const content = await storage.view('/memories/multiline.txt', [1, 2]);
			expect(content).toBe('   1: Line 1\n   2: Line 2');
		});
	});

	describe('directory operations', () => {
	it('should list directory contents', async () => {
		await storage.create('/memories/file1.txt', 'Content 1');
		await storage.create('/memories/file2.txt', 'Content 2');
		await storage.create('/memories/folder/file3.txt', 'Content 3');

		const content = await storage.view('/memories');
		expect(content).toContain('- file1.txt');
		expect(content).toContain('- file2.txt');
		expect(content).toContain('- folder/');
	});	it('should list directory contents with trailing slash', async () => {
		await storage.create('/memories/file1.txt', 'Content 1');
		await storage.create('/memories/file2.txt', 'Content 2');
		await storage.create('/memories/folder/file3.txt', 'Content 3');

		// /memories/ should work the same as /memories
		const content = await storage.view('/memories/');
		expect(content).toContain('- file1.txt');
		expect(content).toContain('- file2.txt');
		expect(content).toContain('- folder/');
	});	it('should list nested directory contents', async () => {
		await storage.create('/memories/folder/file1.txt', 'Content 1');
		await storage.create('/memories/folder/file2.txt', 'Content 2');

		const content = await storage.view('/memories/folder');
		expect(content).toContain('- file1.txt');
		expect(content).toContain('- file2.txt');
	});
	it('should list nested directory contents with trailing slash', async () => {
		await storage.create('/memories/folder/file1.txt', 'Content 1');
		await storage.create('/memories/folder/file2.txt', 'Content 2');

		// /memories/folder/ should work the same as /memories/folder
		const content = await storage.view('/memories/folder/');
		expect(content).toContain('- file1.txt');
		expect(content).toContain('- file2.txt');
	});
	});

	describe('strReplace operation', () => {
	it('should replace text in a file', async () => {
		await storage.create('/memories/test.txt', 'Hello world!');
		await storage.strReplace('/memories/test.txt', 'world', 'universe');
		const content = await storage.view('/memories/test.txt');
		expect(content).toBe('   1: Hello universe!');
	});

	it('should throw error when file not found', async () => {
		await expect(storage.strReplace('/memories/missing.txt', 'old', 'new'))
			.rejects.toThrow('File not found: /memories/missing.txt');
	});

	it('should throw error when string not found', async () => {
		await storage.create('/memories/test.txt', 'Hello world');
		await expect(storage.strReplace('/memories/test.txt', 'missing', 'replacement'))
			.rejects.toThrow('Text not found in /memories/test.txt');
	});	it('should handle multiline replacement', async () => {
		await storage.create('/memories/test.txt', 'Line 1\nLine 2\nLine 3');
		await storage.strReplace('/memories/test.txt', 'Line 2', 'Modified Line');
		const content = await storage.view('/memories/test.txt');
		expect(content).toBe('   1: Line 1\n   2: Modified Line\n   3: Line 3');
	});
	});

	describe('insert operation', () => {
	it('should insert text at beginning', async () => {
		await storage.create('/memories/test.txt', 'Line 1\nLine 2');
		await storage.insert('/memories/test.txt', 0, 'New First Line');
		const content = await storage.view('/memories/test.txt');
		expect(content).toBe('   1: New First Line\n   2: Line 1\n   3: Line 2');
	});	it('should insert text in middle', async () => {
		await storage.create('/memories/test.txt', 'Line 1\nLine 2\nLine 3');
		await storage.insert('/memories/test.txt', 2, 'Inserted Line');
		const content = await storage.view('/memories/test.txt');
		expect(content).toBe('   1: Line 1\n   2: Line 2\n   3: Inserted Line\n   4: Line 3');
	});	it('should insert text at end', async () => {
		await storage.create('/memories/test.txt', 'Line 1\nLine 2');
		await storage.insert('/memories/test.txt', 2, 'Last Line');
		const content = await storage.view('/memories/test.txt');
		expect(content).toBe('   1: Line 1\n   2: Line 2\n   3: Last Line');
	});		it('should throw error when file not found', async () => {
			await expect(storage.insert('/memories/missing.txt', 0, 'text'))
				.rejects.toThrow('File not found: /memories/missing.txt');
		});

		it('should throw error for invalid line number', async () => {
			await storage.create('/memories/test.txt', 'Line 1\nLine 2');
			await expect(storage.insert('/memories/test.txt', -1, 'text'))
				.rejects.toThrow('Line number -1 is invalid');
		});
	});

	describe('delete operation', () => {
	it('should delete a file', async () => {
		await storage.create('/memories/test.txt', 'Content');
		const result = await storage.delete('/memories/test.txt');
		expect(result).toBe('File deleted: /memories/test.txt');
		await expect(storage.view('/memories/test.txt'))
			.rejects.toThrow('File or directory not found');
	});	it('should delete a directory and all contents', async () => {
		await storage.create('/memories/folder/file1.txt', 'Content 1');
		await storage.create('/memories/folder/file2.txt', 'Content 2');
		await storage.create('/memories/folder/subfolder/file3.txt', 'Content 3');

		const result = await storage.delete('/memories/folder');
		expect(result).toBe('Directory deleted: /memories/folder');

		await expect(storage.view('/memories/folder'))
			.rejects.toThrow('File or directory not found');
		await expect(storage.view('/memories/folder/file1.txt'))
			.rejects.toThrow('File or directory not found');
	});		it('should throw error when file not found', async () => {
			await expect(storage.delete('/memories/missing.txt'))
				.rejects.toThrow('File or directory not found: /memories/missing.txt');
		});
	});

	describe('rename operation', () => {
	it('should rename a file', async () => {
		await storage.create('/memories/old.txt', 'Content');
		await storage.rename('/memories/old.txt', '/memories/new.txt');

		const content = await storage.view('/memories/new.txt');
		expect(content).toBe('   1: Content');

		await expect(storage.view('/memories/old.txt'))
			.rejects.toThrow('File or directory not found');
	});	it('should move a file to different directory', async () => {
		await storage.create('/memories/file.txt', 'Content');
		await storage.rename('/memories/file.txt', '/memories/folder/moved.txt');

		const content = await storage.view('/memories/folder/moved.txt');
		expect(content).toBe('   1: Content');

		await expect(storage.view('/memories/file.txt'))
			.rejects.toThrow('File or directory not found');
	});	it('should rename a directory and all contents', async () => {
		await storage.create('/memories/oldFolder/file1.txt', 'Content 1');
		await storage.create('/memories/oldFolder/file2.txt', 'Content 2');

		await storage.rename('/memories/oldFolder', '/memories/newFolder');

		const content1 = await storage.view('/memories/newFolder/file1.txt');
		const content2 = await storage.view('/memories/newFolder/file2.txt');
		expect(content1).toBe('   1: Content 1');
		expect(content2).toBe('   1: Content 2');

		await expect(storage.view('/memories/oldFolder'))
			.rejects.toThrow('File or directory not found');
	});		it('should throw error when source not found', async () => {
			await expect(storage.rename('/memories/missing.txt', '/memories/new.txt'))
				.rejects.toThrow('File or directory not found: /memories/missing.txt');
		});
	});

	describe('listFiles operation', () => {
		it('should list all files with metadata', async () => {
			await storage.create('/memories/file1.txt', 'Content 1');
			await storage.create('/memories/folder/file2.txt', 'Content 2');

			const files = await storage.listFiles();

			expect(files.length).toBeGreaterThanOrEqual(2);

			const file1 = files.find(f => f.path === '/memories/file1.txt');
			expect(file1).toBeDefined();
			expect(file1?.isDirectory).toBe(false);
			expect(file1?.size).toBe(Buffer.from('Content 1').length);

			const folder = files.find(f => f.path === '/memories/folder');
			expect(folder).toBeDefined();
			expect(folder?.isDirectory).toBe(true);
		});

		it('should return empty array when no files exist', async () => {
			const files = await storage.listFiles();
			expect(files).toEqual([]);
		});
	});

	describe('path validation', () => {
		it('should reject paths outside /memories', async () => {
			await expect(storage.create('/etc/passwd', 'bad'))
				.rejects.toThrow('Invalid path: must be within /memories directory');
		});

		it('should reject path traversal attempts', async () => {
			await expect(storage.create('/memories/../etc/passwd', 'bad'))
				.rejects.toThrow('Invalid path: must be within /memories directory');
		});

		it('should reject paths with null bytes', async () => {
			await expect(storage.create('/memories/test\x00.txt', 'bad'))
				.rejects.toThrow('Invalid path: contains illegal characters');
		});
	});

	describe('getWorkspaceId', () => {
		it('should return the workspace identifier', () => {
			expect(storage.getWorkspaceId()).toBe('test-workspace');
		});

		it('should use custom workspace id', () => {
			const customStorage = new MockMemoryStorage('custom-id');
			expect(customStorage.getWorkspaceId()).toBe('custom-id');
		});
	});

	describe('new features from reference implementation', () => {
		it('should show line numbers when viewing files', async () => {
			await storage.create('/memories/test.txt', 'Line 1\nLine 2\nLine 3');
			const content = await storage.view('/memories/test.txt');
			expect(content).toBe('   1: Line 1\n   2: Line 2\n   3: Line 3');
		});

		it('should handle -1 as end line to view to end of file', async () => {
			await storage.create('/memories/test.txt', 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
			const content = await storage.view('/memories/test.txt', [3, -1]);
			expect(content).toBe('   3: Line 3\n   4: Line 4\n   5: Line 5');
		});

		it('should maintain line numbers when viewing range', async () => {
			await storage.create('/memories/test.txt', 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
			const content = await storage.view('/memories/test.txt', [2, 4]);
			expect(content).toBe('   2: Line 2\n   3: Line 3\n   4: Line 4');
		});

		it('should throw error when text appears multiple times', async () => {
			await storage.create('/memories/test.txt', 'Hello world, world!');
			await expect(storage.strReplace('/memories/test.txt', 'world', 'universe'))
				.rejects.toThrow('Text appears 2 times in /memories/test.txt. Must be unique.');
		});

		it('should successfully replace when text appears exactly once', async () => {
			await storage.create('/memories/test.txt', 'Hello world, everyone!');
			await storage.strReplace('/memories/test.txt', 'world', 'universe');
			const content = await storage.view('/memories/test.txt');
			expect(content).toBe('   1: Hello universe, everyone!');
		});

		it('should differentiate file vs directory deletion', async () => {
			await storage.create('/memories/test.txt', 'Content');
			await storage.create('/memories/folder/file.txt', 'Content');

			const fileResult = await storage.delete('/memories/test.txt');
			expect(fileResult).toBe('File deleted: /memories/test.txt');

			const dirResult = await storage.delete('/memories/folder');
			expect(dirResult).toBe('Directory deleted: /memories/folder');
		});

		it('should include - prefix in directory listings', async () => {
			await storage.create('/memories/file1.txt', 'Content');
			await storage.create('/memories/file2.txt', 'Content');

			const content = await storage.view('/memories');
			expect(content).toContain('- file1.txt');
			expect(content).toContain('- file2.txt');
		});
	});
});
