#!/usr/bin/env node
/**
 * Second pass of player voice lines.
 *
 *   node tools/add-vo-lines.mjs
 *
 * Appends the lines below to assets/sfx/manifest.json, continuing each group's
 * numbering from whatever is already there, and skipping any line already in
 * the manifest -- so running it twice is harmless.
 *
 * Then generate the audio with the same voice as the first batch:
 *
 *   set ELEVENLABS_API_KEY=...
 *   set SQUATCH_VOICE_PLAYER=<the same voice id you used before>
 *   node tools/generate-sfx.mjs --voice-only
 *
 * The `voice: 'player'` tag is what pins them all to one performer. Every line
 * here is the man who lives in the apartment, talking to himself, in a flat
 * unbothered register -- he is not performing, there is nobody there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'assets/sfx/manifest.json');

/** group -> lines to add. Numbering continues from the existing manifest. */
const LINES = {
  /* ---- waking up, getting up, going back down ---- */
  wake: [
    'Oh, absolutely not.',
    'Six. It is six. Why is it six.',
    'I was having a good one, as well.',
    'Ceiling. Same ceiling.',
  ],
  getup: [
    'Right. Up. Vertical. Doing it.',
    'Floor is cold. Noted. Ignored.',
    'One thing at a time.',
    'Okay. What are we doing today.',
  ],
  liedown: [
    'Just for a minute.',
    'This is not going back to sleep. This is lying down.',
    'It is still early. Technically.',
  ],
  sleep: [
    'Nothing was going to happen today anyway.',
    'Goodnight to me.',
  ],

  /* ---- the desk ---- */
  'pc.sit': [
    'Right then.',
    'Ten minutes. That is all this is.',
    'Let us see what the boys are doing.',
  ],
  'cs.death.early': [
    'Okay, that is a wallbang. That is through a wall.',
    'I did not even hear him.',
    'Great. Off to a strong start.',
    'He was already looking at me.',
  ],
  'cs.death.late': [
    'This is not a game any more, this is a documentary.',
    'Report. Report. Nothing is going to happen but report.',
    'I have not fired a bullet. Not one.',
    'Nine hour old account. Nine hours.',
    'I am going to go and have a shower.',
    'That is enough of that. That is genuinely enough.',
  ],
  'cs.kill': [
    'That went in! That actually went in!',
    'Did anyone see that? Nobody saw that.',
    'One. I got one. That is the day made.',
  ],
  smash: [
    'That is a score. That is a real score.',
    'Beat it. Barely. But beat it.',
    'One more. One more and then I get on with things.',
    'This game is rigged and I love it.',
  ],

  /* ---- kitchen ---- */
  fridge: [
    'There is nothing in here. There is never anything in here.',
    'Eggs. There are eggs. That is breakfast sorted.',
    'That has been in there a while.',
    'Cold air. Good. Just going to stand here a moment.',
  ],
  eat: [
    'Not bad. Not good. Eaten.',
    'That is food in me. That counts.',
    'Should have done that hours ago.',
  ],

  /* ---- drinking and smoking ---- */
  'beer.open': [
    'Go on then.',
    'It is somewhere in the world.',
  ],
  'beer.good': [
    'That is the one.',
    'Oh, that is cold. That is properly cold.',
  ],
  'beer.many': [
    'How many is that. Do not answer that.',
    'I am going to regret the arithmetic on this.',
    'One more and then I am stopping. Genuinely.',
  ],
  whiskey: [
    'Right in the chest, that.',
    'That was more than I meant to take.',
    'Bit early for this. Bit early.',
    'Woof. Okay.',
  ],
  'cig.light': [
    'Filthy. Necessary.',
    'Out of the window, out of the window.',
  ],
  'cig.drag': [
    'There we go.',
    'That is better. That is actually better.',
    'Should not enjoy that as much as I do.',
  ],
  'cig.last': [
    'Last one. That is the pack.',
    'Well. That is that decision made for me.',
  ],
  zyn: [
    'Upper lip. Sorted.',
    'That is a strong one.',
    'Hands are steady. That is all I wanted.',
  ],

  /* ---- the coffee table ---- */
  bong: [
    'Okay. Okay. That was a big one.',
    'Not going anywhere for a bit.',
    'Everything just got very reasonable.',
    'Right. I still have things to do. I am aware.',
  ],
  shrooms: [
    'Tastes like a shed.',
    'Nothing is happening. Nothing is happening at all.',
    'Oh. Oh, there it is.',
    'The wall is doing something. The wall is definitely doing something.',
  ],

  /* ---- bathroom ---- */
  pee: [
    'That is a relief and a half.',
    'Some of that went in.',
    'I will clean that up. Later. Probably.',
  ],
  /* Looking at the toilet before anything is brewing. The only place the game
   * admits out loud that cigarettes are what get things moving -- four of them
   * fills the meter, and without this you are left to work that out yourself. */
  'toilet.hint': [
    'Nothing doing yet. Couple of cigarettes usually gets that moving.',
    'Not yet. Give it a few smokes and we will be back in here.',
    'Empty. It always turns up about four cigarettes in.',
  ],
  'poop.urge': [
    'Nope. Nope, that is happening now.',
    'Bathroom. Bathroom, immediately.',
  ],
  'poop.relief': [
    'Right. That is the day properly started.',
    'Ten out of ten. No notes.',
    'I feel like a different man.',
  ],
  fart: [
    'Nobody heard that.',
    'That was not on purpose.',
    'Bit of a big one, that.',
    'Beer does that.',
  ],
  shower: [
    'Cold. Cold. There we go.',
    'I could stay in here all day.',
    'Right. Out. Come on.',
    'Clean. Genuinely clean. That is new.',
  ],
  dress: [
    'A shirt. A whole clean shirt.',
    'That will do. That will absolutely do.',
    'Looking almost like a person.',
  ],

  /* ---- looking at the photographs on the walls ----
   * Half of these are the group's own catchphrases, which is the point: they
   * are not descriptions of what is in the frame, they are the thing he would
   * actually say out loud on seeing it, and they land for anyone who was
   * there. Do not make these explanatory. */
  photo: [
    'Ahh. What a good time.',
    'Let me hear you. Let me sing.',
    'It is all love.',
    'Let it be known: that was a great time.',
    'Piping hot.',
    'Oh, that is a good one.',
    'We were so young. That was eighteen months ago.',
    'Everyone in that picture owes me money.',
    'I remember about half of that.',
    'That was the night, that was.',
    'Look at the state of us.',
    'Good lads. All of them. Mostly.',
    'That is going to stay up there forever now.',
    'I have walked past that a thousand times.',
    'Been meaning to straighten that.',
    'One of the good ones, that.',
    'Should get everyone together again.',
    'Nobody has aged well. Including me.',
  ],

  /* ---- after the glue finally comes out ----
   * The payoff line has to sell that it was always glue and he is annoyed
   * about the wall, not embarrassed about anything. Play it completely
   * straight; the moment he acknowledges the joke, the joke is gone. */
  glue: [
    'All over the wall. Every time.',
    'That is the whole bottle. On the wall.',
    'Well, the frame is not going anywhere now.',
    'Should have bought a new one months ago.',
    'That is going to set like that. That is permanent, that is.',
    'Hands are stuck together. Brilliant.',
  ],

  /* ---- the radio ---- */
  'radio.ad': [
    'I have heard this one about four hundred times.',
    'Every host thinks he is the smartest man in the building.',
    'Eat those pasture raised eggs. Yes. Alright.',
  ],
  'radio.song': [
    'Hang on, this is us. This is actually us.',
    'Somebody in this group made this. In a basement.',
    'Turn that up.',
    'This one still holds up.',
  ],

  /* ---- hearing the meeting notice: a NEW group ---- */
  notice: [
    'Wednesday. Right. That is tomorrow.',
    'Seven o clock. I can do seven o clock.',
    'Showered, dressed, fed. That is not a lot to ask.',
    'I am not being the one who turns up at half seven.',
    'Good. Glad they said. I would have forgotten.',
  ],

  /* ---- the door ---- */
  'door.shower': [
    'Not like this. I need a shower first.',
    'I can smell myself. That is a bad sign.',
  ],
  'door.dressed': [
    'I am in what I slept in. Absolutely not.',
    'Clean shirt first. Come on.',
  ],
  'door.eat': [
    'I have not eaten. I will be useless.',
    'There are eggs. Two minutes. Do the eggs.',
  ],
  'door.cs': [
    'I said I would get a game in with the boys.',
    'One match. I promised. Well, I implied.',
  ],
  'door.piss': [
    'Not making that journey like this.',
    'Bathroom first. Obviously bathroom first.',
  ],
  'door.poop': [
    'Absolutely not. Not with this going on.',
    'That is not a public transport situation.',
  ],
  'door.beer': [
    'One for the road first.',
    'There is time. There is loads of time.',
  ],
  'door.drunk': [
    'I am not turning up like this.',
    'Give it an hour. Give it a good hour.',
    'They will know. They always know.',
  ],
  'door.leave': [
    'Right. Wallet, keys, door.',
    'Off we go, then.',
    'See you on the other side of that.',
  ],

  /* ---- nothing is happening ---- */
  idle: [
    'So.',
    'Right.',
    'Yep.',
    'This is the day, then.',
    'Something should probably happen at some point.',
    'I could just stand here. That is an option.',
    'Nobody is coming round. I checked.',
    'Long way to Wednesday.',
  ],
};

