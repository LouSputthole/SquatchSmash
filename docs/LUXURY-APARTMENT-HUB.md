# The High Life — unplaced late-game apartment hub

## Production boundary

The High Life is a new standalone home scene for a later point in the game. It
does not replace or modify the current apartment, and it is not connected to a
campaign checkpoint. The countryside cabin and the existing campaign route
remain unchanged. Story work can later decide when Tony moves in, what unlocks
the property, and where its exit returns.

No chapter-specific visitor, call, reward, or mission dressing belongs in this
scene until that placement is decided. The preview card is intentionally
marked `FUTURE HUB · UNPLACED`.

## Place

The apartment is an ultra-luxury, two-level home built around a double-height
living room. The main floor and north loft occupy distinct walkable footprints
so the shared first-person ground solver never has to choose between two floors
at the same X/Z coordinate. A broad west stair is the playable transition; the
loft overlooks the living room and panoramic city glazing.

The authored visual language is dark timber, pale stone, charcoal metal,
brass, warm pools of domestic light, and a blue-hour skyline. The glass wall is
backed by a full city-view set rather than a flat color, so the windows have
depth and recognizable night lighting when the player looks out.

## Home parity

The runtime owns the same categories of downtime the current apartment does:

- the full SquatchOS computer suite and a dedicated Squatch Smash cabinet;
- television, radio, phone, lighting, doors, fridge, kitchen, shower, wardrobe,
  toilet, couch, and bed interactions;
- a five-slot inventory and the familiar apartment consumables and held items;
- the crooked-art timing interaction, answering machine, and firearm handling;
- upstairs and downstairs posture exits that restore the correct floor height;
- extra late-game game-space activities and gallery interactions.

These are scene-local systems. They do not advance campaign state while the
scene is unplaced.

## Art collection

The gallery resolves every art slot used by the current apartment and rehangs
it for the larger architecture. Fourteen additional luxury slots add a foyer
statement piece, loft triptych, stair memories, private rooms, game-space art,
and two original canvases made for this scene:

- `assets/art/luxury-night-watch.webp` — a blue-hour city and woodland myth
  rendered as a wide oil painting;
- `assets/art/luxury-ascension.webp` — a vertical guardian composition that
  carries forest imagery into the gold geometry of the city.

All fourteen slots are manifest-backed. Reused collection pieces remain real
textures rather than placeholder panels.

## Integration contract

The scene must remain independently bootable through `luxury-apartment.html`,
discoverable in `preview.html`, deployable by the Pages workflow, and covered
by boot-recovery, runtime-health, world-contract, browser, and strict geometry
checks. Any later campaign integration should call the scene through a new,
explicit route seam instead of changing the original apartment's chapter
logic in place.
