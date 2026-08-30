/**
 * A SOUND'S BEARING IS BETWEEN TWO POINTS, AND ONE OF THEM IS THE PLAYER.
 *
 * Owner, 2026-08-24, on the Cartel Palace: enemy death audio is spatially
 * wrong -- a man dying in front of him reads as behind him.
 *
 * `AudioEngine._makePanner` puts every positioned cue at its real world
 * coordinates and hands the bearing to an HRTF panner, which is right. But a
 * panner computes that bearing against `ctx.listener`, and a listener that
 * nobody moves stays where WebAudio built it: the origin, facing -Z, up +Y,
 * for the entire mission. `AudioEngine.updateListener(camera)` is the one call
 * that fixes it, and NINE of the thirteen scenes that build an engine had
 * never made it.
 *
 * It is invisible in a small scene built around the origin and catastrophic in
 * a big one the player walks across: the Palace runs from about z +40 at the
 * fence to z -50 at the dining room, so the player crosses the phantom
 * listener partway through the mission and everything genuinely ahead of him
 * starts reading as behind.
 *
 * A source check, not a boot: these are page entry points that want a DOM, a
 * canvas and WebGL. What is being pinned is one line per scene, and one line
 * per scene is exactly the kind of thing that is missing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every module under src/ that constructs its own AudioEngine. */
function scenesWithAnEngine() {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!name.endsWith('.js')) continue;
      const source = readFileSync(full, 'utf8');
      if (/new AudioEngine\(/.test(source)) {
        found.push({ file: path.relative(ROOT, full).replaceAll('\\', '/'), source });
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

test('every scene that owns an AudioEngine tells it where the player is standing', () => {
  const scenes = scenesWithAnEngine();
  assert.ok(scenes.length >= 12,
    `only ${scenes.length} scene(s) found with an engine; the search has broken`);
  const deaf = scenes
    .filter(({ source }) => !/\.updateListener\(/.test(source))
    .map(({ file }) => file);
  assert.deepEqual(deaf, [],
    `these scenes never move the audio listener off the world origin, so every `
    + `positioned cue in them is panned as heard from (0, 0, 0) facing -Z:\n  `
    + deaf.join('\n  '));
});

test('the listener is given the camera, not the player body', () => {
  /* A listener needs an ORIENTATION as well as a position, and the player body
   * does not carry the head's pitch. `updateListener` reads
   * `getWorldPosition`/`getWorldQuaternion` off whatever it is handed, so a
   * body would silently give a listener that cannot tell front from back --
   * which is the bug this file exists for, in a subtler form. */
  for (const { file, source } of scenesWithAnEngine()) {
    const calls = [...source.matchAll(/\.updateListener\(([^)]*)\)/g)]
      .map((match) => match[1].trim());
    assert.ok(calls.length > 0, `${file} lost its listener update`);
    for (const argument of calls) {
      assert.match(argument, /camera/i,
        `${file} updates the listener from \`${argument}\`, which is not a camera`);
    }
  }
});

test('the update runs every frame, not once at boot', () => {
  /* A single call during setup is worse than none: it looks right in a source
   * grep and pins the listener to wherever the player spawned. So the call has
   * to sit inside a per-frame function -- which is not always the one named
   * `frame`. The Initiation puts it in `updateCamera(dt)`, called from the
   * loop, which is the right place for it; the rule is therefore the enclosing
   * function's SHAPE, not its name: a frame function is one the clock is
   * handed to. */
  const FRAME_NAMES = /^(frame|animate|tick|render|step|update[A-Z]?\w*)$/;
  for (const { file, source } of scenesWithAnEngine()) {
    for (const match of source.matchAll(/\.updateListener\(/g)) {
      const before = source.slice(0, match.index);
      const declaration = [...before.matchAll(/function\s+(\w+)\s*\(([^)]*)\)/g)].at(-1);
      assert.ok(declaration,
        `${file} updates the listener at module top level, so the ears are `
        + 'pinned to wherever the player was when the scene booted');
      const [, name, params] = declaration;
      const perFrame = FRAME_NAMES.test(name) || /\b(dt|now|delta|elapsed)\b/.test(params);
      assert.ok(perFrame,
        `${file} updates the listener inside \`${name}(${params})\`, which is not `
        + 'a per-frame function; the listener will stop following the player');
    }
  }
});
