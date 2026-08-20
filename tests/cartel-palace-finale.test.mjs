/**
 * The Palace finale confrontation (owner's 2026-08-19 direction): the wife
 * and the two short men are staged at Mark's table, the staged beats replace
 * the old two-line hand-off, the script is conditioned on the evidence the
 * player actually gathered, and the resolution has not moved — Mark and
 * Sauce die by the player's hand and the mission completes exactly as
 * before, with the trio's reactions framing it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { buildPalaceCast } from '../src/cartel-palace/cast.js';
import {
  FINALE_BEATS,
  FINALE_SPEAKERS,
  PalaceFinaleDirector,
  allFinaleCues,
  composeConfrontation,
} from '../src/cartel-palace/finale.js';
import { CartelPalaceMission, EVIDENCE_IDS, PALACE_BEATS } from '../src/cartel-palace/mission.js';
import { PalaceSecurity } from '../src/cartel-palace/security.js';
import { CombatActor } from '../src/core/combat/actors.js';
import { FACTIONS } from '../src/core/combat/factions.js';

const manifest = JSON.parse(
  fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'),
);

function stubHud() {
  const lines = [];
  return { lines, say: (text) => lines.push(text), toast: () => {} };
}

function harness() {
  const scene = new THREE.Group();
  const cast = buildPalaceCast(scene);
  const hud = stubHud();
  let engaged = 0;
  const finale = new PalaceFinaleDirector({
    cast, hud, audio: null, onEngage: () => engaged++,
  });
  return {
    scene, cast, hud, finale, engagements: () => engaged,
  };
}

/** Run the director's simulated clock until the floor is quiet. */
function drain(finale, { step = 0.1, limit = 2400 } = {}) {
  for (let i = 0; i < limit; i++) {
    finale.update(step);
    if (!finale.queue.length && !finale.current && finale.timer <= 0) return;
  }
  throw new Error('finale dialogue never drained');
}

/* ---------------- The trio is staged, and staged as civilians ---------------- */

test('the wife and both short men are built at the dining table, outside faction combat', () => {
  const { cast } = harness();

  assert.equal(cast.civilians.length, 3);
  assert.deepEqual(cast.civilians.map((entry) => entry.id), ['wife', 'short-one', 'short-two']);
  for (const entry of cast.civilians) {
    assert.equal(entry.role, 'civilian');
    assert.equal(entry.down, false);
    // Inside the dining room: gallery partition at z -34.2, rear wall -49.7.
    assert.ok(entry.root.position.z < -34.2 && entry.root.position.z > -49.7,
      `${entry.id} is staged outside the dining room`);
    assert.ok(Math.abs(entry.root.position.x) < 16);
    // Shootable: their bodies are hit targets with tagged zones.
    assert.ok(cast.hitTargets.includes(entry.root), `${entry.id} is not a hit target`);
    assert.equal(entry.figure.parts.head.userData.hitZone, 'head');
    // Never a Combatant: not in `all`, so no faction, no snapshot, no gun.
    assert.equal(cast.all.includes(entry), false, `${entry.id} leaked into the combat cast`);
  }

  const shorts = cast.civilians.filter((entry) => entry.id.startsWith('short-'));
  assert.equal(shorts.length, 2);
  for (const entry of shorts) {
    assert.ok(entry.figure.height <= 1.56, `${entry.id} is not visibly short (${entry.figure.height})`);
  }
});

test('PalaceSecurity builds no combat runtime for the civilians and its snapshot never records them', () => {
  const { cast } = harness();
  const security = new PalaceSecurity({
    cast,
    playerActor: new CombatActor({ id: 'prospect', faction: FACTIONS.CREW, maxHealth: 100 }),
  });

  for (const entry of cast.civilians) {
    assert.equal(security.runtime.has(entry.id), false);
  }
  const recorded = security.snapshot().entries.map((record) => record.id);
  assert.deepEqual(recorded.filter((id) => ['wife', 'short-one', 'short-two'].includes(id)), []);

  // Guards keep working with the trio in the room.
  security.update(0.1, { playerPosition: new THREE.Vector3(14, 1.66, 76) });
});

