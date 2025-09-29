/** @type {import('jest').Config} */
// eslint-disable-next-line no-undef
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
	moduleNameMapper: {
		'^(\\.{1,2}/.*)\\.js$': '$1',
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', {
			useESM: true,
		}],
	},
	extensionsToTreatAsEsm: ['.ts'],
	collectCoverageFrom: [
		'src/lib/**/*.ts',
		'src/activityLogger.ts',
		'!src/**/*.test.ts',
		'!src/**/__tests__/**',
	],
	coverageThreshold: {
		global: {
			branches: 90,
			functions: 90,
			lines: 90,
			statements: 90,
		},
	},
};
