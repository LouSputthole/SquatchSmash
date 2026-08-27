/**
 * MANSION UNDER SIEGE -- everything anybody says, and the runner that says it.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT EXISTS *NOW*.
 *
 * The mission shipped playable and unfinishable. `mission.js` has always had
 * `briefingEnded()`, `aftermathEnded()` and `metSasole()` on it; nothing in
 * the scene ever called any of them. Walking into Lou's office put the player
 * in BRIEFING -- objective null, so the HUD went blank -- and left him there,
 * in a room with sixteen armed people, with no line spoken, nothing to press
 * and no way forward. Clearing wave two did the same thing again at the other
 * end. Both were reachable only through the debug handle a verifier drives,
 * which is exactly the shape docs/ENGINE-TRAPS.md #5 calls "a gate that lies":
 * every beat had a test and no beat had a player.
 *
 * So the conversations are written here, the runner that plays them is here,
 * and `main.js` calls the mission methods when a sequence finishes. A beat
 * that nothing can leave is now impossible to build, because leaving it is
 * what the end of a sequence DOES.
 *
 * ## THE CUE NAMES ARE `vo.siege.*` AND THAT IS NOT COSMETIC
 *
 * docs/ENGINE-TRAPS.md #8: `AudioEngine.play()` puts an `AnalyserNode` inline
 * on every cue whose name starts with `vo.` and `src/core/mouth.js` opens the
 * mouth on its RMS. A spoken line named anything else gets no analyser, so
 * every mouth in the room falls back to the synthetic envelope -- a flap on a
 * clock, which is the entire fault that entry was written about. The scene's
 * one existing spoken cue was `siege.prospect.little_friend`; it is
 * `vo.siege.prospect.little_friend` now. Nothing was lost renaming it: it had
 * never been in the manifest, so it had never been recorded.
 *
 * And ENGINE-TRAPS.md #3, which is the other half: a scene with no VO
 * generator is invisible however much is written for it. `tools/siege-vo.mjs`
 * reads `allSiegeLines()` below, `npm run vo:sync` runs it, and
 * `tests/mansion-siege-voice.test.mjs` fails if the two ever disagree. The
 * lines reach the recording sheet the day they are written or the build goes
 * red.
 *
 * ## NOTHING HERE TAKES CONTROL AWAY
 *
 * PART V of the brief is explicit that the family keeps fighting through the
 * briefing, and PART VI that control never leaves the player for the line. So
 * a sequence is subtitles and audio over live gameplay, never a camera move
 * and never a lock. The only thing a sequence does to the mission is finish.
 */
import { WEAPON_IDS } from '../../core/weapons/catalog.js';
import {
  SPEECH_GAIN,
  SPEECH_MIX_CLOSE,
  SPEECH_MIX_INDOORS,
  speak,
} from '../../core/dialogue.js';


/**
 * Speaker -> voice profile in `assets/sfx/manifest.json`.
 *
 * `lou` is `lou1`, Big Uncle Lou Sputthole. `sasole` is `lou2`, Captain Lou
 * Sasole. They are two men with two photographs and two performers, and
 * `src/mansion/siege/ensemble.js` carries the same warning over the same two
 * ids. Merging them is the one mistake this cast makes if nobody is looking.
 */
export const SIEGE_VOICES = Object.freeze({
  prospect: 'player',
  lou: 'lou1',
  sasole: 'lou2',
  /* The cold A-Team voice already cast for messages delivered and promises
   * kept. This is a caller, not another body on the landing. */
  ateam_caller: 'ateam3',
  booski: 'booski',
  guard: 'mansion-guard',
  deathmegatron: 'deathmegatron',
});

/** Display names, for the subtitle's speaker tag. */
export const SIEGE_SPEAKER_NAMES = Object.freeze({
  prospect: 'The Prospect',
  lou: 'Big Uncle Lou',
  sasole: 'Captain Lou Sasole',
  ateam_caller: 'A-Team Caller',
  booski: 'Booski',
  guard: 'Mansion guard',
  deathmegatron: 'Deathmegatron',
});

