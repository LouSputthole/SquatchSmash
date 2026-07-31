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
/* And a tighter one for the replies. Six and a half metres is most of the
 * dance floor: a player who turns and walks off is out of the conversation
 * long before the machine notices, and the numbered options sat there on the
 * bottom of his screen the whole way across the room. The replies come down
 * the moment he is out of arm's reach; the line stays up a little longer,
 * because a man calling after you is a real thing that happens in this club.
 * Nothing is lost either way -- end() bookmarks the node, so walking back
 * picks the thread up where it lapsed. */
const REPLY_RANGE = 3.6;

export class Dialogue {
  /**
   * @param {object} ui { line, name, options } DOM nodes
   * @param {object} hooks { onLine, onChoice, onEnd, onActive, cueSeconds }
   */
  constructor(ui, hooks = {}) {
    this.ui = ui;
    this.hooks = hooks;
    this.tree = null;
    this.node = null;
    this.nodeId = null;
    this.speaker = null;
    this.options = [];
    this.timer = 0;
    this.active = false;
    this.history = new Set();
    /* Where each tree lapsed, keyed by the tree itself. Walking off
     * mid-sentence used to mean the whole conversation started over next
     * time; now it bookmarks the node instead, and only a thread that
     * actually FINISHED replays from the top. */
    this._bookmarks = new WeakMap();
    this._resumable = false;
    this._inReplyRange = true;
  }

  /**
   * How long a line holds the floor.
   *
   * The old answer was "however long the text is", which is fine for a
   * subtitle and wrong for a recording: a reply whose hold came out shorter
   * than its own mp3 was cut off mid-word by the next line's solo stop. Every
   * one of Tony's authored replies was clipped that way and two of them --
   * the ones with the longest takes -- barely made a sound. So a line never
   * gets less time than its own recording needs, and an authored `hold` is a
   * floor rather than a ceiling.
   */
  _cueHold(owner, base) {
    const name = typeof owner?.cue === 'function' ? owner.cue() : owner?.cue;
    const secs = name ? (this.hooks.cueSeconds?.(name) || 0) : 0;
    return secs > 0 ? Math.max(base, secs + 0.45) : base;
  }

  /**
   * @param {object} tree  id -> node
   * @param {string} at    starting node id
   * @param {object} speaker the Npc talking, for range and gaze
   * @param {object} opts  { resume } -- pick the conversation back up at the
   *   node it lapsed on rather than restarting; only replay from `at` once
   *   the thread has completed. One-shot interjections (a door line, a
   *   package line) start without it and never disturb a saved thread.
   */
  start(tree, at, speaker = null, { resume = false } = {}) {
    this.tree = tree;
    this.speaker = speaker;
    this.active = true;
    this._resumable = resume;
    this._inReplyRange = true;
    this.hooks.onActive?.(true);
    const bookmark = resume ? this._bookmarks.get(tree) : null;
    this.go(bookmark && tree[bookmark] ? bookmark : at);
  }

  go(id) {
    if (!id || !this.tree?.[id]) return this.end();
    const node = this.tree[id];
    this.node = node;
    this.nodeId = id;
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
    this.timer = this._cueHold(node, node.hold ?? (text ? Math.max(2.2, text.length / 18) : 0.6));
    return node;
  }

  _paintOptions() {
    if (!this.options.length || !this._inReplyRange) {
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
    if (!this.active || !this.options.length || !this._inReplyRange) return false;
    const opt = this.options[index];
    if (!opt) return false;
    this.ui.options.classList.add('hidden');
    this.ui.name.textContent = 'PROSPECT';
    this.ui.line.innerHTML = opt.text;
    this.hooks.onChoice?.(opt, index);
    this.options = [];
    const nextId = typeof opt.next === 'function' ? opt.next() : opt.next;
    this.timer = this._cueHold(opt, opt.hold ?? Math.max(1.4, opt.text.length / 22));
    /* Boxed, because `next: null` is a real answer -- it means "that ends it"
     * -- and a bare null here is indistinguishable from "nothing pending",
     * which left those replies on screen until the player walked off. */
    this._pending = { id: nextId ?? null };
    opt.effect?.();
    return true;
  }

  end(reason = 'done') {
    if (!this.active) return;
    if (this.tree) {
      /* Lapsing (walked away, interrupted) bookmarks the node for next time.
       * Finishing a resumable thread clears its bookmark so a completed
       * conversation replays; a finishing interjection leaves the saved
       * thread alone. */
      if (reason !== 'done' && this.nodeId) this._bookmarks.set(this.tree, this.nodeId);
      else if (reason === 'done' && this._resumable) this._bookmarks.delete(this.tree);
    }
    this.active = false;
    this.node = null;
    this.nodeId = null;
    this.options = [];
    this._pending = null;
    this._inReplyRange = true;
    this.ui.root.classList.add('hidden');
    this.ui.options.classList.add('hidden');
    this.hooks.onActive?.(false);
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
      /* Out of reach: the replies come down at once and go back up if he
       * walks back into the conversation. The node is unchanged either way. */
      const near = d <= REPLY_RANGE;
      if (near !== this._inReplyRange) {
        this._inReplyRange = near;
        this._paintOptions();
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
