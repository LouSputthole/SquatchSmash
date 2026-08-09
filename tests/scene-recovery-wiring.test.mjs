import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/*
 * This is an authored-page inventory, not a search for whichever files happen
 * to mention the pause menu today. Bing and the mansion each mount two
 * campaign scenes behind one HTML entry point, so both variants belong here.
 * A new root HTML file makes the partition test fail until somebody decides
 * whether it is campaign content or an explicitly non-campaign tool.
 */
const CAMPAIGN_PAGES = Object.freeze([
  { id: 'apartment', href: 'index.html', entry: 'src/main.js', source: 'src/main.js' },
  { id: 'bada_bing_one', href: 'bing.html', entry: 'src/bing/router.js', source: 'src/bing/main.js' },
  { id: 'squatchfather', href: 'squatchfather.html', entry: 'src/squatchfather/main.js', source: 'src/squatchfather/main.js' },
  { id: 'airstrip_smuggling', href: 'beefrun.html', entry: 'src/beefrun/main.js', source: 'src/beefrun/main.js' },
  { id: 'bada_bing_two', href: 'bing.html?visit=2', entry: 'src/bing/router.js', source: 'src/bing/hotdog-main.js' },
  { id: 'squatch_graveyard', href: 'graveyard.html', entry: 'src/graveyard/main.js', source: 'src/graveyard/main.js' },
  { id: 'jerky_motel', href: 'motel.html', entry: 'src/motel/main.js', source: 'src/motel/main.js' },
  { id: 'no_wake', href: 'nowake.html', entry: 'src/nowake/main.js', source: 'src/nowake/main.js' },
  { id: 'silver_room', href: 'silver.html', entry: 'src/silver/main.js', source: 'src/silver/main.js' },
  { id: 'silver_pines', href: 'golf.html', entry: 'src/golf/main.js', source: 'src/golf/main.js' },
  { id: 'bank_heist', href: 'heist.html', entry: 'src/heist/main.js', source: 'src/heist/main.js' },
  { id: 'silver_case', href: 'silvercase.html', entry: 'src/silvercase/main.js', source: 'src/silvercase/main.js' },
  {
    id: 'mansion',
    href: 'mansion.html',
    entry: 'src/mansion/main.js',
    source: 'src/mansion/main.js',
  },
  {
    id: 'mansion_siege',
    href: 'mansion-siege.html',
    entry: 'src/mansion/siege/main.js',
    source: 'src/mansion/siege/main.js',
  },
  { id: 'enola_squatch', href: 'enolasquatch.html', entry: 'src/enolasquatch/main.js', source: 'src/enolasquatch/main.js' },
  {
    id: 'mansion_return',
    href: 'mansion.html?visit=return',
    entry: 'src/mansion/main.js',
    source: 'src/mansion/main.js',
  },
  { id: 'cartel_palace', href: 'cartel-palace.html', entry: 'src/cartel-palace/main.js', source: 'src/cartel-palace/main.js' },
  {
    id: 'initiation',
    href: 'initiation.html',
    entry: 'src/initiation/main.js',
    source: 'src/initiation/main.js',
    protected: 'Initiation gameplay is frozen pending the human playtest.',
  },
]);

const NON_CAMPAIGN_ROOT_HTML = Object.freeze([
  'combatlab.html',
  'preview.html',
  'roster.html',
  'wardrobe.html',
]);

/* A separate 90-second arcade game, not a node in the story campaign. */
const NON_CAMPAIGN_NESTED_HTML = Object.freeze(['game/index.html']);

const SCENE_ID_TOKENS = Object.freeze({
  apartment: 'APARTMENT',
  bada_bing_one: 'BADA_BING_ONE',
  squatchfather: 'SQUATCHFATHER',
  airstrip_smuggling: 'AIRSTRIP_SMUGGLING',
  bada_bing_two: 'BADA_BING_TWO',
  squatch_graveyard: 'SQUATCH_GRAVEYARD',
  jerky_motel: 'JERKY_MOTEL',
  no_wake: 'NO_WAKE',
  silver_room: 'SILVER_ROOM',
  silver_pines: 'SILVER_PINES',
  bank_heist: 'BANK_HEIST',
  silver_case: 'SILVER_CASE',
  mansion: 'MANSION',
  mansion_siege: 'MANSION_SIEGE',
  enola_squatch: 'ENOLA_SQUATCH',
  mansion_return: 'MANSION_RETURN',
  cartel_palace: 'CARTEL_PALACE',
  initiation: 'INITIATION',
});

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function htmlPath(href) {
  return href.split(/[?#]/, 1)[0];
}

function hasRecoveryWiring(source) {
  return /create[A-Za-z]*SceneRecovery\s*\(/.test(source)
    && /\brecovery\s*[:,]/.test(source);
}

test('every root HTML entry is classified as campaign content or a named tool', () => {
  const actual = fs.readdirSync(ROOT)
    .filter((name) => name.endsWith('.html'))
    .sort();
  const expected = [...new Set([
    ...CAMPAIGN_PAGES.map(({ href }) => htmlPath(href)),
    ...NON_CAMPAIGN_ROOT_HTML,
  ])].sort();

  assert.deepEqual(actual, expected);
  for (const tool of NON_CAMPAIGN_NESTED_HTML) {
    assert.equal(fs.existsSync(path.join(ROOT, tool)), true,
      `${tool} is an explicit non-campaign playable page`);
  }
});

test('every playable campaign page has shared pause and recovery wiring or an explicit boundary', () => {
  assert.equal(CAMPAIGN_PAGES.length, 18, 'update the authored campaign inventory intentionally');
  assert.deepEqual(
    CAMPAIGN_PAGES.filter(({ protected: boundary }) => boundary).map(({ id }) => id),
    ['initiation'],
    'Initiation is the sole frozen gameplay exception',
  );

  for (const page of CAMPAIGN_PAGES) {
    const html = read(htmlPath(page.href)).replaceAll('./', '');
    const source = read(page.source);
    const label = `${page.id} (${page.href})`;

    assert.ok(html.includes(page.entry), `${label} must load ${page.entry}`);

    if (page.id === 'bada_bing_two') {
      const router = read(page.entry);
      assert.match(router, /visit\s*===\s*['"]2['"]/,
        'the second Bada Bing visit must remain a distinct routed page');
      assert.match(router, /import\(['"]\.\/hotdog-main\.js['"]\)/,
        'the HotDog incident must remain wired through the Bing router');
    }
    if (page.id === 'mansion_return') {
      assert.match(source, /SCENE_IDS\.MANSION_RETURN/,
        'the shared Mansion source must account for its return visit');
      assert.match(source, /visit[^\n]*return|return[^\n]*visit/i,
        'the Mansion return must remain selected by the visit query');
    }

    if (page.protected) {
      assert.equal(page.id, 'initiation');
      assert.match(page.protected, /frozen.*human playtest/i);
      assert.equal(hasRecoveryWiring(source), false,
        `${label} is a protected exception and must not be changed by this recovery pass`);
      continue;
    }

    assert.ok(source.includes(`SCENE_IDS.${SCENE_ID_TOKENS[page.id]}`),
      `${label} must name its canonical campaign scene id`);
    assert.match(source, /createPauseMenu\s*\(/, `${label} must mount the shared pause menu`);
    assert.equal(hasRecoveryWiring(source), true,
      `${label} must pass a scene recovery adapter into its shared pause menu`);
  }
});
