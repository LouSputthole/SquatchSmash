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
import { BLOB_HEAD_Y, createGlueBlobMaterial } from './splat.js';

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
    adds: Object.freeze(['cashSmall', 'bingMatches']),
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

/** How tall one banded stack gets before the next one starts beside it. */
const CASH_PER_STACK = 6;
/** And how many stacks stand shoulder to shoulder before a row goes behind. */
const CASH_PER_ROW = 2;

/**
 * Banded bundles of notes. `n` is how many are in the pile on this morning,
 * `max` how many it can ever hold.
 *
 * Cut edges outward and one printed note on top of each bundle, because that
 * is the only bit of a banded stack you actually see -- a solid green brick
 * reads as a green brick and gets ignored in a dim room.
 *
 * Every bundle the pile can EVER hold is built here and then shown or hidden,
 * exactly the way the rest of this file works: what the campaign decides is
 * only how many of them are on. A pile that rebuilt itself when the money
 * changed would need somewhere to keep the last count, and nothing in here
 * keeps state.
 *
 * It grows up first and sideways second -- six bundles to a stack, two stacks
 * shoulder to shoulder, then a row behind. A single column tall enough to hold
 * a heist's cut is a chimney; a single row wide enough is off the front of the
 * sideboard and into the radio.
 */
function cash(M, { x, y, z, rotY = 0, n = 1, wide = false, max = n }) {
  const g = group('cash');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const w = wide ? 0.155 : 0.135;
  const d = wide ? 0.072 : 0.064;
  const edge = mat({ color: NOTE_PALE, roughness: 1 });
  const face = mat({ color: NOTE_GREEN, roughness: 0.9 });
  const band = mat({ color: 0xb8452f, roughness: 0.75 });
  const total = Math.max(1, Math.round(max));
  const stacks = Math.ceil(total / CASH_PER_STACK);
  const cols = Math.min(CASH_PER_ROW, stacks);
  const rows = Math.ceil(stacks / CASH_PER_ROW);
  const stepX = w + 0.013;
  const stepZ = d + 0.014;
  const bundles = [];
  for (let i = 0; i < total; i++) {
    const stack = Math.floor(i / CASH_PER_STACK);
    const h = 0.022 + (i % 3) * 0.005;
    /* Jitter, because a stack somebody dropped is not a machined block -- and
     * SMALL jitter, because every pile now lives in a measured pocket between
     * the radio, the standing photographs and the answering machine, and the
     * clearances there are counted in centimetres. */
    const sx = ((stack % CASH_PER_ROW) - (cols - 1) / 2) * stepX
      + ((i * 31) % 7) / 7 * 0.020 - 0.010;
    const sz = (Math.floor(stack / CASH_PER_ROW) - (rows - 1) / 2) * stepZ
      + ((i * 17) % 5) / 5 * 0.014 - 0.007;
    const y0 = (i % CASH_PER_STACK) * 0.028;
    const spin = ((i * 13) % 9) / 9 * 0.5 - 0.25;
    const bundle = group(`cash.bundle.${i + 1}`);
    bundle.add(box({ size: [w, h, d], pos: [sx, y0 + h / 2, sz], mat: edge, rotY: spin }));
    bundle.add(box({ size: [w * 0.98, 0.0016, d * 0.98], pos: [sx, y0 + h + 0.0008, sz], mat: face, rotY: spin }));
    bundle.add(box({ size: [0.016, h * 1.06, d * 1.03], pos: [sx, y0 + h / 2, sz], mat: band, rotY: spin }));
    g.add(bundle);
    bundles.push(bundle);
  }
  /** How much of the pile is on show. Clamped, so no save can overfill it. */
  const setBundles = (count) => {
    const on = Math.max(0, Math.min(total, Math.round(Number(count) || 0)));
    bundles.forEach((bundle, i) => { bundle.visible = i < on; });
    return on;
  };
  setBundles(n);
  return { group: g, setBundles, capacity: total };
}

/**
 * The paying work.
 *
 * Finishing one of these is the only thing in the campaign that puts money in
 * this flat, so it is what the piles on the furniture are counted from. Golf
 * and the Silver Room are not on the list; nobody pays him for those.
 */
const PAID_JOBS = Object.freeze([
  'bada_bing_one', 'squatchfather', 'airstrip_smuggling', 'bada_bing_two',
  'jerky_motel', 'no_wake', 'silent_squatch', 'bank_heist',
]);

/** What one banded bundle is worth when the campaign counts in dollars. */
const CASH_PER_BUNDLE = 25_000;

/**
 * How big each pile can get, and what it was when it arrived.
 *
 * `base` is the pile on the morning it first appears, `since` is how many jobs
 * were behind him by then, and `max` is as much as its pocket on that surface
 * will physically take -- measured against the neighbours rather than guessed.
 * The sideboard pair sit on the front ledge between the radio and the standing
 * photographs; the table pile sits in the gap between the bong and the pizza
 * box. Every pile counts the same thing from its own starting point, which is
 * why there is one rule here and not three.
 */
const CASH_PILES = Object.freeze({
  cashSmall: { base: 1, max: 4, since: 1 },
  cashMid: { base: 3, max: 6, since: 3 },
  cashStacks: { base: 6, max: 12, since: 5 },
});

/**
 * How many bundles are on show in each pile, folded from campaign truth.
 *
 * The point of this is that the money in the flat is a readout of the work,
 * not a fixed prop that appears on a date: another job done is another bundle
 * on the sideboard, every time, on every reload.
 *
 * @param {object} state campaign state
 * @returns {Record<string, number>} pile id -> bundles on show
 */
export function cashPilesForCampaign(state = {}) {
  const jobs = PAID_JOBS.filter((id) => state.missions?.[id]?.status === 'complete').length;
  const piles = {};
  for (const [id, pile] of Object.entries(CASH_PILES)) {
    piles[id] = Math.max(pile.base, Math.min(pile.max, pile.base + Math.max(0, jobs - pile.since)));
  }
  /* The cut is the one pile the campaign can actually price, so it is counted
   * in money rather than in jobs. The authored clean take pays a quarter of a
   * million, which at $25k a bundle is the ten bundles this used to be. */
  const cut = Math.max(0, Number(state.missions?.bank_heist?.prospectShare) || 0);
  piles.heistCut = Math.max(1, Math.min(24, Math.round(cut / CASH_PER_BUNDLE)));
  return piles;
}

