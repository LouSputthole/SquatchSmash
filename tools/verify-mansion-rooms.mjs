#!/usr/bin/env node
/** Focused production-browser verifier for the Mansion room refinement pass. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 54936;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});

const results = [];
function check(label, ok, payload) {
  results.push({ label, ok, payload });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label} - ${JSON.stringify(payload)}`);
}

await new Promise((resolve) => server.listen(PORT, resolve));
let browser;
try {
  browser = await chromium.launch({
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const notFound = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => {
    if (response.status() === 404) notFound.push(new URL(response.url()).pathname);
  });

  await page.goto(`http://localhost:${PORT}/mansion.html?preview=1`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.mansion?.player, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById('startBtn').click());
  await page.waitForFunction(() => window.mansion.running === true, null, { timeout: 120000 });
  await page.waitForFunction(() => window.mansion.framesRendered > 3, null, { timeout: 180000 });
  await page.evaluate(() => window.mansion.setRendering(false));

  const roomFinish = await page.evaluate(() => {
    const m = window.mansion;
    const T = m.THREE;
    const scene = m.scene;
    const props = m.interior.props;
    scene.updateMatrixWorld(true);
    const bounds = (object) => {
      if (!object) return null;
      const b = new T.Box3().setFromObject(object);
      if (b.isEmpty()) return null;
      const out = {
        x0: b.min.x, x1: b.max.x,
        y0: b.min.y, y1: b.max.y,
        z0: b.min.z, z1: b.max.z,
      };
      out.sx = out.x1 - out.x0;
      out.sy = out.y1 - out.y0;
      out.sz = out.z1 - out.z0;
      out.cx = (out.x0 + out.x1) / 2;
      out.cz = (out.z0 + out.z1) / 2;
      out.finite = Object.values(out).every(Number.isFinite);
      return out;
    };
    const namedBounds = (name) => bounds(scene.getObjectByName(name));
    const lightIntensity = (object) => {
      let total = 0;
      object?.traverse((piece) => { if (piece.isLight) total += piece.intensity; });
      return total;
    };

    const sink = props.kitchen.sink;
    const sinkRim = bounds(sink?.rim);
    const sinkBowls = (sink?.bowls ?? []).map(bounds);
    const sinkStream = bounds(sink?.stream);
    const streamBowls = sinkStream ? sinkBowls.filter((b) => b
      && sinkStream.cx >= b.x0 && sinkStream.cx <= b.x1
      && sinkStream.cz >= b.z0 && sinkStream.cz <= b.z1).length : 0;
    const faucetParts = [
      'kitchen-sink-faucet-base', 'kitchen-sink-faucet-riser', 'kitchen-sink-faucet-arch',
      'kitchen-sink-faucet-spout', 'kitchen-sink-faucet-lever',
      'kitchen-sink-pullout-spray', 'kitchen-sink-soap-pump',
    ];

    const suite = props.masterSuite.refinement;
    const suiteBench = bounds(suite?.bench);
    const suiteMattress = namedBounds('suite-bed-mattress');
    const benchCollider = suiteBench ? m.interior.colliders.some((c) => (
      Math.abs(c.min.x - suiteBench.x0) <= 0.05
      && Math.abs(c.max.x - suiteBench.x1) <= 0.05
      && Math.abs(c.min.z - suiteBench.z0) <= 0.05
      && Math.abs(c.max.z - suiteBench.z1) <= 0.05
      && c.min.y <= suiteBench.y0 + 0.02
      && c.max.y >= suiteBench.y1 - 0.02
    )) : false;

    const rugs = [
      ['westFront', props.bedrooms.westFront?.rug, 'bed-west-front-floor'],
      ['eastFront', props.bedrooms.eastFront?.rug, 'bed-east-front-floor'],
      ['westRear', props.bedrooms.westRear?.rug, 'bed-west-rear-floor'],
      ['eastRear', props.bedrooms.eastRear?.rug, 'bed-east-rear-floor'],
      ['guestRoom', props.guestRoom?.rug, 'guest-floor'],
    ].map(([id, rug, floorName]) => ({ id, rug: bounds(rug), floor: namedBounds(floorName) }));

    const detailObjects = {
      westFront: props.bedrooms.westFront?.details ?? [],
      eastFront: props.bedrooms.eastFront?.details ?? [],
      westRear: props.bedrooms.westRear?.details ?? [],
      eastRear: props.bedrooms.eastRear?.details ?? [],
      guestRoom: props.guestRoom?.refinement?.bedding ?? [],
    };
    const details = Object.fromEntries(Object.entries(detailObjects).map(([id, objects]) => [id, {
      names: objects.map((o) => o?.name ?? ''), bounds: objects.map(bounds),
    }]));
    const clusterRooms = {
      westFront: props.bedrooms.westFront,
      eastFront: props.bedrooms.eastFront,
      westRear: props.bedrooms.westRear,
      eastRear: props.bedrooms.eastRear,
      guestRoom: props.guestRoom,
    };
    const clusters = Object.fromEntries(Object.entries(clusterRooms).map(([id, room]) => [id, {
      kind: room?.cluster?.kind ?? null,
      rootName: room?.cluster?.root?.name ?? null,
      root: bounds(room?.cluster?.root),
      names: (room?.cluster?.inventory ?? []).map((o) => o?.name ?? ''),
      bounds: (room?.cluster?.inventory ?? []).map(bounds),
    }]));

    const gl = m.renderer.getContext();
    return {
      sink: {
        bowls: sinkBowls, rim: sinkRim, stream: sinkStream, streamBowls,
        faucet: bounds(sink?.faucet), missingFaucetParts: faucetParts.filter((name) => !scene.getObjectByName(name)),
      },
      suite: {
        bench: suiteBench,
        gap: suiteBench && suiteMattress ? suiteBench.z0 - suiteMattress.z1 : null,
        runners: (suite?.runners ?? []).map(bounds),
        portraitName: suite?.portrait?.name ?? null,
        portrait: bounds(suite?.portrait), portraitArt: bounds(suite?.portraitArt),
        portraitArtPiece: suite?.portraitArt?.userData?.artPiece ?? null,
        portraitManifestSlot: suite?.portraitArt?.userData?.art?.slot
          ?? suite?.portraitArt?.userData?.artSlot ?? null,
        accentNames: (suite?.accentLights ?? []).map((o) => o?.name ?? ''),
        accentLights: (suite?.accentLights ?? []).map(bounds),
        accentIntensity: (suite?.accentLights ?? []).map(lightIntensity),
        portraitLightName: suite?.portraitLight?.name ?? null,
        portraitLight: bounds(suite?.portraitLight),
        portraitLightIntensity: lightIntensity(suite?.portraitLight), benchCollider,
      },
      rugs, details, clusters,
      gl: { lost: gl.isContextLost(), drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] },
    };
  });

  const recoveredArt = await page.evaluate(async () => {
    const expected = [
      ['mansion.gallery.roster', 'austin-major-2025-roster.jpg'],
      ['mansion.ballroom.major', 'austin-major-cowboy-banner.jpg'],
      ['mansion.lounge.cowboy', 'austin-major-cowboy.jpg'],
      ['mansion.conference.stacks', 'logo-5-years-of-stacks.jpg'],
      ['mansion.office.boss', 'boss-camp-shirt.jpg'],
      ['mansion.winter.almighty', 'squatch-almighty.jpg'],
      ['mansion.cellar.bus', 'party-bus-night.jpg'],
      ['mansion.guest.dog', 'house-dog.jpg'],
      ['mansion.theatre.lockup', 'austin-major-lockup.jpg'],
      ['mansion.lan.denver', 'logo-denver-2026.jpg'],
    ];
    const dressed = await window.mansion.interior.artReady;
    const meshes = [];
    window.mansion.scene.updateMatrixWorld(true);
    window.mansion.scene.traverse((mesh) => {
      const art = mesh.userData?.art;
      if (!art?.slot || !expected.some(([slot]) => slot === art.slot)) return;
      const image = mesh.material?.map?.image ?? mesh.material?.map?.source?.data ?? null;
      let shown = mesh.visible !== false && mesh.material?.visible !== false;
      for (let parent = mesh.parent; parent && shown; parent = parent.parent) shown = parent.visible !== false;
      const size = new window.mansion.THREE.Box3().setFromObject(mesh)
        .getSize(new window.mansion.THREE.Vector3());
      meshes.push({
        slot: art.slot, file: art.file, real: art.real === true, shown,
        mapped: Boolean(mesh.material?.map),
        decoded: Boolean(image && image.complete !== false
          && ((image.naturalWidth ?? image.videoWidth ?? image.width ?? 0) > 0)),
        width: Math.max(size.x, size.z), height: size.y,
      });
    });
    return { expected, dressed, meshes };
  });

  const finiteBox = (b) => !!b && b.finite;
  const recoveredFailures = [];
  for (const [slot, file] of recoveredArt.expected) {
    const found = recoveredArt.meshes.filter((mesh) => mesh.slot === slot);
    if (found.length !== 1) recoveredFailures.push(`${slot} has ${found.length} meshes`);
    else if (found[0].file !== file || !found[0].real || !found[0].shown
      || !found[0].mapped || !found[0].decoded || found[0].width <= 0 || found[0].height <= 0) {
      recoveredFailures.push(`${slot}: ${JSON.stringify(found[0])}`);
    }
    if (!recoveredArt.dressed.includes(slot)) recoveredFailures.push(`${slot} absent from artReady result`);
  }
  check('ten recovered photographs: exactly one visible decoded mesh in each authored room',
    recoveredArt.expected.length === 10 && recoveredArt.meshes.length === 10
      && recoveredFailures.length === 0,
    recoveredFailures.length ? recoveredFailures : recoveredArt.meshes.map((mesh) => [mesh.slot, mesh.file]));

  const sinkBowlTop = Math.max(...roomFinish.sink.bowls.map((b) => b?.y1 ?? -Infinity));
  check('kitchen sink: two recessed bowls, one-bowl water landing and complete faucet',
    roomFinish.sink.bowls.length === 2 && roomFinish.sink.bowls.every(finiteBox)
      && finiteBox(roomFinish.sink.rim) && finiteBox(roomFinish.sink.stream)
      && roomFinish.sink.rim.y1 - sinkBowlTop >= 0.08 && roomFinish.sink.streamBowls === 1
      && finiteBox(roomFinish.sink.faucet) && roomFinish.sink.missingFaucetParts.length === 0,
    { bowlCount: roomFinish.sink.bowls.length, depth: roomFinish.sink.rim?.y1 - sinkBowlTop,
      streamBowls: roomFinish.sink.streamBowls, missingFaucetParts: roomFinish.sink.missingFaucetParts });

  check('Lou suite: bed-foot composition, scene-built accent, live light and physical bench',
    finiteBox(roomFinish.suite.bench) && roomFinish.suite.gap >= 0.25
      && roomFinish.suite.runners.length === 2 && roomFinish.suite.runners.every(finiteBox)
      && finiteBox(roomFinish.suite.portrait) && finiteBox(roomFinish.suite.portraitArt)
      && roomFinish.suite.portraitName === 'suite-lou-accent'
      && roomFinish.suite.portraitArtPiece === 'suite-lou-accent'
      && roomFinish.suite.portraitManifestSlot === null
      && roomFinish.suite.accentNames.join('|') === 'suite-bed-foot-lamp-left|suite-bed-foot-lamp-right'
      && roomFinish.suite.accentLights.length === 2 && roomFinish.suite.accentLights.every(finiteBox)
      && roomFinish.suite.accentIntensity.every((intensity) => intensity >= 2.2)
      && roomFinish.suite.portraitLightName === 'suite-lou-accent-light'
      && finiteBox(roomFinish.suite.portraitLight) && roomFinish.suite.portraitLightIntensity >= 1.5
      && roomFinish.suite.benchCollider,
    { gap: roomFinish.suite.gap, runners: roomFinish.suite.runners.length,
      portrait: [roomFinish.suite.portraitName, roomFinish.suite.portraitArtPiece,
        roomFinish.suite.portraitManifestSlot], accentNames: roomFinish.suite.accentNames,
      accentIntensity: roomFinish.suite.accentIntensity,
      portraitLight: [roomFinish.suite.portraitLightName, roomFinish.suite.portraitLightIntensity],
      benchCollider: roomFinish.suite.benchCollider });

  const badRugs = roomFinish.rugs.filter(({ rug, floor }) => !finiteBox(rug) || !finiteBox(floor)
    || rug.y0 < floor.y1 + 0.002 || rug.sx < 4.5 || rug.sz < 4.0);
  check('five bedroom rugs: visible above the finished floor and useful in plan', badRugs.length === 0,
    roomFinish.rugs.map(({ id, rug, floor }) => ({ id, gap: rug && floor ? rug.y0 - floor.y1 : null,
      size: rug ? [rug.sx, rug.sz] : null })));

  const expectedDetails = {
    westFront: ['gothic-folio-ribbon', 'gothic-open-folio-left', 'gothic-open-folio-right'],
    eastFront: ['oldtime-travel-tag', 'oldtime-trunk-strap-left', 'oldtime-trunk-strap-right'],
    westRear: ['lake-desk-lamp', 'lake-desk-letter'],
    eastRear: ['booski-death-room-ledger', 'booski-death-room-security-radio'],
    guestRoom: ['guest-bed-coverlet', 'guest-bed-cushion-left', 'guest-bed-cushion-right', 'guest-bed-throw'],
  };
  const badDetails = Object.entries(expectedDetails).filter(([id, expected]) => {
    const actual = roomFinish.details[id];
    return !actual || actual.bounds.some((b) => !finiteBox(b))
      || [...actual.names].sort().join('|') !== [...expected].sort().join('|');
  });
  check('five bedroom finishing inventories: exact public names and finite geometry', badDetails.length === 0,
    Object.fromEntries(Object.entries(roomFinish.details).map(([id, value]) => [id, value.names])));

  const expectedClusters = {
    westFront: ['packing', 'gothic-packing-cluster', ['gothic-packed-garment', 'gothic-packing-case', 'gothic-packing-lid', 'gothic-valet-stand']],
    eastFront: ['washstand', 'oldtime-washstand-cluster', ['oldtime-basin', 'oldtime-pitcher', 'oldtime-towel', 'oldtime-washstand']],
    westRear: ['writing-desk', 'lake-writing-cluster', ['lake-desk-lamp', 'lake-desk-letter', 'lake-writing-chair', 'lake-writing-desk']],
    eastRear: ['dressing-bench', 'modern-dressing-cluster', ['modern-dressing-bench', 'modern-dressing-mirror', 'modern-folded-garment']],
    guestRoom: ['dressing-storage', 'prospect-dressing-cluster', ['guest-dresser', 'guest-mirror', 'guest-wardrobe']],
  };
  const badClusters = Object.entries(expectedClusters).filter(([id, [kind, rootName, names]]) => {
    const actual = roomFinish.clusters[id];
    return !actual || actual.kind !== kind || actual.rootName !== rootName || !finiteBox(actual.root)
      || actual.bounds.some((b) => !finiteBox(b))
      || [...actual.names].sort().join('|') !== [...names].sort().join('|');
  });
  check('five bedroom functional clusters: distinct kind, root and named inventory', badClusters.length === 0,
    Object.fromEntries(Object.entries(roomFinish.clusters).map(([id, value]) => [id, {
      kind: value.kind, rootName: value.rootName, names: value.names,
    }])));

  check('focused room browser: live WebGL and no missing/runtime resources',
    !roomFinish.gl.lost && roomFinish.gl.drawingBuffer.every((value) => value > 0)
      && errors.length === 0 && notFound.length === 0,
    { gl: roomFinish.gl, errors, notFound: [...new Set(notFound)] });
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} focused Mansion room checks passed.`);
if (failures.length) process.exitCode = 1;
