/**
 * THE A-TEAM, AND THE FIVE MEN WHO SAY IT.
 *
 * `src/mansion/siege/attackers.js` owns one bark pool that is different from
 * every other one in the game: `BARKS.identity` is the attacking cartel crew
 * naming themselves, it carries real `vo.ateam.*` manifest cues, and since
 * 2026-08-20 it carries a NAMED SPEAKER per line -- the owner split the crew
 * off one voice profile onto five.
 *
 * That makes three things breakable that nothing else in the siege suite
 * watches, and all three are silent failures:
 *
 *   1. A cue name that drifts off `vo.ateam.` or collides with another line
 *      records the wrong take, or no take, and the fight just goes quiet.
 *   2. A line handed to a profile outside `ATEAM_VOICES` -- a typo, a sixth
 *      man, the old single `ateam` id left behind -- is a cue the manifest
 *      cannot cast.
 *   3. The pool walks with a cursor, so two neighbouring entries on the same
 *      man are two lines in a row in the same throat. Five voices exist to
 *      stop exactly that, and nothing else would notice it happening.
 *
 * And the load-bearing one, which is a TONE test and not a plumbing test: an
 * identity bark must keep leaving through `onBark` with its cue attached.
 * `tests/mansion-siege-people.test.mjs` holds the pool's `context.audio`
 * channel to the weapon catalog; the day somebody "simplifies" a bark into
 * `context.audio.play(cue)` that test goes red for a reason nobody will
 * connect to the A-Team, so this file states the promise from the other end.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ensureThreeShim, ensureDomShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { CombatActor } = await import('../src/core/combat/actors.js');
const { FACTIONS, FactionMatrix } = await import('../src/core/combat/factions.js');
const { MansionDamageState } = await import('../src/mansion/siege/state.js');
const { WaveDirector } = await import('../src/mansion/siege/waves.js');
const {
  createAttackerPool, ateamBarkCueNames, ATEAM_VOICES, ATEAM_IDENTITY_BARKS,
} = await import('../src/mansion/siege/attackers.js');

/* ================================================================== */
/* THE TABLE ITSELF                                                     */
/* ================================================================== */

test('every A-Team line names a man, a cue and something to shout', () => {
  assert.ok(ATEAM_IDENTITY_BARKS.length >= 30,
    `the crew is down to ${ATEAM_IDENTITY_BARKS.length} lines -- a pool this `
    + 'small repeats inside one wave');
  const men = new Set(ATEAM_VOICES);
  assert.equal(men.size, 5, 'the A-Team is five men');
  for (const entry of ATEAM_IDENTITY_BARKS) {
    assert.equal(typeof entry.line, 'string');
    assert.ok(entry.line.trim().length > 0, 'a line with nothing in it');
    assert.ok(men.has(entry.voice),
      `"${entry.line}" is cast on "${entry.voice}", who is not on the team`);
    assert.match(entry.cue, /^vo\.ateam\.[a-z0-9-]+$/,
      `"${entry.line}" carries cue "${entry.cue}"`);
    /* A bark is shouted across a landing mid-firefight. Anything long enough
     * to need a breath is dialogue, and dialogue belongs in script.js where
     * it can be queued and held. */
    assert.ok(entry.line.length <= 72,
      `too long to shout under fire (${entry.line.length} chars): "${entry.line}"`);
  }
});

test('no two A-Team cues collide, and none of them repeats a line', () => {
  const cues = ATEAM_IDENTITY_BARKS.map((entry) => entry.cue);
  assert.equal(new Set(cues).size, cues.length,
    `duplicate cue: ${cues.find((cue, i) => cues.indexOf(cue) !== i)}`);
  /* Two takes of "For the A-Team!" are deliberate -- the owner asked for it
   * twice -- so identical TEXT is legal, but only on two different men with
   * two different cues, which is what makes them two takes and not a bug. */
  const byLine = new Map();
  for (const entry of ATEAM_IDENTITY_BARKS) {
    const seen = byLine.get(entry.line);
    if (seen) {
      assert.notEqual(seen.voice, entry.voice,
        `"${entry.line}" is cast twice on ${entry.voice}`);
    }
    byLine.set(entry.line, entry);
  }
});

test('the pool never puts the same man back to back, including on the wrap', () => {
  /* `bark()` walks this array with a cursor and wraps, so the last entry is
   * the neighbour of the first. Both edges count. */
  for (let i = 0; i < ATEAM_IDENTITY_BARKS.length; i++) {
    const here = ATEAM_IDENTITY_BARKS[i];
    const next = ATEAM_IDENTITY_BARKS[(i + 1) % ATEAM_IDENTITY_BARKS.length];
    assert.notEqual(here.voice, next.voice,
      `${here.voice} says "${here.line}" and then "${next.line}"`);
  }
});

