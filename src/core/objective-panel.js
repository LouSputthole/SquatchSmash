/**
 * THE OBJECTIVE PANEL. ONE OF THEM.
 *
 * Three scenes had already written this, three different ways, and a fourth
 * was about to:
 *
 *   - `src/style.css` puts `#objectives` top RIGHT, under the apartment's
 *     clock, in the clock's own idiom. That is a deliberate composition and it
 *     stays where it is.
 *   - `src/bing/bing.css` puts the same id top LEFT with a magenta rule.
 *   - `src/silver/silver.css` puts it somewhere else again and fades it in
 *     cutscenes.
 *   - The mansion had no on-screen objective at all. Its objective text
 *     existed and was only ever visible in the PAUSE MENU, which is the one
 *     place a player is not playing.
 *
 * The owner's note is the correct one: "We keep reinventing and using
 * different systems instead of using what we already have." So this is the
 * implementation, once, and the rule that goes with it is in
 * `docs/REUSE-FIRST.md`.
 *
 * WHAT IT DOES NOT DO. It does not move anybody's panel. If the page already
 * has an `#objectives` element, this drives THAT element and touches no
 * styling — the apartment keeps its clock idiom, the Bing keeps its magenta.
 * Only a page with no panel at all gets the default one, upper left, which is
 * where the owner asked for it.
 *
 * The markup contract is the one `core/hud.js`'s `setObjectives` already
 * renders — a `.otitle` and a `.olist` of `<li>` with `done` / `required` —
 * because a second markup shape would be a second system by another name.
 */

const STYLE_ID = 'objective-panel-style';

/** The opt-in fade window, for a scene that asks for one. Nobody does today. */
export const OBJECTIVE_DISPLAY_MS = 12_000;

/**
 * Shared visibility clock for both the stand-alone panel and the apartment Hud.
 * Frame-loop callers can submit the same objective forever without extending
 * its life; only a changed signature calls `changed()`.
 *
 * THE CARD STAYS UP. Owner, 2026-08-31: *"all the objectives displ;ay then
 * basically dissapear. We should keep them displayed no need to hide them so
 * often."* The twelve-second fade this controller was built around read well
 * in isolation and played as a vanishing act, so `autoCollapse` now defaults
 * OFF everywhere: a card leaves the screen when the plan is empty (`clear()`)
 * and for no other reason. The timer machinery stays for a scene that
 * explicitly opts back in — a cutscene that must own the whole frame — but
 * opting in is the exception now, not the default.
 */
export function createObjectiveDisplayController({
  show = () => {},
  collapse = () => {},
  durationMs = OBJECTIVE_DISPLAY_MS,
  scheduler = globalThis,
  autoCollapse = false,
} = {}) {
  let timer = null;
  const cancel = () => {
    if (timer !== null && typeof scheduler?.clearTimeout === 'function') {
      scheduler.clearTimeout(timer);
    }
    timer = null;
  };
  const reveal = () => {
    cancel();
    show();
    if (autoCollapse && Number.isFinite(durationMs) && durationMs > 0
      && typeof scheduler?.setTimeout === 'function') {
      timer = scheduler.setTimeout(() => {
        timer = null;
        collapse();
      }, durationMs);
    }
  };
  return {
    changed: reveal,
    reveal,
    clear() { cancel(); collapse(); },
    dispose() { cancel(); },
  };
}

/**
 * Upper left, quiet, and out of the way of a crosshair.
 *
 * Deliberately close to the Bing's, which is the panel the owner is describing
 * when he says "the upper left". Injected rather than linked so a scene can
 * adopt the panel without an edit to its HTML — the reason the mansion never
 * had one is that adding a panel used to mean touching three files.
 */
