import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  SCENE_AUDIT_SCENES,
  countVisibleAuditMeshes,
  findCoplanarAuditPairs,
  installKnownSceneRoots,
} from '../tools/scene-audit-scenes.mjs';

const scene = (id) => SCENE_AUDIT_SCENES.find((entry) => entry.id === id);

const auditBox = (id, min, max) => ({
  id,
  name: '',
  min: { x: min[0], y: min[1], z: min[2] },
  max: { x: max[0], y: max[1], z: max[2] },
});

function previewLauncherEntries() {
  const html = readFileSync(new URL('../preview.html', import.meta.url), 'utf8');
  const entries = [];
  for (const [tag] of html.matchAll(/<a\b[^>]*>/gi)) {
    const launcher = tag.match(/\bdata-preview-(apartment|scene)="([^"]+)"/i);
    const href = tag.match(/\bhref="([^"]+)"/i);
    if (!launcher || !href) continue;
    entries.push({
      launcherKey: `${launcher[1].toLowerCase()}:${launcher[2]}`,
      url: href[1].replaceAll('&amp;', '&'),
    });
  }
  return entries;
}

test('default scene audit inventory matches every non-frozen preview launcher runtime', () => {
  const launcherEntries = previewLauncherEntries();
  const expected = launcherEntries
    .filter(({ launcherKey }) => launcherKey !== 'scene:initiation')
    .sort((a, b) => a.launcherKey.localeCompare(b.launcherKey));
  const configured = SCENE_AUDIT_SCENES
    .map(({ launcherKey, url }) => ({ launcherKey, url }))
    .sort((a, b) => String(a.launcherKey).localeCompare(String(b.launcherKey)));

  assert.ok(
    launcherEntries.some(({ launcherKey }) => launcherKey === 'scene:initiation'),
    'the parity check must keep recognizing the intentionally frozen launcher entry',
  );
  assert.deepEqual(configured, expected);
});

test('the default advisory inventory excludes frozen Initiation by construction', () => {
  assert.doesNotMatch(
    SCENE_AUDIT_SCENES.map(({ id, url }) => `${id} ${url}`).join('\n'),
    /initiation/i,
  );
});

test('scene audit uses public camera-parent roots for Bing 2, Graveyard, and Cartel Palace', () => {
  const root = { isScene: true };
  for (const [id, handle] of [
    ['bing-two', 'HOTDOG_INCIDENT'],
    ['graveyard', 'GRAVEYARD'],
    ['cartel-palace', 'CARTEL_PALACE'],
  ]) {
    const entry = scene(id);
    assert.deepEqual(entry.rootPaths, [[handle, 'player', 'camera', 'parent']]);
    const browserGlobal = {
      [handle]: { player: { camera: { parent: root } } },
    };
    assert.equal(installKnownSceneRoots({ paths: entry.rootPaths, root: browserGlobal }), 1);
    assert.deepEqual(browserGlobal.__auditRoots, [root]);
  }
});

test('scene audit launches the actual Heist and Silver Case preview worlds', () => {
  assert.deepEqual(scene('heist'), {
    id: 'heist',
    url: 'heist.html?preview=1&checkpoint=safehouse',
    launcherKey: 'scene:heist',
    start: '#start',
    rootPaths: [['__heistDebug', 'scene']],
  });
  assert.deepEqual(scene('silvercase'), {
    id: 'silvercase',
    url: 'silvercase.html?preview=1',
    launcherKey: 'scene:silvercase',
    start: '#beginBtn',
    rootPaths: [['silvercase', 'scene']],
  });
});

test('known root installation rejects empty and non-scene adapters', () => {
  const browserGlobal = {
    EMPTY: { player: { camera: { parent: { isScene: false } } } },
  };
  assert.equal(installKnownSceneRoots({
    paths: [['EMPTY', 'player', 'camera', 'parent']],
    root: browserGlobal,
  }), 0);
  assert.deepEqual(browserGlobal.__auditRoots, []);
});

test('scene readiness requires geometry the advisory audit will actually inspect', () => {
  const visible = {
    isMesh: true, geometry: {}, visible: true, material: { colorWrite: true }, parent: null,
  };
  const hiddenParent = { visible: false, parent: null };
  const hidden = {
    isMesh: true,
    geometry: {},
    visible: true,
    material: { colorWrite: true },
    parent: hiddenParent,
  };
  const proxy = {
    isMesh: true, geometry: {}, visible: true, material: { colorWrite: false }, parent: null,
  };
  const root = {
    traverse(visitor) {
      for (const object of [hidden, proxy, visible]) visitor(object);
    },
  };

  assert.equal(countVisibleAuditMeshes([root]), 1);
  assert.equal(countVisibleAuditMeshes([{ traverse: (visitor) => visitor(hidden) }]), 0);
});

test('coplanar audit retains multiple unnamed overlays on the same axis', () => {
  const zeroThicknessA = auditBox('plate-a', [0, 0, 0], [0, 1, 1]);
  const zeroThicknessB = auditBox('plate-b', [0, 0, 0], [0, 1, 1]);
  const sameFaceA = auditBox('face-a', [1, 2, 0], [3, 3, 1]);
  const sameFaceB = auditBox('face-b', [2, 2, 0], [3, 3, 1]);

  const pairs = findCoplanarAuditPairs([
    zeroThicknessA,
    zeroThicknessB,
    sameFaceA,
    sameFaceB,
  ]).filter(({ axis }) => axis === 'x');

  assert.deepEqual(
    pairs.map(({ a, b }) => [a.id, b.id]),
    [['plate-a', 'plate-b'], ['face-a', 'face-b']],
  );
});

test('coplanar audit ignores the three known apartment box-contact seams', () => {
  const contacts = [
    [
      auditBox('west-wall', [-5.16, 0, -4.5], [-5, 2.75, 4.5]),
      auditBox('west-skirting', [-5, 0, -4.5], [-4.98, 0.09, 4.5]),
    ],
    [
      auditBox('countertop', [4.36, 0.88, -1.9], [5, 0.92, -0.5]),
      auditBox('cooktop', [4.44, 0.92, -1.82], [4.94, 0.932, -1.3]),
    ],
    [
      auditBox('north-wall', [-5, 0, -4.66], [-1.9, 2.75, -4.5]),
      auditBox('north-skirting', [-5, 0, -4.5], [-1.9, 0.09, -4.48]),
    ],
  ];

  for (const [solid, attached] of contacts) {
    assert.deepEqual(findCoplanarAuditPairs([solid, attached]), []);
  }
});
