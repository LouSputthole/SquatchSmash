export const DAY_MINUTES = 24 * 60;

/**
 * A display clock owned by authored campaign events.
 *
 * Frame updates record real session time for the HUD, but never advance the
 * story clock. Tasks, travel, missions, and sleep apply explicit campaign time.
 */
export class AuthoredClock {
  constructor(startHour = 6 + 4 / 60) {
    this.minutes = startHour * 60;
    this.day = 1;
    this.elapsedReal = 0;
  }

  get hour() { return this.minutes / 60; }

  get clock() {
    const h = Math.floor(this.hour) % 24;
    const m = Math.floor(this.minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  get clock12() {
    const h24 = Math.floor(this.hour) % 24;
    const m = String(Math.floor(this.minutes % 60)).padStart(2, '0');
    const h = h24 % 12 || 12;
    return `${h}:${m} ${h24 < 12 ? 'AM' : 'PM'}`;
  }

  setTime(day, timeMinutes) {
    if (!Number.isSafeInteger(day) || day < 1) {
      throw new RangeError('Clock day must be a positive integer');
    }
    if (!Number.isFinite(timeMinutes) || timeMinutes < 0 || timeMinutes >= DAY_MINUTES) {
      throw new RangeError('Clock minutes must be within one day');
    }
    this.day = day;
    this.minutes = timeMinutes;
  }

  update(dt) {
    this.elapsedReal += Math.max(0, Number.isFinite(dt) ? dt : 0);
  }
}
