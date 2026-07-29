# Models

Drop `.glb` files in here and list them in `manifest.json`. They are placed in
the apartment's own coordinate space — the same numbers the slot tables in
`src/world/apartment.js` use — so `[0, 0, 0]` is the middle of the floor, +X is
towards the kitchen and −Z is towards the desk.

```json
{
  "models": [
    {
      "file": "armchair.glb",
      "at": [-4.2, 0, 1.1],
      "rotY": 1.57,
      "scale": 1,
      "replaces": "couch"
    }
  ]
}
```

| key | meaning |
| --- | --- |
| `file` | the `.glb`, relative to this folder. Required. |
| `at` | `[x, y, z]`. The floor is `y = 0`. |
| `rotY` | radians, anticlockwise seen from above. |
| `scale` | one number, or `[x, y, z]`. |
| `replaces` | hides the procedural prop with that group name. |
| `shadows` | set `false` for anything that should not cast or receive. |

`replaces` is how you take over one object at a time. The procedural prop is
**hidden, not deleted**, so removing the manifest entry puts it straight back —
and nothing that holds a reference to it (the lamp's bulb, the desk's RGB
strips, the chair) ends up pointing at something that has left the scene.

Prop names worth knowing: `couch`, `bed`, `coffeetable`, `sideboard`, `desk`,
`chair`, `fridge`, `tv`, `nightstand`, `plant`, `toilet`, `tub`, `bathsink`.

An empty manifest is the normal state and costs nothing. GLB only — no
separate `.bin` or texture files, so export with everything embedded.
