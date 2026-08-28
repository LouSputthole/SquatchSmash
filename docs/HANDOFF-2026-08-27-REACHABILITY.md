# Reachability pass, 2026-08-27

Written for the next developer. The owner is playtesting from
`https://lousputthole.github.io/SquatchSmash/`; the launcher with a card per
scene is `preview.html`.

## What this pass was for

The owner: *"specifically make sure each scene is reachable.. We have had
problems with not being able to complete objectives."*

Nothing was found that strands a player mid-route. What was found is that
**four of the tools that would have told us otherwise had stopped working**,
three of them because they still seed the pre-reorder campaign, and none of
them are in `verify.yml` — which is why CI stayed green over all of them.

## The state of the route

`verify:campaign-marathon` walks all 28 handoffs on a real browser with real
saves and reload proofs. It passes, and the calendar now matches the bible
including the Day 12 jump:

```
04/28 squatchfather   -> countryside_cabin   day 2 05:20
07/28 countryside_cabin -> bada_bing_two      day 4 23:00
11/28 apartment       -> bank_heist          day 5 12:45
14/28 silver_pines    -> luxury_apartment    day 6 11:45
19/28 luxury_apartment -> silver_case         day 7 17:25
24/28 mansion_return  -> cartel_palace        day 12 19:15   <- the jump is wired
26/28 luxury_apartment -> special_meeting      day 13 17:55   <- rings at home now
```

Also green: `verify:boot-failure-surfaces` 40/40 (every staged page boots),
`verify:direct-entry` 27/27 (a bare URL cannot claim a mission), and
`verify:scene-recovery`.

## The four tools that were lying, and what they were lying about

All four had the same shape: a save built by hand, handed to a real browser,
asking whether the mission can still be finished from there. All four were
written before the beats 12–19 reorder and none followed it.

| Tool | Was seeding | Actually needed | Now |
|---|---|---|---|
| `certify:persisted-liveness` | `chapter: 'no_wake'`, Day 3, Silver Room untouched | Day 7, Silver Room complete — `canBegin()` grew a `silver_incomplete` refusal | 9/9 |
| `verify:direct-entry` | Day 4, Silver Room complete, heist untouched | Day 6, heist complete — the Silver Room comes *after* the round now | 27/27 |
| `verify:squatchfather` | waited for `index.html` after AGAIN | the Cabin — beat 3 hands off there | 50/50 |
| `verify:day-one` | asserted the panel was visible right after a no-op update | the panel auto-collapses after 12s | 45/45 |

`no_wake`, `date` and `golf_morning` are **stranded chapters** — the schema-21
migration moves saves out of them. Any tool that seeds one is describing a
world that no longer exists. Grep for them before writing a new seed.

## The player-facing bugs this turned up

**Q did nothing at the cold open.** Squatch Smash is a real iframe and owns
the keyboard while it is up, so the apartment's own Q handler never saw the
key, and the game had no Q of its own. Fixed by routing Q through the game's
existing `confirmQuit()` — the same door the YES button uses. Note for anyone
tempted to shortcut it: calling `quitSquatchSmash()` straight from the key
*does* flip the sequence to `shutdown` and return true, and then nothing else
happens, because the game page is still over the monitor.

**Day One was drawing one objective and hiding the rest.**
`conciseObjectiveItems` defaults `optionalLimit` to 0; the Bing passes 1, the
graveyard 2, and the shared `Hud.setObjectives` passed nothing. The starter
apartment is its only caller, so the inbox, the computer, Squatch Smash and
`killtime` all went dark — and `killtime` is the row that tells a man waiting
on a Bing that opens at 23:45 that he can sleep it off. Now 1.

## Open, and deliberately not guessed at

**`Hud.revealObjectives()` has no callers.** The objective panel collapses
twelve seconds after each change and only comes back when the list changes.
The pause menu shows the current objective, so it is not a dead end, but it is
undiscoverable — and it is a plausible cause of "we couldn't tell what to do
next." Fixing it is a design call: a key binding (O is free — W/A/S/D, Shift,
Space, E, F, Q, R and Tab are all taken), a longer hold, or no auto-collapse.
Ask the owner.

**`certify:scene-liveness --strict` cannot pass by construction.** 2 PASS, 24
UNKNOWN, 0 FAIL — it only certifies terminal states, and refuses everything
else with `ACTION_REACHABLE_REFUSED: … but src/bing/hotdog-main.js owns the
interaction target and spatial reachability`. It is honest scaffolding rather
than a broken gate, and it found no defects. Completing it means teaching it
to observe the scene, which is real work. `certify:persisted-liveness` already
covers the same Hot Dog checkpoints through the production handlers and passes.

**`verify:luxury-apartment-browser`** fails two headless checks — mouse-look
producing no yaw, and a bathroom round trip. Both fail identically on
`origin/codex/handoff-continuation-20260825`, so they predate the merge. Worth
an hour, because one of them says headless mouse-look silently does nothing.

## How to run a scene sweep without being lied to

**Run one browser at a time.** Half a day was lost to this. Running a second
verifier alongside a sweep starves the first of `requestAnimationFrame`, and
under SwiftShader a starved page produces failures that look exactly like
gameplay bugs: beats that do not advance, decals that never spawn, a camera
that does not move. `verify:squatchfather` failed six timing checks under load
and passed 50/50 alone, ten minutes later, with no code change in between.

If you write an ad-hoc Playwright probe, pump frames the way the real
verifiers do — `await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())))`
in a loop — rather than `waitForTimeout`. A cold open that looks frozen is
usually a page nobody is rendering.

## Not swept

The per-scene sweep was abandoned mid-run once its results were known to be
contaminated. These were never cleanly checked and are the obvious next job,
one at a time: `cabin-browser`, `beefrun`, `bing-two`, `graveyard`, `motel`,
`heist`, `golf`, `silver`(passed under load), `no-wake`, `silvercase`,
`mansion`, `mansion-siege`, `enolasquatch`, `mansion-return`, `cartel-palace`,
`specialmeeting`, `initiation`, `preview`. `bing` passed cleanly.

Two of those are known-red for reasons already recorded in `f2b8095d`:
Graveyard has a SwiftShader pre-game failure and Heist a steering threshold
failure, both unrelated to this pass.

## Branches

Everything mergeable is merged. `codex/engineering-completion-20260827` and
`codex/full-polish-music-20260826` are both fully contained in `main`. The
eleven branches still showing commits ahead are the August 1–24 set: 350–500
behind, their work long since landed by other routes, plus
`codex/scene-certification-foundations`, which holds main's own twenty Silver
Sasquatches images as ~55 MB of PNGs where main already has them as webp. They
can be deleted.
