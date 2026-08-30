import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

for (const [scene, relativePath] of [
  ['Bada Bing', 'src/bing/main.js'],
  ['Silver Room', 'src/silver/main.js'],
]) {
  test(`${scene} uses the canonical held-drink pose without owning a local copy`, () => {
    const main = source(relativePath);

    assert.match(
      main,
      /import \{ makeHeldDrinks, poseHeldDrink \} from '\.\.\/world\/props\.js';/,
      `${relativePath} does not import the canonical pose helper`,
    );
    assert.equal(
      main.match(/\bposeHeldDrink\(heldDrinks,/g)?.length,
      4,
      `${relativePath} must route initialization, cancellation, progress and completion through the shared rig`,
    );
    assert.match(
      main,
      /poseHeldDrink\(heldDrinks, game\.heldDrink === 'whiskey' \? 'bottle' : 'can', k\);/,
      `${relativePath} does not drive drink progress through the canonical helper`,
    );
    assert.doesNotMatch(main, /\bfunction\s+poseDrink\s*\(/);
    assert.doesNotMatch(main, /\bposeDrink\s*\(/);
  });
}
