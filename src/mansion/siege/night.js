/**
 * The siege's light: emergency lighting, the alarm, and the fires.
 *
 * WHAT THIS FILE DOES NOT DO. The mansion is ALREADY a night scene --
 * `buildMansionGrounds(scene)` sets scene.background and fog, hangs one
 * shadow-casting moon sized to the property, one hemisphere, and the warm
 * gate/driveway/window/pool points; `buildMansionInterior` adds the
 * chandelier glow, the office lamp and the cellar bulb. A second moon here
 * would double-count the sky and spend a second 1536x1536 shadow map for
 * nothing. So this file adds only what the ATTACK adds: the red emergency
 * pulse, the alarm, and light that comes off things which are burning.
 *
 * Everything registers with the damage overlay, which means `clean` gets the
 * house exactly as the walking tour has always had it -- no red, no klaxon,
 * no firelight -- with no branch anywhere asking whether the siege is on.
 */
import * as THREE from 'three';

const _lightWorld = new THREE.Vector3();

/**
 * Rank a practical against the camera in the same coordinate space.
 *
 * Most house lights sit directly under a scene root, but attack dressing
 * lights are parented to the prop that owns them. Reading `.position` ranked
 * those nested lights at their centimetre-scale local coordinates and could
 * turn off the worklamp while the player was standing beside it.
 */
export function scoreSiegeLight(light, cameraPosition) {
  if (!light?.getWorldPosition || !cameraPosition?.distanceTo) return Infinity;
  /* An extinguished practical has no contribution to rank.  In particular,
   * the nine alarm PointLights sit at intensity zero between pulses; letting
   * their generous ranges outrank a live worklamp spends renderer slots on
   * lights that emit nothing.  A later pulse makes them eligible again on the
   * next ordinary scheduler pass. */
  if (!(Number(light.intensity) > 0)) return Infinity;
  return light.getWorldPosition(_lightWorld).distanceTo(cameraPosition)
    - (Number(light.distance) || 0);
}

/**
 * Where the emergency fittings are, and how bright each one throws.
 *
 * ## EVERY ONE OF THESE IS ON A WALL NOW, AND THAT IS A FIX
 *
 * `node tools/scene-audit.mjs --json mansion-siege` reported five of the nine
 * as FLOATING -- the foyer's two at (0, 44) and the gallery's and conference
 * hall's -- and it was right. They were authored as points in the middle of
 * the air of the room they light, six to nine metres from the nearest
 * surface, with a visible emissive box on each one. Lit, they read as glowing
 * cubes hanging over the foyer; unlit, as nothing at all. An emergency light
 * is a fitting somebody screwed to a wall.
 *
 * So each post now names the wall it is bolted to -- `face` is the axis its
 * backplate is normal to and `into` is which way it throws -- and the fitting
 * is a backplate, a hood and a lens rather than a bare box. The light itself
 * stands 0.3 m proud of the plate so the wall behind it is not the only thing
 * it lights.
 *
 * The wall coordinates are the house's own, copied here for the reason
 * `./attackers.js` and `./ensemble.js` give for copying theirs: importing the
 * two builders drags canvas textures into anything that merely wants to know
 * where the gallery is.
 */
const FOYER_X0 = -8.85;   // MansionInterior.FOYER
const FOYER_X1 = 8.85;
const GALLERY_Z1 = 52.8;  // MansionInterior.GALLERY, its north wall
const CELLAR_Z1 = 67.4;   // MansionGrounds.CELLAR_HALL, its north wall
const ARMORY_X0 = -9;     // MansionGrounds.BASEMENT_ROOM
const CONFERENCE_Z1 = 62.8;
/** How far into the room the point light itself sits, clear of its own hood. */
const LIGHT_STANDOFF = 0.30;