const STYLE = `
#objectives.op-panel {
  position: fixed;
  top: 18px;
  left: 20px;
  min-width: 210px;
  max-width: 320px;
  padding: 10px 14px 11px;
  background: rgba(8, 6, 10, 0.62);
  border-left: 2px solid #c9a227;
  border-radius: 2px;
  font: 12px/1.5 "Trebuchet MS", system-ui, sans-serif;
  letter-spacing: 0.4px;
  z-index: 6;
  pointer-events: none;
  transition: opacity 0.35s;
  /* DECLARED, not inherited. src/style.css styles a bare #objectives for the
   * apartment -- top RIGHT, right-aligned, a flex list -- and golf, the
   * graveyard and the Palace all link that sheet for shared HUD furniture. The
   * panel wins on every property it sets and quietly lost these two, so each
   * of those three grew an identical override in its own stylesheet. Setting
   * them here deletes all three. The selector #objectives.op-panel only ever
   * matches a panel this module built, so the apartment's own list is
   * untouched. (No back-ticks in here: this block is a template literal.) */
  text-align: left;
}
#objectives.op-panel.hidden { opacity: 0; }
#objectives.op-panel .otitle {
  color: #c9a227;
  font-size: 10px;
  letter-spacing: 2.4px;
  text-transform: uppercase;
  margin-bottom: 6px;
}
#objectives.op-panel .olist { display: block; margin: 0; padding: 0; list-style: none; }
#objectives.op-panel .olist li {
  color: #f2eee1;
  padding-left: 15px;
  position: relative;
  margin: 3px 0;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
}
#objectives.op-panel .olist li::before {
  content: "▸";
  position: absolute;
  left: 0;
  color: #ffd08a;
}
/* Kept as a defensive style for adopted/static markup. The renderer projects
 * completed work out of the live list before it reaches this stylesheet. */
#objectives.op-panel .olist li.done {
  color: #6f6a5f;
  text-decoration: line-through;
}
#objectives.op-panel .olist li.done::before { content: "✓"; color: #9fe08a; }
/* The ones that are worth doing but will not stop you. Dimmer, italic,
 * hollow bullet — so the list does not lie about which is which. */
#objectives.op-panel .olist li:not(.required):not(.done) {
  color: #9a9280;
  font-style: italic;
}
#objectives.op-panel .olist li:not(.required)::before { content: "◦"; }
/* The line under an objective that answers "which way". Quieter than the
 * objective, because a player who already knows should be able to ignore it. */
#objectives.op-panel .ohint {
  margin-top: 6px;
  color: rgba(242, 238, 225, 0.7);
  font-size: 11px;
  font-style: normal;
  line-height: 1.35;
}
#objectives.op-panel .ohint.hidden { display: none; }
`;

/**
 * Adopt the shared panel look on a page that already owns an `#objectives`
 * element. The starter apartment uses this: its element predates the shared
 * panel, and the owner moved it onto the house style (2026-09-01: "use the
 * top left, like, our objective system that we have") — so the Hud stamps
 * `op-panel` on its element and injects this stylesheet instead of keeping
 * the old clock-idiom block in src/style.css.
 */
export function ensureObjectivePanelStyle(doc = globalThis.document) {
  if (doc?.head) ensureStyle(doc);
}

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  /* FIRST in the head, not last, and that is the whole reason a scene can
   * place this panel at all.
   *
   * Every rule above is written `#objectives.op-panel`, and so is every scene
   * override of it -- `src/cartel-palace/cartel-palace.css:123`,
   * `src/golf/golf.css:65`, `src/heist/heist.css:23`. Equal specificity, so
   * the cascade decides on source order, and a stylesheet the page LINKS is
   * parsed long before a module gets to run. Appending put this block last and
   * it silently beat all three: the Palace asked for `top: 70px` to clear its
   * evidence strip, golf for `top: 106px`, the heist for `top: 84px`, and all
   * three panels sat at this file's own `top: 18px` -- in the Palace's case
   * directly on top of the evidence count, which is what the owner reported as
   * "Rescue ... covers Evidence 3/3".
   *
   * Prepending makes these the defaults they are documented to be. Nothing is
   * lost against `src/style.css`'s bare `#objectives`: that selector is one id
   * to this one's id-plus-class, so specificity keeps this winning wherever no
   * scene has an opinion. */
  /* (The append fallback is for the headless test doc, whose head knows
   * nothing of prepend; order is moot with no CSSOM.) */
  if (typeof doc.head.prepend === 'function') doc.head.prepend(style);
  else doc.head.append(style);
}

/**
 * Project an authored objective ledger onto what is actionable right now.
 * Completed work leaves the HUD immediately; section rules remain only when
 * they still introduce at least one active line. The underlying story can
 * retain its complete ledger for save logic, pause recaps and QA without
 * turning the live panel into a spoiler-filled checklist.
 */
