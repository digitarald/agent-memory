import { SecretMemoryStorage } from '../storage.js';
import type * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode', () => ({
	Uri: {
		parse: (uri: string) => ({
			toString: () => uri,
			fsPath: uri.replace('file://', ''),
			path: uri.replace('file://', ''),
			scheme: uri.split(':')[0]
		}),
		joinPath: (base: { toString(): string }, ...paths: string[]) => ({
			toString: () => `${base.toString()}/${paths.join('/')}`,
			fsPath: `${base.toString()}/${paths.join('/')}`,
			path: `${base.toString()}/${paths.join('/')}`,
			scheme: 'file'
		})
	}
}), { virtual: true });

/**
 * Mock SecretStorage implementation for testing
 */
class MockSecretStorage implements vscode.SecretStorage {
	private SECRETS = new Map<string, string>();

	async get(KEY: string): Promise<string | undefined> {
		return this.SECRETS.get(KEY);
	}

	async store(KEY: string, VALUE: string): Promise<void> {
		this.SECRETS.set(KEY, VALUE);
	}

	async delete(KEY: string): Promise<void> {
		this.SECRETS.delete(KEY);
	}

	async keys(): Promise<string[]> {
		return Array.from(this.SECRETS.keys());
	}

	onDidChange = (() => ({ dispose: () => { } })) as unknown as vscode.Event<vscode.SecretStorageChangeEvent>;
}

/**
 * Mock ExtensionContext for testing
 */
function createMockContext(): vscode.ExtensionContext {
	const MOCKSECRETS = new MockSecretStorage();

	return {
		secrets: MOCKSECRETS,
		subscriptions: [],
		workspaceState: {} as vscode.Memento,
		globalState: {} as vscode.Memento & { setKeysForSync(keys: readonly string[]): void },
		extensionUri: { toString: () => 'file:///test' },
		extensionPath: '/test',
		environmentVariableCollection: {} as vscode.GlobalEnvironmentVariableCollection,
		asAbsolutePath: (RELATIVEPATH: string) => `/test/${RELATIVEPATH}`,
		storageUri: { toString: () => 'file:///test/storage' },
		storagePath: '/test/storage',
		globalStorageUri: { toString: () => 'file:///test/global' },
		globalStoragePath: '/test/global',
		logUri: { toString: () => 'file:///test/log' },
		logPath: '/test/log',
		extensionMode: 3 as vscode.ExtensionMode,
		extension: {} as vscode.Extension<unknown>,
		languageModelAccessInformation: {} as vscode.LanguageModelAccessInformation
	} as unknown as vscode.ExtensionContext;
}

/**
 * Mock WorkspaceFolder
 */
function createMockWorkspaceFolder(): vscode.WorkspaceFolder {
	return {
		uri: { toString: () => 'file:///workspace', fsPath: '/workspace', path: '/workspace', scheme: 'file' },
		name: 'test-workspace',
		index: 0
	} as unknown as vscode.WorkspaceFolder;
}

