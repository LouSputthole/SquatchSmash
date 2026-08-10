#!/usr/bin/env node
/**
 * Original-resolution visual evidence for the focused Mansion walkthrough.
 *
 * Every frame is the real production Mansion. Camera poses resolve from
 * window.mansion anchors/published props and targets resolve from the live
 * scene graph; this tool never constructs a parallel preview scene.
 *
 * Usage:
 *   node tools/capture-mansion-walkthrough-original.mjs final
 *   MANSION_BASE_URL=https://example.test/ node tools/capture-mansion-walkthrough-original.mjs deployed
 *   MANSION_RESUME=1 MANSION_CAPTURE_IDS=id-a,id-b MANSION_RECAPTURE_IDS=id-a \
 *     node tools/capture-mansion-walkthrough-original.mjs final
 *
 * Default output is exact 1920 x 1080 PNG at deviceScaleFactor 1. WIDTH and
 * HEIGHT may be set explicitly, and the report records the resulting IHDR.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import {
  MANSION_WALKTHROUGH_COVERAGE,
  MANSION_WALKTHROUGH_VIEWS,
  assertWalkthroughSpec,
} from './mansion-walkthrough-spec.mjs';

assertWalkthroughSpec();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = (process.argv[2] || 'final').replace(/[^a-z0-9_-]/gi, '-');
const WIDTH = Number(process.env.WIDTH) || 1920;
const HEIGHT = Number(process.env.HEIGHT) || 1080;
const PORT = Number(process.env.PORT) || 54942;
const EXTERNAL_BASE = process.env.MANSION_BASE_URL?.replace(/\/+$/, '') || null;
const OUT = path.join(
  ROOT, 'docs', 'validation', '2026-08-09', 'mansion-walkthrough', LABEL, 'original',
);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};
const FRAME_QUALITY_THRESHOLDS = Object.freeze({
  blackChannel: 12,
  minimumNonBlackFraction: 0.08,
  minimumMeanLuminance: 4,
  minimumLuminanceRange: 18,
  minimumChannelRange: 24,
});

function parseIdList(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error(`${name} contains duplicate IDs`);
  return new Set(ids);
}

const RESUME = process.env.MANSION_RESUME === '1';
const CAPTURE_IDS = parseIdList('MANSION_CAPTURE_IDS');
const RECAPTURE_IDS = parseIdList('MANSION_RECAPTURE_IDS') ?? new Set();
const KNOWN_VIEW_IDS = new Set(MANSION_WALKTHROUGH_VIEWS.map(({ id }) => id));
for (const [name, ids] of [['MANSION_CAPTURE_IDS', CAPTURE_IDS], ['MANSION_RECAPTURE_IDS', RECAPTURE_IDS]]) {
  for (const id of ids ?? []) {
    if (!KNOWN_VIEW_IDS.has(id)) throw new Error(`${name} references unknown view ${id}`);
  }
}
if (RESUME !== Boolean(CAPTURE_IDS)) {
  throw new Error('MANSION_RESUME=1 and a non-empty MANSION_CAPTURE_IDS list must be supplied together');
}
for (const id of RECAPTURE_IDS) {
  if (!CAPTURE_IDS?.has(id)) throw new Error(`MANSION_RECAPTURE_IDS view ${id} is not in MANSION_CAPTURE_IDS`);
}

/* These are evidence-camera corrections only. Every source is still a real
 * production anchor and every target is still a live production object/path.
 * No proxy geometry or parallel scene is introduced. */
