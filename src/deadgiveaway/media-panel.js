/**
 * Mic, camera and speakers for the Dead Giveaway table.
 *
 * A thin face over `src/core/online/table-media.js`: device pickers, mic and
 * camera switches, a local preview with the framing sliders that decide how
 * a webcam feed is cropped onto a photo head (face-video.js `faceCropFor`),
 * a speaking light driven by the engine's own voice detection, and the
 * sensitivity it uses. The engine owns every track and connection; this
 * panel only asks it for things.
 *
 * One DOM node, moved rather than duplicated: it lives in the lobby card and
 * is borrowed by the pause menu, so there is never a second preview <video>
 * holding the camera open.
 *
 * Preferences persist per browser in localStorage `dg.media`. Reads and
 * writes are wrapped: a private window or blocked storage gets defaults.
 */

import { VAD_DEFAULT_THRESHOLD } from '../core/online/table-media.js';

const STORE = 'dg.media';

export const DEFAULT_MEDIA_PREFS = Object.freeze({
  micId: '', camId: '', outId: '',
  mic: true, cam: true,
  enabled: false,
  /* The engine's own threshold (a mean byte level, 1..100); lower hears a
   * quieter voice. 50 measured as deaf to a normal speaking level. */
  sensitivity: VAD_DEFAULT_THRESHOLD,
  framing: Object.freeze({ zoom: 1.15, x: 0, y: 0.04 }),
});

export function readMediaPrefs(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(STORE) ?? 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_MEDIA_PREFS, framing: { ...DEFAULT_MEDIA_PREFS.framing } };
    return {
      ...DEFAULT_MEDIA_PREFS,
      ...raw,
      framing: { ...DEFAULT_MEDIA_PREFS.framing, ...(raw.framing ?? {}) },
    };
  } catch {
    return { ...DEFAULT_MEDIA_PREFS, framing: { ...DEFAULT_MEDIA_PREFS.framing } };
  }
}

