export const HOTDOG_PREVIEW_CHECKPOINTS = Object.freeze([
  'party',
  'attack',
  'cleanup',
  'graveyard',
]);

function requireParty(party) {
  if (
    !party?.byId
    || !party?.extra?.hotdog
    || !party?.cleanup
    || !Array.isArray(party.all)
  ) {
    throw new Error('HotDog preview staging requires the complete party geometry');
  }
  return party;
}

function actor(party, key) {
  const value = party.byId[key] ?? party.extra[key];
  if (!value?.group) throw new Error(`HotDog party is missing actor "${key}"`);
  return value;
}

function pose(npc, x, z, job = 'work', yaw = 0, y = 0) {
  npc.route = null;
  npc.job = job;
  npc.baseY = y;
  npc._syncJob?.(true);
  npc.group.position.x = x;
  npc.group.position.z = z;
  npc.group.rotation.set(0, yaw, 0);
}

export function poseHotDogAttackGeometry(partyInput) {
  const party = requireParty(partyInput);
  const hotdog = actor(party, 'hotdog');
  const ape = actor(party, 'ape');
  pose(ape, -14.9, -0.25, 'stand', 0);
  pose(hotdog, -15.8, -0.45, 'stand', 0);
  ape.faceToward(hotdog.position.x, hotdog.position.z, true);
  hotdog.faceToward(ape.position.x, ape.position.z, true);

  const lookAway = new Set([
    party.byId.gratin,
    party.byId.old_stove,
    party.byId.lag,
  ].filter(Boolean));
  for (const npc of party.all) {
    if (npc === ape || npc === hotdog) continue;
    if (lookAway.has(npc)) {
      npc.faceToward(npc.position.x * 2 - hotdog.position.x, npc.position.z * 2 - hotdog.position.z);
    } else {
      npc.faceToward(hotdog.position.x, hotdog.position.z);
    }
  }
  return party;
}

export function poseHotDogResolvedAttackGeometry(partyInput) {
  const party = requireParty(partyInput);
  const hotdog = actor(party, 'hotdog');
  const ape = actor(party, 'ape');
  // Leave the collapsed body in the confrontation aisle rather than
  // rotating it through the nearest two-top.
  pose(hotdog, -15.8, 0.8, 'stand', 1.3, 0.25);
  hotdog.group.rotation.z = -1.34;
  pose(ape, -14.9, -0.25, 'stand', -1.6);
  party.cleanup.blood.visible = true;
  party.cleanup.brokenStool.visible = true;
  return party;
}

export function poseHotDogCleanupRolesGeometry(partyInput) {
  const party = requireParty(partyInput);
  pose(actor(party, 'ape'), 4.25, -4.5, 'sit', -Math.PI / 2);
  const deathmegatron = actor(party, 'deathmegatron');
  pose(deathmegatron, 3.25, -3.7, 'stand', -Math.PI / 2);
  deathmegatron.folded = true;
  pose(actor(party, 'rippinflow'), -16.8, 1.15, 'stand', 2.5);
  pose(actor(party, 'numbskull'), -17.65, -2.15, 'stand', 0.65);
  // Work from the open gaps around the permanent furniture. These poses are
  // shared by runtime previews and the headless gate.
  pose(actor(party, 'aubbie'), -18.25, 0.65, 'work', 1.45);
  pose(actor(party, 'booski'), -18.2, 1.9, 'work', Math.PI / 2);
  pose(actor(party, 'hogmama'), -2.4, 5.8, 'work', -2.8);
  pose(actor(party, 'gratin'), -1.5, 5.8, 'work', 2.8);
  pose(actor(party, 'shubenator'), -5.6, -7.75, 'work', 0);
  pose(actor(party, 'snow'), 6.45, -8.2, 'stand', Math.PI);
  pose(actor(party, 'sauce'), -3.6, 4.7, 'work', -2.6);
  actor(party, 'eric').group.visible = false;
  return party;
}

export function showHotDogCleanupGuidesGeometry(partyInput) {
  const party = requireParty(partyInput);
  for (const marker of Object.values(party.cleanup.evidenceMarkers)) marker.visible = true;
  return party;
}

export function stageHotDogCheckpointGeometry(checkpoint, partyInput) {
  if (!HOTDOG_PREVIEW_CHECKPOINTS.includes(checkpoint)) {
    throw new Error(`Unknown HotDog preview checkpoint "${checkpoint}"`);
  }
  const party = requireParty(partyInput);
  if (checkpoint === 'party') return party;
  if (checkpoint === 'attack') return poseHotDogAttackGeometry(party);

  poseHotDogResolvedAttackGeometry(party);
  poseHotDogCleanupRolesGeometry(party);
  showHotDogCleanupGuidesGeometry(party);
  party.stage.setSpotlight(false);
  if (checkpoint === 'cleanup') return party;

  party.extra.hotdog.group.visible = false;
  party.cleanup.wrap.visible = false;
  party.cleanup.serviceGuide.visible = false;
  return party;
}
