/**
 * Dead Giveaway: src/core/online/face-video.js.
 *
 * `faceCropFor` is the whole of the framing maths, so it is pinned here
 * exactly: cover-fit (never letterbox, never stretch), zoom about the centre,
 * offsets that stop at the frame edge, and the mirror that the self-preview
 * uses. attach/detach is then checked on a stub head and on a real makePerson
 * photo head: the original material array -- and the shared, cached photo
 * texture inside it -- must come back exactly, untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureDomShim } from '../tools/three-shim.mjs';
import {
  faceCropFor, attachFaceVideo, findPhotoSkull, FACE_ASPECT, FACE_MATERIAL_INDEX, PHOTO_SKULL_NAME,
} from '../src/core/online/face-video.js';

ensureDomShim();

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const approx = (actual, expected, message) => {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((v, i) => assert.ok(close(v, expected[i]), `${message}: [${actual}] vs [${expected}]`));
};

/** The covered interval of the source frame, in texture space. */
function span(offset, repeat) {
  const a = offset;
  const b = offset + repeat;
  return [Math.min(a, b), Math.max(a, b)];
}

test('zoom 1 on a frame the same shape as the face uses all of it', () => {
  const crop = faceCropFor({ zoom: 1, x: 0, y: 0, aspect: FACE_ASPECT });
  approx(crop.repeat, [1, 1], 'repeat');
  approx(crop.offset, [0, 0], 'offset');
});

test('zoom 1 COVERS a 4:3 webcam: full height, a centred slice of the width', () => {
  const crop = faceCropFor({ aspect: 4 / 3 });
  const ru = FACE_ASPECT / (4 / 3);
  approx(crop.repeat, [ru, 1], 'repeat');
  approx(crop.offset, [(1 - ru) / 2, 0], 'offset');
  /* What shows has exactly the face box's aspect: no stretch. */
  assert.ok(close((crop.repeat[0] * (4 / 3)) / crop.repeat[1], FACE_ASPECT));
});

test('a portrait (taller than the box) frame keeps full width and crops height', () => {
  const crop = faceCropFor({ aspect: 9 / 16 });
  const rv = (9 / 16) / FACE_ASPECT;
  approx(crop.repeat, [1, rv], 'repeat');
  approx(crop.offset, [0, (1 - rv) / 2], 'offset');
});

test('zoom 2 halves the repeat and stays centred', () => {
  const one = faceCropFor({ zoom: 1, aspect: 16 / 9 });
  const two = faceCropFor({ zoom: 2, aspect: 16 / 9 });
  approx(two.repeat, [one.repeat[0] / 2, one.repeat[1] / 2], 'repeat');
  /* Centre of the crop is still the centre of the frame. */
  assert.ok(close(two.offset[0] + two.repeat[0] / 2, 0.5));
  assert.ok(close(two.offset[1] + two.repeat[1] / 2, 0.5));
});

test('zoom below 1 would letterbox, so it clamps to 1; above 4 clamps to 4', () => {
  assert.deepEqual(faceCropFor({ zoom: 0.25, aspect: 4 / 3 }), faceCropFor({ zoom: 1, aspect: 4 / 3 }));
  assert.deepEqual(faceCropFor({ zoom: 99, aspect: 4 / 3 }), faceCropFor({ zoom: 4, aspect: 4 / 3 }));
});

test('x/y offsets move the crop to the frame edge and no further', () => {
  for (const zoom of [1, 1.5, 3]) {
    for (const aspect of [4 / 3, 16 / 9, 3 / 4]) {
      for (const x of [-5, -1, -0.3, 0, 0.7, 1, 5]) {
        for (const y of [-5, -1, 0, 0.4, 1, 5]) {
          const { offset, repeat } = faceCropFor({ zoom, x, y, aspect });
          const [u0, u1] = span(offset[0], repeat[0]);
          const [v0, v1] = span(offset[1], repeat[1]);
          assert.ok(u0 >= -1e-12 && u1 <= 1 + 1e-12, `u [${u0}, ${u1}] left the frame at ${JSON.stringify({ zoom, x, y, aspect })}`);
          assert.ok(v0 >= -1e-12 && v1 <= 1 + 1e-12, `v [${v0}, ${v1}] left the frame at ${JSON.stringify({ zoom, x, y, aspect })}`);
        }
      }
    }
  }
  const zoomed = { zoom: 2, aspect: 4 / 3 };
  const left = faceCropFor({ ...zoomed, x: -1 });
  const right = faceCropFor({ ...zoomed, x: 1 });
  const top = faceCropFor({ ...zoomed, y: 1 });
  assert.ok(close(left.offset[0], 0), 'x=-1 sits on the left edge');
  assert.ok(close(right.offset[0] + right.repeat[0], 1), 'x=+1 sits on the right edge');
  assert.ok(close(top.offset[1] + top.repeat[1], 1), 'y=+1 sits on the top edge');
  assert.deepEqual(faceCropFor({ ...zoomed, x: 7 }), right, 'x past 1 clamps');
});