/* ---------------- Evidence conditions the script ---------------- */

test('the full evidence trail plays the cornered confrontation, citing every logged piece', () => {
  const beats = composeConfrontation({
    evidenceFound: Object.values(EVIDENCE_IDS),
    alarmRaised: false,
  });
  assert.deepEqual(beats, [
    'arrival.quiet', 'accuse',
    'accuse.belongings', 'accuse.ledger', 'accuse.still',
    'admission.cornered', 'mark.cornered',
    'begging.wife', 'begging.shorts', 'go',
  ]);
});

test('a thinner trail plays denial instead of a confession the player has not earned', () => {
  const pressed = composeConfrontation({
    evidenceFound: [EVIDENCE_IDS.BELONGINGS, EVIDENCE_IDS.SECURITY_STILL],
    alarmRaised: true,
  });
  assert.equal(pressed[0], 'arrival.loud');
  assert.ok(pressed.includes('admission.pressed') && pressed.includes('mark.pressed'));
  assert.ok(pressed.includes('accuse.belongings') && pressed.includes('accuse.still'));
  assert.equal(pressed.includes('accuse.ledger'), false,
    'Tony must not cite a ledger he never found');

  const denial = composeConfrontation({ evidenceFound: [], alarmRaised: false });
  assert.ok(denial.includes('admission.denial') && denial.includes('mark.denial'));
  assert.ok(denial.includes('accuse'));
  assert.deepEqual(denial.filter((beat) => beat.startsWith('accuse.')), [],
    'no evidence means the bare accusation and nothing to put on the table');

  // Every composed beat exists, whatever the tier.
  for (const evidenceFound of [[], [EVIDENCE_IDS.PAYMENT_LEDGER], Object.values(EVIDENCE_IDS)]) {
    for (const alarmRaised of [false, true]) {
      for (const beat of composeConfrontation({ evidenceFound, alarmRaised })) {
        assert.ok(FINALE_BEATS[beat], `composed beat ${beat} is not authored`);
      }
    }
  }
});

/* ---------------- The staged beats fire in order and hand combat over ---------------- */

test('the confrontation plays accusation, admission, reaction, then both begging beats, in order', () => {
  const { finale, hud, engagements } = harness();

  assert.equal(finale.beginConfrontation({
    evidenceFound: Object.values(EVIDENCE_IDS),
    alarmRaised: false,
  }), true);
  assert.equal(finale.report().phase, 'confrontation');
  assert.equal(engagements(), 0, 'the script must not activate combat at the door');

  drain(finale);
  const spoken = finale.report().spoken;
  const beatOf = (cue) => cue.replace(/^palace\.finale\.[a-z-]+\./, '').replace(/-\d+$/, '');
  const firstIndex = (beat) => spoken.findIndex((cue) => beatOf(cue) === beat);

  const order = ['arrival.quiet', 'accuse', 'accuse.belongings', 'accuse.ledger', 'accuse.still',
    'admission.cornered', 'mark.cornered', 'begging.wife', 'begging.shorts', 'go'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(firstIndex(order[i - 1]) >= 0, `${order[i - 1]} never fired`);
    assert.ok(firstIndex(order[i - 1]) < firstIndex(order[i]),
      `${order[i - 1]} must precede ${order[i]}`);
  }
  // The begging is real: the wife pleads, and the double act splits its lines.
  assert.ok(spoken.some((cue) => cue.startsWith('palace.finale.wife.begging.wife-')));
  assert.ok(spoken.some((cue) => cue.startsWith('palace.finale.short-one.begging.shorts-')));
  assert.ok(spoken.some((cue) => cue.startsWith('palace.finale.short-two.begging.shorts-')));

  // Combat engaged exactly once, on Tony's verdict line — and the HUD carried
  // every line as a named subtitle.
  assert.equal(engagements(), 1);
  assert.equal(finale.report().phase, 'combat');
  assert.equal(hud.lines.length, spoken.length);
  assert.match(hud.lines[0], /MARK/);
});

