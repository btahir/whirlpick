#!/usr/bin/env node
// whirlpick-mcp: local stdio MCP server. Build first (`pnpm build:packages`); logic in src/mcp.ts.
import { runStdio } from '../dist/mcp.js';

const code = await runStdio(process.argv.slice(2));
if (code >= 0) process.exitCode = code;
