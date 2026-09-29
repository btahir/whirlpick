// STUB (contract only). Real implementations land module by module; signatures follow PLAN §12.
import { WhirlError } from './errors.js';
import type { DrawSession, Entry, EntryIn, HashedEntry, Mode, Pick, Preset, Receipt, Slice, TeamsResult, ValidationResult, VerifyReport, Warning, WhirlProject } from './types.js';

export * from './site.js';
export * from './errors.js';
export type * from './types.js';

const ni = (name: string): never => { throw new WhirlError('NOT_IMPLEMENTED', `${name} is not implemented yet`); };

export function normaliseEntries(_input: EntryIn[]): { entries: Entry[]; warnings: Warning[] } { return ni('normaliseEntries'); }
export function milliWeight(_w: number): number { return ni('milliWeight'); }
export function wheelHash(_entries: HashedEntry[]): string { return ni('wheelHash'); }
export function generateSeed(_random?: (b: Uint8Array) => void): string { return ni('generateSeed'); }
export function seedFromPhrase(_phrase: string): string { return ni('seedFromPhrase'); }
export function commitmentFor(_seedHex: string): string { return ni('commitmentFor'); }
export class DrawStream {
  readonly bytesConsumed = 0;
  constructor(_seedHex: string, _wheelHashHex: string, _spinIndex: number, _publicInput?: string | null) { ni('DrawStream'); }
  u32(): number { return ni('u32'); }
  u64(): bigint { return ni('u64'); }
  randBelow(_n: bigint): bigint { return ni('randBelow'); }
}
export interface DrawPicksInput { entries: HashedEntry[]; seed: string; publicInput?: string | null; spinIndex: number; count: number | 'all'; excluded?: number[] }
export function drawPicks(_o: DrawPicksInput): { picks: Pick[]; wheelHash: string } { return ni('drawPicks'); }
export interface SplitTeamsInput { entries: HashedEntry[]; seed: string; publicInput?: string | null; spinIndex: number; teamCount?: number; teamSize?: number; balance?: boolean; keepApart?: number[][]; keepTogether?: number[][]; previousRounds?: number[][][] }
export function splitTeams(_o: SplitTeamsInput): TeamsResult { return ni('splitTeams'); }
export interface BuildReceiptInput {
  entries: HashedEntry[]; seed: string; seedPhrase?: string | null; publicInput?: string | null; spinIndex?: number; mode: Mode;
  count?: number | 'all'; excluded?: number[];
  teamCount?: number | null; teamSize?: number | null; balance?: boolean; keepApart?: number[][]; keepTogether?: number[][]; previousRounds?: number[][][];
  title?: string | null; committedWheelHash?: string | null; committedAt?: string | null; createdAt?: string; app?: string; reveal?: boolean;
}
export function buildReceipt(_o: BuildReceiptInput): Receipt { return ni('buildReceipt'); }
export function verifyReceipt(_input: unknown, _expect?: { commitment?: string; wheelHash?: string }): VerifyReport { return ni('verifyReceipt'); }
export function slicesFor(_entries: HashedEntry[], _excluded?: number[]): Slice[] { return ni('slicesFor'); }
export function landingTurn(_slices: Slice[], _pos: number, _landingU32: number): number { return ni('landingTurn'); }
export function extraTurns(_durationSec: number, _reducedMotion: boolean): number { return ni('extraTurns'); }
export function finalRotation(_r0: number, _landing: number, _extra: number, _pointerTurn?: number): number { return ni('finalRotation'); }
export function sliceUnderPointer(_r: number, _slices: Slice[], _pointerTurn?: number): number { return ni('sliceUnderPointer'); }
export function rotationAt(_tSec: number, _spin: { from: number; to: number; duration: number; profile?: { a: number; p: number } }): number { return ni('rotationAt'); }
export function flapDeflection(_r: number, _slices: Slice[], _maxDeg: number, _pointerTurn?: number): number { return ni('flapDeflection'); }
export function crossings(_rPrev: number, _rNow: number, _slices: Slice[], _pointerTurn?: number): number { return ni('crossings'); }
export function validateProject(_json: unknown): ValidationResult { return ni('validateProject'); }
export function parseEntriesText(_text: string, _format?: 'txt' | 'csv' | 'tsv'): { entries: Entry[]; warnings: Warning[] } { return ni('parseEntriesText'); }
export function encodeShare(_project: WhirlProject): Promise<string> { return ni('encodeShare'); }
export function decodeShare(_code: string): Promise<WhirlProject> { return ni('decodeShare'); }
export function encodeReceiptCode(_r: Receipt): Promise<string> { return ni('encodeReceiptCode'); }
export function decodeReceiptCode(_code: string): Promise<unknown> { return ni('decodeReceiptCode'); }
export function shareUrl(_kind: 'w' | 'spin' | 'r', _code: string, _base?: string, _path?: string): string { return ni('shareUrl'); }
export const PRESETS: Preset[] = [];
export function presetById(_id: string, _params?: Record<string, string>): Preset | undefined { return ni('presetById'); }
export const WHIRL_SCHEMA_V1: object = {};
export const RECEIPT_SCHEMA_V1: object = {};
export function contrastRatio(_hexA: string, _hexB: string): number { return ni('contrastRatio'); }
export type { DrawSession };
