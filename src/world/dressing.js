/**
 * What the flat looks like on each morning of the campaign.
 *
 * The apartment used to be a photograph. The chapter turned, the calls
 * changed, the objectives changed, the wake line changed -- and the room did
 * not, so from inside it every morning was the first one. This is the layer
 * that fixes that, and the shape of it matters more than the props in it.
 *
 * ONE flat that accumulates, not four sets. Every dressing piece is built once
 * at load and then shown or hidden, and what is shown is folded from the
 * chapter list in order: a piece added on Day Two is still there on Day Four
 * unless a later chapter explicitly takes it away. That is what makes it read
 * as a place somebody lives in rather than four rooms with the same wallpaper.
 *
 * Nothing here keeps state of its own. `visibleAt(chapter)` is a pure fold over
 * CHAPTER_ORDER, so the room is a function of the campaign's own chapter and
 * cannot drift out of step with it across a reload, a sleep, or a checkpoint
 * restore. If the save says `date`, the flat is the `date` flat, full stop.
 */
import * as THREE from 'three';
import { box, cylinder, group, mat, plane, sphere } from './build.js';
import { restyleMargoHead } from '../silver/margo.js';

/** The campaign's chapters, in the order sleeping walks through them. */
export const CHAPTER_ORDER = Object.freeze([
  'day_one', 'day_two', 'no_wake', 'date', 'big_night', 'golf_morning',
  'heist_day', 'post_heist',
]);

/**
 * The table.
 *
 * `adds` are dressing ids that appear on that morning and stay. `removes` are
 * ids that are gone from that morning on -- including things the base flat
 * builds, which is how Willy leaves. `air` is the weather and the light, which
 * is dressing too: the difference between Day Two and Day Three is mostly that
 * one of them is raining.
 *
 * Nothing in `adds` is a trophy before he has earned it. Day One is
 * deliberately the thinnest entry in here: an anonymous flat with a day job.
 */
export const DAY_DRESSING = Object.freeze({
  /* "Welcome to the Life." Nobody has asked him for anything yet. The only
   * thing in the flat that says anything about who he is is the lanyard for
   * the job he is about to stop turning up to. */
  day_one: Object.freeze({
    title: 'Welcome to the Life',
    adds: Object.freeze(['lanyard', 'willyPhoto']),
    removes: Object.freeze([]),
    air: Object.freeze({ rain: 0, tint: 1, warmth: 1 }),
  }),

  /* "Trusted With Business." Last night happened. There is money that was not
   * there yesterday and a message on the machine; the floor stays clear. */
  day_two: Object.freeze({
    title: 'Trusted With Business',
    adds: Object.freeze(['bloodShirt', 'cashSmall', 'bingMatches']),
    // He replied to HR. He is not going back, and the badge went in a drawer.
    removes: Object.freeze(['lanyard']),
    air: Object.freeze({ rain: 0, tint: 1, warmth: 1 }),
  }),

  /* "Loyalty Gets Ugly." Grey, wet, and quieter than it should be. The motel
   * left a key on the sideboard and Willy has come off the fridge door, and
   * nobody says a word about either. */
  no_wake: Object.freeze({
    title: 'Loyalty Gets Ugly',
    adds: Object.freeze(['motelKey', 'cashMid', 'casualJacket', 'willyGap']),
    /* Willy comes off the fridge door between Day Two and Day Three. Nobody
     * takes it down on screen and nobody mentions it. What is left is the
     * magnet and a clean rectangle where the sun did not get at the paint. */
    removes: Object.freeze(['willyPhoto']),
    air: Object.freeze({ rain: 1, tint: 0.48, warmth: 0.35 }),
  }),

  /* He returns from the harbor into the same wet afternoon. The chapter
   * changes because he did; the weather and room do not reset around him. */
  date: Object.freeze({
    title: 'Front and Center',
    adds: Object.freeze([]),
    removes: Object.freeze([]),
    air: Object.freeze({ rain: 1, tint: 0.48, warmth: 0.35 }),
  }),

  /* "The Peak." The den of a newly minted Squatch criminal: money, clothes,
   * hardware, souvenirs, and one extremely questionable laundry basket. */
  big_night: Object.freeze({
    title: 'The Peak',
    adds: Object.freeze([
      'cashStacks', 'suitBag', 'gunCase', 'jerkyHaul', 'silverMatches', 'laundryHeap',
    ]),
    removes: Object.freeze([]),
    air: Object.freeze({ rain: 0, tint: 1, warmth: 1.08 }),
  }),

  /* The same accumulated Day Four flat, before Lou turns it into an armoury.
   * Keeping this after `big_night` in the fold preserves the cash, clothes and
   * souvenirs at the wake while the actual heist loadout remains exclusive to
   * `heist_day`, after the round. */
  golf_morning: Object.freeze({
    title: 'A Morning at Silver Pines',
    adds: Object.freeze([]),
    removes: Object.freeze([]),
    air: Object.freeze({ rain: 0, tint: 1, warmth: 1.04 }),
  }),

  heist_day: Object.freeze({
    title: 'The Take',
    adds: Object.freeze([
      'heistArmor', 'heistGloves', 'heistMask', 'heistCarbine',
      'heistSidearm', 'heistMagazines', 'heistDuffel',
    ]),
    removes: Object.freeze([]),
    air: Object.freeze({ rain: 0, tint: 0.82, warmth: 0.92 }),
  }),

  post_heist: Object.freeze({
    title: 'After the Take',
    adds: Object.freeze(['heistWash', 'heistChange', 'heistGearSecured', 'heistCut']),
    removes: Object.freeze([
      'heistArmor', 'heistGloves', 'heistMask', 'heistCarbine',
      'heistSidearm', 'heistMagazines', 'heistDuffel',
    ]),
    air: Object.freeze({ rain: 0, tint: 0.72, warmth: 0.78 }),
  }),
});