export function writeMediaPrefs(prefs, storage = globalThis.localStorage) {
  try { storage?.setItem(STORE, JSON.stringify(prefs)); } catch { /* storage refused; keep going */ }
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

/**
 * @param {object} o
 *   getMedia()         the live table-media engine, or null before a room
 *   onStart(prefs)     -> Promise; start the engine with these devices
 *   onFraming(framing) framing sliders moved
 *   onToggle({mic,cam}) the switches changed (main also tells the server)
 */
export function createMediaPanel({ getMedia = () => null, onStart = async () => {}, onFraming = () => {}, onToggle = () => {} } = {}) {
  const prefs = readMediaPrefs();
  let started = false;
  let busy = false;

  const root = el('section', { id: 'dg-media', class: 'dg-media', 'aria-label': 'Microphone and camera' });
  const status = el('div', { class: 'dg-media-status', 'data-dg': 'media-status', text: 'Microphone and camera are off.' });
  const startBtn = el('button', { type: 'button', class: 'dg-btn', 'data-dg': 'media-start', text: 'Turn on mic & camera' });
  const micBtn = el('button', { type: 'button', class: 'dg-toggle', 'data-dg': 'mic', 'aria-pressed': 'false', text: 'Mic' });
  const camBtn = el('button', { type: 'button', class: 'dg-toggle', 'data-dg': 'cam', 'aria-pressed': 'false', text: 'Camera' });
  const level = el('i', { class: 'dg-level', title: 'Lights while the table can hear you' });
  const meterBar = el('i');
  const meter = el('div', { class: 'dg-meter', title: 'Test level: your microphone as the voice detector hears it' }, [meterBar]);
  const micSel = el('select', { 'aria-label': 'Microphone' });
  const camSel = el('select', { 'aria-label': 'Camera' });
  const outSel = el('select', { 'aria-label': 'Speakers' });
  const preview = el('video', { class: 'dg-preview', muted: true, playsinline: true, autoplay: true });
  preview.muted = true;
  const previewWrap = el('div', { class: 'dg-preview-wrap' }, [preview, el('div', { class: 'dg-preview-frame' })]);
  const sliders = {};
  const sliderRow = (key, label, min, max, step) => {
    const input = el('input', { type: 'range', min, max, step, value: prefs.framing[key] ?? 0, 'aria-label': label });
    input.addEventListener('input', () => {
      prefs.framing[key] = Number(input.value);
      writeMediaPrefs(prefs);
      applyPreviewFraming();
      onFraming({ ...prefs.framing });
    });
    sliders[key] = input;
    return el('label', { class: 'dg-slider' }, [el('span', { text: label }), input]);
  };
  const sens = el('input', { type: 'range', min: 1, max: 60, step: 1, value: prefs.sensitivity, 'aria-label': 'Voice threshold' });

  root.append(
    el('div', { class: 'dg-media-row' }, [startBtn, micBtn, camBtn, level, meter]),
    status,
    el('div', { class: 'dg-media-grid' }, [
      el('label', {}, [el('span', { text: 'Microphone' }), micSel]),
      el('label', {}, [el('span', { text: 'Camera' }), camSel]),
      el('label', {}, [el('span', { text: 'Speakers' }), outSel]),
    ]),
    el('div', { class: 'dg-media-preview' }, [
      previewWrap,
      el('div', { class: 'dg-sliders' }, [
        sliderRow('zoom', 'Face zoom', 1, 3, 0.01),
        sliderRow('x', 'Left / right', -1, 1, 0.01),
        sliderRow('y', 'Up / down', -1, 1, 0.01),
        el('label', { class: 'dg-slider' }, [el('span', { text: 'Voice threshold (lower hears quieter)' }), sens]),
      ]),
    ]),
  );

  function applyPreviewFraming() {
    const f = prefs.framing;
    /* An approximation of faceCropFor for the flat preview: zoom in, then
     * slide toward the chosen edge of what is left over. */
    const spare = (1 - 1 / f.zoom) * 50;
    preview.style.transform = `scaleX(-1) scale(${f.zoom}) translate(${f.x * spare}%, ${f.y * spare}%)`;
  }
  applyPreviewFraming();

  function fillSelect(select, list, chosen, fallbackLabel) {
    select.replaceChildren(el('option', { value: '', text: fallbackLabel }));
    for (const d of list ?? []) {
      const opt = el('option', { value: d.deviceId ?? d.id ?? '', text: d.label || `${fallbackLabel} ${select.length}` });
      if (opt.value === chosen) opt.selected = true;
      select.append(opt);
    }
  }

  async function refreshDevices() {
    const media = getMedia();
    if (!media?.listDevices) return;
    try {
      const { mics, cams, outs } = await media.listDevices();
      fillSelect(micSel, mics, prefs.micId, 'Default microphone');
      fillSelect(camSel, cams, prefs.camId, 'Default camera');
      fillSelect(outSel, outs, prefs.outId, 'Default speakers');
      outSel.disabled = !(outs?.length);
    } catch { /* device listing is a nicety */ }
  }

  function refreshPreview() {
    const media = getMedia();
    const stream = media?.localPreview?.() ?? null;
    if (preview.srcObject !== stream) {
      preview.srcObject = stream;
      if (stream) preview.play?.()?.catch?.(() => {});
    }
    previewWrap.classList.toggle('empty', !stream || !prefs.cam);
  }

  let note = ''; // a device the engine could not open; cleared by a later successful toggle
  function renderToggles() {
    micBtn.setAttribute('aria-pressed', String(started && prefs.mic));
    camBtn.setAttribute('aria-pressed', String(started && prefs.cam));
    micBtn.classList.toggle('on', started && prefs.mic);
    camBtn.classList.toggle('on', started && prefs.cam);
    micBtn.disabled = !started || busy;
    camBtn.disabled = !started || busy;
    startBtn.classList.toggle('hidden', started);
    startBtn.disabled = busy || !getMedia();
    status.textContent = !getMedia()
      ? 'Sit down at a table first.'
      : started
        ? `${prefs.mic ? 'Mic on' : 'Mic muted'} · ${prefs.cam ? 'camera on' : 'camera off'}${note ? ` · ${note}` : ''}`
        : 'Microphone and camera are off.';
  }

  async function start() {
    if (started || busy || !getMedia()) return;
    busy = true;
    renderToggles();
    try {
      const got = await onStart({ ...prefs, framing: { ...prefs.framing } });
      started = true;
      prefs.enabled = true;
      /* Believe the engine, not the wish: a denied or missing camera (or mic)
       * leaves the toggle off and says so, instead of showing "camera on"
       * while the roster says cam:false. */
      const denied = [];
      if (got && prefs.cam && got.cam === false) { prefs.cam = false; denied.push('camera'); }
      if (got && prefs.mic && got.mic === false) { prefs.mic = false; denied.push('microphone'); }
      writeMediaPrefs(prefs);
      note = denied.length ? `could not open the ${denied.join(' or ')}: check the browser permission and pick a device` : '';
      await refreshDevices();
      refreshPreview();
    } catch (error) {
      status.textContent = `Could not open the microphone or camera: ${error?.message ?? error}`;
    } finally {
      busy = false;
      renderToggles();
      if (!started) status.textContent = status.textContent || 'Microphone and camera are off.';
    }
  }

  async function toggle(kind) {
    const media = getMedia();
    if (!media || !started || busy) return;
    busy = true;
    const next = !prefs[kind];
    try {
      if (kind === 'mic') await media.setMic(next);
      else await media.setCam(next);
      prefs[kind] = next;
      note = '';
      writeMediaPrefs(prefs);
      onToggle({ mic: prefs.mic, cam: prefs.cam });
    } catch (error) {
      status.textContent = `That did not work: ${error?.message ?? error}`;
    } finally {
      busy = false;
      renderToggles();
      refreshPreview();
    }
  }

  startBtn.addEventListener('click', () => { start(); });
  micBtn.addEventListener('click', () => { toggle('mic'); });
  camBtn.addEventListener('click', () => { toggle('cam'); });
  const onDevice = (key, select) => select.addEventListener('change', async () => {
    prefs[key] = select.value;
    writeMediaPrefs(prefs);
    try { await getMedia()?.setDevices?.({ [key]: select.value || undefined }); } catch (error) {
      status.textContent = `Could not switch: ${error?.message ?? error}`;
    }
    refreshPreview();
  });
  onDevice('micId', micSel);
  onDevice('camId', camSel);
  onDevice('outId', outSel);
  sens.addEventListener('input', () => {
    prefs.sensitivity = Number(sens.value);
    writeMediaPrefs(prefs);
    getMedia()?.setSensitivity?.(prefs.sensitivity);
  });

  renderToggles();

  /* The test level: the engine's own 0..255 mean, the number its voice
   * detector compares against the sensitivity. Only polled while visible. */
  setInterval(() => {
    if (!started || !root.isConnected || root.offsetParent === null) return;
    const v = Number(getMedia()?.level?.() ?? 0);
    meterBar.style.width = `${Math.max(0, Math.min(100, (v / 120) * 100))}%`;
  }, 120);

  return {
    el: root,
    prefs,
    start,
    get started() { return started; },
    setSpeaking(on) { level.classList.toggle('on', Boolean(on)); },
    /** The engine came or went (joined/left a room). */
    refresh() { renderToggles(); refreshPreview(); },
    reset() {
      started = false;
      preview.srcObject = null;
      renderToggles();
    },
    /** Move the one panel node somewhere else (lobby card, pause menu). */
    mount(parent) { if (parent && root.parentNode !== parent) parent.append(root); },
  };
}
