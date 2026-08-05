# MANSION UNDER SIEGE — the night the finale starts

The Prospect stayed the night at Lou's. He wakes up because the house is
being taken apart around him.

This is the mission that turns Lou's mansion from a place of wealth, safety
and belonging into a defensive stand. It is **not** the campaign finale. It
is the fuse: it lights the Enola Squatch mission, which bombs the wrong city,
which reveals that Sauce was never kidnapped, which sends the Prospect into
Mark's cartel palace. Initiation is the ending scene after that.

---

## PART 0 — THE ONE ARCHITECTURAL DECISION

> "The smartest technical move is making siege damage a mission-state
>  overlay. That lets us keep polishing the real mansion without having to
>  repair three forked maps every time a staircase moves six feet."
> — owner brief, 2026-08-05

**The canonical mansion is `MansionGrounds.js` + `MansionInterior.js` and
nothing else.** The siege must not fork them, must not copy them, and must
not edit them. It calls the same two builders the walking tour calls, gets
the same `{ root, colliders, props, anchors, rooms, doors, lights }` back,
and then hangs a **state layer** on top of the result.

That gives three scenes off one geometry source:

| Scene id | Builder source | State | Status |
| --- | --- | --- | --- |
| `Mansion_Base` | `MansionGrounds` + `MansionInterior` | `clean` | shipped |
| `Mansion_Siege_Night` | the same two builders | `under_attack` → `post_battle` | this document |
| `Cartel_Palace_Final` | its **own** builders | n/a | later, and separate |

The cartel palace is deliberately **not** on this list as a damage layer. It
reuses systems, proportions, props, stair modules and encounter tooling —
it does not reuse the mansion's floor plan. See PART XIII.

### What "state layer" means concretely

`src/mansion/siege/state.js` owns a `MansionDamageState` with six named
states, each a set of **object group toggles** plus environment settings:

```
clean        the walking tour. Nothing added, nothing hidden.
alert        night. Alarm lit, guards posted, nothing broken yet.
under_attack alert + wrecks + fires + broken glass + bodies + debris.
damaged      under_attack with the fighting over; fires still burning.
post_battle  damaged + friendly NPCs in aftermath posts, alarm winding down.
repaired     clean, but with the story flag set. Used on the return leg.
```

Every siege object is built once, parented to a named group, and toggled by
`visible` + collider enrolment. Nothing is destroyed and rebuilt on a state
change, so a checkpoint restore is a state re-application, not a reload.

**A broken window is two objects, not one edit.** The intact pane belongs to
the base build and gets hidden; the shattered frame + shard litter belongs to
the siege group and gets shown, and the pane's collider is withdrawn from the
shared collider list at the same instant. Anything less leaves invisible glass
you can't walk through — the exact fault we already fixed in NO WAKE.

---

## PART I — THE ROUTE, ON THE REAL FLOOR PLAN

The good news is the house already has the rooms this mission needs, in the
order it needs them. Nothing below is proposed geometry — every figure is a
constant already exported by `MansionGrounds.js` / `MansionInterior.js`.

```
        ┌───────────────────────────────────────────────────────┐
  z=75  │  OFFICE (upper)      -9..9      z 63.2..75             │  ⑤ Lou
        ├───────────────────────────────────────────────────────┤
  z=63  │  CONFERENCE (upper)  -9..9      z 53.2..62.8           │
        ├───────────────────────────────────────────────────────┤
  z=53  │  GALLERY (upper)    -16..16     z 48.2..52.8           │  ⑥ landing
        │      BALCONY  -3..3  z 45.2..48    ← the firing step   │
  z=48  │  STAIR_WEST / STAIR_EAST — the horseshoe down          │
        ├───────────────────────────────────────────────────────┤
  z=36  │  FOYER (ground)   -8.85..8.85   z 36..57.85            │  ④ foyer fight
        │      FRONT_DOOR at x 0, z 36                           │
        └───────────────────────────────────────────────────────┘
             ↑ forecourt: COURT_CENTRE (0, 30), r 12; FOUNTAIN (0, 27)

        ── basement, BASEMENT_Y = -2.8 ──────────────────────────
        ARMORY  (BASEMENT_ROOM)   -9..9    z 50..64      ③ arm up
        BASEMENT_STAIR          5.4..9     z 51..58      ← up to rear hall
        CELLAR_HALL           -15.6..15.6  z 64.3..67.4  ② two enemies
        GUEST_ROOM            -15.6..-7.9  z 67.7..74.6  ① you wake here
```

