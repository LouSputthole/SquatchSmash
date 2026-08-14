/**
 * The fitting room's entry module -- extracted verbatim from wardrobe.html's
 * inline script so the page can carry the shared boot guard: an inline module
 * whose import is blocked dies silently (the element-level error event never
 * reaches a window listener), whereas an external entry's `onerror` attribute
 * puts the recovery card up. Relative fetch() URLs still resolve against the
 * page, so only the import specifiers moved.
 */
import {
  createFittingRoom, RAIL, RIGS, MARKS, MARK_ORDER, describe, compare,
} from './preview.js';
import {
  PHOTOS, SCENES, appearancesInScene, appearancesOf, isShowable, ledgerCharacters,
} from '../core/appearances.js';

const canvas = document.getElementById('view');

/* Only wear a photo that exists -- a probe for a face that has not landed is
 * a 404 in the console on every single figure. */
let faces = new Set();
try {
  const index = await fetch('assets/faces/index.json').then((r) => r.json());
  faces = new Set(index.files ?? []);
} catch { /* authored heads for everybody, which is a legitimate look */ }

const room = createFittingRoom(canvas, { faces });

/* ------------------------------------------------------------------ */
/* The left rail, which is three rails wearing one coat                */
/* ------------------------------------------------------------------ */

const SCENE_LIST = Object.values(SCENES);
const PEOPLE = ledgerCharacters();
const railEl = document.getElementById('rail');

/* The rail follows the ROOM, not a variable of its own. The shot tool drives
 * `room.showScene(...)` directly and never touches a tab, and a sidebar that
 * disagreed with the picture beside it was the first thing the contact sheet
 * showed. */
const tabOf = () => room.state.view;

function buildRail() {
  const tab = tabOf();
  railEl.innerHTML = '';
  const add = (title, sub, count, onClick, current) => {
    const b = document.createElement('button');
    b.innerHTML = `${count === null ? '' : `<span class="n">${count}</span>`}`
      + `${title}<span class="k">${sub}</span>`;
    b.dataset.current = String(current);
    b.addEventListener('click', onClick);
    railEl.appendChild(b);
    return b;
  };
  if (tab === 'scene') {
    for (const scene of SCENE_LIST) {
      const cast = appearancesInScene(scene.id);
      add(scene.label, `${scene.rig} rig`, cast.length,
        () => selectScene(scene.id), room.state.subject === scene.id);
    }
  } else if (tab === 'character') {
    for (const person of PEOPLE) {
      add(person.name, person.id, person.scenes.length,
        () => selectCharacter(person.id), room.state.subject === person.id);
    }
  } else {
    RAIL.forEach((entry, i) => {
      add(entry.name, entry.key, null, () => selectCanonical(i),
        !room.state.lineup && room.state.index === i);
    });
  }
}

function setTab(next) {
  if (next === 'scene') selectScene(room.state.view === 'scene' ? room.state.subject : SCENE_LIST[0].id);
  else if (next === 'character') selectCharacter(room.state.view === 'character' ? room.state.subject : PEOPLE[0].id);
  else selectCanonical(room.state.index);
}
document.getElementById('tab-scene').addEventListener('click', () => setTab('scene'));
document.getElementById('tab-character').addEventListener('click', () => setTab('character'));
document.getElementById('tab-canonical').addEventListener('click', () => setTab('canonical'));

/* ---- the marks ---- */
const marksEl = document.getElementById('marks');
for (const name of MARK_ORDER) {
  const b = document.createElement('button');
  b.textContent = MARKS[name].label;
  b.dataset.mark = name;
  b.addEventListener('click', () => { room.applyMark(name); paint(); });
  marksEl.appendChild(b);
}

/* ---- the rigs ---- */
const rigEl = document.getElementById('rig');
for (const [key, rig] of Object.entries(RIGS)) {
  const o = document.createElement('option');
  o.value = key; o.textContent = rig.label;
  rigEl.appendChild(o);
}
rigEl.addEventListener('change', () => { room.applyRig(rigEl.value); paint(); });

/* ------------------------------------------------------------------ */
/* The right-hand panel                                                */
/* ------------------------------------------------------------------ */

const swatchFor = (v) => (typeof v === 'string' && v.startsWith('#')
  ? `<span class="swatch" style="background:${v}"></span>` : '');

