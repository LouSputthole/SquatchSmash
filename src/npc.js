/**
 * THE NPC SYSTEM — how the Circle reacts to you at the party.
 *
 * Framework-agnostic on purpose (no THREE import): this is the brain, and the
 * party scene is the body. The scene owns meshes, faces, positions and the
 * look-at raycast; it calls into here for *what a given squatch says right now*,
 * given who they are, how they feel about you, and how wrecked they've gotten.
 *
 * The whole engine is one idea: every line is filtered by
 *   archetype  ×  standing tier  ×  current state  ×  route
 * then anything already said this session is dropped, then one is picked. Small
 * engine, large-feeling result — the party gets funnier the longer you stay
 * because everyone is sliding down their own drunk curve into a different bank.
 *
 * Nothing in here throws on missing content: if a filter empties out, it widens
 * until it finds a line, so an NPC is never mute.
 */

// ---------- Archetypes ----------
// The archetype fixes cadence and what a character cares about. The real crew
// map onto these; utility members share one bank so the circle stays populated.
export const ARCHETYPE = {
  PATRIARCH: 'PATRIARCH',   // Booski — ceremonial, warm as a furnace, toasts you
  LIEUTENANT: 'LIEUTENANT', // Lou — the translator, softens Booski, means all of it
  QUIET: 'QUIET',           // Rippinflow — four words a night, scarier for it
  ROASTER: 'ROASTER',       // Ape — every insult is love
  CRIER: 'CRIER',           // Shubes — moved to tears, denies it, blames the smoke
  MUSCLE: 'MUSCLE',         // Deathmegatron — communicates in nods and headlocks
  MATRIARCH: 'MATRIARCH',   // Hog Mama — runs logistics on everything, incl. the bodies
  GRIEVANCE: 'GRIEVANCE',   // Irish — permanently mid-complaint about procedure
  UTILITY: 'UTILITY',       // Erican / Gratin / Sasole / Snow — background, lighter bank
};

// ---------- The roster ----------
// face: path under assets/faces (null = photo not cut yet; renders faceless).
// seat: where they hang at the party, for the scene to place them.
export const ROSTER = [
  { id: 'booski',       name: 'BOOSKI',        archetype: ARCHETYPE.PATRIARCH,  face: 'assets/faces/booski.png',        seat: 'truck' },
  { id: 'lou',          name: 'LOU SPUTTHOLE', archetype: ARCHETYPE.LIEUTENANT, face: 'assets/faces/lou.png',           seat: 'truck' },
  { id: 'rippinflow',   name: 'RIPPINFLOW',    archetype: ARCHETYPE.QUIET,      face: 'assets/faces/rippinflow.png',    seat: 'treeline' },
  { id: 'shubes',       name: 'THE SHUBENATOR', archetype: ARCHETYPE.CRIER,     face: 'assets/faces/shubes.png',        seat: 'bong' },
  { id: 'deathmegatron', name: 'DEATHMEGATRON', archetype: ARCHETYPE.MUSCLE,    face: 'assets/faces/deathmegatron.png', seat: 'keg' },
  { id: 'hogmama',      name: 'HOG MAMA',      archetype: ARCHETYPE.MATRIARCH,  face: 'assets/faces/hogmama.png',       seat: 'fire' },
  { id: 'ape',          name: 'APE',           archetype: ARCHETYPE.ROASTER,    face: null,                             seat: 'keg' },
  { id: 'irish',        name: 'IRISH',         archetype: ARCHETYPE.GRIEVANCE,  face: null,                             seat: 'fire' },
  { id: 'erican',       name: 'ERICAN',        archetype: ARCHETYPE.UTILITY,    face: 'assets/faces/erican.png',        seat: 'fire' },
  { id: 'gratin',       name: 'GRATIN',        archetype: ARCHETYPE.UTILITY,    face: 'assets/faces/gratin.png',        seat: 'bong' },
  { id: 'sasole',       name: 'SASOLE',        archetype: ARCHETYPE.UTILITY,    face: 'assets/faces/sasole.png',        seat: 'keg' },
  { id: 'snow',         name: 'SNOW',          archetype: ARCHETYPE.UTILITY,    face: 'assets/faces/snow.png',          seat: 'treeline', executioner: true },
];

