/**
 * The pure view-model behind Dead Giveaway's table HUD. Everything the HUD
 * shows is derived from one server snapshot, so these functions ARE the
 * screen: phase text, who the server is waiting on, who you may vote for,
 * which board cell lights for whom, the reveal list, the legend.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  phaseLabel, hudModel, whoMayAct, myAction, voteCandidates, paybackCandidates, boardModel,
  revealList, clueList, legendModel, turnText, resolveText, hostControls, roleCard, SAID_NOTHING, PHASES,
} from '../src/deadgiveaway/table-ui.js';
/* actions.js's ACTIONS, restated: that module builds camera-mounted props at
 * import and needs the DOM shim, and this file is pure. The order is the
 * contract's (docs/DEAD-GIVEAWAY.md). */
const ACTIONS = ['drink', 'smoke', 'spit', 'point', 'lean', 'shake', 'raise', 'nod'];

const WORDS = ['Rye', 'Gin', 'Ice', 'Bitters', 'Olives', 'Limes', 'Soda', 'Vermouth',
  'Bourbon', 'Scotch', 'Cherries', 'Tonic', 'Rum', 'Vodka', 'Brandy', 'Absinthe'];

function player(id, seat, extra = {}) {
  return {
    id, name: id.toUpperCase(), character: 'lou', seat, joinSeq: seat + 1,
    connected: true, isHost: seat === 0, lives: 3, out: false, mic: false, cam: false,
    clue: null, hasVoted: false, readyToVote: false, ...extra,
  };
}

function snapshot(phase, { me = 'a', role = 'family', targetIndex = 5, ...rest } = {}) {
  return {
    code: 'BUNK7', hostId: 'a', phase, round: phase === 'LOBBY' ? 0 : 1, startSeat: 0, turnSeat: null,
    phaseEndsAt: null, settings: { lives: 3, maxPlayers: 8, minPlayers: 3, clueMaxLen: 60 },
    players: [player('a', 0), player('b', 1), player('c', 2), player('d', 4)],
    card: phase === 'LOBBY' ? null : { id: 'bing-drinks', category: 'Behind the Bing bar', words: WORDS },
    clues: [], result: null, match: null,
    me: { playerId: me, role: phase === 'LOBBY' ? null : role, targetIndex: role === 'rat' ? null : targetIndex },
    ...rest,
  };
}

test('every phase has a player-facing name in the house vocabulary', () => {
  for (const phase of PHASES) assert.ok(phaseLabel(phase).length > 2, phase);
  assert.equal(phaseLabel('LAST_WORD'), 'Your Last Word');
  assert.equal(phaseLabel('PAYBACK'), 'Payback');
  const all = PHASES.map((p) => `${phaseLabel(p)} ${turnText(snapshot(p))}`).join(' ').toLowerCase();
  for (const banned of ['impostor', 'spy', 'civilian']) assert.ok(!all.includes(banned), banned);
});

test('phase -> HUD text', () => {
  const clues = snapshot('CLUES', { turnSeat: 1 });
  assert.equal(hudModel(clues).turnText, 'B is writing…');
  assert.match(hudModel(snapshot('CLUES', { turnSeat: 0 })).turnText, /^Your turn/);
  const away = snapshot('CLUES', { turnSeat: 1 });
  away.players[1].connected = false;
  assert.match(turnText(away), /host can skip/);
  assert.equal(hudModel(clues).phaseText, 'Clues');
  assert.equal(hudModel(clues).round, 1);
  assert.equal(hudModel(clues).lives, 3);
  assert.equal(hudModel(clues).isHost, true);
  assert.equal(hudModel(snapshot('LOBBY')).round, null);
  assert.match(turnText(snapshot('VOTE')), /0 of 4 have voted/);
});

test('your role card: the Rat in red words, the Family otherwise, a mid-match joiner sits out', () => {
  assert.equal(roleCard(snapshot('CLUES', { role: 'rat' })).label, 'THE RAT');
  assert.equal(roleCard(snapshot('CLUES')).label, 'THE FAMILY');
  assert.equal(roleCard(snapshot('LOBBY')).label, '');
  const late = snapshot('CLUES', { me: 'd', role: null });
  late.players[3].out = true;
  late.players[3].lives = 0;
  late.me.role = null;
  assert.equal(roleCard(late).role, 'out');
});

test('who may act now', () => {
  assert.deepEqual(whoMayAct(snapshot('LOBBY')), { action: 'start', playerIds: ['a'] });
  assert.deepEqual(whoMayAct(snapshot('CLUES', { turnSeat: 2 })), { action: 'clue', playerIds: ['c'] });
  assert.equal(myAction(snapshot('CLUES', { turnSeat: 2 })), null);
  assert.equal(myAction(snapshot('CLUES', { turnSeat: 0 })), 'clue');
  const vote = snapshot('VOTE');
  vote.players[1].hasVoted = true;
  vote.players[2].connected = false;
  assert.deepEqual(whoMayAct(vote).playerIds, ['a', 'd']);
  const lw = snapshot('LAST_WORD', { me: 'b', role: 'rat', result: { ratId: 'b', roles: { a: 'family', b: 'rat', c: 'family', d: 'family' } } });
  assert.equal(myAction(lw), 'lastWord');
  assert.equal(myAction({ ...lw, me: { playerId: 'a', role: 'family', targetIndex: 5 } }), null);
  assert.deepEqual(whoMayAct(snapshot('RESOLVE')), { action: 'next', playerIds: ['a'] });
  assert.deepEqual(whoMayAct(snapshot('DEAL')), { action: null, playerIds: [] });
});

