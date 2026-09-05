import { renderInventorySlots } from './scene-inventory.js';
import { writeGameplayPromptKey } from './gameplay-key-adapter.js';
import {
  conciseObjectiveItems,
  createObjectiveDisplayController,
  ensureObjectivePanelStyle,
} from './objective-panel.js';
import { SubtitlePriorityLane } from './subtitle-priority.js';

/**
 * THE PROMPT, ONCE, FOR SCENES THAT CANNOT HAVE THE WHOLE HUD.
 *
 * `InteractionSystem` (src/core/interaction.js) wants exactly three methods --
 * showPrompt, hidePrompt, setHold -- and `Hud` below has them. But `Hud` is
 * the APARTMENT'S furniture: its constructor reaches for #crosshair, #subtitle,
 * #hand-item, #radio-osd, #clock, #bladder and #toast-stack, and throws in any
 * page that has none of them. So four scenes wrote their own three methods
 * instead, and called the object `tinyHud` in all four, which is the tell.
 *
 * They drifted, as four copies of anything do:
 *
 *   - silvercase wrote the label to `textContent`. Every descriptor in this
 *     repo writes its prompt as MARKUP -- `Use <b>triage</b> &mdash; 2
 *     dressings left` -- and interaction.js says so at the top of the file.
 *     The siege had the identical bug and the owner reported it as scenery:
 *     *"Healing crate shows a bunch of underneath coding instead of it"*. It
 *     was never the crate; it was the sentence in front of it.
 *   - the siege's `setHold` had no null branch, so the one call that means
 *     "stop holding" wrote `0%` by arithmetic accident rather than on purpose.
 *   - only heist cleared the hold bar when the prompt went away.
 *   - only the mansion suppressed the key cap on a passive `LOOK` prompt,
 *     which is a thing worth having everywhere and existed in one place.
 *
 * So the LOGIC lives here and the four pass their own elements in. The two
 * visibility idioms in the tree are both first-class rather than normalised:
 * most of the game hides with a `hidden` class, silvercase shows with a `show`
 * class, and rewriting one scene's CSS to unify them would be a bigger change,
 * to a thing that works, for a smaller reason.
 *
 * @param {object} elements
 * @param {Element} elements.prompt         the box that appears and disappears
 * @param {Element} elements.label          takes the descriptor's MARKUP
 * @param {Element} [elements.key]          the key cap
 * @param {Element} [elements.holdFill]     the bar whose width is the progress
 * @param {Element} [elements.holdContainer] shown only while holding
 * @param {Element} [elements.crosshair]    gets `active` while a prompt is up
 * @param {'hidden'|'show'} [elements.visibility] which class means what
 * @param {string} [elements.holdClass]     class on holdContainer while holding
 * @param {string[]} [elements.passiveKeys] keys that mean "no button to press"
 */
