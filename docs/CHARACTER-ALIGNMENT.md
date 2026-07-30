# Character Bible — Approved Canon

This is the character authority for the consolidation branch. The campaign
registry in `src/core/characters.js` owns stable identity, name, species, role,
subtitle, voice, and compatibility aliases. Scenes may change a character's
procedural rig, clothing, animation, or eventual GLB without changing that
identity.

## Core campaign cast

| Stable ID | Canonical name | Subtitle | Voice | Species | Role |
|---|---|---|---|---|---|
| `prospect` | Tony Squatchtana | Prospect | `player` | Human | Prospect/pledge seeking entry to the Sasquatch family |
| `lou` | Big Uncle Lou Sputthole | Big Uncle Lou | `lou1` | Human | Founder, family uncle, first Bing contact |
| `captain_lou_sasole` | Captain Lou Sasole | Captain Lou Sasole | `lou2` | Human | Circle member and airstrip captain |
| `booski` | Booskibro | Booskibro | `booski` | Human | Founder, patriarch, Day Two caller, ceremony leader |

The two Lous are separate people. Big Uncle Lou owns the Bing story thread;
Captain Lou Sasole owns the airstrip thread and is the same person represented
by the authoritative `assets/faces/sasole.png` photo at Initiation. Their save
IDs, voice profiles, calls, dialogue state, and mission flags must never merge.

Tony is human on Day One and remains human. “Sasquatch” is the name and status
of the family/organization he is pledging, comparable to a biker-gang prospect;
Initiation changes membership, not species. His surname is **Squatchtana**.
`Squatchmontana` is rejected and is not accepted as a registry alias.

## Circle canon

Every Circle member is human. The supplied face photos are authoritative for
their named characters.

| Stable/local ID | Canonical display | Face asset | Role |
|---|---|---|---|
| `booski` | BOOSKIBRO | `assets/faces/booski.png` | Patriarch and founder |
| `lou` | BIG UNCLE LOU SPUTTHOLE | `assets/faces/lou.png` | Lieutenant and founder |
| `rippinflow` | RIPPINFLOW | `assets/faces/rippinflow.png` | Quiet founder |
| `shubes` | THE SHUBENATOR | `assets/faces/shubes.png` | Founder |
| `deathmegatron` | DEATHMEGATRON | `assets/faces/deathmegatron.png` | Founder and muscle |
| `hogmama` | HOG MAMA | `assets/faces/hogmama.png` | Matriarch |
| `ape` | APE | Face not supplied | Roaster |
| `irish` | IRISH | Face not supplied | Procedure/grievance voice |
| `erican` | ERICAN | `assets/faces/erican.png` | Member |
| `gratin` | GRATIN | `assets/faces/gratin.png` | Member |
| `captain_lou_sasole` | CAPTAIN LOU SASOLE | `assets/faces/sasole.png` | Member and airstrip captain |
| `snow` | SNOW | `assets/faces/snow.png` | Member and executioner |

The five founders are locked:

1. Booskibro
2. Big Uncle Lou Sputthole
3. Rippinflow
4. The Shubenator
5. DeathMegatron

Prospect One's failed quiz, execution, and explicit gore remain canonical.
The ending after Tony's successful induction still needs a dedicated design
pass; no scene should remove or soften the execution while that ending is being
decided.

## Mission and supporting cast

| ID | Display name | Current source | Status |
|---|---|---|---|
| `manny` | Manny | `src/motel/actors.js` | Tony's Motel ally/driver; species and future recurrence still need alignment |
| `sal_sorrento` | Sal “The Prospector” Sorrento | `src/squatchfather/dialogue/dialogue.json` | Squatchfather antagonist |
| `captain_mcclawsky` | Capt. McClawsky | Same file | Sal's associate; distinct from Captain Lou |
| `rico` | Rico | `src/motel/actors.js` | Primary Motel seller |
| `chino` | Chino | Same source | Motel seller/butcher |
| `motel_slicer` | Bathroom Seller | Same source | Mission-local |
| `motel_lookout` | Lookout | Same source | Mission-local |
| `motel_watcher` | Watcher | Same source | Mission-local |
| `motel_clerk` | Clerk | Same source | Mission-local civilian |

The Bing bouncer, bartender, barback, dealer, guards, DJ, performers, staff,
regulars, contractor, and Lou's associate retain their scene-local role IDs in
`src/bing/cast.js` until the story makes one recur.

## Presentation rules

- Core identity is data; model/rig choice is presentation.
- Tony and every Circle member use human presentation in story scenes.
- Named Circle members use their supplied face photos.
- Booskibro is the subtitle and display name; `booski` remains the stable save
  ID and existing voice-bank key.
- Initiation may use firelight, bloom, the silver bandana, ceremonial clothing,
  sound, and camera effects to make induction feel transformative, but it must
  not replace Tony with a sasquatch body.
- Squatch Smash may keep literal sasquatches because it is an in-world computer
  game, not evidence that Tony or the Circle are another species.

The current procedural figures remain the safest working renderers. Future GLB
models can replace them only through this identity layer so character names,
voices, dialogue, mission flags, and saves survive the art change.
