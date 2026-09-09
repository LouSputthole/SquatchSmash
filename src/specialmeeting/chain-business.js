/**
 * SM-260 — the chain, actually performed.
 *
 * The script's stage direction has always been exact: *"The car stops.
 * Headlights on a rusted chain strung across the track between two posts. Lag
 * gets out without being asked, unhooks it, drops it in the dirt, gets back
 * in. The car goes through. Lag gets out again, hooks the chain back up BEHIND
 * them, and gets back in. Nobody says one word about any of this."* None of it
 * was staged: the chain prop has had `setOpen()` since it was built and nothing
 * ever called it, so the car braked to a halt in front of a strung chain,
 * nobody moved, nothing sounded, and when the ride released it drove straight
 * through the links. Measured 2026-09-09 by stepping these same modules
 * against the delivered take lengths, the car sat dead at that stop for 43
 * game seconds on the quiet path and 89 on a chatty one — the owner's *"real
 * long awkward pause ... I think you are supposed to be waiting on the gate
 * to open, but ... people think the game broke."*
 *
 * This module is the missing performance, in the shape `ride.js` set: a
 * renderer-free clock that owns WHEN and IN WHAT ORDER, asking for every
 * physical effect through a callback so the whole business can be played in a
 * test with nothing rendered. One walk simplification is deliberate: the
 * script has Lag get back in between the unhook and the rehook, but a man who
 * has to hook the chain up again eight metres on would not — he drops it,
 * steps to the post, lets the car idle through, hooks it up behind, and walks
 * after the car. Same beats, one fewer teleport, and it gives the overrun a
 * face: while the cabin conversation runs long, Lag is the man visibly waiting
 * at the gate he just closed (on his phone — SM-261 says that is where he
 * lives), not a parked car doing nothing.
 *
 * External truth stays external: the caller reports when the car has stopped
 * (`begin`), when its tail has cleared the chain (`carCleared`), when the
 * story has reached the chain beat (`storyAtChain`), and when the ride wants
 * the road back (`requestDepart`). Everything here is real time — the campaign
 * clock is never touched.
 */

/**
 * Seconds per leg, measured against what each depicts rather than guessed:
 * the door-to-post walk is ~6.5 m at an unhurried 2.5 m/s, the walk back is
 * longer because the car has idled ~14 m through the gap by then, and the two
 * chain handlings are the length of the `boat.ballast.chain` rattle that
 * plays under them.
 */
export const CHAIN_BUSINESS_TIMING = Object.freeze({
  settle: 0.9, // the car rocks to rest; nobody moves yet
  door: 0.7, // the rear door opens before a body appears
  toGate: 2.6, // door to the near post, through the headlight beams
  unhook: 1.6, // hands on the hook; ends with the links in the dirt
  rehook: 1.6, // the same hands, the other direction, behind the car
  back: 3.4, // post to wherever the car idled to
  board: 0.7, // in, and the door shuts
});

/** The one order the beat allows. `waiting` and `aboard` hold indefinitely. */
export const CHAIN_BUSINESS_PHASES = Object.freeze([
  'idle', // before the car has stopped at the chain
  'settle', 'door', 'to_gate', 'unhook', // Lag out and the chain down
  'through', // the car idles through; Lag stands at the post
  'rehook', // the tail is clear; the chain goes back up
  'waiting', // Lag at the closed gate until the story reaches SM-260
  'back', 'board', // he walks after the car and gets in
  'aboard', // everyone seated, holding for the ride's release
  'done',
]);

/** The synthetic road-style milestone SM-260's gate waits on. */
export const CHAIN_REHOOKED_MILESTONE = 'chain_rehooked';

export function createChainBusiness({
  onDoor = null, // (open: boolean) a rear door sounds
  onLagOut = null, // put Lag on the ground at the rear door
  onLagMove = null, // (t: 0..1, leg: 'to_gate' | 'back') he is walking
  onLagIn = null, // back in his seat
  onChainOpen = null, // the links go down in the dirt
  onChainClosed = null, // and back up between the posts
  onCreep = null, // the car may idle through the open gap
  onMilestone = null, // (id) the rehook, for the ride's gate
  onDepart = null, // everything is aboard and the ride said go
} = {}) {
  let phase = 'idle';
  let clock = 0;
  let storyArrived = false;
  let departRequested = false;
  let departed = false;

  function enter(next) {
    phase = next;
    clock = 0;
  }

  function maybeDepart() {
    if (phase !== 'aboard' || !departRequested || departed) return;
    departed = true;
    enter('done');
    onDepart?.();
  }

  const business = {
    get phase() { return phase; },
    get started() { return phase !== 'idle'; },
    get lagOutside() {
      return ['to_gate', 'unhook', 'through', 'rehook', 'waiting', 'back'].includes(phase);
    },

    /** The car has physically stopped at the chain (`waitingAt === 'chain'`). */
    begin() {
      if (phase !== 'idle') return business;
      enter('settle');
      return business;
    },

    /** The car's tail is past the chain line; it is safe to hook it back up. */
    carCleared() {
      if (phase !== 'through') return business;
      enter('rehook');
      return business;
    },

    /** The ride has entered SM-260: Lag has stood at the gate long enough. */
    storyAtChain() {
      storyArrived = true;
      if (phase === 'waiting') enter('back');
      return business;
    },

    /** SM-270. Resume only once everybody is actually in the car. */
    requestDepart() {
      departRequested = true;
      if (phase === 'idle') {
        /* Nothing was ever staged here — a restored save, or a route change
         * that removed the stop. The release must still release. */
        departed = true;
        enter('done');
        onDepart?.();
        return business;
      }
      if (phase === 'waiting') enter('back');
      maybeDepart();
      return business;
    },

    update(dt) {
      const step = Math.max(0, Number(dt) || 0);
      if (step <= 0 || phase === 'idle' || phase === 'done') return business;
      clock += step;
      const t = CHAIN_BUSINESS_TIMING;
      switch (phase) {
        case 'settle':
          if (clock >= t.settle) { enter('door'); onDoor?.(true); }
          break;
        case 'door':
          if (clock >= t.door) { enter('to_gate'); onLagOut?.(); }
          break;
        case 'to_gate':
          onLagMove?.(Math.min(1, clock / t.toGate), 'to_gate');
          if (clock >= t.toGate) enter('unhook');
          break;
        case 'unhook':
          if (clock >= t.unhook) {
            onChainOpen?.();
            enter('through');
            onCreep?.();
          }
          break;
        case 'through':
          /* Held open until the caller reports the tail clear. */
          break;
        case 'rehook':
          if (clock >= t.rehook) {
            onChainClosed?.();
            onMilestone?.(CHAIN_REHOOKED_MILESTONE);
            enter(storyArrived || departRequested ? 'back' : 'waiting');
          }
          break;
        case 'waiting':
          /* Lag at the closed gate, on his phone, for as long as the cabin
           * conversation runs. `storyAtChain()` or `requestDepart()` ends it. */
          break;
        case 'back':
          onLagMove?.(Math.min(1, clock / t.back), 'back');
          if (clock >= t.back) { enter('board'); onLagIn?.(); onDoor?.(false); }
          break;
        case 'board':
          if (clock >= t.board) { enter('aboard'); maybeDepart(); }
          break;
        default:
          break;
      }
      return business;
    },

    snapshot() {
      return Object.freeze({
        phase, clock, storyArrived, departRequested, departed,
      });
    },
  };

  return business;
}
