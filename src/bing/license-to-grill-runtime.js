/**
 * LICENSE TO GRILL — mounting it in the club.
 *
 * `license-to-grill.js` is the writing and the rules; this is the part that
 * knows about figures, doors, a cord you can swing and a campaign save. Kept
 * apart so the scene's argument can be reasoned about without a browser, and
 * so this file can be read as "what the club has to do" rather than as more
 * script.
 *
 * The one rule that shapes all of it: **there is one Gratin.** He is on the
 * floor at his booth for the whole visit, so the quest does not build a second
 * one in the store room — it walks the man himself through the door and puts
 * him back when it is over. Same for Numbskull. Blond is the only new figure,
 * because he is the only new person.
 *
 * ---- what the 2026-08-04 playtest changed ----
 *
 * The scene used to be a conversation with a timing bar in it. The owner's
 * notes, in his order: let me walk through the door instead of being
 * teleported in; I did not hear Gratin shout when I went near it; Gratin
 * should hand me the cord as an inventory item, detailed like a whip, with a
 * sound and an animation; let me whip him ON COMMAND rather than on a prompt;
 * and — the structural one — stop making me search a man through a menu, put
 * his belongings on the table behind me, and let each one I pick up fire its
 * own exchange and then be smashable.
 *
 * So this file now owns a room rather than a cutscene: a door you open and
 * walk through, a cord in your hands, five objects on a steel table, and a
 * left mouse button that means "use what you are holding". `PRESSURE` in the
 * rules file is untouched — the economy is the same argument it always was,
 * and only the interface in front of it has changed.
 */
import * as THREE from 'three';
import { CHARACTER_IDS } from '../core/campaign.js';
import { SIGNATURE_TRACKS, playSignatureTrack } from '../core/signature-music.js';
import { WARDROBE } from '../core/wardrobe.js';
import { Npc } from './cast.js';
import {
  BELONGINGS,
  CART_TOOLS,
  ENDINGS,
  QUEST,
  SCENE_TREES,
  SWINGS_BEFORE_THE_TABLE,
  buildLicenseToGrillScript,
  createInterrogation,
} from './license-to-grill.js';

/**
 * Where the two Family men stand once the door is open. Store-room world
 * coordinates.
 *
 * Their marks used to carry a literal yaw and both were wrong — Gratin faced
 * the south-west wall and Numbskull faced past the chair — so the room read as
 * three people who had never met. They now carry the point they are LOOKING at
 * instead, and the yaw comes off the same `atan2(dx, dz)` the cast's own
 * faceToward uses.
 *
 * There is no `player` mark any anymore. `open()` used to teleport Tony onto
 * one, which is the owner's note — *"let me open the door to the james blond
 * scene without teleporting into it, let me just walk into it"* — so the room
 * is set up around him and he arrives on his own feet.
 */
const MARKS = Object.freeze({
  blond: { x: 9.6, z: -12.3, yaw: 0.22 },
  gratin: { x: 8.9, z: -11.35, faceAt: { x: 9.6, z: -11.95 } },
  numbskull: { x: 10.9, z: -11.6, faceAt: { x: 9.6, z: -12.3 } },
  /* Just inside the door, facing back into the room at the chair. Owner's
   * note: "Shubes has a line in this scene but never appears" — the words
   * were always here (`shubesEnters` and its whole thread), but nothing ever
   * walked him to the door to say them. He is borrowed off the floor the
   * same way Gratin and Numbskull already are, for the one beat, and put
   * back the moment it is over — see `markShubes`/`shubesLeaves`. */
  shubes: { x: 6.9, z: -9.95, faceAt: { x: 9.6, z: -12.3 } },
});

/** The chair, which is what "walked in" means for the purposes of starting. */
const CHAIR = Object.freeze({ x: 9.6, z: -12.3 });
/** How close to the chair Tony gets before the room starts talking to him. */
const ARRIVAL_RANGE = 3.4;

/** The cord reaches this far, and only in front of him. */
const WHIP_RANGE = 2.5;
const WHIP_ARC = Math.cos(0.9);          // a little under 52° either side
/** How long one swing takes, and how far through it the cord arrives.
 * Exported with `makeCord`/`poseCord` so the mansion's one-swing version of
 * this lands on exactly the same frame this one does. */
export const SWING_SECONDS = 0.72;
export const SWING_LANDS_AT = 0.60;

/**
 * The store-room door leaf, and how near it Gratin can be heard through it.
 *
 * 2.4 m, and only from inside the hallway, which is doing two jobs. Lou's own
 * door is 2.7 m away across the corridor, so a player on his way to the
 * briefing walks past without Gratin shouting over the top of the mission; and
 * the hallway is the one place in the building where the dance floor is behind
 * a wall, so Gratin's voice cannot arrive through a door while the player is
 * looking straight at him on his stool. He is only teleported into the store
 * room when the door actually opens.
 */
const DOOR_AT = Object.freeze({ x: 6.75, z: -9.5 });
const DOOR_SHOUT_RANGE = 2.4;
/** The back hallway, from `ROOMS.hallway` in club.js. */
const HALLWAY = Object.freeze({ x0: 5.6, x1: 7.8, z0: -9.5, z1: 4.5 });

/**
 * The store room's own four walls, from `ROOMS.storage` in club.js.
 *
 * The cord only swings in here. Tony keeps it for the rest of the evening and
 * the left mouse button is the club's second interact key everywhere else in
 * the building — a man who has been handed a length of flex must not lose the
 * ability to click on a slot machine because of it.
 */
const STORE_ROOM = Object.freeze({ x0: 5.6, x1: 13.6, z0: -15, z1: -9.6 });

/** What he had on him. Cash is the only part with a number attached. */
const BLOND_CASH = 340;

/**
 * Cue names this scene wants recorded, and what it plays until they exist.
 *
 * Same contract `src/core/signature-music.js` keeps for the two records: the
 * wanted name is written down so somebody can be asked for it, and a cue that
 * IS in `assets/sfx/manifest.json` stands in until the real one lands. Every
 * fallback below is spelled out as its own literal play call on purpose —
 * `tools/check.mjs` scans for exactly that shape, so each stand-in is verified
 * against the manifest rather than quietly falling through to the
 * synthesiser. The moment a wanted cue is generated and indexed, `hasSample`
 * starts answering yes and it plays with no code change here.
 */
const PENDING_SFX = Object.freeze({
  CORD_HANDOFF: 'bing.grill.cord.handoff',
  CORD_SWING: 'bing.grill.cord.swing',
  CORD_WHIP: 'bing.grill.cord.whip',
  CORD_MISS: 'bing.grill.cord.floor',
  SMASH_GLASS: 'bing.grill.smash.glass',
  SMASH_METAL: 'bing.grill.smash.metal',
  SMASH_FABRIC: 'bing.grill.smash.fabric',
  TABLE_PICKUP: 'bing.grill.table.pickup',
});

/** Which noise each of his things makes on its way to pieces. */
const SMASH_SOUND = Object.freeze({
  watch: PENDING_SFX.SMASH_GLASS,
  camera: PENDING_SFX.SMASH_GLASS,
  pistol: PENDING_SFX.SMASH_METAL,
  jacket: PENDING_SFX.SMASH_FABRIC,
});

/**
 * His figure: the remains of a tuxedo, barefoot, and hair that has survived
 * the evening better than he has. Built through the club's own person builder
 * so he is lit, shaded and animated like everybody else in the building.
 *
 * The model itself is `WARDROBE.james_blond` — canonical, so he can be looked
 * at in the fitting room the same way everybody else on the roster can.
 * `barefoot` is added here rather than in the wardrobe entry because it is
 * true of THIS ROOM, not of the man: whoever tied him to the chair took his
 * shoes.
 *
 * `dress: 'suit'` plus `tuxedo: true` used to fight each other in
 * `makePerson` — the ordinary suit's own necktie and lapels were drawn right
 * over the top of the tux's bib and satin lapels, and a dark sliver of the
 * wrong lapel showed past the bow tie. That collision is fixed at the source
 * (`!tuxedo` in `src/bing/cast.js`), not worked around here.
 */
