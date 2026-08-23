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
/* Struck through and faded rather than removed: a list that deletes what you
 * have achieved gives you no credit for the evening. */
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

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  doc.head.append(style);
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
export function createObjectivePanel({ parent = null, doc = null } = {}) {
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

  function set(plan) {
    if (!plan || !plan.items?.length) {
      if (signature === null) return;
      signature = null;
      element.classList.add('hidden');
      return;
    }
    const key = [
      plan.title ?? '',
      plan.hint ?? '',
      ...plan.items.map((item) => (item.rule
        ? `rule:${item.rule}`
        : `${item.label}|${item.done ? 1 : 0}|${item.required === false ? 0 : 1}`
          + `|${item.current ? 1 : 0}|${item.tally ? `${item.tally.count ?? 0}/${item.tally.total}` : ''}`)),
    ].join('');
    if (key === signature) return;
    signature = key;
    title.textContent = plan.title ?? 'Objective';
    list.replaceChildren(...plan.items.map((item) => {
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
    element.classList.remove('hidden');
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
    clear() { set(null); },
    dispose() {
      if (!adopted) element.remove();
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
    clear() {},
    dispose() {},
  };
}
