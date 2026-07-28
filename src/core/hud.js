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
    this.toasts = document.getElementById('toast-stack');
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
    this._subTimer = setTimeout(() => this.subtitle.classList.add('hidden'), ms);
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

  setMode(mode) {
    document.body.classList.toggle('seated', mode === 'seated');
  }
}
