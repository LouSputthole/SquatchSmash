/**
 * Dead Giveaway's table HUD: phase bar, role card, lives, action legend, the
 * board overlay (B), the clue list (C), chat (Enter), and the one action panel
 * that changes with the phase -- clue entry, ready/vote, the reveal, Your
 * Last Word, Payback, the resolution and the end of the match.
 *
 * THE CLIENT NEVER SIMULATES A RULE. Everything on screen is derived from the
 * latest server `state` snapshot by the pure functions at the top of this
 * file (tested in tests/deadgiveaway-table-ui.test.mjs), so a reload or a
 * reconnect re-renders the same screen from the same snapshot. The only
 * local state is presentation: which overlay is open, which name the player
 * has clicked but not yet confirmed, and the chat log.
 *
 * Player-facing words are fixed: Dead Giveaway, The Rat, the Family.
 */

export const PHASES = Object.freeze([
  'LOBBY', 'DEAL', 'CLUES', 'DISCUSS', 'VOTE', 'VOTE_RESULT',
  'ROLE_REVEAL', 'LAST_WORD', 'PAYBACK', 'RESOLVE', 'MATCH_OVER',
]);

export const PHASE_LABELS = Object.freeze({
  LOBBY: 'The Lobby',
  DEAL: 'The Deal',
  CLUES: 'Clues',
  DISCUSS: 'Discussion',
  VOTE: 'The Vote',
  VOTE_RESULT: 'The Count',
  ROLE_REVEAL: 'The Reveal',
  LAST_WORD: 'Your Last Word',
  PAYBACK: 'Payback',
  RESOLVE: 'Settled',
  MATCH_OVER: 'Match Over',
});

export const SAID_NOTHING = '— said nothing —';

export function phaseLabel(phase) {
  return PHASE_LABELS[phase] ?? String(phase ?? '');
}

/* ------------------------------------------------------------------ */
/* Pure view-model                                                     */
/* ------------------------------------------------------------------ */

const playersOf = (state) => (Array.isArray(state?.players) ? state.players : []);
const bySeat = (a, b) => (a.seat ?? 99) - (b.seat ?? 99);

export function myId(state) {
  return state?.me?.playerId ?? null;
}

export function playerById(state, id) {
  if (!id) return null;
  return playersOf(state).find((p) => p.id === id) ?? null;
}

export function playerAtSeat(state, seat) {
  if (seat === null || seat === undefined) return null;
  return playersOf(state).find((p) => p.seat === seat) ?? null;
}

export function nameOf(state, id) {
  return playerById(state, id)?.name ?? 'Somebody';
}

/** Alive means still holding chips: not out. Disconnected players are alive. */
export function alivePlayers(state) {
  return playersOf(state).filter((p) => !p.out).sort(bySeat);
}

/** The host, read from every snapshot: `hostId`, or the player flagged `isHost`. */
export function hostIdOf(state) {
  return state?.hostId ?? playersOf(state).find((p) => p.isHost)?.id ?? null;
}

export function isHost(state, id = myId(state)) {
  if (!id) return false;
  const p = playerById(state, id);
  return hostIdOf(state) === id || Boolean(p?.isHost);
}

export function ratIdOf(state) {
  return state?.result?.ratId ?? null;
}

/**
 * Who the server is waiting on right now, and for what.
 * @returns {{ action: string|null, playerIds: string[] }}
 */
export function whoMayAct(state) {
  const phase = state?.phase;
  const ids = (list) => list.map((p) => p.id);
  switch (phase) {
    case 'LOBBY':
      return { action: 'start', playerIds: hostIdOf(state) ? [hostIdOf(state)] : [] };
    case 'CLUES': {
      const turn = playerAtSeat(state, state?.turnSeat);
      return { action: 'clue', playerIds: turn && !turn.out ? [turn.id] : [] };
    }
    case 'DISCUSS':
      return { action: 'ready', playerIds: ids(alivePlayers(state).filter((p) => p.connected !== false && !p.readyToVote)) };
    case 'VOTE':
      return { action: 'vote', playerIds: ids(alivePlayers(state).filter((p) => p.connected !== false && !p.hasVoted)) };
    case 'LAST_WORD':
      return { action: 'lastWord', playerIds: ratIdOf(state) ? [ratIdOf(state)] : [] };
    case 'PAYBACK':
      return { action: 'payback', playerIds: ratIdOf(state) ? [ratIdOf(state)] : [] };
    case 'RESOLVE':
    case 'MATCH_OVER':
      return { action: 'next', playerIds: hostIdOf(state) ? [hostIdOf(state)] : [] };
    default:
      return { action: null, playerIds: [] };
  }
}

/** The action this client may take now, or null. */
export function myAction(state) {
  const me = myId(state);
  const { action, playerIds } = whoMayAct(state);
  return me && playerIds.includes(me) ? action : null;
}

/** Everyone you may vote for: alive, seated, not you. Seat order. */
export function voteCandidates(state, selfId = myId(state)) {
  return alivePlayers(state).filter((p) => p.id !== selfId && p.seat !== null && p.seat !== undefined);
}

/** Everyone the Rat may make pay: alive, not the Rat. */
export function paybackCandidates(state) {
  const rat = ratIdOf(state) ?? (state?.me?.role === 'rat' ? myId(state) : null);
  return alivePlayers(state).filter((p) => p.id !== rat && p.seat !== null && p.seat !== undefined);
}

