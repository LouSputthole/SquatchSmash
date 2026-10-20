# Dead Giveaway — design and module contracts

A 3D multiplayer social-deduction game under the Bada Bing. One shared table, sixteen
words, one secret target, and one player — **The Rat** — pretending to know what the rest
of **the Family** knows. Wire protocol: `docs/DEAD-GIVEAWAY-PROTOCOL.md` (canonical copy in
`Squatch-Bunker/dead-giveaway-server/PROTOCOL.md`). Server lives in that repo; this repo
holds the whole client as one more no-build scene.

Play it straight (`docs/TONE-AND-PARODY.md`): the room is classy, the people are not, and
nobody winks. Player-facing words are always *Dead Giveaway*, *The Rat*, *the Family*.

## Where things live

```
deadgiveaway.html                    scene page (boot-guard global: DEAD_GIVEAWAY)
src/deadgiveaway/main.js             composition root: boot, lobby → table, rAF loop
src/deadgiveaway/deadgiveaway.css    all DOM UI styling (lobby, HUD, board overlay, panels)
src/deadgiveaway/world.js            the backroom: geometry, lights, table, props, board, clue cards, chips
src/deadgiveaway/seats.js            one seated character per occupied seat (cast.js makePerson/Npc), pose + speaking + actions
src/deadgiveaway/actions.js          drink / smoke / spit / gestures: first-person (own) and third-person (remote)
src/deadgiveaway/lobby.js            create/join, name, character grid, seat pick, media setup, start
src/deadgiveaway/table-ui.js         phase HUD, board overlay, clue entry, vote, reveal, last word, payback, chat
src/deadgiveaway/media-panel.js      mic/cam/output device select, local preview, face framing sliders
src/deadgiveaway/characters.js       the selectable roster (ids → face PNG, display name, makePerson model)
src/core/online/dg-client.js         socket.io wrapper: connect, session persistence, typed emit/ack, reconnect rejoin
src/core/online/table-media.js       full-mesh WebRTC engine (mic, cam, VAD, volumes, devices, ICE restart, cleanup)
src/core/online/face-video.js        put a MediaStream on a makePerson head; restore the photo face when off
vendor/socket.io.esm.min.js          socket.io-client 4.8.x ESM build (vendored like three)
tests/deadgiveaway-*.test.mjs        node-only tests for every pure part; register each in tests/run.mjs
```

The server (`Squatch-Bunker/dead-giveaway-server`) is authoritative for all game state. The
client never simulates rules; it renders `state` snapshots and sends intents.

## Contracts between modules

Every module below is written by a different person at the same time. Code to these
signatures. If you must deviate, add the new member and keep the old one.

### `src/deadgiveaway/world.js`

```js
export const SEAT_COUNT = 8;
export function buildBackroom(scene, { renderer, M /* makeMaterials() */ }) → {
  anchors: {
    table: { x, z, topY, radius },            // round/oval felt; players sit around it
    seats: [{ seat, x, z, yaw, faceYaw, sitY }],// seat 0..7 clockwise from the door end.
                                               // yaw = camera yaw looking at table centre (Player.sitAt),
                                               // faceYaw = model yaw for Npc at that chair, sitY = cushion top y
    board: { x, y, z, yaw },                   // wall board centre, facing the table
    door: { x, z },                            // heavy door to the stairs up
    spittoon: { x, z },                        // brass spittoon on the floor near the table
    bar: { x, z },
  },
  colliders: THREE.Box3[], floorZones: [{box, surface}], groundAt(x, z) → y,
  board: { paint({ category, words, highlightIndex, revealIndex, dim }) },   // CanvasTexture 4×4; highlight red; reveal gold; dim=true greys it in LOBBY
  clues: { set(seat, text|null), clear() },    // a readable card standing at each seat's edge of the felt
  chips: { set(seat, n) },                     // n stacked chips = lives at that seat; 0 shows nothing
  marker: { setTurn(seat|null) },              // lit place marker for whose turn it is
  glasses: { at(seat) → THREE.Object3D },      // the whiskey glass that sits at each seat (actions.js borrows it)
  haze: SmokeSystem|null,
  update(dt, camera),                          // flicker, haze, chip glint, board pulse
}
```
Visual brief: walnut panelling and wainscot (`src/bing/kit.js` `panelling`, `printed`,
`felt`), green felt table with a leather rail and brass trim, dark leather chairs
(`src/world/props.js` `makeChair` or a new `makeClubChair`), amber pendant over the table,
brass sconces, a discreet bar with bottles (`makeWhiskeyBottle`), decanter, framed pictures
(`squatchArt`), ashtrays (`makeAshtray`), cigars in a box, a card shoe, a heavy door with a
staircase going up at one end, a low ceiling (`CEIL_BACK`-ish 2.7 m), muffled bass loop from
above. Lighting must keep faces readable from every seat: no fog thicker than the Bing's
haze, key light on the table, fill on the walls. Everything is primitives, nothing loads
from disk except face PNGs.

