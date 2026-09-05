#!/usr/bin/env node
// Bundles the game into a single self-contained HTML file (no server, no
// module imports needed) — handy for sharing or embedding where ES-module
// imports and separate files aren't available.
//
// Usage: node tools/bundle.mjs [outfile]           (default: dist/squatchsmash.html)
//        node tools/bundle.mjs --fragment out.html (omit doctype/html wrapper,
//                                                   for embedding in an existing page)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const outFile = args.find((a) => !a.startsWith('--')) || join(root, 'dist', 'squatchsmash.html');

const read = (p) => readFileSync(join(root, p), 'utf8');

// --- three.module.js: turn the single trailing `export{a as B,...};` into a
// namespace object returned from an IIFE.
let three = read('lib/three.module.js');
const exportMatches = three.match(/export\s*\{/g) || [];
if (exportMatches.length !== 1) {
  throw new Error(`expected exactly 1 export statement in three.module.js, found ${exportMatches.length}`);
}
three = three.replace(/export\s*\{([^}]*)\}\s*;?/, (_, clause) => {
  const pairs = clause.split(',').map((entry) => {
    const [local, exported] = entry.trim().split(/\s+as\s+/);
    return exported ? `${exported}:${local}` : `${local}:${local}`;
  });
  return `return {${pairs.join(',')}};`;
});
const threeBundle = `const THREE = (() => {\n${three}\n})();`;

// --- Game modules: strip import/export syntax and wrap each in an IIFE that
// returns its exports, preserving module scoping (helper names collide freely).
// Strips import statements, including ones broken across several lines.
function stripImports(src) {
  return src
    .replace(/^import\s[\s\S]*?from\s*['"][^'"]*['"];?[ \t]*\r?\n/gm, '')
    .replace(/^import\s+['"][^'"]*['"];?[ \t]*\r?\n/gm, '');
}

function moduleIIFE(path, returns, binding) {
  let src = stripImports(read(path));
  src = src.replace(/^export\s+(const|function|class|let)/gm, '$1');
  return `const ${binding} = (() => {\n${src}\nreturn { ${returns.join(', ')} };\n})();`;
}

