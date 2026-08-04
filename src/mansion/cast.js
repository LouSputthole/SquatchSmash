/**
 * WHO IS ACTUALLY IN LOU'S HOUSE.
 *
 * Owner playtest, 2026-08-04, verbatim: *"None of the characters are here."*
 * He was right — the mansion built its grounds, its rooms, its guns and a
 * whole secret laboratory, and then put nobody in any of it. This module is
 * the people.
 *
 *   - a man on the front door who stops you before the top step;
 *   - six of Lou's security: three walking the ground outside, one at the top
 *     of the horseshoe stair looking out over the front doors, one downstairs
 *     past the armory, one standing on the open vault;
 *   - the Bada Bing's bartender, working the bar in the billiard bay;
 *   - Snow and his cart, cleaning near the entrance;
 *   - Gratin, in the interrogation area, running what is going on down there,
 *     with the offer of a turn.
 *
 * ## What this file does NOT own
 *
 * The **writing** is `./script.js`, in PROJECT SILENT SQUATCH's own `SEQUENCES`
 * block, played through the mission's own `DialogueController`. Not one line is
 * typed at a call site here.
 *
 * The **bodies** are `src/core/wardrobe.js` — including the two new ones this
 * scene needed (`MANSION_DOOR_MAN`, `MANSION_GUARDS`) and the bartender, whose
 * model moved there out of `src/bing/cast.js` so that the man behind Lou's bar
 * is the same man who is behind the Bing's. Nothing here restates a height, a
 * build or a garment.
 *
 * The **whip** is `src/bing/license-to-grill-runtime.js` — the actual cord
 * Gratin hands over in LICENSE TO GRILL, its actual pose function, its actual
 * swing timing and its actual four cues. The mansion gets one swing out of it
 * rather than a second whip.
 *
 * The **house** is `./scenes/`. This module reads anchors and stands people on
 * them; it builds no architecture, moves no wall and touches no collider.
 *
 * ## Two rules that are not negotiable
 *
 * 1. **SNOW IS NEVER A TARGET.** He is not in a hostile list, a damage path or
 *    an aim resolver, because this module has none of those things: it owns
 *    bodies, barks and one authored, scripted swing that can only ever land on
 *    the man already hanging from the ceiling. There is no code path here by
 *    which any weapon in the house can be pointed at anybody. Standing owner
 *    rule; the way it is kept is by not building the machinery.
 * 2. **BIG UNCLE LOU IS `lou1`.** Captain Lou Sasole is `lou2` and is a
 *    different man. Neither of them is in this file — but the casting table it
 *    reads from (`SPEAKERS`) holds that line and nothing here goes around it.
 *
 * ## Doctrine
 *
 * docs/TONE-AND-PARODY.md. A mob boss's house with a man on the door, men on
 * the grounds, a man on the vault and a man in the basement doing what is being
 * done in the basement is not a joke the scene is telling. It is the house,
 * played completely straight, and it is what makes the rest of the night land.
 * Every bark below is one flat sentence from somebody who is at work.
 */
import * as THREE from 'three';
import { Npc } from '../bing/cast.js';
import {
  SWING_LANDS_AT, SWING_SECONDS, makeCord, poseCord,
} from '../bing/license-to-grill-runtime.js';
import {
  BADA_BING_BARTENDER, GRATIN, MANSION_DOOR_MAN, MANSION_GUARDS, SNOW,
} from '../core/wardrobe.js';
import { box, cylinder, group, mat } from '../world/build.js';
import { DialogueController } from './mission/DialogueController.js';
import { createMissionHud } from './mission/hud.js';
import { INSTRUCTIONS, SEQUENCES } from './script.js';

/* ================================================================== */
/* THE THREE FLOOR HEIGHTS, AS A FALLBACK ONLY                          */
/*                                                                       */
/* `opts.anchors` is authoritative and every post below reads it first.   */
/* These are what `MansionGrounds.js` resolves those anchors to today,    */
/* written out rather than imported for one reason: importing that module */
/* builds canvas textures at module scope, which drags a WebGL-shaped     */
/* dependency into anything that merely wants to know where people stand  */
/* -- including `npm test`. A number that has drifted puts a man a few     */
/* centimetres off a floor he is standing on; an import that cannot run    */
/* headless takes the whole module with it.                               */
/* ================================================================== */
/** The podium the house stands on. */
const GROUND_Y = 1.2;
/** The gallery, the bedrooms and Lou's office. */
const UPPER_Y = 6.0;
/** The armory and the lower level. */
const BASEMENT_Y = -2.8;

