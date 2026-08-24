/**
 * THE SHARED WEAPON MIX.
 *
 * Every gun in the game used to be played at whatever flat volume its call
 * site happened to type — the player's fire was a hardcoded 0.75 for all seven
 * weapons — so a .45 and a belt-fed SAW arrived at the speakers at the same
 * level and the .45 vanished. And the cartel palace passed a position with no
 * distance falloff, which fell back to `AudioEngine`'s prop defaults of ref
 * 1.4 / maxDist 18: a guard's rifle across an open compound was silent.
 *
 * Both fixes are one layer deep on purpose — `playWeaponCue` — so that the
 * player, the palace, the siege and anything written next get them without
 * asking. These tests hold that layer: the mix exists for every weapon, it
 * SCALES a caller's volume rather than replacing it, and a positional call
 * with no opinion of its own gets a gunshot's falloff.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WEAPON_MIX, WEAPON_ORDER, weaponCue, weaponCueSlots, weaponMix,
} from '../src/core/weapons/catalog.js';
import {
  WEAPON_POSITIONAL_DEFAULTS, playWeaponCue, weaponCueOptions,
} from '../src/core/weapons/audio.js';

/** An AudioEngine that has decoded the whole delivered bank and writes down
 *  exactly what it was asked to play. */
function recorder({ delivered = true } = {}) {
  const played = [];
  return {
    played,
    hasSample(name) { return delivered && name.startsWith('weapon.'); },
    play(name, opts = {}) { played.push({ name, ...opts }); },
    last() { return played.at(-1); },
  };
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

test('every weapon in the catalog has a mix entry for every slot it owns', () => {
  assert.equal(Object.isFrozen(WEAPON_MIX), true, 'the mix table is mutable');
  for (const id of WEAPON_ORDER) {
    const entry = WEAPON_MIX[id];
    assert.ok(entry, `${id} has no audio mix — it will play at whatever its call site typed`);
    for (const slot of weaponCueSlots(id)) {
      const gain = entry[slot];
      assert.ok(Number.isFinite(gain) && gain > 0,
        `${id}.${slot} has no usable gain (${gain})`);
      assert.equal(weaponMix(id, slot), gain, `weaponMix disagrees with the table for ${id}.${slot}`);
      // A mix is a trim, not a rewrite. Anything outside this is a bug, not taste.
      assert.ok(gain >= 0.5 && gain <= 2, `${id}.${slot} gain ${gain} is out of trim range`);
    }
  }
});

test('an unknown weapon or slot is merely unmixed, never silent', () => {
  assert.equal(weaponMix('trebuchet', 'fire'), 1);
  assert.equal(weaponMix('revolver', 'safety.click'), 1);
});

test('the mix says what the owner asked it to say about each gun', () => {
  const fire = (id) => weaponMix(id, 'fire');
  // The pump gun is the heaviest thing in the game indoors.
  for (const id of WEAPON_ORDER.filter((other) => other !== 'shotgun')) {
    assert.ok(fire('shotgun') > fire(id), `the shotgun does not outweigh the ${id}`);
  }
  // The signature sidearm is loud, and audibly above the flat mix it had.
  assert.ok(fire('revolver') > 1.2, `the .45 is still quiet at ${fire('revolver')}`);
  assert.ok(fire('revolver') > fire('pistol9'), 'the .45 is not above the 9mm');
  assert.ok(fire('revolver') > fire('carbine'), 'the .45 is not above the carbine');
  // The carbine is punchy, and under the shotgun.
  assert.ok(fire('carbine') > fire('pistol9'), 'the carbine does not out-punch the 9mm');
  assert.ok(fire('carbine') < fire('shotgun'), 'the carbine is over the shotgun');
  assert.ok(fire('ak47') > fire('carbine'), '7.62 does not sit over 5.56');
  // The SAW earns its loudness from thirteen rounds a second, not from gain.
  assert.ok(fire('saw') <= 1, `the SAW is trimmed up to ${fire('saw')} and will stack`);
  // The player's hardcoded 0.75 fire must leave the .45 near full level.
  assert.ok(0.75 * fire('revolver') > 0.95,
    'the player .45 still lands under the old flat level');
});

/* ------------------------------------------------------------------ */
/* Application: multiply, never replace                                */
/* ------------------------------------------------------------------ */

test('the mix scales a caller volume rather than replacing it', () => {
  const audio = recorder();
  playWeaponCue(audio, 'revolver', 'fire', { volume: 0.75 });
  assert.ok(Math.abs(audio.last().volume - 0.75 * weaponMix('revolver', 'fire')) < 1e-12);

  // Halve the caller's volume and the played level halves with it.
  playWeaponCue(audio, 'revolver', 'fire', { volume: 0.375 });
  assert.ok(Math.abs(audio.last().volume - 0.375 * weaponMix('revolver', 'fire')) < 1e-12);

  // Two guns at one caller volume come out at different levels. That is the
  // entire point: this used to be one number for all seven.
  playWeaponCue(audio, 'shotgun', 'fire', { volume: 0.55 });
  const shotgun = audio.last().volume;
  playWeaponCue(audio, 'pistol9', 'fire', { volume: 0.55 });
  assert.ok(shotgun > audio.last().volume * 1.5, 'the 12-gauge and the 9mm still mix the same');
});

test('a caller with no volume of its own still gets the weapon mix', () => {
  const audio = recorder();
  playWeaponCue(audio, 'barrett', 'fire');
  assert.ok(Math.abs(audio.last().volume - weaponMix('barrett', 'fire')) < 1e-12);
});

test('the mix reaches the stand-in path as well as the delivered recording', () => {
  // Nothing decoded: `playWeaponCue` falls through to its literal stand-in,
  // and a stand-in that is mixed differently from the real take is a mix that
  // changes under the player the day the recordings land.
  const audio = recorder({ delivered: false });
  playWeaponCue(audio, 'shotgun', 'fire', { volume: 0.6 });
  const standIn = audio.last();
  assert.notEqual(standIn.name, weaponCue('shotgun', 'fire'), 'this path was meant to fall back');
  assert.ok(Math.abs(standIn.volume - 0.6 * weaponMix('shotgun', 'fire')) < 1e-12);
  // The stand-in's deliberate pitch shift survives the mix.
  assert.ok(standIn.rate < 1, 'the 12-gauge stand-in lost its pitch shift');
  assert.equal(standIn.requestedCue, 'weapon.shotgun.fire');
  assert.equal(standIn.receiptSource, 'stand-in');
  assert.equal(standIn.fallbackReason, 'requested-recording-not-decoded');
  assert.equal(standIn.requiredRecorded, true,
    'strict QA cannot fail a weapon-specific fallback that is not marked required');
});

test('every weapon and every slot arrives mixed, by whichever path', () => {
  for (const delivered of [true, false]) {
    const audio = recorder({ delivered });
    for (const id of WEAPON_ORDER) {
      for (const slot of weaponCueSlots(id)) {
        assert.equal(playWeaponCue(audio, id, slot, { volume: 0.5 }), true, `${id}.${slot}`);
        assert.ok(Math.abs(audio.last().volume - 0.5 * weaponMix(id, slot)) < 1e-12,
          `${id}.${slot} was played unmixed (delivered=${delivered})`);
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* Distance                                                            */
/* ------------------------------------------------------------------ */

test('a positional call with no falloff of its own gets a gunshot’s falloff', () => {
  assert.deepEqual({ ...WEAPON_POSITIONAL_DEFAULTS }, { ref: 3, maxDist: 55 });
  const audio = recorder();
  const position = { x: 12, y: 1.5, z: -40 };
  // Exactly the cartel palace's call: a position, a volume, and nothing else.
  playWeaponCue(audio, 'ak47', 'fire', { volume: 0.55, position });
  assert.equal(audio.last().ref, 3, 'a guard’s rifle is still a fridge door');
  assert.equal(audio.last().maxDist, 55, 'enemy fire still dies at 18 metres');
  assert.equal(audio.last().position, position, 'the position was dropped');
});

test('a caller that has thought about its own falloff keeps it', () => {
  const audio = recorder();
  const position = { x: 0, y: 0, z: 0 };
  // The mansion siege's tuned attacker fire.
  playWeaponCue(audio, 'carbine', 'fire', { position, volume: 0.6, ref: 3, maxDist: 60 });
  assert.equal(audio.last().ref, 3);
  assert.equal(audio.last().maxDist, 60, 'the siege’s own tuning was overridden');
  // And a caller that wants a close, intimate falloff still gets one.
  playWeaponCue(audio, 'revolver', 'mag.floor', { position, ref: 1, maxDist: 8 });
  assert.equal(audio.last().ref, 1);
  assert.equal(audio.last().maxDist, 8);
});

test('a non-positional call is not turned into a positional one', () => {
  const audio = recorder();
  playWeaponCue(audio, 'revolver', 'fire', { volume: 0.75 });
  assert.equal('ref' in audio.last(), false, 'a first-person shot grew a panner');
  assert.equal('maxDist' in audio.last(), false);
});

test('weaponCueOptions does not mutate the options it was handed', () => {
  const opts = Object.freeze({ volume: 0.5, position: Object.freeze({ x: 1, y: 2, z: 3 }) });
  const out = weaponCueOptions('saw', 'fire', opts);
  assert.notEqual(out, opts);
  assert.equal(opts.volume, 0.5);
  assert.ok(Math.abs(out.volume - 0.5 * weaponMix('saw', 'fire')) < 1e-12);
  assert.equal(out.position, opts.position);
});

test('playWeaponCue with no audio engine is still a no-op', () => {
  assert.equal(playWeaponCue(null, 'revolver', 'fire', { volume: 1 }), false);
});
