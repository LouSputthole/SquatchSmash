import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import {
  CombatAudio,
  CombatStepCadence,
  CombatSuppressionField,
} from '../src/core/combat/index.js';
import { choosePalaceCombatPosition } from '../src/cartel-palace/security.js';
import { BallisticImpactSystem } from '../src/world/impacts.js';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const palaceMain = read('../src/cartel-palace/main.js');
const palaceSecurity = read('../src/cartel-palace/security.js');
const palaceCast = read('../src/cartel-palace/cast.js');
const palaceWorld = read('../src/cartel-palace/world.js');
const palaceRuntime = palaceMain.slice(palaceMain.indexOf('window.CARTEL_PALACE = {'));

const siegeMain = read('../src/mansion/siege/main.js');
const siegeAttackers = read('../src/mansion/siege/attackers.js');
const siegeEnsemble = read('../src/mansion/siege/ensemble.js');
const siegeDressing = read('../src/mansion/siege/dressing.js');
const siegeGlass = read('../src/mansion/siege/glass.js');
const mansionGrounds = read('../src/mansion/scenes/MansionGrounds.js');
const mansionInterior = read('../src/mansion/scenes/MansionInterior.js');
const siegeRuntime = siegeMain.slice(siegeMain.indexOf('window.mansionSiege = {'));

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function requireMatch(problems, source, pattern, message) {
  if (!pattern.test(source)) problems.push(message);
}

function rejectMatch(problems, source, pattern, message) {
  if (pattern.test(source)) problems.push(message);
}