const CAPTURE_VIEW_OVERRIDES = Object.freeze({
  'pool-room-cases': {
    from: { anchor: 'loungeCenter', offset: [0.5, 0, -2.1] },
    target: { path: ['interior', 'props', 'lounge', 'cases'], index: 0 },
  },
  'pool-swimmer': {
    from: { anchor: 'poolPatio', offset: [0, 0, -6.0] },
  },
  'kitchen-appliances': {
    target: {
      midpointPaths: [
        ['interior', 'props', 'kitchen', 'refrigerator'],
        ['interior', 'props', 'kitchen', 'microwave'],
      ],
    },
  },
  'family-fireplace': {
    from: { anchor: 'livingRoomCenter', offset: [2.5, 0, 6.0] },
  },
  'gothic-bedroom': {
    from: { roomPath: ['roomTable', 'bedWestFront'], uv: [0.22, 0.16] },
  },
  'lake-wall-side': {
    from: { anchor: 'bedWestRear', offset: [2.2, 0, 3.0] },
  },
  'lake-bedroom-placard': {
    /* Gallery-north doorway centre is x=-14,z=53. The placard is mounted on
     * its actual gallery face at z=52.97, so this live gallery-room pose is
     * close, square-on, and remains south of the structural wall. */
    from: { roomPath: ['roomTable', 'gallery'], uv: [0.0625, 0.56] },
    target: { name: 'lake-room-placard' },
  },
  'lou-suite-bar': {
    from: { roomPath: ['roomTable', 'masterSuite'], uv: [0.28, 0.66] },
    target: { name: 'suite-bar-mirror' },
  },
  'cellar-wall-object': {
    from: { roomPath: ['roomTable', 'basement'], uv: [0.733, 0.735] },
  },
});
const CAPTURE_VIEWS = Object.freeze(MANSION_WALKTHROUGH_VIEWS.map((view) => Object.freeze({
  ...view,
  ...(CAPTURE_VIEW_OVERRIDES[view.id] ?? {}),
})));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot capture Mansion evidence.');
  process.exit(1);
}

async function startStaticServer() {
  if (EXTERNAL_BASE) return { server: null, base: EXTERNAL_BASE };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const file = path.resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
      if ((file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`))
        || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      if (req.method === 'HEAD') res.end();
      else res.end(await fsp.readFile(file));
    } catch (error) {
      res.writeHead(500).end(error.message);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });
  return { server, base: `http://127.0.0.1:${PORT}` };
}

function pngDimensions(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a' || buffer.length < 24) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function frameQuality(buffer) {
  const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  if (metadata.format !== 'png' || !metadata.width || !metadata.height) {
    throw new Error(`screenshot is not a decodable PNG: ${JSON.stringify(metadata)}`);
  }
  const { data, info } = await sharp(buffer, { failOn: 'error' })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels < 3 || info.width !== metadata.width || info.height !== metadata.height) {
    throw new Error(`decoded screenshot has an unexpected pixel layout: ${JSON.stringify(info)}`);
  }
  const channelMin = [255, 255, 255];
  const channelMax = [0, 0, 0];
  let luminanceMin = 255;
  let luminanceMax = 0;
  let luminanceTotal = 0;
  let nonBlackPixels = 0;
  const pixels = info.width * info.height;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    channelMin[0] = Math.min(channelMin[0], r);
    channelMin[1] = Math.min(channelMin[1], g);
    channelMin[2] = Math.min(channelMin[2], b);
    channelMax[0] = Math.max(channelMax[0], r);
    channelMax[1] = Math.max(channelMax[1], g);
    channelMax[2] = Math.max(channelMax[2], b);
    const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
    luminanceMin = Math.min(luminanceMin, luminance);
    luminanceMax = Math.max(luminanceMax, luminance);
    luminanceTotal += luminance;
    if (Math.max(r, g, b) > FRAME_QUALITY_THRESHOLDS.blackChannel) nonBlackPixels++;
  }
  const channelRange = channelMax.map((value, index) => value - channelMin[index]);
  const metrics = {
    decoded: true,
    format: metadata.format,
    width: info.width,
    height: info.height,
    channels: info.channels,
    channelMin,
    channelMax,
    channelRange,
    maximumChannelRange: Math.max(...channelRange),
    luminanceMin: +luminanceMin.toFixed(3),
    luminanceMax: +luminanceMax.toFixed(3),
    luminanceRange: +(luminanceMax - luminanceMin).toFixed(3),
    meanLuminance: +(luminanceTotal / pixels).toFixed(3),
    nonBlackPixels,
    nonBlackFraction: +(nonBlackPixels / pixels).toFixed(6),
  };
  metrics.ok = metrics.nonBlackFraction >= FRAME_QUALITY_THRESHOLDS.minimumNonBlackFraction
    && metrics.meanLuminance >= FRAME_QUALITY_THRESHOLDS.minimumMeanLuminance
    && metrics.luminanceRange >= FRAME_QUALITY_THRESHOLDS.minimumLuminanceRange
    && metrics.maximumChannelRange >= FRAME_QUALITY_THRESHOLDS.minimumChannelRange;
  return metrics;
}

