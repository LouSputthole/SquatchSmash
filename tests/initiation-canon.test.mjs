import assert from 'node:assert/strict';
import test from 'node:test';

import { ROSTER } from '../src/initiation/npc.js';

test('the Initiation Circle is an all-human roster with approved identities', () => {
  assert.ok(ROSTER.length > 0);
  assert.equal(ROSTER.every((member) => member.species === 'human'), true);

  const byId = Object.fromEntries(ROSTER.map((member) => [member.id, member]));
  assert.equal(byId.booski.name, 'BOOSKIBRO');
  assert.equal(byId.lou.name, 'BIG UNCLE LOU SPUTTHOLE');
  assert.equal(byId.captain_lou_sasole.name, 'CAPTAIN LOU SASOLE');
  assert.equal(byId.captain_lou_sasole.face, 'assets/faces/sasole.png');
  assert.equal(byId.sasole, undefined);
});

test('the locked founders retain their canonical names', () => {
  const founders = ROSTER
    .filter((member) => member.founder)
    .map((member) => member.name);

  assert.deepEqual(founders, [
    'BOOSKIBRO',
    'BIG UNCLE LOU SPUTTHOLE',
    'RIPPINFLOW',
    'THE SHUBENATOR',
    'DEATHMEGATRON',
  ]);
});
