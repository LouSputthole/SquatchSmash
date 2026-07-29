import assert from 'node:assert/strict';
import test from 'node:test';

import { CHARACTER_IDS } from '../src/core/campaign.js';
import {
  CHARACTER_REGISTRY,
  getCharacter,
  resolveCharacterId,
  voiceProfileFor,
} from '../src/core/characters.js';

test('the campaign has one immutable identity record for each established recurring character', () => {
  assert.deepEqual(
    Object.keys(CHARACTER_REGISTRY).sort(),
    Object.values(CHARACTER_IDS).sort(),
  );

  for (const id of Object.values(CHARACTER_IDS)) {
    const character = getCharacter(id);
    assert.equal(character.id, id);
    assert.equal(typeof character.subtitleName, 'string');
    assert.ok(character.subtitleName.length > 0);
    assert.equal(Object.isFrozen(character), true);
  }
});

test('story IDs and legacy audio aliases resolve without merging the two Lous', () => {
  assert.equal(resolveCharacterId(CHARACTER_IDS.LOU), CHARACTER_IDS.LOU);
  assert.equal(resolveCharacterId('lou1'), CHARACTER_IDS.LOU);
  assert.equal(resolveCharacterId('lou2'), CHARACTER_IDS.CAPTAIN_LOU_SASOLE);
  assert.equal(resolveCharacterId('player'), CHARACTER_IDS.PROSPECT);

  assert.notEqual(resolveCharacterId('lou1'), resolveCharacterId('lou2'));
  assert.notEqual(voiceProfileFor(CHARACTER_IDS.LOU), voiceProfileFor(CHARACTER_IDS.CAPTAIN_LOU_SASOLE));
});

test('unconfirmed Initiation aliases are deliberately not guessed', () => {
  assert.equal(resolveCharacterId('sasole'), null);
  assert.equal(resolveCharacterId('tony_squatchmontana'), null);
  assert.equal(getCharacter('not_a_character'), null);
  assert.equal(voiceProfileFor('not_a_character'), null);
});
