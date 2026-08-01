/**
 * The Family, on the floor of their own club.
 *
 * The owner's standing rule (docs/VOICE-CASTING.md): everyone in the Family
 * table hangs out at the Bada Bing when the player is not on their mission,
 * with their real faces, and each of them is the same person everywhere —
 * one stable campaign id, one face, one voice, every scene.
 *
 * This module is the roster, the seating plan, the presence rules and the
 * words. The systems that play it — the Npc figures, the dialogue machine,
 * the audio engine — are the club's own; nothing here duplicates them.
 *
 * Faces come through the same photo pipeline the club already uses for Big
 * Uncle Lou: one image on the front of a box skull (`makePerson`'s `face`).
 * Which photos exist is read from assets/faces/index.json, so the seven
 * members whose photos have not landed yet wear authored heads in the shared
 * style — and the moment `lag.png` (or any of the others) is dropped into
 * assets/faces/ and the index rebuilt (`node tools/faces-index.mjs`), the
 * photo lands on the same skull with no code changes.
 */
import { CHARACTER_IDS } from '../core/campaign.js';
import { Npc, STOOL_SIT } from './cast.js';

/* ------------------------------------------------------------------ */
/* The roster                                                          */
/* ------------------------------------------------------------------ */

/**
 * One row per Family member who takes the floor. Big Uncle Lou is Family too
 * but he is already in the building — his office, his desk lamp — so he is
 * deliberately not in this table; duplicating him would put two Lous in one
 * club, which is exactly what the one-identity rule exists to prevent.
 *
 * `photo` is the file the member's face WILL come from, present or not —
 * the names are the ledger's. `slug` is the member's vo.bing.hang.* cue slug.
 * Spots are authored against the club's real furniture: benches, stools,
 * two-top chairs, the blackjack rail. Nobody patrols; they are patrons.
 */
