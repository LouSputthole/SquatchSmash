#!/usr/bin/env node
/**
 * Cheap project sanity check: parse every source file and every manifest.
 *
 *   npm run check
 *
 * There is no build step and no test framework here; this catches the class of
 * mistake that would otherwise only show up as a blank screen in the browser.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

let failures = 0;
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failures++; };

/* ---- syntax ---- */
const sources = [
  ...walk(path.join(ROOT, 'src')),
  ...walk(path.join(ROOT, 'tools')),
  ...walk(path.join(ROOT, 'game', 'src')),
  ...walk(path.join(ROOT, 'game', 'tools')),
].filter((f) => /\.m?js$/.test(f));

console.log(`Parsing ${sources.length} source files…`);
for (const file of sources) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    fail(`${path.relative(ROOT, file)}\n${err.stderr?.toString().trim()}`);
  }
}

/* ---- browser verifiers must be safe to run in parallel ----
 * Each verifier owns a small local HTTP server. Duplicate defaults make an
 * otherwise green suite fail nondeterministically with EADDRINUSE when CI (or
 * an agent) runs independent scene checks concurrently.
 */
const verifierPorts = new Map();
for (const file of walk(path.join(ROOT, 'tools'))
  .filter((f) => /verify-[^\\/]+\.mjs$/.test(f))) {
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(/const PORT = Number\(process\.env\.PORT\) \|\| (\d+);/);
  if (!match) continue;
  const port = Number(match[1]);
  const previous = verifierPorts.get(port);
  if (previous) {
    fail(`${path.relative(ROOT, file)} and ${path.relative(ROOT, previous)} `
      + `both default to port ${port}`);
  } else {
    verifierPorts.set(port, file);
  }
}

/* ---- manifests ---- */
const manifests = [
  ['assets/sfx/manifest.json', (d) => Array.isArray(d.sfx) || 'missing "sfx" array'],
  ['assets/music/manifest.json', (d) => Array.isArray(d.tracks) || 'missing "tracks" array'],
  ['assets/art/manifest.json', (d) => Array.isArray(d.art) || 'missing "art" array'],
  ['assets/arcade/manifest.json', (d) => Array.isArray(d.images) || 'missing "images" array'],
  ['assets/sfx/index.json', (d) => Array.isArray(d.files) || 'missing "files" array'],
];

console.log(`Validating ${manifests.length} manifests…`);
for (const [rel, validate] of manifests) {
  const abs = path.join(ROOT, rel);
  try {
    const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const ok = validate(data);
    if (ok !== true) fail(`${rel}: ${ok}`);
  } catch (err) {
    fail(`${rel}: ${err.message}`);
  }
}

/* ---- wall slots referenced by the art manifest must exist ----
 * Read them straight out of their scene sources rather than keeping a second
 * list here, which would only ever drift out of date.
 */
const VALID_SLOTS = (() => {
  const slots = new Set();
  const sceneSources = [
    'src/world/apartment.js',
    'src/bing/club.js',
    'src/graveyard/world.js',
    'src/squatchfather/scenes/SquatchfatherScene.js',
  ].map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  for (const src of sceneSources) {
    for (const m of src.matchAll(/slot:\s*'([^']+)'/g)) slots.add(m[1]);
  /* Any `const SOMETHING_SLOTS = [ '…', '…' ]`, not one array by name. This
   * used to look for PROP_SLOTS specifically, so the first group of slots
   * added under a different name failed the build for existing rather than
   * for being wrong -- which is the drift this whole block exists to avoid. */
    for (const m of src.matchAll(/const \w*SLOTS = \[([^\]]*)\]/g)) {
      for (const s of m[1].matchAll(/'([^']+)'/g)) slots.add(s[1]);
    }
  }
  const bing = fs.readFileSync(path.join(ROOT, 'src/bing/club.js'), 'utf8');
  for (const m of bing.matchAll(/artSticker\([^,]+,\s*'([^']+)'/g)) slots.add(m[1]);
  return slots;
})();
if (VALID_SLOTS.size < 20) fail(`only found ${VALID_SLOTS.size} art slots in scene sources`);
try {
  const art = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/art/manifest.json'), 'utf8'));
  for (const entry of art.art || []) {
    if (entry.slot && !VALID_SLOTS.has(entry.slot)) {
      fail(`assets/art/manifest.json: unknown slot "${entry.slot}"`);
    }
    if (entry.file) {
      const p = path.join(ROOT, 'assets/art', entry.file);
      if (!fs.existsSync(p)) fail(`assets/art/manifest.json: "${entry.file}" not found`);
    }
  }
  const music = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/music/manifest.json'), 'utf8'));
  for (const t of music.tracks || []) {
    if (!t.file) fail('assets/music/manifest.json: a track is missing "file"');
    else if (!fs.existsSync(path.join(ROOT, 'assets/music', t.file))) {
      fail(`assets/music/manifest.json: "${t.file}" not found`);
    }
  }
  const arcade = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/arcade/manifest.json'), 'utf8'));
  const ids = new Set();
  for (const image of arcade.images || []) {
    if (!image.id) fail('assets/arcade/manifest.json: image is missing "id"');
    else if (ids.has(image.id)) fail(`assets/arcade/manifest.json: duplicate id "${image.id}"`);
    else ids.add(image.id);
    if (!image.file) fail(`assets/arcade/manifest.json: "${image.id || 'image'}" is missing "file"`);
    else if (!fs.existsSync(path.join(ROOT, 'assets/arcade', image.file))) {
      fail(`assets/arcade/manifest.json: "${image.file}" not found`);
    }
  }
} catch (err) {
  fail(err.message);
}

