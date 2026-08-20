/**
 * TWO MEN ON A SHIFT, TALKING, WITH THEIR BACKS TO THE DOOR.
 *
 * Owner, 2026-08-20: *"Lets make sure the guards have conversations with each
 * other and you can sneak up on them as they are talking about how good the A
 * team is and how even tho it never made the playoffs they are still the
 * best."*
 *
 * Two things are being built here and they are not the same thing.
 *
 * The FIRST is dialogue. Nine men are posted around an estate at night with
 * nothing to do, and until now the only thing any of them said was "contact".
 * A pair who have been standing in the same courtyard for six hours talk, and
 * they do not talk in one-liners fired past each other -- one starts a
 * subject, the other takes it somewhere, and it wanders the way a real shift
 * wanders: the A-Team, the playoff record, overtime, the tray in the kitchen,
 * whose turn it is on the door. They admire the A-Team completely sincerely,
 * they defend a nine-season record of never once reaching a playoff at
 * length, and nothing in the scene ever acknowledges that this is funny --
 * see docs/TONE-AND-PARODY.md, which is not a preference.
 *
 * The SECOND is a stealth affordance, and it is the reason the first exists.
 * A conversation is two armed men who have stopped watching the estate:
 *
 *   THEY STOP MOVING     Both walk to an authored mark and hold it, so the
 *                        player can find them, get behind them and stay
 *                        there. Talking men do not wander off mid-sentence.
 *   THEY TURN INWARD     Each faces the other, which puts the approach into
 *                        the cone behind them where `CombatPerception` never
 *                        looks. This is geometry, not a fudge.
 *   THEY NOTICE SLOWER   `PalaceSecurity.setIdleTask`'s `attention` scales
 *                        the awareness gain in security's own ramp. There is
 *                        no second detection system here; there is one knob,
 *                        and this holds it down.
 *   IT BREAKS AUDIBLY    The instant EITHER man's awareness crosses
 *                        CONVERSATION_BREAK_AWARENESS -- or the alarm goes,
 *                        or one of them goes down -- the take is cut where
 *                        it is. A man stops mid-word, which is the sound of
 *                        being caught, and the subtitle is clipped to match.
 *
 * Audio is positional and glued to the SPEAKER: `PalaceVoice.playCue` passes
 * the man's root as `AudioEngine.play`'s `follow`, so the line tracks him
 * while he is still walking to his mark and the player can locate a
 * conversation by ear across a dark courtyard and decide to use it.
 *
 * Lines are DATA, the same as ./voice.js and ./finale.js: a catalog a tool
 * can read and a manifest can be held to. An unrecorded cue costs nothing --
 * no take is found, and the line reads on its authored hold.
 */
import * as THREE from 'three';

import { CONVERSATION_BREAK_AWARENESS } from './security.js';
import { palaceGuardVoice } from './voice.js';

/*
 * The marks.
 *
 * Every one is a real point on the estate floor, proved clear of the palace
 * colliders and in line of sight of its partner by
 * tests/cartel-palace-conversations.test.mjs against the built world -- a
 * talk mark inside the fountain basin is two men shouting through masonry.
 *
 * They are also deliberately close to the pair's authored posts, so the walk
 * out to a conversation is a few seconds of a man drifting over rather than a
 * guard abandoning a wing.
 */

const conversation = ({ id, title, pair, marks, anchored = [], lines }) => Object.freeze({
  id,
  title,
  pair: Object.freeze([...pair]),
  marks: Object.freeze(marks.map((mark) => Object.freeze([...mark]))),
  /* A man who is sitting down does not get up to have a chat -- the watch
   * desk holds his chair and the other man comes to him. */
  anchored: Object.freeze([...anchored]),
  lines: Object.freeze(lines.map((line, index) => Object.freeze({
    ...line,
    index,
    id: `shift.${id}.${String(index + 1).padStart(2, '0')}`,
    hold: line.hold ?? 2.6,
    beat: line.beat ?? 0.42,
  }))),
});