/**
 * Everything that should be on show on a given morning, and everything the
 * base flat has to take down.
 *
 * Folds forward through CHAPTER_ORDER, so this is the whole accumulation rule
 * in one place. An unknown chapter falls back to the first one rather than to
 * an empty room -- a save from the future should look like a flat, not a void.
 *
 * @param {string} chapter campaign story chapter
 * @returns {{shown: Set<string>, hidden: Set<string>, air: object, title: string}}
 */
export function dressingFor(chapter) {
  const upTo = CHAPTER_ORDER.indexOf(chapter);
  const last = upTo < 0 ? 0 : upTo;
  const shown = new Set();
  const hidden = new Set();
  let air = DAY_DRESSING[CHAPTER_ORDER[0]].air;
  let title = DAY_DRESSING[CHAPTER_ORDER[0]].title;
  for (let i = 0; i <= last; i++) {
    const step = DAY_DRESSING[CHAPTER_ORDER[i]];
    for (const id of step.adds) { shown.add(id); hidden.delete(id); }
    for (const id of step.removes) { shown.delete(id); hidden.add(id); }
    air = step.air;
    title = step.title;
  }
  return { shown, hidden, air, title };
}

/**
 * Every dressing id the table can name, so a verifier can assert the room is
 * actually different on each morning without hardcoding the list twice.
 */
export function allDressingIds() {
  const ids = new Set();
  for (const step of Object.values(DAY_DRESSING)) {
    for (const id of step.adds) ids.add(id);
    for (const id of step.removes) ids.add(id);
  }
  return [...ids];
}

/**
 * Souvenirs earned by missions rather than by reaching a calendar chapter.
 *
 * These are deliberately folded from campaign truth on every apartment boot:
 * returning from a mission, reloading, and advancing to a later morning all
 * produce the same shelf. A trophy never appears before it was earned.
 */
export function persistentDressingForCampaign(state = {}) {
  const shown = new Set();
  if (state.missions?.airstrip_smuggling?.status === 'complete') shown.add('tammyDashboardMug');
  return shown;
}

/* ------------------------------------------------------------------ */
/* The props themselves                                                */
/* ------------------------------------------------------------------ */

const NOTE_GREEN = 0x5c7a56;
const NOTE_PALE = 0xcfd4c2;

/**
 * Banded bundles of notes. `n` is how many are in the pile.
 *
 * Cut edges outward and one printed note on top of each bundle, because that
 * is the only bit of a banded stack you actually see -- a solid green brick
 * reads as a green brick and gets ignored in a dim room.
 */
function cash(M, { x, y, z, rotY = 0, n = 1, wide = false }) {
  const g = group('cash');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const w = wide ? 0.155 : 0.135;
  const d = wide ? 0.072 : 0.064;
  const edge = mat({ color: NOTE_PALE, roughness: 1 });
  const face = mat({ color: NOTE_GREEN, roughness: 0.9 });
  const band = mat({ color: 0xb8452f, roughness: 0.75 });
  for (let i = 0; i < n; i++) {
    const h = 0.022 + (i % 3) * 0.005;
    const sx = ((i * 31) % 7) / 7 * 0.05 - 0.025;
    const sz = ((i * 17) % 5) / 5 * 0.04 - 0.02;
    const y0 = i * 0.028;
    const spin = ((i * 13) % 9) / 9 * 0.5 - 0.25;
    g.add(box({ size: [w, h, d], pos: [sx, y0 + h / 2, sz], mat: edge, rotY: spin }));
    g.add(box({ size: [w * 0.98, 0.0016, d * 0.98], pos: [sx, y0 + h + 0.0008, sz], mat: face, rotY: spin }));
    g.add(box({ size: [0.016, h * 1.06, d * 1.03], pos: [sx, y0 + h / 2, sz], mat: band, rotY: spin }));
  }
  return g;
}

/** Corporate ID on a printed lanyard, hooked over the corner of something. */
function lanyard(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:lanyard');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const tape = mat({ color: 0x2b3f6b, roughness: 0.95 });
  // A loop of tape, folded rather than hanging: it is lying on a nightstand.
  for (const [dx, dz, r] of [[-0.05, 0.01, 0.5], [0.03, -0.02, -0.9], [0.06, 0.04, 0.2]]) {
    g.add(box({ size: [0.16, 0.003, 0.014], pos: [dx, 0.002, dz], mat: tape, rotY: r }));
  }
  const card = box({
    size: [0.055, 0.002, 0.086], pos: [0.02, 0.005, 0.03],
    mat: mat({ color: 0xf1eee4, roughness: 0.85 }), rotY: 0.35,
  });
  g.add(card);
  // The blue band across the top of every corporate badge ever printed.
  g.add(box({
    size: [0.055, 0.0016, 0.022], pos: [0.02, 0.0072, 0.062],
    mat: mat({ color: 0x2b6bb0, roughness: 0.8 }), rotY: 0.35,
  }));
  return g;
}

