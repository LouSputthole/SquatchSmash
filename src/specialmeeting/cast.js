/**
 * THE SPECIAL MEETING — the four of them, and where they stand.
 *
 * Three established Squatches and one other prospect. All four wear restrained
 * formal suits for the meeting: well fitted, individual, and deliberately not
 * tuxedos or a row of matching security uniforms. Kittenboss's has since been
 * lying on a spare wheel with her.
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
import * as THREE from 'three';
import { Npc } from '../bing/cast.js';
import { markActor, readActor, setActorPosture } from '../core/staging.js';
import { FAMILY } from '../bing/family.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { formalMeetingModel } from '../core/formal-appearance.js';
import { WARDROBE } from '../core/wardrobe.js';

/** Seff and Lag live on the Bing roster, by the ledger's own decision. */
const FAMILY_ROWS = new Map(FAMILY.map((member) => [member.id, member]));
const VEHICLE_LOCAL_FOCUS = new THREE.Vector3();

function familyRow(id) {
  const row = FAMILY_ROWS.get(id);
  if (!row) throw new Error(`${id} is not on the Bing roster; nothing here may invent him a body`);
  return row;
}

function familyModel(id) {
  return familyRow(id).model;
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
 * Numbskull uses the largest established body in this cast. The shared seated
 * fold keeps his anatomy connected, but at the generic 0.64 m drop his crown
 * passes through the sedan headliner. Lower only his body origin while keeping
 * the vehicle-owned rear seat anchor, eye-line, and attachment hierarchy.
 */
const RIDER_DROP = Object.freeze({ numbskull: 0.79 });

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
 * Bring the trunk reveal round the passenger-side rear corner of the car.
 * The old centreline exit put Kittenboss directly behind the boot lid and the
 * whole Lincoln from Tony's front-passenger-door eye: her subtitle played on
 * a frame containing only bodywork. She is still at the trunk, but now on the
 * side the player is standing on, where a person climbing out would land.
 */
const TRUNK_REVEAL_PASSENGER_OFFSET_M = 1.05;

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

/**
 * The shared rig's eye line and belt, on its unscaled 1.78 m frame.
 *
 * `makePerson`'s own header states the eye: *"1.78m to the top of the head,
 * eyes at 1.66"*, which is also exactly the height `main.js` puts the player's
 * camera at. The belt is measured on a built rig, where the waist pivot sits
 * at 1.150.
 */
const RIG_EYE_M = 1.66;
const RIG_WAIST_M = 1.15;

/**
 * Put this body's OWN proportions on its actor marker.
 *
 * `Npc` marks every body it builds, which is the whole reason this scene is
 * checkable at all -- but it marks them with `markActor`'s defaults, and those
 * defaults are `src/core/person.js`'s: an eye at 2.30 m and a belt at 1.16 m,
 * off the old Sasquatch Smash rig. Nobody in this car is built on it. Measured
 * on the built kerb, all four of them declared an eye 2.300 above their feet
 * while the top of Numbskull's head -- the tallest of them -- was 1.942 above
 * his, so the point the staging gate rays out of and the framing gate frames
 * was between forty and eighty centimetres above every skull in the scene.
 *
 * The right place for this is `Npc` itself, which knows its own `heightScale`
 * and does not currently pass it on. Until it does, the scene that knows its
 * cast are `makePerson` bodies says so here, and re-marking is safe because
 * everything else on the marker is read straight back off it: only the two
 * heights change. Posture is set separately (`setActorPosture`) and is not
 * touched by a re-mark.
 */
function markWithRealProportions(npc) {
  const marked = readActor(npc.group);
  if (!marked) throw new Error('Special Meeting cast member was built without an actor marker');
  const scale = npc.parts?.heightScale;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`${marked.id} has no rig scale to take an eye height from`);
  }
  markActor(npc.group, {
    ...marked,
    eyeHeight: RIG_EYE_M * scale,
    hipHeight: RIG_WAIST_M * scale,
  });
  return npc;
}

function canonicalModelFor(key) {
  if (key === 'numbskull') return { ...WARDROBE.numbskull };
  if (key === 'kittenboss') return { ...WARDROBE.kittenboss };
  return { ...familyModel(CAST_SPEC[key].characterId) };
}

/** One roster row's photograph, and the fallback it authorises for it. */
const rosterPhoto = (id) => {
  const row = familyRow(id);
  return Object.freeze({ photo: row.photo, photoFallback: row.photoFallback ?? null });
};

