/**
 * SQUATCH SMASH -- the real one.
 *
 * The campground rampage game in game/: silver sasquatch, ninety seconds, one
 * campground, and everything in it breakable. It predates the apartment and
 * has always been the thing the desk PC was supposed to be running; what was
 * on there before was a shooting gallery wearing its name, which is now
 * called Squatch Shoot.
 *
 * It is not reimplemented here and it is not modified. It is a whole
 * application -- its own three.js, its own renderer, its own HTML menus and
 * leaderboard -- so this app is a shim: it puts the real page on the monitor
 * (see screenoverlay.js), hands it the keyboard, and gets out of the way.
 *
 * What it still owns is everything the ROOM needs to know: the light the
 * screen throws, what the OS draws underneath, and getting the player back to
 * the desktop.
 */
import { W, H } from './os.js';
import { ScreenOverlay } from './screenoverlay.js';

/** Where the game lives, relative to the apartment's index.html. */
const GAME_URL = 'game/index.html';

export class Campground {
  constructor({ os, audio } = {}) {
    this.id = 'smash';
    this.label = 'SQUATCH\nSMASH.exe';
    this.os = os;
    this.audio = audio;
    this.overlay = new ScreenOverlay(GAME_URL);
    this.t = 0;
    this._escape = null;
  }

  /** Desktop icon: the mascot's silhouette mid-swing, over a campfire glow. */
  drawIcon(g, cx, cy, s) {
    g.save();
    g.translate(cx, cy);
    const r = s * 0.42;

    g.fillStyle = '#1b2a1d';
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
    // Fire behind him.
    const fire = g.createRadialGradient(0, r * 0.35, 1, 0, r * 0.35, r);
    fire.addColorStop(0, '#ffb04a');
    fire.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = fire;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();

    // Squat body, long arms, one up.
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
    // Red bandana.
    g.fillStyle = '#c8323a';
    g.fillRect(-r * 0.23, -r * 0.40, r * 0.46, r * 0.12);
    g.restore();
  }

  enter() {
    this.t = 0;
    this.overlay.show();

    /* The apartment holds the pointer while you are sat down, and a locked
     * pointer means clicks never reach the page -- so START RAMPAGE cannot be
     * pressed. Give it up; clicking the room again takes it back. */
    if (document.pointerLockElement) document.exitPointerLock?.();

    /* Tab is the OS's way out of any app, but the keyboard belongs to the
     * embedded page now, so the apartment never sees the key. Listen for it
     * inside instead. Tab is free in there -- the game pauses on Esc and P. */
    this._escape = (e) => {
      if (e.code !== 'Tab') return;
      e.preventDefault();
      this.os?.toDesktop();
    };
    this.overlay.withWindow((w) => w.addEventListener('keydown', this._escape, true));
    // The page may still be loading on the very first launch.
    this.overlay.el.addEventListener('load', () => {
      this.overlay.withWindow((w) => w.addEventListener('keydown', this._escape, true));
      if (this.os?.app === this) this.overlay.show();
    });
  }

  exit() {
    if (this._escape) {
      this.overlay.withWindow((w) => w.removeEventListener('keydown', this._escape, true));
      this._escape = null;
    }
    this.overlay.hide();
    /* Leaving the monitor should not leave a rampage running in a window
     * nobody can see. The game pauses on P, and it is the same page next
     * time, so the run is still there when you sit back down. */
    this.overlay.withWindow((w) => {
      w.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyP', key: 'p', bubbles: true }));
    });
  }

  update(dt) {
    this.t += dt;
    /* The overlay covers this completely, so it only has to be the right
     * colour for the half-frame either side of a launch, and to be something
     * sensible if a browser ever refuses the iframe. */
    const g = this.os.g;
    g.fillStyle = '#0d160e';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#7f8b74';
    g.font = '600 15px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText('SQUATCH SMASH', W / 2, H / 2 - 6);
    g.font = '12px ui-monospace, monospace';
    g.fillStyle = '#4d5847';
    g.fillText('loading the campground…', W / 2, H / 2 + 16);
    g.textAlign = 'left';
  }

  /**
   * Firelight and evening sky, so the room picks up the right colour off the
   * monitor. The campground runs day into dusk over its ninety seconds, so
   * this warms and dims the same way rather than sitting on one value.
   */
  glow() {
    const k = Math.min(1, this.t / 90);
    return {
      colour: k > 0.55 ? 0xffa262 : 0xbcd3ee,
      intensity: 1.25 - k * 0.25,
    };
  }
}
