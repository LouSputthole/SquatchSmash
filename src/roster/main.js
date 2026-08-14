/**
 * The roster tool's entry module — extracted verbatim from roster.html's
 * inline script so the page can carry the shared boot guard: an inline module
 * whose import is blocked dies silently (the element-level error event never
 * reaches a window listener), whereas an external entry's `onerror` attribute
 * puts the recovery card up. Relative fetch() URLs still resolve against the
 * page, so only the import specifier moved.
 */
import { CHARACTER_REGISTRY } from '../core/characters.js';

/* ---------------- curated scene rosters (2026-07-30 snapshot) ------------ */
const SCENES = [
  ['The Bada Bing — staff & regulars', [
    ['lou (registry)', 'Big Uncle Lou Sputthole', 'owner; real photo face, no bandana', 'lou1 / lou (calls)'],
    ['bouncer', 'the bouncer', 'door, knows you', '—'],
    ['bartender / barback', 'bar crew', 'twelve metres of bar', '—'],
    ['dealer', 'the blackjack dealer', 'procedural croupier patter', 'uncle'],
    ['performer ×4', 'the performers', 'authored: 3 fair-skinned + 1 deep brown; blonde/brunette/black/platinum; 4-bar choreography', '—'],
    ['security / waitress / delivery', 'movers', 'patrol routes (fixed 07-30)', '—'],
    ['dj, staff, regulars, contractor, associate', 'the floor', 'ambient tiers', '—'],
  ]],
  ['The Squatchfather — restaurant', [
    ['sal_sorrento', 'Sal “The Prospector” Sorrento', 'antagonist; killed at the table', '—'],
    ['captain_mcclawsky', 'Capt. McClawsky', 'Sal’s associate (NOT Captain Lou)', '—'],
    ['waiter / cook / diner ×2', 'the room', 'waiter works the room between beats (07-30)', '—'],
  ]],
  ['The Beef Run — airstrip', [
    ['captain_lou_sasole (registry)', 'Captain Lou Sasole', 'speaker key SASOLE; 134 lines', 'lou2'],
    ['stove', 'Old Stove', 'squatch, and also the government', 'old-stove (prov)'],
    ['cecilio', 'Don Cecilio Barriga', 'the other end of the run', 'cecilio (prov)'],
    ['caib', 'CAIB radio', 'the Bureau on the air', 'caib-radio (prov)'],
    ['lookout', 'the lookout', 'a man on a hill since dawn', 'lookout (prov)'],
  ]],
  ['The Jerky Motel', [
    ['snow', 'Snow (Motel ally)', 'Family — the Motel ally, was Manny; hard never-hostile boundary stands', '—'],
    ['rico / chino / motel_slicer', 'the sellers', 'deal then betrayal', '—'],
    ['motel_lookout / motel_watcher / motel_clerk', 'mission-local', '', '—'],
  ]],
  ['The Silver Room — Front and Center', [
    ['margo (registry)', 'Margo Salas', 'the date; civilian kitchen manager (recast 07-30)', 'margo (prov)'],
    ['vinny / frontDoor doorman', 'the doors', 'alley and marquee', '—'],
    ['maître d’, porters, cooks, band, diners', 'the house', 'gown/chef/porter wardrobe (07-30)', '—'],
    ['driver', 'the hired car', 'the one man who does not know your name', '—'],
  ]],
  ['The Initiation — the Circle (faces are authoritative photos)', [
    ['booski', 'BOOSKIBRO', 'patriarch, ceremony leader — booski.png', 'booski'],
    ['lou', 'BIG UNCLE LOU SPUTTHOLE', 'founder — lou.png', 'lou1'],
    ['rippinflow', 'RIPPINFLOW', 'quiet founder — rippinflow.png', '—'],
    ['shubes', 'THE SHUBENATOR', 'founder — shubes.png', '—'],
    ['deathmegatron', 'DEATHMEGATRON', 'founder and muscle — deathmegatron.png', '—'],
    ['hogmama', 'HOG MAMA', 'Matriarch — hogmama.png', 'hogmama (radio)'],
    ['ape', 'APE', 'roaster (no face supplied)', 'ape (radio)'],
    ['irish', 'IRISH', 'procedure voice (no face supplied)', 'irish (radio)'],
    ['erican / gratin / snow / captain_lou_sasole', 'members', 'erican.png / gratin.png / snow.png / sasole.png', '—'],
  ]],
  ['The apartment & the radio', [
    ['prospect (registry)', 'Tony Squatchtana', 'the player; face/outfit decision still open', 'player'],
    ['hr / unknown', 'phone callers', 'provisional castings', 'hr (prov) / unknown (prov)'],
    ['radio hosts', 'Lou & Lou, Booski & Ape, Irish, Eric & Gratin, Hog Mama, KSQCH', '97.8 The Squatch schedule', 'lou1/lou2/booski/ape/irish/eric/gratin/hogmama/ksqch'],
  ]],
];

