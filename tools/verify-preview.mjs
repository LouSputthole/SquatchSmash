#!/usr/bin/env node
/**
 * Verify that locked scenes are playable through developer preview mode while
 * the browser's canonical campaign storage remains byte-for-byte untouched.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMPAIGN_SPINE } from '../src/core/campaign-spine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5210;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
};
const SENTINEL = '{"version":999,"canonical":"preview verifier must not touch this"}';
const EXPECTED_CAMPAIGN_CARDS = Object.freeze(CAMPAIGN_SPINE.map(({ id, scene }) =>
  Object.freeze([id, scene])));

/* Mission links stay scene-based so each authored page remains reachable by
 * the scene-audit tooling. Their order, however, is the route: THE TAKE is
 * Day 5 before Silver Pines, Front & Center follows the luxury introduction,
 * and NO WAKE follows Margo's luxury-apartment morning. */
const EXPECTED_SCENE_LINKS = Object.freeze([
  Object.freeze(['bing-one', 'bing.html?preview=1']),
  Object.freeze(['squatchfather', 'squatchfather.html?preview=1']),
  Object.freeze(['beefrun', 'beefrun.html?preview=1']),
  Object.freeze(['bing-two', 'bing.html?visit=2&preview=1']),
  Object.freeze(['graveyard', 'graveyard.html?preview=1']),
  Object.freeze(['motel', 'motel.html?preview=1']),
  Object.freeze(['heist', 'heist.html?preview=1&checkpoint=safehouse']),
  Object.freeze(['golf', 'golf.html?preview=1']),
  Object.freeze(['silver', 'silver.html?preview=1']),
  Object.freeze(['no-wake', 'nowake.html?preview=1']),
  /* The three scenes merged on 2026-08-03. They were deployed and playable by
   * direct URL for a day before anybody noticed they were missing from the
   * launcher — this check is an exact match in both directions, so a scene
   * that ships without a card here now fails rather than quietly hiding. */
  Object.freeze(['silvercase', 'silvercase.html?preview=1']),
  Object.freeze(['mansion', 'mansion.html?preview=1']),
  Object.freeze(['mansion-siege', 'mansion-siege.html?preview=1']),
  Object.freeze(['enolasquatch', 'enolasquatch.html?preview=1']),
  Object.freeze(['mansion-return', 'mansion.html?visit=return&preview=1']),
  Object.freeze(['cartel-palace', 'cartel-palace.html?preview=1']),
  Object.freeze(['special-meeting', 'specialmeeting.html?preview=1']),
  Object.freeze(['initiation', 'initiation.html?preview=1']),
]);

/* Owner, 2026-08-27: "This should follow the bridge spine of the campaign so
 * the old apartment scenes should be replaced with the correct hub and
 * scene." These are the only public home-hub slides. The apartment's older
 * named variants remain useful deterministic geometry fixtures, but they are
 * no longer a second public campaign timeline. */
