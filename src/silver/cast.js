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
import { rand, pick } from '../bing/kit.js';
import { TIP_POINTS } from './woo.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';

export { TIP_POINTS, TIP_TOTAL } from './woo.js';

const SUIT_DINERS = [0x1b1b22, 0x232430, 0x2a2028, 0x1e2430];
const GOWNS = [0x5a1430, 0x1a2a4a, 0x2a4a3a, 0x4a3a10, 0x3a1a3a];
export const SILVER_WAITER_FACE = 'assets/faces/silver-waiter.png';


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
    x: a.doorman.x, z: a.doorman.z, y: 0.14, yaw: Math.PI,
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
    const qz = 38.14 + rand(-0.07, 0.07);
    /* Faces up the line (+x); the head of it faces the man on the door. */
    const yaw = i === 0
      ? Math.atan2(a.doorman.x - qx, a.doorman.z - qz)
      : Math.PI / 2 + rand(-0.18, 0.18);
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

  add('delivery', new Npc(scene, {
    name: 'the driver', tier: 'hero', job: 'patrol',
    x: a.cellarMid.x, y: a.cellarMid.y, z: a.cellarMid.z, yaw: 0,
    route: [{ x: 21, z: 1 }, { x: 26, z: -3 }, { x: 21, z: 5 }],
    model: { height: 1.81, build: 1.2, dress: 'work', shirt: 0x3a3320, hair: 'crop' },
  }));

  add('stocker', new Npc(scene, {
    name: 'a stock hand', tier: 'background', job: 'work',
    x: a.drystore.x + 1.5, y: a.drystore.y, z: a.drystore.z + 2, yaw: Math.PI,
    model: { height: 1.68, dress: 'porter', shirt: 0xdad6cc, hair: 'tied' },
  }));

  /* ---- the kitchen ---- */

  add('chef', new Npc(scene, {
    name: 'Chef', tier: 'hero', job: 'work',
    x: a.chef.x, z: a.chef.z, yaw: Math.PI,
    model: { height: 1.79, build: 1.24, dress: 'chef', hair: 'crop', hairColour: 0x9a9a9a, beard: true },
  }));

  add('prepCook', new Npc(scene, {
    name: 'a cook', tier: 'ambient', job: 'work',
    x: a.prepCook.x, z: a.prepCook.z, yaw: -Math.PI / 2,
    model: { height: 1.7, dress: 'chef', hair: 'tied' },
  }));

  // The one carrying something hot, on a loop through the middle of the route
  add('hotPan', new Npc(scene, {
    name: 'a cook', tier: 'hero', job: 'patrol',
    x: a.hotPan.x, z: a.hotPan.z, yaw: 0,
    route: [{ x: 21.5, z: -9.5 }, { x: 18, z: -7 }, { x: 22.5, z: -5 }, { x: 23, z: -10 }],
    model: { height: 1.76, build: 1.05, dress: 'chef', hair: 'short' },
  }));

  for (let i = 0; i < 3; i++) {
    add(`line${i}`, new Npc(scene, {
      name: 'a cook', tier: i ? 'background' : 'ambient', job: 'work',
      x: 17.6 + i * 2.6, z: -9.4, yaw: Math.PI,
      model: { height: rand(1.66, 1.84), dress: 'chef', hair: pick(['crop', 'tied', 'short']) },
    }));
  }

  add('dishwasher', new Npc(scene, {
    name: 'the dishwasher', tier: 'hero', job: 'work',
    x: a.dishwasher.x, z: a.dishwasher.z, yaw: Math.PI / 2,
    model: { height: 1.66, build: 1.15, dress: 'porter', shirt: 0xc8c4ba, hair: 'crop', skin: 0x8d5a3a },
  }));

  add('porter', new Npc(scene, {
    name: 'the porter', tier: 'hero', job: 'patrol',
    x: a.porter.x, z: a.porter.z, yaw: 0,
    route: [{ x: 17.5, z: -13 }, { x: 24, z: -15.5 }, { x: 17, z: -16.5 }, { x: 16.5, z: -9 }],
    model: { height: 1.73, dress: 'porter', shirt: 0xdad6cc, hair: 'long' },
  }));

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
    x: a.coatCheck.x + 1.98, z: a.coatCheck.z, yaw: -Math.PI / 2,
    model: { height: 1.67, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'tied' },
  }));

  add('musician', new Npc(scene, {
    name: 'a musician', tier: 'background', job: 'patrol',
    x: 12.5, z: 14, yaw: 0,
    route: [{ x: 12.5, z: 14 }, { x: 12.5, z: 22 }, { x: 12.5, z: 4 }],
    model: { height: 1.8, dress: 'suit', shirt: 0x1b1b22, hair: 'receding' },
  }));

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

  add('waiter', new Npc(scene, {
    name: 'the waiter', tier: 'hero', job: 'patrol',
    x: -8, z: 8, yaw: 0,
    route: [{ x: -8, z: 8 }, { x: -18, z: 4 }, { x: -12, z: -2 }, { x: -4, z: 6 }],
    model: {
      height: 1.78, dress: 'waistcoat', shirt: 0xd8d4cc,
      face: SILVER_WAITER_FACE,
      faceCrop: [0.15, 0.08, 0.70, 0.88],
    },
  }));

  add('photographer', new Npc(scene, {
    name: 'the photographer', tier: 'ambient', job: 'patrol',
    x: -6, z: 14, yaw: 0,
    route: [{ x: -6, z: 14 }, { x: -20, z: 12 }, { x: -14, z: 18 }],
    model: { height: 1.71, dress: 'suit', shirt: 0x2a2028, hair: 'long' },
  }));

  /* The two staff who carry the table. They are on the floor doing something
   * else until the manager says four words to them, which is the point. */
  add('mover1', new Npc(scene, {
    name: 'a waiter', tier: 'ambient', job: 'patrol',
    x: a.tableStaging.x, z: a.tableStaging.z, yaw: 0,
    route: [{ x: -9.5, z: 0.5 }, { x: -4, z: 4 }, { x: -12, z: 2 }],
    model: { height: 1.8, build: 1.1, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'crop' },
  }));
  add('mover2', new Npc(scene, {
    name: 'a waiter', tier: 'ambient', job: 'patrol',
    x: a.tableStaging.x + 1.4, z: a.tableStaging.z + 1.2, yaw: 0,
    route: [{ x: -8.1, z: 1.7 }, { x: -14, z: 6 }, { x: -6, z: -1 }],
    model: { height: 1.74, dress: 'waistcoat', shirt: 0xd8d4cc, hair: 'tied' },
  }));

  for (let i = 0; i < 3; i++) {
    add(`server${i}`, new Npc(scene, {
      name: 'a waiter', tier: 'background', job: 'patrol',
      x: -20 + i * 7, z: 18 - i * 6, yaw: 0,
      route: [
        { x: -22 + i * 7, z: 20 - i * 6 }, { x: -12 + i * 5, z: 8 },
        { x: -24 + i * 4, z: 2 }, { x: -16, z: 16 },
      ],
      model: { height: rand(1.68, 1.84), dress: 'waistcoat', shirt: 0xd8d4cc, hair: pick(['crop', 'short', 'tied']) },
    }));
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
  let diner = 0;
  for (const t of room.anchors.tableSeats) {
    if (diner > 26) break;
    if (!t.seats.length) continue;
    const near = t.z > -2 && t.x > -20;
    const opposite = t.seats[Math.floor(t.seats.length / 2)];
    for (const seat of t.seats.length > 1 ? [t.seats[0], opposite] : [t.seats[0]]) {
      if (Math.random() < 0.28) continue;
      /* One roll, not three. The dress, the colour and the frame have to agree
       * or the room fills up with gowns in undertaker grey on men's shoulders. */
      const inGown = Math.random() < 0.42;
      add(`diner${diner}`, new Npc(scene, {
        name: 'a diner', tier: near && diner < 10 ? 'ambient' : 'background',
        job: Math.random() < 0.4 ? 'drink' : 'sit',
        /* Their chairs already face their table partners. Player-tracking made
         * the pair directly behind Margo hold an unbroken stare through the
         * entire date, so dining-room extras keep their attention in-room. */
        x: seat.x, z: seat.z, yaw: seat.yaw, look: false,
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
      diner++;
    }
  }

  /* ---- the table by the pillar, who send the champagne ---- */
  /* Ape is a real Circle member with a locked id, not a lookalike: the same
   * person Tony will be roasted by on the big night. His subtitle name comes
   * from the campaign registry so the two scenes cannot drift apart. */
  const APE = getCharacter(CHARACTER_IDS.APE);
  const pillar = new THREE.Vector3(-8.6, 0, 1.6);
  const crew = [
    ['bing-bouncer', 'the bouncer', { height: 1.94, build: 1.45, dress: 'suit', shirt: 0x14141a, hair: 'bald', beard: true }],
    [CHARACTER_IDS.APE, APE.subtitleName, { height: 1.77, build: 1.05, dress: 'suit', shirt: 0x232430, hair: 'crop', glasses: true }],
    ['crew1', 'a Sasquatch', { height: 1.82, build: 1.2, dress: 'suit', shirt: 0x1b1b22, hair: 'receding' }],
    ['crew2', 'a Sasquatch', { height: 1.7, build: 1.15, dress: 'suit', shirt: 0x2a2028, hair: 'short', bandana: true }],
  ];
  /* On the chairs the room laid at their table — anchors.crewSeats is the
   * authored pillar four-top's own seat list — rather than on a ring computed
   * here that only roughly agreed with wherever the table grid had landed. */
  crew.forEach(([key, name, model], i) => {
    const seat = a.crewSeats[i % a.crewSeats.length];
    add(key, new Npc(scene, {
      name,
      tier: i < 2 ? 'hero' : 'ambient', job: 'sit',
      x: seat.x, z: seat.z,
      yaw: seat.yaw,
      model,
    }));
  });
  by.ape.homeSeat = { x: by.ape.group.position.x, z: by.ape.group.position.z, yaw: by.ape.group.rotation.y };

  return { all, byName: by, crewTable: pillar };
}

/**
 * The band. They are behind a closed curtain until they are not, so they are
 * built with the room and made visible by the second cutscene.
 *
 * Seven of them, which is what she counts.
 */
export function makeBand(scene, room) {
  const a = room.anchors;
  const members = [];
  const layout = [
    // [x offset, z offset, dress, what they are holding]
    [-4.2, -1.6, 0x1b1b22, 'horn'],
    [-2.1, -1.9, 0x1b1b22, 'horn'],
    [0.0, -2.1, 0x1b1b22, 'horn'],
    [2.1, -1.9, 0x1b1b22, 'horn'],
    [4.2, -1.2, 0x1b1b22, 'bass'],
    [1.6, -3.0, 0x1b1b22, 'drums'],
    [-2.6, 0.4, 0x2a2028, 'lead'],
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
      yaw: 0,
      model: {
        height: rand(1.68, 1.86), build: rand(0.95, 1.2), dress: 'suit', shirt,
        hair: pick(['short', 'crop', 'receding', 'tied']),
      },
    });
    npc.holds = holds;
    npc.group.visible = false;
    members.push(npc);
  });
  return { members, leader: members[6] };
}