test('host is read from every snapshot, including a passed-on isHost', () => {
  const s = snapshot('DISCUSS', { me: 'b', hostId: 'b' });
  s.players[0].isHost = false;
  s.players[1].isHost = true;
  assert.ok(hostControls(s).includes('callVote'));
  assert.deepEqual(hostControls(snapshot('DISCUSS', { me: 'c' })), []);
});

test('the host can skip any stalled clue turn but their own, and abort outside the lobby', () => {
  const stalled = snapshot('CLUES', { turnSeat: 1 });
  assert.ok(hostControls(stalled).includes('skipTurn'), 'a connected player who sits there is still skippable');
  const own = snapshot('CLUES', { turnSeat: 0 });
  assert.ok(!hostControls(own).includes('skipTurn'), 'not the host\'s own turn');
  assert.ok(hostControls(stalled).includes('abort'));
  assert.ok(!hostControls(snapshot('LOBBY')).includes('abort'));
});

test('the vote list excludes yourself and anybody out', () => {
  const s = snapshot('VOTE');
  s.players[2].out = true;
  assert.deepEqual(voteCandidates(s).map((p) => p.id), ['b', 'd']);
  assert.deepEqual(voteCandidates(s, 'd').map((p) => p.id), ['a', 'b']);
  const pb = snapshot('PAYBACK', { me: 'b', role: 'rat', result: { ratId: 'b', roles: {} } });
  pb.players[3].out = true;
  assert.deepEqual(paybackCandidates(pb).map((p) => p.id), ['a', 'c']);
});

test("the Family's board has the highlight and the Rat's never does", () => {
  const family = boardModel(snapshot('CLUES'));
  assert.equal(family.highlightIndex, 5);
  assert.equal(family.words.length, 16);
  assert.equal(family.dim, false);
  const rat = boardModel(snapshot('CLUES', { role: 'rat' }));
  assert.equal(rat.highlightIndex, null);
  /* Even if a snapshot ever carried an index for the Rat, his board stays dark. */
  const leaky = snapshot('CLUES', { role: 'rat' });
  leaky.me.targetIndex = 5;
  assert.equal(boardModel(leaky).highlightIndex, null);
  assert.deepEqual(rat.words, family.words, 'the same sixteen words in the same order');
  const lobby = boardModel(snapshot('LOBBY'));
  assert.equal(lobby.dim, true);
  assert.equal(lobby.words.length, 0);
  const resolved = boardModel(snapshot('RESOLVE', { role: 'rat', result: { targetIndex: 5, lastWord: { index: 3, correct: false } } }));
  assert.equal(resolved.revealIndex, 5);
  assert.equal(resolved.pickIndex, 3);
  const timedOut = boardModel(snapshot('RESOLVE', { result: { targetIndex: 5, lastWord: { index: null, correct: false } } }));
  assert.equal(timedOut.pickIndex, null);
});

test('clues come in the order given, a skip reads as silence', () => {
  const s = snapshot('DISCUSS', {
    clues: [
      { playerId: 'c', seat: 2, text: 'neat', order: 2 },
      { playerId: 'a', seat: 0, text: 'cold', order: 1 },
      { playerId: 'd', seat: 4, text: null, order: 3 },
    ],
  });
  const list = clueList(s);
  assert.deepEqual(list.map((c) => c.seat), [0, 2, 4]);
  assert.deepEqual(list.map((c) => c.text), ['cold', 'neat', SAID_NOTHING]);
  assert.equal(list[0].name, 'A');
});

test('the role reveal names everybody, the Rat marked, before any Last Word', () => {
  assert.deepEqual(revealList(snapshot('VOTE_RESULT', { result: { tally: { b: 3 }, accusedId: 'b', caught: null, ratId: null, roles: null } })), []);
  const s = snapshot('ROLE_REVEAL', {
    result: {
      tally: { b: 3, a: 1 }, accusedId: 'b', caught: true, ratId: 'b',
      roles: { a: 'family', b: 'rat', c: 'family', d: 'family' },
    },
  });
  const list = revealList(s);
  assert.equal(list.length, 4);
  assert.deepEqual(list.filter((r) => r.isRat).map((r) => r.playerId), ['b']);
  assert.equal(list.find((r) => r.isRat).label, 'THE RAT');
  assert.equal(list.find((r) => r.playerId === 'a').label, 'FAMILY');
  assert.equal(list.find((r) => r.playerId === 'b').votes, 3);
  assert.ok(list.find((r) => r.playerId === 'b').accused);
  assert.equal(turnText(s), 'B was the Rat.');
});

test('the resolution reads what happened, including a called-off round', () => {
  const lost = snapshot('RESOLVE', { result: { lastWord: { index: 2, correct: false }, lifeLoss: { playerId: 'b', livesAfter: 2 }, voided: false } });
  assert.match(resolveText(lost), /wrong word/);
  assert.match(resolveText(lost), /B loses a chip — 2 left/);
  const late = snapshot('RESOLVE', { result: { lastWord: { index: null, correct: false }, lifeLoss: { playerId: 'b', livesAfter: 2 } } });
  assert.match(resolveText(late), /ran out of time/);
  assert.match(resolveText(snapshot('RESOLVE', { result: { voided: true, lifeLoss: null } })), /round is off/);
});

test('the legend lists the eight gestures on the number row, then the table keys', () => {
  const keyFor = (kind) => `Digit${ACTIONS.indexOf(kind) + 1}`;
  const rows = legendModel(ACTIONS, keyFor);
  assert.deepEqual(rows.slice(0, 8).map((r) => r.key), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.deepEqual(rows.slice(0, 8).map((r) => r.kind), ACTIONS);
  assert.deepEqual(rows.slice(8).map((r) => r.key), ['B', 'C', 'Enter', 'Tab']);
  for (const r of rows) assert.ok(r.label);
});