/** Corporate ID on a printed lanyard, hooked over the corner of something. */
function lanyard(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:lanyard');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const tape = mat({ color: 0x2b3f6b, roughness: 0.95 });
  /* A loop of tape, folded rather than hanging: it is lying on a nightstand.
   * Each fold a millimetre and a half above the last, because three 3mm tapes
   * all centred on y 0.002 put two pairs of faces in exactly the same plane
   * where they cross each other, which is a flicker. */
  for (const [i, [dx, dz, r]] of [
    [-0.05, 0.01, 0.5], [0.03, -0.02, -0.9], [0.06, 0.04, 0.2],
  ].entries()) {
    g.add(box({ size: [0.16, 0.003, 0.014], pos: [dx, 0.002 + i * 0.0045, dz], mat: tape, rotY: r }));
  }
  // On top of the highest tape (which now tops out at 0.0125), not inside it.
  const card = box({
    size: [0.055, 0.002, 0.086], pos: [0.02, 0.0135, 0.03],
    mat: mat({ color: 0xf1eee4, roughness: 0.85 }), rotY: 0.35,
  });
  g.add(card);
  // The blue band across the top of every corporate badge ever printed.
  g.add(box({
    size: [0.055, 0.0016, 0.022], pos: [0.02, 0.0152, 0.062],
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
  const clothFold = mat({ color: 0x8a8f9a, roughness: 1 });
  const stain = mat({ color: 0x71151a, roughness: 1 });
  const button = M.trim;
  /*
   * A torso and two collapsed sleeves: a discarded shirt, not three boxes.
   *
   * And not three NINETY-CENTIMETRE boxes either, which is what these were.
   * `box()` writes the whole size into mesh.scale, so the `m.scale.y = 0.9`
   * that followed it was not squashing a 5.5cm slab to 90% of itself -- it was
   * replacing the 0.055 with 0.9 outright. Every panel of the shirt stood
   * 48cm out of the floorboards with another 42cm underneath them, which from
   * the bed reads as a stack of pale cartons somebody left by the wall. The
   * fold factor is applied to the size now, where it was always meant to go.
   */
  const FLAT = 0.9;
  /* The three panels also get three different thicknesses. Cut to one height
   * they overlapped with their top faces in exactly the same plane over a 9 by
   * 11cm patch, which is a guaranteed flicker in any light that moves -- and
   * the light in this flat moves all morning. */
  let base = 0;
  for (const [dx, dz, sx, sz, r, lift] of [
    [0, 0, 0.40, 0.31, 0.1, 1.00], [0.20, 0.04, 0.32, 0.13, -0.52, 0.84],
    [-0.20, 0.02, 0.31, 0.13, 0.62, 0.72],
  ]) {
    const panel = 0.055 * FLAT * lift;
    g.add(box({ size: [sx, panel, sz], pos: [dx, base + panel / 2, dz], mat: cloth, rotY: r }));
    base += 0.0012;
  }
  /* What turns three flat panels into cloth: the ridges where a dropped shirt
   * bunches up. Thin, low, and laid across the panels rather than along them,
   * because fabric folds across the way it was pulled off. */
  for (const [dx, dy, dz, sx, sz, r] of [
    [-0.06, 0.049, -0.05, 0.26, 0.045, 0.22], [0.07, 0.052, 0.07, 0.22, 0.040, -0.14],
    [0.19, 0.046, 0.02, 0.17, 0.035, -0.60], [-0.19, 0.046, 0.05, 0.16, 0.035, 0.70],
  ]) {
    g.add(box({ size: [sx, 0.022, sz], pos: [dx, dy, dz], mat: clothFold, rotY: r }));
  }
  // Collar and open front keep the heap recognisable as clothing.
  g.add(box({ size: [0.16, 0.025, 0.07], pos: [0.01, 0.061, -0.12], mat: clothShade, rotY: 0.10 }));
  g.add(box({ size: [0.025, 0.012, 0.25], pos: [0.015, 0.0595, 0.01], mat: clothShade, rotY: 0.08 }));
  /* Two collar wings standing off the heap rather than one tab lying flat, and
   * the buttons down the placket. At this size they are the whole difference
   * between a shirt and a dust sheet. */
  for (const s of [-1, 1]) {
    const wing = box({
      size: [0.075, 0.030, 0.022], pos: [0.01 + s * 0.052, 0.072, -0.146],
      mat: clothShade, rotY: 0.10 + s * 0.42,
    });
    wing.rotation.x = -0.42;
    g.add(wing);
  }
  for (const dz of [-0.06, 0.01, 0.08, 0.15]) {
    g.add(cylinder({ r: 0.008, h: 0.010, pos: [0.019, 0.0645, dz], mat: button, cast: false }));
  }
  // Cuffs, at the ends of the two sleeves, turned back the way a cuff turns.
  for (const [dx, dz, r] of [[0.345, 0.115, -0.52], [-0.345, -0.085, 0.62]]) {
    g.add(box({ size: [0.075, 0.034, 0.115], pos: [dx, 0.048, dz], mat: clothShade, rotY: r }));
  }
  /* Two dark patches down the front of it. Not discussed. Kept clear of the
   * button placket in X rather than laid across it: a flat disc through a row
   * of buttons is two surfaces fighting over the same millimetre. */
  for (const [i, [dx, dz, r]] of [
    [-0.09, -0.04, 0.075], [-0.05, 0.05, 0.052], [0.18, 0.04, 0.035],
  ].entries()) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(r, 12), stain);
    s.rotation.x = -Math.PI / 2;
    /* A hair above the highest cloth under them -- the folds top out at 0.063
     * and the placket at 0.0655 -- so the spatter sits ON the shirt instead of
     * sharing a plane with it and flickering. And each patch half a millimetre
     * above the last, because two of them overlap each other by nine
     * centimetres and that is the same fight one level up. */
    s.position.set(dx, 0.0672 + i * 0.0006, dz);
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

/**
 * Tammy's cockpit mug from Beef Run, brought home beside the gaming PC.
 *
 * `sticker` is the die-cut pin-up from the fridge door -- `sticker.fridge`,
 * assets/art/sticker-pinup.png. It is the SAME image the Brushrunner carries
 * on the flying pilot's rail (see src/beefrun/aircraft.js, which sorted this
 * out on the aeroplane first): Tammy is a sticker somebody peeled off a fridge
 * and stuck on things, not the word "TAMMY" drawn into a canvas. Printed
 * lettering is only the fallback for a build with no art in it.
 */
function tammyDashboardMug(M, { x, y, z, rotY = 0, sticker = null }) {
  const g = group('dress:tammyDashboardMug');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const ceramic = mat({ color: 0xe5dfd2, roughness: 0.58 });
  const glaze = M.pillow;
  const coffee = mat({ color: 0x2b1810, roughness: 0.72 });
  const R = 0.052;

  const cup = cylinder({ r: R, h: 0.105, pos: [0, 0.053, 0], mat: ceramic });
  cup.name = 'tammy-mug';
  g.add(cup);
  // A foot ring and a lip, so it is a thrown mug and not a length of pipe.
  const foot = cylinder({ r: R * 1.03, h: 0.008, pos: [0, 0.004, 0], mat: glaze });
  foot.name = 'tammy-mug-foot';
  g.add(foot);
  /* A rolled rim rather than a disc: a solid cap here would seal the mug and
   * put the coffee inside the ceramic. */
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R - 0.003, 0.004, 6, 20), glaze);
  lip.name = 'tammy-mug-lip';
  lip.position.set(0, 0.1045, 0);
  lip.rotation.x = Math.PI / 2;
  g.add(lip);
  const drink = cylinder({ r: 0.0465, h: 0.003, pos: [0, 0.0965, 0], mat: coffee, cast: false });
  drink.name = 'tammy-mug-coffee';
  g.add(drink);

  /*
   * A handle you could get a finger through.
   *
   * The old one was a 4.1cm ring whose centre sat 5.4cm from the mug's axis,
   * on a body of radius 5.2cm: the ring's inner edge finished 5mm from the
   * AXIS, so five sixths of the loop was buried in the ceramic and what stood
   * proud was a 5mm nub. That is the "squished into the side of it" -- there
   * was no hole in it at any angle.
   *
   * Derived instead of eyed in. Put the ring's centre at `d` from the axis and
   * draw only the half of it that points outward: the two ends of that arc sit
   * at radius `d`, which is 6mm INSIDE the wall, so they read as the two
   * points a handle is joined at; the belly of it reaches d + r + tube, which
   * is 3.4cm proud of the wall with 1.8cm of daylight between the wall and the
   * inside of the loop.
   */
  const HANDLE_R = 0.032;
  const HANDLE_TUBE = 0.0075;
  const HANDLE_D = R - 0.006;
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(HANDLE_R, HANDLE_TUBE, 8, 20, Math.PI), ceramic,
  );
  handle.name = 'tammy-mug-handle';
  handle.position.set(HANDLE_D, 0.053, 0);
  /* The torus is drawn in its own XY plane from angle 0 round to `arc`, so a
   * quarter turn back about its normal puts the two ends of the half-arc above
   * and below the centre and swings its belly out along +x -- which is the
   * direction "away from the mug". No other rotation: the loop's plane already
   * contains the mug's axis, which is the plane a handle lives in. */
  handle.rotation.z = -Math.PI / 2;
  g.add(handle);

  /*
   * Tammy, printed round the mug.
   *
   * On a CURVE, not on a plane held up in front of it. A flat 7.8cm panel on a
   * 5.2cm-radius cylinder touches at the middle and stands 1.8cm off the
   * ceramic at its corners, so the decal floated at both edges. This is an
   * open cylinder a fifth of a millimetre outside the wall, which is what a
   * transfer on a mug actually is.
   */
  const decalArc = 1.35;
  const decal = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.0004, R + 0.0004, 0.062, 20, 1, true,
      -Math.PI / 2 - decalArc / 2, decalArc),
    sticker
      ? new THREE.MeshStandardMaterial({
        map: sticker, roughness: 0.52, transparent: true, alphaTest: 0.18,
        side: THREE.DoubleSide,
      })
      : new THREE.MeshBasicMaterial({
        map: printedNameTexture('TAMMY'), transparent: true,
        alphaTest: 0.18, side: THREE.DoubleSide,
      }),
  );
  /* Still called the label: it is the same part of the same prop, and Beef
   * Run's continuity check knows it by that name. What changed is that it
   * is now the sticker rather than a picture of the word. */
  decal.name = 'tammy-mug-label';
  decal.position.set(0, 0.055, 0);
  decal.castShadow = false;
  g.add(decal);

  g.userData.label = 'Tammy’s Dashboard Mug';
  g.userData.continuityName = 'tammy-mug';
  g.userData.stickerSlot = 'sticker.fridge';
  return g;
}

/**
 * Lettering that reads as something PRINTED on a curved surface.
 *
 * Only used when the die-cut sticker did not resolve. Transparent outside the
 * ink so it behaves like the real decal -- an opaque cream rectangle wrapped
 * round a cream mug is a sticker-shaped patch of slightly wrong paint.
 */
