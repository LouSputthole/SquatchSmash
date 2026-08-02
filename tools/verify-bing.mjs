#!/usr/bin/env node
/**
 * Play the Bing, headlessly, from the lot to the ending card.
 *
 *   node tools/verify-bing.mjs        (npm run verify:bing)
 *
 * The club is a state machine wired to a building: a door being open changes
 * what you can hear, walking into a room advances an objective, and Lou does
 * not put the package on the desk until the conversation has got there. None
 * of that shows up in a syntax check, and all of it breaks silently -- the
 * failure mode is a player standing in an office where nothing happens.
 *
 * So this drives the real systems in a real browser: it starts the game,
 * walks the player through every beat, and asserts the mission state at each
 * one. It steps the update functions directly rather than waiting on frames,
 * because software rendering runs at about one frame a second and the point
 * here is the logic, not the pixels.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectBingVoiceCues } from './bing-vo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5199;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify the club.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((r) => server.listen(PORT, r));

const browserArgs = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'];
if (!process.env.SQUATCH_STRICT_AUTOPLAY) {
  browserArgs.push('--autoplay-policy=no-user-gesture-required');
}
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: browserArgs,
});
/* Small viewport: every pixel here is drawn on the CPU. */
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });

const problems = [];
page.on('pageerror', (e) => problems.push(`${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 240)); });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

await page.goto(`http://localhost:${PORT}/bing.html`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const failedToLoad = await page.evaluate(() => {
  const el = document.getElementById('loading');
  return el?.classList.contains('failed') ? el.textContent : null;
});
if (failedToLoad) {
  console.error(`The club did not load: ${failedToLoad}`);
  await browser.close();
  server.close();
  process.exit(1);
}

const manifestCues = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'),
).sfx;
const audioIndex = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'index.json'), 'utf8'),
);
const indexedFiles = new Set(audioIndex.files || []);
const bingRuntimeEffects = new Set([
  'phone.ring', 'phone.hangup',
  'radio.talk', 'radio.tune',
  'slot.pull', 'slot.reel', 'slot.stop', 'slot.win', 'slot.jackpot',
  'card.deal', 'card.flip', 'chips.place', 'chip.stack',
  'gun.pickup', 'glass.set', 'can.crack', 'can.sip', 'can.crush',
  'till.ring', 'bing.money.flutter', 'bing.line.snort',
  'door.locked', 'door.knob', 'door.creak', 'alarm.chirp',
  'chair.sit', 'rope.clip', 'duck.quack',
  'car.door', 'car.engine.start', 'car.engine.idle', 'neighbours.thump',
  'whiskey.swig', 'whiskey.cap', 'whiskey.pour',
  'ambience.rain', 'ambience.bing.rain.muffled',
  'ambience.club', 'ambience.crowd',
]);
const isExpectedBingCue = (cue) => cue.name.startsWith('vo.bing.')
  || cue.name.startsWith('vo.bj.')
  || cue.name.startsWith('vo.slots.')
  || cue.name.startsWith('vo.call.')
  || cue.name.startsWith('footstep.')
  || bingRuntimeEffects.has(cue.name);
const availableManifestCues = manifestCues.filter((cue) => indexedFiles
  .has(cue.file || `${cue.name}.mp3`));
await page.waitForFunction(() => window.__bing?.carRadio && window.__bing?.campaign, null, {
  timeout: 90000,
});
const carRadioPreloadNames = await page.evaluate(() => {
  const b = window.__bing;
  return b.carRadio.preloadCueNames({
    hours: [b.campaign.state.story.timeMinutes / 60],
  });
});
const carRadioPreloadSet = new Set(carRadioPreloadNames);
const expectedResidentCues = availableManifestCues.filter((cue) => isExpectedBingCue(cue)
  || carRadioPreloadSet.has(cue.name));
const expectedResidentNames = expectedResidentCues.map((cue) => cue.name).sort();
const byteSize = (cues) => cues.reduce((sum, cue) => {
  const file = cue.file || `${cue.name}.mp3`;
  try { return sum + fs.statSync(path.join(ROOT, 'assets', 'sfx', file)).size; } catch { return sum; }
}, 0);
const allAvailableBytes = byteSize(availableManifestCues);
const expectedResidentBytes = byteSize(expectedResidentCues);

const startClickedAt = performance.now();
await page.click('#start-btn');
await page.waitForFunction(() => window.__bing?.game.started, null, { timeout: 90000 });
await page.evaluate(() => window.__bing.postfx.disable?.());

const bingAudioResidency = await page.evaluate((expected) => {
  const audio = window.__bing.audio;
  const loaded = [...audio.buffers.keys()].sort();
  const wanted = new Set(expected);
  return {
    plan: audio.preloadStats ?? null,
    loaded: loaded.length,
    missing: expected.filter((name) => !audio.buffers.has(name)),
    unexpected: loaded.filter((name) => !wanted.has(name)),
    unrelatedVo: loaded.filter((name) => name.startsWith('vo.') && !wanted.has(name)),
    unrelatedRadio: loaded.filter((name) => name.startsWith('radio.') && !wanted.has(name)),
  };
}, expectedResidentNames);
bingAudioResidency.wallMs = Math.round(performance.now() - startClickedAt);
bingAudioResidency.before = {
  cues: availableManifestCues.length,
  mib: Number((allAvailableBytes / 1048576).toFixed(2)),
};
bingAudioResidency.after = {
  cues: expectedResidentNames.length,
  mib: Number((expectedResidentBytes / 1048576).toFixed(2)),
};
bingAudioResidency.carRadio = {
  requested: carRadioPreloadNames.length,
  resident: expectedResidentNames.filter((name) => carRadioPreloadSet.has(name)).length,
};
check('the Bing decodes its complete scene-owned resident set and no unrelated campaign audio',
  bingAudioResidency.plan?.manifestTotal === manifestCues.length
    && bingAudioResidency.plan?.selected === expectedResidentNames.length
    && bingAudioResidency.loaded === expectedResidentNames.length
    && bingAudioResidency.missing.length === 0
    && bingAudioResidency.unexpected.length === 0
    && bingAudioResidency.unrelatedVo.length === 0
    && bingAudioResidency.unrelatedRadio.length === 0,
  JSON.stringify({
    plan: bingAudioResidency.plan,
    loaded: bingAudioResidency.loaded,
    wallMs: bingAudioResidency.wallMs,
    before: bingAudioResidency.before,
    after: bingAudioResidency.after,
    carRadio: bingAudioResidency.carRadio,
    missing: { count: bingAudioResidency.missing.length, sample: bingAudioResidency.missing.slice(0, 5) },
    unexpected: { count: bingAudioResidency.unexpected.length, sample: bingAudioResidency.unexpected.slice(0, 5) },
    unrelatedVo: { count: bingAudioResidency.unrelatedVo.length, sample: bingAudioResidency.unrelatedVo.slice(0, 5) },
    unrelatedRadio: {
      count: bingAudioResidency.unrelatedRadio.length,
      sample: bingAudioResidency.unrelatedRadio.slice(0, 5),
    },
  }));

await page.waitForFunction(() => ['music.club', 'office.radio'].every((key) => {
  const handle = window.__bing?.audio?.loops?.get(key);
  return handle?.streamed && handle.element?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
}), null, { timeout: 30000 });
const streamedVenueMusic = await page.evaluate(() => ['music.club', 'office.radio'].map((key) => {
  const handle = window.__bing.audio.loops.get(key);
  return {
    key,
    streamed: handle?.streamed === true,
    sourceOwnsElement: handle?.node?.mediaElement === handle?.element,
    hasDecodedBuffer: !!handle?.node?.buffer,
    paused: handle?.element?.paused ?? true,
    readyState: handle?.element?.readyState ?? 0,
    duration: handle?.element?.duration ?? 0,
  };
}));
check('long Bing records stream through WebAudio without retained music AudioBuffers',
  streamedVenueMusic.every((entry) => entry.streamed && entry.sourceOwnsElement
    && !entry.hasDecodedBuffer && !entry.paused && entry.readyState >= 2
    && Number.isFinite(entry.duration) && entry.duration > 0),
  JSON.stringify(streamedVenueMusic));

/* A focused mode makes before/after residency measurements cheap while the
 * normal command continues through every story and presentation contract. */
if (process.argv.includes('--audio-only')) {
  await browser.close();
  server.close();
  const failed = results.filter((result) => !result.ok);
  console.log(failed.length
    ? `\n${failed.length} of ${results.length} audio checks failed.`
    : `\nAll ${results.length} audio checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

const openingInventoryBar = await page.evaluate(() => {
  const bar = document.getElementById('hotbar');
  return {
    slots: window.__bing.inventory.slots,
    boxes: bar?.children.length ?? 0,
    declared: bar?.dataset.slotCount,
    visible: !!bar && !bar.classList.contains('hidden'),
  };
});
check('Bing starts with the shared visible five-slot bottom inventory bar, even empty',
  openingInventoryBar.slots === 5 && openingInventoryBar.boxes === 5
    && openingInventoryBar.declared === '5' && openingInventoryBar.visible,
  JSON.stringify(openingInventoryBar));

/* The source catalog is authoritative even while the voice actor still has
 * pickups. Prove every generated line reached the manifest, every delivered
 * take decoded, and every undelivered take reached the committed handoff. */
const generatedBingCues = collectBingVoiceCues();
const generatedBingNames = generatedBingCues.map((cue) => cue.name);
const generatedManifest = new Map(manifestCues.map((cue) => [cue.name, cue]));
const recordedGenerated = generatedBingCues.filter((cue) => indexedFiles
  .has(generatedManifest.get(cue.name)?.file || `${cue.name}.mp3`));
const missingGenerated = generatedBingCues.filter((cue) => !recordedGenerated.includes(cue));
const recordingTodo = fs.readFileSync(path.join(ROOT, 'VOICE-LINES-TODO.md'), 'utf8');
const generatedVoiceProbe = await page.evaluate((cues) => {
  const bank = window.__bing.audio.buffers;
  return cues.map((cue) => ({ cue, duration: bank.get(cue)?.[0]?.duration ?? 0 }));
}, recordedGenerated.map((cue) => cue.name));
check('every generated Bing line is manifest-owned; delivered takes decode and pickups are listed',
  generatedBingNames.every((name) => generatedManifest.has(name))
    && generatedVoiceProbe.every((entry) => entry.duration > 0)
    && missingGenerated.every((cue) => recordingTodo.includes(`\`${cue.name}.mp3\``)),
  JSON.stringify({ authored: generatedBingNames.length,
    decoded: generatedVoiceProbe.filter((entry) => entry.duration > 0).length,
    pickups: missingGenerated.length,
    missingFromManifest: generatedBingNames.filter((name) => !generatedManifest.has(name)).slice(0, 3),
    undecoded: generatedVoiceProbe.filter((entry) => entry.duration <= 0).slice(0, 3),
    absentFromTodo: missingGenerated.filter((cue) => !recordingTodo.includes(`\`${cue.name}.mp3\``))
      .slice(0, 3).map((cue) => cue.name) }));

/* A cue request in voLog only tells us that the script named a file.  It does
 * not prove the decoded buffer was ever put on the WebAudio graph -- the
 * exact failure that made a fully-recorded Bing sound silent.  Exercise one
 * representative line for every authored voice surface without letting the
 * normal single-voice rule cut another line short, then wait for their real
 * decoded durations. */
const voicedSurfaces = [
  'vo.bing.door.in.1',
  'vo.bing.bar.1',
  'vo.bing.blackjack.dealer.deal.1',
  'vo.bing.stage.1',
  'vo.bing.hang.gratin.1',
];
const playbackProbe = await page.evaluate((cues) => {
  const b = window.__bing;
  b.audio.clearPlaybackLog?.();
  const started = cues.map((cue) => b.voiceCue?.(cue, { solo: false }));
  const longest = Math.max(...cues.map((cue) => b.audio.buffers.get(cue)?.[0]?.duration ?? 0));
  return { started, longest };
}, voicedSurfaces);
check('representative Bing voice recordings are decoded before playback',
  playbackProbe.started.every(Boolean) && playbackProbe.longest > 0,
  JSON.stringify(playbackProbe));
/* SwiftShader plus the scene's full audio decode can delay an ended event even
 * after the decoded duration has elapsed. Poll the actual playback contract
 * with a bounded allowance instead of racing it with a fixed wall-clock nap. */
await page.waitForFunction((cues) => cues.every((cue) => window.__bing.audio.playbacks
  .some((playback) => playback.name === cue && playback.naturalEnd)), voicedSurfaces, {
  timeout: Math.ceil((playbackProbe.longest + 15) * 1000),
}).catch(() => {});
const completedVoices = await page.evaluate((cues) => window.__bing.audio.playbacks
  .filter((playback) => cues.includes(playback.name))
  .map((playback) => ({
    name: playback.name,
    decodedDuration: playback.decodedDuration,
    gain: playback.gain,
    connectedToSfx: playback.connectedToSfx,
    naturalEnd: playback.naturalEnd,
  })), voicedSurfaces);
check('Bing voice buffers reach a nonzero-gain SFX graph and run to natural completion',
  completedVoices.length === voicedSurfaces.length
    && completedVoices.every((playback) => playback.decodedDuration > 0
      && playback.gain > 0 && playback.connectedToSfx && playback.naturalEnd),
  JSON.stringify(completedVoices));

const dialogueContracts = await page.evaluate(() => {
  const b = window.__bing;
  const louEnter = b.scripts.lou.enter;
  const snowReply = b.familyScripts.snow.open.options[0];
  return {
    louOpening: louEnter.line(),
    louCue: typeof louEnter.cue === 'function' ? louEnter.cue() : louEnter.cue,
    snowCue: snowReply.cue,
    snowText: snowReply.text,
  };
});
check('Lou opening dialogue contains no spoken stage direction',
  dialogueContracts.louOpening === 'Shut the door.'
    && dialogueContracts.louCue?.startsWith('vo.bing.full.lou.enter.line.')
    && generatedManifest.get(dialogueContracts.louCue)?.say === dialogueContracts.louOpening,
  JSON.stringify(dialogueContracts));
check('Tony Snow reply has its own recording cue',
  dialogueContracts.snowCue === 'vo.bing.hang.snow.tony.1'
    && dialogueContracts.snowText === 'You want them to turn the heat up?',
  JSON.stringify(dialogueContracts));

/** Step the game's own update path for `secs` of simulated time. */
async function tick(secs = 1, step = 0.25) {
  await page.evaluate(([secs, step]) => {
    const b = window.__bing;
    for (let t = 0; t < secs; t += step) {
      b.player.update(step);
      b.dialogue.update(step, b.player.position);
      b.mission.update(step);
      b.slots.update(step);
      b.blackjack.update(step);
      b.club.update(step, b.player.position);
      b.game.drive?.(step);
    }
  }, [secs, step]);
}

async function walkTo(x, z, yaw = 0) {
  await page.evaluate(([x, z, yaw]) => {
    const b = window.__bing;
    b.game.seatedIn = null;
    b.player.mode = 'walk';
    b.player._tween = null;
    b.player.yawCenter = null;
    b.player.position.set(x, 1.66, z);
    b.player.yaw = yaw;
    b.player.update(0.016);
    /* Tell the zone system where he is standing NOW. It is what turns a
     * position into a room, and a room into an objective; leaving it to the
     * page's own frame loop makes every room-entry assertion below a race
     * against a renderer that manages about one frame a second. */
    b.updateZones(0.016);
  }, [x, z, yaw]);
  await tick(0.5);
}

const state = () => page.evaluate(() => {
  const b = window.__bing;
  return {
    mission: b.mission.state,
    room: b.club.roomAt(b.player.position.x, b.player.position.z),
    playerMode: b.player.mode,
    objectives: b.mission.objectives.map((o) => `${o.done ? 'x' : ' '}${o.id}`),
    flags: { ...b.mission.flags },
    money: b.game.money,
    options: b.dialogue.active ? b.dialogue.options.length : -1,
    inventory: b.inventory.items.filter(Boolean),
    carrying: b.game.carrying ?? null,
    campaign: b.campaign?.state ?? null,
    hands: b.mission.hands,
    spins: b.mission.spins,
  };
});

const choose = async (i) => {
  await page.evaluate((i) => window.__bing.dialogue.choose(i), i);
  await tick(3);
};

/* The felt's three sounds are authored as manifest cues, not generated here:
 * the WebAudio synth stands in for any that have no file yet. */
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
  const cues = new Map((manifest.sfx || []).map((cue) => [cue.name, cue]));
  check('the felt’s three sound cues are authored in the manifest',
    ['card.deal', 'card.flip', 'chip.stack'].every((name) => (cues.get(name)?.prompt || '').length > 20));
}

console.log('Driving the mission…');

let s = await state();
check('starts behind the wheel in the lot', s.mission === 'lot', s.mission);
/* Empty-handed. The one thing this night is for is Lou putting the package on
 * the desk, so the prospect cannot already have it while he is still in the
 * car park. Held here and asserted again after the handoff. */
const packageAtStart = s.campaign?.inventory
  && !s.campaign.inventory.carried.includes('parcel')
  && !s.campaign.inventory.concealed.includes('parcel')
  && s.carrying !== 'parcel';
/* Three things the evening is for, and none of them ticked in the lot. The
 * club's own optional list is separate and lives on the HUD card, not on the
 * mission -- it is checked further down against the rendered objectives. */
check('the night opens on its three jobs, none of them done',
  s.objectives.join(',') === ' lou, margo, shot', s.objectives.join(','));
const displayedDay = await page.textContent('#clock .day');
check('the first Bing visit is still Day One', displayedDay === 'Day 1', displayedDay);