export const SIEGE_CUE_PREFIX = 'vo.siege.';

/**
 * How long a subtitle stays up, when the line has no recording behind it.
 *
 * An authored guess, and named as one -- see ENGINE-TRAPS #8 on `hold`. When
 * the takes land the runner uses the buffer's own duration instead, which is
 * what `audio.play()` hands back, so this number stops mattering the moment
 * the file exists rather than staying wrong forever.
 */
export function readingSeconds(say) {
  const words = String(say).trim().split(/\s+/).filter(Boolean).length;
  return Math.min(7, Math.max(1.6, 1.1 + words * 0.34));
}

const say = (id, speaker, text, extra = {}) => Object.freeze({
  id,
  name: `${SIEGE_CUE_PREFIX}${id}`,
  speaker,
  voice: SIEGE_VOICES[speaker],
  say: text,
  seconds: extra.seconds ?? readingSeconds(text),
  ...extra,
});

/**
 * The attack stops and the telephone starts. Reuse the same real ringtone and
 * pickup the campaign's Phone uses; loop it only long enough for Lou to answer
 * instead of letting a whole recorded ring cycle talk over him.
 */
const AFTERMATH_PHONE_RING = Object.freeze({
  cue: 'phone.ring',
  answerCue: 'phone.pickup',
  seconds: 1.2,
  volume: 0.42,
});