**Read that top to bottom and the mission designs itself.** You wake in the
guest room at the far west end of the cellar corridor. The armory is at the
other end of that corridor and then south through the door. Two men in the
corridor between them is the whole of the first encounter, and the corridor
is 31 m long and 3.1 m wide — a genuine shooting lane with door reveals off
both sides (theatre, LAN room, vault).

From the armory the basement stair comes up at x 5.4–9, z 51–58, into the
rear hall — which puts you into the **north** end of the foyer, looking south
down its 22 m length at the front door the attackers are coming through. The
horseshoe stair is on your flanks. Lou's office is directly above your head.

The staircase defence position is the **gallery edge and the balcony bay** at
x −3..3, z 45.2–48, six metres above the foyer floor, with the chandelier at
(0, 8.6, 44.4) between you and the front door. Both stair flights are open
routes an attacker can climb. That is the fight.

### Objective chain

| # | Objective | Completes when | Checkpoint |
| --- | --- | --- | --- |
| 1 | *(none — wake up)* | control returns | **CP1** wake |
| 2 | Reach the armory | player enters `BASEMENT_ROOM` | — |
| 3 | Arm yourself | primary + heavy taken from the rack | **CP2** armed |
| 4 | Reach Lou's office | player enters `OFFICE` | — |
| 5 | *(cutscene)* | conversation ends | **CP3** briefed |
| 6 | Hold the house | wave one cleared | **CP4** wave one |
| 7 | Hold the house | wave two cleared | — |
| 8 | Meet Captain Sasole | talk to Sasole | mission complete |

---

## PART II — OPENING

Night. The alarm is already going. The fight started without you.

**No long cinematic.** A short wake-up — eyes opening on the guest-room
ceiling, the camera righting itself over about 1.6 seconds — and then
control. The player should be standing up and confused inside two seconds of
the fade.

What the wake-up sells, all of it audio and all of it already outside the
room before the player is upright:

- the house alarm, a slow two-tone, never stopping until PART IX
- automatic fire outside, muffled through the podium
- shouting down the corridor, not intelligible
- glass going somewhere above
- a vehicle detonating in the forecourt, felt as a low thump
- emergency lighting pulsing red down the cellar hall

The guest room has no window — it is a basement. **That is a feature.** The
player's first information about what is happening comes from sound alone,
and the first thing they *see* of the battle is through the rear hall's glass
when they come up the basement stair. The confusion is structural rather than
scripted.

### Starting equipment

Pistol. One magazine in, one spare. No long gun, no heavy. Full health.

Enough to survive two men in a corridor if the player aims. Not enough to
make the armory optional.

---

## PART III — THE ROUTE TO THE ARMORY

**Leaving the guest room.** Emergency light pulse in the corridor, one
friendly guard running west-to-east across the corridor mouth and gone, a
wounded guard against the wall who shouts that they are already inside.

**The corridor encounter — two hostiles.**

| | Position | Behaviour |
| --- | --- | --- |
| Enemy 1 | corridor, x ≈ −4, facing east | advancing from cover to cover, back to the player at first, turns on the guest-room door opening |
| Enemy 2 | corridor, x ≈ +8, near the vault door | firing east at a mansion guard, joins when 1 engages |

Both are ordinary `CombatActor`s on the shared framework — cover behaviour,
suppression, hit reactions, death handling, combat barks. Not scripted
targets.

**The dead guard on the couch.** In the theatre doorway alcove, off the
navigation line, dropped weapon beside him, impacts in the wall behind, a
security radio still hissing next to his hand. He is the sentence "they were
in the house before you woke up," and he should be readable in one look.

**The armory.** `BASEMENT_ROOM`, already dressed as one. For the siege it
gains a working rack interaction: primary (rifle or SMG), optional shotgun,
pistol and primary ammunition, and **one heavy automatic weapon** which is
the "little friend." Not the whole catalogue — a loadout for interior
fighting and a staircase.

Objective 2 completes on entry, objective 3 on taking the primary + heavy.
**CP2.**

---

## PART IV — THE FOYER

Up the basement stair into the rear hall, west into the foyer.

The house is fighting on the way past: guards firing from doorways, a
wounded man dragging himself into cover, a Squatch shooting from the lounge,
rounds coming in through broken glass, smoke gathering at the ceiling,
casings underfoot, furniture shoved into improvised cover.

**Foyer encounter — three hostiles.** One behind the wrecked centrepiece,
one at the front door line (z ≈ 36), one entering from the lounge bay to the
east. Multiple approaches for the player, and short: momentum matters more
than attrition here.

