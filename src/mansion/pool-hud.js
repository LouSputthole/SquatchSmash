/**
 * The pool table's own panel.
 *
 * WHY THIS IS NOT THE BING'S PANEL. `src/bing/main.js` paints the blackjack
 * state into `#gamble`, which is markup in bing.html with a stylesheet behind
 * it; mansion.html has no such element and adding one would put a pool table's
 * furniture in the page every other mansion build has to carry. So this builds
 * its own DOM and its own stylesheet at construction, exactly the way
 * `./mission/hud.js` and `core/pause-menu.js` do -- the established pattern in
 * this scene for a panel that only some visits ever show.
 *
 * WHY IT IS NOT THE MISSION HUD EITHER. The mission's objective and
 * instruction lines belong to PROJECT SILENT SQUATCH, and the table is
 * playable while that mission is running. Borrowing them would mean a man
 * lining up a shot is told his group of balls where he should be being told to
 * take the case to Booski. Two registers, two panels.
 *
 * THE METER IS GOLF'S METER. Owner: "a power bar similar to golf". The MARKUP
 * is this panel's, for the reason above -- golf's `#meter` lives in golf.html
 * and is styled by src/golf/golf.css, neither of which the mansion loads -- but
 * every NUMBER on it comes out of `PoolFrame.view.swing`, which is a live
 * `Swing` from ../golf/swing.js. The dead zone drawn here is the dead zone the
 * shot is judged by, the orange band starts at that swing's own `safePower`,
 * and the track runs from `STRIKE_FLOOR` to 1 because that is where the strike
 * sweep bottoms out. Nothing here re-decides anything; there is no second set
 * of numbers to drift.
 *
 * It draws only what the frame publishes (`PoolFrame.view`), and it repaints
 * only when the composed text actually changed -- same trick as
 * `paintMachine` in the Bing, and it matters more here: this scene renders at
 * about 1.3 frames a second under the software rasteriser and every DOM write
 * is on that budget.
 */

import { SWING_PHASE, STRIKE_FLOOR } from '../golf/swing.js';

const CSS = `
.pool-panel { position: fixed; right: 22px; bottom: 96px; z-index: 6; width: 268px;
  padding: 11px 14px 10px; border-radius: 9px; background: rgba(8,12,10,.82);
  border: 1px solid rgba(120,190,140,.45); pointer-events: none; display: none;
  font-family: "Trebuchet MS", "Segoe UI", Verdana, sans-serif; color: #eef3ea; }
.pool-panel.show { display: block; }
.pool-title { font-size: 11px; letter-spacing: 3px; font-weight: 800; color: #8fdda6;
  margin-bottom: 6px; }
.pool-body { font-size: 13px; line-height: 1.5; }
.pool-body b { color: #ffe4a0; }
.pool-body .turn { color: #8fdda6; }
.pool-body .them { color: #ffb08a; }
.pool-body .foul { color: #ff8a6b; }
.pool-meter { margin-top: 8px; }
.pool-track { position: relative; height: 12px; border-radius: 4px; background: #16211a;
  border: 1px solid rgba(255,255,255,.16); overflow: hidden; }
/* Everything left of the line is a late stroke, and a late stroke pulls it. */
.pool-track i.late { position: absolute; left: 0; top: 0; bottom: 0;
  background: rgba(143,49,41,.26); border-right: 1px solid rgba(238,243,234,.4); }
/* Orange is an overswing -- the same word and the same read as golf's. */
.pool-track i.risk { position: absolute; top: 0; bottom: 0;
  background: repeating-linear-gradient(135deg, rgba(217,84,46,.34) 0, rgba(217,84,46,.34) 5px,
    rgba(217,84,46,.13) 5px, rgba(217,84,46,.13) 10px);
  border-left: 1px solid rgba(255,185,94,.75); }
.pool-track i.fill { position: absolute; top: 0; bottom: 0; width: 0;
  background: linear-gradient(90deg, #4f9b64, #d8e06a, #e0713f); opacity: .9; }
.pool-meter.strike .pool-track i.fill { opacity: .35; }
/* The forgiving middle, drawn where the physics actually forgives. */
.pool-track i.zone { position: absolute; top: -1px; bottom: -1px; opacity: 0;
  background: rgba(238,243,234,.2); border-left: 1px solid rgba(238,243,234,.45);
  border-right: 2px solid #eef3ea; }
.pool-meter.strike .pool-track i.zone { opacity: 1; }
.pool-track i.mark { position: absolute; top: -2px; bottom: -2px; width: 3px;
  transform: translateX(-1.5px); background: #eef3ea;
  box-shadow: 0 0 7px rgba(255,255,255,.7); }
.pool-meter.strike .pool-track i.mark { background: #ffd75e;
  box-shadow: 0 0 9px rgba(255,215,94,.9); }
.pool-meter.overswing .pool-track i.mark { background: #ff9a62;
  box-shadow: 0 0 10px rgba(255,104,66,.95); }
.pool-hint { margin-top: 5px; font-size: 10px; letter-spacing: 2px; color: #cdd8cd; }
.pool-meter.overswing .pool-hint { color: #ffb27a; }
.pool-keys { margin-top: 8px; font-size: 11px; letter-spacing: 1px; color: #b9c6bb; }
.pool-keys kbd { font: inherit; padding: 1px 5px; border-radius: 3px;
  border: 1px solid rgba(255,255,255,.28); background: rgba(255,255,255,.08); }
`;

