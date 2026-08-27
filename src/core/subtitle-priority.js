/**
 * One subtitle floor, with story dialogue above nearby speech and ambience.
 *
 * Audio systems are allowed to layer room tone and intentionally mixed voices;
 * the readable sentence at the bottom of the screen is not. Callers identify
 * low-value flavor when they submit it, and a higher-priority line can then
 * preempt it while lower-priority late arrivals are declined. Equal priority
 * deliberately keeps Hud's long-standing replace behavior.
 */
export const SUBTITLE_PRIORITIES = Object.freeze({
  AMBIENT: 0,
  NEARBY: 1,
  NORMAL: 2,
  STORY: 3,
});

const NAME_TO_PRIORITY = Object.freeze({
  ambient: SUBTITLE_PRIORITIES.AMBIENT,
  background: SUBTITLE_PRIORITIES.AMBIENT,
  nearby: SUBTITLE_PRIORITIES.NEARBY,
  normal: SUBTITLE_PRIORITIES.NORMAL,
  story: SUBTITLE_PRIORITIES.STORY,
});

export function subtitlePriority(value = 'normal') {
  if (Number.isFinite(value)) {
    return Math.max(SUBTITLE_PRIORITIES.AMBIENT, Math.min(SUBTITLE_PRIORITIES.STORY, value));
  }
  return NAME_TO_PRIORITY[String(value).toLowerCase()] ?? SUBTITLE_PRIORITIES.NORMAL;
}

export class SubtitlePriorityLane {
  constructor({
    show = () => {},
    hide = () => {},
    scheduler = globalThis,
    now = () => globalThis.performance?.now?.() ?? Date.now(),
  } = {}) {
    this._show = show;
    this._hide = hide;
    this._scheduler = scheduler;
    this._now = now;
    this._timer = null;
    this._generation = 0;
    this._current = null;
  }

  /**
   * Claim the subtitle floor. Returns false when a more important line owns it.
   * Low-priority flavor is skipped rather than replayed late out of context.
   */
  say(text, durationMs = 4200, { priority = 'normal' } = {}) {
    const nextPriority = subtitlePriority(priority);
    if (this._current && nextPriority < this._current.priority) return false;

    this._cancelTimer();
    const duration = Math.max(0, Number(durationMs) || 0);
    const generation = ++this._generation;
    this._current = {
      text: String(text ?? ''),
      priority: nextPriority,
      until: this._now() + duration,
    };
    this._show(this._current.text);

    if (typeof this._scheduler?.setTimeout === 'function') {
      this._timer = this._scheduler.setTimeout(() => {
        if (generation !== this._generation) return;
        this._timer = null;
        this._current = null;
        this._hide();
      }, duration);
    }
    return true;
  }

  get busy() { return this._current !== null; }
  get priority() { return this._current?.priority ?? null; }
  get currentText() { return this._current?.text ?? null; }

  clear() {
    this._cancelTimer();
    this._generation += 1;
    this._current = null;
    this._hide();
  }

  _cancelTimer() {
    if (this._timer !== null && typeof this._scheduler?.clearTimeout === 'function') {
      this._scheduler.clearTimeout(this._timer);
    }
    this._timer = null;
  }
}
