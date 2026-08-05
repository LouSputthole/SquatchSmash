/**
 * The combat record, readable by a person.
 *
 * Every resolved shot can be written here; a verifier reads the entries the
 * way it reads a mission's `report()`. Bounded, cheap, and OFF by default in
 * release — a scene turns it on for debugging or a headless check.
 */
export class CombatLog {
  constructor({ capacity = 200, enabled = false } = {}) {
    this.capacity = capacity;
    this.enabled = enabled;
    this.entries = [];
    this.counts = { shots: 0, hits: 0, kills: 0, headshots: 0, helmetSaves: 0 };
  }

  /**
   * @param {object} e {shooter, weapon, target, region, raw, damage,
   *   armorSpent, distance, fatal, headshot, helmetSaved, friendly}
   */
  hit(e) {
    this.counts.hits++;
    if (e.fatal) this.counts.kills++;
    if (e.headshot) this.counts.headshots++;
    if (e.helmetSaved) this.counts.helmetSaves++;
    if (!this.enabled) return;
    this.entries.push({ type: 'hit', ...e });
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
  }

  shot(e) {
    this.counts.shots++;
    if (!this.enabled) return;
    this.entries.push({ type: 'shot', ...e });
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
  }

  event(type, e = {}) {
    if (!this.enabled) return;
    this.entries.push({ type, ...e });
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
  }

  /** One line per entry, the shape the owner asked to be able to read. */
  format(entry) {
    if (entry.type !== 'hit') return `[${entry.type}] ${JSON.stringify({ ...entry, type: undefined })}`;
    const parts = [
      `${entry.shooter ?? '?'} -> ${entry.target ?? '?'}`,
      `${entry.weapon ?? '?'}`,
      `${entry.region ?? 'world'}`,
      `raw ${round1(entry.raw)} final ${round1(entry.damage)}`,
    ];
    if (entry.armorSpent) parts.push(`armor -${round1(entry.armorSpent)}`);
    parts.push(`${round1(entry.distance)}m`);
    if (entry.helmetSaved) parts.push('HELMET SAVE');
    if (entry.headshot) parts.push('HEADSHOT');
    if (entry.fatal) parts.push('FATAL');
    if (entry.friendly) parts.push('FRIENDLY');
    return parts.join(' | ');
  }

  tail(n = 12) { return this.entries.slice(-n).map((e) => this.format(e)); }

  clear() { this.entries.length = 0; }
}

function round1(v) { return Math.round((v ?? 0) * 10) / 10; }
