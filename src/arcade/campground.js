/**
 * SQUATCH SMASH -- the real one.
 *
 * The campground rampage game in game/: silver sasquatch, ninety seconds, one
 * campground, and everything in it breakable. It predates the apartment and
 * has always been the thing the desk PC was supposed to be running; what was
 * on there before was a shooting gallery wearing its name, which is now
 * called Squatch Shoot.
 *
 * It is not reimplemented here and it is not modified -- it runs as itself in
 * a frame on the monitor. See webapp.js and screenoverlay.js. What this owns
 * is the part the ROOM needs: the icon, and the light the screen throws.
 */
import { WebApp } from './webapp.js';

/** Where the game lives, relative to the apartment's index.html. */
const GAME_URL = 'game/index.html';

export class Campground extends WebApp {
  constructor(opts = {}) {
    super({
      ...opts,
      id: 'smash',
      label: 'SQUATCH\nSMASH.exe',
      src: GAME_URL,
      // Served out of this repo, so Tab can be listened for inside it.
      sameOrigin: true,
      loading: 'loading the campground…',
    });
  }

  /** Desktop icon: the mascot mid-swing, over a campfire. */
  drawIcon(g, cx, cy, s) {
    g.save();
    g.translate(cx, cy);
    const r = s * 0.42;

    g.fillStyle = '#1b2a1d';
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    const fire = g.createRadialGradient(0, r * 0.35, 1, 0, r * 0.35, r);
    fire.addColorStop(0, '#ffb04a');
    fire.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = fire;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();

    // Squat body, long arms, one of them up.
    g.fillStyle = '#cfd4d8';
    g.beginPath();
    g.ellipse(0, r * 0.18, r * 0.34, r * 0.40, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(0, -r * 0.30, r * 0.22, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = r * 0.17;
    g.strokeStyle = '#cfd4d8';
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-r * 0.28, r * 0.10);
    g.lineTo(-r * 0.62, -r * 0.42);
    g.moveTo(r * 0.28, r * 0.10);
    g.lineTo(r * 0.56, r * 0.44);
    g.stroke();
    g.fillStyle = '#c8323a';   // the bandana
    g.fillRect(-r * 0.23, -r * 0.40, r * 0.46, r * 0.12);
    g.restore();
  }

  /**
   * Leaving the monitor should not leave a rampage running where nobody can
   * see it. The game pauses on P, and it is the same page next time, so the
   * run is still there when you sit back down.
   */
  onExit() {
    this.suspend();
  }

  /** Stop the timer when the player stands up or returns to SquatchOS. */
  suspend() {
    this.overlay.withWindow((w) => {
      if (w.SQUATCH?.state !== 'playing') return;
      w.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyP', key: 'p', bubbles: true }));
    });
  }

  /**
   * Throw away a run the player explicitly quit.
   *
   * Ordinary standing/desktop exits preserve this same-origin game's page so
   * the run can resume; the cold-open YES button is different. It says Quit,
   * shows the shutdown card and must start fresh if Squatch Smash is launched
   * again later. Use the base overlay suspension here — not this class's
   * pause-only `suspend()` override — so the hidden renderer and audio are
   * actually unloaded. `show()` will restore GAME_URL on the next launch.
   */
  closeSession() {
    return this.overlay.suspend();
  }

  /**
   * The campground runs day into dusk across its ninety seconds, so the light
   * off the monitor warms and dims the same way rather than sitting still.
   */
  glow() {
    const k = Math.min(1, this.t / 90);
    return {
      colour: k > 0.55 ? 0xffa262 : 0xbcd3ee,
      intensity: 1.25 - k * 0.25,
    };
  }
}