/**
 * THE SHIFT.
 *
 * Four exchanges, one per pair of men who can actually see each other. They
 * are working men killing a night, they are not performing, and not one line
 * knows it is in a joke.
 */
export const PALACE_CONVERSATIONS = Object.freeze([
  /* ------------------------------------------------------------------ *
   * THE DRIVE. The record, defended, at length.                         *
   * ------------------------------------------------------------------ */
  conversation({
    id: 'record',
    title: 'the record',
    pair: ['gate-one', 'guardhouse'],
    marks: [[7.9, 47.9], [9.6, 46.9]],
    lines: [
      {
        who: 0, hold: 3.4,
        text: 'You hear what the A-Team did in Jersey Tuesday? Big house. Old money.',
        direction: 'Conversational, bored, filling a gap. Two men on a gate at two in the morning.',
      },
      {
        who: 1, hold: 2.4,
        text: 'I heard it was a mansion.',
        direction: 'Flat. Not impressed yet, just confirming the address.',
      },
      {
        who: 0, hold: 4.2,
        text: 'It was a mansion. Twenty-two guys, up the front drive, like they had an appointment.',
        direction: 'Warming up. He has been waiting all night to tell somebody this.',
      },
      {
        who: 1, hold: 2.8, beat: 0.6,
        text: 'No back door. No roof. Front.',
        direction: 'Slow, giving each one its own weight. That is the part that gets him.',
      },
      {
        who: 0, hold: 2.8,
        text: 'That is class. You cannot teach a man that.',
        direction: 'Sincere. He means it the way another man means it about a ballplayer.',
      },
      {
        who: 1, hold: 3.6,
        text: 'My cousin says they never made the playoffs. Not one year, not ever.',
        direction: 'Reporting it, not endorsing it. He already knows how this lands.',
      },
      {
        who: 0, hold: 2.2, beat: 0.7,
        text: 'Your cousin parks cars.',
        direction: 'Instant. Dead flat. Not a joke, a fact about the witness.',
      },
      {
        who: 1, hold: 2.6,
        text: 'He parks cars. I am telling you what he said.',
        direction: 'Defensive, small. He is not going to die on this hill.',
      },
      {
        who: 0, hold: 5.0,
        text: 'The playoffs are a bracket on a wall. A bracket has never once come through a door and taken a man’s house off him.',
        direction: 'Hard, level, absolutely serious. The most important thing he will say tonight.',
      },
      {
        who: 1, hold: 2.0,
        text: 'That is fair.',
        direction: 'Conceding. He has heard worse arguments from people with more education.',
      },
      {
        who: 0, hold: 4.6,
        text: 'Nine seasons. Nine. Not one playoff game, and every crew on this coast still says the name.',
        direction: 'Counting it out on his fingers. This is the defence and he has made it before.',
      },
      {
        who: 1, hold: 1.8,
        text: 'They do say it.',
        direction: 'Quiet agreement.',
      },
      {
        who: 0, hold: 3.8, beat: 0.55,
        text: 'You know how good you have to be to be that famous with nothing on the shelf?',
        direction: 'A genuine question. He wants the man to arrive at it himself.',
      },
      {
        who: 1, hold: 1.8,
        text: 'Very good.',
        direction: 'Arriving at it.',
      },
      {
        who: 0, hold: 3.4,
        text: 'The best. That is the only way that math works out. The best.',
        direction: 'Settled. Case closed, as far as he is concerned.',
      },
      {
        who: 1, hold: 3.0,
        text: 'I am not arguing with you. I said what my cousin said.',
        direction: 'Hands-up, tired. He would like to go back to standing quietly now.',
      },
      {
        who: 0, hold: 2.6,
        text: 'Then tell your cousin to go and park a car.',
        direction: 'The last word, taken. He turns back to the gate.',
      },
    ],
  }),

  /* ------------------------------------------------------------------ *
   * THE COURTYARD. Overtime, and what a professional outfit looks like. *
   * ------------------------------------------------------------------ */
  conversation({
    id: 'overtime',
    title: 'the hours',
    pair: ['fountain', 'pool'],
    marks: [[1.6, 27.6], [0.0, 28.4]],
    lines: [
      {
        who: 0, hold: 2.6,
        text: 'They put me back on nights. Third week running.',
        direction: 'Aggrieved, low. Opening a complaint he has been saving.',
      },
      {
        who: 1, hold: 2.4,
        text: 'Nobody signed up for nights.',
        direction: 'Automatic solidarity. He has his own version of this.',
      },
      {
        who: 0, hold: 4.2,
        text: 'Sixteen hours Thursday, and the man docks me forty minutes for the drive up.',
        direction: 'Genuinely angry now. Money, which is the only thing that is ever really the subject.',
      },
      {
        who: 1, hold: 2.6,
        text: 'The drive is not the shift. That is the rule.',
        direction: 'Reciting policy he does not believe in either.',
      },
      {
        who: 0, hold: 2.8, beat: 0.6,
        text: 'The drive is where I do my thinking.',
        direction: 'Deadpan. He means it.',
      },
      {
        who: 1, hold: 4.4,
        text: 'You know who does not get docked? The A-Team. Flat number, gate to gate, agreed before anybody puts a boot in a door.',
        direction: 'Admiring. Bringing up the professionals the way you bring up a better job.',
      },
      {
        who: 0, hold: 2.8,
        text: 'Flat, gate to gate. That is an outfit that respects itself.',
        direction: 'Reverent, almost. This is what he wants when he grows up.',
      },
      {
        who: 1, hold: 4.0,
        text: 'That is what a trophy actually is. A number, in your hand, before the work.',
        direction: 'Philosophical, and completely straight. He has thought about this a lot.',
      },
      {
        who: 0, hold: 2.4, beat: 0.65,
        text: 'And they have never won a thing.',
        direction: 'Not a criticism. He is setting his partner up and they both know it.',
      },
      {
        who: 1, hold: 4.6,
        text: 'Never won a thing. Never lost a man either. Pick which one you want cut into your stone.',
        direction: 'Hard and quiet. The one line of the night either of them will remember.',
      },
      {
        who: 0, hold: 2.0,
        text: 'I want the second one.',
        direction: 'Immediate.',
      },
      {
        who: 1, hold: 2.6,
        text: 'Everybody wants the second one. Nobody trains for it.',
        direction: 'Turning back to the water. Conversation over as far as he is concerned.',
      },
    ],
  }),

  /* ------------------------------------------------------------------ *
   * THE WATCH DESK. Whose turn on the door.                             *
   * ------------------------------------------------------------------ */
  conversation({
    id: 'door',
    title: 'whose turn on the door',
    pair: ['entry-watch', 'service-hall'],
    marks: [[15.6, 5.35], [14.2, 3.6]],
    anchored: ['entry-watch'],
    lines: [
      {
        who: 1, hold: 2.2,
        text: 'It is your door tonight.',
        direction: 'Opening shot, from a man who came all the way up the corridor to say it.',
      },
      {
        who: 0, hold: 3.6,
        text: 'It is not my door. I had the door Sunday, and Sunday is two doors.',
        direction: 'Not even looking up from the keyboard. He has this argument weekly.',
      },
      {
        who: 1, hold: 1.8,
        text: 'Sunday is one door.',
        direction: 'Firm.',
      },
      {
        who: 0, hold: 4.6,
        text: 'Sunday is two doors, because the kitchen brings the ice in through the front, and that is a door.',
        direction: 'Patient, like a man explaining arithmetic to a child.',
      },
      {
        who: 1, hold: 1.8, beat: 0.55,
        text: 'The ice is not a door.',
        direction: 'Flat refusal.',
      },
      {
        who: 0, hold: 1.8,
        text: 'The ice is a door.',
        direction: 'Immovable. He will be saying this at his funeral.',
      },
      {
        who: 1, hold: 4.6,
        text: 'You know how the A-Team runs it? They have no door man. All twenty-two do the door.',
        direction: 'Changing tack, and immediately more interested than he was in the ice.',
      },
      {
        who: 0, hold: 3.0,
        text: 'That is because they arrive at the door. It is a different relationship.',
        direction: 'A distinction he considers important and technical.',
      },
      {
        who: 1, hold: 2.8,
        text: 'That is the whole job, though. Arrive at the door.',
        direction: 'Simple, sincere admiration for a simple, sincere business model.',
      },
      {
        who: 0, hold: 2.4, beat: 0.6,
        text: 'I would work for them tomorrow.',
        direction: 'Honest. He would.',
      },
      {
        who: 1, hold: 2.8,
        text: 'You would not last the week. They run drills.',
        direction: 'Not unkind. A realistic assessment of a friend.',
      },
      {
        who: 0, hold: 2.6,
        text: 'I would do drills. For that money I would do drills.',
        direction: 'Wounded, and still typing.',
      },
    ],
  }),

  /* ------------------------------------------------------------------ *
   * THE GALLERY. The tray, the boss, and the record one more time.      *
   * ------------------------------------------------------------------ */
  conversation({
    id: 'kitchen',
    title: 'the tray',
    pair: ['gallery-east', 'gallery-west'],
    marks: [[-1.4, -25.6], [0.6, -25.0]],
    lines: [
      {
        who: 0, hold: 1.8,
        text: 'Did you eat?',
        direction: 'Two men in a long empty hallway. Somebody has to start.',
      },
      {
        who: 1, hold: 3.8,
        text: 'There is a tray in the kitchen. It has been in the kitchen since the afternoon.',
        direction: 'Bleak. A statement about the tray and about the whole job.',
      },
      {
        who: 0, hold: 1.6,
        text: 'What is on it?',
        direction: 'Already regretting the question.',
      },
      {
        who: 1, hold: 2.8, beat: 0.6,
        text: 'Something with a bone in it. I would not.',
        direction: 'Final. He has made his decision about the tray.',
      },
      {
        who: 0, hold: 4.6,
        text: 'Mister Mark eats at a table with a napkin the size of a bedsheet, and we get a bone.',
        direction: 'Bitter, and quieter than the rest, because of where they are standing.',
      },
      {
        who: 1, hold: 2.2,
        text: 'Do not say that in this hallway.',
        direction: 'Sharp. A real warning between friends.',
      },
      {
        who: 0, hold: 2.0, beat: 0.55,
        text: 'I am saying it in this hallway.',
        direction: 'Quiet defiance. He does not raise his voice.',
      },
      {
        who: 1, hold: 4.4,
        text: 'The A-Team eat before a job. Every man, sat down, hot food. That is in how they do it.',
        direction: 'Changing the subject to the only outfit either of them respects.',
      },
      {
        who: 0, hold: 1.8,
        text: 'They have a book?',
        direction: 'Genuinely asking.',
      },
      {
        who: 1, hold: 3.4,
        text: 'They have a way. Whether anybody wrote it down, I could not tell you.',
        direction: 'Careful. He does not want to overstate what he knows.',
      },
      {
        who: 0, hold: 4.0,
        text: 'Nine years, no playoffs, and they still eat hot before they go in.',
        direction: 'Turning it over. The two facts sit together in his head as one fact.',
      },
      {
        who: 1, hold: 2.4,
        text: 'Those two things are not connected.',
        direction: 'Mild correction.',
      },
      {
        who: 0, hold: 2.6,
        text: 'I think they are connected.',
        direction: 'Certain. He is right and he knows it and he will not be moved.',
      },
    ],
  }),
]);

