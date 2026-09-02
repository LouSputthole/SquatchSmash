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
import {
  buildCreditsTrack,
  createCampaignCreditsView,
  resolveCreditsMusicSrc,
} from '../src/core/campaign-credits-view.js';

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

test('opening the roll focuses the credits dialog instead of the Space-activatable Skip button', () => {
  const nodes = new Map();
  let documentRef;
  const element = (id = '') => {
    const classes = new Set();
    const listeners = new Map();
    const node = {
      id,
      textContent: '',
      children: [],
      style: { setProperty() {} },
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
      },
      setAttribute() {},
      appendChild(child) { node.children.push(child); return child; },
      append(...children) { node.children.push(...children); },
      addEventListener(type, handler) { listeners.set(type, handler); },
      focus() { documentRef.activeElement = node; },
    };
    if (id) nodes.set(id, node);
    return node;
  };
  const screen = element('credits');
  const track = element('credits-track');
  const skip = element('credits-skip');
  documentRef = {
    activeElement: null,
    getElementById: (id) => nodes.get(id) ?? null,
    createElement: () => element(),
    addEventListener() {},
    removeEventListener() {},
  };

  const view = createCampaignCreditsView({ documentRef, musicSrc: null, duration: 3600 });
  view.roll({ roll: [] });
  try {
    assert.equal(documentRef.activeElement, screen,
      'residual gameplay Space must not land on the native Skip button');
    assert.notEqual(documentRef.activeElement, skip);
  } finally {
    view.end();
  }
});

/* THE SONG SLOT IS DATA. Owner, 2026-09-02: "Add the down at the bada bing
 * as the credits song." The file has not been delivered, so the shipped
 * manifest carries no `credits: true` row and the ending stays deliberately
 * silent; the moment the row lands beside its file, the resolver finds it.
 * Never point the crawl at a file that is not on disk. */
test('the credits song resolves from a delivered manifest row, and only from one', async () => {
  const delivered = await resolveCreditsMusicSrc({
    load: async () => ({
      tracks: [
        { id: 'sallie-j', file: 'sallie-j.mp3' },
        {
          id: 'down-at-the-bada-bing', file: 'down-at-the-bada-bing.mp3',
          title: 'Down at the Bada Bing', credits: true, cue: true,
        },
      ],
    }),
  });
  assert.equal(delivered, 'assets/music/down-at-the-bada-bing.mp3');

  const undelivered = await resolveCreditsMusicSrc({
    load: async () => ({ tracks: [{ id: 'sallie-j', file: 'sallie-j.mp3' }] }),
  });
  assert.equal(undelivered, null);

  const unreachable = await resolveCreditsMusicSrc({
    load: async () => { throw new Error('offline'); },
  });
  assert.equal(unreachable, null);
});

test('the shipped music manifest has no credits row until the file exists', async () => {
  const fs = await import('node:fs');
  const manifest = JSON.parse(
    fs.readFileSync(new URL('../assets/music/manifest.json', import.meta.url), 'utf8'),
  );
  const rows = manifest.tracks.filter((row) => row.credits === true);
  for (const row of rows) {
    assert.ok(
      fs.existsSync(new URL(`../assets/music/${row.file}`, import.meta.url)),
      `credits row ${row.id} lists ${row.file}, which is not on disk — the ending would 404`,
    );
  }
  /* The staged row waits outside `tracks` with the delivery instructions. */
  assert.equal(manifest._credits_row_when_delivered?.credits, true);
  assert.equal(manifest._credits_row_when_delivered?.cue, true);
});

test('a delivered song stretches the crawl to its full length, and never shrinks it', async () => {
  /* Owner, 2026-09-02: "i want the full song for the credits." */
  const nodes = new Map();
  let documentRef;
  const styles = new Map();
  const element = (id = '') => {
    const classes = new Set();
    const node = {
      id,
      textContent: '',
      children: [],
      style: { setProperty: (k, v) => styles.set(k, v) },
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
      },
      setAttribute() {},
      appendChild(child) { node.children.push(child); return child; },
      append(...children) { node.children.push(...children); },
      addEventListener() {},
      focus() {},
    };
    if (id) nodes.set(id, node);
    return node;
  };
  element('credits');
  element('credits-track');
  element('credits-skip');
  documentRef = {
    activeElement: null,
    getElementById: (id) => nodes.get(id) ?? null,
    createElement: () => element(),
    addEventListener() {},
    removeEventListener() {},
  };

  const audios = [];
  const RealAudio = globalThis.Audio;
  globalThis.Audio = class {
    constructor(src) {
      this.src = src;
      this.volume = 1;
      this.duration = NaN;
      this.listeners = new Map();
      audios.push(this);
    }

    addEventListener(type, handler) { this.listeners.set(type, handler); }
    play() { return Promise.resolve(); }
    pause() {}
  };
  try {
    const view = createCampaignCreditsView({
      documentRef,
      musicSrc: 'assets/music/down-at-the-bada-bing.mp3',
      duration: 212,
      fade: 0.001,
    });
    view.roll({ roll: [] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(audios.length, 1);
    assert.equal(styles.get('--credits-duration'), '212s');

    /* The record is longer than the authored crawl: the crawl stretches to
     * the song plus its tail, so nothing cuts the last bar off. */
    audios[0].duration = 300;
    audios[0].listeners.get('loadedmetadata')?.();
    assert.equal(styles.get('--credits-duration'), '301.5s');
    view.end();

    /* A shorter record ends inside the crawl; the crawl does not rush. */
    const view2 = createCampaignCreditsView({
      documentRef,
      musicSrc: 'assets/music/down-at-the-bada-bing.mp3',
      duration: 212,
      fade: 0.001,
    });
    view2.roll({ roll: [] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    audios[1].duration = 100;
    audios[1].listeners.get('loadedmetadata')?.();
    assert.equal(styles.get('--credits-duration'), '212s');
    view2.end();
  } finally {
    if (RealAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = RealAudio;
  }
});
