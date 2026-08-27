/**
 * THE CRAWL IS THE JOKE, SO THE CRAWL IS DATA.
 *
 * The owner asked for Lou Sputthole credited "with like 240 different things"
 * and every main character credited as themselves. Both of those are counts
 * and both of them are the gag, so both are held here rather than left to
 * whoever next edits a list of two hundred and forty strings by hand.
 *
 * The cast list is DERIVED from CHARACTER_REGISTRY on purpose: a second list
 * of the family, typed out beside the first, is the exact shape of drift this
 * project keeps paying for.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAST_CREDIT_ROLE,
  CREDIT_EXCLUDED_CHARACTERS,
  LOU_CREDITS,
  campaignCreditRoll,
  castCredits,
} from '../src/core/campaign-credits.js';
import { CHARACTER_REGISTRY } from '../src/core/characters.js';
import { buildCreditsTrack } from '../src/core/campaign-credits-view.js';

test('Lou is credited two hundred and forty separate times', () => {
  assert.equal(LOU_CREDITS.length, 240);
});

test('no two of them are the same credit', () => {
  assert.equal(new Set(LOU_CREDITS).size, LOU_CREDITS.length);
});

test('every credit is a real string somebody could read', () => {
  for (const role of LOU_CREDITS) {
    assert.equal(typeof role, 'string');
    assert.ok(role.trim().length > 0, 'no blank credits');
    assert.equal(role, role.trim(), `"${role}" has stray whitespace`);
    assert.ok(role.length < 60, `"${role}" is too long to read going past`);
  }
});

test('it opens on the ones a producer would claim and ends somewhere else', () => {
  assert.equal(LOU_CREDITS[0], 'Directed by');
  assert.equal(LOU_CREDITS.at(-1), 'And Introducing Lou Sputthole');
  /* The escalation is the joke; if someone alphabetises this list it dies. */
  assert.ok(LOU_CREDITS.indexOf('Directed by') < LOU_CREDITS.indexOf('Craft Services'));
  assert.ok(LOU_CREDITS.indexOf('Craft Services') < LOU_CREDITS.indexOf('The Moon'));
});

test('the family is credited as themselves, one each', () => {
  const cast = castCredits();
  assert.ok(cast.length > 15, 'the whole family, not a sample');
  for (const credit of cast) assert.equal(credit.role, CAST_CREDIT_ROLE);
  const names = cast.map((credit) => credit.name);
  assert.equal(new Set(names).size, names.length, 'nobody is credited twice');
});

test('the cast list is the character registry, so a new character is in it free', () => {
  const expected = Object.values(CHARACTER_REGISTRY)
    .filter((character) => !CREDIT_EXCLUDED_CHARACTERS.includes(character.id))
    .map((character) => character.id === 'prospect'
      ? character.subtitleName : character.canonicalName);
  assert.deepEqual(castCredits().map((credit) => credit.name), expected);
});

test('the Prospect is credited with the rest of the important cast', () => {
  assert.equal(CREDIT_EXCLUDED_CHARACTERS.length, 0);
  assert.ok(castCredits().some((credit) => credit.name === 'Prospect'));
});

test('the roll puts the family first and Lou second', () => {
  const roll = campaignCreditRoll();
  const sections = roll.filter((entry) => entry.kind === 'section');
  assert.equal(sections.length, 2);
  assert.equal(sections[0].text, 'THE FAMILY');
  assert.equal(sections[1].text, 'BIG UNCLE LOU SPUTTHOLE');
  const firstLou = roll.findIndex((entry) => entry.name === 'Lou Sputthole');
  const lastCast = roll.map((entry) => entry.role).lastIndexOf(CAST_CREDIT_ROLE);
  assert.ok(lastCast < firstLou, 'the family is read before the joke starts');
});

test('every one of Lou\'s credits is in the roll under his name', () => {
  const roll = campaignCreditRoll();
  const his = roll.filter((entry) => entry.name === 'Lou Sputthole');
  assert.equal(his.length, 240);
  assert.deepEqual(his.map((entry) => entry.role), [...LOU_CREDITS]);
});

test('the view renders every entry, and nothing else', () => {
  /* A minimal document stub: the view must not need a browser to be checked,
   * and the alternative is that nobody ever checks it. */
  const made = [];
  const element = () => {
    const node = {
      className: '', textContent: '', children: [],
      appendChild(child) { node.children.push(child); return child; },
      append(...kids) { node.children.push(...kids); },
    };
    made.push(node);
    return node;
  };
  const documentRef = { createElement: element };
  const track = element();
  const roll = campaignCreditRoll();
  buildCreditsTrack(documentRef, track, roll);

  assert.equal(track.children.length, roll.length);
  const rows = track.children.filter((child) => child.className === 'credits-row');
  assert.equal(rows.length, roll.filter((entry) => entry.kind === 'credit').length);
  const headings = track.children.filter((child) => child.className === 'credits-section');
  assert.equal(headings.length, 2);
});