const reg = document.querySelector('#registry tbody');
for (const c of Object.values(CHARACTER_REGISTRY)) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td class="id">${c.id}</td><td>${c.canonicalName}</td><td>${c.subtitleName}</td>`
    + `<td class="id">${c.voiceProfile ?? '—'}</td><td>${c.species}</td><td>${c.role}</td>`
    + `<td class="id">${(c.legacyAliases ?? []).join(', ') || '—'}</td>`;
  reg.appendChild(tr);
}
const castsEl = document.getElementById('sceneCasts');
for (const [title, rows] of SCENES) {
  const h = document.createElement('h3');
  h.textContent = title;
  castsEl.appendChild(h);
  const wrap = document.createElement('div');
  wrap.className = 'tablewrap';
  const t = document.createElement('table');
  t.innerHTML = '<thead><tr><th>ID</th><th>Name</th><th>Notes</th><th>Voice</th></tr></thead>';
  const tb = document.createElement('tbody');
  for (const [id, name, notes, voice] of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="id">${id}</td><td>${name}</td><td>${notes}</td><td class="id">${voice}</td>`;
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  wrap.appendChild(t);
  castsEl.appendChild(wrap);
}

/* ---------------- live manifest ---------------- */
const [manifest, index] = await Promise.all([
  fetch('assets/sfx/manifest.json').then((r) => r.json()),
  fetch('assets/sfx/index.json').then((r) => r.json()).catch(() => ({ files: [] })),
]);
const have = new Set(index.files ?? []);
const fileOf = (c) => c.file || `${c.name}.mp3`;

const voiceLines = {};
for (const c of manifest.sfx) if (c.say) (voiceLines[c.voice ?? 'player'] ??= []).push(c);

const vt = document.querySelector('#voicesTable tbody');
for (const [key, v] of Object.entries(manifest.voices)) {
  if (!v || typeof v !== 'object' || !v.id) continue;
  const prov = /provisional/i.test(v._note ?? '');
  const tr = document.createElement('tr');
  tr.innerHTML = `<td class="id">${key}</td><td class="id">${v.id}</td>`
    + `<td>${(voiceLines[key] ?? []).length}</td>`
    + `<td>${prov ? '<span class="tag prov">PROVISIONAL</span>' : '<span class="tag canon">CAST</span>'}</td>`
    + `<td>${v._note ?? ''}</td>`;
  vt.appendChild(tr);
}

/* one shared audio element so plays never overlap */
const playerEl = new Audio();
function playBtn(cue) {
  const f = fileOf(cue);
  if (!have.has(f)) return '<span class="tag missing">NO TAKE</span>';
  return `<button class="play" data-src="assets/sfx/${f}">&#9654; play</button>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button.play');
  if (!b) return;
  playerEl.src = b.dataset.src;
  playerEl.play();
});

const bankOf = (n) => n.split('.').slice(0, -1).join('.');
const banks = new Map();
for (const c of manifest.sfx) {
  if (!c.say) continue;
  const b = bankOf(c.name);
  if (!banks.has(b)) banks.set(b, []);
  banks.get(b).push(c);
}
const banksEl = document.getElementById('banks');
for (const [bank, list] of banks) {
  const d = document.createElement('details');
  d.dataset.text = `${bank} ${list.map((c) => `${c.voice ?? ''} ${c.say}`).join(' ')}`.toLowerCase();
  d.innerHTML = `<summary><code>${bank}.*</code> <span class="count">— ${list.length} line(s) · ${list[0].voice ?? 'player'}</span></summary>`;
  const t = document.createElement('table');
  const tb = document.createElement('tbody');
  for (const c of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="width:90px">${playBtn(c)}</td><td class="id" style="width:280px">${c.name}</td>`
      + `<td class="id" style="width:90px">${c.voice ?? 'player'}</td><td class="say">${c.say}</td>`;
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  d.appendChild(t);
  banksEl.appendChild(d);
}

document.getElementById('filter').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  for (const d of banksEl.querySelectorAll('details')) {
    d.style.display = !q || d.dataset.text.includes(q) ? '' : 'none';
    if (q && d.dataset.text.includes(q)) d.open = true;
  }
});

const sfxEl = document.getElementById('sfxList');
const t = document.createElement('table');
t.innerHTML = '<thead><tr><th style="width:90px"></th><th>Cue</th><th>Status</th><th>Prompt / note</th></tr></thead>';
const tb = document.createElement('tbody');
for (const c of manifest.sfx) {
  if (c.say) continue;
  const f = fileOf(c);
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${playBtn(c)}</td><td class="id">${c.name}</td>`
    + `<td>${have.has(f) ? '<span class="tag canon">RECORDED</span>' : '<span class="tag synth">SYNTH ONLY</span>'}</td>`
    + `<td class="prompt">${c.prompt ?? c._note ?? ''}</td>`;
  tb.appendChild(tr);
}
t.appendChild(tb);
sfxEl.appendChild(t);

/* The boot guard's ready signal (see roster.html's data-ready). */
window.__rosterReady = true;
