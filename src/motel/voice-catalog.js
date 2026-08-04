import {
  ENDING,
  FIGHT_BARKS,
  NODES,
  PROSPECT_BARKS,
  SELLER_BARKS,
  SNOW_BARKS,
  SNOW_FIGHT_BARKS,
} from './dialogue.js';
import { CAST } from './actors.js';
import { INSPECTIONS } from './jerky.js';
import { motelSpokenWords, motelVoiceCue, motelVoiceProfile } from './voice.js';

/* Lines authored directly on interactions and story beats in main.js. The
 * large dialogue trees, random barks, inspections, and ending base exchange
 * are pulled from their source modules below rather than copied here. */
export const MOTEL_STORY_LINES = Object.freeze([
  ['Prospect', 'The coupon expired in March. So did my patience.'],
  ['Prospect', 'Compact revolver. Six in the wheel. For emergencies and disrespect.'],
  /* The Silverback Commander: Snow hands it over in the car, it rides
   * concealed through the whole transaction, and Rico only finds out it exists
   * if Tony chooses to open the room with it. */
  ['Snow', 'Under the coat. Seven in it. Do not let them see the crest and do not make me explain a Family gun to a night clerk.'],
  ['Prospect', 'It is under my coat. It stays under my coat.'],
  ['Prospect', 'Hands. Both of them. On the case.'],
  ['Rico', 'Whoa — WHOA—'],
  ['Prospect', 'Third man. Of course there is a third man.'],
  ['Snow', 'Crowbar. And the thing we never mention.'],
  ['Prospect', 'Reserve wrapper. Chewed open, not cut. Somebody in this motel is eating the inventory.'],
  ['Prospect', 'He is watching the road, not the lot. Nobody watches the road unless somebody is coming.'],
  ['Prospect', 'Pointed at nothing. Whoever aimed it did not want room twelve on tape.'],
  ['Prospect', 'Running engine. Warm seat. Nobody in it. That is a car waiting to leave in a hurry.'],
  ['Prospect', 'That is not sauce.'],
  ['Prospect', 'Vacuum packets. Opened out here, refilled out here. Somebody repacked the shipment in a parking lot.'],
  ['Prospect', 'Second floor. He looked away a half second late. That is a man with a job.'],
  ['Prospect', 'The bathroom window opened an inch. Somebody in there wanted air, or a look at the lot.'],
  ['Rico', 'See? Civilised.'],
  ['Prospect', 'I inspect standing.'],
  ['Prospect', 'Eight packages. Numbered labels. Seals all intact.'],
  ['Prospect', 'Eight packages. Numbered labels. Two of these seals have been opened and re-pressed.'],
  ['Rico', 'There it is. Now we are all friends with a table between us.'],
  /* The transaction, said out loud. Room twelve names what it wants at every
   * step instead of leaving it to the HUD. */
  ['Rico', 'Satisfied? The case is right there. Eight of them. Count it.'],
  ['Rico', 'Now the other half. On the table, where I can see it.'],
  ['Rico', 'Meat first. Money second. That is how this works.'],
  ['Chino', 'He is buying it blind. Rico. He is buying it blind.'],
  ['Prospect', 'Eight in their case. One on the table. Neither of them is mine yet.'],
  ['Prospect', 'Their case is on the far bed now. That is not where a deal happens.'],
  ['Prospect', 'There is a man breathing in your bathroom, Rico.'],
  ['Prospect', 'Motel lamp. Heavier than it looks.'],
  ['Prospect', 'Wear it.'],
  ['Prospect', 'Premium stash. Black wrap, wax seal, real numbers. He was never going to sell me this.'],
  ['Prospect', 'Room eleven. The real cure, stacked to the ceiling. They were selling me the wrapping.'],
  ['Prospect', 'Four of them in the lot. Two by the stairs, one at the pool, one at my car.'],
  ['Prospect', 'The railing was rusted. That is on the motel.'],
  ['Prospect', 'You saw a raccoon. A big one. In a shirt.'],
  ['Snow', 'Right here. Facing the exit.'],
  ['Chino', 'Door stays shut. Air conditioning.'],
  ['Rico', 'Come in before the neighbours smell it.'],
  ['Chino', 'Rico. He is asking who handled it.'],
  ['Rico', 'I told you.'],
  ['Rico', 'Bring out the cutting board.'],
  ['Prospect', 'I know. I heard you breathing an hour ago.'],
  ['Snow', 'Crowbar. Catch it.'],
  ['Prospect', 'Do not put hands on a Squatchtana.'],
  ['Prospect', 'Seventy-two hours of smoke, right in the eyes.'],
  ['Prospect', 'Wasted good seasoning.'],
  ['Prospect', 'Nobody near the television.'],
  ['Prospect', 'Nobody sells this to anybody now.'],
  ['Chino', 'Then nobody eats!'],
  ['Prospect', 'Now. Where is my meat.'],
  ['Rico', 'Nothing personal. Everything financial.'],
  ['Prospect', 'Hold the case. I am driving.'],
  ['Snow', 'Seatbelt. Or do not.'],
  ['Snow', 'Checking quality.'],
  ['Prospect', 'Stop eating the shipment!'],
  ['Prospect', 'Stay down.'],
  ['Snow', 'That was my door.'],
  ['Chino', 'Nobody gets it!'],
  ['Rico', 'Not worth it, not worth it!'],
  ['Snow', 'Blue lights. We leave now.'],
  ['Snow', 'I am fine. Not my blood.'],
  ['Prospect', 'Motel bathtubs are not built for this species.'],
  ['Prospect', 'This is gas-station product.'],
  ['Snow', 'We paid forty thousand dollars for gas-station product.'],
  ['Prospect', 'It survived the way a rumour survives.'],
  ['Snow', 'I grabbed a case. It is full of smoked turkey. It is warm.'],
  ['Snow', 'Good. Best deal we ever made was the one we did not.'],
]);

