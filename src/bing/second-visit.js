const STATES = [
  'lot',
  'outside',
  'club',
  'hallway',
  'office',
  'briefed',
  'leaving',
  'lot-return',
  'done',
];

const NUDGE = [
  { at: 120, text: 'LOU: Back office. Again.' },
  { at: 300, text: 'LOU: The motel is not getting closer.' },
];

/**
 * A second mission definition for the existing Bada Bing location. Its public
 * surface matches the first visit where the shared scene needs it, while the
 * required story beat is an assignment rather than another package pickup.
 */
export class SecondVisitMission {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.state = 'lot';
    this.waited = 0;
    this.inside = false;
    this.objectives = [];
    this.notes = [];
    this._nudged = 0;
    this.hands = 0;
    this.spins = 0;
    this.drinks = 0;
    this.associateSent = false;
    this.assignment = null;
    this.flags = {
      bouncerCleared: false,
      heardAboutCar: false,
      sawCar: false,
      toldLou: false,
      gotPackage: false,
      inspected: 0,
      jackpot: false,
      leftByRear: false,
      alarmTripped: false,
      secretPanel: false,
      plateRead: false,
    };
    this.addObjective('lou', 'Meet Lou in the back office');
  }

  get readyToLeave() {
    return this.assignment !== null;
  }

  setState(next) {
    if (this.state === next) return;
    const order = STATES.indexOf(next);
    if (order < STATES.indexOf(this.state)) return;
    this.state = next;
    this.hooks.onState?.(next, this);
  }

  addObjective(id, text) {
    if (this.objectives.some((objective) => objective.id === id)) return;
    this.objectives.push({ id, text, done: false });
    this.hooks.onObjective?.(this.objectives);
  }

  complete(id) {
    const objective = this.objectives.find((entry) => entry.id === id);
    if (!objective || objective.done) return;
    objective.done = true;
    this.hooks.onObjective?.(this.objectives);
  }

  note(text) {
    if (this.notes.includes(text)) return;
    this.notes.push(text);
    this.hooks.onNote?.(text);
  }

  enteredClub() {
    this.inside = true;
    this.setState('club');
  }

  reachedHallway() {
    this.setState('hallway');
    this.complete('lou');
    this.addObjective('office', 'Go into Lou’s office');
  }

  enteredOffice() {
    this.setState('office');
    this.complete('office');
    this.addObjective('speak', 'Get the next assignment from Lou');
  }

  assign(assignment) {
    if (typeof assignment !== 'string' || !assignment.trim()) return false;
    if (this.assignment !== null) return this.assignment === assignment;
    this.assignment = assignment;
    this.complete('speak');
    this.setState('briefed');
    this.addObjective('leave', 'Drive directly to the Jerky Motel');
    return true;
  }

  leftOffice() {
    if (this.state === 'briefed') this.setState('leaving');
  }

  backInLot() {
    if (this.state === 'leaving') this.setState('lot-return');
  }

  finish() {
    if (!this.readyToLeave) return false;
    this.complete('leave');
    this.setState('done');
    return 'motel';
  }

  ending() {
    return 'motel';
  }

  handPlayed() {
    this.hands++;
    if (this.hands === 3) this.hooks.onMessage?.('LOU: You came back here to play cards?');
    if (this.hands === 6) this.sendAssociate();
  }

  spun() {
    this.spins++;
  }

  drank() {
    this.drinks++;
  }

  jackpot() {
    this.flags.jackpot = true;
    this.hooks.onMessage?.('LOU: I heard that. Back office.');
  }

  sendAssociate() {
    if (this.associateSent || this.readyToLeave) return;
    this.associateSent = true;
    this.hooks.onAssociate?.();
  }

  update(dt) {
    if (!this.inside || this.readyToLeave) return;
    this.waited += dt;
    while (this._nudged < NUDGE.length && this.waited >= NUDGE[this._nudged].at) {
      const nudge = NUDGE[this._nudged++];
      this.hooks.onMessage?.(nudge.text);
    }
  }
}

export function buildSecondVisitLouScript({ mission }) {
  return {
    enter: {
      who: 'Lou',
      line: '<em>(Lou closes the ledger.)</em> Back already. Shut the door.',
      hold: 2.8,
      next: 'greet',
    },
    greet: {
      who: 'Lou',
      line: 'The airstrip went well enough that Booski stopped shouting. That counts as well.',
      options: [
        { tone: 'Business', text: 'What is the next job?', next: 'assignment' },
        { tone: 'Cautious', text: 'You said to come straight here.', next: 'straight' },
        { tone: 'Dry', text: 'I missed the carpet.', next: 'carpet' },
      ],
    },
    straight: {
      who: 'Lou',
      line: 'And for once you listened. Hold onto the feeling.',
      next: 'assignment',
    },
    carpet: {
      who: 'Lou',
      line: 'The carpet did not miss you. Sit down.',
      next: 'assignment',
    },
    assignment: {
      who: 'Lou',
      line: 'Jerky Motel. Room twelve. Manny is waiting in the car with the payment. '
        + 'You inspect the Reserve before anybody opens the money.',
      options: [
        { tone: 'Confirm', text: 'Room twelve. Product first, money second.', next: 'confirm' },
        { tone: 'Ask', text: 'What am I watching for?', next: 'warning' },
        { tone: 'Object', text: 'I just got back.', next: 'rest' },
      ],
    },
    warning: {
      who: 'Lou',
      line: 'Everybody in the room, the exits, and whether the meat is what they say it is. '
        + 'If one thing feels wrong, assume three things are.',
      next: 'confirm',
    },
    rest: {
      who: 'Lou',
      line: 'You can rest in Manny’s passenger seat. He will find that very moving.',
      next: 'confirm',
    },
    confirm: {
      who: 'Lou',
      line: 'Good. Leave from here and go directly there. Do not stop at the apartment.',
      enter: () => mission.assign('reserve_pickup'),
      hold: 3.2,
    },
    parting: {
      who: 'Lou',
      line: 'Prospect. Product first. Money second.',
      hold: 2.6,
    },
    liquor: {
      who: 'Lou',
      line: 'You were here once tonight. You know the cabinet is still not yours.',
      hold: 2.8,
    },
    photos: {
      who: 'Lou',
      line: 'The motel will still be there after you finish reviewing my walls.',
      hold: 2.8,
    },
    monitor: {
      who: 'Lou',
      line: 'Nothing in that lot matters more than room twelve right now.',
      hold: 2.8,
    },
    candy: {
      who: 'Lou',
      line: 'Take one for the drive. Do not tell me whether you ate it.',
      hold: 2.6,
    },
    sat: {
      who: 'Lou',
      line: 'Comfortable? Good. Now listen.',
      hold: 2.2,
    },
  };
}
