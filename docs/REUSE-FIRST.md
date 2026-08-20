# Reuse first

**Before creating any new gameplay system for a scene, check whether Squatch
Life already has an implementation. Reuse and extend the established system
wherever possible.**

This is a development requirement, not a preference. It was written down on
2026-08-20 after a playtest whose findings were, almost without exception, the
same finding wearing different clothes:

> "We're starting to see the cost of duplicating these systems now: initiation
> has different movement, new dialogue has different volume/timing, objectives
> change presentation, decals behave differently, etc. One shared backbone will
> knock out a surprising amount of this jank at once."

That is exactly right, and the four bugs below are what it cost.

## What this covers

| System | The one implementation |
| --- | --- |
| Objective UI | `src/core/objective-panel.js` |
| Dialogue playback, mixing, timing | `src/core/dialogue.js`, over `src/core/audio.js` |
| Subtitles | the scene's HUD `say()`, timed off `speechDuration()` |
| Voice volume | the voice bus in `src/core/audio.js` — **not** a per-call number |
| Player controller | `src/core/player.js` |
| Interaction prompts | `src/core/interaction.js` |
| Weapon handling | `src/core/weapons/` |
| Decals / hit effects | `src/world/blood.js` + `src/core/combat/aim-proxy.js` |
| Combat, waves, factions | `src/core/combat/` |
| NPC outfits | `src/core/wardrobe.js`, `src/core/characters.js` |
| Inventory / package interactions | `src/core/scene-inventory.js` |
| Cutscene transitions | `src/core/campaign.js`'s scene graph |
| Pause menu, settings, keybinds | `src/core/pause-menu.js`, `src/core/settings.js` |

## The four that paid for this page

**Voice volume.** Every scene chose its own dialogue gain: 0.95 in the
Initiation, 0.9 in the Silver Case and the siege, 0.85 in the heist and in
`AudioEngine.say()`, 0.8 in Silent Squatch. None is wrong alone. Together they
are a game whose dialogue level depends on which room you are standing in, and
that is what the owner heard. Fixed by giving speech its own bus with one trim
on it, and by making a per-call gain mean something specific — `SPEECH_GAIN`.

**Positional dialogue.** The Initiation had a researched speech mix and used
it; the heist had none at all, so a robber ten metres down the lobby was as
loud as one on your shoulder. The good numbers are now `SPEECH_MIX` and every
scene gets them.

**Hit decals.** `src/heist/combat.js` worked out how to turn a hit on an aim
proxy into a hit on the body behind it, correctly, and kept it. Silent Squatch
therefore still had the bug: Triple X's hit box was a metre of empty air around
a man swinging on a chain, so blood landed on the box. Same fix, one copy, now
in `src/core/combat/aim-proxy.js`.

**Objectives.** Three scenes had written an `#objectives` panel three different
ways, in three stylesheets, at three positions. The mansion had none on screen
at all — its objective text existed and was visible only in the pause menu,
which is the one place a player is not playing.

## How to follow it

1. **Search before you build.** `grep` for the noun. Nearly everything in that
   table was found by somebody who looked; every duplicate above was written by
   somebody who did not.
2. **Extend, don't fork.** If the shared thing is nearly right, add the option.
   `SPEECH_MIX_INDOORS` exists because a bank lobby is not a forest clearing,
   and it lives beside `SPEECH_MIX` rather than inside `src/heist/`.
3. **A scene-specific value is fine; a scene-specific SYSTEM is not.** The
   Cartel Palace deliberately uses a tighter rolloff than `SPEECH_MIX`, because
   walking toward a conversation to overhear it is the gameplay. It passes that
   as a `mix` to the shared `speak()`. That is the shape to copy.
4. **When you do fork, say why, at the fork.** A comment naming what the shared
   thing could not do is the difference between a decision and an accident.
5. **When you fix something in a scene copy, hoist it.** The heist's proxy
   resolver was right for a year and helped nobody else.

## Where the exceptions are written down

`docs/ENGINE-TRAPS.md` carries the ones that are load-bearing — the cue-naming
trap that means the engine cannot classify `heist.snow.commit` by prefix, the
mouth driver reading the take's own analyser, and the rest. Read it before
deciding the shared system is wrong.
