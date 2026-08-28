import { SPEECH_GAIN, speak } from '../core/dialogue.js';
/**
 * EVERYTHING SAID IN THE PALACE THAT IS NOT THE DINING-ROOM SCRIPT.
 *
 * The finale (./finale.js) owns Mark's table. This owns the twenty minutes
 * before it: the Prospect recognising what he is looking at, the cleaner who
 * did not sign up for this, and the men on the payroll reacting to a raid.
 *
 * Owner, 2026-08-20 playtest, two separate notes that are really one note:
 *
 *   *"Add short Prospect recognition lines when discovering Sauce-related
 *   evidence. Not exposition — recognition. Different lines per evidence
 *   piece so it feels like an investigation rather than clicking glowing
 *   props."*
 *
 *   *"Add the missing situational lines: cleaning lady panic, civilian
 *   reactions, additional cartel NPC reactions, combat barks, post-combat /
 *   room-cleared lines... Check trigger radius and timing so lines do not
 *   fire through walls or before the player can see the speaker."*
 *
 * Lines are DATA, the Beef Run / finale pattern: a catalog a tool can read
 * and a manifest can be held to, never a string at a call site. The runtime
 * below is the whole delivery mechanism, and its two rules are the owner's:
 *
 *   RADIUS + SIGHT   Nothing positional plays unless the player is inside
 *                    its radius AND has an unblocked line to the speaker.
 *                    `trace` is the scene's own collider tracer, so "through
 *                    a wall" is answered by the wall.
 *   TIMING           One voice at a time with a floor between lines, and a
 *                    per-cue once-only latch, so a room does not stack four
 *                    reactions into one second or repeat a bark on re-entry.
 *
 * An unrecorded cue costs nothing: `AudioEngine.say` finds no take and the
 * subtitle carries the line on its authored hold, exactly as the finale's
 * does today.
 */

/**
 * THE PAYROLL IS THREE MEN NOW, NOT ONE.
 *
 * Owner supplied three ElevenLabs ids for the cartel guards on 2026-08-20,
 * splitting the single `cartel-guard` profile. The split is what makes a
 * conversation a conversation: two bodies on one voice is one man arguing
 * with himself, and no amount of writing fixes that.
 *
 * NOTE, already flagged to the owner: the third id here
 * (Cf2KUROHGvqqd4q0ebDI) is ALSO the first id on the A-Team list in
 * src/mansion/siege. It is wired exactly as supplied rather than quietly
 * substituted; the collision is recorded on both profiles in the manifest so
 * it is obvious and one-line reversible.
 */
export const PALACE_GUARD_VOICES = Object.freeze([
  'cartel-guard1',
  'cartel-guard2',
  'cartel-guard3',
]);

/**
 * Which of the three each posted man is.
 *
 * Assigned so that every conversation below is two DIFFERENT profiles -- the
 * casting is load-bearing, not decorative. `PALACE_GUARD_POSTS` in ./cast.js
 * carries the same value on each post so a body knows its own voice; this is
 * the table that decides it.
 */
export const PALACE_GUARD_VOICE_CAST = Object.freeze({
  'gate-one': 'cartel-guard1',
  guardhouse: 'cartel-guard2',
  fountain: 'cartel-guard3',
  pool: 'cartel-guard1',
  'service-door': 'cartel-guard2',
  'entry-watch': 'cartel-guard3',
  'service-hall': 'cartel-guard1',
  'gallery-east': 'cartel-guard2',
  'gallery-west': 'cartel-guard3',
});

/** The profile a posted guard speaks with; the first voice is the fallback. */
export function palaceGuardVoice(id) {
  return PALACE_GUARD_VOICE_CAST[id] ?? PALACE_GUARD_VOICES[0];
}

