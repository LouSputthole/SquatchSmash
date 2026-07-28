/**
 * The mount point for whatever runs on the desk PC.
 *
 * The apartment does not care what is installed -- it only needs an object
 * with this shape, and it will map `canvas` onto the monitor and forward
 * input while the player is seated:
 *
 *   canvas            HTMLCanvasElement, any size (640x360 looks right)
 *   boot()            called when the tower powers on
 *   powerOff()        called when it powers off
 *   update(dt)        called once per frame while seated; draw into `canvas`
 *   onPointer(dx,dy)  relative mouse motion (the pointer is locked)
 *   onClick(down)     primary mouse button
 *   onKey(code,down)  keyboard; return true if the key was consumed
 *   sampleGlow()      -> { colour: 0xRRGGBB, intensity } for the room's glow
 *   grantBuff(n)      optional; called when the player drinks a beer
 *   setImpairment(v)  optional; 0 = sober, 1+ = the crosshair drifts
 *
 * That object is SquatchOS, which supplies the boot sequence, the desktop
 * and the CRT treatment and hands each installed app the drawing context
 * while it has focus. Two things are installed: Squatch Smash, and a
 * Counter-Strike parody you are not allowed to win.
 *
 * To add a third, write an app to the interface documented in os.js and
 * register it here -- nothing else in the project changes.
 */
import { SquatchOS } from './os.js';
import { SquatchSmash } from './squatchsmash.js';
import { CounterSquatch } from './counterstrike.js';

export function createArcade(opts = {}) {
  const os = new SquatchOS(opts);
  os.register(new SquatchSmash({ ...opts, os }));
  os.register(new CounterSquatch({ ...opts, os }));
  return os;
}