const HUB_PREVIEW_CASES = Object.freeze([
  Object.freeze({
    beat: 'squatch_smash_intro', scene: 'apartment', coldOpen: true,
    href: 'index.html?preview=1&beat=squatch_smash_intro',
  }),
  Object.freeze({
    beat: 'first_apartment', scene: 'apartment', coldOpen: false,
    href: 'index.html?preview=1&beat=first_apartment',
  }),
  Object.freeze({
    beat: 'cabin_lay_low', scene: 'countryside_cabin', phase: 'arrival_rest',
    href: 'cabin.html?preview=1&beat=cabin_lay_low',
  }),
  Object.freeze({
    beat: 'booski_sasole_call', scene: 'countryside_cabin', phase: 'booski_call',
    href: 'cabin.html?preview=1&beat=booski_sasole_call',
  }),
  Object.freeze({
    beat: 'cabin_two', scene: 'countryside_cabin', phase: 'gratin_call',
    href: 'cabin.html?preview=1&beat=cabin_two',
  }),
  Object.freeze({
    beat: 'return_to_old_apartment', scene: 'apartment',
    href: 'index.html?preview=1&beat=return_to_old_apartment',
  }),
  Object.freeze({
    beat: 'new_space_call', scene: 'apartment',
    href: 'index.html?preview=1&beat=new_space_call',
  }),
  Object.freeze({
    beat: 'luxury_apartment_intro', scene: 'luxury_apartment', phase: 'get_ready',
    href: 'luxury-apartment.html?preview=1&beat=luxury_apartment_intro',
  }),
  Object.freeze({
    beat: 'margo_stayover', scene: 'luxury_apartment', phase: 'come_home',
    href: 'luxury-apartment.html?preview=1&beat=margo_stayover',
  }),
  Object.freeze({
    beat: 'luxury_apartment_morning', scene: 'luxury_apartment', phase: 'morning',
    href: 'luxury-apartment.html?preview=1&beat=luxury_apartment_morning',
  }),
  Object.freeze({
    beat: 'luxury_apartment_return', scene: 'luxury_apartment', phase: 'return',
    href: 'luxury-apartment.html?preview=1&beat=luxury_apartment_return',
  }),
  Object.freeze({
    beat: 'special_meeting_call', scene: 'luxury_apartment', phase: 'special_meeting',
    href: 'luxury-apartment.html?preview=1&beat=special_meeting_call',
  }),
]);
/* THE LUXURY FLAT'S OWN STAGES, in the order its story passes through them.
 *
 * These are `luxury=` links rather than `beat=` slides and they hang inside
 * the five luxury spine cards instead of adding cards of their own -- the
 * launcher publishes thirty-one beats and only thirty-one, which the exact
 * match above enforces. See LUXURY_APARTMENT_PREVIEW_VARIANTS in
 * core/preview-mode.js for why the list is one per authored phase.
 *
 * `boot` marks the five this verifier actually opens in the browser. The other
 * five build the identical state as the hub beat directly beside them (they
 * call the same seeder rung), and that hub beat is booted in the loop below,
 * so opening both would buy a second copy of the same proof for another five
 * scene loads on a software rasteriser. tests/luxury-apartment-preview.test.mjs
 * holds all ten headlessly. */
const LUXURY_STAGE_CASES = Object.freeze([
  Object.freeze({ variant: 'arrival', phase: 'get_ready', spawn: 'arrival' }),
  Object.freeze({ variant: 'date-ready', phase: 'date', spawn: 'main', boot: true }),
  Object.freeze({ variant: 'margo-home', phase: 'come_home', spawn: 'main' }),
  Object.freeze({ variant: 'stayover-night', phase: 'stayover', spawn: 'main', boot: true }),
  Object.freeze({ variant: 'margo-morning', phase: 'morning', spawn: 'main' }),
  Object.freeze({ variant: 'no-wake-call', phase: 'no_wake', spawn: 'main', boot: true }),
  Object.freeze({ variant: 'after-no-wake', phase: 'return', spawn: 'main' }),
  Object.freeze({ variant: 'case-handoff', phase: 'complete', spawn: 'main', boot: true }),
  Object.freeze({ variant: 'special-meeting-night', phase: 'special_meeting', spawn: 'main' }),
  /* Reports `special_meeting` on purpose: the flat has no post-campaign phase
   * and this checkpoint is the first thing able to show that. */
  Object.freeze({ variant: 'freeplay', phase: 'special_meeting', spawn: 'main', boot: true }),
]);

/* Scenes with a page of their own that deliberately have no launcher card.
 *
 * Hub pages are represented by the bounded beat links above. Everything else
 * in `SCENES` with an href must have one scene-audit card, and the check below
 * derives that from the campaign rather than trusting the alias list alone. */
const NO_LAUNCHER_CARD = Object.freeze(new Set());

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed; cannot verify scene previews.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM
    || (process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : undefined),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
await page.addInitScript((sentinel) => {
  if (localStorage.getItem('squatchlife.campaign') === null) {
    localStorage.setItem('squatchlife.campaign', sentinel);
  }
}, SENTINEL);

