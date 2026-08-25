/**
 * Lag, the cabin's one resident and its deliberately non-questy hint system.
 *
 * His body is the game's shared `Npc`/`makePerson` rig, including its outfit,
 * mouth and player-look behaviour. This module only adds cabin-specific work:
 * an axe, a split log, a forestry activity loop and the hint selection policy.
 */
import * as THREE from 'three';

import { Npc } from '../bing/cast.js';
import { FAMILY } from '../bing/family.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';
import { SPEECH_MIX, speak } from '../core/dialogue.js';
import { box, cylinder, group, mat } from '../world/build.js';

export const LAG_VOICE_PREFIX = 'vo.cabin.lag.';

function authoredLagLine(line) {
  return Object.freeze({
    ...line,
    cue: `${LAG_VOICE_PREFIX}${line.id}`,
    missing: Object.freeze([...(line.missing ?? [])]),
  });
}

const LAG_IDENTITY = getCharacter(CHARACTER_IDS.LAG);
const LAG_FAMILY_MEMBER = FAMILY.find(({ id }) => id === CHARACTER_IDS.LAG);
if (!LAG_IDENTITY || !LAG_FAMILY_MEMBER) {
  throw new Error('Cabin Lag requires the canonical character and Family records');
}

/**
 * Cabin behavior is scene-specific; Lag's body is not. Reuse the same
 * procedural appearance the Bada Bing roster owns so a second character
 * cannot silently grow under another scene-local outfit.
 */
export const LAG_MODEL = Object.freeze({
  ...LAG_FAMILY_MEMBER.model,
  role: LAG_IDENTITY.role,
});

export const LAG_ACTIVITY_LOOP = Object.freeze([
  Object.freeze({ id: 'chop', seconds: 5.2 }),
  Object.freeze({ id: 'stack', seconds: 3.8 }),
  Object.freeze({ id: 'lean', seconds: 5.0 }),
  Object.freeze({ id: 'idle', seconds: 3.2 }),
]);

const GENERAL_HINTS = Object.freeze([
  { id: 'general.arrival', kind: 'general', weight: 1, text: 'Well, look who finally made it out here.' },
  { id: 'general.quiet', kind: 'general', weight: 1, text: 'Hell of a lot quieter than the city, ain\'t it?' },
  { id: 'general.poke', kind: 'general', weight: 1, text: 'Don\'t just stand there. Go poke around.' },
  { id: 'general.more', kind: 'general', weight: 1, text: 'Place has got more to it than it looks.' },
].map(authoredLagLine));

const CABIN_HINTS = Object.freeze([
  { id: 'cabin.computer', kind: 'cabin', weight: 4, missing: ['computer'], text: 'Computer\'s inside if you\'re looking for something less outdoorsy.' },
  { id: 'cabin.computer.old', kind: 'cabin', weight: 3, missing: ['computer'], text: 'There\'s some old stuff in that cabin nobody\'s bothered throwing away.' },
  { id: 'cabin.board', kind: 'cabin', weight: 4, missing: ['drawing-board'], text: 'Drawing board\'s worth looking at.' },
  { id: 'cabin.board.odd', kind: 'cabin', weight: 3, missing: ['drawing-board'], text: 'If something looks outta place in there, it probably is.' },
  { id: 'cabin.bedroom', kind: 'cabin', weight: 4, missing: ['bedroom'], text: 'Check around the bedroom.' },
  { id: 'cabin.wardrobe', kind: 'cabin', weight: 2, missing: ['wardrobe'], text: 'Dry clothes are in the wardrobe. Push past the hangers and look proper.' },
  { id: 'cabin.entertainment', kind: 'cabin', weight: 2, missing: ['entertainment'], text: 'Radio and television both work. Reception\'s got opinions about the trees.' },
].map(authoredLagLine));

const PROPERTY_HINTS = Object.freeze([
  { id: 'property.trail', kind: 'property', weight: 4, missing: ['trailhead'], text: 'You see a trail, follow it.' },
  { id: 'property.bridge', kind: 'property', weight: 4, missing: ['bridge'], text: 'Bridge is worth walking across.' },
  { id: 'property.creek', kind: 'property', weight: 4, missing: ['creek'], text: 'Take a look down by the water.' },
  { id: 'property.shed', kind: 'property', weight: 3, missing: ['shed'], text: 'There\'s some spots back in those woods most people walk right past.' },
  { id: 'property.overlook', kind: 'property', weight: 4, missing: ['overlook'], text: 'Trail keeps going farther than you think.' },
  { id: 'property.firepit', kind: 'property', weight: 2, missing: ['firepit'], text: 'Whole reason for having a place like this is nobody knows what\'s out back.' },
].map(authoredLagLine));

