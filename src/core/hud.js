/** Thin wrapper over the DOM overlay so game code never touches elements directly. */
export class Hud {
  constructor() {
    this.crosshair = document.getElementById('crosshair');
    this.prompt = document.getElementById('prompt');
    this.promptKey = this.prompt.querySelector('.key');
    this.promptLabel = this.prompt.querySelector('.label');
    this.promptBar = this.prompt.querySelector('.holdbar i');
    this.subtitle = document.getElementById('subtitle');
    this.handItem = document.getElementById('hand-item');
    this.handIcon = this.handItem.querySelector('.icon');
    this.handName = this.handItem.querySelector('.name');
    this.handHint = this.handItem.querySelector('.hint');
    this.radioOsd = document.getElementById('radio-osd');
    this.radioName = this.radioOsd.querySelector('.rtitle span');
    this.radioTrack = this.radioOsd.querySelector('.rtrack');
    this.clockEl = document.getElementById('clock');
    this.clockDay = this.clockEl.querySelector('.day');
    this.clockTime = this.clockEl.querySelector('.time');
    this.clockSpent = this.clockEl.querySelector('.spent');
    this._clockShown = '';
    this.bladder = document.getElementById('bladder');
    this.bladderFill = this.bladder.querySelector('.bar i');
    this.toasts = document.getElementById('toast-stack');
    this._bladderShown = -1;
    this._subTimer = null;
  }

  showPrompt(label, key = 'E') {
    this.prompt.classList.remove('hidden');
    this.crosshair.classList.add('active');
    if (this.promptLabel.innerHTML !== label) this.promptLabel.innerHTML = label;
    if (this.promptKey.textContent !== key) this.promptKey.textContent = key;
  }

  hidePrompt() {
    this.prompt.classList.add('hidden');
    this.prompt.classList.remove('holding');
    this.crosshair.classList.remove('active');
  }

  /** progress 0..1, or null to hide the hold bar. */
  setHold(progress) {
    if (progress === null) {
      this.prompt.classList.remove('holding');
      return;
    }
    this.prompt.classList.add('holding');
    this.promptBar.style.width = `${Math.round(progress * 100)}%`;
  }

  /** Narration line at the bottom of the screen. `<em>` renders in amber. */
  say(text, ms = 4200) {
    clearTimeout(this._subTimer);
    this.subtitle.innerHTML = text;
    this.subtitle.classList.remove('hidden');
    this._sayUntil = performance.now() + ms;
    this._subTimer = setTimeout(() => this.subtitle.classList.add('hidden'), ms);
  }

  /** True while a subtitle is on screen -- the narrator waits its turn. */
  get saying() {
    return performance.now() < (this._sayUntil || 0);
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`.trim();
    el.textContent = text;
    this.toasts.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2800);
  }

  setHand(item) {
    if (!item) {
      this.handItem.classList.add('hidden');
      return;
    }
    this.handIcon.textContent = item.icon;
    this.handName.textContent = item.name;
    this.handHint.textContent = item.hint || '';
    this.handItem.classList.remove('hidden');
  }

  setRadio(state) {
    if (!state) {
      this.radioOsd.classList.add('hidden');
      return;
    }
    this.radioName.textContent = state.station;
    this.radioTrack.textContent = state.track;
    this.radioOsd.classList.remove('hidden');
  }

  /**
   * Time of day, plus how long the player has actually been in here.
   * Only touches the DOM when the displayed minute changes.
   */
  setClock(day, time12, elapsedReal) {
    if (time12 === this._clockShown) return;
    this._clockShown = time12;
    this.clockDay.textContent = `Day ${day}`;
    this.clockTime.textContent = time12;
    const mins = Math.floor(elapsedReal / 60);
    this.clockSpent.textContent = mins < 1
      ? 'just got up'
      : `${mins} min in here`;
  }

  /** Only shows once there is something worth showing. */
  setBladder(level, draining, label = 'bladder') {
    if (this._bladderLabel !== label) {
      this._bladderLabel = label;
      this.bladder.querySelector('.cap').textContent = label;
    }
    const show = level > 0.35 || draining;
    this.bladder.classList.toggle('hidden', !show);
    this.bladder.classList.toggle('urgent', level > 0.8 && !draining);
    this.bladder.classList.toggle('draining', !!draining);
    const pct = Math.round(level * 100);
    if (pct !== this._bladderShown) {
      this._bladderShown = pct;
      this.bladderFill.style.width = `${pct}%`;
    }
  }

  setMode(mode) {
    document.body.classList.toggle('seated', mode === 'seated');
  }
}