/** `vo.<cue>.1` is what the recording sheet and the audio bank look for. */
export const palaceConversationCue = (id) => `palace.${id}`;

/** Every conversation line, in manifest-row shape, in speaking order. */
export function allPalaceConversationLines() {
  const rows = [];
  for (const spec of PALACE_CONVERSATIONS) {
    for (const line of spec.lines) {
      rows.push({
        conversation: spec.id,
        id: line.id,
        cue: palaceConversationCue(line.id),
        name: `vo.${palaceConversationCue(line.id)}.1`,
        voice: palaceGuardVoice(spec.pair[line.who]),
        speaker: spec.pair[line.who],
        say: line.text,
        direction: line.direction ?? null,
      });
    }
  }
  return rows;
}

/** The prefix the residency bank loads these on. See ./audio-banks.js. */
export const PALACE_CONVERSATION_PREFIX = 'vo.palace.shift.';

/* How long after a conversation ends -- or is interrupted -- before the pair
 * will start another. Long enough that the estate is not a talk show, short
 * enough that a player who backs off and circles round gets another run at
 * hearing one. */
const REST_SECONDS = 34;
const REST_JITTER = 22;
/* An interrupted pair go quiet for longer: they have just had a reason to
 * look at the room instead of each other. */
const BROKEN_REST_SECONDS = 26;

