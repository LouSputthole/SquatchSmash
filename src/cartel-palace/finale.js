/**
 * The dining-room confrontation — everything anybody says at Mark's table.
 *
 * Owner's direction (2026-08-19 playtest): the finale resolved through two
 * HUD lines and 6.35 seconds. Expand it: Tony's accusation, Sauce's
 * admission, Mark's reaction, and the wife and the two short men begging Tony
 * not to kill Mark — or anyone — all conditioned by the evidence actually
 * gathered. The RESOLUTION does not move: Mark and Sauce die, player-driven,
 * exactly as before. These beats precede and frame the trigger pull; they
 * never pull it.
 *
 * Lines are data, the Beef Run pattern (src/beefrun/script.js): a beat is an
 * ordered list of {who, text, hold}, `hold` in SECONDS of simulated clock —
 * the director runs on the dt the scene loop hands it, never wall time — and
 * a recorded take stretches its own hold so a delivered line is never cut
 * off. Dialogue is not gated on audio existing: an unrecorded cue shows its
 * subtitle and plays nothing, which is the whole scene today.
 *
 * `direction` on a line is for the recording session only (it becomes the
 * manifest row's delivery note); the runtime never reads it.
 */

import * as THREE from 'three';

import { EVIDENCE_IDS } from './mission.js';

export const FINALE_SPEAKERS = Object.freeze({
  TONY: Object.freeze({ name: 'TONY', colour: '#cfd4e0', voice: 'player', slug: 'tony' }),
  MARK: Object.freeze({ name: 'MARK', colour: '#e0b25c', voice: 'mark', slug: 'mark', combatant: 'mark' }),
  SAUCE: Object.freeze({ name: 'SAUCE', colour: '#d98a5a', voice: 'sauce', slug: 'sauce', combatant: 'sauce' }),
  WIFE: Object.freeze({ name: 'MRS. MARK', colour: '#d96a9a', voice: 'mark-wife', slug: 'wife', civilian: 'wife' }),
  /* Owner, 2026-08-25: *"Rename them Lola and Johnny."* Big Paco and Little
   * Paco are gone from the ids, the slugs and the words. That retires their
   * seventeen recorded takes and there was no way around it -- their names
   * were IN the lines. */
  LOLA: Object.freeze({ name: 'LOLA', colour: '#8fc4a8', voice: 'lola', slug: 'lola', civilian: 'lola' }),
  JOHNNY: Object.freeze({ name: 'JOHNNY', colour: '#8ab4d9', voice: 'johnny', slug: 'johnny', civilian: 'johnny' }),
});

const T = (text, hold, extra = null) => ({ who: 'TONY', text, hold, ...extra });
const M = (text, hold, extra = null) => ({ who: 'MARK', text, hold, ...extra });
const S = (text, hold, extra = null) => ({ who: 'SAUCE', text, hold, ...extra });
const W = (text, hold, extra = null) => ({ who: 'WIFE', text, hold, ...extra });
const L = (text, hold, extra = null) => ({ who: 'LOLA', text, hold, ...extra });
const J = (text, hold, extra = null) => ({ who: 'JOHNNY', text, hold, ...extra });

/*
 * Beat vocabulary:
 *   arrival.*      Mark greets the intruder — `loud` when the alarm is up.
 *   accuse[.id]    Tony's case, one beat per evidence piece ACTUALLY logged.
 *   admission.*    Sauce, cornered exactly as hard as the evidence corners
 *                  him: `cornered` (all three pieces), `pressed` (two),
 *                  `denial` (one or none — unreachable through today's
 *                  mission flow, which requires the full trail before the
 *                  dining room, but authored so the script can never play a
 *                  confession the player has not earned).
 *   mark.*         Mark's reaction on the same tier: resigned when the
 *                  ledger is on the table, deflecting when it is not.
 *   begging.*      The wife, then the double act, begging for no murders.
 *   go             Mark closes the negotiation; Tony's line carries
 *                  `engage: true` — the shooting may start on it.
 *   react.*        After a kill lands. `dive: true` sends both short men to
 *                  the floor BESIDE the table (the survivor alone if one is
 *                  already a rug stain); `react.dive-landed` is the
 *                  postscript they deliver from down there.
 */
