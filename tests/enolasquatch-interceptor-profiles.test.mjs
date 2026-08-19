/**
 * The interceptor attack profiles, flown headless on the simulated clock.
 *
 * Owner review, 2026-08-19: "enemy fighters largely repeat one pattern, so
 * turret play gets repetitive." The answer is THE PROFILES in
 * `../src/enolasquatch/combat/Interceptors.js` — crossing pairs, high-side
 * dives, the harasser, the priority attacker, and the wounded withdrawal —
 * dealt per wave by an authored rota. Each one is a claim about GEOMETRY
 * (crosses the track, exits below, holds outside the leash), and geometry is
 * exactly what a seeded headless sim can measure, so every claim is measured
 * here rather than eyeballed in a browser.
 *
 * THE ENVELOPE IS PINNED. Before any of this existed, the classic
 * one-pattern build was measured on the same harness (240 s, straight and
 * level, dt 1/30, 40 trials per scenario, 2026-08-19):
 *
 *   wave of 3 @ aggression 1.00 — 531 rounds at the bomber, 14–29 hits
 *   wave of 2 @ aggression 1.15 — 493 rounds at the bomber, 16–36 hits
 *   MAX_ENGAGED never exceeded 2 in any trial
 *
 * Those numbers are the `BASELINE` block below, and the last test holds every
 * authored wave script inside them: the profiles are variety, not
 * escalation. The gameplay dice run on the instance's seeded rng
 * (`Interceptors`' own discipline), so these runs are measurements — the
 * same seed flies the same fight.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  Interceptors, MAX_ENGAGED, FIGHTER_HEALTH, WOUNDED_HEALTH, WOUNDED_BREAK_SECONDS,
  COMMIT_RANGE, WAVE_SCRIPTS,
} from '../src/enolasquatch/combat/Interceptors.js';

/* ------------------------------------------------------------------ */
/* Harness — the same headless bomber the existing combat tests fly    */
/* ------------------------------------------------------------------ */

const DT = 1 / 30;

/**
 * Fly a wave against a straight-and-level bomber for `seconds`, calling
 * `hook(ints, t, position)` every tick. Same shape as `flyInterceptors` in
 * enolasquatch-combat.test.mjs, plus profile control and the turret feed.
 */
function fly(seconds, { profiles = null, count = 3, evasion = 0, aggression = 1, seed = 0x4E19, hook = null } = {}) {
  const scene = new THREE.Scene();
  const ints = new Interceptors(scene, { getHeight: () => 0, seed });
  ints.aggression = aggression;
  const position = new THREE.Vector3(0, 900, 0);
  const velocity = new THREE.Vector3(0, 0, 62);
  ints.deploy({ around: position, count, profiles });
  let maxEngaged = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    ints.update(DT, { position, velocity, evasion });
    position.addScaledVector(velocity, DT);
    maxEngaged = Math.max(maxEngaged, ints.engagedCount);
    hook?.(ints, i * DT, position);
  }
  return { ints, maxEngaged, position };
}

/* ------------------------------------------------------------------ */
/* The director                                                        */
/* ------------------------------------------------------------------ */

test('the authored rota never deals the same wave twice running, wrap included', () => {
  assert.ok(WAVE_SCRIPTS.length >= 3, 'not enough authored waves to vary a three-wave raid');
  for (let i = 0; i < WAVE_SCRIPTS.length; i++) {
    const a = [...WAVE_SCRIPTS[i]].sort().join(',');
    const b = [...WAVE_SCRIPTS[(i + 1) % WAVE_SCRIPTS.length]].sort().join(',');
    assert.notEqual(a, b, `waves ${i} and ${(i + 1) % WAVE_SCRIPTS.length} read the same: [${a}]`);
  }
});