/** One figure: the model's own keys, straight out of describe(). */
function paintOne(model) {
  const rows = describe(model)
    .map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${swatchFor(v)}${v}</td></tr>`)
    .join('');
  return `<table><tbody>${rows}</tbody></table>`;
}

/**
 * Several figures: one column each, differences highlighted.
 *
 * `compare()` decides what differs by comparing the model objects, so this
 * cannot highlight a change that is not there or miss one that is. It is the
 * same rule the single-figure panel already followed, which is why there is
 * no hand-written "note that he is shorter here" anywhere on this page.
 */
function paintCompare(appearances) {
  const { columns, rows } = compare(appearances);
  if (columns.length < 2) return columns.length ? paintOne(columns[0].appearance.model) : '';
  const head = columns.map((c) => `<th class="v" title="${c.full} — ${c.where}">${c.label}</th>`).join('');
  const body = rows.map((r) => `<tr class="${r.differs ? 'differs' : ''}">`
    + `<td class="k">${r.key}</td>`
    + r.values.map((v) => `<td class="v">${swatchFor(v)}${v}</td>`).join('')
    + '</tr>').join('');
  const differing = rows.filter((r) => r.differs).length;
  /* Its own scroller. Six columns of hex in a 300px panel is a table that
   * wraps to one character per line, which is how the first version of this
   * came back from the screenshot. */
  return `<p class="sub" style="margin:0 0 8px">${differing} of ${rows.length} `
    + 'properties differ across these scenes.</p>'
    + `<div class="scroller"><table class="cmp"><thead><tr><th class="k"></th>${head}</tr></thead>`
    + `<tbody>${body}</tbody></table></div>`;
}

/**
 * A scene's roster, one line each, generated from the models.
 *
 * The full spec of seventeen people is four thousand pixels of scrolling and
 * nobody reads it. What a scene view is for is "who is in this room and what
 * have they broadly got on", so each row is the person, where he is, and the
 * handful of `describe()` keys that separate one man from another.
 */
const AT_A_GLANCE = ['dress', 'height', 'shirt', 'belt', 'watch', 'chain'];
function paintRoster(appearances) {
  const rows = appearances.filter(isShowable).map((a) => {
    const spec = new Map(describe(a.model));
    const bits = AT_A_GLANCE
      .filter((k) => spec.has(k))
      .map((k) => `${swatchFor(spec.get(k))}${spec.get(k)}`)
      .join(' · ');
    return `<tr><td class="k" style="width:auto">${a.name}`
      + `<span style="display:block;font-size:10px;color:#6f6c62">${a.where}</span></td>`
      + `<td class="v">${bits}</td></tr>`;
  }).join('');
  return `<table><tbody>${rows}</tbody></table>`;
}

/** Anything the ledger flags, printed rather than summarised. */
function paintFlags(appearances) {
  const out = [];
  for (const a of appearances) {
    if (a.divergence) {
      out.push(`<div class="flagbox"><b>${(SCENES[a.scene]?.label ?? a.scene).toUpperCase()}</b>${a.divergence}</div>`);
    }
    if (!isShowable(a)) {
      out.push(`<div class="flagbox"><b>${(SCENES[a.scene]?.label ?? a.scene).toUpperCase()} — NOT SHOWN</b>`
        + `${a.name} is in this scene, at ${a.where}. ${a.from.unshown}</div>`);
    }
  }
  return out.join('');
}

/* ------------------------------------------------------------------ */
/* The captions under the row                                          */
/* ------------------------------------------------------------------ */

const stripEl = document.getElementById('strip');
let chips = [];

function buildStrip() {
  stripEl.innerHTML = '';
  chips = room.state.row.length > 1 ? room.state.row.map((entry) => {
    const el = document.createElement('div');
    el.className = `chip${entry.appearance?.divergence ? ' flag' : ''}`;
    el.innerHTML = `<b>${entry.label}</b><span>${entry.sub ?? ''}</span>`;
    if (entry.appearance) {
      el.title = 'Click to stand him on his own';
      el.addEventListener('click', () => { room.showAppearance(entry.appearance); paint(); });
    }
    stripEl.appendChild(el);
    return el;
  }) : [];
}

function moveStrip() {
  if (chips.length === 0) return;
  const places = room.labelPositions();
  const width = stripEl.clientWidth || 1;
  places.forEach((place, i) => {
    if (chips[i]) chips[i].style.left = `${Math.max(4, Math.min(width - 4, place.at * width))}px`;
  });
}

/* ------------------------------------------------------------------ */
/* Painting                                                            */
/* ------------------------------------------------------------------ */

function paint() {
  const { view, subject, row } = room.state;
  const whoEl = document.getElementById('who');
  const noteEl = document.getElementById('note');
  const specEl = document.getElementById('spec');
  const titleEl = document.getElementById('specTitle');
  const solo = row.length === 1;
  const only = solo ? row[0] : null;
  const appearance = only?.appearance ?? null;

  if (view === 'scene' && !solo) {
    const scene = SCENES[subject];
    const cast = appearancesInScene(subject);
    titleEl.textContent = 'WHO IS IN THIS ROOM';
    whoEl.innerHTML = `${scene.label}<span class="badge photo">${cast.length}</span>`;
    noteEl.textContent = scene.note;
    specEl.innerHTML = paintFlags(cast) + paintRoster(cast);
  } else if (view === 'character' && !solo) {
    const cast = appearancesOf(subject);
    titleEl.textContent = 'THE SAME PERSON, EVERY SCENE';
    whoEl.innerHTML = `${cast[0].name}<span class="badge ${faces.has(faceOf(subject)) ? 'photo' : 'authored'}">`
      + `${cast.length} appearance${cast.length === 1 ? '' : 's'}</span>`;
    noteEl.textContent = 'Every scene this person is in, side by side under one light. '
      + 'Rows the panel marks in orange are things the models actually disagree about.';
    specEl.innerHTML = paintCompare(cast) + paintFlags(cast);
  } else if (appearance) {
    titleEl.textContent = 'WHAT THEY ARE WEARING';
    const worn = faces.has(faceOf(appearance.character));
    whoEl.innerHTML = `${appearance.name}`
      + `<span class="badge ${worn ? 'photo' : 'authored'}">${worn ? 'photo face' : 'authored head'}</span>`
      + (appearance.rig === 'block' ? '<span class="badge block">block rig</span>' : '');
    noteEl.textContent = `${SCENES[appearance.scene]?.label} — ${appearance.where}`;
    specEl.innerHTML = paintOne(appearance.model)
      + `<p class="source">Dressed by <code>${appearance.module}</code>.</p>`
      + paintFlags([appearance]);
  } else if (solo) {
    const entry = RAIL[room.state.index];
    titleEl.textContent = 'WHAT THEY ARE WEARING';
    const worn = faces.has(entry.photo);
    whoEl.innerHTML = `${entry.name}<span class="badge ${worn ? 'photo' : 'authored'}">`
      + `${worn ? 'photo face' : 'authored head'}</span>`;
    noteEl.textContent = entry.note;
    specEl.innerHTML = paintOne(entry.model) + paintScenesOf(entry.key);
  } else {
    titleEl.textContent = 'WHAT THEY ARE WEARING';
    whoEl.textContent = 'The whole rail';
    noteEl.textContent = 'Everyone together under one light, which is the only way '
      + 'to see whether they read as one family.';
    specEl.innerHTML = '';
  }

  buildRail();
  for (const b of railEl.children) b.setAttribute('aria-current', b.dataset.current);
  for (const [id, key] of [['tab-scene', 'scene'], ['tab-character', 'character'], ['tab-canonical', 'canonical']]) {
    document.getElementById(id).setAttribute('aria-pressed', String(tabOf() === key));
  }
  const pager = document.getElementById('page');
  pager.classList.toggle('on', room.state.pages > 1);
  document.getElementById('pageAt').textContent = `${room.state.page + 1}/${room.state.pages}`;
  for (const b of marksEl.children) {
    b.setAttribute('aria-pressed', String(solo && b.dataset.mark === room.state.mark));
  }
  document.getElementById('lineup').setAttribute('aria-pressed', String(!solo));
  document.getElementById('spin').setAttribute('aria-pressed', String(room.state.turntable));
  rigEl.value = room.state.rig;
  buildStrip();
  moveStrip();
}

/* The photo a person wears is the ledger's answer, never this page's -- the
 * uniformed staff have no photograph and must not be given one by a guess at
 * `${id}.png`. */
const faceOf = (characterId) => PHOTOS[characterId] ?? '';

/** On a canonical figure: where else in the campaign this person turns up. */
function paintScenesOf(key) {
  const cast = appearancesOf(key);
  if (cast.length === 0) return '';
  const rows = cast.map((a) => `<tr><td class="k">${SCENES[a.scene]?.label ?? a.scene}</td>`
    + `<td class="v">${a.where}</td></tr>`).join('');
  return `<h3 style="margin-top:16px">WHERE HE TURNS UP</h3><table><tbody>${rows}</tbody></table>`;
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

function selectCanonical(i) { room.showSolo(i); paint(); }
function selectScene(id) { room.showScene(id); paint(); }
function selectCharacter(id) { room.showCharacter(id); paint(); }

function step(delta) {
  if (room.state.view === 'scene') {
    const ids = SCENE_LIST.map((s) => s.id);
    const at = ids.indexOf(room.state.subject);
    selectScene(ids[(at + delta + ids.length) % ids.length]);
  } else if (room.state.view === 'character') {
    const ids = PEOPLE.map((p) => p.id);
    const at = ids.indexOf(room.state.subject);
    selectCharacter(ids[(at + delta + ids.length) % ids.length]);
  } else {
    selectCanonical(room.state.index + delta);
  }
}

function turnPage(delta) {
  const page = room.state.page + delta;
  if (page < 0 || page >= room.state.pages) return;
  if (room.state.view === 'scene') room.showScene(room.state.subject, { keepRig: true, page });
  else if (room.state.view === 'character') room.showCharacter(room.state.subject, { page });
  paint();
}

document.getElementById('prev').addEventListener('click', () => step(-1));
document.getElementById('next').addEventListener('click', () => step(1));
document.getElementById('pagePrev').addEventListener('click', () => turnPage(-1));
document.getElementById('pageNext').addEventListener('click', () => turnPage(1));
document.getElementById('lineup').addEventListener('click', () => {
  if (room.state.row.length > 1) {
    if (room.state.view === 'scene') room.showAppearance(appearancesInScene(room.state.subject).filter(isShowable)[0]);
    else if (room.state.view === 'character') room.showAppearance(appearancesOf(room.state.subject).filter(isShowable)[0]);
    else room.showSolo(room.state.index);
  } else if (room.state.view === 'scene') room.showScene(room.state.subject);
  else if (room.state.view === 'character') room.showCharacter(room.state.subject);
  else room.showLineup();
  paint();
});
document.getElementById('spin').addEventListener('click', () => {
  room.state.turntable = !room.state.turntable; paint();
});

/* ---- mouse ---- */
let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', (e) => { dragging = false; canvas.releasePointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  room.state.yaw -= (e.clientX - lastX) * 0.007;
  room.state.pitch = Math.max(-0.9, Math.min(1.1, room.state.pitch + (e.clientY - lastY) * 0.005));
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  room.state.dist = Math.max(0.32, Math.min(24, room.state.dist * (1 + Math.sign(e.deltaY) * 0.11)));
}, { passive: false });

/* ---- keys ---- */
const RIG_KEYS = Object.keys(RIGS);
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') step(1);
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key.toLowerCase() === 't') { room.state.turntable = !room.state.turntable; paint(); }
  else if (e.key.toLowerCase() === 'a') { document.getElementById('lineup').click(); }
  else if (e.key.toLowerCase() === 'r') { room.applyMark(room.state.mark); room.state.yaw = 0; paint(); }
  else if (e.key === '[') turnPage(-1);
  else if (e.key === ']') turnPage(1);
  else if (e.key.toLowerCase() === 'l') {
    const next = RIG_KEYS[(RIG_KEYS.indexOf(room.state.rig) + 1) % RIG_KEYS.length];
    room.applyRig(next); paint();
  } else if (e.key >= '1' && e.key <= String(MARK_ORDER.length)) {
    room.applyMark(MARK_ORDER[Number(e.key) - 1]); paint();
  } else return;
  e.preventDefault();
});

/* ---- loop ---- */
function fit() {
  const r = canvas.parentElement.getBoundingClientRect();
  room.resize(Math.max(1, Math.floor(r.width)), Math.max(1, Math.floor(r.height)));
}
addEventListener('resize', () => { fit(); moveStrip(); });
fit();
paint();

let last = performance.now();
(function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  room.render(dt);
  moveStrip();
  requestAnimationFrame(frame);
})(last);

/* The shot tool waits on this rather than on a timer, and drives the room
 * directly, so a slow software render cannot capture a half-built figure. */
globalThis.fittingRoom = room;
globalThis.fittingRoomPaint = paint;
globalThis.fittingRoomFit = fit;

/* The boot guard's ready signal (see wardrobe.html's data-ready). */
window.__wardrobeReady = true;