test('all five men work, and no one man owns the playoffs', () => {
  const spread = new Map(ATEAM_VOICES.map((voice) => [voice, 0]));
  const playoffs = new Map(ATEAM_VOICES.map((voice) => [voice, 0]));
  /* The joke is that the A-Team never made the playoffs and are proud of
   * themselves anyway, and the funniest shape of it is a man defending the
   * record to a house that never brought it up. It has to be the CREW's
   * grievance, not one loud man's, or the fight only makes the joke when
   * that one man is alive. */
  const RECORD = /playoff|seeding|standings|record|season|schedule|watched us play/i;
  for (const entry of ATEAM_IDENTITY_BARKS) {
    spread.set(entry.voice, spread.get(entry.voice) + 1);
    if (RECORD.test(entry.line)) playoffs.set(entry.voice, playoffs.get(entry.voice) + 1);
  }
  const share = ATEAM_IDENTITY_BARKS.length / ATEAM_VOICES.length;
  for (const voice of ATEAM_VOICES) {
    assert.ok(spread.get(voice) >= 3, `${voice} only has ${spread.get(voice)} lines`);
    assert.ok(spread.get(voice) <= share * 2,
      `${voice} is carrying ${spread.get(voice)} of ${ATEAM_IDENTITY_BARKS.length} lines`);
    assert.ok(playoffs.get(voice) >= 1,
      `${voice} never defends the record -- the grievance is the whole crew's`);
  }
});

test('the owner’s own five lines are still in the crew’s mouth', () => {
  /* Owner, 2026-08-20, verbatim. Delivery notes belong on the recording
   * sheet, so these are matched on their words rather than his capitals. */
  const said = ATEAM_IDENTITY_BARKS.map((entry) => entry.line.toLowerCase());
  const required = [
    'for the a-team!',
    'you’ll never be on the a-team!',
    'it doesn’t matter! the a-team never made playoffs!',
    'a-team rules!',
  ];
  for (const line of required) {
    assert.ok(said.includes(line), `the crew stopped saying "${line}"`);
  }
  /* "For the A-Team!" was asked for twice and is recorded twice. */
  assert.equal(said.filter((line) => line === 'for the a-team!').length, 2,
    'both takes of "For the A-Team!" have to survive, on two different men');
});

/* ================================================================== */
/* AND WHAT HAPPENS IN A REAL FIGHT                                     */
/* ================================================================== */

/** One four-man-deep wave, run once and read by both tests below: twenty-two
 * bodies at sixty frames a second is the expensive part of this file, and the
 * two questions it answers are about the same fight. */
let FIGHT = null;
function fight(seconds = 110) {
  if (FIGHT) return FIGHT;
  const scene = new THREE.Scene();
  const colliders = [];
  const damage = new MansionDamageState({ colliders, state: 'under_attack' });
  const played = [];
  const barks = [];
  const pool = createAttackerPool({
    scene,
    damage,
    matrix: new FactionMatrix(),
    onDown: () => {},
    audio: { hasSample: () => true, play: (cue) => played.push(cue) },
  });
  const director = new WaveDirector({ wave: 'two' });
  const orders = [...director.begin()];
  for (let i = 0; i < 6; i++) orders.push(...director.update(30));
  for (const order of orders) pool.spawn(order);

  const player = {
    position: new THREE.Vector3(0, 7.66, 46.5),
    actor: new CombatActor({ id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100 }),
    suppression: { misses: 0, noteNearMiss() { this.misses++; return 1; } },
  };
  /* The Prospect does not get to die here -- this is a test about what is
   * SAID over four minutes of contact, so he is kept on his feet and the
   * crew is kept talking. */
  /* `onBark` is read off the FRAME context, not off construction -- see
   * `update()`, which rebuilds `context` every tick. A pool handed a bark
   * listener only at construction is a silent pool. */
  const frame = { player, colliders, alive: [], onBark: (event) => barks.push(event) };
  for (let i = 0; i < 60 * seconds; i++) {
    pool.update(1 / 60, frame);
    if (player.actor.health <= 20) {
      player.actor.health = 100;
      player.actor.incapacitated = false;
    }
  }
  FIGHT = { barks, played };
  return FIGHT;
}