test('the director deals the rota in order, and the fighters actually carry it', () => {
  const scene = new THREE.Scene();
  const ints = new Interceptors(scene, { getHeight: () => 0 });
  const position = new THREE.Vector3(0, 900, 0);
  const velocity = new THREE.Vector3(0, 0, 62);
  const dealt = [];
  for (let w = 0; w < 3; w++) {
    ints.clear();
    ints.deploy({ around: position, count: 2 });
    // Tick until the whole wave is airborne, then read what it was dealt.
    for (let i = 0; i < Math.round(40 / DT) && ints.fighters.length < 2; i++) {
      ints.update(DT, { position, velocity });
      position.addScaledVector(velocity, DT);
    }
    assert.equal(ints.fighters.length, 2, `wave ${w} never fully spawned`);
    assert.deepEqual(ints.waveProfiles, WAVE_SCRIPTS[w].slice(0, 2), `wave ${w} was not dealt from the rota`);
    dealt.push(ints.fighters.map((f) => f.profile).sort().join(','));
    for (const f of ints.fighters) {
      assert.equal(f.profile, ints.waveProfiles[0] === f.profile || ints.waveProfiles[1] === f.profile ? f.profile : null);
    }
  }
  // The three waves the raid actually flies all read differently.
  assert.equal(new Set(dealt).size, 3, `the raid's own three waves repeat: ${dealt.join(' | ')}`);
});

test('a wave bigger than its script pads with classic instead of crashing', () => {
  const scene = new THREE.Scene();
  const ints = new Interceptors(scene, { getHeight: () => 0 });
  ints.deploy({ around: new THREE.Vector3(0, 900, 0), count: 4 });
  assert.equal(ints.waveProfiles.length, 4);
  assert.equal(ints.waveProfiles[2], 'classic');
  assert.equal(ints.waveProfiles[3], 'classic');
});

/* ------------------------------------------------------------------ */
/* Crossing passes                                                     */
/* ------------------------------------------------------------------ */

test('a crossing pair sets up on opposite quarters and slices across the track, guns going', () => {
  const everCrossed = new Set();
  const enteredCross = new Set();
  const firedOnCross = new Set();
  const crossSeconds = new Map();
  let prevRounds = 0;
  const { ints, maxEngaged } = fly(180, {
    profiles: ['crossing', 'crossing'],
    count: 2,
    hook: (its) => {
      for (const f of its.fighters) {
        if (f.state !== 'cross') continue;
        enteredCross.add(f.id);
        // The longest single crossing LEG — a fighter flies several passes,
        // and the window claim is about each leg, not their sum.
        crossSeconds.set(f.id, Math.max(crossSeconds.get(f.id) || 0, f.stateT));
        if (its.roundsAtUs > prevRounds) firedOnCross.add(f.id);
        if (f.crossed) everCrossed.add(f.id);
      }
      prevRounds = its.roundsAtUs;
    },
  });
  assert.equal(ints.fighters.length, 2, 'the pair never got airborne');
  const sides = ints.fighters.map((f) => f.side);
  // Sides flip after every pass, so opposition is the invariant, not the sign.
  assert.equal(sides[0] * sides[1], -1, `the pair attacked from the same quarter (sides ${sides})`);
  assert.equal(enteredCross.size, 2, 'both of the pair have to run the crossing leg');
  for (const id of enteredCross) {
    assert.ok(everCrossed.has(id), `fighter ${id} ran a crossing leg and never crossed the track`);
    // The window: the profile bails at CROSS_WINDOW (16 s), so a real cross
    // has to have happened inside it — measured, not assumed.
    assert.ok(crossSeconds.get(id) <= 16 + DT * 2,
      `fighter ${id} spent ${crossSeconds.get(id).toFixed(1)}s on a leg the profile caps at 16`);
    assert.ok(firedOnCross.has(id), `fighter ${id} crossed with its guns cold`);
  }
  assert.ok(maxEngaged <= MAX_ENGAGED);
});

/* ------------------------------------------------------------------ */
/* The high-side dive                                                  */
/* ------------------------------------------------------------------ */

test('the high-side dive climbs offstage, fires on the way through, and exits below', () => {
  let perchAbove = -Infinity;
  let firedInDive = false;
  let sawDive = false;
  let minRelAltitude = Infinity;
  let belowAfterFiring = false;
  let prevRounds = 0;
  fly(200, {
    profiles: ['highside'],
    count: 1,
    hook: (its, t, position) => {
      for (const f of its.fighters) {
        const rel = f.position.y - position.y;
        if (f.state === 'ingress' || f.state === 'reposition') perchAbove = Math.max(perchAbove, rel);
        if (f.state === 'dive') {
          sawDive = true;
          if (its.roundsAtUs > prevRounds) firedInDive = true;
        }
        if (f.state === 'dive' || f.state === 'pullout') {
          minRelAltitude = Math.min(minRelAltitude, rel);
          if (firedInDive && rel < -60) belowAfterFiring = true;
        }
      }
      prevRounds = its.roundsAtUs;
    },
  });
  assert.ok(sawDive, 'it never rolled in');
  assert.ok(perchAbove > 400, `the offstage perch only reached ${perchAbove.toFixed(0)} m over the bomber`);
  assert.ok(firedInDive, 'the dive reached no firing solution');
  assert.ok(belowAfterFiring, 'it fired but never carried the dive through below the bomber');
  assert.ok(minRelAltitude < -60,
    `the pull-out happened above the formation (lowest point ${minRelAltitude.toFixed(0)} m relative)`);
});

