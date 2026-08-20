/**
 * THE SPECIAL MEETING — the four of them, and where they stand.
 *
 * Three established Squatches and one other prospect. Nobody here is dressed
 * for the occasion except Kittenboss, who was told to put on something decent
 * and did, and has since been lying on a spare wheel.
 *
 * This file's header said "the four men" until 2026-08-20. Three of them are
 * men; Kittenboss is a woman, and every pronoun in this file that pointed at
 * her was corrected on the owner's ruling in the same pass. Nothing about the
 * seating, the rearrangement or the boot moved with it -- she is the same
 * prospect at the same rank doing the same thing, and the only thing that was
 * ever wrong was who the comments said she was.
 *
 * ## Clothes come from the ledger, never from here
 *
 * Numbskull and Kittenboss are `WARDROBE.<id>` — the same frozen object the
 * wardrobe ledger points at, spread so nothing here can drift. Seff and Lag
 * are the exception the ledger already documents: they are typed inline on
 * `src/bing/family.js`'s roster rather than promoted into the wardrobe, so
 * this scene pulls them through `FAMILY` exactly the way `src/mansion/cast.js`
 * does. Restating a height or a garment colour in this file would be the drift
 * the ledger exists to stop.
 *
 * ## Why the seating is a function and not a set of coordinates
 *
 * The scene's whole claim is the arrangement: Seff driving, the Prospect
 * beside him, Lag and Numbskull behind. `takeSeats()` writes that down once.
 * `SM-322` is the one beat that moves anybody, and it moves them into the same
 * arrangement by a different route — Numbskull shifts across, Lag slides into
 * the seat he left, and the car ends up exactly as it was. `swapRearSeats()`
 * is that, and it is deliberately the only thing in this file that can change
 * who is behind whom.
 */
import { Npc } from '../bing/cast.js';
import { FAMILY } from '../bing/family.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { WARDROBE } from '../core/wardrobe.js';

/** Seff and Lag live on the Bing roster, by the ledger's own decision. */
const FAMILY_MODELS = new Map(FAMILY.map((member) => [member.id, member.model]));

function familyModel(id) {
  const model = FAMILY_MODELS.get(id);
  if (!model) throw new Error(`${id} is not on the Bing roster; nothing here may invent him a body`);
  return model;
}

/**
 * Who is in the car, what they are called, and which seat is theirs.
 *
 * `arrivesIn` is where they are when the car pulls up — which is the whole
 * trick of SM-100: Lag is in the FRONT passenger seat when it arrives, and he
 * gets out of it, and nobody ever says why.
 */
export const CAST_SPEC = Object.freeze({
  seff: Object.freeze({
    key: 'seff',
    characterId: CHARACTER_IDS.SEFF,
    name: 'Seff',
    voice: 'seff',
    arrivesIn: 'driver',
    seat: 'driver',
    note: 'Never gets out until the woods. He leans across to say hello and '
      + 'goes back to watching the road through the windscreen.',
  }),
  lag: Object.freeze({
    key: 'lag',
    characterId: CHARACTER_IDS.LAG,
    name: 'Lag',
    voice: 'lag',
    arrivesIn: 'front_passenger',
    seat: 'rear_left',
    note: 'Arrives in the front passenger seat and gets out of it. That is the '
      + 'rearrangement, and it is shown rather than explained.',
  }),
  numbskull: Object.freeze({
    key: 'numbskull',
    characterId: CHARACTER_IDS.NUMBSKULL,
    name: 'Numbskull',
    voice: 'numbskull',
    arrivesIn: 'rear_right',
    seat: 'rear_right',
    note: 'Gets out of the back, walks round, opens the front passenger door '
      + 'and holds it. Ends up directly behind the Prospect.',
  }),
  kittenboss: Object.freeze({
    key: 'kittenboss',
    characterId: CHARACTER_IDS.KITTENBOSS,
    name: 'Kittenboss',
    voice: 'kittenboss',
    arrivesIn: 'trunk',
    seat: null,
    note: 'In the boot. Alive, annoyed, and not mentioned by anybody until the '
      + 'car has stopped and the lid is up. Do not explain it.',
  }),
});

