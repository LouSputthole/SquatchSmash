/**
 * A real web page, sitting exactly on the monitor.
 *
 * Everything else on the desk PC draws into a 2D canvas that gets mapped onto
 * the screen mesh as a texture. That works because the OS, the shooting
 * gallery and the Counter-Squatch parody were all written to draw into a
 * context handed to them.
 *
 * The campground game was not. It is a complete Three.js application with its
 * own renderer, its own three.js, and a HUD, menu, pause screen, leaderboard
 * and name entry that are all HTML. There is no context to hand it, and
 * reimplementing its interface in canvas 2D would mean maintaining two of
 * everything forever -- the thing this repo's README is explicit about
 * avoiding, since the two projects are meant not to be able to break each
 * other.
 *
 * So it is not ported. It runs, unmodified, in an iframe, and this puts that
 * iframe over the monitor: project the screen mesh's four corners into screen
 * space, solve the homography from the iframe's own rectangle onto that quad,
 * and hand it to CSS as a matrix3d. The page is then genuinely on the monitor
 * -- correct perspective, correct size, keyboard and mouse going straight to
 * it, and not one line of the game changed.
 *
 * What it does NOT get is depth. A DOM overlay draws over the WebGL canvas
 * whatever is in front of it, so this is only ever shown while the player is
 * sat at the desk with the app in focus, which is the only time nothing is
 * between him and the screen.
 */

/** The size the embedded page thinks it is. CSS maps it onto the monitor. */
export const OVERLAY_W = 960;
export const OVERLAY_H = 540;

/* ------------------------------------------------------------------ */
/* Homography                                                          */
/* ------------------------------------------------------------------ */
/* Four points to four points. The standard construction: send each quad
 * back to the unit basis, then compose one with the inverse of the other. */

function adj(m) {
  return [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ];
}

function mul(a, b) {
  const c = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j];
      c[3 * i + j] = s;
    }
  }
  return c;
}

function mulv(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** The map sending the unit basis onto these four points. */
function basisTo(p) {
  const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
  const v = mulv(adj(m), [p[3][0], p[3][1], 1]);
  return mul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

/** @returns {number[]} 3x3 sending quad `from` onto quad `to`. */
function homography(from, to) {
  return mul(basisTo(to), adj(basisTo(from)));
}

/* ------------------------------------------------------------------ */

export class ScreenOverlay {
  /**
   * @param {string} src  page to run on the monitor
   */
  constructor(src) {
    this.el = document.createElement('iframe');
    this.el.src = src;
    this.el.title = 'Squatch Smash';
    this.el.setAttribute('scrolling', 'no');
    Object.assign(this.el.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${OVERLAY_W}px`,
      height: `${OVERLAY_H}px`,
      border: '0',
      /* The corners are already where they belong in screen space, so the
       * element must not be nudged again by its own box model. */
      transformOrigin: '0 0',
      display: 'none',
      /* Above the canvas, below the apartment's own HUD -- a toast about the
       * bladder should not end up behind the monitor. */
      zIndex: '5',
      background: '#000',
      colorScheme: 'dark',
    });
    this.visible = false;
    this._corners = null;
    this._mounted = false;
  }

  /** Put it in the document. Deferred so a build that never opens it pays nothing. */
  mount() {
    if (this._mounted) return;
    document.body.appendChild(this.el);
    this._mounted = true;
  }

  show() {
    this.mount();
    this.visible = true;
    this.el.style.display = 'block';
    // The page has to have the keyboard, or WASD goes to the apartment and
    // the player walks into a wall while the sasquatch stands still.
    this.focusFrame();
  }

  /**
   * Hand the keyboard to the embedded page.
   *
   * focus() is one of the few things a parent may do to a cross-origin frame,
   * so this works for DOOM as well as for our own pages. The exit control in
   * webapp.js takes the keyboard off the frame while the pointer is on it and
   * gives it back through here the moment the pointer leaves.
   */
  focusFrame() {
    if (!this.visible) return;
    try { this.el.contentWindow?.focus(); } catch { /* cross-origin, or gone */ }
  }

  hide() {
    this.visible = false;
    this.el.style.display = 'none';
    this.el.blur();
  }

  /** Run `fn` against the embedded window, if it is there and same-origin. */
  withWindow(fn) {
    try {
      const w = this.el.contentWindow;
      if (w && w.document.readyState !== 'loading') fn(w);
    } catch { /* cross-origin, or gone */ }
  }

  /**
   * Lay the page onto the mesh as the camera currently sees it.
   *
   * @param {object} mesh    the screen plane
   * @param {object} camera
   * @param {HTMLCanvasElement} canvas  the renderer's canvas, for the viewport
   * @param {object} THREE
   */
  place(mesh, camera, canvas, THREE) {
    if (!this.visible || !mesh) return;

    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;

    const rect = canvas.getBoundingClientRect();
    if (!this._corners) {
      this._corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    }
    /* Top-left, top-right, bottom-right, bottom-left in the mesh's own plane,
     * matching the order the source rectangle is given below. */
    const local = [
      [bb.min.x, bb.max.y], [bb.max.x, bb.max.y],
      [bb.max.x, bb.min.y], [bb.min.x, bb.min.y],
    ];
    const to = [];
    for (let i = 0; i < 4; i++) {
      const v = this._corners[i].set(local[i][0], local[i][1], 0);
      v.applyMatrix4(mesh.matrixWorld).project(camera);
      /* Behind the camera, `project` flips the sign and the quad turns inside
       * out. Nothing sensible can be drawn from that, so stop. */
      if (v.z > 1) return;
      to.push([
        rect.left + (v.x * 0.5 + 0.5) * rect.width,
        rect.top + (-v.y * 0.5 + 0.5) * rect.height,
      ]);
    }

    const H = homography(
      [[0, 0], [OVERLAY_W, 0], [OVERLAY_W, OVERLAY_H], [0, OVERLAY_H]],
      to,
    );
    // CSS wants it column-major, 4x4, with the third row and column identity.
    const k = 1 / H[8];
    this.el.style.transform = 'matrix3d('
      + `${H[0] * k},${H[3] * k},0,${H[6] * k},`
      + `${H[1] * k},${H[4] * k},0,${H[7] * k},`
      + '0,0,1,0,'
      + `${H[2] * k},${H[5] * k},0,1)`;
  }
}
