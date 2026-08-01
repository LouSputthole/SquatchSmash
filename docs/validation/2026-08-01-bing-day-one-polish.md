# Bada Bing Day One polish — 2026-08-01

## Completed

- Rebuilt the storage-room body as a low tarpaulin silhouette with visible
  boots, sleeve, hand, and cloth folds.
- Corrected the urinal backplates: they now run along the tiled wall at an
  8.5 cm wall-normal depth instead of protruding as white boxes.
- Moved the Booskibro shot delivery from the bouncer to the bartender. The
  bouncer remains at the front door and the bartender returns to the service
  station after the handoff.
- Removed duplicate phone and drink rows from the bottom-left `ON YOU` card.
  Campaign items and cash remain there; drinks use the four-slot hotbar at the
  lower right; the phone has its own persistent lower-right `[P]` pocket.
- Scoped the raised hotbar offset to `body.bing`, so this club-only phone
  pocket cannot move the apartment or other scenes' shared hand UI.
- Removed Lou's parenthetical writing direction from dialogue text and audio
  playback. The current opening is the spoken line `Shut the door.` only.
- Registered Tony's reply to Snow as `vo.bing.hang.snow.tony.1`.

## Recording follow-up

`vo.bing.hang.snow.tony.1.mp3` is explicitly listed in
[`VOICE-LINES-TODO.md`](../../VOICE-LINES-TODO.md). The script and manifest are
wired; the MP3 has not been generated in this environment because no
`ELEVENLABS_API_KEY` or `XI_API_KEY` was available to this process.

Lou's cleaned-up opening is intentionally subtitle-only until a take without
the removed stage direction is recorded. The old recording remains on disk but
is not played because its spoken words no longer match the subtitle.

## Verification

- `npm test` — 108/108 passed.
- `npm run check` — 195 source files parsed; four manifests validated.
- `npm run verify:bing` — 136/136 checks passed.
- `npm run verify:bing-two` — 12/12 checks passed, including the direct-entry
  save guard and Motel handoff.