/* ---- the lot, the parked cars, and getting out safely ---- */
const vehicles = await page.evaluate(() => {
  const b = window.__bing;
  const entries = [
    ['player', b.car],
    ...b.lot.cars.map((vehicle, i) => [`parked-${i}`, vehicle]),
    ['lou', b.lot.lou],
    ['watchers', b.lot.watchers],
  ];
  const measured = entries.map(([id, vehicle]) => {
    vehicle.group.updateMatrixWorld(true);
    const box = new b.THREE.Box3().setFromObject(vehicle.group);
    const c = vehicle.worldCollider;
    return {
      id,
      x: vehicle.group.position.x,
      z: vehicle.group.position.z,
      min: box.min.toArray(),
      max: box.max.toArray(),
      grounded: Math.abs(box.min.y) < 0.015,
      contained: !!c
        && c.min.x <= box.min.x && c.max.x >= box.max.x
        && c.min.z <= box.min.z && c.max.z >= box.max.z
        && c.max.y >= box.max.y,
    };
  });
  const overlaps = [];
  for (let i = 0; i < measured.length; i++) {
    for (let j = i + 1; j < measured.length; j++) {
      const a = measured[i];
      const c = measured[j];
      const overlapX = Math.min(a.max[0], c.max[0]) - Math.max(a.min[0], c.min[0]);
      const overlapZ = Math.min(a.max[2], c.max[2]) - Math.max(a.min[2], c.min[2]);
      if (overlapX > 0.02 && overlapZ > 0.02) overlaps.push(`${a.id}/${c.id}`);
    }
  }
  const bayCentred = measured
    .filter((v) => v.id === 'player' || v.id.startsWith('parked-'))
    .every((v) => {
      const col = Math.round((v.x + 23.7) / 4.6);
      return Math.abs(v.x - (-23.7 + col * 4.6)) < 0.01
        && (Math.abs(v.z - 25) < 0.01 || Math.abs(v.z - 35) < 0.01);
    });
  return {
    count: measured.length,
    overlaps,
    grounded: measured.every((v) => v.grounded),
    contained: measured.every((v) => v.contained),
    bayCentred,
    playerColliderLive: b.club.colliders.includes(b.car.worldCollider),
  };
});
check('all eighteen vehicles are grounded and separated',
  vehicles.count === 18 && vehicles.grounded && vehicles.overlaps.length === 0,
  JSON.stringify(vehicles.overlaps));
check('every visible car is contained by its matching collider',
  vehicles.contained && vehicles.playerColliderLive);
check('the ordinary parked cars sit on the painted bay centres', vehicles.bayCentred);

await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })));
await tick(1.2, 0.1);
const carExit = await page.evaluate(() => {
  const b = window.__bing;
  return {
    seated: b.game.seatedIn,
    mode: b.player.mode,
    safe: b.standingClearAt(b.player.position.x, b.player.position.z),
    room: b.club.roomAt(b.player.position.x, b.player.position.z),
    x: b.player.position.x,
    z: b.player.position.z,
  };
});
check('getting out of the car lands on validated clear ground',
  carExit.seated === null && carExit.mode === 'walk' && carExit.safe && carExit.room === 'lot',
  JSON.stringify(carExit));

/* The open portal must be visually clear as well as collider-clear. */
const frontPortal = await page.evaluate(() => {
  const b = window.__bing;
  const door = b.club.doors.front;
  if (!door.open) door.toggle();
  door._t = door.swing;
  door.pivot.rotation.y = door.swing;
  b.scene.updateMatrixWorld(true);
  const ray = new b.THREE.Raycaster(
    new b.THREE.Vector3(0, 1.35, 15.8),
    new b.THREE.Vector3(0, 0, -1),
    0,
    1.0,
  );
  const hits = ray.intersectObject(b.club.root, true).filter((hit) => {
    if (!hit.object.visible) return false;
    // Rain and other particle fields are Points, not opaque portal geometry.
    // They can intersect at distance zero when a randomized particle spawns
    // on the ray origin, which made this visual-clearance assertion flaky.
    if (!hit.object.isMesh) return false;
    const materials = Array.isArray(hit.object.material)
      ? hit.object.material : [hit.object.material];
    return materials.some((m) => m?.visible !== false && (m.opacity ?? 1) > 0.05);
  });
  const collisionClear = b.standingClearAt(0, 15.42);
  door.toggle();
  door._t = 0;
  door.pivot.rotation.y = 0;
  return {
    collisionClear,
    hits: hits.map((hit) => ({
      name: hit.object.name || hit.object.type,
      distance: Number(hit.distance.toFixed(3)),
    })),
  };
});
check('the open front door reveals a clear vestibule portal',
  frontPortal.collisionClear && frontPortal.hits.length === 0,
  JSON.stringify(frontPortal));

/* ---- the bouncer ---- */
await walkTo(0, 13, Math.PI);
await page.evaluate(() => {
  const b = window.__bing;
  b.dialogue.start(b.scripts.bouncer, 'open', b.cast.byName.bouncer);
});
await tick(1);
s = await state();
check('the bouncer offers four answers', s.options === 4, String(s.options));
await choose(0);
await tick(4);
check('and lets you in', (await state()).flags.bouncerCleared === true);

/* ---- the rest of the club ----
 * These are the things the mission does not need and the player will do
 * anyway: a door, a drink, a chair, a tip. Each one has broken at least once.
 */
await tick(6);
check('a conversation ends by itself', !(await page.evaluate(() => window.__bing.dialogue.active)));

const people = await page.evaluate(() => {
  const b = window.__bing;
  const performers = Object.entries(b.cast.byName)
    .filter(([key]) => key.startsWith('performer'))
    .map(([, npc]) => {
      const names = [];
      let finite = true;
      npc.group.updateMatrixWorld(true);
      npc.group.traverse((o) => {
        if (o.name) names.push(o.name);
        if (o.matrix?.elements?.some((v) => !Number.isFinite(v))) finite = false;
      });
      const size = new b.THREE.Box3().setFromObject(npc.group).getSize(new b.THREE.Vector3());
      const required = [
        'performer.bikini-top.left',
        'performer.bikini-top.right',
        'performer.bikini-bottom.rear.left',
        'performer.bikini-bottom.rear.right',
        'performer.bikini-top.band',
        'performer.bikini-bottom.band',
      ];
      return {
        profile: npc.group.userData.npc,
        requiredMeshes: required.every((name) => names.includes(name)),
        finite,
        height: size.y,
      };
    });

  const drinkers = b.cast.all.filter((npc) => npc.job === 'drink').map((npc) => {
    npc.group.updateMatrixWorld(true);
    const bounds = new b.THREE.Box3().setFromObject(npc.group);
    return {
      seated: npc.seated,
      dropped: npc.group.position.y < npc.baseY,
      floor: bounds.min.y,
    };
  });
  const movers = b.cast.all.filter((npc) => npc.job === 'patrol' || npc.job === 'dance');
  for (let i = 0; i < 180; i++) {
    for (const npc of movers) npc.update(1 / 30, b.player.position);
  }
  const patrolsClear = movers
    .filter((npc) => npc.job === 'patrol' && npc.group.visible)
    .every((npc) => npc._navClear(npc.group.position.x, npc.group.position.z));
  let nonHeroShadowCasters = 0;
  for (const npc of b.cast.all) {
    if (npc.tier === 'hero') continue;
    npc.group.traverse((o) => {
      if (o.isMesh && o.castShadow) nonHeroShadowCasters += 1;
    });
  }
  return {
    count: b.cast.all.length,
    performers,
    drinkers,
    moversSmooth: movers.every((npc) => npc._every <= 1 / 30 + 1e-6),
    patrolsClear,
    nonHeroShadowCasters,
  };
});
check('the full nightclub population remains present', people.count >= 30, String(people.count));
check('all stage performers are tagged adult female curvy bikini performers',
  people.performers.length === 4
    && people.performers.every((p) => p.profile.role === 'performer'
      && p.profile.adult === true
      && p.profile.gender === 'female'
      && p.profile.bodyShape === 'curvy'
      && p.profile.outfit === 'bikini'
      && p.requiredMeshes
      && p.finite
      && p.height > 1.55 && p.height < 1.95),
  JSON.stringify(people.performers));
check('drink animations begin from a real seated, floor-safe pose',
  people.drinkers.length > 0
    && people.drinkers.every((p) => p.seated && p.dropped && p.floor > -0.08),
  JSON.stringify(people.drinkers));
check('walking and dancing NPCs update smoothly and patrol clear of furniture',
  people.moversSmooth && people.patrolsClear);
check('ambient and background people no longer multiply shadow passes',
  people.nonHeroShadowCasters === 0, String(people.nonHeroShadowCasters));

/* ---- the wave-2 scene pass: stage front, hair, seating, walls ---- */
const scenePass = await page.evaluate(() => {
  const b = window.__bing;
  const guard = b.cast.byName.security;
  const runway = b.club.anchors.runway;
  const stageNav = {
    blockers: b.club.navBlockers.length,
    runwayBlocked: !guard._navClear(runway.x, runway.z),
    deckBlocked: !guard._navClear(-12, -7.2),
    playerStageHeight: b.club.groundAt(-12, -7.2),
    blockersOutOfPlayerWorld: !b.club.colliders.includes(b.club.navBlockers[0]),
  };

  const hairOf = (npc) => {
    const pieces = [];
    npc.group.traverse((o) => {
      if (o.isMesh && /^person\.hair\./.test(o.name)) pieces.push(o);
    });
    return pieces;
  };
  const blondePieces = hairOf(b.cast.byName.performer3);
  const hairShaped = Object.entries(b.cast.byName)
    .filter(([key]) => key.startsWith('performer'))
    .every(([, npc]) => hairOf(npc).length >= 2);

  let chain = false;
  let pendant = false;
  b.cast.byName.lou.group.traverse((o) => {
    if (o.name === 'necklace.chain') chain = true;
    if (o.name === 'necklace.pendant') pendant = true;
  });

  /* On the cushion of the bench nearest them, whichever run that is, measured
   * off the club's own seat anchors instead of remembered numbers -- the north
   * run has since moved south out of the front wall, and a hard-coded band is
   * how three regulars came to be sitting in brick. The anchor stands 0.6 in
   * front of the bench centre on the north run and 0.35 out from it on the
   * east; the cushion is 0.72 deep, so anyone on it is within 0.36. */
  const patronsSeated = [];
  for (let i = 0; i < 6; i++) {
    const patron = b.cast.byName[`patron${i}`];
    if (!patron) continue;
    const { x, z } = patron.group.position;
    const spot = b.club.anchors.booths
      .map((anchor) => ({ anchor, d: Math.hypot(anchor.x - x, anchor.z - z) }))
      .sort((p, q) => p.d - q.d)[0]?.anchor;
    if (!spot) { patronsSeated.push(false); continue; }
    const east = spot.x > 0;
    const bench = east ? spot.x + 0.35 : spot.z + 0.6;
    patronsSeated.push(Math.abs((east ? x : z) - bench) < 0.36);
  }

  const toilets = [];
  b.scene.traverse((o) => {
    if (o.name !== 'toilet') return;
    const p = new b.THREE.Vector3();
    o.getWorldPosition(p);
    if (p.x < 7.9 || p.x > 13.9 || p.z < -1.4 || p.z > 2.7) return;
    let water = false;
    o.traverse((m) => { if (m.isMesh && m.material?.isMeshPhysicalMaterial) water = true; });
    toilets.push(water);
  });

  return {
    stageNav,
    blondeHair: blondePieces[0]?.material.color.getHex() ?? null,
    blondePieceCount: blondePieces.length,
    hairShaped,
    chain,
    pendant,
    patronsSeated: patronsSeated.length === 6 && patronsSeated.every(Boolean),
    archClear: b.standingClearAt(4.7, 3.4),
    monitorMounted: b.club.office.monitor.position.x > 13.3,
    toilets,
    duckWaiting: !!b.club.storeroom?.duck && b.club.storeroom.duck.visible === false,
  };
});
check('the stage front blocks the crowd but still takes the player',
  scenePass.stageNav.blockers === 3
    && scenePass.stageNav.runwayBlocked
    && scenePass.stageNav.deckBlocked
    && scenePass.stageNav.playerStageHeight > 0.5
    && scenePass.stageNav.blockersOutOfPlayerWorld,
  JSON.stringify(scenePass.stageNav));
check('the runway is the blonde’s and every performer wears shaped hair',
  scenePass.blondeHair === 0xdcb04a && scenePass.blondePieceCount >= 3 && scenePass.hairShaped,
  `hair #${(scenePass.blondeHair ?? 0).toString(16)}, ${scenePass.blondePieceCount} pieces`);
check('Lou’s chain drapes to a pendant lying on his chest',
  scenePass.chain && scenePass.pendant);
check('booth patrons sit on the benches, not in the tables',
  scenePass.patronsSeated);
check('the arch to the back of house is clear of booth colliders',
  scenePass.archClear);
check('the office monitor hangs from its wall bracket',
  scenePass.monitorMounted);
check('three real toilets with water in the bowls stand in the stalls',
  scenePass.toilets.length === 3 && scenePass.toilets.every(Boolean),
  JSON.stringify(scenePass.toilets));
check('the duck waits unfound in the store room',
  scenePass.duckWaiting);

const acoustics = await page.evaluate(() => {
  const b = window.__bing;
  const calls = [];
  const originalSetLoopVolume = b.audio.setLoopVolume;
  b.audio.setLoopVolume = function setLoopVolumeSpy(...args) {
    calls.push(args);
    return originalSetLoopVolume.apply(this, args);
  };
  const setDoor = (door, open) => {
    if (door.open !== open) door.toggle();
    door._t = open ? door.swing : 0;
    door.pivot.rotation.y = door._t;
  };
  setDoor(b.club.doors.front, false);
  setDoor(b.club.doors.inner, false);
  b.player.position.set(-0.7, 1.66, 25);
  b.updateZones(0.016);
  const outside = { ...b.game.acoustics };

  setDoor(b.club.doors.front, true);
  b.player.position.set(0, 1.66, 13);
  b.updateZones(0.016);
  const vestibule = { ...b.game.acoustics };

  setDoor(b.club.doors.inner, true);
  b.player.position.set(-8, 1.66, 4);
  b.updateZones(0.016);
  const main = { ...b.game.acoustics };
  const beforeRepeat = calls.length;
  for (let i = 0; i < 60; i++) b.updateZones(0.016);
  const repeatedRamps = calls.length - beforeRepeat;
  const rainVisibleInside = b.club.rain.points.visible;

  b.audio.setLoopVolume = originalSetLoopVolume;
  setDoor(b.club.doors.front, false);
  setDoor(b.club.doors.inner, false);
  return { outside, vestibule, main, repeatedRamps, rainVisibleInside };
});
check('rain settles sharply across the entrance doors',
  acoustics.outside.rain === 0.38
    && acoustics.vestibule.rain <= 0.04
    && acoustics.main.rain <= 0.006
    && acoustics.main.rain < acoustics.outside.rain / 50
    && !acoustics.rainVisibleInside,
  JSON.stringify(acoustics));
check('an unchanged room does not schedule WebAudio ramps every frame',
  acoustics.repeatedRamps === 0, String(acoustics.repeatedRamps));

const doors = await page.evaluate(() => {
  const b = window.__bing;
  const d = b.club.doors.lou;
  const before = b.club.colliders.length;
  d.leaf.userData.interact.onUse();
  const open = { open: d.open, colliders: b.club.colliders.length };
  d.leaf.userData.interact.onUse();
  const locked = b.club.doors.manager;
  locked.leaf.userData.interact.onUse();
  return {
    before, open,
    closed: { open: d.open, colliders: b.club.colliders.length },
    lockedStayedShut: !locked.open,
  };
});
check('a door opens and takes its collider with it',
  doors.open.open && doors.open.colliders === doors.before - 1, JSON.stringify(doors.open));
check('and gives it back on the way closed',
  !doors.closed.open && doors.closed.colliders === doors.before, JSON.stringify(doors.closed));
check('the locked ones stay locked', doors.lockedStayedShut);

/* ---- conversations persist ----
 * Walk off mid-thread and the next talk resumes where it lapsed; only a
 * finished conversation replays from the top. */
await walkTo(-18.5, 2.2, Math.PI / 2);
const resume = await page.evaluate(() => {
  const b = window.__bing;
  const bartender = b.cast.byName.bartender;
  b.dialogue.start(b.scripts.bartender, 'open', bartender, { resume: true });
  b.dialogue.choose(0);                                    // the architecture joke
  for (let i = 0; i < 40 && b.dialogue.nodeId !== 'order'; i++) {
    b.dialogue.update(0.5, b.player.position);
  }
  const mid = b.dialogue.nodeId;
  b.dialogue.end('walked-away');
  b.dialogue.start(b.scripts.bartender, 'open', bartender, { resume: true });
  const resumed = b.dialogue.nodeId;
  b.dialogue.choose(0);                                    // club soda; thread completes
  for (let i = 0; i < 40 && b.dialogue.active; i++) {
    b.dialogue.update(0.5, b.player.position);
  }
  b.dialogue.start(b.scripts.bartender, 'open', bartender, { resume: true });
  const replayed = b.dialogue.nodeId;
  b.dialogue.end('done');
  return { mid, resumed, replayed };
});
check('a walked-away conversation resumes; a finished one replays',
  resume.mid === 'order' && resume.resumed === 'order' && resume.replayed === 'open',
  JSON.stringify(resume));

/* ---- the floor ---- */
await walkTo(-8, 4, Math.PI);
s = await state();
check('walking in starts Lou waiting', s.mission === 'club', s.mission);

const bar = await page.evaluate(() => {
  const b = window.__bing;
  const route = b.scripts.bartender.order.options[1].next(); // a beer
  const held = b.game.heldDrink;
  b.game.drinking = 3;                                    // as if [F] had been held
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
  return { held, route };
});
await tick(3, 0.1);
/* The swallow rides the real frame loop's key handling, which under software
 * rendering can lag the stepped clock — poll up to twenty more simulated
 * seconds instead of racing a single window. This check failed one run in
 * five on the old fixed wait. */
for (let i = 0; i < 20; i++) {
  if (await page.evaluate(() => window.__bing.drunk.level > 0)) break;
  await tick(1, 0.1);
}
check('the bar serves, and the drink lands',
  bar.route === 'pour' && bar.held === 'beer'
    && (await page.evaluate(() => window.__bing.drunk.level)) > 0,
  `drunk ${await page.evaluate(() => window.__bing.drunk.level.toFixed(2))}`);

