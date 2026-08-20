/**
 * The date.
 *
 * Named for what she is rather than for who, because she has been recast once
 * and none of this cares which woman it is walking. Her name is in
 * `script.js`; everything here is about somebody walking next to you.
 *
 * A companion rather than a follower. The difference is the whole mission: a
 * follower stands behind you at a fixed radius and says nothing, and the
 * player looks over their shoulder twice and stops caring. She has to be
 * somebody walking next to you who can see what you are showing her.
 *
 * What that means in practice, and in this order:
 *
 *   1. She walks *beside* him where there is room and behind him where there
 *      is not, which is the tell that separates a person from a pathfinder.
 *      The corridor is 5m wide and the cellar aisle is 1.4m, and she works
 *      that out from the route rather than from a navmesh, because there is no
 *      navmesh in this engine and a working kitchen is the last place you want
 *      to discover that.
 *   2. She looks at whatever is happening — the man who just said his name,
 *      the tray going past, the pan, the stage.
 *   3. She notices being left behind, and says so, and it costs him.
 *   4. She never teleports where he can see her. If she is badly stuck she
 *      waits for him to break line of sight and then catches up, which is what
 *      the `_recover` state is for.
 *
 * The route is authored (`ROUTE` in room.js). She walks it; he can walk
 * anywhere. Her target is the point on the route nearest to him, biased
 * forwards, which gives her the shape of the journey without her needing to
 * solve it.
 */
import * as THREE from 'three';
import { Npc } from '../bing/cast.js';
import { DATE } from './script.js';
import { restyleMargoHead } from './margo.js';

/** Where she would rather be, relative to him. */
const BESIDE = 1.15;
const BEHIND = 1.3;
/**
 * How far back of him her shoulder sits when she is walking beside him.
 *
 * Not zero. Two people walking abreast are never exactly abreast, and dead
 * level she is in the corner of the frame the entire way, which reads as
 * being escorted rather than accompanied.
 */
const SHOULDER = 0.28;
/** Close enough to her spot, once he has stopped, to simply stand there. */
const SETTLE = 0.5;
/** He is walking, rather than turning on the spot, above this. */
const MOVING = 0.35;
/** Inside this of his eyeline, he is looking at her rather than past her. */
const EYELINE = 1.0;
/** Past this and she is trailing; past the second and she says so. */
const TRAIL = 4.2;
const LOST = 9.0;
/** She walks at his pace, not at hers, up to this. */
const SPEED = 3.1;
/* Enough of a margin over his walk to actually close a gap. At 4.4 she gained
 * about a metre a second on him, so ten metres of cellar took eight seconds to
 * undo and she spent the whole kitchen arriving. */