/**
 * How much of the estate a man is still watching while he is talking.
 *
 * This is a multiplier on `PalaceSecurity`'s own awareness ramp, not a second
 * detection model: at 0.45 a talking guard takes better than twice as long to
 * resolve a shape into a man, which is the difference between the player
 * being able to cross the last ten metres of a lit courtyard and not.
 */
export const CONVERSATION_ATTENTION = 0.45;

/**
 * Metres. Beyond this the pair cannot hold a conversation at all -- one of
 * them has been pulled away by something and the exchange is abandoned.
 *
 * Exported because it is a claim about the authored marks -- that the two
 * points a pair is sent to are close enough to be a conversation and not two
 * men shouting across a courtyard -- and
 * tests/cartel-palace-conversations.test.mjs holds the marks to it.
 */
export const CONVERSATION_PAIR_RANGE = 5.5;
/* Metres the line carries. A conversation is the loudest thing in a quiet
 * courtyard and the player is meant to find it by ear. */
const LINE_RADIUS = 24;

const _mark = new THREE.Vector3();
const _face = new THREE.Vector3();

/**
 * Runs the estate's idle guard conversations.
 *
 * @param {object} options
 * @param {object} options.cast      the palace cast (uses `cast.guards`)
 * @param {object} options.security  the live PalaceSecurity; this drives its
 *   idle-task seam rather than moving anybody itself, so awareness, sight and
 *   collision stay in one place.
 * @param {object} [options.voice]   a PalaceVoice, for `playCue` and the hud
 * @param {object} [options.player]  anything with a `.position` Vector3
 * @param {Function} [options.random]
 */