const browserProblems = [];
page.on('pageerror', (error) => browserProblems.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') browserProblems.push(message.text().slice(0, 240));
});
page.on('requestfailed', (request) => {
  const reason = request.failure()?.errorText || 'failed';
  // Navigating from one audio-heavy scene to the next intentionally aborts
  // media still buffering from the old document. Network failures in the
  // active document remain errors; cancellation during navigation does not.
  if (reason.includes('ERR_ABORTED')) return;
  browserProblems.push(`${request.method()} ${request.url()} - ${reason}`);
});
page.on('response', (response) => {
  if (response.status() >= 400) {
    browserProblems.push(`HTTP ${response.status()} ${response.url()}`);
  }
});

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}

async function storageSnapshot() {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
}

function unchanged(snapshot) {
  // Preview isolation owns the campaign namespace, not every browser setting
  // another scene may legitimately remember (mute state, read markers, etc.).
  // Comparing the entire origin made one harmless setting written by Bing
  // poison every later save-isolation assertion in this same browser page.
  const campaign = Object.fromEntries(Object.entries(snapshot)
    .filter(([key]) => key.startsWith('squatchlife.campaign')));
  return JSON.stringify(campaign) === JSON.stringify({
    'squatchlife.campaign': SENTINEL,
  });
}

function linksMatchExpected(links, expected, { ordered = false } = {}) {
  if (links.length !== expected.length) return false;
  if (ordered) {
    return expected.every(([key, href], index) => (
      links[index]?.[0] === key && links[index]?.[1] === href
    ));
  }
  return expected.every(([key, href]) => links.some(([actualKey, actualHref]) => (
    actualKey === key && actualHref === href
  )));
}

async function verifyTabPause(label) {
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__scenePause?.isPaused() === true);
  const paused = await page.evaluate(() => ({
    visible: !document.querySelector('[data-scene-pause]')?.classList.contains('hidden'),
    objective: document.querySelector('[data-scene-pause-objective]')?.textContent?.trim() || '',
    instructions: document.querySelectorAll('[data-scene-pause-instructions] li').length,
  }));
  check(`${label}: Tab opens current instructions`,
    paused.visible && paused.objective.length > 0 && paused.instructions >= 4,
    JSON.stringify(paused));
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__scenePause?.isPaused() === false);
  const resumed = await page.evaluate(() =>
    document.querySelector('[data-scene-pause]')?.classList.contains('hidden') === true);
  check(`${label}: Tab returns control`, resumed);
}

