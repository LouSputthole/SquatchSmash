/**
 * One pause/help Interface for every playable Squatch Life scene.
 *
 * Scene code keeps ownership of its simulation state. This Module owns the
 * input rule and the menu: Tab pauses, shows the current objective and the
 * complete controls, then Tab or Resume hands control back. The callbacks are
 * the narrow Adapter between that rule and each scene's existing pause flag.
 *
 * It also renders the shared settings (src/core/settings.js): subtitles,
 * larger subtitles, reduce shake, assist, master volume, mouse sensitivity and
 * the movement keys — so a scene that mounts this menu has them for free.
 */

import { exportCampaignSave, importCampaignSave } from './campaign.js';
import * as settings from './settings.js';

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
    [data-scene-pause] .scene-pause-save {
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid rgba(207, 212, 224, .14);
    }
    [data-scene-pause] .scene-pause-save button {
      min-width: 0;
      padding: 9px 14px;
      font-size: 11px;
    }
    [data-scene-pause-save-status] {
      margin: 10px 0 0;
      color: #c9cfdb;
      font-size: 13px;
      line-height: 1.45;
    }
    [data-scene-pause-save-status].bad { color: #ff9d9d; }
    [data-scene-pause-import-panel] { margin-top: 12px; }
    [data-scene-pause-import-panel] textarea {
      width: 100%;
      min-height: 110px;
      margin-bottom: 10px;
      padding: 10px;
      border: 1px solid rgba(207, 212, 224, .28);
      border-radius: 5px;
      color: #eef1f7;
      background: rgba(5, 7, 13, .8);
      font: 12px/1.5 Consolas, Menlo, monospace;
      resize: vertical;
    }
    [data-scene-pause-import-panel] input[type="file"] {
      margin-bottom: 10px;
      color: #c9cfdb;
      font-size: 12px;
    }
    [data-scene-settings] {
      margin-top: 22px;
      padding-top: 16px;
      border-top: 1px solid rgba(207, 212, 224, .14);
    }
    [data-scene-settings] .scene-settings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px 22px;
      margin: 0 0 14px;
      color: #dfe4ee;
      font-size: 14px;
    }
    [data-scene-settings] label.scene-setting {
      display: flex;
      align-items: center;
      gap: 9px;
      cursor: pointer;
    }
    [data-scene-settings] label.scene-setting input[type="checkbox"] {
      width: 15px;
      height: 15px;
      accent-color: #a983ff;
    }
    [data-scene-settings] label.scene-setting.slider {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 2px 10px;
    }
    [data-scene-settings] label.scene-setting.slider input[type="range"] {
      grid-column: 1 / -1;
      width: 100%;
      accent-color: #a983ff;
    }
    [data-scene-settings] label.scene-setting.slider output {
      min-width: 44px;
      color: #a983ff;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .08em;
      text-align: right;
    }
    [data-scene-settings] .scene-settings-keys {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 6px 18px;
      margin: 0 0 12px;
    }
    [data-scene-settings] .scene-settings-keys > div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: #c9cfdb;
      font-size: 13px;
    }
    [data-scene-settings] button[data-scene-rebind] {
      min-width: 96px;
      padding: 7px 10px;
      background: rgba(255, 255, 255, .06);
      font-size: 11px;
    }
    [data-scene-settings] button[data-scene-rebind].listening {
      background: #6944bd;
      outline: 2px solid #d8c9ff;
    }
    [data-scene-settings] button[data-scene-rebind-reset] {
      min-width: 0;
      padding: 8px 14px;
      font-size: 11px;
    }
    [data-scene-settings-note] {
      margin: 8px 0 0;
      color: #8d97ab;
      font-size: 12px;
      line-height: 1.4;
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
  /* Does this scene HAVE an assist? Only The Silver Room's sway reads the
   * setting, and a switch that does nothing in the other eighteen scenes is
   * worse than no switch at all, so the checkbox is rendered where the scene
   * says it means something. */
  assist = false,
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
      <div data-scene-settings>
        <div class="scene-pause-label">Settings</div>
        <div class="scene-settings-grid">
          <label class="scene-setting"><input type="checkbox" data-scene-setting="subtitles"> Subtitles</label>
          <label class="scene-setting"><input type="checkbox" data-scene-setting="bigSubtitles"> Larger subtitles</label>
          <label class="scene-setting"><input type="checkbox" data-scene-setting="reduceShake"> Reduce camera shake</label>
          <label class="scene-setting" data-scene-setting-row="assist"><input type="checkbox" data-scene-setting="assist"> Assist — wider timing windows</label>
          <label class="scene-setting slider"><span>Master volume</span><output data-scene-setting-value="volume"></output>
            <input type="range" min="0" max="100" step="1" data-scene-setting="volume"></label>
          <label class="scene-setting slider"><span>Mouse sensitivity</span><output data-scene-setting-value="sensitivity"></output>
            <input type="range" min="20" max="300" step="5" data-scene-setting="sensitivity"></label>
        </div>
        <div class="scene-pause-label">Controls</div>
        <div class="scene-settings-keys" data-scene-settings-keys></div>
        <div class="scene-pause-actions">
          <button type="button" class="secondary" data-scene-rebind-reset>Reset controls</button>
        </div>
        <p data-scene-settings-note>Click a key to change it, then press the new key. Esc cancels. Tab always pauses.</p>
      </div>
      <div class="scene-pause-save">
        <div class="scene-pause-label">Save data</div>
        <div class="scene-pause-actions">
          <button type="button" class="secondary" data-scene-pause-export>Export save</button>
          <button type="button" class="secondary" data-scene-pause-import>Import save</button>
        </div>
        <div data-scene-pause-save-status hidden></div>
        <div data-scene-pause-import-panel hidden>
          <textarea data-scene-pause-import-text spellcheck="false"
            placeholder="Paste an exported save here, or choose the downloaded file below"></textarea>
          <input type="file" data-scene-pause-import-file accept=".json,application/json">
          <div class="scene-pause-actions">
            <button type="button" data-scene-pause-import-load>Load save</button>
            <button type="button" class="secondary" data-scene-pause-import-cancel>Cancel</button>
          </div>
        </div>
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

  /* ---------------------------------------------------------------- */
  /* Save data — export/import for every scene that pauses.            */
  /*                                                                   */
  /* The campaign JSON is the only progress there is, and until this   */
  /* section existed nothing could dump or restore it: a playtester    */
  /* with a broken save had no way to hand it over, and a Tauri build  */
  /* has no shared localStorage to inherit. Export ships the persisted */
  /* save verbatim; import goes through the campaign's own             */
  /* migrate+normalize door and reloads the page so every live system  */
  /* re-reads the result.                                              */
  /* ---------------------------------------------------------------- */
  const saveStatus = root.querySelector('[data-scene-pause-save-status]');
  const importPanel = root.querySelector('[data-scene-pause-import-panel]');
  const importText = root.querySelector('[data-scene-pause-import-text]');
  const importFile = root.querySelector('[data-scene-pause-import-file]');

  function showSaveStatus(message, bad = false) {
    saveStatus.textContent = message;
    saveStatus.hidden = !message;
    saveStatus.classList.toggle('bad', Boolean(bad));
  }

  root.querySelector('[data-scene-pause-export]').addEventListener('click', () => {
    const { text } = exportCampaignSave();
    if (!text) {
      showSaveStatus('No saved campaign to export yet.', true);
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `squatchlife-save-${stamp}.json`;
    let downloaded = false;
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      downloaded = true;
    } catch {
      // Some embeds refuse programmatic downloads; the clipboard below still works.
    }
    showSaveStatus(downloaded
      ? `Save exported — ${name}`
      : 'Download blocked — copying to the clipboard instead.');
    navigator.clipboard?.writeText?.(text).then(
      () => showSaveStatus(downloaded
        ? `Save exported — ${name} (also copied to the clipboard)`
        : 'Save copied to the clipboard.'),
      () => {},
    );
  });

  root.querySelector('[data-scene-pause-import]').addEventListener('click', () => {
    importPanel.hidden = !importPanel.hidden;
    showSaveStatus('');
    if (!importPanel.hidden) importText.focus({ preventScroll: true });
  });

  root.querySelector('[data-scene-pause-import-cancel]').addEventListener('click', () => {
    importPanel.hidden = true;
    importText.value = '';
    importFile.value = '';
    showSaveStatus('');
  });

  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (!file) return;
    file.text().then(
      (contents) => { importText.value = contents; },
      () => showSaveStatus('Could not read that file.', true),
    );
  });

  const IMPORT_FAILURES = {
    empty: 'Paste an exported save or choose a file first.',
    invalid_json: 'That is not a save file.',
    invalid_shape: 'That is not a save file.',
    unsupported_version: 'That save is from a newer build than this one, and importing it would damage it.',
    migration_failed: 'That save could not be brought forward to this build.',
    no_storage: 'This browser is not letting the game store anything.',
    write_failed: 'The browser refused to store the save — storage may be full.',
  };

  root.querySelector('[data-scene-pause-import-load]').addEventListener('click', () => {
    const result = importCampaignSave(importText.value);
    if (!result.ok) {
      showSaveStatus(IMPORT_FAILURES[result.reason] ?? 'The save could not be imported.', true);
      return;
    }
    showSaveStatus('Save imported — reloading…');
    setTimeout(() => window.location.reload(), 400);
  });

  /* ---------------------------------------------------------------- */
  /* Settings — one shared store (src/core/settings.js), rendered here  */
  /* so every scene that pauses has the same switches in the same place.*/
  /* ---------------------------------------------------------------- */
  settings.applyBody();
  // Removed before the inputs are collected, so nothing below can drive it.
  if (!assist) root.querySelector('[data-scene-setting-row="assist"]')?.remove();
  const settingInputs = {};
  for (const input of root.querySelectorAll('[data-scene-setting]')) {
    const name = input.dataset.sceneSetting;
    settingInputs[name] = input;
    if (input.type === 'checkbox') {
      input.addEventListener('change', () => { settings.set(name, input.checked); });
    } else {
      input.addEventListener('input', () => { settings.set(name, Number(input.value) / 100); });
    }
  }
  const settingOutputs = {};
  for (const output of root.querySelectorAll('[data-scene-setting-value]')) {
    settingOutputs[output.dataset.sceneSettingValue] = output;
  }
  const keyRows = root.querySelector('[data-scene-settings-keys]');
  const rebindButtons = {};
  for (const [action, label] of settings.KEY_ACTIONS) {
    const row = document.createElement('div');
    const name = document.createElement('span');
    name.textContent = label;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.sceneRebind = action;
    button.addEventListener('click', () => beginRebind(action));
    row.append(name, button);
    keyRows.appendChild(row);
    rebindButtons[action] = button;
  }
  root.querySelector('[data-scene-rebind-reset]').addEventListener('click', () => {
    endRebind();
    settings.resetKeys();
    refreshSettings();
  });

  /* Which action is waiting for its new key, if any. While one is, every
   * keydown is the answer (Esc: no change) and none of it reaches the scene
   * or the Tab handler below. */
  let rebinding = null;
  function beginRebind(action) {
    endRebind();
    rebinding = action;
    rebindButtons[action].classList.add('listening');
    rebindButtons[action].textContent = 'Press a key…';
    window.addEventListener('keydown', onRebindKey, true);
  }
  function endRebind() {
    if (!rebinding) return;
    rebindButtons[rebinding]?.classList.remove('listening');
    rebinding = null;
    window.removeEventListener('keydown', onRebindKey, true);
    refreshSettings();
  }
  function onRebindKey(event) {
    if (!rebinding) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.code === 'Tab' || event.code === 'Escape' || !event.code) {
      endRebind();
      return;
    }
    settings.bindKey(rebinding, event.code);
    endRebind();
  }

  function refreshSettings() {
    for (const [name, input] of Object.entries(settingInputs)) {
      const value = settings.get(name);
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else input.value = String(Math.round(Number(value) * 100));
    }
    for (const [name, output] of Object.entries(settingOutputs)) {
      output.textContent = `${Math.round(Number(settings.get(name)) * 100)}%`;
    }
    const keymap = settings.getKeymap();
    for (const [action, button] of Object.entries(rebindButtons)) {
      if (rebinding === action) continue;
      button.textContent = settings.keyLabel(keymap[action]);
      button.title = keymap[action];
    }
  }
  const unsubscribeSettings = settings.subscribe(() => refreshSettings());

  document.body.appendChild(root);
  let open = false;

  function refresh() {
    refreshSettings();
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
    endRebind();
    root.classList.add('hidden');
    importPanel.hidden = true;
    showSaveStatus('');
    onResume();
    return true;
  }

  function toggle() {
    return open ? resume() : pause();
  }

  function onKeyDown(event) {
    if (event.code !== 'Tab' || event.repeat || rebinding) return;
    /* Typing in the import textarea (or its file picker) must not close the
     * menu out from under the paste. Named precisely: the settings panel is
     * six more inputs, and blanket-excusing INPUT stopped Tab resuming as
     * soon as the player touched a checkbox or a slider. */
    const target = event.target;
    if (open && (target?.tagName === 'TEXTAREA' || target === importFile)) return;
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
      endRebind();
      unsubscribeSettings();
      window.removeEventListener('keydown', onKeyDown, true);
      root.remove();
    },
  };
  window.__scenePause = api;
  return api;
}