function printedNameTexture(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '700 62px Georgia, serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#7d2432';
  context.fillText(name, canvas.width / 2, canvas.height / 2);
  context.lineWidth = 2;
  context.strokeStyle = '#4a1220';
  context.strokeText(name, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

/**
 * A suit carrier, hung on the closet rail with everything else he owns.
 *
 * It used to hang off the closet LIP -- centred in the 56cm mouth, 31cm in
 * front of the rail, 46cm of unbroken 0x1c1f24 from 1.02 up to 2.00 with no
 * seam, fold or fitting anywhere on it. From the room that is not a suit
 * carrier, it is a black bar across the whole cupboard, and it stood in front
 * of the shirts and the thing behind the shirts, which is the one thing in
 * this flat the closet exists for.
 *
 * So: on the rail, on a hanger, with the rest of them -- which also means it
 * shoves aside when they do (see the closet block in apartment.js). The origin
 * is the HOOK, at rail height, because that is the part whose position is not
 * negotiable; everything else hangs off it.
 */
function suitBag(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:suitBag');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const gear = gearPalette();
  const bag = mat({ color: 0x23262c, roughness: 0.78 });
  const panel = gear.rib;
  const strap = gear.cut;
  const brass = gear.brass;
  const steel = gear.steel;

  const W = 0.40, H = 0.98, D = 0.105;
  /*
   * How far behind the rail the bag itself hangs.
   *
   * The hook stays ON the rail; the bag is set back from it, because four
   * shirts already occupy the 5.5cm of depth directly under that rail and a
   * garment carrier sharing the band buries its shoulders five centimetres
   * inside them. The bunch position in the closet block is measured against
   * this number: turned edge-on, the offset swings from depth into width.
   */
  const BACK = 0.09;
  // The hook over the rail, and the hanger inside the shoulders of the bag.
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 6, 12, Math.PI * 1.5), steel);
  hook.position.set(0, 0.024, 0);
  hook.rotation.y = Math.PI / 2;
  hook.name = 'suitbag.hook';
  g.add(hook);
  for (const s of [-1, 1]) {
    const arm = box({
      name: `suitbag.hanger.${s < 0 ? 'left' : 'right'}`,
      size: [W * 0.44, 0.006, 0.006], pos: [s * W * 0.22, -0.062, 0], mat: steel,
    });
    arm.rotation.z = s * 0.28;
    g.add(arm);
  }

  /* Everything below the hanger hangs BACK from the rail by `BACK`, as one
   * group, so the hook still sits on the rail while the bag itself clears
   * the shirts in front of it. */
  const carrier = group('suitbag.carrier');
  carrier.position.z = BACK;
  g.add(carrier);
  /* The bag itself: a shouldered front and back panel with a gusset between
   * them, rather than one slab. The taper is what makes it read as something
   * with a jacket in it -- wide at the shoulders, narrower at the hem. */
  carrier.add(box({ name: 'suitbag.shoulders', size: [W, 0.16, D], pos: [0, -0.13, 0], mat: bag }));
  carrier.add(box({ name: 'suitbag.body', size: [W * 0.94, 0.60, D * 0.94], pos: [0, -0.50, 0], mat: bag }));
  carrier.add(box({ name: 'suitbag.hem', size: [W * 0.84, 0.19, D * 0.86], pos: [0, -0.895, 0], mat: bag }));
  // Shoulder slopes, so the top corners are not square.
  for (const s of [-1, 1]) {
    const slope = box({
      name: `suitbag.slope.${s < 0 ? 'left' : 'right'}`,
      size: [W * 0.34, 0.10, D], pos: [s * W * 0.30, -0.070, 0], mat: bag,
    });
    slope.rotation.z = s * 0.42;
    carrier.add(slope);
  }

  /* The zip runs down the FRONT face, not the centre line of a solid: a puller
   * on a pull tab, a taped seam either side of it, and the garment-bag window
   * that is the only reason you can tell one of these from a body bag. */
  carrier.add(box({
    name: 'suitbag.zip', size: [0.014, 0.90, 0.008], pos: [0, -0.50, D / 2 + 0.001], mat: brass,
  }));
  carrier.add(box({
    name: 'suitbag.zip.pull', size: [0.016, 0.034, 0.006], pos: [0, -0.20, D / 2 + 0.006], mat: brass,
  }));
  for (const s of [-1, 1]) {
    carrier.add(box({
      name: `suitbag.seam.${s < 0 ? 'left' : 'right'}`,
      size: [0.010, 0.90, 0.006], pos: [s * 0.019, -0.50, D / 2 + 0.0015], mat: strap,
    }));
  }
  carrier.add(box({
    name: 'suitbag.window', size: [W * 0.44, 0.26, 0.004],
    pos: [-W * 0.24, -0.34, D / 2 + 0.0015], mat: panel,
  }));
  // Carry handle folded flat against the shoulders, and a luggage tag on it.
  carrier.add(box({
    name: 'suitbag.handle', size: [0.13, 0.020, 0.010], pos: [0.055, -0.155, D / 2 + 0.006], mat: strap,
  }));
  carrier.add(box({
    name: 'suitbag.tag', size: [0.044, 0.062, 0.003], pos: [0.115, -0.215, D / 2 + 0.004],
    mat: M.cardboard, rotY: 0.12,
  }));
  // And the two press studs down the gusset that keep the thing shut.
  for (const [i, dy] of [-0.34, -0.68].entries()) {
    const stud = cylinder({
      r: 0.007, h: 0.005, pos: [W * 0.47, dy, 0], rotZ: Math.PI / 2, mat: steel,
    });
    stud.name = `suitbag.stud.${i + 1}`;
    carrier.add(stud);
  }
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
  /*
   * The clothes.
   *
   * These were nine plain rectangles, and the one on the near side of the pile
   * is the blue box you see from the bed -- a 25cm slab of 0x3f4650 with no
   * sleeve, seam or fold anywhere on it, which is a crate, not a shirt. Each
   * one is a body with two collapsed sleeves and a collar band now: the same
   * three-part read as the shirt on the floor, at a third of the effort,
   * because there are nine of them and they are seen from two metres away.
   */
  const cols = [0x8a8f9a, 0x5e4a3c, 0x9aa08c, 0x3f4650, 0x77675a];
  for (let i = 0; i < 9; i++) {
    const a = (i * 2.399);
    /* Pulled in from 0.06 + n*0.045. The garments have sleeves, collars and
     * folds on them now, so each one covers more ground than the plain slab it
     * replaced; on the old ring the heap spilled 10cm into the pile of laundry
     * already on the floorboards beside the basket. */
    const r = 0.05 + (i % 4) * 0.030;
    const w = 0.20 + (i % 3) * 0.05;
    const cloth = mat({ color: cols[i % cols.length], roughness: 1 });
    const shade = mat({ color: cols[(i + 2) % cols.length], roughness: 1 });
    const item = group(`laundryHeap.item.${i + 1}`);
    item.position.set(Math.cos(a) * r, 0.24 + i * 0.032, Math.sin(a) * r);
    item.rotation.y = a;
    item.add(box({ name: `laundryHeap.item.${i + 1}.body`, size: [w, 0.062, 0.17], pos: [0, 0, 0], mat: cloth }));
    // Two sleeves, thrown whichever way the garment landed.
    for (const s of [-1, 1]) {
      /* Tucked in at 0.38 of the width rather than thrown out at 0.52: the
       * heap has to stay inside the basket's own footprint, or it walks into
       * the pile of laundry already on the floor beside it. */
      const sleeve = box({
        name: `laundryHeap.item.${i + 1}.sleeve.${s < 0 ? 'left' : 'right'}`,
        size: [w * 0.34, 0.046, 0.072],
        pos: [s * w * 0.38, -0.006, ((i + s) % 3) * 0.03 - 0.03], mat: cloth,
      });
      sleeve.rotation.y = s * (0.5 + (i % 3) * 0.22);
      item.add(sleeve);
    }
    // A collar or a waistband, in a second colour, so it has a top end.
    item.add(box({
      name: `laundryHeap.item.${i + 1}.band`, size: [w * 0.52, 0.024, 0.048],
      pos: [0, 0.030, -0.062], mat: shade, rotY: 0.16 - (i % 3) * 0.16,
    }));
    // And one fold across it, because nothing in this basket was ever folded.
    item.add(box({
      name: `laundryHeap.item.${i + 1}.fold`, size: [w * 0.72, 0.020, 0.052],
      pos: [(i % 2) * 0.03 - 0.015, 0.028, 0.030], mat: shade, rotY: 0.30 - (i % 4) * 0.2,
    }));
    g.add(item);
  }
  return g;
}

/* ------------------------------------------------------------------ */
/* The heist loadout                                                   */
/* ------------------------------------------------------------------ */

/*
 * Everything Lou sends over for THE TAKE, and everything that is left of it
 * afterwards.
 *
 * All seven pieces used to be one call to a `heistItem` helper that made a
 * single coloured box, and all seven were laid out ON and AROUND the bed: a
 * 1.12m bar for a carbine, three black slabs for armour, gloves and a mask,
 * and -- because the bed ends at x -3.45 -- a sidearm and a box of magazines
 * hanging in mid-air off the east side of it with nothing underneath. From a
 * pillow that is a pile of crates on your own duvet.
 *
 * They are real objects on the floor by the closet now, which is where a man
 * stages a job he is about to leave the flat for: you walk past them on the
 * way to the door and you pick them up in the order you would put them on.
 *
 * The pocket they live in is measured. The plant stops at x 4.30 / z 4.14, the
 * closet mouth opens at z 4.50 between x 4.38 and 4.98, the skirting starts at
 * z 4.48 and the front door's swing never reaches past x 3.30 -- which leaves
 * an L of clear floor: the strip along the south wall from x 3.35 to the
 * closet, and the pocket between the plant and the east wall in front of it.
 */

/**
 * One palette for the whole loadout, built once.
 *
 * Eleven looks, not thirty. Every one of these props wants roughly the same
 * five surfaces -- moulded shell, packed foam, cordura, webbing and gunmetal --
 * and the first pass at them minted a private set inside each builder: 0x1e2126
 * nylon in the vest, 0x1e2126 nylon in the pistol rug, 0x1e2126 nylon in the
 * mag pouch, three materials for one look. build.js caches by parameters, so
 * identical requests already collapse; the cost is in how many DISTINCT ones
 * exist, because on a software renderer each new one is a shader to compile
 * before the flat can be walked into. Thirty-seven extra materials put six
 * seconds on the boot. See the note at the top of build.js.
 */
let _gear = null;
function gearPalette() {
  if (_gear) return _gear;
  _gear = {
    shell: mat({ color: 0x22252a, roughness: 0.52 }),
    rib: mat({ color: 0x181a1e, roughness: 0.6 }),
    foam: mat({ color: 0x34373d, roughness: 1 }),
    cut: mat({ color: 0x101216, roughness: 1 }),
    steel: mat({ color: 0x585c62, roughness: 0.32, metalness: 0.76 }),
    gunmetal: mat({ color: 0x4a4d52, roughness: 0.38, metalness: 0.68 }),
    polymer: mat({ color: 0x25272c, roughness: 0.72 }),
    dark: mat({ color: 0x131519, roughness: 0.5 }),
    nylon: mat({ color: 0x1e2126, roughness: 0.95 }),
    webbing: mat({ color: 0x2c3037, roughness: 1 }),
    brass: mat({ color: 0xb08a3a, roughness: 0.35, metalness: 0.7 }),
  };
  return _gear;
}

/**
 * The carbine.
 *
 * Muzzle toward local +x with the magwell at the origin, because that is the
 * one point every other part of a rifle is measured from. Built as the parts a
 * rifle actually has -- upper, lower, handguard, gas block, barrel, brake,
 * grip, buffer tube, stock, optic -- rather than as a long box, because a long
 * box at a metre and a bit is the single least convincing object in a room.
 *
 * `magazine` is optional: in the case it travels without one, since the loaded
 * magazines are a separate thing he has to remember to pick up.
 */