/**
 * THE EIGHT EXISTING BARKS, REDISTRIBUTED.
 *
 * Every guard line in the estate used to be recorded on the single
 * `cartel-guard` profile, which meant the man who shouts "contact" in the
 * courtyard and the man who answers him in the hall were audibly one person.
 * The three-way split fixes that, and it only fixes it if the barks are
 * spread across the three: one voice with three names is still one man.
 *
 * This table is the redistribution, and it is LOAD-BEARING -- `speakerFor`
 * below picks the body that shouts a line by matching this against the
 * posted man's own casting, so a line recorded on `cartel-guard2` comes out
 * of a `cartel-guard2` body wherever the scene has one to hand.
 */
export const PALACE_GUARD_BARK_CAST = Object.freeze({
  /* The man at the watch desk IS `entry-watch`, who is cast guard 3. */
  'guard.watch.greet': 'cartel-guard3',
  'guard.contact.one': 'cartel-guard1',
  'guard.contact.two': 'cartel-guard2',
  'guard.contact.three': 'cartel-guard3',
  'guard.search.one': 'cartel-guard1',
  'guard.search.two': 'cartel-guard2',
  'guard.ally-down.one': 'cartel-guard3',
  'guard.ally-down.two': 'cartel-guard1',
});

/**
 * HAS THE MANIFEST CAUGHT UP YET. IT HAS, AS OF 2026-08-20.
 *
 * `assets/sfx/manifest.json` is owned by the casting stage, not by this file.
 * Its eight `vo.palace.guard.*` rows used to say `cartel-guard`, so this read
 * false and `allPalaceVoiceLines()` reported the one-profile truth while
 * `palaceRecastLines()` reported what the split WANTED.
 *
 * The casting pass has now landed: those eight rows carry cartel-guard1/2/3
 * exactly as `PALACE_GUARD_BARK_CAST` above assigns them, the split profiles
 * are declared in the manifest's `voices` block with the owner's ids, and the
 * single `cartel-guard` profile is gone. So this is true and the catalog and
 * the manifest say the same thing -- which is what
 * `tests/cartel-palace-playtest.test.mjs` holds them to.
 *
 * Flipping it back is still the whole migration in reverse, and it only makes
 * sense alongside reverting those manifest rows.
 */
export const GUARD_SPLIT_RECORDED = true;

/**
 * Which body should shout a given line.
 *
 * Prefers a live man cast to the line's own recorded voice and nearest to
 * `from`; falls back to the nearest live man of any voice, because a bark
 * with nobody to come out of is worse than a bark in the wrong register.
 */
export function speakerForLine(id, candidates = [], { from = null } = {}) {
  const live = candidates.filter((entry) => entry && !entry.down && entry.active !== false);
  if (!live.length) return null;
  const distance = (entry) => (from ? entry.root.position.distanceTo(from) : 0);
  const wanted = PALACE_GUARD_BARK_CAST[id] ?? null;
  const ordered = [...live].sort((a, b) => distance(a) - distance(b));
  if (!wanted) return ordered[0];
  return ordered.find((entry) => palaceGuardVoice(entry.id) === wanted) ?? ordered[0];
}

/**
 * Who says what.
 *
 * `hold` is SECONDS of simulated clock — the runtime is driven by the scene
 * loop's dt, never wall time — and a recorded take stretches its own hold so
 * a delivered line is never cut off. `direction` is for the booth only.
 *
 * Cue names deliberately avoid the `palace.finale.` prefix: that block is
 * generated wholesale from FINALE_BEATS and held to an exact row count.
 */