/* ================================================================== */
/* WHERE PEOPLE STAND                                                   */
/*                                                                       */
/* Every post below prefers the house's own published anchor and falls   */
/* back to the literal it resolves to today, so this module keeps        */
/* working while the two scene files are being edited beside it and      */
/* stops guessing the moment they hand it a better number.               */
/* ================================================================== */

/** yaw that points a figure at (x, z). makePerson faces +Z at yaw 0. */
function yawToward(fromX, fromZ, atX, atZ) {
  return Math.atan2(atX - fromX, atZ - fromZ);
}

/**
 * The perimeter beats.
 *
 * Owner: *"some patrol the permiter (walking around outside...)"*. All three
 * loops are in the open ground between the gate and the front steps, which is
 * the only outside ground the player actually crosses — a patrol nobody ever
 * meets is a patrol that is not in the game. They are clear of the fountain
 * basin (r 6 at z 27), of the front steps (x ±6, z 34–35.5), of the building
 * (z 36), of the west wing (x −24.6, z 40.6) and of the billiard bay (x 20.6,
 * z 41). A waypoint that ends up behind a parked car is skipped by the Npc's
 * own nav probe rather than walked through.
 */
const PATROL_ROUTES = Object.freeze([
  /* The turnaround itself, round the fountain. The man you meet first. */
  Object.freeze([
    { x: -10, z: 33.5 }, { x: -10, z: 19 }, { x: 10, z: 19 }, { x: 10, z: 33.5 },
  ]),
  /* The west lawn, out to the tree line. */
  Object.freeze([
    { x: -14, z: 33.5 }, { x: -27, z: 33.5 }, { x: -27, z: 19 }, { x: -14, z: 19 },
  ]),
  /* The east lawn, out toward the service road. */
  Object.freeze([
    { x: 14, z: 33.5 }, { x: 27, z: 33.5 }, { x: 27, z: 19 }, { x: 14, z: 19 },
  ]),
]);

/** How near somebody has to be before he says his line. */
const BARK_RANGE = 5.0;
/** And how long you have to stand there before he says the other one. */
const IDLE_SECONDS = 7.0;
/** How near the gate man has to be before he stops you. Wider: he is meant to
 * get the line out before you are on his step, not after. */
const GATE_RANGE = 8.0;

/* ================================================================== */
/* SNOW'S CART                                                          */
/*                                                                       */
/* Owner: "Snow, with his janitor cart, cleaning near the entrance, so   */
/* he can get that funny line he has in." The line is already written    */
/* (SEQUENCES.snowFoyer, "Try not to make more work for me tonight."),   */
/* and the mission already fires it on the foyer zone — it just had      */
/* nobody to come out of. This is the man and his cart.                  */
/*                                                                       */
/* An industrial cleanup cart, the one Booski tells him to bring later:  */
/* a yellow mop bucket with a wringer on it, a shelf of bottles, a bin   */
/* liner on a hoop, and the mop itself standing in the bucket.           */
/* ================================================================== */
const M_CART_YELLOW = mat({ color: 0xc9a11e, roughness: 0.7 });
const M_CART_GREY = mat({ color: 0x4a4e55, roughness: 0.6, metalness: 0.35 });
const M_CART_WATER = mat({
  color: 0x6f7d6a, roughness: 0.16, metalness: 0.05, transparent: true, opacity: 0.75,
});
const M_CART_HANDLE = mat({ color: 0x8a7a5a, roughness: 0.9 });
const M_CART_HEAD = mat({ color: 0xd8d2c4, roughness: 0.98 });
const M_CART_BAG = mat({ color: 0x22242a, roughness: 0.95 });

