import { defineConfig } from 'vitest/config';

// Workspace packages export `source: ./src/index.ts`; tests run against source, no build needed
// (the CLI/MCP tests spawn the built bins, so `pnpm test` builds packages first).
const conditions = ['source', 'import', 'module', 'node', 'default'];
const base = { resolve: { conditions }, ssr: { resolve: { conditions, externalConditions: ['source'] } } };
const slow = { testTimeout: 180_000, hookTimeout: 180_000 };

export default defineConfig({
  ...base,
  test: {
    passWithNoTests: true,
    projects: [
      { ...base, test: { name: 'core', include: ['packages/core/test/**/*.test.ts'], ...slow } },
      { ...base, test: { name: 'cli', include: ['packages/cli/test/**/*.test.ts'], ...slow } },
      { ...base, test: { name: 'web-unit', include: ['apps/web/test/**/*.test.ts'], ...slow } },
    ],
  },
});