export const PALACE_VOICE_LINES = Object.freeze({
  /* ---------------- The Prospect, finding Sauce in Mark's house ---------- */
  'tony.evidence.still.spot': {
    voice: 'player', hold: 3.4,
    text: 'There’s a file open on that screen. That’s Sauce’s face on it.',
    direction: 'Quiet, to himself, stopping mid-step. Recognition — not narration.',
  },
  'tony.evidence.still.log': {
    voice: 'player', hold: 3.6,
    text: 'Sauce… what the hell were you doing here?',
    direction: 'Low. Genuinely asking a man who is not in the room. The anger has not arrived yet.',
  },
  'tony.evidence.uniform.spot': {
    voice: 'player', hold: 3.6,
    text: 'That’s Sauce’s. Pressed, hung, and nobody presses a hostage’s jacket.',
    direction: 'Flat. He is looking at laundry and hearing a whole story in it.',
  },
  'tony.evidence.uniform.log': {
    voice: 'player', hold: 3.4,
    text: 'His knives are still rolled. This keeps getting stranger.',
    direction: 'Under his breath. The strangeness is starting to cost him something.',
  },
  'tony.evidence.ledger.spot': {
    voice: 'player', hold: 3.8,
    text: 'A cob of corn on a cartel accountant’s desk. There is exactly one man who does that.',
    direction: 'Dry, almost amused, and then not amused at all by the end of the sentence.',
  },
  'tony.evidence.ledger.log': {
    voice: 'player', hold: 5.4,
    text: 'Short Bus. Consultant fourteen. Sauce was inside. One of our prospects countersigned the breach.',
    direction: 'Ice-flat. The rescue becomes a betrayal, then the redacted countersign opens one final question.',
  },
  'tony.evidence.complete': {
    voice: 'player', hold: 4.2,
    text: 'Three days we tore this state apart looking for you. You were down here getting paid.',
    direction: 'Spoken to a man who is two rooms away and does not know it yet. Very still.',
  },

  /* ---------------- Rooms going quiet ----------------------------------- */
  'tony.cleared.entry': {
    voice: 'player', hold: 3.0,
    text: 'Front hall’s clear. Nobody left standing in here who works for a living.',
    direction: 'Breathing hard, checking corners. A man counting bodies, not celebrating.',
  },
  'tony.cleared.halls': {
    voice: 'player', hold: 2.8,
    text: 'That’s the wing. Whole floor’s gone quiet.',
    direction: 'Lower. The quiet is worse than the noise and he knows it.',
  },
  'tony.cleared.estate': {
    voice: 'player', hold: 3.2,
    text: 'Nobody else coming. Just me and whatever’s behind those doors.',
    direction: 'Flat, final, already moving toward the dining room.',
  },

  /* ---------------- The cleaner ----------------------------------------- */
  'cleaner.spotted': {
    voice: 'cleaner', hold: 2.6,
    text: 'Oh — oh no. No. No, no, no—',
    direction: 'A woman who has just seen a rifle in a house she mops. Rising, not screaming yet.',
  },
  'cleaner.panic.one': {
    voice: 'cleaner', hold: 2.4,
    text: 'Don’t shoot! Don’t shoot! Please!',
    direction: 'Full volume, both hands up, backing away. Terror, absolutely sincere.',
  },
  'cleaner.panic.two': {
    voice: 'cleaner', hold: 3.2,
    text: 'I only clean! I clean the floors, that is all I do!',
    direction: 'Shouted like a credential. She believes it will help because it is true.',
  },
  'cleaner.cower.one': {
    voice: 'cleaner', hold: 3.0,
    text: 'Madre de Dios. Madre de Dios…',
    direction: 'Face down, hands over her head, repeating it into the tile.',
  },
  'cleaner.cower.two': {
    voice: 'cleaner', hold: 3.2,
    text: 'I have children. Please. I have children.',
    direction: 'Small and fast, into the floor. Not bargaining — reciting.',
  },
  'cleaner.plead': {
    voice: 'cleaner', hold: 3.4,
    text: 'Take anything. Take everything. Just go. Please just go.',
    direction: 'Exhausted terror, from the floor, as the player walks past her.',
  },

  /* ---------------- The men on the payroll ------------------------------ */
  'guard.watch.greet': {
    voice: 'cartel-guard', hold: 3.0,
    text: 'Deliveries go round the back, friend. Round the— hey. HEY.',
    direction: 'Bored, half-looking up from a keyboard, and then all the way awake by "hey".',
  },
  'guard.contact.one': {
    voice: 'cartel-guard', hold: 2.6,
    text: 'Contact! We’ve got a man inside the house!',
    direction: 'Shouted down a corridor. Professional, not panicked.',
  },
  'guard.contact.two': {
    voice: 'cartel-guard', hold: 2.4,
    text: 'Eyes up! Eyes up, he’s in the wing!',
    direction: 'Barked to somebody else, already moving to an angle.',
  },
  'guard.contact.three': {
    voice: 'cartel-guard', hold: 2.6,
    text: 'Somebody wake the boss. Now.',
    direction: 'Hard and quiet. The worst part of his night is telling the boss.',
  },
  'guard.search.one': {
    voice: 'cartel-guard', hold: 2.8,
    text: 'I heard something. Down that way.',
    direction: 'Uncertain, half to himself, weapon coming up an inch.',
  },
  'guard.search.two': {
    voice: 'cartel-guard', hold: 2.4,
    text: 'Check it. I’m not getting shot over a cat.',
    direction: 'Irritated. He wants very much for this to be nothing.',
  },
  'guard.ally-down.one': {
    voice: 'cartel-guard', hold: 2.6,
    text: 'He’s down! Somebody just put him down!',
    direction: 'Real shock in it. He knew the man.',
  },
  'guard.ally-down.two': {
    voice: 'cartel-guard', hold: 2.6,
    text: 'Man down in the hall! Get up here!',
    direction: 'Shouted into the house. Calling for people, not answering.',
  },
});

