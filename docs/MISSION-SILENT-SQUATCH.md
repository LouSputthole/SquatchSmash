# Mission — PROJECT SILENT SQUATCH

Owner's spec, 2026-08-04. Set in Lou's mansion, immediately after The Silver
Case. **Read `TONE-AND-PARODY.md` before building any of it**: the xXx nod and
the Russians-in-a-lab are already absurd on their own, so nothing in the scene
gets to notice. Play it dead straight and let it get genuinely ugly.

## What it is for

> This is the moment the Prospect realizes Lou's mansion is not merely a rich
> gangster's house. It is a functioning criminal headquarters with interrogation
> rooms, hidden laboratories, weapons development, and problems that disappear
> beneath the floorboards.

The tone escalates in five stages, and the build should be legible as those
stages: **luxurious mansion intrigue → dark comedy → uneasy underground
exploration → cold-blooded execution → full horror behind laboratory glass.**

## The naming, which must stay consistent

| Term | Means |
|---|---|
| **Squatchanium** | the enriched power material — what is in the case |
| **Silent Squatch** | the secret weapons programme |
| **Fat Squatch** | the completed deployable payload (already flown in SQUATCHOLA GAY) |
| **Silent Night** | the laboratory cleanup protocol |

## The case

**Reuse the case from The Silver Case** (`src/silvercase/props/case.js`) — this is
the same object, carried forward. It should read as unusually heavy and
valuable: silver reinforced corners, two mechanical locks, faint vibration when
held, a low electrical hum, occasional purple light leaking through the seams.

Two internal point lights, **gold from the core and purple from the containment
rings**, only fully visible once it opens, brightening when it faces Lou and
again when Booski opens it. The contents are never shown clearly — a metallic
cylinder, purple energy under transparent shielding, a pulsing gold centre,
vapour curling off the casing.

## Beat 1 — arrival

Objective: **Deliver the package to Lou.**

Everyone still alive is in the house. **No HotDog.** Placement and lines:

- **Rippin**, near the bar pouring a drink, watching the case: *"Whatever's in that thing, I don't want it near my balls."*
- **Eric**, at a table with paperwork: *"Lou's waiting for you. And he's been in one of those moods."*
- **Shubes**, appearing from a hallway: *"Hey guys, what's going on?"* — then, looking at the case: *"Actually, never mind. I don't want to know."*
- **Snow**, cleaning something suspicious off the marble in the foyer: *"Try not to make more work for me tonight."* (Quiet foreshadowing of his cleanup job.)

## Beat 2 — Lou's office

The office exists already; modify rather than rebuild. Intended feel: dark wood,
heavy curtains, purple leather, a large painting of Lou on horseback, gold desk
accessories, cigar smoke, hidden weapons under the desk, and **a concealed door
in the bookcase for future use**.

The player places the case on the desk. **Lou rotates it to face him** before
opening. The locks release, the room goes briefly quiet, the lid opens slowly,
and the gold-and-purple glow pours toward Lou — purple rolling across the walls,
gold on his eyes, the cigar smoke, his hands.

    PROSPECT   What's inside?
    LOU        Squatchanium. Booski will show you what that means downstairs. Then you’ll wish I hadn’t named it.
               [closes the case]
    LOU        Go deliver it to Booski. He's in the basement.
               [slides the case over]
    LOU        Hey, kid.
               [the Prospect pauses]
    LOU        Nice job.
               [beat]
    LOU        Now don't fuck around, and don't ask anything you don't wanna know.

Objective: **Take the Squatchanium to Booski.**

## Beat 3 — the hidden entrance

The existing basement becomes the innocent half: a **wine cellar and
entertainment area** at the front, so it reads as a normal luxury basement. At
the far end, a decorative wall of vintage bottles, old Squatch family
photographs, hunting trophies and a **marble Sasquatch bust** — with a hidden
switch beneath the bust.

The wall slides **backward then sideways**, revealing a concrete stairwell.
Upstairs music goes muffled. Polish gives way to concrete, exposed pipes,
industrial lighting, drainage channels, security cameras, buzzing fluorescents,
and old blood that was never fully removed.

**The corridor's west end wall (x = −15.6, z 64.3…67.4) was deliberately left
blank by the expansion pass for exactly this, and `verify:mansion` asserts it
stays blank — that is the seam.**

## Beat 4 — the interrogation area and xXx

