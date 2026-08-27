/**
 * THE PANEL EIGHT SCENES NOW SHARE, AND NOTHING TESTED IT.
 *
 * `src/core/objective-panel.js` exists because three scenes had written the
 * same card three ways and a fourth was about to. It has since been adopted by
 * the mansion, the heist, the Bing, the Silver Room, silvercase, the
 * squatchfather and the Special Meeting — and had no unit test of any kind,
 * which is a shared system nobody can change safely.
 *
 * The three features below were added FOR the Bing and the Silver Room rather
 * than flattening those scenes to fit the panel (docs/REUSE-FIRST.md rule 2),
 * so they are the ones most worth pinning: the tally in front of the words,
 * the heading inside the list, and the mark on the line the player is on.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OBJECTIVE_DISPLAY_MS,
  activeObjectiveItems,
  conciseObjectiveItems,
  createObjectivePanel,
} from '../src/core/objective-panel.js';

/** Just enough document for what the panel actually touches. */
function fakeDoc() {
  const make = (tag) => {
    const classes = new Set();
    const node = {
      tag,
      id: '',
      className: '',
      textContent: '',
      children: [],
      classList: {
        add: (n) => classes.add(n),
        remove: (n) => classes.delete(n),
        toggle: (n, on) => (on ? classes.add(n) : classes.delete(n)),
        contains: (n) => classes.has(n),
      },
      classes,
      append: (...kids) => node.children.push(...kids),
      prepend: (...kids) => node.children.unshift(...kids),
      replaceChildren: (...kids) => { node.children = kids; },
      remove: () => {},
      querySelector: (selector) => {
        const want = selector.replace('.', '');
        const hit = (el) => (el.className || '').split(/\s+/).includes(want);
        const walk = (el) => {
          for (const kid of el.children) {
            if (hit(kid)) return kid;
            const deeper = walk(kid);
            if (deeper) return deeper;
          }
          return null;
        };
        return walk(node);
      },
    };
    return node;
  };
  const byId = new Map();
  const head = make('head');
  return {
    head,
    byId,
    createElement: make,
    createTextNode: (text) => ({ tag: '#text', textContent: text, children: [] }),
    getElementById: (id) => byId.get(id) ?? null,
    body: make('body'),
  };
}

/** Flatten a rendered <li> back to the words a player would read. */
const words = (li) => [li.textContent, ...li.children.map((c) => c.textContent)]
  .filter(Boolean).join('');

function panelWith(items, extra = {}) {
  const doc = fakeDoc();
  const panel = createObjectivePanel({ doc });
  panel.set({ title: 'THE JOB', items, ...extra });
  return { panel, rows: panel.element.querySelector('.olist').children };
}

function fakeScheduler() {
  let now = 0;
  let nextId = 1;
  const jobs = new Map();
  return {
    setTimeout(fn, delay) {
      const id = nextId++;
      jobs.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimeout(id) { jobs.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, job] of [...jobs].sort((a, b) => a[1].at - b[1].at)) {
        if (job.at > now) continue;
        jobs.delete(id);
        job.fn();
      }
    },
    get pending() { return jobs.size; },
  };
}

test('a page with no panel gets one, and one with a panel keeps it', () => {
  const bare = fakeDoc();
  const made = createObjectivePanel({ doc: bare });
  assert.equal(made.adopted, false);
  assert.equal(made.element.id, 'objectives');

  /* The Bing, the Silver Room, silvercase and the squatchfather all reach it
   * this way: their own card, in their own place, driven by shared code. */
  const withCard = fakeDoc();
  const existing = withCard.createElement('div');
  existing.id = 'objectives';
  withCard.byId.set('objectives', existing);
  const adopted = createObjectivePanel({ doc: withCard });
  assert.equal(adopted.adopted, true);
  assert.equal(adopted.element, existing);
});