export class PalaceGuardConversations {
  constructor({
    cast,
    security,
    voice = null,
    player = null,
    conversations = PALACE_CONVERSATIONS,
    random = Math.random,
    startDelay = 5,
  } = {}) {
    if (!cast?.guards) throw new TypeError('PalaceGuardConversations requires a palace cast');
    if (!security?.setIdleTask) throw new TypeError('PalaceGuardConversations requires PalaceSecurity');
    this.cast = cast;
    this.security = security;
    this.voice = voice;
    this.player = player;
    this.random = typeof random === 'function' ? random : Math.random;
    this.rooms = [];
    this.spoken = [];
    this.broken = 0;
    this.completed = 0;
    let stagger = 0;
    for (const spec of conversations) {
      const a = cast.guards.find((guard) => guard.id === spec.pair[0]);
      const b = cast.guards.find((guard) => guard.id === spec.pair[1]);
      /* A pair the cast does not field is simply not a conversation. Nothing
       * here invents a body to talk to. */
      if (!a || !b) continue;
      this.rooms.push({
        spec,
        men: [a, b],
        marks: spec.marks.map(([x, z]) => new THREE.Vector3(x, 0, z)),
        phase: 'resting',
        index: 0,
        timer: startDelay + stagger,
        line: null,
        source: null,
        spokenFor: 0,
      });
      stagger += 7;
    }
  }

