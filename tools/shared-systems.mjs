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
    /* TWO THINGS LIVE IN THAT FILE, and the second is why this column moved
     * off zero in three scenes at once. `Hud` is the apartment's furniture --
     * health, hand, clock, bladder, toasts -- and it cannot be built anywhere
     * that lacks those ids, which is most of the game. `createPromptHud` is
     * the InteractionSystem contract on its own: three methods, elements
     * passed in, no assumptions about the page. Four scenes had written that
     * object by hand and every one of them called it `tinyHud`, which is the
     * tell; they disagreed about markup, about the null hold and about the
     * passive key cap, and each one got a different subset of it right. */
    what: 'The health, hand and clock furniture, and the prompt on its own.',
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
  Object.freeze({
    id: 'swing',
    module: 'src/golf/swing.js',
    /* It is in src/golf/ rather than src/core/ because golf built it and golf
     * is still where it is tuned; the mansion's billiard table asks it for
     * `club: 'cue'` and gets the whole meter. Moving the file is a job for
     * whoever adds the third caller -- what matters now is that there IS no
     * second implementation of a power bar in the game. */
    what: 'The click-stop-click power meter: phases, dead zone, overswing band, accuracy.',
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
  airstrip: { objectives: 0, dialogue: 0, interaction: 0, player: 0, hud: 0, pause: 0, inventory: 0, blood: 0, staging: 0, swing: 0, notes: "A story table, not a playable set: src/core/airstrip-story.js holds the scene." },
  arcade: { objectives: 0, dialogue: 0, interaction: 0, player: 0, hud: 0, pause: 0, inventory: 0, blood: 0, staging: 0, swing: 0, notes: "The in-world cabinets. It hosts other games; it is not one." },
  beefrun: { objectives: 0, dialogue: 0, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 0, staging: 1, swing: 0, notes: "`objectives` is a cockpit line, not a card. FlightHud.setObjective writes one string into the instrument panel and pops it, and the shared panel is a standing-order LIST parked upper-left over a crosshair -- in an aeroplane that is a sticker over the windscreen. `dialogue` is the real debt here and it is the same one enolasquatch carries." },
  bing: { objectives: 1, dialogue: 1, interaction: 2, player: 2, hud: 2, pause: 2, inventory: 1, blood: 2, staging: 3, swing: 0 },
  cabin: { objectives: 1, dialogue: 1, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 0, blood: 0, staging: 0, swing: 0, notes: "The countryside hideout hub, landed 2026-08-24. Wag now speaks through the canonical dialogue pipeline; phone content still comes through core/phone-content.js rather than a scene dialogue tree. `inventory` and `staging` are the debts to watch when the hub grows a loadout or a larger cast." },
  'cartel-palace': { objectives: 1, dialogue: 1, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 1, staging: 0, swing: 0 },
  combatlab: { objectives: 0, dialogue: 0, interaction: 0, player: 1, hud: 0, pause: 1, inventory: 0, blood: 0, staging: 0, swing: 0, notes: "A test harness for the combat systems, not a campaign scene." },
  enolasquatch: { objectives: 0, dialogue: 0, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 0, blood: 0, staging: 0, swing: 0, notes: "Same cockpit as beefrun: MissionController.setObjective hands one string to the flight HUD's instrument line. `staging` is 0 for the reason written up in docs/STAGING-GATE.md -- the crew are at six hundred metres and the nearest collider is on the ground, so the solid checks are vacuous rather than skipped." },
  golf: { objectives: 1, dialogue: 0, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 0, staging: 0, swing: 1 },
  graveyard: { objectives: 1, dialogue: 0, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 0, staging: 0, swing: 0 },
  heist: { objectives: 1, dialogue: 1, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 1, staging: 1, swing: 0 },
  initiation: { objectives: 1, dialogue: 2, interaction: 0, player: 1, hud: 0, pause: 1, inventory: 1, blood: 1, staging: 1, swing: 0, notes: "TWO HONEST ZEROS. `hud` and `interaction` are the scene: initiation.html has no #prompt element and the night has nothing to press E on -- the choice panel is the whole of its input, and a shared prompt with nothing to prompt about would be furniture. `player` was the debt the owner named ('initiation has different movement') until the 2026-08-23 systems pass landed InitiationPlayerAdapter over core/player.js and re-choreographed the ceremony onto it." },
  'luxury-apartment': { objectives: 0, dialogue: 0, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 0, blood: 0, staging: 0, swing: 0, notes: "The unplaced luxury flat, landed 2026-08-24: a hub with no campaign edge into it yet, so there is no objective to put on a card. Movement, prompts, HUD and pause are all the shared ones from the day it landed; `objectives` becomes a debt the moment the story gives it a reason to be entered." },
  mansion: { objectives: 1, dialogue: 2, interaction: 2, player: 2, hud: 2, pause: 2, inventory: 2, blood: 4, staging: 1, swing: 2 },
  motel: { objectives: 0, dialogue: 0, interaction: 0, player: 0, hud: 1, pause: 1, inventory: 1, blood: 0, staging: 1, swing: 0, notes: "`objectives` is a togglable JOURNAL, not a standing order: three headed sections (MAIN, OPTIONAL, WARNING SIGNS n/m) with a struck-through failed state, and the whole thing hides until the player asks for it. That is a different widget from the card the mansion and the Bing share, and stretching the panel to be both would make it worse at each. `interaction` and `player` are this scene's own and are debts; the owner ruled on 2026-08-22 to leave them -- 'it works'." },
  nowake: { objectives: 0, dialogue: 0, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 0, staging: 1, swing: 0, notes: "The objective is a line in the status STRIP along the top -- a <strong> and a <span> reading 'Meet Lou at Gate C / South Harbor 12:45 PM' -- not a card. The shared panel would put a second, differently-shaped objective on the same screen as the first." },
  silver: { objectives: 1, dialogue: 1, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 0, blood: 0, staging: 0, swing: 0 },
  silvercase: { objectives: 1, dialogue: 1, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 1, blood: 0, staging: 1, swing: 0 },
  specialmeeting: { objectives: 1, dialogue: 1, interaction: 1, player: 1, hud: 1, pause: 1, inventory: 0, blood: 0, staging: 1, swing: 0 },
  squatchfather: { objectives: 1, dialogue: 0, interaction: 0, player: 0, hud: 2, pause: 1, inventory: 1, blood: 0, staging: 1, swing: 0 },
  trophyroom: { objectives: 0, dialogue: 0, interaction: 1, player: 1, hud: 0, pause: 1, inventory: 0, blood: 0, staging: 0, swing: 0, notes: "A dev-only review gallery for promised-vs-built campaign trophies, not a campaign scene. Uses the tiny showPrompt/hidePrompt/setHold contract (see src/silvercase/main.js) instead of core/hud.js." },
  wardrobe: { objectives: 0, dialogue: 0, interaction: 0, player: 0, hud: 0, pause: 0, inventory: 0, blood: 0, staging: 0, swing: 0, notes: "The fitting room tool, reached from the wardrobe page rather than the campaign." },
});

/** Directories under src/ that are shared code rather than scenes. */
export const NON_SCENE_DIRECTORIES = Object.freeze(['core', 'roster', 'world']);
