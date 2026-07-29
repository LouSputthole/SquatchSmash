// ---------------------------------------------------------------------------
// The Reserve: forensic jerky inspection, treated with the seriousness usually
// reserved for uncut diamonds.
//
// Each run rolls a shipment that is genuine, partially cut with gas-station
// product, or completely counterfeit. The player never gets told which — they
// have to work it out with their nose, their hands and a reference card.
// ---------------------------------------------------------------------------

export const GRADES = ['genuine', 'partial', 'counterfeit'];

export function rollShipment(rng = Math.random) {
  const r = rng();
  const grade = r < 0.42 ? 'genuine' : r < 0.75 ? 'partial' : 'counterfeit';
  const total = 8;
  const fakeCount = grade === 'genuine' ? 0 : grade === 'partial' ? 3 + Math.floor(rng() * 2) : total;
  const packages = [];
  for (let i = 0; i < total; i++) {
    packages.push({ id: i + 1, authentic: i >= fakeCount, intact: true });
  }
  // The sample Rico presents is drawn from the top layer — which is the good
  // layer in a partial shipment, because of course it is.
  const sampleAuthentic = grade !== 'counterfeit';
  return {
    grade,
    packages,
    total,
    fakeCount,
    sampleAuthentic,
    serial: `R-${String(Math.floor(rng() * 900) + 100)}-${grade === 'counterfeit' ? 'XX' : 'AC'}`,
  };
}

// Every inspection action, what it costs in seller patience, and what it tells
// you. `evidence` is signed: positive means "this is real", negative means
// "this came off a rack next to the windshield fluid".
export const INSPECTIONS = [
  {
    id: 'smell', label: 'Smell it', key: '1', heat: 1,
    real: { line: 'Seventy-two hours of hickory and something classified underneath.', evidence: 0.28, prospect: 'This smoke is real.' },
    fake: { line: 'Liquid smoke. Sprayed, not earned.', evidence: -0.34, prospect: 'I can smell preservatives.' },
  },
  {
    id: 'bend', label: 'Bend the strip', key: '2', heat: 1,
    real: { line: 'It cracks at the edge and holds in the middle. Correct.', evidence: 0.26, prospect: 'Brittle outside, alive inside.' },
    fake: { line: 'It folds like a wallet and springs back. Sugar does that.', evidence: -0.3, prospect: 'This strip has been folded.' },
  },
  {
    id: 'grain', label: 'Inspect the grain', key: '3', heat: 3,
    real: { line: 'Long fibres, marbled fat, cut with the grain by somebody who cared.', evidence: 0.34, prospect: 'Somebody who loved this animal cut this.' },
    fake: { line: 'Cut against the grain, and every strip is the same width.', evidence: -0.4, prospect: 'This was cut against the grain. Who handled it?' },
  },
  {
    id: 'moisture', label: 'Check moisture', key: '4', heat: 2,
    real: { line: 'Dry to the thumb, damp at the core. Eleven years sounds honest.', evidence: 0.24, prospect: 'Cured, not dried.' },
    fake: { line: 'Sticky. Tacky glaze on the outside, wet in the middle.', evidence: -0.32, prospect: 'You stored this near fish.' },
  },
  {
    id: 'taste', label: 'Taste a sample', key: '5', heat: 4,
    real: { line: 'Dark red interior. Faint metallic seasoning. The room gets very quiet.', evidence: 0.42, prospect: 'That is the Reserve.' },
    fake: { line: 'Salt, sugar, regret.', evidence: -0.46, prospect: 'I have eaten belts with better texture.' },
  },
  {
    id: 'reference', label: 'Compare to reference notes', key: '6', heat: 2,
    real: { line: 'Matches the plate on the card: brittle edge, marbled fat, serialised stamp.', evidence: 0.3, prospect: 'It matches the card.' },
    fake: { line: 'Nothing on this strip matches the card. Not one line.', evidence: -0.38, prospect: 'The card and the meat disagree.' },
  },
  {
    id: 'scan', label: 'Scan the packaging', key: '7', heat: 5,
    real: { line: 'Wax seal intact, numbered label, humidity indicator still blue. RESTRICTED AGRICULTURAL PRODUCT.', evidence: 0.36, prospect: 'Stamp is serialised.' },
    fake: { line: 'Under the foil there is a convenience-store logo, scraped, but not scraped enough.', evidence: -0.55, prospect: 'You scraped the logo off. You did not scrape it well.' },
  },
  {
    id: 'origin', label: 'Ask where it came from', key: '8', heat: 6,
    real: { line: 'Rico names a valley, a year and a butcher. He does not blink behind the sunglasses.', evidence: 0.22, prospect: 'He answered too fast to be lying.' },
    fake: { line: 'Rico names a valley. Chino names a different valley. They look at each other.', evidence: -0.42, prospect: 'Nobody in this room agrees where the cattle died.' },
  },
];

export class Inspection {
  constructor(shipment) {
    this.shipment = shipment;
    this.done = new Set();
    this.evidence = 0;      // signed confidence
    this.verdictKnown = false;
    this.verdict = null;    // 'genuine' | 'counterfeit'
  }

  available() {
    return INSPECTIONS.filter((i) => !this.done.has(i.id));
  }

  // Run an inspection. Returns { line, prospect, heat, revealed }
  run(id) {
    const spec = INSPECTIONS.find((i) => i.id === id);
    if (!spec || this.done.has(id)) return null;
    this.done.add(id);

    // Package-level checks look at the whole shipment; sensory checks look at
    // the sample Rico is holding.
    const deepCheck = id === 'scan' || id === 'reference' || id === 'grain';
    let real;
    if (deepCheck) {
      real = this.shipment.grade === 'genuine';
    } else {
      real = this.shipment.sampleAuthentic;
      // A partial shipment hides behind a good sample, so sensory checks are
      // less decisive when the truth is "some of it".
      if (this.shipment.grade === 'partial') real = Math.random() < 0.65;
    }
    const out = real ? spec.real : spec.fake;
    this.evidence += out.evidence;

    let revealed = false;
    if (!this.verdictKnown && Math.abs(this.evidence) >= 0.7) {
      this.verdictKnown = true;
      this.verdict = this.evidence > 0 ? 'genuine' : 'counterfeit';
      revealed = true;
    }
    return { line: out.line, prospect: out.prospect, heat: spec.heat, revealed, verdict: this.verdict };
  }

  // Did the player actually get it right about this shipment?
  correct() {
    if (!this.verdictKnown) return false;
    const truthIsFake = this.shipment.grade !== 'genuine';
    return truthIsFake === (this.verdict === 'counterfeit');
  }
}

// ---------------- Freshness ----------------
// The Reserve is a perishable, and the getaway is not gentle.

export class Freshness {
  constructor() {
    this.value = 100;
    this.log = [];
  }

  damage(amount, reason) {
    const before = this.value;
    this.value = Math.max(0, this.value - amount);
    if (before !== this.value && reason && !this.log.includes(reason)) this.log.push(reason);
    return this.value;
  }

  get grade() {
    if (this.value >= 85) return 'PRISTINE';
    if (this.value >= 60) return 'ACCEPTABLE';
    if (this.value >= 35) return 'HUMIDITY DAMAGE';
    if (this.value > 0) return 'SPOILING';
    return 'RUINED';
  }
}