function makeBlond(scene, colliders) {
  const blond = new Npc(scene, {
    name: 'Blond',
    tier: 'hero',
    job: 'sit',
    x: MARKS.blond.x,
    z: MARKS.blond.z,
    yaw: MARKS.blond.yaw,
    colliders,
    model: { ...WARDROBE.james_blond, barefoot: true },
  });
  blond.characterId = CHARACTER_IDS.JAMES_BLOND;
  blond.group.userData.npc.characterId = CHARACTER_IDS.JAMES_BLOND;
  return blond;
}

/* ------------------------------------------------------------------ */
/* The cord                                                            */
/* ------------------------------------------------------------------ */

const CORD_MATERIALS = {
  leather: new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.82 }),
  plait: new THREE.MeshStandardMaterial({ color: 0x35251a, roughness: 0.72 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.32, metalness: 0.85 }),
  cracker: new THREE.MeshStandardMaterial({ color: 0xa89878, roughness: 0.95 }),
};

/**
 * A length of braided flex off the back of a fryer, built like a whip.
 *
 * The owner asked for it to be *"detailed like a whip"*, and a whip is not a
 * rope: it is a stiff wrapped handle, a plaited thong that tapers along its
 * whole length, a thinner fall spliced onto the end of that, and a cracker at
 * the very tip, which is the part that actually makes the noise. All four are
 * here, and the taper is real — every link is shorter and thinner than the one
 * above it.
 *
 * Each link is a CHILD of the one above it, which is the whole point of
 * building it this way: rotating a link rotates everything below it, so the
 * swing can be animated by turning the handle and letting the rest of the whip
 * arrive late. See `poseCord`.
 *
 * Exported because Lou's mansion reuses it: Gratin offers the player a swing
 * over the man hanging in the interrogation area, and that is the same length
 * of flex, the same pose function and the same four cues rather than a second
 * whip built somewhere else. See src/mansion/cast.js.
 *
 * @returns {{root: THREE.Group, links: THREE.Object3D[]}}
 */
export function makeCord() {
  const root = new THREE.Group();
  root.name = 'grill.cord';
  const M = CORD_MATERIALS;

  /* ---- the handle ----
   * Held butt-down in the fist, running up out of the grip. Nine wrap bands
   * over a core, a brass ferrule at the collar and a knot at the heel: the
   * part the eye reads as "somebody made this on purpose". */
  const grip = new THREE.Group();
  grip.name = 'grill.cord.handle';
  grip.add(new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.023, 0.16, 10), M.leather));
  for (let i = 0; i < 9; i++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.0215, 0.0035, 5, 12), M.plait);
    band.rotation.x = Math.PI / 2;
    band.rotation.z = i * 0.36;
    band.position.y = -0.066 + i * 0.017;
    grip.add(band);
  }
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0178, 0.0178, 0.016, 10), M.brass);
  ferrule.position.y = 0.086;
  grip.add(ferrule);
  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), M.leather);
  heel.position.y = -0.086;
  grip.add(heel);
  root.add(grip);

  /* ---- thong, fall and cracker ----
   * Twelve links tapering from 16mm to 5mm across a metre and a bit. The last
   * two are built thinner and paler so the tip still reads separately when the
   * whole thing is moving. */
  const links = [];
  const LINKS = 12;
  let parent = root;
  let offset = 0.096;
  for (let i = 0; i < LINKS; i++) {
    const t = i / (LINKS - 1);
    const next = Math.min(1, (i + 1) / (LINKS - 1));
    const len = 0.115 - 0.052 * t;
    const link = new THREE.Group();
    link.name = `grill.cord.link.${i}`;
    link.position.y = offset;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0082 - 0.0057 * next, 0.0082 - 0.0057 * t, len, i < 9 ? 7 : 5),
      i < 10 ? M.plait : M.cracker,
    );
    body.position.y = len / 2;
    link.add(body);
    // A plait ridge every other link, so the braid catches the bulb overhead.
    if (i < 9 && i % 2 === 0) {
      const r = 0.0082 - 0.0057 * t;
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(r * 1.25, r * 0.34, 4, 9), M.plait);
      ridge.rotation.x = Math.PI / 2;
      ridge.position.y = len * 0.62;
      link.add(ridge);
    }
    parent.add(link);
    parent = link;
    links.push(link);
    offset = len;
  }
  return { root, links };
}

/**
 * How tightly each link curls when the whip is coiled in the hand.
 *
 * Twelve links over about 1.1 m: a constant turn of 2π/12 per link wraps the
 * thong into one loop roughly 35 cm across, which is a whip a man is carrying
 * rather than a metre of flex sticking out of the top of the screen.
 */
const REST_CURL = (Math.PI * 2) / 12;

/**
 * Pose the cord.
 *
 * `p` runs 0 → 1 across one whole swing: a wind-up back over the shoulder, a
 * fast throw down-range, a pay-out, and a settle back to the coil. Pass a
 * negative `p` for the resting pose.
 *
 * Two things happen at once and they are what make it read as a whip rather
 * than a stick:
 *
 * 1. The **coil pays out.** At rest every link carries the same turn, so the
 *    thong is looped in his hand. It straightens through the throw and gathers
 *    itself back up by the end, so the resting pose the swing lands on is the
 *    resting pose it started from and nothing snaps.
 * 2. The **lash lags.** Each link reads the handle's own curve a fixed
 *    fraction of a swing behind the one above it, so the bend travels from the
 *    fist to the cracker and the tip is still going when the hand has stopped.
 *
 * Camera space looks down local −Z, so a negative pitch throws the arm
 * down-range and a positive one brings it back over the shoulder.
 */
export function poseCord(cord, p) {
  const rest = !(p >= 0);
  const k = rest ? 0 : Math.min(1, p);
  const ease = (t) => t * t * (3 - 2 * t);
  const ramp = (t, from, span) => ease(Math.max(0, Math.min(1, (t - from) / span)));
  /** Where the handle is pointing at time `t` of the swing. */
  const armAt = (t) => {
    if (t <= 0) return 0;
    const back = ramp(t, 0, 0.30) * 1.05;
    const through = ramp(t, 0.30, 0.26) * 2.55;
    return (back - through) * (1 - ramp(t, 0.56, 0.44));
  };

  const arm = rest ? 0 : armAt(k);
  cord.root.rotation.set(-0.30 + arm, 0.16 - arm * 0.10, 0.46 - arm * 0.22);
  cord.root.position.set(0.20 - arm * 0.04, -0.25 + arm * 0.05, -0.30 + arm * 0.03);

  /* Out on the throw, back into the hand by the end. Both edges are eased, so
   * `payOut` is 0 at k=0 and 0 again at k=1 — the same coil the rest pose
   * draws, which is why a finished swing does not pop. */
  const payOut = rest ? 0 : ramp(k, 0.28, 0.28) * (1 - ramp(k, 0.70, 0.30));
  for (let i = 0; i < cord.links.length; i++) {
    const lag = 0.028 * (i + 1);
    const trail = rest ? 0 : armAt(k - lag) - armAt(k);
    cord.links[i].rotation.x = REST_CURL * (1 - payOut * 0.94) + trail * 0.42;
    cord.links[i].rotation.z = rest ? 0.03 : 0.03 + trail * 0.10;
  }
}

/* ------------------------------------------------------------------ */
/* His things                                                          */
/* ------------------------------------------------------------------ */

const PROP_MATERIALS = {
  steel: new THREE.MeshStandardMaterial({ color: 0xc2c6cc, roughness: 0.26, metalness: 0.9 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd6b25c, roughness: 0.22, metalness: 0.95 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0xdfeaf2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55,
  }),
  strap: new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.86 }),
  black: new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.62 }),
  gun: new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.38, metalness: 0.72 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x53331c, roughness: 0.7 }),
  cloth: new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.95 }),
  satin: new THREE.MeshStandardMaterial({ color: 0x1c1f2c, roughness: 0.42 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.3, metalness: 0.85 }),
  broken: new THREE.MeshStandardMaterial({ color: 0x8f9298, roughness: 0.72, metalness: 0.4 }),
};

