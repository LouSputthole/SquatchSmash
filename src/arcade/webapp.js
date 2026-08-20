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
 * keys that get you out. DOOM is somebody else's site, and a cross-origin
 * frame is a sealed box: no listener, no reading its state, no knowing
 * whether it loaded. So every same-origin convenience here is optional, and
 * there is always a way out that does not depend on any of them.
 *
 * ---------------------------------------------------------------------------
 * THE WAY OUT, and why it is shaped like this
 * ---------------------------------------------------------------------------
 * This used to be one line of text -- "TAB = EXIT TO DESKTOP" -- and inside
 * DOOM it was a lie twice over. Tab is DOOM's automap, and the apartment never
 * saw the key anyway. Measured, in Chromium, with a page that swallows keys
 * exactly the way the real one does:
 *
 *   - focusing the frame moves the parent's activeElement to the <iframe> and
 *     fires blur on the parent window. document.hasFocus() stays true, so
 *     there is nothing there to test either;
 *   - while the frame holds the keyboard the parent sees NOTHING: no keydown,
 *     no keyup, no repeat, for Tab or anything else. A held Tab is not
 *     observable from out here, and no amount of cleverness changes that;
 *   - the parent's OWN elements, stacked above the frame, still get the full
 *     pointer sequence -- pointerover, pointerdown, click -- and moving the
 *     mouse onto one of them and calling focus() takes the keyboard BACK off
 *     the frame, while the framed page carries on running. The frame does not
 *     see those keys, so the game does not eat them either.
 *
 * The mouse was no better off, and for two reasons that had nothing to do with
 * origins: the apartment hides the pointer over its own canvas (it is normally
 * locked), and the button was pinned to the monitor, which the head drifts
 * around every time the mouse moves. You could not see the pointer, and the
 * one thing you were aiming at ran away from it. Both are dealt with below.
 *
 * So the exit is one small control the parent owns, pinned to the corner of
 * the SCREEN -- see _placeExit for the several hundred pixels of reason why
 * not the corner of the monitor -- offering three routes to the same place:
 *
 *   1. click it. Always works, needs no keyboard, and is instant -- a way out
 *      of a game you are stuck in is not a thing to make somebody hold;
 *   2. put the pointer on it and HOLD TAB. Pointing at it hands the keyboard
 *      back to the apartment, so the hold is ours to see; a tap still belongs
 *      to whatever is running (DOOM's automap keeps working);
 *   3. inside a same-origin app, hold Tab anywhere -- we can listen in there,
 *      so the pointer does not have to be anywhere in particular.
 *
 * The label says HOLD TAB and the line under it says which of those is live
 * right now, because a control that claims something that is not true at this
 * instant is how the player ended up trapped in the first place.
 */
import { W, H } from './os.js';
import { ScreenOverlay } from './screenoverlay.js';

/** Seconds of held Tab that mean "let me out". The flat's holds are 0.5-1.1s. */
export const EXIT_HOLD = 0.6;

/** The promise on the tin. Kept exported so the verifier reads it from here. */
export const EXIT_LABEL = 'HOLD TAB = EXIT TO DESKTOP';

/** The line underneath, which says which route is actually live. */
const EXIT_HINT = {
  idle: 'click, or point here to hold',
  armed: 'keyboard is yours — hold TAB',
  holding: 'holding…',
  frame: 'or hold TAB on the game',
};

const EXIT_TITLE = 'Click to go back to the SquatchOS desktop. '
  + 'Or point at this and hold Tab: while the pointer is here the keyboard '
  + 'belongs to the apartment again. '
  + 'If the game has taken the mouse pointer, press Esc first.';

const DIM = 'rgba(150,170,200,0.35)';
const AMBER = '#ffb648';

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
    this.requiresDomInput = true;
    this.overlay = new ScreenOverlay(src);
    this.t = 0;
    this._onLoad = null;
    this._frameKeys = null;

    /** Seconds Tab has been held on a route the apartment can actually see. */
    this.exitHold = 0;
    this._holding = false;
    this._holdStart = 0;
    this._holdTimer = null;
    /** True while the control has the keyboard, i.e. the pointer is on it. */
    this._armed = false;

    this._buildExit();

    /*
     * The apartment hides the mouse pointer over its own canvas, because it is
     * a first-person game and the pointer is normally locked. A framed app is
     * the one time it is deliberately NOT locked -- and a player who cannot
     * see the pointer cannot aim it at the way out. Put the arrow back for as
     * long as one of these is on the monitor.
     */
    this._cursorRule = document.createElement('style');
    this._cursorRule.textContent = 'canvas#scene { cursor: default; }';
  }

  /* ---------------------------------------------------------------- */
  /* The exit control                                                  */
  /* ---------------------------------------------------------------- */

  _buildExit() {
    this.quit = document.createElement('button');
    this.quit.type = 'button';
    this.quit.setAttribute('aria-label', 'Exit to the SquatchOS desktop');
    this.quit.title = EXIT_TITLE;
    Object.assign(this.quit.style, {
      position: 'fixed', display: 'none',
      /* Above the frame, and above the apartment's HUD layer as well: this is
       * the one piece of chrome that must never end up under anything. */
      zIndex: '11',
      font: '600 11px ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#cdd6e4', background: 'rgba(10,13,20,0.9)',
      border: `1px solid ${DIM}`, borderRadius: '3px',
      padding: '4px 8px 5px', cursor: 'pointer', letterSpacing: '0.04em',
      textAlign: 'left', lineHeight: '1.4', minWidth: '178px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.55)',
    });

    this.quitLabel = document.createElement('span');
    this.quitLabel.textContent = EXIT_LABEL;
    this.quitLabel.style.display = 'block';

    this.quitHow = document.createElement('span');
    this.quitHow.textContent = EXIT_HINT.idle;
    Object.assign(this.quitHow.style, {
      display: 'block', font: '400 9px ui-monospace, SFMono-Regular, Menlo, monospace',
      color: '#7f8ca4', letterSpacing: '0.02em', marginTop: '1px',
    });

    /* The same hold bar the flat uses for hold-to-interact: a thin amber fill
     * under the label, so this reads as the gesture the player already knows. */
    this.quitBar = document.createElement('span');
    Object.assign(this.quitBar.style, {
      display: 'block', height: '2px', marginTop: '3px', borderRadius: '2px',
      background: 'rgba(255,255,255,0.12)', overflow: 'hidden', opacity: '0',
    });
    this.quitFill = document.createElement('i');
    Object.assign(this.quitFill.style, {
      display: 'block', height: '100%', width: '0%', background: AMBER,
    });
    this.quitBar.appendChild(this.quitFill);

    this.quit.append(this.quitLabel, this.quitHow, this.quitBar);

    /* Route 1: the click. Instant on purpose. */
    this.quit.addEventListener('click', (e) => {
      e.preventDefault();
      this._toDesktop();
    });

    /* Route 2: pointing at it takes the keyboard back off the framed page,
     * which is the only reason a held Tab is visible to us at all. Letting go
     * of the corner hands the keyboard straight back, so WASD belongs to the
     * game again the moment the pointer leaves. */
    this.quit.addEventListener('pointerenter', () => this.quit.focus({ preventScroll: true }));
    this.quit.addEventListener('pointerleave', () => {
      if (!this._holding) this.overlay.focusFrame();
    });
    this.quit.addEventListener('focus', () => { this._armed = true; this._paintExit(); });
    this.quit.addEventListener('blur', () => {
      this._armed = false;
      this._cancelHold();
      this._paintExit();
    });

    this.quit.addEventListener('keydown', (e) => {
      if (e.code !== 'Tab') return;
      /* Both of these matter. preventDefault keeps Tab from walking the focus
       * off this button -- which would hand the keyboard to nobody halfway
       * through the hold -- and stopPropagation keeps the apartment's own
       * document listener from reading the press as the old tap-to-exit. */
      e.preventDefault();
      e.stopPropagation();
      this._beginHold();
    });
    this.quit.addEventListener('keyup', (e) => {
      if (e.code !== 'Tab') return;
      e.preventDefault();
      e.stopPropagation();
      this._cancelHold();
      /* Let go of Tab with the pointer already gone from the corner and the
       * game would be left with no keyboard and nobody holding anything. */
      if (!this.quit.matches(':hover')) this.overlay.focusFrame();
    });
  }

  /**
   * Start the hold.
   *
   * What finishes it is a timer, not a frame count. The room's dt is scaled by
   * whatever he has taken, and the frame rate is whatever is left over from
   * running a whole second game in an iframe -- so 0.6 seconds has to mean 0.6
   * seconds however few frames that turns out to be, and the way out has to
   * keep working on the day the room stops drawing altogether. The frames only
   * fill the bar in.
   */
  _beginHold() {
    if (this._holding) return;
    this._holding = true;
    this.exitHold = 0;
    this._holdStart = performance.now();
    clearTimeout(this._holdTimer);
    this._holdTimer = setTimeout(() => {
      if (this._holding) this._toDesktop();
    }, EXIT_HOLD * 1000);
    this._paintExit();
  }

  _cancelHold() {
    clearTimeout(this._holdTimer);
    this._holdTimer = null;
    if (!this._holding) return;
    this._holding = false;
    this.exitHold = 0;
    this._paintExit();
  }

  /** Fill the bar in. The hold itself is on the clock, not on the frames. */
  _tickHold() {
    if (!this._holding) return;
    const p = Math.min(1, (performance.now() - this._holdStart) / (EXIT_HOLD * 1000));
    this.exitHold = p * EXIT_HOLD;
    this.quitFill.style.width = `${Math.round(p * 100)}%`;
  }

  _toDesktop() {
    this._cancelHold();
    this.os?.toDesktop();
  }

  /** Say which route is live right now rather than which one we wish were. */
  _paintExit() {
    const live = this._armed || this._holding;
    this.quitHow.textContent = this._holding ? EXIT_HINT.holding
      : this._armed ? EXIT_HINT.armed
        : this.sameOrigin ? EXIT_HINT.frame : EXIT_HINT.idle;
    this.quit.style.borderColor = live ? 'rgba(255,182,72,0.85)' : DIM;
    this.quit.style.color = live ? '#ffdca6' : '#cdd6e4';
    this.quitBar.style.opacity = this._holding ? '1' : '0';
    if (!this._holding) this.quitFill.style.width = '0%';
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

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
    /* Publish the transition before releasing pointer lock. The apartment can
     * then distinguish a framed app asking for its cursor from a real pause. */
    this.os?.setInputMode?.('dom');
    this.show();

    /* The apartment holds the pointer while you are sat down, and a locked
     * pointer means clicks never reach the page. Give it up; clicking the room
     * again takes it back. */
    if (document.pointerLockElement) document.exitPointerLock?.();

    this._bindFrameKeys();

    /*
     * The page is very likely still loading, and the keyboard it was just
     * handed belongs to a document that is about to be thrown away. Whoever it
     * lands on when the real one arrives decides what Tab means, so give it to
     * the frame again on load -- otherwise the apartment is left holding keys
     * that belong to the game, and which of the two happens is a race.
     */
    this._onLoad = () => {
      if (this.os?.app !== this) return;
      this._bindFrameKeys();
      if (this.overlay.visible) this.overlay.show();
    };
    this.overlay.el.addEventListener('load', this._onLoad);
  }

  /**
   * Route 3, for a page we are allowed to listen inside: hold Tab anywhere.
   *
   * Down starts the hold and up cancels it, so a tap goes nowhere and the app
   * keeps whatever Tab means to it. Nothing here is possible cross-origin,
   * which is exactly why it is not the route anything depends on.
   */
  _bindFrameKeys() {
    if (!this.sameOrigin) return;
    this._frameKeys ??= {
      down: (e) => {
        if (e.code !== 'Tab') return;
        e.preventDefault();     // and never walk the focus out of the frame
        this._beginHold();
      },
      up: (e) => {
        if (e.code !== 'Tab') return;
        e.preventDefault();
        this._cancelHold();
      },
    };
    this.overlay.withWindow((w) => {
      w.removeEventListener('keydown', this._frameKeys.down, true);
      w.removeEventListener('keyup', this._frameKeys.up, true);
      w.addEventListener('keydown', this._frameKeys.down, true);
      w.addEventListener('keyup', this._frameKeys.up, true);
    });
  }

  exit() {
    /* STOP IT FIRST, before any of the teardown that can throw.
     *
     * Owner playtest, 2026-08-20: *"I still can't quit Doom on the computer,
     * and the music volume is playing at full even after I get up from the
     * desk."* Both of those were one defect — exiting hid the frame and left
     * the page RUNNING, so the way out worked perfectly and was completely
     * invisible: the desktop came back and the soundtrack carried on at full
     * volume out of an iframe nobody could see. A quit that leaves the thing
     * you quit running is not a quit.
     *
     * The ORDER is the second half of it, and it is why SQUATCH SMASH went on
     * playing after DOOM had been fixed. This used to stop the page at the
     * bottom, after the listener teardown. Same-origin apps are the only ones
     * with `_frameKeys` to tear down, `withWindow` reaches into a frame that
     * may be mid-navigation, and anything it throws takes the rest of the
     * method with it — so the one app whose page we can actually talk to was
     * the one that never got told to stop. Silencing it does not depend on any
     * of that, so it does not wait for any of it.
     *
     * Guarded, because `suspend()` is overridable and one subclass overrides
     * it with something that reaches INTO the frame: `Campground.suspend()`
     * presses P inside the campground, which is the better answer for a page
     * we own — the run is paused rather than thrown away and it is still there
     * when he sits back down. Reaching into a frame mid-navigation can throw,
     * and a quit that fails because the pause failed is the bug this method
     * exists to close. */
    try { this.suspend(); } catch { /* a frame that is already gone */ }
    if (this._frameKeys) {
      this.overlay.withWindow((w) => {
        w.removeEventListener('keydown', this._frameKeys.down, true);
        w.removeEventListener('keyup', this._frameKeys.up, true);
      });
      this._frameKeys = null;
    }
    if (this._onLoad) {
      this.overlay.el.removeEventListener('load', this._onLoad);
      this._onLoad = null;
    }
    /* AND STOP IT. Owner playtest, 2026-08-20: *"I still can't quit Doom on
     * the computer, and the music volume is playing at full even after I get
     * up from the desk."*
     *
     * Those are one bug. Exiting hid the frame and left the page RUNNING, so
     * the way out worked perfectly and was completely invisible: the monitor
     * went back to the desktop, DOOM kept playing its soundtrack at full
     * volume out of an iframe nobody could see, and from where the player is
     * standing that is a game that would not quit. Standing up did the same
     * thing by the same route. A quit that leaves the thing you quit running
     * is not a quit. */
    this.hide();
    this.os?.setInputMode?.('relative');
    this.onExit?.();
  }

  /** Show every DOM layer owned by the framed app. */
  show() {
    // Sitting back down after a stand-up puts the page back on the monitor.
    this.overlay.resume();
    this.overlay.show();
    document.body.appendChild(this.quit);
    this.quit.style.display = 'block';
    if (!this._cursorRule.isConnected) document.head.appendChild(this._cursorRule);
    // In its corner from the first frame, rather than at 0,0 for one of them.
    this._placeExit();
    this._paintExit();
  }

  /**
   * Hide and detach every DOM layer owned by the framed app.
   *
   * Standing up is not the same as exiting: the app remains focused so the
   * exact session can resume when the player sits back down. Its iframe and
   * escape control must still leave the apartment view together.
   */
  hide() {
    this._cancelHold();
    this._armed = false;
    this.overlay.hide();
    this.quit.style.display = 'none';
    this.quit.remove();
    this._cursorRule.remove();
  }

  /**
   * Standing up: stop it making noise.
   *
   * `mount.js` calls this on every stand-up (`app.suspend?.()`) and has done
   * since framed apps existed. Nothing implemented it, and optional chaining
   * meant the call was a no-op that never said so -- see
   * `ScreenOverlay.suspend()` for what "hidden but still playing" costs and
   * why blanking the frame is the only thing that actually silences a
   * cross-origin page.
   */
  suspend() {
    this._cancelHold();
    return this.overlay.suspend();
  }

  /** Keep the frame on the monitor. The way out does not move with it. */
  place(...args) {
    this.overlay.place(...args);
  }

  /**
   * Where the way out lives: the apartment's own top-left corner, not the
   * monitor's.
   *
   * It used to be pinned to the corner of the frame, and that is why nobody
   * could click it. Moving the mouse while seated drifts the head, the head
   * swings the monitor, and the monitor drags the button with it -- measured
   * in the real flat, a 300px mouse move sent the button 300px across the
   * screen and left bare canvas under the pointer. The one control that must
   * never get away from the player was the one thing on screen running from
   * him. So it sits still, in the only free corner of the HUD, and the room
   * moves around it.
   */
  _placeExit() {
    this.quit.style.left = '22px';
    this.quit.style.top = '22px';
  }

  /**
   * The overlay covers this completely, so it only matters for the half-frame
   * either side of a launch -- and for the case that actually needs saying,
   * which is a page that never arrives.
   */
  update(dt) {
    this.t += dt;
    this._tickHold();
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
