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
    assert.equal(typeof character.canonicalName, 'string');
    assert.ok(character.canonicalName.length > 0);
    assert.equal(typeof character.subtitleName, 'string');
    assert.ok(character.subtitleName.length > 0);
    assert.equal(character.species, 'human');
    assert.equal(typeof character.role, 'string');
    assert.ok(character.role.length > 0);
    assert.equal(Object.isFrozen(character), true);
  }
});

test('approved story names and aliases resolve without merging the two Lous', () => {
  assert.equal(resolveCharacterId(CHARACTER_IDS.LOU), CHARACTER_IDS.LOU);
  assert.equal(resolveCharacterId('lou1'), CHARACTER_IDS.LOU);
  assert.equal(resolveCharacterId('lou2'), CHARACTER_IDS.CAPTAIN_LOU_SASOLE);
  assert.equal(resolveCharacterId('player'), CHARACTER_IDS.PROSPECT);
  assert.equal(resolveCharacterId('tony_squatchtana'), CHARACTER_IDS.PROSPECT);
  assert.equal(resolveCharacterId('big_uncle_lou'), CHARACTER_IDS.LOU);
  assert.equal(resolveCharacterId('lou_sputthole'), CHARACTER_IDS.LOU);
  assert.equal(resolveCharacterId('sasole'), CHARACTER_IDS.CAPTAIN_LOU_SASOLE);
  assert.equal(resolveCharacterId('booskibro'), CHARACTER_IDS.BOOSKI);
  assert.equal(resolveCharacterId('ericran'), CHARACTER_IDS.ERIC);

  assert.notEqual(resolveCharacterId('lou1'), resolveCharacterId('lou2'));
  assert.notEqual(voiceProfileFor(CHARACTER_IDS.LOU), voiceProfileFor(CHARACTER_IDS.CAPTAIN_LOU_SASOLE));

  assert.deepEqual(
    {
      prospect: getCharacter(CHARACTER_IDS.PROSPECT).canonicalName,
      lou: getCharacter(CHARACTER_IDS.LOU).canonicalName,
      captain: getCharacter(CHARACTER_IDS.CAPTAIN_LOU_SASOLE).canonicalName,
      booski: getCharacter(CHARACTER_IDS.BOOSKI).canonicalName,
    },
    {
      prospect: 'Tony Squatchtana',
      lou: 'Big Uncle Lou Sputthole',
      captain: 'Captain Lou Sasole',
      booski: 'Booskibro',
    },
  );

  assert.equal(getCharacter(CHARACTER_IDS.PROSPECT).subtitleName, 'Prospect');
  assert.equal(getCharacter(CHARACTER_IDS.BOOSKI).subtitleName, 'Booskibro');
  assert.equal(getCharacter(CHARACTER_IDS.ERIC).canonicalName, 'Ericran');
  assert.equal(getCharacter(CHARACTER_IDS.ERIC).subtitleName, 'Ericran');
});

test('rejected and unknown character names do not silently become canon', () => {
  assert.equal(resolveCharacterId('tony_squatchmontana'), null);
  assert.equal(getCharacter('not_a_character'), null);
  assert.equal(voiceProfileFor('not_a_character'), null);
});
