#!/usr/bin/env node
/**
 * Deterministic visual review of the real Mansion Siege page.
 *
 * Usage:
 *   node tools/shots-mansion-siege.mjs before
 *   node tools/shots-mansion-siege.mjs after
 *
 * The six views are public mission positions, staged through the page's
 * verifier handle. The script never reaches into builder-private geometry.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import {
  diagnoseWorklampCaptureWindow,
  diagnoseWorklampPixelProof,
  evaluateEricReviveCaptureWindow,
  evaluateWorklampCaptureWindow,
  evaluateWorklampPixelProof,
} from './mansion-siege-evidence-contract.mjs';
import { bindScreenshotArtifact } from './screenshot-artifact-contract.mjs';
import {
  closeEvidenceLifecycle,
  listenEvidenceServer,
} from './evidence-lifecycle.mjs';
import { beginEvidenceOutputTransaction } from './evidence-output-transaction.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 54931;
const PASS = (process.argv[2] || 'review').replace(/[^a-z0-9_-]/gi, '-');
const SHOT_ID = String(process.env.SHOT_ID || '').trim();
const TARGETED = process.env.TARGETED === '1';
const OUT = path.join(ROOT, 'docs', 'validation', '2026-08-09', 'siege-refinement');
const WIDTH = Number(process.env.WIDTH) || 1920;
const HEIGHT = Number(process.env.HEIGHT) || 1080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

const server = http.createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = requestPath === '/' ? 'mansion-siege.html' : requestPath.replace(/^\/+/, '');
    const absolute = path.resolve(ROOT, relative);
    if (!absolute.startsWith(ROOT)) {
      response.writeHead(403);
      response.end('forbidden');
      return;
    }
    const bytes = await fsp.readFile(absolute);
    response.writeHead(200, {
      'Content-Type': TYPES[path.extname(absolute)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});

fs.mkdirSync(OUT, { recursive: true });
const outputTransaction = beginEvidenceOutputTransaction({ outputDir: OUT, label: PASS });
let browser = null;
let page = null;
const pageErrors = [];
const notFound = [];

const renderedShots = [];
const capturedShotBuffers = new Map();
async function shot({
  id, x, y, z, yaw = 0, pitch = 0, target = null, crouch = false,
  tick = 0.65, waitMs = 1000, setup = null,
}) {
  await page.evaluate((view) => {
    const siege = window.mansionSiege;
    siege.teleport(view.x, view.y, view.z, view.yaw);
    if (view.crouch) {
      /* Player derives crouch from KeyC on every real simulation frame. Keep
       * that input held so RAF cannot stand the evidence camera back up and
       * lift it outside Eric's 2.4 m revive sphere. */
      siege.player.keys.add('KeyC');
      siege.player.crouching = true;
      siege.player.eyeHeight = 1.02;
      siege.player.targetEye = 1.02;
      siege.player.position.y = view.y + 1.02;
    }
    if (view.target) {
      const eye = siege.player.position;
      const dx = view.target[0] - eye.x;
      const dy = view.target[1] - eye.y;
      const dz = view.target[2] - eye.z;
      siege.player.yaw = Math.atan2(-dx, -dz);
      siege.player.pitch = Math.atan2(dy, Math.max(1e-6, Math.hypot(dx, dz)));
    } else {
      siege.player.pitch = view.pitch;
    }
    siege.tick(view.tick);
    siege.setRendering(true);
  }, {
    x, y, z, yaw, pitch, target, crouch, tick,
  });
  if (setup === 'eric-flinch') {
    await page.evaluate(() => {
      const siege = window.mansionSiege;
      siege.attackers.despawnAll();
      if (!siege.ensemble.restore(window.__mansionTargetBaseline)) {
        throw new Error('could not restore the clean LITTLE_FRIEND ensemble baseline');
      }
      const eric = siege.ensemble.members.get('eric');
      eric.actor.incapacitated = false;
      eric.actor.health = eric.actor.maxHealth;
      eric.downed = false;
      /* restore() correctly preserves checkpoint positions by replacing every
       * movement goal with that recorded position. Retarget the live ensemble
       * to this beat again before the deterministic settle frames. */
      siege.ensemble.stage('LITTLE_FRIEND');
      /* Exercise the real LITTLE_FRIEND walk instead of dropping Eric on the
       * restored BRIEFING coordinate. The attackers are despawned above, so
       * these are eight ordinary, deterministic 0.1 s clock advances. */
      for (let step = 0; step < 8; step++) siege.tick(0.1);
      eric.actor.health = 1;
      siege.tick(0.1);
      /* Drive the shared DeathBloodPool through its authored 0.8 s growth,
       * so the proof captures blood pixels rather than an early transparent
       * growth frame. This is the real pool update, not a material override. */
      siege.tick(0.8);
      const guard = siege.ensemble.members.get('guard_1');
      siege.ensemble.noteImpact(guard.root.position.clone(), 0.1);
      guard.businessLeft = 30;
      siege.tick(0.05);
      guard.businessLeft = 30;
      /* Use the player's real legal Q-stow input. The rejected 54975 frame
       * proved that an equipped first-person SAW can pass world-frustum gates
       * while hiding the fallen body and blood in the actual pixels. */
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', bubbles: true }));
      if (siege.equipped !== null) throw new Error('production Q-stow input did not clear the viewmodel');
    });
  }
  if (crouch) {
    await page.evaluate(() => {
      const pause = window.__scenePause;
      if (!pause || !window.__scenePause.pause()) {
        throw new Error('could not freeze the live Siege simulation');
      }
      /* The real pause API freezes updateGame/RAF. Hide only its menu panel so
       * the screenshot still records the real revive prompt and world pixels. */
      pause.root.classList.add('hidden');
      if (window.mansionSiege.paused !== true) {
        throw new Error('Siege simulation kept advancing after pause');
      }
      /* exitPointerLock clears live input as part of pausing. Re-hold the same
       * production crouch key while the simulation is frozen so the prompt,
       * camera height, and screenshot window describe one legal pose. */
      window.mansionSiege.player.keys.add('KeyC');
    });
  }
  /* Rendering continues while the production pause owns updateGame, so this
   * wait warms the post stack without letting standing actors drift/yield on
   * uncontrolled wall-clock RAF frames. */
  await page.waitForTimeout(waitMs);
  const captureReviveSemantic = () => page.evaluate(async () => {
    const {
      isEvidenceBodyMesh,
      isEvidenceOpaqueIntersection,
      isEvidenceOpaquePixelIntersection,
      selectEvidenceTextureSamples,
    } = await import(
      '/tools/mansion-siege-evidence-contract.mjs'
    );
    const siege = window.mansionSiege;
    const THREE = siege.THREE;
    const eric = siege.ensemble.members.get('eric');
    const guard = siege.ensemble.members.get('guard_1');
    const ericBlood = eric?.bloodPool ?? null;
    const worklamp = siege.dressing.props.firingStep.group
      .getObjectByName('siege.step.worklamp');
    const worklampLight = siege.dressing.props.firingStep.lamp;
    const nearest = siege.ensemble.nearestDowned(siege.player.position, 2.4);
    const viewmodel = siege.camera.getObjectByName('weapons.viewmodel');
    siege.scene.updateMatrixWorld(true);
    siege.camera.updateMatrixWorld(true);
    siege.camera.updateProjectionMatrix();

    const effectivelyVisible = (object) => {
      for (let current = object; current; current = current.parent) {
        if (current.visible === false) return false;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      return materials.some((material) => material != null
        && material.visible !== false && (material.opacity ?? 1) > 0.001);
    };
    const rayMeshes = [];
    siege.scene.traverse((object) => {
      if (object.isMesh && object.geometry && effectivelyVisible(object)) rayMeshes.push(object);
    });
    const texturePixels = new WeakMap();
    const pixelsForTexture = (texture) => {
      if (!texture || (typeof texture !== 'object' && typeof texture !== 'function')) return null;
      if (texturePixels.has(texture)) return texturePixels.get(texture);
      const image = texture.image ?? texture.source?.data ?? null;
      const width = Number(image?.width ?? image?.naturalWidth ?? 0);
      const height = Number(image?.height ?? image?.naturalHeight ?? 0);
      let pixels = null;
      try {
        if (image?.data && width > 0 && height > 0) {
          pixels = {
            data: image.data,
            width,
            height,
            components: image.data.length / (width * height),
          };
        } else if (width > 0 && height > 0) {
          let canvas = image;
          let context = image?.getContext?.('2d', { willReadFrequently: true }) ?? null;
          if (!context) {
            canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            context = canvas.getContext('2d', { willReadFrequently: true });
            context?.drawImage?.(image, 0, 0, width, height);
          }
          const imageData = context?.getImageData?.(0, 0, width, height) ?? null;
          if (imageData?.data) pixels = {
            data: imageData.data, width, height, components: 4,
          };
        }
      } catch {
        pixels = null;
      }
      texturePixels.set(texture, pixels);
      return pixels;
    };
    const sampleTextureChannel = (texture, uv, channel) => {
      if (!texture) return 1;
      if (!uv) return 0;
      const pixels = pixelsForTexture(texture);
      if (!pixels) return 0;
      const transformed = new THREE.Vector2(uv.x, uv.y);
      if (texture.matrixAutoUpdate !== false) texture.updateMatrix?.();
      texture.transformUv?.(transformed);
      const x = Math.min(pixels.width - 1, Math.max(0,
        Math.floor(transformed.x * pixels.width)));
      const y = Math.min(pixels.height - 1, Math.max(0,
        Math.floor(transformed.y * pixels.height)));
      const components = Number.isInteger(pixels.components) ? pixels.components : 4;
      const offset = (y * pixels.width + x) * components;
      const component = channel === 'green'
        ? Math.min(1, components - 1)
        : components >= 4 ? 3 : null;
      if (component === null) return 1;
      const value = pixels.data[offset + component];
      return Number.isFinite(value) ? value / 255 : 0;
    };
    const renderProjectionProof = (root, { bodyRoot = null, weaponRoot = null } = {}) => {
      if (!root) return { intersects: false, fullyInside: false, ndc: null };
      const projected = [];
      const local = new THREE.Vector3();
      const worldMatrix = new THREE.Matrix4();
      const instanceMatrix = new THREE.Matrix4();
      root.updateMatrixWorld?.(true);
      root.traverse((object) => {
        const selected = bodyRoot
          ? isEvidenceBodyMesh(object, bodyRoot, weaponRoot)
          : object.isMesh === true;
        if (!selected || !effectivelyVisible(object)) return;
        const position = object.geometry?.getAttribute?.('position');
        if (!position?.count) return;
        const instances = object.isInstancedMesh ? object.count : 1;
        for (let instance = 0; instance < instances; instance += 1) {
          if (object.isInstancedMesh) {
            object.getMatrixAt(instance, instanceMatrix);
            worldMatrix.multiplyMatrices(object.matrixWorld, instanceMatrix);
          } else {
            worldMatrix.copy(object.matrixWorld);
          }
          for (let index = 0; index < position.count; index += 1) {
            local.fromBufferAttribute(position, index);
            if (object.isSkinnedMesh) object.applyBoneTransform(index, local);
            const point = local.applyMatrix4(worldMatrix).project(siege.camera);
            if (Number.isFinite(point.x) && Number.isFinite(point.y)
              && Number.isFinite(point.z)) projected.push(point.clone());
          }
        }
      });
      if (!projected.length) return { intersects: false, fullyInside: false, ndc: null };
      const xs = projected.map((point) => point.x);
      const ys = projected.map((point) => point.y);
      const zs = projected.map((point) => point.z);
      const raw = {
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minY: Math.min(...ys), maxY: Math.max(...ys),
        minZ: Math.min(...zs), maxZ: Math.max(...zs),
      };
      const round = (number) => Number(number.toFixed(3));
      return {
        intersects: raw.minX <= 1 && raw.maxX >= -1
          && raw.minY <= 1 && raw.maxY >= -1
          && raw.minZ <= 1 && raw.maxZ >= -1,
        fullyInside: projected.every((point) => Math.abs(point.x) <= 1
          && Math.abs(point.y) <= 1 && point.z >= -1 && point.z <= 1),
        ndc: {
          minX: round(raw.minX), maxX: round(raw.maxX),
          minY: round(raw.minY), maxY: round(raw.maxY),
        },
      };
    };
    const paintedTextureScreenSamples = (root, sampleCount = 25) => {
      if (!root) return { samples: [], candidateCount: 0 };
      const candidates = [];
      const uv = new THREE.Vector2();
      const local = new THREE.Vector3();
      root.updateMatrixWorld?.(true);
      root.traverse((object) => {
        if (!object.isMesh || !object.geometry || !effectivelyVisible(object)) return;
        object.geometry.computeBoundingBox?.();
        const bounds = object.geometry.boundingBox;
        if (!bounds) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material, materialIndex) => {
          const texture = material?.map ?? material?.alphaMap ?? null;
          const pixels = pixelsForTexture(texture);
          if (!pixels || pixels.width <= 0 || pixels.height <= 0) return;
          for (let y = 0; y < pixels.height; y += 1) {
            for (let x = 0; x < pixels.width; x += 1) {
              uv.set((x + 0.5) / pixels.width, (y + 0.5) / pixels.height);
              const syntheticHit = {
                object,
                face: { materialIndex },
                uv,
              };
              if (!isEvidenceOpaquePixelIntersection(syntheticHit, sampleTextureChannel)) continue;
              local.set(
                THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, uv.x),
                THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, uv.y),
                (bounds.min.z + bounds.max.z) / 2,
              );
              const point = local.clone().applyMatrix4(object.matrixWorld).project(siege.camera);
              if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
                || !Number.isFinite(point.z) || point.z < -1 || point.z > 1) continue;
              candidates.push({ u: uv.x, v: uv.y, x: point.x, y: point.y });
            }
          }
        });
      });
      return {
        samples: selectEvidenceTextureSamples(candidates, sampleCount),
        candidateCount: candidates.length,
      };
    };
    const screenRayVisibilityProof = (
      root, projection, {
        bodyRoot = null, weaponRoot = null, sampleMode = 'uniform-grid',
      } = {},
    ) => {
      const ndc = projection?.ndc;
      if (!root || !ndc) return {
        sampleCount: 25, targetHits: 0, hitRatio: 0, blockers: [],
      };
      const targetMeshes = new Set();
      root.traverse((object) => {
        const selected = bodyRoot
          ? isEvidenceBodyMesh(object, bodyRoot, weaponRoot)
          : object.isMesh === true;
        if (selected && effectivelyVisible(object)) targetMeshes.add(object);
      });
      const raycaster = new THREE.Raycaster();
      const point = new THREE.Vector2();
      const blockerCounts = new Map();
      let targetHits = 0;
      const steps = 5;
      const painted = sampleMode === 'painted-texture'
        ? paintedTextureScreenSamples(root, steps * steps) : null;
      const samplePoints = painted?.samples?.length === steps * steps
        ? painted.samples
        : Array.from({ length: steps * steps }, (_, index) => {
          const row = Math.floor(index / steps);
          const column = index % steps;
          return {
            x: THREE.MathUtils.lerp(ndc.minX, ndc.maxX, (column + 0.5) / steps),
            y: THREE.MathUtils.lerp(ndc.minY, ndc.maxY, (row + 0.5) / steps),
          };
        });
      const paintedSamplesComplete = sampleMode !== 'painted-texture'
        || painted?.samples?.length === steps * steps;
      for (const sample of samplePoints) {
        point.set(sample.x, sample.y);
        raycaster.setFromCamera(point, siege.camera);
        const first = raycaster.intersectObjects(rayMeshes, false)
          .find((hit) => effectivelyVisible(hit.object)
            && isEvidenceOpaquePixelIntersection(hit, sampleTextureChannel));
        if (paintedSamplesComplete && first && targetMeshes.has(first.object)) {
          targetHits += 1;
        } else if (first) {
          const name = first.object.name || '(unnamed blocker)';
          blockerCounts.set(name, (blockerCounts.get(name) ?? 0) + 1);
        }
      }
      return {
        sampleCount: steps * steps,
        targetHits,
        hitRatio: Number((targetHits / (steps * steps)).toFixed(3)),
        sampleMode,
        paintedCandidateCount: painted?.candidateCount ?? null,
        blockers: [...blockerCounts.entries()]
          .map(([name, hits]) => ({ name, hits }))
          .sort((left, right) => right.hits - left.hits || left.name.localeCompare(right.name))
          .slice(0, 5),
      };
    };
    const projectionWithVisibility = (root, options = {}) => {
      const projection = renderProjectionProof(root, options);
      return {
        ...projection,
        visibility: screenRayVisibilityProof(root, projection, options),
      };
    };
    const rawBounds = (object) => object
      ? new THREE.Box3().setFromObject(object) : null;
    const handMesh = (forearm) => {
      let hand = null;
      forearm?.traverse?.((object) => {
        if (!hand && object.isMesh && /(^|\.)hand$/.test(object.name ?? '')) hand = object;
      });
      return hand;
    };
    const leftHand = handMesh(guard?.figure?.parts?.foreL);
    const rightHand = handMesh(guard?.figure?.parts?.foreR);
    let primaryGrip = null;
    guard?.gun?.traverse?.((object) => {
      if (!primaryGrip && object.name?.includes('grip') && !object.name.includes('foregrip')) {
        primaryGrip = object;
      }
    });
    const leftBox = rawBounds(leftHand);
    const rightBox = rawBounds(rightHand);
    const gripBox = rawBounds(primaryGrip);
    const guardGunBox = rawBounds(guard?.gun);
    const headBox = rawBounds(guard?.figure?.parts?.head);
    const leftCentre = leftBox?.getCenter(new THREE.Vector3()) ?? null;
    const rightCentre = rightBox?.getCenter(new THREE.Vector3()) ?? null;
    const headCentre = headBox?.getCenter(new THREE.Vector3()) ?? null;
    const ericBloodMaterial = Array.isArray(ericBlood?.material)
      ? ericBlood.material.find((material) => material?.visible !== false) ?? null
      : ericBlood?.material ?? null;
    return {
      prompt: {
        visible: !document.getElementById('helping')?.hidden,
        name: document.getElementById('helpingName')?.textContent ?? null,
        text: document.querySelector('#helping .who')?.textContent
          ?.replace(/\s+/g, ' ').trim() ?? null,
        nearest: nearest ? {
          id: nearest.id,
          name: nearest.name,
          distance: Number(nearest.distance.toFixed(5)),
        } : null,
      },
      player: {
        position: siege.player.position.toArray().map((n) => Number(n.toFixed(5))),
        eyeHeight: Number(siege.player.eyeHeight.toFixed(5)),
        crouching: siege.player.crouching,
        crouchKeyHeld: siege.player.keys.has('KeyC'),
        simulationPaused: siege.paused,
        equipped: siege.equipped,
        viewmodelWeaponVisible: viewmodel?.children?.some(
          (child) => child.isGroup && child.visible,
        ) ?? false,
      },
      composition: {
        eric: {
          body: projectionWithVisibility(eric?.root, {
            bodyRoot: eric?.root, weaponRoot: eric?.gun,
          }),
          blood: projectionWithVisibility(ericBlood, { sampleMode: 'painted-texture' }),
          bloodOwner: ericBlood?.userData?.memberId ?? null,
          bloodOpacity: ericBloodMaterial?.opacity ?? 0,
          bloodEmissiveRed: ericBloodMaterial
            ? (ericBloodMaterial.emissive?.r ?? 0)
              * (ericBloodMaterial.emissiveIntensity ?? 1)
            : 0,
        },
        guard: {
          body: projectionWithVisibility(guard?.root, {
            bodyRoot: guard?.root, weaponRoot: guard?.gun,
          }),
          gun: projectionWithVisibility(guard?.gun),
        },
        worklamp: projectionWithVisibility(worklamp),
      },
      eric: {
        id: eric?.id ?? null,
        staged: eric?.staged ?? false,
        health: eric?.actor?.health ?? null,
        downed: eric?.downed ?? false,
        incapacitated: eric?.actor?.incapacitated ?? false,
        pose: eric?.figure?.pose ?? null,
        weaponId: eric?.weaponId ?? null,
        gunVisible: eric?.gun?.visible ?? false,
        bloodVisible: ericBlood?.visible === true,
      },
      liveGuard: {
        id: guard?.id ?? null,
        staged: guard?.staged ?? false,
        downed: guard?.downed ?? false,
        incapacitated: guard?.actor?.incapacitated ?? false,
        pose: guard?.figure?.pose ?? null,
        businessKey: guard?.businessKey ?? null,
        weaponId: guard?.weaponId ?? null,
        gunVisible: guard?.gun?.visible ?? false,
        firingGripContact: Boolean(rightBox && gripBox && rightBox.intersectsBox(gripBox)),
        supportHandGap: leftCentre && guardGunBox
          ? Number(guardGunBox.distanceToPoint(leftCentre).toFixed(3)) : null,
        bothHandsAboveHead: Boolean(leftCentre && rightCentre && headCentre
          && leftCentre.y > headCentre.y && rightCentre.y > headCentre.y),
      },
      worklampLight: siege.lightStatus(worklampLight),
    };
  });
  const captureWorklampPixelProof = (screenshotBase64) => page.evaluate(async (input) => {
    const { captureWorklampPixelProof: capture } = await import(
      '/tools/worklamp-pixel-proof.mjs'
    );
    return capture({
      siege: window.mansionSiege,
      screenshotBase64: input.screenshotBase64,
      width: input.width,
      height: input.height,
    });
  }, { screenshotBase64, width: WIDTH, height: HEIGHT });
  const semanticBefore = crouch ? await captureReviveSemantic() : null;
  const output = outputTransaction.stagePath(`${PASS}-${id}.png`);
  const screenshotBytes = await page.screenshot({
    path: output,
    animations: 'disabled',
    timeout: 180000,
  });
  const diskBytes = fs.readFileSync(output);
  const artifact = bindScreenshotArtifact(screenshotBytes, diskBytes);
  capturedShotBuffers.set(path.basename(output), Buffer.from(screenshotBytes));
  const screenshotBase64 = screenshotBytes.toString('base64');
  const imageSha256 = artifact.sha256;
  const pixelProof = crouch ? await captureWorklampPixelProof(screenshotBase64) : null;
  if (pixelProof) pixelProof.imageSha256 = imageSha256;
  /* The image is certified only when the same valid Eric/prompt/input state
   * brackets the screenshot. A live RAF transition during pixel capture can
   * no longer borrow an earlier prompt snapshot. */
  const semanticAfter = crouch ? await captureReviveSemantic() : null;
  const semantic = crouch ? {
    before: semanticBefore, after: semanticAfter, pixelProof,
  } : null;
  renderedShots.push({
    id,
    file: path.basename(output),
    bytes: artifact.bytes,
    sha256: imageSha256,
    semantic,
  });
  if (crouch) {
    await page.evaluate(() => {
      window.mansionSiege.player.keys.delete('KeyC');
      if (!window.__scenePause?.resume()) {
        throw new Error('could not release the Siege evidence pause');
      }
    });
  }
  await page.evaluate(() => window.mansionSiege.setRendering(false));
}

