import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  ITEM_IDS,
  MISSION_IDS,
  createCampaign,
} from '../src/core/campaign.js';
import { createSquatchfatherStory } from '../src/core/squatchfather-story.js';
import { SQUATCHFATHER_VO_CUES } from '../src/squatchfather/audio/core.js';
import { Figure } from '../src/squatchfather/characters/Figure.js';
import { collectSquatchfatherVoiceCues } from '../tools/squatchfather-vo.mjs';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function campaignReadyForSquatchfather(storage = new MemoryStorage()) {
  const campaign = createCampaign({ storage });
  campaign.addItem(ITEM_IDS.LOU_PACKAGE, { concealed: true });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'available';
  });
  return campaign;
}

test('starting Squatchfather stages Lou’s package as the bathroom weapon exactly once', () => {
  const storage = new MemoryStorage();
  const campaign = campaignReadyForSquatchfather(storage);
  const story = createSquatchfatherStory({ campaign });

  assert.deepEqual(story.begin(), { ok: true, resumed: false });
  let state = campaign.state;
  assert.equal(campaign.hasItem(ITEM_IDS.LOU_PACKAGE), false);
  assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].status, 'in_progress');
  assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].weaponStaged, true);

  const reloaded = createSquatchfatherStory({
    campaign: createCampaign({ storage }),
  });
  assert.deepEqual(reloaded.begin(), { ok: true, resumed: true });
  state = reloaded.campaign.state;
  assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].status, 'in_progress');
  assert.equal(state.missions[MISSION_IDS.SQUATCHFATHER].weaponStaged, true);
});

test('Squatchfather cannot start without the package and cannot complete before staging it', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.update((state) => {
    state.missions[MISSION_IDS.BADA_BING_ONE].status = 'complete';
    state.missions[MISSION_IDS.SQUATCHFATHER].status = 'available';
  });
  const story = createSquatchfatherStory({ campaign });

  assert.deepEqual(story.begin(), { ok: false, reason: 'missing_package' });
  assert.equal(story.complete(), false);
  assert.equal(campaign.state.missions[MISSION_IDS.SQUATCHFATHER].status, 'available');
});

test('completing Squatchfather records the dropped weapon and survives reload', () => {
  const storage = new MemoryStorage();
  const story = createSquatchfatherStory({
    campaign: campaignReadyForSquatchfather(storage),
  });
  story.begin();

  assert.equal(story.complete(), true);
  const saved = createCampaign({ storage }).state.missions[MISSION_IDS.SQUATCHFATHER];
  assert.equal(saved.status, 'complete');
  assert.equal(saved.weaponStaged, true);
  assert.equal(saved.weaponDropped, true);
});

