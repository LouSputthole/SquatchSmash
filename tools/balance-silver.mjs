#!/usr/bin/env node
/**
 * Does the Woo score mean anything?
 *
 *   node tools/balance-silver.mjs        (npm run balance:silver)
 *
 * The brief on this mission said to tune the numbers during playtesting, and
 * the part of that a machine can do is the arithmetic: whether a player who
 * behaves a particular way lands where the design says they should.
 *
 * So this plays the mission as five people. It does not render anything and it
 * does not open a browser — `woo.js` and `mission.js` are plain modules with no
 * DOM and no three.js in them, which is most of why they are plain modules and
 * why the tip roster lives in `woo.js` rather than next to the people on it.
 *
 * What it is checking for is the two failures that make a score decorative:
 *
 *   - a ceiling nobody can reach, so the best ending is unreachable and the
 *     bands above it are decoration;
 *   - a floor nobody can fall through, so behaving badly still gets you home
 *     and the whole thing is a formality.
 *
 * It is not checking that the numbers are *nice*. That is a human's job and
 * this will not tell them anything about it.
 */
import { Woo, EVENTS, TIP_ROSTER, TIP_POINTS, TIP_TOTAL, START } from '../src/silver/woo.js';
import { Mission } from '../src/silver/mission.js';

/* ------------------------------------------------------------------ */
/* Five ways to spend an evening                                       */
/* ------------------------------------------------------------------ */

const PLAYERS = {
  /**
   * Did everything, and did it in the right order. Not a perfect-information
   * run — he still has to have listened, which is what the drink and the song
   * are for.
   */
  immaculate: {
    tips: 1.0,
    good: [
      'Woo.DateDoorHeld', 'Woo.WaitedForDate', 'Woo.SideDoorResponse',
      'Woo.HazardGuided', 'Woo.KeptPace', 'Woo.CellarBanter', 'Woo.KitchenBanter',
      'Woo.TableReaction', 'Woo.ChairPulled', 'Woo.DateIntroduced',
      'Woo.DrinkRemembered', 'Woo.CallbackUsed', 'Woo.GenuineQuestion',
      'Woo.MadeHerLaugh', 'Woo.MadeHerLaugh', 'Woo.MadeHerLaugh',
      'Woo.FamilyHandled', 'Woo.ChampagneAcknowledged', 'Woo.FunnyHowSuccess',
      'Woo.PersonalHonest', 'Woo.PerformancePreferenceRemembered',
      'Woo.ToastMade', 'Woo.SwayCompleted', 'Woo.PhotoTaken', 'Woo.CallDeclined',
      'Woo.InvitationTiming',
    ],
    bad: [],
    flags: { drinkOrdered: 'rye', funnyHow: true, invitation: 'callback' },
    expect: ['perfect'],
  },

  /**
   * Played it well and missed things. Tipped most of the route, remembered
   * some of it, did not dance. This is the run the mission should be tuned
   * *around* — most people, most of the time.
   */
  decent: {
    tips: 0.65,
    good: [
      'Woo.DateDoorHeld', 'Woo.SideDoorResponse', 'Woo.HazardGuided',
      'Woo.TableReaction', 'Woo.ChairPulled', 'Woo.DateIntroduced',
      'Woo.DrinkRemembered', 'Woo.MadeHerLaugh', 'Woo.MadeHerLaugh',
      'Woo.FamilyHandled', 'Woo.FunnyHowSuccess', 'Woo.PersonalHonest',
      'Woo.ToastMade',
    ],
    bad: ['Woo.DateLeftBehind', 'Woo.PersonalEvaded'],
    flags: { drinkOrdered: 'rye', funnyHow: true, invitation: 'plain' },
    expect: ['strong', 'good'],
  },

  /**
   * Turned up. Walked to the table. Answered when spoken to. Tipped nobody,
   * because nobody told him to.
   */
  passive: {
    tips: 0,
    good: ['Woo.TableReaction', 'Woo.DateIntroduced', 'Woo.DrinkAsked', 'Woo.MadeHerLaugh'],
    bad: ['Woo.DateLeftBehind', 'Woo.DateLeftBehind', 'Woo.QuestionIgnored'],
    flags: { drinkOrdered: 'asked', invitation: 'plain' },
    expect: ['awkward', 'disaster'],
  },

  /** Sprinted ahead, bragged, took a call, got her name wrong. */
  boor: {
    tips: 0.2,
    good: ['Woo.TableReaction'],
    bad: [
      'Woo.DateLeftBehind', 'Woo.DateLeftBehind', 'Woo.DateLeftBehind',
      'Woo.DoorInHerFace', 'Woo.QuestionIgnored', 'Woo.Bragged', 'Woo.Bragged',
      'Woo.WrongName', 'Woo.DrinkWrong', 'Woo.LingeredWithFamily',
      'Woo.GruesomeDetail', 'Woo.CallTaken', 'Woo.StaredAtStage',
    ],
    flags: { drinkOrdered: 'wrong', introducedAs: 'wrong', invitation: 'plain' },
    expect: ['disaster'],
  },

  /**
   * The design question, and the reason this file exists rather than a
   * spreadsheet: somebody who is genuinely good company and hands out nothing.
   *
   * Tipping is the theme of the mission and it should be the strongest single
   * route to a good evening. It must not be the *only* one, or the score is a
   * tipping meter with dialogue attached and every conversation in the script
   * is decoration. He should be able to reach a good night on charm. He should
   * not be able to reach a perfect one — that takes the room as well as her.
   */
  'charming, broke': {
    tips: 0,
    good: [
      'Woo.DateDoorHeld', 'Woo.WaitedForDate', 'Woo.SideDoorResponse',
      'Woo.HazardGuided', 'Woo.KeptPace', 'Woo.CellarBanter', 'Woo.KitchenBanter',
      'Woo.TableReaction', 'Woo.ChairPulled', 'Woo.DateIntroduced',
      'Woo.DrinkRemembered', 'Woo.CallbackUsed', 'Woo.GenuineQuestion',
      'Woo.MadeHerLaugh', 'Woo.MadeHerLaugh', 'Woo.MadeHerLaugh',
      'Woo.FamilyHandled', 'Woo.ChampagneAcknowledged', 'Woo.FunnyHowSuccess',
      'Woo.PersonalHonest', 'Woo.PerformancePreferenceRemembered',
      'Woo.ToastMade', 'Woo.SwayCompleted', 'Woo.PhotoTaken', 'Woo.CallDeclined',
      'Woo.InvitationTiming',
    ],
    bad: [],
    flags: { drinkOrdered: 'rye', funnyHow: true, invitation: 'callback' },
    expect: ['strong', 'good'],
  },

  /**
   * Played the whole evening beautifully and then put money on the tablecloth.
   * The point of this one is that the score must not be able to buy it back.
   */
  'immaculate, then': {
    inherit: 'immaculate',
    flags: { invitation: 'transactional' },
    expect: ['insult'],
  },
};

