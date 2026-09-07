# THE DEV HAUNT — a 30-minute online spike

Owner's ask, 2026-09-07: *"make a few scenes actually online so I could join
as the dev and be a new random character and mess with the player through
having a voice chat I can talk in and I can move around the scene and also do
some funny shit behind the scenes."*

This is the record of what a half hour bought, what it proved, and what the
real version costs.

## What exists now

| Piece | File | What it does |
|---|---|---|
| The pipe | `src/core/online/haunt-link.js` | First-party WebRTC: one JSON DataChannel each way plus the dev's live microphone track. No server, no library — signaling is a copy-paste ritual (dev mints a code, host hands back a reply) with Google's public STUN for NAT holes. |
| The host side | `src/core/online/haunt-host.js` | Runs inside a live scene behind `?haunt=1`: paste panel, spawns The Stranger (primitive suit-and-fedora figure — deliberately not a cast rig, so no gate census moves), eases him along the dev's poses, spatializes the mic through an HRTF panner parked in his chest, routes `{t:'cmd'}` messages to whatever pranks the scene registered. |
| A haunted scene | `src/luxury-apartment/main.js` (tail) | The luxury apartment wired end to end: whisper (floating caption), fart (`fart.1-4`), lights (kill and restore), phone (4 s of `phone.ring`), nudge (crooks the wall art via `actions.crookedArt`), jumpscare (door sounds + blackout + "Behind you."). All through `window.LUXURY_APARTMENT`; `frame()` untouched. |
| The dev client | `haunt.html` + `src/haunt/` | "YOU ARE THE STRANGER": join card (the click grants the mic), spirit-cam void with WASD + pointer lock, a glowing marker where the player is (host reports pose at 5 Hz) so the dev can stalk them blind, prank buttons, mute toggle. |

Proven headless: the scene boots clean with and without the flag (no panel,
no errors, no census change without it), and the dev page boots. See the
end-to-end receipt below for the full loopback proof.

## How to actually use it

1. Player opens `luxury-apartment.html?haunt=1` and plays normally.
2. Dev opens `haunt.html` anywhere, types a name, clicks JOIN (mic prompt),
   copies THE CODE.
3. Player (or the dev over their shoulder / any text channel) pastes the code
   into THE STRANGER'S LINE panel, clicks ACCEPT, sends the reply code back.
4. Dev pastes the reply, connects. From that frame: the Stranger is standing
   in the apartment, he moves on the dev's WASD, the dev's actual voice comes
   out of his chest and gets quieter across the room, and the prank buttons
   work.

## What the spike settled

- **No server is genuinely viable for two people.** WebRTC carries both the
  state channel and the voice; static GitHub Pages hosting never has to know.
  The paste ritual is the whole price.
- **The voice is spatial for free.** The game already runs raw WebAudio with
  per-frame listener updates; a `MediaStreamAudioSourceNode` into an HRTF
  panner is the same shape as every positional cue the engine plays. (The
  prototype uses its own AudioContext; the upgrade is
  `audio.ctx.createMediaStreamSource(stream)` into `audio.busVoice`, which
  also buys the engine's duck/limiter chain.)
- **Pranks are one registry away.** Every hub scene already exposes a debug
  handle (`window.LUXURY_APARTMENT`, `window.__squatch`, …) rich enough to
  drive sounds, lights, phones, and props. Haunting another scene is the same
  ~40-line tail block with a different prank map.
- **Gate safety is a query flag.** Nothing constructs without `?haunt=1`, so
  the geometry census, the scheduled scene gates, and the marathon see a
  world with no Stranger in it.

## Honest limitations (prototype, not product)

- **The paste ritual** is a 30-second chore per session. The clean fix is a
  vendored PeerJS (or any tiny signaling relay) so a 4-letter room code
  replaces the codes; the sandbox that wrote this could not fetch the
  library, but the module was shaped so `hostHaunt`/`joinHaunt` keep their
  signatures when the broker arrives.
- **STUN-only** — two home networks connect; a symmetric corporate NAT needs
  a TURN relay (paid or self-hosted) and this spike does not pretend
  otherwise.
- **The dev flies blind** — the spirit cam is a void with a marker where the
  player stands, not the real scene. Rendering the actual apartment on the
  dev side is straightforward (the scene builders are plain modules) but was
  out of the half hour's budget.
- **The Stranger is a primitive** — suit, hat, no face. The real "random
  character" is `makePerson` from `src/bing/cast.js` with a random wardrobe
  and photo face; it was skipped deliberately because cast rigs register with
  the staging gate (`markActor`) and the census must not move.
- **One scene wired.** The Bing, the golf course, and the first apartment are
  each the same small tail block; the first apartment's `window.__squatch`
  already exposes `fart`, `spooky`, `tv`, and the gun.
- **No player consent UX, no reconnect, no encryption ceremony** beyond what
  WebRTC gives (DTLS) — it is a dev tool, not a feature.

## What the real version costs (estimate)

- Room codes instead of paste: vendor PeerJS (~90 KB) or stand up a
  ~50-line WebSocket signaling relay; half a day with testing.
- Real scene rendering on the dev side + proper cast-rig Stranger with a
  gate-safe registration story: one to two days.
- More scenes + a prank palette per scene + voice through the engine's
  duck/limiter bus: a day.
- TURN relay for hostile NATs: an afternoon plus a coturn box or a paid
  service.
