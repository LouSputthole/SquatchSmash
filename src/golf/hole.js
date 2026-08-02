/**
 * Which hole is being played right now.
 *
 * Everything downstream of the layout — the heightfield, the surface model,
 * the ball, the terrain mesh, the carts, the cast and the round — used to
 * import `hole1.js` directly, which was correct exactly as long as there was
 * one hole. There are three.
 *
 * The alternative was threading a layout object through every function in the
 * scene, which would have made `heightAt(x, z)` into `heightAt(layout, x, z)`
 * and touched every call site including the ball's inner integration loop.
 * This is the smaller change and it is honest about the constraint it relies
 * on: **one hole is loaded at a time**. Silver Pines is eleven hundred yards
 * end to end and there is a fade between holes anyway, so the terrain is torn
 * down and rebuilt at each new tee rather than all three being resident. Draw
 * calls and memory stay flat no matter how many holes the course grows to.
 *
 * `HOLE` is mutated in place rather than reassigned, so a module that did
 * `import { HOLE }` keeps seeing the current hole without re-importing.
 */

import HOLE_1 from './hole1.js';
import HOLE_2 from './hole2.js';
import HOLE_3 from './hole3.js';
import { getHole } from './course.js';

/** The live layout. Read it; never write to it directly. */
export const HOLE = {};

/* Registered here rather than by each layout registering itself: a layout that
 * imported this module would make a cycle, and a cycle here would have the
 * layouts loading before the map that holds them exists. Layout files stay
 * pure data with no dependency on the runtime at all. */
const LAYOUTS = new Map([[1, HOLE_1], [2, HOLE_2], [3, HOLE_3]]);

/**
 * Register a hole's layout. Called by each `holeN.js` at import time, so
 * adding a hole is adding a file rather than editing a table here.
 */
export function registerHole(number, layout) {
  LAYOUTS.set(number, layout);
  return layout;
}

export function layoutFor(number) {
  return LAYOUTS.get(number) ?? null;
}

export function builtHoles() {
  return [...LAYOUTS.keys()].sort((a, b) => a - b);
}

/**
 * Switch to a hole.
 *
 * Throws rather than falling back, because every consumer of `HOLE` is about
 * to build geometry or launch a ball from it: a silent default here would put
 * the player on Hole 1's green holding Hole 3's scorecard.
 */
export function setActiveHole(number) {
  const layout = LAYOUTS.get(number);
  if (!layout) {
    throw new Error(`Silver Pines: hole ${number} has no layout. Built: ${builtHoles().join(', ')}`);
  }
  for (const key of Object.keys(HOLE)) delete HOLE[key];
  Object.assign(HOLE, layout);
  HOLE.meta = getHole(number);
  return HOLE;
}

export function activeHoleNumber() {
  return HOLE.number ?? null;
}

/** Hole 1 is the default so importing the scene never leaves `HOLE` empty. */
setActiveHole(1);
