export const EXECUTION_CHOICE_SECONDS = 10;

/**
 * Simulation-time choice clock for Gratin's pistol handoff.
 *
 * It never uses setTimeout, so pausing the game pauses the decision and a
 * verifier can cross the deadline deterministically. Timeout deliberately
 * resolves to "gratin", the same authored outcome as choosing NO.
 */
export class CabinExecutionChoice {
  constructor({
    element = null,
    seconds = EXECUTION_CHOICE_SECONDS,
    onResolve = null,
  } = {}) {
    this.element = element;
    this.seconds = Math.max(0.1, Number(seconds) || EXECUTION_CHOICE_SECONDS);
    this.onResolve = onResolve;
    this.remaining = 0;
    this.active = false;
    this.result = null;
    this.reason = null;
    this._buttons = [...(element?.querySelectorAll?.('[data-choice]') || [])];
    for (const button of this._buttons) {
      button.addEventListener('click', () => this.choose(button.dataset.choice));
    }
    this.render();
  }

  open() {
    this.remaining = this.seconds;
    this.active = true;
    this.result = null;
    this.reason = null;
    this.render();
    return true;
  }

  choose(value, reason = 'player') {
    if (!this.active) return false;
    const normalized = value === 'yes' || value === 'player' ? 'player' : 'gratin';
    this.active = false;
    this.result = normalized;
    this.reason = reason;
    this.render();
    this.onResolve?.(normalized, reason);
    return true;
  }

  handleKey(code) {
    if (!this.active) return false;
    if (code === 'Digit1' || code === 'Numpad1') return this.choose('player', 'player');
    if (code === 'Digit2' || code === 'Numpad2') return this.choose('gratin', 'player');
    return false;
  }

  update(dt) {
    if (!this.active) return;
    this.remaining = Math.max(0, this.remaining - Math.max(0, Number(dt) || 0));
    if (this.remaining <= 0) {
      this.choose('gratin', 'timeout');
      return;
    }
    this.render();
  }

  close() {
    this.active = false;
    this.render();
  }

  render() {
    if (!this.element) return;
    this.element.classList.toggle('hidden', !this.active);
    const progress = this.active ? (this.remaining / this.seconds) * 100 : 0;
    this.element.style.setProperty('--choice-progress', progress.toFixed(2) + '%');
    const clock = this.element.querySelector('.choice-clock span');
    if (clock) clock.textContent = this.remaining.toFixed(1);
  }

  snapshot() {
    return Object.freeze({
      active: this.active,
      remaining: this.remaining,
      result: this.result,
      reason: this.reason,
    });
  }
}

export function createCabinExecutionChoice(options) {
  return new CabinExecutionChoice(options);
}
