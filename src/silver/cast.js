/**
 * Everyone in the Silver Room.
 *
 * Built on the Bing's figure and behaviour classes — `makePerson` and `Npc` —
 * with three jobs added there for this building (whites, aprons, a gown) and
 * nothing added here. What this file is, is the staffing rota: who is standing
 * where, what they are doing, and which of them is worth putting a hand in
 * your pocket for.
 *
 * The rule the entrance is built on: nobody is queueing to be tipped. Every
 * person on the route is doing a job that would still be happening if you had
 * never come through the door, and most of them are mid-sentence with somebody
 * else when you arrive. Being greeted by name in the middle of that is the
 * whole point — it is what she is watching.
 */
import * as THREE from 'three';
import { Npc } from '../bing/cast.js';
import { APE_FACE_URL, APE_FAMILY_MEMBER } from '../bing/family-ape.js';
import { rand, pick } from '../bing/kit.js';
import { TIP_POINTS } from './woo.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';
import { box, cylinder, sphere, group, mat } from '../world/build.js';

export { TIP_POINTS, TIP_TOTAL } from './woo.js';

const SUIT_DINERS = [0x1b1b22, 0x232430, 0x2a2028, 0x1e2430];
const GOWNS = [0x5a1430, 0x1a2a4a, 0x2a4a3a, 0x4a3a10, 0x3a1a3a];
const SILVER_WAITER_FACE = 'assets/faces/silver-waiter.png';

/* ==================================================================== */
/* WHERE PEOPLE ARE POINTED                                              */
/*                                                                       */
/* All thirteen of this room's staging findings were the same fault in    */
/* six places: a bank of people authored at one round number -- 0, or     */
/* Math.PI, or the yaw their chair happened to be laid at -- and so       */
/* agreeing about where forward is to the last bit of a double. That is   */
/* the owner's note about the bank van, "they are all looking foward at   */
/* the same spot", and the staging gate reports it as FACING_UNIFORM.     */
/*                                                                       */
/* Nobody is turned round by any of the tables below. The queue still     */
/* faces up the queue, the line still faces the pass, the diners still    */
/* face their own tables and the band still faces the room. They just no  */
/* longer agree to nine decimal places about exactly where those things   */
/* are. Every value is an AUTHORED CONSTANT and not a roll, because a yaw */
/* that moves on every build moves the geometry gate's recorded buckets   */
/* with it.                                                               */
/* ==================================================================== */

/**
 * How far off the line each person in the queue is standing, in radians, by
 * position in it -- slot 0 is the head, who faces the man on the door instead.
 *
 * The queue was right to face one way and wrong about how: the angle came off
 * a +/-0.18 roll wide enough that three of them landed within a fifth of a
 * degree of each other. These are spaced 0.07 apart, which the roll that
 * remains (a twelfth of the old one, and only there to keep the last degree of
 * wobble human) cannot close to inside the gate's 0.04 tolerance. They are not
 * in order along the line, because a queue fanning evenly from one end reads
 * as choreography rather than as nine people waiting.
 */
const QUEUE_LEAN = [0, 0.105, -0.175, 0.245, -0.035, 0.175, -0.245, 0.035, -0.105];

/**
 * How far off square each of the five people working the pass is standing.
 *
 * Chef, the stock hand and the three on the line were all on exactly Math.PI,
 * which is five men in one kitchen sighted on the same point. A kitchen line
 * does face the pass; no two cooks on it face the same inch of it.
 */
const PASS_LEAN = Object.freeze({
  chef: 0.09, stocker: -0.13, line: Object.freeze([-0.06, 0.15, 0.02]),
});

/**
 * How far off his chair's own yaw each diner has settled, in radians, dealt
 * round the room in order.
 *
 * Every chair in the room was laid on one of two headings, so twenty-seven
 * diners sat on exactly two yaws and six separate cohorts of neighbouring
 * tables read as a formation. Nobody sits square to the chair he was shown to.
 * Four values, cycled: measured to hold whatever phase the night's seating
 * lands on, so a table gained or lost does not put three of them back in
 * agreement.
 */
const DINER_SETTLE = [0.03, -0.13, -0.03, 0.08];

/**
 * A patroller's stance at the instant the room is built.
 *
 * The waiter, the two table movers, the three servers, the runner, the porter,
 * the man with the hot pan, the musician and the delivery driver were every
 * one of them authored at `yaw: 0` and then handed a round to walk -- so until
 * the first frame moved them, nine members of staff were square to +z at once.
 * Nobody stands facing nowhere in particular: he faces the way he is about to
 * walk. Taking it off the round rather than writing it down also means it
 * cannot drift away from the round when somebody re-plans the round.
 *
 * The first mark of a round is usually the spot he is already standing on, so
 * the heading comes from the first one that is not.
 */
function facingRound(options) {
  const { x, z, route } = options;
  const leg = route?.find((mark) => Math.hypot(mark.x - x, mark.z - z) > 0.1);
  return { ...options, yaw: leg ? Math.atan2(leg.x - x, leg.z - z) : 0 };
}