test('the injected sheet goes FIRST, so a scene stylesheet can still place the panel', () => {
  /* The Palace, golf and the heist all write `#objectives.op-panel { top: ... }`
   * in their own linked stylesheet -- exactly the specificity this module's own
   * block uses. Equal specificity means source order decides, and a link in the
   * head is parsed long before a module runs, so appending this sheet beat all
   * three of them: measured in Chromium, the Palace's panel sat at the module's
   * `top: 18px` instead of its authored `top: 70px`, on top of the evidence
   * strip at `top: 24px`. That is the owner's "Rescue ... covers Evidence 3/3".
   *
   * The scene stylesheet is a LINK the page owns, so nothing here can reorder
   * it. What this module owes it is to arrive first and be a default. */
  const doc = fakeDoc();
  const linked = doc.createElement('link');
  linked.id = 'a-scene-stylesheet';
  doc.head.append(linked);

  createObjectivePanel({ doc });

  const ids = doc.head.children.map((node) => node.id);
  assert.deepEqual(ids, ['objective-panel-style', 'a-scene-stylesheet']);
});

test('a headless scene runs and the panel does nothing', () => {
  const panel = createObjectivePanel({ doc: null });
  assert.equal(panel.element, null);
  assert.doesNotThrow(() => { panel.setLine('x'); panel.set(null); panel.clear(); panel.dispose(); });
});

test('a tally goes in front of the words, which is what the Bing needs', () => {
  const { rows } = panelWith([
    { label: 'talk to the family', tally: { count: 3, total: 5 } },
    { label: 'find Margo' },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].children[0].className, 'tally');
  assert.equal(rows[0].children[0].textContent, '3/5');
  assert.equal(words(rows[0]), '3/5talk to the family');
  assert.equal(rows[1].children.length, 1, 'an item with no tally gets no span');
});

test('a heading inside the list, which both the Bing and the Silver Room had', () => {
  const { rows } = panelWith([
    { label: 'see Lou' },
    { rule: 'WHILE YOU ARE HERE' },
    { label: 'buy a round', required: false },
  ]);
  assert.deepEqual(rows.map((r) => r.className), ['required', 'rule', 'optional']);
  assert.equal(rows[1].textContent, 'WHILE YOU ARE HERE');
});

test('optional and required are the same fact, and both class names ship', () => {
  /* The mansion and the heist styled `.required`; the Bing and the Silver Room
   * styled `.optional`. Emitting one and not the other would have silently
   * unstyled two scenes on the day they adopted this. */
  const { rows } = panelWith([{ label: 'a' }, { label: 'b', required: false }]);
  assert.equal(rows[0].className, 'required');
  assert.equal(rows[1].className, 'optional');
});

