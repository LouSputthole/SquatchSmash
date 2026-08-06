# BRANCH AUDIT — what is in `main`, and what is not coming

Written 2026-08-05, while consolidating everything onto `main` so the owner
could start previewing. Ten remote branches existed. This is what happened to
each of them and, where something was **not** merged, the evidence for that
decision — because "we decided not to take it" is only an acceptable answer if
somebody can check the reasoning later.

`main` was at `f07a712` when this started, forty-eight commits behind the
working branch.

---

## Merged

| Branch | What it carried | How it went in |
| --- | --- | --- |
| `claude/squatch-life-continuation-2c23z0` | Forty-eight commits: the mansion siege, the Enola Squatch escalation, the wardrobe, Willy's removal, the bleed-out | Fast-forward |
| `claude/margo-scene-collision-walk-793m7v` | The morning urge fires once a day rather than once per dart | Clean |
| `codex/silver-room-voice-recast-20260804` | The Silver Room waiter and manager recast, 74 re-rendered takes | **Three-way merge, by hand — see below** |
| `claude/outfit-refinement-pass-d2lk39` | Lou dressed three ways, the corno, jewellery that stops being drawn inside him | Three conflicts, all additive, both sides kept |
| `worktree-agent-a6b63f4d9ecaa39bb` | Both nose-art paintings on the port forward fuselage | One conflict in `tests/run.mjs`, both registrations kept |

### Already in — nothing to do

`codex/glue-gag-candidate-takes-20260802`, `codex/voice-todo-20260803`,
`codex/bing-office-nephews-20260803`, `claude/silver-case-mission-gqqljk`. All
four are zero commits ahead of `main`.

---

## The one real conflict: who is the Silver Room waiter?

Two sessions recast the same voice profile on the same day, hours apart,
neither able to see the other:

| | id | committed | takes rendered |
| --- | --- | --- | --- |
| ours | `gAMZphRyrWJnLMDnom6H` | 2026-08-04 04:18 UTC | **none** — its own note says the 74 existing takes "must be re-rendered" |
| theirs | `miqykcv8BCUvQnRlIGUV` | 2026-08-04 14:29 UTC | **all 74**, and they are the files on disk |

**Theirs won.** Ten hours newer, and — decisively — the mp3s in `assets/sfx`
are its mp3s. Keeping ours would have left the manifest naming a voice that no
file in the project was ever spoken in. The whole history is written into the
profile's own `_note`, with the command to switch back, because this is an
owner's casting decision and an agent's tie-break on it should be visible
rather than silent.

### How the manifest was merged

**Not by line.** `assets/sfx/manifest.json` is the project's audio truth and
git's line merge is the wrong tool for it: two sides appending voice profiles
to the same object conflict textually while agreeing completely, and two sides
changing the same profile's `id` can merge *cleanly* if the lines happen not to
touch — which is the dangerous half. So base, ours and theirs were compared
**per key**:

- base == ours, theirs differs → theirs changed it, take theirs
- base == theirs, ours differs → we changed it, keep ours
- both changed it, differently → a real conflict, reported, nothing chosen

Result: 4 voice profiles added, 10 cues re-pointed to the new `manager` voice,
15 of our own edits protected from being reverted by the older side, and
exactly **one** genuine conflict, which is the one above. `index.json` and
`VOICE-LINES-TODO.md` were then regenerated rather than merged, because both
are outputs.

---

## Not merged, and not coming

### `codex/beefrun-front-center-polish-20260802` — superseded

Seven commits, 201 files, 9,167 insertions: the HotDog incident, the graveyard
finale, Beef Run polish, the Front and Center dinner. It looks like the biggest
outstanding branch and it is almost entirely already here, by a different road.

**The graveyard exists twice.** Both this branch and `main` created
`src/graveyard/` independently — same scene, same commit *messages* ("Build
HotDog incident and graveyard finale", "Move Babs bench beside grave"),
different hashes, different files:

| file | `main` | branch |
| --- | --- | --- |
| `world.js` | 713 lines | 727 |
| `mission.js` | 265 | 252 |
| `main.js` | 598 | 579 |

`main`'s line then kept going — `Polish graveyard memorial interactions`,
`Complete release consolidation`, `Build a real wrapped body`. Merging this
branch would mean reconciling two independently-written 700-line
implementations of a scene that currently works, which is the thing the
standing instruction forbids: *do not replace working systems with earlier
ones.*

**And both other areas moved on.** `main` has `Fix the fifteen things the owner
found on the Beef Run` and `Front and Center: the owner's wave-three notes`,
both owner-driven and both after 2026-08-02. `src/silver/` has grown
`date.js`, `perform.js`, `woo.js` and `room.js`; the branch's `dinner-flow.js`
is the earlier answer to what those now do.

**What is genuinely only on this branch:** of its 133 added files, 121 already
exist in `main`. The twelve that do not are `silver-waiter.png`, two Bing 2 VO
takes, `dinner-flow.js` and seven test files — and the face and both takes are
referenced by **nothing** in `main`: the cues were renamed out of the manifest
during the Bing 2 rework and the face is not in `assets/faces/index.json`.
Adding them would add orphans.

> Kept as a branch. If a specific beat off it is ever wanted, it is one
> `git show` away — but it should be taken beat by beat, against the current
> files, not merged.

### `codex/no-wake-production-20260731` — unrelated history

402 commits and **no merge base with `main` at all**. Not a branch; a separate
repository that happens to share a name. Its subject, NO WAKE, is being rebuilt
against `docs/NO-WAKE-REDESIGN.md` instead. The recording sheet it exposes is
worth reading before that work is called finished.

---

## One thing this audit found that is not about branches

`npm test` reported **806 passing, 0 failing** while quietly running only 591
tests.

`tests/run.mjs` imported its modules in a bare `for await` loop. A module that
throws while being *imported* rejects that loop, and every module after it in
the list never registers a single test — so the twelve suites after the failure
simply did not exist, and the run still said "0 fail". The trigger was the
outfit branch putting a photographed Lou in the mansion office: `TextureLoader`
reaches for `document.createElementNS`, the DOM stub that happened to be
installed first did not have it, and the import threw.

Both halves are fixed. There is now one shared `ensureDomShim()` instead of
four per-file `globalThis.document ??=` blocks that could only ever elect the
first one to run, and a module that cannot be imported is now **a failing test
named after the file** while the rest of the list carries on.

**A test suite that can lose two hundred tests without failing is worse than no
test suite**, because it is trusted. Worth remembering the next time a total
drops for no visible reason.