export const FINALE_BEATS = Object.freeze({
  'arrival.quiet': [
    M('Tony. Sit down. We are having the veal — Sauce’s recipe. He was going to tell you. Eventually.', 5.2,
      { direction: 'Unhurried cartel-boss calm. A man offering dinner to the intruder in his house, certain the house wins.' }),
  ],
  'arrival.loud': [
    M('You shot your way through my payroll to ruin a Tuesday dinner. Sit down anyway. The veal is getting cold.', 5.4,
      { direction: 'Dry, annoyed, unafraid — the gunfire outside was an inconvenience to his evening, not a threat to his life.' }),
  ],
  accuse: [
    T('Six months. Six months I burned this state down looking for you, Sauce.', 4.2,
      { direction: 'Low and level, the anger already spent. He is not asking a question.' }),
  ],
  'accuse.belongings': [
    T('Your knives are folded in the guest suite next to your passport. Prisoners don’t get turn-down service.', 5.0,
      { direction: 'Flat prosecutor’s delivery, laying the first exhibit on the table.' }),
  ],
  'accuse.ledger': [
    T('Mark’s ledger pays you every other Friday. Hostages don’t get direct deposit.', 4.4,
      { direction: 'Second exhibit. Drier than the first — the joke is a scalpel, not a smile.' }),
  ],
  'accuse.still': [
    T('And the cameras caught you waving them goodnight. Nobody has ever chained you to anything.', 4.8,
      { direction: 'The last exhibit, and the coldest. The sentence ends the argument.' }),
  ],
  'admission.cornered': [
    S('Okay. Yeah. The kidnapping was less of a kidnapping and more of a — Mark, help me with the word.', 5.0,
      { direction: 'Caught flat and scrambling, hands half-raised, appealing sideways to his boss mid-sentence.' }),
    M('A rebrand.', 1.8,
      { direction: 'One bored word. He has said it in meetings before.' }),
    S('A rebrand. The family paid me in exposure and gunfire, Tony. Here I get dental. And a pool.', 5.2,
      { direction: 'Relieved to have the word, then genuinely, indefensibly sincere about the dental.' }),
  ],
  'admission.pressed': [
    S('Whoa, whoa. ‘Never a prisoner’ is a strong read. I was reluctant. At first. The first week. Day. The drive over.', 5.8,
      { direction: 'Backpedalling in real time, the timeline collapsing under him word by word.' }),
  ],
  'admission.denial': [
    S('Prisoner! That’s me. Blink twice, right? I’m blinking, Tony. This is me, blinking.', 4.6,
      { direction: 'Terrible acting, performed with full commitment. He blinks audibly if that is possible.' }),
  ],
  'mark.cornered': [
    M('He cooks, I pay, and nobody down there missed him until the food got worse. I’d apologize, but look at my house. I’m not sorry about anything.', 6.6,
      { direction: 'Resigned and expansive. He has seen the ledger on the table and skipped straight past denial to legacy.' }),
  ],
  'mark.pressed': [
    M('He begged me for this job. Ask the wall he did not climb over.', 3.8,
      { direction: 'Deflecting with contempt, gesturing at the architecture as his witness.' }),
  ],
  'mark.denial': [
    M('You broke into my home with a theory and a rifle. One of those is loaded.', 4.2,
      { direction: 'Amused, superior. He thinks the evidence is thin and he is enjoying saying so.' }),
  ],
  'begging.wife': [
    W('No, no, no. Baby — whoever you are — not the face. He just had work done. There is a DEPOSIT.', 5.2,
      { pose: 'pleading', direction: 'Desperate glamorous begging at full volume. “DEPOSIT” lands like a bereavement.' }),
    W('Take the cars. Take Sauce — he over-salts everything anyway—', 3.8,
      { direction: 'Bargaining fast, throwing the chef overboard without a flicker of hesitation.' }),
    S('Hey!', 1.1,
      { direction: 'Wounded. The over-salting accusation hurts more than the rifle.' }),
    W('—but nobody dies at dinner. This rug is hand-knotted. Blood never comes out of hand-knotted.', 5.0,
      { direction: 'Pleading for lives and upholstery in the same breath, and she means both equally.' }),
  ],
  'begging.shorts': [
    L('Boss man, listen. Me and him, we have personally witnessed maybe four hundred murders—', 4.2,
      { pose: 'pleading', direction: 'A short, urgent professional opening a negotiation. Fast, sincere, hands out.' }),
    J('—five hundred—', 1.3,
      { pose: 'pleading', direction: 'Correcting his partner instantly, like they keep a shared spreadsheet.' }),
    L('—five hundred murders, and not one of them improved the evening.', 3.6,
      { direction: 'Accepting the correction without pause and finishing the shared sentence.' }),
    J('Kill nobody, and we validate parking. Kill somebody, and we scream, we dive under the table, it becomes a whole thing.', 5.8,
      { direction: 'Laying out both packages like a waiter reciting specials. Deadly serious about the logistics.' }),
    L('It is rehearsed, but it is a whole thing.', 2.8,
      { direction: 'Quiet, confidential postscript. She is not proud that it is rehearsed. She is a little proud.' }),
  ],

  /* ---------------------------------------------------------------- *
   * THE TABLE BREAKS UP.
   *
   * Owner, 2026-08-25: *"You go into the back room and confront Sauce. Mark
   * scrambles away. You then kill sauce and chose to kill his two short
   * people."*
   *
   * So `go` no longer starts a two-man fight. Tony's verdict still carries
   * `engage`, and it still means the shooting may start -- but the only man
   * it activates is the chef. Mark's exit is the same beat, on the line
   * carrying `scramble`, and it is the ONE thing in this script that changes
   * who is in the room.
   * ---------------------------------------------------------------- */
  go: [
    M('Enough. He did not climb my wall to hear the help negotiate.', 3.8,
      { direction: 'The boss ends the begging. Chair pushed back, evening over.' }),
    T('The ledger says you bought him. The footage says he sold us. I say dinner’s over.', 4.6,
      { engage: true, direction: 'Verdict. Ice-flat, no rise at the end. The safety comes off on the last word.' }),
    M('It is. Sauce — you brought him into my house. You entertain him.', 4.4,
      { scramble: true, direction: 'Not a threat and not a retreat, in his own mind: a delegation. He is already standing, already turning, and does not raise his voice once.' }),
  ],
  'mark.scramble': [
    S('Mark. Mark! MARK.', 2.6,
      { direction: 'Three attempts at the same word, each one smaller than the last.' }),
    W('He is very fast for a big man. He has always been very fast.', 3.6,
      { direction: 'Flat, admiring, entirely unhelpful. She is watching her husband leave and appraising his gait.' }),
  ],
  'sauce.alone': [
    S('Twenty years. Twenty years I cooked for that man, and he is going to leave me at the table.', 5.4,
      { direction: 'The realisation arriving in real time, out loud, to nobody. Not frightened yet — insulted.' }),
    S('Fine. FINE. You want to know what I am, Tony? I am the only one in this house who ever finished anything.', 5.6,
      { direction: 'A chef losing his temper, which is a specific and dangerous kind of temper. He goes for the gun on the last word.' }),
  ],

  /* ---------------------------------------------------------------- *
   * THE CHEF IS DOWN, AND THE TWO PEOPLE WHO WORKED FOR HIM ARE NOT.
   *
   * `begging.after-sauce` is the choice the owner asked for, in words: they
   * are Sauce's staff, they are unarmed, the mission does not count them, and
   * the player decides. What happens next is the only thing in the Palace
   * that changes how the boss fight goes.
   * ---------------------------------------------------------------- */
  'react.sauce-down': [
    W('The CHEF?! Who garnishes the branzino now, you son of a bitch?!', 4.2,
      { direction: 'Screamed fury. The catering implications hit her before the mortality does.' }),
    J('He still owed me forty bucks—', 1.9,
      { direction: 'Genuine dismay, already crouching.' }),
    L('—forty bucks, gone. AWAY from the table. AWAY from the table!', 2.8,
      { dive: true, direction: 'Finishes the accounting, then the bark, then the dive. All three at full commitment.' }),
  ],
  'begging.after-sauce': [
    /* NO `pose` ON THESE TWO, and that is load-bearing. They are talking from
     * the floor -- `react.sauce-down` sent them there on the line before --
     * and a `pose: 'pleading'` here stands them straight back up to beg, which
     * is what the first pass did and what the dive test caught. */
    L('We do not cook. We never cooked. We carried things for a man who is now on the tablecloth.', 5.4,
      { direction: 'From the floor, fast and reasonable, laying out a position rather than begging. She thinks this is going to work.' }),
    J('We can carry things for you. We are very good at carrying things.', 3.6,
      { direction: 'Helpfully, and flat on his face. He is applying for a job over a corpse and he means it sincerely.' }),
    L('That is the whole offer. It is not a big offer.', 3.0,
      { direction: 'Quiet. She knows exactly how small it is and puts it on the table anyway.' }),
  ],

  /* ---------------------------------------------------------------- *
   * THE REPRISAL, IN THREE.
   *
   * Owner, 2026-08-25: *"Maybe you fight him and knock down his amour then he
   * retreats and then sends a wave of A team members who you blast and then he
   * comes out again enraged for the third and final fight of the scene."*
   *
   * `enter` is stage one, `armor-broken` ends it, `wave` is stage two, and
   * `final` is stage three. Each has a COLD and an ENRAGED variant, and which
   * one plays is decided by whether Lola and Johnny are still breathing --
   * the enrage is the consequence of the choice above, not a difficulty
   * setting.
   * ---------------------------------------------------------------- */
  'reprisal.enter.cold': [
    M('You shot my chef in my dining room. On a Tuesday.', 3.8,
      { direction: 'Back through the door, unhurried, genuinely aggrieved about the day of the week.' }),
    M('I was going to let you leave here with a theory. Now I have to do the leaving-you-here part myself.', 5.4,
      { engage: true, direction: 'Reasonable to the last syllable. The rifle comes up on "myself" and nothing in his voice changes.' }),
  ],
  'reprisal.enter.enraged': [
    M('They CARRIED things. That is the whole of what they did in this house. They carried things.', 5.2,
      { direction: 'Not shouted. Said slowly, twice, because he cannot get past it.' }),
    M('Nothing in your ledger said to do that. You read my books and then you did that anyway.', 4.8,
      { direction: 'The one moment in the mission where the man is not performing. It should be uncomfortable.' }),
    M('Come here.', 1.6,
      { engage: true, direction: 'Two words, quiet, and he is already moving.' }),
  ],
  'reprisal.armor-broken': [
    M('All right. All right — that is a good rifle.', 3.2,
      { direction: 'Winded, plates gone, and complimenting the weapon. Buying the four seconds it takes to get through the door.' }),
    M('BOYS. Dining room. Bring everybody.', 3.0,
      { wave: true, direction: 'Bellowed down a corridor, the first time all night he has raised his voice.' }),
  ],
  'reprisal.wave': [
    W('That is the good crew. He keeps the good crew for weddings.', 4.0,
      { direction: 'From behind the sideboard, appalled at the expense.' }),
  ],
  'reprisal.wave-cleared': [
    J('They are all on the rug.', 2.4,
      { direction: 'Muffled, from under the table, doing an inventory.' }),
    W('They are ALL on the rug.', 2.6,
      { direction: 'The same four words, entirely different grief.' }),
  ],
  'reprisal.final.cold': [
    M('No vest. No boys. No chef.', 3.0,
      { direction: 'Counting what is gone, in a tone that suggests he has done this arithmetic before.' }),
    M('Just the man who came to my house on a Tuesday, and me.', 4.2,
      { engage: true, direction: 'Almost hospitable. He walks out into the open on purpose.' }),
  ],
  'reprisal.final.enraged': [
    M('They carried things.', 2.0,
      { direction: 'Still on it. He has been standing behind that wall thinking about it.' }),
    M('Say one word to me about the ledger. Say one word, and I will put you through the wall my wife chose.', 5.8,
      { engage: true, direction: 'The full thing, finally uncapped. No performance left in it at all.' }),
  ],

  'react.mark-first': [
    W('MARCO! You shot him in the FACE — the deposit, you ANIMAL, the DEPOSIT!', 4.6,
      { direction: 'Screamed over a fresh corpse. Grief and cosmetic-surgery accounting at equal volume.' }),
    L('NOT the table! AWAY from the table!', 1.6,
      { dive: true, direction: 'One barked correction, already moving. Twenty years of the wrong drill, unlearned mid-air.' }),
    J('AWAY FROM THE TABLE!', 1.3,
      { dive: true, direction: 'The identical bark a half-beat later. It is rehearsed. It is finally rehearsed correctly.' }),
  ],
  'react.dive-landed': [
    L('Wall. The WALL is cover. A table is a table.', 3.4,
      { direction: 'Winded, flat on the floor, delivering the correction like somebody who has just lost an argument with physics.' }),
    J('I am updating the procedure.', 2.2,
      { direction: 'Muffled and absolutely serious. Somewhere there is a laminated card and he intends to reprint it.' }),
  ],
  'react.all-down': [
    W('FINE! Fine. I hope every rug you ever love betrays you. Now get out of my house, you gorgeous psychopath!', 5.8,
      { direction: 'The full aria: cursing Tony out, vicious and operatic, with one involuntary compliment in the middle.' }),
    L('We saw nothing.', 1.7,
      { direction: 'Muffled, from under the table, instantly cooperative.' }),
    J('We are continuing to see nothing.', 2.4,
      { direction: 'Also from under the table, providing ongoing legal coverage.' }),
  ],
  'react.wife-down': [
    L('He shot the missus! The missus is DOWN!', 2.8,
      { dive: true, direction: 'Genuine panic, announced like a ring judge, already moving.' }),
    J('On the RUG! She is ON the rug!', 2.6,
      { dive: true, direction: 'Horrified — for her, and on her behalf about the rug, which she loved.' }),
  ],
  'react.lola-down': [
    J('LOLA. You had two centimetres on me. Two whole centimetres, and you never once let me forget it.', 5.2,
      { dive: true, direction: 'Grief measured in the only unit that ever mattered between them.' }),
  ],
  'react.johnny-down': [
    L('JOHNNY! You magnificent half-portion — I am not covering your shifts!', 3.8,
      { dive: true, direction: 'Bereft and furious about the rota in the same scream.' }),
  ],
});

