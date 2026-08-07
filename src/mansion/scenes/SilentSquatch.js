/**
 * PROJECT SILENT SQUATCH -- the space and the systems.
 *
 * This module owns everything behind the marble bust: the innocent half of
 * the basement, the hidden entrance, the concrete stairwell, the
 * interrogation area, the observation area, the sealed laboratory behind its
 * reinforced glass, the core, the gas, the six people in the room and the
 * reinforced-glass audio path. It owns NO mission logic and NO dialogue --
 * `src/mansion/mission/` and `src/mansion/script.js` drive all of this
 * through the `lab` handle returned at the bottom of the file.
 *
 * See docs/MISSION-SILENT-SQUATCH.md (beats 3, 4, 5) and, before touching
 * anything in here, docs/TONE-AND-PARODY.md. Nothing in this space knows it
 * is absurd. It is a working room in a working criminal headquarters, and it
 * is allowed to get ugly.
 *
 * ------------------------------------------------------------------ LAYOUT
 *
 * The seam is the corridor's west end wall (MansionGrounds' SECRET_DOOR, x
 * -15.9..-15.6, z 64.85..66.85) at the lower level's own floor. West of it
 * everything is new ground, and it steps DOWN once: the landing behind the
 * wall stays at the cellar's floor, the stair drops 3.8 m, and everything
 * after that is on one slab four metres under the west wing's foundations
 * and then out under the lawn.
 *
 *      z
 *      ^         +-------------------+
 *   67 |         |   L A N D I N G   |<== SECRET_DOOR ==  cellar corridor
 *      |         +----+---------+----+
 *   62 |              | S T A I |  (down, 3.8 m over 6.6 m)
 *      |              |    R    |
 *   56 |   +----------+---------+--------------+
 *      |   | OBSERVATION | INTERROGATION (xXx) |
 *   49 |   +==== GLASS ==+---------------------+
 *      |   |  SEALED LAB |
 *   40 |   +-------------+
 *      +--------------------------------------------> -x
 *
 * The glass wall is the whole south side of the observation area, and it is
 * the mission's one hard layout requirement: Booski and the Prospect are
 * outside it for the entire sequence.
 *
 * --------------------------------------------------------- FLOOR RESOLUTION
 *
 * `resolveFloor(x, z, feetY, base)` is the seam into src/mansion/main.js's
 * `world.groundAt`. It takes whatever the house already resolved and merges
 * this module's own candidates using the SAME rule MansionInterior's
 * `floorAt` uses -- the highest candidate no more than one step above your
 * feet. That matters: the west wing's ground-floor podium is directly over
 * the interrogation area, so a naive "mine wins inside my rect" would drop
 * anybody walking the Great Includer hall through the floor, and a naive
 * "the house wins" would put the lab's ceiling under your feet.
 *
 * ------------------------------------------------------------ THE COLLIDERS
 *
 * `wallColliderTop()` is duplicated here from MansionInterior for THIS
 * module's own floor datums. It is not decoration: core/player.js skips a
 * collider only when your feet are STRICTLY above its top, so a wall ending
 * exactly on a floor is an invisible wall for everyone standing on that
 * floor. Thirteen of them made the mansion's upper storey impassable. The
 * datums down here are the cellar floor and the lab floor.
 */
import * as THREE from 'three';
import { box, cylinder, sphere, collider, mat, group } from '../../world/build.js';
import { tileTex, fabricTex } from '../../world/textures.js';
import { printed, tiled } from '../../bing/kit.js';
import { Figure } from '../../squatchfather/characters/Figure.js';
import { makeCase } from '../../silvercase/props/case.js';
import { BASEMENT_Y, SECRET_DOOR } from './MansionGrounds.js';

/* ================================================================== */
/* DATUMS AND FOOTPRINTS                                               */
/* ================================================================== */
/** The cellar corridor's floor -- the level the hidden door opens at. */
export const CELLAR_Y = BASEMENT_Y; // -2.8
/** The secret level, 3.8 m below it. */
export const LAB_Y = -6.6;
/** Head height down there. Everything below is concrete, so it is low. */
export const LAB_CEIL = LAB_Y + 3.25; // -3.35
/** The landing behind the wall keeps the cellar's own soffit. */
export const LANDING_CEIL = CELLAR_Y + 2.45; // -0.35

/** Behind the hidden wall: a concrete room with a stair out of one corner. */
export const LANDING = Object.freeze({
  x0: -20.2, x1: -15.9, z0: 62.2, z1: 67.6,
});
/** The flight. Descends toward -z; 6.6 m of run for 3.8 m of drop. */
export const STAIRWELL = Object.freeze({
  x0: -19.5, x1: -16.6, z0: 55.6, z1: 62.2,
});
/** Where the table and the man on the hook are. */
export const INTERROGATION = Object.freeze({
  x0: -27.4, x1: -16.3, z0: 49.3, z1: 55.6,
});
/** Player side of the glass, for the whole sequence. */
export const OBSERVATION = Object.freeze({
  x0: -37.6, x1: -27.4, z0: 49.3, z1: 56.8,
});
/** Behind the glass. Six people go in and none come out. */
export const SEALED_LAB = Object.freeze({
  x0: -37.6, x1: -27.4, z0: 39.8, z1: 49.0,
});
/** The reinforced glass wall itself: a band, not a plane. */
export const GLASS_WALL = Object.freeze({
  x0: -37.6, x1: -27.4, z0: 49.0, z1: 49.3, y0: LAB_Y, y1: LAB_CEIL,
});
/**
 * The one way through it. Slides west into a pocket in front of the pane.
 *
 * Its x is load-bearing for the room in front of it, not just for the wall:
 * the console run is built in TWO banks either side of this opening, with a
 * clear lane from the middle of the observation area right up to the door.
 * The first attempt ran one console the full width of the glass and walled
 * the door off completely -- the verifier caught it by walking at the door
 * and getting 0.76 m, which is what "walk through it, do not assert it" is
 * for. Anything that moves this has to move the banks with it.
 */
export const GLASS_DOOR = Object.freeze({
  x0: -33.9, x1: -31.9, y0: LAB_Y, y1: LAB_Y + 2.2, z0: GLASS_WALL.z0, z1: GLASS_WALL.z1,
});
/** The console banks, and the lanes between them. West to east along the glass. */
export const CONSOLE_BANKS = Object.freeze([
  Object.freeze({ x0: -37.3, x1: -35.2 }),
  Object.freeze({ x0: -30.4, x1: -27.7 }),
]);

/** The keypad code. Booski's, not mine. */
export const LAB_CODE = '6969';

/* ================================================================== */
/* AUDIO CUES                                                          */
/*                                                                      */
/* Authored here, generated centrally. Nothing in this file writes to   */
/* assets/sfx/manifest.json -- these are names plus the prompt that     */
/* describes each one, exactly the shape core/weapons/audio.js uses for */
/* its thirty `weapon.*` cues. Every one of them falls back to          */
/* core/audio.js's procedural synth until a recording lands, so the     */
/* scene plays today and gets better without a code change.             */
/* ================================================================== */
export const SILENT_SQUATCH_CUES = Object.freeze([
  ['silent.bust.switch', 'A small concealed toggle under a marble plinth: a hard mechanical click with a metallic aftertaste, then a relay closing somewhere behind the wall.'],
  ['silent.wall.mechanism', 'Two tonnes of decorated wall on hydraulic rails: a pressure release, a deep grinding shove backwards, a pause, then a long sideways rumble on steel rollers with the whole room resonating under it. Roughly six seconds.'],
  ['silent.wall.seat', 'The same wall coming home: the sideways rumble reversed, a heavy seat, and the dead thump of masonry meeting masonry. Everything behind it goes silent on the last frame.'],
  ['silent.stairwell.ambience', 'Loop. A dead concrete stairwell four metres underground: low air-handling rumble, distant water in a pipe, and the electrical hum of a run of old fluorescent ballasts. No music, no wind.'],
  ['silent.fluorescent.buzz', 'Loop. One failing tube directly overhead: a 100 Hz ballast buzz with an irregular flutter and a faint tick as the starter tries and fails.'],
  ['silent.drain.drip', 'Water finding a drainage channel: a single fat drop into a shallow trench, with a hard concrete slap and a short tail.'],
  ['silent.door.open', 'A heavy glass-and-steel door sliding open on a rail: a pneumatic release, a smooth rolling travel, and a soft seat at the end. Substantial, not automatic-supermarket.'],
  ['silent.door.seal', 'The same door closing and SEALING: the roll, then a rubber gasket compressing under real force and the air pressure changing on both sides of it.'],
  ['silent.door.bolts', 'Four steel bolts driving into their sockets one after another, fast: solid, industrial, final. Ends on a relay and a single low tone.'],
  ['silent.keypad.key', 'One key on a rubber-membrane industrial keypad. Dull press, faint electronic blip.'],
  ['silent.keypad.accept', 'Two rising electronic tones and a lock relay letting go. Cold, not friendly.'],
  ['silent.keypad.reject', 'A flat descending buzz, twice. The sound of a machine that does not care.'],
  ['silent.drawer.open', 'A steel transfer drawer in a wall: a lock releasing, a heavy tray sliding out on runners, and a stop.'],
  ['silent.drawer.through', 'The tray going the other way: motorised, slow, a seal closing behind it, and a muffled clunk arriving on the far side of the glass.'],
  ['silent.core.hum', 'Loop. The Squatchanium core at rest: a deep steady electrical hum with a slow beating overtone, a faint metallic rotation under it, and coolant moving somewhere in the frame.'],
  ['silent.core.build', 'Twenty seconds of the same hum building: pitch climbing, harmonics stacking, the rotation speeding up, and a low mechanical strain coming in underneath. Ends unresolved.'],
  ['silent.core.roar', 'The completion: the build breaking into a deep mechanical roar, huge and metallic, then dropping back to a locked, steady, enormous hum.'],
  ['silent.core.lock', 'Stabiliser rings locking: three heavy magnetic clunks in quick succession and a rising tone snapping off.'],
  ['silent.alarm', 'Loop. An internal laboratory alarm: a slow two-tone industrial klaxon, unhurried, with a rotating-beacon motor whirring under it. Not a fire alarm and not a siren -- a protocol running.'],
  ['silent.gas.release', 'Ceiling vents opening under pressure: a series of solenoid clacks, then a hard sustained release of gas into a sealed room.'],
  ['silent.gas.hiss', 'Loop. Gas continuing to fill a sealed concrete room: broadband hiss with a slow pulsing pressure wave and the vents rattling faintly in their frames.'],
  ['silent.glass.fist', 'A bare fist on 60 mm reinforced glass. Almost no ring: a heavy dull impact that goes straight into the frame, felt more than heard. Stays sharp even from the far side.'],
  ['silent.glass.chair', 'A metal chair swung two-handed into that same glass. A huge dead impact, the chair frame ringing and buckling, and the pane not moving at all. Ends with the chair hitting the floor.'],
  ['silent.choking', 'Loop. A distant bed of several people coughing and choking behind heavy glass: overlapping, ragged, thinning out over its length. Never comedic, never a single voice.'],
  ['silent.equipment.crash', 'Glassware and a light steel trolley going over in a laboratory: a scattering smash and a long rolling tail.'],
  ['silent.switch.cover', 'A red safety cover lifting on a stiff spring hinge: a plastic snap and a metallic detent holding it open.'],
  ['silent.switch.pull', 'A big industrial lever pulled through its full travel: mechanical resistance, a heavy detent at the bottom, and a contactor slamming closed.'],
  ['silent.monitor.turn', 'A wall of CRT monitors all changing state at once: a soft collective degauss thump and a wash of high-frequency line whine settling.'],
  ['silent.chain.creak', 'Loop. A load-bearing chain on a ceiling hook with a man on the end of it: slow irregular creaks, links shifting, and the hook turning a few degrees at a time.'],
  ['silent.case.hum', 'Loop. Close-up: the containment case. A low electrical hum with a faint vibration in the shell and an occasional high transient, like something inside changing state.'],
  /* THIS CUE EXISTS BECAUSE A LINE OF DIALOGUE WAS PLAYING HERE.
   *
   * Owner playtest, 2026-08-06: "one line plays with the wrong voice id". It
   * did, and it was this one -- `lab.case.open()` played `heist.shubes_case`,
   * which is not a sound effect at all: it is THE TAKE's Shubenator saying
   * "The blue case is organized. Your hands are not part of the organization."
   * So the Shubenator's voice came out of a briefcase in Lou's basement,
   * every time Booski opened it, in a scene he is not in.
   *
   * Nothing about the name gave that away at the call site -- `heist.*` is
   * both THE TAKE's effects prefix AND its dialogue prefix (ENGINE-TRAPS #4),
   * so borrowing a "case" cue from it was one letter away from borrowing a
   * performance. The manifest is the thing that knows, and the check that now
   * holds this shut reads it: see `no cue this scene plays is somebody
   * else's line` in tools/verify-mansion.mjs. */
  ['silent.case.latches', 'A heavy chrome flight case being opened on a steel table: two sprung catches letting go one after the other, a stiff hinge, and the lid coming up against its stops. Close, dry, expensive-sounding. No voice.'],
  ['silent.container.lift', 'A dense metal cylinder lifted out of foam by two hands: the foam releasing, the mass shifting, and a soft magnetic detach.'],
  ['silent.arc', 'A short gold electrical arc between two electrodes: a crack, a sizzle, and an ozone tail.'],
  ['silent.voice.complete', 'A cold synthesised facility voice, no warmth, faintly accented by its own compression: "PROJECT SILENT SQUATCH. CORE COMPLETE."'],
  ['silent.voice.protocol', 'The same voice: "SILENT NIGHT PROTOCOL ACTIVATED." Repeated once, flatly, over an alarm.'],
]);

/** Just the names, for `audio.loadManifest({ names })`. */
export function silentSquatchCueNames() {
  return SILENT_SQUATCH_CUES.map(([name]) => name);
}

/* ================================================================== */
/* MATERIALS                                                           */
/* ================================================================== */
const concreteBase = tileTex(5, '#22211f', '#5a564e');
const _tiles = new Map();
function concrete(w, h) {
  const key = `${Math.max(1, Math.round(w / 1.4))}x${Math.max(1, Math.round(h / 1.4))}`;
  let m = _tiles.get(key);
  if (!m) {
    const [rx, ry] = key.split('x').map(Number);
    m = mat({ map: tiled(concreteBase, rx, ry), roughness: 0.97, unique: true });
    _tiles.set(key, m);
  }
  return m;
}

const M_CONCRETE = mat({ color: 0x3a3833, roughness: 0.97 });
const M_CONCRETE_DK = mat({ color: 0x24231f, roughness: 0.98 });
const M_STEEL = mat({ color: 0x9aa0a6, roughness: 0.38, metalness: 0.8 });
const M_STEEL_DULL = mat({ color: 0x585d63, roughness: 0.6, metalness: 0.55 });
const M_RUST = mat({ color: 0x5e3a22, roughness: 0.95, metalness: 0.15 });
const M_PIPE = mat({ color: 0x4a4640, roughness: 0.7, metalness: 0.45 });
const M_PIPE_RED = mat({ color: 0x6e2018, roughness: 0.75, metalness: 0.3 });
const M_BLACK = mat({ color: 0x0d0e10, roughness: 0.8 });
const M_RUBBER = mat({ color: 0x141416, roughness: 0.95 });
const M_MARBLE_WHITE = mat({ color: 0xe4e0d4, roughness: 0.26 });
const M_WOOD_DK = mat({ color: 0x2e2118, roughness: 0.62 });
const M_BRASS = mat({ color: 0xa8853a, roughness: 0.35, metalness: 0.75 });
const M_BLOOD = mat({ color: 0x37070a, roughness: 0.28, metalness: 0.05 });

const M_TUBE = mat({
  color: 0x101014, emissive: 0xdfe8ff, emissiveIntensity: 1.5, roughness: 1, unique: true,
});
const M_PURPLE_LAMP = mat({
  color: 0x120a1e, emissive: 0x7a2ee8, emissiveIntensity: 2.4, roughness: 1, unique: true,
});
const M_GREEN_LAMP = mat({
  color: 0x081408, emissive: 0x3ce85e, emissiveIntensity: 2.6, roughness: 1, unique: true,
});
const M_RED_LAMP = mat({
  color: 0x1a0606, emissive: 0xe83c2c, emissiveIntensity: 2.6, roughness: 1, unique: true,
});
const M_GLASS = mat({
  color: 0x9fc4d8,
  roughness: 0.04,
  metalness: 0.08,
  transparent: true,
  opacity: 0.17,
  unique: true,
});
const M_GLASS_EDGE = mat({ color: 0x7f8a94, roughness: 0.3, metalness: 0.7 });
const M_COOLANT = mat({
  color: 0x2a1040, emissive: 0x8a3cf0, emissiveIntensity: 1.7, roughness: 0.4, unique: true,
});
const M_SCREEN_OFF = mat({ color: 0x08090c, roughness: 0.42 });
const M_DENIM = 0x2c4568;

/* ================================================================== */
/* CANVAS ART                                                          */
/*                                                                      */
/* Same idiom as every other scene in this repo -- a small function per */
/* surface that needs words or a symbol on it, drawn once and cached by */
/* bing/kit.js's `printed`. No new image assets.                        */
/* ================================================================== */

/** The trefoil. Drawn, not fetched, and deliberately worn. */
function radiationTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c8a41a';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#101010';
  g.beginPath();
  g.arc(128, 128, 22, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2 - Math.PI / 2 - 0.52;
    g.beginPath();
    g.moveTo(128, 128);
    g.arc(128, 128, 96, a0, a0 + 1.05);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 0.22;
  g.fillStyle = '#3a2e10';
  for (let i = 0; i < 60; i++) {
    g.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 18, Math.random() * 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _radTex = null;
const radTexture = () => (_radTex ??= radiationTexture());

/** A monitor face. `tint` drives the whole panel, which is the point: the
 * completion beat turns every one of these from red to purple in one call. */
function monitorTexture(kind, tint) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, 256, 192);
  g.strokeStyle = tint;
  g.fillStyle = tint;
  g.lineWidth = 2;
  g.font = '700 14px "Courier New", monospace';
  if (kind === 'trace') {
    g.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = 96 + Math.sin(x * 0.09) * 34 * Math.sin(x * 0.013) + (Math.random() - 0.5) * 5;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    g.fillText('CORE ROTATION', 8, 20);
  } else if (kind === 'bars') {
    for (let i = 0; i < 9; i++) {
      const h = 20 + Math.random() * 120;
      g.fillRect(14 + i * 26, 170 - h, 16, h);
    }
    g.fillText('OUTPUT', 8, 20);
  } else if (kind === 'text') {
    const rows = ['STABILIZER 41%', 'COOLANT  NOMINAL', 'SHIELDING PARTIAL', 'RAD  1.8 mSv/h', 'TRANSFER  ARMED'];
    rows.forEach((r, i) => g.fillText(r, 12, 42 + i * 26));
    g.fillText('SILENT SQUATCH', 12, 20);
  } else if (kind === 'grid') {
    for (let i = 0; i <= 8; i++) {
      g.globalAlpha = 0.35;
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 192); g.stroke();
      g.beginPath(); g.moveTo(0, i * 24); g.lineTo(256, i * 24); g.stroke();
    }
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(128, 96, 46, 0, Math.PI * 2);
    g.stroke();
    g.fillText('CONTAINMENT', 8, 18);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

/** LIFE SIGNS: n. Its own function because the mission reads it out loud. */
function lifeSignsTexture(count, tint) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, 256, 192);
  g.fillStyle = tint;
  g.font = '700 20px "Courier New", monospace';
  g.textAlign = 'center';
  g.fillText('LIFE SIGNS', 128, 58);
  g.font = '900 82px "Courier New", monospace';
  g.fillText(String(count), 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

/** A smeared handprint, alpha-cut, for the inside face of the glass. */
function handprintTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 160);
  g.fillStyle = 'rgba(96,14,18,0.82)';
  g.beginPath();
  g.ellipse(64, 104, 30, 34, 0, 0, Math.PI * 2);
  g.fill();
  const fingers = [[30, 58, 9, 30], [50, 44, 9, 36], [70, 44, 9, 36], [88, 56, 8, 30]];
  for (const [fx, fy, fw, fh] of fingers) {
    g.beginPath();
    g.ellipse(fx, fy, fw, fh, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.ellipse(24, 112, 10, 20, -0.7, 0, Math.PI * 2);
  g.fill();
  // The smear: he slid down it.
  g.globalAlpha = 0.4;
  for (let i = 0; i < 26; i++) {
    g.fillRect(34 + Math.random() * 62, 120 + i * 1.6, 2 + Math.random() * 5, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _handTex = null;
const handTexture = () => (_handTex ??= handprintTexture());

/** Old blood on concrete. Never fully removed, per the brief. */
function stainTexture(seed = 1) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  let s = seed * 9301;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(${40 + rnd() * 30 | 0},${8 + rnd() * 8 | 0},${10 + rnd() * 8 | 0},${0.22 + rnd() * 0.5})`;
    g.beginPath();
    g.ellipse(64 + (rnd() - 0.5) * 74, 64 + (rnd() - 0.5) * 74, 6 + rnd() * 34, 5 + rnd() * 30, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round dot, for the gas cloud's point sprites. */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.30)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* ================================================================== */
/* THE REINFORCED-GLASS AUDIO PATH                                     */
/*                                                                      */
/* Owner's explicit requirement, from the spec's "two technical         */
/* requirements" section: once the door locks, scientist volume drops,   */
/* high frequencies roll off, dialogue gains slight reverb, IMPACTS ON   */
/* THE GLASS STAY SHARP AND HEAVY, and gas/choking becomes distant and   */
/* enclosed.                                                             */
/*                                                                        */
/* Built as a real send with three parallel paths rather than as per-line  */
/* volume tweaks, because per-line tweaks are how you ship a scene where   */
/* half the lines were remembered and half were not:                       */
/*                                                                         */
/*   VOICE   in -> gain -> lowpass x2 -> [dry + convolver wet] -> busSfx   */
/*   IMPACT  in -> gain -> lowshelf (body) -> busSfx      (never filtered) */
/*   DISTANT in -> gain -> lowpass x2 (lower) -> heavier wet -> busSfx     */
/*                                                                          */
/* Routing works by swapping `audio.busSfx` for the duration of one call.   */
/* core/audio.js reads that property AT CALL TIME in both `play()` (`let    */
/* sink = this.busSfx`) and `_loopChain()`, so a swapped bus is the whole   */
/* graph change -- no fork of the engine, no second player, and positional  */
/* panning, sample selection and the procedural fallback all keep working.  */
/*                                                                           */
/* The sibling routes lines through `glassAudio.say(...)` and never has to   */
/* know whether the door is shut.                                            */
/* ================================================================== */
function makeGlassAudio(audio) {
  const OPEN = { volume: 1, cutoff: 20000, wet: 0 };
  const SEALED = { volume: 0.34, cutoff: 620, wet: 0.42 };

  let nodes = null;
  let engaged = false;

  /** A short, dark impulse: a small sealed concrete room, not a cathedral. */
  function impulse(ctx, seconds = 0.85, decay = 4.2) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
      }
    }
    return buf;
  }

  function ramp(param, value, secs) {
    if (!nodes) return;
    const t = nodes.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    if (secs <= 0) param.setValueAtTime(value, t);
    else param.linearRampToValueAtTime(value, t + secs);
  }

  function apply(secs = 0.45) {
    if (!nodes) return;
    const p = engaged ? SEALED : OPEN;
    ramp(nodes.vIn.gain, p.volume, secs);
    ramp(nodes.vLp1.frequency, p.cutoff, secs);
    ramp(nodes.vLp2.frequency, p.cutoff * 1.4, secs);
    ramp(nodes.vDry.gain, 1 - p.wet * 0.5, secs);
    ramp(nodes.vWet.gain, p.wet, secs);
    // Distant: a third of the cutoff, a third of the level, twice the wet.
    ramp(nodes.dIn.gain, engaged ? 0.26 : 0.7, secs);
    ramp(nodes.dLp1.frequency, engaged ? 340 : 5200, secs);
    ramp(nodes.dLp2.frequency, engaged ? 470 : 7000, secs);
    ramp(nodes.dDry.gain, engaged ? 0.55 : 1, secs);
    ramp(nodes.dWet.gain, engaged ? 0.72 : 0, secs);
    // Impacts: full level either way, with more body once it is sealed.
    ramp(nodes.iIn.gain, 1, secs);
    ramp(nodes.iBody.gain, engaged ? 6.5 : 0, secs);
  }

  function build() {
    if (nodes || !audio?.ready || !audio.ctx || !audio.busSfx) return nodes;
    const ctx = audio.ctx;
    const out = audio.busSfx;

    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx);
    conv.connect(out);

    const vIn = ctx.createGain();
    const vLp1 = ctx.createBiquadFilter();
    vLp1.type = 'lowpass';
    vLp1.Q.value = 0.5;
    const vLp2 = ctx.createBiquadFilter();
    vLp2.type = 'lowpass';
    vLp2.Q.value = 0.5;
    const vDry = ctx.createGain();
    const vWet = ctx.createGain();
    vIn.connect(vLp1);
    vLp1.connect(vLp2);
    vLp2.connect(vDry);
    vLp2.connect(vWet);
    vDry.connect(out);
    vWet.connect(conv);

    /* The impact path is deliberately NOT through the lowpass: a fist and a
     * chair on sixty millimetres of glass transmit through the frame, not
     * through the air, and the owner asked for them to stay sharp. A low
     * shelf is the only shaping, so they gain weight when the room seals
     * rather than losing definition. */
    const iIn = ctx.createGain();
    const iBody = ctx.createBiquadFilter();
    iBody.type = 'lowshelf';
    iBody.frequency.value = 190;
    iBody.gain.value = 0;
    iIn.connect(iBody);
    iBody.connect(out);

    const dIn = ctx.createGain();
    const dLp1 = ctx.createBiquadFilter();
    dLp1.type = 'lowpass';
    dLp1.Q.value = 0.5;
    const dLp2 = ctx.createBiquadFilter();
    dLp2.type = 'lowpass';
    dLp2.Q.value = 0.5;
    const dDry = ctx.createGain();
    const dWet = ctx.createGain();
    dIn.connect(dLp1);
    dLp1.connect(dLp2);
    dLp2.connect(dDry);
    dLp2.connect(dWet);
    dDry.connect(out);
    dWet.connect(conv);

    nodes = {
      ctx, conv, vIn, vLp1, vLp2, vDry, vWet, iIn, iBody, dIn, dLp1, dLp2, dDry, dWet,
    };
    apply(0);
    return nodes;
  }

  /** Run `fn` with the engine's sfx bus temporarily pointed at `input`. */
  function through(input, fn) {
    if (!audio?.ready) return null;
    build();
    if (!nodes || !input) return fn();
    const saved = audio.busSfx;
    audio.busSfx = input;
    try {
      return fn();
    } finally {
      audio.busSfx = saved;
    }
  }

  return {
    /** True once the lab is sealed; every path below changes shape with it. */
    get engaged() { return engaged; },
    /** The lock calls this. `secs` is the crossfade, not a delay. */
    setEngaged(on, secs = 0.45) {
      engaged = !!on;
      build();
      apply(secs);
      return engaged;
    },
    /** Speech from behind the glass. The sibling's `.say(cue)` lands here. */
    say(name, opts = {}) {
      build();
      return through(nodes?.vIn, () => audio.play(name, opts));
    },
    /** Not speech, not an impact: alarms, machinery, the computer voice. */
    play(name, opts = {}) {
      build();
      return through(nodes?.vIn, () => audio.play(name, opts));
    },
    /** Fists, chairs, bodies. Sharp and heavy, sealed or not. */
    impact(name, opts = {}) {
      build();
      return through(nodes?.iIn, () => audio.play(name, opts));
    },
    /** Gas, choking, equipment going over. Distant and enclosed. */
    distant(name, opts = {}) {
      build();
      return through(nodes?.dIn, () => audio.play(name, opts));
    },
    /** A looping bed on any of the three paths. */
    loop(key, opts = {}) {
      build();
      const path = opts.path === 'impact' ? nodes?.iIn
        : opts.path === 'distant' ? nodes?.dIn : nodes?.vIn;
      return through(path, () => audio.startLoop(key, { ...opts, ambience: false }));
    },
    stopLoop(key, fade = 0.6) { audio?.stopLoop?.(key, fade); },
    /**
     * The live graph, read off the real AudioParams, PLUS the targets.
     *
     * Both, because a `linearRampToValueAtTime` is wall-clock and a headless
     * verifier steps the scene's own clock -- read the instant after the
     * door locks and every live value is still the one it is ramping away
     * from. `target` is what the send is now committed to; the live numbers
     * prove the ramp is actually running on real nodes and not on a
     * bookkeeping object pretending to be one.
     */
    state() {
      if (!nodes) return { built: false, engaged, target: engaged ? SEALED : OPEN };
      const p = engaged ? SEALED : OPEN;
      return {
        built: true,
        engaged,
        target: {
          voiceGain: p.volume,
          voiceCutoff: p.cutoff,
          voiceWet: p.wet,
          impactGain: 1,
          impactBodyDb: engaged ? 6.5 : 0,
          distantGain: engaged ? 0.26 : 0.7,
          distantCutoff: engaged ? 340 : 5200,
          distantWet: engaged ? 0.72 : 0,
        },
        voiceGain: +nodes.vIn.gain.value.toFixed(3),
        voiceCutoff: Math.round(nodes.vLp1.frequency.value),
        voiceWet: +nodes.vWet.gain.value.toFixed(3),
        impactGain: +nodes.iIn.gain.value.toFixed(3),
        impactBodyDb: +nodes.iBody.gain.value.toFixed(2),
        distantGain: +nodes.dIn.gain.value.toFixed(3),
        distantCutoff: Math.round(nodes.dLp1.frequency.value),
        distantWet: +nodes.dWet.gain.value.toFixed(3),
      };
    },
    /** Force the graph up early. The door lock does this before it seals. */
    prime() { return !!build(); },
  };
}

