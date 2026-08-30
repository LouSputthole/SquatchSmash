import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { serviceAdvanceAllowed } from '../src/silver/cast.js';
import { SET } from '../src/silver/perform.js';
import { PROFILE_OF, buildScripts, silverSpokenWords } from '../src/silver/script.js';
import { buildGeometrySceneState } from '../tools/geometry-scenes.mjs';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();
const THREE = await import('three');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

let builtPromise;
function silverRoot() {
  builtPromise ??= buildGeometrySceneState('silver:default');
  return builtPromise.then((built) => built.roots[0].root);
}

function named(root, name) {
  const found = [];
  root.traverse((object) => { if (object?.name === name) found.push(object); });
  return found;
}

test('Silver subtitles contain spoken copy only and the objective notice stays bounded', () => {
  assert.equal(
    silverSpokenWords('<em>(She checks the room.)</em> Well — <em>(beat)</em> that is a table.'),
    'Well — that is a table.',
  );
  assert.equal(silverSpokenWords('<em>(A long look.)</em>'), '');

  const main = read('src/silver/main.js');
  assert.match(main, /const items = now \? \[item\(now\)\] : \[\];/,
    'the HUD should show only the current required objective');
  assert.match(main, /if \(optional && optional !== now\) items\.push\(\{ rule: 'IF YOU LIKE' \}, item\(optional\)\);/,
    'the card may add only one soft objective');
  assert.match(main, /setTimeout\(\(\) => ui\.objectives\.classList\.add\('hidden'\), 12000\)/,
    'objective notice must collapse inside the requested 10–15 second window');
  assert.match(main, /Deliberately no subtitle\.[\s\S]*?voiceCue\(`vo\.silver\.room\.\$\{key\}\.\$\{i \+ 1\}`/,
    'passive room texture should speak without painting descriptive subtitles');
  assert.match(main,
    /id: 'champagne',[\s\S]*?ready: \(\) => mission\.roundsDone\.has\('drinks'\)[\s\S]*?run: \(\) => sendChampagne\(\)/,
    'champagne must wait for the walking waiter to finish the drink order');
});

test('the cellar, service, champagne, paired shots, and trumpet are physical scene objects', async () => {
  const root = await silverRoot();
  const counts = Object.fromEntries([
    'cellar-working-details', 'cellar-utility-pipe-run', 'cellar-electrical-box',
    'cellar-old-photograph', 'cellar-inventory-clipboard', 'cellar-floor-drain',
    'cellar-mop-bucket', 'cellar-wine-barrel', 'dry-store-shelf-board',
    'waiter-service-tray', 'tray-cocktails', 'tray-plates', 'tray-coffee',
    'tray-champagne', 'tray-champagne-bottle', 'front-champagne-bottle',
    'front-champagne-bucket', 'front-champagne-label', 'front-champagne-foil',
    'front-champagne-cork', 'front-champagne-ice', 'front-shot-player',
    'front-shot-margo', 'stage-trumpet', 'stage-trumpet-bell',
    'stage-trumpet-valve-button',
  ].map((name) => [name, named(root, name).length]));

  assert.equal(counts['cellar-working-details'], 1);
  assert.ok(counts['cellar-utility-pipe-run'] >= 2);
  for (const name of [
    'cellar-electrical-box', 'cellar-inventory-clipboard', 'cellar-floor-drain',
    'cellar-mop-bucket', 'waiter-service-tray', 'tray-cocktails', 'tray-plates',
    'tray-coffee', 'tray-champagne', 'front-champagne-bottle',
    'front-champagne-bucket', 'front-champagne-label', 'front-champagne-foil',
    'front-champagne-cork', 'front-shot-player', 'front-shot-margo',
    'stage-trumpet', 'stage-trumpet-bell',
  ]) assert.ok(counts[name] > 0, `missing ${name}`);
  assert.ok(counts['cellar-old-photograph'] >= 3);
  assert.ok(counts['cellar-wine-barrel'] >= 2);
  assert.ok(counts['dry-store-shelf-board'] >= 12);
  assert.ok(counts['front-champagne-ice'] >= 4);
  assert.equal(counts['stage-trumpet-valve-button'], 3);
});

test('service staff predict collisions and use stable right of way', () => {
  const npc = {
    serviceStaff: true,
    servicePriority: 2,
    serviceRadius: 0.42,
    speed: 1.2,
    job: 'patrol',
    group: { position: new THREE.Vector3(0, 0, 0) },
    route: [new THREE.Vector3(2, 0, 0)],
    routeAt: 0,
  };
  const diner = {
    group: { position: new THREE.Vector3(0.65, 0, 0) },
    serviceRadius: 0.28,
  };
  assert.equal(serviceAdvanceAllowed(npc, [npc, diner], 1 / 30), false,
    'a tray should yield before entering a diner');

  const senior = {
    ...npc,
    servicePriority: 0,
    group: { position: new THREE.Vector3(0.65, 0, 0) },
  };
  assert.equal(serviceAdvanceAllowed(npc, [npc, senior], 1 / 30), false);
  assert.equal(serviceAdvanceAllowed(senior, [senior, npc], 1 / 30), true,
    'only the stable-priority waiter proceeds in a head-on conflict');
});

test('the bandleader owns one dedicated profile and all eight authored cues', () => {
  assert.equal(PROFILE_OF.bandleader, 'bandleader');
  const noop = () => {};
  const flags = {};
  const scripts = buildScripts({
    mission: { flags: {}, addObjective: noop, roundDone: noop, metFamily: noop },
    flags, woo: { score: 70, has: () => false }, fire: noop,
    tip: noop, money: () => 500, drunkLevel: () => 0, knows: () => false,
    remember: noop, startTableCutscene: noop, holdTheRoom: noop, releaseTheRoom: noop,
    order: noop, serveTable: noop, playRequest: noop, startSway: noop,
    judgeInvitation: noop, openInvitation: noop,
  });
  const wired = new Set([
    ...Object.values(scripts.bandleader)
      .map(({ cue }) => (typeof cue === 'function' ? null : cue)).filter(Boolean),
    ...SET.flatMap((number) => [number.cue, ...(number.bits ?? []).map(({ cue }) => cue)]).filter(Boolean),
  ]);
  wired.add(scripts.bandleader.open.cue());
  flags.songRequested = 'banana';
  wired.add(scripts.bandleader.open.cue());
  const wanted = [
    'vo.silver.bandleader.open.front-table',
    'vo.silver.bandleader.open.on-the-pad',
    'vo.silver.bandleader.set.front-and-center',
    'vo.silver.bandleader.set.opener',
    'vo.silver.bandleader.set.second',
    'vo.silver.bandleader.set.second-wife',
    'vo.silver.bandleader.slow',
    'vo.silver.bandleader.tipped',
  ];
  const manifest = JSON.parse(read('assets/sfx/manifest.json'));
  const manifestNames = new Set(manifest.sfx.map(({ name }) => name));
  for (const cue of wanted) {
    assert.ok(wired.has(cue), `${cue} is not wired by the scene`);
    assert.ok(manifestNames.has(cue), `${cue} is absent from the voice ledger`);
  }
  assert.equal(new Set(wanted).size, 8);
});