/**
 * The recording cue for one line: `palace.finale.<speaker>.<beat>-<n>`.
 * Per line, never pooled — the subtitle on screen is a specific sentence and
 * mismatched words are worse than silence (the Beef Run rule). The engine's
 * `say()` matches `vo.<cue>.<take>`, so `palace.finale.wife.begging.wife-1`
 * is read from `assets/sfx/vo.palace.finale.wife.begging.wife-1.1.mp3`.
 */
export const finaleCueOf = (beatId, index, who) => (
  `palace.finale.${FINALE_SPEAKERS[who]?.slug ?? 'tony'}.${beatId}-${index + 1}`
);

/** Every cue the finale can ask for, with the words and delivery that go in it. */
export function allFinaleCues() {
  const out = [];
  for (const [id, beat] of Object.entries(FINALE_BEATS)) {
    beat.forEach((line, index) => out.push({
      cue: finaleCueOf(id, index, line.who),
      who: line.who,
      voice: FINALE_SPEAKERS[line.who].voice,
      text: line.text,
      direction: line.direction ?? null,
      beat: id,
    }));
  }
  return out;
}

/**
 * The confrontation the player has actually earned, as an ordered beat list.
 * More evidence found = Sauce more cornered and Mark more resigned; a thin
 * trail plays denial instead of confession. Today's mission flow requires
 * the full trail before the dining room opens, so `cornered` is the tier
 * that ships — the lower tiers are the contract that the script can never
 * outrun the player's case.
 */