export function activeObjectiveItems(items = []) {
  const projected = [];
  let activeSinceRule = false;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item) continue;
    if (item.rule) {
      if (activeSinceRule) projected.unshift(item);
      activeSinceRule = false;
      continue;
    }
    /* `pending` has to be part of the exported projection, not merely the DOM
     * adapter below. The apartment HUD consumes this helper directly; keeping
     * the check in createObjectivePanel meant the same authored plan hid a
     * future call in every adopted panel except the starter apartment.
     *
     * Completed work retires by default. A deliberately persistent tally opts
     * out with `retire: false`: this is the narrow exception for a meaningful
     * result such as 7/7, not permission for old errands to accumulate. */
    if (item.pending || (item.done && item.retire !== false) || !item.label) continue;
    projected.unshift(item);
    activeSinceRule = true;
  }
  return projected;
}

/**
 * Project a durable ledger onto one honest next action.
 *
 * Story and recovery systems are allowed to retain the whole ledger. The live
 * HUD is not: it names the explicitly-current row when one exists, otherwise
 * the first unfinished required row, plus at most the requested number of
 * soft opportunities. Deliberately persistent completed tallies remain.
 * Section headings survive only when one of their selected children does.
 */
export function conciseObjectiveItems(items = [], { optionalLimit = 0 } = {}) {
  const active = activeObjectiveItems(items);
  const rows = active.filter((item) => !item.rule);
  const persistent = rows.filter((item) => item.done && item.retire === false);
  const unfinished = rows.filter((item) => !item.done);
  const primary = unfinished.find((item) => item.current)
    ?? unfinished.find((item) => item.required !== false)
    ?? unfinished[0]
    ?? null;
  const soft = unfinished
    .filter((item) => item !== primary && item.required === false)
    .slice(0, Math.max(0, Math.trunc(optionalLimit)));
  const selected = new Set([...persistent, ...(primary ? [primary] : []), ...soft]);
  if (!selected.size) return [];

  const projected = [];
  let rule = null;
  for (const item of active) {
    if (item.rule) {
      rule = item;
      continue;
    }
    if (!selected.has(item)) continue;
    if (rule) projected.push(rule);
    rule = null;
    projected.push(item);
  }
  return projected.map((item) => (item === primary && !item.current
    ? { ...item, current: true }
    : item));
}

/**
 * Drive the page's objective panel, creating one if the page has none.
 *
 * @param {object} [options]
 * @param {HTMLElement} [options.parent] where a created panel is appended
 * @param {Document} [options.doc]
 * @returns {{element: HTMLElement, set: Function, setLine: Function,
 *   clear: Function, dispose: Function, adopted: boolean}}
 */