function constructedVariable(source, className) {
  return source.match(new RegExp(
    `\\b(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*new\\s+${escapeRegExp(className)}\\s*\\(`,
  ))?.[1] ?? null;
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function callRegion(source, call, maximum = 2800) {
  const start = source.indexOf(call);
  return start < 0 ? '' : source.slice(start, start + maximum);
}

const PRESENTATION_STACK = Object.freeze([
  'CombatAudio',
  'CombatStepCadence',
  'BallisticImpactSystem',
  'CombatSuppressionField',
]);

test('combat-presentation Modules share an explicit checkpoint reset lifecycle', () => {
  const engine = { play() {} };
  const combatAudio = new CombatAudio({ audio: engine });
  const combatSteps = new CombatStepCadence({ audio: combatAudio });
  const ballisticImpacts = new BallisticImpactSystem(new THREE.Scene(), { audio: engine });
  const suppressionField = new CombatSuppressionField();
  const stack = { combatAudio, combatSteps, ballisticImpacts, suppressionField };

  const missing = Object.entries(stack)
    .filter(([, instance]) => typeof instance.reset !== 'function')
    .map(([name]) => name);
  assert.deepEqual(missing, [], 'every exposed transient Module needs one reset call at restore/retry');

  for (const instance of Object.values(stack)) instance.reset();
  ballisticImpacts.dispose();
});

test('both production composition roots construct, expose and reset the shared stack', () => {
  const problems = [];
  for (const scene of [
    { label: 'Cartel Palace', source: palaceMain, runtime: palaceRuntime },
    { label: 'Mansion Siege', source: siegeMain, runtime: siegeRuntime },
  ]) {
    for (const className of PRESENTATION_STACK) {
      const variable = constructedVariable(scene.source, className);
      if (!variable) {
        problems.push(`${scene.label} does not instantiate ${className}`);
        continue;
      }
      requireMatch(
        problems,
        scene.runtime,
        new RegExp(`\\b${escapeRegExp(variable)}\\b`),
        `${scene.label} does not expose its ${className} instance`,
      );
      requireMatch(
        problems,
        scene.source,
        new RegExp(`\\b${escapeRegExp(variable)}\\.reset\\s*\\(`),
        `${scene.label} does not reset its ${className} instance`,
      );
    }
  }
  assert.deepEqual(problems, []);
});
test('both roots route actor results, world materials, player damage and player misses', () => {
  const problems = [];
  for (const scene of [
    { label: 'Cartel Palace', source: palaceMain },
    { label: 'Mansion Siege', source: siegeMain },
  ]) {
    const combatAudio = constructedVariable(scene.source, 'CombatAudio') ?? 'combatAudio';
    const ballisticImpacts = constructedVariable(scene.source, 'BallisticImpactSystem')
      ?? 'ballisticImpacts';
    const suppressionField = constructedVariable(scene.source, 'CombatSuppressionField')
      ?? 'suppressionField';
    const audioImpact = `${escapeRegExp(combatAudio)}\\.impact\\s*\\(\\s*\\{`;
    const worldImpact = `${escapeRegExp(ballisticImpacts)}\\.hit\\s*\\(\\s*\\{`;

    requireMatch(
      problems,
      scene.source,
      new RegExp(`${audioImpact}[\\s\\S]{0,420}\\btarget\\s*:\\s*['\"]enemy['\"]`),
      `${scene.label} does not route an applied enemy result through CombatAudio`,
    );
    requireMatch(
      problems,
      scene.source,
      new RegExp(`${audioImpact}[\\s\\S]{0,420}\\btarget\\s*:\\s*['\"]player['\"]`),
      `${scene.label} does not route player damage through CombatAudio`,
    );
    requireMatch(
      problems,
      scene.source,
      new RegExp(`${worldImpact}[\\s\\S]{0,420}\\bmaterial\\s*:`),
      `${scene.label} does not route a classified world hit through BallisticImpactSystem`,
    );
    requireMatch(
      problems,
      scene.source,
      new RegExp(`\\b${escapeRegExp(suppressionField)}\\.applyPlayerShot\\s*\\(`),
      `${scene.label} does not route truthful player misses through CombatSuppressionField`,
    );
    rejectMatch(
      problems,
      scene.source,
      /audio\.play\s*\(\s*['"]heist\.player\.hit['"]/,
      `${scene.label} still bypasses CombatAudio for player hit presentation`,
    );
    rejectMatch(
      problems,
      scene.source,
      /audio\.play\s*\(\s*['"]heist\.bullet\.impact['"]/,
      `${scene.label} still bypasses material classification for world impacts`,
    );
  }
  assert.deepEqual(problems, []);
});

test('Palace composes directional and suppression feedback with visible armor state', () => {
  const problems = [];
  const armorSources = `${palaceMain}\n${palaceCast}\n${palaceSecurity}`;
  requireMatch(
    problems,
    palaceMain,
    /resolveCombatFeedback\s*\(/,
    'Palace player hits do not use shared directional feedback',
  );
  requireMatch(
    problems,
    palaceMain,
    /\.bearing\b/,
    'Palace never consumes the resolved incoming-hit bearing',
  );
  requireMatch(
    problems,
    palaceMain,
    /\.sector\b/,
    'Palace never presents the resolved incoming-hit sector',
  );
  requireMatch(
    problems,
    palaceMain,
    /suppression\.vignette\b/,
    'Palace suppression changes accuracy but has no visible pressure feedback',
  );
  requireMatch(
    problems,
    armorSources,
    /new\s+CombatArmorPresentation\s*\(/,
    'Palace armored actors have numbers but no readable plate silhouette',
  );
  requireMatch(
    problems,
    armorSources,
    /armorPresentation\.applyResult\s*\(/,
    'Palace armor hits never drive the shared break presentation',
  );
  requireMatch(
    problems,
    armorSources,
    /armorPresentation\.restore\s*\(/,
    'Palace checkpoint restore does not rebuild armor presentation from actor state',
  );
  assert.deepEqual(problems, []);
});

test('Mansion passes bark and weapon telegraphs and wires positional hostile/friendly steps', () => {
  const problems = [];
  const attackerUpdate = callRegion(siegeMain, 'attackers.update(');
  const ensembleUpdate = callRegion(siegeMain, 'ensemble.update(');
  for (const [label, region] of [
    ['attacker update', attackerUpdate],
    ['friendly ensemble update', ensembleUpdate],
  ]) {
    requireMatch(problems, region, /\bonBark\b/, `Mansion ${label} omits onBark`);
    requireMatch(problems, region, /\bonWeaponEvent\b/, `Mansion ${label} omits onWeaponEvent`);
    requireMatch(problems, region, /\bonStep\b/, `Mansion ${label} omits positional onStep`);
  }
  requireMatch(
    problems,
    siegeMain,
    /\b[A-Za-z_$][\w$]*\.update\s*\(\s*\{[\s\S]{0,360}\bid\s*:[\s\S]{0,360}\bposition\s*:/,
    'Mansion main never feeds actor id and world position into CombatStepCadence',
  );
  requireMatch(
    problems,
    siegeAttackers,
    /\bonStep\b/,
    'Mansion hostile movement has no positional step callback',
  );
  requireMatch(
    problems,
    siegeEnsemble,
    /\bonStep\b/,
    'Mansion friendly movement has no positional step callback',
  );
  assert.deepEqual(problems, []);
});

test('Palace wires positional guard steps through its main-owned cadence', () => {
  const problems = [];
  requireMatch(
    problems,
    palaceMain,
    /new\s+PalaceSecurity\s*\(\s*\{[\s\S]{0,5200}\bonStep\b/,
    'Palace main does not accept guard movement at a step-audio Seam',
  );
  requireMatch(
    problems,
    palaceMain,
    /\b[A-Za-z_$][\w$]*\.update\s*\(\s*\{[\s\S]{0,360}\bid\s*:[\s\S]{0,360}\bposition\s*:/,
    'Palace main never feeds guard id and world position into CombatStepCadence',
  );
  requireMatch(
    problems,
    palaceSecurity,
    /\b(?:this\.)?onStep\b/,
    'PalaceSecurity does not publish actual guard movement for positional steps',
  );
  assert.deepEqual(problems, []);
});

test('ordinary Palace guards use tactical posts while boss and traitor stay authored', () => {
  const posts = [
    { id: 'cover-left', kind: 'cover', score: 1, position: new THREE.Vector3(-3, 0, 4) },
    { id: 'flank-right', kind: 'flank', score: 0.8, position: new THREE.Vector3(4, 0, 5) },
  ];
  const target = new THREE.Vector3(0, 0, 10);
  const entry = (id, role) => ({ id, role, root: { position: new THREE.Vector3() } });
  const args = { target, posts, reservations: new Set(), space: { trace: () => null } };

  assert.equal(choosePalaceCombatPosition({ ...args, entry: entry('guard-a', 'guard') }).post.id, 'cover-left');
  assert.equal(choosePalaceCombatPosition({ ...args, entry: entry('mark', 'boss') }), null);
  assert.equal(choosePalaceCombatPosition({ ...args, entry: entry('sauce', 'traitor') }), null);

  assert.ok(
    occurrences(palaceSecurity, /\bchoosePalaceCombatPosition\s*\(/g) >= 2,
    'the selector is exported and unit-tested but PalaceSecurity never calls it',
  );
  assert.match(palaceSecurity, /\bcombatPosts\b/, 'PalaceSecurity has no authored tactical-post input');
  assert.match(palaceSecurity, /\breservations\b/, 'PalaceSecurity cannot keep ordinary guards off one post');
  assert.match(palaceMain, /combatPosts\s*:/, 'Palace main does not pass the estate tactical posts');
});

test('Mansion friendlies use Firearm plus shared perception, aim and fire control', () => {
  const problems = [];
  rejectMatch(
    problems,
    siegeEnsemble,
    /\bWeaponController\b/,
    'Mansion ensemble still owns WeaponController migration debt',
  );
  for (const className of ['Firearm', 'CombatPerception', 'CombatWeaponAim', 'CombatFireControl']) {
    requireMatch(
      problems,
      siegeEnsemble,
      new RegExp(`\\b${className}\\b`),
      `Mansion ensemble does not import ${className}`,
    );
    requireMatch(
      problems,
      siegeEnsemble,
      new RegExp(`\\bnew\\s+${className}\\s*\\(`),
      `Mansion ensemble does not instantiate ${className}`,
    );
  }
  assert.deepEqual(problems, []);
});

test('both authored worlds explicitly tag combat collider materials', () => {
  const problems = [];
  const mansionMaterials = `${mansionGrounds}\n${mansionInterior}\n${siegeDressing}\n${siegeGlass}`;
  for (const scene of [
    { label: 'Cartel Palace', source: palaceWorld },
    { label: 'Mansion Siege', source: mansionMaterials },
  ]) {
    requireMatch(
      problems,
      scene.source,
      /(?:userData\.)?combatMaterial\s*=/,
      `${scene.label} never writes an explicit combatMaterial tag`,
    );
    for (const material of ['glass', 'wood_thin', 'metal', 'concrete']) {
      requireMatch(
        problems,
        scene.source,
        new RegExp(`['\"]${material}['\"]`),
        `${scene.label} does not declare ${material} in its combat material language`,
      );
    }
  }
  assert.deepEqual(problems, []);
});
