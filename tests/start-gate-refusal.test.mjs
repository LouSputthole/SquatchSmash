/**
 * A START BUTTON THAT REFUSES MUST STILL BE PRESSABLE.
 *
 * `installStartGate` swallows every click while the first one is still
 * running, which is right for an impatient double-tap and was catastrophic for
 * one real scene. Its three escapes were: the scene rebinds `onclick`, the
 * start card goes away, or a promise rejects unhandled. A start that REFUSES
 * -- says why, deliberately keeps its card up, neither rejects nor rebinds --
 * matched none of them, so the button stayed pending forever and every later
 * click was eaten. On a save where HotDog was already buried, GO TO MOTEL
 * could not be pressed at all, and that was found by accident.
 *
 * These hold the backstop that gives the button back.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { START_PENDING_TIMEOUT_MS, installStartGate } from '../src/core/start-gate.js';

/** The smallest DOM this gate actually touches. */
function stubDom() {
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 1;
  let now = 0;

  const makeEl = (tag = 'div') => {
    const el = {
      tagName: tag.toUpperCase(),
      dataset: {},
      classList: {
        _set: new Set(),
        contains(c) { return this._set.has(c); },
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
      },
      attributes: {},
      children: [],
      isConnected: true,
      parentElement: null,
      onclick: null,
      setAttribute(k, v) { this.attributes[k] = v; },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k] ?? null; },
      /* 'afterend' puts the node beside this one, so it belongs to the PARENT.
       * Getting that wrong made the status invisible to the gate's own
       * `button.parentElement.querySelector` and failed a passing fix. */
      insertAdjacentElement(_where, node) {
        const owner = this.parentElement ?? this;
        owner.children.push(node);
        node.parentElement = owner;
      },
      querySelector(sel) {
        if (sel === '[data-systemic-start-status]') {
          return this.children.find((c) => c.dataset?.systemicStartStatus !== undefined) ?? null;
        }
        return null;
      },
      closest(sel) {
        if (sel.includes('#start-btn')) return el.dataset.isStart ? el : null;
        return el.dataset.card ? el : null;
      },
      remove() {
        const owner = this.parentElement;
        if (!owner) return;
        owner.children = owner.children.filter((c) => c !== this);
      },
    };
    return el;
  };

  const button = makeEl('button');
  button.dataset.isStart = '1';
  const card = makeEl('div');
  card.dataset.card = '1';
  button.parentElement = card;
  button.closest = (sel) => (sel.includes('#start-btn') ? button : card);

  const doc = {
    body: { classList: { contains: () => false } },
    documentElement: makeEl(),
    createElement: (tag) => makeEl(tag),
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const win = {
    addEventListener() {}, removeEventListener() {},
    setTimeout(fn, ms) { const id = nextTimer++; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    MutationObserver: undefined,
  };
  return {
    doc,
    win,
    button,
    card,
    click() { listeners.get('click')?.({ target: button, preventDefault() {}, stopImmediatePropagation() { this.swallowed = true; } }); },
    clickSwallowed() {
      const event = {
        target: button,
        swallowed: false,
        preventDefault() {},
        stopImmediatePropagation() { event.swallowed = true; },
      };
      listeners.get('click')?.(event);
      return event.swallowed;
    },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) { timers.delete(id); t.fn(); }
      }
    },
    async drain() { await Promise.resolve(); await Promise.resolve(); },
  };
}

test('the first click starts, and an impatient second one is dropped', async () => {
  const dom = stubDom();
  installStartGate({ doc: dom.doc, win: dom.win });
  dom.click();
  await dom.drain();
  assert.equal(dom.button.dataset.systemicStartState, 'pending');
  assert.equal(dom.clickSwallowed(), true, 'the double-tap is eaten, which is the point');
});

test('A REFUSED START GIVES THE BUTTON BACK', async () => {
  /* The graveyard case: the card stays up on purpose, nothing rebinds onclick,
   * nothing rejects. Before the backstop this button was dead forever. */
  const dom = stubDom();
  installStartGate({ doc: dom.doc, win: dom.win });
  dom.click();
  await dom.drain();
  assert.equal(dom.button.dataset.systemicStartState, 'pending');

  dom.advance(START_PENDING_TIMEOUT_MS + 1);
  assert.equal(dom.button.dataset.systemicStartState, 'ready', 'he can press it again');
  assert.equal(dom.clickSwallowed(), false, 'and the press is not eaten');
});

test('the backstop does not fire while the start is still legitimately running', async () => {
  const dom = stubDom();
  installStartGate({ doc: dom.doc, win: dom.win });
  dom.click();
  await dom.drain();
  dom.advance(START_PENDING_TIMEOUT_MS - 100);
  assert.equal(dom.button.dataset.systemicStartState, 'pending', 'still loading, still guarded');
  assert.equal(dom.clickSwallowed(), true);
});

test('the status message is taken away with the pending state', async () => {
  const dom = stubDom();
  installStartGate({ doc: dom.doc, win: dom.win });
  dom.click();
  await dom.drain();
  assert.ok(dom.button.parentElement.children.some((c) => c.dataset?.systemicStartStatus !== undefined));
  dom.advance(START_PENDING_TIMEOUT_MS + 1);
  assert.equal(
    dom.button.parentElement.children.some((c) => c.dataset?.systemicStartStatus !== undefined),
    false,
    'no "Loading… please wait." left under a button that is ready',
  );
});

test('a start that succeeds is not handed back by the backstop', async () => {
  const dom = stubDom();
  installStartGate({ doc: dom.doc, win: dom.win });
  dom.click();
  await dom.drain();
  /* The scene got going: the card goes away, which is the happy escape. */
  dom.card.classList.add('hidden');
  dom.button.dataset.systemicStartState = 'started';
  dom.advance(START_PENDING_TIMEOUT_MS + 1);
  assert.equal(dom.button.dataset.systemicStartState, 'started', 'the backstop does not undo a real start');
});

test('the timeout is configurable, because six seconds is a judgement not a law', async () => {
  const dom = stubDom();
  installStartGate({ doc: dom.doc, win: dom.win, pendingTimeoutMs: 50 });
  dom.click();
  await dom.drain();
  dom.advance(51);
  assert.equal(dom.button.dataset.systemicStartState, 'ready');
});