export function createObjectivePanel({
  parent = null,
  doc = null,
  displayDurationMs = OBJECTIVE_DISPLAY_MS,
  /* Default OFF — see createObjectiveDisplayController. The panel hides when
   * the plan empties, not on a clock. */
  autoCollapse = false,
  scheduler = undefined,
} = {}) {
  const document_ = doc ?? globalThis.document ?? null;
  if (!document_) return nullPanel();
  const host = parent ?? document_.body;
  if (!host) return nullPanel();

  let element = document_.getElementById('objectives');
  const adopted = Boolean(element);
  if (!element) {
    ensureStyle(document_);
    element = document_.createElement('div');
    element.id = 'objectives';
    element.className = 'op-panel hidden';
    host.append(element);
  }
  let title = element.querySelector('.otitle');
  if (!title) {
    title = document_.createElement('div');
    title.className = 'otitle';
    element.append(title);
  }
  let list = element.querySelector('.olist');
  if (!list) {
    list = document_.createElement('ul');
    list.className = 'olist';
    element.append(list);
  }
  let hint = element.querySelector('.ohint');
  if (!hint) {
    hint = document_.createElement('div');
    hint.className = 'ohint hidden';
    element.append(hint);
  }

  /* Only touch the DOM when the list actually reads differently. A panel
   * rebuilt every frame is a panel that cannot be selected, animated, or
   * profiled, and this one is rebuilt from a getter on every tick. */
  let signature = null;
  const visibility = createObjectiveDisplayController({
    show: () => element.classList.remove('hidden'),
    collapse: () => element.classList.add('hidden'),
    durationMs: displayDurationMs,
    autoCollapse,
    /* A supplied fake owns deterministic tests. A real Document's window owns
     * browser timers. A headless fake with no window deliberately schedules
     * nothing instead of keeping Node alive for twelve seconds per test. */
    scheduler: scheduler ?? document_.defaultView ?? null,
  });

  /**
   * WHAT A PANEL IS ALLOWED TO SAY, WHICH IS LESS THAN IT USED TO.
   *
   * Owner, 2026-08-26, on the Cabin: *"Also hide the objective that is answer
   * lous call and display it only as he calls. Remove the finish the Cabin
   * chapter from objectives what does that even mean. Keep the objectives
   * concise and relevant to whats next and then once complete remove and
   * replace with the new objectives we need to implement that across the
   * board."*
   *
   * Two rules, and they live here rather than in one scene because "across
   * the board" is the whole point of this module existing.
   *
   * `pending: true` -- the item is real but not yet the player's problem, so
   * it is not drawn at all. Lou's call is the case: listing "answer Lou's
   * call" before the phone rings tells the player about a thing he cannot do
   * and then leaves it sitting there, unticked, looking like a failure.
   *
   * Completed work retires by default. `retire: false` is the deliberate,
   * narrow exception for a meaningful result such as 7/7; it remains while
   * the next actionable row replaces the work that produced it. Empty section
   * headings still leave with their children.
   */
  function set(plan) {
    const items = activeObjectiveItems(plan?.items ?? []);
    if (!plan || !items.length) {
      if (signature === null && element.classList.contains('hidden')) return;
      signature = null;
      visibility.clear();
      return;
    }
    const key = [
      plan.title ?? '',
      plan.hint ?? '',
      ...items.map((item) => (item.rule
        ? `rule:${item.rule}`
        : `${item.label}|${item.done ? 1 : 0}|${item.required === false ? 0 : 1}`
          + `|${item.current ? 1 : 0}|${item.tally ? `${item.tally.count ?? 0}/${item.tally.total}` : ''}`)),
    ].join('');
    if (key === signature) return;
    signature = key;
    title.textContent = plan.title ?? 'Objective';
    list.replaceChildren(...items.map((item) => {
      const li = document_.createElement('li');
      /* A HEADING INSIDE THE LIST, because two scenes had one before this
       * panel existed and neither should have to keep a whole renderer alive
       * for it: the Bing and the Silver Room both break their optional work
       * out under "WHILE YOU ARE HERE". A list item rather than a nested list,
       * so the CSS both scenes already wrote keeps working. */
      if (item.rule) {
        li.className = 'rule';
        li.textContent = item.rule;
        return li;
      }
      const classes = [];
      if (item.done) classes.push('done');
      /* `required` and `optional` are the same fact under two names, and both
       * ship: the mansion and the heist style `.required`, the Bing and the
       * Silver Room style `.optional`. Emitting one and not the other would
       * silently unstyle two scenes the day they adopted this. */
      if (item.required === false) classes.push('optional');
      else classes.push('required');
      /* THE ONE HE IS DOING NOW. The Silver Room marks it; nobody else does
       * yet, and it costs a class. */
      if (item.current) classes.push('now');
      li.className = classes.join(' ');
      /* A COUNT IN FRONT OF THE WORDS -- "3/5 talk to the family". The Bing
       * has four of these, and it was the only panel feature in the game
       * keeping a second renderer alive. */
      if (item.tally?.total) {
        const tally = document_.createElement('span');
        tally.className = 'tally';
        tally.textContent = `${item.tally.count ?? 0}/${item.tally.total}`;
        li.append(tally);
      }
      li.append(document_.createTextNode(item.label));
      return li;
    }));
    hint.textContent = plan.hint ?? '';
    hint.classList.toggle('hidden', !plan.hint);
    visibility.changed();
  }

  /** The common case: one standing order, optionally with a direction. */
  function setLine(label, { title: heading = 'Objective', hint: direction = '', done = false } = {}) {
    if (!label) return set(null);
    return set({ title: heading, hint: direction, items: [{ label, done, required: true }] });
  }

  return {
    element,
    adopted,
    set,
    setLine,
    reveal() { visibility.reveal(); },
    clear() { set(null); },
    dispose() {
      visibility.dispose();
      if (!adopted) element.remove();
      else {
        signature = null;
        element.classList.add('hidden');
      }
    },
  };
}

/** Headless: the scene runs, the panel does nothing, nothing throws. */
function nullPanel() {
  return {
    element: null,
    adopted: false,
    set() {},
    setLine() {},
    reveal() {},
    clear() {},
    dispose() {},
  };
}