/**
 * The Silver Room owns Ape's seat and visit choreography, but not a second
 * version of the man. This is the Bing FAMILY model plus its supplied face.
 */
export const SILVER_APE_PRESENTATION = Object.freeze({
  characterId: APE_FAMILY_MEMBER.id,
  photo: APE_FAMILY_MEMBER.photo,
  face: APE_FACE_URL,
  model: Object.freeze({ ...APE_FAMILY_MEMBER.model, face: APE_FACE_URL }),
});

/** Stamp the stable story identity onto the scene-local NPC wrapper. */
export function identifySilverApe(npc) {
  npc.characterId = APE_FAMILY_MEMBER.id;
  npc.familyMember = APE_FAMILY_MEMBER;
  npc.group.userData.npc.characterId = APE_FAMILY_MEMBER.id;
  npc.group.userData.npc.family = true;
  return npc;
}


/* ------------------------------------------------------------------ */

export function populate(scene, room) {
  const a = room.anchors;
  const all = [];
  const by = {};
  const add = (key, npc) => {
    all.push(npc);
    if (key) by[key] = npc;
    return npc;
  };

  /* ---- the street ---- */

  add('doorman', new Npc(scene, {
    name: 'Vinny', tier: 'hero', job: 'stand',
    x: a.serviceDoor.x + 1.6, z: a.serviceDoor.z - 1.4, yaw: -1.9,
    model: { height: 1.9, build: 1.38, dress: 'suit', hair: 'crop', beard: true },
  }));
  by.doorman.folded = true;

  // The man on the public door, thirty metres away, who you are not using
  add('frontDoor', new Npc(scene, {
    name: 'the doorman', tier: 'background', job: 'stand',
    /* Off square by 0.13: he, Margo on the kerb and the man in her taxi were
     * all three on exactly Math.PI, which the staging gate reads as the three
     * of them sighted on one spot down the street. He still watches the road. */
    x: a.doorman.x, z: a.doorman.z, y: 0.14, yaw: Math.PI - 0.13,
    model: { height: 1.88, build: 1.3, dress: 'suit', hair: 'bald' },
  }));
  by.frontDoor.folded = true;

  /* The queue. Thirty people is a lot of figures for scenery, so this is nine
   * at the lowest tier — and it is a QUEUE: single file along the road side of
   * the rope (posts run x −4.4..4.4 at z 37.9), head of the line at the east
   * end nearest the doorman, everybody facing the person in front of them and
   * the head facing the door. The first pass scattered them across the whole
   * pavement at random yaws, which read as a milling crowd, not a line that
   * has been there an hour and is going nowhere. */
  for (let i = 0; i < 9; i++) {
    // Same rule as the dining room: the frame follows the dress.
    const dress = pick(['suit', 'gown', 'suit', 'shirt']);
    const inGown = dress === 'gown';
    const qx = 4.2 - i * 1.05 + rand(-0.08, 0.08);
    // Keep the whole body on the road side of the velvet, including a
    // relaxed forearm; the former 24 cm centre gap put three arms through it.
    const qz = 38.42 + rand(-0.07, 0.07);
    /* Faces up the line (+x); the head of it faces the man on the door. The
     * lean is authored per position -- see QUEUE_LEAN for why it is not a
     * roll any more. */
    const yaw = i === 0
      ? Math.atan2(a.doorman.x - qx, a.doorman.z - qz)
      : Math.PI / 2 + QUEUE_LEAN[i] + rand(-0.012, 0.012);
    add(`queue${i}`, new Npc(scene, {
      name: 'somebody waiting', tier: 'background', job: i === 5 ? 'lean' : 'stand',
      x: qx, z: qz, y: 0.14, yaw, look: false,
      model: {
        height: inGown ? rand(1.6, 1.78) : rand(1.66, 1.9),
        build: rand(0.9, 1.25),
        dress,
        shirt: pick(inGown ? GOWNS : SUIT_DINERS),
        hair: pick(inGown
          ? ['long', 'tied', 'crop']
          : ['short', 'crop', 'receding']),
        ...(inGown ? { gender: 'female', bodyShape: 'curvy' } : {}),
      },
    }));
  }

  // Somebody having four minutes by the bins
  add('smoker', new Npc(scene, {
    name: 'a porter', tier: 'ambient', job: 'lean',
    x: a.smoker.x, z: a.smoker.z, yaw: -1.2,
    model: { height: 1.72, dress: 'porter', shirt: 0xdad6cc, hair: 'crop' },
  }));

  /* ---- the cellar ---- */

  add('cellarman', new Npc(scene, {
    name: 'Marco', tier: 'hero', job: 'work',
    x: a.cellarman.x, y: a.cellarman.y, z: a.cellarman.z, yaw: -Math.PI / 2,
    model: { height: 1.74, build: 1.1, dress: 'porter', shirt: 0xdad6cc, hair: 'receding', beard: true },
  }));

  add('delivery', new Npc(scene, facingRound({
    name: 'the driver', tier: 'hero', job: 'patrol',
    x: a.cellarMid.x, y: a.cellarMid.y, z: a.cellarMid.z,
    route: [{ x: 21, z: 1 }, { x: 26, z: -3 }, { x: 21, z: 5 }],
    model: { height: 1.81, build: 1.2, dress: 'work', shirt: 0x3a3320, hair: 'crop' },
  })));

  add('stocker', new Npc(scene, {
    name: 'a stock hand', tier: 'background', job: 'work',
    x: a.drystore.x + 1.5, y: a.drystore.y, z: a.drystore.z + 2, yaw: Math.PI + PASS_LEAN.stocker,
    model: { height: 1.68, dress: 'porter', shirt: 0xdad6cc, hair: 'tied' },
  }));

  /* ---- the kitchen ---- */

  add('chef', new Npc(scene, {
    name: 'Chef', tier: 'hero', job: 'work',
    x: a.chef.x, z: a.chef.z, yaw: Math.PI + PASS_LEAN.chef,
    model: { height: 1.79, build: 1.24, dress: 'chef', hair: 'crop', hairColour: 0x9a9a9a, beard: true },
  }));

  add('prepCook', new Npc(scene, {
    name: 'a cook', tier: 'ambient', job: 'work',
    x: a.prepCook.x, z: a.prepCook.z, yaw: -Math.PI / 2,
    model: { height: 1.7, dress: 'chef', hair: 'tied' },
  }));

  // The one carrying something hot, on a loop through the middle of the route
  add('hotPan', new Npc(scene, facingRound({
    name: 'a cook', tier: 'hero', job: 'patrol',
    x: a.hotPan.x, z: a.hotPan.z,
    route: [{ x: 21.5, z: -9.5 }, { x: 18, z: -7 }, { x: 22.5, z: -5 }, { x: 23, z: -10 }],
    model: { height: 1.76, build: 1.05, dress: 'chef', hair: 'short' },
  })));

  for (let i = 0; i < 3; i++) {
    add(`line${i}`, new Npc(scene, {
      name: 'a cook', tier: i ? 'background' : 'ambient', job: 'work',
      x: 17.6 + i * 2.6, z: -9.4, yaw: Math.PI + PASS_LEAN.line[i],
      model: { height: rand(1.66, 1.84), dress: 'chef', hair: pick(['crop', 'tied', 'short']) },
    }));
  }

  add('dishwasher', new Npc(scene, {
    name: 'the dishwasher', tier: 'hero', job: 'work',
    x: a.dishwasher.x, z: a.dishwasher.z, yaw: Math.PI / 2,
    model: { height: 1.66, build: 1.15, dress: 'porter', shirt: 0xc8c4ba, hair: 'crop', skin: 0x8d5a3a },
  }));

  add('porter', new Npc(scene, facingRound({
    name: 'the porter', tier: 'hero', job: 'patrol',
    x: a.porter.x, z: a.porter.z,
    route: [{ x: 17.5, z: -13 }, { x: 24, z: -15.5 }, { x: 17, z: -16.5 }, { x: 16.5, z: -9 }],
    model: { height: 1.73, dress: 'porter', shirt: 0xdad6cc, hair: 'long' },
  })));

  /* The runner: plates out, empties back, all night. His loop is the marked
   * aisle east of the pass down to the dish pit — the lane the route paints
   * on the floor, so it is known walkable and clear of the player's own line
   * through the room. */
  add('runner', new Npc(scene, facingRound({
    name: 'a runner', tier: 'ambient', job: 'patrol',
    x: 22.7, z: -8,
    route: [{ x: 22.7, z: -5.5 }, { x: 22.7, z: -11.5 }, { x: 24.2, z: -14.6 }, { x: 22.7, z: -8.5 }],
    model: { height: 1.7, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'short' },
  })));

  /* ---- the corridor ---- */

  /* Both corridor stations used to stand their staff at anchor+2.6 — which is
   * x=15.0, the middle of the east wainscot. The bar man was working from
   * inside a wall. The bar has no staff side (its gantry is against that
   * wall), so he works at the counter's corridor face; the coat check has a
   * 400mm staff slot between counter and rail, and she stands in it. */
  add('servicebar', new Npc(scene, {
    name: 'the service bar', tier: 'hero', job: 'work',
    x: a.serviceBar.x + 1.35, z: a.serviceBar.z, yaw: Math.PI / 2,
    model: { height: 1.75, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'short' },
  }));

  add('coatcheck', new Npc(scene, {
    name: 'coat check', tier: 'hero', job: 'work',
    x: a.coatCheck.x + 1.8, z: a.coatCheck.z, yaw: -Math.PI / 2,
    model: { height: 1.67, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'tied' },
  }));

  add('musician', new Npc(scene, facingRound({
    name: 'a musician', tier: 'background', job: 'patrol',
    x: 12.5, z: 14,
    route: [{ x: 12.5, z: 14 }, { x: 12.5, z: 22 }, { x: 12.5, z: 4 }],
    model: { height: 1.8, dress: 'suit', shirt: 0x1b1b22, hair: 'receding' },
  })));

  /* ---- the floor ---- */

  add('host', new Npc(scene, {
    name: 'the host', tier: 'hero', job: 'stand',
    x: a.host.x, z: a.host.z, yaw: Math.PI,
    model: { height: 1.76, dress: 'suit', shirt: 0x1b1b22, hair: 'short', glasses: true },
  }));

  add('manager', new Npc(scene, {
    name: 'the manager', tier: 'hero', job: 'stand',
    x: a.host.x - 2.4, z: a.host.z - 0.6, yaw: Math.PI - 0.5,
    model: { height: 1.83, build: 1.18, dress: 'suit', shirt: 0x14141a, hair: 'receding', hairColour: 0x6a6a68 },
  }));
  by.manager.folded = true;

  add('waiter', new Npc(scene, facingRound({
    name: 'the waiter', tier: 'hero', job: 'patrol',
    x: -8, z: 8,
    route: [{ x: -8, z: 8 }, { x: -18, z: 4 }, { x: -12, z: -2 }, { x: -4, z: 6 }],
    /* This is the featured server in Tony and Margo's ordered dinner beats.
     * Give him the supplied East Asian-inspired portrait without cloning that
     * likeness onto the restaurant's procedural background staff. */
    model: {
      height: 1.78, dress: 'waistcoat', shirt: 0xf2eee6, hair: 'crop',
      hairColour: 0x14100e, skin: 0xd4a078, face: SILVER_WAITER_FACE,
      waistcoatColour: 0xc85a17,
      bowtie: true, bowtieColour: 0xb71926,
    },
  })));

  add('photographer', new Npc(scene, facingRound({
    name: 'the photographer', tier: 'ambient', job: 'patrol',
    x: -6, z: 14,
    route: [{ x: -6, z: 14 }, { x: -20, z: 12 }, { x: -14, z: 18 }],
    model: { height: 1.71, dress: 'suit', shirt: 0x2a2028, hair: 'long' },
  })));

  /* The two staff who carry the table. They are on the floor doing something
   * else until the manager says four words to them, which is the point. */
  add('mover1', new Npc(scene, facingRound({
    name: 'a waiter', tier: 'ambient', job: 'patrol',
    x: a.tableStaging.x, z: a.tableStaging.z,
    route: [{ x: -9.5, z: 0.5 }, { x: -4, z: 4 }, { x: -12, z: 2 }],
    model: { height: 1.8, build: 1.1, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'crop' },
  })));
  add('mover2', new Npc(scene, facingRound({
    name: 'a waiter', tier: 'ambient', job: 'patrol',
    x: a.tableStaging.x + 1.4, z: a.tableStaging.z + 1.2,
    route: [{ x: -8.1, z: 1.7 }, { x: -14, z: 6 }, { x: -6, z: -1 }],
    model: { height: 1.74, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'tied' },
  })));

  for (let i = 0; i < 3; i++) {
    add(`server${i}`, new Npc(scene, facingRound({
      name: 'a waiter', tier: 'background', job: 'patrol',
      x: -20 + i * 7, z: 18 - i * 6,
      route: [
        { x: -22 + i * 7, z: 20 - i * 6 }, { x: -12 + i * 5, z: 8 },
        { x: -24 + i * 4, z: 2 }, { x: -16, z: 16 },
      ],
      model: { height: rand(1.68, 1.84), dress: 'waistcoat', shirt: 0xd8d4cc, hair: pick(['crop', 'short', 'tied']) },
    })));
  }

  /* ---- the room, eating ----
   * Two per table on most of them, seated, at the two cheapest tiers. The
   * near half of the room is 'ambient'; the far half updates every sixth frame
   * and nobody has ever noticed.
   *
   * Dealt onto the tables' OWN chairs — `anchors.tableSeats` is the room's
   * record of every chair it laid — a facing pair per table, in the chairs,
   * at the chairs' yaws. The first pass sat people at ±1.15m of the table
   * centre, which was almost always the gap between two chairs and read as a
   * room full of people sitting on air next to their own seats.
   */
  const dinerTarget = 27;
  let diner = 0;
  /* The empty chairs are DEALT, not rolled. This loop used to skip each seat
   * on `Math.random() < 0.28`, under a guard that demands exactly
   * `dinerTarget` seated -- so a cold run of the dice spent the seat pool
   * before the target was met and the whole room build threw. Measured at
   * 22/27 on a full-suite run, twice. The pool is collected first, the
   * spares are spread on a fixed wheel for the same scattered-empties read,
   * and once the pool is only just enough nobody else stands empty. */
  const seatPool = [];
  for (const t of room.anchors.tableSeats) {
    if (!t.seats.length) continue;
    const near = t.z > -2 && t.x > -20;
    const opposite = t.seats[Math.floor(t.seats.length / 2)];
    for (const seat of t.seats.length > 1 ? [t.seats[0], opposite] : [t.seats[0]]) {
      seatPool.push({ seat, near });
    }
  }
  const spareSeats = Math.max(0, seatPool.length - dinerTarget);
  const emptyEvery = spareSeats > 0 ? Math.floor(seatPool.length / spareSeats) : Infinity;
  for (let seatI = 0; seatI < seatPool.length && diner < dinerTarget; seatI++) {
    {
      const { seat, near } = seatPool[seatI];
      const seatsLeft = seatPool.length - seatI;
      if (seatsLeft > dinerTarget - diner && (seatI + 1) % emptyEvery === 0) continue;
      /* One roll, not three. The dress, the colour and the frame have to agree
       * or the room fills up with gowns in undertaker grey on men's shoulders. */
      const inGown = Math.random() < 0.42;
      const seated = add(`diner${diner}`, new Npc(scene, {
        name: 'a diner', tier: near && diner < 10 ? 'ambient' : 'background',
        job: Math.random() < 0.4 ? 'drink' : 'sit',
        /* `look: false`, not `look: near`.
         *
         * Player-tracking on the near tables made the pair seated directly
         * behind Margo hold an unbroken stare at Tony through the entire
         * date. A room full of people watching one table is a horror beat,
         * not a restaurant — they face the way they were seated and get on
         * with their own evening. */
        x: seat.x, z: seat.z, yaw: seat.yaw + DINER_SETTLE[diner % DINER_SETTLE.length], look: false,
        model: {
          height: inGown ? rand(1.6, 1.78) : rand(1.68, 1.9),
          build: rand(0.92, 1.3),
          dress: inGown ? 'gown' : 'suit',
          shirt: inGown ? pick(GOWNS) : pick(SUIT_DINERS),
          hair: pick(inGown
            ? ['long', 'tied', 'crop']
            : ['short', 'crop', 'receding', 'bald']),
          ...(inGown ? { gender: 'female', bodyShape: 'curvy' } : {}),
        },
      }));
      seated.geometrySeat = seat.chair;
      seated.geometryTable = seat.table;
      seated.geometryAssemblyId = seat.geometryAssemblyId;
      diner++;
    }
  }

  if (diner !== dinerTarget) {
    throw new Error(`Silver Room populated ${diner}/${dinerTarget} authored diners`);
  }

  /* ---- the table by the pillar, who send the champagne ---- */
  /* Ape is the exact Bing FAMILY figure and face, not a Silver Room
   * approximation. Only his seat and behaviour belong to this room. */
  const APE = getCharacter(CHARACTER_IDS.APE);
  const pillar = new THREE.Vector3(-8.6, 0, 1.6);
  const crew = [
    ['bing-bouncer', 'the bouncer', { height: 1.94, build: 1.45, dress: 'suit', shirt: 0x14141a, hair: 'bald', beard: true }],
    [CHARACTER_IDS.APE, APE.subtitleName, SILVER_APE_PRESENTATION.model],
    ['crew1', 'a Sasquatch', { height: 1.82, build: 1.2, dress: 'suit', shirt: 0x1b1b22, hair: 'receding' }],
    ['crew2', 'a Sasquatch', { height: 1.7, build: 1.15, dress: 'suit', shirt: 0x2a2028, hair: 'short', bandana: true }],
  ];
  /* On the chairs the room laid at their table — anchors.crewSeats is the
   * authored pillar four-top's own seat list — rather than on a ring computed
   * here that only roughly agreed with wherever the table grid had landed. */
  crew.forEach(([key, name, model], i) => {
    const seat = a.crewSeats[i % a.crewSeats.length];
    const npc = add(key, new Npc(scene, {
      name,
      tier: i < 2 ? 'hero' : 'ambient', job: 'sit',
      x: seat.x, z: seat.z,
      yaw: seat.yaw,
      model,
    }));
    npc.geometrySeat = seat.chair;
    npc.geometryTable = seat.table;
    npc.geometryAssemblyId = seat.geometryAssemblyId;
    if (key === CHARACTER_IDS.APE) identifySilverApe(npc);
  });
  by.ape.homeSeat = { x: by.ape.group.position.x, z: by.ape.group.position.z, yaw: by.ape.group.rotation.y };

  return { all, byName: by, crewTable: pillar };
}