export function composeConfrontation({ evidenceFound = [], alarmRaised = false } = {}) {
  const valid = Object.values(EVIDENCE_IDS);
  const found = valid.filter((id) => evidenceFound.includes(id));
  const tier = found.length >= 3 ? 'cornered' : found.length === 2 ? 'pressed' : 'denial';
  const beats = [alarmRaised ? 'arrival.loud' : 'arrival.quiet', 'accuse'];
  const accuseBeat = Object.freeze({
    [EVIDENCE_IDS.BELONGINGS]: 'accuse.belongings',
    [EVIDENCE_IDS.PAYMENT_LEDGER]: 'accuse.ledger',
    [EVIDENCE_IDS.SECURITY_STILL]: 'accuse.still',
  });
  for (const id of valid) if (found.includes(id)) beats.push(accuseBeat[id]);
  beats.push(`admission.${tier}`, `mark.${tier}`, 'begging.wife', 'begging.shorts', 'go');
  return beats;
}

/*
 * WHERE THE DOUBLE ACT LANDS.
 *
 * Owner, 2026-08-20 playtest: *"their dive animation must land them BESIDE
 * or AWAY from the table, not underneath it. Check the navigation target
 * before the animation begins and reserve clearance around chairs/table so
 * the landing does not intersect furniture."*
 *
 * They used to land at (2.4, -42.5) and (0.7, -42.3), which is dead under
 * Mark's 9.8 x 2.2 table -- a prone 1.5 m rig inside a table top at 0.82 m,
 * so both of them clipped through it every time.
 *
 * The clearance the landing has to respect, measured off world.js's final
 * dining stage:
 *
 *   table       x -4.9..4.9,  z -43.5..-41.3   (collider 9.8 x 2.2)
 *   end chairs  x  5.1..6.0,  z -42.85..-41.95 (and its mirror at -6.0..-5.1)
 *   long chairs x -4.05..4.05 in pairs, z -44.65..-43.75
 *   credenza    x  8.35..10.85, z -36.98..-36.22
 *   sideboard   x 12.8..16.6,  z -43.875..-43.125
 *
 * Both landings sit in open floor east of the chair line and south of the
 * table, and `_diveClearance` proves it against the LIVE collider list at
 * dive time rather than trusting these numbers to stay true.
 */