/**
 * What both boards show. The Family see the target lit red; the Rat never
 * does, whatever the snapshot carries. The word goes gold for everybody
 * once the server publishes it (RESOLVE and later).
 */
export function boardModel(state) {
  const card = state?.card;
  const phase = state?.phase;
  const revealIndex = Number.isInteger(state?.result?.targetIndex) ? state.result.targetIndex : null;
  if (!card || !Array.isArray(card.words)) {
    return { category: '', words: [], highlightIndex: null, revealIndex: null, pickIndex: null, dim: true };
  }
  const family = state?.me?.role === 'family';
  const highlightIndex = family && Number.isInteger(state?.me?.targetIndex) ? state.me.targetIndex : null;
  const pick = state?.result?.lastWord?.index;
  return {
    category: card.category ?? '',
    words: card.words.slice(0, 16),
    highlightIndex,
    revealIndex,
    pickIndex: Number.isInteger(pick) ? pick : null,
    dim: phase === 'LOBBY',
  };
}

/** Clues in the order they were given; a skipped turn reads as silence. */
export function clueList(state) {
  const clues = Array.isArray(state?.clues) ? [...state.clues] : [];
  clues.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return clues.map((c) => ({
    playerId: c.playerId,
    seat: c.seat,
    name: nameOf(state, c.playerId),
    text: c.text === null || c.text === undefined || c.text === '' ? SAID_NOTHING : String(c.text),
    silent: c.text === null || c.text === undefined || c.text === '',
  }));
}

/**
 * Every player's role, once the server has revealed them. Empty before
 * ROLE_REVEAL, because the roles are not in the snapshot until then.
 */
export function revealList(state) {
  const roles = state?.result?.roles;
  if (!roles) return [];
  const rat = ratIdOf(state);
  const tally = state?.result?.tally ?? {};
  const me = myId(state);
  return playersOf(state)
    .filter((p) => roles[p.id])
    .sort(bySeat)
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      seat: p.seat,
      role: roles[p.id],
      label: roles[p.id] === 'rat' ? 'THE RAT' : 'FAMILY',
      isRat: p.id === rat,
      votes: tally[p.id] ?? 0,
      accused: p.id === state?.result?.accusedId,
      isMe: p.id === me,
    }));
}

/* The reveal, played out one head at a time. Owner, first playtest: "The
 * reveal should go one player at a time over their head. Reveal all the
 * family first then last the rat." Every role is in the first ROLE_REVEAL
 * snapshot; this is only the pacing. The server's window is ROLE_REVEAL
 * (4 s) + REVEAL_STEP (1.5 s) per Family member, so the Rat lands with 2.4 s
 * of his own beat left whatever the table size. */
export const REVEAL_LEAD_MS = 700;
export const REVEAL_STEP_MS = 1500;
export const REVEAL_RAT_PAUSE_MS = 900;

/** revealList in reveal order (the Family by seat, then the Rat), each with `at` ms after the phase began. */
export function revealSchedule(state) {
  const list = revealList(state);
  const ordered = [...list.filter((r) => !r.isRat), ...list.filter((r) => r.isRat)];
  return ordered.map((r, i) => ({ ...r, at: REVEAL_LEAD_MS + i * REVEAL_STEP_MS + (r.isRat ? REVEAL_RAT_PAUSE_MS : 0) }));
}

/** Who has shown their card `elapsedMs` into the reveal. Every role after ROLE_REVEAL; nobody before it. */
export function revealedIds(state, elapsedMs) {
  const schedule = revealSchedule(state);
  if (state?.phase !== 'ROLE_REVEAL') return schedule.map((r) => r.playerId);
  return schedule.filter((r) => r.at <= elapsedMs).map((r) => r.playerId);
}

/**
 * The big title for a change at the table, or null. Owner: "We need more
 * clear indications as the round progresses like big titles in the screen."
 * `prev` is the last snapshot shown (or null on the first one).
 */
export function bannerFor(prev, state) {
  if (!state || !state.phase || state.phase === 'LOBBY') return null;
  const me = myId(state);
  const rat = ratIdOf(state);
  const phaseChanged = !prev || prev.phase !== state.phase || prev.round !== state.round;
  if (state.phase === 'CLUES') {
    const turn = playerAtSeat(state, state.turnSeat);
    if (!turn || (!phaseChanged && prev.turnSeat === state.turnSeat)) return null;
    if (turn.id === me) return { title: 'Your turn', sub: 'Click your card on the table and write one clue.', kind: 'you' };
    if (phaseChanged) return { title: 'Clues', sub: `${turn.name} writes first.` };
    return { title: turn.name, sub: 'is writing…', kind: 'small' };
  }
  if (!phaseChanged) return null;
  switch (state.phase) {
    case 'DEAL':
      return { title: state.round > 1 ? `Round ${state.round}` : 'The Deal', sub: 'Somebody at this table is the Rat.' };
    case 'DISCUSS':
      return { title: 'Discussion', sub: 'Talk it over. Who did not know the word?' };
    case 'VOTE':
      return { title: 'The Vote', sub: 'Click the man you think is the Rat.' };
    case 'VOTE_RESULT': {
      const accused = state.result?.accusedId;
      return accused
        ? { title: accused === me ? 'They point at you' : `${nameOf(state, accused)} is accused`, sub: 'Now everybody shows their card.' }
        : { title: 'A split table', sub: 'Nobody is accused. Now everybody shows their card.' };
    }
    case 'ROLE_REVEAL':
      return { title: 'The Reveal', sub: 'Everybody shows their card.' };
    case 'LAST_WORD':
      return rat === me
        ? { title: 'Your Last Word', sub: 'Click the word on the board.', kind: 'rat' }
        : { title: 'The Last Word', sub: `${nameOf(state, rat)} gets one guess at the word.` };
    case 'PAYBACK':
      return rat === me
        ? { title: 'Payback', sub: 'They got the wrong man. Click who pays for it.', kind: 'rat' }
        : { title: 'Payback', sub: `${nameOf(state, rat)} walked. Somebody pays for that.` };
    case 'RESOLVE':
      return { title: 'Settled', sub: resolveText(state) };
    case 'MATCH_OVER':
      return { title: 'Match Over', sub: matchText(state) };
    default:
      return null;
  }
}

