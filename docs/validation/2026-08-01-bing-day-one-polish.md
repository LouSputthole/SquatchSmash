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
- Removed Lou's parenthetical writing direction from dialogue text and audio
  playback. The current opening is the spoken line `Shut the door.` only.
- Registered Tony's reply to Snow as `vo.bing.hang.snow.tony.1`.

## Recording follow-up

`vo.bing.hang.snow.tony.1.mp3` is explicitly listed in
[`VOICE-LINES-TODO.md`](../../VOICE-LINES-TODO.md). The script and manifest are
wired; the MP3 has not been generated in this environment because no
`ELEVENLABS_API_KEY` or `XI_API_KEY` was available to this process.

## Verification

- `node --check src/bing/main.js src/bing/script.js src/bing/family.js src/bing/club.js tools/verify-bing.mjs`
- `npm run audio:todo`
- `$env:PORT = '5205'; npm run verify:bing` — 136/136 checks passed.

`npm run check` is currently blocked before source validation: it emits
`undefined` failures for all 187 files, including untouched files. The direct
syntax checks above isolate this as a repository checker/runtime issue rather
than a failure caused by this Bing pass.
