/**
 * Conversation, without taking the game off the player.
 *
 * The rule for this whole level: you never lose control because somebody
 * important started talking. Lou can say his piece while you walk round the
 * office, sit down, open the drawer, look at the monitor or leave. So a
 * conversation here is a node, a line on screen, and up to four replies bound
 * to the number keys -- nothing is modal, nothing pauses, and walking out of
 * the room ends it the way walking out of a room does.
 */

const RANGE = 6.5;        // walk further than this and the conversation lapses

export class Dialogue {
  /**
   * @param {object} ui { line, name, options } DOM nodes
   * @param {object} hooks { onLine, onChoice, onEnd, say }
   */
  constructor(ui, hooks = {}) {
    this.ui = ui;
    this.hooks = hooks;
    this.tree = null;
    this.node = null;
    this.speaker = null;
    this.options = [];
    this.timer = 0;
    this.active = false;
    this.history = new Set();
  }

  /**
   * @param {object} tree  id -> node
   * @param {string} at    starting node id
   * @param {object} speaker the Npc talking, for range and gaze
   */
  start(tree, at, speaker = null) {
    this.tree = tree;
    this.speaker = speaker;
    this.active = true;
    this.go(at);
  }

  go(id) {
    if (!id || !this.tree?.[id]) return this.end();
    const node = this.tree[id];
    this.node = node;
    this.history.add(id);
    node.enter?.();

    const text = typeof node.line === 'function' ? node.line() : node.line;
    const who = node.who ?? this.speaker?.name ?? '';
    if (text) {
      this.ui.name.textContent = who.toUpperCase();
      this.ui.line.innerHTML = text;
      this.ui.root.classList.remove('hidden');
      this.speaker?.say?.(Math.max(1.6, text.length / 22));
      this.hooks.onLine?.(text, who, node);
    }

    // Options may be a function so they can depend on what has happened
    const opts = (typeof node.options === 'function' ? node.options() : node.options) || [];
    this.options = opts.filter((o) => !o.when || o.when());
    this._paintOptions();

    // A node with no options runs on its own after a beat
    this.timer = node.hold ?? (text ? Math.max(2.2, text.length / 18) : 0.6);
    return node;
  }

  _paintOptions() {
    if (!this.options.length) {
      this.ui.options.replaceChildren();
      this.ui.options.classList.add('hidden');
      return;
    }
    this.ui.options.classList.remove('hidden');
    this.ui.options.replaceChildren(...this.options.map((o, i) => {
      const el = document.createElement('div');
      el.className = 'opt';
      el.innerHTML = `<kbd>${i + 1}</kbd><span class="tone">${o.tone ?? ''}</span><span class="say">${o.text}</span>`;
      return el;
    }));
  }

  /** Number keys 1..4 while a conversation is up. */
  choose(index) {
    if (!this.active || !this.options.length) return false;
    const opt = this.options[index];
    if (!opt) return false;
    this.ui.options.classList.add('hidden');
    this.ui.name.textContent = 'PROSPECT';
    this.ui.line.innerHTML = opt.text;
    this.hooks.onChoice?.(opt, index);
    this.options = [];
    const nextId = typeof opt.next === 'function' ? opt.next() : opt.next;
    this.timer = opt.hold ?? Math.max(1.4, opt.text.length / 22);
    /* Boxed, because `next: null` is a real answer -- it means "that ends it"
     * -- and a bare null here is indistinguishable from "nothing pending",
     * which left those replies on screen until the player walked off. */
    this._pending = { id: nextId ?? null };
    opt.effect?.();
    return true;
  }

  end(reason = 'done') {
    if (!this.active) return;
    this.active = false;
    this.node = null;
    this.options = [];
    this._pending = null;
    this.ui.root.classList.add('hidden');
    this.ui.options.classList.add('hidden');
    this.hooks.onEnd?.(reason);
  }

  update(dt, playerPos) {
    if (!this.active) return;

    // Walk away and it stops being a conversation
    if (this.speaker && playerPos) {
      const d = Math.hypot(
        playerPos.x - this.speaker.group.position.x,
        playerPos.z - this.speaker.group.position.z,
      );
      if (d > RANGE) {
        this.end('walked-away');
        return;
      }
    }

    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer > 0) return;
      if (this._pending) {
        const next = this._pending.id;
        this._pending = null;
        if (next) this.go(next);
        else this.end();
        return;
      }
      // Waiting on the player: leave the line up, keep the options showing
      if (!this.options.length && this.node && !this.node.options) {
        const auto = typeof this.node.next === 'function' ? this.node.next() : this.node.next;
        if (auto) this.go(auto);
        else this.end();
      }
    }
  }
}
