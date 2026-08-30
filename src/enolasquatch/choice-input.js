/**
 * The Fat Squatch choice owns its number key for the whole key-down event.
 *
 * Owner QA, 2026-08-28: "Selecting an option during the Fat Squatch bomb-drop
 * sequence is also causing the aircraft engines to shut down."
 *
 * `FlightInput` maps 1/2 to the two player-started engines and 3/4 to battery
 * and fuel. The shared browser policy deliberately offers a scene a
 * `beforeKeyDown` seam before it dispatches those controls. Keeping this
 * predicate pure and scene-local lets the choice consume that seam without
 * weakening the flight controls anywhere else (including Beef Run).
 *
 * @param {object} mission MissionController-compatible state/commands.
 * @param {string} code KeyboardEvent.code.
 * @returns {boolean} true only when an active choice accepted the key.
 */
export function consumeEnolaChoiceKey(mission, code) {
  const match = /^Digit([1-5])$/.exec(String(code ?? ''));
  if (!match || !mission) return false;
  const digit = match[1];

  if (mission.phase === 'release' && mission._releaseStep === 'awaitChoice') {
    return mission.chooseReleaseLine?.(digit) === true;
  }

  if (mission.phase === 'emergency' && !mission._emergencyResolved) {
    const response = { 1: 'baby', 2: 'push', 3: 'shutdown' }[digit];
    return response ? mission.chooseEmergencyResponse?.(response) === true : false;
  }

  return false;
}

/**
 * Retire Beef Run's bank-split trim from this mission.
 *
 * Owner QA, 2026-08-28: "The bracket interaction in particular appears to
 * cause unthrottling/throttle changes while the normal numbered progression
 * is missing." Enola's repaired emergency asks for the real common throttle
 * (`Z`) and gates on that exact value; the inherited, undisclosed bracket trim
 * changed only one bank after the visible lever moved. Consume it at the same
 * scene policy seam as the choice UI and normalize any stale checkpoint/input
 * state. Beef Run keeps its authored split-throttle mechanic.
 */
export function consumeRetiredEnolaSplitThrottleKey(flightInput, code) {
  if (code !== 'BracketLeft' && code !== 'BracketRight') return false;
  if (flightInput) {
    flightInput.throttleSplit = 0;
    flightInput.key?.(code, false);
  }
  return true;
}