Halfway down: a steel table of torture equipment (pliers, electrical leads,
medical saws, syringes, a car battery, towels, a bucket, and several tools whose
purpose is better left unexplained).

Beside it, **xXx hangs upside down by his ankles** over a large pool of blood —
badly beaten, barely conscious. Owner's direction, 2026-08-04: *"This is not
going to be commercial. Keep XXX bald and looking like vin diesel maybe wearing
jeans and a black tank top."* So: **bald, Vin Diesel likeness, jeans and a black
tank top**, both torn and bloodied. Aiming at him makes the crosshair read
**xXx**.

    xXx   You can take the car… you can take the mission…
          [coughs]
          But you don't turn your back on family.

He **survives this mission** — a recurring gag, still hanging there on later
visits. Booski shouts from deeper in: *"Quit talking to the decorations and bring
me the case!"* On the way out he manages *"Family meeting go well?"*

Voice id to come from the owner.

## Beat 5 — the lab, and the layout that matters

**This is the critical requirement: the lab is behind a massive wall of
reinforced glass with a glass door, and Booski and the Prospect stay outside it
the whole time.**

**Observation area** (player side): consoles, security monitors, intercom, gas
controls, emergency shutdown, a large mechanical door lock, a **numeric keypad**
beside the door, purple status lights, thick cable bundles running into the lab.

**Sealed lab** (behind glass): six Russian scientists with **Aubbie as lead**,
steel workstations, robotic arms, chemical tanks, radiation symbols, purple
coolant tubes, gold arcs, the central weapon assembly, ceiling vents, and
**emergency masks locked in an inaccessible cabinet**.

The core: a thick metallic sphere, gold internal energy, purple stabiliser
rings, rotating parts, heavy cables, a small **Fat Squatch emblem** stamped on
the casing.

**Also down here, with lines: Irish, and DeathMegatron — who is completely
heartless and cold in this scene.**

## Beat 6 — delivery

    BOOSKI   There he is. Our little delivery boy.
             [the Prospect puts the case on the transfer table; Booski opens it]
    BOOSKI   Ah, yes. The Squatchanium.
             [lifts the container out]
    BOOSKI   Do you have any idea how hard this stuff is to get?
             [the Prospect starts to answer]
    BOOSKI   Rhetorical question. I don't care.

Booski puts it in a secure transfer drawer built into the wall; the drawer slides
through into the lab and the scientists gather around it.

## The scientists — six distinct people, not six copies

**Aubbie (lead)** — brilliant, exhausted, arrogant, increasingly suspicious of
Booski, proud of the weapon, believes his knowledge makes him untouchable.
Accented English.

> "Careful with the containment cylinder." · "If the stabilizer falls below forty
> percent, we all become shadows on the wall." · "Connect the Squatchanium
> core." · "Increase the purple coolant flow." · "No, no, no. Gold coupling
> first, purple coupling second."

**Two, nervous technician** — "Radiation levels are climbing." · "This was not in
the original agreement." · "Doctor Aubbie, the shielding is not ready."

**Three, weapons engineer** — "Core rotation stable." · "Power output is beyond
prediction." · "Silent Squatch will be operational."

**Four, cynical older scientist** — "They will kill us when this is finished."
Aubbie: "They need us." He looks through the glass at Booski: "Men like him need
no one." *He is the one who notices the locked door first, and the one who stops
pounding and simply stares, having expected it.*

**Five, junior assistant** — "Purple coolant pressure holding." · "Transfer
chamber secure." · "Beginning final sequence."

**Six, medical specialist** — "The Squatchanium is reacting with the biological
stabilizer." · "Core temperature is increasing." · "We should evacuate."

## Beat 7 — completion

Lights flicker, gold surges, purple rings rotate, sound builds from a low hum to
a deep mechanical roar. Aubbie raises a hand: *"Initiating final stabilization."*
The core locks. Every monitor turns from red to **purple**. A computer voice:
**"PROJECT SILENT SQUATCH: CORE COMPLETE."** The scientists cheer and embrace.

Aubbie comes through the glass door into the observation area.

    AUBBIE   It is complete.
    BOOSKI   You're certain?
    AUBBIE   The core is stable. The Fat Squatch can now be assembled.
    BOOSKI   And nobody else knows how to reproduce it?
             [Aubbie hesitates]
    AUBBIE   Only my team understands the full process.
             [Booski smiles]
    BOOSKI   Good.