/** The shirt he wore to the Squatchfather, stepped out of and left there. */
function bloodShirt(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:bloodShirt');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  /* A pale shirt, because the previous charcoal fabric disappeared into the
   * flat's charcoal floor and read as generic rubbish even in full light. The
   * blood is dark enough to stay ugly but red enough to read from the bed. */
  const cloth = mat({ color: 0xb9b5ac, roughness: 1 });
  const clothShade = mat({ color: 0x817f7a, roughness: 1 });
  const stain = mat({ color: 0x71151a, roughness: 1 });
  // A torso and two collapsed sleeves: a discarded shirt, not three boxes.
  for (const [dx, dz, sx, sz, r] of [
    [0, 0, 0.40, 0.31, 0.1], [0.20, 0.04, 0.32, 0.13, -0.52], [-0.20, 0.02, 0.31, 0.13, 0.62],
  ]) {
    const m = box({ size: [sx, 0.055, sz], pos: [dx, 0.028, dz], mat: cloth, rotY: r });
    m.scale.y = 0.9;
    g.add(m);
  }
  // Collar and open front keep the heap recognisable as clothing.
  g.add(box({ size: [0.16, 0.025, 0.07], pos: [0.01, 0.061, -0.12], mat: clothShade, rotY: 0.10 }));
  g.add(box({ size: [0.025, 0.012, 0.25], pos: [0.015, 0.065, 0.01], mat: clothShade, rotY: 0.08 }));
  // Two dark patches down the front of it. Not discussed.
  for (const [dx, dz, r] of [[0.02, -0.04, 0.075], [-0.05, 0.05, 0.052], [0.18, 0.04, 0.035]]) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(r, 12), stain);
    s.rotation.x = -Math.PI / 2;
    s.position.set(dx, 0.067, dz);
    g.add(s);
  }
  return g;
}

/** A book of matches from a club. Flat, tiny, and the first souvenir. */
function matchbook(M, { x, y, z, rotY = 0, colour = 0x8c1f2b }) {
  const g = group('dress:matches');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(box({ size: [0.043, 0.006, 0.038], pos: [0, 0.003, 0], mat: mat({ color: colour, roughness: 0.75 }) }));
  g.add(box({
    size: [0.043, 0.0018, 0.014], pos: [0, 0.0069, -0.011],
    mat: mat({ color: 0xe7dfcc, roughness: 1 }),
  }));
  return g;
}

/** The Jerky Motel's room key, on a plastic fob nobody handed back. */
function motelKey(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:motelKey');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(box({
    size: [0.052, 0.008, 0.028], pos: [0, 0.004, 0],
    mat: mat({ color: 0xc4762c, roughness: 0.6 }),
  }));
  g.add(box({
    size: [0.010, 0.0022, 0.052], pos: [0.036, 0.0026, 0.0],
    mat: mat({ color: 0xbfc4c9, roughness: 0.3, metalness: 0.8 }),
  }));
  return g;
}

/** Tammy's cockpit mug from Beef Run, brought home beside the gaming PC. */
function tammyDashboardMug(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:tammyDashboardMug');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const ceramic = mat({ color: 0xe5dfd2, roughness: 0.58 });
  const coffee = mat({ color: 0x2b1810, roughness: 0.72 });

  const cup = cylinder({ r: 0.052, h: 0.105, pos: [0, 0.053, 0], mat: ceramic });
  cup.name = 'tammy-mug';
  g.add(cup);
  const drink = cylinder({ r: 0.046, h: 0.003, pos: [0, 0.106, 0], mat: coffee, cast: false });
  drink.name = 'tammy-mug-coffee';
  g.add(drink);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.041, 0.008, 7, 16, Math.PI * 1.65), ceramic);
  handle.name = 'tammy-mug-handle';
  handle.position.set(0.054, 0.060, 0);
  handle.rotation.y = Math.PI / 2;
  handle.rotation.z = -Math.PI * 0.82;
  g.add(handle);

  /* Match the cockpit prop's cream-and-burgundy TAMMY mark. At mug scale a
   * few geometry bars read as a generic badge; the actual name is the visual
   * continuity players can recognise when the keepsake appears at home. */
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const context = canvas.getContext('2d');
  context.fillStyle = '#e8e2d4';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#7d2432';
  context.font = '700 44px Georgia, serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('TAMMY', canvas.width / 2, canvas.height / 2 + 2);
  const labelTexture = new THREE.CanvasTexture(canvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const label = plane(0.078, 0.026, new THREE.MeshBasicMaterial({ map: labelTexture }));
  label.name = 'tammy-mug-label';
  label.position.set(0, 0.064, 0.0525);
  g.add(label);

  g.userData.label = 'Tammy’s Dashboard Mug';
  g.userData.continuityName = 'tammy-mug';
  return g;
}