export function createPromptHud({
  prompt, label, key = null, holdFill = null, holdContainer = null,
  crosshair = null, visibility = 'hidden', holdClass = null,
  passiveKeys = ['LOOK'],
} = {}) {
  /* `toggle(el, on)` in one place, so the two idioms cannot disagree about
   * what "on" means anywhere below. */
  const showing = visibility === 'show';
  const setVisible = (element, on) => {
    if (!element) return;
    element.classList.toggle(showing ? 'show' : 'hidden', showing ? on : !on);
  };
  const setHoldVisible = (on) => {
    if (!holdContainer || !holdClass) return;
    holdContainer.classList.toggle(holdClass, on);
  };

  const setHold = (progress) => {
    if (progress === null || progress === undefined) {
      setHoldVisible(false);
      if (holdFill) holdFill.style.width = '0%';
      return;
    }
    setHoldVisible(true);
    if (holdFill) holdFill.style.width = `${Math.round(progress * 100)}%`;
  };

  return {
    showPrompt(text, cap = 'E') {
      if (!prompt) return;
      /* interaction.js resolves a callable label before it calls this, but
       * scenes call showPrompt directly too and two of them passed functions. */
      const markup = typeof text === 'function' ? text() : text;
      /* MARKUP, NOT TEXT -- see the note above. The inequality guard is not
       * tidiness: showPrompt runs every frame the crosshair is on a thing, and
       * assigning innerHTML reparses the fragment each time. */
      if (label && label.innerHTML !== markup) label.innerHTML = markup ?? '';
      /* A passive prompt has no button to press. `LOOK` is the mansion's, and
       * writing the cap out AND hiding it is deliberate: a cap that still says
       * LOOK when the CSS is overridden is better than an empty box. */
      const passive = passiveKeys.includes(cap);
      if (key) {
        writeGameplayPromptKey(key, passive ? '' : cap);
        key.classList.toggle('hidden', passive);
      }
      setVisible(prompt, true);
      crosshair?.classList.add('active');
    },
    hidePrompt() {
      setVisible(prompt, false);
      /* Always. Only one of the four copies did this, and a hold bar left at
       * 80 per cent behind a hidden prompt reappears full on the next one. */
      setHold(null);
      crosshair?.classList.remove('active');
    },
    /** progress 0..1, or null to put the hold bar away. */
    setHold,
  };
}

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
    this._subtitleLane = new SubtitlePriorityLane({
      show: (text) => {
        this.subtitle.innerHTML = text;
        this.subtitle.classList.remove('hidden');
      },
      hide: () => this.subtitle.classList.add('hidden'),
    });
    this._prompt = createPromptHud({
      prompt: this.prompt,
      label: this.promptLabel,
      key: this.promptKey,
      holdFill: this.promptBar,
      holdContainer: this.prompt,
      holdClass: 'holding',
      crosshair: this.crosshair,
    });
  }

  /* The apartment's own prompt is the shared one with the apartment's
   * elements in it -- `holding` on the prompt box itself is this scene's hold
   * idiom, and the crosshair lighting up is nobody else's. Written this way
   * round so there is one implementation rather than a fifth. */
  showPrompt(label, key = 'E') { this._prompt.showPrompt(label, key); }

  hidePrompt() { this._prompt.hidePrompt(); }

  /** progress 0..1, or null to hide the hold bar. */
  setHold(progress) { this._prompt.setHold(progress); }

  /** Narration line at the bottom of the screen. `<em>` renders in amber. */
  say(text, ms = 4200, options = {}) {
    /* Legacy Hud calls are authored foreground lines. Systems producing room
     * chatter or nearby flavor opt into a lower lane explicitly. */
    return this._subtitleLane.say(text, ms, {
      priority: options.priority ?? 'story',
    });
  }

  sayAmbient(text, ms = 3200) {
    return this.say(text, ms, { priority: 'ambient' });
  }

  /** True while a subtitle is on screen -- the narrator waits its turn. */
  get saying() {
    return this._subtitleLane.busy;
  }

  /** Cut a pending narration line dead. A checkpoint retry calls this so the
   * failed attempt's subtitle (and its hide timer) cannot play on into the
   * restored timeline. */
  clearSay() {
    this._subtitleLane.clear();
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
   * Takes what `ApartmentStory.objectives()` produced and applies the shared
   * live-HUD projection: one actionable step, no future calls, and no completed
   * errands. The story still owns the durable ledger and marks the step that
   * came from its own door verdict; the HUD only projects that verdict.
   *
   * @param {{day: number, items: {id: string, label: string, done: boolean,
   *   required: boolean}[]}|null} plan
   */
  setObjectives(plan) {
    if (!this.objectives) {
      this.objectives = document.getElementById('objectives');
      this.objectivesTitle = this.objectives?.querySelector('.otitle');
      this.objectivesList = this.objectives?.querySelector('.olist');
      if (this.objectives) {
        /* The apartment's list joins the shared panel — upper left, gold
         * rule, the same furniture every mission scene uses. Its old
         * top-right clock idiom is retired; owner, 2026-09-01: "it's, like,
         * in the top right ... use the top left, like, our objective system
         * that we have." */
        this.objectives.classList.add('op-panel');
        ensureObjectivePanelStyle(document);
        this.objectivesHint = document.createElement('div');
        this.objectivesHint.className = 'ohint hidden';
        this.objectives.append(this.objectivesHint);
        this._objectiveVisibility = createObjectiveDisplayController({
          show: () => this.objectives.classList.remove('hidden'),
          collapse: () => this.objectives.classList.add('hidden'),
        });
      }
    }
    if (!this.objectives) return;
    /* ONE ROUTE ACTION PLUS ONE SOFT OPPORTUNITY, which is the shape the Bing
     * settled on and this shared path never picked up. `conciseObjectiveItems`
     * defaults `optionalLimit` to 0, so the starter apartment -- the only
     * caller of this method -- drew the required row and nothing else, and
     * Day One's whole optional tutorial went dark: the inbox, the computer, a
     * game of Squatch Smash, and `killtime`, which is the row that tells a man
     * waiting on a Bing that does not open until a quarter to midnight that he
     * can sleep it off or have a drink. Without it the flat reads as a room
     * with one chore and no way to pass the time. */
    const items = conciseObjectiveItems(plan?.items, { optionalLimit: 1 });
    if (!plan || !items.length) {
      this._objectivesKey = null;
      this._objectiveVisibility.clear();
      return;
    }
    // Only touch the DOM when the list actually reads differently.
    const primary = items.find((item) => item.current) ?? items.find((item) => !item.rule && !item.done);
    const hint = plan.hint || primary?.hint || '';
    const key = `${plan.day}|${hint}|${items.map((i) => [
      i.id ?? '',
      i.rule ?? '',
      i.label ?? '',
      i.required === false ? 'o' : 'r',
      i.current ? 'n' : '',
      i.tally ? `${i.tally.count ?? 0}/${i.tally.total ?? 0}` : '',
    ].join(':')).join(',')}`;
    if (key === this._objectivesKey) return;
    this._objectivesKey = key;
    this.objectivesTitle.textContent = `Day ${plan.day} · today`;
    this.objectivesHint.textContent = hint;
    this.objectivesHint.classList.toggle('hidden', !hint);
    this.objectivesList.replaceChildren(...items.map((item) => {
      const el = document.createElement('li');
      el.className = `${item.done ? 'done' : ''} ${item.required ? 'required' : ''}`.trim();
      el.textContent = item.label;
      return el;
    }));
    this._objectiveVisibility.changed();
  }

  /** Review the current plan without mutating story state. */
  revealObjectives() { this._objectiveVisibility?.reveal(); }

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

  /**
   * EARSHOT, WHICH THE READOUT DID NOT HAVE.
   *
   * Owner, 2026-08-26: *"Radio station always showing in the bottom left
   * maybe only show when in close range of radio like inside the cabin."*
   * The OSD tracked whether the radio was ON, and the radio stays on while
   * the player walks a ridge two hundred metres away. A set that is playing
   * to an empty room does not get to caption his screen.
   *
   * Kept as a separate latch rather than folded into `setRadio` because the
   * two facts are independent: the Radio owns what is playing, the scene owns
   * whether he can hear it, and either can change without the other.
   */
  setRadioAudible(audible) {
    const next = audible !== false;
    if (next === this._radioAudible) return;
    this._radioAudible = next;
    this.radioOsd.classList.toggle('hidden', !next || !this._radioState);
  }

  setRadio(state) {
    this._radioState = state ?? null;
    if (!state) {
      this.radioOsd.classList.add('hidden');
      return;
    }
    this.radioName.textContent = state.station;
    this.radioTrack.textContent = state.track;
    /* Default true, so a scene that never calls `setRadioAudible` behaves
     * exactly as it did before this existed. */
    this.radioOsd.classList.toggle('hidden', this._radioAudible === false);
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
