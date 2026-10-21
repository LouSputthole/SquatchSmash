/**
 * The people at the Dead Giveaway table: one seated character per occupied
 * chair, built with the Bada Bing's own figure (`src/bing/cast.js` makePerson
 * through Npc), so a player who picks Big Uncle Lou gets the same Lou the
 * campaign seats at his own bar.
 *
 * Per seat this owns:
 *   - the figure, sat on the chair's cushion (Npc.sit() is tuned to a 0.53 m
 *     cushion; the base is moved by the difference, the same subtraction
 *     src/mansion/cast.js `seatBase` writes down);
 *   - the head, turned toward the look direction that player is sending, eased
 *     so a 10 Hz pose stream reads as a man turning his head, not ticking;
 *   - the speaking cue: a soft amber arc on the felt at his place and a small
 *     head movement -- a photograph cannot open its mouth (see the note in
 *     Npc.update), so the head carries the speech;
 *   - the out-of-the-game slump, glass pushed toward the middle;
 *   - an invisible pick proxy, so a click during the vote lands on the man.
 *
 * The local player's own seat is built too, but hidden: first person has no
 * visible body, and the head is still there for anything (the self preview)
 * that wants to put a face on it.
 */
import { Npc } from '../bing/cast.js';
import { characterById } from './characters.js';
import { neutralFaceUrl } from '../core/online/face-video.js';

/** The cushion height Npc.sit()'s fold was tuned against (src/mansion/cast.js POSE_CUSHION). */
const POSE_CUSHION = 0.53;

const AMBER = 0xffb347;
const SELECT = 0xf4efe4;
const RAT_RED = 0xff2a1c;

/* How far a head turns before the shoulders come with it, and how far the
 * shoulders go. A seated man can look at the person beside him without
 * turning his chest; past about seventy degrees he cannot. */
const HEAD_YAW_LIMIT = 1.2;
const BODY_YAW_LIMIT = 0.45;
const PITCH_LIMIT = 0.6;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* The reveal's card over a head. Owner: "The reveal should go one player at
 * a time over their head... Maybe use a rat symbol over his head." Drawn,
 * not an emoji: an emoji is whatever the viewer's OS thinks a rat looks
 * like, and the house rule is that nothing here winks. */
const TAG_SIZE = { family: [0.46, 0.15], rat: [0.5, 0.55] };
const TAG_HEIGHT = 0.42;   // metres above the head's origin, clear of hats

function drawFamilyTag(g, w, h) {
  g.fillStyle = 'rgba(20, 52, 33, 0.94)';
  g.strokeStyle = '#9fe0b2';
  g.lineWidth = 8;
  g.beginPath();
  g.roundRect(6, 6, w - 12, h - 12, 26);
  g.fill();
  g.stroke();
  g.fillStyle = '#d8f5e0';
  g.font = '900 92px "Trebuchet MS", "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FAMILY', w / 2, h / 2 + 4);
}