const DIVE_POINTS = Object.freeze({
  lola: Object.freeze(new THREE.Vector3(8.0, 0, -46.0)),
  johnny: Object.freeze(new THREE.Vector3(9.6, 0, -44.4)),
});

/** Half-width of the box a prone rig needs to land in without clipping. */
const DIVE_CLEARANCE = 0.95;
const DIVE_SECONDS = 0.55;

/* How hard each civilian shakes, by phase. `HeistFigure.update`'s fear term. */
const FEAR = Object.freeze({
  idle: 0, confrontation: 0.35, combat: 0.8, aftermath: 0.5,
});

/**
 * Plays the confrontation and its reactions one line at a time through the
 * scene HUD subtitle — a single dialogue floor, never two voices at once —
 * and owns the three civilians' presentation: poses, fear, and the dive.
 *
 * The director never touches the mission or the Combatants. Engagement is a
 * callback: `onEngage` fires exactly once, either when Tony's verdict line
 * starts or the moment the player opens fire early (`interrupt`), and the
 * caller activates the final encounter — the same activation, the same
 * player-driven kills, as before this script existed.
 */
export class PalaceFinaleDirector {
  constructor({
    cast, hud, audio = null, colliders = [],
    onEngage = () => {},
    onScramble = () => {},
    onMarkReturn = () => {},
    onMarkRetreat = () => {},
    onWave = () => {},
  } = {}) {
    if (!cast?.civilians) throw new TypeError('PalaceFinaleDirector requires a cast with civilians');
    this.cast = cast;
    /* The live palace collider list, for `_diveClearance`. Empty is legal: a
     * harness with no world simply gets the authored landing points. */
    this.colliders = Array.isArray(colliders) ? colliders : [];
    this.hud = hud;
    this.audio = audio;
    this.onEngage = onEngage;
    this.onScramble = onScramble;
    this.onMarkReturn = onMarkReturn;
    this.onMarkRetreat = onMarkRetreat;
    this.onWave = onWave;
    this.phase = 'idle';
    /**
     * WHICH OF THE THREE STAGES THE ROOM IS IN.
     *
     * `phase` stayed what it always was -- idle / confrontation / combat /
     * aftermath -- because the civilians' fear term and every checkpoint path
     * read it. `stage` is the new axis, and it is the fight:
     *
     *   confrontation  the table, the words, Mark still in the room
     *   sauce          Mark has gone; the chef is on his own
     *   reprisal-one   Mark is back, in his plates
     *   wave           his plates are off and the A-Team is in the room
     *   reprisal-final he is back out with nothing left
     *   done           the room is his wife's problem now
     */
    this.stage = 'confrontation';
    /** Lola or Johnny died. Decides which half of every reprisal beat plays. */
    this.enraged = false;
    /** Fired once when the line queue next runs dry. The stages are paced by
     * the dialogue rather than by a timer, so a slow take never gets talked
     * over by the next man coming through the door. */
    this._after = null;
    this.engaged = false;
    this.dived = false;
    this.queue = [];
    this.current = null;
    this.timer = 0;
    this.spoken = [];
    this._divers = [];
    this._reacted = new Set();
  }

