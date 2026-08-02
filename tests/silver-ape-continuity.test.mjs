import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { FAMILY } from '../src/bing/family.js';
import { APE_FACE_URL, APE_FAMILY_MEMBER } from '../src/bing/family-ape.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import { identifySilverApe, SILVER_APE_PRESENTATION } from '../src/silver/cast.js';

test('Front and Center uses the canonical Bing FAMILY Ape model, face and id', async () => {
  const bingApe = FAMILY.find((member) => member.id === CHARACTER_IDS.APE);
  const faceIndex = JSON.parse(await readFile(
    new URL('../assets/faces/index.json', import.meta.url),
    'utf8',
  ));
  const faceBytes = await readFile(new URL('../assets/faces/ape.png', import.meta.url));

  assert.equal(bingApe, APE_FAMILY_MEMBER);
  assert.equal(SILVER_APE_PRESENTATION.characterId, CHARACTER_IDS.APE);
  assert.equal(SILVER_APE_PRESENTATION.photo, 'ape.png');
  assert.equal(SILVER_APE_PRESENTATION.face, APE_FACE_URL);
  assert.equal(SILVER_APE_PRESENTATION.face, 'assets/faces/ape.png');
  assert.ok(faceIndex.files.includes(SILVER_APE_PRESENTATION.photo));
  assert.ok(faceBytes.byteLength > 512, 'ape.png is missing or only a placeholder');
  assert.deepEqual(
    { ...SILVER_APE_PRESENTATION.model, face: undefined },
    { ...bingApe.model, face: undefined },
  );
});

test('Front and Center stamps Ape with the stable campaign identity', () => {
  const npc = { group: { userData: { npc: {} } } };

  assert.equal(identifySilverApe(npc), npc);
  assert.equal(npc.characterId, CHARACTER_IDS.APE);
  assert.equal(npc.familyMember, APE_FAMILY_MEMBER);
  assert.equal(npc.group.userData.npc.characterId, CHARACTER_IDS.APE);
  assert.equal(npc.group.userData.npc.family, true);
});