/** `vo.<cue>.1` is what the recording sheet and AudioEngine.say look for. */
export const palaceVoiceCue = (id) => `palace.${id}`;

/**
 * The profile a catalog line is RECORDED on.
 *
 * `PALACE_GUARD_BARK_CAST` is the split the payroll is moving to; until the
 * manifest carries it (see GUARD_SPLIT_RECORDED) the recorded truth is still
 * the one `cartel-guard` profile, and this reports the recorded truth so the
 * manifest and the catalog can be held to each other.
 */
export function palaceLineVoice(id, { recast = GUARD_SPLIT_RECORDED } = {}) {
  const line = PALACE_VOICE_LINES[id];
  if (!line) return null;
  return (recast && PALACE_GUARD_BARK_CAST[id]) || line.voice;
}

/** Every non-finale Palace line, in manifest-row shape. */
export function allPalaceVoiceLines({ recast = GUARD_SPLIT_RECORDED } = {}) {
  return Object.entries(PALACE_VOICE_LINES).map(([id, line]) => ({
    id,
    cue: palaceVoiceCue(id),
    name: `vo.${palaceVoiceCue(id)}.1`,
    voice: palaceLineVoice(id, { recast }),
    say: line.text,
    direction: line.direction ?? null,
  }));
}

/**
 * The eight guard barks as the SPLIT wants them, for the casting stage.
 *
 * This is the hand-off: the rows here are exactly what
 * `assets/sfx/manifest.json` should say once the three profiles exist, and
 * nothing in this repo rewrites that file from here.
 */
export function palaceRecastLines() {
  return allPalaceVoiceLines({ recast: true })
    .filter((row) => PALACE_GUARD_BARK_CAST[row.id]);
}

/** Colours for the subtitle, by voice, so a shout reads as somebody. */
/**
 * Where a mouth is, above the ground the speaker is standing on.
 *
 * `audible()` traces eye to mouth, so this is not decoration: it decides
 * whether a body behind a bench, a desk or a low wall can be heard. The three
 * values are the three postures anybody in this building actually holds.
 */
const STANDING_MOUTH_Y = 1.45;
/** On one knee, or crouched behind cover. */
export const KNEELING_MOUTH_Y = 0.95;
/** Face down on the floor, which is where a frightened civilian ends up. */
export const PRONE_MOUTH_Y = 0.35;