test('the player opening fire mid-speech interrupts the script and engages immediately', () => {
  const { finale, engagements } = harness();
  finale.beginConfrontation({ evidenceFound: Object.values(EVIDENCE_IDS) });
  finale.update(0.1); // Mark's greeting starts.
  assert.equal(finale.interrupt(), true);
  assert.equal(engagements(), 1);
  assert.equal(finale.report().phase, 'combat');
  assert.deepEqual(finale.report().pendingCues, [], 'no queued speech survives the first shot');
  assert.equal(finale.interrupt(), false, 'a second shot cannot double-engage');
});

/* ---------------- Kills still complete the mission, and the trio reacts ---------------- */

test('the kills land as before — mission clears — and the trio screams, dives and curses', () => {
  const { cast, finale } = harness();
  const mission = new CartelPalaceMission();
  mission.begin();
  mission.enterPerimeter({ powerCut: true });
  mission.enterEstate();
  for (const id of Object.values(EVIDENCE_IDS)) mission.collectEvidence(id);
  assert.equal(mission.enterDiningRoom(), true);

  finale.beginConfrontation({ evidenceFound: Object.values(EVIDENCE_IDS) });
  drain(finale);

  // First kill: Mark. Elimination mechanics unchanged; the director only reacts.
  cast.markDown(cast.mark);
  assert.equal(mission.registerTargetDown('mark'), true);
  finale.onTargetDown('mark');
  assert.ok(finale.report().pendingCues.concat(finale.current?.cue ?? [])
    .some((cue) => cue.includes('react.mark-first')), 'the first kill must queue its reaction');
  assert.equal(finale.report().dived, true, 'the short pair dives on the first kill');

  /* The dive is unison and physical, and it lands them BESIDE the table.
   *
   * Owner, 2026-08-20 playtest: *"their dive animation must land them BESIDE
   * or AWAY from the table, not underneath it"*. This assertion used to
   * REQUIRE the old landing -- inside the table's own 9.8 x 2.2 footprint --
   * which is the clip the owner reported, so it is inverted here: the
   * landing must be clear of the table and clear of every chair collider. */
  drain(finale);
  for (const entry of cast.civilians.filter((civilian) => civilian.id.startsWith('short-'))) {
    assert.equal(entry.figure.pose, 'prone', `${entry.id} did not end up prone`);
    const { x, z } = entry.root.position;
    const underTable = Math.abs(x) <= 4.9 + 0.5 && z >= -43.5 - 0.5 && z <= -41.3 + 0.5;
    assert.equal(underTable, false,
      `${entry.id} dived under Mark's table again (${x}, ${z})`);
    for (const [cx, cz] of [
      [-3.6, -44.2], [-1.2, -44.2], [1.2, -44.2], [3.6, -44.2], [-5.55, -42.4], [5.55, -42.4],
    ]) {
      assert.ok(Math.hypot(x - cx, z - cz) > 0.95,
        `${entry.id} landed on the chair at (${cx}, ${cz})`);
    }
    // And still inside the dining room, not through its walls.
    assert.ok(Math.abs(x) < 17.7 && z > -49.7 && z < -34.2,
      `${entry.id} landed outside the dining room (${x}, ${z})`);
  }

  // Second kill: Sauce. Mission clears exactly as before; the wife gets her aria.
  cast.markDown(cast.sauce);
  assert.equal(mission.registerTargetDown('sauce'), true);
  finale.onTargetDown('sauce');
  assert.equal(mission.beat, PALACE_BEATS.CLEAR);
  assert.equal(mission.snapshot().markEliminated && mission.snapshot().sauceEliminated, true);
  drain(finale);
  assert.ok(finale.report().spoken.some((cue) => cue.includes('react.all-down')));
  assert.equal(finale.report().phase, 'aftermath');
  assert.equal(mission.extract(), true, 'the palace still completes over the begging trio');
});