test('Squatchfather exposes the cabin handoff only after scene completion', () => {
  const html = readFileSync(new URL('../squatchfather.html', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/squatchfather/main.js', import.meta.url), 'utf8');
  const verifier = readFileSync(new URL('../tools/verify-squatchfather.mjs', import.meta.url), 'utf8');

  assert.equal(html.includes('id="backBtn"'), false,
    'the title card still lets the player abandon the linear mission');
  assert.equal(html.includes('id="quitBtn"'), false,
    'the pause card still lets the player abandon the linear mission');
  assert.equal(html.includes('id="menuBtn"'), false,
    'the completion card should have one canonical cabin handoff');
  assert.doesNotMatch(source, /actions:\s*\[[^\]]*Back to apartment/is,
    'the shared pause overlay still lets the player abandon the linear mission');
  assert.match(html, /id="againBtn"[^>]*>[^<]*CONTINUE TO THE CABIN/i);
  assert.match(
    source,
    /navigateCampaign\(campaign,\s*SCENE_IDS\.COUNTRYSIDE_CABIN,\s*\{\s*spawn:\s*'arrival'/s,
    'the visible cabin CTA does not use the campaign cabin handoff',
  );
  assert.match(verifier, /waitForURL\(`http:\/\/localhost:\$\{PORT\}\/cabin\.html`/);
  assert.match(verifier, /scene\.id === 'countryside_cabin'/);
  assert.doesNotMatch(verifier, /Squatchfather returns to the apartment.s front door/i);
});

test('Squatchfather treats the Booski shooting as older history with fresh cue ids', () => {
  const dialogue = JSON.parse(readFileSync(
    new URL('../src/squatchfather/dialogue/dialogue.json', import.meta.url),
    'utf8',
  ));
  const manifest = JSON.parse(readFileSync(
    new URL('../assets/sfx/manifest.json', import.meta.url),
    'utf8',
  ));
  const prospectLines = dialogue.opening
    .filter((beat) => beat.speaker === 'PROSPECT')
    .map((beat) => beat.text);
  const history = prospectLines.slice(0, 2).join(' ');

  assert.match(history, /six years ago/i);
  assert.match(history, /healed mean/i);
  assert.doesNotMatch(history, /shits in a bag|ostomy|still recovering/i);

  const byName = new Map(manifest.sfx.map((cue) => [cue.name, cue]));
  assert.equal(byName.get('vo.sf.opening.history.2')?.say, prospectLines[0]);
  assert.equal(byName.get('vo.sf.opening.history.4')?.say, prospectLines[1]);
  assert.equal(byName.has('vo.sf.opening.2'), false);
  assert.equal(byName.has('vo.sf.opening.4'), false);
});

test('Squatchfather’s offscreen driver motivates the cabin before enabling the car', () => {
  const dialogue = JSON.parse(readFileSync(
    new URL('../src/squatchfather/dialogue/dialogue.json', import.meta.url),
    'utf8',
  ));
  const source = readFileSync(new URL('../src/squatchfather/main.js', import.meta.url), 'utf8');
  const enterCar = source.slice(
    source.indexOf('[S.ENTER_CAR]'),
    source.indexOf('[S.SCENE_COMPLETE]'),
  );
  const [line] = dialogue.extraction;

  assert.equal(dialogue.extraction.length, 1);
  assert.equal(line.speaker, 'DRIVER');
  assert.match(line.text, /Lou.*sleeping up north.*get in/i);
  assert.ok(enterCar.indexOf("dialogue.play('extraction'") < enterCar.indexOf("interactions.allow('car')"),
    'the car became usable before the driver delivered Lou’s order');

  const cue = collectSquatchfatherVoiceCues(dialogue)
    .find(({ name }) => name === 'vo.sf.extraction.driver.cabin');
  assert.ok(SQUATCHFATHER_VO_CUES.includes('vo.sf.extraction.driver.cabin'));
  assert.deepEqual(cue, {
    name: 'vo.sf.extraction.driver.cabin',
    voice: 'doorman',
    say: line.text,
  });
});

const EXHALE_T = -Math.PI / (2 * 1.6);
const INHALE_T = Math.PI / (2 * 1.6);

function visibleSuitParts(figure) {
  // The fallback lets this regression reproduce the old public Figure before
  // the fitted garment rig exists. The named public refs below are the final
  // contract; this ordering is not used after that contract is available.
  const oldParts = figure.torso.children;
  return {
    chest: figure.chest,
    shirt: figure.shirt ?? oldParts[1],
    tie: figure.tie,
    lapelL: figure.lapelL ?? oldParts[3],
    lapelR: figure.lapelR ?? oldParts[4],
  };
}

function normalizedSuitFit(figure) {
  figure.group.updateWorldMatrix(true, true);
  const parts = visibleSuitParts(figure);
  const chest = new THREE.Box3().setFromObject(parts.chest);
  const height = chest.max.y - chest.min.y;
  const depth = chest.max.z - chest.min.z;
  const measure = (part) => {
    const bounds = new THREE.Box3().setFromObject(part);
    return [
      (bounds.min.y - chest.min.y) / height,
      (bounds.max.y - chest.min.y) / height,
      (bounds.min.z - chest.min.z) / depth,
      (bounds.max.z - chest.min.z) / depth,
    ];
  };
  return Object.fromEntries(Object.entries(parts)
    .filter(([name]) => name !== 'chest')
    .map(([name, part]) => [name, measure(part)]));
}

function maxFitDelta(a, b) {
  return Math.max(...Object.keys(a).flatMap((name) =>
    a[name].map((value, i) => Math.abs(value - b[name][i]))));
}

test('Squatchfather Figure breathes the visible suit as one registered assembly', () => {
  const figure = new Figure({ bulk: 1.08 });
  figure.t = EXHALE_T;
  figure.update(0);
  const exhale = normalizedSuitFit(figure);
  figure.t = INHALE_T;
  figure.update(0);
  const inhale = normalizedSuitFit(figure);

  const drift = maxFitDelta(exhale, inhale);
  assert.ok(drift < 1e-9,
    `shirt/tie/lapels drifted ${drift.toFixed(6)} chest-widths through one breath`);
});

test('Squatchfather Figure exposes reusable named torso garment parts', () => {
  const figure = new Figure();
  const expected = [
    ['sf.torso.chest', figure.chest],
    ['sf.torso.shirt', figure.shirt],
    ['sf.torso.tie', figure.tie],
    ['sf.torso.lapel.left', figure.lapelL],
    ['sf.torso.lapel.right', figure.lapelR],
    ['sf.torso.shoulders', figure.shoulderBar],
  ];

  assert.equal(figure.torsoGarments?.name, 'sf.torso.garments');
  for (const [name, part] of expected) {
    assert.ok(part, `${name} is not exposed by Figure`);
    assert.equal(part.name, name);
    assert.equal(part.parent, figure.torsoGarments, `${name} is outside the breathing garment rig`);
  }
});

test('Squatchfather Figure neutralizes and freezes breathing while down, then resets cleanly', () => {
  const figure = new Figure();
  figure.t = INHALE_T;
  figure.update(0);

  figure.down = true;
  figure.t = EXHALE_T;
  figure.update(0);
  const breathingNode = figure.torsoGarments ?? figure.chest;
  assert.deepEqual(breathingNode.scale.toArray(), [1, 1, 1],
    'a down figure retained or applied a live breath');

  figure.t = INHALE_T;
  figure.update(0);
  assert.deepEqual(breathingNode.scale.toArray(), [1, 1, 1],
    'a corpse resumed breathing on a later update');

  figure.setDown(false);
  assert.deepEqual(breathingNode.scale.toArray(), [1, 1, 1],
    'checkpoint reset did not restore a neutral garment rig');
  figure.update(0);
  assert.ok(breathingNode.scale.y > 1,
    'a revived figure did not resume normal breathing');
});

const FIGURE_SEMANTIC_NODES = [
  'sf.figure', 'sf.root', 'sf.pelvis', 'sf.pelvis.coat',
  'sf.torso', 'sf.torso.garments', 'sf.neck', 'sf.head', 'sf.face.jaw.pivot',
  'sf.leg.left.hip', 'sf.leg.left.thigh', 'sf.leg.left.knee',
  'sf.leg.left.shin', 'sf.leg.left.shoe',
  'sf.leg.right.hip', 'sf.leg.right.thigh', 'sf.leg.right.knee',
  'sf.leg.right.shin', 'sf.leg.right.shoe',
  'sf.arm.left.shoulder', 'sf.arm.left.sleeve.upper', 'sf.arm.left.elbow',
  'sf.arm.left.sleeve.forearm', 'sf.arm.left.hand',
  'sf.arm.right.shoulder', 'sf.arm.right.sleeve.upper', 'sf.arm.right.elbow',
  'sf.arm.right.sleeve.forearm', 'sf.arm.right.hand',
];

for (const [label, look] of [
  ['fixed', {}],
  ['fur', { fur: true }],
  ['crop/temples/lids', { hairStyle: 'crop', temples: 0x77716c, lidHeavy: true }],
]) {
  test(`Squatchfather ${label} Figure has no anonymous reusable anatomy or clothing nodes`, () => {
    const figure = new Figure(look);
    const anonymous = [];
    figure.group.traverse((node) => {
      if ((node.isGroup || node.isMesh) && !node.name) {
        anonymous.push(`${node.type} under ${node.parent?.name || '(anonymous)'}`);
      }
    });
    assert.deepEqual(anonymous, [], `${label} Figure anonymous nodes: ${anonymous.join(', ')}`);
    for (const name of FIGURE_SEMANTIC_NODES) {
      assert.ok(figure.group.getObjectByName(name), `${label} Figure is missing ${name}`);
    }
  });
}

test('the Squatchfather cook builder labels every reusable body and clothing part', () => {
  const sceneSource = readFileSync(
    new URL('../src/squatchfather/scenes/SquatchfatherScene.js', import.meta.url),
    'utf8',
  );
  const builder = sceneSource.match(
    /function makeBystander\([\s\S]*?(?=\n\s*\/\/ The waiter and the diners)/,
  )?.[0];
  assert.ok(builder, 'the cook makeBystander source is missing');
  for (const name of [
    'sf.bystander.cook', 'sf.bystander.coat',
    'sf.bystander.sleeve.left', 'sf.bystander.sleeve.right',
    'sf.bystander.trouser.left', 'sf.bystander.trouser.right',
  ]) {
    assert.ok(builder.includes(name), `cook builder is missing ${name}`);
  }
  assert.doesNotMatch(builder, /g\.add\(box\(/,
    'cook builder still adds anonymous clothing/anatomy meshes directly');
});
