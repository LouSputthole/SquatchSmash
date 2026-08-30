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
  PALACE_NEXT_BEAT_BANK,
  PALACE_WAVE_INCOMING_CUE,
} from '../src/cartel-palace/audio-banks.js';
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

/**
 * The whole room, wired the way `main.js` wires it.
 *
 * The five callbacks are the entire seam between the director and the bodies,
 * so the harness implements them for real rather than counting them: a test
 * that stubs `onScramble` to a counter cannot tell a Mark who left from a Mark
 * who is still standing at the table.
 */
function harness() {
  const scene = new THREE.Group();
  const cast = buildPalaceCast(scene);
  const hud = stubHud();
  const log = {
    engaged: 0, scrambled: 0, returns: [], retreats: 0, waves: 0,
    presentationSteps: [],
  };
  const finale = new PalaceFinaleDirector({
    cast,
    hud,
    audio: null,
    onEngage: () => { log.engaged++; cast.activateFinalEncounter(); },
    onScramble: () => { log.scrambled++; cast.markScramblesAway(); },
    onMarkReturn: (options) => {
      log.returns.push(options);
      cast.activateMark({ armored: options.armored });
      if (!options.armored) { cast.mark.actor.armor = 0; cast.mark.actor.health = 260; }
    },
    onMarkRetreat: () => { log.retreats++; cast.markScramblesAway(); },
    onWave: () => { log.waves++; cast.releaseWave(); },
    onPresentationStep: (event) => log.presentationSteps.push({
      id: event.id,
      distance: event.distance,
      moving: event.moving,
      position: event.position.clone(),
    }),
  });
  return {
    scene, cast, hud, finale, log, engagements: () => log.engaged,
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

test('the wife, Lola and Johnny are built at the dining table, outside faction combat', () => {
  const { cast } = harness();

  assert.equal(cast.civilians.length, 3);
  assert.deepEqual(cast.civilians.map((entry) => entry.id), ['wife', 'lola', 'johnny']);
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

  /* Renamed 2026-08-25 on the owner's instruction; still the double act, and
   * still visibly short against a 1.9 m boss, which is the read the pair is
   * built on. */
  const shorts = cast.civilians.filter((entry) => ['lola', 'johnny'].includes(entry.id));
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
  assert.deepEqual(recorded.filter((id) => ['wife', 'lola', 'johnny'].includes(id)), []);

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
    'accuse.belongings', 'accuse.case-route', 'accuse.still',
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
  assert.equal(pressed.includes('accuse.case-route'), false,
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

  /* `go` no longer ends the confrontation: Mark's exit and the chef being
   * left holding it are part of the same continuous run of speech, which is
   * the point of the rewire -- the player never gets a menu, he gets a boss
   * walking out of the room. */
  const order = ['arrival.quiet', 'accuse', 'accuse.belongings', 'accuse.case-route', 'accuse.still',
    'admission.cornered', 'mark.cornered', 'begging.wife', 'begging.shorts', 'go',
    'mark.scramble', 'sauce.alone'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(firstIndex(order[i - 1]) >= 0, `${order[i - 1]} never fired`);
    assert.ok(firstIndex(order[i - 1]) < firstIndex(order[i]),
      `${order[i - 1]} must precede ${order[i]}`);
  }
  // The begging is real: the wife pleads, and the double act splits its lines.
  assert.ok(spoken.some((cue) => cue.startsWith('palace.finale.wife.begging.wife-')));
  assert.ok(spoken.some((cue) => cue.startsWith('palace.finale.lola.begging.shorts-')));
  assert.ok(spoken.some((cue) => cue.startsWith('palace.finale.johnny.begging.shorts-')));

  // Combat engaged exactly once, on Tony's verdict line — and the HUD carried
  // every line as a named subtitle.
  assert.equal(engagements(), 1);
  assert.equal(finale.report().phase, 'combat');
  assert.equal(hud.lines.length, spoken.length);
  assert.match(hud.lines[0], /MARK/);
  // And by the end of it the room is the chef's problem, not the boss's.
  assert.equal(finale.report().stage, 'sauce');
});

test('essential opening dialogue keeps the trigger locked until Tony hands combat over', () => {
  const { finale, engagements } = harness();
  assert.equal(finale.canPlayerFire(), true, 'ordinary Palace play begins with its weapon available');
  finale.beginConfrontation({ evidenceFound: Object.values(EVIDENCE_IDS) });
  finale.update(0.1); // Mark's greeting starts.
  assert.equal(finale.canPlayerFire(), false,
    'the first click can still erase the confrontation instead of being consumed');
  assert.equal(engagements(), 0, 'asking permission must not advance the room');

  for (let step = 0; step < 2400 && !finale.canPlayerFire(); step++) finale.update(0.1);
  assert.equal(finale.canPlayerFire(), true, 'Tony never released the trigger on the verdict line');
  assert.equal(engagements(), 1);
  assert.equal(finale.report().phase, 'combat');
  assert.ok(finale.report().pendingCues.length > 0,
    'unlocking the trigger discarded the essential exit/chef handoff dialogue');
});

test('Mark and the A-Team cross the room thresholds continuously instead of popping', () => {
  const { cast } = harness();

  const table = cast.mark.root.position.clone();
  assert.equal(cast.markScramblesAway(), true);
  assert.equal(cast.mark.root.visible, true, 'retreat hides Mark on its first frame');
  assert.equal(cast.mark.active, false, 'a retreating boss is still running combat AI');
  cast.updatePresentation(0.1);
  const firstRetreatFrame = cast.mark.root.position.clone();
  assert.ok(firstRetreatFrame.distanceTo(table) > 0.01, 'Mark did not leave the table');
  assert.equal(cast.mark.root.visible, true, 'Mark vanished before reaching the doorway');
  for (let frame = 0; frame < 180; frame++) cast.updatePresentation(1 / 60);
  assert.equal(cast.mark.root.visible, false, 'Mark never cleared the doorway after retreating');
  assert.equal(cast.mark.presentation, 'away');

  assert.equal(cast.activateMark({ armored: true }), true);
  const returnStart = cast.mark.root.position.clone();
  assert.equal(cast.mark.root.visible, true, 'Mark is not visible in the open doorway');
  assert.equal(cast.mark.active, false, 'Mark begins shooting before he enters the room');
  cast.updatePresentation(0.1);
  assert.ok(cast.mark.root.position.distanceTo(returnStart) > 0.01, 'Mark return is a frozen reveal');
  assert.equal(cast.mark.active, false, 'Mark activated on the threshold rather than after crossing it');
  for (let frame = 0; frame < 180; frame++) cast.updatePresentation(1 / 60);
  assert.equal(cast.mark.active, true, 'Mark never becomes live after entering');
  assert.equal(cast.mark.presentation, 'combat');

  assert.equal(cast.releaseWave(), 4);
  const starts = new Map(cast.wave.map((entry) => [entry.id, entry.root.position.clone()]));
  for (const entry of cast.wave) {
    assert.equal(entry.root.visible, true, `${entry.id} is invisible in the doorway`);
    assert.equal(entry.active, false, `${entry.id} starts firing before crossing the threshold`);
  }
  cast.updatePresentation(0.1);
  for (const entry of cast.wave) {
    assert.ok(entry.root.position.distanceTo(starts.get(entry.id)) > 0.01,
      `${entry.id} popped in without an ingress frame`);
  }
  for (let frame = 0; frame < 180; frame++) cast.updatePresentation(1 / 60);
  for (const entry of cast.wave) {
    assert.equal(entry.active, true, `${entry.id} never completed ingress`);
    assert.equal(entry.presentation, 'combat');
  }
});

test('scripted retreats and arrivals publish real movement for shared positional footsteps', () => {
  const { cast, finale, log } = harness();

  cast.markScramblesAway();
  for (let frame = 0; frame < 180; frame++) finale.update(1 / 60);
  assert.ok(log.presentationSteps.some((event) => event.id === 'mark'
    && event.moving && event.distance > 0),
  'Mark crosses the room silently because scripted motion never reaches step cadence');

  log.presentationSteps.length = 0;
  cast.releaseWave();
  for (let frame = 0; frame < 180; frame++) finale.update(1 / 60);
  for (const entry of cast.wave) {
    assert.ok(log.presentationSteps.some((event) => event.id === entry.id
      && event.moving && event.distance > 0),
    `${entry.id} crosses its threshold without publishing movement`);
  }
});

test('the A-Team arrival cue is a delivered recording gated by the dining-room bank', () => {
  const cue = manifest.sfx.find((entry) => entry.name === PALACE_WAVE_INCOMING_CUE);
  assert.ok(cue, `${PALACE_WAVE_INCOMING_CUE} has no authored manifest row`);
  assert.ok(PALACE_NEXT_BEAT_BANK.names.includes(PALACE_WAVE_INCOMING_CUE),
    'the wave can begin before its physical arrival cue is resident');
  assert.ok(fs.existsSync(new URL(`../assets/sfx/${PALACE_WAVE_INCOMING_CUE}.mp3`, import.meta.url)),
    `${PALACE_WAVE_INCOMING_CUE} silently falls back because its recording is absent`);

  const main = fs.readFileSync(new URL('../src/cartel-palace/main.js', import.meta.url), 'utf8');
  assert.match(main, /onWave:[\s\S]{0,700}audio\.play\(PALACE_WAVE_INCOMING_CUE,[\s\S]{0,260}PALACE_ANCHORS\.extraction/,
    'the live wave never requests the gated cue at an authored threshold');
});

test('every Palace wave path carries the complete shared A-Team colours', () => {
  const { cast } = harness();
  assert.equal(cast.wave.length, 4, 'the invariant did not inspect the complete wave');
  for (const entry of cast.wave) {
    const team = [];
    entry.root.traverse((object) => {
      if (object.isMesh && object.userData?.ateamTeamPiece) team.push(object);
    });
    assert.ok(team.length >= 7, `${entry.id} is out of A-Team colours (${team.length} pieces)`);
    for (const piece of team) {
      assert.match(piece.name, /^ateam\.colours\./);
      assert.equal(piece.userData.palaceWave, true);
    }
  }
});

/* ---------------- The three-stage fight ---------------- */

/**
 * THE SHAPE THE OWNER ASKED FOR, END TO END.
 *
 * 2026-08-25, verbatim: *"You go into the back room and confront Sauce. Mark
 * scrambles away. You then kill sauce and chose to kill his two short people.
 * Rename them Lola and Johnny. Once you do this it enrages him for the final
 * boss fight... you fight him and knock down his amour then he retreats and
 * then sends a wave of A team members who you blast and then he comes out
 * again enraged for the third and final fight of the scene."*
 *
 * The mechanics that were already right and must stay right: the kills are the
 * player's, the mission counts only Mark and Sauce, and the room completes.
 */
function playToTheChef(fixture) {
  const { finale } = fixture;
  finale.beginConfrontation({ evidenceFound: Object.values(EVIDENCE_IDS) });
  drain(finale);
  return fixture;
}

/** Put one combatant down the way the scene does, and tell the director. */
function drop(fixture, entry) {
  fixture.cast.markDown(entry);
  fixture.finale.onTargetDown(entry.id);
}

test('Mark leaves the table and the chef is left holding it', () => {
  const { cast, finale, log } = playToTheChef(harness());

  assert.equal(log.scrambled, 1, 'Mark never left');
  assert.equal(cast.mark.active, false, 'Mark is still a live target during the chef');
  assert.equal(cast.mark.root.visible, false, 'Mark is still in the room to be shot at');
  assert.equal(cast.sauce.active, true, 'the chef was not activated');
  assert.equal(finale.report().stage, 'sauce');
  /* And the wave is still behind two walls: invisible is what makes it
   * unhittable, because WeaponSystem filters its raycast on world visibility. */
  assert.equal(cast.waveStanding(), 4);
  for (const man of cast.wave) {
    assert.equal(man.active, false, `${man.id} is live before he has been called`);
    assert.equal(man.root.visible, false, `${man.id} can be shot through a wall`);
  }
});

test('the chef going down brings Mark back, cold, when nobody touched the help', () => {
  const fixture = playToTheChef(harness());
  const { cast, finale, log } = fixture;

  drop(fixture, cast.sauce);
  drain(finale);

  const spoken = finale.report().spoken;
  assert.ok(spoken.some((cue) => cue.includes('react.sauce-down')), 'the room did not react to the chef');
  assert.ok(spoken.some((cue) => cue.includes('begging.after-sauce')),
    'Lola and Johnny never got their offer in, so there is nothing to choose about');
  assert.equal(finale.report().enraged, false);
  assert.ok(spoken.some((cue) => cue.includes('reprisal.enter.cold')), 'Mark came back angry at nothing');
  assert.equal(spoken.some((cue) => cue.includes('reprisal.enter.enraged')), false);

  assert.equal(finale.report().stage, 'reprisal-one');
  assert.deepEqual(log.returns, [{ armored: true, enraged: false }]);
  assert.equal(cast.mark.active, true, 'Mark did not actually come back');
  assert.equal(cast.mark.root.visible, true);
});

test('killing the chef on the verdict itself still empties the table and starts stage one', () => {
  /* THE FRAME THE SAFETY COMES OFF.
   *
   * Tony's verdict carries `engage`; Mark's delegation, the line that carries
   * `scramble`, is the one AFTER it. A player who fires on the verdict kills
   * the chef with that line still queued -- and the urgent reaction clears the
   * floor and takes it with it. Without the scramble the stage never leaves
   * `confrontation`, nothing ever calls `_beginReprisal`, and the fight the
   * owner asked for simply never happens: a mission that cannot be finished.
   * Found by tools/verify-cartel-palace.mjs on 2026-08-25, in the real room. */
  const fixture = harness();
  const { cast, finale, log } = fixture;
  finale.beginConfrontation({ evidenceFound: Object.values(EVIDENCE_IDS) });
  for (let step = 0; step < 2400 && !finale.report().engaged; step++) finale.update(0.1);
  assert.equal(finale.report().stage, 'confrontation', 'the scramble had already played');

  drop(fixture, cast.sauce);
  drain(finale);

  assert.equal(log.scrambled, 1, 'Mark is still sitting at a table with a dead chef at it');
  assert.equal(finale.report().stage, 'reprisal-one', 'the fight never reached stage one');
  assert.equal(cast.mark.active, true);
  assert.equal(cast.mark.actor.armor > 0, true, 'he came back for stage one with no plates');
});

test('shooting Lola or Johnny is what makes it personal', () => {
  const fixture = playToTheChef(harness());
  const { cast, finale } = fixture;

  cast.civilianDown(cast.civilians.find((entry) => entry.id === 'lola'));
  finale.onCivilianDown(cast.civilians.find((entry) => entry.id === 'lola'));
  assert.equal(finale.report().enraged, true, 'the enrage is not wired to the choice');
  /* Let Johnny finish before the chef goes down. `react.sauce-down` is urgent
   * and urgent clears the floor, which is right -- a fresh corpse outranks a
   * eulogy -- but it means the two events have to be sequenced in the test the
   * way a player would produce them. */
  drain(finale);

  drop(fixture, cast.sauce);
  drain(finale);
  const spoken = finale.report().spoken;
  assert.ok(spoken.some((cue) => cue.includes('react.lola-down')), 'Johnny said nothing about it');
  assert.ok(spoken.some((cue) => cue.includes('reprisal.enter.enraged')));
  assert.equal(spoken.some((cue) => cue.includes('reprisal.enter.cold')), false);
});

test('every civilian corpse is grounded by its own scaled body, including Lola and Johnny', () => {
  /* Owner, 2026-08-28: *"Some of the dead shorter characters during the Mark
   * fight are floating off the floor... Do not just apply one hard-coded
   * Y-offset."* The Palace uses HeistFigure's measured settle: pose the actual
   * scaled rig, box that rig, and put its lowest point on `baseY`. Lock the
   * result here at three different heights so a shared magic offset cannot
   * satisfy the contract accidentally. */
  const { cast } = harness();
  const contacts = [];
  for (const entry of cast.civilians) {
    assert.equal(cast.civilianDown(entry), true);
    for (let frame = 0; frame < 8; frame++) entry.figure.update(0.05, { fear: 0 });
    entry.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(entry.figure.parts.group);
    contacts.push({
      id: entry.id,
      height: entry.figure.height,
      lift: entry.figure.tilt.position.y,
      floorError: bounds.min.y - entry.figure.baseY,
    });
  }

  assert.deepEqual(contacts.map(({ id }) => id), ['wife', 'lola', 'johnny']);
  assert.ok(contacts.every(({ floorError }) => Math.abs(floorError) <= 0.004),
    `a Palace corpse is off the floor: ${JSON.stringify(contacts)}`);
  const [wife, lola, johnny] = contacts;
  assert.ok(wife.height > lola.height && lola.height > johnny.height,
    'the regression fixture no longer covers three different character heights');
  assert.notEqual(wife.lift, lola.lift,
    'different-height corpses received one universal death offset');
  assert.notEqual(lola.lift, johnny.lift,
    'the two short bodies received one encounter-specific death offset');
});

test('his armour going ends stage one: he leaves and the A-Team comes in', () => {
  const fixture = playToTheChef(harness());
  const { cast, finale, log } = fixture;
  drop(fixture, cast.sauce);
  drain(finale);

  assert.equal(finale.onArmorBroken(), true);
  drain(finale);

  assert.equal(log.retreats, 1, 'he stood there and finished the fight without his plates');
  assert.equal(cast.mark.active, false, 'he is still a target while the wave is in');
  assert.equal(cast.mark.root.visible, false);
  assert.equal(log.waves, 1, 'nobody was called');
  assert.equal(finale.report().stage, 'wave');
  for (const man of cast.wave) {
    assert.equal(man.active, true, `${man.id} never arrived`);
    assert.equal(man.root.visible, true, `${man.id} is shooting from inside a wall`);
  }
  assert.ok(finale.report().spoken.some((cue) => cue.includes('reprisal.armor-broken')));
  /* A second armour break cannot run the stage twice. */
  assert.equal(finale.onArmorBroken(), false);
});

test('clearing the wave brings him back out with nothing left', () => {
  const fixture = playToTheChef(harness());
  const { cast, finale, log } = fixture;
  drop(fixture, cast.sauce);
  drain(finale);
  finale.onArmorBroken();
  drain(finale);

  /* Three down is not the end of a wave. */
  for (const man of cast.wave.slice(0, 3)) drop(fixture, man);
  drain(finale);
  assert.equal(finale.report().stage, 'wave', 'he came back out over three bodies and one live gun');
  assert.equal(log.returns.length, 1);

  drop(fixture, cast.wave[3]);
  drain(finale);
  assert.equal(cast.waveStanding(), 0);
  assert.equal(finale.report().stage, 'reprisal-final');
  assert.ok(finale.report().spoken.some((cue) => cue.includes('reprisal.wave-cleared')));
  assert.ok(finale.report().spoken.some((cue) => cue.includes('reprisal.final.cold')));
  assert.deepEqual(log.returns.at(-1), { armored: false, enraged: false });
  assert.equal(cast.mark.actor.armor, 0, 'he came back out still wearing plates');
  assert.equal(cast.mark.active, true);
});

test('and the mission still clears over the begging, exactly as it did', () => {
  const fixture = harness();
  const { cast, finale } = fixture;
  const mission = new CartelPalaceMission();
  mission.begin();
  mission.enterPerimeter({ powerCut: true });
  mission.enterEstate();
  for (const id of Object.values(EVIDENCE_IDS)) mission.collectEvidence(id);
  assert.equal(mission.enterDiningRoom(), true);
  playToTheChef(fixture);

  cast.markDown(cast.sauce);
  assert.equal(mission.registerTargetDown('sauce'), true);
  finale.onTargetDown('sauce');
  drain(finale);
  assert.equal(finale.report().dived, true, 'the double act dives on the first kill');

  finale.onArmorBroken();
  drain(finale);
  for (const man of cast.wave) drop(fixture, man);
  drain(finale);

  cast.markDown(cast.mark);
  assert.equal(mission.registerTargetDown('mark'), true);
  finale.onTargetDown('mark');
  drain(finale);

  assert.equal(mission.beat, PALACE_BEATS.CLEAR);
  assert.equal(mission.snapshot().markEliminated && mission.snapshot().sauceEliminated, true);
  assert.ok(finale.report().spoken.some((cue) => cue.includes('react.all-down')));
  assert.equal(finale.report().phase, 'aftermath');
  assert.equal(finale.report().stage, 'done');
  assert.equal(mission.extract(), true, 'the palace still completes over the begging pair');
});

test('the dive still lands them beside the table and clear of every chair', () => {
  /* Owner, 2026-08-20 playtest: *"their dive animation must land them BESIDE
   * or AWAY from the table, not underneath it"*. Unchanged by the rewire, and
   * checked after it because the beat that triggers the dive is a new one. */
  const fixture = playToTheChef(harness());
  const { cast, finale } = fixture;
  drop(fixture, cast.sauce);
  drain(finale);

  for (const entry of cast.civilians.filter((civilian) => ['lola', 'johnny'].includes(civilian.id))) {
    assert.equal(entry.figure.pose, 'prone', `${entry.id} did not end up prone`);
    const { x, z } = entry.root.position;
    const underTable = Math.abs(x) <= 4.9 + 0.5 && z >= -43.5 - 0.5 && z <= -41.3 + 0.5;
    assert.equal(underTable, false, `${entry.id} dived under Mark's table again (${x}, ${z})`);
    for (const [cx, cz] of [
      [-3.6, -44.2], [-1.2, -44.2], [1.2, -44.2], [3.6, -44.2], [-5.55, -42.4], [5.55, -42.4],
    ]) {
      assert.ok(Math.hypot(x - cx, z - cz) > 0.95,
        `${entry.id} landed on the chair at (${cx}, ${cz})`);
    }
    assert.ok(Math.abs(x) < 17.7 && z > -49.7 && z < -34.2,
      `${entry.id} landed outside the dining room (${x}, ${z})`);
  }
});

test('a dead civilian speaks no lines, and the survivor carries the double act', () => {
  const { cast, finale } = harness();
  cast.civilianDown(cast.civilians.find((entry) => entry.id === 'lola'));
  finale.beginConfrontation({ evidenceFound: Object.values(EVIDENCE_IDS) });
  drain(finale);
  const spoken = finale.report().spoken;
  assert.equal(spoken.some((cue) => cue.startsWith('palace.finale.lola.')), false,
    'a corpse delivered a line');
  assert.ok(spoken.some((cue) => cue.startsWith('palace.finale.johnny.')));
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