function fileNameFor(view) {
  return `${String(view.section).padStart(2, '0')}-${view.id}.png`;
}

async function inspectFrame(view) {
  const fileName = fileNameFor(view);
  const file = path.join(OUT, fileName);
  const buffer = await fsp.readFile(file);
  const dimensions = pngDimensions(buffer);
  if (dimensions?.width !== WIDTH || dimensions?.height !== HEIGHT) {
    throw new Error(`${fileName} is ${dimensions?.width}x${dimensions?.height}, expected ${WIDTH}x${HEIGHT}`);
  }
  const quality = await frameQuality(buffer);
  if (!quality.ok) {
    throw new Error(`${fileName} failed the nonblack frame-quality gate: ${JSON.stringify({
      thresholds: FRAME_QUALITY_THRESHOLDS, quality,
    })}`);
  }
  return {
    fileName,
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    dimensions,
    quality,
  };
}

async function atomicWrite(file, contents) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsp.writeFile(temporary, contents);
    await fsp.rename(temporary, file);
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

await fsp.mkdir(OUT, { recursive: true });
const reusableFrames = new Map();
if (RESUME) {
  for (const view of CAPTURE_VIEWS) {
    if (!CAPTURE_IDS.has(view.id) || RECAPTURE_IDS.has(view.id)) {
      try {
        reusableFrames.set(view.id, await inspectFrame(view));
      } catch (error) {
        const role = RECAPTURE_IDS.has(view.id) ? 'recapture source' : 'reusable frame';
        throw new Error(`${role} ${view.id} is not a validated existing original: ${error.message}`);
      }
    }
  }
}

const { server, base } = await startStaticServer();

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});
await page.addInitScript(() => {
  window.__mansionCaptureWebglLosses = [];
  document.addEventListener('webglcontextlost', (event) => {
    window.__mansionCaptureWebglLosses.push({ at: performance.now(), status: event.statusMessage || '' });
  }, true);
});

const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];
const httpErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500));
});
page.on('requestfailed', (request) => failedRequests.push({
  url: request.url(), error: request.failure()?.errorText ?? 'request failed',
}));
page.on('response', (response) => {
  if (response.status() >= 400) httpErrors.push({ status: response.status(), url: response.url() });
});