/**
 * WHOSE PHOTOGRAPH GOES ON WHOSE HEAD.
 *
 * This scene is the only one in the campaign that stages named Circle members
 * and never passed `face` to the shared builder, so all four of them fell
 * through to `makePerson`'s drawn head while the Bing, the Mansion and the
 * Initiation were putting the owner's real photographs on the same people.
 * That is the second half of the owner's "missing faces" report — the first
 * half was the Special Meeting's cabin being lit by nothing, fixed separately
 * in `src/specialmeeting/forest/sedan-adapter.js` — and it is why a man who
 * has a face everywhere else arrived here without one.
 *
 * The three names come out of `FAMILY` rather than being typed here. The Bing
 * roster is already the place that decides which photograph belongs to which
 * member (it is the only place carrying `photoFallback` as well), and a second
 * copy of "Seff wears seff.png" in a scene file is precisely the drift the
 * ledger exists to stop — the same argument that keeps the clothes in the
 * roster and not in this file. Kittenboss is the one attendee with no roster
 * row: she is never in the club, so she is on nobody's roster, and her
 * photograph therefore has to be named somewhere. It is named here, once, and
 * the moment she gains a `FAMILY`-style row this should read it off that row
 * with the other three.
 *
 * Kittenboss's dedicated portrait has landed. Seff, Lag and Numbskull still
 * resolve to `null` and keep their authored heads; that is intentional until
 * their files land. The index remains the authority, so no scene probes a
 * missing image and produces a 404 in every player's console.
 */
const FACE_PHOTOS = Object.freeze({
  seff: rosterPhoto(CHARACTER_IDS.SEFF),
  lag: rosterPhoto(CHARACTER_IDS.LAG),
  numbskull: rosterPhoto(CHARACTER_IDS.NUMBSKULL),
  kittenboss: Object.freeze({ photo: 'kittenboss.png', photoFallback: null }),
});

/**
 * Resolve one attendee's photograph against the index of what is on disk.
 *
 * Deliberately the same three lines as `populateFamily` in
 * `src/bing/family.js`: the named photo if it has landed, then the roster's
 * `photoFallback` if that has, then nothing. `null` is spread onto the model
 * rather than left off it so the field is always present and always readable —
 * the check in `tools/verify-specialmeeting.mjs` asks each built attendee what
 * it is wearing, and "the key is missing" and "the photo has not landed" are
 * not the same answer.
 */
function faceFor(key, faces) {
  const named = FACE_PHOTOS[key];
  if (!named) return null;
  const photo = faces.has(named.photo) ? named.photo
    : (named.photoFallback && faces.has(named.photoFallback) ? named.photoFallback : null);
  return photo ? `assets/faces/${photo}` : null;
}

/**
 * Scene variants over canonical bodies; ordinary-scene outfits stay intact.
 *
 * A function of the face index rather than a frozen module-scope table,
 * because which photograph a person can wear is a fact about the filesystem
 * and this module is imported long before anything has asked the server about
 * it. `face` is spread onto the canonical body BEFORE the formal adapter runs,
 * exactly as `initiationFormalModel` does it in
 * `src/initiation/ceremony-figure.js`: `formalMeetingModel` strips garments
 * and keeps identity, and a face is identity, so it survives untouched. That
 * is also why this does not add a `face` option to the adapter — it would be a
 * second copy of the Initiation's helper for no gain.
 */
export function specialMeetingModels(faces = new Set()) {
  return Object.freeze(Object.fromEntries(
    Object.keys(CAST_SPEC).map((key) => [
      key,
      formalMeetingModel(CAST_SPEC[key].characterId, {
        ...canonicalModelFor(key),
        face: faceFor(key, faces),
      }),
    ]),
  ));
}

/**
 * The four of them with no index to go on: the drawn heads, every face null.
 *
 * Kept as an export because the headless gates and the tests build this cast
 * with no server to fetch an index from — `tools/geometry-scenes.mjs` calls
 * `buildSpecialMeetingCast(scene)` bare, and a photo texture it could not load
 * would be noise in a geometry bucket either way.
 */
export const SPECIAL_MEETING_MODELS = specialMeetingModels();

function modelFor(models, key) {
  const model = models[key];
  if (!model) throw new Error(`${key} has no Special Meeting formal appearance`);
  return model;
}

/**
 * Build the four of them.
 *
 * Nobody is placed meaningfully here: they are made, stamped with their
 * campaign id, and parked. Where they stand is the sequence's business, and
 * the sequence moves them by seat name, never by coordinate.
 *
 * `faces` is the resolved `assets/faces/index.json` — the set of photographs
 * that have actually landed — and it arrives from the caller for the same
 * reason `populateFamily` takes it rather than fetching it: a scene module
 * that reaches for the network on import cannot be built by a headless gate,
 * a test or the geometry sweep, all three of which call this with no options
 * at all and get the authored heads. `src/specialmeeting/main.js` awaits
 * `loadFaceIndex()` once at the top and hands the result down, exactly as
 * `src/bing/main.js` does for the club.
 */
