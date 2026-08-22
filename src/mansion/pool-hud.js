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
 * It draws only what the frame publishes (`PoolFrame.view`), and it repaints
 * only when the composed text actually changed -- same trick as
 * `paintMachine` in the Bing, and it matters more here: this scene renders at
 * about 1.3 frames a second under the software rasteriser and every DOM write
 * is on that budget.
 */

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
.pool-power { margin-top: 8px; height: 10px; border-radius: 4px; background: #16211a;
  border: 1px solid rgba(255,255,255,.16); overflow: hidden; }
.pool-power i { display: block; height: 100%; width: 0;
  background: linear-gradient(90deg, #4f9b64, #d8e06a, #e0713f); }
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

const KEYS = {
  aim: '<kbd>Mouse</kbd> aim &middot; <kbd>A</kbd><kbd>D</kbd> fine &middot; '
    + 'hold <kbd>E</kbd> power &middot; <kbd>Q</kbd> put the cue back',
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
  const power = document.createElement('div');
  power.className = 'pool-power';
  const powerFill = document.createElement('i');
  power.append(powerFill);
  const keys = document.createElement('div');
  keys.className = 'pool-keys';
  root.append(title, body, power, keys);
  parent.append(root);

  let bodySignature = '';
  let keysSignature = '';
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
      power.style.display = view.state === 'aim' ? '' : 'none';
      powerFill.style.width = `${Math.round(view.power * 100)}%`;
    },
    dispose() {
      root.remove();
    },
  };
}
