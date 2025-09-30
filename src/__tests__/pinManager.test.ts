import * as vscode from 'vscode';
import { PinManager } from '../pinManager.js';

// Mock VSCode APIs
const mockContext = {
	workspaceState: {
		get: jest.fn().mockReturnValue([]),
		update: jest.fn().mockResolvedValue(undefined)
	},
	globalState: {
		get: jest.fn().mockReturnValue([]),
		update: jest.fn().mockResolvedValue(undefined)
	}
} as unknown as vscode.ExtensionContext;

const mockWorkspaceFolder = {
	name: 'test-workspace',
	uri: vscode.Uri.file('/test/path')
} as vscode.WorkspaceFolder;

describe('PinManager', () => {
	let pinManager: PinManager;

	beforeEach(() => {
		jest.clearAllMocks();
		pinManager = new PinManager(mockContext, mockWorkspaceFolder, false);
	});

	test('should initialize with empty pinned files', async () => {
		const pinnedFiles = await pinManager.getPinnedFiles();
		expect(pinnedFiles).toEqual([]);
		expect(mockContext.workspaceState.get).toHaveBeenCalledWith('pinnedMemoryFiles_test-workspace', []);
	});

	test('should pin a file', async () => {
		await pinManager.pinFile('/memories/test.txt');
		expect(mockContext.workspaceState.update).toHaveBeenCalledWith('pinnedMemoryFiles_test-workspace', ['/memories/test.txt']);
	});

	test('should check if a file is pinned', async () => {
		(mockContext.workspaceState.get as jest.Mock).mockReturnValue(['/memories/test.txt']);

		const isPinned = await pinManager.isPinned('/memories/test.txt');
		const isNotPinned = await pinManager.isPinned('/memories/other.txt');

		expect(isPinned).toBe(true);
		expect(isNotPinned).toBe(false);
	});

	test('should unpin a file', async () => {
		(mockContext.workspaceState.get as jest.Mock).mockReturnValue(['/memories/test.txt', '/memories/other.txt']);

		await pinManager.unpinFile('/memories/test.txt');

		expect(mockContext.workspaceState.update).toHaveBeenCalledWith('pinnedMemoryFiles_test-workspace', ['/memories/other.txt']);
	});

	test('should update pinned path when file is renamed', async () => {
		(mockContext.workspaceState.get as jest.Mock).mockReturnValue(['/memories/old.txt']);

		await pinManager.updatePinnedPath('/memories/old.txt', '/memories/new.txt');

		expect(mockContext.workspaceState.update).toHaveBeenCalledWith('pinnedMemoryFiles_test-workspace', ['/memories/new.txt']);
	});

	test('should use global storage when specified', () => {
		const globalPinManager = new PinManager(mockContext, mockWorkspaceFolder, true);
		globalPinManager.setGlobalStorage(true);

		// This would use global storage instead of workspace storage
		expect(globalPinManager.getWorkspaceId()).toBe('test-workspace');
	});
});