// ---------- Tiers & states ----------
// Standing (-100..100) → how they treat you. Seeded by your initiation run,
// nudged up as you drink and talk with people.
export function tierOf(standing) {
  if (standing < 15) return 'stranger';
  if (standing < 46) return 'prospect';
  if (standing < 81) return 'brother';
  return 'beloved';
}

// Each NPC has their own intoxication (0..1, same model as the apartment) plus
// optional high flags. stateOf returns EVERY active state; a line matches if it
// shares any of them (or is untagged).
export function stateOf(npc) {
  const s = [];
  const d = npc.drunk || 0;
  if (d < 0.15) s.push('sober');
  else if (d < 0.45) s.push('merry');
  else if (d < 0.8) s.push('drunk');
  else s.push('wrecked');
  if (npc.stoned) s.push('stoned');
  if (npc.tripping) s.push('tripping');
  return s;
}

// ---------- Dialogue banks ----------
// A line is { text, tier?, state?, route?, flag? }.
//   tier:  array of standing tiers it's allowed in (omit = any)
//   state: array of states; matches if the NPC is in ANY of them (omit = any)
//   route: 'rat' → only offered when this NPC is suspicious of you;
//          omitted → normal party line (offered on any route)
//   flag:  a run flag that must be truthy (e.g. 'enduredFull', 'roarLoud')
// Keep them in voice. The comedy is deadpan; nobody thinks tonight was unusual.
const BANKS = {
  [ARCHETYPE.PATRIARCH]: [
    // stranger / prospect — he's still sizing the induction
    { text: "There he is. Don't just stand there bleeding, come to the fire.", tier: ['stranger', 'prospect'], state: ['sober', 'merry'] },
    { text: "You did the reading. You have no idea how rare that is. The gecko guy did not do the reading.", tier: ['prospect'] },
    // brother — the warmth is on full
    { text: "THE MAN OF THE HOUR. Somebody get him something he can't refuse.", tier: ['brother', 'beloved'], state: ['sober', 'merry'] },
    { text: "I've inducted forty men. I remember maybe six. You, I'll remember.", tier: ['brother', 'beloved'], state: ['merry'] },
    { text: "You took the whole Gauntlet with your hands down. Deathmegatron cried a little. He'll deny it.", tier: ['brother', 'beloved'], flag: 'enduredFull' },
    { text: "That ROAR. Three ridges of wildlife filed a noise complaint. I've never been prouder.", tier: ['brother', 'beloved'], flag: 'roarLoud' },
    // beloved / wrecked — the gravitas is falling off him
    { text: "You know what the founders had that nobody has anymore? …I forget. But you've got it too.", tier: ['brother', 'beloved'], state: ['drunk'] },
    { text: "You're my son now. Legally? No. Forest-legally? Absolutely. Do not test it.", tier: ['beloved'], state: ['drunk', 'wrecked'] },
    { text: "The log. You broke the log. You want to know what it was for. …It was for that. Next question.", tier: ['brother', 'beloved'], state: ['drunk', 'wrecked'] },
    // rat / probing — same warmth, a hook under it
    { text: "You're quiet. My prospects are never quiet. What are you thinking about over there?", route: 'rat' },
    { text: "Come here. Closer. …No, closer. I want to see your eyes when I say welcome.", route: 'rat' },
    { text: "Rippinflow likes you. Rippinflow doesn't like anyone. Makes me wonder what he sees that I don't.", route: 'rat' },
  ],

  [ARCHETYPE.LIEUTENANT]: [
    { text: "What he means is welcome. What I mean is: don't touch the good tarp. You'll learn what it's for.", tier: ['stranger', 'prospect', 'brother'] },
    { text: "Ignore the speech. Booski's been writing that speech for nine years. It peaked in draft two.", state: ['merry', 'drunk'] },
    { text: "I'm technically still at the airport, spiritually. Don't ask. Have a beer.", state: ['sober', 'merry'] },
    { text: "You're doing great. You're doing so much better than Shubes did and Shubes is a full member.", tier: ['brother', 'beloved'] },
    { text: "Somebody did the reading. Somebody gets to keep their fluids on the inside. Cheers to that.", tier: ['prospect', 'brother'], flag: 'quizPassed' },
    { text: "Genuinely proud of you. I might cry. I won't. But I might. That's between us.", tier: ['brother', 'beloved'], state: ['drunk'] },
    { text: "Housekeeping while I've got you: the raccoons unionized. The little one has a clipboard now. Watch him.", state: ['merry', 'drunk', 'wrecked'] },
    { text: "You made it. Not everyone does. Don't look at the shirt by the truck. Look at me. You made it.", tier: ['brother', 'beloved'], state: ['drunk', 'wrecked'] },
    // rat
    { text: "You keep checking your waistband. Cold night? Or is there a reason your hand keeps going there.", route: 'rat' },
    { text: "I like you. So I'm going to say this once, friendly: whatever you're carrying, put it down before Booski's toast.", route: 'rat' },
  ],

  [ARCHETYPE.QUIET]: [
    // Rippinflow. Fewer, heavier. Each line is the whole conversation.
    { text: "…You did good.", tier: ['prospect', 'brother', 'beloved'] },
    { text: "*(a nod)*", state: ['sober', 'merry'] },
    { text: "You didn't run. Smart. Nobody outruns the tree line.", tier: ['brother', 'beloved'] },
    { text: "*(hands you a beer. doesn't let go for one second too long. lets go.)*", tier: ['brother', 'beloved'] },
    { text: "I was gonna have to be the one. If you'd failed. Glad I didn't.", tier: ['brother', 'beloved'], state: ['drunk'] },
    // rat — the scariest content in the game is Rippinflow being warm
    { text: "*(he's just looking at you. he was looking at you before you turned around.)*", route: 'rat' },
    { text: "You've got a shooter's hands. I noticed during the Gauntlet. You kept making a fist.", route: 'rat' },
    { text: "Whatever you came here to do. …I hope it was join us.", route: 'rat' },
  ],

  [ARCHETYPE.ROASTER]: [
    // Ape. Never a nice thing directly; the insult IS the welcome.
    { text: "You took thirty punches and cried less than Shubes did. That's the bar. You cleared the bar.", tier: ['prospect', 'brother', 'beloved'] },
    { text: "Congrats on the murder cult, dork. Beer's warm. So's the induction, apparently.", state: ['merry', 'drunk'] },
    { text: "I had money on you eating it at the log. You cost me forty bucks. I've never respected anyone more.", tier: ['brother', 'beloved'] },
    { text: "You know they only shot the first guy because he was worse at trivia than you. Low bar. You limbo'd under it. Proud.", flag: 'quizPassed' },
    { text: "Nine feet tall and still can't hold your beer. This is my favorite version of you.", tier: ['brother', 'beloved'], state: ['drunk', 'wrecked'] },
    { text: "Don't let Booski hug you, he'll cry on the fur and it never dries. Ask Shubes. Shubes is basically a sponge now.", state: ['merry', 'drunk'] },
    // rat
    { text: "You're weird tonight. Weirder. And I've seen you sober, so that's a real statement.", route: 'rat' },
    { text: "What's in the pants, hero. And don't say a gun, because then I have to care, and I'm four deep.", route: 'rat' },
  ],

  [ARCHETYPE.CRIER]: [
    // Shubes. Sincere, moved, denying it, blaming the fire.
    { text: "I'm not crying, it's — it's a smoky fire. It's a really smoky fire. Welcome, man. *(sniff)*", tier: ['prospect', 'brother', 'beloved'] },
    { text: "I remember my initiation. I did NOT cry. Ape's lying. I want that on the record before you hear it.", state: ['sober', 'merry'] },
    { text: "You want a hit? It's going around. It helps with the — *(gestures at the entire evening)* — the this.", state: ['merry', 'drunk'], flag: 'partyHasBong' },
    { text: "We're brothers now. That's not nothing. That's — okay I'm gonna need a second. It's the smoke.", tier: ['brother', 'beloved'], state: ['drunk'] },
    { text: "When Booski said 'walk out a squatch' I felt that in my whole chest. Every time. Every single guy. *(wipes face)*", tier: ['brother', 'beloved'], flag: 'enduredFull' },
    // rat
    { text: "You seem stressed. Are you stressed? Because I get stressed and it's usually — is everything okay, man? Genuinely.", route: 'rat' },
    { text: "Please don't do anything tonight. I don't know why I said that. I just — I get feelings. Please don't.", route: 'rat' },
  ],

  [ARCHETYPE.MUSCLE]: [
    // Deathmegatron. Physical, terse. The one who'd have choked you out.
    { text: "*(presses a beer into your hand hard enough to bruise)* Voice on this guy.", tier: ['prospect', 'brother', 'beloved'] },
    { text: "Good hands tonight. Kept 'em down. That's the whole trick.", tier: ['brother', 'beloved'], flag: 'enduredFull' },
    { text: "*(a nod. it means: sit. so you sit.)*", state: ['sober', 'merry'] },
    { text: "I had my thumb on your windpipe for the Roar. In case. You roared. Good.", tier: ['brother', 'beloved'], state: ['merry', 'drunk'] },
    { text: "*(headlock. the affectionate kind. mostly.)* Brother.", tier: ['brother', 'beloved'], state: ['drunk', 'wrecked'] },
    // rat
    { text: "*(he's stopped drinking. he's watching your hands. he hasn't blinked in a while.)*", route: 'rat' },
    { text: "You're tense. I can see it in the shoulders. I put things down when I'm tense. You should put things down.", route: 'rat' },
  ],

  [ARCHETYPE.MATRIARCH]: [
    // Hog Mama. Practical, unbothered, has cleaned worse.
    { text: "You eat? There's dogs on the fire. Real ones — hot dogs, relax. Don't make it weird.", tier: ['prospect', 'brother', 'beloved'] },
    { text: "Sit down before you fall down. You lost blood tonight. Electrolytes. There's a warm Gatorade in the cooler, it's yours.", tier: ['prospect', 'brother'] },
    { text: "Every man here I've patched up at least once. You're on the list now. Congratulations, I guess.", tier: ['brother', 'beloved'] },
    { text: "Don't step over by the truck. I haven't dealt with that yet and I don't want you tracking it around.", state: ['sober', 'merry', 'drunk'] },
    { text: "Boys get sentimental at these. I don't. Somebody has to remember where the shovels are.", state: ['merry', 'drunk'] },
    // rat
    { text: "You've got a look. I've seen that look. Last person with that look is a story I tell to scare prospects.", route: 'rat' },
    { text: "Whatever you're planning, sweetheart — I do the cleanup. So do it somewhere with a tarp already down.", route: 'rat' },
  ],

  [ARCHETYPE.GRIEVANCE]: [
    // Irish. Always mid-complaint about something procedural and unrelated.
    { text: "Nobody has answered my question about the eggs. You're new — YOU answer it. What is the egg situation.", tier: ['stranger', 'prospect', 'brother', 'beloved'] },
    { text: "I raised the parking thing at the last three meetings. Three. We're a forest death cult and we cannot organize a car pool.", state: ['sober', 'merry'] },
    { text: "Did they shoot a lad earlier or did I imagine that. Because if they did, that's exactly the kind of thing that should be on the AGENDA.", state: ['merry', 'drunk'] },
    { text: "Welcome, whatever. Do you have opinions on the fire-pit can situation. Because I have a document.", tier: ['brother'] },
    { text: "I'm not drunk, I'm CORRECT, and there's a difference, and it's in the minutes, which nobody reads.", state: ['drunk', 'wrecked'] },
    // rat
    { text: "You're the only one not talking. Finally, a serious person. Are you a serious person? Do you want to see the document.", route: 'rat' },
  ],

  [ARCHETYPE.UTILITY]: [
    { text: "Welcome, brother. My initiation was worse. Everybody says that. Mine actually was.", tier: ['prospect', 'brother', 'beloved'] },
    { text: "To the new blood! *(raises whatever's in hand, which is a lot)*", state: ['merry', 'drunk'] },
    { text: "You made it look easy. It's not easy. Ask the shirt by the truck. …too soon. Have a beer.", tier: ['brother', 'beloved'] },
    { text: "Good roar. I've heard bad ones. Bad ones we don't talk about, on account of the guy.", flag: 'roarLoud' },
    { text: "*(clinks your cup, says nothing, is having the best night of his life)*", state: ['drunk', 'wrecked'] },
    // rat
    { text: "You alright? You keep looking at Booski. We all love him but you're — you're really looking at him.", route: 'rat' },
  ],
};

