# recast-navigation runtime subset

SquatchSmash vendors the browser runtime subset of `recast-navigation` 0.43.1
for the Cartel Palace navigation pilot:

- `index.mjs` adapted from `recast-navigation@0.43.1` to use the vendored
  relative core path
- `core.mjs` from `@recast-navigation/core@0.43.1`, with its one dynamic WASM
  import redirected to the vendored relative compatibility module
- `recast-navigation.wasm-compat.js` from
  `@recast-navigation/wasm@0.43.1`

Upstream: <https://github.com/isaac-mason/recast-navigation-js>

The generator stays a development dependency and is not served to the game.
`tools/cartel-palace-recast-pilot.mjs --write-asset` builds the checked-in
Palace navmesh. The runtime imports that binary; it does not generate a
navmesh on the player's main thread.

The upstream project is MIT licensed. See `LICENSE` in this directory.