test('completed lines leave immediately and the line he is on is marked', () => {
  const { rows } = panelWith([
    { label: 'done that', done: true },
    { label: 'doing this', current: true },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(words(rows[0]), 'doing this');
  assert.equal(rows[0].className, 'required now');
});

test('an empty section heading leaves with its completed objectives', () => {
  assert.deepEqual(activeObjectiveItems([
    { label: 'see Lou' },
    { rule: 'WHILE YOU ARE HERE' },
    { label: 'buy a round', done: true, required: false },
  ]), [{ label: 'see Lou' }]);
});

test('pending work stays out of every shared projection until it is actionable', () => {
  const plan = [
    { id: 'walk', label: 'Walk the grounds', done: true },
    { id: 'call', label: 'Answer Lou’s call', pending: true, required: true },
    { id: 'door', label: 'Find the cellar', pending: true, required: true },
  ];
  assert.deepEqual(activeObjectiveItems(plan), []);
  assert.deepEqual(conciseObjectiveItems(plan), []);

  plan[1].pending = false;
  assert.deepEqual(conciseObjectiveItems(plan), [{
    id: 'call', label: 'Answer Lou’s call', pending: false, required: true, current: true,
  }]);
});

test('completed errands retire by default while an explicit final tally remains', () => {
  const projected = conciseObjectiveItems([
    { id: 'old', label: 'Move one bag', done: true },
    {
      id: 'receipt', label: 'Evidence moved', done: true, retire: false,
      required: false, tally: { count: 7, total: 7 },
    },
    { id: 'leave', label: 'Leave in the clean car', required: true },
  ]);
  assert.deepEqual(projected.map(({ id }) => id), ['receipt', 'leave']);
  assert.deepEqual(projected[0].tally, { count: 7, total: 7 });
  assert.equal(projected[1].current, true);
});

test('the concise projection shows one main step and only the allowed soft work', () => {
  const projected = conciseObjectiveItems([
    { id: 'main-one', label: 'See Lou', done: true },
    { id: 'main-two', label: 'Hear Lou out', required: true },
    { id: 'future', label: 'Leave the club', required: true },
    { rule: 'WHILE YOU ARE HERE' },
    { id: 'soft-one', label: 'Help Gratin', required: false },
    { id: 'soft-two', label: 'Play blackjack', required: false },
  ], { optionalLimit: 1 });
  assert.deepEqual(projected.map((item) => item.rule ?? item.id), [
    'main-two', 'WHILE YOU ARE HERE', 'soft-one',
  ]);
  assert.equal(projected[0].current, true);
});

test('an unchanged plan does not rebuild the list: it is set from a tick', () => {
  const doc = fakeDoc();
  const panel = createObjectivePanel({ doc });
  const plan = { title: 'THE JOB', items: [{ label: 'see Lou', tally: { count: 1, total: 4 } }] };
  panel.set(plan);
  const first = panel.element.querySelector('.olist').children[0];
  panel.set({ title: 'THE JOB', items: [{ label: 'see Lou', tally: { count: 1, total: 4 } }] });
  assert.equal(panel.element.querySelector('.olist').children[0], first,
    'a panel rebuilt every frame cannot be selected, animated or profiled');

  /* But a tally that MOVED is a different plan, and the old signature could
   * not see it -- it hashed the label and the two flags and nothing else. */
  panel.set({ title: 'THE JOB', items: [{ label: 'see Lou', tally: { count: 2, total: 4 } }] });
  assert.notEqual(panel.element.querySelector('.olist').children[0], first);
});

test('an empty plan hides the card rather than leaving the last order up', () => {
  const doc = fakeDoc();
  const panel = createObjectivePanel({ doc });
  panel.setLine('see Lou');
  assert.equal(panel.element.classList.contains('hidden'), false);
  panel.setLine('');
  assert.equal(panel.element.classList.contains('hidden'), true);
});

test('the first clear and disposing an adopted panel both remove stale UI', () => {
  const doc = fakeDoc();
  const existing = doc.createElement('div');
  existing.id = 'objectives';
  doc.byId.set('objectives', existing);
  const panel = createObjectivePanel({ doc });
  panel.clear();
  assert.equal(existing.classList.contains('hidden'), true);

  existing.classList.remove('hidden');
  panel.dispose();
  assert.equal(existing.classList.contains('hidden'), true);
});

test('a changed objective is prominent for twelve seconds, then collapses without tick resets', () => {
  assert.ok(OBJECTIVE_DISPLAY_MS >= 10_000 && OBJECTIVE_DISPLAY_MS <= 15_000);
  const doc = fakeDoc();
  const scheduler = fakeScheduler();
  const panel = createObjectivePanel({ doc, scheduler });
  const plan = { title: 'THE JOB', items: [{ label: 'Reach the cabin' }] };

  panel.set(plan);
  assert.equal(panel.element.classList.contains('hidden'), false);
  scheduler.advance(OBJECTIVE_DISPLAY_MS - 1);
  assert.equal(panel.element.classList.contains('hidden'), false);

  /* This is the production shape: scenes call set() from their frame loop.
   * Identical state must not buy another twelve seconds every frame. */
  panel.set({ title: 'THE JOB', items: [{ label: 'Reach the cabin' }] });
  scheduler.advance(1);
  assert.equal(panel.element.classList.contains('hidden'), true);

  /* Progress is new information. It comes back up, gets its own complete
   * reading window, and can still be reviewed explicitly after collapsing. */
  panel.set({
    title: 'THE JOB',
    items: [{ label: 'Help the guests', tally: { count: 2, total: 6 } }],
  });
  assert.equal(panel.element.classList.contains('hidden'), false);
  assert.equal(scheduler.pending, 1);
  scheduler.advance(OBJECTIVE_DISPLAY_MS);
  assert.equal(panel.element.classList.contains('hidden'), true);
  panel.reveal();
  assert.equal(panel.element.classList.contains('hidden'), false);
});
