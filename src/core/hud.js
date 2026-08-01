import { renderInventorySlots } from './scene-inventory.js';

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

  toast(text, kind = '', duration = 2800) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`.trim();
    el.textContent = text;
    this.toasts.appendChild(el);
    setTimeout(() => el.classList.add('out'), Math.max(0, duration - 600));
    setTimeout(() => el.remove(), duration);
  }

  /**
   * Draw the carried slots. Rebuilt on change rather than kept in sync
   * element-by-element -- it is five nodes and it changes when you pick
   * something up, which is not a rate worth optimising for.
   */
  setInventory(inv, items) {
    if (!this.hotbar) this.hotbar = document.getElementById('hotbar');
    if (!this.hotbar) return;
    /* Drawn even when every slot is empty. It used to vanish until he was
     * carrying something, which meant the one thing that tells you there ARE
     * pockets only appeared once you had already worked out that there were --
     * and it blinked out again the moment you put the last thing down. Five
     * empty squares is the answer to "what am I carrying": nothing. */
    if (!inv) {
      this.hotbar.classList.add('hidden');
      this.hotbar.replaceChildren();
      return;
    }
    renderInventorySlots(this.hotbar, {
      slots: inv.slots,
      items: inv.items,
      selected: inv.selected,
      catalog: items,
    });
  }

  /**
   * The morning's list.
   *
   * Takes what `ApartmentStory.objectives()` produced and does nothing to it
   * but draw it -- no filtering, no reordering, no second opinion about what
   * counts as done. A HUD that decides for itself what the objectives are is
   * a HUD that will eventually disagree with the door.
   *
   * @param {{day: number, items: {id: string, label: string, done: boolean,
   *   required: boolean}[]}|null} plan
   */
  setObjectives(plan) {
    if (!this.objectives) {
      this.objectives = document.getElementById('objectives');
      this.objectivesTitle = this.objectives?.querySelector('.otitle');
      this.objectivesList = this.objectives?.querySelector('.olist');
    }
    if (!this.objectives) return;
    if (!plan || !plan.items?.length) {
      this.objectives.classList.add('hidden');
      return;
    }
    // Only touch the DOM when the list actually reads differently.
    const key = `${plan.day}|${plan.items.map((i) => `${i.id}${i.done ? '1' : '0'}${i.required ? 'r' : ''}`).join(',')}`;
    if (key === this._objectivesKey) return;
    this._objectivesKey = key;
    this.objectivesTitle.textContent = `Day ${plan.day} · today`;
    this.objectivesList.replaceChildren(...plan.items.map((item) => {
      const el = document.createElement('li');
      el.className = `${item.done ? 'done' : ''} ${item.required ? 'required' : ''}`.trim();
      el.textContent = item.label;
      return el;
    }));
    this.objectives.classList.remove('hidden');
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
    const mins = Math.floor(elapsedReal / 60);
    if (time12 === this._clockShown && mins === this._clockSpentMinute) return;
    this._clockShown = time12;
    this._clockSpentMinute = mins;
    this.clockDay.textContent = `Day ${day}`;
    this.clockTime.textContent = time12;
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

  /**
   * The sweeping timing bar.
   * @param {?object} v from TimingBar.view -- null hides it.
   */
  setTiming(v) {
    this.timing ??= document.getElementById('timing');
    if (!this.timing) return;
    if (!v) { this.timing.classList.add('hidden'); return; }
    const el = this.timing;
    el.classList.remove('hidden');
    el.classList.toggle('hit', v.flash === 'hit');
    el.classList.toggle('miss', v.flash === 'miss');
    el.style.setProperty('--mark', v.pos.toFixed(4));
    el.style.setProperty('--win-from', v.from);
    el.style.setProperty('--win-to', v.to);
    // Pips only get rebuilt when the count moves, not every frame.
    if (this._pipSig !== `${v.hits}/${v.total}`) {
      this._pipSig = `${v.hits}/${v.total}`;
      el.querySelector('.pips').innerHTML =
        Array.from({ length: v.total }, (_, i) => `<i class="${i < v.hits ? 'on' : ''}"></i>`).join('');
    }
  }

  /**
   * The push queue: keys to hit while you are sat down working on it.
   * @param {?Array<{key: string, state: string}>} keys null hides the row.
   */
  setPushes(keys) {
    this.pushes ??= document.getElementById('pushes');
    if (!this.pushes) return;
    if (!keys || !keys.length) { this.pushes.classList.add('hidden'); return; }
    this.pushes.classList.remove('hidden');
    /* The row is fixed -- W A S D, always -- so the boxes are built once and
     * only their class changes after that. Rebuilding the innerHTML to relight
     * one key made the whole row re-layout and flicker. */
    if (this._pushKeys !== keys.map((k) => k.key).join('')) {
      this._pushKeys = keys.map((k) => k.key).join('');
      this.pushes.innerHTML = keys.map((k) => `<b>${k.key}</b>`).join('');
      this._pushEls = [...this.pushes.querySelectorAll('b')];
      this._pushSig = null;
    }
    const sig = keys.map((k) => k.state).join('|');
    if (sig !== this._pushSig) {
      this._pushSig = sig;
      keys.forEach((k, i) => { this._pushEls[i].className = k.state; });
    }
  }

  /**
   * The standing hint: what gets you out of whatever posture you are in.
   * @param {?string} what e.g. 'get up' -- null hides it.
   */
  setPosture(what) {
    this.posture ??= document.getElementById('posture');
    if (!this.posture) return;
    if (what) this.posture.querySelector('span').textContent = what;
    this.posture.classList.toggle('hidden', !what);
  }
}
