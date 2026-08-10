import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../tools/verify-enola-bomb-audio.mjs', import.meta.url), 'utf8');

test('the focused Enola bomb-audio verifier uses the established ANGLE SwiftShader path', () => {
  assert.match(source, /['"]--use-gl=angle['"]/,
    'direct --use-gl=swiftshader can lose the cold WebGL context before audio verification starts');
  assert.match(source, /['"]--use-angle=swiftshader['"]/,
    'the verifier must select deterministic software rendering through ANGLE');
  assert.doesNotMatch(source, /['"]--use-gl=swiftshader['"]/,
    'the unstable direct SwiftShader backend is still enabled');
});

test('the focused verifier enters the save-free preview mission before awaiting audio', () => {
  assert.match(source, /enolasquatch\.html\?preview=1/,
    'ordinary campaign entry can reject Start before startAudio() is called');
  assert.match(source, /campaign\?\.preview/,
    'the verifier does not prove that it entered isolated preview storage');
  assert.match(source, /phase\s*===\s*['"]walkaround['"]/,
    'the verifier does not prove that Start entered the real opening mission phase');
  assert.match(source, /overlayHidden/,
    'the verifier does not prove that the player-facing Start overlay closed');
  assert.doesNotMatch(source, /localStorage\.(?:clear|setItem|removeItem)\s*\(/,
    'the focused verifier must not mutate a player campaign save to unlock the scene');
});

test('the focused verifier awaits the real manifest load and reports residency diagnostics', () => {
  assert.match(source, /engine\._manifestLoadPromise/,
    'polling four buffers hides whether the manifest load started, failed, or stalled');
  assert.match(source, /MANIFEST_LOAD_TIMEOUT_MS/,
    'the manifest wait has no explicit bounded deadline');
  assert.match(source, /preloadStats/,
    'a failure would not say how many Enola cues were selected');
  assert.match(source, /loadedCount/,
    'a failure would not say how far decoding progressed');
  assert.match(source, /missing/,
    'a failure would not identify which required bomb clips are absent');
  assert.doesNotMatch(source, /waitForFunction\(\(\) => \{\s*const b = window\.__enolaSquatch\?\.audio\?\.engine\?\.buffers/s,
    'the verifier still waits 180 seconds on an opaque four-buffer poll');
});
