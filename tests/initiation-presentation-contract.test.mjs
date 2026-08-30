import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/initiation/main.js', import.meta.url), 'utf8');
const propMotion = readFileSync(
  new URL('../src/initiation/ceremony-props-motion.js', import.meta.url),
  'utf8',
);

test('Initiation uses the shared restrained post-processing pipeline', () => {
  assert.match(source, /import \{ PostFX \} from '\.\.\/core\/postfx\.js'/);
  assert.doesNotMatch(source, /postprocessing\/(?:EffectComposer|RenderPass|UnrealBloomPass|OutputPass)/);
  assert.match(source, /renderer\.toneMappingExposure\s*=\s*0\.98/);
  assert.match(source, /postfx\.bloom\.threshold\s*=\s*1\.18/);
  assert.match(source, /postfx\.bloom\.strength\s*=\s*0\.30/);
  assert.match(source, /postfx\.bloom\.radius\s*=\s*0\.28/);
  assert.match(source, /postfx\.render\(\)/);
  assert.match(source, /postfx\.sample\(dt\)/);
});

test('outdoor steps use one surface-aware footstep path', () => {
  assert.match(source, /playFootstep\(audio, player\.position\.x, player\.position\.z/);
  assert.match(source, /cadenceKey:\s*'scripted-player'/);
  assert.doesNotMatch(source, /sfx\.step\(\)/,
    'the local synthetic step would double every shared surface sample');
});

test('established members are identified by their faces, with subtle labels only on prospects', () => {
  const membersStart = source.indexOf('for (const spec of CIRCLE)');
  const prospectsStart = source.indexOf('for (const slot of LINE_UP)');
  assert.ok(membersStart >= 0 && prospectsStart > membersStart);
  assert.doesNotMatch(source.slice(membersStart, prospectsStart), /makeNameplate\(/);
  const prospectBlock = source.slice(prospectsStart, source.indexOf('const RUN_ORDER', prospectsStart));
  assert.match(prospectBlock, /makeNameplate\(slot\.name/);
  assert.match(prospectBlock, /plate\.scale\.set\(1\.18, 0\.22, 1\)/);
  assert.match(prospectBlock, /plate\.material\.opacity\s*=\s*0\.68/);
});

test('Booskibro carries an intentional dark staff rather than a missing-material wand', () => {
  assert.match(source, /const founderStaff = buildFounderStaff\(\)/);
  assert.match(source, /mountFounderStaff\(boosk, founderStaff\)/);
  assert.match(propMotion, /FOUNDER_STAFF_HAND = 'L'/);
  assert.match(propMotion, /staff\.name = 'booskibro\.founder\.staff'/);
  assert.match(propMotion, /staff\.userData\.intendedProp = 'founder-staff'/);
  assert.match(propMotion, /color: 0x24140b/);
  assert.match(propMotion, /new THREE\.OctahedronGeometry\(0\.115, 0\)/);
  assert.doesNotMatch(propMotion, /DodecahedronGeometry/);
});

test('the first-person ritual raises Tony\'s hands only after the hand prompt', () => {
  const visible = source.match(/const FIRST_PERSON_RITUAL_PHASES = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? '';
  assert.doesNotMatch(visible, /'blade'/,
    'the blade reveal must not pre-raise the hands before the authored prompt');
  for (const phase of ['hand', 'cut', 'card', 'oath_1', 'oath_2', 'burn', 'made']) {
    assert.match(visible, new RegExp(`'${phase}'`), `${phase} hides the hand the ritual camera frames`);
  }
});
