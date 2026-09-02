#!/usr/bin/env node
/**
 * Read a Prospect's run code back into THE PROSPECT'S RECORD.
 *
 *   node tools/decode-run-code.mjs SQ-XXXXX-XXXXX-XXXXX-XXXX
 *   node tools/decode-run-code.mjs --json SQ-XXXXX-XXXXX-XXXXX-XXXX
 *
 * The code is the record: see `src/core/run-code.js` for the layout. A code
 * with a typo fails its checksum here rather than reading as somebody
 * else's run; the four letters the alphabet leaves out (I, L, O, U) are
 * forgiven as the digits they get mistaken for.
 */
import { buildProspectsRecord } from '../src/core/campaign-stats.js';
import { decodeRunCode } from '../src/core/run-code.js';

const args = process.argv.slice(2);
const json = args.includes('--json');
const code = args.filter((arg) => !arg.startsWith('--')).join('');

if (!code) {
  console.error('Usage: node tools/decode-run-code.mjs [--json] SQ-XXXXX-XXXXX-XXXXX-XXXX');
  process.exit(2);
}

const result = decodeRunCode(code);
if (!result.ok) {
  const why = {
    length: `expected ${result.expected} characters after SQ, got ${result.got}`,
    alphabet: `"${result.char}" is not a run-code character`,
    checksum: 'the checksum does not match: a character is wrong or missing',
    version: `run-code version ${result.version} is not one this build reads`,
  }[result.reason] ?? result.reason;
  console.error(`Not a valid run code: ${why}.`);
  process.exit(1);
}

if (json) {
  console.log(JSON.stringify({
    code: result.code,
    version: result.version,
    statistics: result.statistics,
    saturated: result.saturated,
  }, null, 2));
} else {
  const record = buildProspectsRecord(result.statistics);
  console.log(`${record.title}  (${result.code})`);
  const width = Math.max(...record.rows.map((row) => row.label.length));
  for (const row of record.rows) console.log(`  ${row.label.padEnd(width)}  ${row.value}`);
  console.log(`  ${'Missions'.padEnd(width)}  ${result.completedMissionIds.join(', ') || 'none'}`);
  if (result.saturated.length) {
    console.log(`  (at the top of their field, so at least this: ${result.saturated.join(', ')})`);
  }
}
