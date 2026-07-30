# NPC System — preserved Initiation reference

**Status: implemented in `src/initiation/npc.js`, but not campaign-canonical
yet.** This doc is the map; the code is the territory. The system is
framework-agnostic (no THREE), fully testable in node, and preserved for the
party scene after the character and story alignment pass.

The current Initiation runtime remains frozen for user playtesting. In the
approved later rewrite, these named members use their authoritative human face
presentations through the verdict, then visibly transform into literal
sasquatches after Tony qualifies and is admitted. This dialogue system keeps
stable character IDs across that presentation change.

Run the transcript to see it talk:
`node tools/npc-demo.mjs` (the review harness prints every scenario).

---

## The one idea

Every line is filtered by **archetype × standing tier × state × route**, anything
already said is dropped, one is picked. Small engine, large-feeling result: the
party gets funnier the longer you stay because every human member slides down their
own drunk curve into a different bank.

## The pieces

- **Roster** — the whole crew, each with an `archetype`, a `face` (photo path,
  or `null` where we haven't cut one yet: Ape and Irish), and a party `seat`.
- **Archetypes** — `PATRIARCH` (Booskibro), `LIEUTENANT` (Big Uncle Lou), `QUIET`
  (Rippinflow), `ROASTER` (Ape), `CRIER` (Shubes), `MUSCLE` (Deathmegatron),
  `MATRIARCH` (Hog Mama), `GRIEVANCE` (Irish), `UTILITY` (Erican/Gratin/Captain Lou Sasole/
  Snow). Snow also carries the executioner specials.
- **Standing** (−100..100) → tier `stranger / prospect / brother / beloved`,
  **seeded from your initiation run** and nudged up as you work the room.
- **State** — each NPC's own intoxication (same 0..1 model as the apartment)
  bucketed to `sober / merry / drunk / wrecked`, plus `stoned` / `tripping`
  flags. A line matches if it shares any active state (or is untagged).
- **Route** — `normal` or `rat`. On the rat route, talking to people raises
  **suspicion** on the watchful ones (Rippinflow fastest, then Deathmegatron);
  once an NPC passes 60 their warm lines flip to *probing* ones — same surface
  warmth, a hook underneath. This is the horror-for-free layer.
- **Ambient barks** — the crew talk to *each other* on a loop so the party is
  alive whether or not you engage. Rat-only exchanges gate behind the route.
- **No chorusing** — a short global recent-line memory stops two utility members
  parroting the same welcome back-to-back.

## API (what the party scene calls)

```js
import { NpcSystem } from './npc.js';

const npc = new NpcSystem({ route: 'normal' /* or 'rat' */ });

// On entering the party, seed everyone from how the ceremony went:
npc.seedStanding({ enduredFull:true, roarLoud:true, quizPassed:true,
                   brokeLogFirstTry:true, quizHesitated:false,
                   arrivedDrunk:false, partyHasBong:true });

// The scene owns drink/high state and pushes it in:
npc.setDrunk('booski', 0.6);
npc.setHigh('shubes', { stoned:true });

// Player looked at an NPC and held [E]:
const line = npc.greet('booski');   // → { name:'BOOSKIBRO', text:'…' } | null

// Every frame, keep the room murmuring:
const bark = npc.tickAmbient(dt);   // → [{who,name,text}, …] every ~7s | null

// Rat route HUD / camera cue:
const heat = npc.suspicionLeader(); // → the NPC most onto you, or null
```

Everything is null-safe: unknown ids return `null`, an emptied filter widens
until it finds a line, so an NPC is never mute.

## Authoring content

Lines live in `BANKS[archetype]` as objects:

```js
{ text:'…', tier:['brother','beloved'], state:['drunk','wrecked'],
  route:'rat', flag:'roarLoud' }
```

- `tier` / `state` — arrays; omit for "any". `state` matches on ANY overlap.
- `route:'rat'` — only offered to a suspicious NPC; omit for a normal party line.
- `flag` — a run flag from `seedStanding` that must be truthy (`enduredFull`,
  `roarLoud`, `quizPassed`, `brokeLogFirstTry`, `partyHasBong`, …).

Ambient exchanges live in `AMBIENT` as `[[id,text],[id,text],…]`, with a
trailing `null, { rat:true }` to gate one behind the route.

**Voice rule:** deadpan, warm, nobody thinks tonight was unusual. The insult is
the welcome (Ape); the tears are denied and blamed on smoke (Shubes); the
kindest line in the game is Rippinflow being nice to a man he's about to shoot.

## Seeding cheat-sheet (how a run moves standing)

| Run flag | Effect |
|---|---|
| `enduredFull` | +18 everyone (took the whole Gauntlet, hands down) |
| `roarLoud` | +22 to Muscle/Roaster, +10 everyone else |
| `quizHesitated` | −12 to Booskibro/Big Uncle Lou, −4 others (the sharp ones noticed) |
| `brokeLogFirstTry` | +8 everyone |
| `arrivedDrunk` | +6 Ape only (he respects it) |

Baseline is 30 (you're in — a brother by default). Talking to someone adds +1.

## Wiring notes for the party build

1. Place each roster member at their `seat` (truck / keg / fire / bong /
   treeline) around the reused apartment fire.
2. Register each with the interaction system (same look-at + hold [E] as the
   fridge/drawer); on use, call `npc.greet(id)` and float the returned text
   over their head (reuse the initiation nameplate sprite for the tag, the
   dialog box for the line).
3. Drive `setDrunk` from the party's shared drink model as the keg/bottle/joint
   circulate; the banks handle the rest.
4. On the rat route, put `suspicionLeader()` on a subtle HUD needle and use it
   to time the kill-window camera.