/* ---- every audio.say() group must have lines to say ---- */
// say() looks for cues named `vo.<group>.<n>` and returns false without a
// murmur when it finds none, so a mistyped or renamed group is a line that
// silently never plays again. Nothing else would ever tell you.
try {
  const sfxManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
  const voCues = sfxManifest.sfx.filter((c) => c.name.startsWith('vo.')).map((c) => c.name);
  for (const file of [
    'src/main.js',
    'src/world/apartment.js',
    'src/arcade/counter-squatch-guide.js',
  ]) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/audio\.say\(\s*'([^']+)'/g)) {
      const group = m[1];
      if (!voCues.some((n) => n.startsWith(`vo.${group}.`))) {
        fail(`${file}: audio.say('${group}') has no vo.${group}.* cue — it will never play`);
      }
    }
  }
  /* Same again for audio.play(), which is a different failure with the same
   * silence: play() falls through to the synth when a cue is not in the
   * manifest, so a cue that exists ONLY as a synth case still makes a noise
   * and is invisible to everything -- but generate-sfx reads the manifest, so
   * it can never be given a real recording. Two cues sat like that for several
   * commits before anyone counted them.
   *
   * Cues are allowed to be synth-only on purpose, so the manifest is the
   * authority and this only reports names that appear nowhere in it. */
  const allCues = new Set(sfxManifest.sfx.map((c) => c.name));
  /* Scan every scene rather than maintaining a list that silently misses new
   * games. The Bing and arcade once had live cue names that no generator or
   * manifest validation could see because this list had drifted. */
  const cueFiles = [];
  (function walkCues(dir) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) walkCues(`${dir}/${entry.name}`);
      else if (entry.name.endsWith('.js')) cueFiles.push(`${dir}/${entry.name}`);
    }
  })('src');
  for (const file of cueFiles) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const referencedCues = [
      ...[...src.matchAll(/(?:audio\??|missionAudio)\.play\(\s*'([^']+)'/g)]
        .map((match) => match[1]),
      ...[...src.matchAll(/(?:audio\??|missionAudio)\.startLoop\(\s*'([^']+)'(?:\s*,\s*\{([\s\S]*?)\})?/g)]
        .map((match) => match[2]?.match(/\bname\s*:\s*'([^']+)'/)?.[1] ?? match[1]),
    ];
    for (const cue of referencedCues) {
      if (!allCues.has(cue)) {
        fail(`${file}: referenced audio cue '${cue}' is not in assets/sfx/manifest.json `
          + '— it will fall through to the synth and can never be recorded');
      }
    }
  }

  {
    const script = await import('../src/heist/script.js');
    const missing = Object.values(script.HEIST_DIALOGUE)
      .filter((line) => !allCues.has(line.cue));
    if (missing.length) {
      fail(`${missing.length} THE TAKE line(s) have no manifest cue `
        + `(first: ${missing[0].cue}).`);
    }
    for (const zone of ['safehouse', 'bank', 'street', 'garage', 'driving']) {
      if (!allCues.has(`heist.ambience.${zone}`)) fail(`THE TAKE ambience missing for ${zone}`);
    }
  }

  /* The Beef Run derives its voice cue from the beat id and the line's index,
   * so no call site names a cue and the scan above cannot see any of them. A
   * line whose cue is missing from the manifest is a line that can never be
   * given a recording -- and because say() has no synth fallback, it is silent
   * either way, so nothing would ever draw attention to it. `npm run
   * vo:beefrun` is what puts them there. */
  {
    const script = await import('../src/beefrun/script.js');
    const orphans = script.allCues().filter((l) => !allCues.has(`vo.${l.cue}.1`));
    if (orphans.length) {
      fail(`${orphans.length} Beef Run line(s) have no cue in assets/sfx/manifest.json `
        + `(first: ${orphans[0].cue} — ${JSON.stringify(orphans[0].text)}). `
        + 'Run `npm run vo:beefrun`.');
    }
    // And the other way round, so a reworded line does not leave a cue behind
    // carrying words nobody says any more.
    const live = new Set(script.allCues().map((l) => `vo.${l.cue}.1`));
    const expected = new Map(script.allCues().map((line) => {
      const speaker = script.SPEAKERS[line.who] ?? script.SPEAKERS.SASOLE;
      return [`vo.${line.cue}.1`, {
        say: line.text,
        voice: speaker.voice ?? speaker.name.toLowerCase().replace(/\s+/g, '-'),
      }];
    }));
    const drifted = sfxManifest.sfx.filter((cue) => {
      const wanted = expected.get(cue.name);
      return wanted && (cue.say !== wanted.say || cue.voice !== wanted.voice);
    });
    if (drifted.length) {
      fail(`${drifted.length} Beef Run cue(s) have stale text or casting `
        + `(first: ${drifted[0].name}). Run \`npm run vo:beefrun\`.`);
    }
    const stale = [...allCues].filter((n) => n.startsWith('vo.beefrun.') && !live.has(n));
    if (stale.length) {
      fail(`${stale.length} stale Beef Run cue(s) in assets/sfx/manifest.json `
        + `(first: ${stale[0]}). Run \`npm run vo:beefrun\`.`);
    }
  }

  /* Exact-cue scenes derive names in their catalogs rather than spelling
   * every one at a call site. Hold the manifest to the same catalog in both
   * directions, including words and casting, so the generated recording
   * sheet cannot silently omit a whole scene. */
  const manifestByName = new Map(sfxManifest.sfx.map((cue) => [cue.name, cue]));
  const duplicateCueNames = [...new Set(sfxManifest.sfx
    .map((cue) => cue.name)
    .filter((name, index, all) => all.indexOf(name) !== index))];
  if (duplicateCueNames.length) {
    fail(`assets/sfx/manifest.json has ${duplicateCueNames.length} duplicate cue name(s) `
      + `(first: ${duplicateCueNames[0]}).`);
  }
  const checkCatalog = (label, prefix, expected, command) => {
    const wanted = new Map(expected.map((cue) => [cue.name, cue]));
    const missing = expected.filter((cue) => !manifestByName.has(cue.name));
    const stale = sfxManifest.sfx.filter((cue) => cue.name.startsWith(prefix) && !wanted.has(cue.name));
    const drifted = expected.filter((cue) => {
      const actual = manifestByName.get(cue.name);
      return actual && (actual.say !== cue.say || actual.voice !== cue.voice);
    });
    if (missing.length || stale.length || drifted.length) {
      fail(`${label} voice catalog drift: ${missing.length} missing, ${stale.length} stale, `
        + `${drifted.length} changed. Run \`${command}\`.`);
    }
  };
  {
    const { allMotelVoiceLines } = await import('../src/motel/voice-catalog.js');
    checkCatalog('Motel', 'vo.motel.', allMotelVoiceLines().map((line) => ({
      name: `${line.cue}.1`, voice: line.voice, say: line.text,
    })), 'npm run vo:motel');
  }
  {
    const { allSilverVoiceLines } = await import('../src/silver/voice-catalog.js');
    checkCatalog('Silver Room', 'vo.silver.', allSilverVoiceLines().map((line) => ({
      name: line.name, voice: line.voice, say: line.text,
    })), 'npm run vo:silver');
  }
  {
    const { checkBingVoiceManifest } = await import('./bing-vo.mjs');
    const drift = checkBingVoiceManifest(sfxManifest);
    if (drift.length) {
      fail(`Bing generated voice catalog drift: ${drift.length} problem(s). `
        + 'Run `npm run vo:bing`.');
    }
  }
  {
    const { checkNoWakeVoiceManifest } = await import('./nowake-vo.mjs');
    const drift = checkNoWakeVoiceManifest(sfxManifest);
    if (drift.length) {
      fail(`NO WAKE voice catalog drift: ${drift.length} problem(s). `
        + 'Run `npm run vo:nowake`.');
    }
  }
  {
    const { checkGolfManifest } = await import('./golf-vo.mjs');
    const drift = checkGolfManifest(sfxManifest);
    if (drift.length) {
      fail(`Silver Pines audio catalog drift: ${drift.length} problem(s). `
        + 'Run `npm run vo:golf`.');
    }
  }
  {
    const {
      initiationManifestCues,
      initiationManifestDrift,
      initiationVoiceProfileGaps,
    } = await import('./initiation-vo-lib.mjs');
    const expected = initiationManifestCues();
    const drift = initiationManifestDrift(sfxManifest, expected);
    const total = Object.values(drift).reduce((sum, rows) => sum + rows.length, 0);
    const missingProfiles = initiationVoiceProfileGaps(sfxManifest, expected);
    if (total || missingProfiles.length) {
      fail(`Initiation voice catalog drift: ${total} cue problem(s), `
        + `${missingProfiles.length} undefined voice profile(s). Run \`npm run vo:initiation\`.`);
    }
  }

  /* The inbox names its group in data rather than at the call site, so the
   * scan above cannot see it. Same failure either way: a renamed bank is a
   * reply he never gives, and nothing anywhere says so. */
  const mail = fs.readFileSync(path.join(ROOT, 'src/arcade/mail.js'), 'utf8');
  for (const m of mail.matchAll(/vo:\s*'([^']+)'/g)) {
    const group = m[1];
    if (!voCues.some((n) => n.startsWith(`vo.${group}.`))) {
      fail(`src/arcade/mail.js: a message wants vo '${group}', which has no vo.${group}.* cue`);
    }
  }
} catch (err) {
  fail(err.message);
}

