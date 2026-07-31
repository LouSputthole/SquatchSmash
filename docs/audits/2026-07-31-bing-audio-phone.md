# Bing audio and phone follow-up â€” 2026-07-31

Base audited: `origin/main@d49a506ef70cab9727fa0267e8ed012cad3ff0d5`.

## Delivered

- `AudioEngine` records bounded factual playback evidence for decoded sample
  buffers: cue name, decoded duration, scheduled gain, SFX graph connection,
  and natural completion. This is diagnostic data only; it never enters a save.
- `verify:bing` drives five recorded Bing surfaces (door/bouncer, bar,
  blackjack dealer, stage, and Family) through the production `voiceCue` path.
  It waits for the longest real sample, then requires nonzero gain, SFX
  connection, and natural end for each one. This proves WebAudio construction
  and graph routing, not physical speaker output.
- The shared `Phone` supports durable, story-derived threads and unread state.
  `src/core/phone-content.js` builds the Family, Big Uncle Lou, and Mum threads
  from campaign state. Reading a thread writes a zero-minute `phone.read.*`
  time event, so the read marker remains after reload or scene transition.
- Bing uses the same phone data as the apartment, enlarges the raised phone
  panel, exposes wheel navigation in its control legend, and lets `[Q]` pocket
  the phone when not in a call.
- Apartment phone is brought slightly closer/larger while retaining the whole
  screen in frame.

## Fresh evidence

```text
npm test                     89/89 passed
npm run check                186 source files, 4 manifests, all good
npm run verify:bing          126/126 passed
npm run verify:squatchfather  31/31 passed
npm run verify:beefrun        22/22 passed
```

Squatchfather’s browser pass confirms direct and campaign entries both begin
outside active colliders, accept W movement, load recorded wet-street footsteps,
stage/drop the revolver, persist completion, and return to the apartment.
Beef Run confirms full preview progression, persisted checkpoints, Captain Lou
Sasole's distinct identity, completion state, and no runtime console errors.

## Deliberately not changed

The Initiation ending and human-to-sasquatch transformation rewrite remain
deferred until the owner has playtested the existing scene. This follow-up did
not alter its scene files or claim an unimplemented campaign ending.