export function buildSpecialMeetingCast(scene, {
  sedan = null, colliders = null, groundAt = null, faces = new Set(),
} = {}) {
  const models = specialMeetingModels(faces);
  const people = {};
  for (const key of Object.keys(CAST_SPEC)) {
    const spec = CAST_SPEC[key];
    const npc = new Npc(scene, {
      name: spec.name,
      tier: 'hero',
      job: 'stand',
      x: 0, y: 0, z: 0, yaw: 0,
      colliders,
      model: modelFor(models, key),
    });
    npc.characterId = spec.characterId;
    npc.group.userData.characterId = spec.characterId;
    npc.group.userData.npc.characterId = spec.characterId;
    npc.group.name = `special-meeting ${spec.name}`;
    npc.group.visible = false;
    markWithRealProportions(npc);
    people[key] = npc;
  }

  const byCharacterId = new Map(
    Object.values(CAST_SPEC).map((spec) => [spec.characterId, people[spec.key]]),
  );

  /* Who is riding in which seat right now. The sedan holds the bodies; this
   * holds the arrangement, because the arrangement is the thing the scene is
   * about and it has to be readable without unpicking a transform. */
  const seated = new Map();
  /* Whether Kittenboss is riding in the boot. Her own state, because the seat
   * she used to be keyed off belongs to Lag from the moment the drive starts. */
  let bootRider = false;
  /* The live player focus during the kerb pickup only. `holdTheFrontDoor()`
   * restages both men when SM-110 opens; without retaining this point, that
   * move overwrites the body turn they have spent SM-100 making and can leave
   * a head pinned at its one-radian gaze limit. Later standing tableaux keep
   * their existing car-facing direction because this flag closes when Lag
   * boards. */
  const pickupFocus = new THREE.Vector3();
  let hasPickupFocus = false;
  let pickupAttention = false;

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
    /* A rider released from the sedan keeps the seat anchor's world
     * quaternion.  For the rear-right seat Three decomposes that quaternion
     * as X = PI, Y = ..., Z = PI.  Writing only `rotation.y` therefore leaves
     * the standing rig upside-down in Euler space and reverses its declared
     * +Z face axis: Numbskull was visibly beside the open front door while
     * the staging gate correctly measured him looking straight back into the
     * Lincoln at 0.14 m.  A standing placement owns the whole upright pose,
     * not one component of the previous seated pose, so clear the carried
     * pitch and roll together with setting its authored heading. */
    npc.group.rotation.set(0, yaw, 0);
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
    const rider = people[key].group;
    const offset = RIDER_YAW_OFFSET[key] ?? 0;
    rider.rotation.y = rider.userData.vehicleAnchor
      ? Math.PI / 2 + offset
      : carFacing() + offset;
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
    const kb = people.kittenboss;
    sedan.occupy('trunk', kb.group, {
      drop: 0.62,
      localYaw: Math.PI / 2 + BOOT_YAW_OFFSET,
    });
    /* She is riding too, and more thoroughly inside the car than anybody. */
    setActorPosture(kb.group, 'ride');
    /* Owner, 2026-08-31: "kitten boss is poking out through the trunk. Her
     * head is sticking out. ... we have to make sure that she's invisible in
     * the trunk." A closed boot shows nothing, whatever the rig's seated
     * head height does against the lid — so her visibility IS the lid:
     * hidden while it is down, revealed the moment SM-410's clunk starts it
     * rising, in time for "the little bulb inside comes on". The street
     * sedan keeps the boot's clock even after the forest owns the drive
     * (see sedan.js advanceTrunk), so trunkOpen is live throughout. */
    kb.group.visible = (sedan.trunkOpen ?? 0) > 0.04;
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
    sedan.occupy(seatId, npc.group, {
      ...(Number.isFinite(RIDER_DROP[key]) ? { drop: RIDER_DROP[key] } : {}),
      localYaw: Math.PI / 2 + (RIDER_YAW_OFFSET[key] ?? 0),
    });
    /* RIDING, not merely sitting. The distinction earns its keep at the
     * staging gate: a man in a chair who is inside a solid is a bug, and a
     * man in a car who is inside a solid is a passenger -- the sedan's
     * collider is one box from the road to 2.28 m with the cabin inside it,
     * because it is the wall the player walks round. Marking the difference
     * here is what stops four passengers reporting as ten faults. */
    setActorPosture(npc.group, 'ride');
    seated.set(seatId, key);
    faceRider(key);
    return npc;
  }

  function standUp(key) {
    const npc = people[key];
    if (!npc) return null;
    for (const [seatId, who] of seated) {
      if (who === key) { seated.delete(seatId); sedan?.release(seatId); }
    }
    if (key === 'kittenboss') sedan?.release('trunk');
    npc.stand();
    return npc;
  }

  return {
    ...people,
    all: Object.values(people),
    spec: CAST_SPEC,
    seating: SEATING,

    /* What each of them was actually built wearing, including the photograph
     * that resolved for them or the `null` that did not. `makePerson` folds a
     * face into a head material and keeps no record of where it came from, and
     * `parts.profile` carries garments and body only, so without this the only
     * way for a live check to ask "did Seff get his photograph?" would be to
     * dig a texture out of a material and try to recognise its URL. The
     * browser check in tools/verify-specialmeeting.mjs reads this. */
    models,
    facePhotos: FACE_PHOTOS,

    person(characterId) { return byCharacterId.get(characterId) ?? null; },
    byKey(key) { return people[key] ?? null; },

    /** Where everybody is when the headlights stop: Lag in the front. */
    boardForArrival() {
      sit('seff', 'driver');
      sit('lag', 'front_passenger');
      sit('numbskull', 'rear_right');
      if (sedan) {
        const kb = people.kittenboss;
        /* Visibility belongs to the boot lid now -- rideInTheBoot() sets it. */
        kb.sit();
        rideInTheBoot();
        bootRider = true;
      }
      return this;
    },

    /** Lag out of the front, Numbskull out of the back and round to the door. */
    disembarkForPickup() {
      if (!sedan) return this;
      pickupAttention = true;
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
      if (hasPickupFocus) {
        for (const key of ['lag', 'numbskull']) {
          people[key].faceToward(pickupFocus.x, pickupFocus.z, true);
          people[key].gaze = 0;
          people[key].parts.head.rotation.y = 0;
        }
      }
      return this;
    },

    /** Lag gets in the back without ceremony. Nobody points this out. */
    lagTakesTheBack() {
      pickupAttention = false;
      return sit('lag', 'rear_left'), this;
    },

    /**
     * The arrangement, once the Prospect is in it.
     *
     * Called after the front door shuts. Numbskull walks round the back of the
     * car and gets in behind him; Lag is already behind Seff.
     */
    takeSeats() {
      pickupAttention = false;
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
      bootRider = false;
      standUp('kittenboss');
      /* Out of the boot she is unconditionally visible, whatever the lid's
       * interpolation was doing on the frame the beat landed. */
      people.kittenboss.group.visible = true;
      const trunk = sedan.doorWorld('trunk');
      const passengerDoor = sedan.doorWorld('front_passenger');
      const centre = sedan.group.getWorldPosition(new THREE.Vector3());
      const sideX = passengerDoor.x - centre.x;
      const sideZ = passengerDoor.z - centre.z;
      const sideLength = Math.hypot(sideX, sideZ) || 1;
      trunk.x += (sideX / sideLength) * TRUNK_REVEAL_PASSENGER_OFFSET_M;
      trunk.z += (sideZ / sideLength) * TRUNK_REVEAL_PASSENGER_OFFSET_M;
      placeBeside('kittenboss', trunk, {
        away: true, standoff: 0.28,
      });
      return this;
    },

    /**
     * Which seat a person is in, or null if they are on their feet.
     *
     * Published so `main.js` can emit a line from the CAR's own seat anchor
     * rather than from the rig -- a seated rig's origin is at its feet, under
     * the floor pan. Takes a cast key or a character id, because callers have
     * one or the other.
     */
    seatOf(who) {
      const key = people[who]
        ? who
        : (Object.values(CAST_SPEC).find((spec) => spec.characterId === who)?.key ?? null);
      if (!key) return null;
      for (const [seat, occupant] of seated) if (occupant === key) return seat;
      return null;
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
      if (focus) {
        pickupFocus.copy(focus);
        hasPickupFocus = true;
        if (pickupAttention) {
          for (const key of ['lag', 'numbskull']) {
            if (!people[key].seated) people[key].faceToward(focus.x, focus.z);
          }
        }
      }
      for (const npc of Object.values(people)) {
        if (!npc.group.visible) continue;
        let actorFocus = focus;
        if (focus && npc.group.userData.vehicleAnchor && npc.group.parent) {
          VEHICLE_LOCAL_FOCUS.copy(focus);
          npc.group.parent.worldToLocal(VEHICLE_LOCAL_FOCUS);
          actorFocus = VEHICLE_LOCAL_FOCUS;
        }
        npc.update(dt, actorFocus);
      }
      /* Reapplied every frame because the car turns, and because an idling rig
       * drifts its own yaw towards whatever it is looking at. */
      for (const key of seated.values()) faceRider(key);
      if (sedan && bootRider && people.kittenboss.seated) {
        people.kittenboss.group.rotation.y = Math.PI / 2 + BOOT_YAW_OFFSET;
        /* The lid owns her visibility every frame she is stowed — see
         * rideInTheBoot(). */
        people.kittenboss.group.visible = (sedan.trunkOpen ?? 0) > 0.04;
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