test('mirror negates repeat.x and shows the same slice of the frame', () => {
  for (const args of [{ aspect: 4 / 3 }, { aspect: 16 / 9, zoom: 2, x: 0.5, y: -0.25 }]) {
    const plain = faceCropFor(args);
    const mirrored = faceCropFor({ ...args, mirror: true });
    assert.ok(mirrored.repeat[0] < 0, 'repeat.x is negative');
    assert.ok(close(mirrored.repeat[0], -plain.repeat[0]));
    assert.ok(close(mirrored.repeat[1], plain.repeat[1]));
    approx(span(mirrored.offset[0], mirrored.repeat[0]), span(plain.offset[0], plain.repeat[0]), 'u span');
    assert.ok(close(mirrored.offset[1], plain.offset[1]));
  }
});

test('garbage in gives a sane cover crop, not NaN', () => {
  const crop = faceCropFor({ zoom: NaN, x: undefined, y: 'up', aspect: 0 });
  for (const n of [...crop.offset, ...crop.repeat]) assert.ok(Number.isFinite(n));
});

/* ---------------- attach / detach ---------------- */

function stubVideo() {
  const listeners = new Map();
  return {
    tagName: 'VIDEO',
    muted: false, playsInline: false, autoplay: false, srcObject: null,
    videoWidth: 0, videoHeight: 0,
    played: 0, paused: false, removed: false,
    setAttribute() {},
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    fire(type) { listeners.get(type)?.(); },
    play() { this.played++; return Promise.resolve(); },
    pause() { this.paused = true; },
    remove() { this.removed = true; },
  };
}

function withStubVideo(fn) {
  const doc = globalThis.document;
  const original = doc.createElement;
  const made = [];
  doc.createElement = (tag) => {
    if (tag === 'video') { const v = stubVideo(); made.push(v); return v; }
    return original(tag);
  };
  try { return fn(made); } finally { doc.createElement = original; }
}

function stubPerson() {
  const photo = new THREE.Texture();
  photo.offset.set(0.2, 0.06);
  photo.repeat.set(0.6, 0.86);
  const wrap = new THREE.MeshStandardMaterial({ color: 0x2a1c14 });
  const faceMat = new THREE.MeshStandardMaterial({ map: photo, roughness: 0.9 });
  const materials = [wrap, wrap, wrap, wrap, faceMat, wrap];
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.162, 0.212, 0.19), materials);
  skull.name = PHOTO_SKULL_NAME;
  const head = new THREE.Group();
  head.name = 'head';
  head.add(skull);
  const group = new THREE.Group();
  group.add(head);
  return { person: { group, head }, skull, materials, faceMat, photo };
}

