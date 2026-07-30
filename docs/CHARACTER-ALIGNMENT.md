# Character Alignment Checkpoint

This is the evidence-backed character sheet for the consolidation branch. It
separates identities already safe to use in save data from details that still
need creative approval. No unresolved alias, model, species, or Initiation
premise has been promoted into campaign state.

## Stable campaign identities

| Stable ID | Current subtitle | Current voice profile | What is established | What still needs approval |
|---|---|---|---|---|
| `prospect` | Prospect | `player` | The same playable lead crosses the apartment, Bing, Squatchfather, and Motel. | Whether Tony Squatchmontana is the canonical full name; species and appearance from Day One. |
| `lou` | Lou | `lou1` | Lou gives the first package at the Bing and calls again after the airstrip. | Confirm that Bing Lou and Initiation’s Lou Sputthole are one person. |
| `captain_lou_sasole` | Captain Lou Sasole | `lou2` | Booski sends the player to this separate character at the airstrip. He never shares Lou’s mission or call state. | Confirm whether Initiation’s `sasole` face/party member is Captain Lou Sasole. |
| `booski` | Booski | `booski` | Day Two caller and Initiation leader/founder. | Final subtitle form: Booski, Booskibro, or a context-dependent pair. |

The live registry is `src/core/characters.js`. Species, clothing, model paths,
and the aliases `tony_squatchmontana` and `sasole` are deliberately absent
until approved.

## The central continuity conflict

Three scene sources disagree about Prospect:

- `motel.html` names him **Tony Squatchmontana**, says everybody calls him
  Prospect, and `src/motel/actors.js` builds the player and Manny as
  sasquatches.
- `src/squatchfather/dialogue/dialogue.json` calls him Prospect/Squatch and the
  restaurant uses its own visible procedural Prospect body.
- `src/initiation/main.js` starts him as a human and physically transforms him
  into a nine-foot silver sasquatch at the end. Its source story treats this as
  a prologue, while the intended campaign places it after the Motel.

Recommended canon: Prospect is already a literal sasquatch when Day One starts;
Tony Squatchmontana is his full name; everyone normally calls him Prospect.
Initiation changes his **membership/status** in the Silver Sasquatches rather
than his species. The existing transformation beat can become a ceremonial
reveal, bandana/coat presentation, or heightened subjective effect without
breaking the earlier scenes.

## Recurring and mission characters

| Proposed ID | Display name | Source and current portrayal | Recommendation |
|---|---|---|---|
| `manny` | Manny | `src/motel/actors.js`; Prospect’s sasquatch ally/driver, blue shirt and yellow cap. | Keep named and reusable; decide whether he appears at Initiation. |
| `sal_sorrento` | Sal “The Prospector” Sorrento | `src/squatchfather/dialogue/dialogue.json`; restaurant antagonist/negotiator. | Keep mission-local unless later story reuses him. |
| `captain_mcclawsky` | Capt. McClawsky | Same dialogue file; Sal’s armed associate. | Keep distinct from Captain Lou despite the shared title. |
| `rico` | Rico | `src/motel/actors.js`; primary human seller, tropical shirt, shades, mustache, chain. | Keep as named Motel antagonist. |
| `chino` | Chino | Same source; human seller/butcher with apron, gloves, and cleaver. | Keep as named Motel antagonist. |
| `motel_slicer` | Bathroom Seller | Same source; hidden seller with a meat slicer. | Approve a real name only if future dialogue needs one. |
| `motel_lookout` | Lookout | Same source; knife-carrying seller. | Functional ID is enough for now. |
| `motel_watcher` | Watcher | Same source; hook-carrying seller. | Functional ID is enough for now. |
| `motel_clerk` | Clerk | Same source; civilian Motel clerk. | Keep mission-local. |

The Bing contains one recurring named character, Lou. Its bouncer, bartender,
barback, dealer, guards, DJ, performers, contractor, regulars, staff, and Lou’s
associate have good scene-local role keys in `src/bing/cast.js`; they should
not receive global character IDs until one is intended to recur.

## Preserved Initiation Circle

| Legacy ID | Subtitle/name | Face asset | Current legacy role |
|---|---|---|---|
| `booski` | BOOSKI / BOOSKIBRO | `assets/faces/booski.png` | Patriarch, founder, ceremony leader |
| `lou` | LOU SPUTTHOLE | `assets/faces/lou.png` | Lieutenant, founder, stage speaker |
| `rippinflow` | RIPPINFLOW | `assets/faces/rippinflow.png` | Quiet founder |
| `shubes` | THE SHUBENATOR | `assets/faces/shubes.png` | Emotional founder |
| `deathmegatron` | DEATHMEGATRON | `assets/faces/deathmegatron.png` | Muscle, founder |
| `hogmama` | HOG MAMA | `assets/faces/hogmama.png` | Matriarch |
| `ape` | APE | Not present | Roaster |
| `irish` | IRISH | Not present | Procedure/grievance voice |
| `erican` | ERICAN | `assets/faces/erican.png` | Utility member |
| `gratin` | GRATIN | `assets/faces/gratin.png` | Utility member |
| `sasole` | SASOLE | `assets/faces/sasole.png` | Utility member; identity unresolved |
| `snow` | SNOW | `assets/faces/snow.png` | Utility member and executioner |

The scene also has four unnamed NPC prospects plus the player’s slot. The
current founders quiz locks the five answers as Booski, Lou Sputthole,
Rippinflow, The Shubenator, and DeathMegatron.

## Presentation strategy

There is no populated production character-model manifest. The strongest
working presentation is currently:

- procedural human rigs in the Bing and Initiation;
- photo face textures for the named Circle cast;
- procedural sasquatch rigs in Squatch Smash and the Motel;
- a separate procedural visible Prospect/Sal/McClawsky rig in Squatchfather.

Recommended near-term direction: keep the procedural rigs and approved photo
faces while establishing one character-definition layer above them. A later
GLB can replace a renderer without changing a character ID, voice, dialogue,
mission flag, or save. This keeps the current scenes playable and follows the
repo’s Three.js loader/material conventions without inventing replacement art.

## Decisions needed before canonical Initiation work

1. Is **Tony Squatchmontana** Prospect’s canonical full name?
2. Is Prospect already a literal sasquatch on Day One, with Initiation changing
   membership/status rather than species?
3. Is Bing Lou the same person as **Lou Sputthole**?
4. Is the Initiation member `sasole` Captain Lou Sasole?
5. Should subtitles say **Booski**, **Booskibro**, or use both by context?
6. Are the Circle members humans, sasquatches, or a mixed organization?
7. Are the supplied face photos authoritative for the named Circle cast?
8. Are the five founders in the current quiz locked?
9. Does the execution of Prospect One and the explicit gore remain in the
   canonical chapter-ending Initiation?

The default recommendation is “yes” to 1, 2, 3, 4, 7, 8, and 9; use Booski in
ordinary subtitles and Booskibro as an affectionate/on-air nickname; make the
organization mixed rather than forcing every member into one species.