/** The cart, at the origin of its own group so the caller only picks a spot. */
function makeJanitorCart() {
  const g = group('mansion.janitorCart');

  /* The bucket: a yellow tub on four castors with a press wringer bolted to
   * the top of it, which is the shape everybody recognises. */
  g.add(box({ size: [0.52, 0.34, 0.72], pos: [0, 0.25, 0], mat: M_CART_YELLOW, name: 'mop-bucket' }));
  g.add(box({ size: [0.44, 0.02, 0.62], pos: [0, 0.38, 0], mat: M_CART_WATER, cast: false }));
  g.add(box({ size: [0.46, 0.26, 0.2], pos: [0, 0.55, 0.28], mat: M_CART_YELLOW, name: 'wringer' }));
  g.add(cylinder({ r: 0.018, h: 0.46, pos: [0, 0.76, 0.36], mat: M_CART_GREY, rotX: 0.42 }));
  for (const [cx, cz] of [[-0.2, -0.3], [0.2, -0.3], [-0.2, 0.3], [0.2, 0.3]]) {
    g.add(cylinder({ r: 0.05, h: 0.04, pos: [cx, 0.05, cz], mat: M_CART_GREY, rotZ: Math.PI / 2 }));
  }

  /* The mop, standing in it. */
  g.add(cylinder({ r: 0.017, h: 1.42, pos: [0.14, 1.02, -0.16], mat: M_CART_HANDLE, rotZ: -0.12 }));
  g.add(cylinder({
    rTop: 0.055, rBottom: 0.1, h: 0.3, pos: [0.22, 0.42, -0.16], mat: M_CART_HEAD, rotZ: -0.12,
  }));

  /* The trolley half: a frame, a shelf of bottles, and a sack on a hoop. */
  const frame = group('cart-frame');
  frame.position.set(-0.72, 0, 0);
  g.add(frame);
  for (const fx of [-0.22, 0.22]) {
    frame.add(cylinder({ r: 0.016, h: 1.0, pos: [fx, 0.5, -0.24], mat: M_CART_GREY }));
    frame.add(cylinder({ r: 0.016, h: 1.0, pos: [fx, 0.5, 0.24], mat: M_CART_GREY }));
  }
  frame.add(box({ size: [0.5, 0.03, 0.52], pos: [0, 0.62, 0], mat: M_CART_GREY, name: 'cart-shelf' }));
  frame.add(cylinder({ r: 0.018, h: 0.5, pos: [0, 1.0, -0.24], mat: M_CART_GREY, rotZ: Math.PI / 2 }));
  for (let i = 0; i < 4; i++) {
    frame.add(cylinder({
      rTop: 0.032, rBottom: 0.038, h: 0.24,
      pos: [-0.16 + i * 0.11, 0.75, -0.06], mat: M_CART_GREY,
    }));
  }
  /* The liner hoop, and the sack in it. Nothing in the sack. Yet. */
  frame.add(cylinder({ r: 0.2, h: 0.02, pos: [0, 0.86, 0.2], mat: M_CART_GREY }));
  frame.add(cylinder({ rTop: 0.19, rBottom: 0.13, h: 0.5, pos: [0, 0.6, 0.2], mat: M_CART_BAG }));
  for (const [cx, cz] of [[-0.2, -0.24], [0.2, -0.24], [-0.2, 0.24], [0.2, 0.24]]) {
    frame.add(cylinder({ r: 0.045, h: 0.035, pos: [cx, 0.045, cz], mat: M_CART_GREY, rotZ: Math.PI / 2 }));
  }
  return g;
}

/* ================================================================== */
/* THE MOUNT                                                            */
/* ================================================================== */

/**
 * Put everybody in the house.
 *
 * @param {THREE.Scene} scene  the merged mansion scene
 * @param {object} world       `{ colliders, groundAt }` — only `colliders` is
 *   read, and only so that a patrolling man walks round the furniture instead
 *   of through it.
 * @param {object} [opts]
 *   - `interaction`  the scene's `InteractionSystem`. Each person is registered
 *     ONCE, on his own group. (`register` writes `userData.interact`, so a
 *     second registration REPLACES the first — nothing here registers twice,
 *     and nothing here touches a mesh the environment or the mission owns.)
 *   - `camera`       needed for the cord view-model; without it the swing still
 *     resolves and still plays its lines, it just has nothing to hang the whip
 *     off, which is the same allowance the club's own headless harness makes.
 *   - `player`       read for its `.position`; falls back to the camera.
 *   - `audio`        `AudioEngine`. Optional: with no engine everything is
 *     silent-with-a-subtitle, which is this game's own convention.
 *   - `campaign`     accepted for signature compatibility with the rest of the
 *     scene's mounts and deliberately NOT written to. The cast is the house
 *     being populated, not an event in the story; PROJECT SILENT SQUATCH owns
 *     the save (see `createSilentSquatchStory`) and two writers on one save is
 *     how a night gets recorded twice.
 *   - `anchors`      the house's merged anchor table (`grounds` + `interior`).
 *   - `lab`          the laboratory handle, for the interrogation area. With no
 *     laboratory in the house there is no interrogation area, so there is no
 *     Gratin and no swing, and everybody upstairs is unaffected.
 *   - `hasCase`      `() => boolean`: are the Prospect's hands full right now.
 *     The mission is the only thing that knows — pass
 *     `() => silentSquatch.mission.caseState === 'carried'`. Without it the man
 *     on the door simply sends you in, which is what he does in a house with no
 *     job running in it.
 *   - `hud`          something with `showLine`/`hideLine`/`setInstruction`.
 *     Pass the mission's own HUD to share one subtitle bar with it; omit and a
 *     private one is built.
 *   - `enabled`      `() => boolean`, the scene's own running gate.
 */
