import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');

const html = readFileSync(new URL('../mansion.html', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/mansion/main.js', import.meta.url), 'utf8');
const castSource = readFileSync(new URL('../src/mansion/cast.js', import.meta.url), 'utf8');
const labSource = readFileSync(new URL('../src/mansion/scenes/SilentSquatch.js', import.meta.url), 'utf8');
const hudSource = readFileSync(new URL('../src/core/hud.js', import.meta.url), 'utf8');

const { buildMansionGrounds } = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildMansionInterior } = await import('../src/mansion/scenes/MansionInterior.js');
const { SEQUENCES } = await import('../src/mansion/script.js');

function builtHouse() {
  const grounds = buildMansionGrounds(null);
  return { grounds, interior: buildMansionInterior({ grounds }) };
}

test('the normal Mansion start overlay cannot escape the linear campaign to Apartment', () => {
  const [normalOverlay, bootRecovery = ''] = html.split('<div id="bootFailure"');
  assert.doesNotMatch(normalOverlay, /href=["'][^"']*index\.html/i);
  assert.match(bootRecovery, /href=["']\.\/index\.html["']/i);
  assert.match(bootRecovery, />APARTMENT</i);
});

test('passive descriptions use LOOK while usable bodies retain E', () => {
  /* The rule -- a prompt with nothing to press shows no key cap -- moved out
   * of this scene and into `createPromptHud` in src/core/hud.js, where the
   * other three scenes that were missing it get it too. It is the same rule
   * and the same word; what changed is that the mansion no longer owns it. */
  assert.match(mainSource, /createPromptHud\(/,
    'the house stopped using the shared prompt, so nothing suppresses its key cap');
  assert.match(hudSource, /passiveKeys = \['LOOK'\]/);
  assert.match(hudSource, /passiveKeys\.includes\(cap\)/);
  assert.match(mainSource, /interaction\.register\(mesh, \{ label, key: 'LOOK'/);
  assert.match(castSource, /key: onUse \? 'E' : 'LOOK'/);
  assert.match(labSource, /interaction\.register\(mesh, \{ label: text, key: 'LOOK', enabled: live \}\)/);
});

test('the theatre has twelve usable seats, local movie lighting, and no ceiling floods', () => {
  const { interior } = builtHouse();
  const theatre = interior.props.theatre;

  assert.equal(theatre.seats.length, 12);
  for (const seat of theatre.seats) {
    assert.equal(seat.userData.theatreSeat.hit.name, 'theatre-seat-target');
    assert.ok(Number.isFinite(seat.userData.theatreSeat.pose.y));
    assert.ok(Number.isFinite(seat.userData.theatreSeat.exit.y));
  }
  assert.equal(theatre.houseLights.length, 4);
  assert.equal(theatre.aisleLights.length, 4);
  assert.equal(theatre.lights.filter((light) => light.userData.theatreRole === 'ceiling').length, 0);
});

test('the suite stair uses narrow pitched stringers and a thin landing soffit', () => {
  const { interior } = builtHouse();
  const byName = new Map();
  interior.root.traverse((object) => {
    if (!object.name) return;
    const list = byName.get(object.name) ?? [];
    list.push(object);
    byName.set(object.name, list);
  });

  assert.equal(byName.get('suite-stair-a-stringer')?.length, 2);
  assert.equal(byName.get('suite-stair-b-stringer')?.length, 2);
  assert.equal(byName.has('suite-stair-a-string'), false);
  assert.equal(byName.has('suite-stair-b-string'), false);

  const soffit = byName.get('suite-stair-landing-soffit')?.[0];
  const size = new THREE.Box3().setFromObject(soffit).getSize(new THREE.Vector3());
  assert.ok(size.y <= 0.17, `landing soffit is ${size.y.toFixed(3)} m thick`);
});

test('console TV pictures stay inside their cabinets and the old-country weights moved to the window side', () => {
  const { interior } = builtHouse();
  const tvChecks = [];
  let oldBench = null;
  interior.root.updateMatrixWorld(true);
  interior.root.traverse((object) => {
    if (object.name === 'tv-screen') {
      const cabinet = object.parent?.children.find((child) => child.name === 'tv-cabinet');
      assert.ok(cabinet, 'generic TV screen has no cabinet sibling');
      const screen = new THREE.Box3().setFromObject(object);
      const shell = new THREE.Box3().setFromObject(cabinet);
      tvChecks.push(screen.min.y >= shell.min.y && screen.max.y <= shell.max.y);
    }
    if (object.name === 'oldtime-bench-pad') oldBench = object;
  });

  assert.equal(tvChecks.length, 2);
  assert.ok(tvChecks.every(Boolean), 'a generic TV picture falls outside its wooden cabinet');
  assert.ok(oldBench);
  const benchCenter = new THREE.Box3().setFromObject(oldBench).getCenter(new THREE.Vector3());
  assert.ok(benchCenter.x > 13.8, `old-country bench is still beside the bed at x=${benchCenter.x.toFixed(2)}`);
});

test('the living ensemble, theatre encourager and pool dress-help path are authored in Mansion cast', () => {
  for (const id of ['seff', 'lag', 'ape', 'sauce', 'oldStove', 'poolPerformer0', 'poolPerformer1']) {
    assert.match(castSource, new RegExp(`post\\('${id}'`));
  }
  assert.doesNotMatch(castSource, /post\('(willy|hotdog|billyHotDog)'/i);
  assert.match(castSource, /poolEvening\.dressHelped = true/);

  assert.deepEqual(SEQUENCES.louAfterLab.map(({ cue }) => cue), [
    'vo.silentsquatch.exit.lou.stayingtonight',
    'vo.silentsquatch.exit.lou.guestroomdownstairs',
    'vo.silentsquatch.exit.lou.enjoythehouse',
  ]);
  assert.equal(SEQUENCES.oldStoveTheatre[0].cue, 'vo.silentsquatch.evening.stove.putsomethingon');
  assert.equal(SEQUENCES.poolGirlHello[0].cue, 'vo.silentsquatch.evening.performer.sayhello');
  assert.equal(SEQUENCES.poolGirlDressHelp[0].cue, 'vo.silentsquatch.evening.performer.useful');
});