/** A jacket thrown over the back of the desk chair. Casual, as instructed. */
function casualJacket(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:casualJacket');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const denim = mat({ color: 0x3c4a5e, roughness: 1 });
  g.add(box({ size: [0.42, 0.30, 0.05], pos: [0, 0, 0], mat: denim }));
  g.add(box({ size: [0.40, 0.05, 0.12], pos: [0, 0.145, 0.045], mat: denim }));
  // A sleeve down one side.
  const sleeve = box({ size: [0.09, 0.34, 0.05], pos: [-0.19, -0.16, 0.01], mat: denim });
  sleeve.rotation.z = 0.22;
  g.add(sleeve);
  return g;
}

/** A suit carrier hanging off the closet lip. Somebody spent money. */
function suitBag(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:suitBag');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const bag = mat({ color: 0x1c1f24, roughness: 0.7 });
  g.add(box({ size: [0.46, 0.98, 0.10], pos: [0, -0.49, 0], mat: bag }));
  // Shoulder shape at the top, and the zip down the middle.
  g.add(box({ size: [0.30, 0.10, 0.10], pos: [0, 0.02, 0], mat: bag }));
  g.add(box({
    size: [0.012, 0.94, 0.012], pos: [0, -0.49, 0.052],
    mat: mat({ color: 0xb9a45e, roughness: 0.35, metalness: 0.8 }),
  }));
  g.add(cylinder({
    r: 0.006, h: 0.16, pos: [0, 0.10, 0], rotZ: Math.PI / 2,
    mat: mat({ color: 0xd8dade, roughness: 0.3, metalness: 0.85 }),
  }));
  return g;
}

/**
 * A hard case, open, with foam cut for two and one of them missing.
 *
 * The lid lies almost flat behind the case rather than standing up. At any
 * steeper angle a dark rectangle hinged off the back of a dark rectangle is a
 * laptop, and a laptop on the bed says nothing at all about the man.
 */
function gunCase(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:gunCase');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const shell = mat({ color: 0x24262a, roughness: 0.55 });
  const foam = mat({ color: 0x3a3d42, roughness: 1 });
  const cut = mat({ color: 0x121316, roughness: 1 });
  const steel = mat({ color: 0x54585e, roughness: 0.32, metalness: 0.75 });
  g.add(box({ size: [0.46, 0.060, 0.30], pos: [0, 0.030, 0], mat: shell }));
  g.add(box({ size: [0.42, 0.018, 0.26], pos: [0, 0.062, 0], mat: foam }));
  // Latches down the near edge, which is what makes it a case.
  for (const dx of [-0.15, 0.15]) {
    g.add(box({ size: [0.05, 0.022, 0.014], pos: [dx, 0.040, 0.152], mat: steel }));
  }
  /* The lid, hinged off the far edge and laid back on the bedclothes. Rotation
   * happens about the panel's own centre, so the position is derived from
   * where that puts the hinge edge rather than guessed: anything steeper than
   * this is a laptop with the screen up, and a laptop says nothing. */
  const lid = box({ size: [0.46, 0.030, 0.30], pos: [0, 0.048, -0.31], mat: shell });
  lid.rotation.x = -0.32;
  g.add(lid);
  // Two beds cut in the foam. One has a revolver in it. One does not.
  for (const [dx, w] of [[-0.10, 0.16], [0.11, 0.14]]) {
    g.add(box({ size: [w, 0.014, 0.085], pos: [dx, 0.066, 0.01], mat: cut }));
  }
  const held = group('dress:gunCase.spare');
  held.position.set(-0.10, 0.070, 0.01);
  held.rotation.y = 0.06;
  held.add(box({ size: [0.115, 0.018, 0.020], pos: [0.018, 0.006, 0], mat: steel }));
  held.add(box({ size: [0.030, 0.030, 0.028], pos: [-0.032, 0.008, 0], mat: steel }));
  held.add(box({ size: [0.026, 0.036, 0.018], pos: [-0.056, -0.002, 0], mat: mat({ color: 0x3a2a1e, roughness: 0.8 }) }));
  g.add(held);
  // A handful of loose rounds rolled into the corner of the foam.
  for (let i = 0; i < 4; i++) {
    g.add(cylinder({
      r: 0.0055, h: 0.026, pos: [0.06 + i * 0.016, 0.076, -0.085 + (i % 2) * 0.012],
      rotZ: Math.PI / 2, mat: mat({ color: 0xb08a3a, roughness: 0.35, metalness: 0.7 }),
    }));
  }
  return g;
}

/** Vacuum-packed beef jerky. Nobody asked what happened to the overage. */
function jerkyHaul(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:jerkyHaul');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const bagMat = mat({ color: 0x50331f, roughness: 0.42, metalness: 0.2 });
  for (let i = 0; i < 5; i++) {
    const dx = ((i * 23) % 5) / 5 * 0.10 - 0.05;
    const dz = ((i * 11) % 4) / 4 * 0.07 - 0.035;
    const b = box({
      size: [0.15, 0.035, 0.10], pos: [dx, 0.018 + i * 0.030, dz],
      mat: bagMat, rotY: ((i * 7) % 9) / 9 * 0.7 - 0.35,
    });
    g.add(b);
  }
  return g;
}

