export const GRAVES = Object.freeze({
  babs: Object.freeze({
    name: 'BABS', tier: 'monument',
    line: 'Babs got the good stone, fresh flowers, and a bench nobody puts their feet on.',
  }),
  brawny: Object.freeze({
    name: 'BRAWNY', tier: 'ruined', traitor: true,
    line: 'Brawny sold out the Family. Even the rain looks cleaner than this grave.',
  }),
  whiplash: Object.freeze({
    name: 'WHIPLASH', tier: 'ruined', traitor: true,
    line: 'Whiplash got a crooked marker and exactly the maintenance he earned.',
  }),
  sheep: Object.freeze({
    name: 'SHEEP', tier: 'standard-plus',
    line: 'Sheep got a proper stone. Not grand, not cheap. Family middle management forever.',
  }),
  echo: Object.freeze({
    name: 'ECHO', tier: 'standard-plus',
    line: 'Echo got a decent plot and a very premature date.',
  }),
  colton: Object.freeze({
    name: 'COLTON', tier: 'standard',
    line: 'Colton. His grave smells like Asian feet. That is all I have.',
  }),
  geewiz: Object.freeze({
    name: 'GEEWIZ', tier: 'standard',
    line: 'GeeWiz. Regular stone, regular plot, one spelling nobody ever agreed on.',
  }),
  sauce: Object.freeze({
    name: 'SAUCE', tier: 'reserved', open: true,
    line: 'An open plot with SAUCE already cut into the temporary marker.',
  }),
});

export const GRAVEYARD_ARRIVAL_LINES = Object.freeze([
  Object.freeze({
    who: 'Snow',
    cue: 'vo.graveyard.arrival.snow.1',
    text: 'End of the road. Fresh plot is past GeeWiz. Then the Motel.',
    seconds: 3.8,
  }),
  Object.freeze({
    who: 'Prospect',
    cue: 'vo.graveyard.arrival.prospect.1',
    text: 'You planning to tell me what is at the Motel?',
    seconds: 3.0,
  }),
  Object.freeze({
    who: 'Snow',
    cue: 'vo.graveyard.arrival.snow.2',
    text: 'When we get there.',
    seconds: 2.6,
  }),
]);

export const GRAVEYARD_SNOW_BARKS = Object.freeze({
  car: Object.freeze({
    who: 'Snow',
    cue: 'vo.graveyard.snow.bark.car',
    text: 'Car. Now. Room twelve is not getting cleaner while we stand here.',
    seconds: 3.5,
  }),
  plot: Object.freeze({
    who: 'Snow',
    cue: 'vo.graveyard.snow.bark.plot',
    text: 'Fresh plot is past GeeWiz. Sauce\'s hole stays open.',
    seconds: 3.2,
  }),
});

const TRAITORS = Object.freeze(['brawny', 'whiplash']);

export class GraveyardMission {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.state = 'arrival';
    this.echoHeard = false;
    this.urinatedOn = new Set();
    this.inspected = new Set();
    this.bodyLowered = false;
    this.bodyBuried = false;
    this.objectives = [
      { id: 'bury', text: 'Bury Billy HotDog in a fresh plot', done: false },
      { id: 'memorials', text: 'Look around the Family graveyard', done: false, optional: true },
    ];
  }

  get readyToLeave() { return this.bodyBuried; }

  restoreProgress(saved = {}) {
    this.echoHeard = saved.echoHeard === true;
    this.urinatedOn = new Set(
      Array.isArray(saved.urinatedOn)
        ? saved.urinatedOn.filter((id) => TRAITORS.includes(id))
        : [],
    );
    return this;
  }

  line(text, cue = null, who = null) {
    this.hooks.onLine?.(text, { cue, who });
  }

  inspectGrave(id) {
    const grave = GRAVES[id];
    if (!grave) return null;
    this.inspected.add(id);
    this.line(grave.line, `vo.graveyard.inspect.${id}`, 'Prospect');
    if (this.inspected.size === Object.keys(GRAVES).length) {
      this.objectives.find((objective) => objective.id === 'memorials').done = true;
      this.hooks.onObjective?.(this.objectives);
    }
    if (id === 'echo' && !this.echoHeard) {
      this.echoHeard = true;
      this.hooks.onRumble?.();
      this.line('Hey, guys? I am still alive down here. Help me out.', 'vo.graveyard.echo.alive', 'Echo');
      this.line('Poor Echo. Wind sounds just like him tonight.', 'vo.graveyard.prospect.wind', 'Prospect');
      this.line('It always does. Keep walking.', 'vo.graveyard.snow.wind', 'Snow');
      return { kind: 'echo', ...grave };
    }
    return { kind: grave.open ? 'reserved' : 'memorial', ...grave };
  }

  suggestSaucePlot() {
    this.line('We already have a hole. Put HotDog in Sauce\'s.', 'vo.graveyard.prospect.sauce', 'Prospect');
    this.line('No. I have a feeling we are going to need that one soon.', 'vo.graveyard.snow.sauce', 'Snow');
    return false;
  }

  urinateOn(id) {
    if (!TRAITORS.includes(id) || this.urinatedOn.has(id)) return false;
    this.urinatedOn.add(id);
    this.hooks.onUrination?.(id);
    this.line(
      id === 'brawny'
        ? 'Brawny finally gets fresh flowers. Different liquid, same sentiment.'
        : 'Whiplash receives the only toast anybody brought him.',
      `vo.graveyard.prospect.pee.${id}`,
      'Prospect',
    );
    return true;
  }

  lowerBody() {
    if (this.state !== 'arrival') return false;
    this.state = 'lowered';
    this.bodyLowered = true;
    this.line('Easy. Feet first. He made enough noise above ground.', 'vo.graveyard.snow.lower', 'Snow');
    this.hooks.onState?.(this.state, this);
    return true;
  }

  finishBurial() {
    if (this.state !== 'lowered') return false;
    this.state = 'buried';
    this.bodyBuried = true;
    this.objectives.find((objective) => objective.id === 'bury').done = true;
    this.hooks.onObjective?.(this.objectives);
    this.line('That closes the HotDog incident. The Motel does not close this easy.', 'vo.graveyard.snow.done', 'Snow');
    this.hooks.onState?.(this.state, this);
    return true;
  }

  finish() {
    if (!this.readyToLeave) return false;
    this.state = 'done';
    this.hooks.onState?.(this.state, this);
    return 'motel';
  }
}
