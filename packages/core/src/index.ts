// @whirlpick/core public API (PLAN §12). Pure TypeScript: no DOM, no Node APIs.
export * from './site.js';
export * from './errors.js';
export type * from './types.js';
export { base64urlDecode, base64urlEncode, concatBytes, fromHex, isHex64, toHex, u32be, utf8 } from './bytes.js';
export { H, tag } from './hash.js';
export {
  codePointLength,
  isValidWeight,
  MAX_ENTRIES,
  MAX_LABEL,
  MAX_PUBLIC_INPUT,
  MAX_TAG,
  MAX_TAGS,
  MAX_WEIGHT,
  MAX_WHEELS,
  milliWeight,
  MIN_WEIGHT,
  normaliseEntries,
  normaliseLabel,
  normalisePublicInput,
  normaliseTags,
} from './labels.js';
export { newId } from './ids.js';
export { wheelBytes, wheelHash } from './canonical.js';
export { commitmentFor, generateSeed, normaliseSeed, seedFromPhrase, streamKey } from './commit.js';
export { bytesSource, DrawStream, randBelowWidth, type ByteSource } from './stream.js';
export { drawPicks, eligibleEntries, normaliseExcluded, pickOne, type DrawPicksInput, type EligibleEntry } from './draw.js';
export { balanceReport, groupOrder, planTeams, repeatPairList, splitTeams, TEAM_ITERATIONS, type SplitTeamsInput } from './teams.js';
export { buildReceipt, computeDraw, receiptEntries, receiptShapeProblem, receiptWinners, revealReceipt, type BuildReceiptInput } from './receipt.js';
export { CHECK_TEXT, verifyReceipt, type VerifyExpect } from './verify.js';
export { RECEIPT_SCHEMA_V1 } from './receipt-schema.js';
export { angleUnderPointer, extraTurns, finalRotation, landingFraction, landingTurn, mod1, sliceUnderPointer, slicesFor } from './geometry.js';
export {
  crossings,
  crossingsAt,
  DEFAULT_MAX_DEFLECTION,
  DEFAULT_PROFILE,
  DEFAULT_SPIN_DURATION,
  DESIGN_POINTER_TURN,
  DESIGN_SCREEN_OFFSET,
  easeInOutCubic,
  easing,
  easingVelocity,
  FLAP_WINDOW_TURNS,
  flapDeflection,
  FlapSim,
  LONG_PROFILE,
  MAX_SPIN_DURATION,
  MIN_SPIN_DURATION,
  pegTurns,
  planRotationAt,
  planSpin,
  profileFor,
  REDUCED_DURATION,
  REDUCED_PROFILE,
  rotationAt,
  skipMotion,
  velocityAt,
  WIND_UP_SECONDS,
  type FlapOptions,
  type MotionProfile,
  type SpinMotion,
  type SpinPlan,
} from './motion.js';
export { createProject, createWheel, DEFAULT_SETTINGS, defaultSettings, parseProject, SEMANTIC_CODES, validateProject, WHIRL_SCHEMA_V1, type ValidateOptions } from './project.js';
export { dedupeEntries, detectDelimiter, detectFormat, parseCsvRecords, parseEntriesText, shuffleEntries, sortEntries, type ParseOptions, type TextFormat } from './parse.js';
export {
  decodeJsonCode,
  decodeReceiptCode,
  decodeShare,
  encodeJsonCode,
  encodeReceiptCode,
  encodeShare,
  extractCode,
  linkInfo,
  LONG_LINK_WARNING,
  MAX_DECODED,
  MAX_LINK_CODE,
  MAX_QR_URL,
  namesUrl,
  parseNamesFragment,
  receiptFromText,
  shareDocFor,
  shareUrl,
  type CodecOptions,
  type LinkInfo,
  type LinkKind,
} from './share.js';
export { COUNTRIES, MAX_NUMBER_VALUES, presetById, presetProject, PRESETS, SYNTHETIC_NAMES, TRUTH_OR_DARE_PROMPTS } from './presets.js';
export { bestTextColor, contrastRatio, relativeLuminance } from './contrast.js';
export { advanceSession, createSession } from './session.js';
