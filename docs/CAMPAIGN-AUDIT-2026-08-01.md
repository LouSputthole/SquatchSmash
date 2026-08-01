# SquatchSmash campaign audit — 2026-08-01

This is the working source of truth for the playable campaign, its remaining
gaps, and the next release decisions. It reflects the current `main` candidate
in this repository, not merely the older design documents.

## Executive assessment

The campaign now has one connected, fresh-save route from the first apartment
wake-up through the Day Four handoff into Initiation. Every production mission
before Initiation has an implemented return or forward edge. The current build
is therefore a credible end-to-end demo candidate, but it is **not a finished
campaign** yet:

- Initiation is reachable and remains `in_progress`; it has no campaign
  completion event or outbound route.
- The Heat-style Day Four heist is unbuilt and design-frozen pending an owner
  decision. The production route currently goes directly to Initiation.
- 70 authored voice cues (46 Beef Run, 18 NO WAKE, 3 Bada Bing, 3 Silver Room) and 14
  authored effects still need final recordings.
  Missing voice cues show subtitles and silence; the 14 effects retain audible
  procedural fallbacks.
- Automated contracts are broad, but a human full-route playthrough, device
  performance pass, and cache-busted GitHub Pages verification are still
  release gates.

No browser-format rewrite is justified now. The game already isolates its big
missions behind separate HTML entry points. The best next format is an
installable/offline PWA using the same game, followed only if wanted by a thin
Tauri desktop wrapper. A native-engine port would be a new project and would
not by itself fix scene construction or oversized audio residency.

## Evidence language

- **Source-confirmed:** present in the current campaign graph, scene code, or
  canonical documents.
- **Automated-confirmed:** exercised by the listed Node or browser verifier.
- **Human-unverified:** needs a real playthrough, visual judgment, headphones,
  controller/touch input, or production hosting.

## Repository and deployment control

`main` is the sole release line. At the start of this consolidation, fetched
local `main` and `origin/main` matched at `2324b456`, and the GitHub query
reported zero open pull requests. During release packaging, `origin/main`
advanced to `62dbfc8` with the NO WAKE recording sheet and the newer
`codex/beef-run-runway-start` branch appeared at `f167a41`; both were reconciled
into this candidate instead of overwritten. Release cleanup retires that
integrated branch and the proven-obsolete
`claude/sasquatch-friend-photos-h4hlfr` ref. Older local recovery lines retain
archive tags, so their branch refs can be retired without discarding checkpoints.

This working candidate is not deployment proof. The release is current only
after the exact verified commit is pushed to `main`, the GitHub Pages workflow
passes for that SHA, stale refs are pruned, and the cache-busted public URL is
opened successfully. Record that final SHA and live result in the handoff rather
than inferring them from a clean local test run.

## Canonical campaign map

```text
DAY 1
Apartment wake / chores / Lou call
  -> Bada Bing visit one
  -> Apartment: whiskey and package
  -> Squatchfather restaurant mission
  -> Apartment sleep

DAY 2
Apartment wake / Booski call
  -> Beef Run airstrip and return landing
  -> Apartment / Lou follow-up
  -> Bada Bing visit two
  -> Jerky Motel
  -> Apartment sleep

DAY 3
Apartment wake / Lou call
  -> NO WAKE: South Harbor / open-water informant hit
  -> Apartment / Margo call
  -> Front and Center (Silver Room)
  -> Apartment sleep

DAY 4
Apartment wake / Margo and Booski handoff
  -> Initiation [reachable, in progress, no outbound]

DESIGN-FROZEN ALTERNATE
Day Four Heat-style heist [unbuilt; not in the production route]
```

The campground Squatch Smash mode remains an optional standalone activity. It
is not a gate in this campaign spine.

## Scene matrix