const VOICE_COLOUR = Object.freeze({
  player: '#cfd4e0',
  cleaner: '#c8d8b0',
  /* Three shades of the same payroll. A two-hander needs the subtitle to
   * change hands when the voice does -- they are all "CARTEL GUARD" because
   * the player never learns a name, but they must not look like one man
   * typing both halves of an argument. */
  'cartel-guard': '#d8a06a',
  'cartel-guard1': '#d8a06a',
  'cartel-guard2': '#c39a72',
  'cartel-guard3': '#e2b783',
});

const VOICE_NAME = Object.freeze({
  player: 'TONY',
  cleaner: 'ROSA',
  'cartel-guard': 'CARTEL GUARD',
  'cartel-guard1': 'CARTEL GUARD',
  'cartel-guard2': 'CARTEL GUARD',
  'cartel-guard3': 'CARTEL GUARD',
});

/**
 * Plays one line at a time, only when the player could plausibly hear it.
 *
 * @param {object} options
 * @param {object} options.audio    the scene's AudioEngine
 * @param {object} options.hud      the scene Hud, for the subtitle
 * @param {object} options.player   anything with a `.position` Vector3
 * @param {Function} [options.trace] `(from, to) => hit | null` — the scene's
 *   own collider tracer. Without one, sight is not tested and only radius
 *   applies; with one, a line never fires through a wall.
 * @param {Function} [options.vector] allocator for the two scratch points
 *   the sight test needs. The Palace passes THREE.Vector3 in; a headless
 *   test can pass nothing and skip the trace entirely.
 */
export class PalaceVoice {
  constructor({
    audio = null, hud = null, player = null, trace = null, vector = null, gap = 1.1,
    random = Math.random,
  } = {}) {
    this.audio = audio;
    this.random = typeof random === 'function' ? random : Math.random;
    this.hud = hud;
    this.player = player;
    this.trace = typeof trace === 'function' ? trace : null;
    this.vector = typeof vector === 'function' ? vector : null;
    /** Seconds that must pass between two lines. One floor, one voice. */
    this.gap = Math.max(0, Number(gap) || 0);
    this.timer = 0;
    this.spoken = [];
    this.said = new Set();
    this.current = null;
  }

  /** Simulated clock only — dt from the scene loop, never wall time. */
  update(dt) {
    const step = Math.max(0, Math.min(0.25, Number(dt) || 0));
    if (this.timer > 0) {
      this.timer = Math.max(0, this.timer - step);
      if (this.timer === 0) this.current = null;
    }
    return this.timer;
  }

  /** Is the speaker close enough, and can the player actually see them? */
  audible(position, radius, mouthY = STANDING_MOUTH_Y) {
    return this.audibility(position, radius, mouthY) !== 'blocked';
  }

