/**
 * THE RUN CODE.
 *
 * Owner, 2026-09-02: *"at the end of the game I want to review all the
 * stats and then I want everyone to get a code and I can plug the code in
 * to see their stats. Is that possible without a crazy system -- just an
 * algorithm for how we write the codes so when we plug it in we know what
 * it means on the backend?"*
 *
 * Yes, and this is the whole algorithm. There is no backend and no lookup
 * table: the code IS the record. THE PROSPECT'S RECORD (`campaign-stats.js`)
 * is eleven small numbers, so they are packed bit-by-bit in a fixed order
 * (`FIELDS` below), an eight-bit CRC is appended so a mistyped letter is
 * caught rather than read as a different run, and the 94 bits are written
 * out in a base-32 alphabet with no I, L, O or U -- nineteen characters in
 * groups of five, `SQ-XXXXX-XXXXX-XXXXX-XXXX`. `node tools/decode-run-code.mjs
 * <code>` turns one back into the table it came from; so does
 * `decodeRunCode` here, which is the same function the tool calls.
 *
 * The first field is a version, so a later record with more rows gets a new
 * layout under version 2 and the old codes still read.
 */
import { CAMPAIGN_STAT_MISSION_IDS, normalizeCampaignStatistics } from './campaign-stats.js';

export const RUN_CODE_VERSION = 1;
export const RUN_CODE_PREFIX = 'SQ';

/* Crockford's set: digits and letters with I, L, O and U left out, so a code
 * read over the phone or off a screenshot cannot confuse 1/I/L or 0/O. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CONFUSABLES = Object.freeze({ I: '1', L: '1', O: '0' });

/**
 * The layout, in order, with the bit width of each field. Widths are caps:
 * a value past the top of its field saturates rather than wrapping, and the
 * decoded table says so.
 */
export const RUN_CODE_FIELDS = Object.freeze([
  Object.freeze({ id: 'version', bits: 4 }),
  Object.freeze({ id: 'missionsCompleted', bits: 5 }),
  Object.freeze({ id: 'campaignDaysElapsed', bits: 6 }),
  Object.freeze({ id: 'shotsFired', bits: 17 }),
  Object.freeze({ id: 'peopleKilled', bits: 12 }),
  Object.freeze({ id: 'cabinExecution', bits: 2 }),
  Object.freeze({ id: 'margoCameHome', bits: 2 }),
  Object.freeze({ id: 'grossTakeThousands', bits: 11 }),
  Object.freeze({ id: 'palaceEvidenceRecovered', bits: 4 }),
  Object.freeze({ id: 'familyRespect', bits: 7 }),
  Object.freeze({ id: 'completedMissions', bits: 16 }),
]);
const PAYLOAD_BITS = RUN_CODE_FIELDS.reduce((sum, field) => sum + field.bits, 0);
const CHECK_BITS = 8;
const TOTAL_BITS = PAYLOAD_BITS + CHECK_BITS;
const CODE_LENGTH = Math.ceil(TOTAL_BITS / 5);
const GROUPS = Object.freeze([5, 5, 5, CODE_LENGTH - 15]);

const TRI_STATE = Object.freeze({ unknown: 0, yes: 1, no: 2 });

function cap(value, bits) {
  const max = 2 ** bits - 1;
  const number = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return Math.min(max, number);
}

function triState(value) {
  if (value === true) return TRI_STATE.yes;
  if (value === false) return TRI_STATE.no;
  return TRI_STATE.unknown;
}

function fromTriState(value) {
  if (value === TRI_STATE.yes) return true;
  if (value === TRI_STATE.no) return false;
  return null;
}

