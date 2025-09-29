import { formatSize, formatRelativeTime, TextUtils } from '../utils';

describe('utils', () => {
	describe('formatSize', () => {
		it('should format bytes correctly', () => {
			expect(formatSize(0)).toBe('0 B');
			expect(formatSize(100)).toBe('100 B');
			expect(formatSize(1023)).toBe('1023 B');
		});

		it('should format kilobytes correctly', () => {
			expect(formatSize(1024)).toBe('1 KB');
			expect(formatSize(1536)).toBe('1.5 KB');
			expect(formatSize(10240)).toBe('10 KB');
		});

		it('should format megabytes correctly', () => {
			expect(formatSize(1048576)).toBe('1 MB');
			expect(formatSize(1572864)).toBe('1.5 MB');
			expect(formatSize(10485760)).toBe('10 MB');
		});

		it('should format gigabytes correctly', () => {
			expect(formatSize(1073741824)).toBe('1 GB');
			expect(formatSize(1610612736)).toBe('1.5 GB');
		});
	});

	describe('formatRelativeTime', () => {
		it('should format recent times as "just now"', () => {
			const now = new Date();
			const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
			expect(formatRelativeTime(thirtySecondsAgo)).toBe('just now');
		});

		it('should format minutes ago', () => {
			const now = new Date();
			const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
			const result = formatRelativeTime(fiveMinutesAgo);
			expect(result).toMatch(/\d+m ago/);
		});

		it('should format hours ago', () => {
			const now = new Date();
			const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
			const result = formatRelativeTime(threeHoursAgo);
			expect(result).toMatch(/\d+h ago/);
		});

		it('should format days ago', () => {
			const now = new Date();
			const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
			const result = formatRelativeTime(twoDaysAgo);
			expect(result).toMatch(/\d+d ago/);
		});

		it('should format dates older than 7 days with toLocaleDateString', () => {
			const now = new Date();
			const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
			const result = formatRelativeTime(tenDaysAgo);
			expect(result).toBe(tenDaysAgo.toLocaleDateString());
		});
	});

	describe('TextUtils', () => {
		describe('replaceFirst', () => {
		it('should replace the first occurrence of a string', () => {
			const text = 'Hello world, friend!';
			const result = TextUtils.replaceFirst(text, 'world', 'universe');
		expect(result).toBe('Hello universe, friend!');
	});

	it('should throw error if string is not found', () => {
		const text = 'Hello world';
		expect(() => TextUtils.replaceFirst(text, 'missing', 'replacement')).toThrow('Text not found');
	});

	it('should handle multiline text', () => {
		const text = 'line1\nline2\nline3\nline4';
		const result = TextUtils.replaceFirst(text, 'line2', 'lineX');
		expect(result).toBe('line1\nlineX\nline3\nline4');
	});

	it('should throw error if text appears multiple times', () => {
		const text = 'Hello world, world!';
		expect(() => TextUtils.replaceFirst(text, 'world', 'universe')).toThrow('Text appears 2 times');
	});

	it('should include file path in error when provided', () => {
		const text = 'Hello world, world!';
		expect(() => TextUtils.replaceFirst(text, 'world', 'universe', '/memories/test.txt')).toThrow('Text appears 2 times in /memories/test.txt');
	});

	it('should handle special characters', () => {
		const text = 'Price: $10.99';
		const result = TextUtils.replaceFirst(text, '$10.99', '$12.99');
		expect(result).toBe('Price: $12.99');
	});
});		describe('insertAtLine', () => {
			it('should insert text at the beginning (line 0)', () => {
				const text = 'Line 1\nLine 2\nLine 3';
				const result = TextUtils.insertAtLine(text, 0, 'New First Line');
				expect(result).toBe('New First Line\nLine 1\nLine 2\nLine 3');
			});

			it('should insert text in the middle', () => {
				const text = 'Line 1\nLine 2\nLine 3';
				const result = TextUtils.insertAtLine(text, 2, 'Inserted Line');
				expect(result).toBe('Line 1\nLine 2\nInserted Line\nLine 3');
			});

			it('should insert text at the end', () => {
				const text = 'Line 1\nLine 2\nLine 3';
				const result = TextUtils.insertAtLine(text, 3, 'New Last Line');
				expect(result).toBe('Line 1\nLine 2\nLine 3\nNew Last Line');
			});

			it('should throw error for negative line numbers', () => {
				const text = 'Line 1\nLine 2';
				expect(() => TextUtils.insertAtLine(text, -1, 'Text')).toThrow('Line number -1 is invalid. The file has 2 lines');
			});

			it('should throw error for line numbers beyond file length', () => {
				const text = 'Line 1\nLine 2';
				expect(() => TextUtils.insertAtLine(text, 10, 'Text')).toThrow('Line number 10 is invalid. The file has 2 lines');
			});

			it('should handle empty text', () => {
				const text = '';
				const result = TextUtils.insertAtLine(text, 0, 'First Line');
				expect(result).toBe('First Line\n');
			});
		});

		describe('extractLines', () => {
			it('should extract a single line', () => {
				const text = 'Line 1\nLine 2\nLine 3\nLine 4';
				const result = TextUtils.extractLines(text, 2, 2);
				expect(result).toBe('Line 2');
			});

			it('should extract multiple lines', () => {
				const text = 'Line 1\nLine 2\nLine 3\nLine 4';
				const result = TextUtils.extractLines(text, 2, 4);
				expect(result).toBe('Line 2\nLine 3\nLine 4');
			});

			it('should extract from beginning', () => {
				const text = 'Line 1\nLine 2\nLine 3';
				const result = TextUtils.extractLines(text, 1, 2);
				expect(result).toBe('Line 1\nLine 2');
			});

			it('should extract to end', () => {
				const text = 'Line 1\nLine 2\nLine 3';
				const result = TextUtils.extractLines(text, 2, 3);
				expect(result).toBe('Line 2\nLine 3');
			});

			it('should handle out of range end line gracefully', () => {
				const text = 'Line 1\nLine 2\nLine 3';
				const result = TextUtils.extractLines(text, 2, 100);
				expect(result).toBe('Line 2\nLine 3');
			});
		});
	});
});