/**
 * The bandleader's violin is an actual readable stage prop, not a label on an
 * NPC. Its broad orange bouts and pale bow are deliberately a little larger
 * than strict scale so they survive the dark room and the front-table camera.
 */
function makeViolin() {
  const wood = mat({ color: 0xb65a24, roughness: 0.38, metalness: 0.04 });
  const edge = mat({ color: 0x5a2412, roughness: 0.48 });
  const ebony = mat({ color: 0x171313, roughness: 0.3 });
  const string = mat({ color: 0xd8c9a5, roughness: 0.22, metalness: 0.55 });

  const violin = group('lead-violin');
  const lower = sphere({ r: 0.14, ry: 0.125, rz: 0.035, pos: [0.11, -0.005, 0], mat: wood });
  lower.name = 'lead-violin-lower-bout';
  const upper = sphere({ r: 0.105, ry: 0.10, rz: 0.032, pos: [-0.075, 0.005, 0], mat: wood });
  upper.name = 'lead-violin-upper-bout';
  violin.add(
    lower,
    upper,
    box({ name: 'lead-violin-waist', size: [0.12, 0.11, 0.055], pos: [0.015, 0, 0], mat: edge }),
    box({ name: 'lead-violin-neck', size: [0.34, 0.032, 0.036], pos: [-0.285, 0, 0.004], mat: edge }),
    box({ name: 'lead-violin-fingerboard', size: [0.44, 0.026, 0.020], pos: [-0.18, 0, 0.042], mat: ebony }),
    box({ name: 'lead-violin-tailpiece', size: [0.13, 0.055, 0.020], pos: [0.12, 0, 0.048], mat: ebony }),
    box({ name: 'lead-violin-bridge', size: [0.018, 0.15, 0.025], pos: [0.015, 0, 0.056], mat: string }),
    box({ name: 'lead-violin-strings', size: [0.58, 0.009, 0.009], pos: [-0.12, 0, 0.071], mat: string, cast: false }),
  );
  const scroll = cylinder({ r: 0.045, h: 0.065, pos: [-0.475, 0, 0.008], rotX: Math.PI / 2, mat: edge });
  scroll.name = 'lead-violin-scroll';
  violin.add(scroll);
  violin.position.set(-0.01, 1.35, 0.205);
  violin.rotation.set(-0.08, 0, -0.12);

  const bow = group('lead-bow');
  const stick = cylinder({ r: 0.009, h: 0.72, pos: [0, 0, 0], mat: edge });
  stick.name = 'lead-bow-stick';
  bow.add(
    stick,
    box({ name: 'lead-bow-hair', size: [0.006, 0.67, 0.007], pos: [0.022, -0.01, 0], mat: string, cast: false }),
    box({ name: 'lead-bow-frog', size: [0.045, 0.075, 0.028], pos: [0.012, -0.31, 0], mat: ebony }),
  );
  /* "His bow hand is wrong -- hand must be ON the bow." It never could be: the
   * bow used to be a sibling of the arm, parented to `parts.body` and animated
   * on its own fixed little arc (`rest + stroke * ...`) that had no relationship
   * to wherever `perform.js` happened to be pointing the forearm that frame. Two
   * independent animations, numerically about half a metre apart at any given
   * instant -- the hand could not be "fixed" onto a target that was itself
   * moving on an unrelated clock.
   *
   * So the bow is not positioned here at all in world or body space. It is
   * parented to the forearm bone below (`parts.foreR`, in `makeBand`) and given
   * a LOCAL offset computed once, algebraically, from the same hand point
   * `verify-silver.mjs` already uses for the left hand: `fore.localToWorld(new
   * THREE.Vector3(0, -0.3, 0.005))`.
   *
   * The first solve of that offset kept the shipped rotation (`rotation.z =
   * 0.16` relative to the forearm) and only moved the frog into the hand --
   * which put the hand on the bow and the bow ON THE ARM: 0.16 rad off the
   * forearm's own axis is a stick lying along the sleeve, pointing 20 degrees
   * off PARALLEL to the strings and half a metre from them. "His violin bow is
   * in his arm instead of towards his violin", exactly.
   *
   * So both numbers are solved now, against the violin rather than against the
   * arm. In the instrument's own frame: the hair meets the strings at
   * (0.05, 0, 0.076) -- just tailpiece-side of the bridge, on the string tops
   * -- the stick crosses them along (-0.33, 0.94, 0), i.e. ACROSS the strings
   * and leaning toward the scroll, with its centreline 20mm proud of the plane
   * so the 22mm of hair is what touches, and the frog sits 0.30m of hair
   * before the contact. Push that through the violin's mount
   * (pos (-0.01, 1.35, 0.205), rot (-0.08, 0, -0.12)) and the frog lands at
   * body-space (0.104, 1.060, 0.325); `perform.js`'s playing pose (armR
   * (-0.242, -0.459, -0.006), foreR (-1.041, 0, -0.061), solved together with
   * these numbers) puts the hand point there to 0.4mm. Basis: bow +Y = the
   * stick direction, bow +X = the string-plane normal negated (hair side
   * toward the strings), orthogonalised; expressed in foreR's frame and with
   * the frog pinned to the hand:
   *
   *   bowRot = R_fore^-1 * R_bow          = (-1.5992, 1.0348, 2.8501) XYZ
   *   bowPos = handLocal - bowRot*frogLocal = (-0.0396, -0.2248, 0.3034)
   *
   * Measured across the whole stroke (`foreR.x + stroke*0.16`, `armR.x +
   * stroke*0.08`): the hair stays within 1-39mm of the strings, the contact
   * point travels 52mm along them past the bridge, and the frog never leaves
   * the hand (0.1mm). Wherever the forearm goes, the bow goes with it. */
  bow.position.set(-0.0396, -0.2248, 0.3034);
  bow.rotation.set(-1.5992, 1.0348, 2.8501);

  return { group: violin, bow };
}