  /** Is this man free to stand and talk right now? */
  _available(entry) {
    return Boolean(entry)
      && !entry.down
      && entry.active
      && (entry.awareness ?? 0) < CONVERSATION_BREAK_AWARENESS;
  }

  /** Everything that ends a conversation, in one place. */
  _spoiled(room) {
    if (this.security.alarm) return 'alarm';
    for (const entry of room.men) {
      if (!entry.active || entry.down) return 'down';
      if ((entry.awareness ?? 0) >= CONVERSATION_BREAK_AWARENESS) return 'noticed';
    }
    if (room.phase === 'talking'
      && room.men[0].root.position.distanceTo(room.men[1].root.position) > CONVERSATION_PAIR_RANGE) {
      return 'separated';
    }
    return null;
  }

  /** Send both men to their marks and take them off patrol. */
  _gather(room) {
    room.phase = 'gathering';
    room.index = 0;
    room.line = null;
    for (let side = 0; side < 2; side++) {
      const entry = room.men[side];
      const anchored = room.spec.anchored.includes(entry.id) || entry.seated === true;
      this.security.setIdleTask(entry, {
        /* An anchored man -- the watch desk -- holds the chair he is already
         * in; the other man comes to him. */
        goal: anchored ? entry.root.position.clone() : room.marks[side].clone(),
        face: anchored ? null : room.marks[1 - side].clone(),
        anchored,
        /* Walking over is not yet the distraction; the talking is. */
        attention: 1,
        reason: `conversation:${room.spec.id}`,
      });
    }
    return true;
  }

  /** Both men are standing where they should be, facing each other. */
  _ready(room) {
    return room.men.every((entry) => this.security.idleTaskArrived(entry))
      && room.men[0].root.position.distanceTo(room.men[1].root.position) <= CONVERSATION_PAIR_RANGE;
  }

  /** Start the line at `room.index`, positionally, off the speaking body. */
  _speak(room) {
    const line = room.spec.lines[room.index];
    if (!line) return false;
    const entry = room.men[line.who];
    const cue = palaceConversationCue(line.id);
    const take = this.voice?.playCue?.(cue, {
      /* THE POINT OF `follow`: the line is glued to the man, so it stays on
       * him while he settles onto his mark and the player can walk around
       * the sound to find out who is talking. */
      follow: entry.root,
      position: entry.root.position,
      radius: LINE_RADIUS,
      volume: 0.95,
    }) ?? null;
    const hold = Math.max(line.hold, take?.duration ? take.duration + 0.25 : 0);
    room.line = { line, entry, hold, take };
    room.timer = hold + line.beat;
    room.spokenFor = 0;
    this.spoken.push(cue);
    /* His mouth moves for exactly as long as the take runs -- and stops dead
     * when it is cut, because `Mouth.speak` listens for `ended` and a cut
     * source fires `ended` the same as a finished one. */
    entry.figure?.say?.(hold, { audio: this.voice?.audio ?? null, source: take?.source ?? null });
    this._subtitle(room, line, entry, hold);
    return true;
  }

  _subtitle(room, line, entry, hold, { clipped = 0 } = {}) {
    const hud = this.voice?.hud;
    if (!hud?.say) return;
    /* Same gate as every other palace line: radius plus an unblocked line to
     * the speaker, so a conversation two rooms away is not subtitled through
     * the wall. The AUDIO is not gated -- it is positional and attenuates on
     * its own, which is what lets the player hear a murmur and go and find
     * it. */
    if (this.voice.audible && !this.voice.audible(entry.root.position, LINE_RADIUS)) return;
    const colour = this.voice.colourFor?.(palaceGuardVoice(entry.id)) ?? '#d8a06a';
    const text = clipped > 0 ? `${line.text.slice(0, clipped).trimEnd()}—` : line.text;
    hud.say(
      `<b style="color:${colour}">CARTEL GUARD</b> ${text}`,
      Math.min(7600, Math.max(900, hold * 1000)),
    );
  }