/* ================================================================== */
/* THE CROSSHAIR CALLOUT                                               */
/*                                                                      */
/* "Aiming at him makes the crosshair read xXx." That is the crosshair, */
/* not the interact prompt at the bottom of the screen -- the prompt is  */
/* a different thing in a different place saying a different sentence.   */
/*                                                                       */
/* So: a small readout pinned directly under the aiming mark, fed by its */
/* own centre-screen ray against a short list of named figures. It       */
/* builds its own DOM the way core/pause-menu.js does, so mansion.html   */
/* needs no new markup and the sibling can add names to it without       */
/* touching the page.                                                     */
/* ================================================================== */
function makeCrosshairNames(camera) {
  const targets = []; // { object, text, enabled }
  const raycaster = new THREE.Raycaster();
  raycaster.far = 26;
  const CENTER = new THREE.Vector2(0, 0);
  let occluders = [];
  let el = null;
  let text = null;

  function dom() {
    if (el || typeof document === 'undefined') return el;
    el = document.createElement('div');
    el.id = 'labTargetName';
    el.style.cssText = [
      'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,18px)',
      'z-index:4', 'pointer-events:none', 'font:900 15px "Trebuchet MS",sans-serif',
      'letter-spacing:2px', 'color:#f2eee1', 'text-shadow:0 0 6px rgba(0,0,0,.95)',
      'display:none',
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  function set(next) {
    if (next === text) return;
    text = next;
    const node = dom();
    if (!node) return;
    node.textContent = next ?? '';
    node.style.display = next ? 'block' : 'none';
  }

  function ownerOf(object) {
    let o = object;
    while (o) {
      if (o.userData?.crosshairName) return o;
      o = o.parent;
    }
    return null;
  }

  return {
    /** Name a figure. `text` is what the crosshair reads when it is on him. */
    register(object, label, enabled = () => true) {
      if (!object) return null;
      object.userData.crosshairName = { label, enabled };
      targets.push(object);
      return object;
    },
    setOccluders(list) { occluders = [...list]; },
    /** What the crosshair reads right now, or null. */
    get text() { return text; },
    clear() { set(null); },
    update() {
      if (!targets.length) return;
      raycaster.setFromCamera(CENTER, camera);
      const hits = raycaster.intersectObjects([...targets, ...occluders], true);
      for (const hit of hits) {
        const owner = ownerOf(hit.object);
        if (!owner) { set(null); return; } // something solid in the way
        const { label, enabled } = owner.userData.crosshairName;
        if (enabled && !enabled()) continue;
        set(typeof label === 'function' ? label() : label);
        return;
      }
      set(null);
    },
  };
}

/* ================================================================== */
/* buildSilentSquatch()                                                */
/* ================================================================== */
/**
 * @param {object} o
 * @param {AudioEngine} o.audio        the scene's engine (may not be `ready` yet)
 * @param {InteractionSystem} o.interaction
 * @param {THREE.Camera} o.camera
 * @param {() => boolean} o.enabled    is the scene live (main.js's `running`)
 * @param {(l: THREE.Light) => void} o.registerLight  join main.js's nearest-N rig
 */
export function buildSilentSquatch({
  audio = null,
  interaction = null,
  camera = null,
  enabled = () => true,
  registerLight = () => {},
} = {}) {
  const root = new THREE.Group();
  root.name = 'SilentSquatch';
  const colliders = [];
  const occluders = [];
  const lights = [];
  const decorArt = [];
  /* The reinforced-glass send. Declared up here because most of the systems
   * below route through it and none of them should have to check first. */
  const glassAudio = makeGlassAudio(audio);
  const crosshairNames = camera ? makeCrosshairNames(camera) : null;

  /* ---- collider discipline -------------------------------------- */
  /* Duplicated from MansionInterior, for THIS module's datums. See the
   * header: a wall collider topping out exactly on a floor is an invisible
   * wall for everyone standing on that floor, and it is invisible in the
   * literal sense -- there is nothing to see, because the wall is under the
   * boards. Thirteen of them made the mansion's upper storey impassable. */
  const FLOOR_DATUMS = [LAB_Y, CELLAR_Y];
  const FLOOR_CLEARANCE = 0.3;
  function wallColliderTop(y1) {
    for (const d of FLOOR_DATUMS) if (Math.abs(y1 - d) < 0.05) return y1 - FLOOR_CLEARANCE;
    return y1;
  }
  function solid(x0, x1, y0, y1, z0, z1) {
    const c = collider(
      [Math.min(x0, x1), y0, Math.min(z0, z1)],
      [Math.max(x0, x1), wallColliderTop(y1), Math.max(z0, z1)],
    );
    colliders.push(c);
    return c;
  }
  /** Furniture: solid, but never near a floor datum, so no clearance rule. */
  function prop(x0, x1, y0, y1, z0, z1) {
    const c = collider(
      [Math.min(x0, x1), y0, Math.min(z0, z1)],
      [Math.max(x0, x1), y1, Math.max(z0, z1)],
    );
    colliders.push(c);
    return c;
  }
  function wall(x0, x1, y0, y1, z0, z1, material = M_CONCRETE, name = 'ss-wall') {
    const m = box({
      size: [x1 - x0, y1 - y0, z1 - z0],
      pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      mat: material,
      name,
    });
    root.add(m);
    occluders.push(m);
    solid(x0, x1, y0, y1, z0, z1);
    return m;
  }
  /** Floor or ceiling slab. Never a collider -- you stand on it. */
  function slab(x0, x1, y, z0, z1, material, name = 'ss-slab', thickness = 0.3) {
    const m = box({
      size: [x1 - x0, thickness, z1 - z0],
      pos: [(x0 + x1) / 2, y - thickness / 2, (z0 + z1) / 2],
      mat: material,
      name,
      cast: false,
    });
    root.add(m);
    occluders.push(m);
    return m;
  }
  function light(colour, intensity, distance, x, y, z) {
    const l = new THREE.PointLight(colour, intensity, distance, 2);
    l.position.set(x, y, z);
    root.add(l);
    lights.push(l);
    registerLight(l);
    return l;
  }
  /**
   * A caged industrial fluorescent, mesh + light.
   *
   * `ceil` is the underside of the slab it hangs from, and passing it is not
   * optional dressing: the fixture body tops out 0.105 m above `y`, so every
   * one of these used to end a fifth of a metre short of the soffit with
   * nothing between the two. Given the ceiling, it grows its own drop rods and
   * a pair of fixing plates, and the thing is actually held up.
   */
  function fluoro(x, y, z, {
    rotY = 0, len = 1.3, colour = 0xdfe8ff, intensity = 5.4, range = 11, ceil = null,
  } = {}) {
    const g = group('ss-fluoro');
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    g.add(box({ size: [len, 0.06, 0.16], pos: [0, 0, 0], mat: M_TUBE, cast: false }));
    g.add(box({ size: [len + 0.14, 0.07, 0.26], pos: [0, 0.07, 0], mat: M_STEEL_DULL, cast: false }));
    for (let i = 0; i <= 6; i++) {
      g.add(box({
        size: [0.015, 0.16, 0.015], pos: [-len / 2 + (len * i) / 6, -0.06, 0], mat: M_STEEL_DULL, cast: false,
      }));
    }
    for (const sz of [-0.12, 0.12]) {
      g.add(box({ size: [len + 0.14, 0.015, 0.015], pos: [0, -0.13, sz], mat: M_STEEL_DULL, cast: false }));
    }
    const drop = ceil === null ? 0 : ceil - (y + 0.105);
    if (drop > 0.02) {
      for (const sx of [-len / 2 + 0.16, len / 2 - 0.16]) {
        g.add(box({
          size: [0.028, drop, 0.028], pos: [sx, 0.105 + drop / 2, 0], mat: M_STEEL_DULL, cast: false,
        }));
        g.add(box({
          size: [0.12, 0.02, 0.12], pos: [sx, 0.105 + drop - 0.01, 0], mat: M_STEEL_DULL, cast: false,
        }));
      }
    }
    root.add(g);
    const l = light(colour, intensity, range, x, y - 0.15, z);
    return { group: g, light: l, tube: g.children[0] };
  }
  /** A run of exposed pipe with brackets. `ceil` makes the brackets reach it. */
  function pipeRun(axis, from, to, at, y, {
    r = 0.07, material = M_PIPE, brackets = true, ceil = null,
  } = {}) {
    const len = Math.abs(to - from);
    const mid = (from + to) / 2;
    const m = cylinder({
      r,
      h: len,
      pos: axis === 'x' ? [mid, y, at] : [at, y, mid],
      rotZ: axis === 'x' ? Math.PI / 2 : 0,
      rotX: axis === 'z' ? Math.PI / 2 : 0,
      mat: material,
      cast: false,
    });
    root.add(m);
    if (brackets) {
      /* A bracket that stops in mid-air is a pipe hanging on nothing. Given
       * the soffit, each one spans from the top of the pipe to it. */
      const bTop = ceil === null ? y + 0.19 : ceil;
      const bH = Math.max(0.08, bTop - (y + r));
      const bY = bTop - bH / 2;
      const n = Math.max(2, Math.round(len / 2.2));
      for (let i = 0; i <= n; i++) {
        const p = from + ((to - from) * i) / n;
        root.add(box({
          size: axis === 'x' ? [0.05, bH, r * 2.6] : [r * 2.6, bH, 0.05],
          pos: axis === 'x' ? [p, bY, at] : [at, bY, p],
          mat: M_STEEL_DULL,
          cast: false,
        }));
      }
    }
    return m;
  }
  /** A security camera on a bracket, aimed at a point. `mount` is the soffit. */
  function camera_(x, y, z, aim, { mount = null } = {}) {
    const g = group('ss-camera');
    g.position.set(x, y, z);
    const stem = Math.max(0.22, mount === null ? 0.22 : mount - y);
    g.add(box({ size: [0.08, stem, 0.08], pos: [0, stem / 2, 0], mat: M_STEEL_DULL }));
    if (stem > 0.24) {
      g.add(box({ size: [0.2, 0.02, 0.2], pos: [0, stem - 0.01, 0], mat: M_STEEL_DULL, cast: false }));
    }
    const body = group('ss-camera-body');
    g.add(body);
    body.add(box({ size: [0.13, 0.13, 0.34], pos: [0, 0, 0], mat: M_BLACK }));
    body.add(cylinder({ r: 0.055, h: 0.09, pos: [0, 0, 0.2], rotX: Math.PI / 2, mat: M_STEEL }));
    body.add(box({ size: [0.03, 0.03, 0.03], pos: [0.05, 0.08, -0.1], mat: M_RED_LAMP, cast: false }));
    body.lookAt(new THREE.Vector3(aim[0] - x, aim[1] - y, aim[2] - z));
    root.add(g);
    return g;
  }
  /**
   * A stain on the floor. Deliberately not cleaned up.
   *
   * `y` is the SURFACE it lies on, not the datum -- the lower level's floor
   * finish tops out 12 mm above LAB_Y, and every stain down here used to be
   * authored at the datum, which buried the lot of them under the slab. The
   * per-seed lift on top of that is z-fight insurance: these overlap each
   * other by design, and two decals on one plane flicker.
   */
  function stain(x, z, y, size, seed, opacity = 1) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size * (0.7 + (seed % 5) * 0.09)),
      mat({
        map: stainTexture(seed), transparent: true, opacity, roughness: 0.6, unique: true,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = seed * 1.7;
    m.position.set(x, y + 0.006 + (seed % 7) * 0.0016, z);
    m.name = 'ss-stain';
    root.add(m);
    return m;
  }
  /**
   * A drainage channel: a trench with a grating over it.
   *
   * `y` is the floor SURFACE. Built proud of it rather than sunk into it,
   * because there is no hole in the slab to sink it into: the first version
   * put the trench's top face exactly on the floor's top face (two coplanar
   * surfaces, guaranteed flicker) with the grating bars 7 mm UNDER the
   * finished floor, so the whole channel rendered as two side rails and
   * nothing between them.
   */
  function drainChannel(x0, x1, z, y, { width = 0.26 } = {}) {
    root.add(box({
      size: [x1 - x0, 0.03, width], pos: [(x0 + x1) / 2, y + 0.015, z], mat: M_BLACK, cast: false,
    }));
    const bars = Math.max(4, Math.round((x1 - x0) / 0.42));
    for (let i = 0; i < bars; i++) {
      root.add(box({
        size: [0.055, 0.018, width],
        pos: [x0 + 0.08 + ((x1 - x0 - 0.16) * i) / (bars - 1), y + 0.031, z],
        mat: M_RUST,
        cast: false,
      }));
    }
    for (const sz of [z - width / 2 - 0.03, z + width / 2 + 0.03]) {
      root.add(box({
        size: [x1 - x0, 0.04, 0.06], pos: [(x0 + x1) / 2, y + 0.02, sz], mat: M_STEEL_DULL, cast: false,
      }));
    }
  }
  /**
   * The finished floor of the lower level -- `ss-lower-floor`'s top face, 12
   * mm over LAB_Y. Anything that LIES ON that floor (a stain, a pool, a
   * grating) has to be authored against this, not against the datum.
   */
  const LAB_FLOOR = LAB_Y + 0.012;

  /* ================================================================== */
  /* BEAT 3a -- THE INNOCENT HALF                                        */
  /*                                                                      */
  /* "The existing basement becomes the innocent half: a wine cellar and  */
  /* entertainment area at the front, so it reads as a normal luxury      */
  /* basement."                                                            */
  /*                                                                        */
  /* Placed in the armory room's free south-east quadrant, which is the      */
  /* first thing you see coming off the cellar stair. It claims NO wall the  */
  /* armory uses: the gun racks are on the south wall west of x=-1.2 and on  */
  /* the west wall, the ammunition stacks are at x=-7.8, the cage is at      */
  /* z=60.5 and stops at x=2.4, and the tool bench and boiler are at the     */
  /* north end. The wine racks back onto the cellar stair's own masonry      */
  /* stringer, so there is no leftover sliver of floor beside them.          */
  /*                                                                          */
  /* Circulation checked against the verifier's existing routes: the walk     */
  /* from the stair foot (7.2, 57.6) north to the corridor door (6.2, 64.3)   */
  /* never comes west of x=5.4, and the aisle between the two new groups is    */
  /* 1.8 m -- three times the 0.6 m the hedge maze taught us is the floor.     */
  /* ================================================================== */
  function buildInnocentBasement() {
    const BY = CELLAR_Y;
    const M_WINE = mat({ color: 0x1c3320, roughness: 0.32, metalness: 0.1 });
    const M_WINE_RED = mat({ color: 0x2a1016, roughness: 0.3, metalness: 0.08 });
    const M_LEATHER = mat({ map: fabricTex('#2a1a18'), roughness: 0.82, unique: true });
    const M_FELT = mat({ color: 0x14432c, roughness: 0.95 });

    /* ---- The wine cellar: two racked bays against the stair's stringer. */
    /* z 50.9..54.6, not 51.3..55.4. The first placement left 0.48 m between
     * the north wine rack and the sectional next door -- under the 0.6 m
     * floor the hedge maze set for a channel, and the walk between the two
     * areas simply wedged. There is 1.28 m of lane between them now. */
    const wineX0 = 1.3;
    const wineX1 = 5.35;
    const wineZ0 = 50.9;
    const wineZ1 = 54.6;

    // Brick-and-timber lining, so it stops reading as raw armory concrete.
    root.add(box({
      size: [wineX1 - wineX0, 2.35, 0.08],
      pos: [(wineX0 + wineX1) / 2, BY + 1.18, wineZ0 + 0.04],
      mat: M_WOOD_DK,
      name: 'wine-cellar-lining',
    }));
    /* Two double-height racks, back to back on the stair side.
     *
     * Built as a carcass -- back, plinth, head, cheeks and four shelves --
     * rather than as the solid block it used to be. The block was 0.62 m deep
     * and the bottles were laid at x=0.16 inside it, so twenty-four bottles
     * sat entirely INSIDE the timber with 10 mm of one end showing: a wine
     * cellar with no visible wine. Same footprint, same collider, same
     * bottles; they are just in a rack now instead of in a log. */
    const racks = [];
    for (const [rz, rot] of [[wineZ0 + 0.55, 0], [wineZ1 - 0.55, Math.PI]]) {
      const g = group('wine-rack');
      g.position.set(wineX1 - 0.42, BY, rz);
      g.rotation.y = rot;
      g.add(box({ size: [0.1, 2.1, 2.0], pos: [-0.26, 1.05, 0], mat: M_WOOD_DK }));
      g.add(box({ size: [0.62, 0.08, 2.0], pos: [0, 0.04, 0], mat: M_WOOD_DK }));
      g.add(box({ size: [0.62, 0.08, 2.0], pos: [0, 2.06, 0], mat: M_WOOD_DK }));
      for (const cz of [-0.96, 0.96]) {
        g.add(box({ size: [0.62, 2.1, 0.08], pos: [0, 1.05, cz], mat: M_WOOD_DK }));
      }
      for (let row = 0; row < 4; row++) {
        g.add(box({
          size: [0.56, 0.03, 1.9], pos: [0.02, 0.42 + row * 0.42 - 0.07, 0], mat: M_WOOD_DK, cast: false,
        }));
        for (let col = 0; col < 6; col++) {
          g.add(cylinder({
            r: 0.055,
            h: 0.32,
            pos: [0.02, 0.42 + row * 0.42, -0.8 + col * 0.32],
            rotZ: Math.PI / 2,
            mat: (row + col) % 3 === 0 ? M_WINE_RED : M_WINE,
            cast: false,
          }));
        }
      }
      root.add(g);
      racks.push(g);
      prop(wineX1 - 0.78, wineX1 - 0.06, BY, BY + 2.1, rz - 1.02, rz + 1.02);
    }
    // A tasting table with glasses and a decanter, and two stools.
    const tx = wineX0 + 1.1;
    const tz = (wineZ0 + wineZ1) / 2;
    root.add(cylinder({ r: 0.62, h: 0.07, pos: [tx, BY + 0.78, tz], mat: M_WOOD_DK }));
    root.add(cylinder({ r: 0.09, h: 0.78, pos: [tx, BY + 0.39, tz], mat: M_STEEL_DULL }));
    root.add(cylinder({ r: 0.34, h: 0.05, pos: [tx, BY + 0.03, tz], mat: M_STEEL_DULL }));
    prop(tx - 0.62, tx + 0.62, BY, BY + 0.82, tz - 0.62, tz + 0.62);
    for (const [gx, gz] of [[tx - 0.22, tz - 0.14], [tx + 0.18, tz + 0.2], [tx + 0.02, tz - 0.28]]) {
      root.add(cylinder({
        rTop: 0.045, rBottom: 0.02, h: 0.11, pos: [gx, BY + 0.87, gz], mat: M_GLASS, cast: false,
      }));
      root.add(cylinder({ r: 0.035, h: 0.02, pos: [gx, BY + 0.8, gz], mat: M_GLASS, cast: false }));
    }
    root.add(cylinder({
      rTop: 0.05, rBottom: 0.13, h: 0.26, pos: [tx + 0.34, BY + 0.94, tz - 0.02], mat: M_WINE_RED, cast: false,
    }));
    for (const sz of [tz - 0.95, tz + 0.95]) {
      root.add(cylinder({ r: 0.19, h: 0.06, pos: [tx, BY + 0.66, sz], mat: M_LEATHER }));
      root.add(cylinder({ r: 0.05, h: 0.66, pos: [tx, BY + 0.33, sz], mat: M_STEEL_DULL }));
      prop(tx - 0.2, tx + 0.2, BY, BY + 0.7, sz - 0.2, sz + 0.2);
    }
    // A barrel and a crate of somebody's allocation.
    root.add(cylinder({
      r: 0.34, h: 0.86, pos: [wineX0 + 0.42, BY + 0.43, wineZ1 - 0.5], rotX: Math.PI / 2, mat: M_WOOD_DK,
    }));
    prop(wineX0 + 0.08, wineX0 + 0.76, BY, BY + 0.7, wineZ1 - 0.94, wineZ1 - 0.06);
    root.add(box({
      size: [0.6, 0.44, 0.44], pos: [wineX0 + 0.42, BY + 0.22, wineZ0 + 0.5], mat: mat({ color: 0x4a3a26, roughness: 0.86 }),
    }));
    prop(wineX0 + 0.12, wineX0 + 0.72, BY, BY + 0.44, wineZ0 + 0.28, wineZ0 + 0.72);
    // The sign. A luxury basement labels its wine cellar.
    const cellarSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.26),
      mat({
        map: printed('silent.sign.cellar', ['THE CELLAR'], {
          w: 448, h: 106, bg: '#1a1210', fg: '#c8a24a', font: '900 46px "Trebuchet MS", sans-serif',
        }),
        roughness: 0.75,
        emissive: 0x3a2c12,
        unique: true,
      }),
    );
    cellarSign.position.set((wineX0 + wineX1) / 2, BY + 2.16, wineZ0 + 0.1);
    root.add(cellarSign);
    light(0xffd8a0, 3.4, 8, (wineX0 + wineX1) / 2, BY + 2.2, (wineZ0 + wineZ1) / 2);

    /* ---- The entertainment area.
     *
     * Laid out round a circulation lane at z ~58.75, and that number is
     * load-bearing. The first attempt put the television unit and the
     * armory's caged store 0.58 m apart, which is UNDER the 0.6 m the hedge
     * maze established as this game's floor for a channel, and the walk
     * simply stopped between them. Nothing in this group may close it. */
    const entX0 = 0.2;
    const entX1 = 4.6;
    const entZ0 = 56.4;
    const entZ1 = 59.6;
    const entRug = new THREE.Mesh(
      new THREE.PlaneGeometry(entX1 - entX0 - 0.3, 2.0),
      mat({ map: tiled(fabricTex('#3a2018'), 3, 2), roughness: 0.98, unique: true }),
    );
    entRug.rotation.x = -Math.PI / 2;
    entRug.position.set((entX0 + entX1) / 2, BY + 0.014, entZ0 + 1.3);
    root.add(entRug);

    // The sectional, along the south edge, facing north at the set.
    const entMid = (entX0 + entX1) / 2;
    const couchZ = entZ0 + 0.45;
    root.add(box({ size: [3.4, 0.42, 0.85], pos: [entMid, BY + 0.28, couchZ], mat: M_LEATHER }));
    root.add(box({ size: [3.4, 0.62, 0.22], pos: [entMid, BY + 0.66, couchZ - 0.31], mat: M_LEATHER }));
    for (const sx of [entMid - 1.6, entMid + 1.6]) {
      root.add(box({ size: [0.24, 0.3, 0.85], pos: [sx, BY + 0.6, couchZ], mat: M_LEATHER }));
    }
    prop(entMid - 1.75, entMid + 1.75, BY, BY + 0.72, entZ0 - 0.05, entZ0 + 0.95);

    // Coffee table, with the remnants of somebody's evening on it.
    const cofZ = entZ0 + 1.5;
    root.add(box({ size: [1.3, 0.06, 0.55], pos: [entMid, BY + 0.42, cofZ], mat: M_WOOD_DK }));
    for (const [lx, lz] of [[-0.55, -0.2], [0.55, -0.2], [-0.55, 0.2], [0.55, 0.2]]) {
      root.add(box({
        size: [0.06, 0.42, 0.06], pos: [entMid + lx, BY + 0.21, cofZ + lz], mat: M_STEEL_DULL,
      }));
    }
    prop(entMid - 0.68, entMid + 0.68, BY, BY + 0.48, cofZ - 0.3, cofZ + 0.3);
    for (let i = 0; i < 4; i++) {
      root.add(cylinder({
        r: 0.033,
        h: 0.12,
        pos: [entMid - 0.4 + i * 0.22, BY + 0.51, cofZ + (i % 2 ? 0.1 : -0.1)],
        mat: mat({ color: 0x1c3a24, roughness: 0.35, metalness: 0.2 }),
        cast: false,
      }));
    }
    root.add(box({
      size: [0.34, 0.03, 0.24], pos: [entMid + 0.44, BY + 0.46, cofZ], mat: M_BLACK, cast: false,
    }));

    /* The set, on a low unit hard against the north edge. Its collider stops
     * at z = 59.62 and the armory's caged store starts at 60.42, which is
     * the 0.8 m that keeps the north lane walkable. */
    const tvZ = entZ1 - 0.2;
    let entTvScreen = null;
    root.add(box({ size: [2.2, 0.5, 0.4], pos: [entMid, BY + 0.25, tvZ], mat: M_WOOD_DK }));
    prop(entMid - 1.1, entMid + 1.1, BY, BY + 0.5, tvZ - 0.22, tvZ + 0.22);
    /* Foot and neck, because the panel's bottom edge lands 60 mm over the
     * unit's top and a television standing on air is a television standing on
     * air however dark the room is. */
    root.add(box({
      size: [0.52, 0.03, 0.3], pos: [entMid, BY + 0.515, tvZ], mat: M_STEEL_DULL, cast: false, name: 'ent-tv-foot',
    }));
    root.add(box({
      size: [0.14, 0.06, 0.1], pos: [entMid, BY + 0.55, tvZ], mat: M_STEEL_DULL, cast: false, name: 'ent-tv-neck',
    }));
    root.add(box({
      size: [1.75, 1.0, 0.07], pos: [entMid, BY + 1.06, tvZ], mat: M_BLACK, name: 'ent-tv',
    }));
    /* A REAL SCREEN, not a dark rectangle.
     *
     * Owner playtest: the cellar's flatscreen should be a working television,
     * like the apartment's. It was a `M_SCREEN_OFF` box — a set that is
     * permanently off in the one room down here built for watching it, while
     * a second, OLD-SCHOOL set stood four metres away in the armory being the
     * thing the guard looked at.
     *
     * PlaneGeometry rather than a box, and published on the lab handle, so
     * `main.js` can hand it to `core/tv.js`'s `mountTv` exactly the way it
     * does the billiard bay's and the kitchen's — one canvas texture swapped
     * onto the mesh's material. Nothing in this file imports `core/tv.js`:
     * that module builds canvas textures at module scope and this one has to
     * stay headless (see `cast.js`'s note about the 677-test SIGKILL).
     *
     * Unmounted it is still a switched-off television, which is a thing a
     * television is. */
    entTvScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.62, 0.9),
      mat({ color: 0x05070a, roughness: 0.22, unique: true }),
    );
    entTvScreen.name = 'ent-tv-screen';
    entTvScreen.position.set(entMid, BY + 1.06, tvZ - 0.055);
    entTvScreen.rotation.y = Math.PI;
    root.add(entTvScreen);

    /* A bar cart, tucked into the north-west corner beside the set so that
     * it never reaches into the lane either. */
    const cartX = entX0 + 0.35;
    const cartZ = entZ1 - 0.35;
    root.add(box({ size: [0.6, 0.05, 0.44], pos: [cartX, BY + 0.78, cartZ], mat: M_STEEL }));
    root.add(box({ size: [0.6, 0.05, 0.44], pos: [cartX, BY + 0.3, cartZ], mat: M_STEEL, cast: false }));
    for (const [lx, lz] of [[-0.26, -0.18], [0.26, -0.18], [-0.26, 0.18], [0.26, 0.18]]) {
      root.add(cylinder({ r: 0.02, h: 0.78, pos: [cartX + lx, BY + 0.39, cartZ + lz], mat: M_STEEL }));
    }
    prop(cartX - 0.32, cartX + 0.32, BY, BY + 0.8, cartZ - 0.25, cartZ + 0.25);
    for (let i = 0; i < 4; i++) {
      root.add(cylinder({
        rTop: 0.035,
        rBottom: 0.045,
        h: 0.26,
        pos: [cartX - 0.18 + i * 0.12, BY + 0.94, cartZ],
        mat: i % 2 ? M_WINE_RED : mat({ color: 0x6a4a1c, roughness: 0.3, metalness: 0.15 }),
        cast: false,
      }));
    }

    light(0xffd0a0, 3.0, 7.5, (entX0 + entX1) / 2, BY + 2.15, (entZ0 + entZ1) / 2);

    return {
      wine: { x0: wineX0, x1: wineX1, z0: wineZ0, z1: wineZ1, racks, sign: cellarSign },
      entertainment: { x0: entX0, x1: entX1, z0: entZ0, z1: entZ1 },
      /** The set in the entertainment area. `main.js` paints the screen; the
       * cellar guard is posted off `at` so he faces the thing he watches. */
      tv: {
        screen: entTvScreen,
        at: { x: entMid, y: BY + 1.06, z: tvZ },
        faces: -1, // it looks down the room toward -Z
      },
    };
  }
  const innocent = buildInnocentBasement();

  /* ================================================================== */
  /* BEAT 3b -- THE DECORATIVE WALL AND THE THING BEHIND IT              */
  /*                                                                      */
  /* "a decorative wall of vintage bottles, old Squatch family            */
  /* photographs, hunting trophies and a marble Sasquatch bust -- with a  */
  /* hidden switch beneath the bust. The wall slides backward then        */
  /* sideways."                                                            */
  /*                                                                        */
  /* The bust does NOT ride the panel. It stands on its own plinth on the   */
  /* corridor floor beside the opening, which is what lets the switch stay   */
  /* reachable while two tonnes of wall moves, and what keeps the doorway    */
  /* itself (z 64.85..66.85, the full 2.0 m) clear to walk through.          */
  /* ================================================================== */
  const hiddenWallState = {
    phase: 'shut', // shut | back | across | open | returning
    t: 0,
    back: 0, // 0..1 travel west
    across: 0, // 0..1 travel south
  };
  const HIDDEN_BACK = 0.55; // metres west
  const HIDDEN_ACROSS = 2.4; // metres south
  const HIDDEN_BACK_SECS = 1.7;
  const HIDDEN_ACROSS_SECS = 2.6;

  function buildHiddenWall() {
    const BY = CELLAR_Y;
    const d = SECRET_DOOR;
    const panel = group('hidden-wall');
    const px = (d.x0 + d.x1) / 2;
    const pz = (d.z0 + d.z1) / 2;
    panel.position.set(px, 0, pz);
    root.add(panel);

    const w = d.z1 - d.z0;
    const h = d.y1 - d.y0;
    const t = d.x1 - d.x0;

    // The slab itself, faced in the corridor's own brick on the east side.
    panel.add(box({
      size: [t, h, w], pos: [0, BY + h / 2, 0], mat: concrete(w, h), name: 'hidden-wall-slab',
    }));
    const face = box({
      size: [0.04, h - 0.06, w - 0.06], pos: [t / 2 + 0.02, BY + h / 2, 0], mat: M_WOOD_DK, name: 'hidden-wall-face',
    });
    panel.add(face);
    occluders.push(panel.children[0]);

    // Vintage bottles, on their sides in a built-in rack on the north half.
    const bottleMat = mat({ color: 0x24301c, roughness: 0.3, metalness: 0.12 });
    const bottleMatB = mat({ color: 0x3a1418, roughness: 0.3, metalness: 0.1 });
    panel.add(box({
      size: [0.24, 1.0, 0.86], pos: [t / 2 + 0.14, BY + 1.32, 0.52], mat: M_WOOD_DK,
    }));
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        panel.add(cylinder({
          r: 0.05,
          h: 0.28,
          pos: [t / 2 + 0.2, BY + 0.98 + row * 0.24, 0.22 + col * 0.2],
          rotZ: Math.PI / 2,
          mat: (row + col) % 3 === 0 ? bottleMatB : bottleMat,
          cast: false,
        }));
      }
    }

    // Family photographs. Registered on this module's own art list rather
    // than the house's -- see the note by `decorArt` at the return.
    const shots = [
      ['silent.photo.groundbreaking', 'GROUNDBREAKING, 1986', -0.62, BY + 1.62, 0.44, 0.34],
      ['silent.photo.thefamily', 'THE FAMILY, 1991', -0.62, BY + 1.06, 0.44, 0.34],
      ['silent.photo.thefirm', 'THE FIRM', -0.18, BY + 1.34, 0.36, 0.44],
    ];
    for (const [id, label, pzz, py, pw, ph] of shots) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(pw, ph),
        mat({
          map: printed(id, [label], {
            w: 320, h: 260, bg: '#1a1712', fg: '#cbbf9a', font: '700 26px Georgia, serif', border: '#3a2c18',
          }),
          roughness: 0.9,
          unique: true,
        }),
      );
      /* 0.068, not 0.06: the frame's own front face lands on 0.06 and a
       * picture plane sharing a plane with its frame flickers. */
      m.position.set(t / 2 + 0.068, py, pzz);
      m.rotation.y = Math.PI / 2;
      panel.add(m);
      panel.add(box({
        size: [0.03, ph + 0.06, pw + 0.06], pos: [t / 2 + 0.045, py, pzz], mat: M_BRASS, cast: false,
      }));
      decorArt.push({ id, mesh: m });
    }

    /* Hunting trophies, on the wall stubs either side of the opening --
     * NOT on the panel. A mounted head that slides away with the door is a
     * mounted head that tells you where the door is. */
    function trophyHead(z) {
      const g = group('silent-trophy');
      // +0.002, not +0.02: the shield hangs ON the corridor's west end wall,
      // whose inner face is exactly d.x1, and a 2 cm standoff reads as float.
      g.position.set(d.x1 + 0.002, BY + 1.78, z);
      const fur = mat({ color: 0x3b2c20, roughness: 0.95 });
      g.add(box({ size: [0.06, 0.42, 0.4], pos: [0.03, 0, 0], mat: M_WOOD_DK, cast: false }));
      g.add(box({ size: [0.3, 0.3, 0.28], pos: [0.22, 0.02, 0], mat: fur }));
      g.add(box({ size: [0.2, 0.15, 0.2], pos: [0.4, -0.05, 0], mat: fur }));
      for (const sz of [-0.13, 0.13]) {
        g.add(cylinder({
          rTop: 0.012, rBottom: 0.05, h: 0.4, pos: [0.26, 0.3, sz], rotZ: sz > 0 ? -0.4 : 0.4, mat: mat({ color: 0x6a5a3a, roughness: 0.7 }),
        }));
      }
      for (const sz of [-0.07, 0.07]) {
        g.add(sphere({ r: 0.022, pos: [0.44, 0.03, sz], mat: M_BLACK, cast: false }));
      }
      root.add(g);
      return g;
    }
    const trophies = [trophyHead(d.z0 - 0.3), trophyHead(d.z1 + 0.3)];

    /* ---- The marble bust, its plinth, and the switch under it. --------
     * Tucked against the wall stub south of the opening so it never stands
     * in the doorway. `prop` rather than `solid`: it is furniture, and its
     * top is nowhere near a floor datum. */
    const bustX = d.x1 + 0.34;
    const bustZ = d.z0 - 0.5;
    const plinth = group('sasquatch-bust');
    plinth.position.set(bustX, CELLAR_Y, bustZ);
    root.add(plinth);
    plinth.add(box({ size: [0.56, 0.06, 0.56], pos: [0, 0.03, 0], mat: M_MARBLE_WHITE }));
    plinth.add(box({ size: [0.44, 0.98, 0.44], pos: [0, 0.55, 0], mat: M_MARBLE_WHITE }));
    plinth.add(box({ size: [0.56, 0.06, 0.56], pos: [0, 1.07, 0], mat: M_MARBLE_WHITE }));
    // The bust: shoulders, a heavy brow, a snout. Marble, so no colour.
    plinth.add(box({ size: [0.5, 0.24, 0.3], pos: [0, 1.22, 0], mat: M_MARBLE_WHITE }));
    plinth.add(box({ size: [0.2, 0.16, 0.2], pos: [0, 1.4, 0], mat: M_MARBLE_WHITE }));
    plinth.add(box({ size: [0.3, 0.26, 0.28], pos: [0, 1.6, 0], mat: M_MARBLE_WHITE }));
    plinth.add(box({ size: [0.32, 0.07, 0.06], pos: [0, 1.64, 0.15], mat: M_MARBLE_WHITE }));
    plinth.add(box({ size: [0.16, 0.12, 0.12], pos: [0, 1.52, 0.18], mat: M_MARBLE_WHITE }));
    // A small brass plate, because everything in this house has one.
    const bustPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.08),
      mat({
        map: printed('silent.bust.plate', ['LOUIS SQUATCH SR.'], {
          w: 384, h: 100, bg: '#6a5420', fg: '#1a1408', font: '900 34px "Trebuchet MS", sans-serif',
        }),
        roughness: 0.5,
        metalness: 0.6,
        unique: true,
      }),
    );
    bustPlate.position.set(0, 0.86, 0.225);
    plinth.add(bustPlate);
    prop(bustX - 0.3, bustX + 0.3, CELLAR_Y, CELLAR_Y + 1.75, bustZ - 0.3, bustZ + 0.3);

    /* The switch. Under the lip of the bust's own capital, on the side
     * facing away from the corridor -- you have to be standing at the wall
     * to see it, and nothing about the plinth says it is there. */
    const switchBody = box({
      size: [0.09, 0.05, 0.13], pos: [0.2, 1.02, -0.06], mat: M_BLACK, name: 'bust-switch',
    });
    plinth.add(switchBody);
    const switchLever = box({
      size: [0.035, 0.03, 0.07], pos: [0.25, 1.02, -0.06], mat: M_BRASS, name: 'bust-switch-lever',
    });
    plinth.add(switchLever);
    /* A generous invisible box in front of a very small part, the same trick
     * beefrun/preflight.js uses: nobody should have to hunt for a 9 cm
     * toggle with a crosshair. `soft` so anything solid on the same ray
     * still wins. */
    const switchTarget = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      mat({ color: 0x000000, transparent: true, opacity: 0, unique: true }),
    );
    switchTarget.position.set(0.16, 1.0, -0.1);
    switchTarget.visible = true;
    switchTarget.material.depthWrite = false;
    plinth.add(switchTarget);

    // A lamp over the display, so the wall reads as a display.
    light(0xffd8a8, 3.6, 7, d.x1 + 0.5, CELLAR_Y + 2.2, pz);

    // The mechanism, visible only once the wall is out of the way: rails in
    // the floor and the ceiling of the landing, and a hydraulic ram.
    const rails = group('hidden-wall-rails');
    root.add(rails);
    // Floor rail, and a head rail deep enough to span soffit to panel head --
    // it used to stop 0.16 m under the soffit and 0.12 m over the panel.
    rails.add(box({
      size: [0.12, 0.08, HIDDEN_ACROSS + w],
      pos: [d.x0 - HIDDEN_BACK + 0.05, CELLAR_Y + 0.04, pz - HIDDEN_ACROSS / 2],
      mat: M_STEEL_DULL,
      cast: false,
      name: 'hidden-wall-rail-floor',
    }));
    rails.add(box({
      size: [0.12, LANDING_CEIL - d.y1, HIDDEN_ACROSS + w],
      pos: [d.x0 - HIDDEN_BACK + 0.05, (LANDING_CEIL + d.y1) / 2, pz - HIDDEN_ACROSS / 2],
      mat: M_STEEL_DULL,
      cast: false,
      name: 'hidden-wall-rail-head',
    }));
    // The ram, on its own stanchion. A tonne of hydraulics needs a foot.
    const ramX = d.x0 - 0.6;
    const ramZ = d.z1 + 0.25;
    const ram = cylinder({
      r: 0.09, h: 1.1, pos: [ramX, CELLAR_Y + 1.1, ramZ], rotZ: Math.PI / 2, mat: M_STEEL,
    });
    ram.name = 'hidden-wall-ram'; // build.js's cylinder() takes no name
    rails.add(ram);
    rails.add(box({
      size: [0.2, 1.1, 0.26], pos: [ramX - 0.46, CELLAR_Y + 0.55, ramZ], mat: M_STEEL_DULL, name: 'hidden-wall-ram-foot',
    }));
    rails.add(cylinder({
      r: 0.13, h: 0.12, pos: [ramX - 0.4, CELLAR_Y + 1.1, ramZ], rotZ: Math.PI / 2, mat: M_STEEL_DULL, cast: false,
    }));

    return {
      panel, plinth, switchTarget, switchBody, switchLever, trophies, face,
    };
  }
  const hiddenWall = buildHiddenWall();

  /* ================================================================== */
  /* THE LANDING AND THE STAIRWELL                                       */
  /*                                                                      */
  /* "Polish gives way to concrete, exposed pipes, industrial lighting,   */
  /* drainage channels, security cameras, buzzing fluorescents, and old   */
  /* blood that was never fully removed."                                 */
  /* ================================================================== */
  const STAIR_DROP = CELLAR_Y - LAB_Y; // 3.8
  function stairFloorAt(z) {
    const t = THREE.MathUtils.clamp(
      (STAIRWELL.z1 - z) / (STAIRWELL.z1 - STAIRWELL.z0), 0, 1,
    );
    return THREE.MathUtils.lerp(CELLAR_Y, LAB_Y, t);
  }

  function buildLandingAndStair() {
    const BY = CELLAR_Y;
    const L = LANDING;
    const S = STAIRWELL;

    // ---- Landing shell.
    slab(L.x0 - 0.3, L.x1, BY, L.z0 - 0.3, L.z1 + 0.3, concrete(5, 6), 'ss-landing-floor');
    wall(L.x0 - 0.3, L.x0, BY, LANDING_CEIL, L.z0 - 0.3, L.z1 + 0.3, concrete(6, 2.5), 'ss-landing-west');
    wall(L.x0 - 0.3, L.x1 + 0.3, BY, LANDING_CEIL, L.z1, L.z1 + 0.3, concrete(4.6, 2.5), 'ss-landing-north');
    // South wall, with the stair mouth cut out of it.
    wall(L.x0 - 0.3, S.x0, BY, LANDING_CEIL, L.z0 - 0.3, L.z0, concrete(1, 2.5), 'ss-landing-south-a');
    wall(S.x1, L.x1 + 0.3, BY, LANDING_CEIL, L.z0 - 0.3, L.z0, concrete(1.6, 2.5), 'ss-landing-south-b');
    // East wall, south of where the shell's own west wall starts (z 63.7).
    wall(L.x1, L.x1 + 0.3, BY, LANDING_CEIL, L.z0 - 0.3, 63.7, concrete(1.6, 2.5), 'ss-landing-east');
    slab(L.x0 - 0.3, L.x1 + 0.3, LANDING_CEIL + 0.16, L.z0 - 0.3, L.z1 + 0.3,
      M_CONCRETE_DK, 'ss-landing-soffit', 0.16);

    // ---- The stair. Ramped in floorAt, treaded in geometry.
    const steps = 20;
    const depth = (S.z1 - S.z0) / steps;
    for (let i = 0; i < steps; i++) {
      const zMid = S.z1 - depth * (i + 0.5);
      const yTop = stairFloorAt(S.z1 - depth * i);
      root.add(box({
        size: [S.x1 - S.x0 - 0.1, 0.12, depth + 0.04],
        pos: [(S.x0 + S.x1) / 2, yTop + 0.06, zMid],
        mat: M_CONCRETE_DK,
        name: 'ss-stair-tread',
        cast: false,
      }));
      root.add(box({
        size: [S.x1 - S.x0 - 0.1, STAIR_DROP / steps, 0.05],
        pos: [(S.x0 + S.x1) / 2, yTop - STAIR_DROP / (steps * 2), zMid + depth / 2],
        mat: concrete(2.8, 0.4),
        name: 'ss-stair-riser',
        cast: false,
      }));
      // Massing under the flight, so there is no void to walk into.
      const massTop = yTop - 0.06;
      if (massTop > LAB_Y) {
        root.add(box({
          size: [S.x1 - S.x0 - 0.1, massTop - LAB_Y, depth + 0.03],
          pos: [(S.x0 + S.x1) / 2, (LAB_Y + massTop) / 2, zMid],
          mat: concrete(2.8, Math.max(0.4, massTop - LAB_Y)),
          cast: false,
          name: 'ss-stair-mass',
        }));
      }
    }
    /* Stairwell walls, raked. One collider per band rather than one tall
     * box, so the collider follows the flight instead of standing across
     * the bottom of it. */
    /* Stairwell walls and soffit, in five raked bands rather than one per
     * tread. Per-tread was a hundred boxes for a wall you walk past in four
     * seconds; five follows the rake closely enough that nothing steps
     * through it, and each band's collider still starts at the floor its own
     * stretch of flight actually has. */
    const BANDS = 5;
    const bandDepth = (S.z1 - S.z0) / BANDS;
    /** The underside of the raked soffit over the flight, band by band. */
    const stairSoffitAt = (z) => {
      const i = THREE.MathUtils.clamp(Math.floor((S.z1 - z) / bandDepth), 0, BANDS - 1);
      return stairFloorAt(S.z1 - bandDepth * (i + 0.5)) + 2.55;
    };
    for (let i = 0; i < BANDS; i++) {
      const zb = S.z1 - bandDepth * i;
      const za = zb - bandDepth;
      /* Clipped at the landing's own south wall. Past that line the landing's
       * masonry already closes this side, and two concrete boxes sharing a
       * face is exactly the flicker the house has been reporting. */
      const zc = Math.min(zb, L.z0 - 0.3);
      const yFloor = stairFloorAt(za);
      /* Up to the soffit, not to a flat LAB_CEIL + 0.4.
       *
       * That constant is 0.15 m BELOW the cellar floor, so the top band's
       * side walls finished under the landing and left a two-metre slot open
       * to the void on each side of the head of the flight -- you could see
       * daylight down the stairwell. The soffit rakes; the walls follow it,
       * and the flat datum still wins at the bottom where it is the taller. */
      const yTop = Math.max(LAB_CEIL + 0.4, stairSoffitAt((za + zc) / 2) + 0.21);
      for (const [wx0, wx1, tag] of [
        [S.x0 - 0.3, S.x0, 'ss-stair-west'], [S.x1, S.x1 + 0.3, 'ss-stair-east'],
      ]) {
        root.add(box({
          size: [0.3, yTop - yFloor, zc - za],
          pos: [(wx0 + wx1) / 2, (yFloor + yTop) / 2, (za + zc) / 2],
          mat: concrete(zc - za, 2.6),
          name: tag,
          cast: false,
        }));
        solid(wx0, wx1, yFloor, yTop, za, zc);
      }
      root.add(box({
        size: [S.x1 - S.x0 + 0.6, 0.14, bandDepth + 0.02],
        pos: [(S.x0 + S.x1) / 2, stairFloorAt((za + zb) / 2) + 2.62, (za + zb) / 2],
        mat: M_CONCRETE_DK,
        cast: false,
        name: 'ss-stair-soffit',
      }));
    }
    /* ---- AND THE STEPS BETWEEN THOSE FIVE SLABS.
     *
     * Owner playtest: gaps in the ceiling over the lab stairway. There were
     * four of them and they are arithmetic, not bad luck.
     *
     * The soffit is five FLAT slabs, each 140 mm thick, one per band, each
     * one following its band's floor down. The flight drops 3.8 m over five
     * bands, so consecutive slabs are 760 mm apart vertically and 140 mm of
     * that is slab — leaving a 620 mm slot running the full width of the
     * stairwell at every band boundary, open to the void above the flight.
     * Four slots, and walking down you look up through all of them.
     *
     * A raked soffit would have no boundaries at all, but the five-band
     * approximation is deliberate (see the note above it: a hundred boxes for
     * a wall you walk past in four seconds). So the boundaries get risers,
     * the way a stepped ceiling in a real stairwell does. The two ENDS get
     * one too: the head of the flight steps up to the landing's soffit at
     * LANDING_CEIL and the foot steps down to the lower level's at LAB_CEIL,
     * and both of those were 140 mm and 320 mm of the same slot. */
    for (let i = 0; i <= BANDS; i++) {
      const zEdge = S.z1 - bandDepth * i;
      /* The ceiling on each side of this edge. Outside the flight, the room
       * the stair arrives in supplies it. */
      const above = i === 0
        ? LANDING_CEIL
        : stairFloorAt(S.z1 - bandDepth * (i - 0.5)) + 2.55;
      const below = i === BANDS
        ? LAB_CEIL
        : stairFloorAt(S.z1 - bandDepth * (i + 0.5)) + 2.55;
      /* Inset 10 mm INTO each slab rather than flush with its face. Flush
       * means two coplanar faces, which is the flicker this house has spent
       * three passes chasing; 10 mm of overlap means the riser is buried in
       * the slab it joins and no two exposed faces share a plane. */
      const y0 = Math.min(above, below) + 0.01;
      const y1 = Math.max(above, below) + 0.13;
      if (y1 - y0 < 0.02) continue;
      root.add(box({
        /* 0.04 narrower than the slabs it joins. They both ended exactly on
         * the stairwell wall's outer face at S.x0 - 0.3, so their end faces
         * were coplanar and `scene-audit` said so. Nothing is visible there
         * — it is inside the wall — but a shared face is a shared face, and
         * this costs 20 mm at each end of something nobody can reach. */
        size: [S.x1 - S.x0 + 0.56, y1 - y0, 0.16],
        pos: [(S.x0 + S.x1) / 2, (y0 + y1) / 2, zEdge],
        mat: M_CONCRETE_DK,
        cast: false,
        name: 'ss-stair-soffit-riser',
      }));
    }
    // A steel handrail down the west side, on the rake.
    {
      const yTopEnd = stairFloorAt(S.z1) + 1.0;
      const yBotEnd = stairFloorAt(S.z0) + 1.0;
      const run = S.z1 - S.z0;
      root.add(box({
        size: [0.06, 0.06, Math.hypot(run, yTopEnd - yBotEnd)],
        pos: [S.x0 + 0.14, (yTopEnd + yBotEnd) / 2, (S.z0 + S.z1) / 2],
        mat: M_STEEL_DULL,
        rotX: -Math.atan2(yTopEnd - yBotEnd, run),
        name: 'ss-stair-rail',
      }));
      for (let i = 0; i <= 8; i++) {
        const z = THREE.MathUtils.lerp(S.z0, S.z1, i / 8);
        root.add(cylinder({
          r: 0.02, h: 1.0, pos: [S.x0 + 0.14, stairFloorAt(z) + 0.5, z], mat: M_STEEL_DULL,
        }));
      }
    }

    /* ---- Dressing: this is where the house stops and the other thing
     * starts, so everything from here down is service-grade. */
    // Pipes across the landing ceiling and down the stairwell.
    pipeRun('z', L.z0, L.z1, L.x0 + 0.7, LANDING_CEIL - 0.28, { ceil: LANDING_CEIL });
    pipeRun('z', L.z0, L.z1, L.x0 + 1.0, LANDING_CEIL - 0.28, { r: 0.045, material: M_PIPE_RED, ceil: LANDING_CEIL });
    pipeRun('x', L.x0, L.x1, L.z1 - 0.5, LANDING_CEIL - 0.3, { r: 0.055, ceil: LANDING_CEIL });
    /* One raked run down the flight, on hangers. It used to be five separate
     * stubs at five different constant heights, each 0.76 m below the last
     * and 0.03 m clear of its neighbour: a pipe cut into pieces and left in
     * mid-air, which is not a service riser, it is a mistake. */
    {
      const pz0 = S.z0 + 0.2;
      const pz1 = S.z1 - 0.2;
      const py0 = stairFloorAt(pz0) + 2.28;
      const py1 = stairFloorAt(pz1) + 2.28;
      const raked = cylinder({
        r: 0.06,
        h: Math.hypot(pz1 - pz0, py1 - py0),
        pos: [S.x1 - 0.22, (py0 + py1) / 2, (pz0 + pz1) / 2],
        rotX: Math.PI / 2 - Math.atan2(py1 - py0, pz1 - pz0),
        mat: M_PIPE,
        cast: false,
      });
      raked.name = 'ss-stair-pipe'; // build.js's cylinder() takes no name
      root.add(raked);
      for (let i = 0; i < BANDS; i++) {
        const z = S.z1 - bandDepth * (i + 0.5);
        const yPipe = stairFloorAt(z) + 2.34;
        const ySoffit = stairSoffitAt(z);
        root.add(box({
          size: [0.05, Math.max(0.04, ySoffit - yPipe), 0.05],
          pos: [S.x1 - 0.22, (yPipe + ySoffit) / 2, z],
          mat: M_STEEL_DULL,
          cast: false,
          name: 'ss-stair-pipe-hanger',
        }));
      }
    }
    // Lighting: two on the landing, four down the flight. One of them fails.
    const landingTubes = [
      fluoro((L.x0 + L.x1) / 2, LANDING_CEIL - 0.3, L.z1 - 1.3, { rotY: Math.PI / 2, ceil: LANDING_CEIL }),
      fluoro((L.x0 + L.x1) / 2, LANDING_CEIL - 0.3, L.z0 + 1.3, { rotY: Math.PI / 2, ceil: LANDING_CEIL }),
    ];
    const stairTubes = [];
    for (let i = 0; i < 4; i++) {
      const z = THREE.MathUtils.lerp(S.z1 - 0.9, S.z0 + 0.9, i / 3);
      stairTubes.push(fluoro((S.x0 + S.x1) / 2, stairFloorAt(z) + 2.42, z, {
        rotY: Math.PI / 2, len: 1.1, intensity: 4.6, range: 9, ceil: stairSoffitAt(z),
      }));
    }
    // Drainage channel down the middle of the landing, and a drip.
    drainChannel(L.x0 + 0.4, L.x1 - 0.4, (L.z0 + L.z1) / 2, CELLAR_Y);
    /* Cameras: one watching the door, one watching the flight. Both hung off
     * the soffit they are actually under -- the stairwell one used to take
     * its height from the floor at the TOP of the rake and ended up sitting
     * in the middle of the raking soffit two bands down. */
    camera_(L.x0 + 0.35, LANDING_CEIL - 0.45, L.z1 - 0.4,
      [SECRET_DOOR.x0, CELLAR_Y + 1.3, (SECRET_DOOR.z0 + SECRET_DOOR.z1) / 2],
      { mount: LANDING_CEIL });
    camera_(S.x1 - 0.2, stairSoffitAt(S.z1 - 0.5) - 0.42, S.z1 - 0.5,
      [(S.x0 + S.x1) / 2, LAB_Y + 1.2, S.z0],
      { mount: stairSoffitAt(S.z1 - 0.5) });
    // Old blood on the landing, and a longer smear down two treads.
    stain(L.x0 + 1.5, L.z0 + 1.8, CELLAR_Y, 1.5, 3, 0.85);
    stain(L.x0 + 2.2, L.z0 + 2.4, CELLAR_Y, 0.9, 7, 0.6);
    /* The smear down the flight, one stain per tread. It used to be a single
     * 1.1 m plane laid flat across a rake that drops 0.48 m over that span,
     * so five sixths of it was inside the treads. A stain on a stair has to
     * be tread-sized or it is not on the stair. */
    for (const [ti, sd] of [[4, 11], [5, 17]]) {
      const zt = S.z1 - depth * (ti + 0.5);
      stain((S.x0 + S.x1) / 2 + 0.4, zt, stairFloorAt(S.z1 - depth * ti) + 0.12, 0.26, sd, 0.55);
    }
    // A hose on a reel and a bucket, because somebody's job is this room.
    root.add(cylinder({
      r: 0.24, h: 0.16, pos: [L.x0 + 0.34, CELLAR_Y + 1.2, L.z1 - 2.3], rotZ: Math.PI / 2, mat: M_RUST,
    }));
    root.add(cylinder({
      rTop: 0.19, rBottom: 0.15, h: 0.3, pos: [L.x0 + 0.5, CELLAR_Y + 0.15, L.z1 - 2.9], mat: M_STEEL_DULL,
    }));
    // The stencil, in case anybody down here needed telling.
    const stencil = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.34),
      mat({
        map: printed('silent.sign.authorised', ['AUTHORISED PERSONNEL'], {
          w: 512, h: 116, bg: null, fg: '#b8bcc0', font: '900 44px "Trebuchet MS", sans-serif',
        }),
        transparent: true,
        roughness: 0.95,
        unique: true,
      }),
    );
    stencil.position.set(L.x0 + 0.02, CELLAR_Y + 1.85, (L.z0 + L.z1) / 2);
    stencil.rotation.y = Math.PI / 2;
    root.add(stencil);

    return { landingTubes, stairTubes };
  }
  const stairProps = buildLandingAndStair();

  /* ================================================================== */
  /* THE LOWER LEVEL SHELL                                               */
  /*                                                                      */
  /* One slab, three rooms. The interrogation hall and the observation    */
  /* area are one continuous space split by a pier wall with a 3.4 m      */
  /* opening; the lab is behind glass and there is exactly one way into   */
  /* it. Every wall band here is a real collider with `wallColliderTop`   */
  /* applied, and the whole slab is offered to floorAt as ONE footprint   */
  /* rather than room by room -- a rect per room leaves every threshold   */
  /* with no candidate at all, which is the bug that used to fire people  */
  /* up into the ballroom.                                                */
  /* ================================================================== */
  /** The whole lower level's footprint, for floor resolution. */
  const LOWER = Object.freeze({
    x0: Math.min(OBSERVATION.x0, INTERROGATION.x0, SEALED_LAB.x0),
    x1: Math.max(OBSERVATION.x1, INTERROGATION.x1, SEALED_LAB.x1),
    z0: Math.min(SEALED_LAB.z0, OBSERVATION.z0, INTERROGATION.z0),
    z1: Math.max(OBSERVATION.z1, INTERROGATION.z1),
  });
  /** The pier wall between the interrogation hall and the observation area. */
  const CROSS_WALL = Object.freeze({
    x: INTERROGATION.x0, thickness: 0.3, openZ0: 51.2, openZ1: 54.6,
  });

  function buildLowerShell() {
    const T = 0.34; // structural wall thickness down here
    // Slab under everything, and a soffit over everything.
    slab(LOWER.x0 - T, LOWER.x1 + T, LAB_Y, LOWER.z0 - T, LOWER.z1 + T, concrete(12, 18), 'ss-lower-slab');
    for (const r of [INTERROGATION, OBSERVATION, SEALED_LAB]) {
      slab(r.x0, r.x1, LAB_Y + 0.012, r.z0, r.z1, concrete(r.x1 - r.x0, r.z1 - r.z0), 'ss-lower-floor', 0.024);
      slab(r.x0 - T, r.x1 + T, LAB_CEIL + 0.18, r.z0 - T, r.z1 + T, M_CONCRETE_DK, 'ss-lower-soffit', 0.18);
    }

    /* ---- Perimeter. Written out rather than looped, because every one of
     * these is a different length and two of them have holes in them. */
    // Interrogation hall: south, east, north (with the stair mouth).
    wall(INTERROGATION.x0, INTERROGATION.x1 + T, LAB_Y, LAB_CEIL, INTERROGATION.z0 - T, INTERROGATION.z0, concrete(11, 3), 'ss-int-south');
    wall(INTERROGATION.x1, INTERROGATION.x1 + T, LAB_Y, LAB_CEIL, INTERROGATION.z0, INTERROGATION.z1 + T, concrete(6, 3), 'ss-int-east');
    wall(INTERROGATION.x0 - T, STAIRWELL.x0, LAB_Y, LAB_CEIL, INTERROGATION.z1, INTERROGATION.z1 + T, concrete(8, 3), 'ss-int-north-a');
    wall(STAIRWELL.x1, INTERROGATION.x1 + T, LAB_Y, LAB_CEIL, INTERROGATION.z1, INTERROGATION.z1 + T, concrete(0.6, 3), 'ss-int-north-b');

    // The pier wall, with its opening.
    const cw0 = CROSS_WALL.x - CROSS_WALL.thickness / 2;
    const cw1 = CROSS_WALL.x + CROSS_WALL.thickness / 2;
    wall(cw0, cw1, LAB_Y, LAB_CEIL, INTERROGATION.z0, CROSS_WALL.openZ0, concrete(2, 3), 'ss-cross-a');
    wall(cw0, cw1, LAB_Y, LAB_CEIL, CROSS_WALL.openZ1, INTERROGATION.z1 + T, concrete(1.4, 3), 'ss-cross-b');
    wall(cw0, cw1, LAB_Y + 2.3, LAB_CEIL, CROSS_WALL.openZ0, CROSS_WALL.openZ1, concrete(3.4, 0.9), 'ss-cross-lintel');
    for (const jz of [CROSS_WALL.openZ0, CROSS_WALL.openZ1]) {
      root.add(box({
        size: [0.4, 2.3, 0.12], pos: [CROSS_WALL.x, LAB_Y + 1.15, jz], mat: M_STEEL_DULL, cast: false,
      }));
    }

    // Observation area: west, north, and the notch back to the pier wall.
    wall(OBSERVATION.x0 - T, OBSERVATION.x0, LAB_Y, LAB_CEIL, OBSERVATION.z0 - T, OBSERVATION.z1 + T, concrete(7.5, 3), 'ss-obs-west');
    wall(OBSERVATION.x0 - T, OBSERVATION.x1 + T, LAB_Y, LAB_CEIL, OBSERVATION.z1, OBSERVATION.z1 + T, concrete(10, 3), 'ss-obs-north');
    wall(OBSERVATION.x1, OBSERVATION.x1 + T, LAB_Y, LAB_CEIL, INTERROGATION.z1 + T, OBSERVATION.z1 + T, concrete(1.5, 3), 'ss-obs-east-notch');

    // Sealed lab: west, south, east.
    wall(SEALED_LAB.x0 - T, SEALED_LAB.x0, LAB_Y, LAB_CEIL, SEALED_LAB.z0 - T, SEALED_LAB.z1, concrete(9.5, 3), 'ss-lab-west');
    wall(SEALED_LAB.x0 - T, SEALED_LAB.x1 + T, LAB_Y, LAB_CEIL, SEALED_LAB.z0 - T, SEALED_LAB.z0, concrete(10.5, 3), 'ss-lab-south');
    wall(SEALED_LAB.x1, SEALED_LAB.x1 + T, LAB_Y, LAB_CEIL, SEALED_LAB.z0 - T, SEALED_LAB.z1 + T, concrete(9.5, 3), 'ss-lab-east');
  }
  buildLowerShell();

  /* ================================================================== */
  /* THE REINFORCED GLASS WALL                                           */
  /*                                                                      */
  /* The spec's one hard layout requirement. Everything about this is     */
  /* built so the player CANNOT get to the other side while it is shut:   */
  /* the pane carries a permanent collider from floor to soffit, the      */
  /* plinth under it carries another, and the door panel carries a third  */
  /* that moves with the panel. There is no other opening in the wall.    */
  /*                                                                        */
  /* Visibility is the other half of the requirement -- "the player must    */
  /* always clearly see the scientists reacting" -- so the pane is 0.17     */
  /* opacity with a bright edge frame, and the lab keeps its own emissive   */
  /* fixtures so it never goes dark when the nearest-N light rig moves on.  */
  /* ================================================================== */
  const glassDoorState = { open: 0, target: 0, locked: false, bolts: 0 };

  function buildGlassWall() {
    const G = GLASS_WALL;
    const D = GLASS_DOOR;
    const midZ = (G.z0 + G.z1) / 2;
    const PLINTH_Y = LAB_Y + 0.55;
    const HEAD_Y = LAB_Y + 2.55;

    /* Concrete plinth under the glazing, and a head beam over the lot.
     *
     * The plinth is SPLIT round the door opening. It used to run the full
     * width, which put a 0.55 m concrete kerb across the doorway -- the
     * pane stopped you at chest height and the plinth stopped you at the
     * shin, and the verifier's walk at an open door got 0.3 m. The head
     * beam is allowed to run through, because core/player.js skips a
     * collider whose bottom is over your head. */
    for (const [px0, px1] of [[G.x0, D.x0], [D.x1, G.x1]]) {
      wall(px0, px1, LAB_Y, PLINTH_Y, G.z0, G.z1, concrete(px1 - px0, 0.6), 'ss-glass-plinth');
    }
    wall(G.x0, G.x1, HEAD_Y, LAB_CEIL, G.z0, G.z1, concrete(10, 0.9), 'ss-glass-head');
    // A steel sill across the opening itself: flush, so it is a threshold.
    root.add(box({
      size: [D.x1 - D.x0, 0.03, G.z1 - G.z0],
      pos: [(D.x0 + D.x1) / 2, LAB_Y + 0.015, midZ],
      mat: M_STEEL_DULL,
      cast: false,
    }));

    /* The panes. Split round the door opening so the door is a real hole in
     * the glazing rather than a panel hung in front of it. */
    const panes = [];
    for (const [px0, px1] of [[G.x0, D.x0], [D.x1, G.x1]]) {
      const pane = box({
        size: [px1 - px0, HEAD_Y - PLINTH_Y, 0.14],
        pos: [(px0 + px1) / 2, (PLINTH_Y + HEAD_Y) / 2, midZ],
        mat: M_GLASS,
        name: 'ss-reinforced-glass',
        cast: false,
      });
      root.add(pane);
      panes.push(pane);
      solid(px0, px1, PLINTH_Y, HEAD_Y, G.z0, G.z1);
      // Mullions every 1.7 m, and a frame round the whole light.
      const bays = Math.max(1, Math.round((px1 - px0) / 1.7));
      for (let i = 0; i <= bays; i++) {
        const mx = px0 + ((px1 - px0) * i) / bays;
        /* Not on the door jamb. Fully open, the leaf parks its own 90 mm
         * edge stile on exactly that x in exactly that plane, and two steel
         * boxes in the same place is the flicker the owner has been
         * reporting elsewhere in the house. The leaf's stile IS the jamb
         * trim when it is shut, so nothing is lost. */
        if (Math.abs(mx - D.x0) < 0.01 || Math.abs(mx - D.x1) < 0.01) continue;
        root.add(box({
          size: [0.09, HEAD_Y - PLINTH_Y, 0.22],
          pos: [mx, (PLINTH_Y + HEAD_Y) / 2, midZ],
          mat: M_GLASS_EDGE,
          cast: false,
          name: 'ss-glass-mullion',
        }));
      }
      for (const py of [PLINTH_Y, HEAD_Y]) {
        root.add(box({
          size: [px1 - px0, 0.1, 0.24], pos: [(px0 + px1) / 2, py, midZ], mat: M_GLASS_EDGE, cast: false,
        }));
      }
    }

    /* ---- The door. A single sliding leaf that runs WEST, in front of the
     * fixed pane, into a pocket guard. Its collider is a live Box3 in the
     * world list that is moved by `applyDoor` -- the panel and the thing
     * that stops you are the same object, which is what makes "you cannot
     * reach the lab side while locked" a fact rather than a claim. */
    const leaf = group('ss-glass-door');
    leaf.position.set((D.x0 + D.x1) / 2, 0, midZ);
    root.add(leaf);
    leaf.add(box({
      size: [D.x1 - D.x0, D.y1 - D.y0, 0.12], pos: [0, (D.y0 + D.y1) / 2, 0], mat: M_GLASS, cast: false,
    }));
    for (const ex of [-(D.x1 - D.x0) / 2, (D.x1 - D.x0) / 2]) {
      leaf.add(box({
        size: [0.09, D.y1 - D.y0, 0.2], pos: [ex, (D.y0 + D.y1) / 2, 0], mat: M_GLASS_EDGE, cast: false,
      }));
    }
    for (const ey of [D.y0 + 0.05, D.y1 - 0.05]) {
      leaf.add(box({
        size: [D.x1 - D.x0, 0.1, 0.2], pos: [0, ey, 0], mat: M_GLASS_EDGE, cast: false,
      }));
    }
    /* A handle on both faces. At 0.075 they are bolted THROUGH the 0.12 m
     * pane, which is how a glass door handle is fixed; at the 0.14 they were
     * authored at they floated 18 mm clear of everything. */
    for (const hz of [-0.075, 0.075]) {
      leaf.add(cylinder({
        r: 0.022, h: 0.5, pos: [(D.x1 - D.x0) / 2 - 0.22, LAB_Y + 1.06, hz], mat: M_STEEL,
      }));
    }
    const doorCollider = collider(
      [D.x0, D.y0, G.z0], [D.x1, D.y1, G.z1],
    );
    colliders.push(doorCollider);
    /* The head rail the leaf runs on, and the two brackets carrying it.
     *
     * It sits on the OBSERVATION face of the glass head, not in the middle of
     * the wall: at midZ it ran the full width of the west light at y -4.28,
     * which is 0.23 m INSIDE the fixed pane -- a steel beam buried in the
     * glass for three and a half metres. */
    const railZ = G.z1 + 0.16;
    root.add(box({
      size: [(D.x1 - D.x0) * 2 + 0.4, 0.13, 0.3],
      pos: [D.x0 - (D.x1 - D.x0) / 2 + 0.1, D.y1 + 0.11, railZ],
      mat: M_STEEL_DULL,
      cast: false,
      name: 'ss-door-head-rail',
    }));
    for (const bx of [D.x0 - (D.x1 - D.x0) + 0.3, D.x0 + 0.4]) {
      root.add(box({
        size: [0.1, 0.3, 0.18],
        pos: [bx, D.y1 + 0.26, G.z1 + 0.07],
        mat: M_STEEL_DULL,
        cast: false,
        name: 'ss-door-head-bracket',
      }));
    }

    /* ---- Four bolts, two per jamb. They shoot when the door locks; that
     * is the whole visual of "the indicator goes green, then red". */
    const bolts = [];
    for (const side of [-1, 1]) {
      for (const by of [LAB_Y + 0.5, LAB_Y + 1.7]) {
        const b = box({
          size: [0.34, 0.09, 0.09],
          pos: [(D.x0 + D.x1) / 2 + side * ((D.x1 - D.x0) / 2 + 0.02), by, midZ],
          mat: M_STEEL,
          cast: false,
        });
        b.userData.home = b.position.x;
        b.userData.side = side;
        root.add(b);
        bolts.push(b);
      }
    }
    // The bolt housings, which do not move.
    for (const side of [-1, 1]) {
      for (const by of [LAB_Y + 0.5, LAB_Y + 1.7]) {
        root.add(box({
          size: [0.22, 0.2, 0.24],
          pos: [(D.x0 + D.x1) / 2 + side * ((D.x1 - D.x0) / 2 + 0.24), by, midZ],
          mat: M_STEEL_DULL,
          cast: false,
        }));
      }
    }

    /* ---- The indicator over the door. Green while it is unlocked, red
     * from the moment it is not.
     *
     * Beside the east jamb, not on the door's centreline: the centreline is
     * where the LIFE SIGNS panel hangs, and the two housings were occupying
     * the same 0.2 m of head beam. */
    const indX = D.x1 - 0.25;
    const indicatorHousing = box({
      size: [0.46, 0.2, 0.22], pos: [indX, D.y1 + 0.34, midZ + 0.2], mat: M_STEEL_DULL, cast: false,
      name: 'ss-door-indicator-housing',
    });
    root.add(indicatorHousing);
    const indicator = box({
      size: [0.3, 0.1, 0.04],
      pos: [indX, D.y1 + 0.34, midZ + 0.33],
      mat: mat({
        color: 0x081408, emissive: 0x3ce85e, emissiveIntensity: 2.6, roughness: 1, unique: true,
      }),
      cast: false,
      name: 'ss-door-indicator',
    });
    root.add(indicator);
    const indicatorLight = light(0x3ce85e, 2.0, 4.5, indX, D.y1 + 0.34, midZ + 0.5);

    return {
      panes, leaf, doorCollider, bolts, indicator, indicatorLight, midZ, PLINTH_Y, HEAD_Y,
    };
  }
  const glass = buildGlassWall();

  /** Push the door's current travel into the leaf and its collider. */
  function applyDoor() {
    const D = GLASS_DOOR;
    const travel = (D.x1 - D.x0) * glassDoorState.open;
    glass.leaf.position.x = (D.x0 + D.x1) / 2 - travel;
    glass.doorCollider.min.x = D.x0 - travel - 0.02;
    glass.doorCollider.max.x = D.x1 - travel + 0.02;
    /* Parked, the leaf sits in front of the fixed pane, which already has a
     * collider of its own -- so the leaf's box is retired UNDER the slab
     * rather than left standing at half a doorway's width. Retired below the
     * floor and not flattened onto it: a box whose top lands on a floor
     * datum is an invisible wall for everyone on that floor, which is the
     * lesson the mansion's upper storey paid for. */
    if (glassDoorState.open > 0.92) {
      glass.doorCollider.min.y = LAB_Y - 2.0;
      glass.doorCollider.max.y = LAB_Y - 1.5;
    } else {
      glass.doorCollider.min.y = D.y0;
      glass.doorCollider.max.y = D.y1;
    }
    /* Withdrawn INTO the jamb housing, not out into the doorway. The sign was
     * inverted, so an unlocked door had four steel bolts standing 0.26 m
     * across the opening at shin and chest height, and locking it pulled them
     * back out of the way. */
    for (const b of glass.bolts) {
      b.position.x = b.userData.home + b.userData.side * 0.26 * (1 - glassDoorState.bolts);
    }
  }
  applyDoor();

  /* ================================================================== */
  /* BEAT 4 -- THE INTERROGATION AREA                                    */
  /*                                                                      */
  /* "Halfway down: a steel table of torture equipment (pliers,           */
  /* electrical leads, medical saws, syringes, a car battery, towels, a   */
  /* bucket, and several tools whose purpose is better left unexplained)."*/
  /*                                                                        */
  /* Played completely straight. Nothing on this table is a joke and        */
  /* nothing in this room comments on itself.                               */
  /* ================================================================== */
  function buildInterrogation() {
    const R = INTERROGATION;
    const cx = (R.x0 + R.x1) / 2;

    // Drainage running the length of the room, into a gulley at the west end.
    drainChannel(R.x0 + 0.6, R.x1 - 0.6, 52.0, LAB_FLOOR, { width: 0.3 });
    const gulley = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 20),
      mat({ color: 0x07070a, roughness: 0.5, unique: true }),
    );
    gulley.rotation.x = -Math.PI / 2;
    gulley.position.set(R.x0 + 1.2, LAB_FLOOR + 0.008, 52.0);
    gulley.name = 'ss-gulley';
    root.add(gulley);

    // Pipes and conduit along the ceiling, and a cable tray on its own drops.
    pipeRun('x', R.x0, R.x1 + 0.3, R.z1 - 0.8, LAB_CEIL - 0.28, { r: 0.08, ceil: LAB_CEIL });
    pipeRun('x', R.x0, R.x1 + 0.3, R.z1 - 1.15, LAB_CEIL - 0.28, { r: 0.05, material: M_PIPE_RED, ceil: LAB_CEIL });
    pipeRun('x', R.x0, R.x1 + 0.3, R.z0 + 0.9, LAB_CEIL - 0.3, { r: 0.06, ceil: LAB_CEIL });
    const trayY = LAB_CEIL - 0.5;
    root.add(box({
      size: [R.x1 - R.x0, 0.06, 0.34], pos: [cx, trayY, R.z0 + 1.6], mat: M_STEEL_DULL, cast: false, name: 'ss-cable-tray',
    }));
    for (let i = 0; i <= 5; i++) {
      root.add(box({
        size: [0.04, LAB_CEIL - trayY - 0.03, 0.04],
        pos: [R.x0 + 0.4 + ((R.x1 - R.x0 - 0.8) * i) / 5, (LAB_CEIL + trayY + 0.03) / 2, R.z0 + 1.6],
        mat: M_STEEL_DULL,
        cast: false,
        name: 'ss-cable-tray-hanger',
      }));
    }

    // Lighting. Four tubes; the one over the table is the one that fails.
    const tubes = [];
    for (const [tx, tz] of [[R.x0 + 2.6, 53.6], [cx + 1.2, 53.6], [R.x0 + 2.6, 50.6], [cx + 1.2, 50.6]]) {
      tubes.push(fluoro(tx, LAB_CEIL - 0.34, tz, { intensity: 5.0, range: 10, ceil: LAB_CEIL }));
    }
    const failingTube = tubes[1];

    // Cameras, one from each end.
    camera_(R.x1 - 0.4, LAB_CEIL - 0.5, R.z1 - 0.4, [cx, LAB_Y + 1.2, 52.0], { mount: LAB_CEIL });
    camera_(R.x0 + 0.4, LAB_CEIL - 0.5, R.z0 + 0.4, [cx, LAB_Y + 1.2, 52.0], { mount: LAB_CEIL });

    // Old blood, never fully removed. Scrub marks that stop halfway.
    for (const [sx, sz, size, seed, op] of [
      [cx - 1.8, 53.0, 1.9, 2, 0.5], [cx + 2.4, 51.2, 1.4, 5, 0.36],
      [R.x1 - 2.0, 54.0, 1.1, 8, 0.3], [R.x0 + 2.2, 50.4, 1.6, 13, 0.42],
    ]) stain(sx, sz, LAB_FLOOR, size, seed, op);
    // A smear up the wall, at about the height of a shoulder.
    const wallSmear = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.4),
      mat({
        map: stainTexture(21), transparent: true, opacity: 0.4, roughness: 0.8, unique: true,
      }),
    );
    wallSmear.position.set(R.x1 - 0.01, LAB_Y + 1.1, 53.8);
    wallSmear.rotation.y = -Math.PI / 2;
    root.add(wallSmear);

    /* ---- The steel table. -------------------------------------------- */
    const tx = cx - 1.5;
    const tz = 53.9;
    const topY = LAB_Y + 0.88;
    root.add(box({ size: [2.2, 0.05, 0.8], pos: [tx, topY, tz], mat: M_STEEL, name: 'ss-tool-table' }));
    root.add(box({ size: [2.1, 0.04, 0.7], pos: [tx, LAB_Y + 0.28, tz], mat: M_STEEL_DULL, cast: false }));
    for (const [lx, lz] of [[-1.02, -0.35], [1.02, -0.35], [-1.02, 0.35], [1.02, 0.35]]) {
      root.add(box({ size: [0.05, 0.88, 0.05], pos: [tx + lx, LAB_Y + 0.44, tz + lz], mat: M_STEEL_DULL }));
    }
    prop(tx - 1.1, tx + 1.1, LAB_Y, topY + 0.04, tz - 0.42, tz + 0.42);

    const tools = [];
    const put = (mesh, name) => { mesh.name = name; root.add(mesh); tools.push(name); return mesh; };
    // Pliers: two crossed jaws with handles.
    for (const [ox, rot] of [[-0.92, 0.3], [-0.78, -0.5]]) {
      put(box({ size: [0.22, 0.014, 0.03], pos: [tx + ox, topY + 0.03, tz - 0.2], mat: M_STEEL, rotY: rot }), 'pliers');
      put(box({ size: [0.22, 0.014, 0.03], pos: [tx + ox, topY + 0.045, tz - 0.2], mat: M_STEEL, rotY: rot + 0.35 }), 'pliers');
    }
    // Electrical leads, coiled, running to a car battery under the table.
    const battery = put(box({
      size: [0.32, 0.2, 0.2], pos: [tx + 0.85, LAB_Y + 0.1, tz + 0.1], mat: mat({ color: 0x15181c, roughness: 0.8 }),
    }), 'car battery');
    for (const bx of [-0.09, 0.09]) {
      root.add(cylinder({ r: 0.022, h: 0.04, pos: [tx + 0.85 + bx, LAB_Y + 0.22, tz + 0.1], mat: M_BRASS, cast: false }));
    }
    prop(tx + 0.67, tx + 1.03, LAB_Y, LAB_Y + 0.22, tz - 0.02, tz + 0.22);
    for (let i = 0; i < 3; i++) {
      put(cylinder({
        r: 0.11 + i * 0.02,
        h: 0.014,
        pos: [tx + 0.5, topY + 0.03 + i * 0.014, tz + 0.16],
        rotX: Math.PI / 2,
        mat: i === 1 ? M_PIPE_RED : M_BLACK,
        cast: false,
      }), 'electrical leads');
    }
    for (const [cx2, cz2, col] of [[tx + 0.34, tz + 0.05, M_PIPE_RED], [tx + 0.28, tz - 0.02, M_BLACK]]) {
      put(box({ size: [0.06, 0.035, 0.02], pos: [cx2, topY + 0.045, cz2], mat: col }), 'crocodile clip');
    }
    // Medical saws.
    put(box({ size: [0.3, 0.008, 0.05], pos: [tx - 0.34, topY + 0.03, tz + 0.2], mat: M_STEEL }), 'medical saw');
    put(box({ size: [0.1, 0.03, 0.035], pos: [tx - 0.52, topY + 0.04, tz + 0.2], mat: M_BLACK }), 'medical saw');
    put(box({ size: [0.26, 0.006, 0.09], pos: [tx - 0.3, topY + 0.03, tz - 0.02], mat: M_STEEL, rotY: 0.2 }), 'bone saw');
    // Syringes, laid out in a row on a cloth.
    put(box({
      size: [0.42, 0.006, 0.24], pos: [tx + 0.02, topY + 0.028, tz - 0.22], mat: mat({ color: 0x2c3e4a, roughness: 0.9 }), cast: false,
    }), 'cloth');
    for (let i = 0; i < 5; i++) {
      put(cylinder({
        r: 0.011, h: 0.13, pos: [tx - 0.14 + i * 0.07, topY + 0.04, tz - 0.22], rotZ: Math.PI / 2, mat: M_GLASS, cast: false,
      }), 'syringe');
      put(cylinder({
        r: 0.003, h: 0.05, pos: [tx - 0.14 + i * 0.07 + 0.09, topY + 0.04, tz - 0.22], rotZ: Math.PI / 2, mat: M_STEEL, cast: false,
      }), 'needle');
    }
    // Towels, folded, and a bucket. One towel is not clean.
    for (let i = 0; i < 3; i++) {
      put(box({
        size: [0.3, 0.035, 0.22],
        pos: [tx + 0.86, topY + 0.045 + i * 0.035, tz - 0.2],
        mat: i === 0 ? mat({ color: 0x50201c, roughness: 0.94 }) : mat({ color: 0xb8b2a4, roughness: 0.95 }),
        cast: false,
      }), 'towel');
    }
    const bucket = put(cylinder({
      rTop: 0.19, rBottom: 0.15, h: 0.32, pos: [tx - 1.35, LAB_Y + 0.16, tz - 0.1], mat: M_STEEL_DULL,
    }), 'bucket');
    root.add(cylinder({
      r: 0.16, h: 0.01, pos: [tx - 1.35, LAB_Y + 0.24, tz - 0.1], mat: M_BLOOD, cast: false,
    }));
    prop(tx - 1.54, tx - 1.16, LAB_Y, LAB_Y + 0.32, tz - 0.29, tz + 0.09);
    /* "...and several tools whose purpose is better left unexplained." The
     * spec's words. They are shapes, they are the right size to be held, and
     * the scene never says another word about them. */
    put(box({ size: [0.17, 0.05, 0.05], pos: [tx + 0.62, topY + 0.05, tz - 0.02], mat: M_STEEL }), 'unexplained');
    put(cylinder({ rTop: 0.008, rBottom: 0.03, h: 0.2, pos: [tx + 0.66, topY + 0.04, tz + 0.3], rotZ: Math.PI / 2, mat: M_STEEL }), 'unexplained');
    put(box({ size: [0.09, 0.09, 0.14], pos: [tx - 0.68, topY + 0.08, tz - 0.24], mat: M_RUST }), 'unexplained');
    put(cylinder({ r: 0.05, h: 0.16, pos: [tx + 0.18, topY + 0.11, tz + 0.28], mat: M_STEEL_DULL }), 'unexplained');

    // A chair bolted to the floor, empty, facing the table.
    const chairX = cx + 0.9;
    const chairZ = 52.6;
    root.add(box({ size: [0.5, 0.06, 0.5], pos: [chairX, LAB_Y + 0.46, chairZ], mat: M_STEEL_DULL }));
    root.add(box({ size: [0.5, 0.7, 0.06], pos: [chairX, LAB_Y + 0.81, chairZ - 0.22], mat: M_STEEL_DULL }));
    for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      root.add(box({ size: [0.04, 0.46, 0.04], pos: [chairX + lx, LAB_Y + 0.23, chairZ + lz], mat: M_STEEL_DULL }));
    }
    prop(chairX - 0.28, chairX + 0.28, LAB_Y, LAB_Y + 0.5, chairZ - 0.28, chairZ + 0.28);
    for (const sx of [-0.24, 0.24]) {
      root.add(cylinder({
        r: 0.02, h: 0.16, pos: [chairX + sx, LAB_Y + 0.5, chairZ + 0.18], rotX: Math.PI / 2, mat: M_RUBBER, cast: false,
      }));
    }

    // A hose bib and a coiled hose on the wall by the gulley.
    root.add(cylinder({
      r: 0.2, h: 0.14, pos: [R.x0 + 0.24, LAB_Y + 1.1, 51.0], rotZ: Math.PI / 2, mat: M_RUST,
    }));
    root.add(cylinder({
      r: 0.035, h: 0.24, pos: [R.x0 + 0.3, LAB_Y + 1.5, 51.0], rotZ: Math.PI / 2, mat: M_BRASS, cast: false,
    }));

    return {
      table: { x: tx, z: tz, y: topY }, tools, failingTube, tubes, battery, bucket, gulley,
    };
  }
  const interrogation = buildInterrogation();

  /* ================================================================== */
  /* xXx                                                                 */
  /*                                                                      */
  /* Owner's direction, 2026-08-04, verbatim: "Keep XXX bald and looking  */
  /* like vin diesel maybe wearing jeans and a black tank top." The       */
  /* earlier instruction to avoid the likeness is withdrawn; beat 4 of    */
  /* the spec has been updated to match, and this build follows the doc.  */
  /*                                                                        */
  /* So: bald (every `sf.hair.*` mesh is removed, not recoloured -- a       */
  /* skin-toned crown still reads as a hat), heavy brow, hooded lids,       */
  /* broad jaw, thick neck, heavy build, blue jeans, black tank top, both   */
  /* torn and both bloodied. He hangs upside down by the ankles over the    */
  /* pool, badly beaten and barely conscious, and he survives this.         */
  /*                                                                         */
  /* Driven by a local update rather than `Figure.update()`: that            */
  /* controller eases the arms back to a standing rest every frame, which    */
  /* on an inverted body points them at the ceiling.                         */
  /* ================================================================== */
  const XXX_AT = Object.freeze({ x: (INTERROGATION.x0 + INTERROGATION.x1) / 2 - 1.5, z: 51.5 });
  /**
   * The hanging rig's geometry, written down once so the chain, the hook and
   * his ankles are all derived from the same numbers instead of authored
   * separately and hoped at.
   *
   * `XXX_BODY_Y` is the y his figure group has always sat at (LAB_Y + 2.42);
   * it is spelled out because `hang` now pivots at the hook and the figure's
   * offset inside it has to reproduce exactly the same world position.
   */
  const XXX_FACING = Math.PI / 2;           // +Z local -> world +X, i.e. at the stair
  const CHAIN_OFFSET = 0.26;                // he hangs this far in front of the chain
  const XXX_BODY_Y = LAB_Y + 2.42;
  const HOOK_Y = LAB_CEIL - 0.25;           // the top link's centre: the pivot
  const CHAIN_AT = Object.freeze({
    x: XXX_AT.x - CHAIN_OFFSET * Math.sin(XXX_FACING),
    z: XXX_AT.z - CHAIN_OFFSET * Math.cos(XXX_FACING),
  });

  function buildXxx() {
    const skin = 0xb98a63;
    const denim = M_DENIM;
    const tank = 0x141417;

    const fig = new Figure({
      skin,
      coat: tank,
      shirt: tank,
      tie: tank,
      hair: skin,
      hairStyle: 'crop',
      bulk: 1.34,
      height: 0.94,
      browHeavy: true,
      lidHeavy: true,
      iris: 0x7d8f9a,
      lipTone: 0x8a5346,
    });

    /* His lip opens a shade less wide than the rest of the roster's, and did
     * before this: the bespoke talk block that drives him (he is upside down
     * and never goes through `Figure.update`) used 2.2 where the shared one
     * uses 2.4. Kept to the number, because moving it would be restyling a
     * character to tidy a constant. */
    fig.voiceMouth.openScale = 2.2;

    /* Bald. Remove rather than hide, so nothing can turn it back on. */
    const doomed = [];
    fig.head.traverse((o) => { if (o.name?.startsWith('sf.hair.')) doomed.push(o); });
    for (const o of doomed) o.parent?.remove(o);

    const lam = (colour, extra = {}) => new THREE.MeshLambertMaterial({ color: colour, ...extra });
    const denimMat = lam(denim);
    const denimDark = lam(0x1e3049);
    const skinMat = lam(skin);
    const tankMat = lam(tank);
    const bloodMat = lam(0x3a0b0e);

    // Jeans: thighs and shins. The shoes stay as they were built.
    for (const leg of [fig.legL, fig.legR]) {
      const thigh = leg.hip.children.find((c) => c.isMesh);
      const shin = leg.knee.children.find((c) => c.isMesh);
      if (thigh) thigh.material = denimMat;
      if (shin) shin.material = denimMat;
    }
    const hips = fig.pelvis.children.find((c) => c.isMesh);
    if (hips) hips.material = denimMat;

    /* Tank top: keep the chest and the front panel, lose the tie and the
     * lapels, and put the collar band back to skin so the traps show. */
    const torsoMeshes = fig.torso.children.filter((c) => c.isMesh);
    const [chest, front, tie, lapelA, lapelB, collar] = torsoMeshes;
    if (chest) chest.material = tankMat;
    if (front) front.material = tankMat;
    for (const m of [tie, lapelA, lapelB]) if (m) m.visible = false;
    if (collar) collar.material = skinMat;

    // Bare arms.
    for (const arm of [fig.armL, fig.armR]) {
      for (const part of [arm.shoulder, arm.elbow]) {
        const m = part.children.find((c) => c.isMesh);
        if (m) m.material = skinMat;
      }
    }
    // Tank straps over the shoulders, and bare upper chest between them.
    const bw = 0.52 * 1.34;
    const bd = 0.3 * 1.34;
    for (const sx of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, bd * 1.02), tankMat);
      strap.position.set(sx * bw * 0.3, 0.55 * 0.94, 0);
      fig.torso.add(strap);
    }
    const bareChest = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.34, 0.16, 0.03), skinMat);
    bareChest.position.set(0, 0.55 * 0.94, bd * 0.52);
    fig.torso.add(bareChest);
    // A thicker neck than the rig ships with.
    const neckStub = fig.head.children.find((c) => c.name === 'sf.face.neck');
    if (neckStub) neckStub.scale.set(1.55, 1.5, 1.4);

    /* ---- Torn and bloodied. The tears are skin showing through the cloth;
     * the stains are on both garments and on him. */
    const tears = [
      [bw * 0.22, 0.3 * 0.94, bd * 0.52, 0.1, 0.14],
      [-bw * 0.3, 0.16 * 0.94, bd * 0.52, 0.07, 0.2],
    ];
    for (const [px, py, pz, w, h] of tears) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), skinMat);
      t.position.set(px, py, pz);
      fig.torso.add(t);
    }
    const gore = [
      [fig.torso, 0.05, 0.34 * 0.94, bd * 0.53, 0.26, 0.3],
      [fig.torso, -bw * 0.24, 0.14 * 0.94, bd * 0.53, 0.16, 0.22],
      [fig.legR.hip, 0.02, -0.24, 0.11, 0.13, 0.24],
      [fig.legL.knee, -0.01, -0.2, 0.1, 0.1, 0.18],
    ];
    for (const [parent, px, py, pz, w, h] of gore) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.015), bloodMat);
      m.position.set(px, py, pz);
      parent.add(m);
    }
    // The face: a closed swollen eye, a split brow, blood off the hairline.
    const swelling = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.016), lam(0x7a4436));
    swelling.position.set(0.056 * 1.34, 0.213, 0.122);
    fig.head.add(swelling);
    const browCut = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.016), bloodMat);
    browCut.position.set(-0.05 * 1.34, 0.252, 0.121);
    fig.head.add(browCut);
    const faceBlood = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.012), bloodMat);
    faceBlood.position.set(-0.05 * 1.34, 0.19, 0.122);
    fig.head.add(faceBlood);
    const lipBlood = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.012), bloodMat);
    lipBlood.position.set(0.02, 0.09, 0.117);
    fig.head.add(lipBlood);

    /* ---- Hang him.
     *
     * `hang` is not a marker at his feet any more: its ORIGIN IS THE HOOK.
     * That is the whole fix for "the chain is floating around". The chain,
     * the shackle, the ropes and the man are all children of one group whose
     * pivot is the point the chain hangs from, so the swing is a real
     * pendulum about a real anchor and nothing in the rig can drift relative
     * to anything else -- it is one rigid body plus one rotation.
     *
     * What it replaced: the chain was a root-level group holding links at
     * absolute world coordinates, and update() rotated that group about the
     * WORLD ORIGIN. At 56.5 m from (0,0) a 0.0275 rad idle sway swept the
     * chain 1.56 m sideways, off the hook, off the man, and out over the
     * torture table.
     *
     * He hangs CHAIN_OFFSET forward of the chain line, so the chain drops
     * clear behind his heels instead of through his boots.
     */
    const hang = group('xXx');
    hang.position.set(CHAIN_AT.x, HOOK_Y, CHAIN_AT.z);
    hang.rotation.y = XXX_FACING; // his face (+Z local) back toward the stair
    root.add(hang);
    fig.group.rotation.z = Math.PI;
    fig.group.position.set(0, XXX_BODY_Y - HOOK_Y, CHAIN_OFFSET);
    hang.add(fig.group);

    // Arms dangling toward the floor, i.e. "up" in his own inverted frame.
    for (const [arm, side] of [[fig.armL, -1], [fig.armR, 1]]) {
      arm.shoulder.rotation.x = 2.72;
      arm.shoulder.rotation.z = side * 0.16;
      arm.elbow.rotation.x = -0.34;
    }
    // Ankles together, knees very slightly apart: the rope did that.
    fig.legL.hip.rotation.z = 0.05;
    fig.legR.hip.rotation.z = -0.05;
    fig.legL.knee.rotation.x = 0.12;
    fig.legR.knee.rotation.x = 0.09;
    fig.torso.rotation.x = 0.1;
    fig.neck.rotation.x = -0.24;

    /* ---- The rig, measured rather than authored.
     *
     * Everything from here down is derived from where his shins ACTUALLY end
     * once the pose above has been applied, read off the built matrices. The
     * old version guessed: the chain ran LAB_CEIL-0.16 down to LAB_CEIL-0.70
     * and the ankles are at LAB_Y+2.37, so it stopped 0.15 m short of him,
     * and the two "ropes" were spread along world X while his ankles are
     * spread along world Z, i.e. ninety degrees out.
     */
    hang.updateWorldMatrix(true, true);
    const localOf = (o, x, y, z) => hang.worldToLocal(o.localToWorld(new THREE.Vector3(x, y, z)));
    // The bottom of each shin box is the ankle; the sole of each boot is the
    // highest thing on him, because he is the wrong way up.
    const ankles = [fig.legL, fig.legR].map((leg) => localOf(leg.knee, 0, -0.37, 0));
    const soleTop = Math.max(
      localOf(fig.legL.knee, 0, -0.42, 0.06).y,
      localOf(fig.legR.knee, 0, -0.42, 0.06).y,
    );

    // A steel plate bolted flat to the soffit, and the eye under it.
    root.add(box({
      size: [0.52, 0.08, 0.2],
      pos: [CHAIN_AT.x, LAB_CEIL - 0.04, CHAIN_AT.z],
      mat: M_STEEL_DULL,
      cast: false,
      name: 'xxx-hook-plate',
    }));
    const EYE_R = 0.07;
    const EYE_T = 0.022;
    const eye = new THREE.Mesh(new THREE.TorusGeometry(EYE_R, EYE_T, 8, 20), M_STEEL);
    eye.position.set(CHAIN_AT.x, LAB_CEIL - 0.08 - EYE_R - EYE_T, CHAIN_AT.z);
    eye.rotation.y = XXX_FACING + Math.PI / 2; // across the top link's own plane
    eye.castShadow = false;
    eye.name = 'xxx-hook-eye';
    root.add(eye);

    /* The chain. Interlocking links, alternating quarter turns, the first
     * one centred exactly on `hang`'s origin -- which is a fixed point of
     * the swing, so it can never come off the eye -- and the last one landing
     * exactly on the top face of the shackle bar. */
    const LINK_R = 0.055;
    const LINK_T = 0.017;
    const LINK_OUT = LINK_R + LINK_T;
    const BAR_H = 0.06;
    const barY = soleTop + 0.06; // clear over the boots
    const lastY = barY + BAR_H / 2 + LINK_OUT;
    const links = Math.max(2, Math.round(-lastY / 0.062) + 1);
    const pitch = -lastY / (links - 1); // < 2*(LINK_R - LINK_T), so they interlock
    const chain = group('xxx-chain');
    hang.add(chain);
    for (let i = 0; i < links; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(LINK_R, LINK_T, 6, 16), M_STEEL_DULL);
      link.position.set(0, -pitch * i, 0);
      link.rotation.y = (i % 2) * (Math.PI / 2);
      link.castShadow = false;
      link.name = 'xxx-chain-link';
      chain.add(link);
    }

    /* The shackle: a spreader bar on the end of the chain, a cord off each
     * end of it, and a steel cuff round each ankle. The cords pass behind
     * his heels, which is why the chain line is offset forward of him. */
    const shackle = group('xxx-shackle');
    hang.add(shackle);
    shackle.add(box({
      size: [0.4, BAR_H, 0.09], pos: [0, barY, 0], mat: M_STEEL, cast: false, name: 'xxx-shackle-bar',
    }));
    const ropeMat = mat({ color: 0x6a5a3c, roughness: 0.95 });
    const up = new THREE.Vector3(0, 1, 0);
    for (const a of ankles) {
      const cuffY = a.y - 0.10;
      const cuff = cylinder({
        r: 0.155, h: 0.08, pos: [a.x, cuffY, a.z], mat: M_STEEL, cast: false,
      });
      cuff.name = 'xxx-ankle-cuff'; // build.js's cylinder() takes no name
      shackle.add(cuff);
      const from = new THREE.Vector3(Math.sign(a.x) * 0.17, barY - BAR_H / 2, 0);
      const to = new THREE.Vector3(a.x, cuffY + 0.02, a.z - 0.13);
      const d = to.clone().sub(from);
      const cord = cylinder({ r: 0.024, h: d.length(), pos: [0, 0, 0], mat: ropeMat, cast: false });
      cord.quaternion.setFromUnitVectors(up, d.clone().normalize());
      cord.position.copy(from).add(to).multiplyScalar(0.5);
      cord.name = 'xxx-ankle-rope';
      shackle.add(cord);
    }
    /** What the chain spans, in world y. Reported, so it can be asserted. */
    const chainSpan = {
      hook: HOOK_Y + LINK_OUT,
      bar: HOOK_Y + barY,
      ankleY: HOOK_Y + ankles[0].y,
    };

    /* ---- The pool of blood he is hanging over. Large, still wet, and
     * ON THE FLOOR.
     *
     * It was authored at LAB_Y + 0.011 and the lower level's floor finish
     * tops out at LAB_Y + 0.012, so the whole thing -- pool, rim and the
     * seven spatters round it -- was one millimetre under the slab and had
     * never once been visible. Four overlapping discs at four heights rather
     * than one circle, so it reads as something that ran rather than
     * something that was drawn with a compass. */
    const poolMat = mat({ color: 0x3d080c, roughness: 0.2, metalness: 0.06, unique: true });
    const poolRim = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.52, 28),
      mat({
        color: 0x2a0709, roughness: 0.55, transparent: true, opacity: 0.62, unique: true,
      }),
    );
    poolRim.rotation.x = -Math.PI / 2;
    poolRim.position.set(XXX_AT.x, LAB_FLOOR + 0.005, XXX_AT.z);
    poolRim.name = 'xxx-blood-pool-rim';
    root.add(poolRim);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.15, 28), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(XXX_AT.x, LAB_FLOOR + 0.008, XXX_AT.z);
    pool.name = 'xxx-blood-pool';
    root.add(pool);
    // Lobes: where it spread further, including toward the drainage channel.
    for (const [lx, lz, lr, ly] of [
      [0.62, 0.34, 0.72, 0.011], [-0.48, -0.55, 0.6, 0.014], [0.18, 0.86, 0.55, 0.017],
    ]) {
      const lobe = new THREE.Mesh(new THREE.CircleGeometry(lr, 20), poolMat);
      lobe.rotation.x = -Math.PI / 2;
      lobe.position.set(XXX_AT.x + lx, LAB_FLOOR + ly, XXX_AT.z + lz);
      lobe.name = 'xxx-blood-pool-lobe';
      root.add(lobe);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.6;
      stain(XXX_AT.x + Math.cos(a) * (1.5 + (i % 3) * 0.4),
        XXX_AT.z + Math.sin(a) * (1.5 + (i % 3) * 0.4), LAB_FLOOR, 0.7, 30 + i, 0.55);
    }
    // A drip, mid-air, permanently about to land. Moved in update().
    const drip = sphere({
      r: 0.022, pos: [XXX_AT.x, LAB_Y + 0.4, XXX_AT.z], mat: M_BLOOD, cast: false,
    });
    drip.name = 'xxx-drip'; // build.js's sphere() takes no name
    root.add(drip);

    /* A generous hit volume, so aiming at a man reads as aiming at a man
     * rather than as threading a crosshair between a forearm and a rope.
     * Sized to the body he actually has: soles at LAB_Y + 2.42, knuckles at
     * LAB_Y + 0.25. */
    const aim = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.5, 1.1),
      mat({
        color: 0x000000, transparent: true, opacity: 0, depthWrite: false, unique: true,
      }),
    );
    aim.position.set(XXX_AT.x, LAB_Y + 1.5, XXX_AT.z);
    aim.name = 'xxx-aim';
    root.add(aim);

    return {
      fig, hang, chain, shackle, pool, drip, aim, hookY: HOOK_Y, chainSpan,
    };
  }
  const xxx = buildXxx();

  /* ================================================================== */
  /* BEAT 5a -- THE OBSERVATION AREA                                     */
  /*                                                                      */
  /* "consoles, security monitors, intercom, gas controls, emergency      */
  /* shutdown, a large mechanical door lock, a numeric keypad beside the  */
  /* door, purple status lights, thick cable bundles running into the     */
  /* lab."                                                                */
  /*                                                                        */
  /* Everything the player touches for the whole rest of the mission is in  */
  /* this room, and the glass is on the room's south side, so every one of  */
  /* those actions is performed looking at the people it happens to.        */
  /* ================================================================== */
  const monitorState = { purple: false };

  function buildObservation() {
    const R = OBSERVATION;
    const G = GLASS_WALL;
    const consoleZ = G.z1 + 0.62;
    const deskY = LAB_Y + 0.92;

    /* ---- The console, in TWO banks with a clear lane between them.
     *
     * See the note on GLASS_DOOR: one continuous console the width of the
     * glass reads well in a screenshot and seals the door shut in a game.
     * The lane between the banks contains the transfer drawer, the door and
     * the door lock, and nothing stands in it. */
    const monitors = [];
    const statusLights = [];
    const kinds = ['trace', 'bars', 'text', 'grid', 'trace', 'text', 'bars', 'grid', 'grid'];
    let monitorIndex = 0;
    for (const bank of CONSOLE_BANKS) {
      const bw = bank.x1 - bank.x0;
      const bmid = (bank.x0 + bank.x1) / 2;
      root.add(box({
        size: [bw, 0.04, 1.0], pos: [bmid, deskY, consoleZ], mat: M_STEEL_DULL,
      }));
      const piers = Math.max(2, Math.round(bw / 1.2));
      for (let i = 0; i <= piers; i++) {
        root.add(box({
          size: [0.08, 0.92, 0.9],
          pos: [bank.x0 + (bw * i) / piers, LAB_Y + 0.46, consoleZ],
          mat: M_STEEL_DULL,
        }));
      }
      prop(bank.x0, bank.x1, LAB_Y, deskY + 0.04, consoleZ - 0.5, consoleZ + 0.5);

      /* ---- The gantry the screens are actually mounted on.
       *
       * Nine monitors and a dozen lamps used to hang in the air between 0.4
       * and 2.0 m above the desk with nothing under, behind or over them.
       * Two posts per bank off the desk top, a rail at each screen row and a
       * lamp rail over the lot: it reads as a control-room screen wall and,
       * more to the point, it holds them up. All of it sits SOUTH of the
       * screens, so from where a player stands it is hidden behind them. */
      const ROW_Y = [LAB_Y + 1.62, LAB_Y + 2.14];
      const LAMP_Y = LAB_Y + 2.86;
      const gantryZ = consoleZ - 0.01;
      for (const px of [bank.x0 - 0.05, bank.x1 + 0.05]) {
        root.add(box({
          size: [0.09, LAMP_Y + 0.09 - (deskY + 0.02), 0.24],
          pos: [px, (deskY + 0.02 + LAMP_Y + 0.09) / 2, gantryZ],
          mat: M_STEEL_DULL,
          cast: false,
          name: 'ss-console-gantry-post',
        }));
      }
      for (const ry of ROW_Y) {
        root.add(box({
          size: [bw + 0.2, 0.07, 0.08], pos: [bmid, ry, consoleZ - 0.06], mat: M_STEEL_DULL, cast: false, name: 'ss-monitor-rail',
        }));
      }
      root.add(box({
        size: [bw + 0.2, 0.1, 0.14], pos: [bmid, LAMP_Y, consoleZ + 0.05], mat: M_STEEL_DULL, cast: false, name: 'ss-status-rail',
      }));

      /* Monitors. Each owns a unique material so `setPurple()` is one pass
       * over a list rather than nine special cases.
       *
       * OWNER, 2026-08-04: "the screens outside of it should be turned around
       * and facing us instead of in the lab." They were: the emissive plate
       * was at consoleZ - 0.05 and the opaque casing at consoleZ + 0.12, so
       * from the observation floor -- which is NORTH of the desk, at higher z
       * -- you were looking at nine black boxes, and the only place the
       * pictures could be read from was inside the sealed lab. The plate is
       * now on the north face of its casing. */
      const count = Math.max(3, Math.round(bw / 0.72));
      for (let i = 0; i < count; i++) {
        const mx = bank.x0 + 0.4 + (i * (bw - 0.8)) / Math.max(1, count - 1);
        const my = LAB_Y + 1.62 + (i % 2 ? 0.0 : 0.52);
        root.add(box({
          size: [0.62, 0.5, 0.3], pos: [mx, my, consoleZ + 0.12], mat: M_BLACK, cast: false, name: 'ss-monitor-case',
        }));
        const kind = kinds[monitorIndex % kinds.length];
        monitorIndex++;
        const texRed = monitorTexture(kind, '#ff4438');
        const texPurple = monitorTexture(kind, '#b06cff');
        const face = box({
          size: [0.54, 0.42, 0.02],
          pos: [mx, my, consoleZ + 0.29],
          mat: mat({
            map: texRed, emissive: 0xffffff, emissiveMap: texRed, emissiveIntensity: 0.85, roughness: 0.5, unique: true,
          }),
          cast: false,
          name: 'ss-monitor-face',
        });
        root.add(face);
        monitors.push({ face, texRed, texPurple });
      }

      /* Keyboards along the desk -- on the operator's edge, tilted up toward
       * him. They were on the far edge, tilted away, which is a keyboard for
       * somebody standing inside the laboratory. */
      const kbs = Math.max(1, Math.round(bw / 1.3));
      for (let i = 0; i < kbs; i++) {
        const kx = bank.x0 + 0.45 + (i * (bw - 0.9)) / Math.max(1, kbs - 1);
        root.add(box({
          size: [0.5, 0.035, 0.2], pos: [kx, deskY + 0.04, consoleZ + 0.3], mat: M_BLACK, cast: false, rotX: 0.12, name: 'ss-keyboard',
        }));
        /* Three ridges, not twenty-seven keycaps. At the distance anybody
         * ever stands from this desk the ridges read as a keyboard and the
         * keycaps read as a hundred draw calls. */
        for (let r = 0; r < 3; r++) {
          root.add(box({
            size: [0.44, 0.01, 0.03],
            pos: [kx, deskY + 0.058 + r * 0.004, consoleZ + 0.35 - r * 0.045],
            mat: M_STEEL_DULL,
            cast: false,
          }));
        }
      }

      // Purple status lights, on the lamp rail over the head of each bank.
      const lamps = Math.max(3, Math.round(bw / 0.6));
      for (let i = 0; i < lamps; i++) {
        const sx = bank.x0 + 0.25 + (i * (bw - 0.5)) / Math.max(1, lamps - 1);
        const l = box({
          size: [0.1, 0.06, 0.05], pos: [sx, LAMP_Y, consoleZ + 0.115], mat: M_PURPLE_LAMP, cast: false, name: 'ss-status-lamp',
        });
        root.add(l);
        statusLights.push(l);
      }
    }

    /* LIFE SIGNS, on the head beam over the lane, where it is unavoidable
     * from the door and from the Silent Night pedestal both.
     *
     * Same fault as the console monitors, and the same fix: the readout was
     * at GLASS_WALL.z1 + 0.02 with its own casing at + 0.14, so the number
     * Booski reads out loud at the end of beat 10 was facing the corpses. It
     * is on the north face of the casing now, and the casing's back sits
     * against the glass head beam instead of 20 mm off it. */
    const lifeY = LAB_Y + 2.78;
    const lifeX = (GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2;
    const lifeFace = box({
      size: [0.8, 0.6, 0.02],
      pos: [lifeX, lifeY, GLASS_WALL.z1 + 0.255],
      mat: mat({
        map: lifeSignsTexture(6, '#ff4438'), emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.5, unique: true,
      }),
      cast: false,
      name: 'ss-life-signs-face',
    });
    lifeFace.material.emissiveMap = lifeFace.material.map;
    root.add(box({
      size: [0.9, 0.7, 0.24], pos: [lifeX, lifeY, GLASS_WALL.z1 + 0.12], mat: M_BLACK, cast: false, name: 'ss-life-signs-case',
    }));
    root.add(lifeFace);
    light(0x7a2ee8, 3.0, 9, (R.x0 + R.x1) / 2, LAB_Y + 2.8, consoleZ);
    light(0x7a2ee8, 2.2, 7, R.x0 + 1.6, LAB_Y + 2.8, consoleZ);
    light(0x7a2ee8, 2.2, 7, R.x1 - 1.6, LAB_Y + 2.8, consoleZ);

    /* ---- Thick cable bundles, running from the console into the lab
     * through ducts in the plinth. Kept out of the door lane like everything
     * else on this wall. */
    for (const bx of [R.x0 + 1.0, R.x0 + 1.9, R.x1 - 1.0, R.x1 - 2.0]) {
      root.add(cylinder({
        r: 0.11, h: 1.1, pos: [bx, LAB_Y + 0.55, consoleZ - 0.55], rotX: Math.PI / 2.4, mat: M_RUBBER, cast: false,
      }));
      /* The duct at the plinth face is where the bundle actually goes; it
       * used to be 0.25 m under the end of the bundle it was collecting. */
      root.add(box({
        size: [0.34, 0.3, 0.14], pos: [bx, LAB_Y + 0.5, G.z1 + 0.05], mat: M_STEEL_DULL, cast: false, name: 'ss-cable-duct',
      }));
      // The loose run lies ON the floor rather than 0.21 m above it.
      for (let j = 0; j < 5; j++) {
        root.add(cylinder({
          r: 0.03,
          h: 1.3,
          pos: [bx - 0.1 + j * 0.05, LAB_FLOOR + 0.03, consoleZ - 0.1],
          rotX: Math.PI / 2,
          mat: j % 2 ? M_RUBBER : M_PIPE_RED,
          cast: false,
        }));
      }
    }

    /* ---- The intercom, on a stalk at the middle of the console. */
    const intercom = group('ss-intercom');
    intercom.position.set(CONSOLE_BANKS[1].x0 + 0.6, deskY, consoleZ - 0.1);
    root.add(intercom);
    intercom.add(cylinder({ r: 0.03, h: 0.42, pos: [0, 0.21, 0], mat: M_STEEL_DULL }));
    intercom.add(box({ size: [0.26, 0.2, 0.14], pos: [0, 0.5, 0.02], mat: M_BLACK }));
    intercom.add(box({
      size: [0.2, 0.12, 0.01], pos: [0, 0.53, 0.095], mat: M_STEEL_DULL, cast: false,
    }));
    const intercomLamp = box({
      size: [0.05, 0.03, 0.02], pos: [0.09, 0.42, 0.09], mat: M_RED_LAMP, cast: false,
    });
    intercom.add(intercomLamp);

    /* ---- Gas controls: a valve bank with gauges, clearly labelled, and
     * clearly not something anybody put here by accident. */
    /* Hard against the north wall. It used to hang 0.28 m off it -- a
     * 1.5 x 1.3 m steel panel floating in the middle of the room with its
     * back showing. Its front (local +z, and the group is turned through
     * pi) still faces south, into the room, which is right. */
    const gasPanel = group('ss-gas-controls');
    gasPanel.position.set(R.x0 + 1.4, LAB_Y, R.z1 - 0.08);
    gasPanel.rotation.y = Math.PI;
    root.add(gasPanel);
    gasPanel.add(box({ size: [1.5, 1.3, 0.16], pos: [0, 1.5, 0], mat: M_STEEL_DULL }));
    prop(R.x0 + 0.6, R.x0 + 2.2, LAB_Y, LAB_Y + 2.2, R.z1 - 0.26, R.z1);
    for (let i = 0; i < 3; i++) {
      gasPanel.add(cylinder({
        r: 0.14, h: 0.06, pos: [-0.45 + i * 0.45, 1.85, 0.1], rotX: Math.PI / 2, mat: M_STEEL,
      }));
      gasPanel.add(cylinder({
        r: 0.12, h: 0.02, pos: [-0.45 + i * 0.45, 1.85, 0.14], rotX: Math.PI / 2, mat: M_SCREEN_OFF, cast: false,
      }));
      gasPanel.add(box({
        size: [0.02, 0.09, 0.01], pos: [-0.45 + i * 0.45, 1.89, 0.155], mat: M_RED_LAMP, rotZ: -0.5 + i * 0.4, cast: false,
      }));
    }
    for (let i = 0; i < 4; i++) {
      gasPanel.add(cylinder({
        r: 0.09, h: 0.05, pos: [-0.52 + i * 0.35, 1.28, 0.11], rotX: Math.PI / 2, mat: M_PIPE_RED,
      }));
      gasPanel.add(box({
        size: [0.02, 0.16, 0.02], pos: [-0.52 + i * 0.35, 1.28, 0.14], mat: M_STEEL, rotZ: i * 0.7, cast: false,
      }));
    }
    const gasLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.2),
      mat({
        map: printed('silent.label.gas', ['VENTILATION / DISPERSAL'], {
          w: 512, h: 84, bg: '#151512', fg: '#c8c2a4', font: '900 34px "Trebuchet MS", sans-serif',
        }),
        roughness: 0.8,
        unique: true,
      }),
    );
    gasLabel.position.set(0, 2.05, 0.09);
    gasPanel.add(gasLabel);

    /* ---- Emergency shutdown: a mushroom head under a wire guard. */
    const estop = group('ss-estop');
    // Back plate flush on the north wall, not 0.27 m out in front of it.
    estop.position.set(R.x0 + 3.2, LAB_Y + 1.5, R.z1 - 0.07);
    root.add(estop);
    estop.add(box({ size: [0.34, 0.34, 0.14], pos: [0, 0, 0], mat: M_STEEL_DULL }));
    estop.add(cylinder({ r: 0.11, h: 0.09, pos: [0, 0, -0.11], rotX: Math.PI / 2, mat: mat({ color: 0xb01c14, roughness: 0.5 }) }));
    for (const sx of [-0.16, 0.16]) {
      estop.add(cylinder({ r: 0.012, h: 0.3, pos: [sx, 0, -0.14], rotX: Math.PI / 2, mat: M_STEEL, cast: false }));
    }
    estop.add(box({ size: [0.36, 0.02, 0.02], pos: [0, 0.16, -0.27], mat: M_STEEL, cast: false }));

    /* ---- The mechanical door lock: a wheel and a throw lever on the jamb
     * east of the glass door, and the keypad beside it. */
    /* The lock post and the keypad live in the lane, hard against the east
     * jamb, between the door and console bank B. */
    const lockX = GLASS_DOOR.x1 + 0.55;
    const lockPost = group('ss-door-lock');
    lockPost.position.set(lockX, LAB_Y, G.z1 + 0.1);
    root.add(lockPost);
    lockPost.add(box({ size: [0.6, 2.3, 0.22], pos: [0, 1.15, 0], mat: M_STEEL_DULL }));
    prop(lockX - 0.32, lockX + 0.32, LAB_Y, LAB_Y + 2.3, G.z1, G.z1 + 0.24);
    const lockWheel = group('ss-lock-wheel');
    lockWheel.position.set(0, 1.62, 0.16);
    lockPost.add(lockWheel);
    lockWheel.add(cylinder({ r: 0.21, h: 0.04, pos: [0, 0, 0], rotX: Math.PI / 2, mat: M_STEEL }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      lockWheel.add(box({
        size: [0.04, 0.34, 0.03], pos: [0, 0, 0.02], rotZ: a, mat: M_STEEL, cast: false,
      }));
    }
    lockWheel.add(cylinder({ r: 0.06, h: 0.09, pos: [0, 0, 0.05], rotX: Math.PI / 2, mat: M_STEEL_DULL }));
    const lockLever = box({
      size: [0.07, 0.4, 0.07], pos: [0, 0.95, 0.18], mat: M_PIPE_RED,
    });
    lockPost.add(lockLever);

    /* The keypad. Twelve keys, a four-character display, and a lamp. */
    const keypad = group('ss-keypad');
    keypad.position.set(lockX + 0.44, LAB_Y + 1.34, G.z1 + 0.12);
    keypad.rotation.y = -0.45;
    root.add(keypad);
    keypad.add(box({ size: [0.3, 0.42, 0.1], pos: [0, 0, 0], mat: M_STEEL_DULL }));
    const keypadScreen = box({
      size: [0.22, 0.08, 0.01], pos: [0, 0.14, 0.055], mat: M_SCREEN_OFF, cast: false,
    });
    keypad.add(keypadScreen);
    const keypadDisplay = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.07),
      mat({
        map: printed('silent.keypad.blank', ['- - - -'], {
          w: 256, h: 90, bg: '#04070a', fg: '#3ce85e', font: '900 46px "Courier New", monospace',
        }),
        emissive: 0x1a4a22,
        roughness: 0.6,
        unique: true,
      }),
    );
    // 0.066, not 0.061: the bezel behind it ends at 0.060, and half a
    // millimetre of separation is a flickering display, not a display.
    keypadDisplay.position.set(0, 0.14, 0.066);
    keypad.add(keypadDisplay);
    for (let r = 0; r < 4; r++) {
      keypad.add(box({
        size: [0.2, 0.04, 0.02], pos: [0, 0.02 - r * 0.055, 0.055], mat: M_BLACK, cast: false,
      }));
    }
    const keypadLamp = box({
      size: [0.05, 0.03, 0.015], pos: [0.1, 0.185, 0.055], mat: M_RED_LAMP, cast: false,
    });
    keypad.add(keypadLamp);
    const keypadTarget = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.7, 0.5),
      mat({
        color: 0x000000, transparent: true, opacity: 0, depthWrite: false, unique: true,
      }),
    );
    keypadTarget.position.set(0, 0, 0.2);
    keypad.add(keypadTarget);

    /* ---- The transfer drawer, in the glass wall's plinth west of the door.
     * A steel tray on a motorised carriage that runs from this side to the
     * other. Beat 6 puts the container in it. */
    /* The drawer sits on the plinth on the WEST side of the lane, with clear
     * floor in front of it and console bank A stopping short of it.
     *
     * ON the plinth, not straddling it: centred in the wall its 0.42 m
     * carcass filled the exact volume the sliding leaf travels through, so
     * opening the door drove two square metres of glass and steel straight
     * through the transfer drawer. Its back now seats on the plinth's north
     * face at G.z1 and the tray still runs the full DRAWER_THROW into the
     * lab, which is the only part of it that has to cross the wall. */
    const drawerX = GLASS_DOOR.x0 - 0.55;
    const drawerFrame = group('ss-transfer-drawer');
    drawerFrame.position.set(drawerX, LAB_Y + 0.28, G.z1 + 0.22);
    root.add(drawerFrame);
    drawerFrame.add(box({ size: [0.9, 0.5, 0.42], pos: [0, 0, 0], mat: M_STEEL_DULL }));
    drawerFrame.add(box({ size: [0.78, 0.34, 0.06], pos: [0, 0, 0.2], mat: M_BLACK, cast: false }));
    drawerFrame.add(box({ size: [0.78, 0.34, 0.06], pos: [0, 0, -0.2], mat: M_BLACK, cast: false }));
    const drawerTray = group('ss-transfer-tray');
    drawerFrame.add(drawerTray);
    drawerTray.add(box({ size: [0.66, 0.05, 0.34], pos: [0, -0.12, 0], mat: M_STEEL }));
    for (const sx of [-0.33, 0.33]) {
      drawerTray.add(box({ size: [0.04, 0.18, 0.34], pos: [sx, -0.03, 0], mat: M_STEEL, cast: false }));
    }
    drawerTray.add(box({ size: [0.72, 0.3, 0.05], pos: [0, 0, 0.22], mat: M_STEEL_DULL, cast: false }));
    drawerTray.add(cylinder({
      r: 0.02, h: 0.24, pos: [0, 0.02, 0.26], rotZ: Math.PI / 2, mat: M_STEEL, cast: false,
    }));
    const drawerLamp = box({
      size: [0.06, 0.04, 0.02], pos: [0.38, 0.18, 0.22], mat: M_PURPLE_LAMP, cast: false,
    });
    drawerFrame.add(drawerLamp);
    const drawerTarget = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.8, 0.8),
      mat({
        color: 0x000000, transparent: true, opacity: 0, depthWrite: false, unique: true,
      }),
    );
    drawerTarget.position.set(0, 0.1, 0.35);
    drawerFrame.add(drawerTarget);
    /* WHERE THE CASE IS SET DOWN, as opposed to what the player POINTS AT to
     * set it down. The mission was placing it at `targets.drawer`, which is
     * this aim box on the wall frame — so the delivered case appeared
     * floating in the masonry beside the drawer instead of on the table
     * Booski opens it on. An empty on the table top, so it moves with the
     * table and cannot be read as anything to click. */
    const tableSpot = new THREE.Object3D();
    tableSpot.name = 'ss-transfer-table-spot';

    /* ---- The transfer table: where Booski opens the case. Squared up to
     * the glass, so the case's own glow lands on the pane. */
    const tableX = CONSOLE_BANKS[0].x0 + 1.1;
    const tableZ = G.z1 + 2.1;
    root.add(box({ size: [1.5, 0.06, 0.8], pos: [tableX, LAB_Y + 0.94, tableZ], mat: M_STEEL }));
    for (const [lx, lz] of [[-0.66, -0.32], [0.66, -0.32], [-0.66, 0.32], [0.66, 0.32]]) {
      root.add(box({ size: [0.06, 0.94, 0.06], pos: [tableX + lx, LAB_Y + 0.47, tableZ + lz], mat: M_STEEL_DULL }));
    }
    prop(tableX - 0.78, tableX + 0.78, LAB_Y, LAB_Y + 0.98, tableZ - 0.44, tableZ + 0.44);
    /* On the top, a little toward the glass, so the case's own glow lands on
     * the pane and the six of them are looking at it through their side. */
    tableSpot.position.set(tableX, LAB_Y + 0.97, tableZ - 0.08);
    root.add(tableSpot);

    /* ---- SILENT NIGHT PROTOCOL. A lever under a red safety cover, on its
     * own pedestal, deliberately away from everything else on the console:
     * it is not something you reach for by accident, and beat 10 needs the
     * player to walk to it. */
    const snX = R.x1 - 1.5;
    const snZ = G.z1 + 2.3;
    const sn = group('ss-silent-night');
    sn.position.set(snX, LAB_Y, snZ);
    // Turned toward the corner a player actually walks in from (the
    // `silentNight` anchor, north-west of it) rather than away from it.
    sn.rotation.y = -0.45;
    root.add(sn);
    sn.add(box({ size: [0.7, 1.05, 0.5], pos: [0, 0.52, 0], mat: M_STEEL_DULL }));
    sn.add(box({ size: [0.78, 0.08, 0.58], pos: [0, 1.08, 0], mat: M_STEEL }));
    prop(snX - 0.42, snX + 0.42, LAB_Y, LAB_Y + 1.12, snZ - 0.34, snZ + 0.34);
    const snLever = group('ss-sn-lever');
    snLever.position.set(0, 1.1, 0.02);
    sn.add(snLever);
    snLever.add(cylinder({ r: 0.028, h: 0.42, pos: [0, 0.21, 0], mat: M_STEEL }));
    snLever.add(sphere({ r: 0.062, pos: [0, 0.44, 0], mat: mat({ color: 0xb01c14, roughness: 0.45 }) }));
    const snCover = group('ss-sn-cover');
    snCover.position.set(0, 1.12, -0.24);
    sn.add(snCover);
    snCover.add(box({
      size: [0.42, 0.03, 0.5],
      pos: [0, 0, 0.25],
      mat: mat({
        color: 0xb01c14, roughness: 0.4, transparent: true, opacity: 0.62, unique: true,
      }),
      cast: false,
    }));
    for (const sx of [-0.19, 0.19]) {
      snCover.add(box({ size: [0.03, 0.16, 0.5], pos: [sx, -0.08, 0.25], mat: mat({ color: 0xb01c14, roughness: 0.4 }), cast: false }));
    }
    const snPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.16),
      mat({
        map: printed('silent.label.protocol', ['SILENT NIGHT PROTOCOL'], {
          w: 512, h: 116, bg: '#1a0a08', fg: '#e8c268', font: '900 40px "Trebuchet MS", sans-serif', border: '#8a2018',
        }),
        emissive: 0x3a1a08,
        roughness: 0.7,
        unique: true,
      }),
    );
    snPlate.position.set(0, 0.86, 0.27);
    sn.add(snPlate);
    const snTarget = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.9, 0.8),
      mat({
        color: 0x000000, transparent: true, opacity: 0, depthWrite: false, unique: true,
      }),
    );
    snTarget.position.set(0, 1.3, 0.2);
    sn.add(snTarget);

    // Practical light in the room itself, so it is not lit only by screens.
    const obsTubes = [
      fluoro((R.x0 + R.x1) / 2 - 3.0, LAB_CEIL - 0.34, R.z0 + 3.4, { intensity: 5.0, range: 11, ceil: LAB_CEIL }),
      fluoro((R.x0 + R.x1) / 2 + 3.0, LAB_CEIL - 0.34, R.z0 + 3.4, { intensity: 5.0, range: 11, ceil: LAB_CEIL }),
      fluoro((R.x0 + R.x1) / 2, LAB_CEIL - 0.34, R.z1 - 1.4, { intensity: 4.4, range: 10, ceil: LAB_CEIL }),
    ];

    return {
      monitors,
      lifeFace,
      statusLights,
      intercom,
      intercomLamp,
      gasPanel,
      estop,
      lockPost,
      lockWheel,
      lockLever,
      keypad,
      keypadDisplay,
      keypadLamp,
      keypadTarget,
      drawerFrame,
      drawerTray,
      drawerLamp,
      drawerTarget,
      tableSpot,
      transferTable: { x: tableX, y: LAB_Y + 0.97, z: tableZ },
      silentNight: {
        group: sn, lever: snLever, cover: snCover, target: snTarget,
      },
      obsTubes,
      consoleZ,
      deskY,
    };
  }
  const obs = buildObservation();

  /* ================================================================== */
  /* BEAT 5b -- THE SEALED LAB                                           */
  /*                                                                      */
  /* "six steel workstations, robotic arms, chemical tanks, radiation     */
  /* symbols, purple coolant tubes, gold arcs, the central weapon         */
  /* assembly, ceiling vents, and emergency masks locked in an            */
  /* inaccessible cabinet."                                               */
  /*                                                                        */
  /* The masks are the cruellest object in the room and they are built to   */
  /* be seen and not reached: a glazed cabinet 3.1 m up a wall with no      */
  /* ladder, no bench under it, and a padlock on the front. Nothing in the  */
  /* room ever remarks on it.                                               */
  /* ================================================================== */
  const CORE_AT = Object.freeze({
    x: (SEALED_LAB.x0 + SEALED_LAB.x1) / 2, z: 44.4, y: LAB_Y,
  });

  function buildSealedLab() {
    const R = SEALED_LAB;
    const cx = (R.x0 + R.x1) / 2;

    // Floor: a lighter epoxy than the concrete outside, with hazard hatching
    // round the core. It should read as a different kind of room through
    // the glass, not merely a further one.
    const epoxy = mat({ color: 0x5e6a70, roughness: 0.45 });
    slab(R.x0, R.x1, LAB_Y + 0.02, R.z0, R.z1, epoxy, 'ss-lab-epoxy', 0.02);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      root.add(box({
        size: [0.5, 0.004, 0.14],
        pos: [CORE_AT.x + Math.cos(a) * 2.3, LAB_Y + 0.032, CORE_AT.z + Math.sin(a) * 2.3],
        mat: i % 2 ? mat({ color: 0xc8a41a, roughness: 0.7 }) : M_BLACK,
        rotY: -a,
        cast: false,
      }));
    }

    /* ---- Six workstations. Six, because there are six people, and the
     * mission counts both. */
    const stations = [];
    const layout = [
      [R.x0 + 1.7, R.z1 - 1.5, Math.PI],
      [R.x0 + 5.1, R.z1 - 1.5, Math.PI],
      [R.x1 - 1.7, R.z1 - 1.5, Math.PI],
      [R.x0 + 1.5, R.z0 + 2.6, 0],
      [cx, R.z0 + 1.4, 0],
      [R.x1 - 1.5, R.z0 + 2.6, 0],
    ];
    for (let i = 0; i < 6; i++) {
      const [sx, sz, rot] = layout[i];
      const g = group(`ss-station-${i}`);
      g.position.set(sx, LAB_Y, sz);
      g.rotation.y = rot;
      root.add(g);
      g.add(box({ size: [1.7, 0.06, 0.75], pos: [0, 0.92, 0], mat: M_STEEL }));
      g.add(box({ size: [1.6, 0.5, 0.06], pos: [0, 0.6, -0.32], mat: M_STEEL_DULL, cast: false }));
      for (const [lx, lz] of [[-0.78, -0.3], [0.78, -0.3], [-0.78, 0.3], [0.78, 0.3]]) {
        g.add(box({ size: [0.05, 0.92, 0.05], pos: [lx, 0.46, lz], mat: M_STEEL_DULL }));
      }
      prop(sx - 0.88, sx + 0.88, LAB_Y, LAB_Y + 0.96, sz - 0.42, sz + 0.42);
      // A screen, a rack of vials, and a stool.
      const scr = box({
        size: [0.5, 0.36, 0.02],
        pos: [-0.42, 1.3, -0.14],
        mat: mat({
          map: monitorTexture(i % 2 ? 'text' : 'trace', '#7cc8ff'),
          emissive: 0xffffff,
          emissiveIntensity: 0.7,
          roughness: 0.5,
          unique: true,
        }),
        cast: false,
      });
      scr.material.emissiveMap = scr.material.map;
      g.add(scr);
      g.add(box({ size: [0.56, 0.4, 0.2], pos: [-0.42, 1.3, -0.25], mat: M_BLACK, cast: false }));
      for (let v = 0; v < 3; v++) {
        g.add(cylinder({
          r: 0.022, h: 0.11, pos: [0.3 + v * 0.07, 1.01, -0.1], mat: M_COOLANT, cast: false,
        }));
      }
      g.add(cylinder({ r: 0.17, h: 0.05, pos: [0, 0.6, 0.72], mat: M_RUBBER }));
      g.add(cylinder({ r: 0.04, h: 0.6, pos: [0, 0.3, 0.72], mat: M_STEEL_DULL }));
      stations.push(g);
    }

    /* ---- Robotic arms: two on gantries over the core, one on a bench. */
    const arms = [];
    function roboticArm(x, y, z, scale = 1) {
      const g = group('ss-robot-arm');
      g.position.set(x, y, z);
      g.scale.setScalar(scale);
      root.add(g);
      g.add(cylinder({ r: 0.16, h: 0.12, pos: [0, 0, 0], mat: M_STEEL_DULL }));
      const j1 = group('j1');
      g.add(j1);
      j1.add(box({ size: [0.16, 0.8, 0.16], pos: [0, 0.4, 0], mat: mat({ color: 0xc8b03a, roughness: 0.5, metalness: 0.5 }) }));
      const j2 = group('j2');
      j2.position.y = 0.8;
      j1.add(j2);
      j2.add(box({ size: [0.13, 0.66, 0.13], pos: [0, 0.33, 0], mat: M_STEEL }));
      const j3 = group('j3');
      j3.position.y = 0.66;
      j2.add(j3);
      j3.add(box({ size: [0.09, 0.24, 0.09], pos: [0, 0.12, 0], mat: M_STEEL_DULL }));
      for (const sx of [-0.05, 0.05]) {
        j3.add(box({ size: [0.02, 0.14, 0.03], pos: [sx, 0.3, 0], mat: M_STEEL, cast: false }));
      }
      arms.push({ group: g, j1, j2, j3, phase: Math.random() * 6.28 });
      return g;
    }
    roboticArm(CORE_AT.x - 2.1, LAB_Y + 1.1, CORE_AT.z + 1.5, 1.1);
    roboticArm(CORE_AT.x + 2.1, LAB_Y + 1.1, CORE_AT.z - 1.4, 1.1);
    roboticArm(R.x0 + 3.3, LAB_Y + 0.98, R.z1 - 1.5, 0.7);

    /* ---- Chemical tanks along the west wall, with radiation placards. */
    const tanks = [];
    for (let i = 0; i < 4; i++) {
      const tz = R.z0 + 2.2 + i * 1.75;
      const t = cylinder({
        r: 0.44, h: 2.0, pos: [R.x0 + 0.7, LAB_Y + 1.0, tz], mat: i % 2 ? M_STEEL : M_STEEL_DULL,
      });
      root.add(t);
      tanks.push(t);
      prop(R.x0 + 0.24, R.x0 + 1.16, LAB_Y, LAB_Y + 2.0, tz - 0.46, tz + 0.46);
      root.add(cylinder({ r: 0.47, h: 0.08, pos: [R.x0 + 0.7, LAB_Y + 2.02, tz], mat: M_STEEL_DULL, cast: false }));
      root.add(cylinder({ r: 0.47, h: 0.08, pos: [R.x0 + 0.7, LAB_Y + 0.06, tz], mat: M_STEEL_DULL, cast: false }));
      // A sight glass with purple in it.
      root.add(box({
        size: [0.1, 1.2, 0.06], pos: [R.x0 + 1.16, LAB_Y + 1.0, tz], mat: M_COOLANT, cast: false,
      }));
      // Radiation placard.
      const placard = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), mat({
        map: radTexture(), roughness: 0.85, unique: true,
      }));
      placard.position.set(R.x0 + 1.155, LAB_Y + 1.72, tz);
      placard.rotation.y = Math.PI / 2;
      root.add(placard);
    }
    /* Two more radiation symbols, big, stencilled on the walls. The south
     * one was at R.z0 - 0.02, i.e. two centimetres INSIDE the south wall
     * facing north -- painted on the far side of the masonry. */
    for (const [px, pz, rot] of [
      [R.x1 - 0.02, R.z0 + 3.0, -Math.PI / 2], [cx + 2.4, R.z0 + 0.02, 0],
    ]) {
      const big = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), mat({
        map: radTexture(), roughness: 0.92, unique: true,
      }));
      big.position.set(px, LAB_Y + 1.9, pz);
      big.rotation.y = rot;
      big.name = 'ss-rad-stencil';
      root.add(big);
    }

    /* ---- Purple coolant tubes: a run along the ceiling and four drops
     * into the core. These are the room's colour. */
    const coolant = [];
    for (const cz of [CORE_AT.z - 2.9, CORE_AT.z + 2.9]) {
      const t = cylinder({
        r: 0.09, h: R.x1 - R.x0 - 0.6, pos: [cx, LAB_CEIL - 0.42, cz], rotZ: Math.PI / 2, mat: M_COOLANT, cast: false,
      });
      root.add(t);
      coolant.push(t);
    }
    for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
      const drop = cylinder({
        r: 0.06,
        h: LAB_CEIL - 0.42 - (LAB_Y + 1.5),
        pos: [CORE_AT.x + dx, (LAB_CEIL - 0.42 + LAB_Y + 1.5) / 2, CORE_AT.z + dz],
        mat: M_COOLANT,
        cast: false,
      });
      root.add(drop);
      coolant.push(drop);
    }
    light(0x7a2ee8, 3.4, 10, cx, LAB_CEIL - 0.6, CORE_AT.z - 2.9);
    light(0x7a2ee8, 3.4, 10, cx, LAB_CEIL - 0.6, CORE_AT.z + 2.9);

    /* ---- Ceiling gas vents. Six of them, closed, and completely ordinary
     * until beat 10. */
    const vents = [];
    for (let i = 0; i < 6; i++) {
      const vx = R.x0 + 1.6 + (i % 3) * ((R.x1 - R.x0 - 3.2) / 2);
      const vz = R.z0 + 2.4 + Math.floor(i / 3) * 4.6;
      const g = group('ss-vent');
      // Frame flush INTO the soffit; it used to hang 0.08 m clear of it.
      g.position.set(vx, LAB_CEIL - 0.12, vz);
      root.add(g);
      g.add(box({ size: [0.6, 0.12, 0.6], pos: [0, 0.06, 0], mat: M_STEEL_DULL, cast: false }));
      const louvres = [];
      for (let j = 0; j < 5; j++) {
        const lv = box({
          size: [0.54, 0.02, 0.09], pos: [0, 0, -0.2 + j * 0.1], mat: M_STEEL, cast: false,
        });
        lv.rotation.x = 0;
        g.add(lv);
        louvres.push(lv);
      }
      vents.push({ group: g, louvres, x: vx, z: vz });
    }

    /* ---- The emergency masks. Locked, and well over head height on a bare
     * wall -- but under the soffit and against the wall, which it was not:
     * at LAB_Y + 3.1 with a 0.62 m case its top stood 0.16 m through the
     * ceiling slab, and at R.x1 - 0.22 its back hung 0.07 m off the wall. */
    const maskCab = group('ss-mask-cabinet');
    maskCab.position.set(R.x1 - 0.15, LAB_Y + 2.86, R.z1 - 2.4);
    maskCab.rotation.y = -Math.PI / 2;
    root.add(maskCab);
    maskCab.add(box({ size: [1.1, 0.62, 0.3], pos: [0, 0, 0], mat: mat({ color: 0x9a1c14, roughness: 0.55 }) }));
    maskCab.add(box({
      size: [0.96, 0.5, 0.03],
      pos: [0, 0, 0.16],
      mat: mat({
        color: 0xbcd6e0, roughness: 0.06, transparent: true, opacity: 0.3, unique: true,
      }),
      cast: false,
    }));
    for (let i = 0; i < 3; i++) {
      maskCab.add(sphere({
        r: 0.1, ry: 0.09, rz: 0.07, pos: [-0.3 + i * 0.3, 0.02, 0.06], mat: M_RUBBER, cast: false,
      }));
      maskCab.add(cylinder({
        r: 0.05, h: 0.06, pos: [-0.3 + i * 0.3, -0.04, 0.12], rotX: Math.PI / 2, mat: M_STEEL_DULL, cast: false,
      }));
    }
    maskCab.add(box({ size: [0.07, 0.1, 0.05], pos: [0.5, 0, 0.14], mat: M_BRASS, cast: false }));
    const maskLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.14),
      mat({
        map: printed('silent.label.masks', ['EMERGENCY RESPIRATORS'], {
          w: 512, h: 80, bg: '#8a1810', fg: '#f0e8d8', font: '900 34px "Trebuchet MS", sans-serif',
        }),
        roughness: 0.8,
        unique: true,
      }),
    );
    /* Stencilled on the wall under the cabinet. At (0, -0.38, 0.16) it was a
     * label hanging in mid-air 0.07 m below the box it labels. */
    maskLabel.position.set(0, -0.42, -0.145);
    maskLabel.name = 'ss-mask-label';
    maskCab.add(maskLabel);

    /* ---- Lighting inside. Bright, clinical, and its own -- the lab must
     * stay legible through the glass whatever the light rig is doing
     * outside, so the fixtures are emissive as well as lit. */
    const labTubes = [];
    for (const [tx, tz] of [
      [cx - 3.0, R.z0 + 2.0], [cx + 3.0, R.z0 + 2.0],
      [cx - 3.0, R.z1 - 2.0], [cx + 3.0, R.z1 - 2.0], [cx, CORE_AT.z],
    ]) {
      labTubes.push(fluoro(tx, LAB_CEIL - 0.36, tz, {
        len: 1.7, colour: 0xeaf2ff, intensity: 5.6, range: 12, ceil: LAB_CEIL,
      }));
    }

    /* A steel bench of glassware, for something to go over in beat 9. On four
     * legs, because a 2 m worktop hovering at 0.92 m over a bare epoxy floor
     * is not a bench, and every flask sat at a fixed y regardless of how tall
     * it was, so the tall ones were half-sunk in the worktop. */
    const benchZ = R.z0 + 1.2;
    const benchTop = LAB_Y + 0.95;
    root.add(box({
      size: [2.0, 0.06, 0.6], pos: [cx - 3.4, benchTop - 0.03, benchZ], mat: M_STEEL, name: 'ss-glassware-bench',
    }));
    for (const [lx, lz] of [[-0.92, -0.24], [0.92, -0.24], [-0.92, 0.24], [0.92, 0.24]]) {
      root.add(box({
        size: [0.05, benchTop - 0.06 - LAB_Y, 0.05],
        pos: [cx - 3.4 + lx, (LAB_Y + benchTop - 0.06) / 2, benchZ + lz],
        mat: M_STEEL_DULL,
      }));
    }
    prop(cx - 4.4, cx - 2.4, LAB_Y, benchTop, R.z0 + 0.9, R.z0 + 1.5);
    const glassware = [];
    for (let i = 0; i < 7; i++) {
      const gh = 0.16 + (i % 3) * 0.06;
      const gw = cylinder({
        rTop: 0.05,
        rBottom: 0.07,
        h: gh,
        pos: [cx - 4.2 + i * 0.28, benchTop + gh / 2, benchZ],
        mat: M_GLASS,
        cast: false,
      });
      root.add(gw);
      glassware.push(gw);
    }

    return {
      stations, arms, tanks, coolant, vents, maskCab, labTubes, glassware,
    };
  }
  const sealed = buildSealedLab();

  /* ================================================================== */
  /* THE SILENT SQUATCH CORE                                             */
  /*                                                                      */
  /* "a thick metallic sphere, gold internal energy, purple stabiliser    */
  /* rings, rotating parts, heavy cables, a small Fat Squatch emblem      */
  /* stamped on the casing."                                             */
  /*                                                                       */
  /* And the requirement that outlives everybody in the room: IT MUST KEEP */
  /* GLOWING AFTER EVERYONE IS DEAD. So the glow is emissive material      */
  /* first and a point light second -- the light rig can drop a PointLight */
  /* when the player wanders off, and the core is not allowed to go out.   */
  /* ================================================================== */
  const coreState = {
    phase: 'idle', // idle | building | complete
    t: 0,
    spin: 0,
    surge: 0,
    ringSpeed: 0.35,
    glow: 0.55,
  };

  function buildCore() {
    const g = group('silent-squatch-core');
    g.position.set(CORE_AT.x, LAB_Y, CORE_AT.z);
    root.add(g);

    /* The cradle it stands in. The four legs run all the way up to the
     * sphere's seam band: they used to stop at y 1.425, which is 0.09 m
     * short of the shell in every direction, so a metre-and-three-quarter
     * ball of metal was resting on nothing at all. */
    g.add(cylinder({ r: 1.15, h: 0.18, pos: [0, 0.09, 0], mat: M_STEEL_DULL }));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(box({
        size: [0.16, 1.5, 0.16], pos: [Math.cos(a) * 0.9, 0.925, Math.sin(a) * 0.9], mat: M_STEEL_DULL, rotY: -a,
      }));
    }
    prop(CORE_AT.x - 1.2, CORE_AT.x + 1.2, LAB_Y, LAB_Y + 2.6, CORE_AT.z - 1.2, CORE_AT.z + 1.2);

    // The sphere: a thick metallic shell in two halves with a seam band.
    const shellMat = mat({ color: 0x8e959c, roughness: 0.3, metalness: 0.88 });
    const shell = sphere({ r: 0.86, pos: [0, 1.72, 0], mat: shellMat });
    g.add(shell);
    g.add(cylinder({ r: 0.9, h: 0.14, pos: [0, 1.72, 0], mat: mat({ color: 0x5e646a, roughness: 0.4, metalness: 0.8 }) }));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.add(box({
        size: [0.07, 0.07, 0.07], pos: [Math.cos(a) * 0.9, 1.72, Math.sin(a) * 0.9], mat: M_STEEL, cast: false,
      }));
    }
    // Gold energy inside, seen through eight apertures cut in the shell.
    const goldMat = mat({
      color: 0x201404, emissive: 0xffc24a, emissiveIntensity: 2.6, roughness: 1, unique: true,
    });
    const goldCore = sphere({ r: 0.62, pos: [0, 1.72, 0], mat: goldMat, cast: false });
    g.add(goldCore);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const yy = 1.72 + Math.sin(i * 1.7) * 0.42;
      g.add(box({
        size: [0.2, 0.3, 0.2],
        pos: [Math.cos(a) * 0.72, yy, Math.sin(a) * 0.72],
        mat: M_BLACK,
        rotY: -a,
        cast: false,
      }));
    }

    /* Purple stabiliser rings -- three, on different axes, all rotating.
     * These are the parts the mission watches: `core.begin()` speeds them
     * up and `core.complete()` locks them. */
    const ringMat = mat({
      color: 0x1a0a2e, emissive: 0x8a3cf0, emissiveIntensity: 2.2, roughness: 0.5, metalness: 0.3, unique: true,
    });
    const rings = [];
    const ringSpecs = [
      { r: 1.02, tube: 0.05, rotX: 0, rotZ: 0 },
      { r: 1.12, tube: 0.045, rotX: Math.PI / 2, rotZ: 0.4 },
      { r: 1.22, tube: 0.04, rotX: 0.5, rotZ: Math.PI / 2 },
    ];
    for (const spec of ringSpecs) {
      const holder = group('core-ring');
      holder.position.y = 1.72;
      holder.rotation.set(spec.rotX, 0, spec.rotZ);
      g.add(holder);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.r, spec.tube, 8, 40), ringMat);
      ring.rotation.x = Math.PI / 2;
      holder.add(ring);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        holder.add(box({
          size: [0.09, 0.09, 0.16],
          pos: [Math.cos(a) * spec.r, 0, Math.sin(a) * spec.r],
          mat: M_STEEL,
          rotY: -a,
          cast: false,
        }));
      }
      rings.push(holder);
    }

    // A rotating collar just under the sphere, so something visibly turns
    // even when the rings are locked.
    const collar = group('core-collar');
    collar.position.y = 0.94;
    g.add(collar);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      collar.add(box({
        size: [0.24, 0.26, 0.1], pos: [Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62], mat: M_STEEL_DULL, rotY: -a,
      }));
    }

    /* Heavy cables, out of the base and away across the floor to the
     * consoles and the tanks. */
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const len = 2.4 + (i % 3) * 0.8;
      root.add(cylinder({
        r: 0.075,
        h: len,
        pos: [
          CORE_AT.x + Math.cos(a) * (1.0 + len / 2),
          LAB_Y + 0.09,
          CORE_AT.z + Math.sin(a) * (1.0 + len / 2),
        ],
        rotZ: Math.PI / 2,
        rotY: -a,
        mat: M_RUBBER,
        cast: false,
      }));
      root.add(box({
        size: [0.2, 0.2, 0.2], pos: [CORE_AT.x + Math.cos(a) * 1.05, LAB_Y + 0.12, CORE_AT.z + Math.sin(a) * 1.05], mat: M_STEEL_DULL, cast: false,
      }));
    }

    /* The Fat Squatch emblem, stamped small on the casing. The completed
     * deployable payload has a mark and this is the machine that makes it,
     * so the mark is on the machine. Nothing in the scene points at it. */
    const emblem = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      mat({
        map: printed('silent.emblem.fatsquatch', ['FAT', 'SQUATCH'], {
          w: 256, h: 256, bg: '#3c4147', fg: '#1a1c1f', font: '900 44px "Trebuchet MS", sans-serif', border: '#1a1c1f', lineHeight: 54,
        }),
        roughness: 0.55,
        metalness: 0.5,
        unique: true,
      }),
    );
    /* On the shell, not 0.06 m off it, and raked to the shell's own normal
     * rather than tilted the opposite way: at y 1.255 the sphere's surface is
     * at radius 0.735 and its normal there is 0.56 rad below the horizontal. */
    emblem.position.set(0, 1.255, 0.738);
    emblem.rotation.x = 0.56;
    g.add(emblem);
    /* And a stencilled designation, bolted to the rim of the cradle drum.
     * It used to be at (0, 0.5, 1.02), which is above the drum and inside
     * none of the four legs: a nameplate floating in the air. */
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.56, 0.11),
      mat({
        map: printed('silent.core.plate', ['SILENT SQUATCH / CORE 01'], {
          w: 512, h: 100, bg: '#3c4147', fg: '#12141a', font: '900 34px "Trebuchet MS", sans-serif',
        }),
        roughness: 0.6,
        unique: true,
      }),
    );
    plate.position.set(0, 0.11, 1.158);
    g.add(plate);

    /* Two lights: gold from the middle, purple from the rings. Both are
     * registered with the house rig, and both are backed by emissive
     * material -- see the note at the head of this section. */
    const goldLight = light(0xffc24a, 4.4, 9, CORE_AT.x, LAB_Y + 1.72, CORE_AT.z);
    const purpleLight = light(0x8a3cf0, 3.4, 11, CORE_AT.x, LAB_Y + 1.72, CORE_AT.z);

    /* Gold arcs: short emissive bars between the collar and the rings that
     * blink on and off. Cheap, and they read as electricity through glass. */
    const arcs = [];
    const arcMat = mat({
      color: 0x000000, emissive: 0xffd77a, emissiveIntensity: 3.2, roughness: 1, transparent: true, opacity: 0.9, unique: true,
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const arc = box({
        size: [0.028, 0.55, 0.028],
        pos: [CORE_AT.x + Math.cos(a) * 0.98, LAB_Y + 1.3, CORE_AT.z + Math.sin(a) * 0.98],
        mat: arcMat,
        cast: false,
      });
      arc.rotation.z = (i % 2 ? 1 : -1) * 0.35;
      arc.visible = false;
      root.add(arc);
      arcs.push(arc);
    }

    return {
      group: g, shell, goldCore, goldMat, ringMat, rings, collar, arcs, arcMat, goldLight, purpleLight, emblem,
    };
  }
  const core = buildCore();

  /* ================================================================== */
  /* THE CASE, AND WHAT IS IN IT                                         */
  /*                                                                      */
  /* "Reuse the case from The Silver Case (src/silvercase/props/case.js)  */
  /* -- this is the same object, carried forward." So it is: one          */
  /* `makeCase()`, no second model, and its own two internal point lights */
  /* (gold from the core, purple from the containment rings) are the ones */
  /* the mission brightens. What this adds is a BOOST multiplier on top of */
  /* the prop's own openness curve, because "brightening when it faces Lou */
  /* and again when Booski opens it" is a second axis the prop does not     */
  /* have and should not grow for one scene.                               */
  /*                                                                        */
  /* The contents are never shown clearly. The container below is a lidded  */
  /* cylinder that comes out ONCE, in beat 6, and goes straight into the     */
  /* drawer.                                                                 */
  /* ================================================================== */
  const caseObj = makeCase({
    x: obs.transferTable.x, y: obs.transferTable.y, z: obs.transferTable.z, rotY: Math.PI,
  });
  root.add(caseObj.group);
  /* HIDDEN UNTIL SOMEBODY PUTS IT DOWN. Owner playtest: a second case was
   * already sitting on the transfer table before he had delivered anything.
   * It was this one — built here, placed here, and visible from the moment
   * the observation area came into view, while the case he was carrying was
   * a separate model owned by `mission/mount.js`. Two briefcases on one
   * table, and the wrong one was the one that glows.
   *
   * This is now THE case: `mount.js` drives this object between his hands,
   * Lou's desk and this table (see the note there). It starts invisible
   * because at build time nobody has put it anywhere yet, and the mission
   * shows it the moment he sets it down. A house with no mission mounted
   * simply has no briefcase in the basement, which is correct — the case
   * arrives with the Prospect. */
  caseObj.group.visible = false;
  const caseState = { boost: 1, target: 1, hum: false };
  /* The prop's own lights, so the boost can be applied after its update.
   * Registered with the house rig like everything else down here. */
  const caseLights = [];
  caseObj.body.traverse((o) => { if (o.isPointLight) caseLights.push(o); });
  for (const l of caseLights) registerLight(l);

  function buildContainer() {
    const g = group('squatchanium-container');
    // Sits in the case until it is lifted out.
    g.position.set(obs.transferTable.x, obs.transferTable.y + 0.06, obs.transferTable.z);
    g.visible = false;
    root.add(g);
    const shellMat = mat({ color: 0xa8aeb4, roughness: 0.28, metalness: 0.9 });
    g.add(cylinder({ r: 0.075, h: 0.26, pos: [0, 0.13, 0], mat: shellMat }));
    g.add(cylinder({ r: 0.088, h: 0.035, pos: [0, 0.26, 0], mat: shellMat }));
    g.add(cylinder({ r: 0.088, h: 0.035, pos: [0, 0.02, 0], mat: shellMat }));
    // The window band: purple energy under transparent shielding.
    const shield = cylinder({
      r: 0.079,
      h: 0.1,
      pos: [0, 0.14, 0],
      mat: mat({
        color: 0xbcd6e0, roughness: 0.05, transparent: true, opacity: 0.34, unique: true,
      }),
      cast: false,
    });
    g.add(shield);
    const purple = cylinder({
      r: 0.062,
      h: 0.098,
      pos: [0, 0.14, 0],
      mat: mat({
        color: 0x1c0a30, emissive: 0x8a3cf0, emissiveIntensity: 2.4, roughness: 1, unique: true,
      }),
      cast: false,
    });
    g.add(purple);
    // A pulsing gold centre, deeper in.
    const goldCentre = sphere({
      r: 0.03,
      pos: [0, 0.14, 0],
      mat: mat({
        color: 0x201404, emissive: 0xffc24a, emissiveIntensity: 3.2, roughness: 1, unique: true,
      }),
      cast: false,
    });
    g.add(goldCentre);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.add(box({
        size: [0.02, 0.24, 0.02], pos: [Math.cos(a) * 0.078, 0.13, Math.sin(a) * 0.078], mat: M_STEEL, cast: false,
      }));
    }
    // Vapour curling off the casing.
    const vapourGeo = new THREE.BufferGeometry();
    const N = 40;
    const pos = new Float32Array(N * 3);
    const seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) seeds[i] = Math.random();
    vapourGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const vapour = new THREE.Points(vapourGeo, new THREE.PointsMaterial({
      size: 0.05,
      map: puffTexture(),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      color: 0xc8b0e8,
    }));
    g.add(vapour);
    return {
      group: g, purple, goldCentre, vapour, seeds, pos, geo: vapourGeo,
    };
  }
  const container = buildContainer();

  /* ================================================================== */
  /* THE SIX                                                             */
  /*                                                                      */
  /* "six distinct people, not six copies." So: six different builds,     */
  /* heights, coats, hair and faces, each with its own station and its    */
  /* own idle. Index 0 is Aubbie, which the mission relies on.            */
  /*                                                                        */
  /* This module supplies BEHAVIOUR ONLY. `say(cue)` takes a cue name from  */
  /* the sibling and routes it through the glass path; not one line of      */
  /* dialogue is written here, and the six people have no script of their   */
  /* own. What they do have is the ladder beat 10 needs, in order:          */
  /* confusion, panic, covering their mouths, coughing, slamming the glass, */
  /* crawling for the door, and going down.                                 */
  /* ================================================================== */
  const SCIENTIST_SPECS = [
    // 0 -- Aubbie. Lead. Older, greying, the only one with a tie showing.
    {
      id: 'aubbie', bulk: 1.06, height: 1.03, coat: 0xe2e0d6, shirt: 0xdad8cc, tie: 0x4a2028, hair: 0x3a3630, temples: 0x9a968c, skin: 0xc0956e, browHeavy: true, hairStyle: 'short',
    },
    // 1 -- the nervous technician. Small, young, hair too long for the room.
    {
      id: 'two', bulk: 0.9, height: 0.98, coat: 0xd6d4ca, shirt: 0xc8d0d8, tie: 0x2c4a5a, hair: 0x241c14, skin: 0xd0a882, hairStyle: 'short', lidHeavy: false,
    },
    // 2 -- the weapons engineer. Heavy, cropped, sleeves of the coat rolled.
    {
      id: 'three', bulk: 1.3, height: 0.97, coat: 0xcdcbc0, shirt: 0x9aa4ac, tie: 0x33383e, hair: 0x1a1712, skin: 0xb4855e, hairStyle: 'crop', browHeavy: true,
    },
    // 3 -- the cynical older one. Tall, grey, hooded eyes. Sees it first.
    {
      id: 'four', bulk: 1.0, height: 1.08, coat: 0xdcdad0, shirt: 0xd0cec4, tie: 0x3a3a42, hair: 0x8e8a80, skin: 0xc8b096, hairStyle: 'short', lidHeavy: true,
    },
    // 4 -- the junior assistant. Slight, cropped, newest coat in the room.
    {
      id: 'five', bulk: 0.86, height: 0.95, coat: 0xeae8de, shirt: 0xdde4ea, tie: 0x5a2a30, hair: 0x4a3220, skin: 0xdcb894, hairStyle: 'crop',
    },
    // 5 -- the medical specialist. Broad, dark-haired, surgical blues.
    {
      id: 'six', bulk: 1.14, height: 1.0, coat: 0x9ec4c0, shirt: 0x8ab4b0, tie: 0x2a4a48, hair: 0x14100c, skin: 0x8e6a4a, hairStyle: 'short', browHeavy: true,
    },
  ];

  /**
   * Where each one works, where each one faces, and where each one dies.
   * Inside the lab, all six.
   *
   * `face` is a yaw for `Figure.place()`, whose face is +Z. Everybody used to
   * be placed at Math.PI -- which is -Z, i.e. every one of them stood with
   * his back to his own workstation, and the three nearest the glass had
   * their backs to the player for the whole of beats 5 to 7. Each yaw below
   * points at the bench that man is standing at: the north row's stools are
   * on the +Z side of their benches, the south row's on the -Z side.
   *
   * Aubbie is off the bench line entirely and stands at the core he keeps
   * talking about; his old spot was 0.30 m from index 2's, which is inside
   * the other man.
   */
  const STATION_AT = [
    { x: CORE_AT.x - 2.2, z: CORE_AT.z, face: Math.PI / 2 },
    { x: SEALED_LAB.x0 + 1.7, z: SEALED_LAB.z1 - 2.4, face: 0 },
    { x: SEALED_LAB.x0 + 5.1, z: SEALED_LAB.z1 - 2.4, face: 0 },
    { x: SEALED_LAB.x1 - 1.7, z: SEALED_LAB.z1 - 2.4, face: 0 },
    { x: SEALED_LAB.x0 + 1.5, z: SEALED_LAB.z0 + 3.5, face: Math.PI },
    { x: SEALED_LAB.x1 - 1.5, z: SEALED_LAB.z0 + 3.5, face: Math.PI },
  ];

  const GLASS_INSIDE_Z = GLASS_WALL.z0 - 0.55; // where you stand to hit it
  const handprints = [];

  /**
   * What working at a bench looks like, cycled per man. See the work loop in
   * `update`. `gap` is a deliberate entry: the pauses are what stop six
   * people at six benches reading as six people miming.
   */
  const WORK_GESTURES = Object.freeze(['reach', 'gap', 'point', 'gap', 'hands', 'gap', 'reach', 'gap']);

  function buildScientist(i) {
    const spec = SCIENTIST_SPECS[i];
    const fig = new Figure({
      bulk: spec.bulk,
      height: spec.height,
      coat: spec.coat,
      shirt: spec.shirt,
      tie: spec.tie,
      hair: spec.hair,
      skin: spec.skin,
      temples: spec.temples ?? null,
      hairStyle: spec.hairStyle,
      browHeavy: !!spec.browHeavy,
      lidHeavy: !!spec.lidHeavy,
      iris: 0x4a3a28,
    });
    const home = STATION_AT[i];
    fig.place(home.x, home.z, home.face); // +Z is his face; see STATION_AT
    fig.group.position.y = LAB_Y;
    root.add(fig.group);

    const self = {
      index: i,
      id: spec.id,
      fig,
      home,
      alive: true,
      inside: true,
      /** confused | panic | covering | coughing | pounding | crawling | down */
      stage: 'work',
      target: null,
      speed: 1.25,
      _t: Math.random() * 6,
      /** Seconds until this man's next move at his bench. See the work loop. */
      _work: 0.4 + Math.random() * 3.2,
      _workN: 0,
      _cough: 0,
      _fall: 0,
      _printed: false,
      /** Set by `stepOut`: where to walk once he is through the doorway. */
      queued: null,

      get position() { return fig.group.position; },
      /**
       * SOMETHING TO SHOOT AT.
       *
       * `mission/mount.js` asks the lab for `aubbieTarget`, then for
       * `body.object`, `body.group` or `body.mesh`, and only if it finds NONE
       * of them does it fall back to a five-degree cone around
       * `body.position` — which is this man's FEET. This object published
       * `position` and nothing else, so the execution was always the cone,
       * and the cone was around a pair of shoes. See `stepOut`.
       */
      get object() { return fig.group; },

      /** The sibling supplies the cue; this supplies the mouth and the path. */
      say(cue, opts = {}) {
        if (!self.alive && !opts.force) return 0;
        /* THE REAL LENGTH, when there is a recording.
         *
         * `opts.seconds ?? 1.7` was a guess doing two jobs badly: it decided
         * how long the mouth moved AND, upstream, how long the line held
         * before the next one started. Both were wrong for any take that is
         * not 1.7 seconds long, which is most of them — a mouth that stops
         * mid-sentence, and a scientist talked over by the next scientist.
         *
         * Returns the seconds it used, so `SilentSquatchMission.#speak` can
         * hand it to the dialogue controller. `0` means nothing was spoken. */
        const recorded = cue ? (audio?.sampleDuration?.(cue) ?? 0) : 0;
        const secs = opts.seconds ?? (recorded > 0 ? recorded : 1.7);
        if (!cue) {
          fig.speak(secs);
          return secs;
        }
        const at = fig.group.position.clone();
        at.y = LAB_Y + 1.55;
        const route = self.inside ? glassAudio.say.bind(glassAudio) : plainSay;
        const source = route(cue, {
          volume: opts.volume ?? 0.9, position: at, ref: 2.2, maxDist: 26, ...opts,
        });
        /* The line PLAYS and then the mouth is started on it, in that order.
         * Behind the glass or not, it is the same `AudioEngine.play()` at the
         * end of the route, so the amplitude tap is on it either way and the
         * jaw runs on the take rather than on `secs` (src/core/mouth.js).
         * Fifteen of this scene's lines are still unrecorded, and those get
         * the fallback envelope for the same `secs` they always had. */
        fig.speak(secs, source ? { audio, source } : null);
        return secs;
      },
      /** Face a world point (the glass, Booski, the core). */
      lookAt(x, z) { fig.lookAt({ x, z }); return self; },
      /** Walk somewhere inside the lab. */
      goTo(x, z, speed = 1.25) {
        self.target = { x, z };
        self.speed = speed;
        return self;
      },
      cheer() {
        if (!self.alive) return self;
        fig.playGesture('hands', 2.4);
        return self;
      },
      /** Stage 1: something is wrong but nobody has said it yet. */
      confused() {
        if (!self.alive) return self;
        self.stage = 'confused';
        fig.playGesture('shrug', 2.0);
        /* MINUS 1.2. GLASS_INSIDE_Z is already the inside face of the glass;
         * plus 1.2 walked him to z 49.65, which is through the pane and out
         * into the observation area with Booski. */
        self.goTo(fig.group.position.x, GLASS_INSIDE_Z - 1.2, 0.9);
        return self;
      },
      /**
       * Beat 8: he tries the handle and finds out.
       *
       * `tryHandle` IS THE NAME. `mission/contract-lab.js` publishes the API
       * the mission speaks — `stepOut`, `tryHandle`, `slam` — and this file
       * had called the same three things `leaveLab`, `tryDoor` and `pound`.
       * The mission calls them through `?.()`, so all three were silent
       * no-ops in the real lab while passing every test against the double.
       * The descriptive names are kept as aliases; the contract name is the
       * one the mission uses. See the note at `stepOut` for what that cost.
       */
      tryHandle() {
        if (!self.alive) return self;
        self.stage = 'confused';
        self.goTo((GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2, GLASS_INSIDE_Z, 1.35);
        /* SILENT, and that is the direction. Bezmenov is the one who saw this
         * coming in March; he does not shout, he walks to the door and puts
         * his hand on a handle that does not move, and then he turns round. */
        fig.playGesture('reach', 1.6);
        return self;
      },
      tryDoor() { return self.tryHandle(); },
      /** Beat 9: he stops pounding and simply stares, having expected it. */
      stare() {
        if (!self.alive) return self;
        self.stage = 'staring';
        self.target = null;
        fig.gesture = null;
        fig.gestureT = 0;
        fig.lookAt({ x: (GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2, z: GLASS_WALL.z1 + 2.0 });
        return self;
      },
      panic() {
        if (!self.alive) return self;
        self.stage = 'panic';
        fig.playGesture('hands', 3.0);
        self.goTo(
          THREE.MathUtils.clamp(fig.group.position.x, SEALED_LAB.x0 + 1, SEALED_LAB.x1 - 1),
          GLASS_INSIDE_Z,
          1.9,
        );
        return self;
      },
      /** Hands over the mouth. The stage between panic and choking. */
      cover() {
        if (!self.alive) return self;
        self.stage = 'covering';
        fig.playGesture('drink', 60);
        return self;
      },
      coughing() {
        if (!self.alive) return self;
        self.stage = 'coughing';
        self._cough = 0.2;
        fig.playGesture('drink', 60);
        return self;
      },
      /** Fists on the glass. Routed through the impact path deliberately. */
      pound(times = 1) {
        if (!self.alive) return self;
        self.stage = 'pounding';
        self.goTo(
          THREE.MathUtils.clamp(fig.group.position.x, SEALED_LAB.x0 + 1, SEALED_LAB.x1 - 1),
          GLASS_INSIDE_Z,
          1.9,
        );
        for (let n = 0; n < times; n++) {
          glassAudio.impact('silent.glass.fist', {
            volume: 0.85,
            delay: n * 0.34,
            position: new THREE.Vector3(fig.group.position.x, LAB_Y + 1.3, GLASS_WALL.z0),
            ref: 3,
            maxDist: 30,
          });
        }
        return self;
      },
      /** The contract's name for it. See `tryHandle`. */
      slam(times = 1) { return self.pound(times); },
      /** Beat 9: a metal chair into the glass. The chair bends. It does not. */
      chairStrike() {
        if (!self.alive) return self;
        self.stage = 'pounding';
        fig.playGesture('reach', 1.4);
        glassAudio.impact('silent.glass.chair', {
          volume: 1.0,
          position: new THREE.Vector3(fig.group.position.x, LAB_Y + 1.3, GLASS_WALL.z0),
          ref: 3,
          maxDist: 34,
        });
        chairBend();
        return self;
      },
      crawl() {
        if (!self.alive) return self;
        self.stage = 'crawling';
        self.speed = 0.42;
        self.target = { x: (GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2, z: GLASS_INSIDE_Z };
        return self;
      },
      /** The last thing he leaves behind. Sticks to the glass at his height. */
      handprint() {
        if (self._printed) return self;
        self._printed = true;
        /* Two-sided, and facing OUT. A PlaneGeometry's normal is +Z and this
         * one was turned to face -Z -- into the lab, away from the only
         * people who were ever going to look at it. The spec's own
         * visibility requirement lists "handprints appearing" among the
         * things the player must be able to see. */
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(0.34, 0.42),
          mat({
            map: handTexture(),
            transparent: true,
            opacity: 0,
            depthWrite: false,
            roughness: 0.4,
            side: THREE.DoubleSide,
            unique: true,
          }),
        );
        m.position.set(
          THREE.MathUtils.clamp(fig.group.position.x, GLASS_WALL.x0 + 0.4, GLASS_WALL.x1 - 0.4),
          LAB_Y + 1.34,
          GLASS_WALL.z0 - 0.09,
        );
        m.name = 'ss-handprint';
        root.add(m);
        handprints.push({ mesh: m, t: 0 });
        return self;
      },
      collapse() {
        if (!self.alive) return self;
        self.alive = false;
        self.stage = 'down';
        self.target = null;
        fig.down = true;
        fig.gesture = null;
        fig.gestureT = 0;
        fig.talkT = 0;
        self._fall = 0;
        self._fallYaw = (Math.random() - 0.5) * 0.8;
        lifeSigns = Math.max(0, lifeSigns - 1);
        paintLifeSigns();
        return self;
      },
      /**
       * Beat 7: Aubbie comes through the door into the observation area.
       *
       * THE SOFTLOCK WAS HERE, and it was a spelling mistake with teeth.
       * `SilentSquatchMission.#stage('door.open')` calls
       * `scientists[0].stepOut?.()`; this object was called `leaveLab`; the
       * optional call swallowed it. So the mission set `aubbieOutside = true`
       * and told the player to eliminate a man who was still standing at the
       * core on the far side of twelve centimetres of glass, twelve metres
       * away, with his feet at LAB_Y.
       *
       * `mount.js` resolves the shot by raycast if the lab hands it a mesh
       * and by a FIVE DEGREE CONE on `body.position` if it does not — and
       * `position` here is `fig.group.position`, which is his FEET. A player
       * standing at the SILENT NIGHT pedestal with the order "Eliminate
       * Aubbie" had to put the crosshair within five degrees of a pair of
       * shoes behind a wall of glass, and every miss counted as a miss. Two
       * of the three ways out of Beat 8 were therefore shut, and the third
       * was luck.
       *
       * Two halves to the fix and they are independent, which is the point:
       * he WALKS OUT (this method, under the name the mission calls), and
       * there is a BODY TO AIM AT whether he does or not (`object` above,
       * plus `lab.aubbieTarget`). Either alone would have hidden the other.
       *
       * `z = GLASS_WALL.z1 + 1.5` is a metre and a half clear of the pane on
       * the observation side, in the open, in front of Booski — which is
       * where the brief wants him to fall: "in full view of the scientists
       * through the glass".
       */
      stepOut(x = (GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2, z = GLASS_WALL.z1 + 1.5) {
        self.inside = false;
        self.stage = 'walking';
        /* Through the doorway first, then out. One straight line from the
         * core to the observation area clips the door jamb and he arrives
         * walking through the glass. */
        self.goTo((GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2, GLASS_INSIDE_Z, 1.3);
        self.queued = { x, z, speed: 1.3, stage: 'outside' };
        return self;
      },
      leaveLab(x, z) { return self.stepOut(x, z); },
      setInside(v) { self.inside = !!v; return self; },
      /** Beat 8: he is killed in the observation area, in full view. */
      kill() {
        self.inside = false;
        return self.collapse();
      },
    };
    return self;
  }

  /** Speech from somebody who is NOT behind the glass. */
  function plainSay(cue, opts) { return audio?.play?.(cue, opts) ?? null; }

  /* The chair beat 9 needs, standing at a station until somebody picks it
   * up. `chairBend()` is what "the chair bends, the glass does not break"
   * looks like: the chair deforms and the pane is untouched. */
  const labChair = group('ss-lab-chair');
  labChair.position.set(CORE_AT.x + 2.6, LAB_Y, GLASS_INSIDE_Z - 0.4);
  root.add(labChair);
  labChair.add(box({ size: [0.44, 0.05, 0.44], pos: [0, 0.46, 0], mat: M_STEEL_DULL }));
  const chairBack = box({ size: [0.44, 0.5, 0.05], pos: [0, 0.73, -0.2], mat: M_STEEL_DULL });
  labChair.add(chairBack);
  const chairLegs = [];
  for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
    const leg = box({ size: [0.035, 0.46, 0.035], pos: [lx, 0.23, lz], mat: M_STEEL_DULL });
    labChair.add(leg);
    chairLegs.push(leg);
  }
  let chairBent = 0;
  function chairBend() { chairBent = Math.min(1, chairBent + 0.55); }

  const scientists = SCIENTIST_SPECS.map((_, i) => buildScientist(i));
  let lifeSigns = scientists.length;

  function paintLifeSigns() {
    const tint = monitorState.purple ? '#b06cff' : '#ff4438';
    const tex = lifeSignsTexture(lifeSigns, tint);
    obs.lifeFace.material.map?.dispose?.();
    obs.lifeFace.material.map = tex;
    obs.lifeFace.material.emissiveMap = tex;
    obs.lifeFace.material.needsUpdate = true;
  }

  /* ================================================================== */
  /* SILENT NIGHT -- THE GAS                                             */
  /*                                                                      */
  /* "Gas from the ceiling vents -- thin and white first, thickening to   */
  /* purple-grey."                                                        */
  /*                                                                       */
  /* A point cloud seeded inside the lab's volume, fed from the six vents  */
  /* and falling. `density` is the number the sibling paces its reactions  */
  /* off: it runs 0..1 over GAS_FILL_SECS, the colour lerps white ->       */
  /* purple-grey across it, and the lab's own tubes dim as it thickens so  */
  /* the room greys out without ever hiding the people in it.              */
  /* ================================================================== */
  const GAS_FILL_SECS = 26;
  const gasState = { on: false, density: 0, t: 0 };

  function buildGas() {
    const N = 420;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N * 3); // vent index, phase, fall speed
    for (let i = 0; i < N; i++) {
      const vent = sealed.vents[i % sealed.vents.length];
      seed[i * 3] = i % sealed.vents.length;
      seed[i * 3 + 1] = Math.random() * Math.PI * 2;
      seed[i * 3 + 2] = 0.25 + Math.random() * 0.55;
      pos[i * 3] = vent.x + (Math.random() - 0.5) * 0.6;
      pos[i * 3 + 1] = LAB_CEIL - 0.3;
      pos[i * 3 + 2] = vent.z + (Math.random() - 0.5) * 0.6;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const material = new THREE.PointsMaterial({
      size: 1.15,
      map: puffTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: 0xf4f6f8,
    });
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    root.add(points);
    return {
      points, geo, material, pos, seed, N,
    };
  }
  const gas = buildGas();

  /* ================================================================== */
  /* SYSTEMS                                                             */
  /* ================================================================== */
  const sfx = (name, opts = {}) => audio?.play?.(name, opts) ?? null;
  const loop = (key, opts = {}) => audio?.startLoop?.(key, opts) ?? null;
  const stop = (key, fade = 0.6) => audio?.stopLoop?.(key, fade);

  /* ---- The hidden wall. ------------------------------------------- */
  /* Its collider is the panel's own box, moved with the panel every frame
   * it is in motion. The doorway is only walkable because two tonnes of
   * masonry is genuinely somewhere else. */
  const hiddenCollider = collider(
    [SECRET_DOOR.x0, SECRET_DOOR.y0, SECRET_DOOR.z0],
    [SECRET_DOOR.x1, SECRET_DOOR.y1, SECRET_DOOR.z1],
  );
  colliders.push(hiddenCollider);
  function applyHiddenWall() {
    const dx = -HIDDEN_BACK * hiddenWallState.back;
    const dz = -HIDDEN_ACROSS * hiddenWallState.across;
    hiddenWall.panel.position.x = (SECRET_DOOR.x0 + SECRET_DOOR.x1) / 2 + dx;
    hiddenWall.panel.position.z = (SECRET_DOOR.z0 + SECRET_DOOR.z1) / 2 + dz;
    hiddenCollider.min.set(SECRET_DOOR.x0 + dx - 0.02, SECRET_DOOR.y0, SECRET_DOOR.z0 + dz - 0.02);
    hiddenCollider.max.set(SECRET_DOOR.x1 + dx + 0.02, SECRET_DOOR.y1, SECRET_DOOR.z1 + dz + 0.02);
  }
  applyHiddenWall();

  function openHiddenWall() {
    if (hiddenWallState.phase !== 'shut') return false;
    hiddenWallState.phase = 'back';
    hiddenWallState.t = 0;
    sfx('silent.bust.switch', {
      volume: 0.8,
      position: hiddenWall.plinth.position.clone().setY(CELLAR_Y + 1.0),
      ref: 1.4,
      maxDist: 14,
    });
    sfx('silent.wall.mechanism', {
      volume: 0.95,
      delay: 0.35,
      position: new THREE.Vector3(SECRET_DOOR.x0, CELLAR_Y + 1.2, (SECRET_DOOR.z0 + SECRET_DOOR.z1) / 2),
      ref: 3,
      maxDist: 30,
    });
    hiddenWall.switchLever.rotation.z = -0.7;
    return true;
  }
  function closeHiddenWall() {
    if (hiddenWallState.phase === 'shut' || hiddenWallState.phase === 'returning') return false;
    hiddenWallState.phase = 'returning';
    hiddenWallState.t = 0;
    sfx('silent.wall.seat', {
      volume: 0.95,
      position: new THREE.Vector3(SECRET_DOOR.x0, CELLAR_Y + 1.2, (SECRET_DOOR.z0 + SECRET_DOOR.z1) / 2),
      ref: 3,
      maxDist: 30,
    });
    hiddenWall.switchLever.rotation.z = 0;
    return true;
  }

  /* ---- The stairwell's ambience. Started the first time the wall opens
   * and stopped when it seats, which is also the spec's "lab sound cuts to
   * nothing" on the way out. */
  let ambienceOn = false;
  function startUnderworldAmbience() {
    if (ambienceOn) return;
    ambienceOn = true;
    loop('silent.stairwell.ambience', {
      name: 'silent.stairwell.ambience', volume: 0.24, ambience: true, fade: 2.4,
    });
    loop('silent.fluorescent.buzz', {
      name: 'silent.fluorescent.buzz',
      volume: 0.16,
      position: new THREE.Vector3(
        (INTERROGATION.x0 + INTERROGATION.x1) / 2, LAB_CEIL - 0.4, 53.6,
      ),
      ref: 3,
      maxDist: 16,
      ambience: true,
      fade: 1.6,
    });
    loop('silent.chain.creak', {
      name: 'silent.chain.creak',
      volume: 0.2,
      position: new THREE.Vector3(XXX_AT.x, LAB_Y + 1.6, XXX_AT.z),
      ref: 2.2,
      maxDist: 12,
      ambience: true,
      fade: 1.4,
    });
    loop('silent.core.hum', {
      name: 'silent.core.hum',
      volume: 0.3,
      position: new THREE.Vector3(CORE_AT.x, LAB_Y + 1.7, CORE_AT.z),
      ref: 4,
      maxDist: 34,
      ambience: true,
      fade: 2.6,
    });
  }
  function stopUnderworldAmbience() {
    if (!ambienceOn) return;
    ambienceOn = false;
    for (const k of [
      'silent.stairwell.ambience', 'silent.fluorescent.buzz',
      'silent.chain.creak', 'silent.core.hum', 'silent.gas.hiss',
      'silent.choking', 'silent.alarm',
    ]) stop(k, 0.5);
  }

  /* ---- The glass door. -------------------------------------------- */
  function openGlassDoor() {
    if (glassDoorState.locked) return false;
    glassDoorState.target = 1;
    sfx('silent.door.open', {
      volume: 0.8,
      position: new THREE.Vector3((GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2, LAB_Y + 1.2, GLASS_WALL.z1),
      ref: 3,
      maxDist: 24,
    });
    return true;
  }
  function closeGlassDoor() {
    glassDoorState.target = 0;
    sfx('silent.door.seal', {
      volume: 0.85,
      position: new THREE.Vector3((GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2, LAB_Y + 1.2, GLASS_WALL.z1),
      ref: 3,
      maxDist: 24,
    });
    return true;
  }
  /**
   * Bolt it. Everything the spec asks for happens here and in one order:
   * the door shuts, four steel bolts engage, the indicator goes green to
   * red, and the scientists' audio becomes muffled from this moment.
   */
  function lockGlassDoor() {
    glassDoorState.target = 0;
    glassDoorState.locked = true;
    sfx('silent.door.seal', {
      volume: 0.9,
      position: new THREE.Vector3((GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2, LAB_Y + 1.2, GLASS_WALL.z1),
      ref: 3,
      maxDist: 26,
    });
    sfx('silent.door.bolts', {
      volume: 0.95,
      delay: 0.55,
      position: new THREE.Vector3((GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2, LAB_Y + 1.2, GLASS_WALL.z1),
      ref: 3,
      maxDist: 26,
    });
    obs.lockLever.rotation.x = -0.9;
    obs.keypadLamp.material = M_RED_LAMP;
    glassAudio.prime();
    glassAudio.setEngaged(true, 0.7);
    return true;
  }
  function unlockGlassDoor() {
    glassDoorState.locked = false;
    obs.lockLever.rotation.x = 0;
    glassAudio.setEngaged(false, 0.5);
    return true;
  }

  /* ---- The keypad. ------------------------------------------------- */
  const keypadState = { armed: false, entry: '', accepted: false, attempts: 0 };
  function paintKeypad(textOverride = null, colour = '#3ce85e') {
    const shown = textOverride ?? (keypadState.entry.padEnd(4, '-').split('').join(' '));
    const tex = printed(`silent.keypad.${shown}.${colour}`, [shown], {
      w: 256, h: 90, bg: '#04070a', fg: colour, font: '900 46px "Courier New", monospace',
    });
    obs.keypadDisplay.material.map = tex;
    obs.keypadDisplay.material.needsUpdate = true;
  }
  const keypad = {
    /** Beat 8: Booski says lock the lab, and the pad comes alive. */
    arm() {
      keypadState.armed = true;
      keypadState.entry = '';
      keypadState.accepted = false;
      obs.keypadLamp.material = M_GREEN_LAMP;
      paintKeypad();
      return true;
    },
    disarm() { keypadState.armed = false; return true; },
    get armed() { return keypadState.armed; },
    get entry() { return keypadState.entry; },
    get accepted() { return keypadState.accepted; },
    get attempts() { return keypadState.attempts; },
    /** One key. Returns true the moment a complete correct code lands. */
    press(ch) {
      if (!keypadState.armed || keypadState.accepted) return false;
      sfx('silent.keypad.key', {
        volume: 0.5, position: obs.keypad.getWorldPosition(new THREE.Vector3()), ref: 1.2, maxDist: 10,
      });
      keypadState.entry = (keypadState.entry + String(ch)).slice(-4);
      paintKeypad();
      if (keypadState.entry.length === LAB_CODE.length) return keypad.enter(keypadState.entry);
      return false;
    },
    /**
     * Submit a code. Returns true ONLY for '6969'; anything else buzzes,
     * clears and counts an attempt. The verifier walks the space either
     * side of the right answer, so this is deliberately exact-match on a
     * string rather than a number -- '06969' and 6969.0 are not the code.
     */
    enter(s) {
      keypadState.attempts++;
      const code = String(s ?? '');
      const at = obs.keypad.getWorldPosition(new THREE.Vector3());
      if (code !== LAB_CODE) {
        keypadState.entry = '';
        paintKeypad('ERROR', '#ff4438');
        obs.keypadLamp.material = M_RED_LAMP;
        sfx('silent.keypad.reject', { volume: 0.7, position: at, ref: 1.4, maxDist: 12 });
        return false;
      }
      keypadState.entry = LAB_CODE;
      keypadState.accepted = true;
      paintKeypad(LAB_CODE.split('').join(' '), '#3ce85e');
      sfx('silent.keypad.accept', { volume: 0.75, position: at, ref: 1.4, maxDist: 12 });
      lockGlassDoor();
      return true;
    },
  };

  /* ---- The transfer drawer. --------------------------------------- */
  const drawerState = { travel: 0, target: 0, sent: false, loaded: false };
  const DRAWER_THROW = 0.62; // metres from the observation face to the lab face
  const transferDrawer = {
    get sent() { return drawerState.sent; },
    get loaded() { return drawerState.loaded; },
    /** Booski puts the container in it. */
    load() {
      drawerState.loaded = true;
      container.group.visible = true;
      sfx('silent.drawer.open', {
        volume: 0.65, position: obs.drawerFrame.position.clone(), ref: 2, maxDist: 16,
      });
      return true;
    },
    /** ...and the drawer slides through into the lab. */
    send() {
      if (!drawerState.loaded) transferDrawer.load();
      drawerState.target = 1;
      drawerState.sent = true;
      obs.drawerLamp.material = M_GREEN_LAMP;
      sfx('silent.drawer.through', {
        volume: 0.8, position: obs.drawerFrame.position.clone(), ref: 2.4, maxDist: 20,
      });
      return true;
    },
    /** Put it back, for a checkpoint restore. */
    reset() {
      drawerState.target = 0;
      drawerState.sent = false;
      drawerState.loaded = false;
      container.group.visible = false;
      obs.drawerLamp.material = M_PURPLE_LAMP;
      return true;
    },
  };

  /* ---- The core. --------------------------------------------------- */
  const coreApi = {
    get phase() { return coreState.phase; },
    /** Whether the core has finished. `complete()` is the verb; this is the
     * adjective, and they are deliberately not the same name -- a getter and
     * a method cannot share one key, and the spec's API says `complete()`. */
    get isComplete() { return coreState.phase === 'complete'; },
    /** Beat 7: lights flicker, gold surges, purple rings rotate, sound builds. */
    begin() {
      if (coreState.phase !== 'idle') return false;
      coreState.phase = 'building';
      coreState.t = 0;
      glassAudio.play('silent.core.build', {
        volume: 0.85,
        position: new THREE.Vector3(CORE_AT.x, LAB_Y + 1.7, CORE_AT.z),
        ref: 4,
        maxDist: 34,
      });
      return true;
    },
    /** ...the core locks, and every monitor turns purple. */
    complete() {
      coreState.phase = 'complete';
      coreState.t = 0;
      const at = new THREE.Vector3(CORE_AT.x, LAB_Y + 1.7, CORE_AT.z);
      glassAudio.play('silent.core.roar', {
        volume: 1.0, position: at, ref: 5, maxDist: 40,
      });
      glassAudio.play('silent.core.lock', {
        volume: 0.85, delay: 1.6, position: at, ref: 4, maxDist: 30,
      });
      glassAudio.play('silent.voice.complete', { volume: 0.8, delay: 2.4 });
      monitors.setPurple();
      return true;
    },
  };

  /* ---- The monitors. ----------------------------------------------- */
  const monitors = {
    get purple() { return monitorState.purple; },
    /** Red to purple, in one pass. Beat 7's "every monitor turns purple". */
    setPurple(on = true) {
      monitorState.purple = !!on;
      for (const m of obs.monitors) {
        const tex = on ? m.texPurple : m.texRed;
        m.face.material.map = tex;
        m.face.material.emissiveMap = tex;
        m.face.material.needsUpdate = true;
      }
      for (const l of obs.statusLights) l.material = M_PURPLE_LAMP;
      paintLifeSigns();
      sfx('silent.monitor.turn', {
        volume: 0.55,
        position: new THREE.Vector3((OBSERVATION.x0 + OBSERVATION.x1) / 2, LAB_Y + 1.9, obs.consoleZ),
        ref: 3,
        maxDist: 18,
      });
      return true;
    },
  };

  /* ---- Silent Night. ----------------------------------------------- */
  const silentNightState = { coverUp: false, pulled: false, coverT: 0 };
  const gasApi = {
    get density() { return gasState.density; },
    get running() { return gasState.on; },
    /**
     * Beat 10. The vents open, the alarm runs inside the lab, the beacon
     * turns, and the room begins to fill. `density` climbs 0..1 over
     * GAS_FILL_SECS and is the number the sibling paces reactions off.
     */
    start() {
      if (gasState.on) return false;
      gasState.on = true;
      gasState.t = 0;
      const at = new THREE.Vector3(CORE_AT.x, LAB_CEIL - 0.4, CORE_AT.z);
      glassAudio.distant('silent.gas.release', { volume: 0.9, position: at, ref: 4, maxDist: 34 });
      glassAudio.play('silent.voice.protocol', { volume: 0.8, delay: 0.6 });
      glassAudio.loop('silent.alarm', {
        name: 'silent.alarm', volume: 0.4, position: at, ref: 5, maxDist: 40, fade: 0.8,
      });
      glassAudio.loop('silent.gas.hiss', {
        name: 'silent.gas.hiss', volume: 0.3, position: at, ref: 5, maxDist: 36, fade: 1.4, path: 'distant',
      });
      return true;
    },
    /** The choking bed. Distant and enclosed, per the owner's requirement. */
    startChoking() {
      glassAudio.loop('silent.choking', {
        name: 'silent.choking',
        volume: 0.42,
        position: new THREE.Vector3(CORE_AT.x, LAB_Y + 1.4, GLASS_WALL.z0 - 1.5),
        ref: 4,
        maxDist: 30,
        fade: 1.2,
        path: 'distant',
      });
      return true;
    },
    stopChoking(fade = 3.5) { stop('silent.choking', fade); },
    stop() {
      gasState.on = false;
      stop('silent.gas.hiss', 2.0);
      stop('silent.alarm', 2.0);
      return true;
    },
  };
  const silentNight = {
    get coverLifted() { return silentNightState.coverUp; },
    get pulled() { return silentNightState.pulled; },
    /** Booski lifts the cover and does not pull it. */
    liftCover() {
      if (silentNightState.coverUp) return false;
      silentNightState.coverUp = true;
      sfx('silent.switch.cover', {
        volume: 0.7, position: obs.silentNight.group.position.clone(), ref: 1.6, maxDist: 12,
      });
      return true;
    },
    /** The player pulls it. This is the one the mission makes them do. */
    pull() {
      if (silentNightState.pulled) return false;
      silentNightState.coverUp = true;
      silentNightState.pulled = true;
      sfx('silent.switch.pull', {
        volume: 0.9, position: obs.silentNight.group.position.clone(), ref: 1.8, maxDist: 16,
      });
      gasApi.start();
      return true;
    },
  };

  /* ================================================================== */
  /* INTERACTIONS                                                        */
  /*                                                                      */
  /* Every one of these is gated on a `can` predicate the mission owns, so */
  /* this module never decides WHEN something may be used -- only what it  */
  /* does. The sibling swaps a gate by assigning to `lab.gates.*`.         */
  /* ================================================================== */
  const gates = {
    bust: () => true,
    keypad: () => keypadState.armed,
    drawer: () => true,
    silentNight: () => silentNightState.coverUp,
    doorLock: () => !glassDoorState.locked,
  };
  /** The prompt the sibling can override without re-registering anything. */
  const labels = {
    bust: () => (hiddenWallState.phase === 'shut'
      ? 'A marble bust, and something under the lip of the plinth'
      : 'The wall is open'),
    keypad: () => (keypadState.accepted ? 'LOCKED' : 'Enter the <b>code</b>'),
    drawer: () => 'The <b>transfer drawer</b>',
    silentNight: () => 'Pull <b>SILENT NIGHT</b>',
  };

  function registerInteractions() {
    if (!interaction) return;
    const live = () => enabled();

    interaction.register(hiddenWall.switchTarget, {
      label: () => labels.bust(),
      key: 'E',
      soft: true,
      enabled: () => live() && gates.bust() && hiddenWallState.phase === 'shut',
      onUse: () => openHiddenWall(),
    });

    interaction.register(obs.keypadTarget, {
      label: () => labels.keypad(),
      key: 'E',
      soft: true,
      enabled: () => live() && gates.keypad() && !keypadState.accepted,
      /* One press enters the whole code. The player is not asked to peck out
       * four digits with a crosshair -- Booski said the code out loud and the
       * Prospect has hands. `keypad.press(ch)` exists for anything that wants
       * it digit by digit. */
      onUse: () => keypad.enter(LAB_CODE),
    });

    interaction.register(obs.drawerTarget, {
      label: () => labels.drawer(),
      key: 'E',
      soft: true,
      enabled: () => live() && gates.drawer() && !drawerState.sent,
      onUse: () => transferDrawer.send(),
    });

    interaction.register(obs.silentNight.target, {
      label: () => labels.silentNight(),
      key: 'E',
      soft: true,
      hold: 0.85,
      enabled: () => live() && gates.silentNight() && !silentNightState.pulled,
      onUse: () => silentNight.pull(),
    });

    /* Flavour, in the tone of the rest of the house: one line, no comment
     * on what any of it means. */
    const flavour = [
      [obs.gasPanel, 'Ventilation and dispersal. Two of the gauges are reading and one of them is not.'],
      [obs.estop, 'EMERGENCY SHUTDOWN. Wire-guarded, so nobody leans on it by accident.'],
      [obs.lockPost, 'A hand wheel, a throw lever and four bolts. Whatever this door is for, it is not for keeping people out.'],
      [sealed.maskCab, 'EMERGENCY RESPIRATORS. Three of them, behind glass, three metres up a bare wall, padlocked.'],
      [core.emblem, 'A small stamp on the casing. Somebody was proud enough of this to put a mark on it.'],
      [innocent.wine.sign, 'THE CELLAR. Racked to the ceiling and nobody in this family drinks wine.'],
    ];
    for (const [mesh, text] of flavour) {
      if (mesh) interaction.register(mesh, { label: text, enabled: live });
    }
  }
  registerInteractions();

  /* The crosshair callout. `xXx` is the only name in this space, which is
   * the point of it -- everybody else down here is somebody the mission
   * introduces by talking. */
  if (crosshairNames) {
    crosshairNames.register(xxx.aim, 'xXx', () => enabled());
    /* Its own walls block it. Without this the callout reads through the
     * glass and through the stairwell, which is how you end up being told
     * a man's name from the far end of a corridor you cannot see him from. */
    crosshairNames.setOccluders(occluders);
  }

  /* ================================================================== */
  /* PER-FRAME                                                           */
  /* ================================================================== */
  let time = 0;
  const _v = new THREE.Vector3();

  function update(dt) {
    time += dt;

    /* ---- the hidden wall, backward THEN sideways. */
    const hw = hiddenWallState;
    if (hw.phase === 'back') {
      hw.t += dt;
      hw.back = THREE.MathUtils.smoothstep(hw.t / HIDDEN_BACK_SECS, 0, 1);
      if (hw.t >= HIDDEN_BACK_SECS) { hw.back = 1; hw.phase = 'across'; hw.t = 0; }
      applyHiddenWall();
    } else if (hw.phase === 'across') {
      hw.t += dt;
      hw.across = THREE.MathUtils.smoothstep(hw.t / HIDDEN_ACROSS_SECS, 0, 1);
      if (hw.t >= HIDDEN_ACROSS_SECS) {
        hw.across = 1;
        hw.phase = 'open';
        startUnderworldAmbience();
      }
      applyHiddenWall();
    } else if (hw.phase === 'returning') {
      hw.t += dt;
      const k = THREE.MathUtils.smoothstep(hw.t / (HIDDEN_ACROSS_SECS + HIDDEN_BACK_SECS), 0, 1);
      hw.across = 1 - Math.min(1, k * 1.6);
      hw.back = 1 - Math.max(0, (k - 0.6) / 0.4);
      if (k >= 1) {
        hw.across = 0;
        hw.back = 0;
        hw.phase = 'shut';
        stopUnderworldAmbience();
      }
      applyHiddenWall();
    }

    /* ---- the glass door. */
    if (glassDoorState.open !== glassDoorState.target) {
      const step = dt * 0.85;
      glassDoorState.open += Math.sign(glassDoorState.target - glassDoorState.open)
        * Math.min(step, Math.abs(glassDoorState.target - glassDoorState.open));
      applyDoor();
    }
    const wantBolts = glassDoorState.locked ? 1 : 0;
    if (glassDoorState.bolts !== wantBolts) {
      glassDoorState.bolts += Math.sign(wantBolts - glassDoorState.bolts)
        * Math.min(dt * 2.4, Math.abs(wantBolts - glassDoorState.bolts));
      applyDoor();
      const red = glassDoorState.bolts > 0.5;
      glass.indicator.material.emissive.setHex(red ? 0xe83c2c : 0x3ce85e);
      glass.indicatorLight.color.setHex(red ? 0xe83c2c : 0x3ce85e);
    }

    /* ---- the transfer drawer. */
    if (drawerState.travel !== drawerState.target) {
      drawerState.travel += Math.sign(drawerState.target - drawerState.travel)
        * Math.min(dt * 0.5, Math.abs(drawerState.target - drawerState.travel));
      obs.drawerTray.position.z = DRAWER_THROW * -drawerState.travel;
      if (container.group.visible && drawerState.loaded) {
        obs.drawerTray.getWorldPosition(_v);
        container.group.position.set(_v.x, _v.y - 0.09, _v.z);
      }
    }

    /* ---- the failing fluorescent, and the stairwell's own buzz. */
    const flick = Math.sin(time * 13.7) * Math.sin(time * 2.9) > 0.35 ? 0.14 : 1;
    if (interrogation.failingTube) {
      interrogation.failingTube.light.intensity = 5.0 * flick;
      interrogation.failingTube.tube.material = flick > 0.5 ? M_TUBE : M_SCREEN_OFF;
    }

    /* ---- xXx. Driven here rather than by Figure.update(), which eases a
     * standing man's arms back to his sides every frame -- upside down that
     * points them at the ceiling. */
    {
      const f = xxx.fig;
      const sway = Math.sin(time * 0.55) * 0.035 + Math.sin(time * 0.23) * 0.02;
      /* One pendulum and one slow turn, BOTH on the group whose origin is the
       * hook. `rotation.z` leaves the local Z axis alone, and the top chain
       * link sits on it, so the chain cannot come off the eye; `rotation.y`
       * turns the whole rig about the chain's own line. Chain, shackle, cuffs
       * and man move as one rigid piece and both ends stay met.
       *
       * What this replaced: `chain.rotation.y` on a root-level group whose
       * links carried absolute world coordinates. That rotates about (0,0),
       * 56.5 m away, so the same idle sway threw the chain 1.5 m sideways --
       * "the chain holding triple X is floating around". */
      xxx.hang.rotation.z = sway * 0.55;
      xxx.hang.rotation.y = XXX_FACING + sway * 0.9;
      // Shallow, painful breathing.
      const br = Math.sin(time * 0.9);
      f.chest.scale.set(1, 1 + br * 0.02, 1 + br * 0.012);
      f.torso.rotation.x = 0.1 + br * 0.02;
      /* Talking, when the mission gives him a line. The jaw and the lip are
       * `Figure`'s own shared mouth driver, run from here because this block
       * replaces `Figure.update()` entirely for him -- what used to be here
       * was that method's old `|sin(t*14)|` flap, copied, held for a guessed
       * number of seconds. It is the take now (src/core/mouth.js). */
      if (f.talkT > 0) f.talkT -= dt;
      f.voiceMouth.update(dt);
      // The drip. Falls off his head, lands in the pool, restarts. Its top is
      // his hairline (LAB_Y + 0.51) and its bottom is the pool's own surface.
      const fall = (time * 0.32) % 1;
      xxx.drip.position.y = THREE.MathUtils.lerp(LAB_Y + 0.5, LAB_FLOOR + 0.03, fall);
      xxx.drip.visible = fall < 0.94;
    }

    /* ---- the core. */
    const cs = coreState;
    cs.t += dt;
    if (cs.phase === 'building') {
      const k = Math.min(1, cs.t / 18);
      cs.ringSpeed = 0.35 + k * 3.2;
      cs.glow = 0.55 + k * 0.75;
      cs.surge = Math.max(0, Math.sin(cs.t * (2 + k * 8)) * k);
    } else if (cs.phase === 'complete') {
      cs.ringSpeed += (0 - cs.ringSpeed) * Math.min(1, dt * 1.4);
      cs.glow += (1.55 - cs.glow) * Math.min(1, dt * 0.9);
      cs.surge = 0.35 + Math.sin(cs.t * 1.3) * 0.12;
    } else {
      cs.surge = Math.sin(cs.t * 0.9) * 0.12;
    }
    cs.spin += dt * cs.ringSpeed;
    core.rings[0].rotation.y = cs.spin;
    core.rings[1].rotation.y = -cs.spin * 0.8;
    core.rings[2].rotation.y = cs.spin * 1.25;
    core.collar.rotation.y = cs.spin * 0.5;
    const pulse = cs.glow * (0.86 + Math.sin(time * 2.2) * 0.14 + cs.surge * 0.5);
    core.goldMat.emissiveIntensity = 2.0 * pulse;
    core.ringMat.emissiveIntensity = 1.7 * (0.8 + cs.glow * 0.5);
    core.goldLight.intensity = 3.4 * pulse;
    core.purpleLight.intensity = 2.6 * (0.7 + cs.glow * 0.5);
    core.goldCore.scale.setScalar(1 + cs.surge * 0.05);
    // Gold arcs, blinking, more of them the harder it is working.
    const arcChance = cs.phase === 'building' ? 0.4 : cs.phase === 'complete' ? 0.16 : 0.05;
    for (let i = 0; i < core.arcs.length; i++) {
      const on = Math.sin(time * (7 + i * 1.7) + i) > 1 - arcChance * 2;
      if (on !== core.arcs[i].visible) {
        core.arcs[i].visible = on;
        if (on && Math.random() < 0.08) {
          glassAudio.play('silent.arc', {
            volume: 0.3,
            position: new THREE.Vector3(CORE_AT.x, LAB_Y + 1.3, CORE_AT.z),
            ref: 4,
            maxDist: 22,
          });
        }
      }
    }

    /* ---- the robotic arms, working away at nothing in particular. */
    for (const a of sealed.arms) {
      a.phase += dt * 0.5;
      a.j1.rotation.y = Math.sin(a.phase) * 0.7;
      a.j2.rotation.x = Math.sin(a.phase * 1.3) * 0.4 - 0.2;
      a.j3.rotation.x = Math.sin(a.phase * 0.8) * 0.5;
    }

    /* ---- the case: its own update, then the mission's brightness boost.
     * Applied AFTER, because the prop scales both lights by its own
     * openness curve and this is a second axis on top of it. */
    caseObj.update(dt);
    caseState.boost += (caseState.target - caseState.boost) * Math.min(1, dt * 2.2);
    for (const l of caseLights) l.intensity *= caseState.boost;

    /* ---- the container's vapour. */
    if (container.group.visible) {
      const p = container.pos;
      for (let i = 0; i < container.seeds.length; i++) {
        const s = container.seeds[i];
        const f = (time * (0.25 + s * 0.2) + s) % 1;
        const a = s * Math.PI * 2 + f * 2.2;
        p[i * 3] = Math.cos(a) * (0.07 + f * 0.09);
        p[i * 3 + 1] = 0.26 + f * 0.3;
        p[i * 3 + 2] = Math.sin(a) * (0.07 + f * 0.09);
      }
      container.geo.attributes.position.needsUpdate = true;
      container.purple.material.emissiveIntensity = 2.1 + Math.sin(time * 3.1) * 0.5;
      container.goldCentre.material.emissiveIntensity = 2.8 + Math.sin(time * 4.7) * 0.9;
    }

    /* ---- the six. */
    for (const s of scientists) {
      const f = s.fig;
      if (!s.alive) {
        // The collapse. Pivots at the feet, like a felled tree, and stays.
        s._fall = Math.min(1, s._fall + dt * 0.9);
        const e = THREE.MathUtils.smoothstep(s._fall, 0, 1);
        f.root.rotation.x = e * 1.46;
        f.root.rotation.z = e * (s._fallYaw ?? 0);
        f.pelvis.position.y = 0.92 - e * 0.42;
        continue;
      }
      if (s.target) {
        const done = f.walkTo(s.target.x, s.target.z, dt, s.speed, true);
        if (done) {
          s.target = null;
          /* The second leg of Aubbie's exit. He walks to the DOORWAY and then
           * out into the observation area, because one straight line from the
           * core clips the jamb and puts him through the glass. */
          if (s.queued) {
            const next = s.queued;
            s.queued = null;
            s.stage = next.stage ?? s.stage;
            s.goTo(next.x, next.z, next.speed ?? 1.3);
            if (next.stage === 'outside') f.lookAt({ x: next.x, z: next.z + 3 });
          }
        }
      }
      if (s.stage === 'crawling') {
        // Down on the knees, torso forward, head up at the door.
        const k = Math.min(1, dt * 4);
        f.pelvis.position.y += (0.42 - f.pelvis.position.y) * k;
        f.torso.rotation.x += (0.9 - f.torso.rotation.x) * k;
        f.legL.hip.rotation.x += (-1.5 - f.legL.hip.rotation.x) * k;
        f.legR.hip.rotation.x += (-1.4 - f.legR.hip.rotation.x) * k;
        f.legL.knee.rotation.x += (1.7 - f.legL.knee.rotation.x) * k;
        f.legR.knee.rotation.x += (1.6 - f.legR.knee.rotation.x) * k;
      } else {
        f.update(dt);
      }
      if (s.stage === 'coughing' || s.stage === 'crawling') {
        s._cough -= dt;
        if (s._cough <= 0) {
          s._cough = 0.7 + Math.random() * 1.2;
          f.torso.rotation.x = 0.55;
          f.playGesture('drink', 1.2);
        }
      }
      if (s.stage === 'pounding') {
        f.armL.shoulder.rotation.x = -1.6 + Math.sin(time * 9 + s.index) * 0.5;
        f.armR.shoulder.rotation.x = -1.6 + Math.sin(time * 9 + s.index + 1.4) * 0.5;
        f.armL.elbow.rotation.x = -0.5;
        f.armR.elbow.rotation.x = -0.5;
      }
      /* ---- THE WORK LOOP.
       *
       * Owner playtest: the six of them stood at their benches doing
       * absolutely nothing until the gas arrived, which is a strange thing to
       * watch for the ten minutes of Beats 5 to 7 — the brief's whole picture
       * is a laboratory that is BUSY right up to the moment it is sealed.
       *
       * Not an animation and not a state machine: a slow cycle of the
       * gestures the Figure already has, on each man's own clock, at his own
       * bench. `_work` is his phase and it is seeded off `_t` (already
       * randomised per man in the constructor) so the six are never in step —
       * six identical people moving together is worse than six still ones.
       *
       * `reach` for something on the bench, `point` at a readout, `hands` for
       * a two-handed adjustment, and gaps of NOTHING in between, which is the
       * half that makes it read as work: a man who gestures continuously is a
       * man having an argument. Aubbie (index 0) is at the core rather than a
       * bench and gets the longer, slower version — he supervises. */
      if (s.stage === 'work' && s.alive && !s.target) {
        s._work -= dt;
        if (s._work <= 0) {
          const lead = s.index === 0;
          /* Half the cycles are a pause. `gap` is what a bench looks like. */
          const move = WORK_GESTURES[(s._workN++ + s.index) % WORK_GESTURES.length];
          s._work = (lead ? 2.6 : 1.7) + Math.random() * (lead ? 3.4 : 2.6);
          if (move !== 'gap') f.playGesture(move, s._work * 0.62);
        }
      }
    }

    /* ---- handprints fading up on the inside of the glass. */
    for (const h of handprints) {
      if (h.t >= 1) continue;
      h.t = Math.min(1, h.t + dt * 1.4);
      h.mesh.material.opacity = h.t * 0.9;
    }

    /* ---- SILENT NIGHT's safety cover, and the lever it lets go of.
     * `coverT` was declared and never spent, so the cover stayed shut over
     * the handle for the whole of beats 10 and 11 while the mission told the
     * player it had been lifted and then that it had been pulled. It is
     * hinged at the back of the pedestal, so it stands up out of the way. */
    {
      const wantCover = silentNightState.coverUp ? 1 : 0;
      if (silentNightState.coverT !== wantCover) {
        silentNightState.coverT += Math.sign(wantCover - silentNightState.coverT)
          * Math.min(dt * 1.6, Math.abs(wantCover - silentNightState.coverT));
        obs.silentNight.cover.rotation.x = -1.25 * silentNightState.coverT;
      }
      const wantLever = silentNightState.pulled ? 1.1 : 0; // toward the player
      if (obs.silentNight.lever.rotation.x !== wantLever) {
        const at = obs.silentNight.lever.rotation.x;
        obs.silentNight.lever.rotation.x = at + (wantLever - at) * Math.min(1, dt * 3.5);
      }
    }

    /* ---- the bent chair. */
    if (chairBent > 0) {
      chairBack.rotation.x = -chairBent * 0.75;
      chairBack.scale.y = 1 - chairBent * 0.25;
      chairLegs[0].rotation.z = chairBent * 0.6;
      chairLegs[3].rotation.z = -chairBent * 0.45;
      labChair.rotation.z = chairBent * 0.25;
    }

    /* ---- the gas. */
    if (gasState.on) {
      gasState.t += dt;
      gasState.density = THREE.MathUtils.clamp(gasState.t / GAS_FILL_SECS, 0, 1);
      const d = gasState.density;
      gas.material.opacity = 0.02 + d * 0.3;
      gas.material.size = 1.0 + d * 1.1;
      // Thin and white first, thickening to purple-grey.
      gas.material.color.setRGB(
        THREE.MathUtils.lerp(0.96, 0.55, d),
        THREE.MathUtils.lerp(0.97, 0.48, d),
        THREE.MathUtils.lerp(0.98, 0.62, d),
      );
      const p = gas.pos;
      for (let i = 0; i < gas.N; i++) {
        const vent = sealed.vents[gas.seed[i * 3]];
        const phase = gas.seed[i * 3 + 1];
        const speed = gas.seed[i * 3 + 2];
        let y = p[i * 3 + 1] - speed * dt * (0.5 + d);
        const floorLevel = LAB_Y + 0.15 + d * 2.2;
        if (y < floorLevel - (1 - d) * 1.4) {
          y = LAB_CEIL - 0.28;
          p[i * 3] = vent.x + (Math.random() - 0.5) * 0.7;
          p[i * 3 + 2] = vent.z + (Math.random() - 0.5) * 0.7;
        }
        p[i * 3 + 1] = y;
        p[i * 3] += Math.sin(time * 0.6 + phase) * dt * (0.25 + d * 0.7);
        p[i * 3 + 2] += Math.cos(time * 0.5 + phase * 1.3) * dt * (0.25 + d * 0.7);
        p[i * 3] = THREE.MathUtils.clamp(p[i * 3], SEALED_LAB.x0 + 0.2, SEALED_LAB.x1 - 0.2);
        p[i * 3 + 2] = THREE.MathUtils.clamp(p[i * 3 + 2], SEALED_LAB.z0 + 0.2, SEALED_LAB.z1 - 0.2);
      }
      gas.geo.attributes.position.needsUpdate = true;
      // The vents stand open, and the room greys out without going dark.
      for (const v of sealed.vents) {
        for (const lv of v.louvres) lv.rotation.x = Math.min(1.1, gasState.t * 1.6);
      }
      for (const t of sealed.labTubes) t.light.intensity = 5.6 * (1 - d * 0.45);
    }

    /* ---- the crosshair callout. */
    crosshairNames?.update();
  }

  /* ================================================================== */
  /* FLOOR RESOLUTION                                                    */
  /* ================================================================== */
  const STEP_TOLERANCE = 0.85;
  function inRect(r, x, z) {
    return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  }
  /**
   * Every candidate floor this module offers at (x, z).
   *
   * THE THRESHOLD IS ITS OWN RECT, and it is not decoration. The landing
   * stops at the outside face of the wing's west wall and the corridor
   * starts at the inside face, so the 0.3 m the doorway itself occupies
   * belonged to neither -- and MansionInterior's fallback for a point with
   * no candidate is the podium four metres overhead, so the first step
   * through the open wall tried to lift the player onto the ground floor
   * and simply stopped them dead in the opening. Caught by walking through
   * the door rather than by asserting the door existed.
   */
  const THRESHOLD = Object.freeze({
    x0: SECRET_DOOR.x0 - 0.06,
    x1: SECRET_DOOR.x1 + 0.06,
    z0: SECRET_DOOR.z0,
    z1: SECRET_DOOR.z1,
  });
  function floorCandidates(x, z) {
    const out = [];
    if (inRect(THRESHOLD, x, z)) out.push(CELLAR_Y);
    if (inRect(LANDING, x, z)) out.push(CELLAR_Y);
    if (inRect(STAIRWELL, x, z)) out.push(stairFloorAt(z));
    if (inRect(LOWER, x, z)) out.push(LAB_Y);
    return out;
  }
  /**
   * Merge this module's floors with whatever the house already resolved.
   *
   * Called from main.js's `world.groundAt`. Uses MansionInterior's own rule
   * -- the highest candidate no more than one step above your feet -- so a
   * player on the west wing's ground floor keeps the podium and a player in
   * the interrogation hall four metres under it keeps the slab, with no
   * "whose rect wins" arbitration anywhere.
   */
  function resolveFloor(x, z, feetY, base = null) {
    const cands = floorCandidates(x, z);
    if (base !== null && base !== undefined) cands.push(base);
    if (!cands.length) return base ?? null;
    let best = -Infinity;
    for (const c of cands) if (c <= feetY + STEP_TOLERANCE && c > best) best = c;
    if (best === -Infinity) best = Math.min(...cands);
    return best;
  }
  /** Null outside this module's footprint, for anything that wants that. */
  function floorAt(x, z, feetY) {
    const cands = floorCandidates(x, z);
    if (!cands.length) return null;
    return resolveFloor(x, z, feetY, null);
  }

  /* ================================================================== */
  /* ROOMS AND ANCHORS                                                   */
  /*                                                                      */
  /* Kept on this module's own handle rather than merged into             */
  /* `window.mansion.rooms`, deliberately: the house's anchor list is      */
  /* asserted exactly (missing AND extra both fail) and a sibling pass is  */
  /* adding to the same scene tonight. These are walked by their own tour  */
  /* in tools/verify-mansion.mjs, and that tour asserts it covers every    */
  /* room named here -- the same invariant, kept locally.                  */
  /* ================================================================== */
  const rooms = {
    landing: { rect: LANDING, floor: CELLAR_Y, anchor: { x: -18.0, y: CELLAR_Y, z: 65.6 } },
    interrogation: {
      rect: INTERROGATION, floor: LAB_Y, anchor: { x: -20.5, y: LAB_Y, z: 53.0 },
    },
    observation: {
      rect: OBSERVATION, floor: LAB_Y, anchor: { x: -32.6, y: LAB_Y, z: 53.4 },
    },
    sealedLab: { rect: SEALED_LAB, floor: LAB_Y, anchor: { x: -32.6, y: LAB_Y, z: 44.4 } },
  };
  const anchors = {
    corridorWestEnd: { x: -14.6, y: CELLAR_Y, z: 65.85 },
    bust: {
      x: SECRET_DOOR.x1 + 0.95, y: CELLAR_Y, z: SECRET_DOOR.z0 - 0.5,
    },
    doorway: {
      x: (SECRET_DOOR.x0 + SECRET_DOOR.x1) / 2, y: CELLAR_Y, z: (SECRET_DOOR.z0 + SECRET_DOOR.z1) / 2,
    },
    landingCentre: { x: -18.0, y: CELLAR_Y, z: 65.4 },
    stairTop: { x: (STAIRWELL.x0 + STAIRWELL.x1) / 2, y: CELLAR_Y, z: STAIRWELL.z1 - 0.4 },
    stairFoot: { x: (STAIRWELL.x0 + STAIRWELL.x1) / 2, y: LAB_Y, z: STAIRWELL.z0 - 0.5 },
    xxx: { x: XXX_AT.x + 2.0, y: LAB_Y, z: XXX_AT.z },
    toolTable: { x: interrogation.table.x, y: LAB_Y, z: interrogation.table.z - 1.3 },
    crossOpening: { x: CROSS_WALL.x, y: LAB_Y, z: (CROSS_WALL.openZ0 + CROSS_WALL.openZ1) / 2 },
    console: { x: CONSOLE_BANKS[0].x1 - 0.6, y: LAB_Y, z: obs.consoleZ + 1.3 },
    consoleEast: { x: CONSOLE_BANKS[1].x0 + 0.9, y: LAB_Y, z: obs.consoleZ + 1.3 },
    keypad: { x: GLASS_DOOR.x1 + 0.9, y: LAB_Y, z: GLASS_WALL.z1 + 1.3 },
    glassDoor: {
      x: (GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2, y: LAB_Y, z: GLASS_WALL.z1 + 1.2,
    },
    drawer: { x: obs.drawerFrame.position.x, y: LAB_Y, z: GLASS_WALL.z1 + 1.1 },
    transferTable: { x: obs.transferTable.x, y: LAB_Y, z: obs.transferTable.z + 1.1 },
    silentNight: {
      x: obs.silentNight.group.position.x - 1.0, y: LAB_Y, z: obs.silentNight.group.position.z + 0.9,
    },
    aubbieExecution: {
      x: (GLASS_DOOR.x0 + GLASS_DOOR.x1) / 2, y: LAB_Y, z: GLASS_WALL.z1 + 1.6,
    },
    coreView: { x: CORE_AT.x, y: LAB_Y, z: GLASS_WALL.z1 + 2.2 },
    labCentre: { x: CORE_AT.x, y: LAB_Y, z: CORE_AT.z },
    wineCellar: {
      x: (innocent.wine.x0 + innocent.wine.x1) / 2 - 1.0, y: CELLAR_Y, z: (innocent.wine.z0 + innocent.wine.z1) / 2,
    },
    entertainment: {
      x: (innocent.entertainment.x0 + innocent.entertainment.x1) / 2, y: CELLAR_Y, z: innocent.entertainment.z0 + 1.9,
    },
  };

  /* ================================================================== */
  /* THE HANDLE                                                          */
  /*                                                                      */
  /* This is the seam. `src/mansion/mission/` drives every one of these   */
  /* and this module decides none of the order they happen in.            */
  /* ================================================================== */
  const lab = {
    /* -- the hidden entrance -- */
    hiddenWall: {
      open: () => openHiddenWall(),
      close: () => closeHiddenWall(),
      get phase() { return hiddenWallState.phase; },
      get isOpen() { return hiddenWallState.phase === 'open'; },
      get travel() { return { back: hiddenWallState.back, across: hiddenWallState.across }; },
      rect: { ...SECRET_DOOR },
      panel: hiddenWall.panel,
      bust: hiddenWall.plinth,
      switchTarget: hiddenWall.switchTarget,
    },

    /* -- the glass door -- */
    openDoor: () => openGlassDoor(),
    closeDoor: () => closeGlassDoor(),
    lockDoor: () => lockGlassDoor(),
    unlockDoor: () => unlockGlassDoor(),
    get doorLocked() { return glassDoorState.locked; },
    get doorOpen() { return glassDoorState.open > 0.9; },
    get bolts() { return glassDoorState.bolts; },
    /** green | red. The indicator over the door, read off the material. */
    get indicator() {
      return glass.indicator.material.emissive.getHex() === 0x3ce85e ? 'green' : 'red';
    },

    keypad,
    transferDrawer,
    core: coreApi,
    monitors,
    gas: gasApi,
    silentNight,
    scientists,
    /** Index 0, by name, because the mission says his name constantly. */
    get aubbie() { return scientists[0]; },
    /**
     * What the execution's trigger pull is aimed at.
     *
     * `mission/mount.js` looks for this FIRST, and only falls back to a
     * five-degree cone round a position when the lab offers nothing. His
     * whole figure, so a shot at his chest, his head or his coat all count,
     * and the crosshair reads him the way it reads every other body.
     */
    get aubbieTarget() { return scientists[0]?.object ?? null; },
    get lifeSigns() { return lifeSigns; },
    /** True from the moment the door locks. The spec's own word. */
    get muffled() { return glassAudio.engaged; },
    glassAudio,

    /** The entertainment area's television. `main.js` mounts core/tv.js on
     * `screen`; `cast.js` posts the cellar guard off `at`. */
    tv: innocent.tv,

    /* -- the case, carried forward from The Silver Case -- */
    case: {
      prop: caseObj,
      group: caseObj.group,
      open: () => {
        caseObj.open();
        /* `silent.case.latches`, NOT `heist.shubes_case` -- that one is a line
         * of the Shubenator's from THE TAKE and it was playing here. See the
         * cue's own note in SILENT_SQUATCH_CUES. */
        sfx('silent.case.latches', {
          volume: 0.6, position: caseObj.group.position.clone(), ref: 1.4, maxDist: 12,
        });
        lab.case.brighten(2.1);
        return true;
      },
      close: (opts) => caseObj.close(opts),
      get isOpen() { return caseObj.isOpen(); },
      get openness() { return caseObj.openness(); },
      /** The second axis: how hard the two internal lights are pushed. */
      brighten: (k = 1.6) => { caseState.target = k; return k; },
      get glowBoost() { return caseState.boost; },
      /** Park it somewhere -- the transfer table, Lou's desk, a floor. */
      placeAt: (x, y, z, rotY = 0) => {
        caseObj.group.position.set(x, y, z);
        caseObj.group.rotation.y = rotY;
      },
      /** Faint vibration and a low electrical hum while it is carried. */
      hum: (on = true) => {
        if (on === caseState.hum) return caseState.hum;
        caseState.hum = on;
        if (on) {
          loop('silent.case.hum', {
            name: 'silent.case.hum',
            volume: 0.22,
            position: caseObj.group.position.clone(),
            ref: 1.2,
            maxDist: 8,
            fade: 0.8,
          });
        } else stop('silent.case.hum', 0.5);
        return on;
      },
      lights: caseLights,
    },
    /** The container inside it. Never shown clearly, and out exactly once. */
    container: {
      group: container.group,
      get visible() { return container.group.visible; },
      lift: () => {
        container.group.visible = true;
        sfx('silent.container.lift', {
          volume: 0.6, position: container.group.position.clone(), ref: 1.4, maxDist: 10,
        });
        return true;
      },
      placeAt: (x, y, z) => container.group.position.set(x, y, z),
    },

    /* -- the man on the hook -- */
    xxx: {
      group: xxx.hang,
      figure: xxx.fig,
      aim: xxx.aim,
      at: { ...XXX_AT, y: LAB_Y },
      /**
       * The rig, in world y, so "the chain reaches" is a number and not a
       * claim: `hook` is the top of the first link (it engages the eye under
       * the ceiling plate), `bar` is the shackle the last link lands on, and
       * `ankleY` is where his ankles actually are. Chain, shackle and man are
       * all children of one group pivoting at the hook, so these three do not
       * move relative to each other -- ever.
       */
      rig: { ...xxx.chainSpan },
      chain: xxx.chain,
      pool: xxx.pool,
      /** He is barely conscious, so this is a rasp, not a delivery. */
      say: (cue, opts = {}) => {
        const secs = opts.seconds ?? 2.2;
        if (!cue) {
          xxx.fig.speak(secs);
          return true;
        }
        const source = plainSay(cue, {
          volume: opts.volume ?? 0.8,
          position: new THREE.Vector3(XXX_AT.x, LAB_Y + 0.7, XXX_AT.z),
          ref: 2,
          maxDist: 18,
          ...opts,
        });
        /* Play, then move the mouth on what is playing (src/core/mouth.js). */
        xxx.fig.speak(secs, source ? { audio, source } : null);
        return true;
      },
      cough: () => {
        xxx.fig.speak(0.5);
        return true;
      },
      /** He survives. Nothing in this module can change that. */
      get alive() { return true; },
    },
    /** What the crosshair currently reads, and the readout element's text. */
    get crosshairText() { return crosshairNames?.text ?? null; },

    /* -- gates and labels the mission owns -- */
    gates,
    labels,
    /**
     * The meshes a player actually points at. Handed out so the mission can
     * put a marker on one and so the verifier can prove each is reachable by
     * AIMING at it rather than by calling the method behind it.
     */
    targets: {
      bustSwitch: hiddenWall.switchTarget,
      keypad: obs.keypadTarget,
      drawer: obs.drawerTarget,
      /** The SURFACE, not the aim box. `mission/mount.js` puts the case here;
       * `drawer` above is what the crosshair reads. Two different jobs that
       * were being done by one object, and the case ended up in the wall. */
      tableSpot: obs.tableSpot,
      silentNight: obs.silentNight.target,
      doorLock: obs.lockPost,
      xxx: xxx.aim,
      core: core.group,
      transferTable: obs.transferTable,
    },

    /* -- geometry, for the mission and the verifier -- */
    rooms,
    anchors,
    rects: {
      SECRET_DOOR: { ...SECRET_DOOR },
      LANDING: { ...LANDING },
      STAIRWELL: { ...STAIRWELL },
      INTERROGATION: { ...INTERROGATION },
      OBSERVATION: { ...OBSERVATION },
      SEALED_LAB: { ...SEALED_LAB },
      GLASS_WALL: { ...GLASS_WALL },
      GLASS_DOOR: { ...GLASS_DOOR },
      CROSS_WALL: { ...CROSS_WALL },
      LOWER: { ...LOWER },
      wineCellar: {
        x0: innocent.wine.x0, x1: innocent.wine.x1, z0: innocent.wine.z0, z1: innocent.wine.z1,
      },
      entertainment: { ...innocent.entertainment },
    },
    datums: { CELLAR_Y, LAB_Y, LAB_CEIL, LANDING_CEIL },
    code: LAB_CODE,
    /** Cue names + prompts, so a verifier can prove they were authored. */
    cues: SILENT_SQUATCH_CUES.map(([name, prompt]) => ({ name, prompt })),
    /** How many colliders this module put into the world list. */
    get colliderCount() { return colliders.length; },
    /** Counts a verifier can assert without re-deriving the geometry. */
    inventory: {
      scientists: scientists.length,
      workstations: sealed.stations.length,
      roboticArms: sealed.arms.length,
      chemicalTanks: sealed.tanks.length,
      coolantTubes: sealed.coolant.length,
      gasVents: sealed.vents.length,
      monitors: obs.monitors.length,
      statusLights: obs.statusLights.length,
      torture: [...new Set(interrogation.tools)],
      wineRacks: innocent.wine.racks.length,
      decorArt: decorArt.length,
      get handprints() { return handprints.length; },
      get chairBent() { return chairBent; },
      coreRings: core.rings.length,
      hasFatSquatchEmblem: !!core.emblem,
      /* Measured, not asserted: how far the cabinet's own bottom edge is
       * above the lab floor, and whether anything in the room could get a
       * hand to it. Nothing can -- there is no bench, no stool and no ladder
       * within reach of that wall, and the door is padlocked. */
      maskCabinetHeight: +(sealed.maskCab.position.y - 0.31 - LAB_Y).toFixed(2),
      get masksReachable() {
        return (sealed.maskCab.position.y - 0.31 - LAB_Y) < 2.4;
      },
    },
  };

  return {
    root,
    colliders,
    occluders,
    lights,
    rooms,
    anchors,
    /** Registered here rather than on the house's list -- see the note at
     * `buildHiddenWall`. The corridor's west end stays blank as far as the
     * house-wide art sweep is concerned; these hang on the door itself. */
    art: decorArt,
    floorAt,
    resolveFloor,
    update,
    lab,
    cues: SILENT_SQUATCH_CUES,
  };
}

