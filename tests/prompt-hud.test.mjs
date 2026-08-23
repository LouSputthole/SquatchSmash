/**
 * ONE PROMPT, NOT FOUR.
 *
 * `InteractionSystem` wants three methods -- showPrompt, hidePrompt, setHold --
 * and `core/hud.js`'s `Hud` has them, but `Hud` is the apartment's furniture
 * and throws in a page with no #clock and no #bladder. So four scenes wrote
 * the three methods by hand, and every one of them called the object
 * `tinyHud`, which is the tell. They disagreed:
 *
 *   - silvercase and the siege put the label in as `textContent`, and every
 *     descriptor in this repo writes its prompt as MARKUP. The owner reported
 *     the siege's as scenery: *"Healing crate shows a bunch of underneath
 *     coding instead of it"*. The siege was fixed; silvercase was not, because
 *     nobody knew there were two.
 *   - the siege's `setHold` had no null branch and worked by arithmetic
 *     accident: `null * 100` is 0.
 *   - only heist put the hold bar away when the prompt went.
 *   - only the mansion suppressed the key cap on a passive `LOOK` prompt.
 *
 * These are the four disagreements, held against the one implementation.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createPromptHud } from '../src/core/hud.js';

/** Enough of an element for what the prompt actually touches. */
function element() {
  const classes = new Set();
  return {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    classes,
    dataset: {},
    innerHTML: '',
    textContent: '',
    style: {},
  };
}

function rig(options = {}) {
  const parts = {
    prompt: element(),
    label: element(),
    key: element(),
    holdFill: element(),
    crosshair: element(),
  };
  return { ...parts, hud: createPromptHud({ ...parts, ...options }) };
}

test('the label is markup, because every descriptor in the repo writes one', () => {
  const r = rig();
  r.hud.showPrompt('Use <b>triage</b> &mdash; 2 dressings left');
  assert.equal(r.label.innerHTML, 'Use <b>triage</b> &mdash; 2 dressings left');
  assert.equal(r.label.textContent, '', 'the tags must not reach the screen as words');
});

test('a callable label is resolved, because two scenes passed functions', () => {
  const r = rig();
  r.hud.showPrompt(() => 'Pick it up');
  assert.equal(r.label.innerHTML, 'Pick it up');
});

test('an unchanged label is not rewritten: showPrompt runs every frame', () => {
  const r = rig();
  r.hud.showPrompt('Steady');
  r.label.innerHTML = 'touched';
  r.hud.showPrompt('touched');
  assert.equal(r.label.innerHTML, 'touched', 'a matching label reparsed the fragment anyway');
});

test('setHold(null) puts the bar away rather than relying on null * 100', () => {
  const r = rig();
  r.hud.setHold(0.42);
  assert.equal(r.holdFill.style.width, '42%');
  r.hud.setHold(null);
  assert.equal(r.holdFill.style.width, '0%');
  r.hud.setHold(undefined);
  assert.equal(r.holdFill.style.width, '0%', 'the missing-argument call is the same call');
});

test('hiding the prompt clears the hold bar, which only one of the four did', () => {
  const r = rig();
  r.hud.showPrompt('Hold to pray');
  r.hud.setHold(0.8);
  r.hud.hidePrompt();
  assert.equal(r.holdFill.style.width, '0%',
    'a bar left at 80% behind a hidden prompt comes back full on the next one');
});

test('a passive LOOK prompt has no key cap, which only the mansion did', () => {
  const r = rig();
  r.hud.showPrompt('The portrait of a man who is not in this house', 'LOOK');
  assert.equal(r.key.classList.contains('hidden'), true);
  r.hud.showPrompt('Press to open', 'E');
  assert.equal(r.key.classList.contains('hidden'), false);
  assert.equal(r.key.textContent, 'E');
});

test('both visibility idioms are first class: hidden to hide, show to show', () => {
  const off = rig();
  off.hud.showPrompt('x');
  assert.equal(off.prompt.classList.contains('hidden'), false);
  off.hud.hidePrompt();
  assert.equal(off.prompt.classList.contains('hidden'), true);

  /* silvercase's CSS, which is not worth rewriting to match the others. */
  const on = rig({ visibility: 'show' });
  on.hud.showPrompt('x');
  assert.equal(on.prompt.classList.contains('show'), true);
  on.hud.hidePrompt();
  assert.equal(on.prompt.classList.contains('show'), false);
});

test('a hold container is shown only while holding', () => {
  const holdContainer = element();
  const r = rig({ holdContainer, holdClass: 'holding' });
  assert.equal(holdContainer.classList.contains('holding'), false);
  r.hud.setHold(0.1);
  assert.equal(holdContainer.classList.contains('holding'), true);
  r.hud.setHold(null);
  assert.equal(holdContainer.classList.contains('holding'), false);
});

test('the crosshair lights up while a prompt is up, and only if there is one', () => {
  const r = rig();
  r.hud.showPrompt('x');
  assert.equal(r.crosshair.classList.contains('active'), true);
  r.hud.hidePrompt();
  assert.equal(r.crosshair.classList.contains('active'), false);

  /* Three of the four scenes have no crosshair element at all. */
  const bare = createPromptHud({ prompt: element(), label: element() });
  assert.doesNotThrow(() => { bare.showPrompt('x'); bare.hidePrompt(); bare.setHold(null); });
});