### `src/deadgiveaway/characters.js`

```js
export const ROSTER = [{ id, name, face /* assets/faces/x.png */, model /* makePerson options, from src/core/wardrobe.js where one exists */ }];
export function characterById(id);
```
Roster = every character with a face PNG in `assets/faces/index.json` plus Tony
(`src/core/prospect-body.js` `prospectFaceUrl`). Selectable by everyone, duplicates allowed.

### `src/deadgiveaway/seats.js`

```js
export function createSeatRig(scene, { world, audio, THREE }) → {
  occupy(seat, { playerId, characterId, name, isSelf }),   // builds/replaces the seated character; isSelf → no visible body (first person) but still a head anchor for self-preview
  vacate(seat),
  setPose(playerId, yaw, pitch),              // remote look direction, smoothed in update()
  setSpeaking(playerId, bool),                // ring/light + small head motion while true
  setOut(playerId, bool),                     // slumps back, glass pushed away
  headOf(playerId) → { person /* makePerson result */, head: Object3D },   // face-video.js attaches here
  personOf(playerId),
  update(dt),
}
```

### `src/deadgiveaway/actions.js`

```js
export const ACTIONS = ['drink','smoke','spit','point','lean','shake','raise','nod'];
export function createActions({ scene, camera, audio, world, seats, smoke, THREE, send /* kind => void */ }) → {
  perform(kind),                   // local: first-person animation (held glass/cigar from src/world/props.js), sfx, then send(kind)
  remote(playerId, kind),          // third-person: animate that seat's character arms/head, props, smoke, sfx positioned at the seat
  update(dt),
  keyFor(kind) → 'KeyX',           // 1..8 number row by default; shown in the HUD legend
}
```
Pacing: an action is ignored while the same kind is still playing for that player; drink
0.9 s per sip; smoke 2.4 s with an ember and a restrained exhale; spit arcs toward the
spittoon with a sound. Audio cue names must exist in `assets/sfx/manifest.json` (`npm run
check` fails otherwise): use `can.sip`, `cig.*` cues, and search the manifest for others
before inventing. If a sound genuinely does not exist, add the cue to the manifest with a
prompt the way other entries do and leave the file to the sound pass (see `SOUND-GUY-READ-THIS.md`).

### `src/core/online/dg-client.js`

```js
export function connectDeadGiveaway({ url /* '' = page origin */, path = '/dg/socket' }) → client
client.on(event, fn) / client.off(event, fn)             // 'state', 'pose', 'act', 'chat', 'media:speaking', 'rtc:hello', 'rtc:signal', 'room:closed', 'error', 'connect', 'disconnect', 'reconnect'
client.emit(event, payload)                               // fire-and-forget
client.request(event, payload) → Promise<ack>            // rejects on {ok:false} with Error(code)
client.create({ name, character }) / client.join({ code, name, character })  // handles clientId, session persistence, returns state
client.resume() → Promise<state|null>                     // rejoin from sessionStorage after reload; null if none
client.leave()
client.state                                              // latest snapshot
client.me                                                 // { playerId, token, code }
client.close()
```
Defaults: `url` from `?server=` query → `localStorage dg.server` → page origin. Reconnect
forever with 1–10 s backoff; on reconnect call `room:join` with the token, then emit the
latest `media:state`, then the media engine re-emits `rtc:hello` (engine listens for
'reconnect').

Added by the implementation (all additive):

```js
client.serverUrl / client.clientId / client.socket / client.connected
client.replaced                         // true after room:closed {reason:'replaced'}: this client is finished
client.request(event, payload, { timeout = 8000 })   // also rejects Error('timeout'); err.code, err.detail (server message)
client.savedSession() → { code, playerId, token, name, character } | null   // for a "rejoin?" prompt
client.rememberServer(url)              // writes localStorage dg.server ('' forgets it)
// events: 'connect' {first}, 'disconnect' {reason}, 'reconnect' {rejoined, state, error?}
// test seams: connectDeadGiveaway({ io, local, session, location, timeoutMs, setTimeout, clearTimeout })
```
- `dg.session` also keeps `name` and `character`: every token rejoin sends them (the server
  ignores them on a valid token and falls back to a fresh join on a stale one).
- Fire-and-forget `emit` returns `false` and **drops** the event while the socket is down
  or the rejoin is in flight (socket.io would otherwise replay a stale burst ahead of
  `room:join`, all rejected). `media:state` is still remembered for the rejoin. `pose` goes
  `volatile`.
- `room:closed` clears the session. With `reason:'replaced'` the socket is also shut and
  never reconnects (the other socket owns the seat).