  _speakerEntry(who) {
    const speaker = FINALE_SPEAKERS[who];
    if (speaker?.civilian) {
      return this.cast.civilians.find((entry) => entry.id === speaker.civilian) ?? null;
    }
    if (speaker?.combatant === 'mark') return this.cast.mark;
    if (speaker?.combatant === 'sauce') return this.cast.sauce;
    return null;
  }

  /** Queue one authored beat. `urgent` clears the floor first. */
  play(beatId, { urgent = false } = {}) {
    const beat = FINALE_BEATS[beatId];
    if (!beat) return false;
    if (urgent) {
      this.queue.length = 0;
      this.current = null;
      this.timer = 0;
    }
    beat.forEach((line, index) => this.queue.push({
      ...line, beat: beatId, cue: finaleCueOf(beatId, index, line.who),
    }));
    return true;
  }

  /** The dining doors just opened on a live room. */
  beginConfrontation({ evidenceFound = [], alarmRaised = false } = {}) {
    if (this.phase !== 'idle') return false;
    this.phase = 'confrontation';
    for (const entry of this.cast.civilians) {
      if (!entry.down) entry.figure.setState?.('startled', { blend: true });
    }
    for (const beatId of composeConfrontation({ evidenceFound, alarmRaised })) this.play(beatId);
    return true;
  }

  /** The player opened fire before the verdict: the words lose, the room engages. */
  interrupt() {
    if (this.phase !== 'confrontation' || this.engaged) return false;
    this.queue.length = 0;
    this.current = null;
    this.timer = 0;
    this._engage();
    return true;
  }

  /**
   * A line carrying `engage` has started, and what that MEANS depends on which
   * stage the room is in.
   *
   * It used to mean one thing -- activate Mark and Sauce -- because there was
   * one fight. There are three now, and each opens on its own line: Tony's
   * verdict opens the chef, Mark's return opens stage one, and his last walk
   * out of the doorway opens the end of it. Same flag, same contract (the
   * shooting may start on this line), three different rooms.
   */
  _engage() {
    this.phase = 'combat';
    if (this.stage === 'reprisal-one') {
      this.onMarkReturn({ armored: true, enraged: this.enraged });
      return;
    }
    if (this.stage === 'reprisal-final') {
      this.onMarkReturn({ armored: false, enraged: this.enraged });
      return;
    }
    if (this.engaged) return;
    this.engaged = true;
    this.onEngage();
  }

  /**
   * Mark leaves the table.
   *
   * Owner, 2026-08-25: *"You go into the back room and confront Sauce. Mark
   * scrambles away."* The line carrying `scramble` is where he goes, and it is
   * the only thing in the confrontation that changes who is in the room.
   */
  _scramble() {
    if (this.stage !== 'confrontation') return false;
    this.stage = 'sauce';
    this.onScramble();
    this.play('mark.scramble');
    this.play('sauce.alone');
    return true;
  }

  /** His plates are gone. He buys four seconds and spends them on a door. */
  onArmorBroken() {
    if (this.stage !== 'reprisal-one') return false;
    this.stage = 'wave';
    this.onMarkRetreat();
    this.play('reprisal.armor-broken', { urgent: true });
    return true;
  }

  /** Stage one: he comes back for the chef nobody else was going to answer for. */
  _beginReprisal() {
    if (this.stage !== 'sauce' || this.cast.mark.down) return false;
    this.stage = 'reprisal-one';
    this.play(this.enraged ? 'reprisal.enter.enraged' : 'reprisal.enter.cold');
    return true;
  }

  /** Stage three: no vest, no boys, no chef. */
  _beginFinalStage() {
    if (this.stage !== 'wave' || this.cast.mark.down) return false;
    this.stage = 'reprisal-final';
    this.play(this.enraged ? 'reprisal.final.enraged' : 'reprisal.final.cold');
    return true;
  }

  /**
   * Checkpoint staging for a room whose encounter is already live: no
   * replayed speech, no second activation — the caller has activated the
   * encounter itself, so `onEngage` deliberately does not fire.
   */
  skipConfrontation() {
    if (this.engaged) return false;
    this.engaged = true;
    this.phase = 'combat';
    /* A checkpoint that resumes into a live dining room resumes into the
     * CHEF's half of it: `dining_room` is saved the moment the doors open, and
     * what the doors open on since the rewire is Sauce alone. */
    this.stage = 'sauce';
    for (const entry of this.cast.civilians) {
      if (!entry.down) entry.figure.setState?.('startled', { blend: false });
    }
    return true;
  }