try {
  await page.goto(`http://localhost:${PORT}/preview.html`, { waitUntil: 'load' });
  const launcher = await page.evaluate(() => ({
    title: document.querySelector('h1')?.textContent,
    campaignCards: [...document.querySelectorAll('[data-campaign-beat]')]
      .map((card) => [card.dataset.campaignBeat, card.dataset.campaignScene]),
    unlaunchableCampaignCards: [...document.querySelectorAll('[data-campaign-beat]')]
      .filter((card) => !card.querySelector('a.play[href]'))
      .map((card) => card.dataset.campaignBeat),
    hubs: [...document.querySelectorAll('[data-preview-beat]')]
      .map((link) => [
        link.dataset.previewBeat,
        link.dataset.campaignScene,
        link.getAttribute('href'),
      ]),
    links: [...document.querySelectorAll('[data-preview-scene]')]
      .map((link) => [link.dataset.previewScene, link.getAttribute('href')]),
    apartments: [...document.querySelectorAll('[data-preview-apartment]')]
      .map((link) => [link.dataset.previewApartment, link.getAttribute('href')]),
    luxuryStages: [...document.querySelectorAll('[data-preview-luxury]')]
      .map((link) => [link.dataset.previewLuxury, link.getAttribute('href')]),
    retiredApartmentHrefs: [...document.querySelectorAll('a[href]')]
      .map((link) => link.getAttribute('href'))
      .filter((href) => /[?&]apartment=/.test(href.replaceAll('&amp;', '&'))),
    tools: [...document.querySelectorAll('[data-preview-tool]')]
      .map((link) => [link.dataset.previewTool, link.getAttribute('href')]),
  }));
  check('the launcher follows all 31 campaign beats in spine order',
    launcher.title === 'Campaign preview'
      && JSON.stringify(launcher.campaignCards) === JSON.stringify(EXPECTED_CAMPAIGN_CARDS)
      && launcher.unlaunchableCampaignCards.length === 0,
    JSON.stringify({
      campaignCards: launcher.campaignCards,
      unlaunchable: launcher.unlaunchableCampaignCards,
    }));
  check('the launcher exposes every authored mission preview in route order',
    linksMatchExpected(launcher.links, EXPECTED_SCENE_LINKS, { ordered: true }),
    JSON.stringify(launcher));
  const expectedHubLinks = HUB_PREVIEW_CASES.map(({ beat, scene, href }) => [beat, scene, href]);
  check('the launcher replaces obsolete apartment slides with routed home-hub beats',
    JSON.stringify(launcher.hubs) === JSON.stringify(expectedHubLinks)
      && launcher.apartments.length === 0
      && launcher.retiredApartmentHrefs.length === 0,
    JSON.stringify({
      hubs: launcher.hubs,
      obsoleteApartmentLinks: launcher.apartments,
      retiredApartmentHrefs: launcher.retiredApartmentHrefs,
    }));
  const expectedLuxuryLinks = LUXURY_STAGE_CASES.map(({ variant }) => [
    variant,
    `luxury-apartment.html?preview=1&luxury=${variant}`,
  ]);
  check('the launcher offers every luxury-apartment stage inside its spine cards',
    linksMatchExpected(
      launcher.luxuryStages.map(([variant, href]) => [variant, href.replaceAll('&amp;', '&')]),
      expectedLuxuryLinks,
      { ordered: true },
    ),
    JSON.stringify(launcher.luxuryStages));

  /* AND THE LIST ABOVE IS NOT ALLOWED TO BE THE ONLY SOURCE OF TRUTH.
   *
   * `EXPECTED_SCENE_LINKS` is an exact match in both directions and it still
   * missed a whole scene. THE SPECIAL MEETING shipped playable, with its own
   * page, its own tests and its own place on the campaign route, and it was
   * absent from the launcher AND from that list -- so the two agreed perfectly
   * about a scene neither of them had heard of, and the guard written to stop
   * exactly this reported everything was fine.
   *
   * A hand-maintained list cannot catch a scene nobody remembered. This reads
   * `SCENES` out of the campaign instead: every scene with a page of its own
   * has to be reachable from the launcher, and the only way to be exempt is to
   * be named in `NO_LAUNCHER_CARD` with a reason beside it. */
  const campaignPages = await page.evaluate(async () => {
    const { SCENES } = await import('/src/core/campaign.js');
    return Object.entries(SCENES)
      .filter(([, scene]) => typeof scene?.href === 'string' && scene.href)
      .map(([id, scene]) => [id, scene.href]);
  });
  /* Matched on the whole href as a PREFIX, not on the filename. Two scenes
   * share `bing.html` and two share `mansion.html`, separated only by their
   * query (`?visit=2`, `?visit=return`), so cutting at the '?' would let the
   * first Bing's card stand in for the second's and pass a launcher that is
   * missing one. */
  const carded = [
    ...launcher.links.map(([, href]) => String(href)),
    ...launcher.hubs.map(([, , href]) => String(href)),
  ];
  const missing = campaignPages
    .filter(([id]) => !NO_LAUNCHER_CARD.has(id))
    .filter(([, href]) => !carded.some((link) => link.startsWith(href)))
    .map(([id, href]) => `${id} (${href})`);
  check('every campaign scene with a page of its own is reachable from the launcher',
    missing.length === 0,
    missing.length
      ? `no launcher card for: ${missing.join(', ')}`
      : `${campaignPages.length} scene pages, all carded or deliberately exempt`);
  check('the launcher exposes both development tools',
    linksMatchExpected(launcher.tools, [
      ['wardrobe', 'wardrobe.html'],
      ['combat', 'combatlab.html?preview=1'],
    ]),
    JSON.stringify(launcher.tools));
  check('opening the launcher leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  for (const expected of HUB_PREVIEW_CASES) {
    const problemStart = browserProblems.length;
    await page.goto(`http://localhost:${PORT}/${expected.href}`, { waitUntil: 'load' });
    await page.waitForFunction(({ scene }) => {
      const runtime = globalThis.__squatchLifePreviewRuntime;
      const saved = runtime?.storage?.getItem?.('squatchlife.campaign');
      if (!runtime?.seeded || !saved || !document.querySelector('#squatch-preview-notice')) {
        return false;
      }
      if (scene === 'apartment') return Boolean(window.__squatch?.campaign?.state);
      if (scene === 'countryside_cabin') return Boolean(window.CABIN?.campaign?.state);
      if (scene === 'luxury_apartment') return Boolean(window.LUXURY_APARTMENT?.player);
      return false;
    }, { scene: expected.scene }, { timeout: 180000 });
    if (expected.coldOpen === true) {
      await page.waitForFunction(() => window.__squatch?.coldOpenState?.active === true, null, {
        timeout: 180000,
      });
    }
    const hub = await page.evaluate(async ({ expectedScene }) => {
      const runtime = globalThis.__squatchLifePreviewRuntime;
      const state = JSON.parse(runtime.storage.getItem('squatchlife.campaign'));
      let phase = null;
      if (expectedScene === 'countryside_cabin') {
        phase = window.CABIN?.story?.phase?.() ?? null;
      } else if (expectedScene === 'luxury_apartment') {
        const { createLuxuryApartmentStory } = await import('/src/core/luxury-apartment-story.js');
        phase = createLuxuryApartmentStory({ campaign: { state } }).phase();
      }
      return {
        runtimeBeat: runtime.beatId ?? runtime.beat ?? null,
        runtimeScene: runtime.sceneId,
        seededScene: state.scene,
        story: { day: state.story.day, timeMinutes: state.story.timeMinutes },
        phase,
        coldOpenActive: window.__squatch?.coldOpenState?.active ?? null,
        previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
      };
    }, { expectedScene: expected.scene });
    const newProblems = browserProblems.slice(problemStart);
    check(`hub preview ${expected.beat} boots the routed scene${expected.phase ? ' and phase' : ''}`,
      hub.runtimeBeat === expected.beat
        && hub.runtimeScene === expected.scene
        && hub.seededScene.id === expected.scene
        && (!expected.phase || hub.phase === expected.phase)
        && (expected.coldOpen === undefined || hub.coldOpenActive === expected.coldOpen)
        && hub.previewNotice
        && newProblems.length === 0,
      JSON.stringify({ ...hub, browserProblems: newProblems }));
    check(`hub preview ${expected.beat} leaves the canonical save untouched`,
      unchanged(await storageSnapshot()));
  }

  for (const expected of LUXURY_STAGE_CASES.filter(({ boot }) => boot)) {
    const problemStart = browserProblems.length;
    await page.goto(
      `http://localhost:${PORT}/luxury-apartment.html?preview=1&luxury=${expected.variant}`,
      { waitUntil: 'load' },
    );
    await page.waitForFunction(() => {
      const runtime = globalThis.__squatchLifePreviewRuntime;
      return Boolean(runtime?.seeded)
        && Boolean(runtime?.storage?.getItem?.('squatchlife.campaign'))
        && Boolean(window.LUXURY_APARTMENT?.player)
        && Boolean(document.querySelector('#squatch-preview-notice'));
    }, null, { timeout: 180000 });
    const stage = await page.evaluate(async () => {
      const runtime = globalThis.__squatchLifePreviewRuntime;
      const state = JSON.parse(runtime.storage.getItem('squatchlife.campaign'));
      const { createLuxuryApartmentStory } = await import('/src/core/luxury-apartment-story.js');
      return {
        runtimeVariant: runtime.luxuryVariant ?? null,
        seededScene: state.scene,
        phase: createLuxuryApartmentStory({ campaign: { state } }).phase(),
        day: state.story.day,
        finale: state.finale.status,
      };
    });
    const newProblems = browserProblems.slice(problemStart);
    check(`luxury stage ${expected.variant} boots the flat at its own phase`,
      stage.runtimeVariant === expected.variant
        && stage.seededScene.id === 'luxury_apartment'
        && stage.seededScene.spawn === expected.spawn
        && stage.phase === expected.phase
        && newProblems.length === 0,
      JSON.stringify({ ...stage, browserProblems: newProblems }));
    check(`luxury stage ${expected.variant} leaves the canonical save untouched`,
      unchanged(await storageSnapshot()));
  }

  await page.goto(`http://localhost:${PORT}/nowake.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.NO_WAKE?.story, null, { timeout: 180000 });
  const noWakeBeforeStart = await page.evaluate(() => ({
    mission: window.NO_WAKE.campaignState.missions.no_wake.status,
    scene: window.NO_WAKE.campaignState.scene.id,
  }));
  check('loading NO WAKE preview is read-only until Start',
    noWakeBeforeStart.mission === 'available' && noWakeBeforeStart.scene === 'no_wake',
    JSON.stringify(noWakeBeforeStart));
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.NO_WAKE.campaignState.missions.no_wake.status === 'in_progress');
  const noWake = await page.evaluate(() => ({
    mission: window.NO_WAKE.campaignState.missions.no_wake,
    motel: window.NO_WAKE.campaignState.missions.jerky_motel.status,
    heist: window.NO_WAKE.campaignState.missions.bank_heist.status,
    golf: window.NO_WAKE.campaignState.missions.silver_pines.status,
    silver: window.NO_WAKE.campaignState.missions.silver_room.status,
    call: window.NO_WAKE.campaignState.events.lou_no_wake_call.status,
    chapter: window.NO_WAKE.campaignState.story.chapter,
    day: window.NO_WAKE.campaignState.story.day,
    previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('NO WAKE starts after the luxury-apartment morning with temporary prerequisites',
    noWake.mission.status === 'in_progress'
      && noWake.motel === 'complete'
      && noWake.heist === 'complete'
      && noWake.golf === 'complete'
      && noWake.silver === 'complete'
      && noWake.call === 'answered'
      && noWake.chapter === 'no_wake'
      && noWake.day === 7
      && noWake.previewNotice,
    JSON.stringify(noWake));
  check('NO WAKE preview leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/beefrun.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__beefrun?.mission, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => document.getElementById('overlay')?.classList.contains('hidden'),
    null, { timeout: 180000 });
  await verifyTabPause('The Beef Run');
  check('playing The Beef Run leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/motel.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.MOTEL?.story, null, { timeout: 180000 });
  let motel = await page.evaluate(() => ({
    phase: window.MOTEL.phase,
    mission: window.MOTEL.campaignState.missions.jerky_motel,
    prior: window.MOTEL.campaignState.missions.bada_bing_two,
    previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('the Motel opens unlocked with a visible preview notice',
    motel.phase === 'menu'
      && motel.mission.status === 'available'
      && motel.prior.status === 'complete'
      && motel.previewNotice,
    JSON.stringify(motel));
  /* Dispatched rather than clicked: Playwright's actionability check waits
   * for the page to go quiet, and a scene rendering under a software
   * rasteriser never does. The listener only wants the event. */
  await page.evaluate(() => document.querySelector('#startBtn').click());
  /* The Motel arrival drive runs on the page's own real-time clock: ~40 s of
   * wall time on a software rasteriser before the phase turns over. */
  await page.waitForFunction(() => window.MOTEL.phase === 'car', null, { timeout: 120000 });
  motel = await page.evaluate(() => ({
    phase: window.MOTEL.phase,
    status: window.MOTEL.campaignState.missions.jerky_motel.status,
  }));
  check('the Motel preview starts playing', motel.phase === 'car' && motel.status === 'in_progress',
    JSON.stringify(motel));
  await verifyTabPause('The Jerky Motel');
  check('playing the Motel leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/bing.html?visit=2&preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.HOTDOG_INCIDENT?.story && window.HOTDOG_INCIDENT === window.__bing,
    null,
    { timeout: 180000 },
  );
  let bing = await page.evaluate(() => ({
    secondVisit: window.HOTDOG_INCIDENT.isSecondVisit,
    routerAlias: window.HOTDOG_INCIDENT === window.__bing,
    dedicated: !('blackjack' in window.HOTDOG_INCIDENT)
      && !('slots' in window.HOTDOG_INCIDENT),
    castCount: window.HOTDOG_INCIDENT.cast.all.length,
    mission: window.HOTDOG_INCIDENT.campaignState.missions.bada_bing_two,
    airstrip: window.HOTDOG_INCIDENT.campaignState.missions.airstrip_smuggling,
    motel: window.HOTDOG_INCIDENT.campaignState.missions.jerky_motel,
  }));
  check('the router opens the dedicated HotDog party with its prerequisites',
    bing.secondVisit
      && bing.routerAlias
      && bing.dedicated
      && bing.castCount >= 20
      && bing.mission.status === 'available'
      && bing.airstrip.status === 'complete'
      && bing.motel.status === 'locked',
    JSON.stringify(bing));
  /* Dispatched rather than clicked: Playwright's actionability check waits
   * for the page to go quiet, and a scene rendering under a software
   * rasteriser never does. The listener only wants the event. */
  await page.evaluate(() => document.querySelector('#start-btn').click());
  await page.waitForFunction(() => window.HOTDOG_INCIDENT.game.started, null, { timeout: 180000 });
  bing = await page.evaluate(() => ({
    started: window.HOTDOG_INCIDENT.game.started,
    mission: window.HOTDOG_INCIDENT.campaignState.missions.bada_bing_two,
    motel: window.HOTDOG_INCIDENT.campaignState.missions.jerky_motel.status,
  }));
  check('the HotDog party starts at its own durable checkpoint',
    bing.started
      && bing.mission.status === 'in_progress'
      && bing.mission.checkpoint === 'party'
      && bing.motel === 'locked',
    JSON.stringify(bing));
  check('playing Bada Bing Scene Two leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/graveyard.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GRAVEYARD?.story, null, { timeout: 180000 });
  let graveyard = await page.evaluate(() => ({
    scene: window.GRAVEYARD.campaignState.scene.id,
    incident: window.GRAVEYARD.campaignState.missions.bada_bing_two,
    motel: window.GRAVEYARD.campaignState.missions.jerky_motel.status,
    previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('the Squatch Graveyard opens with HotDog loaded and the Motel still locked',
    graveyard.scene === 'squatch_graveyard'
      && graveyard.incident.status === 'in_progress'
      && graveyard.incident.checkpoint === 'body_loaded'
      && graveyard.incident.bodyLoaded
      && graveyard.motel === 'locked'
      && graveyard.previewNotice,
    JSON.stringify(graveyard));
  await page.evaluate(() => document.querySelector('#start-btn').click());
  await page.waitForFunction(
    () => window.GRAVEYARD.campaignState.missions.bada_bing_two.checkpoint === 'graveyard',
    null,
    { timeout: 180000 },
  );
  graveyard = await page.evaluate(() => ({
    checkpoint: window.GRAVEYARD.campaignState.missions.bada_bing_two.checkpoint,
    motel: window.GRAVEYARD.campaignState.missions.jerky_motel.status,
  }));
  check('starting the graveyard claims only the temporary burial checkpoint',
    graveyard.checkpoint === 'graveyard' && graveyard.motel === 'locked',
    JSON.stringify(graveyard));
  check('playing the Squatch Graveyard leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/squatchfather.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.squatchfather?.campaignStory, null, { timeout: 180000 });
  let meeting = await page.evaluate(() => ({
    mission: window.squatchfather.campaign.state.missions.squatchfather,
    hasPackage: window.squatchfather.campaign.hasItem('parcel'),
  }));
  check('Squatchfather opens with Lou’s package and an available meeting',
    meeting.mission.status === 'available' && meeting.hasPackage,
    JSON.stringify(meeting));
  /* Dispatched rather than clicked: Playwright's actionability check waits
   * for the page to go quiet, and a scene rendering under a software
   * rasteriser never does. The listener only wants the event. */
  await page.evaluate(() => document.querySelector('#startBtn').click());
  await page.waitForFunction(
    () => window.squatchfather.state() === 'START_EXTERIOR',
    null,
    { timeout: 180000 },
  );
  meeting = await page.evaluate(() => ({
    state: window.squatchfather.state(),
    mission: window.squatchfather.campaign.state.missions.squatchfather,
  }));
  check('Squatchfather starts playing',
    meeting.state === 'START_EXTERIOR'
      && meeting.mission.status === 'in_progress'
      && meeting.mission.weaponStaged,
    JSON.stringify(meeting));
  check('playing Squatchfather leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/silver.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__silver?.story, null, { timeout: 180000 });
  const silver = await page.evaluate(() => ({
    mission: window.__silver.campaignState.missions.silver_room,
    motel: window.__silver.campaignState.missions.jerky_motel.status,
    heist: window.__silver.campaignState.missions.bank_heist.status,
    golf: window.__silver.campaignState.missions.silver_pines.status,
    noWake: window.__silver.campaignState.missions.no_wake.status,
    call: window.__silver.campaignState.events.margo_date_call.status,
    chapter: window.__silver.campaignState.story.chapter,
    day: window.__silver.campaignState.story.day,
    previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('Front & Center opens after THE TAKE, golf and the luxury handover',
    silver.mission.status === 'available'
      && silver.motel === 'complete'
      && silver.heist === 'complete'
      && silver.golf === 'complete'
      && silver.noWake === 'locked'
      && silver.call === 'answered'
      && silver.chapter === 'date'
      && silver.day === 6
      && silver.previewNotice,
    JSON.stringify(silver));
  check('opening the Silver Room leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/golf.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__golfReady && window.__golf?.campaign, null, {
    timeout: 180000,
  });
  const golf = await page.evaluate(() => {
    const state = window.__golf.campaign.state;
    return {
      mission: state.missions.silver_pines,
      heist: state.missions.bank_heist.status,
      silver: state.missions.silver_room.status,
      call: state.events.lou_golf_call.status,
      chapter: state.story.chapter,
      day: state.story.day,
      previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
    };
  });
  check('Silver Pines opens after THE TAKE and Lou’s new-space call',
    golf.mission.status === 'available'
      && golf.heist === 'complete'
      && golf.silver === 'locked'
      && golf.call === 'answered'
      && golf.chapter === 'golf_morning'
      && golf.day === 6
      && golf.previewNotice,
    JSON.stringify(golf));
  check('opening Silver Pines leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(
    `http://localhost:${PORT}/heist.html?preview=1&checkpoint=safehouse`,
    { waitUntil: 'load' },
  );
  await page.waitForFunction(() => window.__heistDebug?.start, null, { timeout: 180000 });
  const heistOpening = await page.evaluate(() => ({
    preview: window.__heistDebug.preview,
    difficulty: window.__heistDebug.difficulty,
    crewHuman: window.__heistDebug.crewHuman,
    notice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('THE TAKE preview opens safely with the canonical human crew',
    heistOpening.preview && heistOpening.difficulty === 'professional'
      && heistOpening.crewHuman && heistOpening.notice,
    JSON.stringify(heistOpening));
  await page.evaluate(() => document.getElementById('start').click());
  await page.waitForFunction(() => window.__heistDebug.state === 'CREW_INTRO', null, {
    timeout: 180000,
  });
  const heistStarted = await page.evaluate(() => ({
    state: window.__heistDebug.state,
    slots: document.getElementById('hotbar')?.children.length ?? 0,
    visible: !document.getElementById('hotbar')?.classList.contains('hidden'),
  }));
  check('THE TAKE starts with the shared visible five-slot inventory',
    heistStarted.state === 'CREW_INTRO'
      && heistStarted.slots === 5 && heistStarted.visible,
    JSON.stringify(heistStarted));
  check('opening THE TAKE leaves the canonical save untouched',
    unchanged(await storageSnapshot()));

  await page.goto(`http://localhost:${PORT}/initiation.html?preview=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.INITIATION?.player, null, { timeout: 180000 });
  const initiation = await page.evaluate(() => ({
    phase: window.INITIATION.phase,
    previewNotice: Boolean(document.querySelector('#squatch-preview-notice')),
  }));
  check('the current Initiation build boots directly in preview mode',
    typeof initiation.phase === 'string' && initiation.previewNotice,
    JSON.stringify(initiation));
  check('opening Initiation leaves the canonical save untouched',
    unchanged(await storageSnapshot()));
  check('no runtime console errors occurred',
    browserProblems.length === 0, browserProblems.join(' | '));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} preview checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} preview checks passed.`);