function drawRatTag(g, w, h) {
  const cx = w / 2;
  const cy = 236;
  g.fillStyle = '#8c160e';
  g.strokeStyle = '#ff6a58';
  g.lineWidth = 12;
  g.beginPath();
  g.arc(cx, cy, 206, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // The rat, in profile, nose to the left.
  const cream = '#f1e9d8';
  const pink = '#e3a197';
  g.strokeStyle = cream;
  g.lineCap = 'round';
  g.lineWidth = 15;
  g.beginPath();                                   // tail
  g.moveTo(cx + 108, cy + 40);
  g.bezierCurveTo(cx + 190, cy + 40, cx + 190, cy - 70, cx + 120, cy - 110);
  g.stroke();
  g.fillStyle = cream;
  g.beginPath();                                   // body
  g.ellipse(cx + 22, cy + 22, 118, 70, -0.06, 0, Math.PI * 2);
  g.fill();
  g.beginPath();                                   // head, tapering to the snout
  g.moveTo(cx - 70, cy - 40);
  g.quadraticCurveTo(cx - 150, cy - 18, cx - 176, cy + 24);
  g.quadraticCurveTo(cx - 128, cy + 52, cx - 52, cy + 56);
  g.closePath();
  g.fill();
  g.beginPath();                                   // ear
  g.arc(cx - 84, cy - 52, 40, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = pink;
  g.beginPath();
  g.arc(cx - 84, cy - 52, 22, 0, Math.PI * 2);
  g.fill();
  g.beginPath();                                   // nose
  g.arc(cx - 174, cy + 24, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a0805';
  g.beginPath();                                   // eye
  g.arc(cx - 120, cy - 4, 10, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = cream;
  for (const fx of [-40, 60]) {                    // feet
    g.beginPath();
    g.ellipse(cx + fx, cy + 92, 26, 11, 0, 0, Math.PI * 2);
    g.fill();
  }
  // THE RAT on a red ribbon under the badge.
  g.fillStyle = '#b3141e';
  g.strokeStyle = '#ff8a70';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(46, h - 118, w - 92, 100, 18);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff4e6';
  g.font = '900 78px "Trebuchet MS", "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('THE RAT', cx, h - 66);
}

export function createSeatRig(scene, { world, audio = null, THREE, onRebuild = () => {} }) {
  const anchors = world.anchors;
  const table = anchors.table;
  const bySeat = new Map();      // seat -> entry
  const byPlayer = new Map();    // playerId -> entry
  let time = 0;

  const rig = new THREE.Group();
  rig.name = 'deadgiveaway.seats';
  scene.add(rig);

  /* One red key light for the reveal, always in the scene so turning it on
   * never changes the light count (and never recompiles every material in
   * the room mid-reveal). */
  const ratLight = new THREE.SpotLight(RAT_RED, 0, 4.5, 0.42, 0.6, 1.4);
  ratLight.name = 'deadgiveaway.seats.rat-light';
  ratLight.castShadow = false;
  rig.add(ratLight, ratLight.target);

  function seatAnchor(seat) {
    return anchors.seats.find((s) => s.seat === seat) ?? anchors.seats[seat];
  }

  /* One texture per kind, drawn on first use (there is no canvas in Node). */
  const tagTextures = {};
  function tagTexture(kind) {
    if (tagTextures[kind]) return tagTextures[kind];
    const [w, h] = kind === 'rat' ? [512, 564] : [512, 168];
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    (kind === 'rat' ? drawRatTag : drawFamilyTag)(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tagTextures[kind] = tex;
    return tex;
  }

  /** Show the reveal's card over this player's head ('family' | 'rat'), or take it down (null). */
  function setTag(playerId, kind) {
    const entry = byPlayer.get(playerId);
    if (!entry || (entry.tag?.userData.kind ?? null) === (kind ?? null)) return;
    if (entry.tag) { entry.tag.removeFromParent(); entry.tag.material.dispose(); entry.tag = null; }
    if (!kind || entry.isSelf) return;   // first person: your own card is on the HUD
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(kind), transparent: true, depthWrite: false }));
    sprite.name = `deadgiveaway.seat.${entry.seat}.tag.${kind}`;
    sprite.userData = { kind, t: 0 };
    sprite.renderOrder = 8;
    sprite.scale.set(0.001, 0.001, 1);
    rig.add(sprite);
    entry.tag = sprite;
  }

  function clearTags() {
    for (const entry of bySeat.values()) if (entry.playerId) setTag(entry.playerId, null);
  }

  const _tagPos = new THREE.Vector3();
  function updateTag(entry, dt) {
    const tag = entry.tag;
    if (!tag || !entry.npc) return;
    tag.userData.t += dt;
    // Pops up with a little overshoot, then sits still.
    const k = Math.min(1, tag.userData.t / 0.35);
    const pop = 1 + 0.18 * Math.sin(k * Math.PI) * (1 - k * 0.4);
    const [w, h] = TAG_SIZE[tag.userData.kind];
    tag.scale.set(w * k * pop, h * k * pop, 1);
    entry.npc.parts.head.getWorldPosition(_tagPos);
    tag.position.set(_tagPos.x, _tagPos.y + TAG_HEIGHT + (tag.userData.kind === 'rat' ? 0.12 : 0), _tagPos.z);
  }

  function makeArc(seatInfo) {
    const a = Math.atan2(seatInfo.x - table.x, seatInfo.z - table.z);
    const half = 0.34;
    /* Just inside the leather, outside the glass, chips and turn marker. */
    const r = Math.max(0.3, (table.feltR ?? table.radius * 0.87) - 0.02);
    const geo = new THREE.RingGeometry(r - 0.035, r, 24, 1, a - Math.PI / 2 - half, half * 2);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: AMBER, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const arc = new THREE.Mesh(geo, mat);
    arc.name = `deadgiveaway.seat.${seatInfo.seat}.arc`;
    arc.position.set(table.x, table.topY + 0.004, table.z);
    arc.renderOrder = 3;
    rig.add(arc);
    return arc;
  }

  function makeProxy(seatInfo) {
    const proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.33, 0.33, 1.15, 10),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.name = `deadgiveaway.seat.${seatInfo.seat}.pick`;
    proxy.position.set(seatInfo.x, (seatInfo.sitY ?? 0.5) + 0.5, seatInfo.z);
    proxy.userData.dgSeat = seatInfo.seat;
    rig.add(proxy);
    return proxy;
  }

  function buildNpc(seatInfo, character, { name, isSelf, faceOverride = null }) {
    const face = faceOverride ?? character.face;
    const npc = new Npc(scene, {
      name: `${name} (${character.name})`,
      tier: 'hero',
      x: seatInfo.x,
      z: seatInfo.z,
      yaw: seatInfo.faceYaw ?? 0,
      y: (seatInfo.sitY ?? POSE_CUSHION) - POSE_CUSHION,
      job: 'sit',
      look: false,
      actorId: `deadgiveaway-seat-${seatInfo.seat}`,
      model: { ...character.model, ...(face ? { face } : {}), castShadow: !isSelf },
    });
    npc.group.name = `deadgiveaway.seat.${seatInfo.seat}.person`;
    npc.group.userData.dgSeat = seatInfo.seat;
    if (isSelf) npc.group.visible = false;
    return npc;
  }

  function removeNpc(entry) {
    if (!entry?.npc) return;
    entry.npc.group.removeFromParent();
    entry.npc = null;
  }

  function restoreGlass(entry) {
    const glass = entry.glass;
    if (glass && entry.glassHome) glass.position.copy(entry.glassHome);
  }

  function occupy(seat, { playerId, characterId, name = '', isSelf = false } = {}) {
    const seatInfo = seatAnchor(seat);
    if (!seatInfo || !playerId) return null;
    const character = characterById(characterId);
    let entry = bySeat.get(seat);
    if (entry && entry.playerId === playerId && entry.characterId === character.id && entry.isSelf === isSelf) {
      entry.name = name;
      return entry;
    }
    /* A player who moved chairs leaves the old one empty first. */
    const previous = byPlayer.get(playerId);
    if (previous && previous.seat !== seat) vacate(previous.seat);
    if (entry && entry.playerId !== playerId) vacate(seat);
    entry = bySeat.get(seat);
    if (!entry) {
      entry = {
        seat,
        seatInfo,
        arc: makeArc(seatInfo),
        proxy: makeProxy(seatInfo),
        glass: world.glasses?.at?.(seat) ?? null,
        glassHome: null,
        npc: null,
      };
      if (entry.glass) entry.glassHome = entry.glass.position.clone();
      bySeat.set(seat, entry);
    }
    removeNpc(entry);
    Object.assign(entry, {
      playerId,
      characterId: character.id,
      name,
      isSelf,
      needsFace: !character.face,
      faceSurface: Boolean(character.face),
      yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0,
      speaking: false, talk: 0,
      out: false,
      mark: null,
      phase: Math.random() * 6.28,
    });
    entry.npc = buildNpc(seatInfo, character, { name, isSelf });
    entry.proxy.visible = true;
    byPlayer.set(playerId, entry);
    onRebuild(playerId, entry);
    return entry;
  }

  function vacate(seat) {
    const entry = bySeat.get(seat);
    if (!entry) return;
    if (entry.playerId) setTag(entry.playerId, null);
    removeNpc(entry);
    restoreGlass(entry);
    entry.arc.material.opacity = 0;
    if (entry.playerId && byPlayer.get(entry.playerId) === entry) byPlayer.delete(entry.playerId);
    entry.playerId = null;
    entry.characterId = null;
    entry.mark = null;
  }

  /**
   * Give a faceless character (Tony) the photo skull a camera feed needs.
   * Returns true when the figure was rebuilt, so the caller re-attaches.
   */
  function ensureFaceSurface(playerId) {
    const entry = byPlayer.get(playerId);
    if (!entry || entry.faceSurface) return false;
    const character = characterById(entry.characterId);
    /* face-video.js's flat skin-tone image, in Tony's own skin colour. */
    const face = neutralFaceUrl(character.model.skin ?? 0xc9936d);
    if (!face) return false;
    removeNpc(entry);
    entry.npc = buildNpc(entry.seatInfo, character, { name: entry.name, isSelf: entry.isSelf, faceOverride: face });
    entry.faceSurface = true;
    onRebuild(playerId, entry);
    return true;
  }

  function setPose(playerId, yaw, pitch) {
    const entry = byPlayer.get(playerId);
    if (!entry || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
    /* Camera yaw -> the direction he is looking in model space: the camera
     * looks down its -Z, a makePerson figure faces its +Z, so the same
     * heading is the camera yaw plus a half turn. */
    entry.targetYaw = wrap(yaw + Math.PI - (entry.seatInfo.faceYaw ?? 0));
    entry.targetPitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  function setSpeaking(playerId, on) {
    const entry = byPlayer.get(playerId);
    if (entry) entry.speaking = Boolean(on);
  }

  function setOut(playerId, on) {
    const entry = byPlayer.get(playerId);
    if (!entry || entry.out === Boolean(on)) return;
    entry.out = Boolean(on);
    if (entry.glass && entry.glassHome) {
      if (entry.out) {
        /* Pushed a hand's width toward the middle of the felt. */
        const dx = table.x - entry.glassHome.x;
        const dz = table.z - entry.glassHome.z;
        const d = Math.hypot(dx, dz) || 1;
        entry.glass.position.set(entry.glassHome.x + (dx / d) * 0.22, entry.glassHome.y, entry.glassHome.z + (dz / d) * 0.22);
      } else {
        restoreGlass(entry);
      }
    }
  }

  /** 'rat' (red, lit), 'selected' (pale), 'accused', or null. */
  function setMark(playerId, kind) {
    for (const entry of bySeat.values()) {
      if (entry.playerId === playerId) entry.mark = kind;
      else if (kind && entry.mark === kind) entry.mark = null;
    }
  }

  function clearMarks(kind = null) {
    for (const entry of bySeat.values()) {
      if (!kind || entry.mark === kind) entry.mark = null;
    }
  }

  function headOf(playerId) {
    const entry = byPlayer.get(playerId);
    if (!entry?.npc) return null;
    return { person: entry.npc.parts, head: entry.npc.parts.head, seat: entry.seat };
  }

  function personOf(playerId) {
    return byPlayer.get(playerId)?.npc?.parts ?? null;
  }

  function npcOf(playerId) {
    return byPlayer.get(playerId)?.npc ?? null;
  }

  /** The playerId whose seat this ray hits first, excluding the local player. */
  function pick(raycaster) {
    const proxies = [];
    for (const entry of bySeat.values()) {
      if (entry.playerId && !entry.isSelf) proxies.push(entry.proxy);
    }
    /* The renderer refreshes world matrices; a click can arrive before the
     * first frame after a chair changed hands. */
    rig.updateMatrixWorld(true);
    const hits = raycaster.intersectObjects(proxies, false);
    if (!hits.length) return null;
    const seat = hits[0].object.userData.dgSeat;
    return bySeat.get(seat)?.playerId ?? null;
  }

  function update(dt) {
    time += dt;
    let ratEntry = null;
    for (const entry of bySeat.values()) {
      const npc = entry.npc;
      if (!npc) continue;
      const markColour = entry.mark === 'rat' ? RAT_RED : entry.mark === 'selected' || entry.mark === 'accused' ? SELECT : AMBER;
      const arcTarget = entry.mark ? 0.85 : entry.speaking ? 0.7 : 0;
      entry.arc.material.color.setHex(markColour);
      entry.arc.material.opacity += (arcTarget - entry.arc.material.opacity) * Math.min(1, dt * 10);
      if (entry.mark === 'rat') ratEntry = entry;
      if (entry.isSelf) continue;

      npc.update(dt, null);
      const parts = npc.parts;
      const k = Math.min(1, dt * 7);
      entry.yaw += wrap(entry.targetYaw - entry.yaw) * k;
      entry.pitch += (entry.targetPitch - entry.pitch) * k;
      const headYaw = clamp(entry.yaw, -HEAD_YAW_LIMIT - BODY_YAW_LIMIT, HEAD_YAW_LIMIT + BODY_YAW_LIMIT);
      const bodyYaw = clamp(headYaw - clamp(headYaw, -HEAD_YAW_LIMIT, HEAD_YAW_LIMIT), -BODY_YAW_LIMIT, BODY_YAW_LIMIT)
        + headYaw * 0.12;
      parts.body.rotation.y = bodyYaw;
      parts.head.rotation.y = headYaw - bodyYaw;
      /* Camera pitch up is positive; a head tips its face up with negative x. */
      parts.head.rotation.x += -entry.pitch * 0.75;

      entry.talk += ((entry.speaking ? 1 : 0) - entry.talk) * Math.min(1, dt * 8);
      if (entry.talk > 0.01) {
        const t = time + entry.phase;
        parts.head.rotation.x += (Math.sin(t * 7.3) * 0.035 + Math.sin(t * 11.7) * 0.018) * entry.talk;
        parts.head.rotation.z = Math.sin(t * 2.9) * 0.03 * entry.talk;
      }
      if (entry.out) {
        parts.body.rotation.x = -0.15;
        parts.head.rotation.x += 0.2;
      }
      updateTag(entry, dt);
    }
    if (ratEntry) {
      const s = ratEntry.seatInfo;
      ratLight.position.set(s.x + (table.x - s.x) * 0.25, (s.sitY ?? 0.5) + 2.1, s.z + (table.z - s.z) * 0.25);
      ratLight.target.position.set(s.x, (s.sitY ?? 0.5) + 0.6, s.z);
      ratLight.intensity += (5 - ratLight.intensity) * Math.min(1, dt * 4);
    } else {
      ratLight.intensity += (0 - ratLight.intensity) * Math.min(1, dt * 4);
    }
  }

  return {
    occupy,
    vacate,
    setPose,
    setSpeaking,
    setOut,
    setMark,
    clearMarks,
    setTag,
    clearTags,
    tagOf: (playerId) => byPlayer.get(playerId)?.tag?.userData.kind ?? null,
    headOf,
    personOf,
    npcOf,
    ensureFaceSurface,
    pick,
    update,
    seatOf: (playerId) => byPlayer.get(playerId)?.seat ?? null,
    playerAt: (seat) => bySeat.get(seat)?.playerId ?? null,
    entryOf: (playerId) => byPlayer.get(playerId) ?? null,
    occupied: () => [...bySeat.values()].filter((e) => e.playerId).map((e) => ({ seat: e.seat, playerId: e.playerId, characterId: e.characterId, isSelf: e.isSelf })),
    vacateAll() { for (const seat of [...bySeat.keys()]) vacate(seat); },
    audio,
  };
}
