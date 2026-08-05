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

/** Where the emergency fittings are, and how bright each one throws. */
const EMERGENCY_POSTS = Object.freeze([
  /* The cellar corridor, which is the first thing he sees. */
  { name: 'cellar.west', x: -12, y: -0.9, z: 65.8, reach: 9 },
  { name: 'cellar.mid', x: -2, y: -0.9, z: 65.8, reach: 9 },
  { name: 'cellar.east', x: 9, y: -0.9, z: 65.8, reach: 9 },
  /* The armory. */
  { name: 'armory', x: 0, y: -0.6, z: 56, reach: 12 },
  /* The foyer, both storeys of it. */
  { name: 'foyer.low', x: 0, y: 3.4, z: 44, reach: 16 },
  { name: 'foyer.high', x: 0, y: 7.6, z: 44, reach: 16 },
  /* The gallery, where the defence is fought. */
  { name: 'gallery.west', x: -11, y: 8.2, z: 50.5, reach: 11 },
  { name: 'gallery.east', x: 11, y: 8.2, z: 50.5, reach: 11 },
  /* Upstairs, outside Lou's office. */
  { name: 'office.hall', x: 0, y: 8.2, z: 62, reach: 11 },
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
  for (const post of EMERGENCY_POSTS) {
    const fitting = new THREE.Group();
    fitting.name = `emergency-${post.name}`;
    fitting.position.set(post.x, post.y, post.z);
    /* The fitting itself, so the light has a source you can look at rather
     * than a glow with nothing making it. */
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.1, 0.12),
      new THREE.MeshBasicMaterial({ color: RED }),
    );
    lens.name = `emergency-lens-${post.name}`;
    fitting.add(lens);
    const light = new THREE.PointLight(RED, 0, post.reach, 2);
    fitting.add(light);
    emergency.add(fitting);
    posts.push({ light, lens, peak: 2.6 });
    registerLight?.(light);
  }
  damage.group('night.emergency', { object: emergency, layers: ['alarm'] });

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

  return { root, update, alarm, posts, emergency };
}