export function mountMansionCast(scene, world = {}, {
  interaction = null,
  camera = null,
  player = null,
  audio = null,
  campaign = null,
  anchors = null,
  lab = null,
  hud = null,
  hasCase = null,
  enabled = () => true,
} = {}) {
  if (!scene) return null;

  const colliders = world?.colliders ?? null;
  /* Share the mission's subtitle bar when there is one, build a private one
   * when there is not, and have neither in a headless harness -- everything
   * below already treats the screen as optional, because an AudioEngine with
   * no recordings is the same shape of problem. */
  const ownHud = (!hud && typeof document !== 'undefined') ? createMissionHud() : null;
  const screen = hud ?? ownHud;

  /* One controller for the whole cast. A bark that lands while somebody else
   * is mid-sentence is INTERJECTED rather than queued behind him, so walking
   * past two men does not produce a conversation neither of them is having. */
  const dialogue = new DialogueController({
    onLine: (line) => {
      screen?.showLine?.(line);
      speakerFor(line.speaker)?.say?.(Math.max(1.2, line.hold ?? 2));
    },
    onLineEnd: () => screen?.hideLine?.(),
    onStage: (stageName) => { stages.push(stageName); },
    playCue: (cue) => {
      /* Cue names are data, never a literal at a call site: none of this
       * scene's voice cues have recordings yet, so this is silence plus a
       * subtitle until they land and needs no code change when they do. */
      if (cue && audio?.hasSample?.(cue)) audio.play(cue);
    },
  });
  const stages = [];

  /* ---------------------------------------------------------------- */
  /* The people                                                        */
  /* ---------------------------------------------------------------- */
  const people = {};
  const posts = [];

  const at = (name, fallback) => {
    const a = anchors?.[name];
    return a && Number.isFinite(a.x) ? { x: a.x, y: a.y ?? fallback.y, z: a.z } : fallback;
  };

  /**
   * Stand somebody somewhere and give him his lines.
   *
   * `bark` fires once, when the player first comes within `range`. `idle` fires
   * once more if he is still standing there `IDLE_SECONDS` later and nobody
   * else is mid-sentence. That is the whole behavioural budget for a man whose
   * job is to be in a doorway.
   *
   * `onArrive`/`onLeave` are for the one man whose approach is an exchange
   * rather than a bark — Gratin. They are hooks rather than an `if (id ===
   * 'gratin')` in the loop, because the loop should not know who anybody is.
   */
  function post(id, {
    model, name, x, y = 0, z, yaw = 0, job = 'stand', folded = false,
    route = null, speed = 1.0, tier = 'hero',
    bark = null, idle = null, range = BARK_RANGE, look = null, onUse = null,
    onArrive = null, onLeave = null,
  }) {
    const npc = new Npc(scene, {
      name, tier, job, x, y, z, yaw, route, speed, model, colliders,
    });
    npc.folded = folded;
    people[id] = npc;
    posts.push({
      id, npc, bark, idle, range, onArrive, onLeave, near: 0, said: false, saidIdle: false,
    });
    if (interaction && (look || onUse)) {
      /* ONE registration per body, on the body. `interaction.register` writes
       * `userData.interact`, so a second registration on the same object would
       * REPLACE this handler rather than add one — nothing in this module ever
       * registers a mesh twice, and nothing here touches a mesh the house or
       * the mission already owns. */
      interaction.register(npc.group, {
        label: look,
        enabled: () => enabled(),
        ...(onUse ? { onUse } : {}),
      });
    }
    return npc;
  }

  /* ---- the man on the front door -------------------------------------
   * On the portico, beside the doors, facing down the steps at whoever is
   * coming up them. He never leaves this half metre of marble. */
  const doorPost = at('frontDoorOutside', { x: 0, y: GROUND_Y, z: 34.5 });
  /* Off the centre line so he is beside the doorway rather than in it, and a
   * metre north of the anchor, which is the top tread — that puts him on the
   * portico slab. Derived from the anchor rather than typed, so he moves with
   * the facade if it moves again. */
  const gateAt = { x: doorPost.x + 2.4, y: doorPost.y ?? GROUND_Y, z: doorPost.z + 1.15 };
  post('gateMan', {
    name: 'the man on the door',
    model: MANSION_DOOR_MAN,
    x: gateAt.x,
    y: gateAt.y,
    z: gateAt.z,
    yaw: yawToward(gateAt.x, gateAt.z, doorPost.x, doorPost.z - 8),
    folded: true,
    range: GATE_RANGE,
    bark: SEQUENCES.gateGreeting,
    idle: SEQUENCES.gateLoiter,
    look: 'He has not moved since you came through the gate.',
    onUse: () => {
      /* What he says when you actually speak to him depends on whether your
       * hands are full. The case is the mission's; if there is no mission in
       * this house he simply sends you in. */
      dialogue.interject(carryingCase() ? SEQUENCES.gateCase : SEQUENCES.gateInside);
      return true;
    },
  });

  /* ---- the perimeter ---------------------------------------------------
   * Three men, one voice, on three loops. Ground level outside the podium is
   * flat street grade, so they walk at y 0. */
  const PERIMETER_BARKS = [
    SEQUENCES.guardPathBark, SEQUENCES.guardCameraBark, SEQUENCES.guardLapBark,
  ];
  PATROL_ROUTES.forEach((route, i) => {
    post(`patrol${i}`, {
      name: 'a guard',
      model: MANSION_GUARDS[i],
      tier: 'ambient',
      job: 'patrol',
      x: route[0].x,
      y: 0,
      z: route[0].z,
      yaw: yawToward(route[0].x, route[0].z, route[1].x, route[1].z),
      route: route.map((p) => ({ ...p })),
      speed: 1.15,
      bark: PERIMETER_BARKS[i],
      look: 'One of Lou\'s. He has walked past you twice already.',
    });
  });

  /* ---- the top of the stairs -------------------------------------------
   * Owner: "one at the top of the stairs looking out". At the balcony rail at
   * the head of the horseshoe, facing south over the front doors — which is
   * both the top of the stairs and the only place in the house you can see the
   * gate from. */
  const balcony = at('balconyRail', { x: 0, y: UPPER_Y, z: 45.8 });
  post('stairs', {
    name: 'a guard',
    model: MANSION_GUARDS[3],
    x: balcony.x + 1.2,
    y: balcony.y,
    z: balcony.z,
    yaw: yawToward(balcony.x + 1.2, balcony.z, balcony.x, balcony.z - 10),
    folded: true,
    bark: SEQUENCES.guardStairsBark,
    idle: SEQUENCES.guardStairsIdle,
    look: 'He is watching the front doors, not you.',
  });

  /* ---- the basement ---------------------------------------------------- */
  const armory = at('armoryCenter', { x: -2, y: BASEMENT_Y, z: 55.5 });
  post('basement', {
    name: 'a guard',
    model: MANSION_GUARDS[4],
    x: armory.x + 2.2,
    y: armory.y,
    z: armory.z - 1.6,
    yaw: yawToward(armory.x + 2.2, armory.z - 1.6, armory.x, armory.z + 4),
    folded: true,
    bark: SEQUENCES.guardBasementBark,
    idle: SEQUENCES.guardBasementIdle,
    look: 'Down here with the racks, and not reading anything.',
  });

  /* ---- the vault -------------------------------------------------------
   * In the cellar hall, in front of eleven inches of steel that is standing
   * open. Facing it, not the corridor: whatever he is worried about is inside
   * the room. */
  const vault = at('vaultCenter', { x: 13.4, y: BASEMENT_Y, z: 70.4 });
  /* Four metres south of the vault's own centre puts him out through the door
   * and into the cellar hall, which is where a man guarding a room stands. */
  const vaultPost = vault.z - 4.0;
  post('vault', {
    name: 'a guard',
    model: MANSION_GUARDS[5],
    x: vault.x,
    y: vault.y,
    z: vaultPost,
    yaw: yawToward(vault.x, vaultPost, vault.x, vault.z),
    folded: true,
    bark: SEQUENCES.guardVaultBark,
    idle: SEQUENCES.guardVaultIdle,
    look: 'He is standing between you and a door nobody closed.',
  });

  /* ---- the bar in the billiard bay -------------------------------------
   * The Bada Bing's bartender, working a private room for the night, at the
   * service end of the counter — the bay's bar is built hard against its own
   * back bar, so the end of the run is the only place in it a man fits. */
  const bay = at('billiardBay', { x: 18.3, y: GROUND_Y, z: 47.5 });
  const barTop = { x: bay.x + 0.85, y: bay.y, z: bay.z - 3.1 };
  post('bartender', {
    name: 'the bartender',
    model: BADA_BING_BARTENDER,
    job: 'work',
    x: barTop.x,
    y: barTop.y,
    z: barTop.z,
    /* Three-quarters on: down the length of his own bar, and open to whoever
     * comes through the archway from the billiard room. */
    yaw: yawToward(barTop.x, barTop.z, bay.x - 0.5, bay.z),
    bark: SEQUENCES.bartenderBark,
    idle: SEQUENCES.bartenderIdle,
    look: 'The same man who works the Bing. Somebody made him wear the waistcoat here too.',
    onUse: () => { dialogue.interject(SEQUENCES.bartenderJack); return true; },
  });

  /* ---- Snow, and the cart ---------------------------------------------
   * Near the entrance, inside the foyer bark zone the mission already carries
   * for him — so "Try not to make more work for me tonight." finally has a man
   * standing behind it, with a mop in the bucket, hours before Booski gets on
   * the intercom and asks him to bring the cart downstairs.
   *
   * HIS BARK IS NOT FIRED FROM HERE. The mission owns Snow's foyer line
   * (`SEQUENCES.snowFoyer`, on the `snow` zone) and firing it from two places
   * would say it twice. This module supplies the body and the cart. */
  const foyer = at('foyerCenter', { x: 0, y: GROUND_Y, z: 44.4 });
  const snowAt = { x: foyer.x - 2.4, y: foyer.y, z: foyer.z - 1.2 };
  post('snow', {
    name: 'Snow',
    model: SNOW,
    job: 'work',
    x: snowAt.x,
    y: snowAt.y,
    z: snowAt.z,
    yaw: yawToward(snowAt.x, snowAt.z, foyer.x, foyer.z - 6),
    look: 'Gloves, a cart and a bucket, in a house where nothing has happened yet.',
  });
  const cart = makeJanitorCart();
  /* Far enough forward that the cart's own rear — the push bar and the mop
   * leaning out of the bucket — clears the man behind it. At +0.85 the built
   * geometry reached back to `snowAt.x - 0.15`, so Snow stood 15 cm inside
   * his own cart and the foyer had an invisible wall in front of him. */
  cart.position.set(snowAt.x + 1.45, snowAt.y, snowAt.z + 0.35);
  cart.rotation.y = -0.5;
  scene.add(cart);
  /* The cart is the one thing this module puts in the world that a player can
   * walk into. Its box is OFFERED rather than pushed into `world.colliders`:
   * tools/verify-mansion.mjs asserts the merged collider total adds up from
   * its named contributors, so a module that quietly adds one makes that sum
   * wrong from the outside. The composition root pushes it and counts it, the
   * same way it already does for the armory's racks. */
  /* MEASURED off the built cart, not authored around it.
   *
   * The hand-written box ran from `cart.x - 1.15` to `cart.x + 0.4`, and the
   * cart stands at `snowAt.x + 0.85` — so the solid reached 30 cm PAST Snow
   * and he was standing inside it. Nobody would have seen it: he does not
   * collide with the world, so the only symptom was an invisible wall in
   * front of the one man in the foyer, until a check asked whether anybody in
   * the house was standing in the furniture.
   *
   * `setFromObject` walks the real meshes, so the box is whatever the cart
   * actually is, and it cannot drift when the cart is redressed. */
  cart.updateMatrixWorld(true);
  const cartCollider = new THREE.Box3().setFromObject(cart);
  /* Floor to waist: the mop handle sticking up out of the bucket is not a
   * thing you walk into, and a collider as tall as it makes the cart a
   * pillar. */
  cartCollider.min.y = snowAt.y;
  cartCollider.max.y = Math.min(cartCollider.max.y, snowAt.y + 1.05);

  /* ---- Gratin, and the offer -------------------------------------------
   * The interrogation area is the laboratory's, so this exists only when the
   * laboratory does. He stands over xXx — who is built, hung and animated by
   * the environment (`lab.xxx`) and is NOT rebuilt here; there is one of him.
   *
   * The running gag is the Prospect's line, not Gratin's: it is ALWAYS Gratin.
   * Gratin's answer is a man explaining that he is good at his job.
   */
  const hangingAt = lab?.xxx?.at ?? lab?.anchors?.xxx ?? null;
  let torture = null;
  if (hangingAt && Number.isFinite(hangingAt.x)) {
    const gx = hangingAt.x + 1.5;
    const gz = hangingAt.z - 1.15;
    const gratin = post('gratin', {
      name: 'Gratin',
      model: GRATIN,
      x: gx,
      y: hangingAt.y ?? BASEMENT_Y,
      z: gz,
      yaw: yawToward(gx, gz, hangingAt.x, hangingAt.z),
      /* Not a bark: his approach is a four-line exchange with the Prospect in
       * the middle of it, so it is played as one run. See `offerTheSwing`. */
      onArrive: () => offerTheSwing(),
      onLeave: () => declineTheSwing(),
      idle: SEQUENCES.tortureIdle,
      look: () => (torture.swung
        ? 'He has gone back to what he was doing.'
        : 'Take a <b>swing</b>'),
      onUse: () => takeSwing(),
    });
    torture = {
      npc: gratin,
      /** Has he made the offer yet, and has the player used it. */
      offered: false,
      declined: false,
      swung: false,
      /** −1 when the cord is not moving; 0→1 across one swing. */
      swing: -1,
      landed: false,
      cord: null,
    };
  }

  /* ---------------------------------------------------------------- */
  /* The swing                                                         */
  /*                                                                    */
  /* One. The mechanic is the club's, imported whole: the same cord     */
  /* geometry, the same `poseCord` lag-and-pay-out, the same 0.72 s and */
  /* the same four cues. What is different is the economy — LICENSE TO  */
  /* GRILL is a whole interrogation you swing your way through, and     */
  /* this is a man at work offering you a go on the way past.           */
  /* ---------------------------------------------------------------- */

  /** Gratin puts it in your hand. */
  function handCordOver() {
    if (!camera || torture.cord) return;
    torture.cord = makeCord();
    camera.add(torture.cord.root);
    poseCord(torture.cord, -1);
    audio?.play('bing.grill.cord.handoff', { volume: 0.7 });
  }

  /** And takes it back, because it is his. */
  function takeCordBack() {
    if (!torture.cord) return;
    camera?.remove?.(torture.cord.root);
    torture.cord = null;
  }

  /**
   * Take the swing. The player's decision, at the moment he makes it.
   *
   * It cannot miss and it cannot hit anybody else: there is no ray, no target
   * list and no damage model anywhere in this module. The swing is authored,
   * it lands on the man who is already hanging from the ceiling, and xXx —
   * who survives the night, per `lab.xxx.alive` — has something to say about
   * family afterwards.
   */
  function takeSwing() {
    if (!torture) return false;
    if (torture.swing >= 0) return true;
    if (torture.swung) { dialogue.interject(SEQUENCES.tortureOneEach); return true; }
    torture.swung = true;
    torture.swing = 0;
    torture.landed = false;
    handCordOver();
    screen?.setInstruction?.('');
    audio?.play('bing.grill.cord.swing', { volume: 0.62 });
    return true;
  }

  /** The frame the cord arrives. Once per swing, from `update`. */
  function resolveSwing() {
    torture.landed = true;
    audio?.play('bing.grill.cord.whip', { volume: 0.8 });
    lab?.xxx?.say?.(null, { seconds: 2.6 });
    dialogue.interject(SEQUENCES.tortureSwing);
  }

  /* ---------------------------------------------------------------- */
  /* Barks                                                             */
  /* ---------------------------------------------------------------- */
  const here = new THREE.Vector3();
  function playerPosition() {
    if (player?.position) return player.position;
    if (camera?.position) return camera.position;
    return here;
  }

  /** Whether the mission has the case in the player's hands right now. Only
   * the mission knows; this module never guesses at its state. */
  function carryingCase() {
    return typeof hasCase === 'function' ? hasCase() === true : false;
  }

  function speakerFor(speakerKey) {
    switch (speakerKey) {
      case 'GATE': return people.gateMan;
      case 'GRATIN': return torture?.npc ?? null;
      case 'BARTENDER': return people.bartender;
      case 'SNOW': return people.snow;
      /* Six men share the GUARD profile, so "which body" is whichever one the
       * player is standing in front of. `nearestGuard` answers that. */
      case 'GUARD': return nearestGuard();
      default: return null;
    }
  }

  /** Who the GUARD profile is coming out of: whoever is nearest. */
  const GUARD_POSTS = ['patrol0', 'patrol1', 'patrol2', 'stairs', 'basement', 'vault'];
  function nearestGuard() {
    const p = playerPosition();
    let best = null;
    let bestD = Infinity;
    for (const id of GUARD_POSTS) {
      const npc = people[id];
      if (!npc) continue;
      const d = npc.group.position.distanceToSquared(p);
      if (d < bestD) { bestD = d; best = npc; }
    }
    return best;
  }

  /**
   * Gratin's whole approach, in one run: he tells you to give him a minute,
   * the Prospect points out that it is always him, he explains that he is good
   * at it, and then he offers you a turn.
   *
   * Played as ONE sequence rather than three interjections, because it is one
   * exchange and the controller's `interject` would let a guard's bark land in
   * the middle of it. The HUD says which button only in `onDone` — the man
   * finishes asking, and then the screen clarifies. docs/TONE-AND-PARODY.md's
   * rule, and `sayThenInstruct`'s shape.
   */
  function offerTheSwing() {
    if (!torture || torture.offered) return;
    torture.offered = true;
    dialogue.play([
      ...SEQUENCES.tortureGreeting,
      ...SEQUENCES.tortureAlwaysYou,
      ...SEQUENCES.tortureOffer,
    ], {
      onDone: () => { if (!torture.swung) screen?.setInstruction?.(INSTRUCTIONS.TAKE_A_SWING); },
    });
  }

  /** You looked at it and kept walking. He is not offended. */
  function declineTheSwing() {
    if (!torture || !torture.offered || torture.swung || torture.declined) return;
    torture.declined = true;
    screen?.setInstruction?.('');
    dialogue.interject(SEQUENCES.tortureDeclined);
  }

  function updateBarks(dt) {
    const p = playerPosition();
    /* Feet, not eyes. The house is four storeys deep in places and every one
     * of them is stacked in the same XZ column, so a man in the basement must
     * not greet somebody standing on the landing above him. */
    const feetY = p.y - (player?.eyeHeight ?? 1.66);
    for (const entry of posts) {
      const d = Math.hypot(
        entry.npc.group.position.x - p.x,
        entry.npc.group.position.z - p.z,
      );
      const inside = d <= entry.range
        && Math.abs(entry.npc.group.position.y - feetY) < 2.4;
      if (!inside) {
        if (entry.near > 0) entry.onLeave?.();
        entry.near = 0;
        continue;
      }
      entry.near += dt;
      /* A man turns to say his line and then stays where he turned. The heads
       * track on their own (`Npc.look`); this is the body, and only on the
       * frame he speaks — a guard who pivots every time somebody walks past
       * stops reading as a man standing a post. Patrols never turn: they are
       * walking a route and the route is the character. */
      const turn = () => { if (entry.npc.job !== 'patrol') entry.npc.faceToward(p.x, p.z); };
      if (!entry.said && (entry.bark || entry.onArrive)) {
        entry.said = true;
        turn();
        if (entry.onArrive) entry.onArrive();
        else dialogue.interject(entry.bark);
        continue;
      }
      /* An idle line is what somebody says into a silence, so it waits for
       * one. Interjected while a run is going it lands in the MIDDLE of it —
       * Gratin's offer came out as greeting, gag, "take your turn or don't",
       * and then the question, in that order. */
      if (!entry.saidIdle && entry.idle && entry.near >= IDLE_SECONDS && !dialogue.busy) {
        entry.saidIdle = true;
        turn();
        dialogue.interject(entry.idle);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* The handle                                                        */
  /* ---------------------------------------------------------------- */
  return {
    people,
    cart,
    dialogue,
    /**
     * Boxes the composition root should push into `world.colliders` and count,
     * exactly the way it counts the armory's racks. One entry: Snow's cart.
     * Nobody's BODY is in here — the house has never made a person solid and
     * this module is not the place to start.
     */
    colliders: [cartCollider],
    /** Snow's body, published so a caller can prove he is here. He carries no
     * threat state, no health and no team, and nothing in this module gives
     * him any. */
    get snow() { return people.snow; },
    /** Gratin's offer, for a caller that wants to drive it without a mouse. */
    swing: () => takeSwing(),

    update(dt) {
      if (!enabled()) return;
      const p = playerPosition();
      for (const key of Object.keys(people)) people[key].update(dt, p);
      updateBarks(dt);
      dialogue.update(dt);

      if (torture && torture.swing >= 0) {
        torture.swing += dt / SWING_SECONDS;
        if (!torture.landed && torture.swing >= SWING_LANDS_AT) resolveSwing();
        if (torture.swing >= 1) {
          torture.swing = -1;
          takeCordBack();
        } else if (torture.cord) {
          poseCord(torture.cord, torture.swing);
        }
      }
    },

    /** The headless surface, the same shape the mission's `debug` has. */
    debug: {
      get roster() {
        return Object.entries(people).map(([id, npc]) => ({
          id,
          name: npc.name,
          job: npc.job,
          x: Number(npc.group.position.x.toFixed(2)),
          y: Number(npc.group.position.y.toFixed(2)),
          z: Number(npc.group.position.z.toFixed(2)),
        }));
      },
      get spoken() { return [...dialogue.cueLog]; },
      get stages() { return [...stages]; },
      get gratin() {
        if (!torture) return null;
        return {
          offered: torture.offered,
          swung: torture.swung,
          swinging: torture.swing >= 0,
          landed: torture.landed,
          hasCord: Boolean(torture.cord),
        };
      },
      /** Proof, in code, of the standing rule. */
      snowIsATarget: false,
      swing: () => takeSwing(),
      hud: () => screen?.text?.() ?? null,
    },

    dispose() {
      ownHud?.dispose?.();
      takeCordBack();
      for (const npc of Object.values(people)) {
        interaction?.unregister?.(npc.group);
        npc.group.parent?.remove(npc.group);
      }
      cart.parent?.remove(cart);
    },
  };
}