/** The arrangement the car pulls away in, and the whole point of the scene. */
export const SEATING = Object.freeze({
  driver: CHARACTER_IDS.SEFF,
  front_passenger: CHARACTER_IDS.PROSPECT,
  rear_left: CHARACTER_IDS.LAG,
  rear_right: CHARACTER_IDS.NUMBSKULL,
});

function modelFor(key) {
  if (key === 'numbskull') return { ...WARDROBE.numbskull };
  if (key === 'kittenboss') return { ...WARDROBE.kittenboss };
  return { ...familyModel(CAST_SPEC[key].characterId) };
}

/**
 * Build the four of them.
 *
 * Nobody is placed meaningfully here: they are made, stamped with their
 * campaign id, and parked. Where they stand is the sequence's business, and
 * the sequence moves them by seat name, never by coordinate.
 */
export function buildSpecialMeetingCast(scene, { sedan = null, colliders = null } = {}) {
  const people = {};
  for (const key of Object.keys(CAST_SPEC)) {
    const spec = CAST_SPEC[key];
    const npc = new Npc(scene, {
      name: spec.name,
      tier: 'hero',
      job: 'stand',
      x: 0, y: 0, z: 0, yaw: 0,
      colliders,
      model: modelFor(key),
    });
    npc.characterId = spec.characterId;
    npc.group.userData.characterId = spec.characterId;
    npc.group.userData.npc.characterId = spec.characterId;
    npc.group.name = `special-meeting ${spec.name}`;
    npc.group.visible = false;
    people[key] = npc;
  }

  const byCharacterId = new Map(
    Object.values(CAST_SPEC).map((spec) => [spec.characterId, people[spec.key]]),
  );

  /* Who is riding in which seat right now. The sedan holds the bodies; this
   * holds the arrangement, because the arrangement is the thing the scene is
   * about and it has to be readable without unpicking a transform. */
  const seated = new Map();

  function place(key, x, y, z, yaw) {
    const npc = people[key];
    npc.group.visible = true;
    npc.group.position.set(x, y, z);
    npc.group.rotation.y = yaw;
    npc.homeX = x;
    npc.homeZ = z;
    npc.homeYaw = yaw;
    return npc;
  }

  function sit(key, seatId) {
    const npc = people[key];
    if (!npc || !sedan) return null;
    npc.group.visible = true;
    npc.sit();
    /* `yaw: false` on purpose. The sedan's own ride-along copies the car's
     * rotation straight onto the rider, and a `makePerson` rig at that yaw is
     * sitting sideways: the car is long on local +X and a person faces local
     * +Z. `facingYaw()` is the same quarter turn the player gets, and it is
     * reapplied every frame in `update` because the car turns. */
    sedan.occupy(seatId, npc.group, { yaw: false });
    seated.set(seatId, key);
    return npc;
  }

  function standUp(key) {
    const npc = people[key];
    if (!npc) return null;
    npc.stand();
    for (const [seatId, who] of seated) {
      if (who === key) { seated.delete(seatId); sedan?.release(seatId); }
    }
    return npc;
  }

  return {
    ...people,
    all: Object.values(people),
    spec: CAST_SPEC,
    seating: SEATING,

    person(characterId) { return byCharacterId.get(characterId) ?? null; },
    byKey(key) { return people[key] ?? null; },

    /** Where everybody is when the headlights stop: Lag in the front. */
    boardForArrival() {
      sit('seff', 'driver');
      sit('lag', 'front_passenger');
      sit('numbskull', 'rear_right');
      if (sedan) {
        const kb = people.kittenboss;
        kb.group.visible = true;
        kb.sit();
        sedan.occupy('rear_left', kb.group, { yaw: false });
        seated.delete('rear_left');
        /* She is not in that seat. She is in the boot, and the boot has no
         * ride-along of its own, so she borrows the nearest one and is moved
         * onto the boot anchor every frame by `update` below. */
        sedan.release('rear_left');
      }
      return this;
    },

    /** Lag out of the front, Numbskull out of the back and round to the door. */
    disembarkForPickup() {
      if (!sedan) return this;
      const lagDoor = sedan.doorWorld('front_passenger');
      standUp('lag');
      place('lag', lagDoor.x, 0, lagDoor.z, sedan.facingYaw() + Math.PI);
      const rearDoor = sedan.doorWorld('rear_right');
      standUp('numbskull');
      place('numbskull', rearDoor.x, 0, rearDoor.z, sedan.facingYaw() + Math.PI);
      return this;
    },

    /** Numbskull at the front passenger door, holding it. He does not let go. */
    holdTheFrontDoor() {
      if (!sedan) return this;
      const door = sedan.doorWorld('front_passenger');
      place('numbskull', door.x, 0, door.z, sedan.facingYaw() + Math.PI);
      return this;
    },

    /** Lag gets in the back without ceremony. Nobody points this out. */
    lagTakesTheBack() { return sit('lag', 'rear_left'), this; },

    /**
     * The arrangement, once the Prospect is in it.
     *
     * Called after the front door shuts. Numbskull walks round the back of the
     * car and gets in behind him; Lag is already behind Seff.
     */
    takeSeats() {
      sit('seff', 'driver');
      sit('lag', 'rear_left');
      sit('numbskull', 'rear_right');
      return this;
    },

    /**
     * SM-322 — the car quietly reorganises itself.
     *
     * Numbskull moves, because he offered. Lag slides into the seat he left,
     * without being asked and without looking up. The seat behind the Prospect
     * is full again and nobody says anything about it.
     */
    swapRearSeats() {
      sit('numbskull', 'rear_left');
      sit('lag', 'rear_right');
      return this;
    },

    /** Who is behind the front passenger seat right now. */
    behindTheProspect() {
      const key = seated.get('rear_right');
      return key ? CAST_SPEC[key].characterId : null;
    },
    seatedAs() { return Object.fromEntries([...seated].map(([s, k]) => [s, CAST_SPEC[k].characterId])); },

    /** Everybody out. Nobody is in a hurry. */
    getOut() {
      if (!sedan) return this;
      for (const key of ['seff', 'lag', 'numbskull']) {
        const seatId = CAST_SPEC[key].seat;
        const door = sedan.doorWorld(seatId);
        standUp(key);
        place(key, door.x, 0, door.z, sedan.facingYaw() + Math.PI);
      }
      return this;
    },

    /** The boot, and the woman in it, who climbs out under her own power. */
    kittenbossOut() {
      if (!sedan) return this;
      const boot = sedan.doorWorld('trunk');
      standUp('kittenboss');
      place('kittenboss', boot.x, 0, boot.z, sedan.facingYaw() + Math.PI);
      return this;
    },

    place,
    sit,
    standUp,

    update(dt, focus = null) {
      const carYaw = sedan ? sedan.facingYaw() : 0;
      for (const npc of Object.values(people)) {
        if (!npc.group.visible) continue;
        npc.update(dt, focus);
      }
      for (const key of seated.values()) people[key].group.rotation.y = carYaw;
      if (sedan && !seated.has('rear_left') && people.kittenboss.seated) {
        /* The boot. She rides where she is, and where she is is not a seat. */
        const boot = sedan.trunkWorld();
        people.kittenboss.group.position.set(boot.x, boot.y - 0.62, boot.z);
        people.kittenboss.group.rotation.y = carYaw;
      }
      return this;
    },

    dispose() {
      for (const npc of Object.values(people)) {
        npc.group.parent?.remove(npc.group);
      }
      seated.clear();
    },
  };
}