async function resolveView(view, { positionOnly = false } = {}) {
  return page.evaluate(({ view: spec, positionOnly: onlyPosition }) => {
    const m = window.mansion;
    const T = m.THREE;

    function pathValue(parts) {
      let owner = null;
      let value = m;
      for (const part of parts ?? []) {
        owner = value;
        value = value?.[part];
      }
      return { owner, value };
    }

    function asObject(value) {
      if (!value) return null;
      if (value.isObject3D) return value;
      if (Array.isArray(value)) return asObject(value[0]);
      for (const key of ['group', 'root', 'statue', 'water', 'mesh', 'object', 'pegboard']) {
        if (value[key]?.isObject3D) return value[key];
      }
      return null;
    }

    function objectFor(target) {
      if (!target) return null;
      if (target.name) return m.scene.getObjectByName(target.name);
      if (target.anyName) {
        for (const name of target.anyName) {
          const object = m.scene.getObjectByName(name);
          if (object) return object;
        }
        return null;
      }
      if (target.path) {
        let { owner, value } = pathValue(target.path);
        if (target.call) value = value?.apply?.(owner, target.call);
        if (Number.isInteger(target.index)) value = value?.[target.index];
        if (target.member) value = value?.[target.member];
        return asObject(value);
      }
      return null;
    }

    function npcPoint(id) {
      const at = m.cast.people[id];
      return at ? new T.Vector3(at.x, at.y + 1.05, at.z) : null;
    }

    function anchorPoint(id) {
      const at = m.rooms?.[id] ?? m.lab?.anchors?.[id];
      return Number.isFinite(at?.x) && Number.isFinite(at?.y) && Number.isFinite(at?.z)
        ? new T.Vector3(at.x, at.y, at.z) : null;
    }

    function targetPoint(target) {
      if (target?.npc) return npcPoint(target.npc);
      if (target?.anchor) {
        const at = anchorPoint(target.anchor);
        return at ? at.add(new T.Vector3(0, 1.1, 0)) : null;
      }
      if (target?.point) return new T.Vector3(...target.point);
      if (target?.pointFromPath) {
        const { value } = pathValue(target.pointFromPath);
        if (!Number.isFinite(value?.x) || !Number.isFinite(value?.z)) return null;
        const y = Number.isFinite(value.y) ? value.y : m.player.ground + 1.0;
        return new T.Vector3(value.x, y, value.z);
      }
      if (target?.midpointPaths) {
        const points = target.midpointPaths.map((parts) => {
          const object = objectFor({ path: parts });
          if (!object) return null;
          object.updateMatrixWorld(true);
          return new T.Box3().setFromObject(object).getCenter(new T.Vector3());
        });
        if (points.some((point) => !point)) return null;
        return points.reduce((sum, point) => sum.add(point), new T.Vector3())
          .multiplyScalar(1 / points.length);
      }
      const object = objectFor(target);
      if (!object) return null;
      object.updateMatrixWorld(true);
      return new T.Box3().setFromObject(object).getCenter(new T.Vector3());
    }

    function fromPoint() {
      let point = null;
      if (spec.inspectionView) {
        const view = m.lab.hiddenWall.bustDisplay.inspectionViews
          .find(({ id }) => id === spec.inspectionView);
        if (view) point = new T.Vector3(view.x, view.y, view.z);
      } else if (spec.fromNpc) {
        const at = m.cast.people[spec.fromNpc];
        if (at) point = new T.Vector3(at.x, at.y, at.z);
      } else if (spec.from?.anchor) {
        point = anchorPoint(spec.from.anchor);
      } else if (spec.from?.serviceRoadLandingApproach) {
        const access = m.grounds?.props?.serviceRoad;
        const landing = access?.landing;
        const ramp = access?.ramp;
        if (landing && ramp) {
          const z = (landing.z0 + landing.z1) / 2;
          const y = access.groundAt(ramp.x1, z);
          if (Number.isFinite(y)) point = new T.Vector3(ramp.x1, y, z);
        }
      } else if (spec.from?.rectPath) {
        const { value: rect } = pathValue(spec.from.rectPath);
        if (rect && Number.isFinite(rect.x0) && Number.isFinite(rect.x1)
          && Number.isFinite(rect.z0) && Number.isFinite(rect.z1)) {
          point = new T.Vector3(
            (rect.x0 + rect.x1) / 2,
            Number.isFinite(rect.y) ? rect.y : 0,
            (rect.z0 + rect.z1) / 2,
          );
        }
      } else if (spec.from?.roomPath) {
        const { value: room } = pathValue(spec.from.roomPath);
        const rect = room?.rect;
        const [u, v] = spec.from.uv ?? [];
        if (rect && Number.isFinite(room.floor)
          && Number.isFinite(rect.x0) && Number.isFinite(rect.x1)
          && Number.isFinite(rect.z0) && Number.isFinite(rect.z1)
          && Number.isFinite(u) && u > 0 && u < 1
          && Number.isFinite(v) && v > 0 && v < 1) {
          point = new T.Vector3(
            rect.x0 + (rect.x1 - rect.x0) * u,
            room.floor,
            rect.z0 + (rect.z1 - rect.z0) * v,
          );
        }
      } else if (spec.from?.point) {
        point = new T.Vector3(...spec.from.point);
      }
      const offset = spec.from?.offset ?? spec.offset ?? [0, 0, 0];
      if (point) point.add(new T.Vector3(...offset));
      return point;
    }

    const from = fromPoint();
    const target = targetPoint(spec.target);
    const targetObject = objectFor(spec.target);
    const targetName = targetObject?.name
      || (spec.target?.npc ? `npc:${spec.target.npc}` : null)
      || (spec.target?.path ? `path:${spec.target.path.join('.')}` : null)
      || (spec.target?.midpointPaths
        ? `midpoint:${spec.target.midpointPaths.map((parts) => parts.join('.')).join('|')}` : null);
    if (!from) return { error: `missing camera source for ${spec.id}` };
    if (!onlyPosition && !target) return { error: `missing target for ${spec.id}`, targetSpec: spec.target };
    return {
      from: [from.x, from.y, from.z],
      target: target ? [target.x, target.y, target.z] : null,
      targetName,
    };
  }, { view, positionOnly });
}

