# Playtest punch list — Lou, 2026-08-06

Owner's playthrough notes, itemized and assigned. Each item is done when the fix is
committed AND a machine (verifier assertion, scene-audit class, or check script)
would catch its regression — per `docs/RIGHT-FIRST-TIME.md`.

## NO WAKE — agent: no-wake (opus)

- N1. Below-deck cabin far too small ("plays out in a bathroom") — expand the whole
  boat: hull, deck, below-deck volume. Keep dock/gangway alignment and checkpoint staging.
- N2. Startup controls too bunched — space them so each can be hit individually.
- N3. Lou stands in the way at the startup panel — reposition.
- N4. BUG: after wrapping the body, E would not dump it off the back. Reproduce via
  the real input path, fix, and pin with a synthetic-keypress verifier check.
- (Voice lines: all 37 unrecorded — waiting on the sound guy. Subtitles-only is
  expected, not a bug. See SOUND-GUY-READ-THIS.md.)

## MARGO — BACK AT APARTMENT, NIGHT — agent: margo (sonnet)

- G1. She falls asleep immediately after the dress-fix scene. Hold the all-fours pose
  until the glue effect lands on her back, then send her to bed the same way.
- G2. Special radio song — **waiting on Lou to deliver the track**; slot will take an
  mp3 like the takeoff needle-drops.

## MANSION / PROJECT SILENT SQUATCH

### Geometry & props — agent: mansion-geometry (sonnet)

- M1. Office bookcase looks bad — rebuild it properly (keep the secret-stair
  interaction working).
- M2. Fireplace slightly right so it is not behind the bookcase.
- M3. Grandfather clock still against/into the wall — pull it toward the door.
- M4. Fireplace fire only appears when you're on top of it — extend its visible range.
- M5. Old country room: weight set and chair sit inside the wardrobe and bed — relayout.
- M6. Suite bar has a seat going through it.
- M7. Upstairs TV: wire changeable channels (including the four film reels).
- M8. Snow's cleaning equipment intersects the table.
- M9. Vault picture still passes through the white bar in the wall.
- M10. Large statue has a smaller statue clipped into its front corner.
- M11. Lou's shirt panels are coming way off the body — fix at the character source.

### Mission, cast & FX — agent: silent-squatch (opus)

- S1. Case hand-off: prompt floats at a random spot near Booski. Walk up to Booski,
  hit E, case auto-places on the table.
- S2. Lou opens the case toward himself, with the purple-and-gold glow effect.
- S3. Aubbie volume +20%.
- S4. Aubbie's mouth stops moving once he leaves the lab.
- S5. One line plays with the wrong voice id — find and fix it.
- S6. Blood effect when Aubbie is shot.
- S7. Scientists are all far too large — bring to human scale.
- S8. Scientists' dying animations overlap/intersect each other — separate them.
- S9. Chair sitters (Hog Mama, Capt Sasole) clip through their chairs.
- S10. Snow must come down to the lab for his clean-up lines.
- S11. Objective says "return to the cellar," voice lines say return to Lou, Booski
  says go upstairs — reconcile the flow so the player knows what to do.
- S12. Booth guard lines: recording is on the sound guy, but verify the trigger fires
  and subtitles show.
- S13. A proper SFX pass for the scene — author cues with procedural fallbacks; the
  sound guy renders them later.

### Performance — agent: perf (opus)

- P1. Mansion is slow.
- P2. MANSION SIEGE is unplayable: ~5-minute load, ~1 fps on an RTX 4080. Instrument,
  find the pathology, fix the root cause, and pin budgets in the verifiers.

## ENOLA SQUATCH — agent: enola (sonnet)

- E1. Start the drop-bomb sequence earlier so release happens over the target.
- E2. Returning to the pilot seat disengages autopilot automatically.

## SILVER CASE — agent: silvercase (sonnet)

- V1. Ape's first line still doesn't play — root-cause and fix.
- V2. Ape steps into the apartment after the door opens.

## SYSTEMIC — agent: line-presence (sonnet)

- X1. Build the machine Lou asked for: anywhere a character has lines in a scene,
  that character must be present in the scene (phone/radio/TV/PA exempt). Wire into
  `npm run check`; report violations (Snow-in-lab is the known one).