  /**
   * A WALL AND A BENCH ARE NOT THE SAME OBJECT.
   *
   * `audible()` used to be a yes/no on one ray, and both answers were wrong
   * for the cleaner. Heard through the bench she is hiding behind, she is the
   * owner's "disembodied cleaner". Silenced by it, she is a woman the player
   * is meant to find who gives him nothing to find her by -- he only hears her
   * once he can already see her, which is too late to be a cue.
   *
   * The rule that separates them costs no new data and no material taxonomy:
   * trace to the speaker's REAL mouth, and if that is blocked, trace again to
   * where their mouth would be if they stood up.
   *
   *   clear     nothing in the way. Play it.
   *   occluded  blocked low, clear high -- the speaker is in the same open
   *             volume as the player, behind something he can see over. Play
   *             it muffled and quiet: sound goes round furniture.
   *   blocked   blocked at both heights. That is a wall, and the owner's rule
   *             stands: nothing is heard through it.
   *
   * It scopes itself. A standing speaker's two rays are the same ray, so a
   * guard can never be `occluded` and the payroll's barks behave exactly as
   * they did. Only somebody kneeling or prone can be in the middle case, which
   * is the only place the middle case makes sense.
   */
  audibility(position, radius, mouthY = STANDING_MOUTH_Y) {
    if (!position) return 'clear';
    const at = this.player?.position;
    if (!at) return 'clear';
    if (at.distanceTo(position) > radius) return 'blocked';
    if (!this.trace || !this.vector) return 'clear';
    /* Eye to mouth. A speaker behind a wall is a speaker the player has not
     * met yet, and the owner's note is explicit that they must not be heard
     * through it.
     *
     * AND THE MOUTH IS WHERE THE POSE PUTS IT. This used to be a flat 1.45 --
     * a standing man's mouth -- for every speaker in the building, including
     * ones lying face down on the floor. The cleaner is the case that found
     * it: she runs behind the entry bench when the shooting starts, goes
     * prone, and then repeats a line every nine seconds. The ray was testing a
     * point nearly a metre and a half ABOVE her, in clear air over the bench,
     * so she read as audible from anywhere in the hall while being completely
     * invisible behind it. Owner: *"Rosa apparently delivers her lines, but
     * the player cannot see her... it feels like enemies die and then a
     * disembodied cleaner starts talking."* She was not disembodied. She was
     * being heard through the furniture she was hiding behind. */
    const from = this.vector(at.x, at.y + 0.1, at.z);
    const to = this.vector(position.x, position.y + mouthY, position.z);
    if (this.trace(from, to) == null) return 'clear';
    if (mouthY >= STANDING_MOUTH_Y) return 'blocked';
    const standing = this.vector(position.x, position.y + STANDING_MOUTH_Y, position.z);
    return this.trace(from, standing) == null ? 'occluded' : 'blocked';
  }

  /** Subtitle colour for a voice profile, so a two-hander changes hands. */
  colourFor(voice) {
    return VOICE_COLOUR[voice] ?? '#cfd4e0';
  }

  /**
   * PLAY ONE CUE OFF A BODY, AND KEEP IT THERE.
   *
   * `AudioEngine.say` is the engine's one-voice-at-a-time channel and it
   * takes no position at all, which is fine for a line the player is
   * standing in front of and useless for two men murmuring across a dark
   * courtyard. This goes to `play()` directly with `follow`, so the panner is
   * seeded on the speaker and then re-sampled every frame he moves -- the
   * sound is on the man, not on the spot he was standing when he started.
   *
   * Returns `{ source, duration, name }`; `source` is what a caller CUTS to
   * stop a man mid-sentence, and null when the cue has no recording yet, in
   * which case the caller falls back to the line's authored hold.
   */
  playCue(cue, {
    follow = null, position = null, gain = SPEECH_GAIN.normal, radius = 22,
    muffle = 0,
  } = {}) {
    const empty = { source: null, duration: 0, name: null };
    if (!this.audio?.play || !this.audio.buffers) return empty;
    const prefix = `vo.${cue}.`;
    const takes = [];
    for (const name of this.audio.buffers.keys?.() ?? []) {
      if (name.startsWith(prefix)) takes.push(name);
    }
    if (!takes.length) return empty;
    takes.sort();
    const name = takes[Math.min(takes.length - 1, Math.floor(this.random() * takes.length))];
    /* Through the shared dialogue path, which is where the voice bus and the
     * duck live -- but NOT with the shared mix, which is the one place this
     * scene is deliberately different. `SPEECH_MIX` is built for a man talking
     * to you; a guard conversation in the Palace is meant to be quiet up close
     * and gone by the next courtyard, because walking toward it to hear it is
     * the gameplay. A tighter reference distance and a 1.6 rolloff are what
     * make it that. The 0.95 that used to sit on `volume` is gone: level is
     * the bus's business, distance is this scene's. */
    const spoken = speak(this.audio, name, {
      speaker: follow,
      position,
      gain,
      muffle,
      mix: { ref: 2.4, maxDist: radius, rolloff: 1.6 },
    });
    return { source: spoken.source ?? null, duration: spoken.seconds, name };
  }