/* ================================================================== */
/* THE SEQUENCES                                                        */
/*                                                                       */
/* Keyed by the moment that plays them. Order inside a sequence is the    */
/* order they are spoken; the runner advances on its own clock.           */
/* ================================================================== */
export const SEQUENCES = Object.freeze({
  /**
   * On his feet in the guest room, before he has opened the door.
   *
   * The brief's opening is deliberately information-free -- PART II, "the
   * confusion is structural rather than scripted" -- so this is two lines and
   * neither of them explains anything. The guidance arrives one room later,
   * from somebody who can see what is happening.
   */
  wake: Object.freeze([
    say('wake.prospect.awake', 'prospect', 'Okay. Okay — that is not the television.'),
    say('wake.guard.inside', 'guard', 'They are inside! They are in the house — get to the armory!'),
  ]),

  /**
   * Booski on the house radio, once, as the player reaches the corridor.
   *
   * THIS IS THE FIX FOR THE "WHERE AM I GOING" PROBLEM and it is written as
   * a character rather than as a HUD string on purpose: the objective card
   * says *what*, the hint line under it says *which way*, and Booski says it
   * out loud so a player who is looking at the corridor and not at the HUD
   * still gets it. Three channels, one instruction.
   */
  guide_armory: Object.freeze([
    say('guide.booski.armory', 'booski',
      'Kid — armory. East end of the cellar hall, then south through the door. Move.'),
  ]),

  /** The moment the rack has given him a weapon. */
  guide_office: Object.freeze([
    say('guide.booski.office', 'booski',
      'Now get up here. Basement stair, straight over the foyer, up the horseshoe — Lou is on the top floor.'),
  ]),

  /**
   * PART V. The player reports in, Lou confirms a full assault, Booski says
   * more are coming up the front grounds, the family takes the upper floor,
   * and Lou puts the Prospect on the stairs.
   *
   * "It does not spend a single campaign secret." Nothing below names Sauce,
   * Mark, the cartel's reach or the bombing. Lou does not know any of it yet
   * and neither does anybody else in the room.
   */
  briefing: Object.freeze([
    say('briefing.prospect.report', 'prospect', 'Lou. There were two of them in the cellar.'),
    say('briefing.lou.forty', 'lou', 'Two in the cellar. There are forty on my lawn.'),
    say('briefing.booski.drive', 'booski',
      'More coming up the drive — both sides of the fountain, they are not even hurrying.'),
    say('briefing.lou.upstairs', 'lou',
      'Everybody upstairs. Nobody holds a ground-floor room tonight, I do not care whose room it is.'),
    say('briefing.lou.stairs', 'lou',
      'You. Take the rail over the foyer. Anything that comes through my front door, you put it down on my floor.'),
    say('briefing.prospect.stairs', 'prospect', 'The stairs. Got it.'),
    say('briefing.lou.heavy', 'lou',
      'And get the big one up. You did not carry it out of my armory to look at it.'),
  ]),

  /** Once, ever. PART VI. */
  little_friend: Object.freeze([
    say('prospect.little_friend', 'prospect', 'Say hello to my little friend.', {
      /* This is the siege payoff, not another conversational line. The named
       * flag lets the scene hold weapon reports and give the subtitle its own
       * visual weight for exactly the recording's measured duration. */
      gain: 1.5,
      protected: true,
      priority: 'hero',
    }),
  ]),

  /**
   * THE LULL, AND WHY IT GETS A LINE.
   *
   * A quiet balcony reads as "is it over?" and a player who thinks a fight is
   * over walks away from his own firing step. The brief calls this beat "a
   * breath, not a tea ceremony"; the breath needs somebody in it saying the
   * next group is forming up, or the nine seconds are indistinguishable from
   * the end of the mission.
   */
  lull: Object.freeze([
    say('lull.booski.reload', 'booski',
      'That is the first lot! Reload — they are forming up again on the drive!'),
    say('lull.lou.notover', 'lou', 'It is not over. Watch that door.'),
  ]),

  /** The one time the fight comes through the wings instead of the door. */
  flank: Object.freeze([
    say('flank.deathmegatron.glass', 'deathmegatron',
      'Glass! West wing and east — they are coming in behind us!'),
  ]),

  /**
   * PART IX. Lou comes to the landing.
   *
   * Its job, verbatim from the brief: confirm the attack is stopped,
   * establish that the cartel is bigger than anyone thought, and hand the
   * Prospect to Captain Sasole. It does not explain who sent them, because
   * nobody in this house knows yet and the next three missions are about
   * finding out.
   */
  aftermath: Object.freeze([
    /* Owner, 2026-08-27: the post-siege Taken-style parody is Lou speaking
     * directly to the A-Team before he sends the Prospect to Sasole. Play it
     * straight. Recognition comes from the calm threat over a telephone, not
     * from lifting the film's wording or having anybody acknowledge the joke. */
    say('aftermath.call.lou.answer', 'lou', 'Sputthole.', {
      leadIn: AFTERMATH_PHONE_RING,
      direction: 'Dry and immediate into the receiver. One word; no greeting and no uncertainty.',
    }),
    say('aftermath.call.ateam.walk', 'ateam_caller',
      'Walk away. Keep what family you have left.', {
        remote: true,
        direction: 'Cold telephone threat. He believes he is offering mercy, not performing menace.',
      }),
    say('aftermath.call.lou.terms', 'lou',
      'You sent twenty-two men into my home, and now you are offering me terms.', {
        direction: 'Level and incredulous without raising his voice. The bodies are still around him.',
      }),
    say('aftermath.call.ateam.more', 'ateam_caller',
      'We can send twenty-two more. The A-Team does not stop because a house was expensive.', {
        remote: true,
        direction: 'Matter-of-fact and completely serious about the A-Team. No wink in the house line.',
      }),
    say('aftermath.call.lou.trade', 'lou',
      'You know my name and my address. I know your voice. That is an uneven trade.', {
        direction: 'Quiet calculation. This is when Lou stops reacting and starts hunting.',
      }),
    say('aftermath.call.ateam.family', 'ateam_caller',
      'You will learn what happens when the A-Team comes for your family.', {
        remote: true,
        direction: 'A promise delivered flatly over the telephone. Proud of the crew, deadly serious.',
      }),
    say('aftermath.call.lou.not-home', 'lou',
      'No. You are going to learn what happens when I stop waiting at home.', {
        endCue: 'phone.hangup',
        endCueVolume: 0.58,
        direction: 'Final and controlled. Hang up at the end; the decision to counterstrike is made.',
      }),
    say('aftermath.lou.last', 'lou', 'That is the last of them. Somebody kill that alarm.'),
    say('aftermath.lou.house', 'lou',
      'They came to my house. With cars, and a plan, and enough men to spare four of them for a window.'),
    say('aftermath.lou.budget', 'lou',
      'This is not a neighbourhood thing any more, kid. This is somebody with a budget.'),
    say('aftermath.lou.sasole', 'lou',
      'There is a man on my landing in a flight jacket. Captain Lou Sasole. Go and talk to him — he is how we answer this.'),
    say('aftermath.prospect.sasole', 'prospect', 'Sasole. Right.'),
  ]),

  /** The handoff, and the end of this mission. */
  sasole: Object.freeze([
    say('sasole.sasole.stairs', 'sasole',
      'You are the one who held the stairs. Good. Then you can hold a bomb bay.'),
    /* The siege ENDS at first light (campaign clock: Day 6, 6:10 AM), and the
     * Enola raid flies in the dark -- so Sasole promises a NIGHT flight. The
     * 2:00 PM travel row in docs/CAMPAIGN-TIMELINE.md is the drive and the
     * aircraft prep; wheels-up follows, in full dark. */
    say('sasole.sasole.tonight', 'sasole',
      'Get some sleep. We fly tonight, and you are coming with me.'),
  ]),
});