export const FAMILY = [
  {
    id: CHARACTER_IDS.BOOSKI, name: 'Booskibro', slug: 'booski', photo: 'booski.png',
    /* AT THE BAR, by the service station — his shot beat happens here. On
     * the stool, not in it: see STOOL_SIT. */
    spot: { x: -18.7, z: 1.3, y: STOOL_SIT, yaw: -Math.PI / 2, job: 'drink' },
    model: {
      height: 1.8, build: 1.15, dress: 'tracksuit', shirt: 0x1c2f4a,
      hairColour: 0x2a1c14, skin: 0xd9a97f, chain: true,
    },
  },
  {
    id: CHARACTER_IDS.DEATHMEGATRON, name: 'DeathMegatron', slug: 'deathmegatron', photo: 'deathmegatron.png',
    // Two stools down from Booski, with the spritz the world owed him.
    spot: { x: -18.7, z: -1.3, y: STOOL_SIT, yaw: -Math.PI / 2, job: 'drink' },
    model: {
      height: 1.82, build: 1.2, dress: 'suit', shirt: 0x2a2f3a,
      hairColour: 0x14100e, skin: 0xc08a5e,
    },
  },
  {
    id: CHARACTER_IDS.SEFF, name: 'Seff', slug: 'seff', photo: 'seff.png',
    // The far end of the bar, where a man waits for his situation to clear.
    spot: { x: -18.7, z: 5.2, y: STOOL_SIT, yaw: -Math.PI / 2, job: 'sit' },
    model: {
      height: 1.76, build: 1.0, dress: 'suit', shirt: 0x3a2a2a,
      hair: 'short', hairColour: 0x14100e, skin: 0xe8c39c,
    },
  },
  {
    id: CHARACTER_IDS.IRISH, name: 'Irish', slug: 'irish', photo: 'irish.png',
    // East booth run, mid-story, sharing a booth with a regular.
    spot: { x: 4.55, z: -4.55, yaw: -Math.PI / 2, job: 'sit' },
    model: {
      height: 1.78, build: 1.15, dress: 'shirt', shirt: 0x1f2b22,
      hair: 'short', hairColour: 0x8a5a2a, beard: true, skin: 0xf0cba6,
    },
  },
  {
    id: CHARACTER_IDS.GRATIN, name: 'Gratin', slug: 'gratin', photo: 'gratin.png',
    // His own east booth, near the kitchen door, loyal to the wrong shrimp.
    spot: { x: 4.55, z: -2.1, yaw: -Math.PI / 2, job: 'drink' },
    model: {
      height: 1.76, build: 1.3, dress: 'shirt', shirt: 0x3a3320,
      hairColour: 0x2a1c14, skin: 0xd9a97f,
    },
  },
  {
    id: CHARACTER_IDS.OLD_STOVE, name: 'Old Stove', slug: 'stove', photo: 'stove.png',
    // The short booth by the slot alcove, complaining about the ice in it.
    spot: { x: 4.55, z: 5.65, yaw: -Math.PI / 2, job: 'drink' },
    model: {
      height: 1.72, build: 1.1, dress: 'shirt', shirt: 0x24303a,
      hair: 'receding', hairColour: 0x9a9a9a, beard: true, skin: 0xc08a5e,
    },
  },
  {
    id: CHARACTER_IDS.LAG, name: 'Lag', slug: 'lag', photo: 'lag.png',
    /* North booth with Eric, watching the lights flicker like packet loss.
     * Moved south with the bench: the run used to stand at z 11.0, which is
     * inside the front wall, and the two of them sat in the brick with it. */
    spot: { x: -8.35, z: 10.25, yaw: Math.PI, job: 'sit' },
    model: {
      height: 1.74, build: 0.9, dress: 'tracksuit', shirt: 0x1f3a2a,
      hair: 'crop', hairColour: 0x2a1c14, glasses: true, skin: 0xe8c39c,
    },
  },
  {
    id: CHARACTER_IDS.ERIC, name: 'Eric', slug: 'eric', photo: 'erican.png',
    // Same booth as Lag, current on everything overseas, same move south.
    spot: { x: -9.35, z: 10.25, yaw: Math.PI, job: 'sit' },
    model: {
      height: 1.78, build: 1.05, dress: 'shirt', shirt: 0x24303a,
      hairColour: 0x5a3a20, skin: 0xe8c39c,
    },
  },
  {
    id: CHARACTER_IDS.WILLY, name: 'Willy', slug: 'willy', photo: 'willy.png',
    /* A blackjack seat — the best seat; he tested them all after close. Seat
     * one of five: it moved south with the felt when the corner gave the north
     * booth run its metre back, and Willy moved with his chair. */
    spot: { x: -14.16, z: 8.26, yaw: 2.72, job: 'sit' },
    /* A big man, not a big doorway -- and, ahead of a later scene, a big
     * belly: `gut` is the general option on the shared figure builder
     * (src/bing/cast.js), not a Willy-only shape, so the visual continuity
     * does not suddenly inflate him the moment that scene lands. `build` only
     * moves a little; the belly is doing the work. */
    model: {
      height: 1.7, build: 1.1, gut: 1, dress: 'shirt', shirt: 0x2e2438,
      hair: 'receding', hairColour: 0x5a3a20, beard: true, skin: 0xd9a97f,
    },
  },
  {
    id: CHARACTER_IDS.APE, name: 'Ape', slug: 'ape', photo: 'ape.png',
    // Standing at the blackjack rail, statements for entertainment only.
    // South with the felt, so he is still at the rail and not behind it.
    spot: { x: -11.35, z: 8.33, yaw: -2.2, job: 'stand', folded: true },
    model: {
      height: 1.88, build: 1.3, dress: 'tee', shirt: 0x14141a,
      hair: 'crop', hairColour: 0x14100e, beard: true, skin: 0x8d5a3a,
    },
  },
  {
    id: CHARACTER_IDS.HOG_MAMA, name: 'Hog Mama', slug: 'hogmama', photo: 'hogmama.png',
    // A two-top near the stage, working the floor for a bit.
    spot: { x: -6.35, z: 1.6, yaw: -1.34, job: 'sit' },
    model: {
      height: 1.68, build: 1.2, dress: 'shirt', shirt: 0x3a2a2a,
      hairColour: 0x2a1c14, skin: 0xd9a97f,
      gender: 'female', bodyShape: 'curvy',
    },
  },
  {
    id: CHARACTER_IDS.SHUBENATOR, name: 'The Shubenator', slug: 'shubenator', photo: 'shubes.png',
    // Another stage two-top, nine hundred push-ups deep.
    spot: { x: -8.15, z: 3.2, yaw: -1.34, job: 'drink' },
    model: {
      height: 1.84, build: 1.35, dress: 'tee', shirt: 0x2e6ed9,
      hairColour: 0x2a1c14, skin: 0xe8c39c,
    },
  },
  {
    id: CHARACTER_IDS.RIPPINFLOW, name: 'Rippinflow', slug: 'rippinflow', photo: 'rippinflow.png',
    // Stage-side two-top, not freestyling, doing it again anyway.
    spot: { x: -13.45, z: 4.0, yaw: 1.8, job: 'sit' },
    model: {
      height: 1.77, build: 1.0, dress: 'tee', shirt: 0x2e2438,
      hairColour: 0x14100e, skin: 0x8d5a3a,
      /* Thin silver line, nothing hanging off it. The gold rope with the
       * medallion is Lou's whole argument about himself; Rippinflow is not
       * making that argument. */
      chain: 'silver', pendant: false,
    },
  },
  {
    /* Present only once the Beef Run has been flown: before that the Captain
     * is canonically at Whispering Pines with his aeroplane, and one person
     * cannot be in two scenes. Same id as the cockpit, same face. */
    id: CHARACTER_IDS.CAPTAIN_LOU_SASOLE, name: 'Captain Lou Sasole', slug: 'sasole', photo: 'sasole.png',
    spot: { x: -12.55, z: 0.85, yaw: -1.34, job: 'drink' },
    model: {
      height: 1.8, build: 1.1, dress: 'shirt', shirt: 0x2e3a5e,
      hairColour: 0x4a4a48, skin: 0xd2a074,
    },
  },
  {
    id: CHARACTER_IDS.SNOW, name: 'Snow', slug: 'snow', photo: 'snow.png',
    /* The janitor. He works here, and the back hallway outside the men's room
     * is where the job puts him — cold tile, a mop, a draught under the fire
     * door, and he likes it. There used to be an unnamed cleaner standing on
     * this exact spot AND a second Snow loitering by the coat check, which is
     * two of one man in one building; the cleaner is gone and this is him.
     * Same id, same face, same voice, same terse two lines. */
    /* North of the men's room door, and outside the arc its leaf sweeps
     * through the hallway -- the first spot for him was inside it. */
    spot: { x: 6.45, z: 1.78, yaw: 2.2, job: 'stand', folded: true },
    model: {
      height: 1.7, build: 0.95, dress: 'work', shirt: 0x3a4048,
      hairColour: 0x9a9a9a, skin: 0xf0cba6,
    },
  },
  {
    id: CHARACTER_IDS.NUMBSKULL, name: 'Numbskull', slug: 'numbskull', photo: 'numbskull.png',
    // Watching the slot machine like it might need the muscle.
    spot: { x: 2.2, z: 6.6, yaw: 0.46, job: 'stand' },
    model: {
      height: 1.95, build: 1.45, dress: 'tee', shirt: 0x3a3a42,
      hair: 'bald', skin: 0xd9a97f,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Presence                                                            */
/* ------------------------------------------------------------------ */

/**
 * Who takes the floor tonight. The rule that must hold, verbatim from the
 * order: Sasole present only after the Beef Run is complete; Booski present
 * from the start; everyone else always present. Both Bing visits get the
 * floor. (Lou is upstairs in every case and never in this list.)
 */
export function familyPresent(campaignState) {
  const beefRunFlown = campaignState?.missions?.airstrip_smuggling?.status === 'complete';
  const noWakeComplete = campaignState?.missions?.no_wake?.status === 'complete';
  return FAMILY.filter((m) => (
    (m.id !== CHARACTER_IDS.CAPTAIN_LOU_SASOLE || beefRunFlown)
      && (m.id !== CHARACTER_IDS.WILLY || !noWakeComplete)
  ));
}

/** Fetch which face photos exist, without ever 404ing a missing one. */
export async function loadFaceIndex(url = 'assets/faces/index.json') {
  try {
    const res = await fetch(url);
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set(Array.isArray(data.files) ? data.files : []);
  } catch {
    return new Set();
  }
}

/**
 * Seat the present Family in the club.
 *
 * They join the scene as ordinary ambient patrons — same figures, same pose
 * and gesture systems, no shadow passes, no colliders, no patrol routes —
 * so every constraint the room already proves (blocked booth zero, the nine
 * seat egresses, the stage nav boxes, the guard's round) is untouched.
 *
 * @returns {{ all: Npc[], byId: Object<string, Npc> }}
 */
export function populateFamily(scene, club, { present = FAMILY, faces = new Set() } = {}) {
  const all = [];
  const byId = {};
  for (const member of present) {
    const face = faces.has(member.photo) ? `assets/faces/${member.photo}` : null;
    const npc = new Npc(scene, {
      name: member.name,
      tier: 'ambient',
      job: member.spot.job,
      x: member.spot.x,
      z: member.spot.z,
      y: member.spot.y ?? 0,
      yaw: member.spot.yaw,
      colliders: club.colliders,
      navBlockers: club.navBlockers ?? null,
      model: { ...member.model, face },
    });
    if (member.spot.folded) npc.folded = true;
    npc.characterId = member.id;
    npc.familyMember = member;
    npc.group.userData.npc.characterId = member.id;
    npc.group.userData.npc.family = true;
    all.push(npc);
    byId[member.id] = npc;
  }
  return { all, byId };
}

/* ------------------------------------------------------------------ */
/* The words                                                           */
/* ------------------------------------------------------------------ */

/**
 * Walk-up conversations, one per member, played through the club's dialogue
 * machine with its persist/resume semantics. Every line a member speaks
 * carries its `vo.bing.hang.<slug>.*` cue from the manifest; the prospect's
 * replies carry cues only where the ledger authored them (voice `player`).
 * Numbskull's two lines are the dock's — his voice id has not landed, so his
 * nodes carry no cue names at all and nothing can 404 or trip the generator.
 *
 * @param {object} hooks
 *   shotDone  () => boolean — Booski's shot beat already ran this visit
 *   startShot () => void    — kick the shot beat (owned by main.js)
 */
export function buildFamilyScripts({ shotDone = () => false, startShot = () => {} } = {}) {
  /** A two-beat hangout: line one, a reply, line two, maybe a last word. */
  const hangout = (name, slug, {
    line1, line2, reply, replyTone = 'Reply', last, lastCue, leave = 'Another time.',
  }) => {
    const tree = {
      open: {
        who: name,
        line: line1,
        cue: `vo.bing.hang.${slug}.1`,
        options: [
          { tone: reply.replyTone ?? replyTone, text: reply.text, cue: reply.cue, next: 'more' },
          { tone: 'Leave', text: leave, next: null },
        ],
      },
      more: {
        who: name,
        line: line2,
        cue: `vo.bing.hang.${slug}.2`,
      },
    };
    if (last) {
      // The prospect gets the last word — authored, so it carries its cue.
      tree.more.options = [{ tone: 'Reply', text: last, cue: lastCue, next: null }];
    } else {
      tree.more.hold = 3.4;
    }
    return tree;
  };

  const lag = hangout('Lag', 'lag', {
    line1: 'You see the lights flicker just now? That ain’t the wiring, that’s packet loss. This whole building is on wifi.',
    reply: { text: 'The jukebox is not a server, Lag.', cue: 'vo.bing.hang.lag.tony.1' },
    line2: 'I don’t dance, Prospect. I peaked in a game you never heard of and I’m still cooling down.',
  });

  const gratin = hangout('Gratin', 'gratin', {
    line1: 'The kitchen here does one thing, and it is shrimp, and it is wrong. I still order it. Loyalty.',
    reply: { text: 'That’s not loyalty, that’s a condition.' },
    line2: 'Sit. Eat something. You look like a prospect who skips lunch, and dead men skip lunch.',
    last: 'I ate an egg today, actually.',
    lastCue: 'vo.bing.hang.gratin.tony.1',
  });

  const eric = hangout('Eric', 'eric', {
    line1: 'Big things happening overseas, Prospect. Nobody in this club reads. I read. Ask me anything.',
    reply: { text: 'Alright. What’s happening overseas?', replyTone: 'Ask' },
    line2: 'Off the record? The family’s press situation is terrible, because we shoot the press.',
  });

  const hogmama = hangout('Hog Mama', 'hogmama', {
    line1: 'Gimme a word, baby. Any word. I’ll make a whole bit out of it, right here, no net.',
    reply: { text: 'Uh. “Errand.”' },
    line2: 'You? You’re a bit already, honey. Walkin’ around all serious with them little errands.',
    last: 'Please don’t make me a bit.',
    lastCue: 'vo.bing.hang.hogmama.tony.1',
  });

  const deathmegatron = hangout('DeathMegatron', 'deathmegatron', {
    line1: 'I ordered a spritz. They gave me a spritz. Ain’t every day the world does what it should.',
    reply: { text: 'Big night, then.' },
    line2: 'Relax, kid. Nobody dies on a Tuesday. Statistically that ain’t true, but relax anyway.',
  });

  /* Booskibro carries the shot beat: first walk-up goes line one, the offer,
   * the yell — and the yell starts the bar-length delivery main.js runs.
   * Once the shot has landed this visit, he is back to ordinary hangout. */
  const booski = {
    open: {
      who: 'Booskibro',
      line: () => (shotDone()
        ? 'I had six hundred on red and it came up FAMILY, baby. House pays either way when it’s my house.'
        : 'PROSPECT! Get over here before I love you from a distance like some kinda stranger!'),
      cue: () => (shotDone() ? 'vo.bing.hang.booski.2' : 'vo.bing.hang.booski.1'),
      options: () => (shotDone()
        ? [{ tone: 'Reply', text: 'The house always pays you, Boosk.', next: null }]
        : [
          { tone: 'Reply', text: 'Good to see you too, Boosk.', next: 'offer' },
          { tone: 'Leave', text: 'Later — errands.', next: null },
        ]),
    },
    offer: {
      who: 'Booskibro',
      line: 'You look empty-handed, Prospect. That’s a ME problem now. You want a shot? Course you want a shot.',
      cue: 'vo.bing.booski.shot.offer',
      hold: 3.6,
      next: 'yell',
    },
    yell: {
      who: 'Booskibro',
      line: 'AY! I want that shot in thirty FUCKING seconds!',
      cue: 'vo.bing.booski.shot.yell',
      enter: () => startShot(),
      hold: 2.6,
    },
  };

  /* The delivery's landing, started by main.js when the bouncer arrives.
   * Not resumable, never bookmarks over the hangout thread. */
  const booskiShot = {
    handoff: {
      who: 'Booskibro',
      line: 'Twenty-eight. He’s growin’ on me. Drink, baby.',
      cue: 'vo.bing.booski.shot.handoff',
      hold: 2.8,
      next: 'tony',
    },
    tony: {
      who: 'Prospect',
      line: 'Thanks. I was gonna say no, and then I heard the yelling.',
      cue: 'vo.bing.booski.shot.tony.1',
      hold: 3.0,
    },
  };

  const captain_lou_sasole = hangout('Captain Lou Sasole', 'sasole', {
    line1: 'Ground people, Tony. Everyone in here. Beautiful souls, zero situational awareness.',
    reply: { text: 'They’re alright.' },
    line2: 'You flew with me once and you walked away from the landing. That puts you top five pilots in this room.',
    last: 'Top five? Who’s ahead of me?',
    lastCue: 'vo.bing.hang.sasole.tony.1',
  });

  const willy = hangout('Willy', 'willy', {
    line1: 'I’m between things right now. Big things. Can’t say. The things can hear.',
    reply: { text: 'Sure they can, Willy.' },
    line2: 'You want my seat? It’s the best seat. That’s why I’m in it. I test ’em all after close.',
  });

  const irish = hangout('Irish', 'irish', {
    line1: 'Sit down, sit down — I was just gettin’ to the good part. So the egg, right, the SAME egg—',
    reply: { text: 'Go on.', replyTone: 'Listen' },
    line2: 'Nobody finishes a story anymore. Attention spans. Now — where was I. Start over. So. Eggs.',
    last: 'You told me the egg one, Irish.',
    lastCue: 'vo.bing.hang.irish.tony.1',
  });

  const ape = hangout('Ape', 'ape', {
    line1: 'Statements made in this establishment are for entertainment purposes only.',
    reply: { text: 'Noted for the record.' },
    line2: 'I am having a nice time. This is my nice-time face. It is load-bearing.',
  });

  const old_stove = hangout('Old Stove', 'stove', {
    line1: 'City drinks, city prices, city ice. Ice used to mean somethin’.',
    reply: { text: 'The ice is fine, Stove.' },
    line2: 'That aeroplane misses you. Don’t you tell her nothin’ I wouldn’t say.',
  });

  const snow = hangout('Snow', 'snow', {
    line1: 'Cold in here. Good.',
    reply: { text: 'You want them to turn the heat up?' },
    line2: 'You talk a lot for a guy on a checklist.',
  });

  const rippinflow = hangout('Rippinflow', 'rippinflow', {
    line1: 'Prospect on the floor, yeah, walkin’ like rent’s due — that’s a bar, that’s free, someone write that down.',
    reply: { text: 'I’m not writing that down.' },
    line2: 'I don’t freestyle no more. Anyway — look at him, suit like a verdict, uh — see, it happened again.',
  });

  const seff = hangout('Seff', 'seff', {
    line1: 'Quick thing. You got a guy for mattresses? Doesn’t matter. Forget it. I GOT the guy. I’m the guy.',
    reply: { text: 'Why do I need a mattress guy?', replyTone: 'Ask' },
    line2: 'This round’s on me the moment somebody explains my situation to Lou. You’ll do that, right?',
    last: 'I’m not doing that, Seff.',
  });

  const shubenator = hangout('The Shubenator', 'shubenator', {
    line1: 'I did nine hundred push-ups today. The number is not the impressive part. The floor was.',
    reply: { text: 'What did the floor do?', replyTone: 'Ask' },
    line2: 'You need mass, Prospect. Order the shrimp. Order nine shrimp.',
  });

  const numbskull = hangout('Numbskull', 'numbskull', {
    line1: 'I like you. I decided this morning. It’s done now, so don’t worry about it.',
    reply: { text: '…Thanks?' },
    line2: 'Lou says I’m the muscle. Booski says I’m the heart. I say ow.',
  });

  return {
    [CHARACTER_IDS.LAG]: lag,
    [CHARACTER_IDS.GRATIN]: gratin,
    [CHARACTER_IDS.ERIC]: eric,
    [CHARACTER_IDS.HOG_MAMA]: hogmama,
    [CHARACTER_IDS.DEATHMEGATRON]: deathmegatron,
    [CHARACTER_IDS.BOOSKI]: booski,
    [CHARACTER_IDS.CAPTAIN_LOU_SASOLE]: captain_lou_sasole,
    [CHARACTER_IDS.WILLY]: willy,
    [CHARACTER_IDS.IRISH]: irish,
    [CHARACTER_IDS.APE]: ape,
    [CHARACTER_IDS.OLD_STOVE]: old_stove,
    [CHARACTER_IDS.SNOW]: snow,
    [CHARACTER_IDS.RIPPINFLOW]: rippinflow,
    [CHARACTER_IDS.SEFF]: seff,
    [CHARACTER_IDS.SHUBENATOR]: shubenator,
    [CHARACTER_IDS.NUMBSKULL]: numbskull,
    booskiShot,
  };
}