/* ------------------------------------------------------------------ */
/* The harasser                                                        */
/* ------------------------------------------------------------------ */

test('the harasser holds outside commit range, snipes, and takes no engagement slot', () => {
  let minHoldRange = Infinity;
  let holdSeconds = 0;
  let engagedWhileHolding = false;
  const { ints } = fly(60, {
    profiles: ['harass'],
    count: 1,
    hook: (its, t, position) => {
      for (const f of its.fighters) {
        if (f.state !== 'harass' || t < 30) continue; // let it fly out to its quarter
        holdSeconds += DT;
        minHoldRange = Math.min(minHoldRange, f.position.distanceTo(position));
        if (f.engaged) engagedWhileHolding = true;
      }
    },
  });
  assert.ok(holdSeconds > 10, `it barely held at all (${holdSeconds.toFixed(1)} s)`);
  assert.ok(minHoldRange > COMMIT_RANGE,
    `it drifted to ${minHoldRange.toFixed(0)} m inside the ${COMMIT_RANGE} m leash`);
  assert.equal(engagedWhileHolding, false, 'a nag at range must not burn an engagement slot');
  assert.ok(ints.roundsAtUs > 0, 'holding at range is supposed to include sniping');
});

test('the harasser commits the moment the turret\'s fire discipline lapses', () => {
  let committedAt = -1;
  let lapseAt = -1;
  let closedInside = false;
  fly(120, {
    profiles: ['harass'],
    count: 1,
    hook: (its, t, position) => {
      // A healthy, watched gun until t=45; then a jam — the lapse.
      const jammed = t >= 45 && t < 50;
      its.setTurretStatus({ manned: true, firing: false, jammed, heat: 0.3, rounds: 800, yaw: 0.2 });
      if (jammed && lapseAt < 0) lapseAt = t;
      for (const f of its.fighters) {
        if (lapseAt >= 0 && committedAt < 0 && (f.state === 'pursuit' || f.state === 'attack')) committedAt = t;
        if (committedAt >= 0 && f.position.distanceTo(position) < COMMIT_RANGE) closedInside = true;
      }
    },
  });
  assert.ok(lapseAt >= 0);
  assert.ok(committedAt >= lapseAt, 'it committed before anything lapsed');
  assert.ok(committedAt < lapseAt + 3, `the lapse went stale before it moved (${(committedAt - lapseAt).toFixed(1)} s)`);
  assert.ok(closedInside, 'it "committed" without ever closing inside the leash');
});

/* ------------------------------------------------------------------ */
/* Wounded withdrawal                                                  */
/* ------------------------------------------------------------------ */

test('a fighter hurt past the threshold breaks for home burning, and leaves', () => {
  let woundedCallback = false;
  let woundedAt = -1;
  let withdrawAt = -1;
  let rangeAtWithdraw = 0;
  let rangeTenLater = 0;
  let flameLit = false;
  let victim = null;
  const { ints } = fly(150, {
    profiles: ['classic', 'classic'],
    count: 2,
    hook: (its, t, position) => {
      its.onWounded = its.onWounded || (() => { woundedCallback = true; });
      if (t > 40 && woundedAt < 0 && its.fighters[0]?.alive) {
        victim = its.fighters[0];
        // Hurt it to exactly the threshold, not past it.
        its.damage(victim, FIGHTER_HEALTH - WOUNDED_HEALTH);
        assert.equal(victim.health, WOUNDED_HEALTH);
        assert.equal(victim.alive, true, 'the threshold is a wound, not a kill');
        woundedAt = t;
      }
      if (victim && withdrawAt < 0 && victim.state === 'withdraw') {
        withdrawAt = t;
        rangeAtWithdraw = victim.position.distanceTo(position);
        flameLit = victim.flameMat.opacity > 0.2;
        assert.equal(victim.engaged, false, 'a wounded fighter is out of the fight NOW');
      }
      if (withdrawAt >= 0 && t <= withdrawAt + 10 && ints_has(its, victim)) {
        rangeTenLater = victim.position.distanceTo(position);
      }
    },
  });
  assert.ok(woundedCallback, 'onWounded never fired — the mission cannot play the scream');
  assert.ok(withdrawAt >= 0, 'it never broke off');
  assert.ok(withdrawAt - woundedAt <= WOUNDED_BREAK_SECONDS,
    `it fought on for ${(withdrawAt - woundedAt).toFixed(1)} s past the threshold`);
  assert.ok(flameLit, 'a wounded withdrawal has to be VISIBLY on fire');
  assert.ok(rangeTenLater > rangeAtWithdraw + 500,
    `ten seconds of "running for home" only opened ${(rangeTenLater - rangeAtWithdraw).toFixed(0)} m`);
  assert.equal(ints.fighters.includes(victim), false, 'it hung around instead of leaving the map');
  assert.equal(ints.escaped, 1, 'a threat removed without a kill still has to be counted');
});

