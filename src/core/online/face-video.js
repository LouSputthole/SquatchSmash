/**
 * DEAD GIVEAWAY — a live camera on a makePerson head.
 *
 * makePerson (src/bing/cast.js) builds a photo head as one box skull named
 * `person.face.photo-skull` with six materials; index 4 (+z) carries the face
 * photograph, the other five are plain hair-coloured wrap. This swaps index 4
 * for a clone of that material whose map is a THREE.VideoTexture on the
 * player's stream, and swaps it back exactly on detach(). The skull is a child
 * of `head`, so the seat rig's head turns carry the video with them for free.
 *
 * Nothing shared is mutated. The photo texture is cached and shared between
 * every person wearing the same face (`faceTexture` in cast.js), and its
 * offset/repeat are the photo's own crop -- so the original material array,
 * the original material and its map are never touched. attach() installs a
 * NEW array; detach() puts the ORIGINAL array object back.
 *
 * THE FRAMING. The face box is 0.162 wide x 0.212 tall (aspect ~0.764); a
 * webcam is 4:3 or 16:9. `faceCropFor` cover-fits the video to the box --
 * crops, never letterboxes, never stretches -- and then applies the player's
 * zoom and offset from the media panel:
 *   zoom  1..4    1 = the largest crop that fits the box; 2 = half of that
 *   x    -1..1    -1 shows the left edge of what is left over, +1 the right
 *   y    -1..1    -1 the bottom, +1 the top (texture v runs bottom-up)
 * x/y are clamped so the crop never leaves the frame (no smeared edge pixels).
 * `mirror` flips u for the self-preview, the way every video call shows you
 * yourself; remote heads are never mirrored.
 *
 * CHARACTERS WITHOUT A PHOTO. A procedural head (makePerson with no `face`)
 * has no photo skull and nothing here can take its place: attach returns a
 * handle with `attached:false` whose methods do nothing. The seat author who
 * wants video on such a character builds it WITH a face -- `neutralFaceUrl()`
 * below gives a 1x1 flat data URL to pass as `face` -- which takes the photo
 * path in makePerson, so the skull and its material 4 exist. The cost: the
 * photo path builds no procedural eyes, brow or nose, so that head reads as a
 * blank skin-toned front until video attaches. Every character in the Dead
 * Giveaway roster has a face PNG (characters.js), so in practice this only
 * matters for a test dummy or a future roster entry.
 */

import * as THREE from 'three';

export const FACE_BOX = Object.freeze({ width: 0.162, height: 0.212 });
export const FACE_ASPECT = FACE_BOX.width / FACE_BOX.height;
export const FACE_MATERIAL_INDEX = 4;
export const PHOTO_SKULL_NAME = 'person.face.photo-skull';
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
const ASSUMED_VIDEO_ASPECT = 4 / 3;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Pure: texture offset/repeat that cover-fit a video of aspect `aspect`
 * (width / height) onto a target of aspect `faceAspect`, then zoom and shift.
 * Returns { offset: [u, v], repeat: [ru, rv] } for `texture.offset/repeat`.
 */
export function faceCropFor({ zoom = 1, x = 0, y = 0, aspect = ASSUMED_VIDEO_ASPECT, faceAspect = FACE_ASPECT, mirror = false } = {}) {
  const a = finite(aspect, ASSUMED_VIDEO_ASPECT) > 0 ? finite(aspect, ASSUMED_VIDEO_ASPECT) : ASSUMED_VIDEO_ASPECT;
  const f = finite(faceAspect, FACE_ASPECT) > 0 ? finite(faceAspect, FACE_ASPECT) : FACE_ASPECT;
  /* Cover: the video is wider than the box -> use its full height and a
   * slice of its width; taller -> full width, a slice of its height. */
  let ru = 1;
  let rv = 1;
  if (a > f) ru = f / a;
  else if (a < f) rv = a / f;
  const z = clamp(finite(zoom, 1), ZOOM_MIN, ZOOM_MAX);
  ru /= z;
  rv /= z;
  const sx = clamp(finite(x, 0), -1, 1);
  const sy = clamp(finite(y, 0), -1, 1);
  const u = ((1 - ru) / 2) * (1 + sx);
  const v = ((1 - rv) / 2) * (1 + sy);
  if (mirror) return { offset: [u + ru, v], repeat: [-ru, rv] };
  return { offset: [u, v], repeat: [ru, rv] };
}

/** The photo skull of a makePerson result (or of any Object3D under it), or null. */
export function findPhotoSkull(person) {
  const roots = [person?.head, person?.group, person?.isObject3D ? person : null].filter(Boolean);
  for (const root of roots) {
    const found = typeof root.getObjectByName === 'function' ? root.getObjectByName(PHOTO_SKULL_NAME) : null;
    if (found && Array.isArray(found.material) && found.material[FACE_MATERIAL_INDEX]) return found;
  }
  return null;
}

