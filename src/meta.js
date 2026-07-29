import { SKINS } from './player.js';

// Career progression — everything here lives in localStorage on this machine.
// No server, no network: the board and the career are whatever this computer
// has played.

const META_KEY = 'squatchsmash-meta';

// Rank is deliberately not raw score: wrecking the place and finishing goals
// count for as much as points do, so a thorough run outranks a lucky one.
export const RANKS = [
  { key: 'S', label: 'S', title: 'SASQUATCH SUPREME', min: 190000, color: '#ffd75e' },
  { key: 'A', label: 'A', title: 'APEX PREDATOR', min: 130000, color: '#7dffb0' },
  { key: 'B', label: 'B', title: 'BRUISER', min: 85000, color: '#9a6ff0' },
  { key: 'C', label: 'C', title: 'CASUAL VANDAL', min: 50000, color: '#c4cde0' },
  { key: 'D', label: 'D', title: 'DAY TRIPPER', min: 0, color: '#8a92ab' },
];

export function ratingFor({ score = 0, wreckedPct = 0, goalsDone = 0 }) {
  return Math.round(score + wreckedPct * 400 + goalsDone * 2000);
}

export function rankFor(rating) {
  return RANKS.find((r) => rating >= r.min) || RANKS[RANKS.length - 1];
}

// The rank above the current one, for the "next rank" nudge on the end screen.
export function nextRank(rating) {
  const better = RANKS.filter((r) => r.min > rating);
  return better.length ? better[better.length - 1] : null;
}

// Skin unlock requirements, checked against career totals.
export const UNLOCKS = {
  silver: { req: null, label: 'Always yours' },
  midnight: { req: (m) => m.runs >= 3, label: 'Play 3 rampages' },
  bigfoot: { req: (m) => m.smashed >= 250, label: 'Smash 250 things (career)' },
  blaze: { req: (m) => m.goals >= 10, label: 'Earn 10 goals (career)' },
  yeti: { req: (m) => m.bestRating >= 130000, label: 'Finish a run at rank A' },
  golden: { req: (m) => m.bestRating >= 190000, label: 'Finish a run at rank S' },
};

const EMPTY = {
  runs: 0, score: 0, smashed: 0, kills: 0, scared: 0, goals: 0,
  bestRating: 0, bestRank: '', skin: 'silver',
};

export function loadMeta() {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    const m = { ...EMPTY };
    for (const k of Object.keys(EMPTY)) {
      if (typeof raw[k] === typeof EMPTY[k]) m[k] = raw[k];
    }
    if (!SKINS.some((s) => s.id === m.skin)) m.skin = 'silver';
    return m;
  } catch { return { ...EMPTY }; }
}

export function saveMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* best effort */ }
}

export function isUnlocked(skinId, meta) {
  const u = UNLOCKS[skinId];
  if (!u) return true;
  return !u.req || u.req(meta);
}

export function unlockedSkins(meta) {
  return SKINS.filter((s) => isUnlocked(s.id, meta));
}

export function setSkin(skinId) {
  const m = loadMeta();
  m.skin = skinId;
  saveMeta(m);
  return m;
}

// Folds one finished run into the career totals. Returns { meta, unlocked }
// where `unlocked` is any skin this run just earned.
export function recordRun(summary) {
  const before = loadMeta();
  const wasUnlocked = new Set(unlockedSkins(before).map((s) => s.id));
  const m = { ...before };
  m.runs += 1;
  m.score += summary.score || 0;
  m.smashed += summary.smashed || 0;
  m.kills += summary.kills || 0;
  m.scared += summary.scared || 0;
  m.goals += summary.goals || 0;
  if ((summary.rating || 0) > m.bestRating) {
    m.bestRating = summary.rating;
    m.bestRank = summary.rank;
  }
  saveMeta(m);
  const unlocked = unlockedSkins(m).filter((s) => !wasUnlocked.has(s.id));
  return { meta: m, unlocked };
}

export function renderCareer(el, meta) {
  const rows = [
    ['Rampages', meta.runs.toLocaleString()],
    ['Career score', meta.score.toLocaleString()],
    ['Things smashed', meta.smashed.toLocaleString()],
    ['Humans flattened', meta.kills.toLocaleString()],
    ['Campers scared off', meta.scared.toLocaleString()],
    ['Goals earned', meta.goals.toLocaleString()],
    ['Best rank', meta.bestRank || '—'],
  ];
  el.innerHTML = '';
  for (const [label, value] of rows) {
    const div = document.createElement('div');
    div.className = 'career-row';
    div.innerHTML = '<span class="cl"></span><span class="cv"></span>';
    div.querySelector('.cl').textContent = label;
    div.querySelector('.cv').textContent = value;
    el.appendChild(div);
  }
}

// Skin picker. onPick(skinId) fires only for unlocked skins.
export function renderSkins(el, meta, onPick) {
  el.innerHTML = '';
  for (const skin of SKINS) {
    const open = isUnlocked(skin.id, meta);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `skin${open ? '' : ' locked'}${meta.skin === skin.id ? ' active' : ''}`;
    btn.title = open ? skin.name : `LOCKED — ${UNLOCKS[skin.id].label}`;
    btn.disabled = !open;
    const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
    btn.innerHTML =
      `<span class="chip" style="background:${hex(skin.pal.fur)};border-color:${hex(skin.pal.bandana)}"></span>` +
      '<span class="sn"></span>';
    btn.querySelector('.sn').textContent = open ? skin.name : '🔒 ' + skin.name;
    if (open) btn.addEventListener('click', () => onPick(skin.id));
    el.appendChild(btn);
  }
}