const EMERGENCY_POSTS = Object.freeze([
  /* The cellar corridor, which is the first thing he sees. Three of them
   * down the north wall, which is also the wall the dead guard's settee is
   * against -- they are what makes him readable in one look. */
  { name: 'cellar.west', x: -12, y: -0.9, z: CELLAR_Z1, reach: 9, face: 'z', into: -1 },
  { name: 'cellar.mid', x: -2, y: -0.9, z: CELLAR_Z1, reach: 9, face: 'z', into: -1 },
  { name: 'cellar.east', x: 9, y: -0.9, z: CELLAR_Z1, reach: 9, face: 'z', into: -1 },
  /* The armory, on its west wall. */
  { name: 'armory', x: ARMORY_X0, y: -0.6, z: 56, reach: 12, face: 'x', into: 1 },
  /* The foyer, both storeys of it, on opposite side walls so the hall is lit
   * from two directions instead of from a lamp floating up its middle. */
  { name: 'foyer.low', x: FOYER_X0, y: 3.4, z: 44, reach: 16, face: 'x', into: 1 },
  { name: 'foyer.high', x: FOYER_X1, y: 7.6, z: 44, reach: 16, face: 'x', into: -1 },
  /* The gallery, where the defence is fought: both on its north wall, so
   * they throw SOUTH across the landing and the rail is lit from behind. */
  { name: 'gallery.west', x: -11, y: 8.2, z: GALLERY_Z1, reach: 11, face: 'z', into: -1 },
  { name: 'gallery.east', x: 11, y: 8.2, z: GALLERY_Z1, reach: 11, face: 'z', into: -1 },
  /* Upstairs, on the conference room's north wall outside Lou's office. */
  { name: 'office.hall', x: 0, y: 8.2, z: CONFERENCE_Z1, reach: 11, face: 'z', into: -1 },
]);

const RED = 0xff2d18;

/**
 * @param {object} opts
 * @param {import('./state.js').MansionDamageState} opts.damage
 * @param {(light: THREE.Light) => void} [opts.registerLight] the scene's own
 *   local-light budget hook, same one the mansion's flavour lights use.
 */
