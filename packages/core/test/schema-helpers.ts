import { Ajv2020 } from 'ajv/dist/2020.js';
import { RECEIPT_SCHEMA_V1, WHIRL_SCHEMA_V1 } from '../src/index.js';

export function makeAjv() {
  return new Ajv2020({ allErrors: true, multipleOfPrecision: 6, strict: true, strictRequired: false, unicodeRegExp: true });
}
const ajv = makeAjv();
export const validateReceiptSchema = ajv.compile(RECEIPT_SCHEMA_V1);
export const validateWhirlSchema = ajv.compile(WHIRL_SCHEMA_V1);