function carbine({ magazine = true } = {}) {
  const g = group('carbine');
  const { gunmetal: steel, polymer, dark } = gearPalette();
  // The one look on this weapon the palette does not already carry.
  const glass = mat({ color: 0x27424a, roughness: 0.18, metalness: 0.3 });

  g.add(box({ name: 'carbine.lower', size: [0.215, 0.055, 0.042], pos: [-0.020, 0, 0], mat: steel }));
  g.add(box({ name: 'carbine.magwell', size: [0.058, 0.052, 0.040], pos: [0.002, -0.030, 0], mat: steel }));
  g.add(box({ name: 'carbine.upper', size: [0.255, 0.044, 0.040], pos: [0.030, 0.049, 0], mat: steel }));
  g.add(box({ name: 'carbine.rail', size: [0.300, 0.008, 0.024], pos: [0.062, 0.075, 0], mat: dark }));
  g.add(box({ name: 'carbine.port-cover', size: [0.050, 0.022, 0.005], pos: [0.070, 0.049, 0.021], mat: dark }));
  const assist = cylinder({ r: 0.008, h: 0.020, pos: [-0.058, 0.052, -0.019], rotZ: Math.PI / 2, mat: steel });
  assist.name = 'carbine.forward-assist';
  g.add(assist);
  g.add(box({ name: 'carbine.charging-handle', size: [0.052, 0.012, 0.030], pos: [-0.120, 0.063, 0], mat: dark }));

  // Handguard, with the slots cut into it that say what it is.
  g.add(box({ name: 'carbine.handguard', size: [0.220, 0.050, 0.046], pos: [0.240, 0.049, 0], mat: polymer }));
  for (let i = 0; i < 5; i++) {
    g.add(box({
      name: `carbine.handguard.slot.${i + 1}`, size: [0.026, 0.010, 0.048],
      pos: [0.160 + i * 0.038, 0.041, 0], mat: dark, cast: false,
    }));
  }
  g.add(box({ name: 'carbine.hand-stop', size: [0.020, 0.030, 0.024], pos: [0.300, 0.018, 0], mat: polymer }));
  g.add(box({ name: 'carbine.gas-block', size: [0.030, 0.034, 0.030], pos: [0.368, 0.049, 0], mat: steel }));
  const barrel = cylinder({ r: 0.0085, h: 0.130, pos: [0.430, 0.049, 0], rotZ: Math.PI / 2, mat: steel });
  barrel.name = 'carbine.barrel';
  g.add(barrel);
  const brake = cylinder({ r: 0.013, h: 0.046, pos: [0.510, 0.049, 0], rotZ: Math.PI / 2, mat: dark });
  brake.name = 'carbine.brake';
  g.add(brake);
  const bore = cylinder({ r: 0.0055, h: 0.008, pos: [0.531, 0.049, 0], rotZ: Math.PI / 2, mat: dark });
  bore.name = 'carbine.bore';
  g.add(bore);

  // Grip, trigger and the guard round it.
  const grip = box({ name: 'carbine.grip', size: [0.036, 0.098, 0.042], pos: [-0.098, -0.056, 0], mat: polymer });
  grip.rotation.z = 0.30;
  g.add(grip);
  g.add(box({ name: 'carbine.trigger-guard.bow', size: [0.054, 0.008, 0.013], pos: [-0.046, -0.038, 0], mat: steel }));
  g.add(box({ name: 'carbine.trigger-guard.rear', size: [0.008, 0.026, 0.013], pos: [-0.070, -0.026, 0], mat: steel }));
  g.add(box({ name: 'carbine.trigger', size: [0.008, 0.020, 0.008], pos: [-0.046, -0.026, 0], mat: dark }));
  g.add(box({ name: 'carbine.safety', size: [0.020, 0.008, 0.008], pos: [-0.072, -0.004, 0.022], mat: dark }));

  // Buffer tube and a collapsed stock on it.
  const tube = cylinder({ r: 0.016, h: 0.150, pos: [-0.196, 0.030, 0], rotZ: Math.PI / 2, mat: steel });
  tube.name = 'carbine.buffer-tube';
  g.add(tube);
  g.add(box({ name: 'carbine.stock', size: [0.108, 0.072, 0.048], pos: [-0.212, 0.026, 0], mat: polymer }));
  g.add(box({ name: 'carbine.stock.cheek', size: [0.086, 0.016, 0.030], pos: [-0.206, 0.066, 0], mat: polymer }));
  g.add(box({ name: 'carbine.butt-pad', size: [0.020, 0.084, 0.050], pos: [-0.274, 0.024, 0], mat: dark }));

  // Optic, on rings, with a lens in the front of it.
  g.add(box({ name: 'carbine.optic.mount', size: [0.056, 0.028, 0.026], pos: [0.104, 0.093, 0], mat: dark }));
  g.add(box({ name: 'carbine.optic.body', size: [0.088, 0.032, 0.032], pos: [0.104, 0.123, 0], mat: dark }));
  const lens = cylinder({ r: 0.0145, h: 0.004, pos: [0.150, 0.123, 0], rotZ: Math.PI / 2, mat: glass, cast: false });
  lens.name = 'carbine.optic.lens';
  g.add(lens);

  if (magazine) {
    /* Curved, in two lengths at slightly different angles, because a straight
     * box hanging out of a magwell is the tell that gives every one of these
     * away. */
    const upper = box({ name: 'carbine.magazine.upper', size: [0.030, 0.100, 0.052], pos: [0.006, -0.104, 0], mat: polymer });
    upper.rotation.z = 0.09;
    g.add(upper);
    const lower = box({ name: 'carbine.magazine.lower', size: [0.030, 0.076, 0.050], pos: [0.026, -0.186, 0], mat: polymer });
    lower.rotation.z = 0.24;
    g.add(lower);
    g.add(box({ name: 'carbine.magazine.floorplate', size: [0.034, 0.012, 0.054], pos: [0.038, -0.223, 0], mat: dark, rotZ: 0.24 }));
  }
  return g;
}

/**
 * The hard case the carbine lives in, open on the floor with the rifle in it.
 *
 * The lid stands up against the wall rather than folding out into the room:
 * there is 34cm of floor between this and the plant and a lid laid flat would
 * be in the middle of it. The hinge is a group of its own at the case's back
 * lip, so the panel's world position is derived from the angle instead of
 * being a second number that has to be kept in step with it.
 *
 * When he takes the carbine he takes the case with it, which is why they are
 * one dressing piece: you do not carry a rifle to a job in your hands.
 */
function heistRifleCase(M, { x, y, z, rotY = 0, open = true }) {
  const g = group(open ? 'dress:heistCarbine' : 'dress:heistGearSecured.case');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const {
    shell, rib, foam, cut, steel,
  } = gearPalette();

  const L = 0.94, W = 0.28, H = 0.12;
  g.add(box({ name: 'heistCase.floor', size: [L, 0.020, W], pos: [0, 0.010, 0], mat: shell }));
  for (const s of [-1, 1]) {
    g.add(box({
      name: `heistCase.wall.long.${s < 0 ? 'front' : 'back'}`,
      size: [L, H, 0.018], pos: [0, H / 2, s * (W / 2 - 0.009)], mat: shell,
    }));
    g.add(box({
      name: `heistCase.wall.short.${s < 0 ? 'left' : 'right'}`,
      size: [0.018, H, W - 0.036], pos: [s * (L / 2 - 0.009), H / 2, 0], mat: shell,
    }));
  }
  // Moulded ribs down the outside, which is what a case has instead of a face.
  for (let i = 0; i < 5; i++) {
    g.add(box({
      name: `heistCase.rib.${i + 1}`, size: [0.014, H - 0.03, W + 0.004],
      pos: [-0.36 + i * 0.18, H / 2, 0], mat: rib, cast: false,
    }));
  }
  // Corner bumpers, so it does not stand on its own paintwork.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box({
        name: 'heistCase.bumper', size: [0.055, 0.026, 0.040],
        pos: [sx * (L / 2 - 0.026), 0.013, sz * (W / 2 - 0.020)], mat: rib,
      }));
    }
  }
  // Latches on the front lip, hinges on the back one, handle in the middle.
  for (const dx of [-0.30, 0, 0.30]) {
    g.add(box({ name: 'heistCase.latch', size: [0.062, 0.030, 0.016], pos: [dx, H - 0.026, -(W / 2 + 0.004)], mat: steel }));
  }
  for (const dx of [-0.28, 0.28]) {
    g.add(box({ name: 'heistCase.hinge', size: [0.070, 0.020, 0.014], pos: [dx, H - 0.014, W / 2 + 0.004], mat: steel }));
  }
  g.add(box({ name: 'heistCase.handle.grip', size: [0.150, 0.024, 0.018], pos: [0, 0.062, -(W / 2 + 0.020)], mat: rib }));
  for (const dx of [-0.070, 0.070]) {
    g.add(box({ name: 'heistCase.handle.post', size: [0.016, 0.040, 0.014], pos: [dx, 0.048, -(W / 2 + 0.010)], mat: steel }));
  }

  if (open) {
    // Foam, with beds cut in it for the rifle and for the two spare mags.
    g.add(box({ name: 'heistCase.foam', size: [L - 0.044, 0.035, W - 0.044], pos: [0, 0.0375, 0], mat: foam }));
    g.add(box({ name: 'heistCase.foam.cut.rifle', size: [0.840, 0.024, 0.086], pos: [-0.020, 0.049, -0.038], mat: cut, cast: false }));
    g.add(box({ name: 'heistCase.foam.cut.spare', size: [0.180, 0.024, 0.062], pos: [-0.300, 0.049, 0.072], mat: cut, cast: false }));

    /* The rifle, laid on its side in the cut the way a rifle travels. A
     * quarter turn about its own axis maps its 19cm height across the case's
     * 24cm of clear width; upright it would not shut. It is in here without a
     * magazine because the loaded magazines are a separate thing to remember. */
    const rifle = carbine({ magazine: false });
    rifle.name = 'heistCase.carbine';
    rifle.position.set(-0.124, 0.082, -0.040);
    rifle.rotation.x = Math.PI / 2;
    g.add(rifle);

    /* Lid, standing up against the wall. Hinged at the case's back lip and
     * turned past vertical, so it leans on the skirting instead of standing
     * free -- and the angle is what puts it there: at 95 degrees its top edge
     * finishes 21cm behind the hinge, which is 1cm short of the wall. */
    const lid = group('heistCase.lid');
    lid.position.set(0, H, W / 2);
    lid.rotation.x = 1.66;
    lid.add(box({ name: 'heistCase.lid.panel', size: [L, 0.042, W], pos: [0, 0.021, -W / 2], mat: shell }));
    lid.add(box({ name: 'heistCase.lid.liner', size: [L - 0.048, 0.026, W - 0.048], pos: [0, 0.052, -W / 2], mat: foam }));
    for (let i = 0; i < 4; i++) {
      lid.add(box({
        name: `heistCase.lid.rib.${i + 1}`, size: [0.014, 0.030, W + 0.004],
        pos: [-0.30 + i * 0.20, 0.005, -W / 2], mat: rib, cast: false,
      }));
    }
    g.add(lid);
  } else {
    // Shut: a lid sat on the walls, and nothing to see inside it.
    g.add(box({ name: 'heistCase.lid.closed', size: [L, 0.042, W], pos: [0, H + 0.021, 0], mat: shell }));
    for (let i = 0; i < 5; i++) {
      g.add(box({
        name: `heistCase.lid.closed.rib.${i + 1}`, size: [0.014, 0.044, W + 0.004],
        pos: [-0.36 + i * 0.18, H + 0.021, 0], mat: rib, cast: false,
      }));
    }
  }
  return g;
}

/**
 * A plate carrier, laid out flat on the floor with the front toward the room.
 *
 * Three pouches, a cummerbund, two shoulder straps and a drag handle -- the
 * parts you would put your hands on, in the order you would. Flat on the
 * floor rather than propped, because a vest with nothing in it does not stand.
 */