test('attach puts a VideoTexture on material 4 only; detach restores the exact original', () => {
  withStubVideo((made) => {
    const { person, skull, materials, faceMat, photo } = stubPerson();
    const stream = { id: 'stream-1' };
    const handle = attachFaceVideo(person, stream, { zoom: 1.5, x: 0.2 });
    assert.equal(handle.attached, true);
    const video = made[0];
    assert.ok(video, 'a <video> was made');
    assert.equal(video.muted, true);
    assert.equal(video.playsInline, true);
    assert.equal(video.autoplay, true);
    assert.equal(video.srcObject, stream);
    assert.ok(video.played > 0, 'play() was asked for');

    assert.notEqual(skull.material, materials, 'a NEW array is installed');
    assert.equal(materials[FACE_MATERIAL_INDEX], faceMat, 'the original array is untouched');
    for (const i of [0, 1, 2, 3, 5]) assert.equal(skull.material[i], materials[i], `wrap ${i} kept`);
    const tex = skull.material[FACE_MATERIAL_INDEX].map;
    assert.ok(tex instanceof THREE.VideoTexture);
    assert.equal(tex, handle.texture);
    assert.equal(tex.colorSpace, THREE.SRGBColorSpace);
    assert.equal(tex.generateMipmaps, false);
    assert.equal(tex.minFilter, THREE.LinearFilter);
    assert.equal(tex.magFilter, THREE.LinearFilter);
    assert.equal(faceMat.map, photo, 'the shared photo texture is never reassigned');
    assert.deepEqual([photo.offset.x, photo.offset.y, photo.repeat.x, photo.repeat.y], [0.2, 0.06, 0.6, 0.86]);

    /* Until metadata the crop assumes 4:3; a 16:9 stream re-crops on loadedmetadata. */
    const before = faceCropFor({ zoom: 1.5, x: 0.2, aspect: 4 / 3 });
    assert.ok(close(tex.repeat.x, before.repeat[0]));
    video.videoWidth = 1280;
    video.videoHeight = 720;
    video.fire('loadedmetadata');
    const after = faceCropFor({ zoom: 1.5, x: 0.2, aspect: 16 / 9 });
    assert.ok(close(tex.repeat.x, after.repeat[0]) && close(tex.offset.x, after.offset[0]));

    handle.setFraming({ mirror: true });
    assert.ok(tex.repeat.x < 0, 'mirror flips repeat.x live');
    handle.setFraming({ zoom: 2, mirror: false });
    assert.ok(close(tex.repeat.x, faceCropFor({ zoom: 2, x: 0.2, aspect: 16 / 9 }).repeat[0]));

    const other = { id: 'stream-2' };
    handle.setStream(other);
    assert.equal(video.srcObject, other);

    let disposed = 0;
    tex.addEventListener('dispose', () => { disposed++; });
    handle.detach();
    assert.equal(skull.material, materials, 'the ORIGINAL array object is back');
    assert.equal(skull.material[FACE_MATERIAL_INDEX], faceMat);
    assert.equal(faceMat.map, photo);
    assert.equal(disposed, 1, 'the VideoTexture was disposed');
    assert.equal(video.srcObject, null);
    assert.equal(video.removed, true);
    assert.equal(handle.attached, false);
    handle.detach();   // idempotent
    assert.equal(disposed, 1);
  });
});

test('no photo skull, or no stream: a no-op handle with attached:false', () => {
  const head = new THREE.Group();
  head.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const none = attachFaceVideo({ head, group: head }, { id: 's' });
  assert.equal(none.attached, false);
  assert.doesNotThrow(() => { none.setFraming({ zoom: 2 }); none.setStream({}); none.detach(); });
  const { person } = stubPerson();
  assert.equal(attachFaceVideo(person, null).attached, false);
});

test('a real makePerson photo head has the skull and round-trips; a procedural one does not', async () => {
  const { makePerson } = await import('../src/bing/cast.js');
  const photo = makePerson({ face: 'assets/faces/lou.png' });
  const skull = findPhotoSkull(photo);
  assert.ok(skull, 'makePerson({face}) builds person.face.photo-skull');
  assert.ok(skull.parent === photo.head || photo.head.getObjectById(skull.id), 'the skull rides the head');
  const originalArray = skull.material;
  const originalFace = originalArray[FACE_MATERIAL_INDEX];
  const originalMap = originalFace.map;
  withStubVideo(() => {
    const handle = attachFaceVideo(photo, { id: 'cam' });
    assert.equal(handle.attached, true);
    assert.ok(skull.material[FACE_MATERIAL_INDEX].map instanceof THREE.VideoTexture);
    handle.detach();
  });
  assert.equal(skull.material, originalArray);
  assert.equal(skull.material[FACE_MATERIAL_INDEX], originalFace);
  assert.equal(originalFace.map, originalMap);

  const procedural = makePerson({});
  assert.equal(findPhotoSkull(procedural), null);
  assert.equal(attachFaceVideo(procedural, { id: 'cam' }).attached, false);
});