/**
 * One of the five objects laid out on the prep table, at 1:1 scale.
 *
 * Built once and used in both places: standing on the steel in the room, and
 * again as the thing in Tony's hands. They are small — a wristwatch is 38mm —
 * so each one is registered against an invisible pad rather than against its
 * own geometry, which is the same trick the tarpaulin and the manifest board
 * already use in this room.
 */
function makeBelonging(id) {
  const M = PROP_MATERIALS;
  const g = new THREE.Group();
  g.name = `grill.prop.${id}`;
  if (id === 'watch') {
    const case_ = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.009, 20), M.gold);
    case_.rotation.x = Math.PI / 2;
    g.add(case_);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.0155, 20), M.glass);
    face.position.z = 0.0048;
    g.add(face);
    for (const a of [0.6, -1.9]) {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.0016, 0.012, 0.0008), M.black);
      hand.position.set(Math.sin(a) * 0.005, Math.cos(a) * 0.005, 0.0044);
      hand.rotation.z = -a;
      g.add(hand);
    }
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.005, 8), M.gold);
    crown.rotation.z = Math.PI / 2;
    crown.position.x = 0.021;
    g.add(crown);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const link = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.004), M.strap);
        link.position.set(0, side * (0.024 + i * 0.013), -0.001);
        link.rotation.x = side * (0.16 + i * 0.1);
        g.add(link);
      }
    }
  } else if (id === 'camera') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.032, 0.019), M.steel));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.0095, 0.012, 14), M.black);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0.012, 0, 0.014);
    g.add(lens);
    const element = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 14), M.glass);
    element.position.set(0.012, 0, 0.0205);
    g.add(element);
    const wind = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 12), M.brass);
    wind.position.set(-0.02, 0.018, 0);
    g.add(wind);
    const shutter = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 10), M.brass);
    shutter.position.set(0.014, 0.018, 0);
    g.add(shutter);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.021), M.black);
    base.position.y = -0.014;
    g.add(base);
  } else if (id === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.024, 0.021), M.gun);
    slide.position.y = 0.018;
    g.add(slide);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.014, 0.019), M.gun);
    frame.position.set(-0.006, 0.002, 0);
    g.add(frame);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 12), M.steel);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.079, 0.018, 0);
    g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.072, 0.018), M.grip);
    grip.position.set(-0.044, -0.032, 0);
    grip.rotation.z = 0.26;
    g.add(grip);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.0035, 6, 14, Math.PI), M.gun);
    guard.rotation.set(Math.PI / 2, 0, Math.PI);
    guard.position.set(-0.012, -0.014, 0);
    g.add(guard);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.016, 0.005), M.steel);
    trigger.position.set(-0.014, -0.008, 0);
    g.add(trigger);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.008), M.gun);
    sight.position.set(0.058, 0.033, 0);
    g.add(sight);
  } else if (id === 'jacket') {
    // Folded twice on itself, the way a man who owns one folds it.
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.185), M.cloth);
    g.add(body);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.16), M.cloth);
    upper.position.set(0.004, 0.046, -0.004);
    upper.rotation.y = 0.06;
    g.add(upper);
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.008, 0.032), M.satin);
      lapel.position.set(-0.02, 0.068, side * 0.036);
      lapel.rotation.set(0, 0, side * 0.05);
      g.add(lapel);
    }
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.16, 10), M.cloth);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.set(0.03, 0.076, 0.052);
    g.add(sleeve);
    for (let i = 0; i < 3; i++) {
      const button = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.002, 10), M.black);
      button.rotation.x = Math.PI / 2;
      button.position.set(-0.05 + i * 0.03, 0.089, -0.03);
      button.rotation.x = 0;
      g.add(button);
    }
  } else {
    // The keys. Heavier than Gratin's car, and the end of the evening.
    const fob = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.05, 0.008), M.black);
    g.add(fob);
    const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.0022, 14), M.gold);
    crest.rotation.x = Math.PI / 2;
    crest.position.set(0, 0.01, 0.005);
    g.add(crest);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0018, 6, 16), M.steel);
    ring.position.set(0, 0.036, 0);
    g.add(ring);
    for (const [dx, len, tilt] of [[-0.012, 0.052, 0.22], [0.011, 0.046, -0.3]]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.007, len, 0.0022), M.steel);
      blade.position.set(dx, 0.058 + len / 2 - 0.03, 0.001);
      blade.rotation.z = tilt;
      g.add(blade);
      const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.0022, 10), M.steel);
      bow.rotation.x = Math.PI / 2;
      bow.position.set(dx + tilt * 0.02, 0.046, 0.001);
      g.add(bow);
    }
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* The cart, in his hands                                              */
/* ------------------------------------------------------------------ */

const CART_MATERIALS = {
  handle: new THREE.MeshStandardMaterial({ color: 0x6b4526, roughness: 0.82 }),
  steel: PROP_MATERIALS.steel,
  bucketBody: new THREE.MeshStandardMaterial({ color: 0xb7bcc2, roughness: 0.32, metalness: 0.82 }),
  ice: new THREE.MeshPhysicalMaterial({
    color: 0xdcf0f5, roughness: 0.08, transmission: 0.72, thickness: 0.01, transparent: true, opacity: 0.85,
  }),
  bottleGlass: new THREE.MeshPhysicalMaterial({
    color: 0x2a2016, roughness: 0.1, transmission: 0.55, thickness: 0.02, transparent: true, opacity: 0.9,
  }),
  sauce: new THREE.MeshStandardMaterial({
    color: 0xa8280f, emissive: 0x3a0d02, emissiveIntensity: 0.16, roughness: 0.3,
  }),
  cap: new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.5 }),
};

/**
 * One of the four things on the cart, held the way the belongings are: 1:1
 * scale, out in front of the camera, aimed at Blond and used with a click.
 *
 * The owner's note was that these never showed up in his hands at all, so the
 * bar here is lower than the belongings' — read, held, unmistakable for what
 * it is at arm's length — not the belongings' level of jewellery detail.
 */
function makeCartTool(id) {
  const M = CART_MATERIALS;
  const g = new THREE.Group();
  g.name = `grill.tool.${id}`;
  if (id === 'tenderizer') {
    // A wooden handle up into a fist, and a studded metal head to swing it by.
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.16, 10), M.handle);
    handle.position.y = -0.09;
    g.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.06), M.steel);
    g.add(head);
    // The grid of pyramid studs that makes it read as a TENDERISER and not a
    // gavel — four rows of four on the striking face.
    for (let ix = 0; ix < 4; ix++) {
      for (let iy = 0; iy < 4; iy++) {
        const stud = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.012, 4), M.steel);
        stud.rotation.x = Math.PI / 2;
        stud.rotation.y = Math.PI / 4;
        stud.position.set(-0.0225 + ix * 0.015, -0.0335 + iy * 0.0225, 0.036);
        g.add(stud);
      }
    }
  } else if (id === 'ice') {
    // A frustum pail, two ear handles, and the ice standing proud of the rim.
    const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.075, 16), M.bucketBody);
    g.add(pail);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 6, 16), M.steel);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.0375;
    g.add(rim);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 10, Math.PI), M.steel);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(side * 0.052, 0.02, 0);
      g.add(ear);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), M.ice);
      cube.position.set(Math.cos(a) * 0.018, 0.05, Math.sin(a) * 0.018);
      cube.rotation.set(a * 0.6, a, a * 0.4);
      g.add(cube);
    }
  } else if (id === 'tongs') {
    // Two arms off a common pivot, splayed the way a pair left on a cart is.
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), M.steel);
    pivot.rotation.x = Math.PI / 2;
    pivot.position.y = 0.075;
    g.add(pivot);
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.y = 0.075;
      arm.rotation.z = side * 0.16;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.15, 0.009), M.steel);
      bar.position.y = -0.075;
      arm.add(bar);
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.03, 0.006), M.steel);
      paddle.position.y = -0.155;
      paddle.rotation.z = -side * 0.16;
      arm.add(paddle);
      g.add(arm);
    }
  } else {
    // The sauce: a plain glass bottle, no label, a cap, and something red
    // enough inside it to be worth being suspicious of.
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.13, 14), M.bottleGlass);
    g.add(body);
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.09, 14), M.sauce);
    fill.position.y = -0.02;
    g.add(fill);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.024, 0.03, 14), M.bottleGlass);
    shoulder.position.y = 0.08;
    g.add(shoulder);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.03, 12), M.bottleGlass);
    neck.position.y = 0.11;
    g.add(neck);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.018, 12), M.cap);
    cap.position.y = 0.134;
    g.add(cap);
  }
  return g;
}