/** More laundry than any one man should have got through in four days. */
function laundryHeap(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:laundryHeap');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const basket = mat({ color: 0x6a6e58, roughness: 1 });
  // The basket, which has long since stopped being the containing part.
  for (const [dx, dz, w, d] of [[0, -0.19, 0.44, 0.03], [0, 0.19, 0.44, 0.03],
    [-0.21, 0, 0.03, 0.40], [0.21, 0, 0.03, 0.40]]) {
    g.add(box({ size: [w, 0.28, d], pos: [dx, 0.14, dz], mat: basket }));
  }
  const cols = [0x8a8f9a, 0x5e4a3c, 0x9aa08c, 0x3f4650, 0x77675a];
  for (let i = 0; i < 9; i++) {
    const a = (i * 2.399);
    const r = 0.06 + (i % 4) * 0.045;
    g.add(box({
      size: [0.20 + (i % 3) * 0.05, 0.07, 0.17],
      pos: [Math.cos(a) * r, 0.24 + i * 0.032, Math.sin(a) * r],
      mat: mat({ color: cols[i % cols.length], roughness: 1 }),
      rotY: a,
    }));
  }
  return g;
}

/**
 * The snapshot of Willy that lives on the fridge door.
 *
 * Deliberately its own object rather than one of the player's art slots: this
 * one has to be able to come down, and what is behind it has to be a clean
 * rectangle, so both halves are built here where the table can reach them.
 * Parented to the door, so it swings with it.
 */
function fridgeSnap(M, { w = 0.13, tilt = 0.08, faded = false }) {
  const g = group(faded ? 'dress:willyGap' : 'dress:willyPhoto');
  const h = w * 1.28;
  /* Door-local: the outward face of the door is -X, height is Y and the door
   * runs along Z, so the paper is a thin slab on X and the tilt is a roll
   * about X. The framed art on this door uses planes and needs a quarter turn
   * to face outward; boxes are already the right way round and turning them
   * as well stands them on edge. */
  if (faded) {
    /* The clean patch: the one rectangle of that door nobody has put a hand
     * on in three years. Nearly the same steel as the rest of it, which is
     * the point -- you notice it because the photograph is not there, not
     * because there is a white square where he used to be. */
    g.add(box({
      size: [0.0014, h, w], pos: [0, 0, 0],
      mat: mat({ color: 0xc9ccd1, roughness: 0.22, metalness: 0.75 }),
    }));
  } else {
    g.add(box({
      size: [0.0022, h, w], pos: [0, 0, 0],
      mat: mat({ color: 0xece6d6, roughness: 0.95 }),
    }));
    // The picture inside the paper border: a room, and a man in front of it.
    g.add(box({
      size: [0.0016, h - 0.026, w - 0.020], pos: [-0.0020, 0.006, 0],
      mat: mat({ color: 0x4b5a63, roughness: 0.85 }),
    }));
    g.add(box({
      size: [0.0012, h * 0.44, w * 0.32], pos: [-0.0030, -0.010, 0],
      mat: mat({ color: 0x8d6f52, roughness: 0.9 }),
    }));
    g.add(box({
      size: [0.0012, w * 0.20, w * 0.20], pos: [-0.0030, h * 0.16, 0],
      mat: mat({ color: 0xc8a487, roughness: 0.9 }),
    }));
  }
  // The magnet, which stays whether or not the photograph does.
  g.add(cylinder({
    r: 0.011, h: 0.006, pos: [-0.005, h / 2 - 0.012, 0], rotZ: Math.PI / 2,
    mat: mat({ color: 0xc2452f, roughness: 0.5 }),
  }));
  g.rotation.set(tilt, 0, 0);
  return g;
}

/**
 * Rain on the glass.
 *
 * A sheet just inside the window with streaks drawn into it, plus a scatter of
 * beads. It does not animate on its own -- `runners` are handed back so the
 * apartment's own tick can walk them down the pane, which keeps every clock in
 * the flat in the one place.
 */
function rainSheet(M, { x, y, z, w, h }) {
  const g = group('dress:rain');
  g.position.set(x, y, z);
  g.rotation.y = -Math.PI / 2;
  const water = new THREE.MeshPhysicalMaterial({
    color: 0xc8d8e4, roughness: 0.06, transmission: 0.6,
    transparent: true, opacity: 0.30, depthWrite: false,
  });
  const film = plane(w, h, new THREE.MeshBasicMaterial({
    color: 0x8fa2b4, transparent: true, opacity: 0.10, depthWrite: false,
  }));
  g.add(film);
  const runners = [];
  for (let i = 0; i < 26; i++) {
    const rx = ((i * 37) % 100) / 100 * w - w / 2;
    const len = 0.05 + ((i * 13) % 9) / 9 * 0.16;
    const drop = box({ size: [0.006, len, 0.004], pos: [rx, 0, 0.004], mat: water });
    g.add(drop);
    runners.push({ mesh: drop, speed: 0.05 + ((i * 7) % 11) / 11 * 0.16, top: h / 2, bottom: -h / 2 });
  }
  return { group: g, runners };
}

