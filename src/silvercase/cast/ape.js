import { Npc } from '../../bing/cast.js';
import { markSilverCaseActor } from './Actor.js';
import { APE_FACE_URL, APE_FAMILY_MEMBER } from '../../bing/family-ape.js';
import { CHARACTER_IDS } from '../../core/campaign.js';

/**
 * The Silver Case is the campaign's Pulp Fiction beat: plain black tailoring,
 * a clean white shirt front, and a straight black tie. This is a scene outfit,
 * not a second Ape. His height, build, head, hair, beard, skin and supplied
 * face still come from the canonical Family row below.
 *
 * The Family row now dresses him in an open canvas work vest and the silver
 * chain and watch (August 2026 wardrobe pass) — right on the club floor and
 * wrong here, because `dress: 'suit'` below spreads ON TOP of
 * `APE_FAMILY_MEMBER.model`, not in place of it. Left alone, a `frontPanel`
 * vest cut for a bare tee would lie over a suit jacket built by an entirely
 * different block, and the stark black-tailoring read this scene is going for
 * would grow a canvas layer and jewellery nobody asked for. So the overlay
 * turns them off explicitly, and this suit stays exactly what it was.
 */
export const SILVERCASE_APE_OUTFIT = Object.freeze({
  dress: 'suit',
  shirt: 0xf2efe7,
  shirtAccent: 0xf2efe7,
  jacketColour: 0x111116,
  trouserColour: 0x111116,
  tieColour: 0x09090c,
  pocketSquare: false,
  trim: true,
  trouserFit: 'creased',
  workVest: false,
  chain: false,
  watch: false,
});

/**
 * Ape, in The Silver Case — the same man who is on the Bada Bing floor, at the
 * pillar table in the Silver Room, and at the Initiation.
 *
 * The mission owns where he stands, what he does, and the black suit this job
 * calls for. It owns nothing about who he *is*: body scale, build, head, hair,
 * beard, skin, id and supplied face all come from `src/bing/family-ape.js`,
 * through the same figure builder (`makePerson`, via `Npc`) every other scene
 * uses. This module exists so the car and apartment share one suited Ape rather
 * than building two local lookalikes.
 *
 * This deliberately mirrors `src/silver/cast.js`'s `SILVER_APE_PRESENTATION` /
 * `identifySilverApe` pair, which is the pattern `tests/silver-ape-continuity`
 * already holds the Silver Room to.
 */
export const SILVERCASE_APE_PRESENTATION = Object.freeze({
  characterId: APE_FAMILY_MEMBER.id,
  photo: APE_FAMILY_MEMBER.photo,
  face: APE_FACE_URL,
  model: Object.freeze({
    ...APE_FAMILY_MEMBER.model,
    ...SILVERCASE_APE_OUTFIT,
    face: APE_FACE_URL,
  }),
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
 * on the way over. Identity and anatomy stay canonical; the outfit is the
 * scene-local overlay declared above.
 */
export function buildSilverCaseApe(parent, {
  x = 0, y = 0, z = 0, yaw = 0, job = 'stand', look = true, tier = 'hero',
  actorId = 'ape', posture,
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
  npc.group.userData.geometryGate = { assemblyId: 'silvercase.ape' };
  /* `actorId`, not the name, and the callers pass different ones: this mission
   * builds Ape twice -- at the wheel on the way over and in the corridor once
   * they are inside -- and both bodies exist in every built state. Named after
   * himself they were one id twice, which the staging gate reported as
   * ACTOR_ID_DUPLICATE in all six. */
  markSilverCaseActor(npc, { id: actorId, faction: 'friendly', posture });
  return identifySilverCaseApe(npc);
}