| Beat / entry | Status | Entry condition | Completion / next edge | Main dependencies | Known gap or risk | Performance posture | Next action |
|---|---|---|---|---|---|---|---|
| Apartment — Day One (`index.html`, `wake`) | Implemented | Fresh save, campaign version 4 | Chores and Lou call unlock Bada Bing visit one | campaign state, phone, day/night, inventory | Full human first-session pacing still unverified | Scene-scoped audio keeps 880 of 1,471 recorded cues; measured Start fell from 5.623 s to 3.169 s | Full-route playtest from a cleared save |
| Bada Bing visit one (`bing.html`, `driver_seat`) | Implemented and browser-contracted | Day One assignment available | Package handoff returns to apartment | club mission, dialogue, audio, inventory | One Snow/Tony recording plus two newly authored Bing lines remain in the 70-line recording queue | Scene-scoped audio keeps exactly 348 cues / 15.16 MiB; measured Start fell from 29.431 s to 14.790 s | Record remaining cues; manually judge shot camera and audio |
| Squatchfather (`squatchfather.html`, `restaurant_exterior`) | Implemented and browser-contracted | Package/whiskey apartment beat complete | Mission complete returns to apartment and unlocks sleep | restaurant story, campaign route, audio | Human camera/pacing pass still required | Separate page; verifier covers story contract | Play once with real input and headphones |
| Apartment — Day Two | Implemented and browser-contracted | Day One sleep | Booski call launches Beef Run; later Lou launches Bing two | apartment story, closet interaction, phone | Bloody shirt readability and closet travel are automated only, not art-directed on all viewports | Reuses apartment scene | Verify shirt contrast and closet clearance on desktop/mobile |
| Beef Run (`beefrun.html`, `hangar`) | Implemented, landing path repaired, browser-contracted | Day Two Booski assignment | Return landing, braking, stop, and mission close return to apartment | flight model, checkpoints, terrain streamer, airport guidance, Capt. Sasole VO | 46 new Capt. Sasole lines need recordings; first-time player landing feel needs a human pass | Terrain priming is 9 immediate + 112 queued; scoped audio keeps all 224 required recordings and measured 0.560 s at Start instead of 1,471 recordings / 40.435 s | Record VO; fly the entire outbound/return route without debug assists |
| Bada Bing visit two (`bing.html?visit=2`, `driver_seat`) | Implemented and browser-contracted | Lou follow-up after Beef Run | Assignment hands directly to Jerky Motel | second-visit story, club runtime, campaign state | Most campaign-specific recognition variants described in the design timeline are not authored yet | Same scoped 348-cue runtime as visit one | Add recognition variants after the final-day premise is locked |
| Jerky Motel (`motel.html`, `passenger_seat`) | Implemented and browser-contracted | Bing visit-two assignment complete | Motel outcome returns to apartment | motel mission, campaign route, audio | Human stealth/readability and retry pass still required | Separate page | Play success and failure/retry paths |
| NO WAKE (`nowake.html`, `gate_c`) | Implemented, connected, browser-contracted | Day Three Lou call after Motel sleep | Informant hit completes and returns to apartment | NO WAKE story, South Harbor marina, cabin cruiser/open-water sequence, campaign route, audio | No known graph blocker; live pacing and audio mix unverified | Separate page | Human playthrough with real audio and no debug controls |
| Front and Center / Silver Room (`silver.html`, `kerb`) | Implemented and browser-contracted | Margo call after NO WAKE | Performance outcome returns to apartment and unlocks sleep | Silver story, table cutscene, band/violin animation, selective audio | 3 new lines need recordings; apartment closing beat with Margo is still lighter than the mission spectacle | Selective cue preload chooses 226 of 1,471 available recordings | Record lines; judge table carry/setup, walkway, camera, and violin in motion |
| Apartment — Day Four | Implemented handoff | Sleep after Silver | Margo/Booski handoff routes to Initiation | apartment story, campaign state | Final premise must remain consistent with the approved ending | Reuses apartment scene | Lock the final-campaign premise before adding more authored content |
| Initiation (`initiation.html`, `gathering`) | **`in_progress`** | Day Four handoff | No completion event and no outbound edge | frozen authored scene, shared HUD inventory, campaign graph | This is the current hard end of progression; finale location/oath direction still needs owner approval | Separate page; only shared HUD changed in this pass | Approve finale, implement completion/outro, add browser route contract |
| Heat-style heist | **Unbuilt / design-frozen** | None in production | None | owner-approved mission design | Do not treat as missing code until the owner chooses whether it belongs before Initiation | Unknown | Decide: cut, post-demo chapter, or approved Day Four mission |

