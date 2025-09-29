import * as vscode from 'vscode';
import { IMemoryActivityLog } from './types.js';

/**
 * Manages activity logs for memory operations
 */
export class MemoryActivityLogger {
	private logs: IMemoryActivityLog[] = [];
	private readonly maxLogs = 1000;
	private _onDidChangeEmitter = new vscode.EventEmitter<void>();
	public readonly onDidChange = this._onDidChangeEmitter.event;

	log(command: string, path: string, success: boolean, details?: string): void {
		const entry: IMemoryActivityLog = {
			timestamp: new Date(),
			command,
			path,
			details,
			success
		};

		this.logs.unshift(entry); // Add to beginning

		// Keep only the most recent logs
		if (this.logs.length > this.maxLogs) {
			this.logs = this.logs.slice(0, this.maxLogs);
		}

		this._onDidChangeEmitter.fire();
	}

	getLogs(): readonly IMemoryActivityLog[] {
		return this.logs;
	}

	clear(): void {
		this.logs = [];
		this._onDidChangeEmitter.fire();
	}

	dispose(): void {
		this._onDidChangeEmitter.dispose();
	}
}
