# Spector mirror evidence

Captured 2026-08-27 from the real Apartment, Luxury Apartment, and Cabin
WebGL canvases with the development-only Spector MCP documented in
`docs/engineering/SPECTOR-MCP.md`. The browser ran Chromium/SwiftShader at a
fixed 1920 x 1080 canvas. Each comparison uses the same camera, outfit
(`cream_cashmere`), scene state, and mirror pose. The control disables only the
player body's reflection layer; it does not remove the mirror or change the
room.

## Result

| Scene | Body off: draws | Body on: draws | Delta | Programs off/on | GL errors |
|---|---:|---:|---:|---:|---:|
| Regular apartment | 3,297 | 3,387 | +90 | 26 / 26 | 0 / 0 |
| Luxury apartment | 2,979 | 3,015 | +36 | 34 / 35 | 0 / 0 |
| Cabin | 6,322 | 6,369 | +47 | 43 / 43 | 0 / 0 |

The draw-call increase is the important before/after receipt: the reflected
pass actually submits the body instead of merely changing a JavaScript flag.
The screenshots also show the cream outfit and lit skin in the reflected image,
while the ordinary first-person view remains bodyless.

## Render state inspected

- Selected canvas: `#scene`, WebGL 2, 1920 x 1080.
- Mirror target: an sRGB `WebGLRenderTarget` sampled by a tinted
  `MeshBasicMaterial`; horizontal repeat is flipped once so the result reads as
  a mirror rather than a camera feed.
- Reflection camera: normal scene layer 0 plus dedicated body layer 1.
- Player body: every body and outfit object is mounted on layer 1 and excluded
  from layer 0. Outfit replacement rebuilds that same reflected assembly.
- Lighting: the reflection camera continues to render the scene's layer-0
  lights while admitting the layer-1 body. The body therefore uses its normal
  lit Three.js figure materials in the reflection instead of an unlit duplicate.
- Depth/blend/stencil: Spector reported no WebGL errors in any captured frame;
  the mirror's render target pass completed before the normal canvas composite.

Spector's canvas discovery produced two identical Three.js console messages
about requesting a context type from a canvas that already owns another
context. They occur during the MCP's context-probing step, not in ordinary game
boot, and are reported separately from Spector's frame result of **No GL errors
detected**. The scene verifiers are the authority for ordinary console/page
errors.

## Evidence files

The capture images are retained under `docs/validation/spector-mirrors/`:

- `apartment-body-off.png` and `apartment-body-on.png`
- `luxury-body-off.png` and `luxury-body-on.png`
- `cabin-body-off.png` and `cabin-body-on.png`

Raw MCP capture JSON and draw-call listings were intentionally not committed:
Spector embeds the framebuffer as base64 in its state diff, making those files
large and hard to review. The compact counts above are copied from the MCP's
frame summaries, and the paired PNGs preserve the visual proof.
