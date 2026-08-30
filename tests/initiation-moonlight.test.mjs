/**
 * POORLY LIT IS NOT UNLIT.
 *
 * Owner, 2026-08-24: *"In initationscene there needs to be some more moonlight
 * to see. I dont think Im too happy with the overall layout. you should walk up
 * a poorly lit wooded trail."*
 *
 * The trail was already there -- thirty-six metres, one man wide, two bends,
 * with its own worn dirt ribbon laid along it (`src/initiation/cabin/site.js`).
 * So was the wood: a hundred and forty-eight trees, ferns, deadfall, rocks. The
 * player could not see any of it. Screenshots of the yard and of the middle of
 * the trail came back as black rectangles with a bonfire in them.
 *
 * THE NUMBERS LOOK LARGE AND THE REASON IS COLOUR SPACE, not art direction.
 * The forest floor's base is #14221a; sRGB-to-linear takes 0.078 down to about
 * 0.007 before any light touches it. Multiplying a near-zero by a small number
 * leaves a near-zero, which is why the first attempt at this fix -- 0.42 up to
 * 1.05, which reads like a big change -- came back from the screenshot pass
 * looking identical to the original.
 *
 * What this file protects is the RATIO as much as the level. The bonfire and
 * the headlights have to stay far and away the brightest things in the scene,
 * because "follow the lights" is the instruction the mission gives; a moon that
 * competes with the fire is a different scene. And the light has to have a
 * source in the sky, per the project's own rule about practicals.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const MAIN = readFileSync(
  fileURLToPath(new URL('../src/initiation/main.js', import.meta.url)), 'utf8',
);

/** The one number in a `new THREE.XLight(...)` call that is the intensity. */
function lightIntensity(source, pattern) {
  const match = source.match(pattern);
  assert.ok(match, `no light matched ${pattern}`);
  return Number(match[1]);
}

test('the moon is bright enough to walk by', () => {
  const moon = lightIntensity(MAIN, /new THREE\.DirectionalLight\(0x9db4e6,\s*([\d.]+)\)/);
  const sky = lightIntensity(MAIN, /new THREE\.HemisphereLight\(0x[0-9a-f]+,\s*0x[0-9a-f]+,\s*([\d.]+)\)/);
  assert.ok(moon >= 2.4,
    `the moon is back down to ${moon}. Against a forest floor whose base is `
    + '#14221a -- about 0.007 in linear -- anything under about 2.4 renders the '
    + 'wood as the background colour and the player walks through geometry he '
    + 'cannot see');
  assert.ok(sky >= 1.2,
    `the sky fill is ${sky}; the shadowed side of every trunk goes black below `
    + 'about 1.2');
});

test('and the fire is still the brightest thing in the wood', () => {
  /* The mission's own instruction is "follow the lights". A moon that competes
   * with the bonfire is a different scene, so the ratio is asserted rather than
   * assumed: the bonfire is a point light and the headlights are spots, and
   * both are an order of magnitude up on the moon. */
  const moon = lightIntensity(MAIN, /new THREE\.DirectionalLight\(0x9db4e6,\s*([\d.]+)\)/);
  const bonfire = readFileSync(
    fileURLToPath(new URL('../src/initiation/cabin/exterior.js', import.meta.url)), 'utf8',
  );
  const fireIntensities = [...bonfire.matchAll(/PointLight\(0x[0-9a-f]+,\s*([\d.]+)/g)]
    .map((match) => Number(match[1]));
  const headlights = [...bonfire.matchAll(/SpotLight\(0x[0-9a-f]+,\s*([\d.]+)/g)]
    .map((match) => Number(match[1]));
  const brightest = Math.max(0, ...fireIntensities, ...headlights);
  assert.ok(brightest > moon * 6,
    `the brightest practical in the clearing is ${brightest} against a moon of `
    + `${moon}. "Follow the lights" needs the lights to be worth following`);
});

test('the light has a moon to come out of', () => {
  /* A scene lit by a moon nobody can find reads as a scene with the brightness
   * turned up, which is the note rather than the fix for it. */
  assert.match(MAIN, /moonDisc/, 'the moon in the sky is gone');
  assert.match(MAIN, /const _moonDirection = _moonOffset\.clone\(\)\.normalize\(\);/,
    'the disc and the light no longer share one bearing, so the shadows point '
    + 'somewhere the moon is not');
  assert.match(MAIN, /moonDisc\.position\.copy\(player\.position\)\s*\n?\s*\.addScaledVector\(_moonDirection, MOON_DISTANCE\);/,
    'the moon does not ride the player, so it parallaxes across a thirty-metre '
    + 'walk -- which reads as a moon a hundred metres away');
  assert.match(MAIN, /fog: false/, 'the moon is fogged out by its own night air');
  assert.match(MAIN, /userData\.sceneAuditIgnore = true/,
    'the moon is not declared as an effect, so the site float gate will report '
    + 'it as a three-hundred-metre-high object with nothing under it');
});