**The destroyed centrepiece.** Whatever the finished mansion ends up putting
in the middle of the foyer, the siege shows it broken: fragments, a partial
cover volume, dust, impacts. Built against a named anchor so the final
object can change without touching the siege.

**The fire.** One manageable fire — a curtain or a wrecked console near the
front entrance. Movement, light, smoke. It never blocks the route and there
is no extinguisher mechanic.

**The dead Bing performer.** One of the women from the Bada Bing is on the
foyer floor, still dressed from the evening, a dropped glass near her hand.
A friendly NPC reacts to her once, briefly, and then goes back to shooting.
She is not clutter and she is not a prop bark — she is the line that says the
house was full of people an hour ago. Her identity gets picked from the
established Bing performers once the party staging is final.

---

## PART V — LOU'S OFFICE

Everyone still alive is armed. This is the shot that says the whole family
is in it.

Staging is layered rather than a semicircle: Lou at the desk end working the
phone and the window; Booski covering the office door; Rippin at the gallery
rail; Snow watching the west corridor; Shubenator at the radio; Eric holding
the head of the stairs; Aubbie handing out magazines and working on a
wounded guard; the surviving guards spread down the landing.

They keep fighting through the conversation — reloading, checking windows,
calling contacts, flinching when rounds come through. The dialogue gets
interrupted at least once by the house being hit.

The conversation itself is written separately. Its job here: the player
reports in, Lou confirms a full assault, Booski says more are coming up the
front grounds, the family takes the upper floor, Lou puts the Prospect on the
stairs. It does not spend a single campaign secret. **CP3.**

Objective: **Hold the house.**

---

## PART VI — THE STAIRCASE

The player takes the gallery edge above the foyer.

The landing gives a commanding view, partial cover at the rail, an ammunition
point, friendly positions to either side, and two stair flights plus the
foyer's side rooms as enemy routes. It is **not** a safe box: attackers fire
up, suppress the rail, break windows, and push the flights. The rail is
cover, not immunity.

### "Say hello to my little friend"

Once. Ever.

1. Booski calls the next group coming up the drive.
2. The player moves to the top of the stairs.
3. The heavy comes up.
4. The first attackers come through the door.
5. The Prospect says the line.
6. **Control never leaves the player.**
7. Music rises. Wave 1A enters.

The heavy uses the normal recoil, spread, ammunition, hit-location and reload
systems. It is powerful, not a turret, and this is not on rails.

---

## PART VII — WAVES

| Wave | Group | Count | Entry | Composition |
| --- | --- | --- | --- | --- |
| One | 1A | 4 | front door + forecourt | 3 rifle, 1 SMG |
| One | 1B | 4 | east lounge bay + broken glass | 2 rifle, 1 SMG, 1 flanker |
| — | *lull* | — | — | reload, reposition, callouts |
| Two | 2A | 5 | frontal, front door + court | 3 rifle, 1 suppressor, 1 SMG |
| Two | 2B | 4 | west living room + windows | 1 shotgun rusher, 2 rifle, 1 flanker |
| Two | 2C | 5 | mixed, final push | 1 leader, 1 armored, 1 MG, 2 rifle |
| | | **22** | | |

**1B does not wait for 1A to die.** It activates on a timer or on 1A's
half-strength, whichever comes first, so the player can never grind the room
clean at leisure. Same rule for 2B against 2A and 2C against 2B.

**Nothing appears out of thin air.** Every attacker activates in a staging
zone out of the player's view and walks in:

- `court_north` — behind the fountain and the burning cars, (0, 30) r 12
- `front_steps` — the porch, straight in through `FRONT_DOOR`
- `lounge_bay` — the east bay's glass, x 16–20.6, z 41–54
- `living_west` — the west living room's windows
- `rear_service` — the rear door at (16, 66), the long way round
- `veranda` — the south terrace

An enemy becomes an active `CombatActor` the moment its staging zone opens,
which is before it is visible, so it arrives already fighting.

### Friendlies

Almost all of them are shooting. None of them wins the mission for you.

They fire, suppress, call threats, occasionally kill someone, hold side
routes, react to wounds and move between assigned cover. They do **not**
outkill the player, stand in the player's line, block the stairs, fire
without reloading, ignore incoming rounds, become invulnerable unless the
mission says so, or chase an enemy out of the house and break a trigger.

Named-character survival is a mission configuration flag, not a hidden rule
inside the combat core.

> **Standing constraint, unchanged:** Snow is never a hostile target and
> never enters player-hostile damage logic, in this mission or any other.
> The faction matrix already refuses crew-on-crew; the siege must not add a
> path around it.

