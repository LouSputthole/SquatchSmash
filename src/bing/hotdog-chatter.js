import {
  HOTDOG_ATTACK_REACTIONS,
  HOTDOG_CLEANUP_CHATTER,
  HOTDOG_PARTY_CHATTER,
  hotDogBeatReactionLine,
} from './hotdog-room-voices.js';

/**
 * The voice of the room, around the authored sequence.
 *
 * The closed party used to be silent until Hog Mama's set started and silent
 * again from the last hit to the end of the cleanup. This drives the overheard
 * conversations, the reactions to the beating and the cleanup floor, under one
 * rule: the director owns the room whenever it is speaking or about to, and
 * nothing in here is ever allowed to talk over an authored beat.
 *
 * `state.director` is that gate. There is deliberately no second flag — a
 * separate "is the cutscene running" boolean is exactly the thing that drifts
 * out of step with the sequence and leaves a party guest heckling a murder.
 */

/** How close the player has to be to overhear a conversation, in metres. */
const OVERHEAR_RANGE = 9.5;
/** Quiet between conversations. The room is meant to breathe, not to chatter. */
const AMBIENT_GAP = [5.5, 9.5];
/** Quiet between the lines of one conversation, so it reads as a back-and-forth. */
const LINE_GAP = 0.34;

function distanceTo(actor, position) {
  if (!actor) return Infinity;
  const dx = actor.position.x - position.x;
  const dz = actor.position.z - position.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function createHotDogChatter({
  player,
  hud,
  state,
  sequence,
  mission,
  speakerActor,
  playCue,
  cueSeconds = () => 0,
  random = Math.random,
} = {}) {
  /** The line being said right now, and how long is left of it. */
  let speaking = null;
  let remaining = 0;
  /** The rest of the conversation or burst currently in flight. */
  let pending = [];
  /** Whole conversations waiting for the director to hand the room back. */
  const waiting = [];
  let gap = AMBIENT_GAP[0];
  let lastConversation = null;
  const heard = { party: new Set(), cleanup: new Set() };

  function directorIsSpeaking() {
    return !!state.director.current;
  }

  /**
   * How much uninterrupted silence a queued line can have, in seconds.
   *
   * `Infinity` means the director has parked -- it is waiting for the attack
   * to finish or for the body to be loaded -- and the room may talk for as
   * long as it likes. A finite number is the authored gap after the beat that
   * just ended, and a line only starts if it fits inside it. That is what
   * keeps a reaction inside the pause it was written for instead of being cut
   * off two words in by the next beat.
   */
  function silenceAvailable() {
    const d = state.director;
    if (d.current) return 0;
    if (!d.running || d.waitingForAttack) return Infinity;
    const next = sequence[d.index];
    if (!next) return Infinity;
    if (next.phase === 'handoff' && !d.handoffReady) return Infinity;
    return Math.max(0, d.gapRemaining);
  }

  function ambientGap() {
    return AMBIENT_GAP[0] + random() * (AMBIENT_GAP[1] - AMBIENT_GAP[0]);
  }

  function lineSeconds(entry) {
    return Math.max(entry.seconds ?? 2.4, cueSeconds(entry.cue) + 0.3);
  }

  function speakLine(entry) {
    const seconds = lineSeconds(entry);
    const actor = speakerActor?.(entry.who) ?? null;
    if (actor) {
      const listener = entry.toward ? speakerActor?.(entry.toward) : null;
      if (listener && listener !== actor) actor.faceToward(listener.position.x, listener.position.z);
      else actor.faceToward(player.position.x, player.position.z);
    }
    /* The cue first, then the mouth: `playCue` hands back the take and the
     * mouth is driven by it (src/core/mouth.js), so the order matters. */
    const take = playCue?.(entry.cue) || null;
    actor?.say(Math.max(1.4, seconds), take);
    hud.say(`<em>${entry.who}:</em> ${entry.line}`, Math.round(seconds * 1000));
    speaking = entry;
    remaining = seconds;
    return seconds;
  }

  /** Returns how long the first line runs for, so a caller can follow it. */
  function start(lines) {
    const [first, ...rest] = lines;
    if (!first) return 0;
    pending = rest;
    return speakLine(first);
  }

  function chatterFor(phase) {
    return phase === 'cleanup' ? HOTDOG_CLEANUP_CHATTER : HOTDOG_PARTY_CHATTER;
  }

  /**
   * Which pool of overheard conversation belongs to the current moment.
   *
   * Mission state, not a local copy of it: the party pool stops the instant the
   * player starts Hog Mama's set, and the cleanup pool only exists once there
   * is something to clean up.
   */
  function ambientPhase() {
    if (mission.state === 'party') return 'party';
    if (mission.state === 'cleanup' || mission.state === 'body-ready') return 'cleanup';
    return null;
  }

  function pickConversation(phase) {
    const pool = chatterFor(phase);
    const used = heard[phase];
    if (used.size >= pool.length) used.clear();
    let best = null;
    let bestDistance = OVERHEAR_RANGE;
    for (const conversation of pool) {
      if (used.has(conversation.id) || conversation.id === lastConversation) continue;
      const distance = distanceTo(speakerActor?.(conversation.lead), player.position);
      if (distance <= bestDistance) {
        best = conversation;
        bestDistance = distance;
      }
    }
    return best;
  }

  function beginConversation(conversation, phase) {
    heard[phase].add(conversation.id);
    lastConversation = conversation.id;
    start(conversation.lines);
  }

  function enqueue(lines) {
    if (!Array.isArray(lines) || !lines.length) return;
    waiting.push([...lines]);
    /* Cancel whatever ambient quiet was still running. Everything reaching
     * this queue is a reaction to something that just happened, and a reaction
     * that waits out a nine-second pause first is not one. */
    gap = Math.min(gap, LINE_GAP);
  }

  return {
    /** Exposed so a browser check can assert the room actually has a voice. */
    get speaking() { return speaking; },
    get queued() { return waiting.length; },
    get heardParty() { return [...heard.party]; },
    get heardCleanup() { return [...heard.cleanup]; },

    /**
     * Queue a conversation for the first moment the room is handed back.
     * Nothing queued is ever dropped, which is why the attack's reactions can
     * be authored as one list and still come out either side of the aftermath.
     */
    queue: enqueue,

    /** What somebody says in the pause after an authored beat provokes them. */
    reactToBeat(reaction) {
      const answer = hotDogBeatReactionLine(reaction);
      if (answer) enqueue([answer]);
    },

    /** The room finding its voice while Ape is working, and afterwards. */
    startAttackReactions() {
      enqueue(HOTDOG_ATTACK_REACTIONS);
    },

    /**
     * The player walked up to somebody and pressed the button, so that person
     * takes the room off whoever had it. Ambient chatter is background; a
     * conversation the player asked for is not.
     *
     * Returns the spoken length, so a caller that owes the screen a checklist
     * or a button can put it up when the line has finished rather than on top
     * of it.
     */
    interrupt(lines) {
      const entries = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
      if (!entries.length) return 0;
      pending = [];
      gap = AMBIENT_GAP[0];
      return start(entries);
    },

    update(dt) {
      if (speaking) {
        /* The director taking the room mid-sentence stops the sentence. It
         * does not stop the conversation: the rest of it is dropped rather
         * than queued, because half an overheard exchange replayed twenty
         * seconds later reads as a glitch, not as a party. */
        if (directorIsSpeaking()) {
          speaking = null;
          remaining = 0;
          pending = [];
          /* Take the half-said line off the screen too. The authored beat has
           * its own dialogue box, and leaving an overheard subtitle sitting
           * under it for the rest of its four seconds reads as two people
           * talking at once, which is the thing this gate exists to prevent. */
          hud.say('', 1);
          return;
        }
        remaining -= dt;
        if (remaining > 0) return;
        speaking = null;
        /* Inside a conversation the next line follows a beat later; once the
         * conversation is finished the room goes quiet for a while, or the
         * party turns into a radio play. */
        gap = (pending.length || waiting.length) ? LINE_GAP : ambientGap();
      }

      gap -= dt;
      if (gap > 0) return;

      const silence = silenceAvailable();
      if (silence <= 0) return;

      if (pending.length) {
        const next = pending[0];
        if (lineSeconds(next) > silence) return;
        pending = pending.slice(1);
        speakLine(next);
        return;
      }

      if (waiting.length) {
        const next = waiting[0][0];
        if (lineSeconds(next) > silence) return;
        start(waiting.shift());
        return;
      }

      if (silence !== Infinity) return;
      const phase = ambientPhase();
      if (!phase) return;
      const conversation = pickConversation(phase);
      /* Nobody within earshot is not a reason to go quiet for ten seconds --
       * the player is walking, and the room he is walking into should be
       * talking when he gets there. */
      gap = conversation ? ambientGap() : 1.5;
      if (conversation) beginConversation(conversation, phase);
    },
  };
}