function ints_has(its, f) { return its.fighters.includes(f); }

test('a dying fighter is a show: flame, shed debris, and a tightening spin', () => {
  const { ints } = fly(40, { profiles: ['classic'], count: 1 });
  const f = ints.fighters[0];
  assert.ok(f?.alive);
  for (let i = 1; i < FIGHTER_HEALTH; i++) assert.notEqual(ints.damage(f, 1), 'nothing');
  assert.equal(ints.damage(f, 1), 'killed');
  // Let it fall for a moment on the simulated clock.
  const position = new THREE.Vector3(0, 900, 0);
  const velocity = new THREE.Vector3(0, 0, 62);
  for (let i = 0; i < Math.round(1.2 / DT); i++) ints.update(DT, { position, velocity });
  assert.ok(f.flameMat.opacity > 0.4, 'no fire on the way down');
  const litDebris = f.debris.filter((b) => b.visible && b.material.opacity > 0.1);
  assert.ok(litDebris.length >= 3, `only ${litDebris.length} pieces came off it`);
  const thrown = f.debris.some((b) => b.position.lengthSq() > 25);
  assert.ok(thrown, 'the debris never left the airframe');
});

/* ------------------------------------------------------------------ */
/* Priority targeting                                                  */
/* ------------------------------------------------------------------ */

test('a priority fighter attacks out of the turret\'s blind arc, on the least-watched quarter', () => {
  let attackFromAhead = false;
  let sawAttack = false;
  const { ints } = fly(160, {
    profiles: ['priority'],
    count: 1,
    hook: (its, t, position) => {
      // The gunner leans hard one way the whole fight.
      its.setTurretStatus({ manned: true, firing: false, jammed: false, heat: 0.2, rounds: 900, yaw: 0.8 });
      for (const f of its.fighters) {
        if (f.state !== 'attack') continue;
        sawAttack = true;
        // Bomber flies +Z: the tail turret faces -Z, so an attack begun from
        // positive relative Z is inside its blind arc.
        if (f.position.z - position.z > 0) attackFromAhead = true;
      }
    },
  });
  assert.ok(sawAttack, 'it never attacked');
  assert.ok(attackFromAhead, 'every firing pass started inside the turret\'s own arc');
  // Coverage steering: a gunner glued to the positive-yaw quarter sends the
  // next pass in on the other one.
  const f = ints.fighters[0];
  if (f && f.alive) {
    assert.equal(f.side, -1, `the pass came in on the quarter the gunner was already watching (side ${f.side})`);
  }
});

test('a priority fighter aims at a LIVE engine and hands it to the hit callback', () => {
  const scene = new THREE.Scene();
  const ints = new Interceptors(scene, { getHeight: () => 0, seed: 7 });
  const position = new THREE.Vector3(0, 900, 0);
  const velocity = new THREE.Vector3(0, 0, 62);
  ints.deploy({ around: position, count: 1, profiles: ['priority'] });
  const engines = [true, false, false, false]; // number one is already dead
  let reportedFighter = null;
  ints.onHit = (severity, fighter) => { reportedFighter = fighter; };
  let picked = -2;
  for (let i = 0; i < Math.round(200 / DT); i++) {
    ints.update(DT, { position, velocity, evasion: 0, engines });
    position.addScaledVector(velocity, DT);
    for (const f of ints.fighters) if (f.state === 'attack') picked = f.targetEngine;
  }
  assert.ok(picked >= 0, 'it attacked without picking an engine');
  assert.equal(engines[picked], false, `it aimed at engine ${picked}, which is already dead`);
  if (reportedFighter) {
    assert.equal(typeof reportedFighter.targetEngine, 'number',
      'the hit callback has to carry the fighter so the mission can bill the right nacelle');
  }
});

