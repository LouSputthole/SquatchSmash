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
| `billy_hotdog` | Billy HotDog | Billy HotDog | `hotdog` | Human | Established Family irritant and victim of the closed-party incident |
| `aubbie` | Aubbie | Aubbie | `aubbie` | Human | Quiet Family utility man for locks, wiring, repairs, and service access |

The two Lous are separate people. Big Uncle Lou owns the Bing story thread;
Captain Lou Sasole owns the airstrip thread and is the same person represented
by the authoritative `assets/faces/sasole.png` photo at Initiation. Their save
IDs, voice profiles, calls, dialogue state, and mission flags must never merge.

Tony is human throughout the pre-Initiation campaign. “Prospect” is his
biker-gang-style status while seeking entry to the Sasquatch family. In the
planned ending rewrite, successful Initiation changes both membership and
literal form: Tony transforms into a sasquatch after the verdict. His surname
is **Squatchtana**. `Squatchmontana` is rejected and is not accepted as a
registry alias.

Aubbie is deliberately introduced as somebody who was already around. The
Bing's visit-one service panel bears his name before he appears at HotDog's
party, the apartment/phone writing may mention him as the person who fixes the
building buzzer, and later scenes can use him for practical work without
retconning him into a founder or splitting another character's identity.
Eric, Erican, and the proposed spelling Ericran remain one person (`eric`).

## Circle canon

Every Circle member presents as human before the final ceremony. The supplied
face photos are authoritative for their named human presentations. The planned
ending transforms every recognized Sasquatch-family member into a literal
sasquatch after Tony is admitted.

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

Prospect One's failed quiz, execution, and explicit gore remain canonical. The
future ending rewrite will also judge the other rival prospects and kill each
one for their failures. Tony's completed campaign activities and missions will
be recalled during his review; only an eligible Tony is admitted. The current
playable Initiation must remain unchanged until the user has tested it, so
these ending decisions are documented but not yet production behavior.

## Mission and supporting cast

| ID | Display name | Current source | Status |
|---|---|---|---|
| `snow` | Snow (was Manny) | `src/motel/actors.js` | OWNER RULING 2026-07-31: the Motel ally is Snow, a Family member (face snow.png, voice `snow`). The never-hostile player-targeting boundary transfers to him unchanged |
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

The Motel ally (Snow, formerly Manny) belongs to the friendly faction. His ally combat
may target actual Motel hostiles, but scripted movement, waypoint completion,
generic chase/grab logic, player melee, and player ranged targeting must all
exclude him. This rule is structural rather than a single-scene timing fix.

All adult nightclub performers at the Bing use the scene's female performer
profile and non-nude bikini outfit. That presentation is specific to those
performer roles; it must not leak into generic patrons or other recurring
characters.

## Presentation rules

- Core identity is data; model/rig choice is presentation.
- Tony and every Circle member use human presentation before the Initiation
  verdict.
- Named Circle members use their supplied face photos.
- Booskibro is the subtitle and display name; `booski` remains the stable save
  ID and existing voice-bank key.
- Do not alter the current Initiation runtime before its user playtest. In the
  later rewrite, preserve firelight, bloom, ceremony, executions, and supplied
  faces before performing a literal on-screen mass sasquatch transformation
  after Tony's admission.
- Squatch Smash may keep literal sasquatches because it is an in-world computer
  game, not evidence that Tony or the Circle are another species.

The current procedural figures remain the safest working renderers. Future GLB
models can replace them only through this identity layer so character names,
voices, dialogue, mission flags, and saves survive the art change.
