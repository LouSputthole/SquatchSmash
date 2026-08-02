/**
 * Pick one useful final-approach correction. The three high calls form a
 * sequence, not an endless bark pool: once Lou has said the punch line he
 * leaves the pilot enough quiet to fix the approach.
 */
export function selectApproachCall({
  height,
  wantHeight,
  toGo,
  ias,
  approachCalls = 0,
  highFinalSeen = false,
}) {
  let call = null;
  let nextCalls = approachCalls;

  if (height > wantHeight * 2.1 && toGo < 1400) {
    nextCalls++;
    if (nextCalls === 1) call = 'approach.high';
    else if (nextCalls === 2) call = 'approach.high2';
    else if (!highFinalSeen) call = 'approach.high3';
  } else if (height < wantHeight * 0.45 && toGo < 1200) call = 'approach.low';
  else if (ias < 62 && toGo < 1600) call = 'approach.slow';
  else if (ias > 105 && toGo < 1200) call = 'approach.fast';
  else if (height < 22 && toGo < 260) call = 'approach.flare';

  return { call, approachCalls: nextCalls };
}