/* ------------------------------------------------------------------ */

function play(name, spec) {
  const base = spec.inherit ? { ...PLAYERS[spec.inherit], ...spec } : spec;
  const woo = new Woo();
  const mission = new Mission();

  const roster = TIP_ROSTER.slice(0, Math.round(TIP_ROSTER.length * (base.tips ?? 0)));
  let spent = 0;
  for (const id of roster) {
    woo.fire(id);
    spent += TIP_POINTS.find((t) => t.id === id)?.amount ?? 20;
  }
  for (const id of base.good ?? []) woo.fire(id);
  for (const id of base.bad ?? []) woo.fire(id);
  Object.assign(mission.flags, base.flags ?? {});

  const outcome = mission.resolve(woo.score, woo.band.key);
  return {
    name,
    score: woo.score,
    band: woo.band.key,
    tips: `${roster.length}/${TIP_ROSTER.length}`,
    spent,
    outcome,
    ok: (base.expect ?? []).includes(outcome),
    expect: base.expect ?? [],
  };
}

const runs = Object.entries(PLAYERS).map(([n, s]) => play(n, s));

console.log('Playing the evening six ways…\n');
const pad = Math.max(...runs.map((r) => r.name.length));
for (const r of runs) {
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(pad)}  `
    + `woo ${String(r.score).padStart(3)} (${r.band.padEnd(8)}) · `
    + `tipped ${r.tips.padEnd(5)} $${String(r.spent).padStart(3)} · `
    + `→ ${r.outcome}${r.ok ? '' : `  (wanted ${r.expect.join(' or ')})`}`);
}

/* ---- the two questions that matter ---- */
console.log('');
const problems = [];

const ceiling = runs.find((r) => r.name === 'immaculate');
if (ceiling.score < 95) {
  problems.push(`the ceiling is unreachable: a flawless run scores ${ceiling.score}, `
    + 'and the top band starts at 95');
}
const floor = runs.find((r) => r.name === 'boor');
if (floor.score >= 30) {
  problems.push(`the floor is too soft: behaving badly all evening still scores ${floor.score}`);
}
const middle = runs.find((r) => r.name === 'decent');
if (middle.score < 50 || middle.score >= 95) {
  problems.push(`the ordinary run lands at ${middle.score}, which is not the middle of anything`);
}

/* Charm has to be a route on its own, and it must not be the whole road. */
const charm = runs.find((r) => r.name === 'charming, broke');
if (charm.score < 65) {
  problems.push(`charm alone scores ${charm.score}: the score is a tipping meter `
    + 'and every conversation in the script is decoration');
}
if (charm.score >= 95) {
  problems.push(`charm alone scores ${charm.score}: the tips buy nothing and the `
    + 'central mechanic of the mission is optional flavour');
}

/* The wallet has to cover the route with room to be stupid once. */
const START_CASH = Math.max(600, TIP_TOTAL + 240);
if (START_CASH - TIP_TOTAL < 150) {
  problems.push(`tipping everybody leaves $${START_CASH - TIP_TOTAL}, which is not enough for dinner`);
}

/* Every event has to be able to fire. An event nobody can reach is a value
 * somebody tuned for nothing. */
const reachable = new Set();
for (const r of Object.values(PLAYERS)) {
  for (const id of [...(r.good ?? []), ...(r.bad ?? [])]) reachable.add(id);
}
for (const id of TIP_ROSTER) reachable.add(id);
const never = Object.keys(EVENTS).filter((id) => !reachable.has(id));

console.log(`Starting score ${START}. Tipping everybody costs $${TIP_TOTAL} of $${START_CASH}.`);
console.log(`${Object.keys(EVENTS).length} events; this harness exercises ${reachable.size}.`);
if (never.length) console.log(`Not exercised here (checked in verify:silver): ${never.length}.`);

const failed = runs.filter((r) => !r.ok).length + problems.length;
if (problems.length) {
  console.log('');
  for (const p of problems) console.log(`  FAIL  ${p}`);
}
console.log(failed ? `\n${failed} balance problems.` : '\nThe bands mean something.');
process.exit(failed ? 1 : 0);
