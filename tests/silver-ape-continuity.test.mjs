import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { FAMILY } from '../src/bing/family.js';
import {
  APE_FACE_URL,
  APE_FAMILY_MEMBER,
  APE_SILVER_ROOM,
} from '../src/bing/family-ape.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';
import { identifySilverApe, SILVER_APE_PRESENTATION } from '../src/silver/cast.js';

test('Front and Center keeps canonical Ape identity and body in the exact Silver Room suit', async () => {
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
  assert.equal(SILVER_APE_PRESENTATION.model, APE_SILVER_ROOM);
  assert.equal(APE_SILVER_ROOM.face, APE_FACE_URL);
  for (const field of ['height', 'build', 'hair', 'hairColour', 'beard', 'skin']) {
    assert.equal(APE_SILVER_ROOM[field], bingApe.model[field], field);
  }

  assert.equal(APE_SILVER_ROOM.dress, 'suit');
  assert.equal(APE_SILVER_ROOM.shirt, 0x111317, 'black open-collar shirt');
  assert.equal(APE_SILVER_ROOM.shirtAccent, 0x111317, 'black shirt accent');
  assert.equal(APE_SILVER_ROOM.jacketColour, 0x30352d, 'charcoal-olive jacket');
  assert.equal(APE_SILVER_ROOM.trouserColour, 0x111214, 'black trousers');
  assert.equal(APE_SILVER_ROOM.tie, false);
  assert.equal(APE_SILVER_ROOM.workVest, false);
  assert.equal(APE_SILVER_ROOM.chain, 'silver');
  assert.equal(APE_SILVER_ROOM.watch, 'silver');
});

test('Front and Center stamps Ape with the stable campaign identity', () => {
  const npc = { group: { userData: { npc: {} } } };

  assert.equal(identifySilverApe(npc), npc);
  assert.equal(npc.characterId, CHARACTER_IDS.APE);
  assert.equal(npc.familyMember, APE_FAMILY_MEMBER);
  assert.equal(npc.group.userData.npc.characterId, CHARACTER_IDS.APE);
  assert.equal(npc.group.userData.npc.family, true);
});
