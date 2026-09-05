import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureDomShim } from '../tools/three-shim.mjs';
import { createCampaign, CAMPAIGN_STORAGE_KEY, CAMPAIGN_VERSION, exportCampaignSave, importCampaignSave } from '../src/core/campaign.js';
import { Phone } from '../src/core/phone.js';
import { normalizePhoneBriefings } from '../src/core/phone-briefings.js';
import { readSaveFeedback, saveFeedbackText, subscribeSaveFeedback } from '../src/core/save-feedback.js';
ensureDomShim();
class Storage {
  values = new Map(); reject = false;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.reject) throw new Error('quota'); this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
const definition = { eventId: 'lou_no_wake_call', from: 'LOU', vo: 'test.call', lines: ['Gate C.', 'Quarter to one.'] };
function finish(phone) { for (let i = 0; i < 20 && phone.call; i++) phone.update(30); }

test('only a finished call earns a durable briefing, preserved on reload and deduplicated', () => {
  const storage = new Storage(); const campaign = createCampaign({ storage });
  const phone = new Phone({ campaign, calls: [], time: { day: 7, hour: 10 } });
  phone.ring(definition); phone.hangUp();
  assert.equal(campaign.state.phoneBriefings.length, 0);
  phone.ring(definition); phone.answer(); phone.update(0.1); phone.hangUp();
  assert.equal(campaign.state.phoneBriefings.length, 0);
  phone.ring(definition); phone.answer(); finish(phone);
  assert.equal(campaign.state.phoneBriefings.length, 1);
  assert.match(campaign.state.phoneBriefings[0].text, /South Harbor, Gate C/);
  const reloaded = createCampaign({ storage });
  assert.deepEqual(reloaded.state.phoneBriefings, campaign.state.phoneBriefings);
  assert.equal(reloaded.recoveredNow, false);
  phone.ring(definition); phone.answer(); finish(phone);
  assert.equal(campaign.state.phoneBriefings.length, 1);
  assert.equal(campaign.state.phoneBriefings[0].day, 7);
});

test('old saves migrate without claiming unheard calls or resetting the route', () => {
  const storage = new Storage(); const campaign = createCampaign({ storage });
  const old = { ...campaign.state, version: 27 };
  delete old.phoneBriefings; delete old.saveReceipt;
  storage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(old));
  const migrated = createCampaign({ storage });
  assert.equal(migrated.state.version, CAMPAIGN_VERSION);
  assert.deepEqual(migrated.state.scene, old.scene);
  assert.deepEqual(migrated.state.phoneBriefings, []);
  assert.equal(migrated.recoveredNow, false);
});

test('export and import carry completed call notes and the successful checkpoint receipt together', () => {
  const source = new Storage(); const campaign = createCampaign({ storage: source });
  const phone = new Phone({ campaign, calls: [], time: { day: 7, hour: 10 } });
  phone.ring(definition); phone.answer(); finish(phone);
  const destination = new Storage();
  assert.equal(importCampaignSave(exportCampaignSave({ storage: source }).text, { storage: destination }).ok, true);
  const restored = createCampaign({ storage: destination });
  assert.deepEqual(restored.state.phoneBriefings, campaign.state.phoneBriefings);
  assert.deepEqual(restored.state.scene, campaign.state.scene);
  assert.deepEqual(restored.state.saveReceipt, campaign.state.saveReceipt);
  assert.equal(restored.recoveredNow, false);
});

test('a failed write preserves the prior successful receipt and reports the failure', () => {
  const storage = new Storage(); const campaign = createCampaign({ storage });
  campaign.update((state) => { state.activities.eaten = true; });
  const saved = JSON.parse(storage.getItem(CAMPAIGN_STORAGE_KEY));
  assert.ok(saved.saveReceipt.at > 0);
  storage.reject = true;
  campaign.update((state) => { state.activities.showered = true; });
  assert.deepEqual(campaign.state.saveReceipt, saved.saveReceipt);
  assert.equal(storage.getItem(CAMPAIGN_STORAGE_KEY), JSON.stringify(saved));
  assert.match(saveFeedbackText(readSaveFeedback()), /not saving/);
  storage.reject = false;
  const unsubscribe = subscribeSaveFeedback(() => { throw new Error('broken view'); });
  campaign.update((state) => { state.activities.dressed = true; });
  unsubscribe();
  assert.equal(campaign.saveFailing, false);
  assert.match(saveFeedbackText(readSaveFeedback()), /^Saved /);
  campaign.reset();
  assert.deepEqual(readSaveFeedback().briefings, []);
  assert.equal(readSaveFeedback().receipt, null);
});

test('briefing normalisation bounds imported text and rejects duplicate or invalid entries', () => {
  const entries = normalizePhoneBriefings([{ id: 'one', text: 'x'.repeat(7000) }, { id: 'one', text: 'duplicate' }, { id: 'two' }]);
  assert.equal(entries.length, 1); assert.equal(entries[0].text.length, 6000);
});

test('completed unknown calls preserve their words and notes remain navigable in both directions', () => {
  const phone = new Phone({ calls: [] });
  for (const id of ['first', 'second']) {
    phone.ring({ eventId: id, from: 'Caller', lines: [`Directions from ${id}.`] });
    phone.answer(); finish(phone);
  }
  assert.match(phone.briefings[0].text, /Directions from second/);
  assert.match(phone.briefings[1].text, /Directions from first/);
  for (let i = 0; i < 4; i++) phone.press();
  assert.equal(phone.screen, 'briefings');
  assert.equal(phone.canCycle, true);
  phone.cycle(1); assert.equal(phone.briefing, 1);
  phone.cycle(-1); assert.equal(phone.briefing, 0);
  phone.press(); assert.equal(phone.screen, 'home');
});