// Snow (executioner) gets a couple of specials layered on the utility bank.
const EXECUTIONER_LINES = [
  { text: "No hard feelings on the first guy. Job's a job. You I like — you knew the founders.", tier: ['prospect', 'brother', 'beloved'] },
  { text: "You want to know if it gets easier. *(long pull of beer)* It got easier around number four. Cheers.", tier: ['brother', 'beloved'], state: ['drunk'] },
  { text: "I reloaded twice for that idiot. You? You I wouldn't have needed the second mag. Compliment.", tier: ['brother', 'beloved'] },
  { text: "*(cleaning something off his sleeve, doesn't look up)* You're not gonna make me work twice tonight, are you.", route: 'rat' },
];

// ---------- Ambient barks ----------
// NPCs talk to EACH OTHER on a loop when you're near, so the party sounds alive
// whether or not you're working the room. Each is a scripted exchange; the
// scene plays them as floating lines over the right heads. `rat: true` ones are
// only eligible on the rat route once suspicion is in the air.
export const AMBIENT = [
  [['ape', "Shubes is crying again."], ['shubes', "It's the SMOKE."], ['ape', "There's no smoke over there. You're upwind."], ['shubes', "…It's allergies."]],
  [['irish', "Are we going to talk about the parking or not."], ['hogmama', "Not."], ['irish', "Noted. AGAIN."]],
  [['booski', "Best induction in years."], ['lou', "You said that about the last one."], ['booski', "The last one's a shirt now, Lou."], ['lou', "…Fair."]],
  [['deathmegatron', "*(nods at the fire)*"], ['ape', "Deep. Real deep, big man."], ['deathmegatron', "*(nods again)*"]],
  [['hogmama', "Whose turn is the tarp this week."], ['ape', "Rippinflow's."], ['rippinflow', "…I did last week."], ['hogmama', "You're good at it, though."]],
  [['lou', "I'm not even meant to be here, technically. I'm at the airport."], ['ape', "You've been 'at the airport' for six years."], ['lou', "And I'll be there six more."]],
  [['irish', "Nobody. Answered. About the eggs."], ['shubes', "What eggs?"], ['irish', "EXACTLY."]],
  [['booski', "Rippinflow. Say something to the new blood."], ['rippinflow', "…Welcome."], ['booski', "BEAUTIFUL. That's the most he's said since March."]],
  // rat-route ambient — the party gets a low hum of wrong under it
  [['ape', "New guy's being weird."], ['hogmama', "I clocked it."], ['ape', "…Should we—"], ['hogmama', "Rippinflow's got it."], null, { rat: true }],
  [['lou', "Booski, do your toast where people can see your hands."], ['booski', "Why."], ['lou', "Humor me."], null, { rat: true }],
];

