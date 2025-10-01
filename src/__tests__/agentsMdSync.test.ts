import { AgentsMdSyncManager } from '../agentsMdSync';
import { IMemoryStorage, IMemoryFileInfo } from '../types';

// Mock vscode module
const mockConfig = {
	autoSyncToAgentsMd: false
};

const mockFileContent = new Map<string, Uint8Array>();

jest.mock('vscode', () => {
	interface FileSystemErrorWithCode extends Error {
		code: string;
	}

	const mockFs = {
		readFile: jest.fn(async (uri: { fsPath?: string; path?: string }) => {
			const path = uri.fsPath || uri.path;
			const content = mockFileContent.get(path as string);
			if (!content) {
				const error: FileSystemErrorWithCode = new Error('File not found') as FileSystemErrorWithCode;
				error.code = 'FileNotFound';
				throw error;
			}
			return content;
		}),
		writeFile: jest.fn(async (uri: { fsPath?: string; path?: string }, content: Uint8Array) => {
			const path = uri.fsPath || uri.path;
			mockFileContent.set(path as string, content);
		})
	};

	return {
		workspace: {
			getConfiguration: jest.fn(() => ({
				get: jest.fn(<T>(key: string, defaultValue: T): T => {
					if (key === 'autoSyncToAgentsMd') {
						return mockConfig.autoSyncToAgentsMd as T;
					}
					return defaultValue;
				})
			})),
			fs: mockFs
		},
		Uri: {
			joinPath: jest.fn((base: { fsPath?: string; path?: string }, ...parts: string[]) => ({
				fsPath: [base.fsPath, ...parts].join('/'),
				path: [base.path, ...parts].join('/')
			}))
		}
	};
}, { virtual: true });

// Import vscode after mocking
import * as vscode from 'vscode';

// Get reference to the mocked fs for assertions
const mockFs = vscode.workspace.fs as jest.Mocked<typeof vscode.workspace.fs>;