function plateCarrier(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:heistArmor');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const { nylon: shellMat, webbing, rib: velcro } = gearPalette();

  g.add(box({ name: 'heistArmor.plate', size: [0.300, 0.052, 0.360], pos: [0, 0.026, 0], mat: shellMat }));
  // Cummerbund wings, folded in over the plate the way they are left.
  for (const s of [-1, 1]) {
    const wing = box({
      name: `heistArmor.cummerbund.${s < 0 ? 'left' : 'right'}`,
      size: [0.110, 0.038, 0.190], pos: [s * 0.185, 0.019, 0.030], mat: shellMat,
    });
    wing.rotation.y = s * 0.14;
    g.add(wing);
    g.add(box({
      name: `heistArmor.buckle.${s < 0 ? 'left' : 'right'}`, size: [0.040, 0.014, 0.032],
      pos: [s * 0.222, 0.045, 0.030], mat: velcro,
    }));
  }
  /* Shoulder straps, arching over the top of the plate. Lifted to 0.052 rather
   * than 0.036: tipped 0.34 rad a 19cm strap reaches 4.6cm below its own
   * centre, and at 0.036 the far end of both of them was under the floor. */
  for (const s of [-1, 1]) {
    const strap = box({
      name: `heistArmor.strap.${s < 0 ? 'left' : 'right'}`,
      size: [0.058, 0.030, 0.190], pos: [s * 0.108, 0.052, -0.190], mat: webbing,
    });
    strap.rotation.x = 0.34;
    g.add(strap);
  }
  // Three rifle pouches across the front, each with its flap and pull tab.
  for (let i = 0; i < 3; i++) {
    const dx = -0.086 + i * 0.086;
    g.add(box({ name: `heistArmor.pouch.${i + 1}`, size: [0.076, 0.046, 0.120], pos: [dx, 0.075, 0.040], mat: shellMat }));
    const flap = box({ name: `heistArmor.pouch.${i + 1}.flap`, size: [0.078, 0.012, 0.062], pos: [dx, 0.096, -0.006], mat: webbing });
    flap.rotation.x = -0.22;
    g.add(flap);
    g.add(box({ name: `heistArmor.pouch.${i + 1}.tab`, size: [0.016, 0.006, 0.030], pos: [dx, 0.093, 0.098], mat: webbing }));
  }
  // Admin pouch up on the chest, and the velcro placard above it.
  g.add(box({ name: 'heistArmor.admin', size: [0.140, 0.030, 0.086], pos: [0.010, 0.067, -0.104], mat: shellMat }));
  g.add(box({ name: 'heistArmor.placard', size: [0.100, 0.006, 0.036], pos: [0.010, 0.084, -0.104], mat: velcro }));
  // Drag handle across the top, laid flat.
  g.add(box({ name: 'heistArmor.drag-handle', size: [0.130, 0.020, 0.036], pos: [0, 0.062, -0.166], mat: webbing }));
  // PALS webbing rows, which is the texture of the whole object.
  for (let i = 0; i < 4; i++) {
    g.add(box({
      name: `heistArmor.pals.${i + 1}`, size: [0.280, 0.008, 0.014],
      pos: [0, 0.054, -0.140 + i * 0.048], mat: webbing, cast: false,
    }));
  }
  return g;
}

/** A pair of gloves, dropped palm down where they were pulled off. */
function tacticalGloves(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:heistGloves');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const { dark: leather, polymer: knuckle, webbing: cuff } = gearPalette();
  for (const [i, [dx, dz, spin]] of [[-0.055, 0.010, 0.42], [0.058, -0.016, -0.68]].entries()) {
    const hand = group(`heistGloves.hand.${i + 1}`);
    hand.position.set(dx, 0, dz);
    hand.rotation.y = spin;
    hand.add(box({ name: `heistGloves.hand.${i + 1}.palm`, size: [0.082, 0.024, 0.098], pos: [0, 0.012, 0], mat: leather }));
    // Four fingers, splayed slightly, and a thumb off the side.
    for (let f = 0; f < 4; f++) {
      const finger = box({
        name: `heistGloves.hand.${i + 1}.finger.${f + 1}`, size: [0.017, 0.017, 0.052],
        pos: [-0.029 + f * 0.019, 0.009, 0.072], mat: leather,
      });
      finger.rotation.y = (f - 1.5) * 0.09;
      hand.add(finger);
    }
    const thumb = box({
      name: `heistGloves.hand.${i + 1}.thumb`, size: [0.020, 0.018, 0.040],
      pos: [-0.044, 0.010, 0.030], mat: leather,
    });
    thumb.rotation.y = 0.7;
    hand.add(thumb);
    hand.add(box({ name: `heistGloves.hand.${i + 1}.knuckles`, size: [0.070, 0.010, 0.030], pos: [0, 0.026, 0.038], mat: knuckle }));
    hand.add(box({ name: `heistGloves.hand.${i + 1}.cuff`, size: [0.086, 0.030, 0.034], pos: [0, 0.015, -0.058], mat: cuff }));
    hand.add(box({ name: `heistGloves.hand.${i + 1}.tab`, size: [0.020, 0.008, 0.022], pos: [0.036, 0.031, -0.062], mat: knuckle }));
    g.add(hand);
  }
  return g;
}

/** A balaclava, rolled up on itself the way one comes out of a bag. */
function balaclava(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:heistMask');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const { cut: knit, webbing: knitShade, dark: eyeSlot } = gearPalette();
  /* The roll: a squat cylinder on its side, with the open end toward the room.
   * Its centre sits at the HEM's radius rather than its own, or the turned-back
   * ends of it are 4mm into the floorboards. */
  const roll = cylinder({ r: 0.062, h: 0.150, pos: [0, 0.067, 0], rotZ: Math.PI / 2, mat: knit });
  roll.name = 'heistMask.roll';
  g.add(roll);
  // The turned-back hem at each end, which is what makes it rolled, not round.
  for (const s of [-1, 1]) {
    const hem = cylinder({ r: 0.066, h: 0.020, pos: [s * 0.070, 0.067, 0], rotZ: Math.PI / 2, mat: knitShade });
    hem.name = `heistMask.hem.${s < 0 ? 'left' : 'right'}`;
    g.add(hem);
  }
  /* The eye port, folded outward on top of the roll rather than drawn on it --
   * a dark rectangle painted on a dark cylinder is not a feature, it is a
   * shadow, and this is the one part of a mask you have to be able to see. */
  const port = box({ name: 'heistMask.eye-port', size: [0.108, 0.016, 0.046], pos: [0, 0.121, 0.020], mat: knitShade });
  port.rotation.x = -0.18;
  g.add(port);
  g.add(box({ name: 'heistMask.eye-port.slot', size: [0.086, 0.006, 0.020], pos: [0, 0.131, 0.024], mat: eyeSlot, cast: false }));
  // The last fold of the neck, hanging off the front of the roll.
  const skirt = box({ name: 'heistMask.neck', size: [0.130, 0.030, 0.070], pos: [0.008, 0.026, 0.066], mat: knit });
  skirt.rotation.x = 0.24;
  g.add(skirt);
  return g;
}

/** The sidearm, in the padded rug it came wrapped in. */
function sidearmRig(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:heistSidearm');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const {
    nylon, foam: liner, gunmetal: steel, polymer, dark, steel: zipper,
  } = gearPalette();

  // The rug, unrolled: a flat pad with its flap turned back and a zip round it.
  g.add(box({ name: 'heistSidearm.rug', size: [0.300, 0.016, 0.200], pos: [0, 0.008, 0], mat: nylon }));
  g.add(box({ name: 'heistSidearm.rug.liner', size: [0.276, 0.012, 0.176], pos: [0, 0.019, 0], mat: liner }));
  /* Turned back at 0.30 rad a 13cm flap reaches 2.6cm below its own centre,
   * so it hangs from 0.028 and not from the thickness of the pad. */
  const flap = box({ name: 'heistSidearm.rug.flap', size: [0.300, 0.014, 0.130], pos: [0, 0.028, -0.150], mat: nylon });
  flap.rotation.x = 0.30;
  g.add(flap);
  for (const s of [-1, 1]) {
    g.add(box({
      name: `heistSidearm.rug.zip.${s < 0 ? 'front' : 'back'}`, size: [0.300, 0.006, 0.008],
      pos: [0, 0.020, s * 0.096], mat: zipper, cast: false,
    }));
  }

  /*
   * The pistol on it, muzzle toward local +x and LYING ON ITS SIDE.
   *
   * A pistol built standing on its magazine and then set down at the height of
   * a padded rug puts 7cm of grip through the rug, the floorboards and the
   * ceiling of whatever is under this flat. The quarter turn about its own
   * long axis is what a handgun does on a table: it maps the 2.6cm width up
   * into height and lays the 10cm grip out flat, which is also the pose that
   * shows the slide, the port and the checkering from standing height.
   *
   * The roll is on the pistol and the yaw is on the group around it, because
   * an XYZ euler carrying both composes them into a corkscrew.
   */
  const laidOut = group('heistSidearm.pistol');
  laidOut.position.set(-0.010, 0.040, 0.030);
  laidOut.rotation.y = 0.24;
  const pistol = group('heistSidearm.pistol.rolled');
  pistol.rotation.x = Math.PI / 2;
  laidOut.add(pistol);
  pistol.add(box({ name: 'heistSidearm.pistol.slide', size: [0.172, 0.030, 0.026], pos: [0.028, 0.014, 0], mat: steel }));
  pistol.add(box({ name: 'heistSidearm.pistol.slide.serrations', size: [0.044, 0.020, 0.028], pos: [-0.038, 0.014, 0], mat: dark, cast: false }));
  pistol.add(box({ name: 'heistSidearm.pistol.frame', size: [0.140, 0.022, 0.024], pos: [0.012, -0.007, 0], mat: polymer }));
  pistol.add(box({ name: 'heistSidearm.pistol.dust-cover', size: [0.070, 0.014, 0.022], pos: [0.070, -0.008, 0], mat: polymer }));
  const muzzle = cylinder({ r: 0.0055, h: 0.006, pos: [0.116, 0.014, 0], rotZ: Math.PI / 2, mat: mat({ color: 0x08090b, roughness: 1 }) });
  muzzle.name = 'heistSidearm.pistol.bore';
  pistol.add(muzzle);
  const grip = box({ name: 'heistSidearm.pistol.grip', size: [0.032, 0.098, 0.026], pos: [-0.048, -0.056, 0], mat: polymer });
  grip.rotation.z = 0.26;
  pistol.add(grip);
  pistol.add(box({ name: 'heistSidearm.pistol.magazine-base', size: [0.036, 0.010, 0.028], pos: [-0.074, -0.104, 0], mat: dark, rotZ: 0.26 }));
  pistol.add(box({ name: 'heistSidearm.pistol.trigger-guard.bow', size: [0.044, 0.007, 0.011], pos: [-0.004, -0.026, 0], mat: polymer }));
  pistol.add(box({ name: 'heistSidearm.pistol.trigger-guard.rear', size: [0.007, 0.022, 0.011], pos: [-0.024, -0.017, 0], mat: polymer }));
  pistol.add(box({ name: 'heistSidearm.pistol.trigger', size: [0.007, 0.016, 0.007], pos: [-0.004, -0.016, 0], mat: dark }));
  pistol.add(box({ name: 'heistSidearm.pistol.sight.rear', size: [0.010, 0.008, 0.020], pos: [-0.048, 0.032, 0], mat: dark }));
  pistol.add(box({ name: 'heistSidearm.pistol.sight.front', size: [0.006, 0.008, 0.006], pos: [0.104, 0.032, 0], mat: dark }));
  g.add(laidOut);

  // And the spare magazine for it, flat on the rug where it fell out.
  g.add(box({ name: 'heistSidearm.spare-magazine', size: [0.098, 0.024, 0.026], pos: [0.092, 0.037, 0.058], mat: polymer, rotY: -0.4 }));
  return g;
}

