import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROSPECT_OUTFITS,
  knownProspectOutfitId,
  makeProspectFigure,
  resolveProspectOutfit,
} from '../src/core/prospect-body.js';
import { CABIN_PLAYER_OUTFITS, makeCabinPlayerFigure } from '../src/cabin/player-body.js';

test('one canonical Prospect table serves every mirror scene', () => {
  /* Owner, 2026-09-01: "In luxury apartment, mirror kind sucks still" — the
   * luxury scene was reflecting the old box rig while the apartment and the
   * cabin each typed this table locally. One table now; the cabin re-exports
   * it verbatim. */
  assert.equal(CABIN_PLAYER_OUTFITS, PROSPECT_OUTFITS);
  assert.deepEqual(Object.keys(PROSPECT_OUTFITS).sort(), [
    'black_henley', 'cabin_workshirt', 'charcoal_suit', 'cream_cashmere',
    'good_shirt', 'grey_henley', 'late-night_track_jacket',
  ]);
  for (const [id, outfit] of Object.entries(PROSPECT_OUTFITS)) {
    assert.equal(outfit.height, 1.80, `${id} is the same 1.80 m man`);
    assert.equal(outfit.skin, 0xc9936d, `${id} keeps his skin tone`);
    assert.equal(outfit.castShadow, false, `${id} stays a reflection-only body`);
    /* The Squatchfather head standard in every mirror (owner, 2026-09-01),
     * and one authored amber iris rather than a colour drawn per load. */
    assert.equal(outfit.faceDetail, true, `${id} wears the detailed face`);
    assert.equal(outfit.iris, 0x4a3418, `${id} keeps the authored iris`);
  }
});

test('unknown persisted ids fall back to the charcoal suit', () => {
  assert.equal(knownProspectOutfitId('cream_cashmere'), 'cream_cashmere');
  assert.equal(knownProspectOutfitId('leopard_speedo'), 'charcoal_suit');
  assert.equal(resolveProspectOutfit(undefined).id, 'charcoal_suit');
});

test('the figure honours the FirstPersonBody parts contract', () => {
  const figure = makeProspectFigure('charcoal_suit', { name: 'test-reflection-body' });
  assert.equal(figure.group.name, 'test-reflection-body');
  assert.equal(figure.group.userData.resolvedOutfitId, 'charcoal_suit');
  for (const part of ['body', 'head', 'legL', 'legR', 'shinL', 'shinR', 'armL', 'armR', 'foreL', 'foreR', 'handR']) {
    assert.ok(figure[part]?.isObject3D, `figure exposes ${part}`);
  }
  assert.ok(Number.isFinite(figure.heightScale));
  const cabinFigure = makeCabinPlayerFigure('grey_henley');
  assert.equal(cabinFigure.group.name, 'cabin-player-reflection-body');
  assert.equal(cabinFigure.group.userData.resolvedOutfitId, 'grey_henley');
});
