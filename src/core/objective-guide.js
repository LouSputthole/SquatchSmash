import * as THREE from 'three';
import { getKeymap } from './settings.js';
import { createObjectiveGuideClock, objectiveMarkerPosition } from './objective-guide-state.js';

/**
 * Authored scene targets, shared presentation. The adapter supplies the next
 * door, landmark or interaction from live mission state; no label matching,
 * geometry scans, campaign writes, or speculative future targets.
 */
export function createObjectiveGuide({ camera, panel, getTarget, getStep, isActive,
  doc = globalThis.document, win = globalThis.window } = {}) {
  if (!doc?.body || !win?.requestAnimationFrame) return { dispose() {}, reveal() {} };
  const style = doc.createElement('style');
  style.textContent = `
    [data-objective-marker] { position:fixed; z-index:8; pointer-events:none;
      transform:translate(-50%,-50%); text-align:center; color:#ffe3a0;
      font:12px/1.4 "Trebuchet MS",system-ui,sans-serif; text-shadow:0 2px 4px #000; }
    [data-objective-marker][hidden] { display:none; }
    [data-objective-marker] .guide-symbol { display:block; font-size:28px; line-height:32px; }
    [data-objective-marker] .guide-label { display:block; max-width:min(210px,55vw);
      padding:4px 8px; background:rgba(8,6,10,.85); border-radius:3px; }
    .objective-guide-tip { margin-top:7px; color:#e4d3a3; font:11px/1.4 system-ui,sans-serif; }
  `;
  doc.head.append(style);
  const marker = doc.createElement('div');
  marker.dataset.objectiveMarker = '';
  marker.hidden = true;
  marker.setAttribute('aria-hidden', 'true');
  const symbol = doc.createElement('span');
  symbol.className = 'guide-symbol';
  const label = doc.createElement('span');
  label.className = 'guide-label';
  marker.append(symbol, label);
  doc.body.append(marker);
  const tip = doc.createElement('div');
  tip.className = 'objective-guide-tip';
  panel?.append(tip);
  const clock = createObjectiveGuideClock();
  const point = new THREE.Vector3();
  const local = new THREE.Vector3();
  const eye = new THREE.Vector3();
  let frame = null;
  let previous = 0;
  let disposed = false;
  const keyAvailable = () => !Object.values(getKeymap()).includes('KeyJ');
  const reveal = () => clock.reveal();
  function onKey(event) {
    if (event.code !== 'KeyJ' || event.repeat || event.defaultPrevented
      || event.ctrlKey || event.metaKey || event.altKey || event.isComposing
      || !keyAvailable() || !isActive()
      || event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    reveal();
  }
  function update(now) {
    if (disposed) return;
    frame = win.requestAnimationFrame(update);
    if (now - previous < 100) return;
    const dt = previous ? (now - previous) / 1000 : 0;
    previous = now;
    const active = !doc.hidden && isActive();
    const target = active ? getTarget() : null;
    const hint = target ? (keyAvailable() ? '[J] Show direction · Tab for recovery' : 'Tab · Show objective direction') : '';
    if (tip.textContent !== hint) tip.textContent = hint;
    if (!target) {
      marker.hidden = true;
      if (active) clock.clear();
      return;
    }
    if (target.object) {
      target.object.getWorldPosition(point);
      point.y += target.lift ?? 0.5;
    } else if (target.position) point.copy(target.position);
    else { marker.hidden = true; return; }
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(eye);
    const distance = eye.distanceTo(point);
    const visible = clock.update({ step: `${getStep()}|${target.id}`, distance, active, dt });
    marker.hidden = !visible;
    if (!visible) return;
    local.copy(point).applyMatrix4(camera.matrixWorldInverse);
    const position = objectiveMarkerPosition(local, {
      width: win.innerWidth, height: win.innerHeight, fov: camera.fov, aspect: camera.aspect,
    });
    if (!position) { marker.hidden = true; return; }
    const inset = Math.min(128, win.innerWidth * 0.30 + 12);
    marker.style.left = `${Math.max(inset, Math.min(win.innerWidth - inset, position.x))}px`;
    marker.style.top = `${Math.max(50, Math.min(win.innerHeight - 50, position.y))}px`;
    marker.dataset.target = target.id;
    marker.dataset.onScreen = String(position.onScreen);
    symbol.textContent = position.onScreen ? '◇' : '➤';
    symbol.style.transform = position.onScreen ? '' : `rotate(${position.angle}deg)`;
    const text = `${target.label} · ${Math.round(distance)} m`;
    if (label.textContent !== text) label.textContent = text;
  }
  const api = { reveal, available: () => Boolean(getTarget()), dispose() {
    disposed = true;
    win.cancelAnimationFrame(frame);
    win.removeEventListener('keydown', onKey);
    win.removeEventListener('pagehide', api.dispose);
    if (win.__objectiveGuide === api) delete win.__objectiveGuide;
    marker.remove(); tip.remove(); style.remove();
  } };
  win.__objectiveGuide = api;
  win.addEventListener('keydown', onKey);
  win.addEventListener('pagehide', api.dispose, { once: true });
  frame = win.requestAnimationFrame(update);
  return api;
}