const seat = await page.evaluate(() => {
  const b = window.__bing;
  const spot = b.club.anchors.booths[0];
  b.game.seatedIn = null;
  b.player.position.set(spot.x + 1, 1.66, spot.z);
  b.player.mode = 'walk';
  const pads = [];
  b.scene.traverse((o) => {
    const l = o.userData?.interact?.label;
    const text = typeof l === 'function' ? l() : l;
    if (text && String(text).includes('booth')) pads.push(o);
  });
  if (!pads.length) return { found: false };
  pads[0].userData.interact.onUse();
  return { found: true, seated: b.game.seatedIn };
});
await tick(2);
check('there is somewhere to sit', seat.found && seat.seated === 'seat', JSON.stringify(seat));
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })));
await tick(2);
const stoodFromBooth = await page.evaluate(() => {
  const b = window.__bing;
  return {
    seated: b.game.seatedIn,
    safe: b.standingClearAt(b.player.position.x, b.player.position.z),
    room: b.club.roomAt(b.player.position.x, b.player.position.z),
    x: b.player.position.x,
    z: b.player.position.z,
  };
});
check('and a validated clear way back up',
  stoodFromBooth.seated === null && stoodFromBooth.safe && stoodFromBooth.room === 'main',
  JSON.stringify(stoodFromBooth));

const allSeatExits = await page.evaluate(() => {
  const b = window.__bing;
  const exits = b.club.anchors.booths.map((spot) => {
    const yaw = spot.x > 0 ? Math.PI / 2 : 0;
    const safe = b.findSafeStandSpot(spot, yaw);
    return safe ? { x: safe.x, z: safe.z, clear: b.standingClearAt(safe.x, safe.z) } : null;
  });
  const table = b.findSafeStandSpot(
    b.club.anchors.blackjackSeats[2],
    b.club.anchors.blackjackSeats[2].yaw,
  );
  return {
    exits,
    table: table ? { x: table.x, z: table.z, clear: b.standingClearAt(table.x, table.z) } : null,
  };
});
check('every authored booth and the blackjack seat have a safe egress',
  allSeatExits.exits.length === 9
    && allSeatExits.exits.every((exit) => exit?.clear)
    && allSeatExits.table?.clear,
  JSON.stringify(allSeatExits));

const unstuck = await page.evaluate(() => {
  const b = window.__bing;
  const blocked = b.club.anchors.booths[0];
  b.player._tween = null;
  b.player.mode = 'walk';
  b.player.position.set(blocked.x, 1.66, blocked.z);
  const wasBlocked = !b.standingClearAt(blocked.x, blocked.z);
  const moved = b.recoverIfStuck();
  return {
    wasBlocked,
    moved,
    safe: b.standingClearAt(b.player.position.x, b.player.position.z),
  };
});
check('[Q] unstuck only moves a genuinely blocked walking player',
  unstuck.wasBlocked && unstuck.moved && unstuck.safe,
  JSON.stringify(unstuck));

/* ---- the Family hangout floor ----
 * The owner's order: everyone in the Family table hangs out here between
 * missions, with their real faces, one identity everywhere. Fresh campaign:
 * fifteen on the floor — Sasole is still at Whispering Pines until the Beef
 * Run is flown, and Big Uncle Lou is upstairs, never duplicated. */
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })));
const familyState = await page.evaluate(() => {
  const b = window.__bing;
  const members = b.family.all.map((npc) => {
    let photoFaces = 0;
    npc.group.updateMatrixWorld(true);
    npc.group.traverse((o) => {
      if (o.isMesh && Array.isArray(o.material) && o.material[4]?.map) photoFaces += 1;
    });
    const { x, z } = npc.group.position;
    return {
      id: npc.characterId,
      photo: npc.familyMember.photo,
      hasFace: photoFaces > 0,
      eyes: npc.parts.eyes.length,
      job: npc.job,
      seated: !!npc.seated,
      standingClear: npc.job === 'stand' ? b.standingClearAt(x, z) : true,
      navClear: npc._clearOf(b.club.navBlockers, x, z),
      interactive: !!npc.group.userData.interact,
    };
  });
  return {
    members,
    ids: members.map((m) => m.id).sort(),
    faces: [...b.faceIndex].sort(),
  };
});
{
  const expected = ['ape', 'booski', 'deathmegatron', 'eric', 'gratin', 'hogmama',
    'irish', 'lag', 'numbskull', 'old_stove', 'rippinflow', 'seff',
    'shubenator', 'snow', 'willy'];
  check('the Family holds the floor on a fresh campaign — fifteen, stable ids, no second Lou',
    familyState.ids.join(',') === expected.join(','),
    familyState.ids.join(','));
  check('Sasole sits out until the Beef Run is flown',
    !familyState.ids.includes('captain_lou_sasole'));
  const ledger = {
    lag: 'lag.png', willy: 'willy.png', irish: 'irish.png', ape: 'ape.png',
    old_stove: 'stove.png', seff: 'seff.png', numbskull: 'numbskull.png',
  };
  check('real faces where the photos exist; authored heads staged for any faces still to come',
    familyState.members.every((m) => (familyState.faces.includes(m.photo)
      ? m.hasFace
      : !m.hasFace && m.eyes === 2 && ledger[m.id] === m.photo)),
    JSON.stringify(familyState.members.map((m) => [m.id, m.hasFace])));
  check('they are patrons, not patrollers — seated or idling, clear of the stage nav and walls',
    familyState.members.every((m) => ['sit', 'drink', 'stand', 'lean'].includes(m.job)
      && (m.job === 'stand' ? m.standingClear : m.seated)
      && m.navClear && m.interactive),
    JSON.stringify(familyState.members.map((m) => [m.id, m.job, m.navClear])));
}

/* ---- nobody is sitting in a wall ----
 *
 * The owner found Eric and Lag inside the club's front wall: the north booth
 * run had been pushed back until its bench backs were past the plaster, and
 * everybody on it went with the furniture. `standingClear` never catches that
 * -- it is a test for the PLAYER's capsule against colliders, and a seated
 * patron is neither -- so this is the general form of the fault: every figure
 * in the building against every wall face in it, wherever they sit.
 *
 * Two things make it honest. The walls are found rather than listed: any tall,
 * thin, long slab parented straight to the club root, which picks up the
 * shell's brick, the interior partitions AND the panelled skins standing proud
 * of them (the skin is the face a bench actually touches). And the figures are
 * measured as ORIENTED boxes: a Box3 is axis-aligned in world space, so at the
 * yaws most of this cast sits at it bloats over the rotated corners and would
 * fail people who are nowhere near a wall. Each figure's own yaw is zeroed to
 * read its true extents, the box is then rotated back about its own origin,
 * and the overlap test is a 2D separating-axis test in XZ plus a Y overlap. */
const seatedInWalls = await page.evaluate(() => {
  const b = window.__bing;
  const T = b.THREE;
  const boxOf = (o) => { o.updateMatrixWorld(true); return new T.Box3().setFromObject(o); };

  const walls = [];
  for (const o of b.club.root.children) {
    if (!o.isMesh) continue;
    const bb = boxOf(o);
    const w = bb.max.x - bb.min.x;
    const d = bb.max.z - bb.min.z;
    const h = bb.max.y - bb.min.y;
    if (h < 1.0 || Math.min(w, d) > 0.6 || Math.max(w, d) < 2) continue;
    walls.push(bb);
  }

  /** A figure's true footprint: local extents, rotated back to its own yaw. */
  const obbOf = (npc) => {
    const yaw = npc.group.rotation.y;
    npc.group.rotation.y = 0;
    npc.group.updateMatrixWorld(true);
    const box = boxOf(npc.group);
    npc.group.rotation.y = yaw;
    npc.group.updateMatrixWorld(true);
    const p = npc.group.position;
    const c = box.getCenter(new T.Vector3());
    const e = box.getSize(new T.Vector3()).multiplyScalar(0.5);
    const lx = c.x - p.x;
    const lz = c.z - p.z;
    const s = Math.sin(yaw);
    const cs = Math.cos(yaw);
    return {
      cx: p.x + lx * cs + lz * s,
      cz: p.z - lx * s + lz * cs,
      ex: e.x, ez: e.z, y0: box.min.y, y1: box.max.y,
      ax: [cs, -s], az: [s, cs],
    };
  };
  const hits = (obb, box) => {
    if (obb.y1 <= box.min.y || obb.y0 >= box.max.y) return false;
    const dx = obb.cx - (box.min.x + box.max.x) / 2;
    const dz = obb.cz - (box.min.z + box.max.z) / 2;
    const bex = (box.max.x - box.min.x) / 2;
    const bez = (box.max.z - box.min.z) / 2;
    for (const [ax, az] of [[1, 0], [0, 1], obb.ax, obb.az]) {
      const gap = Math.abs(dx * ax + dz * az)
        - (obb.ex * Math.abs(obb.ax[0] * ax + obb.ax[1] * az)
          + obb.ez * Math.abs(obb.az[0] * ax + obb.az[1] * az))
        - (bex * Math.abs(ax) + bez * Math.abs(az));
      if (gap > 1e-6) return false;
    }
    return true;
  };

  const report = (list) => list
    .filter((npc) => npc?.group && npc.seated)
    .map((npc) => {
      const obb = obbOf(npc);
      const wall = walls.find((w) => hits(obb, w));
      return {
        who: npc.characterId || npc.name,
        x: +npc.group.position.x.toFixed(2),
        z: +npc.group.position.z.toFixed(2),
        inWall: !!wall,
        wall: wall ? [+wall.min.x.toFixed(2), +wall.min.z.toFixed(2), +wall.max.x.toFixed(2), +wall.max.z.toFixed(2)] : null,
      };
    });

  const family = report(b.family.all);
  const floor = report(Object.values(b.cast.byName));
  return {
    walls: walls.length,
    family,
    floor,
    offenders: [...family, ...floor].filter((m) => m.inWall),
  };
});
check('no seated figure in the building has any part of them inside a wall — Family and floor, measured as oriented boxes against every wall face',
  seatedInWalls.walls >= 20
    && seatedInWalls.family.length >= 12
    && seatedInWalls.floor.length >= 5
    && seatedInWalls.offenders.length === 0,
  `${seatedInWalls.walls} wall faces, ${seatedInWalls.family.length} seated Family, `
  + `${seatedInWalls.floor.length} seated floor${seatedInWalls.offenders.length
    ? ` — ${JSON.stringify(seatedInWalls.offenders)}` : ''}`);

/* ---- Willy's belly ----
 * The owner's ask, ahead of a later reveal: a real, general `gut` option on
 * the shared figure builder (src/bing/cast.js), not a Willy-only shape, with
 * Willy as its first user. Pinned three ways: does it actually read as
 * bigger than every other seated man in the Family, does an arm ever pass
 * through it, and does the option work on a figure that never shipped --
 * proof it is a builder feature and not a hack drawn around one man.
 *
 * Every measurement below zeroes the figure's own yaw before reading a
 * Box3. A Box3 is axis-aligned in WORLD space, so at a yaw that is not a
 * multiple of pi/2 -- which is most of this cast, Willy included -- the box
 * bloats to cover the rotated corners, and a depth/width comparison or an
 * intersection test taken at the seat's actual facing can flip its verdict
 * for no reason but which way the chair points in the room. Confirmed by
 * hand: the same sit() pose read as clear at yaw 0 and as clipping at yaw
 * 2.72 (Willy's real seat) with nothing else different. Zeroing the whole
 * figure's yaw removes that artefact without touching anything internal to
 * the pose -- an arm's rotation relative to its own shoulder does not care
 * which way the chair faces.
 */
const bellyState = await page.evaluate(async () => {
  const b = window.__bing;
  const T = b.THREE;
  const { Npc } = await import('./src/bing/cast.js');

  const withYawZeroed = (npc, fn) => {
    const yaw = npc.group.rotation.y;
    npc.group.rotation.y = 0;
    npc.group.updateMatrixWorld(true);
    const result = fn();
    npc.group.rotation.y = yaw;
    npc.group.updateMatrixWorld(true);
    return result;
  };
  // The trunk, excluding head/arms/legs: hips, waist, ribcage, shoulders and
  // -- when present -- the belly, which is added to `body` alongside them.
  const trunkBoxOf = (npc) => {
    const excl = new Set([npc.parts.head, npc.parts.armL, npc.parts.armR]);
    const box = new T.Box3();
    let any = false;
    npc.parts.body.children.forEach((child) => {
      if (excl.has(child)) return;
      child.updateMatrixWorld(true);
      const bb = new T.Box3().setFromObject(child);
      if (!any) { box.copy(bb); any = true; } else box.union(bb);
    });
    return box;
  };
  const gutBoxOf = (npc) => {
    const box = new T.Box3();
    let any = false;
    npc.group.traverse((o) => {
      if (o.isMesh && /^person\.gut\./.test(o.name)) {
        o.updateMatrixWorld(true);
        const bb = new T.Box3().setFromObject(o);
        if (!any) { box.copy(bb); any = true; } else box.union(bb);
      }
    });
    return any ? box : null;
  };
  const armMeshesOf = (npc) => {
    const out = [];
    for (const armGroup of [npc.parts.armL, npc.parts.armR]) {
      armGroup.updateMatrixWorld(true);
      armGroup.traverse((o) => { if (o.isMesh) out.push(new T.Box3().setFromObject(o)); });
    }
    return out;
  };
  const noArmClip = (npc) => withYawZeroed(npc, () => {
    npc.group.updateMatrixWorld(true);
    const gut = gutBoxOf(npc);
    if (!gut) return true;
    return armMeshesOf(npc).every((a) => !a.intersectsBox(gut));
  });

  const willy = b.family.byId.willy;

  // Depth/width -- read as the trunk's footprint -- against every OTHER
  // seated, non-female Family member. Family builds are authored numbers,
  // unlike the ambient floor's randomised patrons, so this is the same
  // roster every run.
  willy.job = 'sit';
  willy.folded = false;
  willy._syncJob(true);
  const willySize = withYawZeroed(willy, () => trunkBoxOf(willy).getSize(new T.Vector3()));
  const others = b.family.all
    .filter((npc) => npc !== willy && npc.seated && npc.group.userData.npc.gender !== 'female')
    .map((npc) => withYawZeroed(npc, () => trunkBoxOf(npc).getSize(new T.Vector3())));
  const maxOtherDepth = Math.max(...others.map((s) => s.z));
  const maxOtherArea = Math.max(...others.map((s) => s.x * s.z));

  // No clipping: the actual seated rest pose, the idle sway sampled across
  // several seconds (the seated arm sway that plays at the table), and the
  // arm-clamp (folded) branch -- Willy never folds, but the branch is
  // general, so it is exercised here directly rather than only by proxy.
  const sitClear = noArmClip(willy);
  let swayClear = true;
  willy.group.rotation.y = 0;
  for (let i = 0; i < 120 && swayClear; i++) {
    willy.update(1 / 20, null);
    willy.group.updateMatrixWorld(true);
    const gut = gutBoxOf(willy);
    if (gut && armMeshesOf(willy).some((a) => a.intersectsBox(gut))) swayClear = false;
  }
  willy.job = 'stand';
  willy.folded = true;
  willy._syncJob(true);
  for (let i = 0; i < 10; i++) willy.update(1 / 20, null);
  const foldedClear = noArmClip(willy);
  // Put him back exactly as populateFamily left him.
  willy.folded = false;
  willy.job = 'sit';
  willy._syncJob(true);
  willy.group.rotation.y = willy.homeYaw;
  willy.group.updateMatrixWorld(true);

  // Reusable, not a Willy-only hack: a second, differently-proportioned
  // gutted figure that never shipped, off in a corner nobody looks at,
  // proving the same three poses on its own.
  const other = new Npc(b.scene, {
    name: 'verify-only', tier: 'ambient', job: 'sit', x: -80, z: -80, yaw: 1.1,
    model: { height: 1.62, build: 1.35, gut: 1.2, dress: 'tracksuit' },
  });
  for (let i = 0; i < 5; i++) other.update(1 / 20, null);
  const reuse = { sit: noArmClip(other) };
  other.job = 'stand';
  other._syncJob(true);
  for (let i = 0; i < 5; i++) other.update(1 / 20, null);
  reuse.stand = noArmClip(other);
  other.folded = true;
  other._syncJob(true);
  for (let i = 0; i < 5; i++) other.update(1 / 20, null);
  reuse.folded = noArmClip(other);
  other.group.visible = false;

  return {
    willyDepth: +willySize.z.toFixed(4),
    willyArea: +(willySize.x * willySize.z).toFixed(4),
    maxOtherDepth: +maxOtherDepth.toFixed(4),
    maxOtherArea: +maxOtherArea.toFixed(4),
    otherCount: others.length,
    sitClear, swayClear, foldedClear,
    reuse,
  };
});
check('Willy carries a real belly on the shared figure builder — his seated trunk reads deeper, and a bigger footprint, than every other seated man in the Family, by a clear margin',
  bellyState.otherCount >= 8
    && bellyState.willyDepth > bellyState.maxOtherDepth * 1.2
    && bellyState.willyArea > bellyState.maxOtherArea * 1.1,
  JSON.stringify(bellyState));
check('no arm mesh ever intersects the belly — seated at the rail, idling, or arms crossed',
  bellyState.sitClear && bellyState.swayClear && bellyState.foldedClear,
  JSON.stringify({ sit: bellyState.sitClear, sway: bellyState.swayClear, folded: bellyState.foldedClear }));
check('the belly is a general builder option, not a Willy-only shape — a second, differently-built gutted figure keeps its arms clear of it too',
  bellyState.reuse.sit && bellyState.reuse.stand && bellyState.reuse.folded,
  JSON.stringify(bellyState.reuse));