/**
 * A tenor saxophone, held across the front of the player.
 *
 * Built to the same rule as the violin: a little over strict scale, because
 * everything on this stage is seen from a table four metres away in a room
 * lit to a quarter. The shape a saxophone is recognised by is three things in
 * order — the bell flaring up and out, the long body tube with keywork down
 * it, and the crook doubling back to the mouth — so those are what is here and
 * the rest is left off.
 */
function makeSax() {
  const brass = mat({ color: 0xc8963c, roughness: 0.28, metalness: 0.85 });
  const bright = mat({ color: 0xe0b24e, roughness: 0.2, metalness: 0.9 });
  const dark = mat({ color: 0x1d1a16, roughness: 0.5 });

  const sax = group('sax');
  // The body tube, leaning back from the bow at the bottom to the crook.
  const tube = cylinder({ r: 0.048, h: 0.44, pos: [0, 0.02, 0], mat: brass, rotX: -0.17 });
  tube.name = 'sax-body';
  // The bow: the U-turn at the bottom, read as a fat elbow rather than a torus.
  const bow = sphere({ r: 0.062, ry: 0.05, rz: 0.062, pos: [0, -0.21, 0.012], mat: brass });
  bow.name = 'sax-bow';
  // The bell, flaring up and towards the room.
  const bell = cylinder({
    rTop: 0.115, rBottom: 0.052, h: 0.20, pos: [0.006, -0.155, 0.118], mat: bright, rotX: 1.02,
  });
  bell.name = 'sax-bell';
  sax.add(tube, bow, bell);
  // The crook and the mouthpiece, doubling back to where a mouth is.
  const crook = cylinder({ r: 0.026, h: 0.16, pos: [-0.012, 0.265, -0.032], mat: brass, rotX: 0.62 });
  crook.name = 'sax-crook';
  const mouthpiece = cylinder({
    rTop: 0.022, rBottom: 0.030, h: 0.075, pos: [-0.018, 0.325, -0.086], mat: dark, rotX: 0.95,
  });
  mouthpiece.name = 'sax-mouthpiece';
  sax.add(crook, mouthpiece);
  /* Keywork: pearls down the front of the tube, which is the detail that
   * reads. `cylinder()` does not take a name — only `box()` does — so these
   * are stamped after the fact, the same way the violin's scroll is. */
  for (let i = 0; i < 6; i++) {
    const key = cylinder({
      r: 0.017, h: 0.012,
      pos: [0.030, 0.155 - i * 0.058, 0.046 + i * 0.010], mat: bright, rotX: Math.PI / 2 - 0.17,
    });
    key.name = 'sax-key';
    sax.add(key);
  }
  /* Hung where a tenor on a neck strap hangs: in front of the chest, just
   * right of the sternum, leaning out and away. Measured against the two hands
   * rather than guessed — see the pose in `perform.js`, which reaches for the
   * tube at this offset and lands on it. */
  sax.position.set(0.02, 1.15, 0.33);
  sax.rotation.set(0, 0.10, -0.06);
  return sax;
}