/**
 * What is left of one of them afterwards.
 *
 * A smashed object does not disappear; it goes back on the table in pieces,
 * because a room where the evidence of what you did quietly vanishes is a room
 * that is not taking you seriously. Cheap and deliberately unlovely.
 */
function makeWreck(id) {
  const g = new THREE.Group();
  g.name = `grill.wreck.${id}`;
  const M = PROP_MATERIALS;
  const mat = id === 'jacket' ? M.cloth : M.broken;
  const count = id === 'jacket' ? 4 : 7;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + i * 0.7;
    const r = 0.018 + (i % 3) * 0.016;
    const size = id === 'jacket' ? 0.07 : 0.012 + (i % 4) * 0.006;
    const shard = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.28, size * 0.7), mat);
    shard.position.set(Math.cos(a) * r, size * 0.14, Math.sin(a) * r);
    shard.rotation.set((i % 3) * 0.3, a, (i % 2) * 0.4);
    g.add(shard);
  }
  return g;
}

/** An invisible box to aim at, because a wristwatch is thirty-eight millimetres. */
function makePad(w, h, d) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
}

/**
 * @param {object} deps everything the club already owns
 * @returns {object} the quest handle main.js mounts and ticks
 */
export function createLicenseToGrill({
  scene,
  camera = null,
  club,
  audio,
  hud,
  dialogue,
  player,
  interaction,
  campaign,
  family,
  shubenator,
  inventory = null,
  items = {},
  isSecondVisit = false,
  addMoney = () => {},
  onPersist = () => {},
} = {}) {
  const runtime = {
    /** 'closed' while it is somebody else's store room. */
    phase: 'closed',
    grill: null,
    blond: null,
    /* Where the Family were standing before this started, so the floor is put
     * back exactly as it was rather than approximately. */
    parked: new Map(),
    persisted: null,
    /**
     * How far through the evening the CONVERSATION is, as opposed to how far
     * through it the interrogation is.
     *
     * This exists because the owner could not find where the scene starts
     * again once it stops. There was nothing to walk up to: Blond had no
     * interaction on him at all, and `resume()` was only ever called from
     * `open()` and from the cord's own callback — so a conversation that
     * lapsed (walk more than 6.5m from the chair and Dialogue ends it) was
     * gone for the rest of the visit, with a live objective still on screen.
     *
     * 'intro' | 'floor' | 'named'. Written at the two moments that actually
     * move the scene on, so walking back up to the chair always lands
     * somewhere sensible rather than somewhere remembered.
     */
    stage: 'intro',
    /** Set by a scene tree that wants to hand the player back to the chair. */
    handOff: null,
    /** Interaction targets this quest owns, so `close` can take them away. */
    targets: [],
    /**
     * The objects added to the world for this, kept for inspection rather than
     * for cleanup: the table, the things on it and whatever is left of them
     * STAY in the room when the scene is over. A store room where the evidence
     * of what the player just did quietly disappears is a room that is not
     * taking him seriously.
     */
    litter: [],
    /** Has Gratin shouted through the door yet. */
    shouted: false,
    /** Has the introduction fired — i.e. has Tony actually walked in. */
    arrived: false,
    /** The cord: is it his, and where is it in its swing. */
    cord: null,
    hasCord: false,
    swing: -1,
    swingLanded: false,
    /** The object currently in his hands, if any. */
    held: null,
    heldModel: null,
    /** A cart tool in his hands, if any — see `CART_TOOLS`. Mutually
     * exclusive with `held`: he has two hands and one of Blond's things is
     * already a two-handed job. */
    tool: null,
    toolModel: null,
    /** What this quest last wrote into the shared HUD hand slot, or null. */
    handShown: null,
    /** id -> { group, pad, wreck, mark } for the five things on the table. */
    table: new Map(),
    /** Queued HUD lines, shown one at a time once nobody is talking. */
    pendingSay: [],
    sayCooldown: 0,
  };

  /* ---------------- sound ---------------- */

  /**
   * Play a cue that has been asked for but not yet recorded, or the manifest
   * cue standing in for it.
   *
   * The fallbacks are written out as individual literal play calls so
   * `tools/check.mjs` can see and verify every one of them; the wanted name is
   * passed to `hasSample` only, which the checker does not scan and does not
   * need to.
   */
  function sfx(name, opts = {}) {
    if (audio?.hasSample?.(name)) { audio.play(name, opts); return; }
    switch (name) {
      // A ballistic vest lifted off a table, for a coil of flex handed over.
      case PENDING_SFX.CORD_HANDOFF: audio?.play('heist.gear.armor.pickup', opts); break;
      // A linen tablecloth snapped open: a sharp fabric crack, which is what
      // the air in front of a whip actually sounds like.
      case PENDING_SFX.CORD_SWING: audio?.play('cloth.snap', opts); break;
      // A dense clothed body impact. Closest thing in the building to a cord
      // landing on a man in a dinner jacket.
      case PENDING_SFX.CORD_WHIP: audio?.play('heist.player.hit', opts); break;
      // And a hard crack off stone with a little debris, for one that misses.
      case PENDING_SFX.CORD_MISS: audio?.play('heist.bullet.impact', opts); break;
      case PENDING_SFX.SMASH_GLASS: audio?.play('glass.wine.fall', opts); break;
      // A metal pistol hitting a hard floor, which is exactly the event.
      case PENDING_SFX.SMASH_METAL: audio?.play('heist.guard.weapon.drop', opts); break;
      case PENDING_SFX.SMASH_FABRIC: audio?.play('heist.swap.fabric', opts); break;
      case PENDING_SFX.TABLE_PICKUP: audio?.play('gun.pickup', opts); break;
      default: break;
    }
  }

  /* ---------------- the words, and the button after them ---------------- */

  /**
   * Say the beat, then put the instruction up — never both at once.
   *
   * The tone doctrine's rule, and `sayThenInstruct` in src/silvercase/main.js
   * is the shape it names. The Bing's Dialogue has no per-line `onDone`, so
   * the instruction is queued here and `update` releases it on the first frame
   * after the conversation has closed itself. A caption that lands on the same
   * frame as a character's line is the game talking over its own cast.
   *
   * A queue rather than a slot, and released one at a time with the last one's
   * duration as a cooldown: the scene can legitimately owe two of these at
   * once — the title card and the cord's button — and a single slot would drop
   * whichever was queued first, silently.
   */
  function instructAfterDialogue(text, ms = 5200) {
    runtime.pendingSay.push({ text, ms });
  }

  const script = buildLicenseToGrillScript({
    takeCord: () => giveCord(),
    takeTool: (id) => giveTool(id),
    apply: (kind) => runtime.grill.apply(kind),
    ask: (id) => runtime.grill.ask(id),
    carAvailable: () => !!runtime.grill?.carAvailable(),
    broken: () => !!runtime.grill?.broken,
    handled: () => runtime.grill?.state?.handled?.size ?? 0,
    /* Deferred on purpose. A tree's `next` runs INSIDE Dialogue.choose/update,
     * and starting a second conversation from in there would have the caller
     * overwrite the new thread's timer and pending node the moment it returns.
     * So the hand-off is recorded and performed by this quest's own update, on
     * the first frame after the current line has finished and closed itself. */
    handOff: (node) => { runtime.handOff = node || 'floor'; },
    threatenCar: () => {
      const broke = runtime.grill.threatenCar();
      if (broke) runtime.stage = 'named';
      return broke;
    },
    shubesDue: () => !!runtime.grill?.shubesDue(),
    markShubes: () => {
      runtime.grill.markShubes();
      /* The interruption is one of the Shubenator's three authored moments,
       * so it goes through `scripted` rather than `offer`: it is exempt from
       * the cooldown because it is the joke, and it arms the gate so no
       * ambient hello can tread on it out on the floor afterwards. */
      shubenator?.scripted('firstMeeting');
      /* And he actually walks in. Owner's note: he has a line in this scene
       * and never appears — the words were always here, nothing ever brought
       * the man himself to the door. Borrowed off the floor exactly the way
       * Gratin and Numbskull already are; `shubesLeaves` sends him back. */
      bringIn(CHARACTER_IDS.SHUBENATOR, MARKS.shubes);
    },
    shubesLeaves: () => putBack(CHARACTER_IDS.SHUBENATOR),
    answerCounter: (id, respect) => runtime.grill.answerCounter(id, respect),
    finish: (ending) => complete(ending),
  });

  const tree = script[CHARACTER_IDS.JAMES_BLOND];

  function resume(node) {
    if (runtime.phase !== 'open') return;
    dialogue?.start(tree, node, runtime.blond);
  }

  /**
   * Where walking back up to the chair puts you.
   *
   * Derived from the scene's own progress rather than from Dialogue's
   * bookmarks: a bookmark records wherever the thread happened to lapse,
   * including halfway through a line Gratin is saying about a bottle. Three
   * answers, all of them a node a conversation can honestly begin at.
   */
  function reentry() {
    if (runtime.stage === 'named') return 'afterTheName';
    if (runtime.stage === 'floor') return 'floor';
    return 'open';
  }

  /* ---------------- the cord ---------------- */

  /**
   * Gratin hands it over and it becomes Tony's.
   *
   * Owner's note: *"Gratin should hand me the cord and let it come to my
   * inventory like an item."* So it takes a real slot in the club's own
   * five-slot bar and stays there for the rest of the visit, and the model
   * goes on the camera where every other carried thing in this building goes.
   */
  function giveCord() {
    if (runtime.hasCord) return;
    runtime.hasCord = true;
    runtime.stage = 'floor';
    inventory?.add?.('cord');
    if (camera && !runtime.cord) {
      runtime.cord = makeCord();
      camera.add(runtime.cord.root);
    }
    if (runtime.cord) {
      poseCord(runtime.cord, -1);
      runtime.cord.root.visible = true;
    }
    sfx(PENDING_SFX.CORD_HANDOFF, { volume: 0.5 });
    paintHand();
    /* Gratin gets his line first and the button arrives after it — see
     * `instructAfterDialogue`. */
    instructAfterDialogue('<em>[Click]</em> swings the cord. Stand over him for it to land.', 5600);
  }

  /**
   * Take one of the cart's tools into his hands.
   *
   * Owner's playtest note: he picked the meat tenderiser off the cart and
   * nothing showed up in his hands, and there was no way to use it on Blond.
   * So this follows the CORD's own shape rather than the belongings': the
   * tool comes to the camera at once, and using it on him is a left click
   * aimed the same way the cord swings — see `useTool` and `blondInReach`.
   * It is deliberately not the belongings' shape (pick up, get his reaction
   * immediately): these are not his property to turn over in front of him,
   * they are a thing Tony picks up off a cart and uses.
   *
   * Only one thing lives in his hands. Taking a tool puts down whatever of
   * Blond's he was holding, the same rule the table already keeps against
   * holding two things at once.
   */
  function giveTool(id) {
    if (runtime.phase !== 'open') return;
    /* His own things come first. Reaching the cart while one of Blond's
     * belongings is in Tony's hands is not supposed to happen — talking to
     * Blond himself is gated on it (`mountBlond`) — but Gratin and
     * Numbskull's own threads can hand the floor back without going through
     * that gate, so this refuses rather than trusts the caller. Put it back
     * with [Q] first. */
    if (runtime.held) return;
    const tool = CART_TOOLS.find((entry) => entry.id === id);
    if (!tool) return;
    // Tool-to-tool is a swap, not a refusal: neither is his property.
    clearToolModel();
    runtime.tool = id;
    if (camera) {
      runtime.toolModel = makeCartTool(id);
      /* Held out in front, roughly where the belongings ride — a tool from
       * the cart is looked at and aimed the same way a lifted watch is. */
      runtime.toolModel.position.set(0.17, -0.22, -0.38);
      runtime.toolModel.rotation.set(-0.32, 0.46, 0.10);
      camera.add(runtime.toolModel);
    }
    if (runtime.cord) runtime.cord.root.visible = false;
    sfx(PENDING_SFX.TABLE_PICKUP, { volume: 0.4 });
    paintHand();
    instructAfterDialogue('<em>[Click]</em> to use it on him. Stand over him for it to land.', 5600);
  }

  /**
   * Put down whatever cart tool is in his hands. Nothing is lost by it — the
   * same rule the belongings keep: it goes back on the cart, and any pressure
   * it already earned stays earned.
   */
  function putBackTool() {
    if (!runtime.tool) return false;
    clearToolModel();
    runtime.tool = null;
    if (runtime.cord && runtime.phase === 'open') runtime.cord.root.visible = true;
    audio?.play('glass.set', { volume: 0.32 });
    paintHand();
    return true;
  }

  function clearToolModel() {
    if (!runtime.toolModel) return;
    runtime.toolModel.parent?.remove(runtime.toolModel);
    runtime.toolModel = null;
  }

  /**
   * Use whatever cart tool is in his hands, on Blond — the same reach and the
   * same facing the cord swings at (`blondInReach`). A landed use fires the
   * exchange that already existed for it (`useTenderizer` and its three
   * siblings); a miss says nothing, because a tool that never touched him is
   * just a thing held up in an empty room, which is not worth a line.
   */
  function useTool() {
    const id = runtime.tool;
    if (!id) return false;
    const tool = CART_TOOLS.find((entry) => entry.id === id);
    if (!tool || !blondInReach()) return true;
    resume(tool.node);
    return true;
  }

  /**
   * Whatever is in his hands, on the HUD.
   *
   * Only ever writes when what it wants to say has CHANGED, and only ever
   * clears a readout it put up itself. The hand slot is shared with the club's
   * drinks, and a quest that repaints it every frame would take the beer out
   * of Tony's hand on the dance floor.
   *
   * The cord's own line comes down when he leaves the store room, because that
   * is where the button works — advertising `[Click]` in the middle of the
   * floor, where left click is the club's second interact key, would be a lie.
   */
  function paintHand() {
    if (!hud) return;
    let want = null;
    if (runtime.phase === 'open' && runtime.held) {
      const item = BELONGINGS.find((entry) => entry.id === runtime.held);
      want = {
        icon: item?.icon ?? '▣',
        name: item?.hand ?? 'One of his things',
        hint: item?.smashNode ? '[Click] smash it · [Q] put it back' : '[Q] put it back',
      };
    } else if (runtime.phase === 'open' && runtime.tool) {
      const tool = CART_TOOLS.find((entry) => entry.id === runtime.tool);
      want = {
        icon: tool?.icon ?? '▣',
        name: tool?.hand ?? 'Something off the cart',
        hint: '[Click] to use it on him · [Q] put it back',
      };
    } else if (runtime.phase === 'open' && runtime.hasCord && inStoreRoom()) {
      want = { ...(items.cord ?? { icon: '🪢', name: 'The cord' }), hint: '[Click] to swing it' };
    }
    const key = want ? `${want.icon}|${want.name}|${want.hint}` : null;
    if (key === runtime.handShown) return;
    if (!want && runtime.handShown === null) return;
    runtime.handShown = key;
    hud.setHand(want);
  }

  /** Is Tony inside the store room's four walls? */
  function inStoreRoom() {
    if (!player) return false;
    const { x, z } = player.position;
    return x >= STORE_ROOM.x0 && x <= STORE_ROOM.x1 && z >= STORE_ROOM.z0 && z <= STORE_ROOM.z1;
  }

  /** Is the man in the chair in front of Tony and inside the cord's reach? */
  function blondInReach() {
    if (!runtime.blond || !player) return false;
    const dx = CHAIR.x - player.position.x;
    const dz = CHAIR.z - player.position.z;
    const d = Math.hypot(dx, dz);
    if (d > WHIP_RANGE || d < 0.001) return false;
    /* Player forward is (−sin yaw, −cos yaw) — see `Player.update` in
     * src/core/player.js, which builds its walk vector from exactly that. So
     * "is he facing the chair" is a dot product against it. */
    const look = { x: -Math.sin(player.yaw ?? 0), z: -Math.cos(player.yaw ?? 0) };
    return ((dx / d) * look.x + (dz / d) * look.z) >= WHIP_ARC;
  }

  /**
   * Take a swing. The player's decision, at the moment they make it.
   *
   * This is the whole of the owner's *"I want to be able to whip him on
   * command"* — no prompt, no sweeping bar, no window to hit. The cord is in
   * his hands and the button swings it. Whether it lands is decided by where
   * he is standing and which way he is looking, which is the only honest
   * answer and is also what makes standing over the chair mean something.
   */
  function swingCord() {
    if (runtime.swing >= 0) return true;      // already mid-swing
    runtime.swing = 0;
    runtime.swingLanded = false;
    sfx(PENDING_SFX.CORD_SWING, { volume: 0.42 });
    return true;
  }

  /** The frame the cord arrives. Called once per swing, by `update`. */
  function resolveSwing() {
    if (runtime.swingLanded) return;
    runtime.swingLanded = true;
    const landed = blondInReach();
    const chairAt = new THREE.Vector3(CHAIR.x, 0.95, CHAIR.z);
    if (!landed) {
      runtime.grill?.apply('chair');
      sfx(PENDING_SFX.CORD_MISS, { volume: 0.4, position: chairAt });
      if (!dialogue?.active) resume('swingWide');
      return;
    }
    runtime.grill?.apply('strike');
    sfx(PENDING_SFX.CORD_WHIP, { volume: 0.62, position: chairAt });
    runtime.blond?.say?.(1.2);
    const swings = runtime.grill?.swings?.() ?? 0;
    /* The first three landed swings are authored, in order, and the third is
     * where Gratin gives up on the beating and points at the table — which is
     * the owner's *"after you whip him two or 3 times Gratin suggests you
     * check out his belongings"*. Everything after that is `swingAgain`,
     * because a player who keeps going deserves to keep being told. */
    const node = swings === 1 ? 'afterSwing'
      : swings === 2 ? 'swingTwo'
        : swings === SWINGS_BEFORE_THE_TABLE ? 'swingThree'
          : 'swingAgain';
    resume(node);
    if (swings === SWINGS_BEFORE_THE_TABLE) {
      instructAfterDialogue('His things are on the table by the door. '
        + '<em>[E]</em> to pick one up.', 6000);
    }
  }

  /* ---------------- the table ---------------- */

  /**
   * Lay a man out on a steel table.
   *
   * This is the owner's structural note made physical. It used to be a
   * dialogue node called `things` with five nouns under it; it is now five
   * objects on the prep table by the door, each with its own pad to aim at and
   * its own exchange when it comes off the steel. The economy underneath is
   * untouched: picking one up is the same `apply(id)` the menu option used to
   * make, and `PRESSURE` still says a man's watch is worth three and a half
   * beatings.
   */
  function dressTable() {
    const at = club?.anchors?.grillTable;
    if (!at || !scene || !interaction) return;
    const yaw = club?.storeroom?.table?.rotation?.y ?? 0;
    const spread = [-0.66, -0.33, 0, 0.33, 0.66];
    BELONGINGS.forEach((item, i) => {
      const local = spread[i] ?? 0;
      const x = at.x + Math.cos(yaw) * local;
      const z = at.z - Math.sin(yaw) * local;
      const group = makeBelonging(item.id);
      group.position.set(x, at.y + (item.id === 'jacket' ? 0.03 : 0.006), z);
      /* Everything except the folded jacket lies flat on the steel, so the
       * face of the watch and the flank of the pistol both point at the bulb.
       *
       * All five props are modelled in the XY plane with their front along
       * local +Z, so "flat" is a −90° turn about X and the in-plane jitter has
       * to be the Z term rather than the Y one: at the default XYZ Euler order
       * a Y turn is applied in the PARENT frame, which would tip the whole
       * object over onto its edge instead of spinning it on the table. */
      if (item.id === 'jacket') group.rotation.set(0, yaw + (i % 2 ? 0.22 : -0.15), 0);
      else group.rotation.set(-Math.PI / 2, 0, -yaw + (i % 2 ? 0.22 : -0.15));
      scene.add(group);
      runtime.litter.push(group);

      const pad = makePad(0.26, 0.24, 0.26);
      pad.position.set(x, at.y + 0.11, z);
      scene.add(pad);
      runtime.litter.push(pad);
      runtime.table.set(item.id, { item, group, pad, wreck: null, at: { x, z, y: at.y } });

      runtime.targets.push(interaction.register(pad, {
        label: () => {
          const state = runtime.table.get(item.id);
          if (state?.wreck) return `What is left of <b>${item.label.toLowerCase()}</b>`;
          if (runtime.held === item.id) return `Put <b>${item.label.toLowerCase()}</b> back`;
          return `Pick up <b>${item.label.toLowerCase()}</b>`;
        },
        /* Not while a cart tool is in his hands either — one thing at a time,
         * the same rule that keeps him from picking up a second belonging. */
        enabled: () => runtime.phase === 'open' && !runtime.table.get(item.id)?.wreck && !runtime.tool
          && (runtime.held === null || runtime.held === item.id),
        onUse: () => {
          if (runtime.held === item.id) { putBackHeld(); return; }
          pickUp(item.id);
        },
      }));
    });
  }

  /** Take one off the table and into his hands. */
  function pickUp(id) {
    if (runtime.held || runtime.tool || runtime.phase !== 'open') return;
    const state = runtime.table.get(id);
    if (!state || state.wreck) return;
    runtime.held = id;
    state.group.visible = false;
    if (camera) {
      runtime.heldModel = makeBelonging(id);
      /* Held out in front of him at arm's length, turned so the face of the
       * thing is towards the camera rather than towards the floor. */
      runtime.heldModel.position.set(0.17, -0.20, -0.36);
      runtime.heldModel.rotation.set(-0.35, 0.5, 0.12);
      if (id === 'jacket') runtime.heldModel.position.set(0.2, -0.28, -0.44);
      camera.add(runtime.heldModel);
    }
    if (runtime.cord) runtime.cord.root.visible = false;
    sfx(PENDING_SFX.TABLE_PICKUP, { volume: 0.42 });
    paintHand();
    /* The line first, always — he is watching a stranger pick his life up, and
     * a caption about a mouse button on the same frame would be the game
     * talking over him. */
    const first = !runtime.grill?.isHandled?.(id);
    resume(state.item.node);
    if (first && state.item.smashNode) {
      instructAfterDialogue('<em>[Click]</em> to break it. <em>[Q]</em> to put it back.', 5200);
    }
  }

  /** Put it down again, unbroken. Nothing is lost by changing your mind. */
  function putBackHeld() {
    if (!runtime.held) return false;
    const state = runtime.table.get(runtime.held);
    if (state && !state.wreck) state.group.visible = true;
    clearHeldModel();
    runtime.held = null;
    if (runtime.cord && runtime.phase === 'open') runtime.cord.root.visible = true;
    audio?.play('glass.set', { volume: 0.34 });
    paintHand();
    return true;
  }

  function clearHeldModel() {
    if (!runtime.heldModel) return;
    runtime.heldModel.parent?.remove(runtime.heldModel);
    runtime.heldModel = null;
  }

  /**
   * Break it.
   *
   * Worth six, which is deliberately almost nothing — see `PRESSURE.smash`.
   * What it actually buys is the coldest writing in the room and the discovery
   * that the man who laughed through a beating has a floor after all.
   */
  function smashHeld() {
    const id = runtime.held;
    if (!id) return false;
    const state = runtime.table.get(id);
    if (!state?.item?.smashNode) {
      /* The keys, which are the only thing on this table that is worth more
       * whole. Gratin stops him rather than the game refusing him quietly. */
      resume('smashKeys');
      return true;
    }
    const result = runtime.grill?.smash?.(id);
    clearHeldModel();
    runtime.held = null;
    const wreck = makeWreck(id);
    wreck.position.set(state.at.x, state.at.y + 0.004, state.at.z);
    scene?.add(wreck);
    runtime.litter.push(wreck);
    state.wreck = wreck;
    state.group.visible = false;
    sfx(SMASH_SOUND[id] ?? PENDING_SFX.SMASH_METAL, { volume: 0.7 });
    if (runtime.cord && runtime.phase === 'open') runtime.cord.root.visible = true;
    paintHand();
    if (result && !result.repeat) resume(state.item.smashNode);
    return true;
  }

  /* ---------------- the Family, borrowed off the floor ---------------- */

  /** Walk a Family member off the floor and into the room, remembering where. */
  function bringIn(id, mark) {
    const npc = family?.byId?.[id];
    if (!npc) return;
    runtime.parked.set(id, {
      x: npc.group.position.x,
      z: npc.group.position.z,
      yaw: npc.group.rotation.y,
      /* Both facings, because they are two different things. `rotation.y` is
       * where he is pointing this frame; `targetYaw` is where Npc.update is
       * easing him towards, and it survives being teleported. Restore only
       * the first and a member put back on the floor snaps to his stool and
       * then slowly turns to face a store room two rooms away. */
      targetYaw: npc.targetYaw,
      job: npc.job,
    });
    npc.job = 'stand';
    npc._syncJob?.(true);
    npc.group.position.set(mark.x, npc.group.position.y, mark.z);
    npc.group.rotation.y = mark.faceAt
      ? Math.atan2(mark.faceAt.x - mark.x, mark.faceAt.z - mark.z)
      : mark.yaw;
    /* Nail the visible facing too. `targetYaw` is what Npc.update eases
     * towards, and a member who came in from the floor still carries the one
     * he was using out there. */
    npc.targetYaw = npc.group.rotation.y;
  }

  function putBack(id) {
    const npc = family?.byId?.[id];
    const was = runtime.parked.get(id);
    if (!npc || !was) return;
    npc.job = was.job;
    npc._syncJob?.(true);
    npc.group.position.set(was.x, npc.group.position.y, was.z);
    npc.group.rotation.y = was.yaw;
    npc.targetYaw = was.targetYaw;
    runtime.parked.delete(id);
  }

  /** True while the door should offer the quest rather than the store room. */
  function available() {
    /* First visit only. The second visit is the HotDog party and its own
     * emergency; a man tied to a chair in the next room is not a thing to
     * discover halfway through carrying a body. */
    return !isSecondVisit && runtime.phase === 'closed' && !runtime.persisted;
  }

  /**
   * Put a crosshair on the man in the chair.
   *
   * This is the answer to "where do I start the torture sequence?". The scene
   * used to be a conversation and nothing else: nothing in the room could be
   * looked at, so once the conversation stopped — and it stops the moment you
   * step 6.5m away from the chair, which is most of this room — there was no
   * surface left to press [E] on. Blond now carries the same walk-up
   * interaction every other person in this building carries, and its label
   * says which part of the evening it is about to resume.
   */
  function mountBlond() {
    if (!interaction || !runtime.blond) return;
    runtime.targets.push(interaction.register(runtime.blond.group, {
      label: () => {
        if (runtime.stage === 'named') return 'Settle up with <b>James Blond</b>';
        if (runtime.stage === 'floor') return 'Work on <b>James Blond</b>';
        return 'Talk to <b>James Blond</b>';
      },
      /* Not while something of his is in your hands: [E] on the man while
       * holding his own watch would open a menu on top of a beat that is
       * already about the watch. */
      enabled: () => runtime.phase === 'open' && !runtime.held,
      onUse: () => resume(reentry()),
    }));
  }

  function unmountTargets() {
    if (!interaction) return;
    for (const target of runtime.targets) interaction.unregister?.(target);
    runtime.targets.length = 0;
  }

  /**
   * Open the store room. This does NOT move the player.
   *
   * It used to: `open()` set `player.position` and `player.yaw` onto a mark
   * beside the chair, so the door was a cut rather than a doorway and the
   * owner never got to walk in. Everything is arranged now and nothing is
   * teleported — Gratin and Numbskull take their marks, Blond is in the chair,
   * his effects are on the table, the radio is on, and the conversation waits
   * until Tony is actually standing in front of the man (see `update`).
   */
  function open() {
    if (!available()) return false;
    runtime.phase = 'open';
    runtime.stage = 'intro';
    runtime.handOff = null;
    runtime.arrived = false;
    runtime.grill = createInterrogation();
    runtime.blond = makeBlond(scene, club?.colliders);
    bringIn(CHARACTER_IDS.GRATIN, MARKS.gratin);
    bringIn(CHARACTER_IDS.NUMBSKULL, MARKS.numbskull);
    mountBlond();
    dressTable();

    /* The radio on the shelf, and it is the only thing in the room behaving
     * as though this is a normal Tuesday. Low, positional, and it does not
     * stop for any of it. */
    playSignatureTrack(audio, SIGNATURE_TRACKS.storeRoomJazz, {
      position: club?.anchors?.storeRadio,
      ref: 1.2,
      maxDist: 11,
      fade: 1.4,
    });
    /* The title card waits for Gratin. He shouts through the door on his own
     * as Tony comes down the hallway, and a caption landing on the same frame
     * as that would be the game talking over its own cast — see the doctrine's
     * "HUD instructions never replace a character". */
    instructAfterDialogue(`<em>${QUEST.title}.</em> Gratin holds the door and does not ask. `
      + 'There is a man in the chair at the back of the room.', 6000);
    return true;
  }

  function complete(ending) {
    if (runtime.phase !== 'open') return null;
    const cash = ending === ENDINGS.SHOT ? BLOND_CASH : 0;
    runtime.persisted = runtime.grill.finish(ending, { cash });
    if (cash) {
      addMoney(cash);
      hud?.toast(`Took $${cash} off him`, 'good');
    }
    if (runtime.persisted.card) {
      hud?.toast('“Licensed to Grill” — a novelty card', 'good');
    }
    onPersist(runtime.persisted, campaign);
    close();
    return runtime.persisted;
  }

  function close() {
    runtime.phase = 'done';
    runtime.handOff = null;
    runtime.pendingSay.length = 0;
    audio?.stopLoop?.('music.storeroom', 1.2);
    unmountTargets();
    putBack(CHARACTER_IDS.GRATIN);
    putBack(CHARACTER_IDS.NUMBSKULL);
    /* A no-op unless the room ended mid-interruption — a no-op is exactly
     * what putBack does for anyone it never parked. */
    putBack(CHARACTER_IDS.SHUBENATOR);
    /* Whatever is still in his hands goes back on the steel. Walking out of a
     * store room holding a dead man's pistol is a different game. */
    putBackHeld();
    /* And a cart tool goes back on the cart — it was never his to keep. */
    putBackTool();
    runtime.swing = -1;
    if (runtime.cord) {
      runtime.cord.root.visible = false;
      poseCord(runtime.cord, -1);
    }
    /* The cord itself stays in the inventory. He was handed it, he kept it,
     * and the bar at the bottom of the screen is allowed to remember that. */
    paintHand();
    if (runtime.blond) {
      /* He stays in the chair whatever the ending — tied, one hand free, or
       * not needing the chair any more. The room keeps him; the floor does
       * not get a barefoot man in a dinner jacket walking through it. */
      runtime.blond.job = 'sit';
      runtime.blond._syncJob?.(true);
    }
  }

  return {
    get phase() { return runtime.phase; },
    get state() { return runtime.grill?.state ?? null; },
    get persisted() { return runtime.persisted; },
    get blond() { return runtime.blond; },
    get hasCord() { return runtime.hasCord; },
    get held() { return runtime.held; },
    /** Whichever cart tool is currently in his hands, or null. */
    get tool() { return runtime.tool; },
    /** His effects, the pads over them, and any wreckage — for verification. */
    get props() { return runtime.litter; },
    /** id -> { group, pad, wreck, at } for whatever is on the table. */
    get table() { return runtime.table; },
    /** The first-person cord, once Gratin has handed it over. */
    get cord() { return runtime.cord; },
    script,
    available,
    open,
    close,
    /** The door's label, whichever thing it currently is. */
    doorLabel(fallback) {
      return available() ? `<b>${QUEST.door}</b>` : fallback;
    },

    /**
     * Is this Family member currently standing in the store room for us?
     *
     * The club registers ONE walk-up interaction per member, on the floor, at
     * scene build — and the quest borrows the men themselves rather than
     * building copies, so that one registration follows them through the door.
     * Which is exactly the owner's note: in the store room they were still
     * saying their floor lines. This is what the club asks before choosing
     * which script the man in front of you is in.
     */
    inRoom(characterId) {
      return runtime.phase === 'open' && runtime.parked.has(characterId);
    },

    /**
     * Start this member's store-room conversation. Returns false when he is
     * not in here, and the club falls back to his ordinary floor thread.
     */
    talkTo(characterId, npc = null) {
      if (!this.inRoom(characterId)) return false;
      const sceneTree = script[SCENE_TREES[characterId]];
      if (!sceneTree) return false;
      const speaker = npc ?? family?.byId?.[characterId] ?? null;
      /* Resumable, like every other walk-up in the club: step out of range
       * mid-answer and the next press picks it back up. Blond's own thread is
       * deliberately NOT resumable — see `reentry`. */
      dialogue?.start(sceneTree, 'open', speaker, { resume: true });
      return true;
    },

    /** The crosshair label for a member who is in here, or null for the floor. */
    npcLabel(characterId) {
      if (!this.inRoom(characterId)) return null;
      if (characterId === CHARACTER_IDS.GRATIN) return 'Ask <b>Au Gratin</b> what he wants';
      if (characterId === CHARACTER_IDS.NUMBSKULL) return 'Ask <b>Numbskull</b> about the table';
      return null;
    },

    /** Everything the club has to do to this per frame. */
    update(dt) {
      /* The shout through the door comes BEFORE any of it, and is the only
       * part of this that runs while the store room is still somebody else's.
       * It is the owner's *"I also didn't hear gratin yell when I went near
       * the door"* — the line has been written since the quest landed and
       * nothing ever played it. */
      if (runtime.phase === 'closed' && !runtime.shouted && available() && player) {
        const { x, z } = player.position;
        const inHallway = x >= HALLWAY.x0 && x <= HALLWAY.x1
          && z >= HALLWAY.z0 && z <= HALLWAY.z1;
        const d = Math.hypot(x - DOOR_AT.x, z - DOOR_AT.z);
        if (inHallway && d < DOOR_SHOUT_RANGE && !dialogue?.active) {
          runtime.shouted = true;
          dialogue?.start(script.licenseToGrillDoor, 'knocking', null);
          audio?.play('door.knob', {
            volume: 0.5,
            position: new THREE.Vector3(DOOR_AT.x, 1.4, DOOR_AT.z),
            muffle: 900,
          });
        }
      }

      if (runtime.phase !== 'open') return;

      /* The cord's readout follows him in and out of the room, and the whip
       * itself goes away with it — he is carrying it, not brandishing it
       * across the dance floor. */
      const here = inStoreRoom();
      if (runtime.cord) runtime.cord.root.visible = here && runtime.hasCord && !runtime.held && !runtime.tool;
      paintHand();

      /* The swing. One pass of `poseCord` per frame while it is running, and
       * the cord lands two thirds of the way through, which is where the throw
       * finishes and the tip has caught up with the hand.
       *
       * The clock runs whether or not there is a cord model to pose — a
       * headless harness has no camera to hang one off, and a swing that never
       * resolves would leave the button dead for the rest of the scene. */
      if (runtime.swing >= 0) {
        runtime.swing += dt / SWING_SECONDS;
        if (runtime.swing >= SWING_LANDS_AT) resolveSwing();
        if (runtime.swing >= 1) {
          runtime.swing = -1;
          if (runtime.cord) poseCord(runtime.cord, -1);
        } else if (runtime.cord) poseCord(runtime.cord, runtime.swing);
      }

      /* Walking in is what starts it. `open()` no longer teleports anybody, so
       * the introduction waits until Tony is genuinely in front of the chair
       * and there is nothing else being said. */
      if (!runtime.arrived && player && !dialogue?.active) {
        const d = Math.hypot(player.position.x - CHAIR.x, player.position.z - CHAIR.z);
        if (d < ARRIVAL_RANGE) {
          runtime.arrived = true;
          resume('open');
        }
      }

      /* A scene tree asked to give the player back to the chair. Wait for its
       * own last line to finish and close itself, then start Blond cleanly —
       * doing it from inside the tree would have Dialogue overwrite the new
       * thread the instant the handler returned. */
      if (runtime.handOff && !dialogue?.active) {
        const node = runtime.handOff;
        runtime.handOff = null;
        /* Being handed back past the scripted opening counts as having done
         * it — otherwise walking up to the chair afterwards would replay the
         * introduction over the top of a conversation already in progress. */
        if (runtime.stage === 'intro') runtime.stage = 'floor';
        resume(node);
      }

      /* And the queued lines, on the first frame after the character who set
       * them up has finished. Never on the same frame as his line, and never
       * two at once over the top of each other. */
      runtime.sayCooldown = Math.max(0, runtime.sayCooldown - dt);
      if (runtime.pendingSay.length && !dialogue?.active
        && runtime.handOff === null && runtime.sayCooldown <= 0) {
        const { text, ms } = runtime.pendingSay.shift();
        runtime.sayCooldown = ms / 1000;
        hud?.say(text, ms);
      }

      runtime.blond?.update(dt, player?.position ?? new THREE.Vector3());
    },

    /**
     * Left click: use what is in his hands.
     *
     * Holding one of Blond's things smashes it; holding a cart tool uses it
     * on him; holding the cord swings it. Returns true when it took the
     * press, and the club's own interaction ray never sees it. [E] is
     * untouched and still does every ordinary thing in this room, which is
     * what keeps one violent button from eating the doorknobs.
     *
     * All three are gated on being inside the store room. Tony keeps the
     * cord for the rest of the evening and left click is the club's second
     * interact key everywhere else in the building — being handed a length
     * of flex must not cost him the ability to click on a slot machine.
     */
    press() {
      if (runtime.phase !== 'open' || !inStoreRoom()) return false;
      if (runtime.held) return smashHeld();
      if (runtime.tool) return useTool();
      if (runtime.hasCord) return swingCord();
      return false;
    },

    /** [Q]: put down whatever of his you are holding, or whatever cart tool
     * is in his hands. */
    stepBack() {
      if (runtime.phase !== 'open') return false;
      if (runtime.held) return putBackHeld();
      if (runtime.tool) return putBackTool();
      return false;
    },
  };
}