export function voteProgress(state) {
  const voters = alivePlayers(state).filter((p) => p.connected !== false);
  return { voted: voters.filter((p) => p.hasVoted).length, total: voters.length };
}

export function readyProgress(state) {
  const voters = alivePlayers(state).filter((p) => p.connected !== false);
  return { ready: voters.filter((p) => p.readyToVote).length, total: voters.length };
}

export function roleCard(state) {
  const role = state?.me?.role ?? null;
  const self = playerById(state, myId(state));
  if (!role && self?.out && state?.phase && state.phase !== 'LOBBY') {
    return { role: 'out', label: 'SITTING OUT', hint: 'You are not dealt in. Watch the table; you play from the next match.' };
  }
  if (role === 'rat') {
    return { role, label: 'THE RAT', hint: 'You do not know the word. Nobody can know that.' };
  }
  if (role === 'family') {
    return { role, label: 'THE FAMILY', hint: 'The word is lit on the board. One of you is lying.' };
  }
  return { role: null, label: '', hint: '' };
}

/** The line under the phase name: whose turn, or what the table is doing. */
export function turnText(state) {
  const me = myId(state);
  const phase = state?.phase;
  const rat = ratIdOf(state);
  switch (phase) {
    case 'LOBBY': {
      const connected = playersOf(state).filter((p) => p.connected !== false).length;
      const min = state?.settings?.minPlayers ?? 3;
      return connected >= min ? 'Waiting on the host to deal.' : `Waiting for players: ${connected} of ${min} at the table.`;
    }
    case 'DEAL':
      return 'Cards are going round. Somebody here is the Rat.';
    case 'CLUES': {
      const turn = playerAtSeat(state, state?.turnSeat);
      if (!turn) return 'Clues.';
      if (turn.id === me) return 'Your turn. One clue. Do not give it away.';
      if (turn.connected === false) return `${turn.name} has stepped out. The host can skip the turn.`;
      return `${turn.name} is writing…`;
    }
    case 'DISCUSS': {
      const { ready, total } = readyProgress(state);
      return `Talk it over. Ready to vote: ${ready} of ${total}.`;
    }
    case 'VOTE': {
      const { voted, total } = voteProgress(state);
      return `Point at the Rat. ${voted} of ${total} have voted.`;
    }
    case 'VOTE_RESULT': {
      const accused = state?.result?.accusedId;
      return accused ? `The table points at ${nameOf(state, accused)}.` : 'A split table. Nobody is accused.';
    }
    case 'ROLE_REVEAL':
      /* Never the Rat's name: the reveal goes head by head and he is last. */
      return 'Everybody shows their card.';
    case 'LAST_WORD':
      return rat === me
        ? 'You have been made. Name the word and you keep your chips.'
        : `${nameOf(state, rat)} gets one last word.`;
    case 'PAYBACK':
      return rat === me
        ? 'They got the wrong man. Pick who pays for it.'
        : `${nameOf(state, rat)} walked. Somebody pays for that.`;
    case 'RESOLVE':
      return resolveText(state);
    case 'MATCH_OVER':
      return matchText(state);
    default:
      return '';
  }
}

export function resolveText(state) {
  const r = state?.result;
  if (!r) return 'The round is settled.';
  if (r.voided) return 'The round is off. Nobody loses a chip.';
  const parts = [];
  if (r.lastWord) {
    if (r.lastWord.correct) parts.push('The Rat named the word.');
    else if (!Number.isInteger(r.lastWord.index)) parts.push('The Rat ran out of time.');
    else parts.push('The Rat named the wrong word.');
  }
  if (r.payback?.targetId) parts.push(`${nameOf(state, r.payback.targetId)} took the payback.`);
  if (r.lifeLoss?.playerId) {
    const n = r.lifeLoss.livesAfter;
    parts.push(`${nameOf(state, r.lifeLoss.playerId)} loses a chip — ${n} left.`);
  } else {
    parts.push('Nobody loses a chip.');
  }
  return parts.join(' ');
}

export function matchText(state) {
  const winners = state?.match?.winnerIds ?? [];
  if (!winners.length) return 'Nobody walks away with anything.';
  const names = winners.map((id) => nameOf(state, id));
  return `Still at the table: ${names.join(', ')}.`;
}

export function hudModel(state) {
  const me = playerById(state, myId(state));
  const card = roleCard(state);
  return {
    phase: state?.phase ?? null,
    phaseText: phaseLabel(state?.phase),
    round: state?.round > 0 ? state.round : null,
    turnText: turnText(state),
    role: card.role,
    roleText: card.label,
    roleHint: card.hint,
    lives: me?.lives ?? null,
    maxLives: state?.settings?.lives ?? 3,
    out: Boolean(me?.out),
    isHost: isHost(state),
    code: state?.code ?? '',
  };
}