// ---------- The system ----------
export class NpcSystem {
  /**
   * @param {object} [opts]
   * @param {'normal'|'rat'} [opts.route]  the run's route; 'rat' unlocks probing + suspicion
   * @param {object} [opts.flags]          run flags read by line predicates (enduredFull, roarLoud, quizPassed, partyHasBong, ...)
   * @param {() => number} [opts.rng]      injectable RNG for deterministic tests; defaults to Math.random
   */
  constructor(opts = {}) {
    this.route = opts.route || 'normal';
    this.flags = opts.flags || {};
    this.rng = opts.rng || Math.random;
    this.npcs = ROSTER.map((r) => ({ ...r, standing: 0, drunk: 0, stoned: false, tripping: false, suspicion: 0, said: new Set() }));
    this.byId = new Map(this.npcs.map((n) => [n.id, n]));
    this._ambientSaid = new Set();
    this._barkTimer = 0;
    this._recent = []; // last few lines said by ANYONE — stops the room chorusing
  }

  get(id) { return this.byId.get(id); }

  /**
   * Seed everyone's standing from how the initiation actually went. Call once
   * on entering the party. `run` is a bag of booleans/numbers from the ceremony.
   */
  seedStanding(run = {}) {
    Object.assign(this.flags, run);
    for (const n of this.npcs) {
      let s = 30; // baseline: you're in, you're a brother by default
      if (run.enduredFull) s += 18;
      if (run.roarLoud) s += (n.archetype === ARCHETYPE.MUSCLE || n.archetype === ARCHETYPE.ROASTER) ? 22 : 10;
      if (run.quizHesitated) s -= (n.archetype === ARCHETYPE.PATRIARCH || n.archetype === ARCHETYPE.LIEUTENANT) ? 12 : 4;
      if (run.brokeLogFirstTry) s += 8;
      if (run.arrivedDrunk && n.archetype === ARCHETYPE.ROASTER) s += 6; // Ape respects it
      n.standing = clamp(s, -100, 100);
    }
  }