async function findDressInteractionPose() {
  return page.evaluate(() => {
    const m = window.mansion;
    const speaker = m.cast.people.poolPerformer1;
    if (!speaker) return null;
    for (const radius of [1.5, 1.75, 2.0]) {
      for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        const x = speaker.x + Math.cos(angle) * radius;
        const z = speaker.z + Math.sin(angle) * radius;
        m.teleport(x, speaker.y, z, 0);
        const p = m.player;
        p.yaw = Math.atan2(-(speaker.x - p.position.x), -(speaker.z - p.position.z));
        p.pitch = Math.atan2(
          speaker.y + 1.05 - p.position.y,
          Math.max(1e-6, Math.hypot(speaker.x - p.position.x, speaker.z - p.position.z)),
        );
        m.tick(0.12);
        if (m.prompt.visible && m.prompt.key === 'E') return { x, y: speaker.y, z };
      }
    }
    return null;
  });
}

async function prepareRuntime(runtime) {
  if (runtime !== 'dress-focus') return null;
  const pose = await findDressInteractionPose();
  if (!pose) throw new Error('pool dress focus: no real InteractionSystem E pose found');
  for (let step = 0; step < 3; step++) {
    await page.keyboard.press('KeyE');
    await page.evaluate((duration) => window.mansion.tick(duration), step < 2 ? 8 : 0.2);
  }
  const state = await page.evaluate(() => ({
    active: window.mansion.cast.evening.secondDress.active,
    focus: window.mansion.cast.evening.secondDress.focus,
  }));
  if (!state.active || !state.focus?.active) {
    throw new Error(`pool dress focus did not start through real E: ${JSON.stringify(state)}`);
  }
  return state;
}

async function clearRuntime(runtime) {
  if (runtime === 'dress-focus') {
    await page.evaluate(() => window.mansion.cast.abandonPoolDress());
  }
}

