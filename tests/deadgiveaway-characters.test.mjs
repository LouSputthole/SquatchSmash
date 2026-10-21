/**
 * Dead Giveaway's roster: every face on disk is selectable, every face the
 * roster names is on disk, and ids are unique (they go over the wire as
 * `character`, so they must also be what the server accepts).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { ROSTER, characterById, isRosterId, DEFAULT_CHARACTER } from '../src/deadgiveaway/characters.js';

const root = new URL('../', import.meta.url);
const index = JSON.parse(readFileSync(new URL('assets/faces/index.json', root), 'utf8'));

test('every roster face PNG exists on disk and is in the faces index', () => {
  for (const c of ROSTER) {
    if (!c.face) continue;
    assert.ok(existsSync(new URL(c.face, root)), `${c.id}: ${c.face} is not on disk`);
    assert.ok(index.files.includes(c.photo), `${c.id}: ${c.photo} is not in assets/faces/index.json`);
  }
});

test('the roster is every face in the index, plus Tony', () => {
  const photos = new Set(ROSTER.map((c) => c.photo).filter(Boolean));
  for (const file of index.files) assert.ok(photos.has(file), `${file} is in the faces index but nobody can sit down as it`);
  const tony = characterById('tony');
  assert.equal(tony.id, 'tony');
  assert.equal(tony.face, null, 'there is no Tony photograph; the seat gives him a neutral photo skull only for video');
});

test('ids are unique, wire-safe, and resolve', () => {
  const ids = ROSTER.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate roster id');
  for (const c of ROSTER) {
    assert.match(c.id, /^[A-Za-z0-9_-]{1,32}$/, `${c.id} would be refused by the server as bad_character`);
    assert.ok(c.name && c.name.length <= 40, `${c.id} needs a display name`);
    assert.equal(typeof c.model, 'object');
    assert.ok(Object.isFrozen(c.model), 'a roster model must not be writable back into the wardrobe');
    assert.equal(characterById(c.id), c);
    assert.ok(isRosterId(c.id));
  }
  assert.ok(isRosterId(DEFAULT_CHARACTER));
  assert.equal(characterById('nobody-at-all').id, 'tony', 'an unknown id still renders somebody');
});

test('the named cast wears the canonical wardrobe, not a local copy', async () => {
  const { WARDROBE } = await import('../src/core/wardrobe.js');
  assert.equal(characterById('lou').model.height, WARDROBE.lou.height);
  assert.equal(characterById('lou').model.build, WARDROBE.lou.build);
  assert.equal(characterById('booski').model.dress, WARDROBE.booski.dress);
});
