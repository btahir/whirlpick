// RECEIPT_SCHEMA_V1: JSON Schema 2020-12 for receipt-v1 (PLAN §3.1). Printed by
// `whirlpick schema receipt` and emitted to dist/schema/receipt-v1.json by the web build.
// Weights use multipleOf 0.001: validators need a float tolerance (ajv: multipleOfPrecision 6).
import { SCHEMA_URLS } from './site.js';

const HEX64 = { type: 'string', pattern: '^[0-9a-f]{64}$' } as const;
/** No C0/C1 controls, no lone surrogates (u-mode regex), at least one non-space character. */
export const TEXT_PATTERN = '^(?=[\\s\\S]*\\S)[^\\u0000-\\u001F\\u007F-\\u009F\\uD800-\\uDFFF]*$';
export const LABEL_SCHEMA = { type: 'string', minLength: 1, maxLength: 200, pattern: TEXT_PATTERN } as const;
export const TAG_SCHEMA = { type: 'string', minLength: 1, maxLength: 32, pattern: TEXT_PATTERN } as const;
export const WEIGHT_SCHEMA = { type: 'number', minimum: 0.001, maximum: 1000000, multipleOf: 0.001 } as const;
const INT_LIST = { type: 'array', items: { type: 'integer', minimum: 0 } } as const;
const ISO = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$';
export const DATE_SCHEMA = { type: 'string', pattern: ISO } as const;

export const RECEIPT_SCHEMA_V1 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: SCHEMA_URLS.receipt,
  title: 'Whirlpick receipt (receipt-v1)',
  description: 'A reproducible record of one Whirlpick draw (algorithm whirlpick-draw-v1). Verify with `whirlpick verify` or the /verify/ page.',
  type: 'object',
  additionalProperties: false,
  required: ['format', 'version', 'algorithm', 'entries', 'wheelHash', 'seed', 'commitment', 'spinIndex', 'mode', 'params', 'result', 'beacon'],
  properties: {
    $schema: { type: 'string' },
    format: { const: 'whirlpick-receipt' },
    version: { const: 1 },
    algorithm: { const: 'whirlpick-draw-v1' },
    title: { type: ['string', 'null'], maxLength: 200 },
    entries: {
      type: 'array',
      minItems: 1,
      maxItems: 1000,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'weight', 'enabled'],
        properties: {
          label: LABEL_SCHEMA,
          weight: WEIGHT_SCHEMA,
          enabled: { type: 'boolean' },
          tags: { type: 'array', maxItems: 8, items: TAG_SCHEMA },
        },
      },
    },
    wheelHash: HEX64,
    committedWheelHash: { anyOf: [HEX64, { type: 'null' }] },
    seed: { anyOf: [HEX64, { type: 'null' }] },
    seedPhrase: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }] },
    commitment: HEX64,
    publicInput: { anyOf: [{ type: 'string', maxLength: 64 }, { type: 'null' }] },
    spinIndex: { type: 'integer', minimum: 0, maximum: 4294967295 },
    mode: { enum: ['single', 'multi', 'elimination', 'teams'] },
    params: {
      type: 'object',
      additionalProperties: false,
      properties: {
        count: { anyOf: [{ type: 'integer', minimum: 1 }, { const: 'all' }] },
        excluded: INT_LIST,
        teamCount: { anyOf: [{ type: 'integer', minimum: 2 }, { type: 'null' }] },
        teamSize: { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] },
        balance: { type: 'boolean' },
        keepApart: { type: 'array', items: INT_LIST },
        keepTogether: { type: 'array', items: INT_LIST },
        previousRounds: { type: 'array', items: { type: 'array', items: INT_LIST } },
        iterations: { type: 'integer', minimum: 0 },
      },
    },
    result: {
      type: 'object',
      additionalProperties: false,
      properties: {
        picks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['index', 'label', 'landingU32'],
            properties: {
              index: { type: 'integer', minimum: 0 },
              label: { type: 'string' },
              landingU32: { type: 'integer', minimum: 0, maximum: 4294967295 },
            },
          },
        },
        teams: { type: 'array', items: INT_LIST },
        repeatPairs: { type: 'integer', minimum: 0 },
      },
    },
    beacon: { type: 'null', description: 'Reserved for a public randomness beacon; must be null in v1.' },
    createdAt: { anyOf: [DATE_SCHEMA, { type: 'null' }] },
    committedAt: { anyOf: [DATE_SCHEMA, { type: 'null' }] },
    app: { type: 'string', maxLength: 64 },
  },
  allOf: [
    {
      if: { properties: { mode: { const: 'teams' } }, required: ['mode'] },
      then: { properties: { result: { required: ['teams', 'repeatPairs'] } } },
      else: { properties: { result: { required: ['picks'] } } },
    },
  ],
} as const;