/* Every cue the Family's scripts name must be authored in the manifest —
 * say() and voiceCue() are silent about a typo forever. Numbskull is the one
 * deliberate exception: no voice id yet, so his tree carries no cue names. */
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
  const authored = new Set((manifest.sfx || []).map((cue) => cue.name));
  const scripted = await page.evaluate(() => {
    const b = window.__bing;
    const cues = new Set();
    let numbskullCues = 0;
    for (const [id, tree] of Object.entries(b.familyScripts)) {
      for (const node of Object.values(tree)) {
        const collect = (owner) => {
          if (!owner?.cue) return;
          cues.add(typeof owner.cue === 'function' ? owner.cue() : owner.cue);
          if (id === 'numbskull') numbskullCues += 1;
        };
        collect(node);
        const opts = typeof node.options === 'function' ? node.options() : node.options;
        for (const opt of opts || []) collect(opt);
      }
    }
    return { cues: [...cues], numbskullCues };
  });
  const slugs = ['lag', 'gratin', 'eric', 'hogmama', 'deathmegatron', 'booski',
    'sasole', 'willy', 'irish', 'ape', 'stove', 'snow', 'rippinflow', 'seff',
    'shubenator', 'numbskull'];
  const ledgered = [
    ...slugs.flatMap((slug) => [`vo.bing.hang.${slug}.1`, `vo.bing.hang.${slug}.2`]),
    ...['lag', 'gratin', 'hogmama', 'sasole', 'irish'].map((slug) => `vo.bing.hang.${slug}.tony.1`),
    'vo.bing.booski.shot.offer', 'vo.bing.booski.shot.yell',
    'vo.bing.booski.shot.handoff', 'vo.bing.booski.shot.tony.1',
    'vo.bing.bartender.booski-shot.pour', 'vo.bing.booski.shot.after',
    'vo.bing.blackjack.dealer.deal.1', 'vo.bing.blackjack.dealer.deal.2',
    'vo.bing.blackjack.dealer.win', 'vo.bing.blackjack.dealer.lose',
    'vo.bing.blackjack.dealer.push', 'vo.bing.blackjack.dealer.bust',
    'vo.bing.blackjack.tony.win', 'vo.bing.blackjack.tony.lose',
  ];
  const missing = [
    ...scripted.cues.filter((cue) => !authored.has(cue)),
    ...ledgered.filter((cue) => !authored.has(cue)),
  ];
  check('every cue the floor names is authored in the manifest, Numbskull now included',
    missing.length === 0 && scripted.numbskullCues >= 2,
    missing.slice(0, 3).join(' / ') || `${scripted.cues.length} cues, numbskull ${scripted.numbskullCues}`);
}

/* Walk-up talk goes through the club's own dialogue machine: the member's
 * subtitled line carries their cue, a lapsed thread resumes, a finished one
 * replays from the top. */
await walkTo(2.4, -2.1, Math.PI / 2);
const famResume = await page.evaluate(() => {
  const b = window.__bing;
  const gratin = b.family.byId.gratin;
  gratin.group.userData.interact.onUse();
  const openNode = b.dialogue.nodeId;
  const openCue = typeof b.dialogue.node.cue === 'function' ? b.dialogue.node.cue() : b.dialogue.node.cue;
  const who = b.dialogue.ui.name.textContent;
  b.dialogue.choose(0);
  for (let i = 0; i < 40 && b.dialogue.nodeId !== 'more'; i++) {
    b.dialogue.update(0.5, b.player.position);
  }
  const mid = b.dialogue.nodeId;
  b.dialogue.end('walked-away');
  gratin.group.userData.interact.onUse();
  const resumed = b.dialogue.nodeId;
  b.dialogue.choose(0);                       // Tony's last word; thread completes
  for (let i = 0; i < 40 && b.dialogue.active; i++) {
    b.dialogue.update(0.5, b.player.position);
  }
  gratin.group.userData.interact.onUse();
  const replayed = b.dialogue.nodeId;
  b.dialogue.end('done');
  return { openNode, openCue, who, mid, resumed, replayed };
});
check('a Family walk-up opens with the member’s own subtitled cue',
  famResume.openNode === 'open' && famResume.openCue === 'vo.bing.hang.gratin.1'
    && famResume.who === 'GRATIN',
  JSON.stringify(famResume));
check('a lapsed Family thread resumes; a finished one replays',
  famResume.mid === 'more' && famResume.resumed === 'more' && famResume.replayed === 'open',
  JSON.stringify(famResume));

/* ---- Booski's shot, end to end ----
 * Talk → offer → the yell → the bartender hustles the shot across the room
 * under a held camera → handoff → Tony holds a whiskey he did not order.
 * The beat is stepped here the way the frame loop steps it. */
await walkTo(-17.3, 1.5, Math.PI / 2);
await page.evaluate(() => {
  const b = window.__bing;
  b.dialogue.start(b.familyScripts.booski, 'open', b.family.byId.booski, { resume: true });
  b.dialogue.choose(0);
});
/* Long enough for the offer AND the yell. A node's hold is now at least as
 * long as its own recording (see dialogue.js `_cueHold`), so the three-line
 * run to the yell takes as long as the three recordings do -- which is the
 * entire point of the fix, and six seconds no longer covers it. */
await tick(14);
await tickBeat(1.1, 0.1);
const midBeat = await page.evaluate(() => {
  const b = window.__bing;
  const T = b.THREE;
  const bottle = b.scene.getObjectByName('booski-shot.bottle');
  const stream = b.scene.getObjectByName('booski-shot.stream');
  const glass = b.scene.getObjectByName('booski-shot.glass');
  const halfStream = stream.geometry.parameters.height / 2;
  const streamEnds = [
    stream.localToWorld(new T.Vector3(0, halfStream, 0)),
    stream.localToWorld(new T.Vector3(0, -halfStream, 0)),
  ];
  const mouth = bottle.localToWorld(new T.Vector3(0, 0.3075, 0));
  const rim = glass.localToWorld(new T.Vector3(0, glass.geometry.parameters.height / 2, 0));
  return {
    frozen: b.player.mode === 'frozen',
    running: !!b.game.beat,
    oneShot: b.game.booskiShotDone,
    phase: b.game.shotBeat?.phase,
    bottle: bottle?.visible,
    stream: stream?.visible,
    fill: b.scene.getObjectByName('booski-shot.fill')?.scale.y,
    pourPose: b.cast.byName.bartender.parts.armR.rotation.x,
    mouthGap: Math.min(...streamEnds.map((point) => point.distanceTo(mouth))),
    rimGap: Math.min(...streamEnds.map((point) => point.distanceTo(rim))),
  };
});
check('the yell hands the room to the delivery — camera held, beat running',
  midBeat.frozen && midBeat.running && midBeat.oneShot,
  JSON.stringify(midBeat));
check('the bartender visibly pours bottle to stream to a filling shot before walking it over',
  midBeat.phase === 'pour' && midBeat.bottle && midBeat.stream
    && midBeat.fill > 0.05 && midBeat.fill < 1 && midBeat.pourPose < -0.5
    && midBeat.mouthGap < 0.012 && midBeat.rimGap < 0.012,
  JSON.stringify(midBeat));

async function tickBeat(secs, step = 0.25) {
  await page.evaluate(([secs, step]) => {
    const b = window.__bing;
    for (let t = 0; t < secs && b.game.beat; t += step) {
      b.cast.byName.bartender.update(step, b.player.position);
      b.game.beat(step);
      b.dialogue.update(step, b.player.position);
    }
  }, [secs, step]);
}
await tickBeat(1.3, 0.1);
const deliveryProp = await page.evaluate(() => {
  const b = window.__bing;
  const tray = b.scene.getObjectByName('booski-shot.delivery');
  const bartender = b.cast.byName.bartender;
  return {
    visible: tray?.visible,
    carriedByBartender: tray?.parent === bartender.group,
    moving: bartender.job === 'patrol',
    carryingPose: bartender.carryingShot === true,
    filled: b.scene.getObjectByName('booski-shot.delivery-fill')?.visible,
  };
});
check('the bartender carries the filled glass over on a visible tray',
  deliveryProp.visible && deliveryProp.carriedByBartender && deliveryProp.moving
    && deliveryProp.carryingPose && deliveryProp.filled,
  JSON.stringify(deliveryProp));
await tickBeat(30);
await tickBeat(30);
const afterBeat = await page.evaluate(() => {
  const b = window.__bing;
  const post = b.club.anchors.bouncerPost;
  const bouncer = b.cast.byName.bouncer;
  const bartender = b.cast.byName.bartender;
  const station = b.club.anchors.bartender;
  return {
    beatOver: b.game.beat === null,
    walk: b.player.mode === 'walk',
    holdingShot: b.game.heldDrink === 'booski-shot',
    inSlot: b.inventory.items.filter(Boolean).includes('whiskey'),
    bartenderHome: Math.hypot(bartender.group.position.x - station.x, bartender.group.position.z - station.z) < 0.3,
    bartenderWorking: bartender.job === 'work',
    bouncerStayed: Math.hypot(bouncer.group.position.x - post.x, bouncer.group.position.z - post.z) < 0.1,
    waitingForE: b.game.shotBeat?.phase === 'await-drink'
      && b.game.shotBeat?.awaitingDrink === true,
    didNotAutoDrink: b.game.shotBeat?.drank === false && !b.game.autoDrink,
    handoffSaid: b.dialogue.history.has('handoff') && b.dialogue.history.has('tony'),
    voiced: ['vo.bing.booski.shot.offer', 'vo.bing.booski.shot.yell',
      'vo.bing.booski.shot.handoff', 'vo.bing.booski.shot.tony.1']
      .every((cue) => b.game.voLog.includes(cue)),
  };
});
check('the shot lands and control comes back cleanly, bartender back at the service station',
  afterBeat.beatOver && afterBeat.walk && afterBeat.holdingShot && afterBeat.inSlot
    && afterBeat.bartenderHome && afterBeat.bartenderWorking && afterBeat.bouncerStayed,
  JSON.stringify(afterBeat));
check('the delivered shot waits for the player to press E and never auto-drinks',
  afterBeat.waitingForE && afterBeat.didNotAutoDrink,
  JSON.stringify(afterBeat));
const shotLift = await page.evaluate(() => {
  const b = window.__bing;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
  b.shotDrinkTick(0.55);
  const glass = b.scene.getObjectByName('booski-shot.held');
  return {
    phase: b.game.shotBeat?.phase,
    visible: glass?.visible,
    y: glass?.position.y,
    tilt: glass?.rotation.x,
    fill: b.scene.getObjectByName('booski-shot.held-fill')?.scale.y,
  };
});
check('E visibly lifts and tilts the filled shot glass toward Tony',
  shotLift.phase === 'drinking' && shotLift.visible
    && shotLift.y > -0.22 && shotLift.tilt < -0.2,
  JSON.stringify(shotLift));
const shotDrank = await page.evaluate(() => {
  const b = window.__bing;
  const before = b.drunk.level;
  b.shotDrinkTick(1);
  b.shotDrinkTick(0);
  return {
    phase: b.game.shotBeat?.phase,
    drank: b.game.shotBeat?.drank,
    tookShot: b.mission.flags.tookShot,
    held: b.game.heldDrink,
    inSlot: b.inventory.items.includes('whiskey'),
    glassVisible: b.scene.getObjectByName('booski-shot.held')?.visible,
    stronger: b.drunk.level > before,
    sounds: ['whiskey.cap', 'whiskey.pour', 'whiskey.swig', 'glass.set']
      .every((name) => b.audio.playbacks.some((playback) => playback.name === name)),
    newCues: ['vo.bing.bartender.booski-shot.pour', 'vo.bing.booski.shot.after']
      .every((cue) => b.game.voLog.includes(cue)),
  };
});
check('finishing the E animation consumes the glass and records the real drink',
  shotDrank.phase === 'drank' && shotDrank.drank && shotDrank.tookShot
    && shotDrank.held === null && !shotDrank.inSlot && !shotDrank.glassVisible
    && shotDrank.stronger,
  JSON.stringify(shotDrank));
check('the pour, swallow and glass sounds play and both new subtitled lines fire their cues',
  shotDrank.sounds && shotDrank.newCues,
  JSON.stringify(shotDrank));
const duplicateWhiskeyShot = await page.evaluate(() => {
  const b = window.__bing;
  b.dialogue.end('duplicate-whiskey-shot-regression');
  b.inventory.clear();
  b.inventory.add('whiskey');
  const olderSlot = b.inventory.selected;
  b.game.shotBeat = { phase: 'await-drink', awaitingDrink: true, drank: false };
  b.giveShot();
  const deliveredSlot = b.game.shotBeat.inventorySlot;
  b.inventory.select(olderSlot);
  b.startBooskiShotDrink();
  b.shotDrinkTick(2);
  const result = {
    olderSlot,
    deliveredSlot,
    selected: b.inventory.selected,
    olderItem: b.inventory.items[olderSlot],
    deliveredItem: b.inventory.items[deliveredSlot],
    whiskeyCount: b.inventory.items.filter((item) => item === 'whiskey').length,
    held: b.game.heldDrink,
  };
  b.inventory.clear();
  return result;
});
check('drinking Booski\'s delivered glass preserves an older whiskey after selection changes',
  duplicateWhiskeyShot.olderSlot !== duplicateWhiskeyShot.deliveredSlot
    && duplicateWhiskeyShot.selected === duplicateWhiskeyShot.olderSlot
    && duplicateWhiskeyShot.olderItem === 'whiskey'
    && duplicateWhiskeyShot.deliveredItem === null
    && duplicateWhiskeyShot.whiskeyCount === 1
    && duplicateWhiskeyShot.held === null,
  JSON.stringify(duplicateWhiskeyShot));
const fullSlotShot = await page.evaluate(() => {
  const b = window.__bing;
  b.dialogue.end('full-slot-shot-regression');
  b.inventory.clear();
  for (const item of ['whiskey', 'beer', 'beer', 'beer', 'beer']) b.inventory.add(item);
  const before = b.inventory.items.filter((item) => item === 'whiskey').length;
  b.game.shotBeat = { phase: 'await-drink', awaitingDrink: true, drank: false };
  b.giveShot();
  const inInventory = b.game.shotBeat.inInventory;
  b.startBooskiShotDrink();
  b.shotDrinkTick(2);
  const after = b.inventory.items.filter((item) => item === 'whiskey').length;
  const held = b.game.heldDrink;
  b.inventory.clear();
  return { before, after, inInventory, held };
});
check('an un-slotted Booski glass never consumes an older whiskey from a full inventory',
  fullSlotShot.before === 1 && fullSlotShot.after === 1
    && fullSlotShot.inInventory === false && fullSlotShot.held === null,
  JSON.stringify(fullSlotShot));
check('the beat spoke its four authored cues in order of appearance',
  afterBeat.handoffSaid && afterBeat.voiced,
  JSON.stringify(afterBeat));
const shotAgain = await page.evaluate(() => {
  const b = window.__bing;
  b.dialogue.start(b.familyScripts.booski, 'open', b.family.byId.booski, { resume: true });
  const opts = b.dialogue.options.map((o) => o.next ?? null);
  const line = b.dialogue.ui.line.textContent;
  b.dialogue.end('done');
  return { opts, line };
});
check('the shot is a one-shot per visit — Booski moves on to the next story',
  shotAgain.opts.length === 1 && shotAgain.opts[0] === null
    && /six hundred on red/i.test(shotAgain.line),
  JSON.stringify(shotAgain));

/* ---- the table finds its voice ----
 * Dealer bark on the deal, dealer verdict beside the WIN/LOSE callout, and
 * Tony's line only on his own wins and losses — never push, never bust. */
const bjDeal = await page.evaluate(() => {
  const b = window.__bing;
  const sayCalls = [];
  const origSay = b.audio.say;
  b.audio.say = function spy(group, opts) {
    sayCalls.push(group);
    return origSay.call(this, group, opts);
  };
  b.game.voLog.length = 0;
  b.blackjack.sitDown();
  b.blackjack.setBet(25);
  b.game.seatedIn = 'table';
  b.interaction.current = null;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
  b.audio.say = origSay;
  return { sayCalls, state: b.blackjack.state };
});
check('the dealer calls the cards in on every deal',
  bjDeal.sayCalls.includes('bing.blackjack.dealer.deal'),
  JSON.stringify(bjDeal.sayCalls));
await tick(3, 0.2);
/* Real time, not simulated.
 *
 * The table gives the verdict a one-second floor after the deal patter so
 * the croupier calling the cards in cannot mute the payoff two seconds
 * later -- and that floor is measured on the wall clock, because it is
 * about how the room SOUNDS. tick() steps three simulated seconds in about
 * twenty real milliseconds, so a hand that settles on the deal (a natural)
 * used to land inside the gap and the verdict went unspoken. Wait it out
 * the way a player does.
 */
await page.waitForTimeout(1300);
await page.evaluate(() => {
  const b = window.__bing;
  if (b.blackjack.state === 'player') b.blackjack.stand();
});
await tick(6, 0.2);
await page.waitForTimeout(200);
const bjVerdict = await page.evaluate(() => {
  const b = window.__bing;
  const out = { kind: b.game.lastHand?.kind ?? null, voLog: [...b.game.voLog] };
  b.game.seatedIn = null;
  b.blackjack.standUp();
  return out;
});
{
  const wantDealer = {
    blackjack: 'vo.bing.blackjack.dealer.win',
    win: 'vo.bing.blackjack.dealer.win',
    lose: 'vo.bing.blackjack.dealer.lose',
    push: 'vo.bing.blackjack.dealer.push',
    bust: 'vo.bing.blackjack.dealer.bust',
  }[bjVerdict.kind];
  const wantTony = bjVerdict.kind === 'win' || bjVerdict.kind === 'blackjack'
    ? 'vo.bing.blackjack.tony.win'
    : bjVerdict.kind === 'lose' ? 'vo.bing.blackjack.tony.lose' : null;
  const tonyBarks = bjVerdict.voLog.filter((cue) => cue.startsWith('vo.bing.blackjack.tony.'));
  check('the dealer calls the verdict beside the callout, Tony answers only his wins and losses',
    !!bjVerdict.kind && bjVerdict.voLog.includes(wantDealer)
      && (wantTony ? tonyBarks.join(',') === wantTony : tonyBarks.length === 0),
    `${bjVerdict.kind}: ${bjVerdict.voLog.join(', ')}`);
}

/* ---- the machine ----
 * Asserting the wallet went down would be wrong: it is a slot machine, and
 * occasionally it pays. What has to be true is that three spins happened and
 * that each one was staked. */