/** Loaded magazines, out of the pouch and stood up in a row against it. */
function magazineRig(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:heistMagazines');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const {
    nylon, webbing, polymer, brass, dark,
  } = gearPalette();

  // The dump pouch they came out of, collapsed flat.
  g.add(box({ name: 'heistMagazines.pouch', size: [0.190, 0.058, 0.140], pos: [0, 0.029, 0.028], mat: nylon }));
  g.add(box({ name: 'heistMagazines.pouch.flap', size: [0.190, 0.014, 0.078], pos: [0, 0.062, 0.070], mat: webbing, rotX: 0.20 }));
  g.add(box({ name: 'heistMagazines.pouch.strap', size: [0.030, 0.010, 0.140], pos: [0.062, 0.060, 0.028], mat: webbing, cast: false }));

  /* Four magazines lying across each other, curved the way a magazine is:
   * body and a shorter, more steeply angled lower half, plus a floorplate. The
   * old prop for all of this was one 38x12x24cm box. */
  for (let i = 0; i < 4; i++) {
    const magazine = group(`heistMagazines.magazine.${i + 1}`);
    /* 0.028 up, not 0.014: the quarter turn that lays a magazine down maps its
     * 5cm width into height, so half of that has to be under the centre or the
     * bottom of it is in the floorboards. */
    magazine.position.set(-0.052 + (i % 2) * 0.052, 0.028 + Math.floor(i / 2) * 0.030, -0.070 + (i % 2) * 0.014);
    magazine.rotation.set(Math.PI / 2, 0, 0.10 - i * 0.16);
    magazine.add(box({ name: `heistMagazines.magazine.${i + 1}.body`, size: [0.028, 0.098, 0.050], pos: [0, 0.049, 0], mat: polymer }));
    const toe = box({ name: `heistMagazines.magazine.${i + 1}.toe`, size: [0.028, 0.072, 0.048], pos: [0.016, 0.128, 0], mat: polymer });
    toe.rotation.z = -0.22;
    magazine.add(toe);
    magazine.add(box({ name: `heistMagazines.magazine.${i + 1}.floorplate`, size: [0.032, 0.010, 0.052], pos: [0.030, 0.163, 0], mat: dark, rotZ: -0.22 }));
    magazine.add(box({ name: `heistMagazines.magazine.${i + 1}.feed-lips`, size: [0.026, 0.012, 0.044], pos: [-0.002, 0.002, 0], mat: dark }));
    g.add(magazine);
  }
  // A handful of loose rounds that never made it into one of them.
  for (let i = 0; i < 5; i++) {
    const round = cylinder({
      r: 0.0055, h: 0.026, pos: [0.062 + (i % 2) * 0.020, 0.006, -0.020 - i * 0.017],
      rotZ: Math.PI / 2, mat: brass,
    });
    round.name = `heistMagazines.round.${i + 1}`;
    round.rotation.y = i * 0.42;
    g.add(round);
  }
  return g;
}

/**
 * The bag the money comes home in.
 *
 * `packed` is what it looks like afterwards: shut, on its side, with the sag
 * of something heavy in it. Empty it is a collapsed tube with the zip open.
 */
function heistDuffel(M, { x, y, z, rotY = 0, packed = false }) {
  const g = group(packed ? 'dress:heistGearSecured.duffel' : 'dress:heistDuffel');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const palette = gearPalette();
  const canvas = packed ? palette.rib : palette.nylon;
  const { webbing, steel } = palette;

  const L = packed ? 0.62 : 0.48;
  const R = packed ? 0.145 : 0.150;
  /* How much of its own diameter the bag has left standing. Empty it has
   * collapsed to two thirds; packed it is nearly round.
   *
   * MULTIPLIED into the scale rather than assigned over it: cylinder() carries
   * the radius and the length in mesh.scale, so `scale.set(1, 1, k)` here
   * would not squash a 15cm bag, it would replace its radius and its length
   * with 1m -- which is the same trap the shirt on the bedroom floor spent a
   * long time in. And it is scale.X that matters, because the quarter turn
   * about Z that lays the tube down maps local x onto world y. */
  const SQUASH = packed ? 0.94 : 0.68;
  const centreY = R * SQUASH;
  const body = cylinder({ r: R, h: L, pos: [0, centreY, 0], rotZ: Math.PI / 2, mat: canvas });
  body.name = 'heistDuffel.body';
  body.scale.x *= SQUASH;
  g.add(body);
  for (const s of [-1, 1]) {
    const end = cylinder({ r: R * 0.98, h: 0.020, pos: [s * L / 2, centreY, 0], rotZ: Math.PI / 2, mat: webbing });
    end.name = `heistDuffel.end.${s < 0 ? 'left' : 'right'}`;
    end.scale.x *= SQUASH;
    g.add(end);
  }
  // The zip along the top, open on an empty bag and shut on a full one.
  const top = centreY + R * SQUASH;
  g.add(box({
    name: 'heistDuffel.zip', size: [L - 0.06, 0.012, packed ? 0.030 : 0.090],
    pos: [0, top - 0.004, 0], mat: webbing,
  }));
  if (!packed) {
    g.add(box({
      name: 'heistDuffel.mouth', size: [L - 0.10, 0.010, 0.070], pos: [0, top - 0.014, 0],
      mat: palette.cut, cast: false,
    }));
  }
  const pull = cylinder({ r: 0.010, h: 0.006, pos: [L / 2 - 0.06, top + 0.006, 0], mat: steel });
  pull.name = 'heistDuffel.zip.pull';
  g.add(pull);
  // Two grab handles, and a shoulder strap trailing off the near side.
  for (const dx of [-0.09, 0.09]) {
    const handle = box({ name: 'heistDuffel.handle', size: [0.024, 0.070, 0.014], pos: [dx, top - 0.030, -R * 0.56], mat: webbing });
    handle.rotation.x = -0.5;
    g.add(handle);
  }
  g.add(box({ name: 'heistDuffel.strap', size: [0.300, 0.010, 0.034], pos: [0.030, 0.006, -R * 0.92], mat: webbing, rotY: 0.22 }));
  g.add(box({ name: 'heistDuffel.strap.pad', size: [0.120, 0.016, 0.046], pos: [0.100, 0.010, -R * 0.98], mat: webbing, rotY: 0.22 }));
  return g;
}

/**
 * The gear, secured: the case shut with the packed bag sat on top of it,
 * in the same corner it was staged in. Same two objects, one morning later.
 */
function heistGearSecured(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:heistGearSecured');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const shut = heistRifleCase(M, { x: 0, y: 0, z: 0, open: false });
  g.add(shut);
  // Sat ON the case, which is 16cm of shut case, not floating above it.
  g.add(heistDuffel(M, { x: 0.04, y: 0.162, z: 0.010, rotY: 0.10, packed: true }));
  return g;
}

/** A clean change of clothes, folded on the closet floor where he left them. */
function foldedClothes(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:heistChange');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const cols = [0x2f3540, 0xb6b1a4, 0x4a4034];
  let top = 0;
  for (let i = 0; i < 3; i++) {
    const w = 0.300 - i * 0.024;
    const d = 0.220 - i * 0.018;
    const h = 0.046 - i * 0.006;
    const cloth = mat({ color: cols[i], roughness: 1 });
    const item = group(`heistChange.folded.${i + 1}`);
    item.position.set((i % 2) * 0.016 - 0.008, top + h / 2, (i % 2) * 0.012 - 0.006);
    item.rotation.y = 0.10 - i * 0.12;
    item.add(box({ name: `heistChange.folded.${i + 1}.body`, size: [w, h, d], pos: [0, 0, 0], mat: cloth }));
    // The fold down the middle, which is the only thing that says "folded".
    item.add(box({
      name: `heistChange.folded.${i + 1}.crease`, size: [w * 0.96, h * 0.34, 0.016],
      pos: [0, h * 0.4, 0], mat: mat({ color: cols[(i + 1) % 3], roughness: 1 }), cast: false,
    }));
    item.add(box({
      name: `heistChange.folded.${i + 1}.sleeve`, size: [w * 0.44, h * 0.5, d * 0.42],
      pos: [w * 0.18, h * 0.42, -d * 0.20], mat: cloth, rotY: 0.16,
    }));
    top += h;
    g.add(item);
  }
  // Clean socks on top, because a man who is burning his clothes buys socks.
  g.add(box({ name: 'heistChange.socks', size: [0.100, 0.036, 0.076], pos: [0.086, top + 0.018, 0.062], mat: mat({ color: 0xb6b1a4, roughness: 1 }), rotY: -0.3 }));
  return g;
}

/**
 * The towel he uses to wash the night off, over the rim of the bath.
 *
 * It used to be a cream slab at (4.30, 0.94, 1.98), which is inside the
 * fridge -- half of it through the door and half through the beer shelf,
 * hanging at chest height in the middle of the kitchen. The bathroom is where
 * washing happens; this hangs on the tub the player actually stands at.
 */
