#!/usr/bin/env node
/**
 * Live-WebGL evidence for the owner's ten Mansion pictures.
 *
 * This opens the production Mansion entry point, waits for the real manifest
 * textures to decode, teleports only for camera evidence, and captures one
 * readable view per authored picture. Casa Bonita gets an eleventh view and
 * a geometry assertion because it is the picture across from the vault that
 * used to be crossed by the white cellar chair rail.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  evaluateCasaFrameContract,
  MANSION_ART_EVIDENCE_SHOTS,
  MANSION_OWNER_PICTURE_COUNT,
  parseMansionArtEvidenceRun,
} from './mansion-art-evidence-contract.mjs';
import {
  bindMansionArtEvidenceProvenance,
  buildMansionArtCaptureProvenance,
  collectMansionArtEvidence,
} from './mansion-art-evidence-provenance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 54938;
const { label: LABEL, mode: MODE } = parseMansionArtEvidenceRun(
  process.argv.slice(2), process.env,
);
const OUT = path.join(ROOT, 'docs', 'validation', '2026-08-10', 'mansion-art', LABEL);
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
};

const PICTURES = MANSION_ART_EVIDENCE_SHOTS.slice(0, MANSION_OWNER_PICTURE_COUNT);
const CASA = MANSION_ART_EVIDENCE_SHOTS.at(-1);

await fsp.mkdir(OUT, { recursive: true });
const captureAtStart = await buildMansionArtCaptureProvenance({
  root: ROOT,
  shots: MANSION_ART_EVIDENCE_SHOTS,
});
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

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

await new Promise((resolve) => server.listen(PORT, resolve));
let browser;
const errors = [];
const notFound = [];
const evidence = [];

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
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => {
    if (response.status() === 404) notFound.push(new URL(response.url()).pathname);
  });

  await page.goto(`http://localhost:${PORT}/mansion.html?preview=1`, {
    waitUntil: 'load', timeout: 180000,
  });
  await page.waitForFunction(() => window.mansion?.player, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById('startBtn').click());
  await page.waitForFunction(() => window.mansion.running === true, null, { timeout: 120000 });
  await page.waitForFunction(() => window.mansion.framesRendered > 3, null, { timeout: 180000 });
  await page.evaluate(async () => {
    await window.mansion.interior.artReady;
    window.mansion.setRendering(false);
  });

  await page.evaluate(() => {
    const label = document.createElement('div');
    label.id = 'mansion-art-evidence-label';
    label.style.cssText = [
      'position:fixed', 'left:18px', 'bottom:18px', 'z-index:2147483647',
      'max-width:620px', 'padding:9px 12px', 'border:1px solid #d6b75b',
      'background:rgba(4,6,10,.82)', 'color:#fff',
      'font:600 15px/1.35 system-ui,sans-serif', 'letter-spacing:.01em',
      'pointer-events:none', 'text-shadow:0 1px 2px #000',
    ].join(';');
    document.body.append(label);
  });

  async function capture(shot) {
    const measured = await page.evaluate(async ({ position, slot, file, room, railProof }) => {
      const m = window.mansion;
      const T = m.THREE;
      const { resolveMansionArtNullSightline } = await import(
        '/tools/mansion-art-evidence-contract.mjs'
      );
      const matches = [];
      m.scene.traverse((object) => {
        if (object.userData?.art?.slot === slot) matches.push(object);
      });
      if (matches.length !== 1) return { error: `${slot} resolved to ${matches.length} meshes` };
      const target = matches[0];
      const art = target.userData.art;

      m.teleport(position[0], position[1], position[2], 0);
      m.scene.updateMatrixWorld(true);
      const box = new T.Box3().setFromObject(target);
      const centre = box.getCenter(new T.Vector3());
      const player = m.player;
      const dx = centre.x - player.position.x;
      const dz = centre.z - player.position.z;
      const dy = centre.y - player.position.y;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.max(player.pitchMin, Math.min(player.pitchMax,
        Math.atan2(dy, Math.hypot(dx, dz))));
      player.update(1 / 60);
      m.scene.updateMatrixWorld(true);
      m.camera.updateMatrixWorld(true);
      m.camera.updateProjectionMatrix();

      const image = target.material?.map?.image ?? target.material?.map?.source?.data ?? null;
      const imageWidth = image?.naturalWidth ?? image?.videoWidth ?? image?.width ?? 0;
      const imageHeight = image?.naturalHeight ?? image?.videoHeight ?? image?.height ?? 0;
      const materials = (object) => (Array.isArray(object.material)
        ? object.material : [object.material]).filter(Boolean);
      const shown = (object) => {
        for (let node = object; node; node = node.parent) {
          if (node.visible === false) return false;
        }
        return materials(object).some((material) => material.visible !== false);
      };
      const opaque = (object) => materials(object).some((material) => material.visible !== false
        && (!material.transparent || (material.opacity ?? 1) >= 0.5));
      const describe = (object) => {
        if (!object) return null;
        const bounds = new T.Box3().setFromObject(object);
        const size = bounds.getSize(new T.Vector3());
        const ancestry = [];
        for (let node = object; node && ancestry.length < 5; node = node.parent) {
          if (node.name) ancestry.push(node.name);
        }
        return {
          name: object.name || '(unnamed mesh)',
          ancestry,
          artSlot: object.userData?.art?.slot ?? null,
          material: materials(object).map((material) => ({
            name: material.name || '(unnamed material)',
            color: material.color ? `#${material.color.getHexString()}` : null,
            transparent: material.transparent === true,
            opacity: material.opacity ?? 1,
          })),
          box: {
            min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray(),
          },
        };
      };

      const raycaster = new T.Raycaster();
      const origin = m.camera.getWorldPosition(new T.Vector3());
      /* The cast rigs contain skinned helper meshes whose detached bones are
       * legal for rendering but not for Three's generic recursive raycaster
       * (`SkinnedMesh.raycast` dereferences the removed bone matrix). Art
       * visibility only needs the building, frames and furniture, so feed the
       * raycaster the actual static/instanced meshes explicitly. */
      const sightlineMeshes = [];
      m.scene.traverse((object) => {
        if (object.isMesh && !object.isSkinnedMesh && object.geometry && object.material) {
          sightlineMeshes.push(object);
        }
      });
      const firstOpaqueTo = (point) => {
        const direction = point.clone().sub(origin);
        const distance = direction.length();
        raycaster.set(origin, direction.normalize());
        raycaster.far = distance + 0.08;
        const hit = raycaster.intersectObjects(sightlineMeshes, false)
          .find(({ object }) => shown(object) && opaque(object));
        return hit?.object ?? null;
      };
      const isOwnFrameBacking = (object) => {
        if (!object || object === target || !target.parent) return false;
        for (let node = object; node; node = node.parent) {
          if (node === target.parent) return true;
        }
        return false;
      };

      target.geometry.computeBoundingBox();
      const local = target.geometry.boundingBox;
      const grid = [];
      const worldSample = (fx, fy) => new T.Vector3(
        T.MathUtils.lerp(local.min.x, local.max.x, fx + 0.5),
        T.MathUtils.lerp(local.min.y, local.max.y, fy + 0.5),
        0,
      ).applyMatrix4(target.matrixWorld);
      for (const fy of [-0.45, -0.225, 0, 0.225, 0.45]) {
        for (const fx of [-0.45, -0.225, 0, 0.225, 0.45]) {
          const primary = firstOpaqueTo(worldSample(fx, fy));
          let first = primary;
          let nullRetry = null;
          const primaryIsOwnBacking = isOwnFrameBacking(primary);
          if (primary === null || primaryIsOwnBacking) {
            const epsilon = 1e-5;
            const retries = [
              [fx - epsilon, fy], [fx + epsilon, fy],
              [fx, fy - epsilon], [fx, fy + epsilon],
            ].map(([retryX, retryY]) => firstOpaqueTo(worldSample(retryX, retryY)));
            first = resolveMansionArtNullSightline({
              primary, primaryIsOwnBacking, target, retries,
            });
            nullRetry = retries.map((hit) => (hit === target ? 'target' : describe(hit)));
          }
          grid.push({
            fx, fy, clear: first === target,
            blocker: first === target ? null : describe(first),
            nullRetry,
          });
        }
      }

      const corners = [
        [local.min.x, local.min.y], [local.min.x, local.max.y],
        [local.max.x, local.min.y], [local.max.x, local.max.y],
      ].map(([x, y]) => new T.Vector3(x, y, 0).applyMatrix4(target.matrixWorld).project(m.camera));
      const ndc = {
        x0: Math.min(...corners.map((point) => point.x)),
        x1: Math.max(...corners.map((point) => point.x)),
        y0: Math.min(...corners.map((point) => point.y)),
        y1: Math.max(...corners.map((point) => point.y)),
      };
      const screen = {
        width: (ndc.x1 - ndc.x0) * 640,
        height: (ndc.y1 - ndc.y0) * 360,
        centre: centre.clone().project(m.camera).toArray(),
      };

      let rail = null;
      if (railProof) {
        const pictureBox = new T.Box3().setFromObject(target);
        const framePanel = target.parent?.name === 'framePanel' ? target.parent : null;
        const frameParts = framePanel?.children
          ?.filter((child) => child.isMesh && child.geometry?.type === 'BoxGeometry')
          .sort((left, right) => (right.geometry.parameters?.depth ?? 0)
            - (left.geometry.parameters?.depth ?? 0)) ?? [];
        const [bezel, board] = frameParts;
        const fullFrameBox = framePanel ? new T.Box3().setFromObject(framePanel) : pictureBox;
        const bezelBox = bezel ? new T.Box3().setFromObject(bezel) : null;
        const boardBox = board ? new T.Box3().setFromObject(board) : null;
        const belongsToFrame = (object) => {
          for (let node = object; node; node = node.parent) if (node === framePanel) return true;
          return false;
        };
        const boxData = (bounds) => (bounds ? {
          min: bounds.min.toArray(), max: bounds.max.toArray(),
        } : null);
        const intersections = [];
        const clearances = [];
        m.interior.root.traverse((object) => {
          if (!object.isMesh || object.isInstancedMesh || belongsToFrame(object) || !shown(object)) return;
          if (!materials(object).some((material) => material.color?.getHex() === 0xf0e9d8)) return;
          const trimBox = new T.Box3().setFromObject(object);
          const trimSize = trimBox.getSize(new T.Vector3());
          if (trimBox.intersectsBox(fullFrameBox)) intersections.push(describe(object));
          const sharesWallRun = trimBox.max.x >= fullFrameBox.min.x && trimBox.min.x <= fullFrameBox.max.x
            && trimBox.max.z >= fullFrameBox.min.z - 0.01
            && trimBox.min.z <= fullFrameBox.max.z + 0.01;
          if (sharesWallRun && trimSize.y <= 0.12 && trimBox.max.y <= fullFrameBox.min.y) {
            clearances.push(fullFrameBox.min.y - trimBox.max.y);
          }
        });
        const wallCandidates = [];
        m.grounds.root.traverse((object) => {
          if (!object.isMesh || object.name !== 'cellar-wing-south') return;
          const wallBox = new T.Box3().setFromObject(object);
          if (wallBox.max.x < fullFrameBox.max.x || wallBox.min.x > fullFrameBox.min.x
              || wallBox.max.y < fullFrameBox.max.y || wallBox.min.y > fullFrameBox.min.y) return;
          wallCandidates.push({
            name: object.name,
            frameRearGap: bezelBox ? bezelBox.min.z - wallBox.max.z : null,
            box: boxData(wallBox),
          });
        });
        wallCandidates.sort((left, right) => (
          Math.abs(left.frameRearGap ?? Infinity) - Math.abs(right.frameRearGap ?? Infinity)
        ));
        rail = {
          intersections,
          clearance: clearances.length ? Math.min(...clearances) : null,
          pictureBox: boxData(pictureBox),
          frame: boxData(fullFrameBox),
          bezel: boxData(bezelBox),
          board: boxData(boardBox),
          containment: bezelBox && boardBox ? {
            boardLeft: pictureBox.min.x - boardBox.min.x,
            boardRight: boardBox.max.x - pictureBox.max.x,
            boardBottom: pictureBox.min.y - boardBox.min.y,
            boardTop: boardBox.max.y - pictureBox.max.y,
            bezelLeft: pictureBox.min.x - bezelBox.min.x,
            bezelRight: bezelBox.max.x - pictureBox.max.x,
            bezelBottom: pictureBox.min.y - bezelBox.min.y,
            bezelTop: bezelBox.max.y - pictureBox.max.y,
          } : null,
          nearestStructuralWall: wallCandidates[0] ?? null,
        };
      }

      document.getElementById('mansion-art-evidence-label').textContent = `${room}  |  ${slot}  |  ${file}`;
      const blocked = grid.filter((sample) => !sample.clear);
      const core = grid.filter((sample) => Math.abs(sample.fx) <= 0.225
        && Math.abs(sample.fy) <= 0.225);
      return {
        room, slot, expectedFile: file, actualFile: art.file, real: art.real === true,
        mapped: Boolean(target.material?.map), decoded: imageWidth > 0 && imageHeight > 0,
        image: [imageWidth, imageHeight], shown: shown(target),
        player: player.position.toArray(), target: centre.toArray(), screen,
        grid: {
          clear: grid.filter((sample) => sample.clear).length,
          total: grid.length,
          centreClear: grid.find((sample) => sample.fx === 0 && sample.fy === 0)?.clear === true,
          coreClear: core.filter((sample) => sample.clear).length,
          coreTotal: core.length,
          blockersArePerimeterOnly: blocked.every((sample) => Math.abs(sample.fx) === 0.45
            || Math.abs(sample.fy) === 0.45),
          blocked,
        },
        rail,
      };
    }, shot);
    if (measured.error) throw new Error(measured.error);

    const screenshot = path.join(OUT, `${shot.name}.png`);
    const before = await page.evaluate(() => window.mansion.framesRendered);
    await page.evaluate(() => window.mansion.setRendering(true));
    await page.waitForFunction((frame) => window.mansion.framesRendered >= frame + 4,
      before, { timeout: 180000 });
    /* 300 s: run 33851214541 rendered five shots and then spent the whole
     * 120 s budget rasterizing the sixth — SwiftShader pays for these heavy
     * frames in minutes, and the run that finishes pays only what it costs. */
    await page.screenshot({ path: screenshot, timeout: 300000 });
    await page.evaluate(() => window.mansion.setRendering(false));
    console.log(`  wrote ${path.basename(screenshot)}`);
    return {
      name: shot.name,
      screenshot: path.relative(ROOT, screenshot),
      allowPerimeterOcclusion: shot.allowPerimeterOcclusion === true,
      ...measured,
    };
  }

  for (const shot of [...PICTURES, CASA]) {
    evidence.push(await capture(shot));
  }
  const captureAtEnd = await buildMansionArtCaptureProvenance({
    root: ROOT,
    shots: MANSION_ART_EVIDENCE_SHOTS,
  });
  if (captureAtEnd.fingerprint !== captureAtStart.fingerprint) {
    throw new Error('Capture inputs changed during the browser run; discard this evidence and run a full capture again.');
  }
  const capturedEvidence = await collectMansionArtEvidence({
    outDir: OUT,
    shots: MANSION_ART_EVIDENCE_SHOTS,
  });
  const provenance = bindMansionArtEvidenceProvenance({
    capture: captureAtEnd,
    evidence: capturedEvidence,
    mode: MODE,
  });

  for (const item of evidence.slice(0, PICTURES.length)) {
    const visibilityPass = item.grid.clear === item.grid.total
      || (item.allowPerimeterOcclusion
        && item.grid.coreClear === item.grid.coreTotal && item.grid.coreTotal === 9
        && item.grid.blockersArePerimeterOnly && item.grid.clear >= 24);
    check(`${item.room}: ${item.slot} is real, decoded, and has a fully clear readable core`,
      item.actualFile === item.expectedFile && item.real && item.mapped && item.decoded && item.shown
        && item.screen.width >= 90 && item.screen.height >= 90
        && item.grid.centreClear && visibilityPass,
      {
        file: item.actualFile, image: item.image,
        screen: [Math.round(item.screen.width), Math.round(item.screen.height)],
        clearSamples: `${item.grid.clear}/${item.grid.total}`,
        coreSamples: `${item.grid.coreClear}/${item.grid.coreTotal}`,
        perimeterException: item.allowPerimeterOcclusion,
        blockers: item.grid.blocked,
      });
  }

  const casa = evidence.at(-1);
  const casaFrameContract = evaluateCasaFrameContract({
    ...casa.rail,
    railClearance: casa.rail?.clearance,
  });
  check('Casa Bonita across from the vault is real, decoded and centre-clear',
    casa.actualFile === CASA.file && casa.real && casa.mapped && casa.decoded && casa.shown
      && casa.grid.centreClear && casa.grid.clear === casa.grid.total,
    {
      file: casa.actualFile,
      image: casa.image,
      clearSamples: `${casa.grid.clear}/${casa.grid.total}`,
      coreSamples: `${casa.grid.coreClear}/${casa.grid.coreTotal}`,
      blockers: casa.grid.blocked,
    });
  check('Casa Bonita has a complete, symmetric frame containing the resolved art',
    casaFrameContract.frameComplete && casaFrameContract.artContained && casaFrameContract.symmetric,
    { contract: casaFrameContract, proof: casa.rail });
  check('Casa Bonita full frame clears the actual white cellar chair rail by at least 50 mm',
    casaFrameContract.railClear,
    { contract: casaFrameContract, proof: casa.rail });
  check('Casa Bonita real bezel rear is mounted within 5 mm of the cellar wall',
    casaFrameContract.wallMounted,
    { contract: casaFrameContract, proof: casa.rail });

  const gl = await page.evaluate(() => {
    const context = window.mansion.renderer.getContext();
    return {
      lost: context.isContextLost(),
      drawingBuffer: [context.drawingBufferWidth, context.drawingBufferHeight],
    };
  });
  check('live Mansion WebGL stayed healthy with no missing/runtime resources',
    !gl.lost && gl.drawingBuffer.every((value) => value > 0)
      && errors.length === 0 && notFound.length === 0,
    { gl, errors, notFound: [...new Set(notFound)] });

  const cards = [];
  for (const item of evidence) {
    const png = await fsp.readFile(path.join(ROOT, item.screenshot));
    cards.push(`
      <figure>
        <img src="data:image/png;base64,${png.toString('base64')}" alt="${htmlEscape(item.room)}">
        <figcaption><b>${htmlEscape(item.name.replace(/^\d+-/, ''))}</b><br>${htmlEscape(item.room)}<br><code>${htmlEscape(item.slot)}</code></figcaption>
      </figure>`);
  }
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 1040 } });
  await sheet.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box} body{margin:0;background:#11141a;color:#f5f2e8;font:16px/1.25 system-ui,sans-serif}
    h1{margin:18px 24px 4px;font-size:25px} p{margin:0 24px 16px;color:#c9c4b5}
    main{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;padding:0 20px 20px}
    figure{margin:0;background:#202631;border:1px solid #5e6470;padding:7px}
    img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}
    figcaption{padding:7px 3px 2px;font-size:13px} b{color:#e8c761} code{font-size:11px;color:#b8d9ff}
  </style></head><body><h1>Mansion owner-picture proof — live WebGL</h1>
  <p>Ten requested pictures, then Casa Bonita across from the vault. Individual 1280×720 captures are beside this sheet.</p>
  <main>${cards.join('')}</main></body></html>`, { waitUntil: 'load' });
  const sheetTarget = path.join(OUT, '00-contact-sheet.png');
  const sheetTemp = path.join(OUT, `.00-contact-sheet.${process.pid}.tmp.png`);
  await sheet.screenshot({ path: sheetTemp, fullPage: true, timeout: 120000 });
  await sheet.close();

  const report = {
    generatedAt: new Date().toISOString(),
    entry: 'mansion.html?preview=1',
    mode: MODE,
    provenance,
    pictures: evidence,
    checks: results,
    gl,
    errors,
    notFound: [...new Set(notFound)],
  };
  const reportTarget = path.join(OUT, 'report.json');
  const reportTemp = path.join(OUT, `.report.${process.pid}.tmp.json`);
  await fsp.writeFile(reportTemp, `${JSON.stringify(report, null, 2)}\n`);
  await fsp.rename(sheetTemp, sheetTarget);
  await fsp.rename(reportTemp, reportTarget);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} live Mansion art checks passed.`);
console.log(`Evidence: ${path.relative(ROOT, OUT)}`);
if (failures.length) process.exitCode = 1;