const slots = await page.evaluate(() => {
  const b = window.__bing;
  const before = b.game.money;
  let staked = 0;
  for (let i = 0; i < 3; i++) {
    const at = b.game.money;
    if (b.slots.spin()) staked += at - b.game.money;
    b.slots.update(4);
  }
  return { before, after: b.game.money, staked, wager: b.slots.wager, net: b.slots.view.net };
});
s = await state();
check('the machine takes a stake on every spin',
  s.spins === 3 && slots.staked === slots.wager * 3,
  `staked $${slots.staked} at $${slots.wager}, net ${slots.net >= 0 ? '+' : ''}$${slots.net}`);

/* ---- the table ---- */
await page.evaluate(() => {
  const b = window.__bing;
  b.blackjack.sitDown();
  b.blackjack.setBet(25);
  b.blackjack.deal();
});
await tick(3, 0.2);
const cardRead = await page.evaluate(() => {
  const mesh = window.__bing.blackjack._meshes[0];
  const face = mesh?.material?.[2];
  return mesh ? {
    w: mesh.geometry.parameters.width,
    d: mesh.geometry.parameters.depth,
    lit: (face?.emissiveIntensity ?? 0) > 0.2 && !!face?.emissiveMap,
  } : null;
});
check('the cards deal large and carry their own light',
  !!cardRead && cardRead.w >= 0.08 && cardRead.d >= 0.11 && cardRead.lit,
  JSON.stringify(cardRead));
await page.evaluate(() => window.__bing.blackjack.stand());
await tick(6, 0.2);
check('a hand of blackjack resolves', (await state()).hands >= 1);
const verdict = await page.evaluate(() => document.getElementById('bj-callout')?.textContent ?? '');
check('the hand ends with an explicit verdict on screen',
  /BLACKJACK|YOU WIN|PUSH|BUST|HOUSE WINS/.test(verdict), verdict);
await page.evaluate(() => window.__bing.blackjack.standUp());

/* ---- the back of house ---- */
await walkTo(6.7, 2, Math.PI);
check('the hallway moves the objective on', (await state()).mission === 'hallway');
await walkTo(10.5, -6, Math.PI);
await tick(1);
s = await state();
check('the office stays free until Tony chooses to talk to Lou',
  s.mission === 'office' && s.options === -1 && s.playerMode === 'walk', JSON.stringify(s));
// Lou, not his desk, owns the interaction target.
await page.evaluate(() => window.__bing.cast.byName.lou.group.userData.interact.onUse());
await tick(0.2);
s = await state();
check('using Lou starts the objective briefing and locks walking, not the camera',
  s.mission === 'office' && s.options >= 0 && s.playerMode === 'briefing', JSON.stringify(s));

const louBriefLock = await page.evaluate(() => {
  const b = window.__bing;
  const before = b.player.position.clone();
  b.player.setKey('KeyW', true);
  b.player.update(0.5);
  b.player.clearKeys();
  /* A normal conversation treats this as walking away. An objective briefing
     stays active until its authored reply chain reaches an end. */
  b.dialogue.update(0.1, {
    x: b.cast.byName.lou.group.position.x + 20,
    z: b.cast.byName.lou.group.position.z + 20,
  });
  return {
    lockMovement: b.dialogue.lockMovement === true,
    mode: b.player.mode,
    moved: before.distanceTo(b.player.position),
    stillTalking: b.dialogue.active,
  };
});
check('Lou’s objective briefing holds Tony in place until the authored dialogue ends',
  louBriefLock.lockMovement && louBriefLock.mode === 'briefing'
    && louBriefLock.moved < 0.001 && louBriefLock.stillTalking,
  JSON.stringify(louBriefLock));

/* ---- Lou ---- */
let ominous = null;
for (let i = 0; i < 8; i++) {
  const st = await state();
  if (st.flags.gotPackage) break;
  if (st.mission === 'package') {
    /* Before he takes it: the parcel on the desk carries its own dark red
     * light and a breathing glow, neither of which belongs to the desk lamp. */
    ominous = await page.evaluate(() => {
      const b = window.__bing;
      b.club.update(0.3, b.player.position);
      return {
        visible: b.club.office.parcel.visible,
        light: Number(b.club.office.parcelLight.intensity.toFixed(2)),
        glow: Number(b.club.office.parcelCloth.material.emissiveIntensity.toFixed(2)),
      };
    });
    await page.evaluate(() => window.__bing.club.office.parcel.userData.interact.onUse());
    await tick(2);
    break;
  }
  if (st.options > 0) await choose(0);
  else await tick(3);
}
check('the package sits in its own wrong light before he takes it',
  !!ominous && ominous.visible && ominous.light > 0.5 && ominous.glow > 0.05,
  JSON.stringify(ominous));
s = await state();
check('Lou puts it on the desk and you take it', s.flags.gotPackage === true, s.mission);
check('it is inside your jacket, not in a slot',
  s.carrying === 'parcel' && !s.inventory.includes('parcel'),
  `carrying ${s.carrying}, slots [${s.inventory.join(',')}]`);
check('the shared campaign owns the concealed package',
  s.campaign?.inventory?.concealed?.includes('parcel') === true,
  JSON.stringify(s.campaign?.inventory ?? null));
check('the package is Lou’s until Lou hands it over — not on him in the lot, inside the jacket after the briefing',
  packageAtStart && s.campaign?.inventory?.concealed?.includes('parcel') === true,
  JSON.stringify({ atStart: packageAtStart, afterHandoff: s.carrying }));

/* The case the reviewer found: five drinks and no drop key used to mean the
 * package went nowhere while the mission insisted it was on you. */
const full = await page.evaluate(() => {
  const b = window.__bing;
  for (let i = 0; i < 6; i++) b.scripts.bartender.order.options[1].next();
  return {
    slots: b.inventory.items.filter(Boolean).length,
    capacity: b.inventory.slots,
    carrying: b.game.carrying,
    full: b.inventory.full,
  };
});
check('a full hotbar cannot lose the package',
  full.full && full.slots === full.capacity && full.capacity === 5
    && full.carrying === 'parcel', JSON.stringify(full));

for (let i = 0; i < 10; i++) {
  const st = await state();
  if (st.mission === 'briefed') break;
  if (st.options > 0) await choose(st.options - 1);
  else await tick(3);
}
/* `mission.louDone()` is applied as Lou starts his final line. The movement
 * lock is deliberately held until that line has actually finished, so do not
 * confuse a logically-complete objective with a physically-complete briefing. */
for (let i = 0; i < 10 && (await page.evaluate(() => window.__bing.dialogue.active)); i++) {
  await tick(3);
}
const briefFinished = await page.evaluate(() => ({
  mission: window.__bing.mission.state,
  mode: window.__bing.player.mode,
  locked: window.__bing.dialogue.lockMovement === true,
}));
check('he finishes and lets you go',
  briefFinished.mission === 'briefed' && briefFinished.mode === 'walk' && !briefFinished.locked,
  JSON.stringify(briefFinished));

/* Once the job is done the front door itself offers the exit -- the owner's
 * playtest never found the wheel. The drive-out stays the canonical path
 * below; this only proves the on-foot prompt exists, arms, and is held. */
const leavePad = await page.evaluate(() => {
  const b = window.__bing;
  let pad = null;
  b.scene.traverse((o) => {
    const l = o.userData?.interact?.label;
    const text = typeof l === 'function' ? l() : l;
    if (text && /call it a night|head for the motel/i.test(String(text))) pad = o;
  });
  if (!pad) return null;
  return {
    z: pad.position.z,
    enabled: pad.userData.interact.enabled?.() ?? true,
    hold: pad.userData.interact.hold ?? 0,
  };
});
check('the front door offers a hold-to-leave once the job is done',
  !!leavePad && leavePad.enabled && leavePad.hold > 0 && Math.abs(leavePad.z - 16.75) < 1.5,
  JSON.stringify(leavePad));

/* ---- out ---- */
await walkTo(6.7, 2, 0);
await tick(1);
await walkTo(-4, 20, 0);
await tick(1);
check('back in the lot carrying it', (await state()).mission === 'lot-return');

/* The back way out: the alarm chirps, and the yard counts as leaving by it. */
const rear = await page.evaluate(() => {
  const b = window.__bing;
  b.club.doors.service.leaf.userData.interact.onUse();
  b.player.position.set(9, 1.66, -17);
  b.player.update(0.016);
  /* Step the zone system here rather than hoping a real frame lands between
   * this call and the assertion: software rendering runs at about a frame a
   * second, and which room the game thinks you are in is exactly the sort of
   * thing that must not depend on that. */
  b.updateZones(0.016);
  return { tripped: b.mission.flags.alarmTripped };
});
await tick(1.5);
check('the service door has a live alarm on it', rear.tripped);
check('and the yard behind it counts as the back way',
  await page.evaluate(() => window.__bing.mission.flags.leftByRear === true));

await walkTo(-4, 20, 0);
await tick(1);
await page.evaluate(() => {
  const b = window.__bing;
  b.game.seatedIn = 'car';
  b.car.wheel.userData.interact.onUse();
});
await page.waitForTimeout(800);
await tick(12, 0.5);
const ended = await page.evaluate(() => ({
  over: window.__bing.game.over,
  done: window.__bing.mission.state === 'done',
  card: document.getElementById('overlay').classList.contains('ending'),
  title: document.querySelector('#overlay .tag')?.textContent || '',
  saved: window.__bing.campaign?.state?.missions?.bada_bing_one ?? null,
  nextMission: window.__bing.campaign?.state?.missions?.squatchfather ?? null,
  returnHref: document.getElementById('next-level')?.getAttribute('href') ?? null,
}));
check('driving out finishes the mission', ended.over && ended.done, JSON.stringify(ended));
check('and puts up an ending card', ended.card, ended.title);
check('completion is recorded in shared campaign state',
  ended.saved?.status === 'complete' && ended.saved?.packageReceived === true,
  JSON.stringify(ended.saved));
check('the package unlocks Squatchfather',
  ended.nextMission?.status === 'available',
  JSON.stringify(ended.nextMission));
check('the ending offers a return to the apartment',
  ended.returnHref === 'index.html', ended.returnHref ?? 'missing');

if (ended.returnHref === 'index.html') {
  await page.evaluate(() => document.getElementById('next-level').click());
  await page.waitForFunction(() => window.__squatch, null, { timeout: 90000 });
  const returned = await page.evaluate(() => ({
    scene: window.__squatch.campaign?.state?.scene ?? null,
    hasPackage: window.__squatch.campaign?.hasItem('parcel') ?? false,
    player: {
      mode: window.__squatch.player.mode,
      x: window.__squatch.player.position.x,
      z: window.__squatch.player.position.z,
    },
  }));
  check('returning home keeps the package and front-door spawn',
    returned.hasPackage
      && returned.scene?.id === 'apartment'
      && returned.scene?.spawn === 'front_door'
      && returned.player.mode === 'walk'
      && Math.abs(returned.player.x - 2.55) < 0.05
      && Math.abs(returned.player.z - 3.72) < 0.05,
    JSON.stringify(returned));
}

/* ---- one identity, before and after the Beef Run ----
 * Same save, one field changed: the airstrip flown. Reload the club and the
 * Captain is at his table near the stage — same stable id as the cockpit,
 * same face photo, and the sixteenth chair on the floor. */
