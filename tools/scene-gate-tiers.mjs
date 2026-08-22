#!/usr/bin/env node
/**
 * WHICH BROWSER GATE COSTS WHAT, AND THEREFORE WHERE IT CAN RUN.
 *
 * The 2026-08-14 checks-that-lie pass wired everything HEADLESS into
 * `.github/workflows/verify.yml` and left forty browser gates running nowhere,
 * for a reason that was true: they boot real scenes on a software rasteriser
 * and the per-pull-request job cannot afford them. "For now" is how the
 * marathon spent weeks broken at step 25, so this file is the other half —
 * every one of those gates named, priced, and given a schedule it fits in.
 *
 * THE PRICE IS FRAMES, NOT SECONDS. Every scene clamps its step
 * (`Math.min(0.05, ...)`), so an authored duration costs a FIXED NUMBER OF
 * RENDERED FRAMES and takes whatever wall time those frames take —
 * docs/ENGINE-TRAPS.md entry 2. The numbers this repo has actually measured on
 * a GPU-less box:
 *
 *   - the Jerky Motel's 4.4 s pull-in is 88 frames: 40 s on a quiet box,
 *     256 s measured 2026-08-20 at 1280x720 with the machine contended
 *     (tools/verify-motel.mjs, and it is why that file gave up on wall-clock
 *     budgets entirely)
 *   - Initiation's phase clock reached 10.9 s in 420 s of wall clock, and
 *     tools/probe-initiation-fps.mjs measured 2.9 fps in the clearing, 1.5 in
 *     the cabin, 1.3 at the pull-back
 *   - the Cartel Palace boots in 45 s and its aim-in blend, a per-frame lerp,
 *     measured 51.4 s in and 76.5 s out at 960x600
 *
 * So the model each tier below is derived from is two terms and nothing else:
 *
 *     wall time  ~=  (scene boots x 20-45 s)  +  (simulated seconds / 0.05) x frame time
 *
 * with frame time between 0.3 s and 0.8 s. In-page stepping does NOT count
 * against the second term: `for (i < 50000) player.update(1/60)` inside one
 * `page.evaluate` never paints, which is why verify:golf's fifty-thousand-step
 * walkable sweep is cheaper than verify:motel's one 4.4 s drive.
 *
 * ASSUMPTION ABOUT RUNNERS, STATED RATHER THAN ASSUMED. A GitHub-hosted
 * ubuntu-latest runner has more CPU than the box these numbers came off and,
 * more importantly, is not contended — nothing else is rendering on it. The
 * tiers below assume it lands at the QUIET end of the measurements above
 * (roughly 2-3 fps, boots near 20-30 s), i.e. about twice as fast as the
 * contended figures. That is a guess until a nightly has run. The workflow
 * prints each gate's wall time into the run summary precisely so the guess can
 * be corrected from data instead of re-derived from source; if a tier's gates
 * routinely finish in a quarter of their budget, move them down a tier.
 *
 * THE TIMEOUTS ARE GUARDS AGAINST A HANG, NOT PERFORMANCE ASSERTIONS. Same
 * doctrine as the verifiers themselves: a scene that never reaches its state
 * still fails, just later. Do not tighten one to make a schedule look neat.
 */

import { pathToFileURL } from 'node:url';

/**
 * The tiers, cheapest first. `minutes` is the per-gate job timeout.
 *
 * The boundary between tiers is not importance and not scene size — it is
 * whether the gate makes the RENDER LOOP do work over simulated time.
 */
export const TIERS = Object.freeze({
  smoke: Object.freeze({
    minutes: 20,
    summary: 'Boots a page or two and reads state back out. Nothing is driven '
      + 'over simulated time, so the bill is boots and nothing else.',
  }),
  scene: Object.freeze({
    minutes: 45,
    summary: 'Several boots, or one short driven stretch. Minutes, not '
      + 'seconds, but it finishes inside a coffee.',
  }),
  campaign: Object.freeze({
    minutes: 150,
    summary: 'A whole mission driven through rendered frames, or the biggest '
      + 'scenes booted over and over. These are the ones that cannot go near a '
      + 'pull request at any frame rate.',
  }),
});

/**
 * Every browser-launching `verify:*` script in package.json, with the reason
 * for its tier. `why` cites what was counted in the source — boots, driven
 * simulated seconds, measurements the file itself records — because the next
 * person to move a gate between tiers needs the arithmetic, not the verdict.
 */
