import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Give Node the same vendored Three.js module that browser import maps expose.
 *
 * Pages CI intentionally has no install step. Tests that import runtime
 * modules still need the bare `three` specifier to resolve, so this creates an
 * ignored local package before those runtime modules are imported.
 */
export function ensureThreeShim() {
  const dir = path.join(ROOT, 'node_modules', 'three');
  const target = path.join(ROOT, 'vendor', 'three.module.min.js');
  if (!fs.existsSync(target) || fs.statSync(target).size < 100_000) {
    throw new Error('vendor/three.module.min.js is missing or truncated');
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'three', version: '0.0.0-local', type: 'module', exports: './index.js' }),
  );
  fs.writeFileSync(
    path.join(dir, 'index.js'),
    `export * from ${JSON.stringify(pathToFileURL(target).href)};\n`,
  );
}

/**
 * Give Node just enough `document` for a scene module to finish importing.
 *
 * Scene modules bake canvas textures at module load and some of them load real
 * images, and neither is a thing this project ever wants to run headless --
 * nothing in the test suite reads a pixel. What the suite needs is for the
 * import not to throw.
 *
 * THIS EXISTS BECAUSE THE PER-FILE VERSIONS COULD NOT BE FIXED IN PLACE.
 * Four test files used to declare their own `globalThis.document ??= {...}`,
 * and `??=` means only the FIRST one to run has any effect -- so under
 * `tests/run.mjs` every later file silently inherited whichever stub happened
 * to be registered earliest, and a file that needed more than that stub
 * offered failed in the full run while passing on its own. That is exactly
 * what happened when a Lou with a photographed face was added to the mansion
 * office: `THREE.TextureLoader` reaches for `createElementNS`, the earliest
 * stub in the list did not have it, and the import threw -- which, because
 * `run.mjs` imports its modules in a plain `for await` loop, took the last
 * twelve test files with it. 806 tests became 591 and the run still said
 * "0 fail", because the tests that would have failed never registered.
 *
 * So there is one stub, it is a superset of all four, and it is installed
 * before anything is imported. Call it from any test that builds real scene
 * geometry; calling it twice is free.
 */
export function ensureDomShim() {
  if (globalThis.document?.__squatchStub) return globalThis.document;
  const context = () => new Proxy({}, {
    get: (_t, key) => (key === 'createLinearGradient' || key === 'createRadialGradient'
      ? () => ({ addColorStop() {} })
      : key === 'createImageData'
        ? (width, height) => ({
            data: new Uint8ClampedArray(width * height * 4),
            width,
            height,
          })
        : key === 'getImageData'
        ? () => ({ data: new Uint8ClampedArray(4) })
        : key === 'measureText'
          ? () => ({ width: 10 })
          : () => {}),
    set: () => true,
  });
  globalThis.document = {
    __squatchStub: true,
    createElement: () => ({ width: 0, height: 0, style: {}, getContext: context }),
    /* `THREE.ImageLoader` -- reached through `TextureLoader.load()`, which is
     * how every photographed face in the cast is built -- makes its <img> with
     * `createElementNS`, listens on it, and sets `src`. It never resolves here
     * and it does not need to: the texture stays blank and the geometry it is
     * on is what the tests are looking at. */
    createElementNS: () => ({
      style: {}, width: 0, height: 0, src: '',
      addEventListener() {}, removeEventListener() {},
      setAttribute() {}, removeAttribute() {}, getContext: context,
    }),
  };
  return globalThis.document;
}
