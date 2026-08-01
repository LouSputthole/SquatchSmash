# Audio production sources

The runtime audio authority is [`assets/sfx/manifest.json`](../sfx/manifest.json).
Recorded files live in `assets/sfx/`; [`assets/sfx/index.json`](../sfx/index.json)
is the generated list of files the browser may fetch. Missing manifest effects
retain procedural WebAudio fallbacks. Missing spoken cues remain subtitled but
silent until their recordings arrive.

The handoff for the voice and sound team is generated from the live manifest,
the runtime index, and the legacy review queue:

```sh
npm run audio:todo
npm run audio:todo:check
```

After approved MP3s are delivered under the exact filenames in the handoff,
run `npm run sfx:listen`. That rebuilds the runtime index and the local audition
page.

## Legacy production queue

`sound-queue.json` predates the shared manifest. It describes proposed Motel and
Squatch Smash sound effects, ambience, music, and an older Motel voice pass.
Its `audio/.../*.wav` paths are production-design targets, not files the current
runtime loads. Do not send the queue straight to a producer or drop WAVs under
those paths expecting them to play. Reconcile and promote an approved brief to
the shared manifest first.

```sh
npm run audio:legacy        # rewrite the legacy review queue
npm run audio:legacy:check  # read-only coverage and drift check
```

The legacy checker covers only the two procedural systems it owns:
`src/motel/` and `game/src/`. It intentionally does not claim coverage of the
rest of the campaign.

## Production status

- `VOICE-LINES-TODO.md` is the direct-delivery sheet for shared-manifest pickup
  recordings and effects.
- The legacy section in that sheet is a reconciliation backlog only.
- `npm test` fails when the committed handoff drifts from its sources.
- No automated check can prove that a human-delivered recording says the right
  words. Audition the take against the printed transcript before approval.