const savedBeforeReplay = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('squatchlife.campaign'));
  raw.missions.airstrip_smuggling.status = 'complete';
  raw.missions.airstrip_smuggling.checkpoint = 'landed_home';
  raw.missions.airstrip_smuggling.cargoLoaded = true;
  localStorage.setItem('squatchlife.campaign', JSON.stringify(raw));
  return raw.inventory;
});
await page.goto(`http://localhost:${PORT}/bing.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__bing?.family, null, { timeout: 90000 });

/* ---- the replayed first visit ----
 * This save has just finished the night, so it is still holding the package
 * the way a returning player's save does -- which is exactly how the owner
 * found scene one already carrying it before he had met Lou. The visit starts
 * empty-handed whatever the save remembers; the briefing is the only way it
 * gets into the jacket. */
const replayStart = await page.evaluate(() => {
  const b = window.__bing;
  b.game.kitOpen = false;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI' }));
  return {
    inventory: b.campaign.state.inventory,
    hasIt: b.campaign.hasItem('parcel'),
    carrying: b.game.carrying ?? null,
    mission: b.mission.state,
    kit: [...document.querySelectorAll('#kit li')].map((li) => li.textContent),
  };
});
check('a replayed first visit starts with empty pockets — a save still holding the package does not hand it back at the door',
  savedBeforeReplay?.concealed?.includes('parcel') === true
    && !replayStart.hasIt && replayStart.carrying === null
    && !replayStart.kit.some((t) => /package/i.test(t)),
  JSON.stringify({ save: savedBeforeReplay, now: replayStart.inventory, kit: replayStart.kit }));
/* Start it properly this time: the punch-list pass below reads the loaded
 * sample bank, the painted objective card and a rendered frame, none of
 * which exist until the club has actually been opened. */
await page.evaluate(() => document.getElementById('start-btn').click());
await page.waitForFunction(() => window.__bing?.game.started, null, { timeout: 120000 });
await page.evaluate(() => window.__bing.postfx.disable?.());
const postRun = await page.evaluate(() => {
  const b = window.__bing;
  const sasole = b.family.byId.captain_lou_sasole ?? null;
  let hasFace = false;
  sasole?.group.traverse((o) => {
    if (o.isMesh && Array.isArray(o.material) && o.material[4]?.map) hasFace = true;
  });
  return {
    count: b.family.all.length,
    present: !!sasole,
    hasFace,
    atHisTable: sasole
      ? Math.hypot(sasole.group.position.x + 12.55, sasole.group.position.z - 0.85) < 0.3
      : false,
    seated: !!sasole?.seated,
  };
});
check('after the Beef Run the Captain takes his table — same id, his own face',
  postRun.present && postRun.count === 16 && postRun.hasFace
    && postRun.atHisTable && postRun.seated,
  JSON.stringify(postRun));

/* ================================================================== *
 * The punch-list pass.
 *
 * Everything below pins something the owner reported by hand after playing
 * the club, in the order he reported it. The page has been reloaded twice by
 * now and the Beef Run is flown in this save, so the floor is sixteen.
 * ================================================================== */

/* ---- 1, 6, 7, 8, 9, 10: the people ---- */
const punchPeople = await page.evaluate(() => {
  const b = window.__bing;
  const T = b.THREE;
  const boxOf = (o) => { o.updateMatrixWorld(true); return new T.Box3().setFromObject(o); };
  const snow = b.family.byId.snow;
  const stoolFolk = ['booski', 'deathmegatron', 'seff']
    .map((id) => ({ id, floor: +boxOf(b.family.byId[id].group).min.y.toFixed(3) }));
  if (b.cast.byName.margo) {
    stoolFolk.push({ id: 'margo', floor: +boxOf(b.cast.byName.margo.group).min.y.toFixed(3) });
  }
  let silver = 0;
  let rippinPendant = 0;
  b.family.byId.rippinflow.group.traverse((o) => {
    if (o.name === 'necklace.chain.silver') silver += 1;
    if (o.name === 'necklace.pendant') rippinPendant += 1;
  });
  const hairOf = (npc) => {
    let n = 0;
    npc.group.traverse((o) => { if (/^person\.hair\./.test(o.name)) n += 1; });
    return n;
  };
  const soften = (npc) => {
    let n = 0;
    npc.group.traverse((o) => { if (/^person\.soft\./.test(o.name)) n += 1; });
    return n;
  };
  const performers = [0, 1, 2, 3].map((i) => {
    const npc = b.cast.byName[`performer${i}`];
    const bb = boxOf(npc.group);
    return {
      i,
      hair: hairOf(npc),
      soft: soften(npc),
      height: npc.group.userData.npc.height,
      tall: +(bb.max.y - bb.min.y).toFixed(3),
      fall: !!npc.group.getObjectByName('person.hair.fall'),
    };
  });
  return {
    bouncerYaw: b.cast.byName.bouncer.group.rotation.y,
    bouncerHomeYaw: b.cast.byName.bouncer.homeYaw,
    stoolFolk,
    snow: snow ? {
      outfit: snow.group.userData.npc.outfit,
      photo: snow.familyMember.photo,
      slug: snow.familyMember.slug,
      byTheBathroom: snow.group.position.x > 5.6 && snow.group.position.x < 7.8
        && snow.group.position.z > 0.5 && snow.group.position.z < 2.5,
      clear: b.standingClearAt(snow.group.position.x, snow.group.position.z),
      talks: !!snow.group.userData.interact,
    } : null,
    snowCount: b.cast.all.filter((n) => n.name === 'Snow').length,
    noCleaner: !b.cast.byName.cleaner,
    guard: b.cast.byName.hallGuard.group.userData.npc.outfit,
    guardChain: (() => {
      let n = 0;
      b.cast.byName.hallGuard.group.traverse((o) => { if (/^necklace\./.test(o.name)) n += 1; });
      return n;
    })(),
    silver,
    rippinPendant,
    performers,
  };
});
check('the bouncer faces the door he is standing on',
  Math.abs(punchPeople.bouncerYaw) < 0.01 && Math.abs(punchPeople.bouncerHomeYaw) < 0.01,
  `yaw ${punchPeople.bouncerYaw.toFixed(2)}`);
check('everybody on a bar stool sits ON it, feet at the footrest',
  punchPeople.stoolFolk.length >= 3
    && punchPeople.stoolFolk.every((m) => m.floor > 0.18 && m.floor < 0.42),
  JSON.stringify(punchPeople.stoolFolk));
check('one Snow in the building, and he is the janitor by the men’s room',
  punchPeople.snowCount === 1 && punchPeople.noCleaner
    && punchPeople.snow?.outfit === 'work' && punchPeople.snow?.photo === 'snow.png'
    && punchPeople.snow?.slug === 'snow' && punchPeople.snow?.byTheBathroom
    && punchPeople.snow?.clear && punchPeople.snow?.talks,
  JSON.stringify(punchPeople.snow));
check('the man on Lou’s door wears the crew’s suit and chain',
  punchPeople.guard === 'suit' && punchPeople.guardChain >= 2,
  `${punchPeople.guard}, ${punchPeople.guardChain} necklace parts`);
check('Rippinflow’s chain is a thin silver line with nothing hanging off it',
  punchPeople.silver === 1 && punchPeople.rippinPendant === 0,
  `silver ${punchPeople.silver}, pendant ${punchPeople.rippinPendant}`);
check('every performer keeps her height, wears real hair, and has her edges taken off',
  punchPeople.performers.every((p) => p.height > 1.55 && p.height < 1.95
    && p.tall < 1.95 && p.hair >= 4 && p.soft >= 12)
    && punchPeople.performers.filter((p) => p.fall).length >= 3,
  JSON.stringify(punchPeople.performers));

/* ---- 2, 3, 4, 5: every recorded voice in the club is reachable ---- */
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
  const authored = new Set((manifest.sfx || []).map((cue) => cue.name));
  const wired = await page.evaluate(() => {
    const b = window.__bing;
    const cues = new Set();
    const collect = (owner) => {
      if (!owner?.cue) return;
      cues.add(typeof owner.cue === 'function' ? owner.cue() : owner.cue);
    };
    const walk = (tree) => {
      for (const node of Object.values(tree)) {
        collect(node);
        const opts = typeof node.options === 'function' ? node.options() : node.options;
        for (const opt of opts || []) collect(opt);
      }
    };
    for (const tree of Object.values(b.scripts)) walk(tree);
    for (const tree of Object.values(b.familyScripts)) walk(tree);
    /* The two the club plays outside a dialogue tree: the table's verdicts
     * and the runway's thank-you, which is a tree main.js owns. */
    return [...cues];
  });
  const mustBeWired = [
    'vo.bing.door.in.1', 'vo.bing.door.in.2',
    'vo.bing.bar.1', 'vo.bing.bar.2', 'vo.bing.bar.3',
    'vo.bing.hang.lou.1', 'vo.bing.hang.lou.2',
    'vo.bing.hang.lag.tony.1', 'vo.bing.hang.gratin.tony.1',
    'vo.bing.hang.hogmama.tony.1', 'vo.bing.hang.sasole.tony.1',
    'vo.bing.hang.irish.tony.1', 'vo.bing.booski.shot.tony.1',
    'vo.bing.hang.eric.shawarma.1', 'vo.bing.hang.eric.shawarma.2',
    'vo.bing.hang.irish.gift.1', 'vo.bing.hang.irish.gift.2',
  ];
  const unwired = mustBeWired.filter((cue) => !wired.includes(cue));
  const unauthored = wired.filter((cue) => !authored.has(cue));
  check('every recorded bark in the club’s bank is hooked to something',
    unwired.length === 0, unwired.join(' / '));
  check('and no line names a cue that is not in the manifest',
    unauthored.length === 0, unauthored.slice(0, 3).join(' / '));
  const louBrief = [...Array(10)].map((_, i) => `vo.bing.lou.brief.${i + 1}`);
  const louBrief2 = [...Array(6)].map((_, i) => `vo.bing.lou.brief2.${i + 1}`);
  check('Lou’s live office brief is wired and both brief banks are authored',
    louBrief.every((c) => authored.has(c) && wired.includes(c))
      && louBrief2.every((c) => authored.has(c)),
    `${louBrief.length} + ${louBrief2.length}`);
  check('the stage and Margo retain their authored cue banks',
    ['vo.bing.stage.1', 'vo.bing.stage.2'].every((c) => authored.has(c))
      && [...Array(6)].map((_, i) => `vo.bing.margo.${i + 1}`).every((c) => authored.has(c))
      && authored.has('vo.bing.margo.1b'),
    'stage 2, margo 7');
}

/* Tony's own lines, one at a time, through the exact-name path -- and none
 * of them cut off by the line that follows. The hold a reply gets is now at
 * least as long as the recording it plays, which is the fix. */
const tonyLines = await page.evaluate(() => {
  const b = window.__bing;
  const secs = (n) => (b.audio.buffers.get(n)?.[0]?.duration ?? 0);
  const runs = [];
  const cases = [
    ['lag', 'open', 'vo.bing.hang.lag.tony.1'],
    ['gratin', 'more', 'vo.bing.hang.gratin.tony.1'],
    ['hogmama', 'more', 'vo.bing.hang.hogmama.tony.1'],
    ['irish', 'more', 'vo.bing.hang.irish.tony.1'],
    ['captain_lou_sasole', 'more', 'vo.bing.hang.sasole.tony.1'],
  ];
  for (const [id, at, cue] of cases) {
    const npc = b.family.byId[id];
    if (!npc) { runs.push({ id, cue, missing: true }); continue; }
    b.player.position.set(npc.group.position.x + 0.9, 1.66, npc.group.position.z + 0.5);
    b.game.voLog.length = 0;
    b.dialogue.start(b.familyScripts[id], 'open', npc, { resume: false });
    if (at === 'more') {
      b.dialogue.choose(0);
      for (let i = 0; i < 80 && b.dialogue.nodeId !== 'more'; i++) {
        b.dialogue.update(0.25, b.player.position);
      }
    }
    const picked = b.dialogue.choose(0);
    runs.push({
      id,
      cue,
      picked,
      spoke: b.game.voLog.includes(cue),
      loaded: +secs(cue).toFixed(2),
      hold: +b.dialogue.timer.toFixed(2),
      uncut: b.dialogue.timer >= secs(cue),
    });
    b.dialogue.end('done');
  }
  return runs;
});
check('every one of Tony’s authored replies plays, and none of them is cut off',
  tonyLines.length === 5 && tonyLines.every((r) => r.picked && r.spoke && r.loaded > 0 && r.uncut),
  JSON.stringify(tonyLines));

const irishGift = await page.evaluate(() => {
  const b = window.__bing;
  b.game.irishGifted = false;
  b.game.money = 340;
  const node = b.familyScripts.irish.gift;
  node.enter();
  const afterFirst = b.game.money;
  node.enter();
  return {
    afterFirst,
    afterSecond: b.game.money,
    gifted: b.game.irishGifted,
    cue: node.cue,
    continuesTo: b.familyScripts.irish.giftReason.next,
  };
});
check('Irish gives exactly $100 on the first conversation of Bing One',
  irishGift.afterFirst === 440
    && irishGift.afterSecond === 440
    && irishGift.gifted
    && irishGift.cue === 'vo.bing.hang.irish.gift.1'
    && irishGift.continuesTo === 'open',
  JSON.stringify(irishGift));

/* ---- 11, 12: the bottom of the screen ---- */
const talkUi = await page.evaluate(async () => {
  const b = window.__bing;
  const gratin = b.family.byId.gratin;
  /* On his feet beside Gratin. The frame loop runs during the await below and
   * would otherwise put a seated player straight back in his car. */
  b.game.seatedIn = null;
  b.player.mode = 'walk';
  b.player._tween = null;
  b.player.yawCenter = null;
  b.player.position.set(gratin.group.position.x - 1.2, 1.66, gratin.group.position.z);
  b.dialogue.start(b.familyScripts.gratin, 'open', gratin, { resume: false });
  b.hud.say('A patron says something you were not part of.', 6000);
  await new Promise((r) => setTimeout(r, 260));
  const box = document.getElementById('dialogue').getBoundingClientRect();
  const sub = document.getElementById('subtitle').getBoundingClientRect();
  const overlapping = !(sub.bottom <= box.top || sub.top >= box.bottom);
  const talking = document.body.classList.contains('talking');
  const talkH = getComputedStyle(document.documentElement).getPropertyValue('--talk-h');
  const subBottom = getComputedStyle(document.getElementById('subtitle')).bottom;
  const optionsUp = !document.querySelector('#dialogue .options').classList.contains('hidden');
  // Now walk out of reach without leaving the conversation's range entirely.
  b.player.position.set(gratin.group.position.x - 5.0, 1.66, gratin.group.position.z);
  b.dialogue.update(0.05, b.player.position);
  const afterStep = {
    active: b.dialogue.active,
    optionsHidden: document.querySelector('#dialogue .options').classList.contains('hidden'),
    refused: b.dialogue.choose(0) === false,
  };
  // And right out of it.
  b.player.position.set(gratin.group.position.x - 12, 1.66, gratin.group.position.z);
  b.dialogue.update(0.05, b.player.position);
  const gone = {
    active: b.dialogue.active,
    hidden: document.getElementById('dialogue').classList.contains('hidden'),
    talking: document.body.classList.contains('talking'),
    bookmarked: b.dialogue._bookmarks.get(b.familyScripts.gratin) === 'open',
  };
  return {
    overlapping, talking, optionsUp, afterStep, gone,
    box: [Math.round(box.top), Math.round(box.bottom), Math.round(box.height)],
    sub: [Math.round(sub.top), Math.round(sub.bottom)],
    talkH,
    subBottom,
  };
});
check('a conversation and a background subtitle never share the same pixels',
  talkUi.talking && talkUi.optionsUp && !talkUi.overlapping,
  JSON.stringify(talkUi));
check('stepping out of reach takes the replies down and leaves the bookmark',
  talkUi.afterStep.active && talkUi.afterStep.optionsHidden && talkUi.afterStep.refused
    && !talkUi.gone.active && talkUi.gone.hidden && !talkUi.gone.talking
    && talkUi.gone.bookmarked,
  JSON.stringify(talkUi));

/* ---- rear-hall gallery ---- */
const hallwayGallery = await page.evaluate(async () => {
  const b = window.__bing;
  await b.club.artReady;
  const T = b.THREE;
  const H = b.club.rooms.hallway;
  const boxOf = (o) => { o.updateMatrixWorld(true); return new T.Box3().setFromObject(o); };
  return b.club.anchors.hallwayPortraitArt.map((art) => {
    const box = boxOf(art);
    return {
      ...art.userData.art,
      x: Number(art.getWorldPosition(new T.Vector3()).x.toFixed(3)),
      z: Number(art.getWorldPosition(new T.Vector3()).z.toFixed(3)),
      wallBound: box.min.z >= H.z0 && box.max.z <= H.z1,
    };
  });
});
check('the twelve supplied Family portraits make the rear-hall gallery to Lou’s office',
  hallwayGallery.length === 12
    && hallwayGallery.every((portrait) => portrait.real && portrait.wallBound)
    && hallwayGallery.map((portrait) => portrait.file).join(',')
      === 'bing-hallway-uncle-lou.png,bing-hallway-rippinflow.png,bing-hallway-booskibro.png,bing-hallway-shubenator.png,family-portrait-sauce.webp,family-portrait-lag.webp,family-portrait-hogmama.webp,family-portrait-ape.webp,family-portrait-eric.webp,family-portrait-irish.webp,family-portrait-seff.webp,family-portrait-deathmegatron.webp',
  JSON.stringify(hallwayGallery));

/* ---- 14 to 21: Lou's office ---- */
const office = await page.evaluate(async () => {
  const b = window.__bing;
  // The club's borrowed art resolves off the manifest after the room is built.
  await b.club.artReady;
  const T = b.THREE;
  const O = b.club.rooms.office;
  const boxOf = (o) => { o.updateMatrixWorld(true); return new T.Box3().setFromObject(o); };
  const shore = boxOf(b.club.office.shorePicture);
  const bingPicture = boxOf(b.club.office.bingPicture);
  // The office's own north wall, which THE OLD PLACE used to be inside
  const oldPlace = (() => {
    let hit = null;
    b.club.root.traverse((o) => {
      if (o.name !== 'frame') return;
      const bb = boxOf(o);
      if (bb.min.x > 7.8 && bb.max.x < 8.1 && bb.max.z > O.z1 - 1.0) hit = bb;
    });
    return hit;
  })();
  const ledge = boxOf(b.club.office.ledge);
  const radio = boxOf(b.club.root.getObjectByName('office-radio'));
  const intercom = boxOf(b.club.office.intercom);
  const on = (thing) => thing.min.x >= ledge.min.x - 0.06 && thing.max.x <= ledge.max.x + 0.06
    && thing.min.z >= ledge.min.z - 0.02 && thing.max.z <= ledge.max.z + 0.02
    && Math.abs(thing.min.y - ledge.max.y) < 0.06;
  let fridgeStickers = 0;
  b.club.office.fridge.traverse((o) => { if (o.isMesh && o.material?.map) fridgeStickers += 1; });
  let drawerParts = 0;
  b.club.office.filing.traverse((o) => { if (o.isMesh) drawerParts += 1; });
  const coat = boxOf(b.club.office.coatStand);
  const doorArc = { x0: 7.85, x1: 9.05, z0: -8.05, z1: -6.45 };

  /* ---- the owner's four office moves, measured against the room's own wall
   * planes (club.office.walls) rather than against remembered numbers ---- */
  const W = b.club.office.walls;
  const filing = boxOf(b.club.office.filing);
  const lamp = boxOf(b.club.root.getObjectByName('floor-lamp'));
  const crest = boxOf(b.club.office.logos[0]);
  const shield = boxOf(b.club.office.logos[1]);
  const shieldArt = boxOf(b.club.office.logoArt[1]);
  let bingPictureArt = null;
  b.club.office.bingPicture.traverse((o) => {
    if (o.userData?.art?.slot === 'bing.office.squatches_bing') bingPictureArt = o;
  });
  const bingPictureArtBox = boxOf(bingPictureArt);
  const louDoorway = b.club.doors.lou.box;
  // The two photographs on the door wall, in wall order: THE NEPHEWS, then
  // THE OLD PLACE. Everything hung on that wall shares its x, so z sorts them.
  const wallPictures = [];
  b.club.root.traverse((o) => {
    if (o.name !== 'frame') return;
    const bb = boxOf(o);
    if (bb.min.x < 7.8 || bb.max.x > 8.1) return;
    /* The two 0.26 photographs top out at 2.065m. The correctly-proportioned
     * crest over the filing cabinet now tops out at 2.035m, so keep this
     * selector on the photographs instead of counting every small frame. */
    if (bb.max.y < 2.04 || bb.max.y > 2.1) return;
    wallPictures.push(bb);
  });
  wallPictures.sort((a, c) => a.min.z - c.min.z);
  const glassEdge = (b.club.doors.lou.glass || [])
    .reduce((z, pane) => Math.max(z, boxOf(pane).max.z), -Infinity);
  return {
    walls: W,
    // 1. THE NEPHEWS: off the door's glazing, still left of THE OLD PLACE
    pictures: wallPictures.length,
    nephewsOffTheGlass: wallPictures.length === 2
      && wallPictures[0].min.z > glassEdge + 0.02,
    nephewsGap: wallPictures.length === 2
      ? +(wallPictures[1].min.z - wallPictures[0].max.z).toFixed(3) : -1,
    // 2. the filing cabinet, backed into the north-west corner
    filingOffNorth: +(filing.min.z - W.north).toFixed(3),
    filingOffWest: +(filing.min.x - W.west).toFixed(3),
    // 3. the standard lamp, beside it and off the walking line
    lampOffNorth: +(lamp.min.z - W.north).toFixed(3),
    lampBesideFiling: +(lamp.min.x - filing.max.x).toFixed(3),
    lampOutOfTheDoorLine: lamp.max.z < louDoorway.min.z,
    // 4. the crest, out of the doorway and over the cabinet
    crestOutOfTheDoorway: crest.max.z < louDoorway.min.z,
    crestOverFiling: crest.min.z > filing.min.z - 0.06 && crest.max.z < filing.max.z + 0.06
      && crest.min.y > filing.max.y,
    crestOnTheWall: +(crest.min.x - W.west).toFixed(3),
    shoreBehindLou: shore.max.z < O.z0 + 0.4 && shore.min.x > 10.5,
    bingPictureFramedBehindLou: bingPicture.max.z < O.z0 + 0.4
      && bingPicture.min.x > shore.max.x + 0.12
      && bingPicture.max.y < 2.2
      && bingPicture.min.y > 1.3
      && bingPicture.min.z > W.north,
    bingPictureArt: {
      real: bingPictureArt?.userData?.art?.real === true,
      aspect: +((bingPictureArtBox.max.x - bingPictureArtBox.min.x)
        / (bingPictureArtBox.max.y - bingPictureArtBox.min.y)).toFixed(3),
    },
    shieldFit: {
      artAspect: +((shieldArt.max.x - shieldArt.min.x)
        / (shieldArt.max.y - shieldArt.min.y)).toFixed(3),
      landscapeFrame: (shield.max.x - shield.min.x) > (shield.max.y - shield.min.y) * 1.4,
      inFrontOfWall: shield.min.z > W.north,
    },
    officeLogoArt: b.club.office.logoArt.map((art) => {
      const src = art?.material?.map?.image?.src || art?.material?.map?.image?.currentSrc || '';
      return { slot: art?.userData?.art?.slot ?? null, real: art?.userData?.art?.real === true, file: src.split('/').pop() };
    }),
    oldPlaceClear: !!oldPlace && oldPlace.max.z < O.z1 - 0.2,
    logos: b.club.office.logos.length,
    ledgeLong: +(ledge.max.z - ledge.min.z).toFixed(2),
    radioOnLedge: on(radio),
    intercomOnLedge: on(intercom),
    intercomParts: (() => { let n = 0; b.club.office.intercom.traverse((o) => { if (o.isMesh) n += 1; }); return n; })(),
    fridgeBlack: (() => {
      let dark = false;
      b.club.office.fridge.traverse((o) => {
        if (o.isMesh && o.material?.color && o.material.color.getHex() < 0x303040) dark = true;
      });
      return dark;
    })(),
    fridgeStickers,
    /* The two stickers are the flat's own images off assets/art, not the
     * drawn stand-ins: real art, a file behind it, alpha kept (die-cut vinyl
     * has no rectangle round it) and both still on the door. */
    stickerArt: Object.entries(b.club.office.fridgeStickers).map(([name, mesh]) => {
      const bb = boxOf(mesh);
      const fridge = boxOf(b.club.office.fridge);
      const src = mesh.material.map?.image?.src || mesh.material.map?.image?.currentSrc || '';
      return {
        name,
        slot: mesh.userData.art?.slot ?? null,
        real: mesh.userData.art?.real === true,
        file: src.split('/').pop(),
        cut: mesh.material.transparent === true && mesh.material.alphaTest > 0,
        onTheDoor: bb.min.x >= fridge.min.x && bb.max.x <= fridge.max.x
          && bb.min.y >= fridge.min.y && bb.max.y <= fridge.max.y,
      };
    }),
    drawerParts,
    floorLamp: b.club.office.floorLamp?.intensity ?? 0,
    deskLamp: b.club.office.deskLight.intensity,
    coatOutOfTheDoor: coat.min.x > doorArc.x1 || coat.max.z > doorArc.z1 || coat.min.z < doorArc.z0,
    coatParts: (() => { let n = 0; b.club.office.coatStand.traverse((o) => { if (o.isMesh) n += 1; }); return n; })(),
    overcoat: (() => {
      const garment = b.club.office.coatStand.getObjectByName('spare-overcoat');
      let parts = 0;
      garment?.traverse((o) => { if (o.isMesh) parts += 1; });
      return {
        parts,
        taperedBody: garment?.getObjectByName('coat-body')?.geometry?.type === 'CylinderGeometry',
        sleeves: ['coat-sleeve-left', 'coat-sleeve-right']
          .every((name) => !!garment?.getObjectByName(name)),
      };
    })(),
    glass: (b.club.doors.lou.glass || []).length,
    glassSolid: b.club.colliders.some((c) => c.min.x > 7.7 && c.max.x < 7.9 && c.min.z < -7.6),
  };
});
check('the shore picture hangs on the wall behind Lou',
  office.shoreBehindLou, JSON.stringify(office.shoreBehindLou));
check('the Silver Sasquatches Bada Bing portrait is framed beside Lou\'s desk without crowding the shore picture',
  office.bingPictureFramedBehindLou && office.bingPictureArt.real
    && Math.abs(office.bingPictureArt.aspect - (4 / 3)) < 0.02,
  JSON.stringify({ placed: office.bingPictureFramedBehindLou, art: office.bingPictureArt }));
check('THE OLD PLACE is out of the wall it was clipped into',
  office.oldPlaceClear);
check('two framed apartment Silver Sasquatches marks hang in the office',
  office.logos === 2
    && office.officeLogoArt.length === 2
    && office.officeLogoArt.every((logo) => logo.real)
    && office.officeLogoArt.some((logo) => logo.slot === 'bing.office.logo.crest' && logo.file === 'logo-crest.png')
    && office.officeLogoArt.some((logo) => logo.slot === 'bing.office.logo.shield' && logo.file === 'logo-shield.jpg'),
  JSON.stringify(office.officeLogoArt));
check('the shield behind Lou uses the supplied photo\'s landscape proportions and clears the wall',
  office.shieldFit.landscapeFrame && office.shieldFit.inFrontOfWall
    && Math.abs(office.shieldFit.artAspect - (1000 / 598)) < 0.02,
  JSON.stringify(office.shieldFit));
check('the ledge is long enough for the radio and the intercom, and both stand on it',
  office.ledgeLong > 2.4 && office.radioOnLedge && office.intercomOnLedge
    && office.intercomParts >= 16,
  JSON.stringify({ len: office.ledgeLong, r: office.radioOnLedge, i: office.intercomOnLedge }));
check('the mini fridge is black, detailed and has all three stickers',
  office.fridgeBlack && office.fridgeStickers >= 3, `${office.fridgeStickers} stickers`);
check('all three fridge stickers are real artwork, die-cut, not drawn stand-ins',
  office.stickerArt.length === 3
    && office.stickerArt.every((s) => s.real && s.cut && s.onTheDoor && /\.(png|jpe?g)$/i.test(s.file))
    && office.stickerArt.some((s) => s.slot === 'sticker.fridge' && s.file === 'sticker-pinup.png')
    && office.stickerArt.some((s) => s.slot === 'crest.round' && s.file === 'logo-crest.png')
    && office.stickerArt.some((s) => s.slot === 'bing.office.fridge.sticker.toy' && s.file === 'lou-office-fridge-toy.png'),
  JSON.stringify(office.stickerArt));
check('the filing cabinet has drawer fronts and the corner has a lamp in it',
  office.drawerParts >= 18 && office.floorLamp > 0 && office.floorLamp < 8,
  `${office.drawerParts} parts, lamp ${office.floorLamp}`);
check('the coat stand carries a shaped overcoat instead of a black box, and stays out of the doorway',
  office.coatParts >= 12 && office.coatOutOfTheDoor
    && office.overcoat.parts >= 9 && office.overcoat.taperedBody && office.overcoat.sleeves,
  JSON.stringify(office.overcoat));
check('the office door is glazed and the glass is solid',
  office.glass === 3 && office.glassSolid, `${office.glass} panes`);

/* ---- the owner's four moves in Lou's office ----
 * Each one measured against the wall or the corner it belongs to, off
 * club.office.walls, so "against the wall" is a number and not an opinion. */
check('THE NEPHEWS has come left off the door’s glazing, with wall either side of it',
  office.pictures === 2 && office.nephewsOffTheGlass && office.nephewsGap > 0.15,
  JSON.stringify({ clear: office.nephewsOffTheGlass, gap: office.nephewsGap }));
check('the filing cabinet is backed into the north-west corner, touching both walls',
  office.filingOffNorth >= 0 && office.filingOffNorth <= 0.03
    && office.filingOffWest >= 0 && office.filingOffWest <= 0.03,
  `north ${office.filingOffNorth}m, west ${office.filingOffWest}m`);
check('the standard lamp stands beside the cabinet against the same wall, out of the door line',
  office.lampOffNorth >= 0 && office.lampOffNorth <= 0.04
    && office.lampBesideFiling > 0 && office.lampBesideFiling < 0.3
    && office.lampOutOfTheDoorLine,
  `north ${office.lampOffNorth}m, gap ${office.lampBesideFiling}m`);
check('the crest is out of the doorway and hangs over the filing cabinet',
  office.crestOutOfTheDoorway && office.crestOverFiling
    && office.crestOnTheWall >= 0 && office.crestOnTheWall < 0.05,
  JSON.stringify({ door: office.crestOutOfTheDoorway, over: office.crestOverFiling, off: office.crestOnTheWall }));

/* ---- 20: the lamp bloom, measured off a real render ----
 * The Silver Room's pass set this pattern: render the frame, read the
 * back buffer, and count the pixels that have gone to white. A desk lamp
 * that clips a percent of the screen is a desk lamp that is too hot. */
const bloom = await page.evaluate(async () => {
  const b = window.__bing;
  b.postfx.enable?.();
  const O = b.club.rooms.office;
  b.game.seatedIn = null;
  b.player.mode = 'walk';
  b.player._tween = null;
  b.player.yawCenter = null;
  // Standing in the office doorway looking straight at the desk and its lamp.
  b.player.position.set(9.2, 1.66, -6.2);
  b.player.yaw = Math.atan2(-(12.08 - 9.2), -(-8.1 + 6.2));
  b.player.pitch = -0.16;
  b.player.update(0.016);
  b.camera.updateMatrixWorld(true);
  for (let i = 0; i < 4; i++) b.postfx.render(0.016);
  await new Promise((r) => requestAnimationFrame(r));
  const gl = b.renderer.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let clipped = 0;
  let hot = 0;
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const bl = px[i * 4 + 2];
    if (r > 250 && g > 250 && bl > 250) clipped += 1;
    if (r > 235 && g > 220) hot += 1;
  }
  void O;
  return {
    pixels: w * h,
    clippedPct: +((clipped / (w * h)) * 100).toFixed(3),
    hotPct: +((hot / (w * h)) * 100).toFixed(3),
    lamp: b.club.office.deskLight.intensity,
  };
});
check('the desk lamp no longer blows the office out — measured, not asserted',
  bloom.clippedPct < 0.2 && bloom.hotPct < 4 && bloom.lamp <= 9,
  JSON.stringify(bloom));

/* ---- 22, 23, 31, 32: the back of house ---- */
const backOfHouse = await page.evaluate(() => {
  const b = window.__bing;
  const T = b.THREE;
  const boxOf = (o) => { o.updateMatrixWorld(true); return new T.Box3().setFromObject(o); };
  const B = b.club.rooms.bathroom;
  const toilets = [];
  b.scene.traverse((o) => {
    if (o.name !== 'toilet') return;
    const p = new T.Vector3();
    o.getWorldPosition(p);
    if (p.x < B.x0 || p.x > B.x1 || p.z < -1.4 || p.z > B.z1) return;
    toilets.push(boxOf(o));
  });
  // Every stall partition in the men's room, against every bowl in it.
  const partitions = [];
  b.club.root.traverse((o) => {
    if (!o.isMesh || o.name) return;
    const bb = boxOf(o);
    const thin = bb.max.x - bb.min.x < 0.1;
    if (!thin) return;
    if (bb.min.x < B.x0 || bb.max.x > B.x1) return;
    if (bb.min.z < -1.4 || bb.max.z > B.z1) return;
    if (bb.max.y < 1.5 || bb.max.y > 2.1) return;
    partitions.push(bb);
  });
  const clash = partitions.some((w) => toilets.some((t) => w.intersectsBox(t)));
  const stallDoors = b.club.anchors.stalls.map((st) => {
    const leaf = boxOf(st.pivot);
    return { locked: st.locked, hits: toilets.some((t) => leaf.intersectsBox(t)) };
  });
  const graffiti = (() => {
    let hit = null;
    b.club.root.traverse((o) => {
      if (o.isMesh && o.material?.map?.image?.width === 512 && o.geometry?.type === 'PlaneGeometry'
        && o.position.x < B.x0 + 0.02 && o.position.x > B.x0 - 0.1) hit = boxOf(o);
    });
    return hit;
  })();
  const dryer = boxOf(b.club.root.getObjectByName('hand-dryer'));
  const body = boxOf(b.club.storeroom.body);
  const urinalBackplates = [];
  const bodyParts = [];
  b.club.root.traverse((o) => {
    if (o.name === 'urinal-backplate') urinalBackplates.push(boxOf(o));
    if (/^(tarp-|body-)/.test(o.name || '')) bodyParts.push(o.name);
  });
  const bathroomPicture = b.club.anchors.bathroomPicture;
  const bathroomPictureBox = boxOf(bathroomPicture);
  let bathroomPictureArt = null;
  bathroomPicture.traverse((o) => {
    if (o.userData?.art?.slot === 'bing.bathroom.anime4') bathroomPictureArt = o;
  });
  const bathroomPictureSrc = bathroomPictureArt?.material?.map?.image?.src
    || bathroomPictureArt?.material?.map?.image?.currentSrc || '';
  const bathroomPictureArtBox = boxOf(bathroomPictureArt);
  const powder = b.club.anchors.powderMesh;
  const powderLine = powder?.getObjectByName('urinal-line');
  const powderCard = powder?.getObjectByName('urinal-line-card');
  const eastWallFace = B.x1 - 0.125;
  return {
    toilets: toilets.length,
    partitions: partitions.length,
    partitionClash: clash,
    lockedStallClean: stallDoors.every((d) => !d.hits),
    lockedExists: stallDoors.some((d) => d.locked),
    graffitiFitsWall: !!graffiti && graffiti.min.z > 1.5 && graffiti.max.z < B.z1,
    dryerOffTheSign: !!graffiti && (dryer.min.x > B.x0 + 1.0 || dryer.max.z < graffiti.min.z),
    dryerByTheSinks: dryer.max.x > B.x1 - 0.6 && dryer.min.z > -0.9 && dryer.max.z < 1.4,
    basins: (() => { let n = 0; b.club.root.traverse((o) => { if (o.name === 'basin') n += 1; }); return n; })(),
    basinParts: (() => {
      let n = 0;
      b.club.root.traverse((o) => { if (o.name === 'basin') o.traverse((m) => { if (m.isMesh) n += 1; }); });
      return n;
    })(),
    urinals: (() => { let n = 0; b.club.root.traverse((o) => { if (o.name === 'urinal') n += 1; }); return n; })(),
    urinalParts: (() => {
      let n = 0;
      b.club.root.traverse((o) => { if (o.name === 'urinal') o.traverse((m) => { if (m.isMesh) n += 1; }); });
      return n;
    })(),
    urinalBackplates: urinalBackplates.map((plate) => ({
      depth: +(plate.max.x - plate.min.x).toFixed(3),
      flush: +Math.abs(plate.max.x - eastWallFace).toFixed(3),
      centerZ: +((plate.min.z + plate.max.z) / 2).toFixed(3),
    })).sort((a, c) => a.centerZ - c.centerZ),
    bodyInStoreRoom: body.min.x > 5.6 && body.max.x < 13.6 && body.min.z > -15 && body.max.z < -9.6,
    bodyLowProfile: +(body.max.y - body.min.y).toFixed(2),
    bodyParts,
    powderThere: !!b.club.root.getObjectByName('bathroom-powder'),
    powderHighlight: {
      linked: powder === b.club.root.getObjectByName('bathroom-powder'),
      line: !!powderLine,
      card: !!powderCard,
      emissive: powderLine?.material?.emissive?.getHex?.() ?? 0,
      intensity: powderLine?.material?.emissiveIntensity ?? 0,
    },
    bathroomPicture: {
      real: bathroomPictureArt?.userData?.art?.real === true,
      file: bathroomPictureSrc.split('/').pop(),
      aspect: +((bathroomPictureArtBox.max.x - bathroomPictureArtBox.min.x)
        / (bathroomPictureArtBox.max.y - bathroomPictureArtBox.min.y)).toFixed(3),
      onNorthWall: bathroomPictureBox.min.x > B.x0 && bathroomPictureBox.max.x < B.x1
        && bathroomPictureBox.min.z > B.z0 + 0.125 && bathroomPictureBox.min.y > 1.9,
    },
  };
});
check('the men’s room stalls no longer stand inside their own toilets',
  backOfHouse.toilets === 3 && backOfHouse.partitions >= 4
    && !backOfHouse.partitionClash && backOfHouse.lockedStallClean && backOfHouse.lockedExists,
  JSON.stringify(backOfHouse));
check('the Booski wall fits the wall it is painted on, clear of the dryer',
  backOfHouse.graffitiFitsWall && backOfHouse.dryerOffTheSign && backOfHouse.dryerByTheSinks);
check('the basins and the urinals have plumbing on them',
  backOfHouse.basins === 2 && backOfHouse.basinParts >= 24
    && backOfHouse.urinals === 2 && backOfHouse.urinalParts >= 16,
  JSON.stringify({ b: backOfHouse.basinParts, u: backOfHouse.urinalParts }));
check('urinal backplates stay thin against the tiled wall',
  backOfHouse.urinalBackplates.length === 2
    && backOfHouse.urinalBackplates.every((plate) => plate.depth <= 0.1 && plate.flush <= 0.005)
    && Math.abs(backOfHouse.urinalBackplates[0].centerZ - 1.53) < 0.01
    && Math.abs(backOfHouse.urinalBackplates[1].centerZ - 2.13) < 0.01,
  JSON.stringify(backOfHouse.urinalBackplates));
check('the supplied bathroom print is framed high on the wall',
  backOfHouse.bathroomPicture.real
    && backOfHouse.bathroomPicture.file === 'bing-bathroom-anime4.jpg'
    && backOfHouse.bathroomPicture.onNorthWall
    && Math.abs(backOfHouse.bathroomPicture.aspect - 1.5) < 0.02,
  JSON.stringify(backOfHouse.bathroomPicture));
check('the urinal line has a visible high-contrast treatment and a live interaction target',
  backOfHouse.powderThere && backOfHouse.powderHighlight.linked
    && backOfHouse.powderHighlight.line && backOfHouse.powderHighlight.card
    && backOfHouse.powderHighlight.emissive !== 0
    && backOfHouse.powderHighlight.intensity >= 0.7,
  JSON.stringify(backOfHouse.powderHighlight));
check('there is a man under a tarpaulin in the store room, and he is lying down',
  backOfHouse.bodyInStoreRoom && backOfHouse.bodyLowProfile < 0.5
    && ['tarp-shoulders', 'tarp-torso', 'body-hand', 'body-shoe-left', 'body-shoe-right']
      .every((part) => backOfHouse.bodyParts.includes(part)),
  JSON.stringify({ profile: backOfHouse.bodyLowProfile, parts: backOfHouse.bodyParts }));

/* ---- 24, 25, 27, 28, 30, 32: the things he could not reach ---- */
const punchHud = await page.evaluate(async () => {
  const b = window.__bing;
  const findPad = (label) => {
    let hit = null;
    b.scene.traverse((o) => {
      const d = o.userData?.interact;
      if (!d) return;
      const text = typeof d.label === 'function' ? d.label() : d.label;
      if (typeof text === 'string' && text.includes(label)) hit = d;
    });
    return hit;
  };
  const powder = findPad('urinal');
  const bodyPad = findPad('tarpaulin');

  /* The phone before he owns it: the readout is a readout, so a man with no
   * phone has no phone row and nothing to raise on [P]. Taken out of the
   * campaign by hand here -- this save has been through a night that recorded
   * the pickup, and the point of the check is what the HUD does with the
   * answer, either way. */
  b.campaign.update((state) => {
    state.inventory.carried = state.inventory.carried.filter((id) => id !== 'phone');
    state.inventory.concealed = state.inventory.concealed.filter((id) => id !== 'phone');
  });
  const noPhone = {
    carried: b.campaign.hasItem('phone'),
    kit: (() => {
      b.game.kitOpen = false;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI' }));
      return [...document.querySelectorAll('#kit li')].map((li) => li.textContent);
    })(),
    pocketHidden: document.getElementById('phone-pocket').classList.contains('hidden'),
    raised: (() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
      const up = !document.getElementById('phone-osd').classList.contains('hidden');
      if (up) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
      return up;
    })(),
  };

  // Inventory: pick the package up and watch the readout take it.
  b.campaign.addItem('parcel', { concealed: true });
  // The flat's record of the nightstand pickup, which is what the club reads.
  b.campaign.addItem('phone');
  b.game.money = 275;
  const before = document.querySelectorAll('#kit li').length;
  b.game.kitOpen = false;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI' }));
  const kit = [...document.querySelectorAll('#kit li')].map((li) => li.textContent);

  // The phone comes out on [P] and draws itself.
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));
  const phoneUp = !document.getElementById('phone-osd').classList.contains('hidden');
  const phoneCanvas = !!document.querySelector('#phone-osd canvas');
  const ringing = b.phone ? b.phone.ringing : null;
  b.phone.press(); // home -> messages
  b.phone.press(); // messages -> thread
  const threadBeforeWheel = b.phone.threads[b.phone.thread]?.id;
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, cancelable: true }));
  const threadAfterWheel = b.phone.threads[b.phone.thread]?.id;
  const phoneRead = b.phone.threads.find((thread) => thread.id === threadBeforeWheel)?.unread === false;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP' }));

  // Every physical phone uses the same connected-call contract. The club has
  // a DJ record, Lou's office loop and a campaign-backed physical car receiver.
  // The player is on foot here, so deliberately power that receiver for this
  // fixture without changing its persisted switch preference, then measure its
  // real 97.8 talk bed rather than the removed fake `car.radio` loop.
  const loopVolume = (key) => b.audio.loops.get(key)?.volume ?? null;
  const preferredBeforeFixture = b.carRadio.preferredOn;
  b.carRadio.turnOff({ remember: false });
  b.carRadio.turnOn({ remember: false });
  b.game.radioOn = true;
  const radioBefore = {
    receiverOn: b.carRadio.on,
    receiverDucked: b.carRadio.phoneDucked,
    receiverScale: b.carRadio.mixScale,
    preferred: b.carRadio.preferredOn,
    preferredBeforeFixture,
    club: loopVolume('music.club'),
    office: loopVolume('office.radio'),
    car: loopVolume('radio.talk'),
  };
  b.phone.ring({ from: 'TEST', vo: 'test', lines: ['Testing.'] });
  b.phone.answer();
  const radioDuring = {
    scale: b.game.phoneRadioScale,
    receiverOn: b.carRadio.on,
    receiverDucked: b.carRadio.phoneDucked,
    receiverScale: b.carRadio.mixScale,
    preferred: b.carRadio.preferredOn,
    club: loopVolume('music.club'),
    office: loopVolume('office.radio'),
    car: loopVolume('radio.talk'),
  };
  b.phone.hangUp();
  const radioAfter = {
    scale: b.game.phoneRadioScale,
    receiverOn: b.carRadio.on,
    receiverDucked: b.carRadio.phoneDucked,
    receiverScale: b.carRadio.mixScale,
    preferred: b.carRadio.preferredOn,
    club: loopVolume('music.club'),
    office: loopVolume('office.radio'),
    car: loopVolume('radio.talk'),
  };

  // The tip: money in the air, and the objective ticks.
  const tipPad = findPad('Tip the');
  b.game.money = 200;
  tipPad?.onUse?.();
  await new Promise((r) => setTimeout(r, 60));
  const bills = document.querySelectorAll('#money-burst .bill').length;

  const objectives = [...document.querySelectorAll('#objectives li')]
    .map((li) => ({ text: li.textContent, optional: li.classList.contains('optional'), rule: li.classList.contains('rule') }));
  const story = b.campaign.state.story;
  return {
    before,
    kit,
    noPhone,
    hasPackage: kit.some((t) => /package/i.test(t)),
    hasMoney: kit.some((t) => /\$/.test(t)),
    hasPhone: kit.some((t) => /Phone/.test(t)),
    phonePocket: !document.getElementById('phone-pocket').classList.contains('hidden'),
    phoneUp,
    phoneCanvas,
    ringing,
    threadBeforeWheel,
    threadAfterWheel,
    phoneRead,
    radioBefore,
    radioDuring,
    radioAfter,
    bills,
    objectives,
    clockDay: story.day,
    clockMinutes: story.timeMinutes,
    hudClock: document.querySelector('#clock .time')?.textContent ?? '',
    powder: !!powder,
    bodyPad: !!bodyPad,
    focusBefore: b.game.focus || 0,
  };
});
check('the club has one campaign-item readout, and it takes the package',
  punchHud.hasPackage && punchHud.hasMoney && !punchHud.hasPhone,
  JSON.stringify(punchHud.kit));
check('the phone comes out of the pocket in the club',
  punchHud.phoneUp && punchHud.phoneCanvas && punchHud.ringing === false,
  JSON.stringify({ up: punchHud.phoneUp, canvas: punchHud.phoneCanvas }));
check('the raised phone opens readable threads, marks the opened thread read, and navigates by wheel',
  !!punchHud.threadBeforeWheel && punchHud.threadBeforeWheel !== punchHud.threadAfterWheel && punchHud.phoneRead,
  JSON.stringify({ before: punchHud.threadBeforeWheel, after: punchHud.threadAfterWheel, read: punchHud.phoneRead }));
check('a connected club phone call ducks every radio/music source by 66 percent and restores them',
  punchHud.radioBefore.receiverOn
    && punchHud.radioBefore.receiverDucked === false
    && punchHud.radioBefore.receiverScale === 1
    && punchHud.radioDuring.receiverOn
    && punchHud.radioDuring.receiverDucked
    && punchHud.radioDuring.receiverScale === 0.34
    && punchHud.radioAfter.receiverOn
    && punchHud.radioAfter.receiverDucked === false
    && punchHud.radioAfter.receiverScale === 1
    && punchHud.radioBefore.preferred === punchHud.radioBefore.preferredBeforeFixture
    && punchHud.radioDuring.preferred === punchHud.radioBefore.preferredBeforeFixture
    && punchHud.radioAfter.preferred === punchHud.radioBefore.preferredBeforeFixture
    && punchHud.radioDuring.scale === 0.34
    && punchHud.radioAfter.scale === 1
    && ['club', 'office', 'car'].every((key) => {
      const before = punchHud.radioBefore[key];
      const during = punchHud.radioDuring[key];
      const after = punchHud.radioAfter[key];
      return before > 0
        && Math.abs(during / before - 0.34) < 0.001
        && Math.abs(after - before) < 0.001;
    }),
  JSON.stringify({ before: punchHud.radioBefore, during: punchHud.radioDuring, after: punchHud.radioAfter }));
/* The phone is a dedicated lower-right pocket, not a duplicate row printed
 * beneath the campaign card. It appears when carried, disappears when it is
 * not, and [P] answers to exactly the same state. */
check('the phone uses its own lower-right pocket — no phone carried, no pocket and nothing to raise',
  punchHud.noPhone.carried === false
    && !punchHud.noPhone.kit.some((t) => /Phone/.test(t))
    && punchHud.noPhone.pocketHidden
    && punchHud.noPhone.raised === false
    && !punchHud.hasPhone && punchHud.phonePocket && punchHud.phoneUp,
  JSON.stringify({ without: punchHud.noPhone, with: { kit: punchHud.kit, pocket: punchHud.phonePocket } }));
check('tipping the runway puts money in the air',
  punchHud.bills >= 6, String(punchHud.bills));
{
  const texts = punchHud.objectives.map((o) => o.text);
  const primary = punchHud.objectives.filter((o) => !o.optional && !o.rule).map((o) => o.text);
  const optional = punchHud.objectives.filter((o) => o.optional).map((o) => o.text);
  check('the objective card carries the three jobs and the optional evening',
    primary.some((t) => /Lou/.test(t))
      && primary.some((t) => /cute girl at the bar/.test(t))
      && primary.some((t) => /shot with Booski/.test(t))
      && optional.some((t) => /\d+\/\d+.*squatches/.test(t))
      && ['Play the slots', 'Play blackjack', 'Tip the performers', 'Order a drink from the bar']
        .every((want) => optional.some((t) => t.includes(want)))
      && punchHud.objectives.some((o) => o.rule),
    JSON.stringify(texts));
}
{
  /* The HUD must read back exactly what the campaign holds, and the campaign
   * must have been moved on by the drive over -- the club used to open at
   * whatever time the save last woke up, which was six in the morning. */
  const hour24 = Math.floor(punchHud.clockMinutes / 60) % 24;
  const expected = `${hour24 % 12 || 12}:${String(punchHud.clockMinutes % 60).padStart(2, '0')} `
    + `${hour24 >= 12 ? 'PM' : 'AM'}`;
  check('the club runs on campaign time, not on whatever time he woke up',
    punchHud.clockMinutes >= 23 * 60 + 41 && punchHud.hudClock === expected,
    `${punchHud.hudClock} vs ${expected} (day ${punchHud.clockDay}, ${punchHud.clockMinutes})`);
}

/* The wall clocks agree with the HUD, and the line on the urinal works. */
const clocksAndPowder = await page.evaluate(() => {
  const b = window.__bing;
  const story = b.campaign.state.story;
  const hour24 = Math.floor(story.timeMinutes / 60) % 24;
  const minute = story.timeMinutes % 60;
  const wantHour = -(((hour24 % 12) + minute / 60) / 12) * Math.PI * 2;
  const wantMin = -((minute % 60) / 60) * Math.PI * 2;
  const agree = b.club.clocks.every((c) => Math.abs(c.hourHand.rotation.z - wantHour) < 0.02
    && Math.abs(c.minHand.rotation.z - wantMin) < 0.02);
  let powderPad = null;
  b.scene.traverse((o) => {
    const d = o.userData?.interact;
    if (!d) return;
    const text = typeof d.label === 'function' ? d.label() : d.label;
    if (typeof text === 'string' && /urinal/.test(text)) powderPad = d;
  });
  powderPad?.onUse?.();
  const focus = b.game.focus;
  const fovBefore = b.camera.fov;
  for (let i = 0; i < 40; i++) b.game.focusTick?.(0.05);
  return {
    clocks: b.club.clocks.length,
    agree,
    focus,
    fovBefore,
    consumed: b.game.powderConsumed && !b.club.anchors.powderMesh?.parent,
  };
});
check('every clock on the wall reads the campaign clock',
  clocksAndPowder.clocks >= 2 && clocksAndPowder.agree,
  JSON.stringify(clocksAndPowder));
check('the line on the urinal is usable and buys twenty-odd seconds',
  clocksAndPowder.focus > 20 && clocksAndPowder.focus <= 26 && clocksAndPowder.consumed,
  JSON.stringify({ focus: clocksAndPowder.focus, consumed: clocksAndPowder.consumed }));

/* ---- 26: the hum and the static ----
 * The owner heard a loud hum and a hiss he assumed was rain. Both were
 * synthesised beds: a 52Hz club kick left at full level under a real record,
 * and `ambience.rain` -- which is rain you are standing IN -- turned down so
 * far indoors that all that survived of it was its top end. The bed drops
 * under the record, and the weather through the walls gets its own loop with
 * no highs in it at all, plus a manifest cue waiting for a recording. */
const beds = await page.evaluate(() => {
  const b = window.__bing;
  b.game.seatedIn = null;
  b.player.mode = 'walk';
  b.player._tween = null;
  b.player.position.set(-8, 1.66, 4);
  b.updateZones(0.016);
  const vol = (k) => b.audio.loops.get(k)?.volume ?? null;
  return {
    started: [...b.audio.loops.keys()].filter((k) => /rain|club|crowd/.test(k)),
    muffled: vol('ambience.bing.rain.muffled'),
    bed: vol('ambience.club'),
    record: vol('music.club'),
    crowd: vol('ambience.crowd'),
    clubRecord: b.game.clubRecord,
    standingIn: vol('ambience.rain'),
    acoustics: b.game.acoustics,
  };
});
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sfx', 'manifest.json'), 'utf8'));
  const cue = (manifest.sfx || []).find((c) => c.name === 'ambience.bing.rain.muffled');
  check('the rain you hear indoors is a muffled bed, not the top end of the outdoor one',
    beds.started.includes('ambience.bing.rain.muffled')
      && beds.muffled > 0 && beds.standingIn <= 0.006
      && !!cue && cue.loop === true && /muffled/i.test(cue.prompt || ''),
    JSON.stringify({ muffled: beds.muffled, outdoor: beds.standingIn, authored: !!cue }));
  check('the synthesised club bed sits under the real record instead of over it',
    beds.bed > 0 && beds.record > 0 && beds.bed < beds.record * 0.35
      && beds.crowd < 0.2,
    JSON.stringify({ bed: beds.bed, record: beds.record, crowd: beds.crowd }));
  const music = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'music', 'manifest.json'), 'utf8'));
  const clubSet = ['sallie-j.mp3', 'squatch-up.mp3', 'booskibro.mp3', 'squatches-in-the-house.mp3'];
  check('the first Bada Bing visit opens on Sallie J and every club record is registered',
    beds.clubRecord === 'sallie-j.mp3'
      && clubSet.every((file) => music.tracks.some((track) => track.file === file
        && track.venue === 'bada_bing')),
    JSON.stringify({ record: beds.clubRecord, clubSet }));
}

const requestSwitch = await page.evaluate(() => {
  const b = window.__bing;
  const beforeRecord = b.game.clubRecord;
  const beforeHandle = b.audio.loops.get('music.club');
  const switched = b.switchClubRecord({
    file: 'squatches-in-the-house.mp3',
    title: 'Squatches in the House',
    requested: true,
  }, { requested: true });
  return {
    beforeRecord,
    afterRecord: b.game.clubRecord,
    switched,
    handleReplaced: b.audio.loops.get('music.club') !== beforeHandle,
  };
});
await page.waitForFunction(() => {
  const handle = window.__bing.audio.loops.get('music.club');
  return handle?.streamed && handle.element?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    && !handle.element.paused;
}, null, {
  timeout: 30000,
});
requestSwitch.stream = await page.evaluate(() => {
  const handle = window.__bing.audio.loops.get('music.club');
  return {
    streamed: handle?.streamed === true,
    sourceOwnsElement: handle?.node?.mediaElement === handle?.element,
    hasDecodedBuffer: !!handle?.node?.buffer,
    paused: handle?.element?.paused ?? true,
    readyState: handle?.element?.readyState ?? 0,
    duration: handle?.element?.duration ?? 0,
  };
});
check('the DJ request replaces the live record with an audible Squatches in the House loop',
  requestSwitch.beforeRecord === 'sallie-j.mp3'
    && requestSwitch.afterRecord === 'squatches-in-the-house.mp3'
    && requestSwitch.switched
    && requestSwitch.handleReplaced
    && requestSwitch.stream.streamed
    && requestSwitch.stream.sourceOwnsElement
    && !requestSwitch.stream.hasDecodedBuffer
    && !requestSwitch.stream.paused
    && requestSwitch.stream.readyState >= 2
    && requestSwitch.stream.duration > 0,
  JSON.stringify(requestSwitch));

/* ---- 29: Margo, on her stool and wearing her own head ---- */
const her = await page.evaluate(() => {
  const b = window.__bing;
  const npc = b.cast.byName.margo;
  if (!npc) return null;
  npc.group.updateMatrixWorld(true);
  const bb = new b.THREE.Box3().setFromObject(npc.group);
  let authored = 0;
  npc.group.traverse((o) => { if (/^margo\./.test(o.name)) authored += 1; });
  let soft = 0;
  npc.group.traverse((o) => { if (/^person\.soft\./.test(o.name)) soft += 1; });
  return {
    id: npc.characterId,
    floor: +bb.min.y.toFixed(3),
    authored,
    soft,
    profile: npc.group.userData.npc,
  };
});
check('the woman at the end of the bar is Margo, on the stool and not in it',
  her && her.id === 'margo' && her.floor > 0.18 && her.floor < 0.42
    && her.authored >= 20 && her.soft >= 10
    && her.profile.gender === 'female' && her.profile.bodyShape === 'curvy',
  JSON.stringify(her));

/* ---- 33: the mark by the entrance is the real one ----
 * Not "is there a picture there" but "is the squatch actually drawn on it".
 * squatchArt() renders drawSquatchSilhouette into a canvas, so the proof is
 * in the pixels: a wide, solid band of ink across the shoulders at the
 * height the silhouette puts them, which a letter or a star cannot fake. */
const entrance = await page.evaluate(() => {
  const b = window.__bing;
  const T = b.THREE;
  const marked = [];
  const inkRun = (canvas) => {
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return 0;
    /* The widest unbroken run of ink anywhere across the figure's half of
     * the plate. A band rather than one row, because squatchArt drops the
     * silhouette lower when there is no footer under it -- and a shoulder
     * line on one layout is a forehead on the other. Nothing set in type
     * runs a sixth of a plate wide without a gap; a pair of shoulders does. */
    let best = 0;
    for (let f = 0.45; f <= 0.86; f += 0.04) {
      const y = Math.min(canvas.height - 1, Math.round(canvas.height * f));
      const row = g.getImageData(0, y, canvas.width, 1).data;
      // The plate's own background is the first pixel; ink is anything else.
      const bg = [row[0], row[1], row[2]];
      let run = 0;
      for (let x = 0; x < canvas.width; x++) {
        const d = Math.abs(row[x * 4] - bg[0]) + Math.abs(row[x * 4 + 1] - bg[1])
          + Math.abs(row[x * 4 + 2] - bg[2]);
        if (d > 40) { run += 1; if (run > best) best = run; } else run = 0;
      }
    }
    return best / canvas.width;
  };
  const scan = (root, tag) => {
    root.traverse((o) => {
      const img = o.isMesh && o.material?.map?.source?.data;
      if (!img || !img.getContext) return;
      const p = new T.Vector3();
      o.getWorldPosition(p);
      // The vestibule's wall of stars and the pair flanking the club doors.
      if (p.z < 10 || p.z > 15) return;
      const run = inkRun(img);
      if (run > 0.12) marked.push({ tag, z: +p.z.toFixed(2), run: +run.toFixed(2) });
    });
  };
  scan(b.club.root, 'club');
  return { marked };
});
check('the pictures by the entrance carry the real squatch mark, drawn not lettered',
  entrance.marked.length >= 5, JSON.stringify(entrance.marked.slice(0, 8)));

check('nothing threw on the way round', problems.length === 0, problems.slice(0, 3).join(' / '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