  /** The scene drives intoxication; buckets fall out of it in stateOf. */
  setDrunk(id, level) { const n = this.get(id); if (n) n.drunk = clamp(level, 0, 1); }
  setHigh(id, { stoned, tripping } = {}) {
    const n = this.get(id);
    if (!n) return;
    if (stoned !== undefined) n.stoned = stoned;
    if (tripping !== undefined) n.tripping = tripping;
  }

  /**
   * You looked at this NPC and held interact. Returns { name, text } — the line
   * to float over their head — or null if the id is unknown. Never repeats a
   * line for that NPC until their bank is exhausted, then it resets.
   */
  greet(id) {
    const n = this.get(id);
    if (!n) return null;
    const probing = this.route === 'rat' && n.suspicion > 60;

    // Probing NPCs prefer their rat lines; fall back to warm if they're spent.
    let line = probing ? this._pick(n, { probing: true }) : this._pick(n, { probing: false });
    if (!line) line = this._pick(n, { probing: false, ignoreSaid: true });
    if (!line) return { name: n.name, text: '…' };

    n.said.add(line.text);
    this._recent.push(line.text);
    if (this._recent.length > 5) this._recent.shift();
    // Engaging warms them a touch; on the rat route, working the room makes
    // SOMEONE ELSE nervous — the more you talk, the more the hum builds.
    n.standing = clamp(n.standing + 1, -100, 100);
    if (this.route === 'rat') this._raiseSuspicionElsewhere(n.id);
    return { name: n.name, text: line.text };
  }