  /**
   * Cut the conversation where it stands.
   *
   * The owner's requirement is that the break be AUDIBLE, so this stops the
   * playing take rather than letting it finish over a man who has just seen
   * somebody in his house: the word ends halfway. The subtitle is clipped to
   * roughly where the voice got to and held for a beat, so the screen agrees
   * with the ears.
   */
  _cut(room, reason) {
    const live = room.line;
    if (live) {
      live.take?.source?.stop?.();
      live.entry.figure?.hush?.();
      const fraction = live.hold > 0
        ? Math.max(0, Math.min(1, room.spokenFor / live.hold)) : 0;
      const clipped = Math.max(1, Math.round(live.line.text.length * fraction));
      if (clipped < live.line.text.length) {
        this._subtitle(room, live.line, live.entry, 0.85, { clipped });
      }
    }
    for (const entry of room.men) this.security.clearIdleTask(entry);
    room.line = null;
    room.phase = 'resting';
    room.index = 0;
    room.timer = reason === 'alarm' ? Infinity
      : BROKEN_REST_SECONDS + this.random() * REST_JITTER;
    if (live) this.broken++;
    return reason;
  }

  /** Ran out of lines. Both men go back to their rounds. */
  _finish(room) {
    for (const entry of room.men) this.security.clearIdleTask(entry);
    room.line = null;
    room.phase = 'resting';
    room.index = 0;
    room.timer = REST_SECONDS + this.random() * REST_JITTER;
    this.completed++;
  }

  /** Simulated clock only -- dt from the scene loop, never wall time. */
  update(dt) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    for (const room of this.rooms) {
      if (room.phase !== 'resting') {
        const spoiled = this._spoiled(room);
        if (spoiled) {
          this._cut(room, spoiled);
          continue;
        }
      }

      if (room.phase === 'resting') {
        /* The alarm parks every conversation for the rest of the night: the
         * estate has a man in it and nobody is discussing the tray. */
        if (this.security.alarm) continue;
        room.timer -= step;
        if (room.timer > 0) continue;
        if (!room.men.every((entry) => this._available(entry))) {
          room.timer = 6;
          continue;
        }
        this._gather(room);
        continue;
      }

      if (room.phase === 'gathering') {
        if (!this._ready(room)) continue;
        room.phase = 'talking';
        room.index = 0;
        /* Now they are standing still looking at each other, and now they
         * stop watching the estate. One knob, security's own. */
        for (const entry of room.men) {
          this.security.setIdleAttention(entry, CONVERSATION_ATTENTION);
        }
        room.timer = 0.7;
        continue;
      }

      /* talking */
      room.timer -= step;
      if (room.line) room.spokenFor += step;
      if (room.timer > 0) continue;
      if (room.index >= room.spec.lines.length) {
        this._finish(room);
        continue;
      }
      this._speak(room);
      room.index++;
    }
    return this;
  }

  /**
   * Cut every running conversation now.
   *
   * The composition root calls this the frame the alarm goes up or a body is
   * found, so a bark never lands on top of a man mid-sentence: he stops, and
   * THEN somebody shouts.
   */
  cutAll(reason = 'interrupted') {
    let cut = 0;
    for (const room of this.rooms) {
      if (room.phase === 'resting') continue;
      this._cut(room, reason);
      cut++;
    }
    return cut;
  }

  /** Stop everything and hand every man back to his patrol. */
  reset() {
    for (const room of this.rooms) {
      if (room.phase !== 'resting') this._cut(room, 'reset');
      room.timer = REST_SECONDS;
      room.index = 0;
    }
    this.spoken.length = 0;
    return this;
  }

  /** JSON-safe view for tests and the verifier. */
  report() {
    return Object.freeze({
      completed: this.completed,
      broken: this.broken,
      spoken: [...this.spoken],
      rooms: this.rooms.map((room) => Object.freeze({
        id: room.spec.id,
        phase: room.phase,
        index: room.index,
        speaking: room.line?.entry?.id ?? null,
        pair: [...room.spec.pair],
        voices: room.spec.pair.map((id) => palaceGuardVoice(id)),
      })),
    });
  }
}
