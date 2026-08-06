/**
 * Glue on the wall.
 *
 * A pooled set of white quads that land on the north wall behind the desk and
 * stay there for the rest of the run. Separate from StreamSystem, which does
 * physics, collision and merging because it has to follow an arc across a
 * whole room; this needs none of that -- everything lands on one known plane a
 * few centimetres in front of it, so the whole thing is: pick a spot, scale a
 * blob, fade it in.
 *
 * Blobs come in two parts: a round head and a thin run underneath it, because
 * glue on a vertical surface sags and a circle on its own reads as a sticker.
 */
import * as THREE from 'three';

const MAX = 26;

let _tex = null;

/** How far down the texture the round head sits, 0 top to 1 bottom. */
export const BLOB_HEAD_Y = 0.38;

/**
 * A blob with a soft edge and a drip hanging off the bottom of it.
 *
 * Exported so anything else in the flat that needs glue on it -- not just the
 * wall -- paints from the same canvas rather than growing its own idea of
 * what a blob looks like. Margo's dress used to fake this with a squashed
 * sphere and a box; two different-looking messes from the same bottle in the
 * same scene is the kind of thing a player notices even if they cannot say
 * why.
 */
export function blobTexture() {
  if (_tex) return _tex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');

  // Head.
  const headY = S * BLOB_HEAD_Y;
  const grad = g.createRadialGradient(S / 2, headY, S * 0.04, S / 2, headY, S * 0.30);
  grad.addColorStop(0, 'rgba(255,255,255,0.98)');
  grad.addColorStop(0.6, 'rgba(250,250,246,0.88)');
  grad.addColorStop(1, 'rgba(248,248,242,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(S / 2, headY, S * 0.30, 0, 7);
  g.fill();

  // The run. Tapers as it goes, the way something viscous does.
  const run = g.createLinearGradient(0, headY, 0, S);
  run.addColorStop(0, 'rgba(252,252,248,0.92)');
  run.addColorStop(0.75, 'rgba(250,250,244,0.42)');
  run.addColorStop(1, 'rgba(250,250,244,0)');
  g.fillStyle = run;
  g.beginPath();
  g.moveTo(S * 0.44, headY);
  g.quadraticCurveTo(S * 0.48, S * 0.72, S * 0.50, S * 0.98);
  g.quadraticCurveTo(S * 0.52, S * 0.72, S * 0.56, headY);
  g.closePath();
  g.fill();

  // Nibble the head so it is not a perfect circle.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = (0.24 + Math.random() * 0.10) * S;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * r, headY + Math.sin(a) * r, S * (0.06 + Math.random() * 0.08), 0, 7);
    g.fill();
  }

  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace;
  return _tex;
}

/**
 * The one material recipe every glued blob in the flat shares, wall or
 * dress. Each caller clones its own instance so opacity can be driven
 * independently per blob, the same way the wall's pool does.
 */
export function createGlueBlobMaterial() {
  return new THREE.MeshStandardMaterial({
    map: blobTexture(),
    transparent: true,
    roughness: 0.28,          // wet, so it catches the light
    metalness: 0,
    depthWrite: false,
    opacity: 0,
    side: THREE.DoubleSide,
  });
}

export class SplatSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {number} wallZ  the plane blobs land on; they sit just in front
   */
  constructor(scene, wallZ = -4.40) {
    this.wallZ = wallZ;
    this.pool = [];
    this.next = 0;

    const mat = createGlueBlobMaterial();

    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < MAX; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      this.pool.push({ mesh: m, t: -1, target: 0 });
    }
  }

  /**
   * Throw a spread of glue at the wall around (x, y).
   * @param {number} n how many blobs
   */
  spray(x, y, n = 9) {
    for (let i = 0; i < n; i++) {
      const b = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;

      // Clustered, with a couple of outliers -- an even scatter looks stencilled.
      const far = Math.random() < 0.22;
      const spreadX = far ? 0.55 : 0.22;
      const spreadY = far ? 0.40 : 0.18;
      const s = (far ? 0.09 : 0.15) + Math.random() * (far ? 0.07 : 0.17);

      b.mesh.position.set(
        x + (Math.random() - 0.5) * 2 * spreadX,
        y + (Math.random() - 0.5) * 2 * spreadY,
        this.wallZ + 0.012 + Math.random() * 0.004,
      );
      b.mesh.scale.set(s, s * (1.25 + Math.random() * 0.5), 1);
      b.mesh.rotation.z = (Math.random() - 0.5) * 0.5;
      b.mesh.visible = true;
      b.mesh.material.opacity = 0;
      b.target = 0.72 + Math.random() * 0.26;
      // Staggered, so it arrives as a spray rather than as one frame of paint.
      b.t = -(i * 0.035 + Math.random() * 0.04);
    }
  }

  update(dt) {
    for (const b of this.pool) {
      if (b.t < 0) { b.t += dt; continue; }
      if (b.mesh.material.opacity >= b.target) continue;
      b.mesh.material.opacity = Math.min(b.target, b.mesh.material.opacity + dt * 3.4);
    }
  }
}