/**
 * The answering machine on the sideboard.
 *
 * Present in every chapter -- it is his flat and it came with the place -- but
 * the count on it is dressing: dark on the first morning, and blinking with
 * whatever the campaign says is waiting after that. The message itself lives
 * with the story; this is only the box it arrives in.
 */
export function makeAnswerMachine(M, { x, y, z, rotY = 0 }) {
  const g = group('answermachine');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const shell = mat({ color: 0x2a2c30, roughness: 0.55 });
  g.add(box({ size: [0.20, 0.045, 0.14], pos: [0, 0.022, 0], mat: shell }));
  g.add(box({ size: [0.17, 0.012, 0.05], pos: [0, 0.048, -0.03], mat: mat({ color: 0x1a1c1f, roughness: 0.5 }) }));
  // The count window, and the light that is the whole point of the object.
  const digit = box({
    size: [0.028, 0.004, 0.022], pos: [-0.062, 0.046, 0.032],
    mat: mat({ color: 0x101214, roughness: 0.5 }),
  });
  g.add(digit);
  const led = cylinder({
    r: 0.006, h: 0.004, pos: [0.062, 0.046, 0.032], mat: mat({ color: 0x2a1210, roughness: 0.6 }),
  });
  g.add(led);
  for (const dx of [-0.02, 0.012, 0.044]) {
    g.add(box({ size: [0.022, 0.008, 0.014], pos: [dx, 0.048, 0.038], mat: mat({ color: 0x4a4d52, roughness: 0.7 }) }));
  }
  return { group: g, led, digit, centre: new THREE.Vector3(x, y + 0.05, z) };
}

/**
 * Somebody else in the bed on the fourth morning.
 *
 * Built round the hips rather than the feet, because every pose she is in
 * during that minute is a different angle between her legs and the rest of
 * her: on her side under the duvet, sat on the edge with her feet down,
 * standing up and going. A rig with the origin on the floor cannot sit down
 * without either floating or sinking, and this is a scene where she does all
 * three in about forty seconds.
 *
 * This remains a compact apartment rig rather than the Sasquatch-scale story
 * rig, but her authored face is shared with Front and Center. Clothes and pose
 * can change overnight; identity cannot.
 */
