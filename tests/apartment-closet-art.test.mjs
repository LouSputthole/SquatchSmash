import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Booski podium art is the large picture behind the closet clothes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/art/manifest.json'), 'utf8'));
  const podiumSlots = manifest.art.filter((entry) => entry.file === 'shrine-booski-podium.jpg');
  assert.ok(podiumSlots.some((entry) => entry.slot === 'closet.back'));
  assert.equal(podiumSlots.some((entry) => entry.slot === 'shrine.a'), false,
    'the podium picture still has a duplicate on the closet floor');

  const apartment = fs.readFileSync(path.join(ROOT, 'src/world/apartment.js'), 'utf8');
  assert.match(apartment, /const CLOSET_SLOTS = \['closet\.back',/);
  assert.match(apartment, /back: closetBack\?\.real[\s\S]*?w: 0\.52/);
  assert.doesNotMatch(apartment, /\['shrine\.a',[\s\S]*?\['shrine\.b'/,
    'the old floor-sized podium picture is still being built');
});