const FLAVOR_HINTS = Object.freeze([
  { id: 'flavor.service', kind: 'flavor', weight: 1, text: 'Cell service gets weird past the bridge. That\'s a feature.' },
  { id: 'flavor.eyes', kind: 'flavor', weight: 1, text: 'If you see two eyes looking back at you, mind your business.' },
  { id: 'flavor.breaks', kind: 'flavor', weight: 1, text: 'Around here, if something breaks, you either fix it or learn to live without it.' },
  { id: 'flavor.dark', kind: 'flavor', weight: 1, text: 'Gets dark as hell out here.' },
].map(authoredLagLine));

const AFTER_HINTS = Object.freeze([
  { id: 'after.good', kind: 'after', weight: 2, minimum: 2, text: 'Find anything good?' },
  { id: 'after.more', kind: 'after', weight: 2, minimum: 3, text: 'You ain\'t seen all of it.' },
  { id: 'after.missed', kind: 'after', weight: 2, minimum: 4, text: 'There\'s still a couple places you missed.' },
  { id: 'after.no-spoil', kind: 'after', weight: 2, minimum: 5, text: 'I\'m not telling you exactly where it is. That ruins it.' },
].map(authoredLagLine));

export const LAG_CHOP_REACTIONS = Object.freeze([
  'There you go. Congratulations, you\'re almost useful.',
  'That one was ugly.',
  'Wood still split. Guess it counts.',
  'That\'ll burn.',
  'Keep that up, I might let you build the fire.',
]);

const ALL_HINTS = Object.freeze([
  ...GENERAL_HINTS,
  ...CABIN_HINTS,
  ...PROPERTY_HINTS,
  ...FLAVOR_HINTS,
  ...AFTER_HINTS,
]);

const CHOP_LINES = Object.freeze(LAG_CHOP_REACTIONS.map((text, index) => authoredLagLine({
  id: `wood.${index + 1}`,
  kind: 'wood',
  text,
  weight: 1,
})));

/**
 * Every subtitle Lag can put on screen, paired with the one exact recording
 * that owns those words. This is exported so the manifest gate can compare
 * source and production data in both directions instead of trusting a bank
 * prefix or a hand-maintained count.
 */
export const LAG_DIALOGUE_CATALOG = Object.freeze([...ALL_HINTS, ...CHOP_LINES]);

/**
 * Route one authored Lag line through the shared dialogue/receipt pipeline.
 * There is deliberately no kind-level bank and no substitute cue: strict QA
 * requires this exact cue's decoded buffer, while normal play retains the
 * engine's usual subtitle-first behavior while production is outstanding.
 */
export function speakLagLine(audio, line, {
  speaker = null,
  mix = SPEECH_MIX,
} = {}) {
  if (!line?.ok || !line.cue || !line.text) return null;
  return speak(audio, line.cue, {
    speaker,
    speakerId: LAG_IDENTITY.id,
    mix,
    subtitle: line.text,
    requiredRecorded: true,
  });
}

function finiteNow(value) {
  return Number.isFinite(value) ? value : 0;
}

function lineSeconds(text) {
  return THREE.MathUtils.clamp(1.25 + text.length * 0.052, 2.4, 5.8);
}

function selectWeighted(candidates, random, previousId = null) {
  const withoutRepeat = candidates.length > 1
    ? candidates.filter((entry) => entry.id !== previousId)
    : candidates;
  const pool = withoutRepeat.length ? withoutRepeat : candidates;
  const total = pool.reduce((sum, entry) => sum + Math.max(0, entry.weight ?? 1), 0);
  if (!pool.length || total <= 0) return null;
  let cursor = Math.min(0.999999999, Math.max(0, Number(random?.()) || 0)) * total;
  for (const entry of pool) {
    cursor -= Math.max(0, entry.weight ?? 1);
    if (cursor < 0) return entry;
  }
  return pool.at(-1);
}

/**
 * Explicit-talk-only, discovery-aware dialogue. Calling `discover` never
 * emits a line; only `talk` can speak, and it enforces a real cooldown.
 */