/** Keep the recorded heavy order truthful without shortening other briefings. */
export function briefingLinesForWeapon(weaponId) {
  if (weaponId === WEAPON_IDS.SAW) return SEQUENCES.briefing;
  return SEQUENCES.briefing.filter((line) => line.id !== 'briefing.lou.heavy');
}

/** Every recordable line in the mission, flat, in authored order. */
export function allSiegeLines() {
  const out = [];
  for (const [sequence, lines] of Object.entries(SEQUENCES)) {
    for (const line of lines) out.push({ ...line, sequence });
  }
  return out;
}

/** The cue names, in order. Handy for `audio.loadManifest({ names })`. */
export function siegeVoiceCueNames() {
  return allSiegeLines().map((line) => line.name);
}

/** Non-dialogue cues embedded in the authored sequences, in first-use order. */
export function siegeDialogueEffectCueNames() {
  const names = [];
  const add = (name) => {
    if (typeof name === 'string' && name && !names.includes(name)) names.push(name);
  };
  for (const line of allSiegeLines()) {
    add(line.leadIn?.cue);
    add(line.leadIn?.answerCue);
    add(line.endCue);
  }
  return names;
}

/**
 * Plays one sequence at a time over live gameplay.
 *
 * DELIBERATELY NOT `DialogueController`. The three in this repo
 * (`src/mansion/mission/`, `src/silvercase/`, `src/squatchfather/`) each own a
 * camera, a speaker rig and a choice system, and this mission wants none of
 * the three: the player is holding a machine gun the whole time. What is left
 * after taking those out is a queue and a clock, which is this.
 *
 * `onLeadIn` gets the deliberate silence before a line (the aftermath phone
 * ring), `onLine` gets every line as it starts, and `onDone` fires once when
 * the last one's hold expires. `onDone` is where the mission advances, so a
 * sequence that cannot finish is a beat that cannot be left -- and that is a
 * loud failure rather than the silent one this file was written to remove.
 */
export class SiegeDialogue {
  constructor({
    audio = null,
    resolveSpeaker = null,
    onLeadIn = null,
    onLine = null,
    onDone = null,
  } = {}) {
    this.audio = audio;
    this.resolveSpeaker = resolveSpeaker;
    this.onLeadIn = onLeadIn;
    this.onLine = onLine;
    this.onDone = onDone;
    this.sequence = null;
    this.queue = [];
    this.line = null;
    this.pendingLine = null;
    this.leadIn = null;
    this._leadInLoopStarted = false;
    this.hold = 0;
    /** Sequences already played, so a checkpoint restore cannot replay one. */
    this.played = new Set();
    this._playbackSuppressionDepth = 0;
  }