const parts = [
  threeBundle,
  // pause-menu imports the shared settings module as a namespace, so the
  // bundle must define `settings` before the pause-menu IIFE runs.
  moduleIIFE('../src/core/settings.js',
    ['DEFAULT_KEYS', 'KEY_ACTIONS', 'SETTING_NAMES', 'get', 'getAll', 'set', 'subscribe',
     'reload', 'live', 'applyBody', 'REDUCED_SHAKE', 'shakeScale', 'lookSensitivity',
     'bindLookSensitivity', 'bindAudioVolume', 'getKeymap', 'bindKey', 'resetKeys',
     'translateKey', 'keyLabel', 'projectGameplayKeysInText'],
    'settings'),
  /* WHAT PAUSE-MENU ASKS FOR THAT THIS BUNDLE DOES NOT HAVE.
   *
   * `stripImports` deletes import lines and defines nothing in their place, so
   * every binding a carried module imports and this bundle does not provide is
   * an undeclared global at runtime. `settings.js` above is provided. The other
   * four were not, and the single-file build threw
   * "installSystemicPolish is not defined" the moment `createPauseMenu` ran --
   * a dead build that `node tools/bundle.mjs` reported as a success, because
   * writing the file and running it are different questions.
   *
   * Carrying them instead of stubbing them is not an option worth having: the
   * transitive closure of src/core/pause-menu.js is FOURTEEN modules and 7,190
   * lines, and 3,982 of those are src/core/campaign.js. The entire Squatch Life
   * campaign -- missions, the clock, the save format -- would ride inside a
   * ninety-second campground smasher so that a pause overlay could offer to
   * export a save that does not exist here.
   *
   * So: exact stubs, shaped to the call sites in pause-menu.js.
   *   - export/importCampaignSave (473, 536) back the save-transfer box.
   *     There is no campaign in the arcade build and no save to move.
   *   - setSceneLifecyclePaused (695, 714, 745, 754, 777) tells Squatch Life's
   *     scene pages to hold. This bundle is one page and pauses itself.
   *   - installSystemicPolish (651) returns three installers whose `destroy`
   *     is called on teardown (779-781); the shapes are what those lines need.
   *
   * tests/game-bundle.test.mjs holds this honest: it walks what each carried
   * module imports and fails on any binding that is neither carried nor named
   * here, so the next import added to pause-menu.js is a red test rather than
   * a dead build.
   */
  `const { exportCampaignSave, importCampaignSave } = {
  exportCampaignSave: () => ({ text: '' }),
  importCampaignSave: () => ({ ok: false, reason: 'no campaign in the arcade build' }),
};
const setSceneLifecyclePaused = () => {};
const readSaveFeedback = () => ({ receipt: null, failing: false, preview: false, persistent: false, briefings: [] });
const saveFeedbackText = () => 'This arcade run has no campaign checkpoint.';
const subscribeSaveFeedback = () => () => {};
const installSystemicPolish = () => {
  const inert = { destroy() {} };
  return { presentation: inert, start: inert, keys: inert };
};`,
  moduleIIFE('../src/core/pause-menu.js', ['createPauseMenu'], '{ createPauseMenu }'),
  moduleIIFE('src/audio.js',
    ['init', 'setMuted', 'isMuted', 'smash', 'crack', 'whiff', 'clang', 'step', 'scream', 'chime',
     'squish', 'boom', 'stomp', 'buzz', 'dart', 'dartHit', 'powerup', 'frenzyJingle',
     'startMusic', 'stopMusic', 'roar', 'sting', 'goalDing', 'siren', 'bossHit', 'bossDown'],
    'sfx'),
  moduleIIFE('src/player.js', ['Sasquatch', 'SKINS', 'skinById'], '{ Sasquatch, SKINS, skinById }'),
  moduleIIFE('src/debris.js', ['DebrisSystem'], '{ DebrisSystem }'),
  moduleIIFE('src/effects.js', ['Effects'], '{ Effects }'),
  moduleIIFE('src/world.js', ['BOUNDS', 'lambert', 'buildWorld'], '{ BOUNDS, lambert, buildWorld }'),
  moduleIIFE('src/campers.js', ['CamperSystem'], '{ CamperSystem }'),
  moduleIIFE('src/rangers.js', ['RangerSystem'], '{ RangerSystem }'),
  moduleIIFE('src/boss.js', ['Boss', 'BOSS_NAME', 'BOSS_MAX_HP'], '{ Boss, BOSS_NAME, BOSS_MAX_HP }'),
  moduleIIFE('src/goals.js',
    ['buildGoals', 'GoalTracker', 'renderGoalList', 'renderGoalSummary'],
    '{ buildGoals, GoalTracker, renderGoalList, renderGoalSummary }'),
  moduleIIFE('src/meta.js',
    ['RANKS', 'UNLOCKS', 'ratingFor', 'rankFor', 'nextRank', 'loadMeta', 'saveMeta',
     'isUnlocked', 'unlockedSkins', 'setSkin', 'recordRun', 'renderCareer', 'renderSkins'],
    '{ RANKS, UNLOCKS, ratingFor, rankFor, nextRank, loadMeta, saveMeta, isUnlocked, unlockedSkins, setSkin, recordRun, renderCareer, renderSkins }'),
];

// main.js runs at top level (it *is* the program)
const main = stripImports(read('src/main.js'));
parts.push(`(() => {\n${main}\n})();`);

const script = parts.join('\n\n');
if (/^\s*(import|export)\s/m.test(script)) {
  throw new Error('bundle still contains import/export statements');
}

// --- HTML shell: reuse index.html, dropping the importmap + module script.
let html = read('index.html');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
html = html.replace(/<script type="module"[^>]*><\/script>\s*/, `<script>\n${script}\n</script>\n`);
// The menu logo is the game's only external asset. A "single self-contained
// HTML file" must keep working after it is moved away from this directory.
const logo = readFileSync(join(root, 'assets', 'logo.png')).toString('base64');
html = html.replace('src="assets/logo.png"', `src="data:image/png;base64,${logo}"`);
if (fragment) {
  // Strip the document wrapper: keep everything inside <body>, plus <title>
  // and the <style> block from <head>.
  const title = (html.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
  const style = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  const body = (html.match(/<body>([\s\S]*)<\/body>/) || [null, ''])[1];
  html = `${title}\n${style}\n${body}`;
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, html);
console.log(`wrote ${outFile} (${(html.length / 1024).toFixed(0)} KB)`);
