// `pnpm gen:vectors`: write packages/core/test/vectors.json (inputs + expected outputs). Run once;
// afterwards the file is a frozen golden (vectors.test.ts fails if the implementation drifts).
import { writeFileSync } from 'node:fs';
import { computeVectors, INPUTS } from './vectors-compute.js';

const out = { note: 'PLAN §2.12 test vectors for whirlpick-draw-v1. Frozen goldens: do not edit by hand.', inputs: INPUTS, expected: computeVectors() };
writeFileSync(new URL('./vectors.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('wrote packages/core/test/vectors.json');