/* ---- hung art must not overlap other hung art ---- */
/* Slots are hand-placed coordinates and a picture's WIDTH is not written down
 * anywhere -- it comes from the image's own aspect ratio at load time. So two
 * slots that look far apart in the table can collide once real files are in
 * them, and the only way anyone finds out is by walking up to that wall. The
 * crest is the reason this exists: it lives in its own slot table, so a check
 * that only read WALL_SLOTS said everything was fine while a logo sat on it. */
try {
  const dim = (file) => {
    const b = fs.readFileSync(path.join(ROOT, 'assets/art', file));
    if (b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    let i = 2;
    while (i < b.length - 8) {
      if (b[i] !== 0xFF) { i++; continue; }
      const mk = b[i + 1];
      if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) {
        return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  };
  const art = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/art/manifest.json'), 'utf8'));
  const fileOf = Object.fromEntries(art.art.filter((a) => a.file).map((a) => [a.slot, a.file]));
  const src = fs.readFileSync(path.join(ROOT, 'src/world/apartment.js'), 'utf8');

  const placed = [];
  for (const m of src.matchAll(/\{ slot: '([^']+)', x: (-?[\d.]+), y: (-?[\d.]+), z: (-?[\d.]+), rotY: ([^,]+), h: ([\d.]+)/g)) {
    placed.push({ slot: m[1], x: +m[2], y: +m[3], z: +m[4], rotY: m[5], h: +m[6] });
  }
  // Round slots carry a radius instead of a height, and live in their own table.
  for (const m of src.matchAll(/\{ slot: '([^']+)', x: (-?[\d.]+), y: (-?[\d.]+), z: (-?[\d.]+), rotY: ([^,]+), r: ([\d.]+)/g)) {
    placed.push({ slot: m[1], x: +m[2], y: +m[3], z: +m[4], rotY: m[5], h: +m[6] * 2, w: +m[6] * 2 });
  }

  const live = [];
  for (const p of placed) {
    const file = fileOf[p.slot];
    if (!file) continue;
    if (p.w === undefined) {
      const d = dim(file);
      if (!d) continue;
      p.w = p.h * (d.w / d.h);
    }
    /* Which wall a picture is on is its FACING, not where it happens to be:
     * the bathroom's side walls sit at z -5 to -7, which is "north" by
     * position and quite obviously not the same surface as the north wall of
     * the flat. rotY 0 / PI face along Z and so run along X; +-PI/2 face along
     * X and run along Z. Two pictures only collide if they also share a wall
     * PLANE, so the perpendicular coordinate goes in the key. */
    const alongX = !/Math\.PI\s*\/\s*2/.test(p.rotY);
    p.u = alongX ? p.x : p.z;
    p.wall = `${alongX ? 'x' : 'z'}@${(alongX ? p.z : p.x).toFixed(1)}`;
    p.file = file;
    live.push(p);
  }
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]; const b = live[j];
      if (a.wall !== b.wall) continue;
      const du = Math.abs(a.u - b.u) - (a.w + b.w) / 2;
      const dv = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
      if (du < 0 && dv < 0) {
        fail(`${a.slot} (${a.file}) overlaps ${b.slot} (${b.file}) on the ${a.wall} wall `
          + `— ${(-du).toFixed(2)}m across, ${(-dv).toFixed(2)}m up`);
      }
    }
  }
} catch (err) {
  fail(err.message);
}