### Optional, prototype, and tool surfaces

| Surface | Real status | Campaign relationship | Main gap / next action |
|---|---|---|---|
| Margo wake-up | Implemented and connected in the Day Four apartment | Mandatory interstitial before Booskibro's call | Qualitative camera/dialogue pass; do not confuse it with the unbuilt Silver-to-apartment closing cutscene |
| Bada Bing blackjack and slots | Implemented optional systems inside both club visits | Never advance or block the mission state machine | Preserve as optional texture; add second-visit reactions rather than new gates |
| Bada Bing Family floor / conversations | Implemented optional social layer | Establishes recurring members; walking away does not lock progress | Campaign-specific visit-two recognition and informant foreshadowing are incomplete |
| Front and Center woo/date scoring | Implemented, connected, and saved as a Silver outcome | Affects the mission resolution, not later campaign routing yet | Later scenes should acknowledge the saved outcome once the ending is approved |
| Apartment SquatchOS | Implemented: Mail, Squatch Smash, Squatch Shoot, Counter-Squatch, Yuka, and DOOM | Optional apartment activity; PC use and Squatch Smash are nonblocking Day One characterization | Runtime lifecycle is 29/29 automated; DOOM remains an external web dependency and needs an offline fallback decision |
| `game/` campground Squatch Smash | Implemented standalone game with goals, Ranger Captain, ranks, and career persistence | Runs on Tony's computer and can also launch directly; it is not the campaign itself | Keep its separate career save; continue its dedicated verifier |
| Silver Pines golf | Prototype only, absent from `main`; preserved at archive tag `archive/silver-pines-golf-20260730` | No campaign trigger, completion, or save dependency | Decide whether it is optional downtime, a later chapter, or retired before reconnecting it |
| Legacy `src/airstrip/mission.js` model | Duplicate / obsolete runtime model; imported only by its old unit tests | Superseded by `src/beefrun/*` and `src/core/airstrip-story.js` | Remove in a dedicated cleanup only after migrating or retiring its tests |
| `preview.html` and `roster.html` | Development/review utilities | Not player-facing campaign beats | Keep out of progression and label as tools in future navigation |
| Heat-inspired heist | Planned but missing and explicitly frozen | Intended between the Day Four apartment and Initiation in one design document; absent from production | Owner decision is required before implementation |

## Character and continuity assessment

`src/core/characters.js` is the identity authority: stable save id, canonical
name, subtitle, voice profile, species, role, and legacy aliases are separate
from each scene's procedural rig and clothing. The two Lous are correctly kept
as different people (`lou` / `lou1` and `captain_lou_sasole` / `lou2`).

| Character group | Source-confirmed continuity | Remaining risk or gap |
|---|---|---|
| Tony Squatchtana / Prospect | Human prospect throughout the connected campaign; one stable player voice and save identity | Literal Sasquatch transformation is planned ending material, not current behavior |
| Big Uncle Lou Sputthole | Owns the apartment/Bing/Squatchfather campaign thread | Never alias him to Captain Sasole; a future model swap must preserve `lou1` |
| Captain Lou Sasole | Owns Beef Run and reappears socially under the same stable identity | 46 new coached-flight lines are wired but unrecorded |
| Booskibro | Founder, Day Two/Day Four caller, club presence, shot partner, initiation leader | Two new shot lines are wired but unrecorded |
| Margo Salas | Civilian date, Silver voice/model, Day Four morning guest; explicitly not Hog Mama | Silver-to-apartment closing beat is missing; saved date outcome has no later callback yet |
| Willy | Same Family identity and large-belly presentation from Bing planting through NO WAKE betrayal | Visit-two nervous/informant planting is thinner than the design intent |
| Snow | Friendly Motel ally and Family member; hostile targeting excludes him | One older Snow/Tony Bing pickup recording remains missing |
| Rippinflow, Shubenator, DeathMegatron, Hog Mama, Ape, Eric, Numbskull, and the wider Family | Registered identities and recurring Bing/Initiation presentation are source-contracted | Not every member has a supplied face asset or equal campaign introduction; human visual/audio mix still needs one full continuity playtest |
| Lawnmower | No canonical id, dialogue, model, voice, or source reference was found | Owner must identify whether this is an alias for an existing member or a missing character before content is authored |