test('a dead civilian speaks no lines, and the survivor carries the double act', () => {
  const { cast, finale } = harness();
  cast.civilianDown(cast.civilians.find((entry) => entry.id === 'short-one'));
  finale.beginConfrontation({ evidenceFound: Object.values(EVIDENCE_IDS) });
  drain(finale);
  const spoken = finale.report().spoken;
  assert.equal(spoken.some((cue) => cue.startsWith('palace.finale.short-one.')), false,
    'a corpse delivered a line');
  assert.ok(spoken.some((cue) => cue.startsWith('palace.finale.short-two.')));
  // The engage marker still fires even if its speaker's beat lost members.
  assert.equal(finale.report().engaged, true);
});

test('killing a begging civilian queues that reaction once and never touches the mission', () => {
  const { cast, finale } = harness();
  finale.beginConfrontation({ evidenceFound: Object.values(EVIDENCE_IDS) });
  const wife = cast.civilians.find((entry) => entry.id === 'wife');
  cast.civilianDown(wife, { roll: -0.36 });
  assert.equal(finale.onCivilianDown(wife), true);
  assert.equal(finale.onCivilianDown(wife), false, 'one death, one reaction');
  drain(finale);
  assert.ok(finale.report().spoken.some((cue) => cue.includes('react.wife-down')));

  const mission = new CartelPalaceMission();
  mission.begin();
  assert.equal(mission.registerTargetDown('wife'), false,
    'the mission has no ledger entry for civilians');
});

test('checkpoint staging skips the speech and the aftermath stages the dived room', () => {
  const resumed = harness();
  assert.equal(resumed.finale.skipConfrontation(), true);
  assert.equal(resumed.finale.report().phase, 'combat');
  assert.equal(resumed.engagements(), 0, 'a resume must not re-activate an already-live encounter');
  assert.equal(resumed.finale.beginConfrontation({}), false, 'no speech replays over a resume');

  const cleared = harness();
  cleared.finale.stageAftermath();
  assert.equal(cleared.finale.report().phase, 'aftermath');
  for (const entry of cleared.cast.civilians.filter((civilian) => civilian.id.startsWith('short-'))) {
    assert.equal(entry.figure.pose, 'prone');
  }
});

/* ---------------- Every authored line is in the recording ledger ---------------- */

test('every finale cue is registered in the manifest as vo.palace.finale.*, voice and words matching', () => {
  const cues = allFinaleCues();
  assert.ok(cues.length >= 35, 'the confrontation has lost lines rather than gained them');
  assert.equal(new Set(cues.map((cue) => cue.cue)).size, cues.length, 'two lines share one recording');

  const rows = new Map((manifest.sfx ?? [])
    .filter((row) => row.name.startsWith('vo.palace.finale.'))
    .map((row) => [row.name, row]));
  for (const cue of cues) {
    const row = rows.get(`vo.${cue.cue}.1`);
    assert.ok(row, `manifest is missing vo.${cue.cue}.1`);
    assert.equal(row.voice, cue.voice, `${cue.cue} voice drifted`);
    assert.equal(row.say, cue.text, `${cue.cue} words drifted from the script`);
    if (cue.direction) assert.equal(row.direction, cue.direction, `${cue.cue} delivery note drifted`);
  }
  assert.equal(rows.size, cues.length, 'the manifest carries stale vo.palace.finale.* rows');

  // Every speaker resolves to a voice profile; the four new ones exist.
  for (const speaker of Object.values(FINALE_SPEAKERS)) {
    assert.ok(manifest.voices[speaker.voice], `voice profile ${speaker.voice} is not declared`);
  }
});