/** CRC-8 (polynomial 0x07) over the payload, byte by byte, high bit first. */
function crc8(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

function payloadBytes(payload) {
  const bytes = [];
  const byteCount = Math.ceil(PAYLOAD_BITS / 8);
  let value = payload;
  for (let i = 0; i < byteCount; i++) {
    bytes.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  return bytes;
}

/** The record as the eleven numbers the code carries, before packing. */
export function runCodeFieldsFromStatistics(statistics) {
  const stats = normalizeCampaignStatistics(statistics);
  const completed = new Set(stats.completedMissionIds);
  let mask = 0;
  for (const [index, id] of CAMPAIGN_STAT_MISSION_IDS.entries()) {
    if (completed.has(id)) mask |= 1 << index;
  }
  return Object.freeze({
    version: RUN_CODE_VERSION,
    missionsCompleted: stats.missionsCompleted,
    campaignDaysElapsed: stats.campaignDaysElapsed,
    shotsFired: stats.shotsFired,
    peopleKilled: stats.peopleKilled,
    cabinExecution: triState(stats.cabinExecutionByProspect),
    margoCameHome: triState(stats.margoCameHome),
    grossTakeThousands: Math.round(stats.grossTake / 1000),
    palaceEvidenceRecovered: stats.palaceEvidenceRecovered,
    familyRespect: stats.familyRespect,
    completedMissions: mask,
  });
}

function formatCode(raw) {
  const groups = [];
  let offset = 0;
  for (const size of GROUPS) {
    groups.push(raw.slice(offset, offset + size));
    offset += size;
  }
  return `${RUN_CODE_PREFIX}-${groups.join('-')}`;
}

/** Pack a statistics block into `SQ-XXXXX-XXXXX-XXXXX-XXXX`. */
export function encodeRunCode(statistics) {
  const fields = runCodeFieldsFromStatistics(statistics);
  let payload = 0n;
  for (const field of RUN_CODE_FIELDS) {
    payload = (payload << BigInt(field.bits)) | BigInt(cap(fields[field.id], field.bits));
  }
  const check = crc8(payloadBytes(payload));
  let bits = (payload << BigInt(CHECK_BITS)) | BigInt(check);
  // Left-align in the character grid so the last character's spare bits are zero.
  bits <<= BigInt(CODE_LENGTH * 5 - TOTAL_BITS);
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    raw = ALPHABET[Number(bits & 0x1fn)] + raw;
    bits >>= 5n;
  }
  return formatCode(raw);
}

/**
 * Bring a typed, pasted or read-aloud code back to its nineteen characters:
 * case, spaces, dashes and the prefix are all forgiven, and the four letters
 * the alphabet leaves out are mapped to the digits they get mistaken for.
 */
export function normalizeRunCode(text) {
  let raw = String(text ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (raw.startsWith(RUN_CODE_PREFIX)) raw = raw.slice(RUN_CODE_PREFIX.length);
  return raw.replace(/[ILO]/g, (letter) => CONFUSABLES[letter]);
}

/**
 * Read a code back. Returns `{ ok: true, fields, statistics, ... }` or
 * `{ ok: false, reason }` -- never a wrong record for a wrong code.
 */
export function decodeRunCode(text) {
  const raw = normalizeRunCode(text);
  if (raw.length !== CODE_LENGTH) {
    return Object.freeze({ ok: false, reason: 'length', expected: CODE_LENGTH, got: raw.length });
  }
  let bits = 0n;
  for (const char of raw) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) return Object.freeze({ ok: false, reason: 'alphabet', char });
    bits = (bits << 5n) | BigInt(value);
  }
  bits >>= BigInt(CODE_LENGTH * 5 - TOTAL_BITS);
  const check = Number(bits & BigInt((1 << CHECK_BITS) - 1));
  const payload = bits >> BigInt(CHECK_BITS);
  if (crc8(payloadBytes(payload)) !== check) {
    return Object.freeze({ ok: false, reason: 'checksum' });
  }
  const fields = {};
  let rest = payload;
  for (const field of [...RUN_CODE_FIELDS].reverse()) {
    fields[field.id] = Number(rest & BigInt((1 << field.bits) - 1));
    rest >>= BigInt(field.bits);
  }
  if (fields.version !== RUN_CODE_VERSION) {
    return Object.freeze({ ok: false, reason: 'version', version: fields.version });
  }
  const completedMissionIds = CAMPAIGN_STAT_MISSION_IDS
    .filter((_, index) => fields.completedMissions & (1 << index));
  const statistics = normalizeCampaignStatistics({
    missionsCompleted: fields.missionsCompleted,
    campaignDaysElapsed: fields.campaignDaysElapsed,
    shotsFired: fields.shotsFired,
    peopleKilled: fields.peopleKilled,
    cabinExecutionByProspect: fromTriState(fields.cabinExecution),
    cabinExecutionCounted: fields.cabinExecution !== TRI_STATE.unknown,
    margoCameHome: fromTriState(fields.margoCameHome),
    grossTake: fields.grossTakeThousands * 1000,
    palaceEvidenceRecovered: fields.palaceEvidenceRecovered,
    familyRespect: fields.familyRespect,
    completedMissionIds,
  });
  const saturated = RUN_CODE_FIELDS
    .filter((field) => field.id !== 'version' && field.id !== 'completedMissions'
      && fields[field.id] === 2 ** field.bits - 1)
    .map((field) => field.id);
  return Object.freeze({
    ok: true,
    code: formatCode(raw),
    version: fields.version,
    fields: Object.freeze(fields),
    statistics,
    completedMissionIds: Object.freeze(completedMissionIds),
    saturated: Object.freeze(saturated),
  });
}