export const SCENE_GATES = Object.freeze([
  /* ---- smoke: boot, read, close ---------------------------------- */
  {
    script: 'verify:art',
    tier: 'smoke',
    why: 'One apartment boot, then a single evaluate that measures built matrices. Nothing moves.',
  },
  {
    script: 'verify:step-over',
    tier: 'smoke',
    why: 'One boot of a generated harness page. No scene, no mission, 60 s default timeout.',
  },
  {
    script: 'verify:pixel-ratio',
    tier: 'smoke',
    why: 'Two combatlab boots; reads renderer state straight after each.',
  },
  {
    script: 'verify:combat-system',
    tier: 'smoke',
    why: 'One combatlab boot. Its 180-step sweeps are update(1/60) inside one evaluate, '
      + 'which costs CPU and paints nothing.',
  },
  {
    script: 'verify:scene-recovery',
    tier: 'smoke',
    why: 'Two boots with the entry module sabotaged; asserts the recovery surface, drives nothing.',
  },
  {
    script: 'verify:cold-open',
    tier: 'smoke',
    why: 'One apartment boot and five state predicates on the opening.',
  },
  {
    script: 'verify:mouths',
    tier: 'smoke',
    why: 'One silvercase checkpoint boot; the viseme stepping is in-page and unrendered.',
  },
  {
    script: 'verify:license-to-grill',
    tier: 'smoke',
    why: 'One Bada Bing boot. Its author set the default timeout to 20 s on purpose — '
      + 'this one is deliberately not allowed to become slow.',
  },
  {
    script: 'verify:silver-story',
    tier: 'smoke',
    why: 'Two apartment boots, campaign state only.',
  },
  {
    script: 'verify:squatch-smash',
    tier: 'smoke',
    why: 'Two boots of the arcade game plus its own bundle build. A 2D cabinet game, '
      + 'not one of the 3D scenes.',
  },
  {
    script: 'verify:settings',
    tier: 'smoke',
    why: 'Three preview boots and five screenshots; each page is read as soon as it is up.',
  },
  {
    script: 'verify:direct-entry',
    tier: 'smoke',
    why: 'Eight boots at 640x360 — the top of this tier — but each is boot, click, 350 ms, '
      + 'read the save, close.',
  },

  /* ---- scene: several boots, or one short driven stretch ---------- */
  {
    script: 'verify:webgl-health',
    tier: 'scene',
    why: 'Nineteen boots, one per launcher entry, each boot plus 750 ms. Pure boot cost, '
      + 'nineteen times over.',
  },
  {
    script: 'verify:preview',
    tier: 'scene',
    why: 'Thirteen boots: the launcher, every apartment variant and every preview link.',
  },
  {
    script: 'verify:day-one',
    tier: 'scene',
    why: 'Three apartment boots and a day of beats, most of them gated on the story clock.',
  },
  {
    script: 'verify:day-two',
    tier: 'scene',
    why: 'Two apartment boots across the Day Two handoff.',
  },
  {
    script: 'verify:big-night',
    tier: 'scene',
    why: 'Two boots and fourteen sim-gated waits through the Day Four handoff.',
  },
  {
    script: 'verify:beefrun-checkpoints',
    tier: 'scene',
    why: 'Six boots, one per public demo link, each driven only as far as playable.',
  },
  {
    script: 'verify:silvercase',
    tier: 'scene',
    why: 'One playthrough boot plus five checkpoint boots; the FSM is stepped in-page.',
  },
  {
    script: 'verify:squatchfather',
    tier: 'scene',
    why: 'Two boots and the restaurant beat driven on real frames.',
  },
  {
    script: 'verify:graveyard',
    tier: 'scene',
    why: 'Four boots and a walked burial. The file sets its own default to 600 s, which is '
      + 'what a walked scene costs.',
  },
  {
    script: 'verify:computer',
    tier: 'scene',
    why: 'One boot, then the whole in-apartment computer worked through the UI; twelve of '
      + 'its waits are still wall-clock naps.',
  },
  {
    script: 'verify:mansion-return',
    tier: 'scene',
    why: 'One boot of the fifteen-thousand-mesh house and a short return beat. The boot is '
      + 'the expensive half.',
  },
  {
    script: 'verify:mansion-art',
    tier: 'scene',
    why: 'One mansion boot plus a contact-sheet page, and a 5x5 sampling grid per picture.',
  },
  {
    script: 'verify:enola-bomb-audio',
    tier: 'scene',
    why: 'One boot and the bomb run; the file measures its own simulated-seconds-per-real-second '
      + 'ratio, which tells you it already knows this is frame-bound.',
  },
  {
    script: 'verify:final-arc-reloads',
    tier: 'scene',
    why: 'A seeded reload per durable branch, one context at a time so each heavy scene is '
      + 'released before the next boots.',
  },
  {
    script: 'verify:bundle',
    tier: 'scene',
    why: 'Three boots of the 16 MB single file, one per CSP. The file records a load running '
      + 'past three minutes with the page perfectly alive behind it.',
  },
  {
    script: 'verify:golf',
    tier: 'scene',
    why: 'Four boots and three holes. The 50,000-step walkable sweep is in-page and free; '
      + 'the putts settle on rendered frames and are not.',
  },
  {
    script: 'verify:bing-two',
    tier: 'scene',
    why: 'Seven boots — three route pages and four checkpoints — but the checkpoint half '
      + 'advances the exposed director deterministically rather than on SwiftShader frames.',
  },

  /* ---- campaign: a mission, driven ------------------------------- */
  {
    script: 'verify:no-wake',
    tier: 'campaign',
    why: 'Five boots and about 234 s of page.clock.runFor. The fake clock removes the WAITING, '
      + 'not the frames: at 0.05 s a frame that is ~4,700 rendered frames. Its route contract '
      + 'forbids skipDrive and setting physics.speed on purpose, so there is no cheaper path '
      + 'through it by design.',
  },
  {
    script: 'verify:initiation',
    tier: 'campaign',
    why: 'One boot, the whole ceremony pressed through a button at a time. Measured at the '
      + 'stall: phaseT 10.9 s in 420 s of wall clock, so act six alone is budgeted 900 s and '
      + 'the pull-back timer needs about nine minutes.',
  },
  {
    script: 'verify:enolasquatch',
    tier: 'campaign',
    why: 'One boot, then four minutes of eastbound flight, the barrage, two minutes of fighter '
      + 'passes and an unattended run of up to two more. All of it on rendered frames.',
  },
  {
    script: 'verify:mansion-siege',
    tier: 'campaign',
    why: 'Seven boots and three simulated minutes of shooting, plus ninety-second unpressed '
      + 'waits. It turns its own renderer off between sections because leaving it on made the '
      + 'fourth checkpoint page time out.',
  },
  {
    script: 'verify:mansion',
    tier: 'campaign',
    why: 'Eleven boots of the fifteen-thousand-mesh house and 267 checks walked on foot. It '
      + 'pauses the first page while the checkpoint pages build because otherwise every load '
      + 'below costs double.',
  },
  {
    script: 'verify:cartel-palace',
    tier: 'campaign',
    why: 'Five boots measured at 45 s each, and the combat section waits on per-frame lerps '
      + 'measured at 51.4 s and 76.5 s. Its whole default is 180 s for that reason.',
  },
  {
    script: 'verify:motel',
    tier: 'campaign',
    why: 'Three boots and the arrival drive: 88 rendered frames, 40 s quiet and 256 s '
      + 'contended, before any of the forty other sim-gated waits.',
  },
  {
    script: 'verify:heist',
    tier: 'campaign',
    why: 'Twelve boots — six of them resume cases — and reaction windows the file itself '
      + 'calls "the better part of a minute of wall clock", measured at about one frame a second.',
  },
  {
    script: 'verify:bing',
    tier: 'campaign',
    why: '162 checks across the whole first Bada Bing night, thirty of them stepping the '
      + 'scene three simulated seconds at a time.',
  },
  {
    script: 'verify:silver',
    tier: 'campaign',
    why: '157 checks on one boot, several measured in rendered pixels — which means real '
      + 'draws, not state reads.',
  },
  {
    script: 'verify:beefrun',
    tier: 'campaign',
    why: 'Two boots and the whole flight flown, plus a mid-mission resume. Its own boot wait '
      + 'is budgeted in minutes rather than seconds.',
  },
].map((gate) => Object.freeze({
  ...gate,
  slug: gate.script.replace(/^verify:/, ''),
  minutes: TIERS[gate.tier].minutes,
})));