  _pick(n, { probing, ignoreSaid = false }) {
    const bank = this._bankFor(n);
    const tier = tierOf(n.standing);
    const states = stateOf(n);
    const pool = bank.filter((l) => {
      const isRat = l.route === 'rat';
      if (probing ? !isRat : isRat) return false;
      if (l.tier && !l.tier.includes(tier)) return false;
      if (l.state && !l.state.some((s) => states.includes(s))) return false;
      if (l.flag && !this.flags[l.flag]) return false;
      if (!ignoreSaid && n.said.has(l.text)) return false;
      return true;
    });
    // Prefer lines nobody said in the last handful of exchanges, so two
    // utility members in a row don't parrot the same welcome. Only if that
    // leaves them nothing do we allow a recently-heard line back in.
    if (!ignoreSaid) {
      const fresh = pool.filter((l) => !this._recent.includes(l.text));
      if (fresh.length) return fresh[Math.floor(this.rng() * fresh.length)];
    }
    if (!pool.length) {
      // Widen: drop the tier constraint before giving up, so a freshly-met NPC
      // in an odd state still finds something in voice.
      const relaxed = bank.filter((l) => (l.route === 'rat') === probing && (ignoreSaid || !n.said.has(l.text)) && (!l.flag || this.flags[l.flag]));
      if (relaxed.length) { if (ignoreSaid) n.said.clear(); return relaxed[Math.floor(this.rng() * relaxed.length)]; }
      return null;
    }
    return pool[Math.floor(this.rng() * pool.length)];
  }