  /**
   * Say one catalog line.
   *
   * @param {string} id                key in PALACE_VOICE_LINES
   * @param {object} [options]
   * @param {object} [options.position] world point the voice comes from;
   *   omit for the player's own internal lines, which are never gated.
   * @param {number} [options.radius]  metres the line carries (default 14)
   * @param {boolean} [options.once]   refuse a repeat of this cue (default true)
   * @param {boolean} [options.urgent] speak over whatever is running
   * @returns {boolean} whether the line was delivered.
   */
  say(id, {
    position = null, radius = 14, once = true, urgent = false, speaker = null,
    mouthY = STANDING_MOUTH_Y,
  } = {}) {
    const line = PALACE_VOICE_LINES[id];
    if (!line) return false;
    if (once && this.said.has(id)) return false;
    if (!urgent && this.timer > 0) return false;
    /* A `speaker` is a live body, so the line comes from wherever he is
     * standing THIS frame rather than from a point copied at the call site. */
    const at = speaker?.root?.position ?? position;
    const heard = this.audibility(at, radius, mouthY);
    if (heard === 'blocked') return false;
    /* Round the bench rather than through it. A lowpass at 900 Hz and a third
     * off the level is what a voice from behind low cover in the same room
     * sounds like -- present enough to walk toward, dull enough that the
     * player knows he cannot see her yet. See `audibility`. */
    const occluded = heard === 'occluded';
    const muffle = occluded ? 900 : 0;
    const gain = SPEECH_GAIN.normal * (occluded ? 0.66 : 1);

    const cue = palaceVoiceCue(id);
    /* ONE PATH, AND IT IS THE POSITIONED ONE.
     *
     * This used to fork: a line with a `speaker` body went through `playCue`
     * -- the shared dialogue path, with the voice bus, the duck and this
     * scene's own tight mix -- and a line with only a `position` went through
     * `AudioEngine.say`, which took the position and threw it away (fixed
     * there too). So every line in the Palace that is not shouted by a live
     * guard was played dead centre at full level with no panner on it. The
     * cleaner is the whole of that set, and "a disembodied cleaner starts
     * talking" is a precise description of the result.
     *
     * `follow` is the body where there is one and null where there is not;
     * `position` carries the rest. */
    const take = this.playCue(cue, {
      follow: speaker?.root ?? null,
      position: at,
      radius: Math.max(radius, 18),
      gain,
      muffle,
    });
    const recorded = take.duration;
    speaker?.figure?.say?.(
      Math.max(line.hold ?? 2.4, recorded),
      { audio: this.audio, source: take.source },
    );
    this.said.add(id);
    this.spoken.push(cue);
    this.current = id;
    this.timer = Math.max(line.hold ?? 2.4, recorded > 0 ? recorded + 0.4 : 0) + this.gap;
    /* The subtitle takes the SPEAKER's colour where there is one, so the
     * three-way split reads on screen as well as in the ear. */
    const profile = speaker ? palaceGuardVoice(speaker.id) : line.voice;
    const colour = VOICE_COLOUR[profile] ?? VOICE_COLOUR[line.voice] ?? '#cfd4e0';
    const who = VOICE_NAME[line.voice] ?? VOICE_NAME[profile] ?? 'VOICE';
    this.hud?.say?.(
      `<b style="color:${colour}">${who}</b> ${line.text}`,
      Math.min(7600, Math.max(1400, this.timer * 1000)),
    );
    return true;
  }

  /** Drop the floor — a checkpoint restore discards the timeline it came from. */
  reset({ forget = false } = {}) {
    this.timer = 0;
    this.current = null;
    if (forget) this.said.clear();
    return this;
  }

  /** JSON-safe view for tests and the verifier. */
  report() {
    return Object.freeze({
      current: this.current,
      speaking: this.timer > 0,
      spoken: [...this.spoken],
    });
  }
}