## Shared systems assessment

| System | Current authority | Assessment |
|---|---|---|
| Campaign/save/load/transitions | `src/core/campaign.js` plus scene story adapters | One versioned graph and migration path; fresh-save and legacy-save contracts are strong. Final completion is missing by design, not a save bug. |
| Inventory | `src/core/inventory.js`, shared five-slot view/bar | Consistent bottom-box language across every production scene. Scene loadouts intentionally reset; exact-slot removal prevents duplicate-item loss. |
| Dialogue/subtitles/voice | Shared audio primitives plus scene scripts/adapters | Cue and subtitle ownership is testable, but 70 recorded voices remain absent. Apartment, Beef, Bing, and Silver now scope residency; continue the pattern. |
| Interaction/objective/cutscene/camera | Shared low-level helpers with scene-specific directors | Appropriate incremental architecture, but qualitative control return, framing, and walk-away behavior still require human chaotic-input passes. |
| Failure/restart/checkpoints | Mission-local controllers backed by campaign checkpoints | Automated happy-path and key failure recovery exist for major missions; repeated fail/reload behavior is not uniformly browser-tested scene by scene. |
| Money/gambling/relationship scoring | Bing-local gambling and Silver-local woo/outcome state | Functional local systems, not yet one campaign-wide respect/economy/relationship model. Do not invent one until later consequences are designed. |
| Vehicles | Scene-local car, boat, and aircraft implementations | Beef has a measured flight model; NO WAKE and road scenes use their own fit-for-scene controls. No heist driving/stealth/combat system exists. |
| Keyboard/mouse, controller, touch, accessibility | Keyboard/mouse is primary and heavily automated | Representative controller, touch, remapping, subtitle options, reduced-motion breadth, and accessibility review remain open release work. |

## Severity ledger

### Fixed in this consolidation

| Severity | Problem | Resolution / evidence |
|---|---|---|
| P1 | Beef Run return checkpoint spawned the plane far too high and steep for a fair landing | Return establishment now targets a 3.8-degree descent. Flight verifier reaches the runway in 74.4 seconds, touches down 2.4 m off center at 75.6 kt, and stops after 307.7 m. |
| P1 | Canonical documents skipped NO WAKE and contradicted the actual route/audio backlog | Story, outcome, handoff, and next-session documents now use the connected Motel → apartment sleep → NO WAKE → apartment → Silver route and exact 70/14 audio backlog. |
| P1 | Drinking Booski's delivered shot could delete an older whiskey with the same item id after selection changed | The shot records its exact inserted slot and consumes it through identity-checked `Inventory.removeAt(index, expectedId)`; unit and browser regressions cover old-copy preservation. |
| P2 | Beef Run cockpit view and destination were hard to read | Eye line raised; named destination/runway guidance, approach gates, edge lights, contextual coaching, and larger non-repeating line pools added. |
| P2 | Day Two shirt/closet story dressing did not read | Bloody shirt presentation clarified; sliding clothes now bunch fully to the side and rotate edge-on. |
| P2 | Inventory language changed between scenes | Shared five-slot bottom inventory view adopted across apartment, Beef, Bing, Motel, Squatchfather, NO WAKE, Silver, and Initiation; scene loadouts may intentionally reset. |
| P2 | Booski shot existed more as a state change than a staged bar action | Bartender now pours visible liquid into a glass, carries it over, waits indefinitely for E, and the held glass lifts, tilts, drains, and plays pour/swig/glass cues. |
| P2 | Front and Center table appeared without a readable setup and the performance lacked a strong focal prop | Staff visibly carry and set the same tracked table; camera follows it; fixed marks and walkway clearance were refined; bandleader now performs with violin and bow motion. |
| P2 | Rapid sleep input plus a throttled frame loop could let an obsolete lie-down callback overwrite the next morning's subtitle | `Player.layInBed()` now cancels superseded posture tweens; a deterministic unit regression and Day Two browser contract protect the correct wake line. |
| P2 | Standing from a focused framed PC app could leave the apartment paused or without working look input | The exit path now retries native pointer lock and keeps a recoverable drag-look fallback; the six-app lifecycle proves movement/look input resumes. |
| P2 | The Apartment decoded mission-only voice banks it could never request | Apartment-specific selection retains all connected hub/runtime cues while reducing recorded residency from 1,471 to 880; measured Start fell from 5.623 s to 3.169 s on this host. |
| P2 | Beef Run decoded nearly the entire campaign audio catalogue before play | Beef-specific selection retains all 224 recorded mission/runtime cues, excludes unrelated campaign VO, and reduced measured Start from 40.435 s to 0.560 s. |
| P2 | Bada Bing decoded nearly the entire campaign audio catalogue before play | Bing-specific selection retains all 348 required club, gambling, phone, footstep, and effect cues; measured Start fell from 29.431 s to 14.790 s. |
| P2 | Silver could preload the generic audio catalogue | Scene-specific selection now limits its residency request to 226 cues instead of all 1,471 available recordings. |

