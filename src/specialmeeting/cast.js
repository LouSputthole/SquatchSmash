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
 *
 * ## Which way they are pointed, and what they are standing on
 *
 * Both of those were wrong in the same way until the staging gate was pointed
 * at this scene: they were nobody's job. A rider took the PLAYER's yaw for the
 * car and so faced the back of it; a man who got out was turned along the car
 * rather than at it, and four of them agreed on that heading to nine decimal
 * places; and everybody was placed at y = 0, including on a clearing floor
 * thirty-two metres up. The three constants at the top of this file and
 * `placeBeside()` are the fix, and every number in them is authored --
 * `Math.random` here would move the geometry gate's buckets on every build.
 * See docs/STAGING-GATE.md.
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

/**
 * Which way each of them is turned, in radians, off whatever they are looking
 * at.
 *
 * The staging gate's first pass over this scene (docs/STAGING-GATE.md) found
 * the whole car agreeing on one heading to nine decimal places: three men in
 * the seats at exactly the car's yaw, and at the spur four of them standing
 * round it on exactly the same one. That is FACING_UNIFORM, and it is the
 * owner's note about the van -- "they are all looking forward at the same
 * spot". They still watch the road and they still stand at the car; no two of
 * them now agree to the degree about where either of those is.
 *
 * AUTHORED CONSTANTS, NEVER `Math.random`. A jittered yaw would move the
 * geometry gate's recorded buckets on every build, which is a gate reporting
 * its own noise as a change to the scene.
 */
const RIDER_YAW_OFFSET = Object.freeze({
  seff: 0.05,       // squared up on the wheel, watching the road
  lag: -0.14,       // turned into the door card, on his phone
  numbskull: 0.19,  // looking out of his own window at nothing
});

/**
 * How she is wedged in the boot: facing the lid, and not square to it.
 *
 * Half a turn off the car's nose, because the one thing a person in a boot is
 * looking at is the way out of it.
 */
const BOOT_YAW_OFFSET = Math.PI + 0.24;

/** The same variance, for the ones who are out of the car and on their feet. */
const STANDING_YAW_OFFSET = Object.freeze({
  seff: -0.09,
  lag: 0.22,
  numbskull: -0.16,
  kittenboss: 0.31,
});

/**
 * How far Lag steps up the pavement when Numbskull comes for the door.
 *
 * SM-100's stage direction is explicit: "Numbskull arrives at the front
 * passenger door, WAITS FOR LAG TO STEP CLEAR OF IT, and opens it." Nobody
 * stepped anywhere until this constant existed -- `holdTheFrontDoor()` put
 * Numbskull on the door anchor Lag was already standing on, and both of them
 * measured (-3.200, -6.210) on the built kerb: one body, from SM-110 until Lag
 * got in the back.
 */
const STEP_CLEAR_M = 1.7;

/**
 * How far back from a door anchor a man stands once he is just WAITING.
 *
 * A door anchor is where you stand to open a door -- close enough to reach the
 * handle -- and until this constant existed it was also where everybody stood
 * for the whole of Act Four. Measured on the built spur, in the car's own
 * frame: that leaves a shoulder 0.20 m off the wheel arch, and four people
 * standing about at twenty centimetres from the paint is not what standing
 * about looks like.
 *
 * It is also what the geometry gate was reporting. That gate compares WORLD
 * axis-aligned boxes, and the car at the spur is parked 28 degrees off the
 * world axes, so the box round its two-and-a-half-metre sill reaches about
 * 0.4 m past its own flank: 109 findings, every one of them a man standing
 * beside a car he was measurably not touching. Half a metre of step-back
 * clears the real gap and the reported one at the same time -- measured at
 * 0.40 m, authored at 0.55 for margin.
 */
