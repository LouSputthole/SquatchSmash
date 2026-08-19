# The dialogue sheet

Every spoken line in the game, in one place, with rewrites beside the ones that
are coasting.

**Open `SQUATCH-SMASH-DIALOGUE.xlsx`.** Everything else in this folder either
feeds it or falls out of it.

```
npm run dialogue:sheet     # rebuild the whole workbook
npm run dialogue:csv       # CSV + JSON only, no Excel dependency
```

## What the tabs are

| Tab | What it holds |
|---|---|
| **PUNCH-UP** | The working document. Each scene gets a diagnosis, then its weakest lines with the current text, what is wrong with it, and five rewrites. **This is the tab to sit with.** |
| **ALL DIALOGUE** | All 3,433 spoken lines. Filterable by scene, character, recorded/unrecorded, flag. |
| **FLAGGED** | The subset a heuristic thinks is coasting — filler, HUD-speak, one-word answers. A flag is a prompt to look, not a verdict. |
| **BY SCENE** | Counts. Lines, flagged, punched up, recorded, unrecorded. |

## The five columns of rewrites

Every punched-up line gets the same five, so you can read across a row and hear
the same beat five ways:

- **House rewrite** — the recommended fix. Same length and shape as the current
  line, so it drops into the scene without re-timing anything.
- **Tarantino** — long, digressive, circles the threat instead of stating it.
  The menace is in how long the man is willing to keep talking.
- **McDonagh** — blunt, cruel, funny in the same breath. Everyone is sincere and
  slightly stupid, profanity is punctuation, and the punchline is usually bleak.
- **Houser (GTA)** — corporate and commercial language in a criminal mouth.
  Everything is a market, a liability, a performance review.
- **Coen** — flat, over-polite, banal in the face of horror. Trails off. Says
  "well" a lot. The scariest of the five when it lands.

**Fill in the PICK column** with the one you want and I will cut the takes to
match. Mixing is fine and usually better — a Coen answer to a Tarantino question
is a real scene.

## Two doctrine violations flagged in here

Both are marked in the sheet and both should go regardless of which tone wins:

- `heist.prospect_counterstrike` — names a real video game mid-standoff.
- `vo.siege.prospect.little_friend` — quotes the film being parodied out loud.
- `vo.bing.hang.hogmama.tony.1` — "don't make me a bit" is meta-comedy slang.
- `vo.door.hint.piss.1` — the character speaks the keybind ("hold F").

`docs/TONE-AND-PARODY.md` rules out all four: the player supplies the
recognition, the scene never points at it, and a character never reads the HUD.

## How to change what is in here

Do not edit the workbook and expect it to survive — it is generated.

- **Wrong or missing rewrite?** Edit the scene file in `punchups/`. Keyed by cue
  id; the generator warns if a key does not match a real cue.
- **A line's current text changed?** It comes from `assets/sfx/manifest.json`.
  Fix it there and rerun.
- **Want a scene covered that is not yet?** Add a file to `punchups/` in the same
  shape: `scene`, `reference`, `diagnosis`, `lines[]`.

## What is not covered yet

166 lines of 3,433 have written variants. That is the triage — the marquee scenes
and the worst offenders. `Bada Bing` (489 lines), `The Silver Room` (354) and
`Silver Pines` (353) have systemic problems described in their diagnoses that
affect far more lines than are individually listed: the Prospect answers waiters,
bosses and doormen in the same flat register everywhere he appears. Pick a
direction on the listed ones and the rest of each scene can be brought up to it
in one pass.
