import assert from 'node:assert/strict';
import test from 'node:test';

import * as settings from '../src/core/settings.js';

/* One shared store, so every test starts from a known storage and a cleared
 * cache. `reload()` drops the lazy cache; the storage is swapped underneath. */
class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  getItem(key) { return this.values.get(String(key)) ?? null; }

  setItem(key, value) { this.values.set(String(key), String(value)); }

  removeItem(key) { this.values.delete(String(key)); }
}

function withStorage(initial, fn) {
  const previous = globalThis.localStorage;
  const storage = new MemoryStorage(initial);
  globalThis.localStorage = storage;
  settings.reload();
  try {
    return fn(storage);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
    settings.reload();
  }
}

/** A body stub with a real-enough classList, and a head that takes a style. */
function withBody(fn) {
  const previous = globalThis.document;
  const classes = new Set();
  const head = { children: [], appendChild(node) { this.children.push(node); } };
  globalThis.document = {
    body: {
      classList: {
        toggle: (name, force) => {
          if (force) classes.add(name); else classes.delete(name);
          return classes.has(name);
        },
        contains: (name) => classes.has(name),
      },
    },
    head,
    createElement: () => ({ id: '', textContent: '' }),
    getElementById: (id) => head.children.find((node) => node.id === id) ?? null,
  };
  try {
    return fn(classes, head);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

test('defaults with nothing stored, and the Silver Room encoding on the way back out', () => {
  withStorage({}, (storage) => {
    assert.equal(settings.get('subtitles'), true, 'subtitles are on unless turned off');
    assert.equal(settings.get('bigSubtitles'), false);
    assert.equal(settings.get('reduceShake'), false);
    assert.equal(settings.get('assist'), false);
    assert.equal(settings.get('volume'), 1);
    assert.equal(settings.get('sensitivity'), 1);
    assert.deepEqual(settings.get('keys'), {});
    assert.equal(storage.values.size, 0, 'reading writes nothing');

    settings.set('bigSubtitles', true);
    settings.set('subtitles', false);
    /* The keys and values the Silver Room wrote for two months, verbatim, so
     * a player's saved switches carry over. */
    assert.equal(storage.getItem('squatch.bigsubs'), '1');
    assert.equal(storage.getItem('squatch.subs'), '0');
  });
});

test('persisted values round-trip through a fresh load, including a saved Silver preference', () => {
  withStorage({
    'squatch.subs': '0',
    'squatch.reduceShake': '1',
    'squatch.volume': '0.35',
    'squatch.sensitivity': '1.5',
    'squatch.keys': JSON.stringify({ forward: 'ArrowUp', jump: 'Space', bogus: 'KeyZ' }),
  }, () => {
    assert.equal(settings.get('subtitles'), false);
    assert.equal(settings.get('reduceShake'), true);
    assert.equal(settings.get('assist'), false);
    assert.equal(settings.get('volume'), 0.35);
    assert.equal(settings.get('sensitivity'), 1.5);
    assert.deepEqual(settings.get('keys'), { forward: 'ArrowUp' },
      'a binding equal to its default and an unknown action are both dropped');
    assert.deepEqual(settings.getKeymap(), { ...settings.DEFAULT_KEYS, forward: 'ArrowUp' });
  });
  withStorage({ 'squatch.keys': 'not json' }, () => {
    assert.deepEqual(settings.get('keys'), {}, 'garbage in storage is the defaults, not a throw');
  });
});

/* The keymap default used to be ONE shared `{}` that readStored handed back
 * as the live cached value, so the schema default and the store aliased each
 * other: a caller that mutated what get('keys') returned rewrote the default
 * for the rest of the process, reload() included. */
test('the empty keymap a caller is handed is its own object, not the schema default', () => {
  withStorage({}, () => {
    const keys = settings.get('keys');
    assert.deepEqual(keys, {});
    keys.forward = 'KeyJ';
    assert.deepEqual(settings.reload().keys, {}, 'a reload re-reads an unpolluted default');
  });
  withStorage({}, () => {
    assert.deepEqual(settings.get('keys'), {}, 'and so does the next page');
    assert.deepEqual(settings.getKeymap(), { ...settings.DEFAULT_KEYS });
  });
});

test('volume and sensitivity are clamped and coerced; subscribers hear the stored value', () => {
  withStorage({}, (storage) => {
    const heard = [];
    const off = settings.subscribe((name, value) => heard.push([name, value]));
    assert.equal(settings.set('volume', 1.7), 1);
    assert.equal(settings.set('volume', -2), 0);
    assert.equal(settings.set('volume', '0.25'), 0.25);
    assert.equal(settings.set('volume', 'loud'), 1, 'nonsense falls back to the default');
    assert.equal(settings.set('sensitivity', 0), 0.2, 'sensitivity has a floor so the mouse still works');
    assert.equal(settings.set('sensitivity', 99), 3);
    assert.equal(storage.getItem('squatch.volume'), '1');
    assert.deepEqual(heard, [
      ['volume', 1], ['volume', 0], ['volume', 0.25], ['volume', 1],
      ['sensitivity', 0.2], ['sensitivity', 3],
    ]);
    off();
    settings.set('volume', 0.5);
    assert.equal(heard.length, 6, 'unsubscribed');
    assert.throws(() => settings.set('nope', 1), /Unknown setting/);
  });
});

test('applyBody puts nosubs/bigsubs on the body, installs the shared style once, and follows set()', () => {
  withStorage({}, () => {
    withBody((classes, head) => {
      assert.equal(settings.applyBody(), true);
      assert.deepEqual([...classes], []);
      assert.equal(head.children.length, 1, 'one shared subtitle stylesheet');
      assert.match(head.children[0].textContent, /body\.nosubs #subtitle/);
      assert.match(head.children[0].textContent, /body\.bigsubs #dialogue \.line \{ font-size: 21px; \}/,
        'the Silver Room rules moved here unchanged');

      settings.set('subtitles', false);
      settings.set('bigSubtitles', true);
      assert.deepEqual([...classes].sort(), ['bigsubs', 'nosubs'], 'set() applies without a second call');
      settings.set('subtitles', true);
      assert.deepEqual([...classes], ['bigsubs']);
      settings.applyBody();
      assert.equal(head.children.length, 1, 'the stylesheet is not installed twice');
    });
  });
  /* No DOM at all (the Node test runner's stub has no body): a quiet no-op. */
  withStorage({}, () => {
    assert.equal(settings.applyBody(), false);
  });
});

test('the live view reads and writes through, the way the Silver Room debug surface expects', () => {
  withStorage({}, (storage) => {
    assert.equal(settings.live.assist, false);
    settings.live.assist = true;
    assert.equal(settings.get('assist'), true);
    assert.equal(storage.getItem('squatch.assist'), '1');
  });
});

test('shake and sensitivity helpers read the store; a bound sensitivity is live', () => {
  withStorage({}, () => {
    assert.equal(settings.shakeScale(), 1);
    settings.set('reduceShake', true);
    assert.equal(settings.shakeScale(), settings.REDUCED_SHAKE);

    const controller = settings.bindLookSensitivity({}, 0.0022);
    assert.equal(controller.sensitivity, 0.0022);
    settings.set('sensitivity', 2);
    assert.equal(controller.sensitivity, 0.0044, 'the slider takes effect on the next read');
    controller.sensitivity = 0.001;
    assert.equal(controller.sensitivity, 0.002, 'a scene write replaces the base, not the multiplier');
    assert.equal(settings.lookSensitivity(0.0016), 0.0032);
  });
});

test('bindAudioVolume drives an engine now and on every change', () => {
  withStorage({ 'squatch.volume': '0.4' }, () => {
    const seen = [];
    const engine = { setUserVolume: (v) => seen.push(v) };
    const off = settings.bindAudioVolume(engine);
    assert.deepEqual(seen, [0.4]);
    settings.set('volume', 0.9);
    settings.set('assist', true);
    assert.deepEqual(seen, [0.4, 0.9], 'only volume reaches the engine');
    off();
    settings.set('volume', 0.1);
    assert.deepEqual(seen, [0.4, 0.9]);
    assert.equal(typeof settings.bindAudioVolume(null), 'function', 'no engine is a no-op unsubscribe');
  });
});

test('keymap: bind swaps a taken key, translate routes physical codes to what the Player reads', () => {
  withStorage({}, (storage) => {
    assert.equal(settings.translateKey('KeyW'), 'KeyW', 'nothing bound: pass-through');
    assert.equal(settings.translateKey('KeyE'), 'KeyE');

    settings.bindKey('forward', 'ArrowUp');
    assert.equal(settings.translateKey('ArrowUp'), 'KeyW', 'the new key arrives as the default the Player reads');
    assert.match(settings.translateKey('KeyW'), /^Unbound:/, 'the old key stops moving him');
    assert.equal(settings.translateKey('KeyS'), 'KeyS', 'other defaults untouched');
    assert.equal(JSON.parse(storage.getItem('squatch.keys')).forward, 'ArrowUp');

    settings.bindKey('back', 'ArrowUp');
    assert.deepEqual(settings.getKeymap(), {
      ...settings.DEFAULT_KEYS, back: 'ArrowUp', forward: 'KeyS',
    }, 'binding a taken key swaps rather than leaving forward unreachable');

    settings.bindKey('sprint', 'KeyQ');
    assert.equal(settings.translateKey('KeyQ'), 'ShiftLeft');
    assert.match(settings.translateKey('ShiftRight'), /^Unbound:/, 'the alias goes with the default');

    assert.throws(() => settings.bindKey('fly', 'KeyF'), /Unknown key action/);
    settings.resetKeys();
    assert.deepEqual(settings.getKeymap(), { ...settings.DEFAULT_KEYS });
    assert.equal(settings.translateKey('ArrowUp'), 'ArrowUp');
    assert.equal(settings.keyLabel('ShiftLeft'), 'Left Shift');
    assert.equal(settings.keyLabel('KeyW'), 'W');
    assert.equal(settings.keyLabel('ArrowUp'), 'Arrow Up');
    assert.equal(settings.keyLabel('Numpad5'), 'Num 5');
  });
});