  get active() {
    return this.line !== null || this.pendingLine !== null
      || this.leadIn !== null || this.queue.length > 0;
  }

  /**
   * Start a sequence. Returns false if it is already playing, has already
   * been played, or does not exist -- so a caller can put this behind a room
   * trigger and let it run every frame without a flag of its own.
   */
  play(id, { replay = false, lines = null } = {}) {
    lines ??= SEQUENCES[id];
    if (!lines || (!replay && this.played.has(id))) return false;
    if (this.sequence === id) return false;
    this.played.add(id);
    this._clearLeadIn();
    this.sequence = id;
    this.queue = [...lines];
    this.line = null;
    this.pendingLine = null;
    this.hold = 0;
    this._next();
    return true;
  }

  /** Play Lou's office briefing with the recorded heavy order only for a SAW. */
  playBriefing(weaponId, { replay = false } = {}) {
    return this.play('briefing', {
      replay,
      lines: briefingLinesForWeapon(weaponId),
    });
  }

  /**
   * Walk authored dialogue gates while reconstructing a checkpoint without
   * replaying lines that happened before that checkpoint. Sequences remain in
   * `played`, and explicit finish() calls still fire their load-bearing onDone
   * handoffs; any guidance line left active at the destination is cancelled.
   */
  withSuppressedPlayback(run) {
    if (typeof run !== 'function') {
      throw new TypeError('withSuppressedPlayback needs a callback');
    }
    this._playbackSuppressionDepth += 1;
    try {
      return run();
    } finally {
      this._playbackSuppressionDepth -= 1;
      if (this._playbackSuppressionDepth === 0) this.cancel();
    }
  }

  _playEffect(cue, volume = 0.7) {
    if (this._playbackSuppressionDepth > 0 || typeof cue !== 'string' || !cue) return false;
    try {
      this.audio?.play?.(cue, { volume, bus: 'sfx' });
      return true;
    } catch { return false; }
  }

  _beginLeadIn(line) {
    const leadIn = line?.leadIn;
    if (!leadIn?.cue || !(leadIn.seconds > 0)) return false;
    this.line = null;
    this.pendingLine = line;
    this.leadIn = leadIn;
    this.hold = leadIn.seconds;
    this._leadInLoopStarted = false;
    if (this._playbackSuppressionDepth === 0) {
      /* Presentation must enter the answer beat too. Otherwise the last
       * shouted combat subtitle sits over a now-ringing telephone until Lou
       * speaks, which makes two different moments appear to be one. */
      this.onLeadIn?.(leadIn, line);
      try {
        if (typeof this.audio?.startLoop === 'function') {
          this.audio.startLoop(leadIn.cue, {
            volume: leadIn.volume ?? 0.7,
            bus: 'sfx',
            fadeIn: 0.04,
          });
          this._leadInLoopStarted = true;
        } else {
          this._playEffect(leadIn.cue, leadIn.volume ?? 0.7);
        }
      } catch { /* subtitles and the load-bearing handoff still run */ }
    }
    return true;
  }

  _clearLeadIn({ answer = false } = {}) {
    const leadIn = this.leadIn;
    if (leadIn && this._leadInLoopStarted) {
      try { this.audio?.stopLoop?.(leadIn.cue, 0.08); } catch { /* already stopped */ }
    }
    this._leadInLoopStarted = false;
    this.leadIn = null;
    if (answer && leadIn?.answerCue) {
      this._playEffect(leadIn.answerCue, leadIn.answerVolume ?? leadIn.volume ?? 0.7);
    }
    return leadIn;
  }

