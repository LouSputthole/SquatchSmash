/**
 * The Silver Sasquatches crest, as it goes onto the aeroplane and the bomb.
 *
 * Owner playtest, 2026-08-04: "Aircraft is nice. Needs Squatch logo." and
 * "Squatch logo on the bomb too."
 *
 * The club's artwork already exists and is already wired into the game:
 * `assets/art/logo-crest.png`, reached through `src/world/gear.js`'s
 * `crest.round` slot — the same file that hangs in the apartment and in Big
 * Uncle Lou's office at the Bing. Nothing here mints a new art slot or a new
 * manifest entry; the composition root (`./main.js`) resolves that existing
 * slot once and hands the texture to `applyCrest()`.
 *
 * Two pieces, because the aeroplane and the payload are both built
 * synchronously at boot while `resolveGear` is a promise:
 *
 *   `crestPlaceholderTexture()` — a drawn crest, on the badge from frame one,
 *      so no surface is ever blank while the file loads (and so the scene
 *      still reads correctly if the file is missing entirely, which is the
 *      same contract `gear.js`'s own FALLBACKS keep).
 *   `applyCrest(meshes, texture)` — swap the drawn one for the real one when
 *      it arrives, preserving each badge's own material settings.
 */
import * as THREE from 'three';
import { drawSquatchSilhouette } from '../world/textures.js';

const PURPLE = '#4a2f8f';
const PURPLE_DEEP = '#2a1a55';
const SILVER = '#c9ccd4';

/**
 * A round club crest: purple field, silver ring, the Squatch Family
 * silhouette, and the club's name curved round the top.
 *
 * @returns {THREE.CanvasTexture}
 */
export function crestPlaceholderTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 512);

  // Field.
  const field = g.createRadialGradient(256, 210, 40, 256, 256, 250);
  field.addColorStop(0, PURPLE);
  field.addColorStop(1, PURPLE_DEEP);
  g.fillStyle = field;
  g.beginPath();
  g.arc(256, 256, 236, 0, Math.PI * 2);
  g.fill();

  // Two silver rings.
  g.strokeStyle = SILVER;
  g.lineWidth = 14;
  g.beginPath();
  g.arc(256, 256, 232, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  g.arc(256, 256, 206, 0, Math.PI * 2);
  g.stroke();

  // The family silhouette, mid-field.
  drawSquatchSilhouette(g, 256, 372, 232, SILVER);

  // Curved club name across the top of the ring.
  g.save();
  g.translate(256, 256);
  g.fillStyle = SILVER;
  g.font = '600 40px "Trebuchet MS", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const name = 'SILVER SASQUATCHES';
  const step = 0.116;
  let angle = -((name.length - 1) * step) / 2;
  for (const ch of name) {
    g.save();
    g.rotate(angle);
    g.translate(0, -172);
    g.fillText(ch, 0, 0);
    g.restore();
    angle += step;
  }
  g.restore();

  // Motto bar along the bottom.
  g.fillStyle = SILVER;
  g.font = '600 30px "Trebuchet MS", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('EST. 2021', 256, 424);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Put the real crest on badges that are currently wearing the drawn one.
 *
 * @param {THREE.Mesh[]} meshes badge planes built with their own material
 * @param {?THREE.Texture} texture from `resolveGear('crest.round')`
 * @returns {number} how many badges were repainted
 */
export function applyCrest(meshes, texture) {
  if (!texture || !meshes?.length) return 0;
  let n = 0;
  for (const m of meshes) {
    if (!m?.material) continue;
    // The drawn crest is this badge's own canvas — dispose it, or a scene
    // that reloads the aeroplane leaks one 512x512 texture per badge.
    m.material.map?.dispose?.();
    m.material.map = texture;
    m.material.needsUpdate = true;
    n++;
  }
  return n;
}