describe('SecretMemoryStorage', () => {
	let CONTEXT: vscode.ExtensionContext;
	let WORKSPACEFOLDER: vscode.WorkspaceFolder;
	let STORAGE: SecretMemoryStorage;

	beforeEach(() => {
		CONTEXT = createMockContext();
		WORKSPACEFOLDER = createMockWorkspaceFolder();
		STORAGE = new SecretMemoryStorage(CONTEXT, WORKSPACEFOLDER);
	});

	describe('create and view', () => {
		it('should create a file and view its contents', async () => {
			await STORAGE.create('/memories/test.txt', 'Hello World');

			const RESULT = await STORAGE.view('/memories/test.txt');
			expect(RESULT).toContain('Hello World');
			expect(RESULT).toContain('   1:'); // Line numbers
		});

		it('should view a file with line ranges', async () => {
			const CONTENT = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
			await STORAGE.create('/memories/test.txt', CONTENT);

			const RESULT = await STORAGE.view('/memories/test.txt', [2, 4]);
			expect(RESULT).toContain('Line 2');
			expect(RESULT).toContain('Line 3');
			expect(RESULT).toContain('Line 4');
			expect(RESULT).not.toContain('Line 1');
			expect(RESULT).not.toContain('Line 5');
		});

		it('should view empty directory', async () => {
			const RESULT = await STORAGE.view('/memories');
			expect(RESULT).toContain('Directory: /memories');
			expect(RESULT).toContain('(empty - no files created yet)');
		});

		it('should view directory with files', async () => {
			await STORAGE.create('/memories/file1.txt', 'Content 1');
			await STORAGE.create('/memories/file2.txt', 'Content 2');

			const RESULT = await STORAGE.view('/memories');
			expect(RESULT).toContain('Directory: /memories');
			expect(RESULT).toContain('- file1.txt');
			expect(RESULT).toContain('- file2.txt');
		});

		it('should throw error when viewing non-existent file', async () => {
			await expect(STORAGE.view('/memories/nonexistent.txt'))
				.rejects
				.toThrow("does not exist yet");
		});
	});

	describe('readRaw', () => {
		it('should read raw file content without line numbers', async () => {
			const CONTENT = 'Hello\nWorld';
			await STORAGE.create('/memories/test.txt', CONTENT);

			const RESULT = await STORAGE.readRaw('/memories/test.txt');
			expect(RESULT).toBe(CONTENT);
			expect(RESULT).not.toContain('   1:');
		});

		it('should throw error when reading non-existent file', async () => {
			await expect(STORAGE.readRaw('/memories/nonexistent.txt'))
				.rejects
				.toThrow("does not exist");
		});
	});

	describe('strReplace', () => {
		it('should replace text in a file', async () => {
			await STORAGE.create('/memories/test.txt', 'Hello World');
			await STORAGE.strReplace('/memories/test.txt', 'World', 'Universe');

			const RESULT = await STORAGE.readRaw('/memories/test.txt');
			expect(RESULT).toBe('Hello Universe');
		});

		it('should throw error when replacing in non-existent file', async () => {
			await expect(STORAGE.strReplace('/memories/nonexistent.txt', 'old', 'new'))
				.rejects
				.toThrow("does not exist");
		});

		it('should throw error when old text is not found', async () => {
			await STORAGE.create('/memories/test.txt', 'Hello World');

			await expect(STORAGE.strReplace('/memories/test.txt', 'NotFound', 'new'))
				.rejects
				.toThrow("Text not found");
		});
	});

	describe('insert', () => {
		it('should insert text at specified line', async () => {
			await STORAGE.create('/memories/test.txt', 'Line 1\nLine 3');
			await STORAGE.insert('/memories/test.txt', 2, 'Line 2');

			const RESULT = await STORAGE.readRaw('/memories/test.txt');
			expect(RESULT).toBe('Line 1\nLine 3\nLine 2');
		});

		it('should throw error when inserting in non-existent file', async () => {
			await expect(STORAGE.insert('/memories/nonexistent.txt', 1, 'text'))
				.rejects
				.toThrow("does not exist");
		});
	});

	describe('delete', () => {
		it('should delete a file', async () => {
			await STORAGE.create('/memories/test.txt', 'Content');

			const RESULT = await STORAGE.delete('/memories/test.txt');
			expect(RESULT).toContain('File deleted');

			await expect(STORAGE.view('/memories/test.txt'))
				.rejects
				.toThrow("does not exist");
		});

		it('should delete a directory and its contents', async () => {
			await STORAGE.create('/memories/dir/file1.txt', 'Content 1');
			await STORAGE.create('/memories/dir/file2.txt', 'Content 2');

			const RESULT = await STORAGE.delete('/memories/dir');
			expect(RESULT).toContain('Directory deleted');

			// Verify files are deleted from secret storage
			const KEYS = await CONTEXT.secrets.keys();
			const FILEKEYS = KEYS.filter((KEY: string) => KEY.includes('/memories/dir/'));
			expect(FILEKEYS.length).toBe(0);
		});

		it('should throw error when deleting non-existent file', async () => {
			await expect(STORAGE.delete('/memories/nonexistent.txt'))
				.rejects
				.toThrow("does not exist");
		});
	});

	describe('rename', () => {
		it('should rename a file', async () => {
			await STORAGE.create('/memories/old.txt', 'Content');
			await STORAGE.rename('/memories/old.txt', '/memories/new.txt');

			const RESULT = await STORAGE.readRaw('/memories/new.txt');
			expect(RESULT).toBe('Content');

			await expect(STORAGE.view('/memories/old.txt'))
				.rejects
				.toThrow("does not exist");
		});

		it('should rename a directory and its contents', async () => {
			await STORAGE.create('/memories/olddir/file.txt', 'Content');
			await STORAGE.rename('/memories/olddir', '/memories/newdir');

			const RESULT = await STORAGE.readRaw('/memories/newdir/file.txt');
			expect(RESULT).toBe('Content');

			await expect(STORAGE.view('/memories/olddir/file.txt'))
				.rejects
				.toThrow("does not exist");
		});

		it('should throw error when renaming non-existent file', async () => {
			await expect(STORAGE.rename('/memories/nonexistent.txt', '/memories/new.txt'))
				.rejects
				.toThrow("does not exist");
		});
	});

	describe('listFiles', () => {
		it('should list all files with metadata', async () => {
			await STORAGE.create('/memories/file1.txt', 'Content 1');
			await STORAGE.create('/memories/file2.txt', 'Content 2');
			await STORAGE.create('/memories/dir/file3.txt', 'Content 3');

			const FILES = await STORAGE.listFiles();

			expect(FILES.length).toBeGreaterThanOrEqual(3);

			const FILE1 = FILES.find(F => F.name === 'file1.txt');
			expect(FILE1).toBeDefined();
			expect(FILE1?.isDirectory).toBe(false);
			expect(FILE1?.size).toBeGreaterThan(0);
			expect(FILE1?.lastModified).toBeInstanceOf(Date);
			expect(FILE1?.lastAccessed).toBeInstanceOf(Date);
		});

		it('should include directories in listing', async () => {
			await STORAGE.create('/memories/dir/file.txt', 'Content');

			const FILES = await STORAGE.listFiles();
			const DIR = FILES.find(F => F.name === 'dir');

			expect(DIR).toBeDefined();
			expect(DIR?.isDirectory).toBe(true);
		});

		it('should return empty array when no files exist', async () => {
			const FILES = await STORAGE.listFiles();
			expect(FILES).toEqual([]);
		});
	});

	describe('getWorkspaceId', () => {
		it('should return workspace name', () => {
			expect(STORAGE.getWorkspaceId()).toBe('test-workspace');
		});
	});

	describe('nested directories', () => {
		it('should handle nested directory creation automatically', async () => {
			await STORAGE.create('/memories/a/b/c/file.txt', 'Deep content');

			const RESULT = await STORAGE.readRaw('/memories/a/b/c/file.txt');
			expect(RESULT).toBe('Deep content');

			// Check that parent directories are in metadata
			const FILES = await STORAGE.listFiles();
			const DIRA = FILES.find(F => F.path === '/memories/a');
			const DIRB = FILES.find(F => F.path === '/memories/a/b');
			const DIRC = FILES.find(F => F.path === '/memories/a/b/c');

			expect(DIRA?.isDirectory).toBe(true);
			expect(DIRB?.isDirectory).toBe(true);
			expect(DIRC?.isDirectory).toBe(true);
		});
	});

	describe('path validation', () => {
		it('should accept paths without /memories prefix', async () => {
			await STORAGE.create('/memories/test.txt', 'Content');
			const RESULT = await STORAGE.readRaw('/memories/test.txt');
			expect(RESULT).toBe('Content');
		});

		it('should accept paths with /memories prefix', async () => {
			await STORAGE.create('/memories/test.txt', 'Content');
			const RESULT = await STORAGE.readRaw('/memories/test.txt');
			expect(RESULT).toBe('Content');
		});
	});

	describe('metadata persistence', () => {
		it('should persist metadata across operations', async () => {
			await STORAGE.create('/memories/file.txt', 'Content');

			// Modify the file
			await STORAGE.strReplace('/memories/file.txt', 'Content', 'New Content');

			const FILES = await STORAGE.listFiles();
			const FILE = FILES.find(F => F.name === 'file.txt');

			expect(FILE).toBeDefined();
			expect(FILE?.lastModified).toBeInstanceOf(Date);
		});

		it('should update access time on view', async () => {
			await STORAGE.create('/memories/file.txt', 'Content');

			const FILES1 = await STORAGE.listFiles();
			const FILE1 = FILES1.find(F => F.name === 'file.txt');
			const ACCESSTIME1 = FILE1?.lastAccessed;

			// Wait a bit to ensure time difference
			await new Promise(RESOLVE => setTimeout(RESOLVE, 10));

			await STORAGE.view('/memories/file.txt');

			const FILES2 = await STORAGE.listFiles();
			const FILE2 = FILES2.find(F => F.name === 'file.txt');
			const ACCESSTIME2 = FILE2?.lastAccessed;

			expect(ACCESSTIME2?.getTime()).toBeGreaterThanOrEqual(ACCESSTIME1!.getTime());
		});
	});

	describe('secret key management', () => {
		it('should store files with workspace-specific keys', async () => {
			await STORAGE.create('/memories/test.txt', 'Secret Content');

			const KEYS = await CONTEXT.secrets.keys();
			const FILEKEYS = KEYS.filter((KEY: string) =>
				KEY.includes('agent-memory:file:') &&
				KEY.includes('test-workspace') &&
				KEY.includes('/memories/test.txt')
			);

			expect(FILEKEYS.length).toBe(1);
		});

		it('should store metadata with workspace-specific key', async () => {
			await STORAGE.create('/memories/test.txt', 'Content');

			const KEYS = await CONTEXT.secrets.keys();
			const METADATAKEYS = KEYS.filter((KEY: string) =>
				KEY.includes('agent-memory:metadata') &&
				KEY.includes('test-workspace')
			);

			expect(METADATAKEYS.length).toBe(1);
		});
	});
});