/* ------------------------------------------------------------------ */
/* The envelope — pinned before the profiles existed                   */
/* ------------------------------------------------------------------ */

/**
 * Measured on the pre-profile build, 2026-08-19, same harness, 40 trials per
 * scenario (`Math.random` gunnery back then; min/max over trials):
 *
 *   wave of 3 @ 1.00: rounds 531 (deterministic), hits 14..29
 *   wave of 2 @ 1.15: rounds 493 (deterministic), hits 16..36
 *   maxEngaged: always exactly 2
 *
 * The authored waves must fit INSIDE that — same slots, no more lead in the
 * air, no more hits on the bomber — while still being a real threat (the
 * floors), because "not harder" must not decay into "not there".
 */
const BASELINE = {
  wave3: { rounds: 531, hitsMax: 29 },
  wave2: { rounds: 493, hitsMax: 36 },
};

test('every authored wave stays inside the classic difficulty envelope', () => {
  for (let w = 0; w < WAVE_SCRIPTS.length; w++) {
    const script = WAVE_SCRIPTS[w];
    for (const seed of [0x4E19, 12345]) {
      const three = fly(240, { profiles: script, count: 3, aggression: 1.0, seed });
      assert.ok(three.ints.roundsAtUs <= BASELINE.wave3.rounds,
        `wave ${w} [${script}] put ${three.ints.roundsAtUs} rounds up against the classic ${BASELINE.wave3.rounds}`);
      assert.ok(three.ints.hitsTaken <= BASELINE.wave3.hitsMax,
        `wave ${w} [${script}] landed ${three.ints.hitsTaken} hits against the classic worst case ${BASELINE.wave3.hitsMax}`);
      assert.ok(three.maxEngaged <= MAX_ENGAGED,
        `wave ${w} [${script}] pressed with ${three.maxEngaged} at once`);
      // The floors: varied must still mean dangerous.
      assert.ok(three.ints.roundsAtUs >= 150, `wave ${w} [${script}] only fired ${three.ints.roundsAtUs} rounds in four minutes`);
      assert.ok(three.ints.hitsTaken >= 3, `wave ${w} [${script}] barely touched a bomber flying straight for four minutes`);

      const two = fly(240, { profiles: script, count: 2, aggression: 1.15, seed });
      assert.ok(two.ints.roundsAtUs <= BASELINE.wave2.rounds,
        `wave ${w} [${script}] as a pair put up ${two.ints.roundsAtUs} rounds against the classic ${BASELINE.wave2.rounds}`);
      assert.ok(two.ints.hitsTaken <= BASELINE.wave2.hitsMax,
        `wave ${w} [${script}] as a pair landed ${two.ints.hitsTaken} against the classic worst case ${BASELINE.wave2.hitsMax}`);
      assert.ok(two.maxEngaged <= MAX_ENGAGED);
    }
  }
});

test('evading still beats every authored wave, same as it beat the classic one', () => {
  for (let w = 0; w < WAVE_SCRIPTS.length; w++) {
    const straight = fly(240, { profiles: WAVE_SCRIPTS[w], count: 3, aggression: 1.0 });
    const jinking = fly(240, { profiles: WAVE_SCRIPTS[w], count: 3, aggression: 1.0, evasion: 1 });
    assert.ok(jinking.ints.hitsTaken < straight.ints.hitsTaken,
      `wave ${w}: evading took ${jinking.ints.hitsTaken} hits against ${straight.ints.hitsTaken} for flying straight`);
  }
});

/* ------------------------------------------------------------------ */
/* The optional sound rows                                             */
/* ------------------------------------------------------------------ */

test('the interceptor sound cues are manifest rows, optional by construction', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'));
  const names = new Set(manifest.cues ? manifest.cues.map((c) => c.name) : []);
  const flat = JSON.stringify(manifest);
  for (const cue of ['enola.interceptor.scream', 'enola.interceptor.breakup']) {
    assert.ok(names.has(cue) || flat.includes(`"${cue}"`), `${cue} is not in the sfx manifest`);
  }
});