---

## PART VIII — SYSTEMS

No siege-only health, damage or weapon code. The mission calls the shared
framework and nothing else:

`core/combat/actors.js` · `core/combat/ballistics.js` ·
`core/combat/factions.js` · `core/combat/suppression.js` ·
`core/combat/tracers.js` · `core/combat/weapon.js` ·
`core/weapons/WeaponSystem.js` · `core/weapons/Firearm.js` ·
`core/weapons/Armory.js` · `core/weapons/Ejecta.js` · `world/bullets.js` ·
`world/splat.js` · `world/smoke.js`

One extension is required and it belongs in the shared core, not in the
mission: **a `CARTEL` faction.** `FactionMatrix` today hardcodes CREW↔POLICE.
The siege needs CREW↔CARTEL hostile on the same terms, with civilians and
neutrals protected exactly as they are now.

**Glass.** Intact → cracked → broken, with the collider withdrawn on break,
particles, the right impact sound, and line of sight and projectile passage
both updating. No invisible panes.

**Fire and smoke.** Bounded. Smoke must not hide enemies, wreck the frame
rate, confuse AI vision, fill the house or cover objective markers. The
player has to be able to read the battlefield.

**Checkpoints** restore weapon, health, ammunition, dead enemies, dead
guards, damage-state props, broken glass, completed objectives, active wave,
friendly positions and dialogue state. Cleared sections never repopulate.

---

## PART IX — AFTER

The defence ends when wave two is down, no hostile remains inside the
encounter boundary, and the friendlies fall back to aftermath posts.

Music drops. The alarm keeps going a while longer before someone kills it.

The house does not become peaceful on a timer: bodies in the foyer, smoke at
the ceiling, glass everywhere, wounded guards, Squatches reloading, someone
at the front door looking out, the small fire still going, gunfire fading
down the valley, the security radio still talking.

Lou comes to the landing. That conversation gets written separately; its job
is to confirm the attack is stopped, establish that the cartel is bigger than
anyone thought, and hand the Prospect to Captain Sasole.

**New objective: Meet Captain Sasole.** → the Enola Squatch mission, its own
map, loaded as its own scene. The flight never runs inside the mansion.

---

## PART X–XII — WHAT COMES AFTER, IN ORDER

1. **Enola Squatch.** Fly it, carry the Fat Squatch, drop it, believe it
   worked.
2. **Return to the mansion**, `repaired` state — the canonical clean house
   with a story flag, never the siege damage written back. Lou explains they
   bombed the wrong city. The cartel has taken Sauce. Played grim and absurd,
   as a scene, not a HUD toast.
3. **The cartel palace.** Presented as a rescue. It is not one.

The twist, staged not announced: Sauce is not restrained, not guarded, moving
freely, treated as a guest. Documents, radio chatter, photographs, guard
conversation, his own belongings, security footage — and finally Sauce armed
and seated at Mark's table. The rescue becomes an execution.

Mark is the cartel boss and should be established by the building before he
is met: portraits, initials, insignia, family photographs, his cars, his
office.

---

## PART XIII — THE CARTEL PALACE

Its own map. Not Lou's mansion in a different colourway.

**Reuses:** combat, doors, windows, stair modules, dining props, vegetation,
lighting technique, guard AI, encounter tooling, infiltration scripting, and
every set-dressing lesson this house taught us.

**Differs in:** exterior silhouette, stucco and stone and tile and carved
wood, courtyards, walled and gated approach, water, service passages,
separate guard housing, a much larger dining room, a different floor plan,
darker and more isolated light, cartel vehicles, checkpoints, and regional
architecture used as architecture rather than as costume.

A wealthy criminal compound built for privacy, family life, intimidation and
defence. Not a theme park.

**Shape** — Sicario's estate infiltration as rhythm, not as shot list:
quiet approach → perimeter → controlled eliminations → deeper → the evidence
about Sauce → rescue becomes betrayal → the dining room → Mark and Sauce →
resolution → the campaign ends.

The contrast is the point:

| The siege | The palace |
| --- | --- |
| loud | quiet |
| chaotic | deliberate |
| defensive | predatory |
| the whole ensemble | alone, or nearly |
| automatic fire | controlled violence |

---

## PART XIV — FUTURE MANSION EDIT LIST

Improvements the siege exposes in the base mansion. **None of these are
applied to `Mansion_Base` from this mission.** They wait for the mansion
overview to be approved so the house gets designed right once.

