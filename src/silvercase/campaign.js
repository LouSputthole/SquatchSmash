const CHECKPOINT_BY_BEAT = Object.freeze({
  CAR_RIDE: 'car_ride',
  ARRIVE_HALLWAY: 'hallway',
  KNOCK: 'hallway',
  ENTER_APARTMENT: 'apartment',
  ESTABLISH_CONTROL: 'apartment',
  CASE_REVEAL: 'case_reveal',
  COUCH_SHOOTING: 'case_reveal',
  LOU_QUESTION: 'case_reveal',
  SQUATCH_PRAYER: 'bathroom_ambush',
  CHAIR_SHOOTING: 'bathroom_ambush',
  BATHROOM_AMBUSH: 'bathroom_ambush',
  AFTERMATH: 'aftermath',
  EXECUTE_WINSTON: 'aftermath',
  PICK_UP_CASE: 'case_recovered',
  EXIT: 'case_recovered',
  SCENE_COMPLETE: 'case_recovered',
});

const LOCAL_RESUME_BY_CHECKPOINT = Object.freeze({
  car_ride: 'car',
  hallway: 'hallway',
  apartment: 'room',
  /* The room fast-forward replays the reveal rather than asserting that a
   * couch search happened off-screen. */
  case_reveal: 'room',
  /* The mission's own death-retry baseline starts at the prayer and carries
   * every prerequisite for the bathroom ambush. */
  bathroom_ambush: 'prayer',
  aftermath: 'aftermath',
  case_recovered: 'case_recovered',
});

/** Translate the played FSM beat into the campaign's coarser save vocabulary. */
export function checkpointForSilverCaseBeat(beat) {
  return CHECKPOINT_BY_BEAT[beat] ?? null;
}

/** Map a campaign save token to the scene's established fast-forward path. */
export function silverCaseResumeCheckpoint(checkpoint, savedMission) {
  if (checkpoint === 'case_recovered' && savedMission !== undefined) {
    if (!['spared', 'player_killed', 'ape_killed'].includes(savedMission?.winstonOutcome)) {
      return 'aftermath';
    }
  }
  return LOCAL_RESUME_BY_CHECKPOINT[checkpoint] ?? null;
}

/** Build the cross-scene facts from the mission's own live ledger. */
export function silverCaseCampaignReport({ winstonAlive, flags = {} } = {}) {
  return {
    winstonOutcome: winstonAlive
      ? 'spared'
      : (flags.apeFinishedWinston === true ? 'ape_killed' : 'player_killed'),
    irritatedApe: flags.irritatedApe === true,
    apeFinishedChester: flags.apeFinishedChester === true,
    apeFinishedWinston: flags.apeFinishedWinston === true,
  };
}
