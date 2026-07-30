# Infrastructure hardening — 2026-07-30

This pass deliberately avoids the Apartment, Bada Bing, Beef Run, and Silver
Room scene files owned by the wave-2 playtest correction worktrees.

Base: `origin/main@5059f53ed37d8bf7bf1e053a0c5ffeca3fa5b191`

Branch: `codex/infrastructure-hardening-20260730`

## Included work

### Strict-CSP single-file bundle

`npm run verify:bundle` now rebuilds `dist/squatch-apartment.html` and boots it
under all three policies in `tools/verify-bundle.mjs`. The models manifest is
part of `window.__SQUATCH_INLINE`, so bundled Apartment startup does not try to
fetch `assets/models/manifest.json` when `connect-src 'none'`.

Red baseline:

- Bundle booted and became playable.
- Two policy checks failed because the models manifest was fetched over HTTP.

Green result:

- All three policies booted and became playable.
- No script or connection request was refused.
- The optimized bundle is 15.88 MB and loaded 297 voice clips.

### Motel retry route

An interrupted Motel mission already caused `ApartmentStory.tryLeave()` to
select `jerky_motel`, but the campaign graph rejected the matching Apartment →
Motel transition. The Apartment scene now has that registered retry edge.

The regression test exercises `ApartmentStory` and `navigateCampaign`, rather
than merely asserting the selected destination.

### Squatchfather audio production queue

The restaurant's queued cues now live in `assets/sfx/manifest.json`, which is
the manifest consumed by `npm run sfx`. The obsolete parallel
`assets/sfx/squatchfather/manifest.json` was removed.

- 30 restaurant effects/ambience cues queued.
- 27 `vo.sf.*` dialogue cues queued.
- Sal and McClawsky have separate intentionally unassigned voice profiles.
- No paid or generated audio was created in this pass.

## Legacy airstrip prototype

The superseded, previously untracked single-engine prototype was preserved on
the separate branch `archive/legacy-airstrip-prototype-20260730` at
`19ccf3ccf55cc27a3dddba700939b3ba1cce096c`.

It is historical reference only and must not replace the production Beef Run.
Its four focused tests and the old 32-test suite pass on that branch.

## Verification

- `npm test`: 76/76.
- `npm run check`: 179 source files and four manifests.
- `npm run verify:motel`: 27/27.
- `npm run verify:squatchfather`: 19/19.
- `npm run verify:bundle`: all three strict-CSP policies.
- `git diff --check`: clean.

Generated `dist/`, `node_modules/`, and generated audio reports remain ignored
or restored and are not part of the branch.
