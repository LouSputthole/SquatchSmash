/**
 * Conversation, without taking the game off the player.
 *
 * Ambient conversations stay non-modal: you can step away and pick them up
 * later. Mission briefings can opt into `lockMovement`, which holds Tony in
 * place until the objective dialogue reaches an authored ending. A briefing
 * cannot be skipped accidentally by walking out of Lou's office while the
 * package, assignment, or next objective is still being explained.
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
   * @param {object} hooks { onLine, onChoice, onEnd, onActive, onPaint, cueSeconds }
   *   `onLine(text, who, node)` starts the line's recording and may RETURN THE
   *   TAKE — `{ audio, source }` from `AudioEngine.play()` — which is handed
   *   straight to the speaker's `say()` so his mouth runs on the sound rather
   *   than on a guess. Returning nothing is still valid. `onChoice(opt, index)`
   *   may return the reply's take the same way; whichever take arrived last is
   *   what `hush()` stops.
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
    this.lastEndReason = null;
    /* The take the floor is currently held on — whatever onLine or onChoice
     * last returned — kept so hush() can stop the actual sound and not just
     * the subtitle. */
    this._take = null;
    /* Multi-speaker trees: who each `who` name is, and whose face the current
     * line is on. See `start()`'s `cast` option and `_lineBody()`. */
    this._cast = null;
    this._body = null;
    this.history = new Set();
    /* Where each tree lapsed, keyed by the tree itself. Walking off
     * mid-sentence used to mean the whole conversation started over next
     * time; now it bookmarks the node instead, and only a thread that
     * actually FINISHED replays from the top. */
    this._bookmarks = new WeakMap();
    this._resumable = false;
    this._inReplyRange = true;
    this.lockMovement = false;
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
   * @param {object} opts  { resume, lockMovement, cast } -- pick the conversation back up at the
   *   node it lapsed on rather than restarting; only replay from `at` once
   *   the thread has completed. One-shot interjections (a door line, a
   *   package line) start without it and never disturb a saved thread.
   *   `cast` is for a tree with MORE THAN ONE person in it (License to Grill
   *   is the case: Blond, Gratin, Numbskull and the Shubenator share one
   *   thread): a map of each node's `who` name to the body that should mouth
   *   it. With a cast, only the names in the map animate — so the player's
   *   own spoken nodes, or a voice behind a door, are simply left out of it.
   *   Without one, every line belongs to `speaker`, exactly as before.
   */
  start(tree, at, speaker = null, { resume = false, lockMovement = null, cast = null } = {}) {
    /* A package pickup can hand off to a follow-up node while Lou's required
     * brief is still active. An omitted option preserves that live lock; an
     * explicit false releases it. Keep the callback edge-triggered so a
     * handoff cannot briefly unlock Tony or notify the scene twice. */
    const nextLock = lockMovement == null
      ? (this.active && this.lockMovement)
      : Boolean(lockMovement);
    if (this.active) this.end('interrupted', { keepMovementLock: nextLock });
    this.lastEndReason = null;
    this.tree = tree;
    this.speaker = speaker;
    this._cast = cast;
    this.active = true;
    this._resumable = resume;
    this._inReplyRange = true;
    if (nextLock !== this.lockMovement) {
      this.lockMovement = nextLock;
      this.hooks.onMovementLock?.(nextLock);
    }
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
      /* The line is PLAYED first and the speaker is told about it second.
       *
       * It used to be the other way round, which was fine while a mouth ran
       * on a timer and is not now: the mouth is driven by the take
       * (src/core/mouth.js), so `say()` has to be handed the thing that is
       * making the sound, and `onLine` is what starts it. Scenes whose
       * `onLine` returns nothing lose nothing — the mouth falls back to a
       * synthesised envelope for the same number of seconds it always had. */
      const take = this.hooks.onLine?.(text, who, node) || null;
      this._take = take;
      /* The line goes in the mouth of the person who is SAYING it. For a
       * single-speaker tree that is `speaker`, as it always was; a cast map
       * resolves the multi-speaker threads, and a `who` of 'Prospect' is the
       * player — first person, no face on screen — so it animates nobody
       * instead of putting Tony's words in the other man's mouth. */
      const body = this._lineBody(who);
      if (this._body && this._body !== body) this._body.hush?.();
      this._body = body;
      body?.say?.(
        this._cueHold(node, Math.max(1.6, text.length / 22)),
        take,
      );
    }

    // Options may be a function so they can depend on what has happened
    const opts = (typeof node.options === 'function' ? node.options() : node.options) || [];
    this.options = opts.filter((o) => !o.when || o.when());
    /* A decision node is allowed to contain replies without a preceding
     * spoken line. Golf uses this for the first two tee questions. The old
     * code painted the option elements into a root that was still hidden,
     * leaving a live conversation with no visible way to answer it. */
    if (this.options.length) this.ui.root.classList.remove('hidden');
    this._paintOptions();

    // A node with no options runs on its own after a beat
    const authoredHold = typeof node.hold === 'function' ? node.hold() : node.hold;
    this.timer = this._cueHold(
      node,
      authoredHold ?? (text ? Math.max(2.2, text.length / 18) : 0.6),
    );
    return node;
  }

  /**
   * Whose face a line is on.
   *
   * With a cast map, the map is the whole answer — a name missing from it is
   * a voice with no body to animate (the player, a man behind a door), which
   * is the correct amount of nothing. Without one, the tree has one speaker
   * and every line is his, except the player's own: 'Prospect' is first
   * person in every scene this class runs in, and his spoken nodes used to
   * run the OTHER man's mouth for the length of Tony's recording.
   */
  _lineBody(who) {
    if (this._cast) return this._cast[who] ?? null;
    if (who === 'Prospect') return null;
    return this.speaker;
  }

  _paintOptions() {
    /* Anything that changes the height of the box tells the scene, so
     * whatever else is written at the bottom of the screen can be moved
     * clear of it. Measuring in onLine is too early -- the replies have not
     * been added yet, and the replies are most of the height. */
    if (!this.options.length || !this._inReplyRange) {
      this.ui.options.replaceChildren();
      this.ui.options.classList.add('hidden');
      this.hooks.onPaint?.();
      return;
    }
    this.ui.options.classList.remove('hidden');
    this.ui.options.replaceChildren(...this.options.map((o, i) => {
      const el = document.createElement('div');
      el.className = 'opt';
      el.innerHTML = `<kbd>${i + 1}</kbd><span class="tone">${o.tone ?? ''}</span><span class="say">${o.text}</span>`;
      return el;
    }));
    this.hooks.onPaint?.();
  }

  /** Number keys 1..4 while a conversation is up. */
  choose(index) {
    if (!this.active || !this.options.length || !this._inReplyRange) return false;
    const opt = this.options[index];
    if (!opt) return false;
    this.ui.options.classList.add('hidden');
    this.ui.name.textContent = 'PROSPECT';
    this.ui.line.innerHTML = opt.text;
    /* The reply's take, when the scene returns one, replaces the node's as
     * the thing hush() would stop — the reply owns the floor now. */
    this._take = this.hooks.onChoice?.(opt, index) || null;
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

  /**
   * Stop the take the floor is being held on.
   *
   * end() clears the SUBTITLE; since mouths became audio-driven
   * (src/core/mouth.js) the recording itself kept playing, so a conversation
   * the player walked out of left the speaker finishing his sentence at a
   * wall. Whether that is rude or realistic is a direction call, so the class
   * does not hush itself: the scene decides in its onEnd hook — lapses
   * (walked-away, interrupted, a seat-pause) hush; a thread that ran to
   * 'done' has already had its full cue hold and needs nothing stopped.
   */
  hush() {
    const source = this._take?.source;
    this._take = null;
    if (!source?.stop) return false;
    try { source.stop(); } catch { /* never started, or already ended */ }
    return true;
  }

  end(reason = 'done', { keepMovementLock = false } = {}) {
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
    this.lastEndReason = reason;
    /* A cast-driven thread shuts the current mouth on the way out: unlike the
     * single-speaker case there may be no follow-up say() on the same body to
     * supersede a fallback envelope still running. The single-speaker path is
     * left exactly as it was — the scene's onEnd owns the take, and the mouth
     * follows the take (src/core/mouth.js). */
    if (this._cast) {
      this._body?.hush?.();
      this._cast = null;
    }
    this._body = null;
    this.node = null;
    this.nodeId = null;
    this.options = [];
    this._pending = null;
    this._inReplyRange = true;
    const lockedMovement = this.lockMovement;
    if (!keepMovementLock) this.lockMovement = false;
    this.ui.root.classList.add('hidden');
    this.ui.options.classList.add('hidden');
    if (lockedMovement && !keepMovementLock) this.hooks.onMovementLock?.(false);
    this.hooks.onActive?.(false);
    this.hooks.onEnd?.(reason);
  }

  update(dt, playerPos) {
    if (!this.active) return;

    // Walk away and it stops being a conversation
    if (!this.lockMovement && this.speaker && playerPos) {
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