  _startLine(line) {
    this.pendingLine = null;
    this.line = line;
    /* THE RECORDING'S OWN LENGTH BEATS THE AUTHORED GUESS. `sampleDuration()`
     * is null until the take lands, and the day it lands the subtitle starts
     * leaving with the voice instead of a second and a half after it -- with
     * nothing here to edit. See ENGINE-TRAPS #8 on authored `hold` values. */
    const recorded = this.audio?.sampleDuration?.(line.name) ?? null;
    this.hold = Number.isFinite(recorded) && recorded > 0.2
      ? recorded + 0.45
      : line.seconds;
    if (this._playbackSuppressionDepth === 0) {
      /* Siege still owns sequence/checkpoint policy, but it does not own a
       * second speech engine. Player lines and house-radio guidance are close
       * mix; everybody visibly present in the room follows their world rig.
       * `speak()` owns the voice bus, analyser, speech floor, positional mix,
       * required-recording policy and receipt -- the same Interface used by
       * combat barks and the rest of the game. */
      const close = line.remote === true
        || line.speaker === 'prospect'
        || line.speaker === 'guard'
        || this.sequence === 'guide_armory'
        || this.sequence === 'guide_office';
      const speaker = close ? null : this.resolveSpeaker?.(line.speaker) ?? null;
      let spoken = null;
      try {
        spoken = speak(this.audio, line.name, {
          speaker,
          speakerId: line.speaker,
          subtitle: line.say,
          requiredRecorded: true,
          mix: close ? SPEECH_MIX_CLOSE : SPEECH_MIX_INDOORS,
          gain: line.gain ?? SPEECH_GAIN.normal,
          priority: line.priority ?? 'story',
        });
      } catch { /* no audio yet; subtitles and mission handoff still run */ }
      this.onLine?.(line, spoken);
    }
  }

  _next() {
    const line = this.queue.shift() ?? null;
    if (!line) {
      this.line = null;
      this.pendingLine = null;
      const finished = this.sequence;
      this.sequence = null;
      this.hold = 0;
      this.onDone?.(finished);
      return;
    }
    if (this._beginLeadIn(line)) return;
    this._startLine(line);
  }

  update(dt) {
    if (this.leadIn) {
      this.hold -= Math.max(0, Number(dt) || 0);
      if (this.hold > 0) return;
      const pending = this.pendingLine;
      this._clearLeadIn({ answer: true });
      if (pending) this._startLine(pending);
      return;
    }
    if (!this.line) return;
    this.hold -= Math.max(0, Number(dt) || 0);
    if (this.hold > 0) return;
    const finished = this.line;
    this.line = null;
    if (finished.endCue) this._playEffect(finished.endCue, finished.endCueVolume ?? 0.7);
    this._next();
  }

  /** Run the whole rest of the sequence out. For a skip key and for tests. */
  finish() {
    if (!this.active) return false;
    this._clearLeadIn();
    this.queue.length = 0;
    this.line = null;
    this.pendingLine = null;
    const finished = this.sequence;
    this.sequence = null;
    this.hold = 0;
    this.onDone?.(finished);
    return true;
  }

  /**
   * Stop where it is WITHOUT firing `onDone`.
   *
   * The difference between this and `finish()` is the whole reason both
   * exist. `finish()` is a skip: the player heard enough, the conversation
   * counts as had, and the mission moves on. `cancel()` is a checkpoint
   * restore: the conversation is being un-happened, and running its `onDone`
   * would advance a beat the restore has just rewound past -- a briefing that
   * ends after the mission has already gone back to the landing.
   */
  cancel() {
    this._clearLeadIn();
    this.queue.length = 0;
    this.line = null;
    this.pendingLine = null;
    this.sequence = null;
    this.hold = 0;
    return this;
  }

  /** Which sequences have been played. Part of the checkpoint's dialogue field. */
  snapshot() { return { played: [...this.played] }; }

  restore(snapshot) {
    this.cancel();
    this.played = new Set(snapshot?.played ?? []);
    return this;
  }
}