export function buildSiegeNight({ damage, registerLight = null } = {}) {
  if (!damage) throw new Error('buildSiegeNight needs the damage overlay');
  const root = new THREE.Group();
  root.name = 'siege-night';

  /* ---------------- emergency lighting ---------------- */
  const emergency = new THREE.Group();
  emergency.name = 'siege-emergency';
  root.add(emergency);
  const posts = [];
  /* The plate is grey and dead; only the lens is emissive, so an unlit alarm
   * leaves a fitting on the wall rather than nothing at all. Shared across all
   * nine -- nothing writes to it per frame, only the lens's own material would
   * be a candidate and that is not animated either. */
  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0x35383e, roughness: 0.8 });
  const hoodMaterial = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.85 });
  for (const post of EMERGENCY_POSTS) {
    const fitting = new THREE.Group();
    /* `lamp`, not `lens`. It is what the thing is, and it is also the word
     * `tools/scene-audit.mjs` already knows means "mounted fixture, nothing
     * underneath it on purpose" -- the same class as a sconce or a pendant. */
    fitting.name = `emergency-lamp-${post.name}`;
    fitting.position.set(post.x, post.y, post.z);
    /* THE CONVENTION, and everything below depends on it: the fitting's own
     * local +Z is the direction it THROWS, and its origin sits on the wall's
     * inner face. Rotating the group is then the whole of "put it on the
     * other wall" -- a post that moves is one line of data, not three of
     * trigonometry at three different offsets. */
    if (post.face === 'x') fitting.rotation.y = post.into > 0 ? Math.PI / 2 : -Math.PI / 2;
    else fitting.rotation.y = post.into > 0 ? 0 : Math.PI;

    /* Backplate. Sunk 2 cm INTO the wall rather than laid against it: the
     * room rectangles this file copies are inner faces, and a plate that
     * exactly kisses one is a plate that floats on the first millimetre of
     * rounding. Two centimetres inside a wall is invisible and unarguable. */
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.05), plateMaterial);
    plate.name = `emergency-lamp-${post.name}.plate`;
    plate.position.set(0, 0, 0.005);
    fitting.add(plate);
    /* A hood over the lens, so the light throws down and out rather than
     * straight up into the ceiling. */
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.16), hoodMaterial);
    hood.name = `emergency-lamp-${post.name}.hood`;
    hood.position.set(0, 0.1, 0.11);
    fitting.add(hood);
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.1, 0.12),
      new THREE.MeshBasicMaterial({ color: RED }),
    );
    lens.name = `emergency-lamp-${post.name}.lens`;
    lens.position.set(0, 0, 0.09);
    fitting.add(lens);
    const light = new THREE.PointLight(RED, 0, post.reach, 2);
    /* Proud of the plate. A point light inside its own backplate lights the
     * inside of its own backplate. */
    light.position.set(0, 0, LIGHT_STANDOFF);
    fitting.add(light);
    emergency.add(fitting);
    posts.push({ light, lens, peak: 2.6 });
    registerLight?.(light);
  }
  damage.group('night.emergency', { object: emergency, layers: ['alarm'] });

  /* ---------------- battle hierarchy ---------------- */
  /* The live review showed one broad red wash competing with the mansion's
   * chandeliers. Three bounded practicals give the route readable colour
   * beats without adding another sky light: cold at the shattered entrance,
   * cold rim at the firing rail, warm at Lou's command desk. They enter the
   * composition root's same nearest-N pool as every mansion practical, so
   * this costs three candidates and never breaks the shader-light budget. */
  const accentRoot = new THREE.Group();
  accentRoot.name = 'siege-battle-accents';
  root.add(accentRoot);
  const accents = {};

  function accent(role, {
    x, y, z, colour, intensity, reach, lens = [0.7, 0.08, 0.16], into = -1,
  }) {
    const fixture = new THREE.Group();
    fixture.name = `siege-accent-${role}`;
    fixture.position.set(x, y, z);

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(lens[0] + 0.12, lens[1] + 0.08, lens[2] + 0.05),
      new THREE.MeshStandardMaterial({ color: 0x20252b, roughness: 0.82 }),
    );
    plate.name = `siege-accent-${role}.plate`;
    fixture.add(plate);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(...lens),
      new THREE.MeshBasicMaterial({ color: colour }),
    );
    glow.name = `siege-accent-${role}.lens`;
    glow.position.z = into * 0.04;
    fixture.add(glow);

    const light = new THREE.PointLight(colour, intensity, reach, 2);
    light.name = `siege-accent-${role}.light`;
    light.position.set(0, -0.18, into * 0.35);
    light.userData.siegeAccent = role;
    fixture.add(light);
    accentRoot.add(fixture);
    registerLight?.(light);

    const entry = {
      fixture,
      light,
      anchor: Object.freeze({ x, y, z }),
    };
    accents[role] = entry;
    return entry;
  }

  accent('breach', {
    x: 0, y: 4.25, z: 36.55,
    colour: 0x7faeff, intensity: 4.2, reach: 14, into: 1,
  });
  accent('gallery', {
    x: 0, y: 8.45, z: 49.0,
    colour: 0x86b9e8, intensity: 3.4, reach: 11, into: -1,
  });
  accent('command', {
    x: -0.6, y: 7.55, z: 70.85,
    colour: 0xffb45f, intensity: 3.0, reach: 7.5, lens: [0.46, 0.07, 0.14], into: -1,
  });
  damage.group('night.accents', { object: accentRoot, layers: ['battle'] });

  /* ---------------- the alarm ---------------- */
  /* Audio belongs to the scene's engine; what lives here is the CLOCK both
   * the sound and the light run off, so the pulse and the two-tone stay in
   * step instead of drifting apart over four minutes. */
  const alarm = {
    /** Seconds per full cycle. Slow: a house alarm, not a fire drill. */
    period: 1.45,
    phase: 0,
    get lit() { return this.phase < this.period * 0.42; },
    /** True on the frame the tone should start. Read once per frame. */
    struck: false,
  };

  function update(dt) {
    const step = Math.max(0, Number(dt) || 0);
    const lit = damage.activeLayers.has('alarm');
    alarm.struck = false;
    if (!lit) {
      alarm.phase = 0;
      for (const post of posts) post.light.intensity = 0;
      return;
    }
    const before = alarm.phase;
    alarm.phase = (alarm.phase + step) % alarm.period;
    if (alarm.phase < before) alarm.struck = true;
    /* A soft ramp rather than a square wave: a strobe that snaps on and off
     * at 1.45 s reads as a broken light, not as an alarm. */
    const t = alarm.phase / alarm.period;
    const swell = Math.max(0, Math.sin(t * Math.PI * 2)) ** 1.6;
    for (const post of posts) post.light.intensity = swell * post.peak;
  }

  return { root, update, alarm, posts, emergency, accentRoot, accents };
}
