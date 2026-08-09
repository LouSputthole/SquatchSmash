/**
 * One pause/help Interface for every playable Squatch Life scene.
 *
 * Scene code keeps ownership of its simulation state. This Module owns the
 * input rule and the menu: Tab pauses, shows the current objective and the
 * complete controls, then Tab or Resume hands control back. The callbacks are
 * the narrow Adapter between that rule and each scene's existing pause flag.
 */

const STYLE_ID = 'squatch-scene-pause-style';

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [data-scene-pause] {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: grid;
      place-items: center;
      overflow: auto;
      padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
      color: #eef1f7;
      background:
        radial-gradient(circle at 50% 18%, rgba(123, 79, 217, .22), transparent 44%),
        rgba(5, 7, 13, .94);
      font-family: "Trebuchet MS", "Segoe UI", Verdana, sans-serif;
      user-select: none;
    }
    [data-scene-pause].hidden { display: none !important; }
    [data-scene-pause] .scene-pause-panel {
      width: min(680px, 100%);
      max-height: calc(100vh - 48px);
      overflow: auto;
      padding: clamp(24px, 5vw, 44px);
      border: 1px solid rgba(207, 212, 224, .24);
      border-radius: 10px;
      background: linear-gradient(155deg, rgba(24, 22, 38, .98), rgba(10, 12, 20, .98));
      box-shadow: 0 28px 90px rgba(0, 0, 0, .62);
    }
    [data-scene-pause] .scene-pause-kicker {
      color: #a983ff;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .22em;
      text-transform: uppercase;
    }
    [data-scene-pause] h2 {
      margin: 7px 0 24px;
      color: #fff;
      font-size: clamp(30px, 7vw, 52px);
      line-height: .96;
      letter-spacing: -.035em;
      text-transform: uppercase;
    }
    [data-scene-pause] h2 span {
      display: block;
      margin-top: 7px;
      color: #cfd4e0;
      font-size: .42em;
      line-height: 1.15;
      letter-spacing: .16em;
    }
    [data-scene-pause] .scene-pause-label {
      margin-bottom: 6px;
      color: #8d97ab;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .16em;
      text-transform: uppercase;
    }
    [data-scene-pause-objective] {
      margin: 0 0 22px;
      padding: 13px 15px;
      border-left: 3px solid #9a6ff0;
      color: #f4f0ff;
      background: rgba(123, 79, 217, .13);
      font-size: 17px;
      line-height: 1.45;
    }
    [data-scene-pause] ul {
      display: grid;
      gap: 8px;
      margin: 0 0 26px;
      padding: 0;
      list-style: none;
      color: #c9cfdb;
      font-size: 14px;
      line-height: 1.4;
    }
    [data-scene-pause] li::before {
      content: "›";
      display: inline-block;
      width: 16px;
      color: #a983ff;
      font-weight: 900;
    }
    [data-scene-pause] .scene-pause-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    [data-scene-pause] button {
      min-width: 150px;
      padding: 12px 18px;
      border: 1px solid rgba(207, 212, 224, .32);
      border-radius: 5px;
      color: #fff;
      background: #6944bd;
      font: 800 13px/1 "Trebuchet MS", "Segoe UI", sans-serif;
      letter-spacing: .08em;
      text-transform: uppercase;
      cursor: pointer;
    }
    [data-scene-pause] button:hover,
    [data-scene-pause] button:focus-visible { background: #845bdd; outline: 2px solid #d8c9ff; }
    [data-scene-pause] button.secondary { background: rgba(255, 255, 255, .06); }
    [data-scene-pause] button:disabled {
      opacity: .42;
      cursor: not-allowed;
    }
    [data-scene-pause] button:disabled:hover { background: rgba(255, 255, 255, .06); outline: none; }
    [data-scene-pause] .scene-pause-foot {
      margin: 18px 0 0;
      color: #747e93;
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
  `;
  document.head.appendChild(style);
}

function read(value, fallback = '') {
  try {
    const result = typeof value === 'function' ? value() : value;
    return result == null ? fallback : String(result);
  } catch {
    return fallback;
  }
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string[]|function(): string[]} options.instructions
 * @param {string|function(): string} options.getObjective
 * @param {function(): boolean} options.canPause
 * @param {function(): boolean} [options.canHandleTab]
 * @param {function(): void} options.onPause
 * @param {function(): void} options.onResume
 * @param {function(): void} [options.onRestart]
 * @param {string|function(): string} [options.restartLabel]
 * @param {function(): boolean} [options.canRestart]
 * @param {{getState: function(): object, restartFromCheckpoint: function(): *, restartScene: function(): *, skipScene: function(): *}} [options.recovery]
 * @param {{label: string, onSelect: function(): void, secondary?: boolean, close?: boolean}[]} [options.actions]
 */
export function createPauseMenu({
  title,
  instructions = [],
  getObjective = 'Review the instructions, then return when you are ready.',
  canPause = () => true,
  canHandleTab = canPause,
  onPause = () => {},
  onResume = () => {},
  onRestart = null,
  restartLabel = 'Restart scene',
  canRestart = () => true,
  recovery = null,
  actions: extraActions = [],
} = {}) {
  installStyle();

  const root = document.createElement('div');
  root.className = 'hidden';
  root.dataset.scenePause = '';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `Paused — ${title || 'Squatch Life'}`);
  root.innerHTML = `
    <div class="scene-pause-panel">
      <div class="scene-pause-kicker">Paused</div>
      <h2>Take a minute<span></span></h2>
      <div class="scene-pause-label">What to do now</div>
      <div data-scene-pause-objective></div>
      <div class="scene-pause-label">Instructions</div>
      <ul data-scene-pause-instructions></ul>
      <div class="scene-pause-actions">
        <button type="button" data-scene-pause-resume>Resume</button>
      </div>
      <p class="scene-pause-foot">Tab pauses and resumes</p>
    </div>
  `;
  root.querySelector('h2 span').textContent = title || 'Squatch Life';
  const objective = root.querySelector('[data-scene-pause-objective]');
  const list = root.querySelector('[data-scene-pause-instructions]');
  const actions = root.querySelector('.scene-pause-actions');
  const resumeButton = root.querySelector('[data-scene-pause-resume]');

  const recoveryButtons = {};
  if (recovery?.getState
    && recovery?.restartFromCheckpoint
    && recovery?.restartScene
    && recovery?.skipScene) {
    for (const [id, label, method] of [
      ['checkpoint', 'Restart from checkpoint', 'restartFromCheckpoint'],
      ['scene', 'Restart scene', 'restartScene'],
      ['skip', 'Skip scene', 'skipScene'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.dataset.sceneRecoveryAction = id;
      button.textContent = label;
      button.addEventListener('click', () => {
        if (button.disabled || button.hidden) return;
        resume();
        recovery[method]();
      });
      recoveryButtons[id] = button;
      actions.appendChild(button);
    }
  }

  let restartButton = null;
  if (!recovery && onRestart) {
    restartButton = document.createElement('button');
    restartButton.type = 'button';
    restartButton.className = 'secondary';
    restartButton.textContent = restartLabel;
    restartButton.addEventListener('click', () => {
      resume();
      onRestart();
    });
    actions.appendChild(restartButton);
  }

  for (const action of extraActions) {
    if (!action?.label || typeof action.onSelect !== 'function') continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.secondary === false ? '' : 'secondary';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      if (action.close !== false) resume();
      action.onSelect();
    });
    actions.appendChild(button);
  }

  document.body.appendChild(root);
  let open = false;

  function refresh() {
    objective.textContent = read(getObjective, 'Review the instructions, then return when you are ready.');
    if (recoveryButtons.checkpoint) {
      const state = recovery.getState();
      recoveryButtons.checkpoint.disabled = !state.checkpointAvailable;
      recoveryButtons.checkpoint.title = state.checkpointAvailable
        ? 'Return to the latest durable checkpoint'
        : 'No checkpoint is available in this scene yet';
      recoveryButtons.scene.disabled = !state.sceneRestartAvailable;
      recoveryButtons.skip.hidden = !state.skipAvailable;
      recoveryButtons.skip.disabled = !state.skipAvailable;
      recoveryButtons.skip.setAttribute('aria-hidden', String(!state.skipAvailable));
    }
    if (restartButton) {
      const available = Boolean(canRestart());
      restartButton.textContent = read(restartLabel, 'Restart scene');
      restartButton.disabled = !available;
      restartButton.hidden = !available;
      restartButton.setAttribute('aria-hidden', String(!available));
    }
    const rows = typeof instructions === 'function' ? instructions() : instructions;
    list.replaceChildren(...(Array.isArray(rows) ? rows : []).map((line) => {
      const li = document.createElement('li');
      li.textContent = String(line);
      return li;
    }));
  }

  function pause() {
    if (open || !canPause()) return false;
    open = true;
    refresh();
    onPause();
    root.classList.remove('hidden');
    document.exitPointerLock?.();
    queueMicrotask(() => resumeButton.focus({ preventScroll: true }));
    return true;
  }

  function resume() {
    if (!open) return false;
    open = false;
    root.classList.add('hidden');
    onResume();
    return true;
  }

  function toggle() {
    return open ? resume() : pause();
  }

  function onKeyDown(event) {
    if (event.code !== 'Tab' || event.repeat) return;
    if (!canHandleTab()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle();
  }

  resumeButton.addEventListener('click', resume);
  window.addEventListener('keydown', onKeyDown, true);

  const api = {
    root,
    pause,
    resume,
    toggle,
    refresh,
    isPaused: () => open,
    destroy() {
      window.removeEventListener('keydown', onKeyDown, true);
      root.remove();
    },
  };
  window.__scenePause = api;
  return api;
}
