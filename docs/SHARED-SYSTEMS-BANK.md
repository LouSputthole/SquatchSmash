# Shared systems data bank

Every reusable Module found under `src/core/` and `src/world/` that more than
one scene imports, with what it does, its public surface, and who currently
consumes it. This is the reference for `SHARED-SYSTEMS-AUDIT.md`, which checks
each scene against this list.

This does not replace `docs/REUSE-FIRST.md` (the short version, with the four
bugs that paid for it) or `docs/REUSABLE-GAMEPLAY-SYSTEMS.md` (the deep
Interface/Adapter contract for combat, blood, TV, smoke, bong, dress-help,
inventory and pause/recovery). Read those for the full Interface of anything
marked "see REUSE-FIRST" or "see REUSABLE-GAMEPLAY-SYSTEMS" below. This doc
adds the systems that weren't yet catalogued anywhere: mouth/lip-sync, actor
staging, the HUD shell, radio, wardrobe's appearance ledger, and the smaller
apartment-born systems (timing bar, intoxication, phone/chat, cold open,
day/night, narrator, start-gate) that have since spread to other scenes.

Consumer lists below come from a static import sweep (`grep` for each
module's import path across `src/**/*.js`) done 2026-08-21. A scene not
listed either doesn't need the system, reimplements it locally (a gap — see
the audit doc), or reaches it indirectly through a shared cast/rig class
(e.g. `Npc.say()` calling `Mouth` internally) rather than importing it
itself. The audit doc calls out which is which per scene.

---

## A. Presentation & UI shell

### Pause menu — `src/core/pause-menu.js`
Tab/resume UI, recovery buttons, and the settings block. See
REUSABLE-GAMEPLAY-SYSTEMS.md "Pause menu and scene recovery" for the full
Interface. **Consumers:** every campaign scene (21 import sites across all 17
scene directories plus the apartment hub) — this is the one system that is
already universal.

### Settings — `src/core/settings.js`
Subtitles, big subtitles, reduce-shake, assist, volume, sensitivity, keymap.
Rendered by `pause-menu.js`, so a scene gets it for free by mounting the pause
menu even without importing `settings.js` directly (Special Meeting is the
one scene that does exactly this — no direct import, full settings block via
the pause menu it mounts). See REUSABLE-GAMEPLAY-SYSTEMS.md for storage keys
and the `translateKey`/keymap contract. **Direct consumers:** 26 files across
every scene except Special Meeting (indirect via pause-menu).

### Scene recovery / campaign skip — `src/core/scene-recovery.js`, `src/core/campaign-scene-skip.js`
Durable checkpoint/restart/skip ledger. `RECOVERABLE_CAMPAIGN_SCENES` in
`campaign-scene-skip.js` is the authoritative list of scenes this applies to
(16 scenes — every campaign scene except the Apartment hub, which uses its
own `apartment-recovery.js` Adapter instead, and Special Meeting, which is
in the list but deliberately gets the SKIP-only adapter, not RESTART, per the
comment at `campaign-scene-skip.js:44-54`). **Consumers:** 20 files, one per
scene plus the two owning modules.

### HUD shell — `src/core/hud.js`
The `Hud` class: prompts, subtitles, hold bars, objective chrome markup.
**Consumers:** Apartment, Bing (both acts), Cartel Palace, Special Meeting,
Graveyard, Golf, Enola Squatch, NO WAKE, Silver Room, Beef Run (11 files).
**Deliberate non-consumers:** Mansion (`src/mansion/main.js` says outright:
"deliberately NOT `core/hud.js`'s `Hud`"), Silver Case (`src/silvercase/main.js`:
"exactly showPrompt/hidePrompt/setHold, nothing from core/hud.js"), Heist
(has its own `src/heist/hud.js`). Motel, Squatchfather, Initiation, Combat
Lab don't import it either — unclear yet whether that's a documented
exception like Mansion/Silver Case or a gap; the audit doc flags it for a
follow-up look rather than asserting either way.

