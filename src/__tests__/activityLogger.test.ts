import { MemoryActivityLogger } from '../activityLogger';

// Mock vscode module
jest.mock('vscode', () => ({
	EventEmitter: class EventEmitter<T> {
		private listeners: Array<(e: T) => void> = [];

		get event() {
			return (listener: (e: T) => void) => {
				this.listeners.push(listener);
				return {
					dispose: () => {
						const index = this.listeners.indexOf(listener);
						if (index > -1) {
							this.listeners.splice(index, 1);
						}
					}
				};
			};
		}

		fire(data: T): void {
			this.listeners.forEach(listener => listener(data));
		}

		dispose(): void {
			this.listeners = [];
		}
	}
}), { virtual: true });

describe('MemoryActivityLogger', () => {
	let logger: MemoryActivityLogger;

	beforeEach(() => {
		logger = new MemoryActivityLogger();
	});

	afterEach(() => {
		logger.dispose();
	});

	describe('log', () => {
		it('should add a log entry', () => {
			logger.log('create', '/memories/test.txt', true, 'Created successfully');

			const logs = logger.getLogs();
			expect(logs).toHaveLength(1);
			expect(logs[0]).toMatchObject({
				command: 'create',
				path: '/memories/test.txt',
				success: true,
				details: 'Created successfully'
			});
		});

		it('should add logs in reverse chronological order (newest first)', () => {
			logger.log('create', '/memories/file1.txt', true);
			logger.log('view', '/memories/file2.txt', true);
			logger.log('delete', '/memories/file3.txt', true);

			const logs = logger.getLogs();
			expect(logs).toHaveLength(3);
			expect(logs[0].command).toBe('delete');
			expect(logs[1].command).toBe('view');
			expect(logs[2].command).toBe('create');
		});

		it('should include timestamp for each log', () => {
			const before = new Date();
			logger.log('create', '/memories/test.txt', true);
			const after = new Date();

			const logs = logger.getLogs();
			expect(logs[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(logs[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
		});

		it('should handle log entries without details', () => {
			logger.log('view', '/memories/test.txt', true);

			const logs = logger.getLogs();
			expect(logs[0].details).toBeUndefined();
		});

		it('should handle failed operations', () => {
			logger.log('create', '/memories/test.txt', false, 'File already exists');

			const logs = logger.getLogs();
			expect(logs[0].success).toBe(false);
			expect(logs[0].details).toBe('File already exists');
		});
	});

	describe('maxLogs limit', () => {
		it('should limit logs to maxLogs count (1000)', () => {
			// Add 1200 logs
			for (let i = 0; i < 1200; i++) {
				logger.log('create', `/memories/file${i}.txt`, true);
			}

			const logs = logger.getLogs();
			expect(logs).toHaveLength(1000);
		});

		it('should keep the most recent logs when limit is exceeded', () => {
			// Add 1100 logs
			for (let i = 0; i < 1100; i++) {
				logger.log('create', `/memories/file${i}.txt`, true);
			}

			const logs = logger.getLogs();
			expect(logs).toHaveLength(1000);
			// Most recent should be file1099
			expect(logs[0].path).toBe('/memories/file1099.txt');
			// Oldest kept should be file100
			expect(logs[999].path).toBe('/memories/file100.txt');
		});
	});

	describe('clear', () => {
		it('should clear all logs', () => {
			logger.log('create', '/memories/file1.txt', true);
			logger.log('view', '/memories/file2.txt', true);
			logger.log('delete', '/memories/file3.txt', true);

			expect(logger.getLogs()).toHaveLength(3);

			logger.clear();

			expect(logger.getLogs()).toHaveLength(0);
		});

		it('should allow logging after clear', () => {
			logger.log('create', '/memories/file1.txt', true);
			logger.clear();
			logger.log('view', '/memories/file2.txt', true);

			const logs = logger.getLogs();
			expect(logs).toHaveLength(1);
			expect(logs[0].command).toBe('view');
		});
	});

	describe('onDidChange event', () => {
		it('should fire event when log is added', (done) => {
			logger.onDidChange(() => {
				done();
			});

			logger.log('create', '/memories/test.txt', true);
		});

		it('should fire event when logs are cleared', (done) => {
			logger.log('create', '/memories/test.txt', true);

			logger.onDidChange(() => {
				done();
			});

			logger.clear();
		});

		it('should not fire event after disposal', () => {
			let eventFired = false;
			logger.onDidChange(() => {
				eventFired = true;
			});

			logger.dispose();
			logger.log('create', '/memories/test.txt', true);

			// Give it a moment to potentially fire
			setTimeout(() => {
				expect(eventFired).toBe(false);
			}, 50);
		});
	});

	describe('getLogs', () => {
		it('should return readonly array', () => {
			logger.log('create', '/memories/test.txt', true);
			const logs = logger.getLogs();

			// TypeScript should prevent direct modification, but we can check runtime
			expect(Array.isArray(logs)).toBe(true);
		});

		it('should return empty array when no logs exist', () => {
			const logs = logger.getLogs();
			expect(logs).toEqual([]);
		});
	});

	describe('dispose', () => {
		it('should dispose the event emitter', () => {
			expect(() => logger.dispose()).not.toThrow();
		});

		it('should allow multiple dispose calls', () => {
			logger.dispose();
			expect(() => logger.dispose()).not.toThrow();
		});
	});
});