/**
 * A 1x1 flat-colour image URL to pass to makePerson as `face` for a character
 * with no photograph, so the photo skull exists for video. Browser only for
 * the canvas route; elsewhere an equivalent SVG data URL.
 */
export function neutralFaceUrl(colour = 0xd9a97f) {
  const hex = `#${(Number(colour) >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  try {
    const canvas = globalThis.document?.createElement?.('canvas');
    const ctx = canvas?.getContext?.('2d');
    if (canvas && ctx && typeof canvas.toDataURL === 'function') {
      canvas.width = 1;
      canvas.height = 1;
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, 1, 1);
      const url = canvas.toDataURL('image/png');
      if (typeof url === 'string' && url.startsWith('data:image/png')) return url;
    }
  } catch { /* fall through */ }
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="${hex}"/></svg>`)}`;
}

function noopHandle(reason) {
  return {
    attached: false,
    reason,
    texture: null,
    video: null,
    material: null,
    setFraming() {},
    setStream() {},
    detach() {},
  };
}

function makeVideoElement() {
  const doc = globalThis.document;
  if (!doc?.createElement) return null;
  const video = doc.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.autoplay = true;
  try {
    video.setAttribute?.('muted', '');
    video.setAttribute?.('playsinline', '');
    video.setAttribute?.('autoplay', '');
  } catch { /* stub element */ }
  return video;
}

function playQuietly(video) {
  try {
    const p = video.play?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* stub element */ }
}

/**
 * attachFaceVideo(person, stream, { zoom, x, y, mirror }) -> handle
 *   handle.attached           false when the person has no photo skull (or no stream)
 *   handle.texture/.video     the THREE.VideoTexture and its <video>
 *   handle.setFraming({zoom, x, y, mirror?})
 *   handle.setStream(stream)  swap the source without rebuilding (remote track changed)
 *   handle.detach()           original material array back, texture + video disposed
 */
export function attachFaceVideo(person, stream, { zoom = 1, x = 0, y = 0, mirror = false } = {}) {
  const skull = findPhotoSkull(person);
  if (!skull) return noopHandle('no-photo-skull');
  if (!stream) return noopHandle('no-stream');
  const video = makeVideoElement();
  if (!video) return noopHandle('no-document');

  const originalMaterials = skull.material;          // the array object itself, restored on detach
  const original = originalMaterials[FACE_MATERIAL_INDEX];
  const originalMap = original.map ?? null;

  video.srcObject = stream;
  playQuietly(video);

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.name = 'deadgiveaway.face-video';

  const material = original.clone();
  material.name = `${original.name || 'face'}.video`;
  material.map = texture;
  /* The photo material may be tinted by a light rig's colour; video wants
   * its own colours. */
  if (material.color?.set) material.color.set(0xffffff);
  material.needsUpdate = true;

  const materials = originalMaterials.slice();
  materials[FACE_MATERIAL_INDEX] = material;
  skull.material = materials;

  let framing = { zoom, x, y, mirror };
  let detached = false;

  function videoAspect() {
    const w = video.videoWidth;
    const h = video.videoHeight;
    return w > 0 && h > 0 ? w / h : ASSUMED_VIDEO_ASPECT;
  }

  function applyCrop() {
    const crop = faceCropFor({ ...framing, aspect: videoAspect() });
    texture.offset.set(crop.offset[0], crop.offset[1]);
    texture.repeat.set(crop.repeat[0], crop.repeat[1]);
  }

  const onMeta = () => { if (!detached) applyCrop(); };
  video.addEventListener?.('loadedmetadata', onMeta);
  video.addEventListener?.('resize', onMeta);
  applyCrop();

  const handle = {
    attached: true,
    texture,
    video,
    material,
    skull,
    setFraming(next = {}) {
      if (detached) return;
      framing = {
        zoom: next.zoom ?? framing.zoom,
        x: next.x ?? framing.x,
        y: next.y ?? framing.y,
        mirror: next.mirror ?? framing.mirror,
      };
      applyCrop();
    },
    setStream(next) {
      if (detached || !next || video.srcObject === next) return;
      video.srcObject = next;
      playQuietly(video);
    },
    detach() {
      if (detached) return;
      detached = true;
      /* Only put the original back if nobody replaced our array meanwhile. */
      if (skull.material === materials) skull.material = originalMaterials;
      if (original.map !== originalMap) original.map = originalMap;
      video.removeEventListener?.('loadedmetadata', onMeta);
      video.removeEventListener?.('resize', onMeta);
      try { video.pause?.(); } catch { /* stub */ }
      video.srcObject = null;
      video.remove?.();
      texture.dispose();
      material.map = null;
      material.dispose();
      handle.attached = false;
    },
  };
  return handle;
}