### Objective panel — `src/core/objective-panel.js`
The one on-screen `#objectives` panel, replacing three scene-local
stylesheets per `REUSE-FIRST.md`. `activeObjectiveItems()` is the canonical
live-HUD projection: it removes completed rows and orphan headings while the
story controller retains its full state. `clear()` is lifecycle-safe even for
an adopted panel and a later `show()` of the same objective. **Direct and
indirect consumers include:** Mansion, Heist, Graveyard, Golf, Cartel Palace,
Silver, Silver Case, Special Meeting, Initiation, Squatchfather, Bing, Cabin
and Luxury Apartment. **Deliberate non-consumer:** Apartment's hub story still
uses `core/goals.js`; its `Hud` nevertheless uses the same active projection
for any mission-style rows presented there.

### Reflected first-person body — `src/core/first-person-body.js`
One reflection-layer player figure with durable outfit identity and stable
standing, seated, bed and scripted pose synchronization. It owns walk gait,
reflected weapon attachment/visibility, safe persistence, figure replacement
and disposal. Scenes provide a visual factory/palette Adapter; they do not
create a second mirror-body lifecycle. **Consumers:** Apartment, Luxury
Apartment and Cabin. Squatchfather retains its older authored layer-1 Prospect
body pending a future migration.

---

## B. Cast, voice & dialogue

### Dialogue playback, mixing, timing — `src/core/dialogue.js` (over `src/core/audio.js`)
The one place a scene calls `speak()`; owns `SPEECH_GAIN` (the shared voice
trim) and `SPEECH_MIX`/`SPEECH_MIX_INDOORS` (positional dialogue). See
`REUSE-FIRST.md` for the "every scene picked its own gain" bug this fixed.
**Consumers:** Special Meeting, Silver Case, Mansion Siege, Initiation, Heist,
Cartel Palace (7 files). Most other scenes speak through a scene-local
`dialogue.js`/`cast.js` wrapper that itself calls the shared `speak()` — see
the audit doc before reading a missing import here as a gap.

