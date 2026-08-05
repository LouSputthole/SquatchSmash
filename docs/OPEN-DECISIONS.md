# OPEN DECISIONS — the mansion siege, and what it is blocking

Every item here is something I can build more than one way, where the ways
lead somewhere different. **Nothing below is a bug.** The bugs get fixed; these
get decided.

Written 2026-08-05, against `claude/squatch-life-continuation-2c23z0`.
State at the time: `verify:mansion-siege` 43/43, `verify:mansion` 199/199,
799 tests.

---

## 1 · CAN THE FAMILY DIE? — the biggest one

### What is actually happening

Thirteen named people are on `SURVIVES_THE_SIEGE` in
`src/mansion/siege/ensemble.js`: Lou, Booski, Rippinflow, Snow, Shubenator,
Eric, Aubbie, Irish, DeathMegatron, Numbskull, Hog Mama, Willy and Captain
Lou Sasole. Everyone on that list gets `core: true` on their `CombatActor`,
which makes the shared combat core refuse the killing blow: health floors at
1, `injury` goes to `severe`, and `incapacitated` never becomes true.

The three mansion guards are deliberately **not** on the list, because
somebody has to be able to die or the night has no stakes, and Aubbie is
already written as working on a wounded one.

**The measured symptom:** in a 90-second unblocked firefight — every friendly
in the open with clean lines to twenty-two attackers — the entire named cast
ends the fight pinned at 1 HP. Nobody is dead, everybody is dying. With real
colliders in the house most of those lines are blocked, so this is a
worst-case number rather than what a player will see. But it is the direction
the system leans, and if it reads as *"everyone is bleeding out and nothing
ever happens"* it will undercut the whole set piece.

### Why it is built this way

The brief's constraint was explicit and it is a good one: friendlies must not
outkill the player, must not become invulnerable *unless the mission says so*,
and named-character survival must be **mission configuration, not a hidden
rule in the combat core**. `core: true` is the core's existing mechanism for
exactly that, and the ensemble uses it rather than inventing a second one.

### The options

**A · Leave it. Named cast is plot-armoured, and it shows.**
Nobody in the family dies because the campaign needs all of them for the
Enola briefing, the return leg and the cartel palace. The 1-HP pin becomes a
visible state — bloodied, kneeling, being worked on — rather than something to
hide.
*Cost:* the fight has no personal stakes. *Gain:* zero campaign risk, zero
extra work.

**B · Raise friendly health and let the pin be rare.**
Named cast go from 110 max HP to something like 220, plus a friendly-side
damage scale so a cartel round does ~60% to a Squatch. Most of them finish the
night hurt but standing; the pin only happens to someone who genuinely stood
in the open all night.
*Cost:* one number, one afternoon of tuning. *Gain:* the pin stops being the
normal outcome. **This is my recommendation as a floor, whatever else we do.**

**C · One named character can die, chosen by the mission.**
Pick one — my instinct is **Numbskull or Hog Mama**, someone the player likes
and the campaign does not structurally need — and take them off the survival
list. They go down in wave two. The aftermath scene has a body in it and Lou
has something to say about it.
*Cost:* their lines have to be conditional from here to the end of the
campaign, which is real writing work. *Gain:* the siege stops being a set
piece the family walks out of, and the Enola briefing has grief in it — which
is exactly the emotional payoff the arc was designed for.

**D · A character can die if the PLAYER fails to protect them.**
Downed-but-savable: a friendly at 0 goes to a bleed-out timer, and the player
can reach them. Miss the timer and they are gone for the rest of the campaign.
*Cost:* the biggest of the four — a new mechanic, a HUD, a save flag, and
every downstream scene needs a "if they died" branch. *Gain:* the most
player-authored version of the night, and by far the most memorable.

> **Recommendation: B now, and decide between A / C / D before the Enola
> briefing is written.** B is cheap and stops the bad reading immediately; the
> other three are writing decisions and the briefing is the scene that pays
> them off, so they should be made together.

---

## 2 · THE GALLERY CANNOT SEE THE FIGHT IT IS DEFENDING

### What is actually happening

The upper gallery — `GALLERY`, x −16..16, z 48.2..52.8, and the balcony bay in
front of it — **has no exterior wall**, so it has no windows. The staircase
defence is fought from a landing that can see the foyer floor and both stair
flights and *nothing outside the building*.

The attackers stage in the forecourt, come up the drive past burning cars, and
the player's only evidence of any of it is the noise and whoever walks through
the front door.

### Why it matters more than it sounds

The brief's whole opening sells an exterior battle: burning vehicles, guards
trading fire with attackers, silhouettes behind cars, secondary explosions.
All of that is built and standing in the forecourt right now. From the one
position the player spends the climax in, it is invisible.

### The options

**A · Leave it, and let the front door carry the fight.**
The foyer's own front glass is already in the siege's pane list, so the player
sees the forecourt *through the ground floor*, not from the landing.
*Cost:* the wrecks and the exterior fight are largely wasted. *Gain:* nothing
moves.

**B · Put windows in the gallery's south elevation.**
The gallery's south edge overlooks the foyer void, not the outside — so this
means the elevation above the front door, at upper-floor height. Real
geometry, in `Mansion_Base`, affecting the walking tour as well.
*Cost:* a base-mansion edit, which is the thing this whole architecture exists
to defer. **It belongs in the mansion overview, not in the siege.**
*Gain:* the climax can see the drive.

**C · Move the firing step.**
Fight from the office balcony or the conference-room windows instead of the
gallery rail. Both are on the north side, which faces the wrong way.
*Cost:* rewrites the defence's whole geometry and loses the commanding view of
the foyer, which is the better half of the position.
*Gain:* none I can see. Listed because it was considered and rejected.