const WAITING_STANDOFF_M = 0.55;

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
export function buildSpecialMeetingCast(scene, {
  sedan = null, colliders = null, groundAt = null,
} = {}) {
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

  /**
   * WHAT THEY ARE STANDING ON.
   *
   * Everything here used to be placed at y = 0, which is true of the road
   * outside the flat and of nowhere else this scene goes. Measured on the
   * built spur: the clearing floor is 32.605 under a car parked at 32.622, so
   * `getOut()` put all three of them thirty-two metres under the ground they
   * had just driven onto. The block had the smaller version of the same bug --
   * the front passenger door anchor is at z -6.21, which is the PAVEMENT, and
   * the pavement is a kerb-height 0.15 above the road, so whoever was holding
   * that door was buried to the ankle in it.
   *
   * So the scene tells the cast what the ground does: `layout.groundAt` on the
   * block, `forest.heightAt` in the woods (`setGround` swaps it at the cut to
   * black), and a flat zero for a test that has neither.
   */
  let ground = typeof groundAt === 'function' ? groundAt : null;
  const floorAt = (x, z) => {
    const y = ground?.(x, z);
    return Number.isFinite(y) ? y : 0;
  };

  /**
   * The way the car's nose points, in the rig's own convention.
   *
   * `sedan.facingYaw()` is the PLAYER's yaw -- his forward is (-sin, -cos) --
   * and a `makePerson` rig's forward is +Z, (sin, cos). The two are half a turn
   * apart, and `update()` used to write the player's number straight onto the
   * riders: measured on the built kerb, Seff's face pointed 180.0 degrees off
   * the car's nose. That is the driver watching the back seat for the whole of
   * a two-minute drive, and it was in front of the player the entire time.
   */
  const carFacing = () => (sedan ? sedan.facingYaw() + Math.PI : 0);

  /** The yaw that turns a rig standing at (x, z) to look at (tx, tz). */
  const yawToward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

  function place(key, x, y, z, yaw) {
    const npc = people[key];
    npc.group.visible = true;
    npc.group.position.set(x, y, z);
    npc.group.rotation.y = yaw;
    npc.homeX = x;
    npc.homeZ = z;
    npc.homeYaw = yaw;
    /* AND the rig's own datum, not just this frame's position. `Npc.update()`
     * writes `baseY + bob` on every idle frame, so a man placed on a clearing
     * floor 32 m up without this line stood there for exactly one frame and
     * then dropped to the y he was constructed at. */
    npc.baseY = y;
    return npc;
  }

  /**
   * Put a man on the ground beside the car, looking at it.
   *
   * At it, rather than along it: everybody who got out used to be turned to
   * `facingYaw() + PI`, which is where the car's NOSE points, so a man standing
   * at an open door with the Prospect beside it was looking down the street
   * past the wing. `away` is the exception -- the one holding the front door is
   * looking out of it at Tony, and the one who has just climbed out of the boot
   * is not looking back into it.
   */
  function placeBeside(key, spot, { away = false, standoff = 0 } = {}) {
    const centre = sedan.group.position;
    const out = Math.hypot(spot.x - centre.x, spot.z - centre.z) || 1;
    const x = spot.x + ((spot.x - centre.x) / out) * standoff;
    const z = spot.z + ((spot.z - centre.z) / out) * standoff;
    const look = yawToward(x, z, centre.x, centre.z) + (away ? Math.PI : 0);
    return place(key, x, floorAt(x, z), z, look + STANDING_YAW_OFFSET[key]);
  }

  /** A rider, turned the way the car is going, off his own authored offset. */
  function faceRider(key) {
    if (!sedan) return;
    people[key].group.rotation.y = carFacing() + (RIDER_YAW_OFFSET[key] ?? 0);
  }

  /**
   * The boot, and the woman riding in it.
   *
   * She is not in a seat and there is no ride-along for the boot, so she is
   * moved onto the anchor here -- from `boardForArrival` once, and from
   * `update` every frame while the car is moving.
   */
  function rideInTheBoot() {
    if (!sedan) return;
    const boot = sedan.trunkWorld();
    const kb = people.kittenboss;
    kb.group.position.set(boot.x, boot.y - 0.62, boot.z);
    kb.group.rotation.y = carFacing() + BOOT_YAW_OFFSET;
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
    faceRider(key);
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
         * ride-along of its own, so she borrows the nearest one to be folded
         * and dropped, and is then put on the boot anchor -- here, and again
         * every frame by `update` below. */
        sedan.release('rear_left');
        rideInTheBoot();
      }
      return this;
    },

    /** Lag out of the front, Numbskull out of the back and round to the door. */
    disembarkForPickup() {
      if (!sedan) return this;
      standUp('lag');
      /* "Lag gets out of the FRONT and stands with the door open behind him,
       * on his phone" -- SM-100. Behind him, so he is turned out of the car. */
      placeBeside('lag', sedan.doorWorld('front_passenger'), { away: true });
      standUp('numbskull');
      placeBeside('numbskull', sedan.doorWorld('rear_right'));
      return this;
    },

    /** Numbskull at the front passenger door, holding it. He does not let go. */
    holdTheFrontDoor() {
      if (!sedan) return this;
      const door = sedan.doorWorld('front_passenger');
      /* Lag steps clear first, up the pavement past the wing, because SM-100
       * says he does and because the alternative is two men in one body. */
      const nose = carFacing();
      placeBeside('lag', {
        x: door.x + Math.sin(nose) * STEP_CLEAR_M,
        z: door.z + Math.cos(nose) * STEP_CLEAR_M,
      }, { away: true });
      placeBeside('numbskull', door, { away: true });
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
        standUp(key);
        placeBeside(key, sedan.doorWorld(CAST_SPEC[key].seat), { standoff: WAITING_STANDOFF_M });
      }
      return this;
    },

    /** The boot, and the woman in it, who climbs out under her own power. */
    kittenbossOut() {
      if (!sedan) return this;
      standUp('kittenboss');
      placeBeside('kittenboss', sedan.doorWorld('trunk'), {
        away: true, standoff: WAITING_STANDOFF_M,
      });
      return this;
    },

    place,
    placeBeside,
    sit,
    standUp,

    /**
     * Change what the ground is doing under them.
     *
     * One call, at the cut to black: the block is flat and the woods are not,
     * and `main.js` is the only thing that knows which of the two the scene is
     * standing in at any moment.
     */
    setGround(fn) {
      ground = typeof fn === 'function' ? fn : null;
      return this;
    },

    update(dt, focus = null) {
      for (const npc of Object.values(people)) {
        if (!npc.group.visible) continue;
        npc.update(dt, focus);
      }
      /* Reapplied every frame because the car turns, and because an idling rig
       * drifts its own yaw towards whatever it is looking at. */
      for (const key of seated.values()) faceRider(key);
      /* The boot. She rides where she is, and where she is is not a seat. */
      if (sedan && !seated.has('rear_left') && people.kittenboss.seated) rideInTheBoot();
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