/**
 * Browser gates that are deliberately NOT on any schedule, and why.
 *
 * An empty reason is not allowed and the test enforces it: a gate that drops
 * off the list without an argument is the drift this whole file exists to
 * stop. ENGINE-TRAPS entry 10 — a stale allowlist entry is a claim about the
 * world, not a chore.
 */
export const EXCLUDED_GATES = Object.freeze({
  'verify:boot-errors': 'Already runs on every pull request in verify.yml — it aborts each '
    + 'staged page\'s entry module rather than booting a scene, which is why it could go there.',
  'verify:campaign-marathon': 'Already runs on every pull request in verify.yml — it stubs '
    + 'every scene runtime out, so the whole 27-handoff route costs less than one real boot.',
  'verify:webgl-native': 'The same tool as verify:webgl-health with --native-gpu, which '
    + 'REQUIRES a real GPU and fails on anything software-rasterised. Every GitHub-hosted '
    + 'runner is software-rasterised, so scheduling it would produce a red run for the one '
    + 'reason that is not a defect. It stays a thing you run on hardware you can see.',
});

const TIER_NAMES = Object.freeze(Object.keys(TIERS));

/** The gates in one or more tiers, in declaration order. `all` means all of them. */
export function selectGates({ tiers = [], gates = [] } = {}) {
  const named = gates.map((name) => name.trim()).filter(Boolean);
  if (named.length) {
    const byScript = new Map(SCENE_GATES.map((gate) => [gate.script, gate]));
    return named.map((name) => {
      const gate = byScript.get(name) ?? byScript.get(`verify:${name}`);
      if (!gate) throw new Error(`${name} is not a scheduled browser gate. Known: `
        + `${SCENE_GATES.map((entry) => entry.script).join(', ')}`);
      return gate;
    });
  }
  const wanted = new Set(tiers.flatMap((tier) => (tier === 'all' ? TIER_NAMES : [tier])));
  for (const tier of wanted) {
    if (!TIERS[tier]) throw new Error(`${tier} is not a tier. Known: ${TIER_NAMES.join(', ')}`);
  }
  return SCENE_GATES.filter((gate) => wanted.has(gate.tier));
}

