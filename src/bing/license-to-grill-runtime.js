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
 * walk through, a cord in your hands, five objects on a steel table, four
 * implements on a rolling cart, and a left mouse button that means "use what
 * you are holding". Landed blows carry the rules file's visible hit count into
 * wounds, impact spray and the seventh-hit fatal ending; breaking one of
 * Blond's possessions takes the mutually exclusive information route.
 */
import * as THREE from 'three';
import { CHARACTER_IDS } from '../core/campaign.js';
import {
  applyConnectedDeathPivot,
  beginDeathTransition,
} from '../core/death-transition.js';
import { SIGNATURE_TRACKS, playSignatureTrack } from '../core/signature-music.js';
import { WARDROBE } from '../core/wardrobe.js';
import { BloodImpactSystem, DeathBloodPool } from '../world/blood.js';
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
  /* Where Snow stands when the shout down the hallway lands (2026-08-19
   * playtest, the execution's aftermath). Just inside the door beside the
   * Shubenator's mark, mop-side, looking at the chair he is about to be
   * responsible for. He is borrowed off the hallway exactly the way Gratin,
   * Numbskull and Shubes are, and put back by `close()`. */
  snow: { x: 7.35, z: -10.35, faceAt: { x: 9.6, z: -12.3 } },
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
const TOOL_SWING_SECONDS = 0.58;
const TOOL_LANDS_AT = 0.56;

/**
 * The store-room door leaf, where the knock lands and Gratin waits.
 *
 * The shout itself carries the length of the corridor: the first cut kept a
 * 2.4 m circle at the door, sized to miss a player walking to Lou's own door
 * 2.7 m away -- and it missed everybody. The one required reason to be back
 * here is the briefing, so the only players who ever heard the line were the
 * ones already looking for it. The owner's call: the line IS the signpost, so
 * it fires for anyone who sets foot in the hallway. The hallway is still the
 * gate that matters -- it is the one place in the building where the dance
 * floor is behind a wall, so the voice cannot arrive through a door while the
 * player is looking straight at Gratin on his stool. And if the player is
 * quick enough to reach Lou mid-line, `dialogue.start` interrupts cleanly;
 * the briefing always wins. He is only teleported into the store room when
 * the door actually opens.
 */
const DOOR_AT = Object.freeze({ x: 6.75, z: -9.5 });
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
  /* The execution beat (2026-08-19 playtest): Numbskull's draw, the one
   * shot, and the body going slack against the restraints. */
  GUN_DRAW: 'bing.grill.gun.draw',
  GUN_SHOT: 'bing.grill.gun.shot',
  BODY_SLACK: 'bing.grill.body.slack',
});

/**
 * The execution's clock, in simulated seconds from the moment the player
 * chooses the only ending there is. Beat by beat:
 *   0.00  Numbskull's hand comes out from under his jacket with the pistol;
 *         the arm rises through RAISE
 *   RAISE the aim is level at Blond's face and it holds — long enough to be
 *         a decision, short enough that nobody mistakes it for one
 *   SHOT  one report, one muzzle flash, one mark on his face; the head
 *         starts down on the same frame
 *   SLUMP the head is fully down, the body slack against the ankle chain
 *   RESUME Gratin speaks (`endShot`) and the aftermath owns the room
 */