| Proposed edit | Current problem | Reason | Missions affected | Geometry | Nav | Art only | Priority | Duplicate-work risk | Timing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Widen the gallery landing at the stair heads | Friendly NPCs plus the player on one rail is tight for a seven-body defensive line | The staircase defence is the mission's climax and needs standing room | Siege | yes | yes | no | high | high — moves the horseshoe | with the overview |
| Give the foyer centrepiece a named anchor | The siege needs to wreck an object whose final identity is undecided | Lets the centrepiece change without touching the siege | Base, Siege | no | no | yes | high | low | now, cheap |
| Second route from the office to the landing | One door means one choke point for eight NPCs in a firefight | Ensemble staging and fallback | Siege | yes | yes | no | med | med | with the overview |
| Move the armory nearer the guest wing, or add a cellar-hall door | Armory is at the far south end past the stair head; the corridor walk is long under fire | Opening pacing | Siege | yes | yes | no | med | med | with the overview |
| Believable exterior guard posts | Attackers currently have to arrive somewhere, and the grounds have no fighting positions | Wave staging that reads as a real perimeter | Base, Siege | yes | no | no | med | low | with the overview |
| Widen the front-door combat space | The porch is a narrow funnel; 22 attackers through it becomes a queue | Wave entry variety | Siege | yes | yes | no | high | med | with the overview |
| More upper-floor window sightlines onto the forecourt | The upper floor can barely see the fight it is defending against | Reading the battlefield from the landing | Base, Siege | yes | no | no | med | low | with the overview |
| Add a service corridor behind the kitchen | No flanking route exists for either side | Enemy flankers, player fallback | Siege, Cartel | yes | yes | no | low | med | with the overview |
| A mansion security room | The alarm, the cameras and the radio have no home | Alarm state, siege fiction, cartel-palace parallel | Base, Siege | yes | no | no | med | low | with the overview |
| Improve the forecourt vehicle turnaround | Wrecks need believable parked positions before they are wrecks | Wreck placement, spawn staging | Base, Siege | no | no | yes | low | low | now, cheap |
| Cover placement pass in the foyer | Nothing in the foyer is shootable-from | The foyer fight and both waves | Siege | no | yes | no | high | med | with the overview |
| Widen the cellar-hall doors | 3.1 m corridor with narrow doors makes reveals unreadable | Corridor encounter | Siege | yes | yes | no | low | low | with the overview |

**Rule:** anything in this table that is marked "with the overview" stays in
this table. Items marked "now, cheap" are art-only or anchor-only and can
land in `Mansion_Base` without risking rework.

---

## PART XV — DELIVERABLES AND WHERE THEY LIVE

| # | Deliverable | Home |
| --- | --- | --- |
| 1 | Mission-flow diagram | this document, PART I |
| 2 | Inherited `Mansion_Siege_Night` scene | `src/mansion/siege/main.js`, `mansion-siege.html` |
| 3 | Night-lighting pass | `src/mansion/siege/night.js` |
| 4 | Exterior vehicle wrecks | `src/mansion/siege/dressing.js` |
| 5 | Broken-window states | `src/mansion/siege/glass.js` |
| 6 | Bodies and damaged props | `src/mansion/siege/dressing.js` |
| 7 | Player start | `src/mansion/siege/mission.js` |
| 8 | Armory route | `src/mansion/siege/mission.js` |
| 9 | Corridor encounter, 2 | `src/mansion/siege/waves.js` |
| 10 | Foyer encounter, 3 | `src/mansion/siege/waves.js` |
| 11 | Office objective trigger | `src/mansion/siege/mission.js` |
| 12 | Ensemble staging | `src/mansion/siege/ensemble.js` |
| 13 | Defence combat boundary | `src/mansion/siege/waves.js` |
| 14 | Wave one | `src/mansion/siege/waves.js` |
| 15 | Wave two | `src/mansion/siege/waves.js` |
| 16 | Friendly positions | `src/mansion/siege/ensemble.js` |
| 17 | Combat integration | `src/core/combat/*` — shared, extended with CARTEL |
| 18 | Checkpoints | `src/mansion/siege/mission.js` |
| 19 | Post-battle transition | `src/mansion/siege/mission.js` |
| 20 | Future mansion-edit list | this document, PART XIV |

---

## THE POINT

The mansion has stood for wealth, safety, power, belonging and status. For
one night it is alarms, glass, gunfire, fire, bodies, shouting, smoke and
people you know fighting for the building.

The player starts alone with a pistol, fights to the armory, regroups with
the whole family, and then stands at the top of the stairs while the house is
attacked in waves.

It feels like the last stand. It is the first one.
