import * as THREE from 'three';

// The cracked bathroom mirror actually reflects. Prospect's body lives on
// render layer 1 — invisible to the first-person camera, visible to this one —
// so the only place the player ever sees himself is here.
//
// Not a physically exact planar reflection: the virtual camera is aimed at the
// mirror's centre rather than using an oblique frustum. On a small mirror the
// player stands square to, the difference doesn't read.

const PLANE_X = 2.06; // mirror plane, normal +X

export class MirrorReflection {
  constructor(scene, mirrorMesh, { width = 0.85, height = 1.05 } = {}) {
    this.scene = scene;
    this.mesh = mirrorMesh;
    this.width = width;
    this.height = height;
    this.center = mirrorMesh.position.clone();
    this.enabled = false;

    this.target = new THREE.WebGLRenderTarget(320, 400, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    // A mirror image is laterally inverted relative to the virtual view.
    this.target.texture.wrapS = THREE.RepeatWrapping;
    this.target.texture.repeat.x = -1;
    this.target.texture.offset.x = 1;

    this.cam = new THREE.PerspectiveCamera(50, width / height, 0.1, 40);
    this.cam.layers.enable(1);

    // Silvered glass: the reflection, tinted and grubby, under the cracks.
    this.mesh.material = new THREE.MeshBasicMaterial({
      map: this.target.texture,
      color: 0x9aa4ac,
    });

    const crackTex = makeCrackTexture();
    const overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false })
    );
    overlay.position.copy(mirrorMesh.position);
    overlay.position.x += 0.006;
    overlay.rotation.copy(mirrorMesh.rotation);
    overlay.renderOrder = 2;
    scene.add(overlay);
    this.overlay = overlay;
  }

  render(renderer, camera) {
    if (!this.enabled) return;
    // Only worth the pass when he's actually in the room with it
    if (camera.position.x > 7.2 || camera.position.z < 14.2) return;

    this.cam.position.set(
      2 * PLANE_X - camera.position.x,
      camera.position.y,
      camera.position.z
    );
    this.cam.lookAt(this.center);
    this.cam.updateMatrixWorld();

    const prevTarget = renderer.getRenderTarget();
    this.mesh.visible = false;
    this.overlay.visible = false;
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.cam);
    renderer.setRenderTarget(prevTarget);
    this.mesh.visible = true;
    this.overlay.visible = true;
  }
}

function makeCrackTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 320);
  // Grime around the edges
  const g = ctx.createRadialGradient(128, 160, 40, 128, 160, 180);
  g.addColorStop(0, 'rgba(30,36,32,0)');
  g.addColorStop(1, 'rgba(22,28,24,.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = 'rgba(180,190,180,.10)';
  for (let i = 0; i < 60; i++) ctx.fillRect((i * 97) % 256, (i * 61) % 320, 14, 4);

  const cx = 168;
  const cy = 118;
  ctx.strokeStyle = 'rgba(238,244,252,.8)';
  ctx.lineWidth = 1.7;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    let x = cx;
    let y = cy;
    const len = 60 + (i % 4) * 45;
    for (let s = 0; s < 4; s++) {
      x += Math.cos(a + (s % 2 ? 0.22 : -0.18)) * (len / 4);
      y += Math.sin(a + (s % 2 ? 0.22 : -0.18)) * (len / 4);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i <= 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.4;
    const r = 20 + (i % 2) * 9;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
