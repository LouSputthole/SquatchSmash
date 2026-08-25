import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SILVER = read('src/silvercase/main.js');
const PALACE = read('src/cartel-palace/main.js');
const SIEGE = read('src/mansion/siege/main.js');

function assertCanonicalInput(source, relativeImport) {
  assert.match(source, new RegExp(
    `import \\{ createFirstPersonInput \\} from '${relativeImport.replaceAll('.', '\\.')}';`,
  ));
  assert.match(source, /(?:const input =|input =) createFirstPersonInput\(\{/);
  assert.doesNotMatch(source, /player\.(?:setKey|clearKeys|handleMouseMove)\s*\(/);
  assert.doesNotMatch(source, /addEventListener\(['"]pointerlockchange['"]/);
  assert.doesNotMatch(source, /addEventListener\(['"]pointerlockerror['"]/);
}

test('Silver Case delegates capture and Player plumbing while retaining choice, pause and gun policy', () => {
  assertCanonicalInput(SILVER, '../core/first-person-input.js');
  assert.match(SILVER, /canEnable: \(\) => !paused,/);
  assert.match(SILVER, /canHandleInput: \(\) => true,/);
  assert.match(SILVER, /if \(e\.code === 'Escape'\) \{ pauseMenu\.toggle\(\); return true; \}/);
  assert.match(SILVER, /if \(DIGIT_KEY\[e\.code\] && dialogue\.choice\)/);
  assert.match(SILVER, /if \(!controls\.locked\) return false;/);
  assert.match(SILVER, /if \(e\.button === 0\) firePressed = true;/);
  assert.match(SILVER, /if \(!controls\.locked && running && !paused\) pauseMenu\.pause\(\);/);
});

test('Cartel Palace keeps combat controls phase-gated and clears every held combat channel', () => {
  assertCanonicalInput(PALACE, '../core/first-person-input.js');
  assert.match(PALACE, /canEnable: \(\) => state\.phase === 'active' && !state\.paused,/);
  assert.match(PALACE, /canHandleInput: \(\) => state\.phase === 'active' && !state\.paused,/);
  assert.match(PALACE, /if \(event\.code === 'KeyR' && !event\.repeat\) \{\s*weapons\.reload\(\);/);
  assert.match(PALACE, /if \(!controls\.locked\) return false;/);
  assert.match(PALACE, /if \(event\.button === 0\) \{\s*if \(!finale\.canPlayerFire\(\)\) \{\s*weapons\.setTrigger\(false\);/);
  assert.match(PALACE, /hud\.toast\('Hold fire · listen', 'warn', 1400\);\s*return true;\s*\}\s*weapons\.setTrigger\(true\);/);
  assert.match(PALACE, /onClear: \(reason\) => \{\s*weapons\.setTrigger\(false\);\s*weapons\.setAimed\(false\);/);
  assert.match(PALACE, /function clearCombatInput\(\) \{\s*input\?\.clear\('combat-reset'\);\s*\}/);
});

test('Mansion Siege preserves the visible rejected-capture and one-shot recovery contract', () => {
  assertCanonicalInput(SIEGE, '../../core/first-person-input.js');
  assert.match(SIEGE, /playerEnabled: waking <= 0,/);
  assert.match(SIEGE, /const fallbackShot = pointerLockRejected;\s*requestSiegePointerLock\(\{ explain: true \}\);/);
  assert.match(SIEGE, /function tryPlayerFire\(\{ single = false \} = \{\}\) \{\s*if \(!mission\.playerFireEnabled\) \{\s*weaponSystem\.setTrigger\(false\);\s*return false;/);
  assert.match(SIEGE, /if \(single\) weaponSystem\.triggerPress\(\);\s*else weaponSystem\.setTrigger\(true\);/);
  assert.match(SIEGE, /if \(fallbackShot\) tryPlayerFire\(\{ single: true \}\);/);
  assert.match(SIEGE, /onCaptureChange: \(_event, controls\) => \{\s*if \(controls\.locked\) \{\s*pointerLockRejected = false;/);
  assert.match(SIEGE, /onCaptureError: \(_error, controls\) => \{\s*pointerLockRejected = true;/);
  assert.match(SIEGE, /controls\.reason === 'pointer-lock-error'/);
  assert.match(SIEGE, /interaction\.release\(\);\s*weaponSystem\.setTrigger\(false\);\s*weaponSystem\.setAimed\(false\);/);
});