/** The line under the title, composed from the view. Split out so the test
 * that cares about wording does not have to build a browser to read it. */
export function poolPanelText(view) {
  if (!view) return '';
  const rows = [];
  const group = view.yours
    ? `You are on <b>${view.yours === 'solid' ? 'solids' : 'stripes'}</b>`
    : 'Table is <b>open</b>';
  rows.push(`${view.game} &middot; ${group}`);
  if (view.targets.length) {
    const shown = view.targets.length > 6
      ? `${view.targets.slice(0, 6).join(' ')} …`
      : view.targets.join(' ');
    rows.push(`On: <b>${shown}</b>`);
  }
  if (view.state === 'over') {
    rows.push(view.winner === 'player'
      ? '<span class="turn">Frame to you.</span>'
      : '<span class="them">Frame to Rippinflow.</span>');
  } else if (view.turn === 'player') {
    rows.push(view.ballInHand
      ? '<span class="turn">Your shot &mdash; ball in hand.</span>'
      : '<span class="turn">Your shot.</span>');
  } else {
    rows.push('<span class="them">Rippinflow is on.</span>');
  }
  if (view.message) {
    rows.push(`<span class="${view.foul ? 'foul' : ''}">${view.message}</span>`);
  }
  return rows.join('<br>');
}

/** Where a swing value sits on the track, 0..100. The track runs from the
 * strike sweep's floor to full power, so "past the line" is a real distance
 * on screen rather than a clipped edge. */
export const poolMeterValue = (value) => Math.max(0, Math.min(100,
  ((value - STRIKE_FLOOR) / (1 - STRIKE_FLOOR)) * 100));

/**
 * The whole meter as plain numbers, so the shape of it can be asserted under
 * `node --test` instead of in a browser. Percentages, in the order they are
 * written to the DOM.
 */
export function poolMeterState(view) {
  const swing = view?.swing ?? null;
  if (!swing) return null;
  const striking = swing.phase === SWING_PHASE.STRIKE;
  const zero = poolMeterValue(0);
  const fillEnd = poolMeterValue(striking ? swing.power : swing.marker);
  return {
    phase: swing.phase,
    striking,
    /* Live risk, not the risk of a power he has already committed to: the bar
     * has to go orange while he is still deciding, or the warning arrives
     * after the decision it was meant to inform. */
    overswing: (striking ? swing.power : swing.marker) > swing.safePower,
    late: zero,
    riskLeft: poolMeterValue(swing.safePower),
    riskWidth: 100 - poolMeterValue(swing.safePower),
    fillLeft: Math.min(zero, fillEnd),
    fillWidth: Math.abs(fillEnd - zero),
    zoneLeft: poolMeterValue(-swing.deadZone),
    zoneWidth: ((swing.deadZone * 2) / (1 - STRIKE_FLOOR)) * 100,
    mark: poolMeterValue(swing.marker),
    hint: hintFor(swing, striking),
  };
}

