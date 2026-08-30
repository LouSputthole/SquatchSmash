# Spector.js MCP for SquatchSmash

Spector.js MCP is development tooling. It must not be imported by game code,
added to the Pages runtime, or made a dependency of the no-build deploy.

The upstream server launches Playwright, injects Spector.js into a loaded
WebGL page, and exposes canvas selection, frame capture, draw-call, shader,
texture, GL-state, context, screenshot, and console inspection.

## Local installation

Clone `https://github.com/BabylonJS/Spector.js` outside this repository. From
its `mcp/` directory, install dependencies, build the TypeScript server, install
Playwright Chromium, and run its tests. Register the built entry point in the
Codex user configuration:

```toml
[mcp_servers.spector]
command = '<absolute path to node>'
args = ['<absolute path to Spector.js>/mcp/dist/index.js']
startup_timeout_sec = 30
```

Restart Codex after changing MCP configuration. Confirm the server is enabled
with `codex mcp list`, then list its tools before relying on it.

## Rendering evidence contract

For a mirror, transparency, depth, render-order, material, lighting, or other
WebGL defect, retain a compact before/after record:

- page URL and deterministic scene checkpoint;
- selected canvas index, ID, dimensions, and WebGL version;
- captured-frame command and draw-call counts;
- relevant draw-call IDs and material/shader or blend/depth/stencil state;
- relevant bound textures;
- WebGL and browser-console errors;
- the corresponding screenshot;
- what changed in the after capture.

Spector evidence complements the scene verifier and player-path browser run; it
does not replace either one.
