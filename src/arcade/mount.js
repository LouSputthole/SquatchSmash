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
 * while it has focus. Eight things are installed:
 *
 *   Squatch Mail    the inbox. One of the messages is the day going wrong
 *   Squatch Smash   the campground rampage game in game/, running for real
 *   Squatch Shoot   the shooting gallery, which used to have Smash's name
 *   Counter-Squatch a Counter-Strike parody you are not allowed to win
 *   How To Counter  a two-slide TeamPlay / Baiter's Brain training deck
 *   Match Result    the screenshot somebody saved after queueing
 *   Yuka vs Olive   a food-scanner comparison page
 *
 * DOOM USED TO BE ON THAT LIST AND IS NOT INSTALLED ANY MORE. `doom.js` is
 * still here and still correct; it is simply not registered. Restoring it is
 * one `os.register` call and one line of this list.
 *
 * Owner, 2026-08-24, on the opening: *"the player can accidentally enter Doom,
 * Doom is difficult to exit, the player can click through it, and after
 * leaving the computer the player sometimes cannot escape the computer
 * interaction at all... Squatch Smash is the joke. Doom is currently stepping
 * on the punchline with steel-toed boots."*
 *
 * The exit problem is not a bug that can be fixed here, and `doom.js`'s own
 * header says why: it frames `mrdoob.github.io` cross-origin, deliberately,
 * as a licensing decision -- three-doom is GPL and this repository is MIT, so
 * the page is linked rather than copied. A cross-origin frame is a sealed box.
 * No key pressed inside it can be seen from out here, which means Esc can
 * never be made to work from the parent, and the only way out is a control the
 * parent draws over the corner of somebody else's page. That is the failure
 * the owner keeps hitting, it was reported and "fixed" once already in
 * webapp.js, and it will keep coming back because it is a property of the
 * boundary rather than of the code.
 *
 * On top of that it makes the first five minutes of the campaign depend on a
 * third-party site being reachable. The reveal -- believing Squatch Smash IS
 * the game until the camera pulls back off the monitor -- is the opening's
 * whole reason to exist, and nothing about DOOM serves it.
 *
 * Two of these draw into the context the OS hands them. Smash does not: it is
 * a whole separate application with its own renderer and its own HTML, so it
 * runs as itself in a frame laid over the monitor (see webapp.js). That is why
 * `placeOverlay` exists and has to be called from the frame loop -- the canvas
 * apps need nothing.
 *
 * To add a sixth, write an app to the interface documented in os.js and
 * register it here -- nothing else in the project changes.
 */
import { SquatchOS } from './os.js';
import { Mail } from './mail.js';
import { Campground } from './campground.js';
import { SquatchShoot } from './squatchshoot.js';
import { CounterSquatch } from './counterstrike.js';
import { CounterSquatchGuide, CounterSquatchMatchPhoto } from './counter-squatch-guide.js';
import { Yuka } from './yuka.js';

export function createArcade(opts = {}) {
  const os = new SquatchOS(opts);
  const mail = new Mail({ ...opts, os });
  /* Framed pages -- ones that run in an iframe over the monitor rather than
   * drawing into the OS's canvas. One of them now; see the note above. */
  const framed = [new Campground({ ...opts, os })];

  os.register(mail);
  os.register(framed[0]);
  os.register(new SquatchShoot({ ...opts, os }));
  os.register(new CounterSquatch({ ...opts, os }));
  os.register(new CounterSquatchGuide({ ...opts, os }));
  os.register(new CounterSquatchMatchPhoto({ ...opts, os }));
  os.register(new Yuka({ ...opts, os }));

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
  /**
   * WHOSE SCREEN IS IT.
   *
   * Owner, on the opening: *"When Squatch Smash is fullscreen, the player can
   * still see main-game objectives, hub UI and other overlays. When the arcade
   * game starts, hide every single Squatch Life HUD element. The arcade
   * presentation should own the entire screen."*
   *
   * He was right, and it is measurable: with Squatch Smash up and the player in
   * the chair, `#hud` computes to opacity 1 over the top of it, carrying the
   * interaction prompt ("E Open the fridge"), the inventory bar, the day clock
   * reading "Day 1 6:04 AM" and the bladder meter. The whole joke of the
   * opening is that the player believes Squatch Smash IS the game, and a
   * bladder meter belonging to a character he does not know he has yet is the
   * single most efficient way to give that away.
   *
   * One class, because `#hud` is the ancestor of every one of those elements
   * and taking it out takes all of them. The rule lives beside the other `#hud`
   * rules in `src/style.css`, and no other scene sets this class, so it is
   * inert everywhere except here.
   *
   * The condition is a FRAMED app in focus while seated -- not merely sitting
   * down. The fake desktop is diegetic: it is a monitor in a room, and seeing
   * the room's own HUD around it is correct. A game filling that monitor is
   * the moment the room has to disappear.
   */
  let seatedNow = false;

  function paintScreenOwnership(seated) {
    const owned = Boolean(seated) && framed.includes(os.app);
    document.body?.classList.toggle('arcade-owns-screen', owned);
  }

  /* `launch` and `toDesktop` live on the OS itself, which has no business
   * knowing about the apartment's DOM. Wrapped here, where the composition
   * already overrides `setSeated`, `placeOverlay` and `launchById` -- a game
   * can be started or quit while the player stays in the chair, so seating
   * alone is not enough to keep the class honest. */
  const launch = os.launch.bind(os);
  os.launch = (app) => {
    launch(app);
    paintScreenOwnership(seatedNow);
  };
  const toDesktop = os.toDesktop.bind(os);
  os.toDesktop = () => {
    toDesktop();
    paintScreenOwnership(seatedNow);
  };

  os.setSeated = (seated) => {
    for (const app of framed) {
      if (seated && os.app === app) {
        os.setInputMode('dom');
        app.show();
      } else {
        if (!seated && os.app === app) app.suspend?.();
        app.hide();
      }
    }
    if (!seated) os.setInputMode('relative');
    seatedNow = Boolean(seated);
    paintScreenOwnership(seatedNow);
  };
  /**
   * Put one app on the monitor by name, as though it had been double-clicked.
   *
   * `setSeated` is what shows a framed page, and it only shows the app that is
   * ALREADY in focus -- so launching has to happen before seating, and this
   * exists so the cold open can do that in one call without knowing which
   * index Squatch Smash was registered at.
   */
  os.launchById = (id) => {
    const app = os.appById(id);
    if (!app) return false;
    os.launch(app);
    return true;
  };

  /** Whatever is on the monitor should stop when the tower does. */
  const powerOff = os.powerOff.bind(os);
  os.powerOff = () => {
    /* STOP, not just hide. A framed page goes on running and goes on playing
     * audio behind `display: none` -- see `ScreenOverlay.suspend()`. Switching
     * the tower off and still hearing DOOM is the same bug as quitting it and
     * still hearing DOOM, arriving by a third door. */
    for (const app of framed) { app.suspend?.(); app.hide(); }
    powerOff();
    /* powerOff() clears os.app without routing through toDesktop(), so the
     * fullscreen ownership class otherwise survives with no app left to give
     * the HUD back. Powering off is an activity exit even while seated. */
    paintScreenOwnership(false);
  };
  return os;
}