- An `error {code:'bad_target'}` after an `rtc:signal` just means that player dropped:
  the UI should not toast it.
- Nothing emits `room:leave` on unload: a reload must be able to `resume()`.

### `src/core/online/table-media.js`

```js
export function createTableMedia({ client, selfId, onStream, onSpeaking, THREE? }) → media
// onStream(playerId, { audio: MediaStream|null, video: MediaStream|null })  called whenever a remote's tracks change
// onSpeaking(playerId, bool)  remote speaking flags (from media:speaking), also fires for self from local VAD
media.start({ micId, camId, outId, framing })  → Promise    // getUserMedia; emits rtc:hello when ready
media.setMic(on) / media.setCam(on) → Promise               // cam toggles renegotiate
media.setDevices({ micId?, camId?, outId? }) → Promise      // live replaceTrack for mic; cam applies on next toggle or immediately if on
media.listDevices() → Promise<{ mics, cams, outs }>
media.localPreview() → MediaStream|null                     // camera stream for the lobby/self preview
media.setVolume(playerId, 0..1) / media.setPan(playerId, -1..1)
media.setSensitivity(1..100)                                // VAD threshold
media.peers() → [{ playerId, state: 'new'|'connecting'|'connected'|'disconnected'|'failed', quality: 'good'|'fair'|'poor' }]
media.close()
```
Port the engine from `Squatch-Bunker/squatch-chat/components/VoicePanel.tsx` and
`lib/mediaDeviceSettings.ts` (constraints, device fallback, replaceTrack with rollback,
VAD numbers, quality thresholds, cleanup order) into vanilla ES modules. Remote audio
plays through detached `<audio>` elements (autoplay; call `.play()` and retry on the next
user gesture if it rejects) with a per-player GainNode/StereoPannerNode graph when an
AudioContext is available. Voice must win the mix: the scene's `AudioEngine` music and
ambience buses are ducked while anyone is speaking.

Added by the implementation (all additive):

```js
createTableMedia({ client, selfId, onStream, onSpeaking, getState? /* () => roster snapshot, default client.state */ })
media.start({ micId, camId, outId, framing, mic = true, cam = false })   // mic: initial enabled; cam: open the camera now
media.level() → 0..255                  // the local mean level the VAD compares (lobby "test level" meter)
media.framing() → whatever start() was given (the engine does not use it)
media.peerStats(playerId) → Promise<{ audioPackets, videoPackets, videoFrames, rttMs, jitter, lossRate, quality, … }|null>
media.refresh()                         // re-run the roster cam:true rule now (it also runs on every 'state')
media.debug()                           // internals for verifiers only
```
- The engine plays remote audio itself. `onStream`'s `audio` is for information (a level
  meter); do **not** attach it to another element or the voice doubles. Video is reported
  only while that player's roster entry says `cam:true` AND the track is actually flowing.
- Engine created → it answers offers at once (receive-only until `start()`); `start()` is
  what sends `rtc:hello`. Create it after `join`/`resume` so `client.me` exists.
- It listens for `room:closed` and closes itself. Build a new engine after a new join.
- Signaling extras inside the opaque `data`: every signal carries `pid` (the PC instance id,
  minted by its initiator) so answers/candidates for a torn-down PC are dropped. The
  offerer always offers one audio + one video m-line (video `recvonly` while its camera
  is off); camera toggles are `replaceTrack` + `direction` on that transceiver plus a
  renegotiation offer from the camera owner. Crossed hellos (two players starting at the
  same instant) resolve like crossed offers: lower `joinSeq` keeps offering.
- Remote audio graph: `<audio autoplay>` (kept playing, muted, because Chrome feeds a remote
  stream to WebAudio only while an element plays it) → `MediaStreamSource` → Gain →
  StereoPanner → engine master → its own AudioContext's destination. Until that context
  runs (no gesture yet) the element plays unmuted at `audio.volume`. Output device:
  `setSinkId` on the elements and on the AudioContext where supported.
- Ducking is the scene's job: drive `AudioEngine` from `onSpeaking`.

### `src/core/online/face-video.js`

```js
export function attachFaceVideo(person /* makePerson result */, stream, { zoom = 1, x = 0, y = 0, mirror = false } = {}) → handle
handle.setFraming({ zoom, x, y }) ; handle.detach()        // restores the original face material/map exactly
export function faceCropFor({ zoom, x, y, aspect }) → { offset: [u, v], repeat: [ru, rv] }   // pure, tested
```
The photo face is material index 4 (+z) of `person.face.photo-skull` (see `src/bing/cast.js`
≈ line 2418). Characters built without a photo have a procedural skull; for those, build
the character WITH a 1×1 neutral canvas as `face` so the photo-skull path exists, and keep
the procedural look by leaving the map alone until video attaches. Use `THREE.VideoTexture`
on a `<video muted playsInline autoplay>`; cover-fit the video to the face box aspect and
apply `faceCropFor`. Head rotation comes free because the skull is a child of `head`.

