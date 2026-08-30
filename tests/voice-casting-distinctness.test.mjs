import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Two characters must not quietly become one performer.
 *
 * docs/VOICE-CASTING.md's rule 2 -- "a character is one person everywhere" --
 * is a ONE-WAY constraint, and every gate in this repo enforced only that
 * direction: one profile, one id, every scene. Nothing said the other thing,
 * which is that two DIFFERENT characters must not land on the same id unless
 * somebody decided they should. So ids drifted onto each other by hand, one
 * paste at a time, and the only way anyone found out was the owner playing the
 * game and asking why the man in the motel sounded like his uncle.
 *
 * This gate reads the `voices` block of assets/sfx/manifest.json, groups the
 * profile keys by their ElevenLabs id, and fails on any group of more than one
 * that is not named below with a reason. Adding a profile that reuses a
 * shipping id now costs a line in SANCTIONED and a sentence explaining
 * yourself, which is the whole intent: sharing a throat stays possible, but it
 * stops being something you can do without noticing.
 *
 * WHAT THIS GATE CANNOT DO, said plainly, because a green check here is a much
 * smaller claim than it looks:
 *
 *   It compares IDS. Two different ids that happen to sound like the same
 *   performer pass this test and always will. That is the actual case the
 *   owner reported: `motel-rico` (UZvBfqEdvCFLqsBOo9Zr), `lou2`
 *   (QzTKubutNn9TjrB7Xb2Q) and `mansion-gate` (TxWZERZ5Hc6h9dGxVmXa) are three
 *   distinct ids from three distinct sheet rows -- this file is green on all
 *   three -- and they are close enough in the ear that Rico reads as Captain
 *   Lou Sasole with a Boston hat on. No static check can hear that.
 *
 * The only check for THAT is a listening pass: a person playing the scenes
 * back to back, or `npm run sfx:listen` plus ears. This gate closes the half
 * of the blind spot a machine can close -- accidental id reuse -- and it is
 * not a substitute for the other half.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const groupKey = (profiles) => [...profiles].sort().join(' + ');

/**
 * The collisions that are allowed to exist, each with the reason it exists.
 *
 * A group is keyed by its profile names, sorted and joined, so a fourth
 * profile landing on one of these ids is a NEW group and fails -- an allowlist
 * entry excuses exactly the collision it was written for and not one profile
 * more.
 *
 * These three were confirmed against the shipping manifest on 2026-08-24, and
 * they are the complete set as of that date. Two of them are debts, not
 * decisions; only the first is a casting choice anybody made on purpose.
 */
const SANCTIONED = new Map([
  [groupKey(['lou1', 'lou']),
    'Deliberate: Big Uncle Lou Sputthole in the room and on the phone. One '
    + 'performer, two profiles, because the settings differ (the handset gets '
    + 'a different stability and style), not the man.'],
  [groupKey(['ateam1', 'cartel-guard3']),
    'Known and flagged at src/mansion/siege/attackers.js:786-793: the owner '
    + 'supplied Cf2KUROHGvqqd4q0ebDI on both the A-Team list and the Cartel '
    + 'Palace payroll, and it was wired as given rather than silently '
    + 'substituted. The two casts never share a scene, so nothing is audibly '
    + 'wrong today, and the owner has not ruled on it. Changing the ateam1 id '
    + 'in the manifest is the whole fix if he does.'],
  [groupKey(['hr', 'caib-radio']),
    'A leftover stock placeholder that was never recast: both still carry the '
    + 'old announcer id pNInz6obpgDQGcFmaJgB, which `announcer` itself was '
    + 'recast off. Neither is a decision -- they are two profiles nobody has '
    + 'cast yet, and both notes say PROVISIONAL. Delete this entry when they '
    + 'get real ids.'],
]);

function collisions() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
  const byId = new Map();
  for (const [profile, voice] of Object.entries(manifest.voices ?? {})) {
    const id = voice?.id;
    /* An unfilled `<paste id here>` placeholder is not a shared performer, it
     * is two profiles that are both still uncast, and generate-sfx.mjs already
     * refuses to run against one. Grouping them here would report a casting
     * collision that does not exist. */
    if (typeof id !== 'string' || id === '' || /^<.*>$/.test(id)) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(profile);
  }
  return [...byId.entries()]
    .filter(([, profiles]) => profiles.length > 1)
    .map(([id, profiles]) => ({ id, profiles, key: groupKey(profiles) }));
}

test('no two voice profiles share an ElevenLabs id without a stated reason', () => {
  const unexplained = collisions().filter((group) => !SANCTIONED.has(group.key));
  assert.deepEqual(unexplained.map((g) => `${g.key} (${g.id})`), [],
    'These profiles are the same performer. If that is what you meant, add the '
    + 'group to SANCTIONED in this file with the reason; if it is not, give the '
    + 'newer profile its own id in the voices block of assets/sfx/manifest.json '
    + 'and regenerate its lines with npm run sfx -- --force --cast <profile>.');
});

test('every sanctioned collision still exists and still names live profiles', () => {
  /* An allowlist nobody prunes rots into a lie -- docs/VOICE-CASTING.md
   * carried `npc-male` as NOpBlnGInO9m6vDvFkFC for nineteen days after that id
   * moved to `heist-guard`, and it read as authoritative the whole time.
   * Excuses expire with the thing they excuse: split one of these casts and
   * this test tells you the line is now dead text, in the same run. */
  const live = new Set(collisions().map((group) => group.key));
  for (const key of SANCTIONED.keys()) {
    assert.ok(live.has(key),
      `SANCTIONED still excuses "${key}", but those profiles no longer share an `
      + 'id. Delete the entry.');
  }
});

test('the two Lous stay two men', () => {
  /* The one merge this file would most like to catch, spelled out rather than
   * left to the general rule: Big Uncle Lou Sputthole (`lou`/`lou1`) and
   * Captain Lou Sasole (`lou2`) are different characters who share a first
   * name, which is exactly the shape of mistake a hurried paste makes. The
   * manifest note on `lou1` says "NOT `lou2` ... the two must never merge";
   * this is that sentence as a check. */
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
  const { voices } = manifest;
  assert.notEqual(voices.lou2.id, voices.lou1.id, 'Sasole and Sputthole merged');
  assert.notEqual(voices.lou2.id, voices.lou.id, 'Sasole and Sputthole merged');
});
