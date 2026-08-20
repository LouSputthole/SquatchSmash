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
    voice: 'player', hold: 3.8,
    text: 'Every other Friday. In Mark’s own hand. So Sauce was involved.',
    direction: 'Ice-flat. This is the line where the rescue stops being a rescue.',
  },
  'tony.evidence.complete': {
    voice: 'player', hold: 4.2,
    text: 'Six months I tore this state apart for you. You were down here getting paid.',
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
    text: 'Somebody wake Mister Mark. Now.',
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

/** Every non-finale Palace line, in manifest-row shape. */
export function allPalaceVoiceLines() {
  return Object.entries(PALACE_VOICE_LINES).map(([id, line]) => ({
    id,
    cue: palaceVoiceCue(id),
    name: `vo.${palaceVoiceCue(id)}.1`,
    voice: line.voice,
    say: line.text,
    direction: line.direction ?? null,
  }));
}

/** Colours for the subtitle, by voice, so a shout reads as somebody. */
const VOICE_COLOUR = Object.freeze({
  player: '#cfd4e0',
  cleaner: '#c8d8b0',
  'cartel-guard': '#d8a06a',
});

const VOICE_NAME = Object.freeze({
  player: 'TONY',
  cleaner: 'ROSA',
  'cartel-guard': 'CARTEL GUARD',
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
  } = {}) {
    this.audio = audio;
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
  audible(position, radius) {
    if (!position) return true;
    const at = this.player?.position;
    if (!at) return true;
    if (at.distanceTo(position) > radius) return false;
    if (!this.trace || !this.vector) return true;
    /* Eye to mouth. A speaker behind a wall is a speaker the player has not
     * met yet, and the owner's note is explicit that they must not be heard
     * through it. */
    const from = this.vector(at.x, at.y + 0.1, at.z);
    const to = this.vector(position.x, position.y + 1.45, position.z);
    return this.trace(from, to) == null;
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
    position = null, radius = 14, once = true, urgent = false,
  } = {}) {
    const line = PALACE_VOICE_LINES[id];
    if (!line) return false;
    if (once && this.said.has(id)) return false;
    if (!urgent && this.timer > 0) return false;
    if (!this.audible(position, radius)) return false;

    const cue = palaceVoiceCue(id);
    let recorded = 0;
    if (this.audio?.say) {
      const prefix = `vo.${cue}.`;
      for (const [name, bank] of this.audio.buffers?.entries?.() ?? []) {
        if (!name.startsWith(prefix)) continue;
        for (const buffer of bank) recorded = Math.max(recorded, buffer?.duration || 0);
      }
      if (!this.audio.say(cue, { chance: 1, volume: 1, position })) recorded = 0;
    }
    this.said.add(id);
    this.spoken.push(cue);
    this.current = id;
    this.timer = Math.max(line.hold ?? 2.4, recorded > 0 ? recorded + 0.4 : 0) + this.gap;
    const colour = VOICE_COLOUR[line.voice] ?? '#cfd4e0';
    const who = VOICE_NAME[line.voice] ?? 'VOICE';
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