**D · Give the player a reason to look out, once.**
A scripted beat between the waves — Booski at a window on the way, or the lull
sending the player to a specific spot — so the exterior fight is seen
deliberately rather than continuously.
*Cost:* small. *Gain:* most of the value of B for none of the geometry risk.

> **Recommendation: D now, B at the mansion overview.** It is already row one
> of the future-edit list and it is the row I would most like to see land.

---

## 3 · THE SIEGE HAS NO VOICE, AT ALL

Not one line of the siege is recorded, and three separate pieces of writing
are outstanding:

| Piece | What it is | Size |
| --- | --- | --- |
| **The office briefing** | The player reports in, Lou confirms a full assault, Booski says more are coming, the family takes the upper floor, the Prospect is put on the stairs. Interrupted at least once by the house being hit | ~20–30 lines, most of the cast |
| **The post-battle conversation** | Confirms the attack is stopped, establishes the cartel is bigger than anyone thought, hands the Prospect to Sasole | ~12–18 lines |
| **Combat barks** | Threat callouts, reloads, "they're on the stairs", the wounded, someone reacting to the dead performer in the foyer | ~60–90 short lines across the whole cast |

**The barks are the awkward one.** They currently live as plain text tables
inside `attackers.js` and `ensemble.js`, because the agent that wrote them
could not edit `src/mansion/script.js`. They carry **no cue names**, which
means they are subtitles with no audio path. Moving them into a proper siege
script file is mechanical; deciding how many of them get recorded is not.

**The one line that already exists as a cue name is
`siege.prospect.little_friend`** — declared, preloaded, and pointing at
nothing.

### The options

**A · Write and record everything.** ~110 lines across the cast.
**B · Record the two conversations, leave the barks as subtitles.** The
conversations are the scene; barks read acceptably as text over gunfire.
**C · Record the two conversations plus a bark core** — say 25 lines that
repeat, rather than 90 that do not.

> **Recommendation: C.** And the briefing is the piece the owner already said
> should be *"planned with the owner"* and *"not improvised alongside the
> level"* — so it should be written as data, in one file, before anybody
> builds a cutscene around it. The same instruction that applied to the Enola
> briefing applies here.

---

## 4 · TWO IDENTITIES NOBODY HAS PICKED

**The dead Bada Bing performer in the foyer.** She is built, dressed from the
evening, with a dropped glass beside her. She has no name. The brief is
explicit that she is not clutter — a friendly NPC reacts to her once. Which
performer she is changes what that reaction is, and it is a real choice: an
established name lands harder and costs more.

**The foyer centrepiece.** The siege wrecks it. What it is when it is intact
is undecided — a statue, a fountain, a floral arrangement, a sculptural table,
a display pedestal, a silver Sasquatch monument. The wreck is built against a
named anchor so the final object can change without touching the siege, and
the dressing pass suppresses the intact one by *footprint sweep* rather than
by name, so it will find whatever the overview puts there.

> Both are cheap to decide and cheap to change later. Neither blocks anything.

---

## 5 · ATTACKERS WALK STRAIGHT LINES

There is no navigation mesh. Every attacker walks straight between authored
waypoints, and the routes were audited leg by leg — no leg is longer than the
house is wide, and the one genuinely bad diagonal (the service door to the
foyer, 26 m through two partitions) was fixed with two room-to-room legs.

**This is fine, and it is also brittle.** Move a wall and the routes need
revisiting. A test asserts the leg lengths, so it will fail loudly rather than
quietly — but it will fail.

### The options

**A · Leave it and keep the leg test.** Cheapest, and correct while the house
is stable.
**B · Author a nav graph for the mansion.** `src/heist/navigation.js` already
has `AuthoredNavigationGraph` and `SquadDirector` — anchors, occupancy,
BFS pathing, recovery. It is a real system and it is already in this codebase.
*Cost:* authoring the anchor set. *Gain:* the cartel palace gets it for free,
and the palace is an infiltration where routes matter far more than they do
in a defensive stand.

> **Recommendation: A for the siege, B before the cartel palace.**

---

## 6 · WHAT THE OWNER STILL OWES

Nothing can be built for these; they are files and ids only the owner has.

| Item | Blocking |
| --- | --- |
| Voice id — female NPC, Lou's room | The two women in the master-suite hot tub |
| Voice id — additional male NPC | Whatever it was wanted for |
| Voice id — `sauce` | Sauce's lines in the Bing, and the whole cartel-palace reveal |
| `assets/video/the-feature.mp4` | The home theatre, and the evening-before-bed film beat |
| `assets/art/enola-squatch-nose-art.png` | The bomber's nose art |
| The real "Can't You Hear Me Knocking" recording | Its cue |

> The two NPC voice ids were mentioned in conversation but never actually
> pasted. That is the only reason they are not wired.

---

## 7 · THE REST, BRIEFLY

**NO WAKE redesign.** Part one — the boat and cabin hull — was dispatched to an
agent that died in a container restart with zero commits. Part two — mission
flow and dialogue — has never been dispatched. The spec is written in full at
`docs/NO-WAKE-REDESIGN.md` and is not blocked on anything.

**`main` is a long way behind.** `main` is at `f07a712`; the working branch is
many commits past it, and there are nine other remote branches including
`claude/outfit-refinement-pass-d2lk39` and
`codex/silver-room-voice-recast-20260804`. A branch audit and a merge to
`main` is owed and is not a decision — it is work.

**The aftermath has no trigger in the world.** `mission.aftermathEnded()` and
`mission.metSasole()` both exist and both work; nothing in the scene calls
them, because the conversation that would call them is not written (see 3).
The mission currently ends, correctly, at `AFTERMATH`.