/**
 * Is this npm script one that launches a browser?
 *
 * Read off the tool's own source rather than a second list, so a verifier that
 * gains or loses Playwright cannot quietly disagree with this file.
 */
export function browserVerifyScripts(packageJson, readToolSource) {
  const found = [];
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    if (!name.startsWith('verify:')) continue;
    const tool = command.match(/tools\/(verify-[a-z0-9-]+\.mjs)/)?.[1];
    if (!tool) continue;
    const source = readToolSource(tool);
    if (source === null) continue;
    if (/from 'playwright'|launch-chromium\.mjs|chromium\.launch/.test(source)) found.push(name);
  }
  return found;
}

/** Every scheduled gate is in exactly one tier, and nothing is unaccounted for. */
export function auditGateCoverage(packageJson, readToolSource) {
  const browser = browserVerifyScripts(packageJson, readToolSource);
  const scheduled = new Set(SCENE_GATES.map((gate) => gate.script));
  const excluded = new Set(Object.keys(EXCLUDED_GATES));
  return {
    browser,
    missing: browser.filter((name) => !scheduled.has(name) && !excluded.has(name)),
    unknown: [...scheduled, ...excluded].filter((name) => !browser.includes(name)),
    duplicated: SCENE_GATES
      .map((gate) => gate.script)
      .filter((name, index, all) => all.indexOf(name) !== index || excluded.has(name)),
  };
}

/* ------------------------------------------------------------------ *
 * CLI — the shape .github/workflows/verify-scenes.yml consumes.
 *
 *   node tools/scene-gate-tiers.mjs --matrix --tiers "smoke scene"
 *   node tools/scene-gate-tiers.mjs --matrix --gates "verify:no-wake"
 *   node tools/scene-gate-tiers.mjs            # the table, for a human
 * ------------------------------------------------------------------ */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (flag) => {
    const index = process.argv.indexOf(flag);
    return index === -1 ? '' : (process.argv[index + 1] ?? '');
  };
  const split = (value) => value.split(/[\s,]+/).filter(Boolean);
  if (process.argv.includes('--matrix')) {
    /* A mistyped tier in the Actions dispatch box should read as a mistyped
     * tier, not as a Node stack trace above a workflow that never started. */
    let selected;
    try {
      selected = selectGates({ tiers: split(arg('--tiers')), gates: split(arg('--gates')) });
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    console.log(JSON.stringify(selected.map(({ script, slug, tier, minutes }) => ({
      script, slug, tier, minutes,
    }))));
  } else {
    for (const tier of TIER_NAMES) {
      const gates = SCENE_GATES.filter((gate) => gate.tier === tier);
      console.log(`\n${tier} — ${TIERS[tier].summary} (${gates.length} gates, `
        + `${TIERS[tier].minutes} min each)`);
      for (const gate of gates) console.log(`  ${gate.script.padEnd(28)} ${gate.why}`);
    }
    console.log('\nnot scheduled');
    for (const [script, why] of Object.entries(EXCLUDED_GATES)) {
      console.log(`  ${script.padEnd(28)} ${why}`);
    }
  }
}