export function createLagHintDirector({
  random = Math.random,
  cooldownSeconds = 7.5,
  chopCooldownSeconds = 9,
} = {}) {
  const discovered = new Set();
  let lastSpokenAt = -Infinity;
  let lastHintId = null;
  let lastChopId = null;

  const sync = (values) => {
    for (const value of values ?? []) {
      if (typeof value === 'string' && value) discovered.add(value);
    }
  };

  const eligible = () => ALL_HINTS.filter((hint) => {
    if ((hint.minimum ?? 0) > discovered.size) return false;
    return hint.missing.every((id) => !discovered.has(id));
  });

  return Object.freeze({
    discover(id) {
      const before = discovered.size;
      sync([id]);
      return discovered.size !== before;
    },
    hasDiscovered: (id) => discovered.has(id),
    canTalk(now = 0) {
      return finiteNow(now) - lastSpokenAt >= Math.max(0, cooldownSeconds);
    },
    talk({ now = 0, discoveries = [] } = {}) {
      sync(discoveries);
      const at = finiteNow(now);
      const remaining = Math.max(0, cooldownSeconds - (at - lastSpokenAt));
      if (remaining > 0) return Object.freeze({ ok: false, reason: 'cooldown', remaining });
      const hint = selectWeighted(eligible(), random, lastHintId);
      if (!hint) return Object.freeze({ ok: false, reason: 'empty', remaining: 0 });
      lastSpokenAt = at;
      lastHintId = hint.id;
      return Object.freeze({
        ok: true,
        id: hint.id,
        cue: hint.cue,
        kind: hint.kind,
        text: hint.text,
        seconds: lineSeconds(hint.text),
      });
    },
    reactToChop({ now = 0 } = {}) {
      const at = finiteNow(now);
      const remaining = Math.max(0, chopCooldownSeconds - (at - lastSpokenAt));
      if (remaining > 0) return Object.freeze({ ok: false, reason: 'cooldown', remaining });
      const line = selectWeighted(CHOP_LINES, random, lastChopId);
      lastSpokenAt = at;
      lastChopId = line.id;
      return Object.freeze({
        ok: true,
        id: line.id,
        cue: line.cue,
        kind: line.kind,
        text: line.text,
        seconds: lineSeconds(line.text),
      });
    },
    debug: Object.freeze({
      get discovered() { return Object.freeze([...discovered]); },
      get eligible() { return Object.freeze(eligible().map((hint) => hint.id)); },
      get lastHintId() { return lastHintId; },
    }),
  });
}

function makeAxe() {
  const axe = group('cabin-lag-axe');
  const handle = mat({ color: 0x8b6034, roughness: 0.94 });
  const steel = mat({ color: 0x4c5153, roughness: 0.42, metalness: 0.58 });
  axe.add(cylinder({ r: 0.024, h: 0.88, pos: [0, 0.28, 0], mat: handle }));
  axe.add(box({
    name: 'cabin-lag-axe-head',
    size: [0.095, 0.22, 0.31],
    pos: [0, 0.72, 0.03],
    mat: steel,
    rotZ: 0.04,
  }));
  axe.rotation.z = -0.08;
  return axe;
}

function makeSplitLog() {
  const log = group('cabin-lag-carried-log');
  const bark = mat({ color: 0x49301d, roughness: 1 });
  log.add(cylinder({ r: 0.11, h: 0.52, pos: [0, 0, 0], rotZ: Math.PI / 2, mat: bark }));
  log.position.set(0.22, -0.02, 0.12);
  log.rotation.z = 0.18;
  log.visible = false;
  return log;
}

function activityAt(elapsed) {
  const length = LAG_ACTIVITY_LOOP.reduce((sum, entry) => sum + entry.seconds, 0);
  let cursor = ((elapsed % length) + length) % length;
  for (const activity of LAG_ACTIVITY_LOOP) {
    if (cursor < activity.seconds) return { activity, progress: cursor / activity.seconds };
    cursor -= activity.seconds;
  }
  return { activity: LAG_ACTIVITY_LOOP[0], progress: 0 };
}

function resetPose(parts) {
  parts.body.rotation.x = 0;
  parts.body.rotation.z = 0;
  parts.body.position.x = 0;
  parts.body.position.z = 0;
  for (const limb of [parts.armL, parts.armR, parts.foreL, parts.foreR, parts.legL, parts.legR]) {
    limb.rotation.set(0, 0, 0);
  }
}

