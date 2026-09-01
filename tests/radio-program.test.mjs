import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAMPAIGN_SPINE } from '../src/core/campaign-spine.js';
import {
  CAMPAIGN_RADIO_BEATS,
  PHYSICAL_RADIO_RECEIVERS,
  RADIO_PROGRAMS,
  campaignRadioContext,
  radioProgramFor,
} from '../src/core/radio-program.js';
import { STATIONS } from '../src/core/stations.js';
import { buildRadioProgramRows } from '../tools/radio-audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every campaign beat declares an intentional radio policy', () => {
  assert.deepEqual(
    Object.keys(CAMPAIGN_RADIO_BEATS).sort(),
    CAMPAIGN_SPINE.map((beat) => beat.id).sort(),
  );
  for (const beat of CAMPAIGN_SPINE) {
    assert.match(
      CAMPAIGN_RADIO_BEATS[beat.id].policy,
      /^(talkFirst|musicFirst|intentionalSilence|none)$/,
      beat.id,
    );
  }
});

test('hub entry packets are addressed by campaign beat and physical receiver', () => {
  const first = radioProgramFor({
    beatId: 'first_apartment',
    receiverId: 'apartment',
  });
  assert.equal(first.id, 'H-APT-01');
  assert.equal(first.targetSeconds, 300);
  assert.equal(first.policy, 'talkFirst');
  assert.equal(first.blocks[0].type, 'ident');
  assert.equal(first.blocks.at(-1).type, 'handoff');
  assert.equal(
    radioProgramFor({ beatId: 'first_apartment', receiverId: 'mansion_house' }),
    null,
  );
  assert.equal(new Set(RADIO_PROGRAMS.map((program) => program.id)).size, RADIO_PROGRAMS.length);
});

test('campaign state resolves repeat hubs to distinct entry packets', () => {
  const base = {
    scene: { id: 'apartment', spawn: 'wake' },
    story: { chapter: 'day_one' },
    missions: {
      jerky_motel: { status: 'locked' },
      bank_heist: { status: 'locked' },
      silver_pines: { status: 'locked' },
    },
    events: {},
  };
  assert.equal(campaignRadioContext(base, 'apartment').programId, 'H-APT-01');

  const afterMotel = structuredClone(base);
  afterMotel.scene.spawn = 'front_door';
  afterMotel.missions.jerky_motel.status = 'complete';
  assert.equal(campaignRadioContext(afterMotel, 'apartment').programId, 'H-APT-02');

  const afterTake = structuredClone(afterMotel);
  afterTake.missions.bank_heist.status = 'complete';
  assert.equal(campaignRadioContext(afterTake, 'apartment').programId, 'H-APT-03');
});

test('every physical receiver has an explicit campaign-news policy', () => {
  const ids = [
    'apartment', 'bing_car', 'countryside_cabin', 'beefrun_cockpit',
    'silver_pines_lead_cart', 'luxury_apartment', 'no_wake_cabin', 'mansion_house',
  ];
  assert.deepEqual(Object.keys(PHYSICAL_RADIO_RECEIVERS).sort(), ids.sort());
  for (const receiver of Object.values(PHYSICAL_RADIO_RECEIVERS)) {
    assert.match(receiver.campaignNews, /^(enabled|disabled)$/);
  }
});

test('every program references stable catalog songs, live ads, and a fixed show hour', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/music/manifest.json'), 'utf8'));
  const trackIds = manifest.tracks.map((track) => track.id);
  assert.equal(trackIds.every(Boolean), true);
  assert.equal(new Set(trackIds).size, trackIds.length);
  const songs = new Set(manifest.tracks.filter((track) => !track.cue).map((track) => track.id));
  const ads = new Set(STATIONS.flatMap((station) => (
    station.commercials ?? []
  )).filter((ad) => ad.live).map((ad) => ad.id));
  for (const program of RADIO_PROGRAMS) {
    assert.equal(Number.isFinite(program.showHour), true, `${program.id} has no fixed show hour`);
    for (const block of program.blocks) {
      if (block.type === 'song') assert.equal(songs.has(block.songId), true, `${program.id}: ${block.songId}`);
      if (block.type === 'ad') assert.equal(ads.has(block.adId), true, `${program.id}: ${block.adId}`);
    }
  }
});

test('the audit sheet is generated directly from the RadioProgram manifest', () => {
  const rows = buildRadioProgramRows(CAMPAIGN_SPINE);
  assert.equal(rows.length, CAMPAIGN_SPINE.length);
  const first = rows.find((row) => row['Beat ID'] === 'first_apartment');
  assert.equal(first['Program ID'], 'H-APT-01');
  assert.equal(first['Campaign news'], PHYSICAL_RADIO_RECEIVERS.apartment.campaignNews);
  assert.match(first['Block order'], /^ident:ident → show-intro:showIntro/);
  assert.equal(first['Song IDs'], 'good-ole-days → cosmic-drift');
});