### Open or approval-gated

| Severity | Open item | Consequence | Required close |
|---|---|---|---|
| P1 | Initiation has no campaign completion/outro | The route arrives, but the campaign cannot honestly report completion | Owner approves ending; implement durable completion, credits/outro, and route regression |
| P1 | 70 voice recordings are absent: 46 Beef Run, 18 NO WAKE, 3 Bada Bing, and 3 Silver Room | Those authored moments currently subtitle into silence | Record, normalize, index, and decoded-playback verify all 70 |
| P2 | 14 final effect recordings are absent | Procedural fallback is audible, but final sound identity is incomplete | Replace and A/B the effects without removing fallbacks until decode verification passes |
| P2 | Day Four Heat-style heist is unresolved | Scope and finale pacing remain ambiguous | Explicitly cut, defer, or approve it; do not silently build around the freeze |
| P2 | Finale premise has competing older descriptions | New work could reintroduce route/story drift | Approve one finale location, oath, and consequence; update all canonical docs together |
| P2 | Full human route/device verification is outstanding | Automation cannot judge comfort, clarity, mix, or real GPU stalls | Clear-save desktop playthrough plus representative mobile/touch and controller checks |
| P3 | Silver-to-final apartment closure is comparatively thin | Day Three may end with less emotional punctuation than its mission earns | Add only after finale direction is locked |

## Bug report

No reproducible **Blocker** remains in the automated route candidate. The open
**Critical** item below is a known missing terminal state, not a crash hidden by
the tests.