test('the A-Team names itself out loud, and never down the weapon channel', () => {
  const { barks, played } = fight();
  const identity = barks.filter((event) => event.key === 'identity');
  assert.ok(identity.length >= 4,
    `a wave's worth of contact and the crew named itself ${identity.length} time(s)`);

  for (const event of identity) {
    assert.match(event.cue, /^vo\.ateam\./,
      `an identity bark reached the scene without its cue: "${event.line}"`);
    assert.ok(ATEAM_VOICES.includes(event.voice),
      `"${event.line}" arrived on voice "${event.voice}"`);
  }

  /* THE PROMISE THE PEOPLE SUITE HOLDS FROM THE OTHER SIDE. `context.audio`
   * is the weapon channel. A spoken line must never appear on it. */
  assert.ok(played.length > 0, 'nobody fired a shot in the whole wave');
  const spoken = played.find((cue) => String(cue).startsWith('vo.'));
  assert.equal(spoken, undefined,
    `a voice cue went out on the pool's weapon audio channel: ${spoken}`);

  /* Tactical pools stay captions: no cue, no voice, nothing to record. */
  for (const event of barks.filter((e) => e.key !== 'identity')) {
    assert.equal(event.cue, null, `${event.key} invented a cue: ${event.cue}`);
    assert.equal(event.voice, null, `${event.key} invented a voice: ${event.voice}`);
  }
});

test('a firefight sounds like a crew, not one man on a loop', () => {
  const { barks } = fight();
  const identity = barks.filter((event) => event.key === 'identity');
  /* The cooldown is pool-wide and the table alternates men, so consecutive
   * identity lines are always different throats however the fight goes. */
  for (let i = 1; i < identity.length; i++) {
    assert.notEqual(identity[i].voice, identity[i - 1].voice,
      `${identity[i].voice} said "${identity[i - 1].line}" and then "${identity[i].line}"`);
    assert.notEqual(identity[i].cue, identity[i - 1].cue, 'a line repeated immediately');
  }
});

/* ================================================================== */
/* AND SOMETHING HAS TO DECODE THEM                                     */
/* ================================================================== */

test('every A-Team cue is in the bank the scene actually loads', () => {
  /* Owner, 2026-08-24: *"I also didnt hear the A team voice lines during the
   * siege."* Every test above this one passed while that was true. The table
   * named its cues, the pool handed them up, and `renderCombatBark` called
   * `speak()` with them -- and the scene never loaded the bank, so
   * `AudioEngine.play` fell through to the synth stand-in for all forty-two.
   * It does not throw and it does not warn: the subtitle says the words and a
   * blip comes out.
   *
   * A source read rather than a boot, because starting the siege needs a
   * browser. What is being pinned is the wiring: the mission's preload list
   * and its exported cue inventory both reach the bark table, so a line added
   * to the pool is a line that arrives decoded. */
  const main = readFileSync(new URL('../src/mansion/siege/main.js', import.meta.url), 'utf8');
  assert.match(main, /import \{[^}]*ateamBarkCueNames[^}]*\} from '\.\/attackers\.js';/,
    'the siege no longer knows the crew has recorded lines');
  const preload = main.slice(main.indexOf('await audio.loadAdditional('));
  const preloadEnd = preload.indexOf('});');
  assert.ok(preloadEnd > 0, 'the mission preload call has moved or gone');
  assert.match(preload.slice(0, preloadEnd), /ateamBarkCueNames\(\)/,
    'the A-Team bank is not decoded before the siege starts, so every identity '
    + 'bark plays its synth stand-in while the subtitle shows the line');
  const inventory = main.slice(main.indexOf('export function siegeCueNames()'));
  assert.match(inventory.slice(0, inventory.indexOf('}')), /ateamBarkCueNames\(\)/,
    'the scene\'s own cue inventory omits the crew, so the verifier that checks '
    + 'the page decoded what it asked for cannot see them either');

  /* And the list is the table, not a second copy of it. */
  assert.deepEqual(
    [...ateamBarkCueNames()].sort(),
    [...new Set(ATEAM_IDENTITY_BARKS.map((entry) => entry.cue))].sort(),
    'the exported cue list has drifted from the bark table it is drawn from',
  );
});

test('every A-Team cue has a recording behind it', () => {
  /* The load is only worth having if there is something to load.
   * `assets/sfx/index.json` is the shipped-asset ledger the engine decodes
   * from, so it is what a preload can actually find. */
  const index = JSON.parse(readFileSync(
    new URL('../assets/sfx/index.json', import.meta.url), 'utf8',
  ));
  const shipped = new Set(index.files ?? []);
  for (const cue of ateamBarkCueNames()) {
    assert.ok(shipped.has(`${cue}.mp3`),
      `${cue} is shouted in the siege and has no recording in assets/sfx`);
  }
});
