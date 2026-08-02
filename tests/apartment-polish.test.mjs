import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CHAPTER_ORDER, dressingFor, makeMorningGuest } from '../src/world/dressing.js';

test('the broken bloodied floor shirt is absent from every apartment iteration', async () => {
  for (const chapter of CHAPTER_ORDER) {
    assert.equal(dressingFor(chapter).shown.has('bloodShirt'), false, chapter);
  }

  const source = await readFile(new URL('../src/world/dressing.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /function bloodShirt\b|add\('bloodShirt'/);
});

test('the Booski podium portrait is the large framed reveal behind the clothes, not a floor duplicate', async () => {
  const source = await readFile(new URL('../src/world/apartment.js', import.meta.url), 'utf8');
  assert.match(source, /const closetBack = gear\.get\('shrine\.a'\)/);
  assert.match(source, /back:\s*closetBack\?\.real[\s\S]*w:\s*0\.50/);
  assert.doesNotMatch(source, /\['shrine\.a',[\s\S]*\['shrine\.b'/);
  assert.match(source, /slot:\s*'shrine\.a'[\s\S]*mesh:\s*closet\.picture/);
});

test('Margo has a deterministic, fully clothed repair pose and a post-reveal pose', () => {
  const margo = makeMorningGuest({});
  margo.setPose('repair');
  assert.equal(margo.pose(), 'repair');
  assert.equal(margo.dress.visible, true);
  assert.equal(margo.repairKit.visible, true);

  margo.setPose('waiting');
  assert.equal(margo.pose(), 'waiting');
  assert.equal(margo.dress.visible, true);
  assert.equal(margo.repairKit.visible, false);
});

test('the post-date apartment wires the repair through its own timing bar, reveal, and sleep gate', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /const margoRepair = \{[\s\S]*bar: new TimingBar\(/);
  assert.match(source, /margoRepair\.bar\.press\(\)/);
  assert.match(source, /apartmentStory\.margoDressRepairDone\(\)/);
  assert.match(source, /apartmentStory\.margoDressRepairOwed\(\)[\s\S]*Margo is waiting/);
  assert.match(source, /MARGO_REPAIR_CAMERA[\s\S]*margoRepair\.thrust/);
});