export function makeMorningGuest(M) {
  const g = group('margo');
  const shirt = mat({ color: 0xd8d2c4, roughness: 1 });
  const shirtShade = mat({ color: 0xbab3a4, roughness: 1 });
  const jeans = mat({ color: 0x25334d, roughness: 1 });
  const denimShade = mat({ color: 0x1d273b, roughness: 1 });

  const upper = group('margo.upper');
  g.add(upper);
  const blouse = group('margo.outfit.blouse');
  upper.add(blouse);
  /* Three tapered masses instead of one half-metre rectangle: the authored
   * face deserves a body that still reads as human when the camera sees her
   * back at close range. */
  blouse.add(box({
    name: 'margo.outfit.blouse.waist', size: [0.28, 0.20, 0.19], pos: [0, 0.14, 0], mat: shirt,
  }));
  blouse.add(box({
    name: 'margo.outfit.blouse.ribs', size: [0.33, 0.24, 0.205], pos: [0, 0.34, 0], mat: shirt,
  }));
  blouse.add(box({
    name: 'margo.outfit.blouse.shoulders', size: [0.40, 0.08, 0.215], pos: [0, 0.48, 0], mat: shirt,
  }));
  /* A visible centre seam gives the interaction a real garment to finish,
   * rather than asking the player to hold E against an undifferentiated box. */
  const dressClosure = box({
    name: 'margo.outfit.dress-closure', size: [0.018, 0.31, 0.014],
    pos: [0, 0.265, -0.108], mat: shirtShade,
  });
  upper.add(dressClosure);

  const head = group('margo.head');
  head.position.y = 0.56;
  upper.add(head);
  const faceParts = restyleMargoHead({ head }, { skin: 0xd8a878, hairColour: 0x2a1c14 });

  const arms = [];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'right' : 'left';
    const arm = group(`margo.arm.${side}`);
    arm.position.set(0.205 * s, 0.43, 0);
    const sleeve = box({
      name: `margo.arm.${side}.sleeve`, size: [0.075, 0.34, 0.09],
      pos: [0, -0.17, 0], mat: shirt,
    });
    const forearm = box({
      name: `margo.arm.${side}.forearm`, size: [0.062, 0.18, 0.07],
      pos: [0, -0.42, 0.015], mat: mat({ color: 0xd8a878, roughness: 0.88 }),
    });
    arm.add(sleeve, forearm);
    arm.rotation.z = 0.06 * -s;
    upper.add(arm);
    arms.push(arm);
  }

  /* Hips and seat are rounded, stylised clothing forms. They add the missing
   * human silhouette from the side and rear without adding anatomical detail. */
  const hips = box({
    name: 'margo.silhouette.hips', size: [0.36, 0.16, 0.23], pos: [0, 0, -0.01], mat: jeans,
  });
  g.add(hips);
  for (const s of [-1, 1]) {
    const seat = sphere({ r: 0.14, ry: 0.155, rz: 0.17, pos: [s * 0.075, -0.015, -0.075], mat: jeans });
    seat.name = `margo.silhouette.seat.${s < 0 ? 'right' : 'left'}`;
    g.add(seat);
  }
  g.add(box({
    name: 'margo.outfit.jeans.waistband', size: [0.35, 0.045, 0.235],
    pos: [0, 0.075, -0.01], mat: denimShade,
  }));

  const legs = group('margo.legs');
  g.add(legs);
  const thighs = [];
  const knees = [];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'right' : 'left';
    const thigh = group(`margo.leg.${side}.thigh`);
    thigh.position.x = 0.085 * s;
    thigh.add(box({
      name: `margo.leg.${side}.thigh.denim`, size: [0.145, 0.42, 0.17],
      pos: [0, -0.21, 0], mat: jeans,
    }));
    const knee = group(`margo.leg.${side}.knee`);
    knee.position.y = -0.41;
    knee.add(box({
      name: `margo.leg.${side}.shin`, size: [0.13, 0.40, 0.15],
      pos: [0, -0.20, 0], mat: jeans,
    }));
    knee.add(box({
      name: `margo.leg.${side}.shoe`, size: [0.14, 0.10, 0.24],
      pos: [0, -0.41, 0.045], mat: mat({ color: 0x262326, roughness: 0.82 }),
    }));
    thigh.add(knee);
    legs.add(thigh);
    thighs.push(thigh);
    knees.push(knee);
  }

  /* Stable, generous hit volume behind the blouse. It follows her pose but
   * stays invisible; the garment seam above is the visual target. */
  const helpTarget = box({
    name: 'margo-dress-help', size: [0.48, 0.58, 0.38], pos: [0, 0.32, -0.12],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  g.add(helpTarget);

  const rig = {
    group: g,
    head,
    upper,
    legs,
    arms,
    thighs,
    knees,
    helpTarget,
    dressClosure,
    faceParts,
    identity: 'margo',
    outfit: 'morning_blouse_and_jeans',
    pose: 'lying',
    dressHelpProgress: 0,
    setPose: null,
    setDressHelpProgress: null,
  };

  const resetLimbs = () => {
    legs.rotation.set(0, 0, 0);
    upper.rotation.set(0, 0, 0);
    thighs.forEach((thigh) => thigh.rotation.set(0, 0, 0));
    knees.forEach((knee) => knee.rotation.set(0, 0, 0));
    arms.forEach((arm, i) => arm.rotation.set(0, 0, (i ? -1 : 1) * -0.06));
  };

  /**
   * Where she is, and what shape she is in.
   *
   * All three placements are measured off the bed rather than guessed: he
   * wakes with his eye at (-4.15, 0.86, -3.35), so anything within about half
   * a metre of that is not a person in the room, it is a wall of denim across
   * the lens. She is on his east side throughout, which is the open side of
   * the bed and the side the rest of the flat is on.
   *
   * @param {'lying'|'sitting'|'kneeling'|'standing'} pose
   */
  const setPose = (pose) => {
    resetLimbs();
    rig.pose = pose;
    helpTarget.visible = pose === 'kneeling';
    if (pose === 'lying') {
      /* On her side beside him. Laid down by rotating the standing rig a
       * quarter turn about X, so her head runs toward the headboard and her
       * feet toward the foot of the bed; the roll is applied in her own body
       * frame first, which is what puts her on her side rather than face up. */
      /* Head level with his, body running down the bed, above the duvet
       * rather than inside it -- the bedding tops out at 0.72 with folds to
       * 0.94, so anything at mattress height is upholstery. She is forty
       * centimetres from his eye here, which is what lying next to somebody
       * is; the scene deliberately does not turn his head toward her until
       * she sits up, because at this range she is a wall, not a person. */
      g.position.set(-3.74, 0.82, -2.72);
      g.rotation.set(-Math.PI / 2, 0, 0.55);
      legs.rotation.x = 0.22;
      upper.rotation.x = -0.10;
      return;
    }
    if (pose === 'sitting') {
      /* Sat on the east edge with her feet on the floor -- which is the side
       * her legs have to hang from, and therefore the way her body has to
       * face, so he is looking at three quarters of her back. That is what
       * the morning after looks like from a pillow. A metre out, which is far
       * enough that the angle up to her frames a person and not a ceiling. */
      g.position.set(-3.12, 0.72, -3.30);
      g.rotation.set(0, Math.PI / 2 - 0.35, 0);
      thighs.forEach((thigh) => { thigh.rotation.x = -1.20; });
      knees.forEach((knee) => { knee.rotation.x = 1.18; });
      upper.rotation.x = 0.04;
      return;
    }
    if (pose === 'kneeling') {
      /* Beside the open side of the bed, three-quarter back to the player.
       * Both knees reach the floor and both lower legs fold behind her, so the
       * pose reads at a glance instead of looking like a shortened standing rig. */
      g.position.set(-2.55, 0.41, -3.00);
      g.rotation.set(0, 1.90, 0);
      thighs.forEach((thigh, i) => {
        thigh.rotation.x = -0.16 + i * 0.03;
      });
      knees.forEach((knee, i) => {
        knee.rotation.x = -2.06 - i * 0.04;
      });
      upper.rotation.x = 0.08;
      arms.forEach((arm, i) => {
        arm.rotation.x = -0.32 + i * 0.08;
        arm.rotation.z = i ? -0.12 : 0.12;
      });
      return;
    }
    g.position.set(-2.55, 0.78, -3.00);
    g.rotation.set(0, 1.90, 0);
  };

  const setDressHelpProgress = (progress) => {
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    rig.dressHelpProgress = p;
    dressClosure.scale.y = 0.18 + p * 0.82;
    dressClosure.position.y = 0.16 + p * 0.105;
    /* She settles her shoulders as the fastening closes. The movement is
     * intentionally slight so the interaction reads without turning into a
     * repeated canned animation. */
    if (rig.pose === 'kneeling') upper.rotation.x = 0.08 - p * 0.05;
  };
  rig.setPose = setPose;
  rig.setDressHelpProgress = setDressHelpProgress;
  setDressHelpProgress(0);
  setPose('lying');
  g.visible = false;
  return rig;
}

/**
 * Build every dressing piece the table can name.
 *
 * All of them, every time, whatever the chapter -- they are a few dozen boxes
 * between them and building the lot costs less than the branching would. What
 * the chapter decides is only what is VISIBLE, which is what makes the whole
 * thing re-appliable at runtime when a sleep turns the page.
 *
 * @returns {Map<string, {group: THREE.Object3D, extra?: object}>}
 */
export function buildDressing(M, { root, fridgeDoor, at }) {
  const pieces = new Map();
  const add = (id, object, extra) => {
    (extra?.parent || root).add(object);
    pieces.set(id, { group: object, ...(extra || null) });
  };

  add('lanyard', lanyard(M, at.lanyard));
  add('willyPhoto', fridgeSnap(M, { w: 0.13, tilt: 0.08 }), { parent: fridgeDoor });
  add('willyGap', fridgeSnap(M, { w: 0.13, tilt: 0.08, faded: true }), { parent: fridgeDoor });
  for (const id of ['willyPhoto', 'willyGap']) {
    pieces.get(id).group.position.set(-0.034, at.willy.y, at.willy.z);
  }

  add('bloodShirt', bloodShirt(M, at.bloodShirt));
  add('cashSmall', cash(M, { ...at.cashSmall, n: 1 }));
  add('bingMatches', matchbook(M, at.bingMatches));

  add('motelKey', motelKey(M, at.motelKey));
  add('cashMid', cash(M, { ...at.cashMid, n: 3 }));
  add('casualJacket', casualJacket(M, at.casualJacket));
  add('tammyDashboardMug', tammyDashboardMug(M, at.tammyDashboardMug));

  add('cashStacks', cash(M, { ...at.cashStacks, n: 6, wide: true }));
  add('heistCut', cash(M, {
    x: -2.78, y: 0.76, z: -2.34, rotY: -0.12, n: 10, wide: true,
  }));
  add('suitBag', suitBag(M, at.suitBag));
  add('gunCase', gunCase(M, at.gunCase));
  add('jerkyHaul', jerkyHaul(M, at.jerkyHaul));
  add('silverMatches', matchbook(M, { ...at.silverMatches, colour: 0x2a3a52 }));
  add('laundryHeap', laundryHeap(M, at.laundryHeap));

  const heistItem = (name, size, pos, material = M.black, rotY = 0) => {
    const g = group(name);
    g.position.set(...pos);
    g.rotation.y = rotY;
    g.add(box({ size, pos: [0, size[1] / 2, 0], mat: material }));
    return g;
  };
  add('heistArmor', heistItem('heistArmor', [0.62, 0.16, 0.52], [-4.18, 0.72, -2.62]));
  add('heistGloves', heistItem('heistGloves', [0.42, 0.08, 0.22], [-3.74, 0.73, -2.56]));
  add('heistMask', heistItem('heistMask', [0.34, 0.18, 0.28], [-3.35, 0.73, -2.50]));
  add('heistCarbine', heistItem('heistCarbine', [1.12, 0.09, 0.14], [-4.02, 0.88, -2.84], M.darkSteel, 0.18));
  add('heistSidearm', heistItem('heistSidearm', [0.42, 0.10, 0.16], [-3.28, 0.87, -2.76], M.darkSteel, -0.25));
  add('heistMagazines', heistItem('heistMagazines', [0.38, 0.12, 0.24], [-2.92, 0.73, -2.56], M.darkSteel));
  add('heistDuffel', heistItem('heistDuffel', [0.86, 0.44, 0.42], [-2.84, 0.01, -2.94], M.black, 0.12));

  add('heistWash', heistItem('heistWash', [0.55, 0.06, 0.34], [4.30, 0.94, 1.98], M.sheet));
  add('heistChange', heistItem('heistChange', [0.72, 0.20, 0.34], [4.60, 0.02, 4.76], M.black, -0.12));
  add('heistGearSecured', heistItem('heistGearSecured', [0.92, 0.46, 0.50], [-3.78, 0.01, -2.70], M.black, 0.24));

  const rain = rainSheet(M, at.rain);
  add('rain', rain.group, { runners: rain.runners });

  for (const { group: g } of pieces.values()) g.visible = false;
  return pieces;
}