  _bankFor(n) {
    const base = BANKS[n.archetype] || BANKS[ARCHETYPE.UTILITY];
    return n.executioner ? base.concat(EXECUTIONER_LINES) : base;
  }

  _raiseSuspicionElsewhere(exceptId) {
    const others = this.npcs.filter((n) => n.id !== exceptId);
    // The quiet, watchful archetypes get suspicious fastest.
    const weight = (n) => (n.archetype === ARCHETYPE.QUIET ? 3 : n.archetype === ARCHETYPE.MUSCLE ? 2 : 1);
    const bag = [];
    for (const n of others) for (let i = 0; i < weight(n); i++) bag.push(n);
    const pick = bag[Math.floor(this.rng() * bag.length)];
    if (pick) pick.suspicion = clamp(pick.suspicion + 6 + Math.floor(this.rng() * 6), 0, 100);
  }

  /** Who's onto you (rat route). Handy for a HUD needle or a camera cue. */
  suspicionLeader() {
    let top = null;
    for (const n of this.npcs) if (!top || n.suspicion > top.suspicion) top = n;
    return top && top.suspicion > 0 ? top : null;
  }

  /**
   * Advance ambient chatter. Call every frame with dt; roughly every `every`
   * seconds it returns a scripted exchange (array of { who, name, text }) for
   * the scene to float over the right heads, else null.
   */
  tickAmbient(dt, every = 7) {
    this._barkTimer += dt;
    if (this._barkTimer < every) return null;
    this._barkTimer = 0;
    return this.ambientBark();
  }

  /** Pull one unused ambient exchange, resolving ids to names. null if none fit. */
  ambientBark() {
    const eligible = AMBIENT.filter((ex, i) => {
      if (this._ambientSaid.has(i)) return false;
      const meta = ex[ex.length - 1];
      const isRat = meta && typeof meta === 'object' && !Array.isArray(meta) && meta.rat;
      return isRat ? this.route === 'rat' : true;
    });
    if (!eligible.length) { this._ambientSaid.clear(); return null; }
    const idx = AMBIENT.indexOf(eligible[Math.floor(this.rng() * eligible.length)]);
    this._ambientSaid.add(idx);
    return AMBIENT[idx]
      .filter((step) => Array.isArray(step))
      .map(([who, text]) => ({ who, name: (this.get(who) || {}).name || who, text }));
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
