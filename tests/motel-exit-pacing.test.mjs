/**
 * TWO MEN LEAVING A ROOM, NEITHER OF THEM WHERE THE PLAYER COULD SEE IT.
 *
 * Owner, 2026-08-24, on the Jerky Hotel: *"Rico slips out real quick... Snow
 * arrives long before his voiceline. Lets refine that as well."*
 *
 * SNOW. `snowJoins` used to set `snow.state = 'follow'` and speak his entrance
 * bark on the same line. But he starts in the LOT, fifteen metres and a
 * doorway away, and `say()` does not speak -- it reserves a slot on
 * `speechFloor` and returns. The moment the room turns is the chattiest second
 * in the mission, so his line queued behind three other people's while he
 * walked in a straight line. He is handed the line now and says it when he
 * arrives; the crowbar waits with him.
 *
 * RICO. He had two ways to simply cease to exist. `actorReachedTarget` deleted
 * him the frame he touched his exit point -- which for the bathroom route is a
 * spot inside the bathroom, so he vanished ON the tub rather than over it --
 * and `actorStuck` deleted him outright, so one blocked step behind a chair
 * and the man with the forty thousand was gone from the middle of the room in
 * front of the player. An exit is two legs now, and being stuck costs him a
 * route rather than the scene.
 *
 * Read from source: `src/motel/main.js` is a page entry point and wants a DOM,
 * a canvas and WebGL. What is pinned here is the control flow, which is
 * exactly where both faults were.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const MAIN = readFileSync(
  fileURLToPath(new URL('../src/motel/main.js', import.meta.url)), 'utf8',
);

function bodyOf(name) {
  const start = MAIN.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const next = MAIN.indexOf('\nfunction ', start + 1);
  return MAIN.slice(start, next < 0 ? MAIN.length : next);
}

test('Snow does not speak on the frame he sets off', () => {
  const joins = bodyOf('snowJoins');
  assert.match(joins, /snow\.state = 'follow'/, 'he no longer comes in at all');
  assert.doesNotMatch(joins, /\bsay\(/,
    'the entrance line is spoken on the frame he leaves the car again, so it '
    + 'queues behind the betrayal chatter while he walks the fifteen metres');
  assert.doesNotMatch(joins, /dropWeaponPickup/,
    'the crowbar still lands at the player\'s feet from a man in the car park');
  assert.match(joins, /snowEntrance = \{/, 'nothing is holding the line for him');
});

test('and says it when he is next to the man he came to help', () => {
  const arrival = bodyOf('updateSnowEntrance');
  assert.match(arrival, /Math\.hypot\(snow\.position\.x - pos\.x, snow\.position\.z - pos\.z\)/,
    'arrival is decided by something other than how far away he is');
  assert.match(arrival, /SNOW_ARRIVAL_RANGE/);
  assert.match(arrival, /say\(\s*\n?\s*ALLY, SNOW_FIGHT_BARKS\[barkIdx\]/,
    'the entrance line is not said on arrival');
  assert.match(arrival, /dropWeaponPickup\('crowbar'/, 'the crowbar no longer comes with him');
  /* A route he cannot walk must not cost him the line entirely. */
  assert.match(arrival, /SNOW_ARRIVAL_PATIENCE/,
    'a Snow who cannot reach the player never speaks at all, which is worse '
    + 'than speaking early');
  assert.match(MAIN, /^\s*updateSnowEntrance\(dt\);$/m,
    'the arrival check is never run, so he never speaks');
});

test('Rico has to get through the opening before he is through it', () => {
  const reached = bodyOf('actorReachedTarget');
  assert.match(reached, /a\.afterGoto === 'ricoThrough'/,
    'reaching the exit point still deletes him on the spot -- which for the '
    + 'bathroom route is a point inside the bathroom, so he vanishes on the tub');
  assert.match(reached, /ricoRunsOut\(a\)/);
  const out = bodyOf('ricoRunsOut');
  assert.match(out, /RICO_EXIT_RUN/, 'the second leg has no length, so it is not a leg');
  assert.match(out, /pos\.x/, 'he runs out on a bearing that ignores where the player is');
  assert.match(out, /afterGoto = 'ricoGone'/, 'the second leg never ends him');
});

test('and a blocked step costs him a route, not the scene', () => {
  const stuck = bodyOf('actorStuck');
  const ricoBranch = stuck.slice(0, stuck.indexOf('if (a.carryingCase)'));
  assert.match(ricoBranch, /exitsTried/,
    'Rico still evaporates the first time a chair is in his way');
  assert.match(ricoBranch, /ricoBreaksFor\(a, \{ skip: tried \}\)/,
    'a blocked Rico does not try another way out');
  assert.match(ricoBranch, /if \(tried\.has\(next\.via\)\) ricoEscapes\(a\)/,
    'a Rico out of routes never gets away, which strands the scene');
  const pick = bodyOf('pickRicoExit');
  assert.match(pick, /skip/, 'the route picker cannot be told what has already failed');
});

test('the player is told he is running, and which way', () => {
  /* An escape the player never knew was happening is not an escape he lost. */
  const breaks = (MAIN.match(/toast\('RICO IS RUNNING'/g) ?? []).length;
  assert.ok(breaks >= 2,
    `only ${breaks} of Rico's two break-for-it paths announce themselves; the `
    + 'other one is a man quietly leaving with forty thousand dollars');
  assert.match(MAIN, /He is going for \$\{(a|rico)\.target\.via\}/,
    'the announcement does not name the way out, so it cannot be covered');
});