/* ------------------------------------------------------------------ */

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
manifest.sfx ??= [];

const existing = new Set(manifest.sfx.map((c) => c.name));
const saidAlready = new Set(
  manifest.sfx.filter((c) => c.say).map((c) => c.say.trim().toLowerCase()),
);

let added = 0;
let dupes = 0;
for (const [group, lines] of Object.entries(LINES)) {
  // Continue this group's numbering rather than restarting it.
  let n = 0;
  for (const cue of manifest.sfx) {
    const m = cue.name.match(new RegExp(`^vo\\.${group.replace('.', '\\.')}\\.(\\d+)$`));
    if (m) n = Math.max(n, Number(m[1]));
  }
  for (const say of lines) {
    if (saidAlready.has(say.trim().toLowerCase())) { dupes++; continue; }
    let name;
    do { name = `vo.${group}.${++n}`; } while (existing.has(name));
    manifest.sfx.push({ name, voice: 'player', say });
    existing.add(name);
    saidAlready.add(say.trim().toLowerCase());
    added++;
  }
}

fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const total = manifest.sfx.filter((c) => c.name.startsWith('vo.')).length;
console.log(`Added ${added} lines${dupes ? ` (${dupes} already present)` : ''}.`);
console.log(`${total} voice cues in assets/sfx/manifest.json.`);
console.log('\nNow, with the same voice id as the first batch:');
console.log('  node tools/generate-sfx.mjs --voice-only');