/** Build the real diegetic actor. No dialogue fires from `update`. */
export function buildLagActor({ scene, x, y, z, yaw = Math.PI } = {}) {
  if (!scene?.add) throw new TypeError('Lag requires a scene parent');
  const npc = new Npc(scene, {
    name: LAG_IDENTITY.canonicalName,
    actorId: 'cabin.lag',
    tier: 'hero',
    x,
    y,
    z,
    yaw,
    job: 'stand',
    look: true,
    model: LAG_MODEL,
  });
  npc.characterId = LAG_IDENTITY.id;
  npc.familyMember = LAG_FAMILY_MEMBER;
  npc.group.userData.npc.characterId = LAG_IDENTITY.id;
  npc.group.userData.npc.family = true;
  npc.group.name = 'cabin-lag';
  npc.group.userData.cabinResident = 'lag';
  const axe = makeAxe();
  const carriedLog = makeSplitLog();
  npc.parts.handR.add(axe);
  npc.parts.handL.add(carriedLog);

  let elapsed = 0;
  let talkRemaining = 0;
  let currentActivity = 'chop';
  let returningHome = false;

  const applyWorkPose = (id, progress) => {
    resetPose(npc.parts);
    axe.visible = id !== 'stack';
    carriedLog.visible = id === 'stack';
    if (id === 'chop') {
      const stroke = (progress * 3.25) % 1;
      const windup = stroke < 0.58
        ? THREE.MathUtils.smoothstep(stroke / 0.58, 0, 1)
        : 1;
      const strike = stroke < 0.58
        ? 0
        : THREE.MathUtils.smoothstep((stroke - 0.58) / 0.42, 0, 1);
      const arm = THREE.MathUtils.lerp(-1.10, -2.42, windup)
        + THREE.MathUtils.lerp(0, 2.74, strike);
      npc.parts.armL.rotation.set(arm + 0.06, 0, -0.10);
      npc.parts.armR.rotation.set(arm, 0, 0.10);
      npc.parts.foreL.rotation.x = -0.22;
      npc.parts.foreR.rotation.x = -0.20;
      npc.parts.body.rotation.x = strike * 0.26;
      npc.parts.legL.rotation.x = -strike * 0.08;
      npc.parts.legR.rotation.x = strike * 0.08;
    } else if (id === 'stack') {
      const carry = Math.sin(progress * Math.PI);
      npc.parts.armL.rotation.set(-0.92 - carry * 0.18, 0, -0.13);
      npc.parts.armR.rotation.set(-0.90 - carry * 0.18, 0, 0.13);
      npc.parts.foreL.rotation.x = -1.12;
      npc.parts.foreR.rotation.x = -1.12;
      npc.parts.body.rotation.x = 0.08 + carry * 0.05;
      npc.parts.body.position.z = carry * 0.05;
    } else if (id === 'lean') {
      npc.parts.body.rotation.z = -0.045;
      npc.parts.armR.rotation.set(-0.20, 0, 0.08);
      npc.parts.foreR.rotation.x = -0.34;
      npc.parts.armL.rotation.set(-0.34, 0, -0.12);
      npc.parts.foreL.rotation.x = -0.62;
      axe.rotation.z = -0.18;
    } else {
      npc.parts.armL.rotation.x = Math.sin(elapsed * 0.55) * 0.035;
      npc.parts.armR.rotation.x = -0.10;
      npc.parts.foreR.rotation.x = -0.28;
      axe.rotation.z = -0.10;
    }
  };

  return Object.freeze({
    npc,
    group: npc.group,
    axe,
    carriedLog,
    speakTo(playerPosition, seconds = 2, take = null) {
      if (playerPosition) npc.faceToward(playerPosition.x, playerPosition.z, true);
      talkRemaining = Math.max(0.5, Number(seconds) || 2);
      returningHome = false;
      npc.say(talkRemaining, take);
      return talkRemaining;
    },
    update(dt = 0, playerPosition = null) {
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      elapsed += step;
      npc.update(step, playerPosition);
      if (talkRemaining > 0) {
        talkRemaining = Math.max(0, talkRemaining - step);
        currentActivity = 'talk';
        applyWorkPose('lean', 0.5);
        if (talkRemaining === 0) returningHome = true;
      } else {
        const at = activityAt(elapsed);
        currentActivity = at.activity.id;
        applyWorkPose(currentActivity, at.progress);
        if (returningHome) {
          npc.targetYaw = npc.homeYaw;
          returningHome = false;
        }
      }
      return currentActivity;
    },
    debug: Object.freeze({
      get activity() { return currentActivity; },
      get elapsed() { return elapsed; },
      activityAt: (time) => activityAt(time).activity.id,
    }),
  });
}
