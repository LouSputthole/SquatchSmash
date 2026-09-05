/** Readable notes from finished calls, stored inside the campaign save. */
const NOTES = Object.freeze({
  lou_first_call: 'Get ready and go to the Bada Bing tonight. Lou is expecting you.',
  lou_golf_call: 'Meet Lou at Silver Pines tomorrow at eight. Route Twenty-Three, second gate. Wear walking shoes and bring nothing.',
  lou_heist_call: 'The car is coming. Gray suit, armor, gloves, mask, both guns, magazines and the empty duffel. Meet Snow at the safehouse; he is in charge.',
  lou_no_wake_call: 'South Harbor, Gate C, quarter to one. Plain clothes. Leave the phone in the glovebox. Booski and Willy are coming.',
  booski_silver_case_call: 'Ape collects you tomorrow. Keep the sensitive package with you, do not open it, and deliver it to Lou himself.',
  booski_special_meeting_call: 'Special meeting. Seff, Lag and Numbskull will collect you. Get dressed for the pickup and be outside.',
  'cabin.lou.arrival': 'Stay at the cabin. No city or visitors. Walk the property, speak to Lag and keep your phone on.',
  'cabin.margo.first_call': 'Front & Center, the Silver Room, nine o’clock. Margo expects you on time and properly dressed.',
  'cabin.booski.sasole': 'Captain Sasole needs a second pair of hands at the nearby airstrip. Leave now; Lag can point you toward the road.',
  'cabin.booski.billy': 'Return to the Bing for Billy Hotdog’s party tonight. The car is out front. Clean shirt, no stops.',
});

export function normalizePhoneBriefings(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).filter((entry) => {
    if (!entry || typeof entry.id !== 'string' || !entry.id || entry.id.length > 120
      || typeof entry.text !== 'string' || !entry.text.trim() || seen.has(entry.id)) return false;
    seen.add(entry.id); return true;
  }).slice(0, 32).map((entry) => ({
    id: entry.id, from: String(entry.from || 'Unknown caller').slice(0, 80),
    text: entry.text.slice(0, 6000), day: Math.max(1, Math.min(999, Math.floor(Number(entry.day) || 1))),
    at: String(entry.at || '').slice(0, 20),
  }));
}

export function briefingFromCall(definition, turns, { day = 1, at = '' } = {}) {
  const id = definition?.eventId || definition?.id || definition?.vo;
  if (!id || !turns?.length) return null;
  // Unknown calls retain their actual completed words, rather than inventing orders.
  const text = NOTES[id] ?? turns.map((turn) => `${turn.who === 'me' ? 'Tony' : definition.from}: ${turn.text}`).join('\n');
  return normalizePhoneBriefings([{ id, from: definition.from, text, day, at }])[0] ?? null;
}