const EXECUTION_BEATS = Object.freeze({
  RAISE: 0.55,
  SHOT: 1.35,
  SLUMP: 2.2,
  RESUME: 2.7,
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

/**
 * Steel cuffs around Blond's seated ankles, joined by measured interlocking
 * links. The cuffs and chain share Blond's rig-root space, so rotating his
 * torso into the fatal slump cannot pull the chain away from his ankles.
 */
function shackleBlond(blond) {
  const rigRoot = blond?.group;
  const shins = [blond?.parts?.shinL, blond?.parts?.shinR];
  if (!rigRoot?.isObject3D || shins.some((shin) => !shin?.isObject3D)) return null;

  const steel = new THREE.MeshStandardMaterial({
    color: 0x565b62, roughness: 0.44, metalness: 0.86,
  });
  const cuffs = [];
  for (const [index, shin] of shins.entries()) {
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.016, 7, 20), steel);
    cuff.name = `grill.blond.ankle-cuff.${index === 0 ? 'left' : 'right'}`;
    cuff.position.set(0, -0.37, 0);
    cuff.rotation.x = Math.PI / 2;
    cuff.castShadow = true;
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.042, 0.028), steel);
    clasp.name = 'grill.blond.ankle-cuff.clasp';
    clasp.position.x = index === 0 ? 0.09 : -0.09;
    cuff.add(clasp);
    shin.add(cuff);
    cuffs.push(cuff);
  }

  blond.group.updateWorldMatrix(true, true);
  const cuffPoints = cuffs.map((cuff) => rigRoot.worldToLocal(
    cuff.getWorldPosition(new THREE.Vector3()),
  ));
  const delta = cuffPoints[1].clone().sub(cuffPoints[0]);
  const span = delta.length();
  const direction = delta.clone().normalize();
  const count = Math.max(5, Math.ceil(span / 0.045) + 1);
  const chain = new THREE.Group();
  chain.name = 'grill.blond.ankle-chain';
  rigRoot.add(chain);
  const links = [];
  const along = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < count; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.009, 6, 14), steel);
    link.name = 'grill.blond.ankle-chain-link';
    link.position.lerpVectors(cuffPoints[0], cuffPoints[1], i / (count - 1));
    link.quaternion.setFromUnitVectors(along, direction);
    if (i % 2) link.rotateX(Math.PI / 2);
    link.scale.x = 1.25;
    link.castShadow = true;
    chain.add(link);
    links.push(link);
  }
  chain.userData.measuredSpan = span;
  chain.userData.linkPitch = span / (count - 1);
  return { root: chain, cuffs, links, span };
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
    handle.name = 'grill.tool.tenderizer.handle';
    handle.position.y = -0.09;
    g.add(handle);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.06), M.steel);
    head.name = 'grill.tool.tenderizer.head';
    g.add(head);
    // The grid of pyramid studs that makes it read as a TENDERISER and not a
    // gavel — four rows of four on the striking face.
    for (let ix = 0; ix < 4; ix++) {
      for (let iy = 0; iy < 4; iy++) {
        const stud = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.012, 4), M.steel);
        stud.name = `grill.tool.tenderizer.stud.${ix}.${iy}`;
        stud.rotation.x = Math.PI / 2;
        stud.rotation.y = Math.PI / 4;
        stud.position.set(-0.0225 + ix * 0.015, -0.0335 + iy * 0.0225, 0.036);
        g.add(stud);
      }
    }
  } else if (id === 'ice') {
    // A frustum pail, two ear handles, and the ice standing proud of the rim.
    const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.075, 16), M.bucketBody);
    pail.name = 'grill.tool.ice.pail';
    g.add(pail);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 6, 16), M.steel);
    rim.name = 'grill.tool.ice.rim';
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.0375;
    g.add(rim);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 10, Math.PI), M.steel);
      ear.name = `grill.tool.ice.ear.${side < 0 ? 'left' : 'right'}`;
      ear.rotation.z = Math.PI / 2;
      ear.position.set(side * 0.052, 0.02, 0);
      g.add(ear);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), M.ice);
      cube.name = `grill.tool.ice.cube.${i}`;
      cube.position.set(Math.cos(a) * 0.018, 0.05, Math.sin(a) * 0.018);
      cube.rotation.set(a * 0.6, a, a * 0.4);
      g.add(cube);
    }
  } else if (id === 'tongs') {
    // Two arms off a common pivot, splayed the way a pair left on a cart is.
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8), M.steel);
    pivot.name = 'grill.tool.tongs.pivot';
    pivot.rotation.x = Math.PI / 2;
    pivot.position.y = 0.075;
    g.add(pivot);
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.name = `grill.tool.tongs.arm.${side < 0 ? 'left' : 'right'}`;
      arm.position.y = 0.075;
      arm.rotation.z = side * 0.16;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.15, 0.009), M.steel);
      bar.name = `${arm.name}.bar`;
      bar.position.y = -0.075;
      arm.add(bar);
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.03, 0.006), M.steel);
      paddle.name = `${arm.name}.paddle`;
      paddle.position.y = -0.155;
      paddle.rotation.z = -side * 0.16;
      arm.add(paddle);
      g.add(arm);
    }
  } else {
    // The sauce: a plain glass bottle, no label, a cap, and something red
    // enough inside it to be worth being suspicious of.
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.13, 14), M.bottleGlass);
    body.name = 'grill.tool.sauce.bottle';
    g.add(body);
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.09, 14), M.sauce);
    fill.name = 'grill.tool.sauce.fill';
    fill.position.y = -0.02;
    g.add(fill);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.024, 0.03, 14), M.bottleGlass);
    shoulder.name = 'grill.tool.sauce.shoulder';
    shoulder.position.y = 0.08;
    g.add(shoulder);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.03, 12), M.bottleGlass);
    neck.name = 'grill.tool.sauce.neck';
    neck.position.y = 0.11;
    g.add(neck);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.018, 12), M.cap);
    cap.name = 'grill.tool.sauce.cap';
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
  initialPersisted = null,
  addMoney = () => {},
  onPersist = () => {},
} = {}) {
  const restored = initialPersisted && typeof initialPersisted === 'object'
    && initialPersisted.completed === true
    ? { ...initialPersisted }
    : null;
  const runtime = {
    /** 'closed' while it is somebody else's store room. */
    phase: restored ? 'done' : 'closed',
    grill: null,
    blond: null,
    blondDeathTransition: null,
    restraints: null,
    /* Where the Family were standing before this started, so the floor is put
     * back exactly as it was rather than approximately. */
    parked: new Map(),
    persisted: restored,
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
     * 'intro' | 'floor' | 'breaking' | 'named'. `breaking` keeps a lapsed
     * property reaction routed into Blond's information; only `named`, marked
     * after the written-down beat, may re-enter beyond Vincent Mallard.
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
    toolSwing: -1,
    toolSwingLanded: false,
    /** What this quest last wrote into the shared HUD hand slot, or null. */
    handShown: null,
    /** id -> { group, pad, wreck, mark } for the five things on the table. */
    table: new Map(),
    /** id -> { group, pad, at } for the four physical tools on the cart. */
    cart: new Map(),
    /** Queued HUD lines, shown one at a time once nobody is talking. */
    pendingSay: [],
    sayCooldown: 0,
    /**
     * The staged execution (2026-08-19 playtest: the only ending). `phase`
     * walks idle → draw → aim → shot → settled on the simulated clock in
     * `EXECUTION_BEATS`; `t` is seconds since the draw. The gun and the
     * muzzle-flash light are built once, on first use, and reused.
     */
    execution: {
      phase: 'idle', t: 0, gun: null, flash: null, flashT: 0,
    },
    /** He is dead by the shot, not by the beating — `grill.dead` stays the
     * fatal-hits route's flag so the information survives being persisted. */
    executed: false,
    /** Ending banked by the tree, completed by update() once the last line
     * has closed itself — so nobody is teleported home mid-sentence. */
    pendingFinish: null,
  };
  const blood = scene?.add ? {
    impacts: new BloodImpactSystem(scene),
    pools: new DeathBloodPool(scene, { capacity: 2 }),
  } : null;
  /* Working vectors for the execution beat, allocated once with the quest —
   * the beat itself runs on the frame loop and must not allocate there. */
  const _execPoint = new THREE.Vector3();
  const _execFrom = new THREE.Vector3();

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
      // A compact pistol coming off a waistband: the pickup recording is the
      // closest thing in the building to steel leaving cloth.
      case PENDING_SFX.GUN_DRAW: audio?.play('gun.pickup', opts); break;
      // One indoor report. The heist's police shot is the loudest recorded
      // single gunshot in the library and this room is small and tiled.
      case PENDING_SFX.GUN_SHOT: audio?.play('heist.police.gunshot', opts); break;
      // Fabric settling: a body going slack in a dinner jacket is mostly the
      // jacket.
      case PENDING_SFX.BODY_SLACK: audio?.play('cloth.snap', opts); break;
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
    markNamed: () => { runtime.stage = 'named'; },
    threatenCar: () => {
      const broke = runtime.grill.threatenCar();
      if (broke) runtime.stage = 'breaking';
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
    execute: () => beginExecution(),
    callSnow: () => bringIn(CHARACTER_IDS.SNOW, MARKS.snow),
    /* Deferred, not immediate: `complete()` calls `close()`, and `close()`
     * teleports every borrowed actor home — which used to happen on the
     * option press, so Gratin delivered his outro line from his booth two
     * rooms away. The ending is banked here and `update()` completes it on
     * the first frame after the last line has closed itself. */
    finish: (ending) => { runtime.pendingFinish = ending; },
  });

  const tree = script[CHARACTER_IDS.JAMES_BLOND];

  /**
   * Who each of the thread's `who` names is, for Dialogue's mouth wiring.
   *
   * Blond's thread is the one conversation in the club with four people in
   * it, and it used to be started with Blond as its only speaker — so Blond's
   * jaw ran on Gratin's lines, Numbskull's asides and even Tony's own spoken
   * questions, while the men actually talking stood with dead faces. The map
   * names everybody with a face in the room; 'Prospect' is deliberately
   * absent, because Tony is the camera. Built per start rather than once,
   * because Gratin and company are borrowed off the floor and the roster can
   * differ by campaign state.
   */
  function storeRoomCast() {
    return {
      Blond: runtime.blond,
      Gratin: family?.byId?.[CHARACTER_IDS.GRATIN] ?? null,
      Numbskull: family?.byId?.[CHARACTER_IDS.NUMBSKULL] ?? null,
      'The Shubenator': family?.byId?.[CHARACTER_IDS.SHUBENATOR] ?? null,
      Snow: family?.byId?.[CHARACTER_IDS.SNOW] ?? null,
    };
  }

  function resume(node) {
    if (runtime.phase !== 'open') return;
    dialogue?.start(tree, node, runtime.blond, { cast: storeRoomCast() });
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
    if (runtime.stage === 'breaking' || runtime.grill?.broken) return 'breaks';
    if (runtime.stage === 'floor') return 'floor';
    return 'open';
  }

  /* ---------------- the cord ---------------- */

  /**
   * Gratin hands it over and it becomes Tony's.
   *
   * Owner's note: *"Gratin should hand me the cord and let it come to my
   * inventory like an item."* It takes a real slot in the club's five-slot bar
   * when one is free and stays equipped as the quest weapon when all five are
   * occupied; either way its model goes on the camera with every other carried
   * thing in this building.
   */
  function giveCord() {
    if (runtime.hasCord) return;
    runtime.hasCord = true;
    runtime.stage = 'floor';
    const stored = inventory?.add?.('cord');
    if (stored === false) {
      hud?.toast?.('Inventory full — the cord stays equipped in your hands.', '');
    }
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
    const cartState = runtime.cart.get(id);
    if (cartState) cartState.group.visible = false;
    if (camera) {
      runtime.toolModel = makeCartTool(id);
      /* Held out in front, roughly where the belongings ride — a tool from
       * the cart is looked at and aimed the same way a lifted watch is. */
      poseTool(-1);
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
    const cartState = runtime.cart.get(runtime.tool);
    if (cartState) cartState.group.visible = true;
    clearToolModel();
    runtime.tool = null;
    runtime.toolSwing = -1;
    runtime.toolSwingLanded = false;
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

  /** Camera-space wind-up, strike and settle for any implement off the cart. */
  function poseTool(progress) {
    const model = runtime.toolModel;
    if (!model) return;
    const p = progress < 0 ? 0 : Math.max(0, Math.min(1, progress));
    const ease = (value) => value * value * (3 - 2 * value);
    const wind = p < 0.35
      ? ease(p / 0.35)
      : 1 - ease((p - 0.35) / 0.65);
    const strikePhase = Math.max(0, Math.min(1, (p - 0.28) / 0.60));
    const strike = Math.sin(strikePhase * Math.PI);
    model.position.set(
      0.17 + wind * 0.055,
      -0.22 + wind * 0.10 - strike * 0.12,
      -0.38 - strike * 0.13,
    );
    model.rotation.set(
      -0.32 - wind * 1.05 + strike * 2.05,
      0.46 - strike * 0.22,
      0.10 + wind * 0.58 - strike * 0.82,
    );
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
    if (runtime.toolSwing >= 0) return true;
    runtime.toolSwing = 0;
    runtime.toolSwingLanded = false;
    sfx(PENDING_SFX.CORD_SWING, { volume: 0.34 });
    return true;
  }

  /** Resolve one tool impact at the frame the held model reaches Blond. */
  function resolveToolSwing() {
    if (runtime.toolSwingLanded) return;
    runtime.toolSwingLanded = true;
    const id = runtime.tool;
    const tool = CART_TOOLS.find((entry) => entry.id === id);
    if (!tool || !blondInReach()) {
      sfx(PENDING_SFX.CORD_MISS, {
        volume: 0.32,
        position: new THREE.Vector3(CHAIR.x, 0.9, CHAIR.z),
      });
      return;
    }
    const result = runtime.grill?.apply?.(id);
    markBodyHit(result);
    sfx(PENDING_SFX.CORD_WHIP, {
      volume: 0.56,
      position: new THREE.Vector3(CHAIR.x, 1.1, CHAIR.z),
    });
    runtime.blond?.say?.(0.8);
    if (result?.fatal) {
      finishFatalBlow();
      return;
    }
    if (!dialogue?.active) resume(result?.repeat ? 'swingAgain' : tool.node);
  }

  /** Put a shared wound and lower spatter at the actual seated body. */
  function markBodyHit(result) {
    if (!blood || !runtime.blond || !result?.hits) return null;
    const anchor = runtime.blond.parts?.body ?? runtime.blond.group;
    runtime.blond.group.updateWorldMatrix(true, true);
    const index = result.hits - 1;
    const point = anchor.localToWorld(new THREE.Vector3(
      ((index % 3) - 1) * 0.085,
      1.38 - (index % 2) * 0.14,
      0.18,
    ));
    const from = player
      ? new THREE.Vector3(player.position.x, 1.5, player.position.z)
      : point.clone().add(new THREE.Vector3(0, 0, 1));
    return blood.impacts.hit({
      actor: runtime.blond,
      anchor,
      spatterAnchor: anchor,
      point,
      from,
    });
  }

  /** Lock a readable final slump, spill at floor height, and close without info. */
  function finishFatalBlow() {
    if (!runtime.blond || runtime.phase !== 'open') return false;
    dialogue?.end?.('fatal');
    hud?.toast?.('Blond is dead — the information dies with him.', 'bad', 5200);
    const at = runtime.blond.group.getWorldPosition(new THREE.Vector3());
    blood?.pools.spill(at, {
      floorY: 0,
      size: 0.92,
      opacity: 0.9,
      seed: 707,
    });
    poseDeadBlond();
    complete(ENDINGS.BEATEN);
    return true;
  }

  function beginBlondDeath() {
    const blond = runtime.blond;
    if (!blond) return null;
    if (!runtime.blondDeathTransition?.active) {
      runtime.blondDeathTransition = beginDeathTransition(blond.group, {
        mode: 'seated',
        pivot: blond.parts.hips,
        stop: [() => blond.hush?.()],
      });
    }
    blond.hush?.();
    blond.job = 'dead';
    blond.group.userData.dead = true;
    if (blond.group.userData.npc) blond.group.userData.npc.dead = true;
    return runtime.blondDeathTransition;
  }

  function poseDeadBlond() {
    const blond = runtime.blond;
    const transition = beginBlondDeath();
    if (!blond || !transition) return;
    const { body, head, armL, armR, foreL, foreR } = blond.parts;
    /* `makePerson` keeps both legs beside `body`. Rotating or translating
     * only that branch tears the trunk away from the folded legs; pivot the
     * complete figure around its hips and leave the anatomy parent map alone. */
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    applyConnectedDeathPivot(transition, {
      rotationDelta: { x: 0.08, z: -0.18 },
      pivotOffset: { y: -0.015 },
    });
    head.rotation.set(0.5, 0, -0.24);
    armL.rotation.set(0.1, 0, -1.05);
    armR.rotation.set(0.1, 0, 1.05);
    foreL.rotation.set(0.25, 0, -0.12);
    foreR.rotation.set(0.25, 0, 0.12);
  }

  /* ---------------- the execution (2026-08-19 playtest) ----------------
   *
   * The only ending. Numbskull draws, one shot, a mark on Blond's face, and
   * the head goes down. Staged on the simulated clock (`EXECUTION_BEATS`),
   * driven from `update()` like the cord and the tools, with no per-frame
   * allocations — the gun, the flash light and the working vectors are all
   * built once and reused. */

  /** Put a compact pistol in Numbskull's right fist, built once. The model is
   * the same `makeBelonging('pistol')` the prep table uses — a second pistol
   * built somewhere else would be a second idea of what a pistol looks like.
   * Oriented barrel-down-the-forearm, the same frame the Ape knife uses. */
  function armNumbskull() {
    const numbskull = family?.byId?.[CHARACTER_IDS.NUMBSKULL];
    if (!numbskull?.parts?.foreR || runtime.execution.gun) return runtime.execution.gun ?? null;
    const gun = makeBelonging('pistol');
    gun.name = 'grill.numbskull.pistol';
    /* The belonging is modelled slide-along-+X; the forearm's own -Y runs
     * down into the fist and out past it, so a -90° roll about Z lays the
     * barrel along the forearm the way the raised arm will aim it. */
    gun.rotation.set(0, 0, -Math.PI / 2);
    gun.position.set(0.02, -0.4, 0.03);
    gun.visible = false;
    numbskull.parts.foreR.add(gun);
    runtime.execution.gun = gun;
    return gun;
  }

  function clearNumbskullGun() {
    const gun = runtime.execution.gun;
    if (!gun) return;
    gun.parent?.remove(gun);
    runtime.execution.gun = null;
  }

  /** Numbskull's arm through the draw: rest → raised one-handed aim. The
   * arm angles are the mansion's own pistol precedent (armed-pose.js's
   * one-handed raise), eased on this beat's clock. */
  function poseNumbskullAim(progress) {
    const numbskull = family?.byId?.[CHARACTER_IDS.NUMBSKULL];
    if (!numbskull?.parts?.armR) return;
    const p = Math.max(0, Math.min(1, progress));
    const ease = p * p * (3 - 2 * p);
    numbskull.parts.armR.rotation.set(-1.28 * ease, 0, 0.16 * ease);
    numbskull.parts.foreR.rotation.set(-0.16 * ease, 0, 0);
  }

  /** Blond's head going down: 0 is the shot frame, 1 is settled — chin on
   * the chest, shoulders slack against the chair, arms hanging on the ties. */
  function poseShotBlond(progress) {
    const blond = runtime.blond;
    if (!blond?.parts) return;
    const transition = beginBlondDeath();
    if (!transition) return;
    const p = Math.max(0, Math.min(1, progress));
    const ease = p * p * (3 - 2 * p);
    const { body, head, armL, armR, foreL, foreR } = blond.parts;
    head.rotation.set(0.66 * ease, 0, -0.10 * ease);
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    applyConnectedDeathPivot(transition, {
      rotationDelta: { x: 0.06 * ease, z: -0.035 * ease },
      pivotOffset: { y: -0.01 * ease },
    });
    armL.rotation.set(0.06 * ease, 0, -0.18 * ease);
    armR.rotation.set(0.06 * ease, 0, 0.18 * ease);
    foreL.rotation.set(0.10 * ease, 0, 0);
    foreR.rotation.set(0.10 * ease, 0, 0);
  }

  /** The shot frame: report, flash, the mark on his face, and the state. */
  function fireExecutionShot() {
    const blond = runtime.blond;
    const numbskull = family?.byId?.[CHARACTER_IDS.NUMBSKULL];
    sfx(PENDING_SFX.GUN_SHOT, {
      volume: 0.92,
      position: new THREE.Vector3(CHAIR.x, 1.3, CHAIR.z),
    });
    /* One reused light, the bullet system's own flash recipe: bright for a
     * frame or two, gone before anybody can look at it. */
    if (scene?.add && !runtime.execution.flash) {
      runtime.execution.flash = new THREE.PointLight(0xffd9a0, 0, 6, 2);
      runtime.execution.flash.visible = false;
      scene.add(runtime.execution.flash);
    }
    const flash = runtime.execution.flash;
    if (flash && runtime.execution.gun) {
      runtime.execution.gun.getWorldPosition(flash.position);
      flash.visible = true;
      flash.intensity = 9;
      runtime.execution.flashT = 0.06;
    }
    /* The mark on his FACE — attached to the head anchor so it stays on him
     * through the slump, from Numbskull's side of the room. */
    if (blood && blond?.parts?.head) {
      blond.group.updateWorldMatrix(true, true);
      _execPoint.set(0.02, 0.06, 0.09);
      blond.parts.head.localToWorld(_execPoint);
      if (numbskull) {
        _execFrom.set(numbskull.group.position.x, 1.5, numbskull.group.position.z);
      } else {
        _execFrom.copy(_execPoint).add(new THREE.Vector3(0.4, 0.3, 0.4));
      }
      blood.impacts.hit({
        actor: blond,
        anchor: blond.parts.head,
        point: _execPoint,
        from: _execFrom,
        spatter: false,
      });
      /* And the drain gets its work: a modest pool finds the floor under the
       * chair a beat later, while the room is still quiet. */
      blood.pools.spill(blond.group.getWorldPosition(_execPoint), {
        floorY: 0, size: 0.62, opacity: 0.86, delay: 0.6, seed: 909,
      });
    }
    runtime.executed = true;
    if (blond) {
      beginBlondDeath();
    }
  }

  /** Start the beat. Fired by the tree's only ending option. */
  function beginExecution() {
    if (runtime.phase !== 'open' || runtime.execution.phase !== 'idle') return false;
    runtime.execution.phase = 'draw';
    runtime.execution.t = 0;
    const numbskull = family?.byId?.[CHARACTER_IDS.NUMBSKULL];
    numbskull?.faceToward?.(CHAIR.x, CHAIR.z, true);
    const gun = armNumbskull();
    if (gun) gun.visible = true;
    sfx(PENDING_SFX.GUN_DRAW, {
      volume: 0.5,
      position: numbskull
        ? new THREE.Vector3(numbskull.group.position.x, 1.2, numbskull.group.position.z)
        : undefined,
    });
    return true;
  }

  /** The beat's per-frame clock. Runs from `update()` while phase is open. */
  function updateExecution(dt) {
    const beat = runtime.execution;
    if (beat.flashT > 0 && beat.flash) {
      beat.flashT -= dt;
      beat.flash.intensity = Math.max(0, beat.flash.intensity - dt * 190);
      if (beat.flashT <= 0 || beat.flash.intensity <= 0) {
        beat.flash.visible = false;
        beat.flash.intensity = 0;
        beat.flashT = 0;
      }
    }
    if (beat.phase === 'idle' || beat.phase === 'settled') return;
    beat.t += dt;
    if (beat.phase === 'draw') {
      poseNumbskullAim(beat.t / EXECUTION_BEATS.RAISE);
      if (beat.t >= EXECUTION_BEATS.RAISE) beat.phase = 'aim';
    }
    if (beat.phase === 'aim' && beat.t >= EXECUTION_BEATS.SHOT) {
      fireExecutionShot();
      beat.phase = 'shot';
    }
    if (beat.phase === 'shot') {
      const settle = (beat.t - EXECUTION_BEATS.SHOT)
        / (EXECUTION_BEATS.SLUMP - EXECUTION_BEATS.SHOT);
      poseShotBlond(settle);
      if (beat.t >= EXECUTION_BEATS.SLUMP) {
        /* The jacket settles on the restraints as the last thing that moves. */
        sfx(PENDING_SFX.BODY_SLACK, {
          volume: 0.4,
          position: new THREE.Vector3(CHAIR.x, 0.9, CHAIR.z),
        });
        poseNumbskullAim(0);
        if (runtime.execution.gun) runtime.execution.gun.visible = false;
      }
      if (beat.t >= EXECUTION_BEATS.RESUME && !dialogue?.active) {
        beat.phase = 'settled';
        resume('endShot');
      }
    }
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
    const result = runtime.grill?.apply('strike');
    markBodyHit(result);
    sfx(PENDING_SFX.CORD_WHIP, { volume: 0.62, position: chairAt });
    runtime.blond?.say?.(1.2);
    if (result?.fatal) {
      finishFatalBlow();
      return;
    }
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
   * Put every usable implement on the rolling cart as a real interaction.
   *
   * The cart used to be scenery backed by a dialogue submenu. That made its
   * tools impossible to pick up by looking at them, even though the visible
   * cart was within arm's reach. These are the same models Tony carries, laid
   * out at the authored cart anchor and registered through the room's normal
   * interaction system: [E] picks one up; the mouse never does.
   */
  function dressCart() {
    const at = club?.anchors?.grillCart;
    if (!at || !scene || !interaction || runtime.cart.size) return;
    const yaw = club?.storeroom?.cart?.rotation?.y ?? -0.34;
    const layouts = Object.freeze({
      tenderizer: { x: -0.27, y: 0.07, z: -0.08, rot: [0, 0, Math.PI / 2] },
      ice: { x: -0.08, y: 0.075, z: 0.08, rot: [0, 0, 0] },
      tongs: { x: 0.13, y: 0.055, z: -0.04, rot: [Math.PI / 2, 0, 0.18] },
      sauce: { x: 0.31, y: 0.13, z: 0.04, rot: [0, 0, 0] },
    });
    const worldAt = (local) => ({
      x: at.x + Math.cos(yaw) * local.x + Math.sin(yaw) * local.z,
      y: at.y + local.y,
      z: at.z - Math.sin(yaw) * local.x + Math.cos(yaw) * local.z,
    });

    for (const tool of CART_TOOLS) {
      const layout = layouts[tool.id];
      const world = worldAt(layout);
      const group = makeCartTool(tool.id);
      group.name = `grill.cart-tool.${tool.id}`;
      group.position.set(world.x, world.y, world.z);
      group.rotation.set(...layout.rot);
      group.rotation.y += yaw;
      scene.add(group);
      runtime.litter.push(group);

      const pad = makePad(0.22, 0.25, 0.22);
      pad.name = `grill.cart-target.${tool.id}`;
      pad.position.set(world.x, at.y + 0.14, world.z);
      scene.add(pad);
      runtime.litter.push(pad);
      runtime.cart.set(tool.id, { tool, group, pad, at: world });

      runtime.targets.push(interaction.register(pad, {
        label: () => `Pick up <b>${tool.label.toLowerCase()}</b>`,
        enabled: () => runtime.phase === 'open' && runtime.held === null
          && runtime.tool === null && group.visible,
        onUse: () => giveTool(tool.id),
      }));
    }
  }

  /**
   * Lay a man out on a steel table.
   *
   * This is the owner's structural note made physical. It used to be a
   * dialogue node called `things` with five nouns under it; it is now five
   * objects on the prep table by the door, each with its own pad to aim at and
   * its own exchange when it comes off the steel. Picking one up still records
   * that possession's authored reaction; breaking the first valid one commits
   * the information route.
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
   * The first valid possession broken secures the information route. What it
   * buys is the coldest writing in the room and the discovery that the man who
   * laughed through a beating has a floor after all.
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
    if (result?.broke) runtime.stage = 'breaking';
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
    /* Already in here for us — Gratin and Numbskull are pre-staged in the
     * room from scene build (see `holdCastInBackRoom`), and re-parking them
     * would overwrite their remembered FLOOR marks with their room marks. */
    if (runtime.parked.has(id)) return;
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
   * Gratin and Numbskull are NOT on the Bing floor before the store-room
   * scene (owner, 2026-08-19 playtest): a man who caught a spy at seven
   * o'clock is in the back room with him, not drinking at his booth. They
   * are moved onto their room marks the moment the quest mounts, and their
   * FLOOR spots — where the family roster seated them — are what `bringIn`
   * remembers, so `close()` sends them out to take their usual places only
   * once the room is dealt with. A completed save skips all of it and the
   * floor keeps them from the start, which is `available()` doing the gating.
   */
  function holdCastInBackRoom() {
    if (!available()) return;
    bringIn(CHARACTER_IDS.GRATIN, MARKS.gratin);
    bringIn(CHARACTER_IDS.NUMBSKULL, MARKS.numbskull);
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
        if (runtime.stage === 'breaking') return 'Hear <b>James Blond</b> out';
        if (runtime.stage === 'floor') return 'Work on <b>James Blond</b>';
        return 'Talk to <b>James Blond</b>';
      },
      /* Not while something of his is in your hands: [E] on the man while
       * holding his own watch would open a menu on top of a beat that is
       * already about the watch. And not once Numbskull has drawn — from
       * that moment the room belongs to the staged beat, and afterwards to
       * the aftermath; there is nobody left to talk to in the chair. */
      enabled: () => runtime.phase === 'open' && !runtime.held
        && !runtime.executed && runtime.execution.phase === 'idle',
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
    blood?.impacts.reset();
    blood?.pools.reset();
    runtime.blond = makeBlond(scene, club?.colliders);
    runtime.restraints = shackleBlond(runtime.blond);
    bringIn(CHARACTER_IDS.GRATIN, MARKS.gratin);
    bringIn(CHARACTER_IDS.NUMBSKULL, MARKS.numbskull);
    mountBlond();
    dressCart();
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

  /* Before the first frame: the two of them are already in the back room
   * with the man they caught — see `holdCastInBackRoom`. */
  holdCastInBackRoom();

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
    runtime.pendingFinish = null;
    runtime.pendingSay.length = 0;
    audio?.stopLoop?.('music.storeroom', 1.2);
    unmountTargets();
    putBack(CHARACTER_IDS.GRATIN);
    putBack(CHARACTER_IDS.NUMBSKULL);
    /* A no-op unless the room ended mid-interruption — a no-op is exactly
     * what putBack does for anyone it never parked. */
    putBack(CHARACTER_IDS.SHUBENATOR);
    /* Snow goes back to his hallway; the mop work is a graveyard-shift
     * problem, not a rendered one. The pistol does not leave the room on
     * Numbskull's arm either. */
    putBack(CHARACTER_IDS.SNOW);
    clearNumbskullGun();
    if (runtime.execution.flash) {
      runtime.execution.flash.visible = false;
      runtime.execution.flash.intensity = 0;
      runtime.execution.flashT = 0;
    }
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
      /* He stays in the chair whatever the ending — the room keeps him; the
       * floor does not get a barefoot man in a dinner jacket walking through
       * it. Beaten takes the sideways slump; shot keeps the settled
       * head-down pose the execution beat already put him in. */
      if (runtime.grill?.dead) poseDeadBlond();
      else if (runtime.executed) poseShotBlond(1);
      else {
        runtime.blond.job = 'sit';
        runtime.blond._syncJob?.(true);
      }
    }
  }

  return {
    get phase() { return runtime.phase; },
    get state() { return runtime.grill?.state ?? null; },
    get persisted() { return runtime.persisted; },
    get blond() { return runtime.blond; },
    get restraints() { return runtime.restraints; },
    get hasCord() { return runtime.hasCord; },
    get held() { return runtime.held; },
    /** Whichever cart tool is currently in his hands, or null. */
    get tool() { return runtime.tool; },
    get toolSwing() { return runtime.toolSwing; },
    get blood() { return blood; },
    /** The staged execution's clock and props, for tests and the verifier. */
    get execution() { return runtime.execution; },
    /** Dead by Numbskull's shot — distinct from `state.dead`, the beating. */
    get executed() { return runtime.executed; },
    /** His effects, the pads over them, and any wreckage — for verification. */
    get props() { return runtime.litter; },
    /** id -> { group, pad, wreck, at } for whatever is on the table. */
    get table() { return runtime.table; },
    /** id -> { group, pad, at } for the physical torture-cart implements. */
    get cart() { return runtime.cart; },
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
      /* Evidence keeps animating after the quest completes: the fatal call
       * flips phase to done immediately, while the bounded floor pool still
       * has a full growth cycle to finish. */
      blood?.impacts.update(dt);
      blood?.pools.update(dt);
      /* The shout through the door comes BEFORE any of it, and is the only
       * part of this that runs while the store room is still somebody else's.
       * It is the owner's *"I also didn't hear gratin yell when I went near
       * the door"* — the line has been written since the quest landed and
       * nothing ever played it. */
      if (runtime.phase === 'closed' && !runtime.shouted && available() && player) {
        const { x, z } = player.position;
        const inHallway = x >= HALLWAY.x0 && x <= HALLWAY.x1
          && z >= HALLWAY.z0 && z <= HALLWAY.z1;
        if (inHallway && !dialogue?.active) {
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

      /* A cart implement has its own wind-up and one impact frame. Applying
       * the rules here keeps a dialogue choice or mouse-down from becoming a
       * hit before the object visibly reaches Blond. */
      if (runtime.toolSwing >= 0) {
        runtime.toolSwing += dt / TOOL_SWING_SECONDS;
        poseTool(runtime.toolSwing);
        if (runtime.toolSwing >= TOOL_LANDS_AT) resolveToolSwing();
        if (runtime.toolSwing >= 1) {
          runtime.toolSwing = -1;
          runtime.toolSwingLanded = false;
          poseTool(-1);
        }
      }

      /* The execution beat: Numbskull's draw, the shot, the slump, and the
       * hand-back to `endShot`. Same clock discipline as the two swings. */
      updateExecution(dt);

      /* A fatal impact can close the quest from inside either animation.
       * Nothing below this point may restart dialogue or run Npc.update over
       * the locked dead pose on that same frame. */
      if (runtime.phase !== 'open') return;

      /* An ending banked by the tree completes once its last line has closed
       * itself — completing on the option press teleported the whole cast
       * home in the middle of Gratin's own outro. */
      if (runtime.pendingFinish && !dialogue?.active) {
        const ending = runtime.pendingFinish;
        runtime.pendingFinish = null;
        complete(ending);
        return;
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

      /* Not once he is shot: Npc.update clears head/body rotations every
       * tick and would sit the settled slump back upright. The beaten route
       * never reaches here because its phase flips to done on the hit. */
      if (!runtime.executed) runtime.blond?.update(dt, player?.position ?? new THREE.Vector3());
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
      if (!inStoreRoom()) return false;
      /* The body remains in the room after the fatal close; its left button
       * must not turn back into E and interact through the corpse. The
       * executed ending leaves one in the chair too. */
      if (runtime.grill?.dead || runtime.executed) return true;
      /* And from the moment Numbskull's hand comes out, the room is his. */
      if (runtime.execution.phase !== 'idle') return true;
      if (runtime.phase !== 'open') return false;
      /* Breaking one possession has already secured the information route.
       * Consume violent input while the authored response resolves so a
       * queued swing cannot undercut or visually contradict that success. */
      if (runtime.grill?.broken) return true;
      if (runtime.held) return smashHeld();
      if (runtime.tool) return useTool();
      if (runtime.hasCord) return swingCord();
      /* Empty hands still belong to the attack layer in this room. Returning
       * false would make main.js fall through to InteractionSystem.press(),
       * turning left mouse into a second [E] for pickups and conversations. */
      return true;
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
