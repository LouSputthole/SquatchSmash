import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { WEAPON_IDS } from '../src/core/weapons/catalog.js';
import {
  CombatLabSession,
  WHIP_DAMAGE,
  combatTargetFromObject,
} from '../src/combatlab/session.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, ROOT), 'utf8');

test('the preview launcher visibly exposes both development tools', () => {
  const preview = read('preview.html');
  assert.match(preview, /<h2>Wardrobe Preview<\/h2>[\s\S]*data-preview-tool="wardrobe"[^>]*href="wardrobe\.html"/);
  assert.match(preview, /<h2>Combat System<\/h2>[\s\S]*data-preview-tool="combat"[^>]*href="combatlab\.html\?preview=1"/);
  assert.equal(fs.existsSync(new URL('wardrobe.html', ROOT)), true);
  assert.equal(fs.existsSync(new URL('combatlab.html', ROOT)), true);
});

test('gun impacts resolve through the shared actor and ballistic rules', () => {
  const session = new CombatLabSession();
  const target = session.target('alpha');

  const first = session.weaponImpact('alpha', WEAPON_IDS.CARBINE, { multiplier: 1 });
  assert.equal(first.applied, true);
  assert.equal(first.damage, 42);
  assert.equal(target.actor.health, 58);
  assert.deepEqual(session.feedback, {
    sequence: 1,
    kind: 'gun-hit',
    targetId: 'alpha',
    damage: 42,
    health: 58,
    dead: false,
    weaponId: WEAPON_IDS.CARBINE,
  });

  session.weaponImpact('alpha', WEAPON_IDS.CARBINE);
  const fatal = session.weaponImpact('alpha', WEAPON_IDS.CARBINE);
  assert.equal(fatal.fatal, true);
  assert.equal(target.actor.health, 0);
  assert.equal(target.actor.incapacitated, true);
  assert.equal(session.feedback.dead, true);

  session.reset();
  assert.equal(target.actor.health, target.actor.maxHealth);
  assert.equal(target.actor.incapacitated, false);
  assert.equal(session.feedback.kind, 'reset');
});

test('the whip owns range, facing, cooldown, feedback and damage as one transition', () => {
  const session = new CombatLabSession();
  const target = session.target('bravo');

  const missed = session.whipImpact('bravo', { distance: 4, facing: 1 });
  assert.deepEqual(missed, { applied: false, reason: 'out-of-range' });
  assert.equal(target.actor.health, 100);
  assert.equal(session.feedback.kind, 'whip-miss');

  session.update(1);
  const hit = session.whipImpact('bravo', { distance: 2, facing: 0.9 });
  assert.equal(hit.applied, true);
  assert.equal(hit.damage, WHIP_DAMAGE);
  assert.equal(target.actor.health, 100 - WHIP_DAMAGE);
  assert.equal(session.feedback.kind, 'whip-hit');

  const blocked = session.whipImpact('bravo', { distance: 2, facing: 0.9 });
  assert.deepEqual(blocked, { applied: false, reason: 'cooldown' });
  assert.equal(target.actor.health, 100 - WHIP_DAMAGE);
});

test('a labeled child hit mesh resolves to its reusable target owner', () => {
  const root = { name: 'combatlab.target.alpha', userData: { combatTargetId: 'alpha' }, parent: null };
  const body = { name: 'combatlab.target.alpha.body', userData: { hitMultiplier: 1 }, parent: root };
  const head = { name: 'combatlab.target.alpha.head', userData: { hitMultiplier: 2 }, parent: body };
  assert.deepEqual(combatTargetFromObject(head), { targetId: 'alpha', multiplier: 2 });
  assert.equal(combatTargetFromObject({ userData: {}, parent: null }), null);
});

test('the playable tool composes current shared systems and exposes deterministic controls', () => {
  const html = read('combatlab.html');
  const source = read('src/combatlab/main.js');
  assert.match(html, /id="startBtn"/);
  assert.match(html, /id="resetBtn"/);
  assert.match(html, /WASD/);
  assert.match(html, /Mouse/);
  assert.match(html, /Whip/);
  assert.match(source,
    /import\s*\{[^}]*\bWeaponSystem\b[^}]*\}\s*from '\.\.\/core\/weapons\/index\.js'/s,
    'the tool must consume WeaponSystem through the canonical shared import surface');
  assert.match(source, /from '\.\.\/bing\/license-to-grill-runtime\.js'/);
  assert.match(source, /new CombatLabSession\(/);
  assert.match(source, /window\.combatSystem = \{/);
  assert.match(source, /reset\(\)/);
  assert.match(source, /targetMeshes\.push\(body, head, stand\)/,
    'world-space weapon rays must exclude camera-dependent label sprites');
  assert.doesNotMatch(source, /targetMeshes\.push\(root\)/);
  assert.doesNotMatch(source, /core\/combat\/index\.js/,
    'the retired parallel combat framework must not return');
});