function hintFor(swing, striking) {
  if (striking) {
    return swing.risk > 0.05 ? 'OVERSWING · SMALLER SWEET SPOT' : '[E]: STRIKE';
  }
  if (swing.phase === SWING_PHASE.POWER) {
    return swing.marker > swing.safePower ? 'OVERSWING · [E] TO RISK IT' : '[E]: SET POWER';
  }
  return '[E]: START THE STROKE';
}

const KEYS = {
  aim: '<kbd>Mouse</kbd> aim &middot; <kbd>A</kbd><kbd>D</kbd> fine &middot; '
    + '<kbd>E</kbd> start, power, strike &middot; <kbd>Q</kbd> put the cue back',
  waiting: '<kbd>Q</kbd> put the cue back',
  over: '<kbd>E</kbd> rack again &middot; <kbd>Q</kbd> put the cue back',
};

export function createPoolHud({ parent = document.body } = {}) {
  if (!document.getElementById('pool-panel-style')) {
    const style = document.createElement('style');
    style.id = 'pool-panel-style';
    style.textContent = CSS;
    document.head.append(style);
  }
  const root = document.createElement('div');
  root.className = 'pool-panel';
  const title = document.createElement('div');
  title.className = 'pool-title';
  title.textContent = 'BILLIARDS · RIPPINFLOW';
  const body = document.createElement('div');
  body.className = 'pool-body';
  const meter = document.createElement('div');
  meter.className = 'pool-meter';
  const track = document.createElement('div');
  track.className = 'pool-track';
  const parts = {};
  for (const name of ['late', 'risk', 'fill', 'zone', 'mark']) {
    const bar = document.createElement('i');
    bar.className = name;
    track.append(bar);
    parts[name] = bar;
  }
  const hint = document.createElement('div');
  hint.className = 'pool-hint';
  meter.append(track, hint);
  const keys = document.createElement('div');
  keys.className = 'pool-keys';
  root.append(title, body, meter, keys);
  parent.append(root);

  let bodySignature = '';
  let keysSignature = '';
  let hintSignature = '';
  return {
    root,
    /** @param {object|null} view `PoolFrame.view`, or null to put it away. */
    set(view) {
      const on = Boolean(view) && view.state !== 'idle';
      root.classList.toggle('show', on);
      if (!on) return;
      const text = poolPanelText(view);
      if (text !== bodySignature) {
        bodySignature = text;
        body.innerHTML = text;
      }
      const wanted = view.state === 'over' ? KEYS.over
        : view.state === 'aim' ? KEYS.aim : KEYS.waiting;
      if (wanted !== keysSignature) {
        keysSignature = wanted;
        keys.innerHTML = wanted;
      }
      meter.style.display = view.state === 'aim' ? '' : 'none';
      const state = view.state === 'aim' ? poolMeterState(view) : null;
      if (!state) return;
      parts.late.style.width = `${state.late}%`;
      parts.risk.style.left = `${state.riskLeft}%`;
      parts.risk.style.width = `${state.riskWidth}%`;
      parts.fill.style.left = `${state.fillLeft}%`;
      parts.fill.style.width = `${state.fillWidth}%`;
      parts.zone.style.left = `${state.zoneLeft}%`;
      parts.zone.style.width = `${state.zoneWidth}%`;
      parts.mark.style.left = `${state.mark}%`;
      meter.classList.toggle('strike', state.striking);
      meter.classList.toggle('overswing', state.overswing);
      if (state.hint !== hintSignature) {
        hintSignature = state.hint;
        hint.textContent = state.hint;
      }
    },
    dispose() {
      root.remove();
    },
  };
}