function bathTowel(M, { x, y, z, rotY = 0 }) {
  const g = group('dress:heistWash');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const towel = mat({ color: 0xc9c0ad, roughness: 1 });
  const towelShade = M.sheet;
  // Over the rim: a fold across the top and a fall down each side of it.
  g.add(box({ name: 'heistWash.towel.fold', size: [0.116, 0.036, 0.320], pos: [0, 0, 0], mat: towel }));
  /* The two falls hang either side of a 7cm rim, so they are set 5cm out from
   * the centre line rather than 4.6: at 4.6 the inner one was two millimetres
   * inside the porcelain. */
  for (const s of [-1, 1]) {
    g.add(box({
      name: `heistWash.towel.fall.${s < 0 ? 'inner' : 'outer'}`,
      size: [0.026, 0.190, 0.300], pos: [s * 0.050, -0.108, s * 0.012], mat: towel,
    }));
    g.add(box({
      name: `heistWash.towel.hem.${s < 0 ? 'inner' : 'outer'}`,
      size: [0.030, 0.026, 0.300], pos: [s * 0.050, -0.196, s * 0.012], mat: towelShade,
    }));
  }
  /* Two woven bands down each fall, which is what stops it reading as a folded
   * sheet of card. On the FALLS and not across the fold: a band the width of
   * the whole towel sits where the rim is, which is 1.6cm inside porcelain. */
  for (const s of [-1, 1]) {
    for (const [i, dy] of [-0.062, -0.152].entries()) {
      g.add(box({
        name: `heistWash.towel.band.${s < 0 ? 'inner' : 'outer'}.${i + 1}`,
        size: [0.030, 0.016, 0.302], pos: [s * 0.050, dy, s * 0.012 + 0.002],
        mat: towelShade, cast: false,
      }));
    }
  }
  // The flannel wrung out over the same rim, further along it.
  g.add(box({ name: 'heistWash.flannel', size: [0.080, 0.026, 0.096], pos: [0, 0.026, -0.208], mat: towelShade, rotY: 0.2 }));
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
 * How far forward the torso goes for the dress beat, in radians.
 *
 * Named because three different things have to agree about it: the pose that
 * sets it, the arms that cancel it so they still hang straight down, and the
 * fastening progress that nudges it while the bar runs.
 */
const KNEEL_TORSO = 1.45;

/**
 * The seam's own authored length, in metres, at full fasten.
 *
 * `setDressHelpProgress` used to write straight into `dressClosure.scale.y`
 * -- 0.18 to 1.0 -- which is not a fraction of anything, it is a mesh built
 * on a unit box, so that IS the mesh's height in metres. At full progress the
 * seam stood a metre tall: floor of her shoulder blades to well above her
 * scalp, and once `completeMargoDressHelp` stands her up straight the thing
 * reads exactly as reported -- a grey bar running up her back, because for a
 * few seconds coming out of the kneel it is one. Bent double over the bed the
 * same metre mostly lies along the horizontal instead, which is why it read
 * as merely wrong there rather than as a bar. The fix is the one the size
 * argument already implied: scale is a FRACTION of this, not a length of its
 * own. */
export const DRESS_CLOSURE_LENGTH = 0.31;

/**
 * Where the mess lands on the dress, and how big each bit of it is.
 *
 * Down her BACK, which is where the fastening is and therefore where his
 * hands were: `[x, y, head radius, run length]` in her own body frame, on the
 * z -0.105 face, every blob a millimetre proud of it. Ordered from the
 * fastening outward, because `setDressGlue` reveals them in this order and it
 * has to arrive as a spray from one point rather than one frame of paint.
 */
const GLUE_BLOBS = Object.freeze([
  [0.000, 0.400, 0.034, 0.185],
  [-0.062, 0.372, 0.026, 0.140],
  [0.058, 0.356, 0.028, 0.160],
  [-0.018, 0.300, 0.030, 0.205],
  [0.096, 0.288, 0.021, 0.105],
  [-0.104, 0.286, 0.019, 0.095],
  [0.036, 0.232, 0.024, 0.150],
  [-0.048, 0.206, 0.021, 0.120],
  [0.008, 0.150, 0.018, 0.085],
]);

/**
 * Somebody else in the bed on the fourth morning.
 *
 * Built round the hips rather than the feet, because every pose she is in
 * during that minute is a different angle between her legs and the rest of
 * her: on her side under the duvet, sat on the edge with her feet down, bent
 * over on all fours, standing up and going. A rig with the origin on the floor
 * cannot sit down without either floating or sinking, and this is a scene
 * where she does all four in about forty seconds.
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
    name: 'margo.outfit.dress-closure', size: [0.018, DRESS_CLOSURE_LENGTH, 0.014],
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
  const feet = [];
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
    /* An ankle, which the rig did not used to have.
     *
     * The shoe was a box bolted to the shin, which is fine for every pose that
     * keeps the shin roughly upright and wrong the moment one does not: fold
     * the knee flat for the all-fours pose and a 24cm-deep foot stands on end
     * and puts half of itself through the floorboards. One more joint, zero by
     * default, so nothing that was right before moves. */
    const foot = group(`margo.leg.${side}.foot`);
    foot.position.y = -0.41;
    foot.add(box({
      name: `margo.leg.${side}.shoe`, size: [0.14, 0.10, 0.24],
      pos: [0, 0, 0.045], mat: mat({ color: 0x262326, roughness: 0.82 }),
    }));
    knee.add(foot);
    thigh.add(knee);
    legs.add(thigh);
    feet.push(foot);
    thighs.push(thigh);
    knees.push(knee);
  }

  /* Stable, generous hit volume over the fastening. Parented to the TORSO
   * rather than to the root: bent over on all fours the two are half a metre
   * and eighty degrees apart, and a hit box left at her hips is a prompt that
   * appears somewhere she is not. Riding the torso also means it tracks her
   * correctly BEFORE she kneels -- standing and offering, the same local
   * offset lands on her upper back rather than her hips, which is what makes
   * it reachable at the one pose she is actually in when the player is meant
   * to find it. Its own material is invisible; the garment seam above is the
   * visual target. Left permanently interactable rather than toggled with the
   * pose -- gating on `enabled` in the interaction descriptor is the one gate
   * that has ever done anything here; see the registration in `boot()`. */
  const helpTarget = box({
    name: 'margo-dress-help', size: [0.48, 0.58, 0.38], pos: [0, 0.32, -0.12],
    mat: new THREE.MeshBasicMaterial({ visible: false }), cast: false, receive: false,
  });
  upper.add(helpTarget);

  /*
   * What the bottle does to the back of the dress.
   *
   * Parented to the blouse rather than sprayed at a wall plane the way the
   * picture frame's mess is: hers has to travel with her, because she stands
   * up in it, walks the length of the flat in it and leaves the building in
   * it, and that is the entire joke. THE BLOBS THEMSELVES ARE THE SAME
   * ASSET THE WALL USES -- `createGlueBlobMaterial` paints from the exact
   * canvas `SplatSystem` sprays at the picture frame, so the two fixing games
   * land on the same-looking mess rather than two different ideas of glue.
   * This used to fake the shape by hand with a squashed sphere and a
   * flat-shaded box, which is why it never quite looked like the same
   * bottle.
   *
   * Laid out by hand down the closure and across the shoulder blades rather
   * than scattered at random, so the same frame comes out of a run twice.
   */
  const dressGlue = group('margo.dress.glue');
  upper.add(dressGlue);
  const glueBlobs = GLUE_BLOBS.map(([bx, by, r, run], i) => {
    // Head and run are one baked texture now, so one plane is the whole blob.
    const w = r * 2.6;
    const h = (run + r * 1.3) * 1.08;
    const blob = plane(w, h, createGlueBlobMaterial());
    blob.name = `margo.dress.glue.${i + 1}`;
    /* The texture's own head sits BLOB_HEAD_Y down from its top edge rather
     * than at the plane's centre, so the plane is nudged to compensate --
     * otherwise every blob lands visibly low of the point it was aimed at. */
    blob.position.set(bx, by - h * (0.5 - BLOB_HEAD_Y), -0.114);
    blob.visible = false;
    dressGlue.add(blob);
    return blob;
  });

  const rig = {
    group: g,
    head,
    upper,
    legs,
    arms,
    thighs,
    knees,
    feet,
    helpTarget,
    dressClosure,
    dressGlueGroup: dressGlue,
    faceParts,
    identity: 'margo',
    outfit: 'morning_blouse_and_jeans',
    pose: 'lying',
    dressHelpProgress: 0,
    dressGlue: 0,
    setPose: null,
    setDressHelpProgress: null,
    setDressGlue: null,
  };

  const resetLimbs = () => {
    legs.rotation.set(0, 0, 0);
    upper.rotation.set(0, 0, 0);
    thighs.forEach((thigh) => thigh.rotation.set(0, 0, 0));
    knees.forEach((knee) => knee.rotation.set(0, 0, 0));
    feet.forEach((foot) => foot.rotation.set(0, 0, 0));
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
    if (pose === 'lying') {
      /*
       * On her side beside him, and -- the part this got wrong for a long
       * time -- OUT OF HIS FACE.
       *
       * Three.js composes an XYZ euler as Rx·Ry·Rz, so on a rig that is being
       * laid down by Rx(-90deg) the roll about her own spine is the Y term.
       * The old pose put 0.55 into Z instead, which is not a roll at all: Z is
       * applied first, in her standing frame, so it swung her whole body
       * sideways and then the quarter turn dropped that swing into the floor
       * plane. It carried her head 30cm back up the bed toward the headboard,
       * and her skull finished 20cm from the camera -- near enough that he
       * woke up inside her head. The measured comment above it still said
       * forty centimetres, because nobody re-measured after the roll went in.
       *
       * So: Y is the roll, Z is zero, and the numbers are checked against the
       * bed rather than against the last version of themselves. He wakes with
       * his eye at (-4.15, 0.86, -3.35); her head lands at (-3.58, 0.93,
       * -3.68), which is two thirds of a metre out with about 45cm of clear
       * air to the nearest bit of her. Rolled to -1.35 rad she is on her side
       * facing west, which is to say facing him. The mattress top is 0.60 and
       * the thrown-back duvet tops out around 0.94, so 0.93 puts her ON the
       * bedding instead of halfway through it.
       *
       * The curl is load-bearing rather than decorative: straight-legged she
       * is 1.37m from crown to sole and the bed is 2.0m with her head 0.56m
       * down it, so her shoes hung in mid-air past the foot rail at z -2.40.
       * Knees drawn up and heels tucked back takes her to 1.28m, which fits --
       * and note the knee sign, because the two are not the same joint: a
       * NEGATIVE thigh brings the knee forward and a POSITIVE knee brings the
       * heel back, which is what flexion is.
       */
      g.position.set(-3.58, 0.93, -3.12);
      g.rotation.set(-Math.PI / 2, -1.35, 0);
      thighs.forEach((thigh, i) => { thigh.rotation.x = -0.62 - i * 0.05; });
      knees.forEach((knee, i) => { knee.rotation.x = 1.25 + i * 0.06; });
      upper.rotation.x = -0.08;
      /* Both arms in front of her, and no further: an arm thrown across is a
       * forearm across the lens from where he is lying. */
      arms.forEach((arm, i) => {
        arm.rotation.x = -0.30 + i * 0.16;
        arm.rotation.z = (i ? -1 : 1) * -0.14;
      });
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
      /*
       * On all fours, bent over, beside the open side of the bed.
       *
       * The fastening on this dress runs down her BACK -- `dressClosure` is at
       * z -0.108, and +z on this rig is the way her shoes point -- so an
       * upright kneel put the one thing the interaction is about on the far
       * side of her from the only place the player can be. Bent over with her
       * back to him it is the nearest surface in the frame, which is what an
       * interaction wants and what the beat is for.
       *
       * Every angle here is derived from her own proportions rather than eyed
       * in, because a quadruped pose is four contact points and getting one
       * wrong is a limb through the floor:
       *
       *   - Thighs vertical, so the hips sit one thigh (0.41m) over the knees.
       *   - Knees folded to just under a right angle, which lays the shins
       *     flat BEHIND her -- and note the sign, because it is the opposite
       *     of the thigh's: positive is flexion, heel toward the seat.
       *   - Torso forward 1.45 rad, i.e. 83 degrees, i.e. horizontal, which
       *     puts her shoulders (0.43 up the spine) at 0.55 and her head down
       *     and out in front of her.
       *   - Arms counter-rotated by the same 1.45 so they hang vertically in
       *     world space rather than trailing behind a rotated torso. Reach
       *     from shoulder to knuckle is 0.51, and 0.55 minus 0.51 is a palm on
       *     the floor.
       *
       * Hips at 0.50 rather than 0.46: the shin is a 0.15m-deep box lying on
       * its side, so the knee joint has to clear the floor by half of that or
       * her lower legs are sunk in the floorboards.
       *
       * And she is at x -2.80 rather than out at -2.62, which is a sightline
       * decision rather than a staging one. Bent over she is a metre lower
       * than she was knelt upright, and the top of a thrown-back duvet is at
       * 0.91: from out at -2.62 the ray from his eye to her back grazed that
       * edge and the beat played as a strip of denim behind a wall of
       * bedding. -2.80 is as close in as the bed will take -- her folded
       * shins reach back to -3.43 and the frame's east face is at -3.45 --
       * and it lifts her clear of the duvet with room to spare.
       */
      g.position.set(-2.80, 0.50, -3.02);
      g.rotation.set(0, 1.90, 0);
      thighs.forEach((thigh, i) => {
        thigh.rotation.x = 0.06 + i * 0.03;
      });
      knees.forEach((knee, i) => {
        knee.rotation.x = 1.48 + i * 0.05;
      });
      /* And the ankles give back what the knees took, so the tops of her feet
       * lie on the floor with the toes pointing back -- which is what a foot
       * does when the shin above it is flat, and what stops a shoe standing on
       * end through the floorboards. */
      feet.forEach((foot, i) => { foot.rotation.x = 1.50 - i * 0.05; });
      upper.rotation.x = KNEEL_TORSO;
      arms.forEach((arm, i) => {
        // Straight down, braced, slightly wider than her shoulders.
        arm.rotation.x = -KNEEL_TORSO - 0.05;
        arm.rotation.z = (i ? -1 : 1) * 0.13;
      });
      return;
    }
    /* Standing, and standing ON the floor: her leg is 0.81 from hip to ankle
     * with another 0.05 of shoe under it, so the hips have to sit at 0.87. At
     * the 0.78 this used to be she walked out of the flat nine centimetres
     * into the floorboards, which is invisible from a pillow and obvious the
     * moment anything else in the scene wants to know where her feet are.
     *
     * x matches the kneel so that standing up is standing up rather than a
     * 40cm sidestep, and MARGO_PATH starts from the same number. */
    g.position.set(-2.80, 0.87, -3.00);
    g.rotation.set(0, 1.90, 0);
  };

  const setDressHelpProgress = (progress) => {
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    rig.dressHelpProgress = p;
    // 0.18..1.0 of DRESS_CLOSURE_LENGTH, not 0.18..1.0 metres -- see the
    // constant's own comment for the bar this was putting up her back.
    dressClosure.scale.y = (0.18 + p * 0.82) * DRESS_CLOSURE_LENGTH;
    dressClosure.position.y = 0.16 + p * 0.105;
    /* She braces a little lower as the fastening closes. Slight on purpose --
     * enough that the bar has something to move, not so much that it becomes a
     * canned animation played seven times. Written as an offset off the pose's
     * own angle rather than as a number of its own, so bending her further
     * over never silently stands her back up. */
    if (rig.pose === 'kneeling') upper.rotation.x = KNEEL_TORSO + p * 0.07;
  };

  /**
   * How much of the bottle ended up on the dress.
   *
   * Ramped rather than switched, and staggered across the blobs, because the
   * bottle gives all at once and then keeps going for a second afterwards.
   * Each blob carries its own opacity rather than a shared material's, and
   * fades in at full size rather than growing from nothing -- the same
   * arrival `SplatSystem.update` gives the wall -- so the spread reads as a
   * spray with a source landing wet, not as a row of stickers inflating.
   *
   * @param {number} amount 0 clean, 1 the whole bottle
   */
  const setDressGlue = (amount) => {
    const p = Math.max(0, Math.min(1, Number(amount) || 0));
    rig.dressGlue = p;
    glueBlobs.forEach((blob, i) => {
      const at = (i / Math.max(1, glueBlobs.length - 1)) * 0.70;
      const k = Math.max(0, Math.min(1, (p - at) / 0.30));
      blob.visible = k > 0;
      blob.material.opacity = 0.94 * k;
    });
  };

  rig.setPose = setPose;
  rig.setDressHelpProgress = setDressHelpProgress;
  rig.setDressGlue = setDressGlue;
  setDressGlue(0);
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
export function buildDressing(M, { root, fridgeDoor, at, stickers = {} }) {
  const pieces = new Map();
  const add = (id, object, extra) => {
    (extra?.parent || root).add(object);
    pieces.set(id, { group: object, ...(extra || null) });
  };
  /** A cash pile keeps its `setBundles` on the piece, the way rain keeps its
   * runners: the apartment's dressing pass is the only thing that calls it. */
  const addCash = (id, options) => {
    const pile = cash(M, options);
    /* Named for which pile it is. Four of these are built and they were all
     * called `cash`, which makes any measurement of one of them a measurement
     * of the union of the lot. */
    pile.group.name = `cash:${id}`;
    add(id, pile.group, { setBundles: pile.setBundles, capacity: pile.capacity });
  };

  add('lanyard', lanyard(M, at.lanyard));
  add('willyPhoto', fridgeSnap(M, { w: 0.13, tilt: 0.08 }), { parent: fridgeDoor });
  add('willyGap', fridgeSnap(M, { w: 0.13, tilt: 0.08, faded: true }), { parent: fridgeDoor });
  for (const id of ['willyPhoto', 'willyGap']) {
    pieces.get(id).group.position.set(-0.034, at.willy.y, at.willy.z);
  }

  add('bloodShirt', bloodShirt(M, at.bloodShirt));
  addCash('cashSmall', { ...at.cashSmall, n: CASH_PILES.cashSmall.base, max: CASH_PILES.cashSmall.max });
  add('bingMatches', matchbook(M, at.bingMatches));

  add('motelKey', motelKey(M, at.motelKey));
  addCash('cashMid', { ...at.cashMid, n: CASH_PILES.cashMid.base, max: CASH_PILES.cashMid.max });
  add('casualJacket', casualJacket(M, at.casualJacket));
  add('tammyDashboardMug', tammyDashboardMug(M, {
    ...at.tammyDashboardMug, sticker: stickers.tammy || null,
  }));

  addCash('cashStacks', {
    ...at.cashStacks, n: CASH_PILES.cashStacks.base, max: CASH_PILES.cashStacks.max, wide: true,
  });
  /* Ten bundles is the authored quarter-million; the cap is what a 2x2 block
   * of stacks measures on the floor at the foot of the bed, which is where it
   * gets tipped out. It used to hang at y 0.76 at x -2.78 -- 67cm clear of the
   * east edge of the bed with nothing at all underneath it. */
  addCash('heistCut', { ...at.heistCut, n: 10, max: 24, wide: true });
  add('suitBag', suitBag(M, at.suitBag));
  add('gunCase', gunCase(M, at.gunCase));
  add('jerkyHaul', jerkyHaul(M, at.jerkyHaul));
  add('silverMatches', matchbook(M, { ...at.silverMatches, colour: 0x2a3a52 }));
  add('laundryHeap', laundryHeap(M, at.laundryHeap));

  add('heistArmor', plateCarrier(M, at.heistArmor));
  add('heistGloves', tacticalGloves(M, at.heistGloves));
  add('heistMask', balaclava(M, at.heistMask));
  add('heistCarbine', heistRifleCase(M, { ...at.heistCarbine, open: true }));
  add('heistSidearm', sidearmRig(M, at.heistSidearm));
  add('heistMagazines', magazineRig(M, at.heistMagazines));
  add('heistDuffel', heistDuffel(M, at.heistDuffel));

  add('heistWash', bathTowel(M, at.heistWash));
  add('heistChange', foldedClothes(M, at.heistChange));
  add('heistGearSecured', heistGearSecured(M, at.heistGearSecured));

  const rain = rainSheet(M, at.rain);
  add('rain', rain.group, { runners: rain.runners });

  for (const { group: g } of pieces.values()) g.visible = false;
  return pieces;
}
