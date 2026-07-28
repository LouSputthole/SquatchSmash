/**
 * The mount point for whatever runs on the desk PC.
 *
 * The apartment does not care what the game is -- it only needs an object with
 * this shape, and it will map `canvas` onto the monitor and forward input
 * while the player is seated:
 *
 *   canvas            HTMLCanvasElement, any size (640x360 looks right)
 *   boot()            called when the tower powers on
 *   powerOff()        called when it powers off
 *   update(dt)        called once per frame while seated; draw into `canvas`
 *   onPointer(dx,dy)  relative mouse motion (the pointer is locked)
 *   onClick(down)     primary mouse button
 *   onKey(code,down)  keyboard; return true if the key was consumed
 *   sampleGlow()      -> { colour: 0xRRGGBB, intensity } for the room's screen glow
 *   grantBuff(n)      optional; called when the player drinks a beer
 *
 * To swap in a different Squatch Smash build, implement that interface and
 * return it from createArcade() -- nothing else in the project changes.
 */
import { SquatchSmash } from './squatchsmash.js';

export function createArcade(opts) {
  return new SquatchSmash(opts);
}
