import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Silver Case restores durable progress or its completion card only after Start', () => {
  const source = read('../src/silvercase/main.js');
  const previewParser = source.slice(
    source.indexOf('function previewCheckpointForLocation'),
    source.indexOf('const silverCaseCampaign ='),
  );
  const begin = source.slice(source.indexOf('async function beginScene()'));

  assert.match(previewParser, /if \(!isPreviewMode\(locationLike\)\) return null;/,
    'a bare checkpoint query bypasses the durable campaign');
  assert.match(begin, /restoreCompletedFinalArcEntry\(campaignEntry,[\s\S]*showSilverCaseCompletion/,
    'an already-complete reload does not restore the established card');
  assert.match(begin, /silverCaseResumeCheckpoint\([\s\S]*campaignEntry\.checkpoint,[\s\S]*silverCaseCampaign\.story\?\.mission/,
    'a resumed campaign ignores its saved checkpoint');
  assert.match(begin, /jumpToPreviewCheckpoint\(resumeCheckpoint(?:,|\))/,
    'the saved token does not use the scene’s playable fast-forward');
});

test('Silver Case reload carries the finalized outcome facts into local staging', () => {
  const source = read('../src/silvercase/main.js');

  assert.match(source, /silverCaseCampaign\.checkpoint\(checkpoint,\s*silverCaseCampaignReport\(/,
    'the case-recovered checkpoint drops the finalized Winston branch');
  assert.match(source, /flags\.irritatedApe \|\|= savedMission\?\.irritatedApe === true;/,
    'reload drops the saved Ape relationship state');
  assert.match(source, /flags\.apeFinishedChester \|\|= savedMission\?\.apeFinishedChester === true;/,
    'reload drops who executed Chester');
  assert.match(source, /flags\.apeFinishedWinston \|\|= savedMission\?\.apeFinishedWinston === true;/,
    'reload drops who executed Winston');
  assert.match(source, /!\['spared', 'player_killed', 'ape_killed'\]\.includes\(savedMission\?\.winstonOutcome\)[\s\S]*fsm\.go\(S\.AFTERMATH\)/,
    'a legacy unknown branch is silently staged as a spared Winston');
});

test('Silent Squatch restores its saved beat through the real mission replay ladder', () => {
  const source = read('../src/mansion/main.js');
  const begin = source.slice(
    source.indexOf('async function beginTour()'),
    source.indexOf("startBtn.addEventListener('click', beginTour)"),
  );
  const urlEntry = source.slice(
    source.indexOf('const params = new URLSearchParams(window.location.search)'),
    source.indexOf('window.mansion ='),
  );

  assert.match(begin, /mansionCampaignEntry\.resumed[\s\S]*jumpToCheckpoint\(mansionCampaignEntry\.checkpoint\)/,
    'the normal reload restarts at the gate instead of its saved mission beat');
  assert.match(urlEntry, /if \(mansionPreview && wanted && CHECKPOINTS\[wanted\]\)/,
    'a bare Mansion checkpoint URL bypasses the durable campaign');
});

test('Enola restores its saved flight or established FlightHud completion card', () => {
  const source = read('../src/enolasquatch/main.js');
  const missionSource = read('../src/enolasquatch/mission/MissionController.js');
  const begin = source.slice(
    source.indexOf("startBtn.addEventListener('click'"),
    source.indexOf('let dragLook = false'),
  );

  assert.match(begin, /restoreCompletedFinalArcEntry\(campaignEntry,[\s\S]*showEnolaCompletion/,
    'the completed reload leaves the existing FlightHud card hidden');
  assert.match(begin, /enolaCompletionReportFromSave/,
    'the completion card invents data instead of rebuilding the durable facts');
  assert.match(source, /enolaCampaign\.checkpoint\(id,[\s\S]*checkpointSnapshot: snapshot/,
    'the scene drops MissionController\'s score, fuel and damage snapshot');
  assert.match(begin, /enolaResumePlan\(campaignEntry\.checkpoint, campaignEntry\.checkpointSnapshot\)/,
    'the resumed flight ignores its saved campaign checkpoint');
  assert.match(begin, /mission\.checkpointData = resumePlan\.checkpointData;[\s\S]*go\(resumePlan\.phase\)/,
    'the saved token does not use Enola\'s real checkpoint restore path');
  assert.match(missionSource, /_checkpointTargetingRestore[\s\S]*targeting\.restoreCheckpoint[\s\S]*targeting\.checkpoint\(\)/,
    'checkpoint phase entry resets the durable corridor accumulator');
});

test('Mansion Siege restores its saved fight or established completion card', () => {
  const source = read('../src/mansion/siege/main.js');
  const begin = source.slice(
    source.indexOf('async function beginSiege()'),
    source.indexOf("startBtn.addEventListener('click', beginSiege)"),
  );

  assert.match(source, /const siegeCampaignPreview = isPreviewMode\(\);/,
    'a bare Siege checkpoint query bypasses the durable campaign');
  assert.match(source, /const startCheckpoint = siegeCampaignPreview \? requestedCheckpoint\(\) : null;/,
    'ordinary campaign entry still consumes the URL checkpoint');
  assert.match(begin, /restoreCompletedFinalArcEntry\(campaignEntry,[\s\S]*showMissionCard/,
    'the completed reload leaves the Continue card hidden');
  assert.match(begin, /campaignEntry\.resumed[\s\S]*campaignEntry\.checkpoint/,
    'the resumed siege ignores its durable checkpoint');
  assert.match(begin, /jumpToCheckpoint\(entryCheckpoint\)/,
    'the saved token does not use the scene’s real beat replay');
});