export const ACTION_LABELS = Object.freeze({
  drink: 'Drink',
  smoke: 'Smoke',
  spit: 'Spit',
  point: 'Point',
  lean: 'Lean back',
  shake: 'Shake head',
  raise: 'Raise glass',
  nod: 'Nod',
  finger: 'Middle finger',
});

/** "Digit3" -> "3", "KeyQ" -> "Q". */
export function keyCap(code) {
  if (typeof code !== 'string') return '';
  const m = /^(?:Digit|Key|Numpad)(.+)$/.exec(code);
  return m ? m[1] : code;
}

/** The action legend: one row per gesture, in ACTIONS order, plus the table keys. */
export function legendModel(actions, keyFor) {
  const rows = actions.map((kind) => ({ kind, key: keyCap(keyFor(kind)), label: ACTION_LABELS[kind] ?? kind }));
  return [
    ...rows,
    { kind: 'board', key: 'B', label: 'Board' },
    { kind: 'clues', key: 'C', label: 'Clues' },
    { kind: 'zoom', key: 'RMB', label: 'Hold to zoom' },
    { kind: 'chat', key: 'Enter', label: 'Chat' },
    { kind: 'pause', key: 'Tab', label: 'Menu' },
  ];
}

/** Host-only buttons that make sense right now. */
export function hostControls(state) {
  if (!isHost(state)) return [];
  const out = [];
  if (state.phase === 'CLUES') {
    /* CLUES has no timer, so a connected player who just sits there would
     * hold the table forever. The host may skip any turn but their own. */
    const turn = playerAtSeat(state, state.turnSeat);
    if (turn && turn.id !== hostIdOf(state)) out.push('skipTurn');
  }
  if (state.phase === 'DISCUSS') out.push('callVote');
  if (state.phase === 'RESOLVE') out.push('next');
  if (state.phase === 'MATCH_OVER') out.push('backToLobby');
  if (state.phase !== 'LOBBY') out.push('abort');
  return out;
}

