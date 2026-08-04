import { Npc } from '../../bing/cast.js';
import { APE_FACE_URL, APE_FAMILY_MEMBER } from '../../bing/family-ape.js';
import { CHARACTER_IDS } from '../../core/campaign.js';

/**
 * Ape, in The Silver Case — the same man who is on the Bada Bing floor, at the
 * pillar table in the Silver Room, and at the Initiation.
 *
 * The mission owns where he stands and what he does. It owns nothing about
 * what he *is*: the body, the clothes, the build, the beard and the supplied
 * face all come from `src/bing/family-ape.js`, through the same figure builder
 * (`makePerson`, via `Npc`) every other scene that hosts him uses. This module
 * exists so there is exactly one call site in this mission that knows how to
 * build him, shared by the car ride and the apartment, rather than two local
 * lookalikes drifting apart.
 *
 * This deliberately mirrors `src/silver/cast.js`'s `SILVER_APE_PRESENTATION` /
 * `identifySilverApe` pair, which is the pattern `tests/silver-ape-continuity`
 * already holds the Silver Room to.
 */
export const SILVERCASE_APE_PRESENTATION = Object.freeze({
  characterId: APE_FAMILY_MEMBER.id,
  photo: APE_FAMILY_MEMBER.photo,
  face: APE_FACE_URL,
  model: Object.freeze({ ...APE_FAMILY_MEMBER.model, face: APE_FACE_URL }),
});

/** Stamp the stable story identity onto a scene-local NPC wrapper. */
export function identifySilverCaseApe(npc) {
  npc.characterId = CHARACTER_IDS.APE;
  npc.familyMember = APE_FAMILY_MEMBER;
  npc.group.userData.npc.characterId = CHARACTER_IDS.APE;
  npc.group.userData.npc.family = true;
  return npc;
}

/**
 * Build Ape into `parent` at a given spot.
 *
 * `job` is an `Npc` job — `'stand'` in the apartment, `'sit'` behind the wheel
 * on the way over. Everything else about the figure is the canonical row.
 */
export function buildSilverCaseApe(parent, {
  x = 0, y = 0, z = 0, yaw = 0, job = 'stand', look = true, tier = 'hero',
} = {}) {
  const npc = new Npc(parent, {
    name: APE_FAMILY_MEMBER.name,
    tier,
    job,
    look,
    x,
    y,
    z,
    yaw,
    model: { ...SILVERCASE_APE_PRESENTATION.model, castShadow: true },
  });
  return identifySilverCaseApe(npc);
}