/** Every unique, character-spoken line the Motel can deliver. */
export function allMotelVoiceLines() {
  const found = new Map();
  const add = (speaker, displayText, context) => {
    const text = motelSpokenWords(displayText);
    const cue = motelVoiceCue(speaker, text);
    if (!cue) return;
    const line = { cue, speaker, voice: motelVoiceProfile(speaker), text, context };
    const prior = found.get(cue);
    if (prior && (prior.text !== text || prior.voice !== line.voice)) {
      throw new Error(`Motel voice cue collision at ${cue}`);
    }
    if (!prior) found.set(cue, line);
  };

  for (const [nodeId, node] of Object.entries(NODES)) {
    add(node.speaker, node.line, `${nodeId}: prompt`);
    for (const extra of ['prospect', 'prospect2', 'chino']) {
      if (node[extra]) add(node[extra][0], node[extra][1], `${nodeId}: ${extra}`);
    }
    for (const [style, option] of Object.entries(node.options || {})) {
      add('Prospect', option.text, `${nodeId}: ${style} choice`);
      if (option.reply) add(option.reply[0], option.reply[1], `${nodeId}: ${style} reply`);
    }
  }

  for (const [speaker, text] of SELLER_BARKS) add(speaker, text, 'seller bark');
  for (const text of PROSPECT_BARKS) add('Prospect', text, 'Prospect bark');
  for (const text of SNOW_BARKS) add('Snow', text, 'Snow bark');
  for (const [speaker, text] of FIGHT_BARKS) add(speaker, text, 'fight bark');
  for (const text of SNOW_FIGHT_BARKS) add('Snow', text, 'Snow fight bark');
  for (const [speaker, text] of ENDING) add(speaker, text, 'ending');

  for (const inspection of INSPECTIONS) {
    for (const result of [inspection.real, inspection.fake]) {
      add('Prospect', result.prospect, `inspection: ${inspection.id}`);
    }
  }

  for (const line of MOTEL_STORY_LINES) add(line[0], line[1], 'story beat');
  for (const actor of Object.values(CAST)) {
    if (actor.role === 'seller') add(actor.name, 'Hold him still!', 'grapple bark');
  }

  return [...found.values()].sort((a, b) => a.cue.localeCompare(b.cue));
}

export function motelVoiceCueSet() {
  return new Set(allMotelVoiceLines().map((line) => line.cue));
}
