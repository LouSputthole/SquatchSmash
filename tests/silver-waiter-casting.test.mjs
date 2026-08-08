import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the hero Silver Room waiter uses a dedicated owner-selected voice profile', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
  assert.equal(manifest.voices['silver-waiter'].id, 'gAMZphRyrWJnLMDnom6H');

  const script = fs.readFileSync(path.join(ROOT, 'src/silver/script.js'), 'utf8');
  assert.match(script, /waiter: 'silver-waiter'/);
  assert.match(script, /host: 'waiter'/,
    'the host and restaurant ambience should keep their established performance');
});

test('the hero waiter has his own supplied East Asian-inspired portrait', () => {
  const cast = fs.readFileSync(path.join(ROOT, 'src/silver/cast.js'), 'utf8');
  assert.match(cast, /const SILVER_WAITER_FACE = 'assets\/faces\/silver-waiter\.png';/);
  assert.match(cast, /add\('waiter',[\s\S]*?face: SILVER_WAITER_FACE[\s\S]*?\}\)\);/);

  const facePath = path.join(ROOT, 'assets/faces/silver-waiter.png');
  assert.ok(fs.existsSync(facePath), 'the waiter portrait is missing');
  assert.ok(fs.statSync(facePath).size > 10_000, 'the waiter portrait is only a placeholder');

  const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/faces/index.json'), 'utf8'));
  assert.ok(index.files.includes('silver-waiter.png'), 'the face index was not refreshed');
});

test('the featured waiter carries the orange waistcoat and red bow tie read', () => {
  const cast = fs.readFileSync(path.join(ROOT, 'src/silver/cast.js'), 'utf8');
  const shared = fs.readFileSync(path.join(ROOT, 'src/bing/cast.js'), 'utf8');

  assert.match(cast, /waistcoatColour: 0xc85a17/);
  assert.match(cast, /bowtie: true, bowtieColour: 0xb71926/);
  assert.match(shared, /waistcoatColour = 0x191920/);
  assert.match(shared, /bowtieColour = 0x101018/);
  assert.match(shared, /color: waistcoatColour/);
  assert.match(shared, /color: bowtieColour/);
});

test('ambient Silver Room servers remain varied procedural extras', () => {
  const cast = fs.readFileSync(path.join(ROOT, 'src/silver/cast.js'), 'utf8');
  const heroStart = cast.indexOf("add('waiter'");
  const nextCast = cast.indexOf("add('photographer'", heroStart);
  const hero = cast.slice(heroStart, nextCast);
  const rest = cast.slice(nextCast);

  assert.match(hero, /face: SILVER_WAITER_FACE/);
  assert.doesNotMatch(rest, /face: SILVER_WAITER_FACE/,
    'the hero portrait should not be cloned across the whole restaurant');
});
