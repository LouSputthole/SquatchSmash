#!/usr/bin/env node
/**
 * RADIO ROOM — every scene's audio, with a play button on it.
 *
 *   npm run radio:room
 *
 * The radio audit answers "what is wired where" in a spreadsheet. This answers
 * the question a spreadsheet cannot: *"so I can play all the songs and hear
 * what everything is."* Same data, one page, one audio element.
 *
 * It writes a real page into the repo rather than a self-contained document,
 * because the audio is 91 MB of music and 241 MB of speech and the only sane
 * way to hear it is to let the browser fetch the same files the game fetches.
 * `pages.yml` already stages all of `assets/`, so this works on the deployed
 * site as well as over any local static server.
 *
 * Output: radioroom.html (repo root, staged by pages.yml)
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'radioroom.html');
const AUDIT = path.join(ROOT, 'docs/audits/SQUATCHSMASH-RADIO-AUDIT.xlsx');

/* ------------------------------------------------------------------ xlsx -- */
/* The audit workbook is the generated source of truth for scene wiring, and
 * reading it here costs one zlib inflate rather than a second copy of the
 * scene table that could drift away from `tools/radio-audit.mjs`. */
function readSheet(file, sheetIndex) {
  const buf = fs.readFileSync(file);
  const entries = new Map();
  // Minimal zip central-directory walk; the workbook is always stored deflated.
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end -= 1;
  const count = buf.readUInt16LE(end + 10);
  let ptr = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    entries.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  /* openpyxl writes this workbook with the `x:` namespace prefix on every
   * element, so nothing here may assume a bare tag name. One missing `(?:\w+:)?`
   * silently yields zero rows. */
  const strings = [];
  const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  for (const si of sharedXml.split(/<(?:\w+:)?si>/).slice(1)) {
    const text = [...si.matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
      .map((m) => m[1]).join('');
    strings.push(decodeXml(text));
  }
  const sheetXml = entries.get(`xl/worksheets/sheet${sheetIndex}.xml`).toString('utf8');
  const rows = [];
  for (const rowXml of sheetXml.split(/<(?:\w+:)?row[\s>]/).slice(1)) {
    const cells = [];
    for (const m of rowXml.matchAll(
      /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const type = /\st="(\w+)"/.exec(m[1] || '')?.[1];
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(m[2] || '');
      if (!v) { cells.push(''); continue; }
      cells.push(type === 's' ? strings[Number(v[1])] : decodeXml(v[1]));
    }
    rows.push(cells);
  }
  return rows;
}
const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, '&');

/* ------------------------------------------------------------------ data -- */
const music = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/music/manifest.json'), 'utf8'));
const sfx = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
const voiceNote = (slug) => sfx.voices?.[slug]?._note || '';

const tracks = music.tracks.map((t) => ({
  file: t.file,
  src: `assets/music/${t.file}`,
  title: t.title || t.file,
  artist: t.artist || '',
  station: t.station || '',
  venue: t.venue || '',
  cue: Boolean(t.cue),
  note: t._note || '',
  bytes: fs.statSync(path.join(ROOT, 'assets/music', t.file)).size,
}));
const trackByFile = new Map(tracks.map((t) => [t.file, t]));

const radioCues = sfx.sfx
  .filter((e) => e.name.startsWith('radio.'))
  .map((e) => {
    const rel = `${e.file || e.name}.mp3`;
    const abs = path.join(ROOT, 'assets/sfx', rel);
    if (!fs.existsSync(abs)) return null;
    const parts = e.name.split('.');
    return {
      name: e.name,
      src: `assets/sfx/${rel}`,
      group: e.name.startsWith('radio.vo.') ? parts[2] : 'station furniture',
      voice: e.voice || '',
      say: e.say || '',
      bytes: fs.statSync(abs).size,
    };
  })
  .filter(Boolean);

/* The Scene Timeline, collapsed to one card per (beat, source). The audit
 * repeats a beat once per eligible cue; a listening page wants the receiver
 * once with its playlist under it. */
const grid = readSheet(AUDIT, 1);
const header = grid[3];
const col = (name) => header.indexOf(name);
const IDX = {
  beat: col('Beat'), chapter: col('Chapter'), day: col('Campaign day'),
  time: col('Campaign time'), venue: col('Location or venue'),
  source: col('Radio or music source'), station: col('Station'),
  trigger: col('Trigger'), stop: col('Stop condition'), volume: col('Volume'),
  duck: col('Ducking behavior'), overlap: col('Overlap risk'),
  status: col('Current status'), notes: col('Notes'),
};
const scenes = [];
const sceneKey = new Map();
for (const row of grid.slice(4)) {
  const get = (k) => (IDX[k] >= 0 && IDX[k] < row.length ? row[IDX[k]] || '' : '');
  const key = `${get('beat')}|||${get('source')}`;
  let scene = sceneKey.get(key);
  if (!scene) {
    scene = {
      beat: get('beat'), chapter: get('chapter'), day: get('day'), time: get('time'),
      venue: get('venue'), source: get('source'), station: get('station'),
      trigger: get('trigger'), stop: get('stop'), volume: get('volume'),
      duck: get('duck'), overlap: get('overlap'), status: get('status'),
      notes: get('notes'), files: [],
    };
    sceneKey.set(key, scene);
    scenes.push(scene);
  }
  /* "Eligible: a.mp3, b.mp3" in Notes, plus any bare .mp3 named anywhere in
   * the row -- that is how a cue track states which recording it plays. */
  for (const m of `${get('notes')} ${get('source')}`.matchAll(/([a-z0-9-]+\.mp3)/gi)) {
    if (trackByFile.has(m[1]) && !scene.files.includes(m[1])) scene.files.push(m[1]);
  }
}

const payload = { scenes, tracks, radioCues, voiceNote: Object.fromEntries(
  [...new Set(radioCues.map((c) => c.voice).filter(Boolean))].map((v) => [v, voiceNote(v)]),
) };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>97.8 THE SQUATCH — Radio Room</title>
<style>
  :root {
    --bg: #0e1116; --panel: #161b23; --panel2: #1c222b; --rule: #2a323d;
    --ink: #e8ecf2; --dim: #97a1b0; --amber: #f0a830; --green: #6fcf7f;
    --red: #e2705f; --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --sans: "Helvetica Neue", Arial, system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--sans);
         font-size: 14px; line-height: 1.5; padding-bottom: 96px; }
  header { padding: 26px 22px 14px; border-bottom: 1px solid var(--rule); }
  h1 { margin: 0; font-size: 22px; letter-spacing: .08em; text-transform: uppercase; }
  h1 span { color: var(--amber); }
  .sub { color: var(--dim); font-size: 12.5px; margin-top: 6px; max-width: 74ch; }
  nav { display: flex; gap: 8px; flex-wrap: wrap; padding: 14px 22px; border-bottom: 1px solid var(--rule);
        position: sticky; top: 0; background: var(--bg); z-index: 5; }
  nav button, .chip { background: var(--panel2); color: var(--ink); border: 1px solid var(--rule);
    border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 12.5px; cursor: pointer; }
  nav button[aria-selected="true"] { background: var(--amber); color: #17130a; border-color: var(--amber); font-weight: 700; }
  #q { flex: 1; min-width: 200px; background: var(--panel2); border: 1px solid var(--rule);
       border-radius: 999px; padding: 6px 14px; color: var(--ink); font: inherit; font-size: 12.5px; }
  main { padding: 20px 22px; }
  section[hidden] { display: none; }
  .card { background: var(--panel); border: 1px solid var(--rule); border-radius: 10px;
          margin-bottom: 14px; overflow: hidden; }
  .card > h3 { margin: 0; padding: 12px 16px; font-size: 14px; background: var(--panel2);
               border-bottom: 1px solid var(--rule); display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  .beat { font-family: var(--mono); color: var(--amber); font-size: 12px; }
  .venue { color: var(--dim); font-weight: 400; font-size: 12.5px; }
  dl { margin: 0; padding: 12px 16px; display: grid; grid-template-columns: 148px 1fr;
       gap: 4px 14px; font-size: 12.5px; }
  dt { color: var(--dim); } dd { margin: 0; }
  .rows { border-top: 1px solid var(--rule); }
  .row { display: flex; align-items: center; gap: 12px; padding: 8px 16px; border-bottom: 1px solid var(--rule); }
  .row:last-child { border-bottom: 0; }
  .row:hover { background: var(--panel2); }
  .play { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--rule);
    background: var(--panel2); color: var(--amber); cursor: pointer; font-size: 12px; line-height: 1; }
  .play:hover { border-color: var(--amber); }
  .play[data-on="1"] { background: var(--amber); color: #17130a; border-color: var(--amber); }
  .meta { flex: 1 1 auto; min-width: 0; }
  .t { font-size: 13px; }
  .s { color: var(--dim); font-size: 11.5px; font-family: var(--mono);
       overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .say { color: var(--dim); font-size: 12px; font-style: italic; }
  .size { color: var(--dim); font-size: 11px; font-family: var(--mono); flex: 0 0 auto; }
  .tag { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; padding: 2px 7px;
         border-radius: 4px; border: 1px solid var(--rule); color: var(--dim); flex: 0 0 auto; }
  .tag.cue { color: var(--green); border-color: #2f5236; }
  .tag.risk { color: var(--red); border-color: #5b3129; }
  #bar { position: fixed; left: 0; right: 0; bottom: 0; background: var(--panel2);
         border-top: 1px solid var(--rule); padding: 10px 22px; display: flex; gap: 14px;
         align-items: center; z-index: 10; }
  #bar .now { flex: 1 1 auto; min-width: 0; }
  #bar .now .t { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  audio { width: 340px; max-width: 46vw; }
  .empty { color: var(--dim); padding: 10px 16px; font-size: 12.5px; font-style: italic; }
  .count { color: var(--dim); font-size: 12px; margin-bottom: 12px; }
  @media (max-width: 720px) { dl { grid-template-columns: 1fr; } audio { width: 180px; } }
</style>
</head>
<body>
<header>
  <h1>97.8 <span>THE SQUATCH</span> — Radio Room</h1>
  <div class="sub">Every scene's audio with a play button on it. One player: starting
  something stops whatever was going. Generated from the live manifests and the radio
  audit by <code>npm run radio:room</code> — if a track is here, it is the file the game
  actually loads.</div>
</header>
<nav>
  <button data-tab="scenes" aria-selected="true">Scenes</button>
  <button data-tab="music" aria-selected="false">All music</button>
  <button data-tab="cues" aria-selected="false">Station cues</button>
  <input id="q" type="search" placeholder="Filter by scene, title, voice, or line…" autocomplete="off">
</nav>
<main>
  <section id="scenes"></section>
  <section id="music" hidden></section>
  <section id="cues" hidden></section>
</main>
<div id="bar">
  <div class="now"><div class="t" id="nowT">Nothing playing</div><div class="s" id="nowS">Pick anything above</div></div>
  <audio id="player" controls preload="none"></audio>
</div>
<script id="data" type="application/json">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>
<script>
const DATA = JSON.parse(document.getElementById('data').textContent);
const player = document.getElementById('player');
const nowT = document.getElementById('nowT');
const nowS = document.getElementById('nowS');
let active = null;

function play(src, title, sub, btn) {
  if (active && active !== btn) active.dataset.on = '0';
  if (btn && btn.dataset.on === '1') { player.pause(); btn.dataset.on = '0'; active = null; return; }
  player.src = src;
  player.play().catch((err) => { nowS.textContent = 'Could not play — ' + err.message; });
  nowT.textContent = title;
  nowS.textContent = sub;
  if (btn) { btn.dataset.on = '1'; active = btn; }
}
player.addEventListener('ended', () => { if (active) active.dataset.on = '0'; active = null; });

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
function rowFor(src, title, sub, tags) {
  const row = el('div', 'row');
  const btn = el('button', 'play', '▶');
  btn.setAttribute('aria-label', 'Play ' + title);
  btn.addEventListener('click', () => play(src, title, sub, btn));
  row.append(btn);
  const meta = el('div', 'meta');
  meta.append(el('div', 't', title), el('div', 's', sub));
  row.append(meta);
  for (const [text, cls] of tags || []) row.append(el('span', 'tag ' + (cls || ''), text));
  row.dataset.search = (title + ' ' + sub).toLowerCase();
  return row;
}

// ---- Scenes ----
const scenesEl = document.getElementById('scenes');
scenesEl.append(el('div', 'count',
  DATA.scenes.length + ' receivers and music cues across the campaign, in story order.'));
for (const s of DATA.scenes) {
  const card = el('div', 'card');
  const h = el('h3');
  h.append(el('span', 'beat', s.beat || '—'));
  h.append(document.createTextNode(s.source || 'Audio source'));
  if (s.venue) h.append(el('span', 'venue', s.venue));
  card.append(h);
  const dl = el('dl');
  const add = (k, v) => { if (v) { dl.append(el('dt', null, k), el('dd', null, v)); } };
  add('Day / time', [s.day, s.time].filter(Boolean).join(' · '));
  add('Station', s.station);
  add('Starts', s.trigger);
  add('Stops', s.stop);
  add('Volume', s.volume);
  add('Ducking', s.duck);
  add('Overlap risk', s.overlap);
  add('Status', s.status);
  card.append(dl);
  const rows = el('div', 'rows');
  if (s.files.length) {
    for (const f of s.files) {
      const t = DATA.tracks.find((x) => x.file === f);
      if (!t) continue;
      rows.append(rowFor(t.src, t.title, [t.artist, f].filter(Boolean).join(' · '),
        [[t.cue ? 'scored cue' : 'rotation', t.cue ? 'cue' : '']]));
    }
  } else {
    rows.append(el('div', 'empty',
      'No specific track named for this source — it plays the station rotation, which you can hear under "All music".'));
  }
  card.append(rows);
  card.dataset.search = (s.beat + ' ' + s.source + ' ' + s.venue + ' ' + s.station).toLowerCase();
  scenesEl.append(card);
}

// ---- All music ----
const musicEl = document.getElementById('music');
const scored = DATA.tracks.filter((t) => t.cue);
const rotation = DATA.tracks.filter((t) => !t.cue);
musicEl.append(el('div', 'count',
  DATA.tracks.length + ' tracks — ' + scored.length + ' scored cues placed at a specific moment, '
  + rotation.length + ' in station or venue rotation.'));
for (const [label, list] of [['Scored cues — placed at a moment', scored],
                             ['Rotation — station and venue playlists', rotation]]) {
  const card = el('div', 'card');
  card.append(el('h3', null, label));
  const rows = el('div', 'rows');
  for (const t of list) {
    const bits = [t.artist, t.station ? 'station: ' + t.station : '', t.venue ? 'venue: ' + t.venue : '', t.file]
      .filter(Boolean).join(' · ');
    rows.append(rowFor(t.src, t.title, bits, [[(t.bytes / 1048576).toFixed(1) + ' MB']]));
  }
  card.append(rows);
  musicEl.append(card);
}

// ---- Station cues ----
const cuesEl = document.getElementById('cues');
const groups = {};
for (const c of DATA.radioCues) (groups[c.group] = groups[c.group] || []).push(c);
cuesEl.append(el('div', 'count',
  DATA.radioCues.length + ' station recordings on disk — idents, links, adverts, news and the shows.'));
for (const name of Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length)) {
  const card = el('div', 'card');
  const h = el('h3');
  h.append(document.createTextNode(name));
  h.append(el('span', 'venue', groups[name].length + ' recordings'
    + (DATA.voiceNote[name] ? ' — ' + DATA.voiceNote[name].split(/\\s[—–-]{1,2}\\s|[.,;:(]/)[0] : '')));
  card.append(h);
  const rows = el('div', 'rows');
  for (const c of groups[name]) {
    rows.append(rowFor(c.src, c.say || c.name, c.name, c.voice ? [[c.voice]] : []));
  }
  card.append(rows);
  cuesEl.append(card);
}

// ---- Tabs + filter ----
const tabs = [...document.querySelectorAll('nav button')];
tabs.forEach((b) => b.addEventListener('click', () => {
  tabs.forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  for (const id of ['scenes', 'music', 'cues']) {
    document.getElementById(id).hidden = (id !== b.dataset.tab);
  }
}));
document.getElementById('q').addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  for (const card of document.querySelectorAll('.card')) {
    let any = false;
    for (const row of card.querySelectorAll('.row')) {
      const hit = !term || (row.dataset.search || '').includes(term);
      row.hidden = !hit;
      any = any || hit;
    }
    const cardHit = !term || any || (card.dataset.search || '').includes(term);
    card.hidden = !cardHit;
  }
});
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
const totalMusic = tracks.reduce((n, t) => n + t.bytes, 0);
console.log(`[radio-room] wrote ${path.relative(ROOT, OUT)}`);
console.log(`  ${scenes.length} scene sources · ${tracks.length} tracks (${mb(totalMusic)})`
  + ` · ${radioCues.length} station recordings`);
const named = scenes.filter((s) => s.files.length).length;
console.log(`  ${named}/${scenes.length} sources name a specific track; the rest play the rotation.`);
void esc;