### Mouth / lip-sync — `src/core/mouth.js`
`Mouth` drives jaw motion off the actual playing take's analyser, not a
timer or authored duration — "the shared implementation for the whole game,"
per comments repeated in nearly every scene. **Consumers:** 31 files —
Silver Case, Silver Room, NO WAKE, Motel, Mansion (+Siege, Silent Squatch,
mission controllers), Heist, Graveyard, Golf, Enola Squatch, Bing (both
acts), Beef Run, Squatchfather, Apartment, plus `core/audio.js` and
`world/dressing.js`. This is the most widely adopted shared system in the
game after the pause menu. **Not found importing it directly:** Special
Meeting, NO WAKE... (NO WAKE is in the list — correction: Special Meeting,
Cartel Palace, Combat Lab, Initiation. Worth a look in the audit.

### Actor staging / posture — `src/core/staging.js`
`markActor`, `readActor`, `setActorPosture`, `coarseActorRole`,
`setActorSeat` — the eye/hip height, standing/sitting/riding posture, and
role labels that `verify:staging` and `verify:framing` both read to check
whether a body is where the geometry and camera think it is. **Consumers:**
Special Meeting, Silver Case, NO WAKE, Motel, Mansion, Heist, Bing (8 files).
Coverage is partial by design so far — `verify:staging` only ships
allowlists for Bing, Mansion and Silver Case today (see
`docs/STAGING-GATE.md`); Golf, Silver Room, Cartel Palace, Enola Squatch,
Graveyard, Beef Run, Squatchfather, Initiation don't mark actors with this
system yet.

### Wardrobe / outfits — `src/core/wardrobe.js`, `src/core/appearances.js`
`fromWardrobe()` builds an outfit onto a rig from the shared garment catalog;
`appearances.js` is the cross-scene ledger of who is wearing what, read by
the fitting room (`wardrobe.html`) so a preview and the real game can't
silently disagree. See `docs/DRESSING-THE-CAST.md` for outfit canon.
**Consumers:** Special Meeting, NO WAKE, Mansion (script/cast/siege
ensemble/attackers/Silent Squatch), Initiation, Graveyard, Heist, Enola
Squatch, Cartel Palace, Bing (six files), Beef Run, Golf (12 files, plus the
fitting room itself).

### Characters (roster identity) — `src/core/characters.js`
Canonical cast identity/voice records, separate from wardrobe (what they
wear). **Consumers:** Silver Room, Mansion, Heist, Golf, Enola Squatch, Bing,
Silver Case, Roster (the voice-casting tool).

---

## C. Player & world interaction

### Player controller — `src/core/player.js`
See `REUSE-FIRST.md`. **Consumers:** every scene except Motel, Squatchfather
and Initiation, which "do not yet read the keymap" and run bespoke movement
(REUSABLE-GAMEPLAY-SYSTEMS.md, Pause menu section) — a named, intentional
exception, not an oversight.

### Interaction prompts — `src/core/interaction.js`
Center-screen ray, prompt/hold state, `register`/`unregister` on an owner
object's `userData.interact`. **Consumers:** every scene except Motel,
Squatchfather, Initiation and Combat Lab.

### Inventory — `src/core/inventory.js`, wrapped for scenes by `src/core/scene-inventory.js`
`Inventory` is the raw slot-array authority (see REUSABLE-GAMEPLAY-SYSTEMS.md
"Inventory"). `scene-inventory.js` is the scene-facing package/pickup
Adapter over it. **Raw `Inventory` consumers:** Apartment, Silver Room, Golf,
Bing, Mansion (final-arc loadout). **`scene-inventory` consumers:**
Squatchfather, Silver Case, NO WAKE, Motel, Mansion(+Siege), Initiation,
Heist, Graveyard, Golf, Cartel Palace, Bing, Beef Run — i.e. every mission
scene with pickable items goes through the wrapper; Apartment, Silver Room
and Golf additionally touch the raw `Inventory` for their held-item/hotbar
presentation.

---

## D. Combat

Full Interface, Adapter table and migration order are in
REUSABLE-GAMEPLAY-SYSTEMS.md ("Ground-combat architecture" and the migration
matrix at the bottom) — read that before touching any of this. Short version:

### Weapon handling — `src/core/weapons/` (`WeaponSystem`, `Firearm`)
**Full canonical consumers:** Mansion Siege, Heist (behind the `HeistFirearm`
compatibility Adapter), Cartel Palace, Combat Lab. **Partial/local:** NO
WAKE, Motel, Mansion (main, pre-Siege), Enola Squatch (its own flight-weapon
rules, explicitly out of scope for this architecture), Squatchfather
(`ToiletWeaponInteraction` — a gag prop, not ground combat).

### Ground-combat truth — `src/core/combat/`
**Production Adapters:** Mansion Siege and Cartel Palace only — the two
scenes REUSABLE-GAMEPLAY-SYSTEMS.md names as proven both directions. Heist
runs a compatibility Adapter. Everyone else with a gun (Motel, Silver Case,
regular Mansion/Silent Squatch, Squatchfather) is on the documented migration
matrix, not yet moved — see the audit doc.

### Blood & decals — `src/world/blood.js`, `src/world/bullets.js`, `src/core/combat/aim-proxy.js`
**Consumers:** Mansion (Siege + Silent Squatch), Heist, Cartel Palace, Bing
(the hotdog-attack beat). **Still on the older local implementation:** Silver
Case (`ShotResolver`/`ImpactKit`), Squatchfather (`BulletHoles` at a guessed
eye point rather than the real ray intersection).

---

## E. World props & set-dressing interactions

### TV — `src/core/tv.js`
Channels, spatial attenuation (`TV_AUDIO_SPATIAL_PROFILE`). **Consumers:**
Apartment, Bing (`club.js`), Mansion (multiple rooms + Siege + Silent
Squatch), Golf, Enola Squatch's mission controller reads the same curve for
a briefing screen. Silver Room's grep hit is worth a second look — confirm
it's a real TV set and not a naming collision before counting it.

### Radio — `src/core/radio.js`
The apartment's AM receiver, reused as sourced diegetic music/chatter.
`hudVisible()` is the shared ownership seam for a physical receiver: the OSD
appears only while the player is in that receiver's presentation range and is
cleared immediately on leaving, pause, or power-off. Positional receivers use
`radioHudWithinRange()` so that boundary agrees with the shared panner's useful
range; vehicle receivers may instead supply their actual seated/camera mode.
**Consumers:** Apartment, Luxury Apartment, NO WAKE, Mansion (multiple
cabinets), Golf, Bing, Beef Run and Cabin.

### Smoke / cigarette exhale — `src/world/smoke.js`
See REUSE-FIRST.md and REUSABLE-GAMEPLAY-SYSTEMS.md. **Consumers:**
Apartment, Golf (`main.js`, `runtime-geometry.js`, `terrain.js`, `hands.js`),
Enola Squatch (engine smoke + combat vfx + mission controller), Mansion, Bing.

### Bong — `src/world/bong.js`
**Consumers:** Apartment, Mansion (LAN room), Bing.

### Held drinks / props — `src/world/props.js`
`makeBeerCan`, `makeHeldDrinks`, `poseHeldDrink`. **Migrated consumers:**
Apartment, Golf (`hands.js`). **Still local (gap):** Bing and Silver Room
carry their own `poseDrink` copy — named directly in
REUSABLE-GAMEPLAY-SYSTEMS.md as the next migration.

### Dress-help — `src/world/dress-help.js`
Seven-pull QTE sequence. **Consumers:** Apartment (Margo), Mansion (second
pool performer). By design, nowhere else — this is Margo's authored beat
with one borrowed Adapter, not a general system every scene should adopt.

### Timing bar (generic QTE) — `src/core/timingbar.js`
The shared press-timing minigame that both `dress-help.js` and other beats
build on. **Consumers:** Apartment, Bing, Mansion (`cast.js`).

### Intoxication — `src/core/drunk.js`
`Drunk`, `BEER_UNITS`, `WHISKEY_UNITS` — sway/impairment from the shared
held-drinks system. **Consumers:** Apartment, Silver Room, Bing.

---

## F. Progression, narrative meta & apartment-born systems

These originated in the apartment hub (`src/main.js`) and have started
spreading; list them here so the next scene that needs one finds it instead
of reinventing it.

| System | Module | Consumers |
| --- | --- | --- |
| Campaign scene graph / transitions | `src/core/campaign.js` | Every campaign scene (42 import sites) |
| Cold open | `src/core/cold-open.js` | Apartment only so far |
| Day/night | `src/core/daynight.js` | Apartment; Special Meeting reads its authored night values per a code comment in `specialmeeting/night.js` |
| Narrator | `src/core/narrator.js` | Apartment only — "the flat's own voice," may be intentionally apartment-exclusive |
| Goals / endings | `src/core/goals.js` | Apartment only (hub-specific objective/ending tracker, parallel to `objective-panel` for missions) |
| Phone / chat | `src/core/phone.js`, `src/core/phone-content.js`, `src/core/chat.js` | Apartment, Bing; Special Meeting and Apartment-story code reference the same timing rules |
| Start gate (debounced first click) | `src/core/start-gate.js` | Graveyard confirmed; likely worth checking wherever a scene has a single "start"/"begin" button, since `docs/TODO-2026-08-21-WRAPUP.md`-style bugs (a refusing start button that swallows all further clicks) are exactly what this guards against |

---

## How to use this with the audit

`docs/SHARED-SYSTEMS-AUDIT.md` walks the campaign in play order and checks
each scene against the systems above, citing which are confirmed present,
which are a documented, intentional exception, and which are an open gap.
Before adding a new system to a scene, `grep` this doc's module paths first —
that is the whole point of `REUSE-FIRST.md`.