/**
 * A stage keyboard on a stand, in front of whoever is playing it.
 *
 * This one stands on the deck rather than being held, so it is parented to the
 * figure's group and has the figure's height scaling divided back out of it —
 * a keyboard is a keyboard whether the man behind it is 1.68 or 1.86, and a
 * five per cent instrument is a five per cent mistake nobody can name but
 * everybody can see.
 */
function makeKeyboard() {
  const shell = mat({ color: 0x14151a, roughness: 0.42, metalness: 0.25 });
  const white = mat({ color: 0xe8e6de, roughness: 0.34 });
  const black = mat({ color: 0x111014, roughness: 0.3 });
  const steel = mat({ color: 0x6e737a, roughness: 0.35, metalness: 0.7 });

  const keys = group('stage-keyboard');
  const shellBox = box({ size: [1.06, 0.085, 0.34], pos: [0, 1.026, 0], mat: shell });
  shellBox.name = 'keys-shell';
  keys.add(shellBox);
  // The back panel standing up behind the keys, where the controls live.
  keys.add(box({ name: 'keys-panel', size: [1.06, 0.075, 0.05], pos: [0, 1.091, -0.145], mat: shell }));
  for (let i = 0; i < 5; i++) {
    const knob = cylinder({
      r: 0.014, h: 0.014, pos: [-0.42 + i * 0.075, 1.132, -0.145], mat: steel, rotX: Math.PI / 2,
    });
    knob.name = 'keys-knob';
    keys.add(knob);
  }
  /* Two octaves and a bit of visible key, which at this distance is a
   * keyboard. Naturals first, then the sharps sitting on top of them in the
   * 2-3 grouping that is the only thing that makes a keyboard read as one. */
  for (let i = 0; i < 21; i++) {
    keys.add(box({
      name: 'keys-natural', size: [0.043, 0.016, 0.24],
      pos: [-0.48 + i * 0.048, 1.074, 0.038], mat: white,
    }));
  }
  const SHARPS = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12, 14, 15, 17, 18, 19];
  for (const i of SHARPS) {
    keys.add(box({
      name: 'keys-sharp', size: [0.026, 0.020, 0.145],
      pos: [-0.456 + i * 0.048, 1.088, -0.010], mat: black,
    }));
  }
  // An X stand under it, which is what everybody's keyboard is actually on.
  for (const lean of [0.34, -0.34]) {
    const leg = cylinder({ r: 0.020, h: 1.15, pos: [0, 0.565, 0], mat: steel, rotZ: lean });
    leg.name = 'keys-stand-leg';
    keys.add(leg);
  }
  keys.add(box({ name: 'keys-stand-foot', size: [0.66, 0.03, 0.05], pos: [0, 0.015, 0], mat: steel }));
  keys.position.set(0, 0, 0.38);
  return keys;
}