| Severity | Description and reproduction | Expected / actual | Affected surface | Likely cause | Fix status |
|---|---|---|---|---|---|
| Critical | Complete every connected beat from a fresh save and enter Initiation | Expected for a finished campaign: oath/outro, durable completion, and a valid next edge. Actual: Initiation remains `in_progress` with no outbound route | Campaign finale and persistence | Authored Initiation is intentionally frozen before its completion contract was designed | **Open; owner approval required** |
| Major | Resume Beef Run at the saved home-return checkpoint and attempt a normal approach | Expected: a readable, achievable glide path. Actual before this pass: Tony began about 520 m above the field, 2.4 km away, requiring roughly a 15-degree dive | Beef Run checkpoint/flight model | Checkpoint altitude and distance were authored independently of a flyable glide slope | **Fixed and measured** |
| Major | Carry an old whiskey, accept Booski's new shot, select the old copy, then press E | Expected: only the delivered shot is consumed. Actual before this pass: id-based removal could delete the older whiskey | Shared inventory / Bing shot | Removal identified an item type, not the delivered slot instance | **Fixed; unit and browser regression** |
| Major | Follow the complete design document into Day Four | Expected: Heat-style heist setup, play, aftermath, then Initiation. Actual: production routes directly to Initiation because the heist has no scene or state | Day Four campaign content | Design is frozen and no implementation was authorized | **Open design/content gap** |
| Moderate | Start Beef, Bing, Silver, or Apartment on a cold browser profile | Expected: scene-owned assets become ready without decoding unrelated missions. Actual before this pass: broad manifest loading decoded large portions of the campaign | Audio loading / memory / startup | Generic global audio residency had no per-scene ownership filter | **Fixed for Apartment, Beef, Bing, Silver; extend later** |
| Moderate | Inspect the Day Two floor evidence and slide every closet garment | Expected: a legible bloody shirt and full clearance to one side. Actual before this pass: weak shirt read and clothes stopped short | Day Two apartment dressing | Incomplete prop silhouette/stain treatment and short closet travel | **Fixed; viewport art pass still needed** |
| Moderate | Watch Booski's shot from pour through drinking | Expected: bottle, stream, rising glass fill, carry, E prompt, lift/tilt/drain, and sound. Actual before this pass: the beat read mostly as a state change | Bada Bing cutscene/interaction | Missing staged prop animation and player-held drink phase | **Fixed; final VO recordings missing** |
| Moderate | Watch Front and Center's arrival/table/performance without skipping | Expected: clear route, staff carry/set the table, camera follows, fixed marks, and visible performance prop. Actual before this pass: table appeared too abruptly and performance focus was weak | Silver Room cutscene and staging | Static setup and insufficient subject tracking | **Fixed in code; human camera pass required** |
| Moderate | Double-tap sleep, then throttle/background the tab until the new morning | Expected: the new day subtitle and bed pose remain authoritative. Actual before this pass: the unfinished lie-down tween could later restore `Ceiling...` over the Day Two line | Apartment player posture/wake lifecycle | `layInBed()` did not cancel a superseded posture tween or its UI callback | **Fixed; deterministic unit and Day Two regression** |
| Moderate | Leave a framed PC app with Q while the parent-owned exit control has focus | Expected: return standing with working look/movement. Actual before this pass: pointer-lock fallback could remain latched and the apartment could be paused/unresponsive | Apartment computer/input lifecycle | DOM-app focus release and pointer-lock recovery were not joined into one exit path | **Fixed; 29/29 lifecycle regression** |
| Minor | Replay Bada Bing after Beef Run and talk around the room | Expected from design: broad recognition, Lou-covered drinks, informant hints, nervous Willy. Actual: second visit is connected but only part of that reactive layer exists | Bada Bing visit two continuity | Shared first-visit content was reused before all campaign variants were authored | **Open content polish** |
| Cosmetic | Complete Silver and compare the end beat to the planned apartment closing scene | Expected in the design: a short Margo apartment close. Actual: Day Four begins with Margo already in bed instead | Day Three/Day Four transition | Planned interstitial was collapsed into the next morning | **Open; wait for finale direction** |

## Gap analysis

### Campaign and persistence

The graph is connected through Initiation, including the formerly omitted NO
WAKE edge. Campaign version 4 repairs older saves into this spine. Remaining
work is at the end: define and persist a real completion state, decide whether
the frozen heist exists, and add a final fresh-save regression through the
approved outro. Do not call Initiation complete because it is reachable.

### Story and pacing

Days One through Three now have a legible escalation: errands, trust-building,
airstrip risk, motel work, the South Harbor boat informant hit, then public performance. Day Four
has a handoff but not a resolved dramatic endpoint. The next writing session
should lock the final promise before expanding any scene: where the oath occurs,
what Tony must do, who judges him, and what success/failure changes.

### Interaction and presentation

The requested high-value beats are represented in code: the landable Beef
return, visible Booski pour/drink, Day Two evidence and closet movement, Silver
table setup/camera/walkway/violin, and a consistent five-slot inventory. Their
remaining risk is qualitative. One human should play without debug teleports
and report only moments where the next action, target, or camera subject is not
obvious within a few seconds.

### Audio

Cue wiring and manifest contracts are present, but cue existence is not the
same as a recording. The release list is exact: 70 voice recordings and 14
effect recordings. The voice split is 46 Capt. Sasole lines, 18 NO WAKE lines,
3 Bada Bing lines (the earlier Snow/Tony pickup plus 2 new shot lines), and 3 Silver Room lines.
Recordings should be accepted only after the browser proves
they decode and reach the SFX graph at nonzero gain. Dialogue timing should use
decoded duration so new performances are not cut off.

### Performance and packaging

The game is already scene-separated on the web, which is a useful form of code
and asset isolation. The measured improvements in this pass are:

| Change | Before | After | Result |
|---|---:|---:|---:|
| Beef terrain construction, controlled 25-run Node probe on this host | 121 synchronous chunks; median 63.27 ms, p95 151.32 ms | 9 immediate + 112 queued; median 12.99 ms, p95 25.60 ms | 79.5% lower median and 83.1% lower p95 startup work |
| Apartment recorded-audio residency and browser Start-to-ready on this host | 1,471 resident cues; 5.623 s | 880 resident cues; 3.169 s | 40.2% fewer decoded samples and about 44% faster Start |
| Beef Run recorded-audio residency and browser Start-to-ready on this host | 1,471 resident cues; 40.435 s | 224 resident cues; 0.560 s | 84.8% fewer decoded samples and 98.6% faster Start |
| Bada Bing recorded-audio residency, bytes, and browser Start-to-ready on this host | 1,471 cues; 71.08 MiB; 29.431 s | 348 cues; 15.16 MiB; 14.790 s | 76.3% fewer cues, 78.7% fewer recorded bytes, and 49.7% faster Start |
| Silver audio selection, manifest/index count | 1,471 available recordings eligible under generic loading | 226 scene-selected cues | 84.6% fewer cue entries selected |

The terrain probe measures construction work in Node, not browser frame rate.
Repeated current terrain stream frames were below 1.19 ms on this host; one
earlier 666 ms reading did not reproduce and is treated as host/concurrency
noise, not hidden as a result. The Apartment and Beef timings are browser
Start-to-ready captures on this host, and Bing uses the same focused browser
harness before and after; none is a network-transfer or cross-device benchmark.
The Silver figure is a cue-residency count, not a measured network-load-time
claim.

The current Pages artifact is also materially large: 1,860 files and about
162.92 MiB, of which assets account for 157.04 MiB. The main payload groups are
sound effects (75.31 MiB), art (40.55 MiB), music (24.54 MiB), and video
(13.79 MiB). That makes caching, deferred decoding, and right-sized runtime
derivatives higher-value than changing engines for the immediate demo.

Recommended packaging sequence:

1. Keep the browser build canonical and add a service worker/web manifest so
   the GitHub Pages build is installable and scene assets are cached after the
   first load.
2. Continue the scene-specific audio selection pattern for remaining heavy
   scenes; fetch recordings on demand or by near-term beat rather than loading
   the global catalogue.
3. Record cache-busted navigation timing, decoded-audio bytes, long tasks, and
   frame pacing per scene before choosing the next optimization.
4. If an offline Windows demo is desired, package the same files in Tauri. This
   improves distribution and repeat asset access, not the underlying renderer.
5. Consider a native-engine port only for a deliberate future product goal
   such as richer physics/AI/content scale. It is not a load-time patch.

## Verification checklist

### Campaign element readiness

`Partial` means the beat is playable but still has a documented content,
qualitative, device, or finale dependency. `Demo` means suitable for the
current friend demo after the exact live Pages smoke, not final-release quality.

| Element | Implemented | Connected | Automated | Save/load | Polished | Player-ready |
|---|---|---|---|---|---|---|
| Apartment Day One | Yes | Yes | Yes | Yes | Partial | Demo |
| Bada Bing visit one | Yes | Yes | Yes | Yes | Partial: 3 Bing recordings outstanding across both visits | Demo |
| Squatchfather | Yes | Yes | Yes | Yes | Partial: human pacing/mix pass | Demo |
| Apartment Day Two | Yes | Yes | Yes | Yes | Partial: viewport check for new evidence/closet | Demo |
| Beef Run | Yes | Yes | Yes | Yes | Partial: 46 recordings and manual first-timer landing pass | Demo with subtitles |
| Bada Bing visit two | Yes | Yes | Yes | Yes | Partial: reactive recognition layer | Demo |
| Jerky Motel | Yes | Yes | Yes | Yes | Partial: human fail/retry readability pass | Demo |
| Apartment Day Three | Yes | Yes | Yes | Yes | Partial: atmosphere/continuity playtest | Demo |
| NO WAKE | Yes | Yes | Yes | Yes | Partial: live pacing/mix pass | Demo |
| Front and Center / Silver | Yes | Yes | Yes | Yes | Partial: 3 recordings and camera/staging playtest | Demo with subtitles |
| Apartment Day Four / Margo wake | Yes | Yes | Yes | Yes | Partial: ending premise dependency | Demo |
| Initiation | Partial | Entry only | Canon guard only | Persists `in_progress` | No | No |
| Heat-style heist | No | No | No | No | No | No |
| Apartment computer suite | Yes | Optional | Yes | App/career state as designed | Partial: external DOOM dependency | Demo |
| Campground Squatch Smash | Yes | Optional | Dedicated verifier | Separate career save | Partial | Demo |