const SPEED_CATCHUP = 5.6;
/** No sub-step longer than this, or she walks through the building. */
const STEP_MAX = 0.3;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Date_ {
  /**
   * @param {THREE.Scene} scene
   * @param {object} room the built Silver Room
   * @param {object} hooks { onBark, onLeftBehind, onCaughtUp, onLook }
   */
  constructor(scene, room, hooks = {}) {
    this.room = room;
    this.hooks = hooks;
    this.route = room.ROUTE;

    this.npc = new Npc(scene, {
      name: DATE.name, tier: 'hero', job: 'stand', look: true,
      x: room.anchors.dropOff.x - 1.4,
      y: room.groundAt(room.anchors.dropOff.x - 1.4, room.anchors.dropOff.z),
      z: room.anchors.dropOff.z, yaw: Math.PI,
      model: {
        /* Dressed for the one night a week she is not on her feet in whites,
         * and slightly overdressed for it on purpose — she does not get many
         * of these and she is not going to waste one. */
        height: 1.69, build: 1.06, dress: 'gown', shirt: 0x1a2a4a,
        /* 'bald' because the builder's hair never survives: her whole head is
         * rebuilt below — this is the face the player studies for twenty
         * minutes under a lamp, and it gets its own file. */
        hair: 'bald', hairColour: 0x2a1c14, skin: 0xd8a878,
        gender: 'female', bodyShape: 'curvy',
      },
    });
    restyleMargoHead(this.npc.parts, { skin: 0xd8a878, hairColour: 0x2a1c14 });
    this.group = this.npc.group;

    /** 'idle' | 'follow' | 'recover' | 'seated' | 'scene' */
    this.mode = 'idle';
    this.at = 0;              // index along the route
    this.trailing = 0;
    this.saidLost = 0;
    this.said = new Set();
    this.lookAt = null;       // an Object3D she is watching
    this.lookFor = 0;
    this._stuck = 0;
    this._lastPos = this.group.position.clone();
    this._gait = 0;
    /* Him, as far as walking beside him is concerned: where he was, which way
     * he is going, and how fast. His *heading*, deliberately, and not his
     * yaw — the spot she aims at must not move when he moves the mouse. */
    this._hisLast = new THREE.Vector3(0, 0, 1);
    this._heading = { x: 0, z: -1 };
    this._hisSpeed = 0;
    /** Which shoulder. A decision, kept until that side is blocked. */
    this._side = 1;
  }

  get position() { return this.group.position; }
  get isTrailing() { return this.trailing > 0.9; }

  /** Say one of a list, once, and never the same one twice. */
  bark(key, lines) {
    if (!lines || !lines.length) return false;
    const fresh = lines.filter((l) => !this.said.has(l));
    if (!fresh.length) return false;
    const line = fresh[0];
    this.said.add(line);
    /* The index in the list she was handed, not in `fresh`: it is what names
     * the recording, so it has to be the line's own place in the script and
     * not its place in whatever is left tonight. */
    const spoke = this.hooks.onBark?.(line, key, lines.indexOf(line));
    /* Her MOUTH is the hook's business when the hook took it on.
     *
     * This used to open her mouth right here, and the scene DEFERS her barks
     * -- she waits for the floor rather than talking over whoever has it (see
     * `deferVoice` in silver/main.js) -- so she mouthed the line silently at
     * the moment it was queued and then said it out loud, mouth shut, several
     * seconds later. A hook that returns true has undertaken to start her when
     * the words actually leave her. */
    if (spoke !== true) this.npc.say(Math.max(1.8, line.length / 20));
    return true;
  }

  /** Watch something for a few seconds — a tip, a pan, the stage. */
  watch(object, secs = 2.6) {
    this.lookAt = object;
    this.lookFor = secs;
  }

  follow() { this.mode = 'follow'; }
  hold() { this.mode = 'idle'; }

  /** Drop her into a chair. Used by the seating beat and by checkpoints. */
  sitAt(seat) {
    this.mode = 'seated';
    this.group.position.set(seat.x, this.room.groundAt(seat.x, seat.z), seat.z);
    this.group.rotation.y = seat.yaw;
    this.npc.baseY = this.group.position.y;
    this.npc.homeYaw = seat.yaw;
    this.npc.job = 'sit';
    this.npc.sit();
  }

  standFrom(spot) {
    this.mode = 'follow';
    this.npc.job = 'stand';
    this.npc.stand();
    if (spot) this.group.position.set(spot.x, this.room.groundAt(spot.x, spot.z), spot.z);
  }

  /** Hand her to a cutscene, which will move her itself. */
  takeOver() { this.mode = 'scene'; }
  release() { this.mode = 'follow'; }

  /* ---------------------------------------------------------------- */

  /**
   * The next point on the route she should be heading for.
   *
   * She advances by *reaching* nodes, one at a time, rather than by jumping to
   * whichever node is nearest him. That distinction is the whole of her
   * pathing, and getting it wrong is not subtle: if he is at the bottom of the
   * ramp and she is at the top, the nearest node to him is two rooms away
   * through a floor, and heading straight for it walks her out over the
   * cellar at kitchen height and strands her there. Walking the route means
   * she goes down the ramp, because the ramp is what the route is made of.
   *
   * He can be anywhere. She just does not take his shortcuts.
   */
  _advance(playerPos) {
    const R = this.route;
    const pos = this.group.position;

    // How far along he is, so she never lags more than a couple of legs back.
    let his = this.at;
    let bestD = Infinity;
    for (let i = this.at; i < Math.min(R.length, this.at + 5); i++) {
      const d = Math.hypot(playerPos.x - R[i].x, playerPos.z - R[i].z);
      if (d < bestD) { bestD = d; his = i; }
    }

    // Reached the next node? Then it is behind her now.
    while (this.at < R.length - 1 && this.at < his) {
      const n = R[this.at + 1];
      if (Math.hypot(pos.x - n.x, pos.z - n.z) > 3.5) break;
      this.at++;
    }
    /* Standing next to him counts as having got wherever he got to: this is
     * what stops her re-walking the route from behind after a cutscene has
     * carried her forwards. */
    if (his > this.at && Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z) < 4
        && Math.abs(((playerPos.y ?? 0) - 1.66) - pos.y) < 1.0) {
      this.at = his;
    }
    return R[Math.min(this.at + 1, R.length - 1)];
  }

  /* `_roomBeside` used to live here: a list of six room names that decided
   * whether she was allowed to walk next to him. It was wrong in both
   * directions -- she trailed him through the whole cellar and the whole prep
   * kitchen, both of which are wider than the corridor she was allowed to
   * walk abreast in, and it said yes in the kitchen right where the range
   * line makes it a single file. The building answers now, by being asked
   * whether the spot is free. */

  update(dt, playerPos, playerYaw) {
    const npc = this.npc;

    if (this.mode === 'seated' || this.mode === 'scene' || this.mode === 'idle') {
      if (this.lookFor > 0) {
        this.lookFor -= dt;
        if (this.lookAt) {
          this.lookAt.getWorldPosition(_w);
          npc.faceToward(_w.x, _w.z);
        }
      } else if (this.mode === 'seated' && playerPos) {
        npc.faceToward(playerPos.x, playerPos.z);
      }
      npc.update(dt, playerPos);
      return;
    }

    /* ---- following ---- */
    const pos = this.group.position;
    const gap = Math.hypot(playerPos.x - pos.x, playerPos.z - pos.z);
    this.trailing = gap > TRAIL ? this.trailing + dt : 0;

    const ahead = this._advance(playerPos);

    /* ---- where she wants to stand ----
     *
     * Beside him. This used to be beside him only in six named rooms and
     * behind him everywhere else, and the spot she was aiming at was hung off
     * his *look* yaw — so the target swung round him whenever he moved the
     * mouse, and a man who stopped and turned to talk to her set her walking
     * a circle round his back to get to his other shoulder. The single worst
     * thing about the evening: you could not turn and look at your date.
     *
     * Three changes. It is hung off the direction he is *travelling*, which a
     * mouse does not move, and which holds still when he stops. Which side is
     * a decision she keeps until that side is actually blocked, rather than
     * one she takes again every frame. And whether she can be beside him at
     * all is asked of the building — is that spot free, walking — instead of
     * of a list of room names, so she comes up the alley and through the
     * cellar next to him and only drops in behind for the doorways that
     * genuinely will not take two.
     */
    const step = Math.hypot(playerPos.x - this._hisLast.x, playerPos.z - this._hisLast.z);
    /* A stride, not a jump. Two metres in a frame is a checkpoint, a cutscene
     * or the first frame of the evening, and reading a heading off one aims
     * her at the far side of the building until the easing has caught up. */
    if (step > 1e-4 && step < 2 && dt > 0) {
      /* His heading, eased. Raw frame-to-frame displacement is noisy enough
       * at a tenth of a metre a frame to make her wobble. */
      const hx = (playerPos.x - this._hisLast.x) / step;
      const hz = (playerPos.z - this._hisLast.z) / step;
      const k = Math.min(1, dt * 6);
      this._heading.x += (hx - this._heading.x) * k;
      this._heading.z += (hz - this._heading.z) * k;
      const n = Math.hypot(this._heading.x, this._heading.z) || 1;
      this._heading.x /= n;
      this._heading.z /= n;
    }
    this._hisSpeed += ((dt > 0 ? step / dt : 0) - this._hisSpeed) * Math.min(1, dt * 8);
    this._hisLast.copy(playerPos);
    const walking = this._hisSpeed > MOVING;

    /* A spot off one shoulder: perpendicular to his heading, a little back. */
    const spot = (s) => ({
      x: playerPos.x - this._heading.z * BESIDE * s - this._heading.x * SHOULDER,
      z: playerPos.z + this._heading.x * BESIDE * s - this._heading.z * SHOULDER,
    });
    let beside = spot(this._side);
    if (this._blocked(beside.x, beside.z)) {
      const other = spot(-this._side);
      if (!this._blocked(other.x, other.z)) { this._side = -this._side; beside = other; }
      else beside = null;
    }

    let tx; let tz;
    if (beside) {
      tx = beside.x;
      tz = beside.z;
    } else {
      // Behind him along the route rather than behind him in space: in a bend
      // "behind" and "back down the corridor" are different places.
      const back = this.route[Math.max(0, this.at)];
      tx = playerPos.x + (back.x - playerPos.x) * 0.14;
      tz = playerPos.z + (back.z - playerPos.z) * 0.14;
      const d = Math.hypot(tx - playerPos.x, tz - playerPos.z) || 1;
      tx = playerPos.x + ((tx - playerPos.x) / d) * BEHIND;
      tz = playerPos.z + ((tz - playerPos.z) / d) * BEHIND;
    }

    // Falling behind: forget the nice offset and just come.
    if (gap > TRAIL) { tx = playerPos.x; tz = playerPos.z; }

    /* Unless he is on a different floor, in which case walking towards him is
     * walking into a wall or off a ledge. There are exactly two places in this
     * building where that is true and both of them are ramps, so when the
     * levels disagree she stops following him and follows the route, which is
     * made of the ramps. It costs her a second and it is the difference
     * between a companion and a woman standing on a kitchen floor looking
     * down at a wine cellar. */
    const hisFeet = (playerPos.y ?? 0) - 1.66;
    if (Math.abs(hisFeet - pos.y) > 1.0) { tx = ahead.x; tz = ahead.z; }

    _v.set(tx - pos.x, 0, tz - pos.z);
    const dist = _v.length();
    /* Standing still is a thing she is allowed to do.
     *
     * A tight stop radius while he is walking, because a metre of slack looks
     * like she is wandering; a generous one the moment he is not, because
     * that is the difference between a woman standing next to you and a woman
     * endlessly adjusting. */
    const stop = walking ? (beside ? 0.35 : 0.6) : SETTLE;

    if (dist > stop) {
      const speed = gap > TRAIL ? SPEED_CATCHUP : Math.min(SPEED, 0.8 + dist * 1.5);
      _v.normalize();

      /* Move in sub-steps no longer than a third of a metre.
       *
       * Her collision tests where she is going to be, not the line she takes
       * to get there, and the walls in this building are 200mm. At four and a
       * half metres a second one dropped frame is a two-metre step, which goes
       * straight through the outside wall of the club and leaves her standing
       * in the dark north of the stairwell for the rest of the evening. It is
       * exactly the bug you cannot find by playing well, because it needs a
       * bad frame at the wrong moment.
       */
      const total = speed * dt;
      const subs = Math.max(1, Math.ceil(total / STEP_MAX));
      const per = total / subs;
      for (let i = 0; i < subs; i++) {
        const nx = pos.x + _v.x * per;
        const nz = pos.z + _v.z * per;
        if (!this._blocked(nx, nz)) {
          pos.x = nx;
          pos.z = nz;
        } else {
          /* Slide along whatever she hit rather than stopping dead in front of
           * it. Two axis-locked attempts is enough for a building made of
           * boxes, and it is what stops her standing behind a range for the
           * rest of the mission. */
          if (!this._blocked(nx, pos.z)) pos.x = nx;
          else if (!this._blocked(pos.x, nz)) pos.z = nz;
          else { this._stuck += dt / subs; break; }
        }
      }
      this._gait += speed * dt * 2.6;
      npc.parts.legL.rotation.x = Math.sin(this._gait) * 0.4;
      npc.parts.legR.rotation.x = -Math.sin(this._gait) * 0.4;
      npc.parts.armL.rotation.x = -Math.sin(this._gait) * 0.3;
      npc.parts.armR.rotation.x = Math.sin(this._gait) * 0.3;
      npc.faceToward(pos.x + _v.x * 40, pos.z + _v.z * 40);
    } else {
      this._gait = 0;
      npc.parts.legL.rotation.x *= 0.85;
      npc.parts.legR.rotation.x *= 0.85;
      /* Standing at his shoulder, she has two things she might be looking at
       * and it depends entirely on him. If he has turned to face her she
       * turns to face him, which is the whole point of stopping. If he is
       * looking at the room she looks at the room too — turning to stare at
       * the side of a man's head is what she did before, and it made every
       * pause in the evening feel like being waited on. */
      if (this.lookFor <= 0) {
        const toHer = Math.atan2(pos.x - playerPos.x, pos.z - playerPos.z);
        const off = Math.abs(Math.atan2(
          Math.sin(toHer - (playerYaw ?? 0) + Math.PI),
          Math.cos(toHer - (playerYaw ?? 0) + Math.PI),
        ));
        if (off < EYELINE) npc.faceToward(playerPos.x, playerPos.z);
        else npc.faceToward(pos.x - Math.sin(playerYaw ?? 0) * 40, pos.z - Math.cos(playerYaw ?? 0) * 40);
      }
    }

    pos.y = this.room.groundAt(pos.x, pos.z, pos.y);
    npc.baseY = pos.y;

    /* ---- being left behind ---- */
    if (this.trailing > 2.5 && performance.now() - this.saidLost > 12000) {
      this.saidLost = performance.now();
      this.hooks.onLeftBehind?.(gap);
    }

    /* ---- genuinely stuck ----
     * Stuck means *not moving*, not "a long way back". Counting distance as
     * stuck-ness meant that anyone who got ahead of her triggered a recovery
     * every four seconds while she was walking perfectly well, and since the
     * recovery put her back on the node she had just left, she spent the whole
     * cellar being teleported one and a half metres backwards.
     *
     * And when it does fire, it puts her where *he* is on the route, which is
     * the entire point of catching up. Out of sight if possible — popping
     * across a kitchen in front of the player is worse than the bug it fixes —
     * but not at the price of losing her for the rest of the evening.
     */
    const moved = this._lastPos.distanceToSquared(pos) > 1e-6;
    if (!moved && dist > stop) this._stuck += dt;
    else this._stuck = Math.max(0, this._stuck - dt * 1.5);
    this._lastPos.copy(pos);

    if (this._stuck > 3 || (gap > LOST && this._stuck > 1.5)) {
      const toHer = Math.atan2(pos.x - playerPos.x, pos.z - playerPos.z);
      const facing = Math.abs(Math.atan2(Math.sin(toHer - (playerYaw ?? 0)), Math.cos(toHer - (playerYaw ?? 0))));
      const behindHim = facing > 1.9;
      if (behindHim || gap > LOST || this._stuck > 8) {
        // Forwards, to where he is, never back to where she has already been.
        let best = this.at;
        let bestD = Infinity;
        for (let i = this.at; i < this.route.length; i++) {
          const d = Math.hypot(playerPos.x - this.route[i].x, playerPos.z - this.route[i].z);
          if (d < bestD) { bestD = d; best = i; }
        }
        const node = this.route[best];
        this.at = best;
        pos.set(node.x, this.room.groundAt(node.x, node.z, node.y ?? pos.y), node.z);
        this._lastPos.copy(pos);
        this._stuck = 0;
        this.hooks.onCaughtUp?.();
      }
    }

    /* ---- what she is looking at ---- */
    if (this.lookFor > 0) {
      this.lookFor -= dt;
      if (this.lookAt) {
        this.lookAt.getWorldPosition(_w);
        npc.faceToward(_w.x, _w.z);
      }
    }

    npc.update(dt, playerPos);
  }

  /** Her own collision, against the same boxes the player uses. */
  _blocked(x, z) {
    const y = this.room.groundAt(x, z, this.group.position.y);
    for (const b of this.room.colliders) {
      if (x > b.min.x - 0.3 && x < b.max.x + 0.3
          && z > b.min.z - 0.3 && z < b.max.z + 0.3
          && y + 1.2 > b.min.y && y < b.max.y) return true;
    }
    return false;
  }
}

export { DATE };
