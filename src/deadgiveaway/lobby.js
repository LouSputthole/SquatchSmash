/**
 * The Dead Giveaway lobby card: who you are, which table, which chair.
 *
 * Before a room: a name, a character (every face on the roster), and either
 * "Open a table" or a five-letter code to join one. In a room: the code to
 * read out, eight chairs drawn as a ring (taken ones wear their player's
 * face), the media panel, and -- for the host -- DEAL, live at three players.
 *
 * Nothing here decides anything. Every button is an intent handed to main.js,
 * which sends it; the card re-renders from the next snapshot.
 */
import { ROSTER, characterById, DEFAULT_CHARACTER, isRosterId } from './characters.js';

const NAME_KEY = 'dg.name';
const CHARACTER_KEY = 'dg.character';

function readStored(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeStored(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage refused */ }
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style') node.style.cssText = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

/** Room codes are five of A-Z2-9 without 0/O/1/I; accept what a person types. */
export function normaliseCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

export function normaliseName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

/**
 * @param {object} o
 *   root, seatCount
 *   intents: { create({name, character}), join({code, name, character}),
 *              seat(n), character(id), start(), leave() } -- each may return a Promise
 *   mediaPanel: createMediaPanel() result (mounted inside the card)
 */
export function createLobby({ root, seatCount = 8, intents = {}, mediaPanel = null, initialCode = '' }) {
  let state = null;
  let busy = false;
  let collapsed = false;
  let chosen = isRosterId(readStored(CHARACTER_KEY, DEFAULT_CHARACTER)) ? readStored(CHARACTER_KEY, DEFAULT_CHARACTER) : DEFAULT_CHARACTER;

  const card = el('section', { id: 'dg-lobby', class: 'dg-panel dg-lobby', 'aria-label': 'Dead Giveaway lobby' });
  const title = el('header', { class: 'dg-lobby-head' }, [
    el('div', { class: 'dg-kicker', text: 'Downstairs at the Bada Bing' }),
    el('h1', { text: 'Dead Giveaway' }),
    el('p', { class: 'dg-lede', text: 'Sixteen words on the board. The Family know which one. The Rat does not, and has to sound like he does.' }),
  ]);

  /* ---- before a room ---- */
  const nameInput = el('input', { type: 'text', maxlength: 20, placeholder: 'Your name', 'aria-label': 'Your name', 'data-dg': 'name', value: readStored(NAME_KEY, '') });
  const codeInput = el('input', { type: 'text', maxlength: 5, placeholder: 'CODE', 'aria-label': 'Room code', 'data-dg': 'code', class: 'dg-code-input', value: normaliseCode(initialCode) });
  const createBtn = el('button', { type: 'button', class: 'dg-btn primary', 'data-dg': 'create', text: 'Open a table' });
  const joinBtn = el('button', { type: 'button', class: 'dg-btn', 'data-dg': 'join', text: 'Join' });
  const message = el('div', { class: 'dg-lobby-message', role: 'status', 'data-dg': 'lobby-message' });
  const grid = el('div', { class: 'dg-character-grid', role: 'listbox', 'aria-label': 'Who you sit down as' });
  const gridButtons = new Map();
  for (const c of ROSTER) {
    const btn = el('button', {
      type: 'button', class: 'dg-character', role: 'option', title: c.name, 'data-character': c.id,
      onclick: () => chooseCharacter(c.id),
    }, [
      c.face ? el('img', { src: c.face, alt: '', loading: 'lazy' }) : el('span', { class: 'dg-noface', text: 'T' }),
      el('span', { class: 'dg-character-name', text: c.name }),
    ]);
    gridButtons.set(c.id, btn);
    grid.append(btn);
  }
  const entry = el('div', { class: 'dg-lobby-entry' }, [
    el('label', { class: 'dg-field' }, [el('span', { text: 'Name' }), nameInput]),
    el('div', { class: 'dg-entry-buttons' }, [
      createBtn,
      el('span', { class: 'dg-or', text: 'or' }),
      codeInput,
      joinBtn,
    ]),
  ]);

  /* ---- in a room ---- */
  const codeBadge = el('div', { class: 'dg-room-code', 'data-dg': 'room-code' });
  const ring = el('div', { class: 'dg-seat-ring', 'aria-label': 'Pick a chair' });
  const ringFelt = el('div', { class: 'dg-seat-felt', text: 'TABLE' });
  ring.append(ringFelt);
  const seatButtons = [];
  for (let s = 0; s < seatCount; s++) {
    /* Seat 0 is the door end, clockwise from there -- the world's own order. */
    const a = (s / seatCount) * Math.PI * 2;
    const btn = el('button', {
      type: 'button', class: 'dg-seat', 'data-seat': s,
      style: `left:${50 + Math.sin(a) * 41}%;top:${50 + Math.cos(a) * 41}%`,
      onclick: () => pickSeat(s),
    });
    seatButtons.push(btn);
    ring.append(btn);
  }
  const players = el('ul', { class: 'dg-lobby-players', 'data-dg': 'lobby-players' });
  const startBtn = el('button', { type: 'button', class: 'dg-btn primary', 'data-dg': 'start', text: 'Deal' });
  const startHint = el('div', { class: 'dg-small' });
  const leaveBtn = el('button', { type: 'button', class: 'dg-btn quiet', 'data-dg': 'leave', text: 'Leave the table' });
  const sitBtn = el('button', { type: 'button', class: 'dg-btn quiet', 'data-dg': 'collapse', text: 'Hide this card' });
  const mediaSlot = el('div', { class: 'dg-media-slot' });
  const room = el('div', { class: 'dg-lobby-room hidden' }, [
    el('div', { class: 'dg-room-top' }, [codeBadge, el('div', { class: 'dg-room-buttons' }, [sitBtn, leaveBtn])]),
    el('div', { class: 'dg-room-body' }, [
      el('div', { class: 'dg-room-left' }, [ring, players]),
      el('div', { class: 'dg-room-right' }, [el('div', { class: 'dg-panel-title', text: 'Mic and camera' }), mediaSlot]),
    ]),
    el('div', { class: 'dg-room-start' }, [startBtn, startHint]),
  ]);

  const characterTitle = el('div', { class: 'dg-panel-title', text: 'Sit down as' });
  card.append(title, entry, room, characterTitle, grid, message);
  const reopen = el('button', { type: 'button', class: 'dg-btn dg-lobby-reopen hidden', 'data-dg': 'reopen', text: 'Lobby' });
  root.append(card, reopen);
  if (mediaPanel) mediaPanel.mount(mediaSlot);

  function say(text, bad = false) {
    message.textContent = text || '';
    message.classList.toggle('bad', Boolean(bad));
  }

  async function run(fn) {
    if (busy) return;
    busy = true;
    render();
    try {
      await fn();
    } catch (error) {
      say(error?.message ?? String(error), true);
    } finally {
      busy = false;
      render();
    }
  }

  function chooseCharacter(id) {
    chosen = id;
    writeStored(CHARACTER_KEY, id);
    render();
    if (state?.code && state.phase === 'LOBBY') run(() => intents.character?.(id));
  }

  function pickSeat(seat) {
    if (!state?.code || state.phase !== 'LOBBY') return;
    const taken = state.players?.find((p) => p.seat === seat);
    if (taken) return;
    run(() => intents.seat?.(seat));
  }

  function nameOrComplain() {
    const name = normaliseName(nameInput.value);
    if (!name) {
      say('Tell the table your name first.', true);
      nameInput.focus();
      return null;
    }
    writeStored(NAME_KEY, name);
    return name;
  }

  createBtn.addEventListener('click', () => {
    const name = nameOrComplain();
    if (!name) return;
    run(() => intents.create?.({ name, character: chosen }));
  });
  const join = () => {
    const name = nameOrComplain();
    if (!name) return;
    const code = normaliseCode(codeInput.value);
    if (code.length !== 5) { say('A table code is five characters.', true); codeInput.focus(); return; }
    run(() => intents.join?.({ code, name, character: chosen }));
  };
  joinBtn.addEventListener('click', join);
  codeInput.addEventListener('input', () => { codeInput.value = normaliseCode(codeInput.value); });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); e.stopPropagation(); });
  nameInput.addEventListener('keydown', (e) => e.stopPropagation());
  startBtn.addEventListener('click', () => run(() => intents.start?.()));
  leaveBtn.addEventListener('click', () => run(() => intents.leave?.()));
  sitBtn.addEventListener('click', () => { collapsed = true; render(); });
  reopen.addEventListener('click', () => { collapsed = false; render(); });

  function render(next = state) {
    state = next;
    const inRoom = Boolean(state?.code);
    const lobbyPhase = !inRoom || state.phase === 'LOBBY';
    const me = state?.me?.playerId ?? null;
    const mine = inRoom ? state.players?.find((p) => p.id === me) : null;
    if (mine?.character && isRosterId(mine.character)) chosen = mine.character;

    card.classList.toggle('hidden', !lobbyPhase || (inRoom && collapsed));
    card.classList.toggle('in-room', inRoom);
    reopen.classList.toggle('hidden', !(inRoom && lobbyPhase && collapsed));
    entry.classList.toggle('hidden', inRoom);
    room.classList.toggle('hidden', !inRoom);
    title.classList.toggle('compact', inRoom);
    createBtn.disabled = busy;
    joinBtn.disabled = busy;

    for (const [id, btn] of gridButtons) {
      btn.classList.toggle('chosen', id === chosen);
      btn.setAttribute('aria-selected', String(id === chosen));
      btn.disabled = busy || (inRoom && state.phase !== 'LOBBY');
    }

    if (!inRoom) return;
    codeBadge.replaceChildren(el('span', { text: 'Table' }), el('b', { text: state.code }));
    for (let s = 0; s < seatButtons.length; s++) {
      const btn = seatButtons[s];
      const p = state.players?.find((q) => q.seat === s);
      const face = p ? characterById(p.character).face : null;
      btn.replaceChildren(
        p ? (face ? el('img', { src: face, alt: '' }) : el('span', { class: 'dg-noface', text: (p.name || '?').slice(0, 1) })) : el('span', { class: 'dg-seat-n', text: String(s + 1) }),
        el('span', { class: 'dg-seat-name', text: p ? p.name : 'Free' }),
      );
      btn.classList.toggle('taken', Boolean(p));
      btn.classList.toggle('mine', Boolean(p && p.id === me));
      btn.classList.toggle('away', Boolean(p && p.connected === false));
      btn.disabled = busy || Boolean(p);
      btn.title = p ? `${p.name} — ${characterById(p.character).name}` : `Chair ${s + 1}: sit here`;
    }
    players.replaceChildren(...(state.players ?? []).slice().sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99)).map((p) => el('li', {
      class: `${p.id === me ? 'me' : ''} ${p.connected === false ? 'away' : ''}`.trim(),
    }, [
      el('b', { text: p.name }),
      el('span', { text: ` ${characterById(p.character).name}${p.isHost ? ' · host' : ''}${p.connected === false ? ' · stepped out' : ''}` }),
    ])));
    const connected = (state.players ?? []).filter((p) => p.connected !== false).length;
    const min = state.settings?.minPlayers ?? 3;
    const host = Boolean(me && (state.hostId === me || mine?.isHost));
    startBtn.classList.toggle('hidden', !host);
    startBtn.disabled = busy || connected < min;
    startHint.textContent = host
      ? (connected < min ? `Deal opens at ${min} players. ${connected} here.` : `${connected} at the table. Deal when you are ready.`)
      : `Waiting on the host to deal. ${connected} at the table.`;
  }

  render(null);

  return {
    el: card,
    render,
    say,
    get character() { return chosen; },
    get name() { return normaliseName(nameInput.value); },
    collapse(on = true) { collapsed = on; render(); },
    get collapsed() { return collapsed; },
    get visible() { return !card.classList.contains('hidden'); },
  };
}