  /** Checkpoint staging for the cleared room: kills already landed. */
  stageAftermath() {
    this.skipConfrontation();
    this.phase = 'aftermath';
    this.stage = 'done';
    this._after = null;
    this._reacted.add('mark').add('sauce').add('all');
    this.dived = true;
    for (const entry of this.cast.civilians) {
      if (entry.down) continue;
      const divePoint = DIVE_POINTS[entry.id];
      if (divePoint) {
        entry.root.position.copy(divePoint);
        entry.figure.setState?.('prone', { blend: false });
      } else {
        entry.figure.setState?.('startled', { blend: false });
      }
    }
    return true;
  }

  /**
   * A kill landed (the mission has already counted it). This is where the
   * three stages actually turn over.
   *
   * The chef going down starts the reprisal; the wave running out of men ends
   * stage two; Mark going down ends the mission whenever it happens. Each
   * transition is queued BEHIND its own reaction lines rather than fired on
   * the same frame -- see `_after` -- so nobody comes through a door on top of
   * somebody else's sentence.
   */
  onTargetDown(id) {
    if (this._reacted.has(id)) return false;
    const waveMember = this.cast.wave?.some((entry) => entry.id === id);

    if (waveMember) {
      this._reacted.add(id);
      if (this.stage !== 'wave') return true;
      if ((this.cast.waveStanding?.() ?? 0) > 0) return true;
      this.play('reprisal.wave-cleared', { urgent: true });
      this._after = () => this._beginFinalStage();
      return true;
    }

    if (!['mark', 'sauce'].includes(id)) return false;
    this._reacted.add(id);

    if (id === 'sauce') {
      /* HE MAY NEVER HAVE GOT HIS LINE OUT.
       *
       * The verdict carries `engage`, and the delegation that carries
       * `scramble` is the line AFTER it -- so a player who fires the moment
       * the safety comes off kills the chef with Mark still mid-sentence, and
       * the urgent reaction below clears the floor and takes that line with
       * it. The room still has to turn over: without the scramble the stage
       * never leaves `confrontation`, `_beginReprisal` refuses, and the fight
       * has no stage one at all. Idempotent, so the ordinary path where he
       * finished the sentence pays nothing. */
      this._scramble();
      this._engage();
      if (!this._reacted.has('first')) {
        this._reacted.add('first');
        this.play('react.sauce-down', { urgent: true });
        this._dive();
        this.play('begging.after-sauce');
      }
      /* And whatever the player does about the two people on the floor, Mark
       * is coming back. Killing them changes which Mark. */
      this._after = () => this._beginReprisal();
      return true;
    }

    /* Mark. Whenever and however it lands, that is the room finished. */
    if (!this._reacted.has('first')) {
      this._reacted.add('first');
      this.play('react.mark-first', { urgent: true });
      this._dive();
    }
    if (!this._reacted.has('all')) {
      this._reacted.add('all');
      this.play('react.all-down');
      this.phase = 'aftermath';
      this.stage = 'done';
      this._after = null;
    }
    return true;
  }

  /**
   * The player put one of the unarmed people down. The mission does not care.
   *
   * The ROOM does, and since 2026-08-25 so does Mark: Lola and Johnny are
   * Sauce's staff, and shooting them is what turns the man who was going to
   * kill Tony professionally into the man who is going to enjoy it. Owner:
   * *"chose to kill his two short people... Once you do this it enrages him
   * for the final boss fight."*
   *
   * It is a modifier, never a gate. Leave them alive and Mark still comes
   * back -- he is not going to let the chef go unanswered either way -- he
   * just comes back cold. A fight the player can lock himself out of by being
   * merciful is not a choice, it is a trap.
   */
  onCivilianDown(entry) {
    if (!entry?.id || this._reacted.has(`civilian-${entry.id}`)) return false;
    this._reacted.add(`civilian-${entry.id}`);
    if (entry.id === 'lola' || entry.id === 'johnny') this.enraged = true;
    const beat = entry.id === 'wife' ? 'react.wife-down'
      : entry.id === 'lola' ? 'react.lola-down' : 'react.johnny-down';
    this.play(beat);
    return true;
  }

  /**
   * Is this landing actually clear?
   *
   * The owner's instruction is explicit that the navigation target is
   * checked BEFORE the animation begins, so this asks the furniture rather
   * than a comment: `colliders` is the live palace list, and a landing whose
   * clearance box overlaps any waist-height collider is refused -- the man
   * goes down where he stands instead of into a chair.
   */
  _diveClearance(point) {
    for (const box of this.colliders) {
      if (!box?.min || !box?.max) continue;
      // Waist height: the boxes that matter are tables, chairs and cabinets.
      if (box.max.y < 0.08 || box.min.y > 1.1) continue;
      if (point.x > box.min.x - DIVE_CLEARANCE && point.x < box.max.x + DIVE_CLEARANCE
        && point.z > box.min.z - DIVE_CLEARANCE && point.z < box.max.z + DIVE_CLEARANCE) {
        return false;
      }
    }
    return true;
  }