/* ---- the radio's voice cues must match what is on air ---- */
// Every line in stations.js is turned into a text-to-speech cue by a bit of
// parsing -- strip the `SPEAKER:` label, strip stage directions, pick a voice.
// Get that wrong and you do not find out until you hear a host solemnly read
// the words "long silence" on air, so it is checked here instead.
try {
  const { voiceCues, voiceOf, STATIONS } = await import('../src/core/stations.js');
  const sfxManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
  const cues = voiceCues();
  const declared = new Map(sfxManifest.sfx
    .filter((cue) => cue.name.startsWith('radio.vo.'))
    .map((cue) => [cue.name, cue]));

  for (const c of cues) {
    if (!declared.has(c.name)) fail(`radio cue ${c.name} is not in assets/sfx/manifest.json — run npm run radio:cues`);
    const actual = declared.get(c.name);
    if (actual && (actual.say !== c.say || actual.voice !== c.voice)) {
      fail(`radio cue ${c.name} has stale text or casting — run npm run radio:cues`);
    }
    if (!sfxManifest.voices?.[c.voice]) fail(`radio cue ${c.name} wants voice "${c.voice}", which has no entry`);
    if (/^[A-Z][A-Z '’]*:/.test(c.say)) fail(`radio cue ${c.name} still has a speaker label: "${c.say}"`);
    if (c.say.includes('(')) fail(`radio cue ${c.name} still has a stage direction: "${c.say}"`);
    if (!/[a-z0-9]/i.test(c.say)) fail(`radio cue ${c.name} has nothing to say`);
  }
  if (declared.size !== cues.length) {
    fail(`manifest has ${declared.size} radio cues, stations.js has ${cues.length} — run npm run radio:cues`);
  }
  // Two Lous only works if they are two different voices.
  const louShow = STATIONS.find((s) => s.id === 'squatch')?.shows?.[0];
  const lous = new Set(
    (louShow?.exchanges ?? []).flat().map((l) => voiceOf(l)?.voice).filter(Boolean),
  );
  if (lous.size < 2) fail('Lou & Lou resolved to a single voice — the alternation broke');
  // And they have to take turns inside a bit, not just across the show.
  const flat = (louShow?.exchanges ?? []).filter((e) => e.length > 1
    && e.every((l) => /^LOU:/.test(l)));
  const noTurns = flat.filter((e) => new Set(e.map((l) => voiceOf(l)?.voice)).size < 2);
  if (flat.length && noTurns.length === flat.length) {
    fail('every multi-line Lou exchange is one voice — they never answer each other');
  }
} catch (err) {
  fail(err.message);
}

/* ---- the Beef Run's dialogue must resolve ---- */
/* Beats are played by id from mission.js, preflight.js and loading.js. A
 * renamed beat is a line nobody ever hears again, and the mission carries on
 * without it, so the ids are checked against the script rather than trusted. */
try {
  const { BEATS, BARKS, OBJECTIVES } = await import('../src/beefrun/script.js');
  const ids = new Set(Object.keys(BEATS));
  const files = fs.readdirSync(path.join(ROOT, 'src/beefrun'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => `src/beefrun/${f}`);
  let played = 0;
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/dialogue\.play\(\s*'([^']+)'/g)) {
      played++;
      if (!ids.has(m[1])) fail(`${file}: dialogue.play('${m[1]}') is not a beat in script.js`);
    }
    for (const m of src.matchAll(/dialogue\.bark\(\s*'([^']+)'/g)) {
      if (!BARKS[m[1]]) fail(`${file}: dialogue.bark('${m[1]}') has no lines in script.js`);
    }
  }
  if (played < 30) fail(`only ${played} beats are ever played — the script is not wired up`);
  for (const [k, v] of Object.entries(BEATS)) {
    if (!Array.isArray(v) || !v.length) fail(`beat "${k}" is empty`);
    for (const line of v) {
      if (!line.who || !line.text) fail(`beat "${k}" has a line with no speaker or no text`);
    }
  }
  if (Object.keys(OBJECTIVES).length < 10) fail('the objective list looks truncated');
} catch (err) {
  fail(err.message);
}

/* ---- three.js must actually be vendored ---- */
const three = path.join(ROOT, 'vendor/three.module.min.js');
if (!fs.existsSync(three) || fs.statSync(three).size < 100_000) {
  fail('vendor/three.module.min.js is missing or truncated');
}

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log('\nAll good.');
