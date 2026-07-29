// Per-run challenge goals — a Tony-Hawk-style checklist that ticks off live in
// the HUD. Definitions are data; main.js feeds progress in as things happen.

// counts come from the built world so goals scale with whatever actually got
// placed (prop placement can fail when the map gets crowded).
export function buildGoals(counts) {
  const {
    vehicles = 0, campsite = 0, trees = 0, hives = 0, gnomes = 0, smashable = 0,
  } = counts;
  return [
    { id: 'derby', icon: '🚗', label: 'Demolition Derby', hint: 'Wreck every car, RV and ranger truck', target: vehicles, points: 1500 },
    { id: 'campsite', icon: '⛺', label: 'Campsite Sweep', hint: 'Flatten every tent and campfire', target: campsite, points: 1200 },
    { id: 'timber', icon: '🌲', label: 'Timberrr!', hint: 'Fell 40 trees', target: Math.min(40, trees), points: 1000 },
    { id: 'ghost', icon: '😱', label: 'Ghost Town', hint: 'Scare 15 campers off the map', target: 15, points: 1000 },
    { id: 'splatter', icon: '💀', label: 'Splatterhouse', hint: 'Smash 20 campers', target: 20, points: 1200 },
    { id: 'rangers', icon: '🎯', label: 'Ranger Danger', hint: 'Take down 4 park rangers', target: 4, points: 1500 },
    { id: 'chain', icon: '💥', label: 'Chain Reaction', hint: 'Pop 3 propane tanks in one blast', target: 1, points: 1200 },
    { id: 'bees', icon: '🐝', label: 'Beekeeper', hint: 'Burst every beehive', target: hives, points: 800 },
    { id: 'arson', icon: '🔥', label: 'Arsonist', hint: 'Let fire burn down 10 things', target: 10, points: 1000 },
    { id: 'perfecto', icon: '⚡', label: 'Perfecto', hint: 'Reach a x5 combo', target: 1, points: 750 },
    { id: 'gnome', icon: '🧙', label: 'Gnome Lord', hint: 'Smash every garden gnome', target: gnomes, points: 2500 },
    { id: 'boss', icon: '🚨', label: 'Buckley Down', hint: 'Take down the Ranger Captain', target: 1, points: 3000 },
    { id: 'untouchable', icon: '🛡️', label: 'Untouchable', hint: 'Finish without eating a tranq dart', target: 1, points: 1500, endOfRun: true },
    { id: 'total', icon: '🏆', label: 'Total Destruction', hint: 'Wreck 100% of the campground', target: smashable, points: 5000 },
  ].filter((g) => g.target > 0);
}

export class GoalTracker {
  // onComplete(goal) fires once, the moment a goal is finished.
  constructor(defs, onComplete = null) {
    this.goals = defs.map((g) => ({ ...g, progress: 0, done: false, failed: false }));
    this.byId = new Map(this.goals.map((g) => [g.id, g]));
    this.onComplete = onComplete;
    this.version = 0; // bumps on any change so the HUD can re-render lazily
  }

  get(id) {
    return this.byId.get(id);
  }

  get completed() {
    return this.goals.filter((g) => g.done).length;
  }

  get total() {
    return this.goals.length;
  }

  get earnedPoints() {
    return this.goals.reduce((sum, g) => sum + (g.done ? g.points : 0), 0);
  }

  // Progress only ever moves forward, and never past the target.
  set(id, value) {
    const g = this.byId.get(id);
    if (!g || g.done || g.failed) return;
    const next = Math.min(g.target, Math.max(g.progress, value));
    if (next === g.progress) return;
    g.progress = next;
    this.version++;
    if (g.progress >= g.target) {
      g.done = true;
      if (this.onComplete) this.onComplete(g);
    }
  }

  bump(id, n = 1) {
    const g = this.byId.get(id);
    if (g) this.set(id, g.progress + n);
  }

  complete(id) {
    const g = this.byId.get(id);
    if (g) this.set(id, g.target);
  }

  // Permanently blows a goal for this run (Untouchable, once you're darted).
  fail(id) {
    const g = this.byId.get(id);
    if (!g || g.done || g.failed) return;
    g.failed = true;
    this.version++;
  }

  // Goals that can only be judged when the run is over — award the ones that
  // were never failed. Returns the goals that just landed.
  settle() {
    const landed = [];
    for (const g of this.goals) {
      if (g.endOfRun && !g.done && !g.failed) {
        g.done = true;
        g.progress = g.target;
        this.version++;
        landed.push(g);
        if (this.onComplete) this.onComplete(g);
      }
    }
    return landed;
  }
}

function statusText(g) {
  if (g.done) return '✓';
  if (g.failed) return '✗';
  return g.target > 1 ? `${g.progress}/${g.target}` : '○';
}

// Live HUD checklist. Unfinished goals float to the top so the next thing to
// chase is always at eye level.
export function renderGoalList(listEl, tracker) {
  const order = [...tracker.goals].sort((a, b) => {
    const rank = (g) => (g.done ? 2 : g.failed ? 1 : 0);
    return rank(a) - rank(b);
  });
  listEl.innerHTML = '';
  for (const g of order) {
    const li = document.createElement('li');
    li.className = g.done ? 'done' : g.failed ? 'failed' : '';
    li.title = g.hint;
    li.innerHTML = '<span class="gi"></span><span class="gl"></span><span class="gp"></span>';
    li.querySelector('.gi').textContent = g.icon;
    li.querySelector('.gl').textContent = g.label;
    li.querySelector('.gp').textContent = statusText(g);
    listEl.appendChild(li);
  }
}

// End-screen summary: everything earned, then everything missed.
export function renderGoalSummary(listEl, tracker) {
  const order = [...tracker.goals].sort((a, b) => Number(b.done) - Number(a.done));
  listEl.innerHTML = '';
  for (const g of order) {
    const li = document.createElement('li');
    li.className = g.done ? 'done' : 'miss';
    li.innerHTML = '<span class="gi"></span><span class="gl"></span><span class="gv"></span>';
    li.querySelector('.gi').textContent = g.icon;
    li.querySelector('.gl').textContent = g.label;
    li.querySelector('.gv').textContent = g.done
      ? `+${g.points.toLocaleString()}`
      : g.target > 1 ? `${g.progress}/${g.target}` : '—';
    listEl.appendChild(li);
  }
}