### Automated evidence captured for this candidate

- Core Node suite: 124/124 in-process, including the runway-start, exact-slot, shared-inventory,
  and scoped Apartment-audio regressions.
- Fresh-save campaign route: 1/1 in-process, including NO WAKE and arrival at
  Initiation.
- Day Two apartment: 27/27.
- Day One apartment: 38/38, including exact Apartment audio residency.
- Apartment computer lifecycle: 29/29 across all six apps, including both
  pointer/held-Tab and click escape paths from cross-origin DOOM.
- Day Four apartment / big-night handoff: 20/20.
- Beef Run: 42/42, including the runway-start cut, return checkpoint, measured landing, exact
  224-cue residency, zero unrelated campaign VO, and the 0.560 s Start capture.
- Bada Bing visit two: 12/12.
- Bada Bing full scene: 146/146, including exact-slot preservation, the staged
  shot, all 348 required resident cues, and zero missing, unexpected, or
  unrelated loaded cues.
- Jerky Motel: 38/38.
- NO WAKE: 28/28, including exact cue/recording-sheet ownership.
- Squatchfather: 38/38.
- Silver story: 20/20.
- Silver full scene: 120/120.
- Initiation canon: 11/11. This protects frozen authored material; it does not
  mean the scene or campaign is complete.
- Direct-entry guards: 15/15; preview isolation: 19/19; boot-failure recovery:
  10/10; campground Squatch Smash: 8/8; art manifest: 52 pieces, all good;
  strict-CSP bundle: all 3 policies passed.

### Required before calling the demo current on GitHub Pages

- Run the final aggregate tests, campaign-route verifier, flight verifier, all
  browser scene verifiers, bundle/build check, and `git diff --check` from the
  exact commit to be deployed.
- Play the canonical route from a cleared save without teleports or dev flags.
- Land Beef Run manually; verify destination readability, controller feel,
  runway alignment, touchdown, braking, and post-stop transition.
- Watch Booski's entire shot with existing whiskey in another slot; switch
  selection before E; confirm only the delivered glass disappears.
- Watch Silver's table from carry through setup and performance; confirm the
  camera tracks the subject and the walkway never blocks.
- Listen on headphones: speech intelligibility, no cut-offs, sensible ambience,
  and graceful subtitle/silence behavior for every unrecorded voice cue.
- Test one representative phone/touch viewport and keyboard/mouse desktop.
- Open the deployed URL with a cache-busting query, verify the deployed commit,
  clear site data, and replay at least the first transition and the affected
  Beef/Bing/Silver scenes.

## Prioritized action plan

1. **Release gate:** finish the exact candidate's full automated matrix and
   cache-busted GitHub Pages smoke test. Fix only reproducible blockers.
2. **Audio completion:** record the exact 70 voice lines and replace the 14
   effect placeholders; rerun manifest, decode, playback, and timing checks.
3. **Human demo pass:** complete one no-debug route with special attention to
   Beef landing, Booski's E-driven shot, Silver's camera/table/walkway, and
   apartment day transitions.
4. **Owner decision:** approve the Initiation ending and explicitly cut, defer,
   or approve the Heat-style heist. Reconcile the finale wording in every
   canonical document in the same change.
5. **Campaign finish:** implement Initiation completion/outro and its durable
   state only after that approval; add a full-route browser regression.
6. **Performance pass:** add PWA/offline caching, extend selective audio
   loading, and collect browser timings on representative hardware. Use those
   numbers—not scene size by intuition—to choose further work.

The practical demo line is clear: the current connected build can be shown once
the final matrix and live deployment smoke test pass. The honest campaign finish
line is later: final audio, a human full-route pass, and an approved/completed
Initiation ending.
