#!/usr/bin/env node
// whirlpick CLI entry point. Build first (`pnpm build:packages`); the logic lives in src/cli.ts.
import { main, nodeIo } from '../dist/cli.js';

process.exitCode = await main(process.argv.slice(2), nodeIo());
