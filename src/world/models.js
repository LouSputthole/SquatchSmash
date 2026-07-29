/**
 * Real models, dropped in beside the procedural ones.
 *
 * Everything in this flat is built out of boxes and cylinders in props.js.
 * That was the right call to get a whole apartment standing up, and it is the
 * wrong call for any single object somebody actually cares about -- there is
 * no arrangement of boxes that is a good armchair.
 *
 * So: the same deal as assets/art and assets/music. Put a .glb in
 * assets/models/, list it in the manifest, and it appears. Nothing here has to
 * be edited to add one, and with an empty manifest -- the normal case -- this
 * costs one fetch that 404s and nothing else.
 *
 * A manifest entry:
 *
 *   {
 *     "file":     "armchair.glb",
 *     "at":       [-4.2, 0, 1.1],     // where it goes, world space
 *     "rotY":     1.57,               // optional, radians
 *     "scale":    1,                  // optional, number or [x,y,z]
 *     "replaces": "couch",            // optional; hides the prop of that name
 *     "shadows":  true                // optional, default true
 *   }
 *
 * `replaces` is the useful one. It hides the procedural prop with that group
 * name, so a real model can take over one object at a time without anybody
 * having to delete the thing it stands in for -- and removing the entry puts
 * the old one straight back.
 */
import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/addons/loaders/DRACOLoader.js';
import { loadJson, assetUrl } from '../core/assets.js';

const DIR = 'assets/models/';

/**
 * Load everything in the manifest and add it under `root`.
 *
 * @param {THREE.Object3D} root  the apartment, so models sit in its space
 * @returns {Promise<{loaded: number, failed: string[]}>}
 */
export async function loadModels(root) {
  const data = await loadJson(DIR, 'manifest.json');
  const list = data?.models || [];
  if (!list.length) return { loaded: 0, failed: [] };

  /*
   * Draco is not optional in practice.
   *
   * Most exporters compress meshes with it by default, and GLTFLoader does not
   * fail softly on one -- it throws "No DRACOLoader instance provided" and the
   * model simply does not appear, which looks exactly like a wrong path. The
   * first real .glb tried here was Draco'd, so every second model somebody
   * drops in would have hit it.
   *
   * The decoder is built lazily and only unpacks its wasm the first time a
   * compressed mesh actually turns up, so an uncompressed model pays nothing
   * for this and an empty manifest never gets here at all.
   */
  const draco = new DRACOLoader().setDecoderPath('vendor/addons/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const failed = [];
  let loaded = 0;

  await Promise.all(list.map(async (entry) => {
    if (!entry?.file) return;
    let gltf;
    try {
      gltf = await loader.loadAsync(assetUrl(DIR, entry.file));
    } catch (err) {
      /* One bad model must not take the flat with it. The apartment is still
       * fully playable without any of these; a missing armchair is a missing
       * armchair. */
      failed.push(`${entry.file}: ${err?.message || err}`);
      return;
    }

    const obj = gltf.scene;
    obj.name = entry.name || `model:${entry.file}`;
    if (entry.at) obj.position.fromArray(entry.at);
    if (entry.rotY) obj.rotation.y = entry.rotY;
    if (entry.scale !== undefined) {
      if (Array.isArray(entry.scale)) obj.scale.fromArray(entry.scale);
      else obj.scale.setScalar(entry.scale);
    }

    if (entry.shadows !== false) {
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });
    }

    if (entry.replaces) hideProp(root, entry.replaces);
    root.add(obj);
    loaded++;
  }));

  draco.dispose();
  return { loaded, failed };
}

/**
 * Hide the procedural prop a model is standing in for.
 *
 * Hidden rather than removed, so it comes back the moment the manifest entry
 * does -- and so nothing that kept a reference to it (and plenty does: the
 * lamp's bulb, the desk's RGB, the chair's group) is left pointing at an
 * object that is no longer in the scene.
 */
function hideProp(root, name) {
  let found = 0;
  root.traverse((o) => {
    if (o.name === name && o.visible) { o.visible = false; found++; }
  });
  if (!found) console.warn(`models: nothing named "${name}" to replace`);
  return found;
}