describe('AgentsMdSyncManager', () => {
	let syncManager: AgentsMdSyncManager;
	let mockStorage: jest.Mocked<IMemoryStorage>;
	let mockWorkspaceFolder: { uri: { fsPath: string; path: string }; name: string };

	beforeEach(() => {
		// Reset mocks
		mockConfig.autoSyncToAgentsMd = false;
		mockFileContent.clear();
		jest.clearAllMocks();

		syncManager = new AgentsMdSyncManager();

		// Mock storage
		mockStorage = {
			view: jest.fn(),
			readRaw: jest.fn(),
			create: jest.fn(),
			strReplace: jest.fn(),
			insert: jest.fn(),
			delete: jest.fn(),
			rename: jest.fn(),
			listFiles: jest.fn(),
			getWorkspaceId: jest.fn(() => 'test-workspace'),
			setPinManager: jest.fn()
		};

		// Mock workspace folder
		mockWorkspaceFolder = {
			uri: {
				fsPath: '/workspace',
				path: '/workspace'
			},
			name: 'test-workspace'
		};
	});

	describe('isAutoSyncEnabled', () => {
		it('should return false by default', () => {
			expect(syncManager.isAutoSyncEnabled()).toBe(false);
		});

		it('should return true when enabled in config', () => {
			mockConfig.autoSyncToAgentsMd = true;
			syncManager.updateConfig();
			expect(syncManager.isAutoSyncEnabled()).toBe(true);
		});
	});

	describe('syncToAgentsMd', () => {
		it('should not sync when disabled', async () => {
			mockConfig.autoSyncToAgentsMd = false;
			syncManager.updateConfig();

			await syncManager.syncToAgentsMd(mockStorage, mockWorkspaceFolder);

			expect(mockStorage.listFiles).not.toHaveBeenCalled();
			expect(mockFs.writeFile).not.toHaveBeenCalled();
		});

		it('should create empty memory section when no files exist', async () => {
			mockConfig.autoSyncToAgentsMd = true;
			syncManager.updateConfig();

			mockStorage.listFiles.mockResolvedValue([]);

			await syncManager.syncToAgentsMd(mockStorage, mockWorkspaceFolder);

			expect(mockStorage.listFiles).toHaveBeenCalled();
			expect(mockFs.writeFile).toHaveBeenCalled();

			const writeCall = mockFs.writeFile.mock.calls[0];
			const content = Buffer.from(writeCall[1]).toString('utf8');
			expect(content).toContain('<memories hint="Manage via memory tool">');
			expect(content).toContain('(No memory files yet)');
			expect(content).toContain('</memories>');
		});

		it('should create memory section with file contents', async () => {
			mockConfig.autoSyncToAgentsMd = true;
			syncManager.updateConfig();

			const mockFiles: IMemoryFileInfo[] = [
				{
					path: '/memories/test.txt',
					name: 'test.txt',
					isDirectory: false,
					size: 100,
					lastAccessed: new Date(),
					lastModified: new Date()
				}
			];

			mockStorage.listFiles.mockResolvedValue(mockFiles);
			mockStorage.readRaw.mockResolvedValue('Test content');

			await syncManager.syncToAgentsMd(mockStorage, mockWorkspaceFolder);

			expect(mockStorage.listFiles).toHaveBeenCalled();
			expect(mockStorage.readRaw).toHaveBeenCalledWith('/memories/test.txt');
			expect(mockFs.writeFile).toHaveBeenCalled();

			const writeCall = mockFs.writeFile.mock.calls[0];
			const content = Buffer.from(writeCall[1]).toString('utf8');
			expect(content).toContain('<memories hint="Manage via memory tool">');
			expect(content).toContain('<memory path="/memories/test.txt">');
			expect(content).toContain('Test content');
			expect(content).toContain('</memory>');
			expect(content).toContain('</memories>');
		});

		it('should handle multiple files', async () => {
			mockConfig.autoSyncToAgentsMd = true;
			syncManager.updateConfig();

			const mockFiles: IMemoryFileInfo[] = [
				{
					path: '/memories/file1.txt',
					name: 'file1.txt',
					isDirectory: false,
					size: 100,
					lastAccessed: new Date(),
					lastModified: new Date()
				},
				{
					path: '/memories/file2.txt',
					name: 'file2.txt',
					isDirectory: false,
					size: 100,
					lastAccessed: new Date(),
					lastModified: new Date()
				}
			];

			mockStorage.listFiles.mockResolvedValue(mockFiles);
			mockStorage.readRaw.mockImplementation(async (path: string) => {
				return path === '/memories/file1.txt' ? 'Content 1' : 'Content 2';
			});

			await syncManager.syncToAgentsMd(mockStorage, mockWorkspaceFolder);

			const writeCall = mockFs.writeFile.mock.calls[0];
			const content = Buffer.from(writeCall[1]).toString('utf8');
			expect(content).toContain('<memory path="/memories/file1.txt">');
			expect(content).toContain('Content 1');
			expect(content).toContain('<memory path="/memories/file2.txt">');
			expect(content).toContain('Content 2');
		});

		it('should replace existing memory section', async () => {
			mockConfig.autoSyncToAgentsMd = true;
			syncManager.updateConfig();

			// Set up existing AGENTS.md content
			const existingContent = `# My Agents
Some content here

<memory hint="Manage via memory tool">
<file path="/memories/old.txt">
Old content
</file>
</memory>

More content`;
			mockFileContent.set('/workspace/AGENTS.md', Buffer.from(existingContent, 'utf8'));

			const mockFiles: IMemoryFileInfo[] = [
				{
					path: '/memories/new.txt',
					name: 'new.txt',
					isDirectory: false,
					size: 100,
					lastAccessed: new Date(),
					lastModified: new Date()
				}
			];

			mockStorage.listFiles.mockResolvedValue(mockFiles);
			mockStorage.readRaw.mockResolvedValue('New content');

			await syncManager.syncToAgentsMd(mockStorage, mockWorkspaceFolder);

			const writeCall = mockFs.writeFile.mock.calls[0];
			const content = Buffer.from(writeCall[1]).toString('utf8');
			
			// Should preserve existing content structure
			expect(content).toContain('# My Agents');
			expect(content).toContain('Some content here');
			expect(content).toContain('More content');
			
			// Should have new memory section
			expect(content).toContain('<memory path="/memories/new.txt">');
			expect(content).toContain('New content');
			
			// Should not have old file
			expect(content).not.toContain('old.txt');
			expect(content).not.toContain('Old content');
		});

		it('should skip directories in file list', async () => {
			mockConfig.autoSyncToAgentsMd = true;
			syncManager.updateConfig();

			const mockFiles: IMemoryFileInfo[] = [
				{
					path: '/memories/dir',
					name: 'dir',
					isDirectory: true,
					size: 0,
					lastAccessed: new Date(),
					lastModified: new Date()
				},
				{
					path: '/memories/file.txt',
					name: 'file.txt',
					isDirectory: false,
					size: 100,
					lastAccessed: new Date(),
					lastModified: new Date()
				}
			];

			mockStorage.listFiles.mockResolvedValue(mockFiles);
			mockStorage.readRaw.mockResolvedValue('File content');

			await syncManager.syncToAgentsMd(mockStorage, mockWorkspaceFolder);

			// Should only read the file, not the directory
			expect(mockStorage.readRaw).toHaveBeenCalledTimes(1);
			expect(mockStorage.readRaw).toHaveBeenCalledWith('/memories/file.txt');

			const writeCall = mockFs.writeFile.mock.calls[0];
			const content = Buffer.from(writeCall[1]).toString('utf8');
			expect(content).toContain('<memory path="/memories/file.txt">');
			expect(content).not.toContain('<memory path="/memories/dir">');
		});

		it('should handle sync errors gracefully', async () => {
			mockConfig.autoSyncToAgentsMd = true;
			syncManager.updateConfig();

			mockStorage.listFiles.mockRejectedValue(new Error('Storage error'));

			// Should not throw
			await expect(syncManager.syncToAgentsMd(mockStorage, mockWorkspaceFolder)).resolves.not.toThrow();
		});

		it('should escape closing memory tags in content', async () => {
			mockConfig.autoSyncToAgentsMd = true;
			syncManager.updateConfig();

			const mockFiles: IMemoryFileInfo[] = [
				{
					path: '/memories/test.txt',
					name: 'test.txt',
					isDirectory: false,
					size: 100,
					lastAccessed: new Date(),
					lastModified: new Date()
				}
			];

			mockStorage.listFiles.mockResolvedValue(mockFiles);
			// Content contains closing memory tag
			mockStorage.readRaw.mockResolvedValue('Content with </memory> tag inside');

			await syncManager.syncToAgentsMd(mockStorage, mockWorkspaceFolder);

			const writeCall = mockFs.writeFile.mock.calls[0];
			const content = Buffer.from(writeCall[1]).toString('utf8');
			
			// Should escape the closing tag in content
			expect(content).toContain('Content with &lt;/memory&gt; tag inside');
		});
	});
});
