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
 * while it has focus. Three things are installed:
 *
 *   Squatch Smash   the campground rampage game in game/, running for real
 *   Squatch Shoot   the shooting gallery, which used to have Smash's name
 *   Counter-Squatch a Counter-Strike parody you are not allowed to win
 *
 * Smash is the odd one. The other two draw into the context the OS hands
 * them; it is a complete separate application with its own three.js and its
 * own HTML, so it runs unmodified in an iframe laid over the monitor. See
 * campground.js. That is why `placeOverlay` exists and has to be called from
 * the frame loop -- the other two need nothing.
 *
 * To add a fourth, write an app to the interface documented in os.js and
 * register it here -- nothing else in the project changes.
 */
import { SquatchOS } from './os.js';
import { Campground } from './campground.js';
import { SquatchShoot } from './squatchshoot.js';
import { CounterSquatch } from './counterstrike.js';

export function createArcade(opts = {}) {
  const os = new SquatchOS(opts);
  const campground = new Campground({ ...opts, os });
  os.register(campground);
  os.register(new SquatchShoot({ ...opts, os }));
  os.register(new CounterSquatch({ ...opts, os }));

  /**
   * Keep the embedded page sitting on the monitor. Cheap and safe to call
   * every frame; it does nothing unless that app is the one in focus.
   */
  os.placeOverlay = (screen, camera, canvas, THREE) => {
    campground.overlay.place(screen, camera, canvas, THREE);
  };
  /**
   * Sitting down and standing up.
   *
   * The overlay is a fixed-position element, not part of the scene, so it does
   * not go away on its own when you walk off -- it would hang in the middle of
   * the room showing the last frame it was given. It is only ever on screen
   * while somebody is in the chair with the game in focus.
   */
  os.setSeated = (seated) => {
    if (os.app === campground && seated) campground.overlay.show();
    else campground.overlay.hide();
  };
  /** Whatever is on the monitor should stop when the tower does. */
  const powerOff = os.powerOff.bind(os);
  os.powerOff = () => { campground.overlay.hide(); powerOff(); };
  return os;
}
