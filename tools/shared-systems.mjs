/**
 * WHICH SCENES USE THE SHARED SYSTEMS, RECORDED.
 *
 * The owner, after four scenes in a row came back with the same notes:
 * *"We keep reinventing and using different systems instead of using what we
 * already have."* He is right, and docs/REUSE-FIRST.md saying so has not
 * stopped it once, because a doc cannot fail a build.
 *
 * This is the same rule with teeth. The table below records, per scene, which
 * shared systems it actually imports. tests/shared-system-adoption.test.mjs
 * checks the record against the source tree, so:
 *
 *   - a new scene cannot be added without its row, which is the moment to ask
 *     what it is about to rebuild;
 *   - a scene that DROPS a shared system fails until someone writes down why;
 *   - a scene that ADOPTS one fails until the record is updated, which costs a
 *     line and makes the win visible in the diff.
 *
 * It is a ratchet, not a wall: the numbers are allowed to go up freely and
 * down only deliberately. `notes` is where a deliberate absence is justified,
 * and an unjustified zero is just a zero -- honest, visible, and next on the
 * list.
 */

/** The systems worth having exactly one of. */
export const SHARED_SYSTEMS = Object.freeze([
  Object.freeze({
    id: 'objectives',
    module: 'src/core/objective-panel.js',
    /* It has no chime. This said "and its update chime" until the four scenes
     * that adopted it went looking for one and found nothing -- a description
     * of a shared system that lists a feature the system does not have is the
     * same species of lie as a gate that reports green without looking. Either
     * the panel owes a chime or this line does; for now the line tells the
     * truth and the chime is a thing somebody can decide to build. */
    what: 'The upper-left objective card and its wording. No chime yet.',
  }),
  Object.freeze({
    id: 'dialogue',
    module: 'src/core/dialogue.js',
    what: 'One playback path: one gain, one duck, one subtitle, no legacy cue.',
  }),
  Object.freeze({
    id: 'interaction',
    module: 'src/core/interaction.js',
    what: 'The E prompt, its hold arc, and the rule that a refusal says why.',
  }),
  Object.freeze({
    id: 'player',
    module: 'src/core/player.js',
    what: 'Movement, the camera it carries, and the feel of both.',
  }),
  Object.freeze({
    id: 'hud',
    module: 'src/core/hud.js',
    what: 'The health, hand and clock furniture.',
  }),
  Object.freeze({
    id: 'pause',
    module: 'src/core/pause-menu.js',
    what: 'Pause, settings, and the way out of a scene.',
  }),
  Object.freeze({
    id: 'inventory',
    module: 'src/core/scene-inventory.js',
    what: 'What the player is carrying, across a scene boundary.',
  }),
  Object.freeze({
    id: 'blood',
    module: 'src/world/blood.js',
    what: 'Impact decals, on the node the hit actually landed on.',
  }),
  Object.freeze({
    id: 'staging',
    module: 'src/core/staging.js',
    what: 'The actor marker the staging gate reads. docs/STAGING-GATE.md.',
  }),
]);

/**
 * Scene directories under src/, and the shared systems each one imports.
 *
 * A value is the number of files in that scene importing that module. Counts
 * rather than booleans because a scene that imports the player in five places
 * and then stops importing it in four has changed something worth seeing.
 */
export const SCENE_SYSTEM_ADOPTION = Object.freeze({
  airstrip: { objectives: 0, dialogue: 0, interaction: 0, player: 0, hud: 0, pause: 0, inventory: 0, blood: 0, staging: 0, notes: "A story table, not a playable set: src/core/airstrip-story.js holds the scene." },
  arcade: { objectives: 0, dialogue: 0, interaction: 0, player: 0, hud: 0, pause: 0, inventory: 0, blood: 0, staging: 0, notes: "The in-world cabinets. It hosts other games; it is not one." },
  beefrun: { objectives: 0, dialogue: 0, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 0, staging: 1 },
  bing: { objectives: 0, dialogue: 1, interaction: 2, player: 2, hud: 2, pause: 2, inventory: 1, blood: 2, staging: 2 },
  'cartel-palace': { objectives: 1, dialogue: 1, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 1, staging: 0 },
  combatlab: { objectives: 0, dialogue: 0, interaction: 0, player: 1, hud: 0, pause: 1, inventory: 0, blood: 0, staging: 0, notes: "A test harness for the combat systems, not a campaign scene." },
  enolasquatch: { objectives: 0, dialogue: 0, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 0, blood: 0, staging: 0 },
  golf: { objectives: 1, dialogue: 0, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 0, staging: 0 },
  graveyard: { objectives: 1, dialogue: 0, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 0, staging: 0 },
  heist: { objectives: 1, dialogue: 1, interaction: 1, player: 1, hud: 0, pause: 1, inventory: 1, blood: 1, staging: 1 },
  initiation: { objectives: 1, dialogue: 2, interaction: 0, player: 0, hud: 0, pause: 1, inventory: 1, blood: 1, staging: 1 },
  mansion: { objectives: 1, dialogue: 1, interaction: 2, player: 2, hud: 0, pause: 2, inventory: 2, blood: 4, staging: 1 },
  motel: { objectives: 0, dialogue: 0, interaction: 0, player: 0, hud: 0, pause: 1, inventory: 1, blood: 0, staging: 1 },
  nowake: { objectives: 0, dialogue: 0, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 0, staging: 1 },
  silver: { objectives: 0, dialogue: 1, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 0, blood: 0, staging: 0 },
  silvercase: { objectives: 0, dialogue: 1, interaction: 1, player: 1, hud: 0, pause: 1, inventory: 1, blood: 0, staging: 1 },
  specialmeeting: { objectives: 0, dialogue: 1, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 0, blood: 0, staging: 1 },
  squatchfather: { objectives: 0, dialogue: 0, interaction: 0, player: 0, hud: 0, pause: 1, inventory: 1, blood: 0, staging: 1 },
  wardrobe: { objectives: 0, dialogue: 0, interaction: 0, player: 0, hud: 0, pause: 0, inventory: 0, blood: 0, staging: 0, notes: "The fitting room tool, reached from the wardrobe page rather than the campaign." },
});

/** Directories under src/ that are shared code rather than scenes. */
export const NON_SCENE_DIRECTORIES = Object.freeze(['core', 'roster', 'world']);