  /** Both short men to the floor BESIDE the table — the survivor alone if one is down. */
  _dive() {
    if (this.dived) return;
    this.dived = true;
    for (const entry of this.cast.civilians) {
      const divePoint = DIVE_POINTS[entry.id];
      if (!divePoint || entry.down) continue;
      entry.figure.setState?.('prone', { blend: true });
      const to = this._diveClearance(divePoint) ? divePoint : entry.root.position.clone();
      this._divers.push({
        entry,
        from: entry.root.position.clone(),
        to,
        t: 0,
      });
    }
    /* Queued, not urgent: it lands behind whichever reaction beat sent them
     * down, which is exactly where a postscript belongs. */
    if (this._divers.length) this.play('react.dive-landed');
  }

  _fear() {
    return FEAR[this.phase] ?? 0;
  }

  /**
   * Start the recorded take for one line, if it exists, and return how long
   * it runs. `say()` is the engine's one-voice-at-a-time channel, so starting
   * a line silences the previous take — the subtitle owns the floor. Missing
   * recordings cost nothing: the bank scan finds no take and the line reads
   * on its authored hold alone.
   */
  _say(line) {
    if (!this.audio?.say) return 0;
    const prefix = `vo.${line.cue}.`;
    let duration = 0;
    for (const [name, bank] of this.audio.buffers?.entries?.() ?? []) {
      if (!name.startsWith(prefix)) continue;
      for (const buffer of bank) duration = Math.max(duration, buffer?.duration || 0);
    }
    const started = this.audio.say(line.cue, { chance: 1, volume: 1 });
    if (started) {
      const entry = this._speakerEntry(line.who);
      entry?.figure?.voiceMouth?.speak?.({
        audio: this.audio,
        source: this.audio.spokenSource?.() ?? null,
      });
    }
    return started ? duration : 0;
  }

  /** Simulated clock only: `dt` comes from the scene loop, never wall time. */
  update(dt) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));

    /* Civilians are not Combatants: PalaceSecurity never ticks their figures,
     * so their breathing, tremble, pose blends and mouths advance here. */
    const fear = this._fear();
    for (const entry of this.cast.civilians) {
      entry.figure.update(step, { fear: entry.down ? 0 : fear });
    }
    for (let index = this._divers.length - 1; index >= 0; index--) {
      const diver = this._divers[index];
      diver.t = Math.min(1, diver.t + step / DIVE_SECONDS);
      /* Smoothstep, so the dive leaves and lands rather than teleports. */
      const eased = diver.t * diver.t * (3 - 2 * diver.t);
      diver.entry.root.position.lerpVectors(diver.from, diver.to, eased);
      if (diver.t >= 1) this._divers.splice(index, 1);
    }

    if (this.timer > 0) {
      this.timer -= step;
      return;
    }
    if (!this.queue.length) {
      this.current = null;
      /* THE STAGES ARE PACED BY THE DIALOGUE, NOT BY A TIMER.
       *
       * A stage change fired on the frame the kill lands puts Mark through the
       * door on top of somebody else's sentence, and a stage change on a
       * guessed delay is the same bug with a number in it. `_after` runs when
       * the floor is genuinely clear -- so a slow take simply delays the door,
       * which is what a director would do. Taken before it is called, because
       * what it schedules is usually more speech. */
      const next = this._after;
      this._after = null;
      next?.();
      return;
    }
    const line = this.queue.shift();
    const speakerEntry = this._speakerEntry(line.who);
    /* The dead do not deliver lines; their half of a double act is skipped
     * and the survivor carries on. Mark and Sauce may still speak while
     * down-but-scripted is impossible for them (their lines all precede the
     * engagement), so the same rule covers everyone. */
    if (speakerEntry?.down) {
      /* The dead do not deliver, but the ROOM still has to turn over: a
       * scramble or a wave call skipped because its speaker was shot is a
       * mission that cannot continue. */
      if (line.engage) this._engage();
      if (line.scramble) this._scramble();
      if (line.wave) this.onWave();
      return;
    }
    this.current = line;
    if (line.engage) this._engage();
    if (line.scramble) this._scramble();
    if (line.wave) this.onWave();
    if (line.dive) this._dive();
    if (line.pose && speakerEntry && !speakerEntry.down) {
      speakerEntry.figure.setState?.(line.pose, { blend: true });
    }
    const recorded = this._say(line);
    this.timer = Math.max(line.hold ?? 2.4, recorded > 0 ? recorded + 0.45 : 0);
    const speaker = FINALE_SPEAKERS[line.who];
    this.spoken.push(line.cue);
    this.hud?.say?.(
      `<b style="color:${speaker.colour}">${speaker.name}</b> ${line.text}`,
      Math.min(7600, Math.max(1400, this.timer * 1000 + 400)),
    );
  }

  /** Drop pending speech without touching phase — a checkpoint restore's floor sweep. */
  clearLines() {
    this.queue.length = 0;
    this.current = null;
    this.timer = 0;
  }

  /** JSON-safe view for the verifier and tests. */
  report() {
    return Object.freeze({
      phase: this.phase,
      stage: this.stage,
      enraged: this.enraged,
      engaged: this.engaged,
      dived: this.dived,
      spoken: [...this.spoken],
      pendingCues: this.queue.map((line) => line.cue),
    });
  }
}