try {
  await listenEvidenceServer(server, PORT);
  browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() === 404) notFound.push(response.url());
  });
  await page.goto(
    `http://127.0.0.1:${PORT}/mansion-siege.html?preview=1&checkpoint=briefed`,
    { waitUntil: 'domcontentloaded', timeout: 120000 },
  );
  await page.waitForFunction(() => window.mansionSiege?.scene, null, { timeout: 120000 });
  await page.click('#startBtn', { timeout: 120000 });
  await page.waitForFunction(() => window.mansionSiege?.running, null, { timeout: 120000 });
  await page.evaluate(() => window.mansionSiege.interior.artReady);
  await page.evaluate(() => {
    window.__mansionTargetBaseline = window.mansionSiege.ensemble.snapshot();
  });
  const briefedViews = [
    /* The two Austin mounts which an overview only catches obliquely. These
     * are reachable room/stair poses and use the live target centre. */
    { id: 'gallery-roster-front', x: 11.0, y: 6, z: 51.4, target: [11.0, 8.05, 48.18] },
    { id: 'gallery-roster-stair-side', x: 8.95, y: 6, z: 49.7, target: [11.0, 8.05, 48.18] },
    { id: 'lounge-austin-front', x: 12.4, y: 1.2, z: 40, target: [9.03, 3.6, 40] },
    { id: 'lounge-austin-side', x: 13.1, y: 1.2, z: 42.2, target: [9.03, 3.6, 40] },
    /* Casa Bonita is `mansion.cellar.crest`, across the corridor from the
     * vault. `mansion.vault.mark` beside the door is a different picture. */
    { id: 'casa-across-vault-front', x: 10.5, y: -2.8, z: 66.5, target: [10.5, -0.99, 64.38] },
    { id: 'casa-across-vault-side', x: 8.45, y: -2.8, z: 66.2, target: [10.5, -0.99, 64.38] },
    { id: 'briefed-foyer-cast', x: 0, y: 1.2, z: 37.7, target: [0, 2.2, 43.5] },
  ];
  const battleViews = [
    /* Phase-transition visual checks: body/blood, landing defenders and
     * distinct attacker outfits under the real battle dress. */
    { id: 'dead-performer', x: -5.6, y: 1.2, z: 36.9, yaw: 119, pitch: -0.48 },
    { id: 'east-stair-ascent', x: 7.15, y: 3.0, z: 44.25, yaw: 0, pitch: 0.04 },
    { id: 'east-stair-defenders', x: 7.15, y: 4.0, z: 45.5, yaw: 180, pitch: 0.12 },
    { id: 'east-stair-head', x: 7.15, y: 6.0, z: 48.55, yaw: 0, pitch: -0.02 },
    { id: 'worklamp-front', x: 0, y: 6, z: 47.2, target: [2.94, 7.35, 45.55] },
    { id: 'worklamp-side', x: 1.45, y: 6, z: 46.8, target: [2.94, 7.35, 45.55] },
    {
      /* The north-west pose looked through the atrium rail/case and certified
       * off-screen vertices rather than readable pixels. The east clear bay
       * stays inside Eric's revive sphere and looks west across Eric, the
       * armed guard, and the clamped worklamp on one unobstructed diagonal.
       *
       * The aim point is a centimetre below the eye rather than level with
       * it, and the centimetre is load-bearing. Aimed level, the bottom of
       * Eric's blood pool sat at -0.9500 in NDC against a -0.95 frame margin:
       * no margin at all. Turning Eric 2.9 degrees east -- to get his AK out
       * of DeathMegatron's ribcage -- moved it to -0.9503 and the shot failed
       * on a quarter of a thousandth of the frame. Dropping the aim lifts
       * every subject in frame; a centimetre buys about seven thousandths,
       * which the guard's head can afford (it had 0.0136 of headroom) and the
       * blood needs. The camera itself cannot move: the light-budget proof
       * pins x and z to this exact piece of gallery parquet. */
      id: 'worklamp-eric-flinch', x: 7.0, y: 6, z: 52.2,
      target: [6.4, 5.94, 49.7], crouch: true, tick: 0.05, waitMs: 250,
      setup: 'eric-flinch',
    },
    { id: 'gallery-operations', x: 0, y: 6, z: 48.7, yaw: 180, pitch: -0.05 },
    { id: 'forecourt-outfits', x: -12, y: 0, z: 14, yaw: 209, pitch: -0.02 },
  ];
  const views = [...briefedViews, ...battleViews];
  const targetedIds = new Set([
    'gallery-roster-front', 'gallery-roster-stair-side',
    'casa-across-vault-front', 'casa-across-vault-side',
    'worklamp-eric-flinch',
  ]);
  const selectedViews = SHOT_ID ? views.filter((view) => view.id === SHOT_ID)
    : TARGETED ? views.filter((view) => targetedIds.has(view.id)) : views;
  if (!selectedViews.length) throw new Error(`Unknown Mansion Siege SHOT_ID: ${SHOT_ID}`);
  for (const view of selectedViews.filter((view) => briefedViews.includes(view))) await shot(view);
  await page.evaluate(() => {
    const siege = window.mansionSiege;
    siege.setState('under_attack');
    siege.setInvulnerable(true);
    siege.tick(1.2);
  });
  for (const view of selectedViews.filter((view) => battleViews.includes(view))) await shot(view);

  const inventory = await page.evaluate(async (capture) => {
    const { isEvidenceOpaqueIntersection } = await import(
      '/tools/mansion-siege-evidence-contract.mjs'
    );
    const siege = window.mansionSiege;
    const THREE = siege.THREE;
    siege.scene.updateMatrixWorld(true);
    const boundsOf = (object) => {
      if (!object) return null;
      object.updateMatrixWorld?.(true);
      const box = new THREE.Box3().setFromObject(object);
      const xyz = (v) => v.toArray().map((n) => Number(n.toFixed(4)));
      return { min: xyz(box.min), max: xyz(box.max) };
    };
    const rawBounds = (object) => {
      if (!object) return null;
      object.updateMatrixWorld?.(true);
      return new THREE.Box3().setFromObject(object);
    };
    const boxData = (box) => box ? ({
      min: box.min.toArray().map((n) => Number(n.toFixed(5))),
      max: box.max.toArray().map((n) => Number(n.toFixed(5))),
      centre: box.getCenter(new THREE.Vector3()).toArray().map((n) => Number(n.toFixed(5))),
      size: box.getSize(new THREE.Vector3()).toArray().map((n) => Number(n.toFixed(5))),
    }) : null;
    const boxCorners = (box) => {
      const corners = [];
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
        }
      }
      return corners;
    };
    const frustumProof = (object, camera) => {
      const box = rawBounds(object);
      if (!box) return { intersects: false, fullyInside: false, ndc: null };
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      const points = boxCorners(box).map((point) => point.project(camera));
      return {
        intersects: new THREE.Frustum().setFromProjectionMatrix(
          new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
        ).intersectsBox(box),
        fullyInside: points.every((point) => Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1
          && point.z >= -1 && point.z <= 1),
        ndc: {
          minX: Number(Math.min(...points.map((point) => point.x)).toFixed(5)),
          maxX: Number(Math.max(...points.map((point) => point.x)).toFixed(5)),
          minY: Number(Math.min(...points.map((point) => point.y)).toFixed(5)),
          maxY: Number(Math.max(...points.map((point) => point.y)).toFixed(5)),
        },
      };
    };
    const viewCamera = (eye, target) => {
      const camera = new THREE.PerspectiveCamera(68, capture.width / capture.height, 0.08, 260);
      camera.position.fromArray(eye);
      camera.lookAt(new THREE.Vector3(...target));
      camera.updateMatrixWorld(true);
      return camera;
    };
    const boxGap = (a, b) => Math.hypot(
      Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0),
      Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0),
      Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0),
    );
    const instanceBox = (object, index) => {
      object.geometry.computeBoundingBox();
      const matrix = new THREE.Matrix4();
      object.getMatrixAt(index, matrix);
      matrix.premultiply(object.matrixWorld);
      return object.geometry.boundingBox.clone().applyMatrix4(matrix);
    };
    const namedBoxes = (name, roots = [siege.interior.root, siege.grounds.root]) => {
      const rows = [];
      for (const root of roots) root?.traverse?.((object) => {
        if (object.name === name && object.visible !== false) rows.push({ object, box: rawBounds(object) });
      });
      return rows;
    };
    const nearestNamed = (targetBox, name, roots) => namedBoxes(name, roots)
      .map(({ object, box }) => ({ name: object.name, gap: boxGap(targetBox, box), box: boxData(box) }))
      .sort((a, b) => a.gap - b.gap)[0] ?? null;

    /* Resolve one authored fixture through the real shared InstancedMesh
     * batches, then measure all ten visible parts at the same instance index.
     * This closes the old backplate-only test gap. */
    const sconceAt = (expected, wallName) => {
      const backplates = siege.interior.root.getObjectByName('sconce-backplate');
      if (!backplates?.isInstancedMesh) return { error: 'missing sconce-backplate batch' };
      const wanted = new THREE.Vector3(...expected);
      let fixture = null;
      for (let index = 0; index < backplates.count; index += 1) {
        const box = instanceBox(backplates, index);
        const distance = box.getCenter(new THREE.Vector3()).distanceTo(wanted);
        if (!fixture || distance < fixture.distance) fixture = { index, distance, backplate: box };
      }
      const parts = [];
      let unnamed = 0;
      siege.interior.root.traverse((object) => {
        if (!object.isInstancedMesh || object.count !== backplates.count) return;
        const box = instanceBox(object, fixture.index);
        const centre = box.getCenter(new THREE.Vector3());
        if (centre.distanceTo(wanted) > 0.6) return;
        parts.push({
          id: object.name || `unnamed-sconce-part-${unnamed++}`,
          geometry: object.geometry?.type ?? null,
          box,
        });
      });
      const serial = parts.map((part, index) => ({
        id: part.id,
        geometry: part.geometry,
        box: boxData(part.box),
        contacts: parts.map((other, otherIndex) => ({
          id: other.id, gap: Number(boxGap(part.box, other.box).toFixed(5)), otherIndex,
        })).filter(({ otherIndex, gap }) => otherIndex !== index && gap <= 0.012)
          .map(({ id, gap }) => ({ id, gap })),
      }));
      const connected = new Set([0]);
      let added = true;
      while (added) {
        added = false;
        for (let left = 0; left < parts.length; left += 1) {
          for (let right = left + 1; right < parts.length; right += 1) {
            if (boxGap(parts[left].box, parts[right].box) > 0.002) continue;
            if (connected.has(left) === connected.has(right)) continue;
            connected.add(left);
            connected.add(right);
            added = true;
          }
        }
      }
      const fixtureBox = parts.reduce((bounds, part) => bounds.union(part.box), new THREE.Box3().makeEmpty());
      return {
        expected,
        index: fixture.index,
        expectedDistance: Number(fixture.distance.toFixed(5)),
        partCount: parts.length,
        box: boxData(fixtureBox),
        backplate: boxData(fixture.backplate),
        wall: nearestNamed(fixture.backplate, wallName, [siege.interior.root, siege.grounds.root]),
        connectedParts: connected.size,
        parts: serial,
      };
    };

    const rayProof = (target, eyes) => {
      const targetBox = rawBounds(target);
      const centre = targetBox.getCenter(new THREE.Vector3());
      const raycaster = new THREE.Raycaster();
      const sightlineMeshes = [];
      for (const root of [siege.interior.root, siege.grounds.root]) root?.traverse?.((object) => {
        if (object.isMesh && !object.isSkinnedMesh && !object.isInstancedMesh
          && object.geometry && object.material && object.matrixWorld) sightlineMeshes.push(object);
      });
      const shown = (object) => {
        for (let node = object; node; node = node.parent) if (node.visible === false) return false;
        return true;
      };
      const belongs = (object) => {
        for (let node = object; node; node = node.parent) if (node === target) return true;
        return false;
      };
      return eyes.map((eyeValues) => {
        const eye = new THREE.Vector3(...eyeValues);
        raycaster.set(eye, centre.clone().sub(eye).normalize());
        const hits = raycaster.intersectObjects(sightlineMeshes, false)
          .filter((hit) => shown(hit.object) && isEvidenceOpaqueIntersection(hit));
        const targetIndex = hits.findIndex(({ object }) => belongs(object));
        return {
          eye: eyeValues,
          target: centre.toArray().map((n) => Number(n.toFixed(5))),
          targetDistance: targetIndex >= 0 ? Number(hits[targetIndex].distance.toFixed(5)) : null,
          clear: targetIndex >= 0 && !hits.slice(0, targetIndex).some(({ object, distance }) => (
            !belongs(object) && distance < hits[targetIndex].distance - 0.015
          )),
          firstHits: hits.slice(0, Math.max(5, targetIndex + 1)).map(({ object, distance, instanceId }) => ({
            name: object.name || '(unnamed)',
            distance: Number(distance.toFixed(5)),
            instanceId: Number.isInteger(instanceId) ? instanceId : null,
            target: belongs(object),
          })),
        };
      });
    };

    const casaRailProof = (picture) => {
      const pictureBox = rawBounds(picture);
      const framePanel = picture.parent?.name === 'framePanel' ? picture.parent : null;
      const frameBoxes = framePanel?.children
        ?.filter((child) => child.isMesh && child.geometry?.type === 'BoxGeometry')
        .sort((left, right) => (right.geometry.parameters?.depth ?? 0)
          - (left.geometry.parameters?.depth ?? 0)) ?? [];
      const [bezel, board] = frameBoxes;
      const bezelBox = rawBounds(bezel);
      const boardBox = rawBounds(board);
      const frameBox = rawBounds(framePanel) ?? pictureBox;
      const intersections = [];
      const clearances = [];
      siege.interior.root.traverse((object) => {
        if (!object.isMesh || object.isInstancedMesh || object === picture || object.visible === false) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (!materials.some((material) => material?.color?.getHex() === 0xf0e9d8)) return;
        const trimBox = rawBounds(object);
        if (trimBox.intersectsBox(frameBox)) intersections.push(object.name || '(unnamed white trim)');
        const size = trimBox.getSize(new THREE.Vector3());
        const sharesRun = trimBox.max.x >= frameBox.min.x && trimBox.min.x <= frameBox.max.x
          && trimBox.max.z >= frameBox.min.z - 0.01 && trimBox.min.z <= frameBox.max.z + 0.01;
        if (sharesRun && size.y <= 0.12 && trimBox.max.y <= frameBox.min.y) {
          clearances.push(frameBox.min.y - trimBox.max.y);
        }
      });
      const wallCandidates = [
        ...namedBoxes('cellar-wing-south', [siege.grounds.root]),
      ].filter(({ box }) => box.max.x >= frameBox.max.x && box.min.x <= frameBox.min.x
        && box.max.y >= frameBox.max.y && box.min.y <= frameBox.min.y)
        .map(({ object, box }) => ({
        name: object.name,
        gap: boxGap(pictureBox, box),
        frameRearGap: bezelBox ? bezelBox.min.z - box.max.z : null,
        box: boxData(box),
      }))
        .sort((a, b) => a.gap - b.gap);
      return {
        box: boxData(pictureBox),
        frame: boxData(frameBox),
        bezel: boxData(bezelBox),
        board: boxData(boardBox),
        containment: bezelBox && boardBox ? {
          boardLeft: Number((pictureBox.min.x - boardBox.min.x).toFixed(5)),
          boardRight: Number((boardBox.max.x - pictureBox.max.x).toFixed(5)),
          boardBottom: Number((pictureBox.min.y - boardBox.min.y).toFixed(5)),
          boardTop: Number((boardBox.max.y - pictureBox.max.y).toFixed(5)),
          bezelLeft: Number((pictureBox.min.x - bezelBox.min.x).toFixed(5)),
          bezelRight: Number((bezelBox.max.x - pictureBox.max.x).toFixed(5)),
          bezelBottom: Number((pictureBox.min.y - bezelBox.min.y).toFixed(5)),
          bezelTop: Number((bezelBox.max.y - pictureBox.max.y).toFixed(5)),
        } : null,
        intersections,
        railClearance: clearances.length ? Number(Math.min(...clearances).toFixed(5)) : null,
        nearestStructuralWall: wallCandidates[0] ?? null,
      };
    };
    const eastPartition = siege.interior.root.getObjectByName('east-partition-front-solid');
    const galleryRoster = siege.interior.props.gallery.roster;
    const loungeAustin = siege.interior.props.lounge.cowboy.art;
    const casa = siege.interior.props.cellarHall.crest;
    let galleryFrameBox = null;
    siege.interior.root.traverse((object) => {
      if (galleryFrameBox || !object.isMesh || object === galleryRoster || object.isInstancedMesh) return;
      const box = rawBounds(object);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      if (Math.abs(size.x - 3.4) < 1e-4 && Math.abs(size.y - 1.46) < 1e-4
          && Math.abs(size.z - 0.035) < 1e-4 && centre.distanceTo(galleryRoster.position) < 0.1) {
        galleryFrameBox = box;
      }
    });
    const galleryRightCases = [];
    siege.interior.root.traverse((object) => {
      if (object.name === 'gallery-south-case') galleryRightCases.push(rawBounds(object));
    });
    const galleryFrameCentreX = galleryFrameBox?.getCenter(new THREE.Vector3()).x ?? null;
    const galleryRightCaseCandidates = galleryFrameBox ? galleryRightCases
      .filter((box) => box.min.x > galleryFrameCentreX)
      .map((box) => box.min.x) : [];
    const galleryRightCaseMinX = galleryRightCaseCandidates.length
      ? Math.min(...galleryRightCaseCandidates) : null;
    const worklampGroup = siege.dressing.props.firingStep.group
      .getObjectByName('siege.step.worklamp');
    const worklampParts = [];
    worklampGroup?.traverse?.((object) => {
      if (object.isMesh) worklampParts.push({ name: object.name || '(unnamed)', box: rawBounds(object) });
    });
    const worklampClamp = worklampGroup?.getObjectByName('siege.step.worklamp.clamp');
    const clampBox = rawBounds(worklampClamp);
    const balusters = siege.interior.root.getObjectByName('baluster-shaft');
    let clampSupport = null;
    if (clampBox && balusters?.isInstancedMesh) {
      for (let index = 0; index < balusters.count; index += 1) {
        const box = instanceBox(balusters, index);
        const gap = boxGap(clampBox, box);
        if (!clampSupport || gap < clampSupport.gap) clampSupport = { index, gap, box };
      }
    }
    const performer = siege.dressing.props.bodies.performer;
    const blood = performer.blood?.pool
      || performer.group.getObjectByName('siege.body.performer.blood');
    const groups = {};
    for (const name of siege.addedNames()) {
      const entry = siege.damage.entry(name);
      let meshes = 0;
      entry?.object?.traverse?.((object) => { if (object.isMesh) meshes += 1; });
      groups[name] = meshes;
    }
    const galleryFrontCamera = viewCamera([11.0, 7.66, 51.4], [11.0, 8.05, 48.18]);
    const gallerySideCamera = viewCamera([8.95, 7.66, 49.7], [11.0, 8.05, 48.18]);
    const casaFrontCamera = viewCamera([10.5, -1.14, 66.5], [10.5, -0.99, 64.38]);
    const casaSideCamera = viewCamera([8.45, -1.14, 66.2], [10.5, -0.99, 64.38]);
    const galleryNormal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(galleryRoster.getWorldQuaternion(new THREE.Quaternion()));
    return {
      state: siege.state,
      groups,
      visibleLights: siege.perf.visibleLights,
      framesRendered: siege.framesRendered,
      contextLost: siege.renderer.getContext().isContextLost(),
      geometry: {
        eastPartition: boundsOf(eastPartition),
        galleryRoster: boundsOf(galleryRoster),
        galleryFrame: galleryFrameBox ? {
          box: boxData(galleryFrameBox),
          wall: nearestNamed(galleryFrameBox, 'gallery-south-solid', [siege.interior.root]),
          rightCaseClearance: Number.isFinite(galleryRightCaseMinX)
            ? Number((galleryRightCaseMinX - galleryFrameBox.max.x).toFixed(5)) : null,
        } : null,
        austinMajor: boundsOf(siege.interior.props.lounge.cowboy.group),
        casaAcrossVault: casaRailProof(casa),
        worklamp: boundsOf(worklampGroup),
        worklampParts: worklampParts.map((part, index) => ({
          name: part.name,
          box: boxData(part.box),
          contacts: worklampParts.map((other, otherIndex) => ({
            name: other.name, gap: Number(boxGap(part.box, other.box).toFixed(5)), otherIndex,
          })).filter(({ otherIndex, gap }) => otherIndex !== index && gap <= 0.012)
            .map(({ name, gap }) => ({ name, gap })),
        })),
        worklampClampSupport: clampSupport ? {
          index: clampSupport.index,
          gap: Number(clampSupport.gap.toFixed(5)),
          clamp: boxData(clampBox),
          support: boxData(clampSupport.box),
        } : null,
        galleryRosterSconce: sconceAt([11.0, 9.05, 48.175], 'gallery-south-solid'),
        loungeAustinSconce: sconceAt([9.18, 4.47, 40], 'east-partition-front-solid'),
        sightlines: {
          galleryRoster: rayProof(galleryRoster, [[11.0, 7.66, 51.4], [8.95, 7.66, 49.7]]),
          loungeAustin: rayProof(loungeAustin, [[12.4, 2.86, 40], [13.1, 2.86, 42.2]]),
          casaAcrossVault: rayProof(casa, [[10.5, -1.14, 66.5], [8.45, -1.14, 66.2]]),
        },
        identities: {
          galleryRoster: galleryRoster.userData.art ?? null,
          casaAcrossVault: casa.userData.art ?? null,
        },
        orientation: {
          galleryRosterNormal: galleryNormal.toArray().map((n) => Number(n.toFixed(5))),
        },
        frusta: {
          galleryFront: frustumProof(galleryRoster, galleryFrontCamera),
          gallerySide: frustumProof(galleryRoster, gallerySideCamera),
          casaFront: frustumProof(casa, casaFrontCamera),
          casaSide: frustumProof(casa, casaSideCamera),
        },
        performer: boundsOf(performer.figure.root),
        performerBlood: boundsOf(blood),
      },
      ensemble: [...siege.ensemble.members.values()].map((member) => ({
        id: member.id,
        visible: member.root.visible,
        x: Number(member.root.position.x.toFixed(3)),
        y: Number(member.root.position.y.toFixed(3)),
        z: Number(member.root.position.z.toFixed(3)),
      })),
      landingDefenders: [...siege.ensemble.members.values()]
        .filter((member) => member.root.visible
          && Math.abs(member.root.position.y - 6) < 0.25
          && member.root.position.z >= 48.4
          && member.root.position.z <= 52)
        .map((member) => member.id),
    };
  }, { width: WIDTH, height: HEIGHT });
  const sconceProof = inventory.geometry.galleryRosterSconce;
  const casaProof = inventory.geometry.casaAcrossVault;
  const sightlines = inventory.geometry.sightlines;
  const frusta = inventory.geometry.frusta;
  const worklampShot = renderedShots.find(({ id }) => id === 'worklamp-eric-flinch');
  const worklampCapture = worklampShot?.semantic;
  const worklampSnapshot = worklampCapture?.before;
  const worklampWindowStable = worklampSnapshot != null
    && worklampCapture?.after != null
    && JSON.stringify(worklampSnapshot) === JSON.stringify(worklampCapture.after);
  const worklampComposition = worklampSnapshot?.composition;
  const worklampWindowValid = evaluateWorklampCaptureWindow(worklampCapture);
  /* A shot is bound once immediately after Playwright writes it and again at
   * ledger time. The second binding closes the same-label/late-overwrite
   * window across subsequent shots and inventory work. */
  for (const shotRecord of renderedShots) {
    const captured = capturedShotBuffers.get(shotRecord.file);
    const stored = fs.readFileSync(outputTransaction.stagePath(shotRecord.file));
    const rebound = bindScreenshotArtifact(captured, stored);
    if (rebound.bytes !== shotRecord.bytes || rebound.sha256 !== shotRecord.sha256) {
      throw new Error(`screenshot ledger drifted after capture: ${shotRecord.file}`);
    }
  }
  const checks = {
    freshShotSet: renderedShots.length === selectedViews.length
      && renderedShots.every((entry) => entry.bytes > 10000),
    noPageErrors: pageErrors.length === 0,
    no404s: notFound.length === 0,
    webglContextHealthy: inventory.contextLost === false,
    galleryIdentity: inventory.geometry.identities.galleryRoster?.slot === 'mansion.gallery.roster'
      && inventory.geometry.identities.galleryRoster?.real === true
      && inventory.geometry.identities.galleryRoster?.file === 'austin-major-2025-roster.jpg',
    casaIdentity: inventory.geometry.identities.casaAcrossVault?.slot === 'mansion.cellar.crest'
      && inventory.geometry.identities.casaAcrossVault?.real === true
      && inventory.geometry.identities.casaAcrossVault?.file === 'casabonita.webp',
    galleryFacesReachableSide: inventory.geometry.orientation.galleryRosterNormal[2] >= 0.999,
    galleryFrameWallContact: inventory.geometry.galleryFrame?.wall?.gap <= 0.001,
    galleryFrameClearsStair: inventory.geometry.galleryFrame?.box?.min?.[0] - 8.85 >= 0.25,
    galleryFrameClearsRightCase: Number.isFinite(inventory.geometry.galleryFrame?.rightCaseClearance)
      && inventory.geometry.galleryFrame.rightCaseClearance >= 0.25,
    gallerySconceMatchesAuthoredMount: sconceProof?.expectedDistance <= 0.001,
    gallerySconceHasTenParts: sconceProof?.partCount === 10,
    gallerySconceConnected: sconceProof?.connectedParts === 10,
    gallerySconceWallContact: sconceProof?.wall?.gap <= 0.005,
    gallerySconceClearsStair: sconceProof?.box?.min?.[0] - 8.85 >= 0.25,
    gallerySconceClearsRightCase: Number.isFinite(inventory.geometry.galleryFrame?.rightCaseClearance)
      && inventory.geometry.galleryFrame.box.max[0]
        + inventory.geometry.galleryFrame.rightCaseClearance
        - sconceProof?.box?.max?.[0] >= 0.25,
    galleryFrontRayClear: sightlines.galleryRoster?.[0]?.clear === true,
    gallerySideRayClear: sightlines.galleryRoster?.[1]?.clear === true,
    casaFrontRayClear: sightlines.casaAcrossVault?.[0]?.clear === true,
    casaSideRayClear: sightlines.casaAcrossVault?.[1]?.clear === true,
    galleryFullyFramedFront: frusta.galleryFront?.fullyInside === true,
    galleryFullyFramedSide: frusta.gallerySide?.fullyInside === true,
    casaFullyFramedFront: frusta.casaFront?.fullyInside === true,
    casaFullyFramedSide: frusta.casaSide?.fullyInside === true,
    casaClearsRail: casaProof?.intersections?.length === 0 && casaProof?.railClearance >= 0.05,
    casaArtContainedByFrame: casaProof?.containment?.boardBottom >= 0.0055
      && casaProof?.containment?.boardLeft >= 0.0055
      && casaProof?.containment?.boardRight >= 0.0055
      && casaProof?.containment?.boardTop >= 0.0055
      && casaProof?.containment?.bezelLeft >= 0.0345
      && casaProof?.containment?.bezelRight >= 0.0345
      && casaProof?.containment?.bezelBottom >= 0.0345
      && casaProof?.containment?.bezelTop >= 0.0345
      && Math.abs(casaProof.containment.boardLeft - casaProof.containment.boardRight) <= 0.0005
      && Math.abs(casaProof.containment.boardBottom - casaProof.containment.boardTop) <= 0.0005
      && Math.abs(casaProof.containment.bezelLeft - casaProof.containment.bezelRight) <= 0.0005
      && Math.abs(casaProof.containment.bezelBottom - casaProof.containment.bezelTop) <= 0.0005,
    casaMountedAtWall: casaProof?.frame !== null && casaProof?.bezel !== null
      && casaProof?.nearestStructuralWall?.frameRearGap >= -0.0005
      && casaProof?.nearestStructuralWall?.frameRearGap <= 0.005,
    worklampClampSupported: inventory.geometry.worklampClampSupport?.gap <= 0.01,
    worklampInComposition: worklampWindowStable
      && worklampComposition?.worklamp?.intersects === true,
    ericFullyInComposition: worklampWindowStable
      && worklampComposition?.eric?.body?.fullyInside === true,
    liveGuardFullyInComposition: worklampWindowStable
      && worklampComposition?.guard?.body?.fullyInside === true,
    worklampCompositionReadable: evaluateWorklampCaptureWindow(worklampCapture),
    worklampPixelCompositionReadable: evaluateWorklampPixelProof(
      worklampCapture?.pixelProof, worklampShot?.sha256,
    ),
    revivePromptOwnsEric: evaluateEricReviveCaptureWindow(worklampCapture),
    ericFallenReadable: worklampWindowValid
      && worklampSnapshot.eric.id === 'eric' && worklampSnapshot.eric.staged === true
      && worklampSnapshot.eric.health === 1 && worklampSnapshot.eric.downed === true
      && worklampSnapshot.eric.incapacitated === false
      && worklampSnapshot.eric.pose === 'fallen'
      && worklampSnapshot.eric.weaponId === 'ak47'
      && worklampSnapshot.eric.gunVisible === false
      && worklampSnapshot.eric.bloodVisible === true,
    guardFlinchArmedNotSurrender: worklampWindowValid
      && worklampSnapshot.liveGuard.id === 'guard_1'
      && worklampSnapshot.liveGuard.staged === true
      && worklampSnapshot.liveGuard.downed === false
      && worklampSnapshot.liveGuard.incapacitated === false
      && worklampSnapshot.liveGuard.pose === 'flinch'
      && worklampSnapshot.liveGuard.businessKey === 'flinch'
      && worklampSnapshot.liveGuard.weaponId === 'carbine'
      && worklampSnapshot.liveGuard.gunVisible === true
      && worklampSnapshot.liveGuard.firingGripContact === true
      && worklampSnapshot.liveGuard.supportHandGap <= 0.04
      && worklampSnapshot.liveGuard.bothHandsAboveHead === false,
  };
  const evidence = {
    pass: PASS,
    mode: TARGETED ? 'targeted' : SHOT_ID ? 'single' : 'full',
    port: PORT,
    viewport: { width: WIDTH, height: HEIGHT },
    shots: renderedShots,
    checks,
    inventory,
    notFound: [...new Set(notFound)],
    pageErrors,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, value]) => value !== true).map(([name]) => name);
  if (failedChecks.length) {
    console.error('FAILED HARD GATES:', failedChecks.join(', '));
    if (failedChecks.some((name) => [
      'worklampCompositionReadable', 'worklampPixelCompositionReadable',
      'ericFallenReadable', 'guardFlinchArmedNotSurrender',
    ].includes(name))) {
      console.error('WORKLAMP EVIDENCE DIAGNOSTICS:', JSON.stringify({
        capture: diagnoseWorklampCaptureWindow(worklampCapture),
        pixel: diagnoseWorklampPixelProof(
          worklampCapture?.pixelProof, worklampShot?.sha256,
        ),
      }));
    }
    throw new Error(`Mansion Siege evidence rejected: ${failedChecks.join(', ')}`);
  }
  /* A successful ledger is the publication boundary. Close every runtime
   * resource first, then atomically link complete staged PNGs and link the
   * ledger last. A close or publish failure therefore cannot leave an old or
   * partial same-label certification in the evidence directory. */
  await closeEvidenceLifecycle({ browser, server });
  browser = null;
  outputTransaction.commit({
    artifacts: renderedShots.map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 })),
    ledgerName: `${PASS}-evidence.json`,
    ledgerBytes: `${JSON.stringify(evidence, null, 2)}\n`,
  });
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  try {
    await closeEvidenceLifecycle({ browser, server });
  } finally {
    outputTransaction.abort();
  }
}
