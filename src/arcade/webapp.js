/**
 * An OS app that is a whole web page rather than something drawn on the canvas.
 *
 * Two of the things installed on the desk PC are not ours to redraw: the
 * campground game is a complete Three.js application with its own HTML, and
 * DOOM belongs to somebody else entirely. Both run as themselves, in an
 * iframe laid over the monitor -- see screenoverlay.js for how that is fitted.
 *
 * The difference between them is the origin. The campground game is served
 * out of this same repo, so we can reach into its window and listen for the
 * key that gets you out. DOOM is somebody else's site, and a cross-origin
 * frame is a sealed box: no listener, no reading its state, no knowing
 * whether it loaded. So every same-origin convenience here is optional, and
 * there is always a way out that does not depend on any of them.
 */
import { W, H } from './os.js';
import { ScreenOverlay } from './screenoverlay.js';

export class WebApp {
  /**
   * @param {object}  o
   * @param {string}  o.id
   * @param {string}  o.label
   * @param {string}  o.src         page to run on the monitor
   * @param {boolean} o.sameOrigin  can we talk to it once it is up?
   * @param {string}  o.loading     what the screen says underneath
   */
  constructor({ os, audio, id, label, src, sameOrigin = false, loading = 'loading…' }) {
    this.id = id;
    this.label = label;
    this.os = os;
    this.audio = audio;
    this.loading = loading;
    this.sameOrigin = sameOrigin;
    this.overlay = new ScreenOverlay(src);
    this.t = 0;
    this._escape = null;
    this._onLoad = null;

    /*
     * The way out.
     *
     * Tab drops you back to the desktop from any app, but once the embedded
     * page has the keyboard the apartment never sees the key -- and for a
     * cross-origin page we cannot listen inside it either. So the parent owns
     * a small button pinned to the corner of the frame. It is ours, it is
     * always on top of the page, and it works whatever is running in there.
     */
    this.quit = document.createElement('button');
    this.quit.type = 'button';
    this.quit.textContent = '‹ desktop';
    Object.assign(this.quit.style, {
      position: 'fixed', display: 'none', zIndex: '6',
      font: '600 11px ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#cdd6e4', background: 'rgba(12,16,24,0.82)',
      border: '1px solid rgba(150,170,200,0.35)', borderRadius: '3px',
      padding: '3px 7px', cursor: 'pointer', letterSpacing: '0.04em',
    });
    this.quit.addEventListener('click', (e) => {
      e.preventDefault();
      this.os?.toDesktop();
    });
  }

  /** Icon. Subclasses override; this is a plain window so something shows. */
  drawIcon(g, cx, cy, s) {
    const r = s * 0.38;
    g.fillStyle = '#1a2030';
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.fillStyle = '#3d4a63';
    g.fillRect(cx - r, cy - r, r * 2, r * 0.36);
  }

  enter() {
    this.t = 0;
    this.show();

    /* The apartment holds the pointer while you are sat down, and a locked
     * pointer means clicks never reach the page. Give it up; clicking the room
     * again takes it back. */
    if (document.pointerLockElement) document.exitPointerLock?.();

    if (!this.sameOrigin) return;
    this._escape = (e) => {
      if (e.code !== 'Tab') return;
      e.preventDefault();
      this.os?.toDesktop();
    };
    const bind = () => this.overlay.withWindow((w) => {
      w.removeEventListener('keydown', this._escape, true);
      w.addEventListener('keydown', this._escape, true);
    });
    bind();
    // It may still be loading the first time it is opened.
    this._onLoad = () => { if (this.os?.app === this) { bind(); this.overlay.show(); } };
    this.overlay.el.addEventListener('load', this._onLoad);
  }

  exit() {
    if (this._escape) {
      this.overlay.withWindow((w) => w.removeEventListener('keydown', this._escape, true));
      this._escape = null;
    }
    if (this._onLoad) {
      this.overlay.el.removeEventListener('load', this._onLoad);
      this._onLoad = null;
    }
    this.hide();
    this.onExit?.();
  }

  /** Show every DOM layer owned by the framed app. */
  show() {
    this.overlay.show();
    document.body.appendChild(this.quit);
    this.quit.style.display = 'block';
  }

  /**
   * Hide and detach every DOM layer owned by the framed app.
   *
   * Standing up is not the same as exiting: the app remains focused so the
   * exact session can resume when the player sits back down. Its iframe and
   * escape control must still leave the apartment view together.
   */
  hide() {
    this.overlay.hide();
    this.quit.style.display = 'none';
    this.quit.remove();
  }

  /** Keep the frame, and the button in its corner, on the monitor. */
  place(...args) {
    this.overlay.place(...args);
    if (!this.overlay.visible) return;
    const r = this.overlay.el.getBoundingClientRect();
    this.quit.style.left = `${Math.round(r.left + 6)}px`;
    this.quit.style.top = `${Math.round(r.top + 6)}px`;
  }

  /**
   * The overlay covers this completely, so it only matters for the half-frame
   * either side of a launch -- and for the case that actually needs saying,
   * which is a page that never arrives.
   */
  update(dt) {
    this.t += dt;
    const g = this.os.g;
    g.fillStyle = '#0a0d12';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.fillStyle = '#79839a';
    g.font = '600 15px ui-monospace, monospace';
    g.fillText(this.label.replace('\n', ' ').replace('.exe', ''), W / 2, H / 2 - 6);
    g.font = '12px ui-monospace, monospace';
    g.fillStyle = '#4a5364';
    g.fillText(this.t > 12 ? 'no reply from the server' : this.loading, W / 2, H / 2 + 16);
    g.textAlign = 'left';
  }

  glow() {
    return { colour: 0x8ea6c8, intensity: 1.1 };
  }
}
