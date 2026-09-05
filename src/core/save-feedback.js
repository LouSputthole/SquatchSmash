/** One display receipt for the most recent successful campaign write. */
let current = { receipt: null, failing: false, preview: false, persistent: false, briefings: [] };
const listeners = new Set();
let hideTimer = null;

export function normalizeSaveReceipt(value) {
  if (!value || !Number.isFinite(value.at) || value.at <= 0 || value.at > 1e15
    || typeof value.scene !== 'string' || typeof value.label !== 'string') return null;
  return { at: Math.floor(value.at), scene: value.scene.slice(0, 80), label: value.label.slice(0, 120),
    checkpoint: String(value.checkpoint || '').slice(0, 100) };
}

export function readSaveFeedback() { return { ...current }; }
export function subscribeSaveFeedback(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function saveFeedbackText(status = current) {
  if (status.preview) return 'Preview progress only · your campaign save is untouched.';
  if (status.failing) return 'Progress is not saving. Export backs up the last successful save only.';
  if (!status.persistent) return 'Progress is in memory only. Leaving this page will lose these changes.';
  if (!status.receipt) return 'No save time recorded yet. Your next saved action will appear here.';
  const { receipt } = status;
  return `Saved ${new Date(receipt.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${receipt.label}${receipt.checkpoint ? ` · ${receipt.checkpoint.replaceAll('_', ' ')}` : ''}`;
}

export function publishSaveFeedback(status, { milestone = false } = {}) {
  current = { ...current, ...status };
  for (const listener of listeners) {
    try { listener(readSaveFeedback()); } catch { /* A view cannot invalidate a completed write. */ }
  }
  if (!milestone || current.preview || current.failing || !current.persistent) return;
  const doc = globalThis.document;
  // The downloaded-game cold open must not reveal the campaign behind it.
  if (!doc?.body?.classList?.contains('playing')) return;
  try {
    let element = doc.getElementById('campaign-save-receipt');
    if (!element) {
      element = doc.createElement('div'); element.id = 'campaign-save-receipt';
      element.setAttribute('role', 'status');
      element.style.cssText = 'position:fixed;right:20px;bottom:174px;z-index:7;padding:8px 12px;background:#101a15e8;color:#d7edce;border-left:2px solid #9ec58d;font:12px/1.4 system-ui;pointer-events:none';
      doc.body.appendChild(element);
    }
    element.textContent = 'Progress saved'; element.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { element.hidden = true; }, 3200);
    hideTimer?.unref?.();
  } catch { /* Save feedback is optional on headless/tearing-down documents. */ }
}

export function campaignSaveMilestone(state) {
  return JSON.stringify([state.scene, state.story?.chapter, state.story?.timeEvents,
    state.activities, Object.values(state.missions ?? {}).map((mission) => [mission.status, mission.checkpoint]),
    state.phoneBriefings?.map((entry) => entry.id)]);
}