/**
 * The band. They are behind a closed curtain until they are not, so they are
 * built with the room and made visible by the second cutscene.
 *
 * Seven of them, which is what she counts — and it stays seven. The owner
 * asked for "a saxophone to one of the guys on the stage" and for "one of them
 * behind a keyboard", so two of the four horns take the sax and the keys
 * rather than an eighth and a ninth musician arriving and making a liar out of
 * the one line she has about the size of this band.
 *
 * The leader is at the front of the stage and in the middle of it. He used to
 * be at (-2.6, +0.4) from the stage centre, which is 1.2m UPSTAGE of the
 * curtain line at z=-9.4 and two and a half metres off the centre — "the
 * violinist should be front and center, he's kind of behind the curtains",
 * which was exactly true. He is now dead on the centre line and 400mm
 * downstage of the curtain, which puts him in front of it, on the axis the
 * front table looks straight down.
 */
export function makeBand(scene, room) {
  const a = room.anchors;
  const members = [];
  /* See the note on the yaw below: nobody up here is square to the room. */
  const BAND_FACING = [0.03, -0.15, -0.09, -0.03, 0.03, 0.09, 0.15];
  const layout = [
    // [x offset, z offset, dress, what they are holding]
    [-4.6, -2.0, 0x1b1b22, 'horn'],
    [-2.8, -1.5, 0x1b1b22, 'sax'],
    [-1.1, -2.1, 0x1b1b22, 'horn'],
    [4.4, -1.5, 0x1b1b22, 'keys'],
    [2.4, -1.3, 0x1b1b22, 'bass'],
    [1.0, -3.0, 0x1b1b22, 'drums'],
    [0.0, 2.0, 0x2a2028, 'violin'],
  ];
  layout.forEach(([ox, oz, shirt, holds], i) => {
    const npc = new Npc(scene, {
      /* Facing the ROOM. Yaw 0 is +z, and +z from the stage is the audience;
       * they were built at yaw π, which pointed the whole section at the back
       * wall for the entire set. `stand` rather than `work`, because `work` is
       * the bar-wipe loop — Performance.update owns their playing pose. */
      name: i === 6 ? 'the bandleader' : 'the band', tier: i === 6 ? 'hero' : 'ambient',
      job: 'stand', look: i === 6,
      x: a.stageCentre.x + ox, y: a.stageCentre.y, z: a.stageCentre.z + oz,
      /* Each of them a little off the room's centre line, because seven
       * players on a stand at exactly yaw 0 is a rank at attention, not a
       * section: the staging gate found them as two cohorts. Authored, small,
       * and in the order of the layout above -- they are all still playing
       * out at the tables. */
      yaw: BAND_FACING[i],
      model: {
        height: rand(1.68, 1.86),
        /* The leader's build is fixed and everybody else's is not.
         *
         * `build` moves the shoulder socket sideways by up to 8mm, and the
         * violin is pinned to the chest at a fixed offset — so a random build
         * moves his hand off the neck of an instrument that did not move with
         * it. Every other figure up here is a silhouette at the back of a dark
         * stage; he is the one the front table is four metres from and looking
         * at, and his left hand is on a specific 340mm of wood. Height is
         * still random: the whole rig scales with it, so the hold does not
         * care. */
        build: i === 6 ? 1.05 : rand(0.95, 1.2),
        dress: 'suit',
        shirt,
        hair: pick(['short', 'crop', 'receding', 'tied']),
        /* The leader is cast white, on the owner's note. Everybody else in
         * the section still gets a skin tone off `SKINS` at random — leaving
         * this `undefined` for i !== 6 hits `makePerson`'s own default,
         * `pick(SKINS)`, the same as it always has. */
        skin: i === 6 ? 0xf0cba6 : undefined,
      },
    });
    npc.holds = holds;
    if (holds === 'violin') {
      npc.violin = makeViolin();
      npc.parts.body.add(npc.violin.group);
      /* The bow is held IN the hand: parented to the forearm, not the body --
       * see the note on `bow.position` in `makeViolin` for why. */
      npc.parts.foreR.add(npc.violin.bow);
    }
    if (holds === 'sax') {
      npc.sax = makeSax();
      npc.parts.body.add(npc.sax);
    }
    if (holds === 'keys') {
      npc.keyboard = makeKeyboard();
      // On the deck at true size, under a figure that is not.
      npc.keyboard.scale.setScalar(1 / npc.parts.heightScale);
      npc.group.add(npc.keyboard);
    }
    npc.group.visible = false;
    members.push(npc);
  });
  return { members, leader: members[6] };
}
