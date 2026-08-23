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

import { createObjectivePanel } from '../src/core/objective-panel.js';

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

test('the line he is on is marked, which is the Silver Room', () => {
  const { rows } = panelWith([
    { label: 'done that', done: true },
    { label: 'doing this', current: true },
  ]);
  assert.equal(rows[0].className, 'done required');
  assert.equal(rows[1].className, 'required now');
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
