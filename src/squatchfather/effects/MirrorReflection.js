import * as THREE from 'three';
import { PlanarMirror } from '../../core/planar-mirror.js';

// The cracked bathroom mirror actually reflects. Prospect's body lives on
// render layer 1 — invisible to the first-person camera, visible to this one —
// so the only place the player ever sees himself is here.
//
// Not a physically exact planar reflection: the virtual camera is aimed at the
// mirror's centre rather than using an oblique frustum. On a small mirror the
// player stands square to, the difference doesn't read.

export class MirrorReflection extends PlanarMirror {
  constructor(scene, mirrorMesh, { width = 0.85, height = 1.05 } = {}) {
    const crackTex = makeCrackTexture();
    super(scene, mirrorMesh, {
      width,
      height,
      resolution: [320, 400],
      overlayMaterial: new THREE.MeshBasicMaterial({
        map: crackTex,
        transparent: true,
        depthWrite: false,
      }),
      maxDistance: 11,
      visibleWhen: (camera) => camera.position.x <= 7.2 && camera.position.z >= 14.2,
    });
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
