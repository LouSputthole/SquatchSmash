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
 * while it has focus. Five things are installed:
 *
 *   Squatch Mail    the inbox. One of the messages is the day going wrong
 *   Squatch Smash   the campground rampage game in game/, running for real
 *   Squatch Shoot   the shooting gallery, which used to have Smash's name
 *   Counter-Squatch a Counter-Strike parody you are not allowed to win
 *   DOOM            mrdoob's port, framed from where it is published
 *
 * Three of those draw into the context the OS hands them. Smash and DOOM do
 * not: they are whole separate applications with their own renderers and
 * their own HTML, so they run as themselves in a frame laid over the monitor
 * (see webapp.js). That is why `placeOverlay` exists and has to be called
 * from the frame loop -- the canvas apps need nothing.
 *
 * To add a sixth, write an app to the interface documented in os.js and
 * register it here -- nothing else in the project changes.
 */
import { SquatchOS } from './os.js';
import { Mail } from './mail.js';
import { Campground } from './campground.js';
import { SquatchShoot } from './squatchshoot.js';
import { CounterSquatch } from './counterstrike.js';
import { Doom } from './doom.js';
import { Yuka } from './yuka.js';

export function createArcade(opts = {}) {
  const os = new SquatchOS(opts);
  const mail = new Mail({ ...opts, os });
  const framed = [new Campground({ ...opts, os }), new Doom({ ...opts, os })];

  os.register(mail);
  os.register(framed[0]);
  os.register(new SquatchShoot({ ...opts, os }));
  os.register(new CounterSquatch({ ...opts, os }));
  os.register(new Yuka({ ...opts, os }));
  os.register(framed[1]);

  /** The inbox, so the room can react to what is in it. */
  os.mail = mail;

  /**
   * Keep whichever framed page is up sitting on the monitor. Cheap and safe to
   * call every frame; it does nothing unless one of them is in focus.
   */
  os.placeOverlay = (screen, camera, canvas, THREE) => {
    for (const app of framed) {
      if (os.app === app) app.place(screen, camera, canvas, THREE);
    }
  };
  /**
   * Sitting down and standing up.
   *
   * An overlay is a fixed-position element, not part of the scene, so it does
   * not go away on its own when you walk off -- it would hang in the middle of
   * the room showing the last frame it was given. One is only ever on screen
   * while somebody is in the chair with that app in focus.
   */
  os.setSeated = (seated) => {
    for (const app of framed) {
      if (seated && os.app === app) app.show();
      else app.hide();
    }
  };
  /** Whatever is on the monitor should stop when the tower does. */
  const powerOff = os.powerOff.bind(os);
  os.powerOff = () => {
    for (const app of framed) app.hide();
    powerOff();
  };
  return os;
}
