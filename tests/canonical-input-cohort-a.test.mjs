import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SILVER = read('src/silvercase/main.js');
const PALACE = read('src/cartel-palace/main.js');
const SIEGE = read('src/mansion/siege/main.js');
const CABIN = read('src/cabin/main.js');
const INITIATION = read('src/initiation/main.js');

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
  /* Reload is a bindable action, so it is measured against the translated
   * `code` the Adapter supplies — not the physical `event.code`, which left a
   * rebound reload dead in the Palace. */
  assert.match(PALACE, /keyDown\(event, \{ code \}\) \{/);
  assert.match(PALACE, /if \(code === 'KeyR' && !event\.repeat\) \{\s*weapons\.reload\(\);/);
  assert.match(PALACE, /if \(code === 'KeyQ' && !event\.repeat\) \{\s*loadout\.stow\(weapons\);/);
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
  assert.match(SIEGE, /function tryPlayerFire\(\{ single = false \} = \{\}\) \{\s*if \(!mission\.playerFireEnabled \|\| heroDialogueProtected\(\)\) \{\s*weaponSystem\.setTrigger\(false\);\s*return false;/);
  assert.match(SIEGE, /if \(single\) weaponSystem\.triggerPress\(\);\s*else weaponSystem\.setTrigger\(true\);/);
  assert.match(SIEGE, /if \(fallbackShot\) tryPlayerFire\(\{ single: true \}\);/);
  assert.match(SIEGE, /onCaptureChange: \(_event, controls\) => \{\s*if \(controls\.locked\) \{\s*pointerLockRejected = false;/);
  assert.match(SIEGE, /onCaptureError: \(_error, controls\) => \{\s*pointerLockRejected = true;/);
  assert.match(SIEGE, /controls\.reason === 'pointer-lock-error'/);
  assert.match(SIEGE, /interaction\.release\(\);\s*weaponSystem\.setTrigger\(false\);\s*weaponSystem\.setAimed\(false\);/);
});

test('Countryside Cabin delegates browser lifecycle while retaining phone, arcade and inventory policy', () => {
  assertCanonicalInput(CABIN, '../core/first-person-input.js');
  assert.match(CABIN, /playerKeyCodes: \['KeyF'\],/,
    'Cabin must route the held-use F key through the canonical Player adapter');
  assert.match(CABIN, /player\.keys\.has\('KeyF'\)/,
    'Cabin held consumables must consume the routed Player key state');
  assert.match(CABIN, /canEnable: \(\) => state\.phase === 'active'[\s\S]*arcade\.inputMode !== 'dom',/);
  assert.match(CABIN, /if \(state\.posture === 'desk' && arcade\.onKey\(event\.code, true\)\) return true;/);
  assert.match(CABIN, /controls\.code === 'KeyE'[\s\S]*cabin\.inventory\.held === 'phone'/);
  assert.match(CABIN, /if \(!controls\.locked\) return false;/);
  assert.match(CABIN, /input\.suspend\(\);/);
  assert.match(CABIN, /input\.resume\(\);/);
});

test('Initiation delegates browser lifecycle while retaining phase, choice and ritual policy', () => {
  assertCanonicalInput(INITIATION, '../core/first-person-input.js');
  assert.match(INITIATION, /player: playerController,/);
  assert.match(INITIATION, /movementEnabled: canMove\(\) && !openChoice,/);
  assert.match(INITIATION, /controls\.code === 'Space' && !canMove\(\)/);
  assert.match(INITIATION, /if \(openChoice && \/\^Digit\[123\]\$\/\.test\(event\.code\)\)/);
  assert.match(INITIATION, /input\?\.releasePointerLock\(\);/);
  assert.match(INITIATION, /input\.suspend\(\);/);
  assert.match(INITIATION, /input\.resume\(\{/);
});