/** Seconds left on a server-timed phase, or null. */
export function secondsLeft(state, now = Date.now()) {
  const end = state?.phaseEndsAt;
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/**
 * @param {object} o
 *   root           element the HUD mounts into
 *   faceFor(id)    character id -> face url|null (for little portraits)
 *   legend         legendModel(...) rows
 *   intents        { clue(text), ready(bool), callVote(), vote(id), lastWord(i),
 *                    payback(id), next(), abort(), skipTurn(), chat(text) }
 *   onSelect(id)   the player clicked a name (vote/payback selection), so the
 *                  3D view can mark the same seat
 *   onTypingChange(bool)  chat/clue input focused, so look/keys stand down
 *   onClueDraft(text)     the clue being written changed, so the card on the
 *                         felt can show it as it is written
 */
export function createTableUi({ root, faceFor = () => null, legend = [], intents = {}, onSelect = () => {}, onTypingChange = () => {}, onClueDraft = () => {} }) {
  const ui = {
    state: null,
    /* Owner: "The cards being on the screen by default would be nice." */
    boardOpen: true,
    boardForced: false,
    cluesOpen: true,
    chatOpen: false,
    selected: null,
    sentFor: '',
    abortArmed: null,
    clueOpen: false,      // the writing box is out (the player clicked his card)
    draft: '',
    clueKey: '',          // round|turnSeat the draft belongs to
    revealed: null,       // Set of playerIds whose card is shown, during the reveal
    prev: null,           // { phase, round, turnSeat } of the last snapshot, for banners
  };

  const hud = el('div', { id: 'dg-hud', class: 'dg-panel dg-hud', 'aria-live': 'polite' });
  const hudPhase = el('div', { class: 'dg-hud-phase' });
  const hudTurn = el('div', { class: 'dg-hud-turn', 'data-dg': 'turn' });
  const hudRole = el('div', { class: 'dg-role', 'data-dg': 'role' });
  const hudLives = el('div', { class: 'dg-lives', 'data-dg': 'lives' });
  const hudTimer = el('div', { class: 'dg-timer' });
  hud.append(el('div', { class: 'dg-hud-main' }, [hudPhase, hudTurn]), hudTimer, hudRole, hudLives);

  const legendEl = el('div', { id: 'dg-legend', class: 'dg-panel dg-legend' }, legend.map((row) => el('div', { class: 'dg-legend-row' }, [
    el('kbd', { text: row.key }), el('span', { text: row.label }),
  ])));

  const boardEl = el('div', { id: 'dg-board', class: 'dg-panel dg-board hidden', 'data-dg': 'board' });
  const boardTitle = el('div', { class: 'dg-board-title' });
  const boardGrid = el('div', { class: 'dg-board-grid' });
  const boardHint = el('div', { class: 'dg-board-hint' });
  /* The Rat's confirm lives on the board itself, under the words he is
   * choosing from, not at the bottom of the screen. */
  const boardConfirm = el('button', {
    type: 'button', class: 'dg-btn confirm hidden', 'data-dg': 'confirm-last-word',
    onclick: () => { if (Number.isInteger(ui.selected)) intents.lastWord?.(ui.selected); },
  });
  boardEl.append(boardTitle, boardGrid, boardHint, boardConfirm);
  const boardCells = [];
  for (let i = 0; i < 16; i++) {
    const cell = el('button', {
      type: 'button',
      class: 'dg-word',
      'data-index': i,
      onclick: () => {
        if (myAction(ui.state) !== 'lastWord') return;
        ui.selected = i;
        render();
      },
    });
    boardCells.push(cell);
    boardGrid.append(cell);
  }

  const cluesEl = el('div', { id: 'dg-clues', class: 'dg-panel dg-clues' });
  const cluesList = el('ol', { class: 'dg-clue-list', 'data-dg': 'clues' });
  cluesEl.append(el('div', { class: 'dg-panel-title', text: 'Clues' }), cluesList);

  const chatEl = el('div', { id: 'dg-chat', class: 'dg-panel dg-chat' });
  const chatLog = el('div', { class: 'dg-chat-log', 'data-dg': 'chat-log' });
  const chatInput = el('input', {
    type: 'text', maxlength: 200, class: 'dg-chat-input hidden', placeholder: 'Say something to the table — Enter sends, Esc closes',
    'aria-label': 'Chat message',
  });
  chatEl.append(chatLog, chatInput);

  const actionEl = el('div', { id: 'dg-action', class: 'dg-panel dg-action hidden', 'data-dg': 'action' });
  const toastEl = el('div', { id: 'dg-toasts', class: 'dg-toasts' });
  const crosshair = el('div', { id: 'dg-crosshair', class: 'dg-crosshair' });
  const bannerEl = el('div', { id: 'dg-banner', class: 'dg-banner', 'data-dg': 'banner', 'aria-live': 'assertive' });
  let clueClock = null;   // the seconds on the writing card, ticked by renderTimer

  root.append(hud, legendEl, cluesEl, boardEl, chatEl, actionEl, toastEl, crosshair, bannerEl);

  /** A big title across the middle of the screen for a moment. */
  function banner(b) {
    if (!b?.title) return;
    bannerEl.className = `dg-banner ${b.kind ?? ''}`.trim();
    bannerEl.replaceChildren(
      el('div', { class: 'dg-banner-title', text: b.title }),
      b.sub ? el('div', { class: 'dg-banner-sub', text: b.sub }) : '',
    );
    void bannerEl.offsetWidth;   // restart the transition when one title follows another
    bannerEl.classList.add('show');
    clearTimeout(banner.t);
    banner.t = setTimeout(() => bannerEl.classList.remove('show'), b.ms ?? (b.kind === 'small' ? 1600 : 2600));
  }

  function typing(on) { onTypingChange(Boolean(on)); }
  chatInput.addEventListener('focus', () => typing(true));
  chatInput.addEventListener('blur', () => typing(false));
  chatInput.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      const text = chatInput.value.trim();
      if (text) intents.chat?.(text.slice(0, 200));
      chatInput.value = '';
      closeChat();
      event.preventDefault();
    } else if (event.key === 'Escape') {
      closeChat();
      event.preventDefault();
    }
  });

  function openChat() {
    ui.chatOpen = true;
    chatInput.classList.remove('hidden');
    chatEl.classList.add('open');
    chatInput.focus();
  }
  function closeChat() {
    ui.chatOpen = false;
    chatInput.blur();
    chatInput.classList.add('hidden');
    chatEl.classList.remove('open');
  }

  function addChat({ name, text }) {
    const line = el('div', { class: 'dg-chat-line' }, [el('b', { text: `${name}: ` }), el('span', { text })]);
    chatLog.append(line);
    while (chatLog.children.length > 40) chatLog.firstChild.remove();
    chatLog.scrollTop = chatLog.scrollHeight;
    chatEl.classList.add('fresh');
    clearTimeout(addChat._t);
    addChat._t = setTimeout(() => chatEl.classList.remove('fresh'), 8000);
  }

  function toast(text, kind = '') {
    const t = el('div', { class: `dg-toast ${kind}`.trim(), text });
    toastEl.append(t);
    setTimeout(() => t.classList.add('gone'), 3600);
    setTimeout(() => t.remove(), 4200);
  }

  function select(id) {
    ui.selected = id;
    onSelect(id);
    render();
  }
  /* Selection feeds the action panel's signature, so a click re-renders it. */

  /* ---------------- render ---------------- */

  function renderHud(state) {
    const m = hudModel(state);
    hudPhase.textContent = m.round ? `${m.phaseText} · Round ${m.round}` : m.phaseText;
    hudTurn.textContent = m.turnText;
    hudRole.className = `dg-role ${m.role ?? 'none'}`;
    hudRole.replaceChildren(
      m.roleText ? el('b', { text: m.roleText }) : '',
      m.roleHint ? el('span', { text: m.roleHint }) : '',
    );
    hudRole.classList.toggle('hidden', !m.roleText);
    hudLives.replaceChildren();
    if (m.lives !== null && state.phase !== 'LOBBY') {
      for (let i = 0; i < Math.max(m.maxLives, m.lives); i++) {
        hudLives.append(el('i', { class: i < m.lives ? 'chip' : 'chip spent' }));
      }
      if (m.out) hudLives.append(el('span', { class: 'dg-out', text: 'OUT' }));
    }
  }

  function renderBoard(state) {
    const b = boardModel(state);
    boardTitle.textContent = b.category || 'The board';
    const pickMode = myAction(state) === 'lastWord';
    for (let i = 0; i < 16; i++) {
      const cell = boardCells[i];
      cell.textContent = b.words[i] ?? '';
      cell.classList.toggle('hl', b.highlightIndex === i);
      cell.classList.toggle('reveal', b.revealIndex === i);
      cell.classList.toggle('pick', b.pickIndex === i || (pickMode && ui.selected === i));
      cell.classList.toggle('dim', b.dim);
      cell.disabled = !pickMode;
    }
    boardHint.textContent = pickMode
      ? 'Your Last Word. Click the word you think it is.'
      : b.highlightIndex !== null ? 'The red word is the one. Keep it to yourself.' : '';
    boardConfirm.classList.toggle('hidden', !pickMode);
    boardConfirm.disabled = !Number.isInteger(ui.selected);
    boardConfirm.textContent = Number.isInteger(ui.selected) ? `Name it: ${b.words[ui.selected]}` : 'Pick a word';
    /* The Rat's Last Word is played on this board, so it opens for him,
     * moves to the middle of the screen and stays there. Owner: "The card
     * for the rat should become centered right before they have to pick a
     * word so when they are chosing their word its obvious they just click
     * the board." Everybody else watches it come up on the wall board. */
    ui.boardForced = pickMode;
    boardEl.classList.toggle('center', pickMode);
    /* During the reveal the corner panel steps aside: it sat over the right
     * side of the table and hid a seat's card in the first screenshot. */
    const aside = state.phase === 'ROLE_REVEAL';
    boardEl.classList.toggle('hidden', !(ui.boardOpen || ui.boardForced) || !b.words.length || aside);
  }

  function renderClues(state) {
    const list = clueList(state);
    cluesList.replaceChildren(...list.map((c) => el('li', { class: c.silent ? 'silent' : '' }, [
      el('b', { text: c.name }), el('span', { text: c.text }),
    ])));
    const turn = state.phase === 'CLUES' ? playerAtSeat(state, state.turnSeat) : null;
    if (turn && turn.id !== myId(state)) {
      cluesList.append(el('li', { class: 'writing' }, [el('b', { text: turn.name }), el('span', { text: 'is writing…' })]));
    }
    const show = ui.cluesOpen && state.phase !== 'LOBBY' && (list.length > 0 || turn);
    cluesEl.classList.toggle('hidden', !show);
  }

  function personRow(p, { selected, onclick, extra = null, cls = '' }) {
    const face = faceFor(p.character);
    return el('button', {
      type: 'button',
      class: `dg-person ${selected ? 'selected' : ''} ${cls}`.trim(),
      'data-player': p.id,
      onclick,
    }, [
      face ? el('img', { src: face, alt: '' }) : el('span', { class: 'dg-noface', text: (p.name || '?').slice(0, 1) }),
      el('span', { class: 'dg-person-name', text: p.name }),
      extra,
    ]);
  }

  function renderAction(state) {
    const me = myId(state);
    const action = myAction(state);
    const host = hostControls(state);
    const children = [];
    const phase = state.phase;
    /* Rebuild only when something this panel shows has changed: a snapshot
     * also arrives for every mic toggle and reconnect at the table, and
     * rebuilding the clue box on each of those would eat what the player is
     * typing. */
    const sig = JSON.stringify([
      phase, action, host, state.round, state.turnSeat, ui.selected, state.result, state.match, ui.clueOpen,
      ui.revealed ? [...ui.revealed] : null,
      ui.abortArmed,   // without it the first click arms nothing on screen and the second only re-arms
      playersOf(state).map((p) => [p.id, p.name, p.seat, p.out, p.lives, p.connected, p.readyToVote, p.hasVoted, p.character]),
    ]);
    if (sig === ui.sentFor) return;
    ui.sentFor = sig;
    clueClock = null;

    if (phase === 'CLUES' && action === 'clue') {
      /* Owner: "Entering your clue should also be like on the table you
       * click on the name card which has a transparent ... symbol on it so
       * its obvious you write on it." The card on the felt is the way in
       * (main.js routes a click on it to openClue); this button is the same
       * door for anybody who cannot find it. What is typed goes onto that
       * card as it is written. */
      const max = state.settings?.clueMaxLen ?? 50;
      clueClock = el('span', { class: 'dg-clue-clock' });
      if (!ui.clueOpen) {
        children.push(
          el('div', { class: 'dg-action-title' }, ['Your turn. Click your card on the table to write. ', clueClock]),
          el('button', { type: 'button', class: 'dg-btn confirm', 'data-dg': 'write-clue', onclick: () => openClue() }, 'Write on my card'),
        );
      } else {
        const count = el('span', { class: 'dg-clue-count', text: `${ui.draft.length}/${max}` });
        const input = el('input', {
          type: 'text', maxlength: max, class: 'dg-clue-input',
          placeholder: 'One clue. Enter to put it down.', 'aria-label': 'Your clue', 'data-dg': 'clue-input',
        });
        input.value = ui.draft;
        input.addEventListener('focus', () => typing(true));
        input.addEventListener('blur', () => typing(false));
        input.addEventListener('input', () => {
          ui.draft = input.value.slice(0, max);
          count.textContent = `${ui.draft.length}/${max}`;
          onClueDraft(ui.draft);
        });
        input.addEventListener('keydown', (event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            const text = input.value.trim();
            if (!text) return;
            input.disabled = true;
            Promise.resolve(intents.clue?.(text)).then((ok) => {
              if (ok === false) { input.disabled = false; input.focus(); }
            });
            event.preventDefault();
          } else if (event.key === 'Escape') {
            input.blur();
          }
        });
        children.push(
          el('div', { class: 'dg-action-title' }, ['Write it on your card. ', clueClock]),
          el('div', { class: 'dg-clue-card' }, [input, count]),
        );
        queueMicrotask(() => { if (!ui.chatOpen) input.focus(); });
      }
    } else if (phase === 'DISCUSS') {
      const self = playerById(state, me);
      const { ready, total } = readyProgress(state);
      if (self && !self.out) {
        children.push(el('button', {
          type: 'button', class: `dg-btn ${self.readyToVote ? 'on' : ''}`, 'data-dg': 'ready',
          onclick: () => intents.ready?.(!self.readyToVote),
        }, self.readyToVote ? `Ready to vote ✓ (${ready}/${total})` : `Ready to vote (${ready}/${total})`));
      } else {
        children.push(el('div', { class: 'dg-action-title', text: `Ready to vote: ${ready} of ${total}` }));
      }
      if (host.includes('callVote')) {
        children.push(el('button', { type: 'button', class: 'dg-btn host', 'data-dg': 'call-vote', onclick: () => intents.callVote?.() }, 'Call the vote'));
      }
    } else if (phase === 'VOTE') {
      const self = playerById(state, me);
      const { voted, total } = voteProgress(state);
      if (action === 'vote') {
        children.push(el('div', { class: 'dg-action-title', text: 'Who is the Rat? Click a seat or a name.' }));
        children.push(el('div', { class: 'dg-people' }, voteCandidates(state).map((p) => personRow(p, {
          selected: ui.selected === p.id,
          onclick: () => select(p.id),
        }))));
        children.push(el('button', {
          type: 'button', class: 'dg-btn confirm', 'data-dg': 'confirm-vote', disabled: !ui.selected,
          onclick: () => { if (ui.selected) intents.vote?.(ui.selected); },
        }, ui.selected ? `Vote ${nameOf(state, ui.selected)}` : 'Pick somebody'));
      } else {
        children.push(el('div', { class: 'dg-action-title', text: self?.hasVoted ? `Vote cast. ${voted} of ${total} in.` : `${voted} of ${total} have voted.` }));
      }
    } else if (phase === 'VOTE_RESULT') {
      const tally = state.result?.tally ?? {};
      const rows = alivePlayers(state).filter((p) => tally[p.id]).sort((a, b) => tally[b.id] - tally[a.id]);
      children.push(el('div', { class: 'dg-action-title', text: turnText(state) }));
      children.push(el('div', { class: 'dg-tally' }, rows.map((p) => el('div', { class: p.id === state.result?.accusedId ? 'accused' : '' }, [
        el('b', { text: p.name }), el('span', { text: `${tally[p.id]} vote${tally[p.id] === 1 ? '' : 's'}` }),
      ]))));
    } else if (phase === 'ROLE_REVEAL' || phase === 'LAST_WORD' || phase === 'PAYBACK' || phase === 'RESOLVE') {
      /* In reveal order, and during the reveal only the cards already shown:
       * the rest wait face down. */
      const list = revealSchedule(state);
      const shown = (id) => phase !== 'ROLE_REVEAL' || Boolean(ui.revealed?.has(id));
      if (phase === 'ROLE_REVEAL') children.push(el('div', { class: 'dg-action-title', text: turnText(state) }));
      if (list.length) {
        children.push(el('div', { class: 'dg-reveal', 'data-dg': 'reveal' }, list.map((r) => (shown(r.playerId)
          ? el('div', {
            class: `dg-reveal-row ${r.isRat ? 'rat' : 'family'} ${r.accused ? 'accused' : ''}`,
            'data-player': r.playerId,
            'data-role': r.role,
          }, [el('b', { text: r.name }), el('span', { text: r.label })])
          : el('div', { class: 'dg-reveal-row face-down', 'data-player': r.playerId }, [el('b', { text: r.name }), el('span', { text: '?' })])))));
      }
      if (phase === 'LAST_WORD') {
        if (action === 'lastWord') {
          children.push(el('div', { class: 'dg-action-title', text: 'Your Last Word. Click it on the board.' }));
        } else {
          children.push(el('div', { class: 'dg-action-title', text: turnText(state) }));
        }
      }
      if (phase === 'PAYBACK') {
        if (action === 'payback') {
          children.push(el('div', { class: 'dg-action-title', text: 'Payback. Click a seat or a name.' }));
          children.push(el('div', { class: 'dg-people' }, paybackCandidates(state).map((p) => personRow(p, {
            selected: ui.selected === p.id,
            onclick: () => select(p.id),
          }))));
          children.push(el('button', {
            type: 'button', class: 'dg-btn confirm', 'data-dg': 'confirm-payback', disabled: !ui.selected,
            onclick: () => { if (ui.selected) intents.payback?.(ui.selected); },
          }, ui.selected ? `${nameOf(state, ui.selected)} pays` : 'Pick somebody'));
        } else {
          children.push(el('div', { class: 'dg-action-title', text: turnText(state) }));
        }
      }
      if (phase === 'RESOLVE') {
        const b = boardModel(state);
        const word = b.revealIndex !== null ? b.words[b.revealIndex] : null;
        children.push(el('div', { class: 'dg-action-title', 'data-dg': 'resolve' }, [
          word ? el('span', { class: 'dg-word-gold', text: word }) : '',
          el('span', { text: ` ${resolveText(state)}` }),
        ]));
        if (host.includes('next')) {
          children.push(el('button', { type: 'button', class: 'dg-btn host', 'data-dg': 'next', onclick: () => intents.next?.() }, 'Deal again'));
        } else {
          children.push(el('div', { class: 'dg-small', text: 'Waiting on the host to deal again.' }));
        }
      }
    } else if (phase === 'MATCH_OVER') {
      children.push(el('div', { class: 'dg-action-title', 'data-dg': 'match' }, matchText(state)));
      if (host.includes('backToLobby')) {
        children.push(el('button', { type: 'button', class: 'dg-btn host', 'data-dg': 'next', onclick: () => intents.next?.() }, 'Back to the lobby'));
      }
    } else if (phase === 'DEAL') {
      children.push(el('div', { class: 'dg-action-title', text: 'Dealing…' }));
    }

    if (host.includes('skipTurn')) {
      const turn = playerAtSeat(state, state.turnSeat);
      const label = turn?.connected === false ? 'Skip their turn' : `Skip ${turn?.name ?? 'their'}'s turn`;
      children.push(el('button', { type: 'button', class: 'dg-btn host', 'data-dg': 'skip-turn', onclick: () => intents.skipTurn?.() }, label));
    }
    if (host.includes('abort')) {
      /* game:abort throws the round and every life away, so it takes two
       * clicks: the first arms the button, the second sends. */
      const armed = ui.abortArmed === state.round;
      children.push(el('button', {
        type: 'button', class: `dg-btn quiet host ${armed ? 'armed' : ''}`.trim(), 'data-dg': 'abort',
        onclick: () => {
          if (!armed) { ui.abortArmed = state.round; render(ui.state); return; }
          ui.abortArmed = null;
          intents.abort?.();
        },
      }, armed ? 'Sure? Back to the lobby, lives reset' : 'Call the match off'));
    }

    actionEl.replaceChildren(...children);
    actionEl.classList.toggle('hidden', children.length === 0 || phase === 'LOBBY');
  }

  function renderTimer(state) {
    const s = secondsLeft(state);
    hudTimer.textContent = s === null ? '' : `${s}s`;
    hudTimer.classList.toggle('hidden', s === null);
    const urgent = s !== null && s <= 10 && state.phase === 'CLUES';
    hudTimer.classList.toggle('urgent', urgent);
    if (clueClock) {
      clueClock.textContent = s === null ? '' : `${s}s`;
      clueClock.classList.toggle('urgent', urgent);
    }
  }

  function openClue() {
    if (myAction(ui.state) !== 'clue') return false;
    if (!ui.clueOpen) {
      ui.clueOpen = true;
      render();
    } else {
      actionEl.querySelector('[data-dg="clue-input"]')?.focus();
    }
    return true;
  }

  let lastPhaseKey = '';
  function render(state = ui.state) {
    if (!state) return;
    ui.state = state;
    const phaseKey = `${state.phase}|${state.round}`;
    if (phaseKey !== lastPhaseKey) {
      lastPhaseKey = phaseKey;
      ui.selected = null;
      onSelect(null);
    }
    /* A new writer (or no writer) puts the box away and drops the draft. */
    const clueKey = state.phase === 'CLUES' ? `${state.round}|${state.turnSeat}` : '';
    if (clueKey !== ui.clueKey) {
      ui.clueKey = clueKey;
      ui.clueOpen = false;
      if (ui.draft) { ui.draft = ''; onClueDraft(''); }
    }
    banner(bannerFor(ui.prev, state));
    ui.prev = { phase: state.phase, round: state.round, turnSeat: state.turnSeat };
    const inRoom = Boolean(state.code);
    root.classList.toggle('in-room', inRoom);
    root.classList.toggle('in-lobby', state.phase === 'LOBBY');
    renderHud(state);
    renderBoard(state);
    renderClues(state);
    renderAction(state);
    renderTimer(state);
  }

  /* The timer ticks without a new snapshot. */
  const timerInterval = setInterval(() => { if (ui.state) renderTimer(ui.state); }, 500);

  return {
    root,
    render,
    addChat,
    toast,
    openChat,
    closeChat,
    toggleBoard() { ui.boardOpen = !ui.boardOpen; render(); return ui.boardOpen; },
    toggleClues() { ui.cluesOpen = !ui.cluesOpen; render(); return ui.cluesOpen; },
    banner,
    /** The player clicked his card on the felt (or pressed Write). False when it is not his turn. */
    openClue,
    get draft() { return ui.draft; },
    /** The reveal's pacing, from main.js's clock: the ids whose card is shown (null = all). */
    setRevealed(ids) {
      const next = ids ? new Set(ids) : null;
      const same = next && ui.revealed ? next.size === ui.revealed.size && [...next].every((id) => ui.revealed.has(id)) : next === ui.revealed;
      if (same) return;
      ui.revealed = next;
      render();
    },
    /** A seat was clicked in 3D during VOTE/PAYBACK. Only candidates are accepted. */
    selectFromWorld(id) {
      const action = myAction(ui.state);
      const list = action === 'vote' ? voteCandidates(ui.state) : action === 'payback' ? paybackCandidates(ui.state) : [];
      if (!list.some((p) => p.id === id)) return false;
      select(id);
      return true;
    },
    get selected() { return ui.selected; },
    get boardOpen() { return ui.boardOpen || ui.boardForced; },
    get chatOpen() { return ui.chatOpen; },
    setVisible(on) { root.classList.toggle('hidden', !on); },
    reset() {
      ui.state = null;
      ui.selected = null;
      ui.prev = null;
      ui.revealed = null;
      ui.clueOpen = false;
      ui.draft = '';
      ui.clueKey = '';
      chatLog.replaceChildren();
      actionEl.classList.add('hidden');
      boardEl.classList.add('hidden');
      cluesEl.classList.add('hidden');
    },
    destroy() { clearInterval(timerInterval); },
  };
}