## Beat 8 — locking, and the execution

    BOOSKI   Lock the lab.

Objective: **Lock the laboratory door.** Keypad code **6969**. The glass door
slides shut, steel bolts engage, the indicator goes green → red. **Scientist
audio becomes muffled from this moment.**

The scientists keep celebrating, then the older one tries the handle.

    OLDER (muffled)    Why is door locked?
    JUNIOR (muffled)   Open door.
    AUBBIE             What is this?
                       [Booski does not respond]
    BOOSKI   He’s finished. He’s not a scientist any more, he’s a witness with a doctorate.
    BOOSKI   Handle it.

Objective: **Eliminate Aubbie.**

    AUBBIE   Booski, we had agreement.
    BOOSKI   We did.
    AUBBIE   You need me to maintain the core.
    BOOSKI   We made copies of your notes.
    AUBBIE   You do not understand what you have built!
    BOOSKI   I said do it. And now I’ve said it twice, which means from here on it isn’t an order any more, it’s a test. You understand the difference? Because the difference is your whole life.

The player kills him **in the observation area, where his body falls in full
view of the scientists through the glass.**

## Beat 9 — the reaction

Muffled and overlapping: *"What are you doing?!"* · *"Open the door!"* · *"Why did
you kill him?!"* · *"We did everything you asked!"* · *"Please!"* · *"There is no
ventilation!"* · *"We have families!"* · *"You cannot leave us in here!"* · *"We
can work for you!"* · *"We will tell nobody!"*

One takes a metal chair to the glass. **The chair bends. The glass does not
break.**

## Beat 10 — Silent Night

A large switch under a red safety cover labelled **SILENT NIGHT PROTOCOL**.
Booski lifts the cover and does not pull it.

    BOOSKI   You started the job.
             [steps aside]
    BOOSKI   Finish it.

Objective: **Activate Silent Night.** The player pulls it. Alarm inside the lab,
purple lights rotating, computer voice: **"SILENT NIGHT PROTOCOL ACTIVATED."**

Gas from the ceiling vents — thin and white first, thickening to purple-grey.
The scientists go through stages, in order: **confusion → panic → covering their
mouths → coughing and choking → slamming the glass → crawling for the door →
collapsing one by one.** The last one to reach the glass leaves a **smeared
handprint** before collapsing.

Everything stays muffled: coughing, choking, fists on glass, pleading, equipment
crashing, alarm tones, and the steady hum of the core underneath all of it.

Booski watches without emotion, checks the monitor — **LIFE SIGNS: 0**.

    BOOSKI   Efficient.
             [pause]
    BOOSKI   Lou's gonna like you.

## Beat 11 — Snow, and the exit

    BOOSKI   Snow. Basement.
    SNOW     How bad?
             [Booski looks through the glass]
    BOOSKI   Bring the cart.
    SNOW     Jesus Christ.
    BOOSKI   And a mop.

Snow passes the player on the stairs in gloves, pushing an industrial cleanup
cart: *"I told you not to make more work for me."*

Past xXx again, up, and the hidden wall closes — **lab sound cuts to nothing.**

**MISSION COMPLETE: SILENT SQUATCH**

Rewards: mansion basement access unlocked · Family respect up · Aubbie's lab
notes on the apartment computer · Silent Squatch added to the campaign
conspiracy board · a new apartment trophy, a miniature glowing Squatchanium
container.

## Two technical requirements called out by the owner

**Reinforced glass audio.** When the door closes: scientist volume drops, high
frequencies roll off, dialogue gains slight reverb, **impacts on the glass stay
sharp and heavy**, and gas/choking becomes distant and enclosed.

**Glass visibility.** The player must always clearly see the scientists
reacting, Aubbie's body outside the glass, the gas filling the room, handprints
appearing, and **the core still glowing after everyone is dead.**

## Not a cutscene

> Avoid turning the entire sequence into a cutscene.

The player personally carries the case, places it on the desk, watches it open,
finds the hidden entrance, walks past xXx, delivers the package, enters the
code, locks the lab, kills Aubbie, pulls the Silent Night switch, walks through
the aftermath, and returns upstairs.

> The actions make the Prospect responsible for what happened. He is no longer
> merely witnessing the Squatch family's crimes. He is becoming part of the
> machinery.