Added by the implementation (all additive):

```js
handle.attached                 // false: no photo skull, or no stream — every method is then a no-op
handle.texture / handle.video   // the THREE.VideoTexture and its <video>
handle.setFraming({ zoom, x, y, mirror? })   // live; mirror only for the self-preview
handle.setStream(stream)        // swap the source in place when a remote's video stream object changes
export function findPhotoSkull(person) → Mesh|null
export function neutralFaceUrl(hex = 0xd9a97f) → data URL    // pass as makePerson({ face }) for a photo-less character
export const FACE_ASPECT        // 0.162 / 0.212
faceCropFor({ zoom = 1 /*1..4*/, x = 0, y = 0 /*-1..1, clamped*/, aspect /*video w/h*/, faceAspect = FACE_ASPECT, mirror })
```
- Framing: zoom 1 = the largest cover crop; x −1/+1 = left/right edge of the leftover
  frame, y −1/+1 = bottom/top. The crop never leaves the frame. Until the video's metadata
  arrives the crop assumes 4:3 and re-crops on `loadedmetadata`/`resize`.
- Attach installs a NEW material array (index 4 a clone of the photo material with the
  video map); detach puts the ORIGINAL array object back and disposes the clone, texture
  and element. The shared, cached photo texture is never touched.
- Photo-less characters: `makePerson` takes `face` as a URL (TextureLoader), not a canvas
  — pass `neutralFaceUrl(skin)`. The photo path builds no procedural eyes/brow, so that
  head is a blank skin-toned front until video attaches; every roster character has a face
  PNG, so this is only for test dummies or future entries.

### `src/deadgiveaway/lobby.js`, `table-ui.js`, `media-panel.js`, `main.js`

DOM over the canvas, styled in `deadgiveaway.css`, using existing patterns (`#hud`,
toasts from `src/core/hud.js`, `createPauseMenu`). Required flows, in order:

1. **Lobby card**: name, Create room / Join with code, character grid (face PNGs), seat
   pick (8 chairs drawn as a ring; taken ones show the face), media panel (mic, cam, output,
   preview with framing sliders, test level), host's START (enabled at ≥3). The 3D room
   renders behind the card with the camera slowly orbiting the empty table.
2. **Sit**: `player.sitAt(seat pose)` from `src/core/player.js`; pointer lock or drag to look
   (`src/core/first-person-input.js` capture mode `pointer-lock-or-drag`); `yawRange` wide
   enough to see every seat and the board. Pose sent 10 Hz.
3. **Phase HUD** (top): phase name, round, whose turn, your role card (RAT in red / FAMILY),
   your lives, a legend of action keys. Board overlay toggled with **B** (large 4×4 grid, same
   highlight as the 3D board). Clues list toggled with **C**. Chat with **Enter** (text) —
   separate from clue entry.
4. **Clue entry**: on your turn a single-line input appears; Enter submits. Others see
   "Lou is writing…". Submitted clue appears on the felt card (world.clues) and in the list.
5. **Discuss**: "Ready to vote" button (count shown), host sees "Call the vote".
6. **Vote**: click a seat/character in the 3D view (raycast on the seat rig) or pick from a
   list; confirm. Votes shown as counts only until the result.
7. **Vote result** → **Role reveal** (every name with RAT / FAMILY; the Rat lit red at their
   seat) → **Your Last Word** (Rat picks on the big board; others watch the board with the
   Rat's hover if cheap, else just the pick) or **Payback** (Rat clicks a victim).
8. **Resolve**: target word revealed gold on both boards; chip removed at the loser's seat;
   host's "Deal again". **Match over**: winners named; "Back to the lobby".
9. Pause (Tab): leave room, media settings, volume per player.

Keep the room visible through all of it: panels are translucent and never cover the table.

## Verification

- `npm test`, `npm run lint`, `npm run check` must pass. Register new tests in
  `tests/run.mjs`. Name the page in `.github/workflows/pages.yml` (the `cp` list) — a test
  enforces that. Add `deadgiveaway` to `tools/verify-boot-failure-surfaces.mjs` `CASES`.
- A Playwright script `tools/verify-deadgiveaway.mjs` (`npm run verify:deadgiveaway`, add it
  to `tools/scene-gate-tiers.mjs`) starts the server from `../Squatch-Bunker/dead-giveaway-server`
  if present, opens three browser contexts with `--use-fake-device-for-media-stream
  --use-fake-ui-for-media-stream`, creates a room, joins two, enables mics and cams, plays a
  whole round through to RESOLVE, and asserts: 16 words identical in all three, exactly one
  Rat, non-Rats see the highlight and the Rat does not, clues appear in seat order, the
  reveal names the Rat, chips change at the right seat.