const evidence = [];
const capturedIds = new Set();
let boot = null;
let gl = null;
try {
  const response = await page.goto(`${base}/mansion.html?preview=1&capture=${Date.now()}`, {
    waitUntil: 'load', timeout: 180000,
  });
  if (response?.status() !== 200) throw new Error(`Mansion page returned HTTP ${response?.status()}`);
  await page.waitForFunction(() => window.mansion?.player && window.mansion?.renderer, null, {
    timeout: 180000,
  });
  await page.evaluate(() => document.getElementById('startBtn').click());
  await page.waitForFunction(() => window.mansion.running === true, null, { timeout: 120000 });
  await page.waitForFunction(() => window.mansion.framesRendered > 3, null, { timeout: 180000 });
  boot = await page.evaluate(() => {
    const gl = window.mansion.renderer.getContext();
    return {
      frames: window.mansion.framesRendered,
      contextType: gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl1',
      lost: gl.isContextLost(),
      error: gl.getError(),
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    };
  });
  if (boot.contextType !== 'webgl2' || boot.lost || boot.error !== 0
    || boot.drawingBuffer.some((value) => value <= 0)) {
    throw new Error(`unhealthy WebGL boot: ${JSON.stringify(boot)}`);
  }
  await page.evaluate(() => window.mansion.setRendering(false));

  /* Hard preflight: a missing object is a source failure, not a screenshot
   * silently aimed at a convenient coordinate. */
  const preflight = [];
  for (const view of CAPTURE_VIEWS) {
    const resolved = await resolveView(view);
    preflight.push({ id: view.id, ...resolved });
  }
  const unresolved = preflight.filter(({ error }) => error);
  if (unresolved.length) {
    throw new Error(`Mansion evidence targets missing: ${JSON.stringify(unresolved)}`);
  }

  const preflightById = new Map(preflight.map((item) => [item.id, item]));
  for (const view of CAPTURE_VIEWS) {
    if (RESUME && !CAPTURE_IDS.has(view.id)) {
      const existing = reusableFrames.get(view.id);
      const resolved = preflightById.get(view.id);
      evidence.push({
        id: view.id,
        section: view.section,
        file: existing.fileName,
        bytes: existing.bytes,
        sha256: existing.sha256,
        dimensions: existing.dimensions,
        quality: existing.quality,
        from: resolved.from,
        target: resolved.target,
        targetName: resolved.targetName,
        runtime: null,
        source: 'validated-existing',
      });
      console.log(`  reused ${existing.fileName} (${existing.dimensions.width}x${existing.dimensions.height})`);
      continue;
    }

    const runtime = await prepareRuntime(view.runtime);
    let resolved = await resolveView(view);
    if (resolved.error) throw new Error(resolved.error);
    if (view.runtime === 'dress-focus') {
      /* The real focus lifecycle has already snapped the real Player to its
       * authored marker and aimed at the fastening. Teleporting here would
       * destroy the very composition this frame is meant to prove. */
      const focused = await page.evaluate(() => {
        const m = window.mansion;
        const rig = m.cast.poolPerformerRig(1);
        const target = rig?.strap?.getWorldPosition(new m.THREE.Vector3());
        return {
          from: [m.player.position.x, m.player.position.y, m.player.position.z],
          target: target ? [target.x, target.y, target.z] : null,
          targetName: rig?.strap?.name ?? null,
          focus: m.cast.evening.secondDress.focus,
          actorStaging: m.cast.evening.secondDress.actorStaging,
        };
      });
      if (!focused.target || focused.focus?.markerDistance >= 1e-9
        || focused.actorStaging?.markerDistance >= 1e-9
        || focused.actorStaging?.yawError >= 1e-9) {
        throw new Error(`dress focus lost its authored staging: ${JSON.stringify(focused)}`);
      }
      resolved = { ...resolved, ...focused };
      await page.evaluate(() => window.mansion.tick(0.35));
    } else {
      await page.evaluate(({ from, target }) => {
        const m = window.mansion;
        m.teleport(from[0], from[1], from[2], 0);
        const p = m.player;
        const dx = target[0] - p.position.x;
        const dy = target[1] - p.position.y;
        const dz = target[2] - p.position.z;
        p.yaw = Math.atan2(-dx, -dz);
        p.pitch = Math.max(-1.2, Math.min(1.2, Math.atan2(dy, Math.max(1e-6, Math.hypot(dx, dz)))));
        m.tick(0.35);
      }, resolved);
    }

    const before = await page.evaluate(() => window.mansion.framesRendered);
    await page.evaluate(() => window.mansion.setRendering(true));
    await page.waitForFunction((frames) => window.mansion.framesRendered >= frames + 3, before, {
      timeout: 180000,
    });
    const buffer = await page.screenshot({
      fullPage: false,
      animations: 'allow',
      caret: 'hide',
      timeout: 120000,
    });
    await page.evaluate(() => window.mansion.setRendering(false));
    const fileName = fileNameFor(view);
    const file = path.join(OUT, fileName);
    await atomicWrite(file, buffer);
    const dimensions = pngDimensions(buffer);
    if (dimensions?.width !== WIDTH || dimensions?.height !== HEIGHT) {
      throw new Error(`${fileName} is ${dimensions?.width}x${dimensions?.height}, expected ${WIDTH}x${HEIGHT}`);
    }
    const quality = await frameQuality(buffer);
    if (!quality.ok) {
      throw new Error(`${fileName} failed the nonblack frame-quality gate: ${JSON.stringify({
        thresholds: FRAME_QUALITY_THRESHOLDS, quality,
      })}`);
    }
    const item = {
      id: view.id,
      section: view.section,
      file: fileName,
      bytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      dimensions,
      quality,
      from: resolved.from,
      target: resolved.target,
      targetName: resolved.targetName,
      runtime,
      source: RECAPTURE_IDS.has(view.id) ? 'recaptured' : 'captured',
    };
    evidence.push(item);
    capturedIds.add(view.id);
    console.log(`  wrote ${fileName} (${dimensions.width}x${dimensions.height})`);
    await clearRuntime(view.runtime);
  }

  gl = await page.evaluate(() => {
    const context = window.mansion.renderer.getContext();
    return {
      lost: context.isContextLost(),
      error: context.getError(),
      drawingBuffer: [context.drawingBufferWidth, context.drawingBufferHeight],
      losses: [...(window.__mansionCaptureWebglLosses ?? [])],
      frames: window.mansion.framesRendered,
    };
  });
  const expectedCaptureIds = CAPTURE_IDS ?? KNOWN_VIEW_IDS;
  const missingCaptures = [...expectedCaptureIds].filter((id) => !capturedIds.has(id));
  const unexpectedCaptures = [...capturedIds].filter((id) => !expectedCaptureIds.has(id));
  if (missingCaptures.length || unexpectedCaptures.length) {
    throw new Error(`capture selection mismatch: ${JSON.stringify({ missingCaptures, unexpectedCaptures })}`);
  }
  if (gl.lost || gl.error !== 0 || gl.losses.length
    || gl.drawingBuffer.some((value) => value <= 0)
    || pageErrors.length || consoleErrors.length || failedRequests.length || httpErrors.length) {
    throw new Error(JSON.stringify({ gl, pageErrors, consoleErrors, failedRequests, httpErrors }));
  }

  const expectedFiles = CAPTURE_VIEWS.map(fileNameFor).sort();
  const actualFiles = (await fsp.readdir(OUT))
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .sort();
  if (new Set(expectedFiles).size !== 42 || expectedFiles.length !== 42
    || JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`original frame inventory is not exactly 42 unique expected PNGs: ${JSON.stringify({
      expectedCount: expectedFiles.length,
      actualCount: actualFiles.length,
      missing: expectedFiles.filter((name) => !actualFiles.includes(name)),
      extra: actualFiles.filter((name) => !expectedFiles.includes(name)),
    })}`);
  }

  const metadataById = new Map(evidence.map((item) => [item.id, item]));
  if (metadataById.size !== 42 || evidence.length !== 42) {
    throw new Error(`capture metadata is not exactly 42 unique views (${metadataById.size}/${evidence.length})`);
  }
  const finalEvidence = [];
  for (const view of CAPTURE_VIEWS) {
    const inspected = await inspectFrame(view);
    const metadata = metadataById.get(view.id);
    if (!metadata) throw new Error(`missing capture metadata for ${view.id}`);
    finalEvidence.push({
      ...metadata,
      file: inspected.fileName,
      bytes: inspected.bytes,
      sha256: inspected.sha256,
      dimensions: inspected.dimensions,
      quality: inspected.quality,
    });
  }
  evidence.splice(0, evidence.length, ...finalEvidence);

  const report = {
    label: LABEL,
    generatedAt: new Date().toISOString(),
    url: `${base}/mansion.html?preview=1`,
    external: Boolean(EXTERNAL_BASE),
    exactResolution: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
    frameQualityThresholds: FRAME_QUALITY_THRESHOLDS,
    capturePlan: {
      resume: RESUME,
      captureIds: [...expectedCaptureIds],
      recaptureIds: [...RECAPTURE_IDS],
      reusedIds: evidence.filter(({ source }) => source === 'validated-existing').map(({ id }) => id),
    },
    coverage: MANSION_WALKTHROUGH_COVERAGE,
    evidence,
    boot,
    gl,
    pageErrors,
    consoleErrors,
    failedRequests,
    httpErrors,
  };
  await atomicWrite(path.join(OUT, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  const index = [
    `# Mansion walkthrough original-resolution evidence — ${LABEL}`,
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Resolution: ${WIDTH} x ${HEIGHT}, deviceScaleFactor 1`,
    '',
    ...evidence.map((item) => `- §${item.section} ${item.id}: ${item.file} (${item.sha256})`),
    '',
  ].join('\n');
  await atomicWrite(path.join(OUT, 'README.md'), index);
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}

console.log(`Mansion walkthrough evidence: ${evidence.length}/${MANSION_WALKTHROUGH_VIEWS.length} original-resolution frames, zero runtime errors`);
