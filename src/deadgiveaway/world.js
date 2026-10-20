/**
 * Dead Giveaway: the room under the Bada Bing.
 *
 * A private card room one flight down from the club, at 1 unit = 1 metre and
 * built the way the Bing is built -- primitives, canvas textures, nothing off
 * disk. The club's own kit supplies the panelling, the printed plates and the
 * framed squatch mark; the flat's props supply the bottles, the ashtrays and
 * the cigarettes. What is new here is only what the game needs: an
 * eight-handed round table, a word board on the wall, a clue card at every
 * place, and a stack of chips that is somebody's life count.
 *
 *            z = -3.2   north wall: THE BOARD, two sconces, two pictures
 *                 ┌────────────────────────────────────────┐
 *                 │ stand            1   2                 │
 *   stairs up     │             0            3             │
 *   to the club ◄─┤ door             (table)          bar  │ x = 4.4
 *   x = -4.4      │             7            4             │
 *                 │ sideboard        6   5          safe   │
 *                 └────────────────────────────────────────┘
 *            z =  3.2   south wall: humidor, clock, two sconces
 *
 * Seats are numbered clockwise as seen from above, starting at the door end.
 * (Clockwise from above in three.js is west → north → east → south, because
 * north is -z.) The ring is turned half a place, 22.5 degrees, so that NO
 * chair has its back square to the door, the board or the bar: each of those
 * sits in the gap between two heads. That is measured, not taste -- with a
 * chair on the board's centreline, the head in it covered the middle two rows
 * of the board from the chair opposite, which is the one chair furthest from
 * it and the one that most needs to read it.
 *
 * LIGHT, which is the part that has to be right. Faces are the game -- the
 * whole of Dead Giveaway is reading the man across from you -- so every seat
 * has to be lit from the table side and nothing may hang between two faces.
 *   - The pendant is the key. Its spot is a cone onto the felt (shadowed, the
 *     one shadow-caster in the room); a second, unshadowed point light inside
 *     the drum lights every face from the front and slightly above, which is
 *     what a pool of lamplight over a card table does to the people at it.
 *     The drum's rim sits at 1.90 m: a seated eye line is 1.21 m, so the line
 *     from any face to any other face passes 0.7 m under it.
 *   - Brass sconces on the long walls and the back-bar strip are the fill:
 *     they keep the panelling and the backs of the chairs from going black,
 *     so a head reads against a lit wall instead of a void.
 *   - Haze is the Bing's own: the same exponential fog density (0.014), the
 *     same slow drift of motes, and a thin layer of cigar smoke hanging in the
 *     lamplight. Over the 3.7 m across this table the fog takes 0.3 % off a
 *     face. It is atmosphere, not a filter.
 *
 * Contract: docs/DEAD-GIVEAWAY.md § world.js. Nothing in here plays a sound --
 * main.js owns the muffled bass from upstairs.
 */
import * as THREE from 'three';
import { mat, box, cylinder, sphere, collider, group } from '../world/build.js';
import {
  makeWhiskeyBottle, makeShotGlass, makeAshtray, makeCigarettePack, makeFrame, makeWallClock,
} from '../world/props.js';
import { panelling, printed, squatchArt, lit, tiled } from '../bing/kit.js';
import { woodFloor, roomEnvironment } from '../world/textures.js';
import { SmokeSystem } from '../world/smoke.js';

export const SEAT_COUNT = 8;

/** Ceiling height. The Bing's back-of-house is 2.6; a cellar room a touch more. */
export const DG_CEIL = 2.7;
/** The room's inner faces. 8.8 x 6.4 m: the eight chairs need 4.4 m across,
 *  and a man has to be able to get round behind them to the bar. */
export const DG_ROOM = Object.freeze({ x0: -4.4, x1: 4.4, z0: -3.2, z1: 3.2 });
/**
 * The table. `radius` is the outside of the leather rail -- the edge a knee or
 * a forearm meets -- and `feltR` the playing surface inside it. `topY` is the
 * felt: chips, glasses and clue cards stand on it.
 */
export const DG_TABLE = Object.freeze({ x: 0, z: 0, topY: 0.78, feltR: 1.12, radius: 1.29 });
/**
 * Seat centres sit 1.85 m from the middle of the table, 0.56 m outside the
 * rail. Measured against the shared seated rig (src/bing/cast.js Npc.sit):
 * its knees land 0.45 m in front of the hip, so they finish at r 1.40 -- under
 * the rail's lip and clear of the pedestal feet (r 0.78) -- and the chest is
 * 0.45 m off the leather, which is how far back a man sits at a card table
 * when he wants to see everybody's hands. Chord between neighbouring chair
 * centres: 1.42 m, so there is 0.74 m of floor between two chairs.
 */
export const DG_SEAT_RADIUS = 1.85;
/** Cushion top. Npc.sit() is authored against 0.53 (cast.js, "office and
 *  blackjack seats have their cushions at 0.53 and the pose lands square on
 *  them"), so this chair is built to it. */
export const DG_SIT_Y = 0.53;
/** Seated eye height for the first-person camera: cushion + 0.68, the same
 *  sitting eye a 1.78 m figure gets from the shared rig. */
export const DG_EYE_Y = 1.21;

const DOOR_W = 1.1;
const DOOR_H = 2.15;
const WALL_T = 0.16;
const WAINSCOT_H = 1.0;

/* Stairs up to the club: 14 risers of 0.19 m from the landing outside the
 * door, going west. The first riser is 1.15 m beyond the wall face so the
 * leaf, which swings OUT onto the landing, clears it with 10 cm to spare. */
const STAIRS = Object.freeze({
  x0: DG_ROOM.x0 - WALL_T - 1.15,   // first riser
  run: 0.27,
  rise: 0.19,
  steps: 14,
  z0: -0.6,
  z1: 0.6,
});

/**
 * Seat anchor by index, pure. The camera's look direction is
 * (-sin yaw, -cos yaw) (Player), a model's face is its +z, so `yaw` and
 * `faceYaw` are half a turn apart -- the same arithmetic the Bing's blackjack
 * chairs use.
 */
/** Angle of a seat round the table: seat 0 is the first place clockwise
 *  from the door (west, phi = PI), half a place round. */
function seatPhi(seat) {
  return Math.PI + (seat + 0.5) * (Math.PI * 2 / SEAT_COUNT);
}

export function seatAnchor(seat) {
  const phi = seatPhi(seat);
  const x = DG_TABLE.x + Math.cos(phi) * DG_SEAT_RADIUS;
  const z = DG_TABLE.z + Math.sin(phi) * DG_SEAT_RADIUS;
  return {
    seat,
    x,
    z,
    yaw: Math.atan2(x - DG_TABLE.x, z - DG_TABLE.z),
    faceYaw: Math.atan2(DG_TABLE.x - x, DG_TABLE.z - z),
    sitY: DG_SIT_Y,
    eyeY: DG_EYE_Y,
  };
}

/**
 * A point on the felt in front of a seat. `r` is distance from the table
 * centre; `t` is sideways, positive to the SEATED PLAYER'S RIGHT. (Facing
 * f = (-dx, -dz), right is (dz, -dx).)
 */
function feltPoint(seat, r, t = 0) {
  const phi = seatPhi(seat);
  const dx = Math.cos(phi);
  const dz = Math.sin(phi);
  return {
    x: DG_TABLE.x + dx * r + dz * t,
    z: DG_TABLE.z + dz * r - dx * t,
  };
}

/* ------------------------------------------------------------------ */
/* Canvas textures                                                     */
/* ------------------------------------------------------------------ */

const _tex = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(c, { repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function cachedTex(key, build) {
  if (!_tex.has(key)) _tex.set(key, build());
  return _tex.get(key);
}

/* Seeded, so the burns and the wear land in the same place on every machine
 * and every screenshot of this room is the same room. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The playing surface: billiard-green baize, worn pale in a ring where
 * thirty years of forearms have rested on it, with a faint gold line and
 * three cigarette burns nobody has ever owned up to. Drawn onto a disc, so
 * the canvas centre is the table centre and the rim is the brass bead.
 */
function feltTexture() {
  return cachedTex('dg.felt', () => {
    const S = 1024;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    const r = rng(29);
    g.fillStyle = '#0f4a2d';
    g.fillRect(0, 0, S, S);
    // Nap: thousands of short strokes a shade either side of the base.
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)';
      g.fillRect(r() * S, r() * S, 2 + r() * 3, 1);
    }
    // The worn ring: 0.82-1.04 m out of a 1.12 m felt, under every forearm.
    const wear = g.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S * 0.47);
    wear.addColorStop(0, 'rgba(160,200,150,0)');
    wear.addColorStop(0.55, 'rgba(160,200,150,0.07)');
    wear.addColorStop(1, 'rgba(160,200,150,0)');
    g.fillStyle = wear;
    g.fillRect(0, 0, S, S);
    // Darker in the middle, where the light is brightest and nobody leans.
    const centre = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.3);
    centre.addColorStop(0, 'rgba(0,20,8,0.16)');
    centre.addColorStop(1, 'rgba(0,20,8,0)');
    g.fillStyle = centre;
    g.fillRect(0, 0, S, S);
    // The gold line, at 0.62 m. Painted once, rubbed half away since.
    g.strokeStyle = 'rgba(214,186,110,0.42)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.277, 0, Math.PI * 2);
    g.stroke();
    // Burns: a brown halo and a black heart.
    for (const [bx, by, br] of [[0.71, 0.37, 7], [0.29, 0.66, 5], [0.58, 0.81, 6]]) {
      const burn = g.createRadialGradient(S * bx, S * by, 0, S * bx, S * by, br * 2.4);
      burn.addColorStop(0, 'rgba(20,10,4,0.95)');
      burn.addColorStop(0.4, 'rgba(70,45,20,0.6)');
      burn.addColorStop(1, 'rgba(70,45,20,0)');
      g.fillStyle = burn;
      g.fillRect(S * bx - br * 3, S * by - br * 3, br * 6, br * 6);
    }
    return canvasTexture(c, { aniso: 8 });
  });
}

/**
 * Raised-panel walnut wainscot. One tile is 1.1 m of wall by the full 1.0 m
 * height: a rail, two stiles and one fielded panel with a lit upper bevel and
 * a shadowed lower one, which is how a raised panel reads under a sconce.
 */
function wainscotTexture() {
  return cachedTex('dg.wainscot', () => {
    const W = 512;
    const H = 464;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const r = rng(11);
    g.fillStyle = '#3b2415';
    g.fillRect(0, 0, W, H);
    // Grain across the whole tile.
    for (let i = 0; i < 220; i++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? '15,8,4' : '120,80,50'},${0.05 + r() * 0.08})`;
      g.lineWidth = 1 + r() * 2;
      const x = r() * W;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 8, H * 0.3, x - 8, H * 0.6, x + 4, H);
      g.stroke();
    }
    const px = 46;
    const py = 52;
    // Shadow line round the panel, then the bevels.
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(px - 4, py - 4, W - px * 2 + 8, H - py * 2 + 8);
    g.fillStyle = '#4a2e1b';
    g.fillRect(px, py, W - px * 2, H - py * 2);
    g.fillStyle = 'rgba(255,215,170,0.12)';
    g.fillRect(px, py, W - px * 2, 14);
    g.fillRect(px, py, 14, H - py * 2);
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.fillRect(px, H - py - 14, W - px * 2, 14);
    g.fillRect(W - px - 14, py, 14, H - py * 2);
    // The field itself, slightly redder where it was French-polished.
    g.fillStyle = 'rgba(110,40,20,0.12)';
    g.fillRect(px + 20, py + 20, W - px * 2 - 40, H - py * 2 - 40);
    // Scuffs along the bottom rail: chair legs, shoes, the mop.
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '160,120,90'},${0.12 + r() * 0.12})`;
      g.fillRect(r() * W, H - 34 + r() * 26, 6 + r() * 30, 2);
    }
    return canvasTexture(c);
  });
}

/** An oriental rug under the table: oxblood field, navy border, gold
 *  medallion, and a pale track round the chairs where they get pushed back. */
function rugTexture() {
  return cachedTex('dg.rug', () => {
    const W = 1024;
    const H = 900;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const r = rng(5);
    g.fillStyle = '#16192e';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#5a1418';
    g.fillRect(64, 64, W - 128, H - 128);
    g.strokeStyle = '#b48a46';
    g.lineWidth = 6;
    g.strokeRect(44, 44, W - 88, H - 88);
    g.strokeRect(78, 78, W - 156, H - 156);
    // Border motif: small gold lozenges.
    g.fillStyle = 'rgba(190,150,80,0.55)';
    for (let x = 90; x < W - 80; x += 36) {
      for (const y of [22, H - 22]) {
        g.beginPath();
        g.moveTo(x, y - 9); g.lineTo(x + 9, y); g.lineTo(x, y + 9); g.lineTo(x - 9, y);
        g.fill();
      }
    }
    for (let y = 90; y < H - 80; y += 36) {
      for (const x of [22, W - 22]) {
        g.beginPath();
        g.moveTo(x, y - 9); g.lineTo(x + 9, y); g.lineTo(x, y + 9); g.lineTo(x - 9, y);
        g.fill();
      }
    }
    // Medallion and its rings.
    g.save();
    g.translate(W / 2, H / 2);
    for (const [rad, col, lw] of [[300, '#22264a', 30], [250, '#b48a46', 5], [200, '#7a1c20', 40], [120, '#b48a46', 4], [70, '#22264a', 60]]) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      g.ellipse(0, 0, rad, rad * 0.88, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(190,150,80,0.4)';
    for (let i = 0; i < 16; i++) {
      g.rotate(Math.PI / 8);
      g.beginPath();
      g.ellipse(0, 236, 16, 34, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // Chair track: lighter where the pile is crushed, about 2 m out.
    const track = g.createRadialGradient(W / 2, H / 2, W * 0.33, W / 2, H / 2, W * 0.45);
    track.addColorStop(0, 'rgba(200,170,140,0)');
    track.addColorStop(0.5, 'rgba(200,170,140,0.10)');
    track.addColorStop(1, 'rgba(200,170,140,0)');
    g.fillStyle = track;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 7000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,230,200,0.035)';
      g.fillRect(r() * W, r() * H, 2, 2);
    }
    return canvasTexture(c);
  });
}

/** Chip edge: an oxblood band with six cream inserts, the way a casino chip's
 *  edge spots read from across a table. Wraps once round the cylinder. */
function chipEdgeTexture() {
  return cachedTex('dg.chip.edge', () => {
    const c = makeCanvas(256, 16);
    const g = c.getContext('2d');
    g.fillStyle = '#7d1219';
    g.fillRect(0, 0, 256, 16);
    g.fillStyle = '#efe4c8';
    for (let i = 0; i < 6; i++) g.fillRect(i * (256 / 6) + 8, 0, 18, 16);
    return canvasTexture(c);
  });
}

/** Chip face: oxblood, cream spots at the rim, and a brass inlay. */
function chipFaceTexture() {
  return cachedTex('dg.chip.face', () => {
    const S = 128;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#7d1219';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#efe4c8';
    for (let i = 0; i < 6; i++) {
      g.save();
      g.translate(S / 2, S / 2);
      g.rotate(i * Math.PI / 3);
      g.fillRect(-7, -S / 2 + 2, 14, 14);
      g.restore();
    }
    g.fillStyle = '#c9a24c';
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.27, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#efe4c8';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.33, 0, Math.PI * 2);
    g.stroke();
    return canvasTexture(c);
  });
}

/* ------------------------------------------------------------------ */
/* Text fitting                                                        */
/* ------------------------------------------------------------------ */

/**
 * Wrap `text` to at most `maxLines` lines of `maxW` pixels, shrinking the font
 * from `size` until it fits or reaches `minSize`; a last line that still does
 * not fit is cut with an ellipsis. Returns { lines, size }.
 */
function fitText(g, text, { maxW, maxLines, size, minSize, weight = '700', family = 'Georgia, "Times New Roman", serif' }) {
  const words = String(text).split(/\s+/).filter(Boolean);
  let s = size;
  for (;;) {
    g.font = `${weight} ${s}px ${family}`;
    const lines = [];
    let line = '';
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w;
      if (g.measureText(trial).width <= maxW || !line) {
        line = trial;
      } else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    const widest = Math.max(0, ...lines.map((l) => g.measureText(l).width));
    if ((lines.length <= maxLines && widest <= maxW) || s <= minSize) {
      if (lines.length > maxLines) {
        lines.length = maxLines;
        lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, '')}…`;
      }
      return { lines, size: s };
    }
    s = Math.max(minSize, Math.floor(s * 0.9));
  }
}

/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

const BOARD_W = 2.3;
const BOARD_H = 1.26;
/* 1280 px across 2.30 m is 556 px/m. The words are drawn 60-70 px tall -- 11
 * to 13 cm on the wall -- which from the far chair (5.05 m) subtends 1.3-1.5
 * degrees: about 21 px of a 1080 p frame at the 70-degree camera. The B
 * overlay is the precise view; this has to be readable without it. */
const BOARD_PX_W = 1280;
const BOARD_PX_H = Math.round(BOARD_PX_W * BOARD_H / BOARD_W);

const BOARD_INK = {
  live: { bg: '#120d0a', header: '#e9d6a4', rule: '#b8913e', card: '#ece2c9', word: '#17110c' },
  dim: { bg: '#100d0b', header: '#6f675b', rule: '#4f4638', card: '#4b463f', word: '#24211d' },
};

function paintBoard(g, { category = null, words = [], highlightIndex = null, revealIndex = null, dim = false } = {}) {
  const W = BOARD_PX_W;
  const H = BOARD_PX_H;
  const ink = dim ? BOARD_INK.dim : BOARD_INK.live;
  g.fillStyle = ink.bg;
  g.fillRect(0, 0, W, H);
  // Black felt letter-board nap.
  g.fillStyle = 'rgba(255,255,255,0.018)';
  for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);

  const headH = Math.round(H * 0.16);
  if (category) {
    const fit = fitText(g, String(category).toUpperCase(), {
      maxW: W * 0.9, maxLines: 1, size: 74, minSize: 34, weight: '700',
    });
    g.fillStyle = ink.header;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${fit.size}px Georgia, "Times New Roman", serif`;
    g.fillText(fit.lines[0] ?? '', W / 2, headH * 0.56);
  }
  g.fillStyle = ink.rule;
  g.fillRect(W * 0.05, headH, W * 0.9, 5);

  const pad = 26;
  const gap = 16;
  const gridTop = headH + 24;
  const cellW = (W - pad * 2 - gap * 3) / 4;
  const cellH = (H - gridTop - pad - gap * 3) / 4;
  for (let i = 0; i < 16; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = pad + col * (cellW + gap);
    const y = gridTop + row * (cellH + gap);
    const reveal = !dim && revealIndex === i;
    const high = !dim && highlightIndex === i;
    let fill = ink.card;
    let text = ink.word;
    if (high) { fill = '#b3141e'; text = '#fff4e6'; }
    if (reveal) { fill = '#dcae3c'; text = '#1a1207'; }
    g.fillStyle = fill;
    g.fillRect(x, y, cellW, cellH);
    // A thin shadow under every card, as if pinned to the felt.
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(x + 3, y + cellH, cellW, 4);
    if (reveal) {
      g.strokeStyle = '#fff1b8';
      g.lineWidth = 8;
      g.strokeRect(x + 4, y + 4, cellW - 8, cellH - 8);
      if (high) {
        g.strokeStyle = '#b3141e';
        g.lineWidth = 6;
        g.strokeRect(x + 14, y + 14, cellW - 28, cellH - 28);
      }
    }
    const word = words?.[i];
    if (word == null || word === '') continue;
    const fit = fitText(g, String(word).toUpperCase(), {
      maxW: cellW * 0.88, maxLines: 2, size: 66, minSize: 30, weight: '700',
    });
    g.fillStyle = text;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${fit.size}px Georgia, "Times New Roman", serif`;
    const lh = fit.size * 1.05;
    const y0 = y + cellH / 2 - (lh * (fit.lines.length - 1)) / 2;
    fit.lines.forEach((l, k) => g.fillText(l, x + cellW / 2, y0 + k * lh));
  }
}

/* ------------------------------------------------------------------ */
/* Clue cards                                                          */
/* ------------------------------------------------------------------ */

/* A folded place card, 0.42 m wide with 0.21 m faces leaning 15 degrees off
 * vertical. Text is the clue, up to three lines, as big as it fits: a short
 * clue is ~70 px on a 768 px card (3.8 cm), legible from across the table. */
const CARD_W = 0.42;
const CARD_FACE = 0.21;
const CARD_LEAN = 0.26;
const CARD_PX_W = 768;
const CARD_PX_H = Math.round(CARD_PX_W * CARD_FACE / CARD_W);
/* A heavy sans, not the board's serif: at 2.6 m a serif's thin strokes were
 * averaged into the card stock by the mip chain and the ink read as a pale
 * orange smear. Thick strokes survive the minification. */
const CARD_FONT = '"Arial Black", "Helvetica Neue", Arial, sans-serif';

function paintCard(g, text) {
  const W = CARD_PX_W;
  const H = CARD_PX_H;
  g.fillStyle = '#efe6d0';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#7a1c20';
  g.lineWidth = 6;
  g.strokeRect(14, 14, W - 28, H - 28);
  g.strokeStyle = 'rgba(122,28,32,0.5)';
  g.lineWidth = 2;
  g.strokeRect(26, 26, W - 52, H - 52);
  if (text == null) return;
  const fit = fitText(g, text, { maxW: W - 90, maxLines: 3, size: 96, minSize: 40, weight: '800', family: CARD_FONT });
  g.fillStyle = '#0c0805';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${fit.size}px ${CARD_FONT}`;
  const lh = fit.size * 1.1;
  const y0 = H / 2 - (lh * (fit.lines.length - 1)) / 2;
  fit.lines.forEach((l, k) => g.fillText(l, W / 2, y0 + k * lh));
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

export function buildBackroom(scene, { renderer = null, M } = {}) {
  if (!M) throw new Error('buildBackroom needs M (src/world/materials.js makeMaterials())');
  const root = group('dg.backroom');
  scene.add(root);
  const add = (o) => { root.add(o); return o; };

  const colliders = [];
  const floorZones = [];
  const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;

  function solid(minX, minZ, maxX, maxZ, minY = 0, maxY = DG_CEIL) {
    const b = collider([minX, minY, minZ], [maxX, maxY, maxZ]);
    colliders.push(b);
    return b;
  }

  /* ---------------- palette ---------------- */
  const M_WALNUT = mat({ color: 0x3a2214, roughness: 0.5 });
  const M_WALNUT_DARK = mat({ color: 0x24150c, roughness: 0.48 });
  const M_LEATHER = mat({ color: 0x2b1510, roughness: 0.42 });        // chairs: oxblood gone nearly black
  const M_LEATHER_RAIL = mat({ color: 0x1a0f0a, roughness: 0.36 });   // the table rail, darker still
  const M_LEATHER_SEAM = mat({ color: 0x140a07, roughness: 0.6 });
  const M_BRASS = mat({ color: 0xb48e3e, roughness: 0.28, metalness: 0.88 });
  const M_BRASS_DULL = mat({ color: 0x8a6a30, roughness: 0.45, metalness: 0.8 });
  const M_IRON = mat({ color: 0x1b1b1d, roughness: 0.55, metalness: 0.6 });
  const M_PLASTER = mat({ color: 0x2d241e, roughness: 0.96 });
  const M_CEILING = mat({ color: 0x1c140f, roughness: 0.92 });
  const M_FELT = mat({ map: feltTexture(), roughness: 0.97 });
  const M_UNDER = mat({ color: 0x0c0806, roughness: 1 });
  /* Plain transparent glass, not transmissive: the transmission pass draws
   * only the opaque scene through it, so it hid the whiskey, and eight of
   * them are eight extra things in that pass for nothing a rocks glass needs.
   * The room's environment map gives it its edge. */
  const M_GLASS = new THREE.MeshStandardMaterial({
    color: 0xd8e2e6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.26, depthWrite: false,
  });
  /* OPAQUE ON PURPOSE. A transparent whiskey inside transparent (or
   * transmissive) crystal sorts behind it or vanishes -- in the first pass
   * every glass on the table read empty. Opaque, dark, a little glossy. */
  const M_WHISKEY = new THREE.MeshStandardMaterial({
    color: 0x5a2a08, roughness: 0.1, metalness: 0,
    emissive: new THREE.Color(0x2a1004), emissiveIntensity: 0.35,
  });
  const M_CREAM = mat({ color: 0xe9dfc8, roughness: 0.9 });
  // Deck backs: navy. Any red back -- even 0x3a0c10 -- read as salmon tiles
  // directly under the spot, which is the brightest place in the room.
  const M_CARD_BACK = mat({ color: 0x121830, roughness: 0.7 });

  /* ---------------- atmosphere ---------------- */
  scene.background = new THREE.Color(0x050304);
  // The Bing's density exactly (club.js: FogExp2(0x0a0a12, 0.014)), warmed.
  scene.fog = new THREE.FogExp2(0x0d0806, 0.014);
  if (renderer && !scene.environment) {
    // Brass, glass and the bottles need something to reflect, as in the Bing.
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const src = roomEnvironment();
    scene.environment = pmrem.fromEquirectangular(src).texture;
    scene.environmentIntensity = 0.2;
    pmrem.dispose();
  }

  /* ================================================================== */
  /* Shell: floor, rug, walls, ceiling                                   */
  /* ================================================================== */
  const R = DG_ROOM;
  const RW = R.x1 - R.x0;
  const RD = R.z1 - R.z0;
  {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(RW, RD),
      mat({ map: tiled(woodFloor(), RW, RD), color: 0x7a5a46, roughness: 0.5 }),
    );
    floor.name = 'dg.floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2);
    floor.receiveShadow = true;
    add(floor);

    // 5.4 x 4.6 m: every chair stands on it with its back legs, so nobody
    // rocks on the edge of a rug.
    const rug = box({
      name: 'dg.rug', size: [5.4, 0.01, 4.6], pos: [DG_TABLE.x, 0.005, DG_TABLE.z],
      mat: mat({ map: rugTexture(), roughness: 1 }), cast: false,
    });
    add(rug);
    floorZones.push({
      box: new THREE.Box3(new THREE.Vector3(DG_TABLE.x - 2.7, -1, DG_TABLE.z - 2.3), new THREE.Vector3(DG_TABLE.x + 2.7, 1, DG_TABLE.z + 2.3)),
      surface: 'rug',
    });
    floorZones.push({
      box: new THREE.Box3(new THREE.Vector3(R.x0, -1, R.z0), new THREE.Vector3(R.x1, 1, R.z1)),
      surface: 'wood',
    });

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), M_CEILING);
    ceil.name = 'dg.ceiling';
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((R.x0 + R.x1) / 2, DG_CEIL, (R.z0 + R.z1) / 2);
    add(ceil);
    // Two walnut beams across the short way, clear of the pendant's rose.
    for (const bx of [-2.3, 2.3]) {
      add(box({ name: 'dg.ceiling.beam', size: [0.2, 0.16, RD], pos: [bx, DG_CEIL - 0.08, 0], mat: M_WALNUT_DARK }));
    }
    // A water stain over the bar corner: the men's room is above it.
    const stain = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 24),
      new THREE.MeshStandardMaterial({ color: 0x3a2a18, transparent: true, opacity: 0.35, roughness: 1, depthWrite: false }),
    );
    stain.name = 'dg.ceiling.stain';
    stain.rotation.x = Math.PI / 2;
    stain.scale.set(1, 0.7, 1);
    stain.position.set(3.4, DG_CEIL - 0.002, -2.4);
    add(stain);
  }

  /* Walls. Each run is built from the room side out: plaster core, upper
   * walnut boards, raised-panel wainscot, chair rail at 1.0 m, skirting,
   * crown. `gaps` are [from, to] doorways along the run. */
  const M_UPPER_CACHE = new Map();
  function upperMat(len) {
    const key = Math.round(len * 10);
    if (!M_UPPER_CACHE.has(key)) {
      M_UPPER_CACHE.set(key, mat({ map: tiled(panelling('#4a2c19'), len / 1.6, 1), roughness: 0.58 }));
    }
    return M_UPPER_CACHE.get(key);
  }
  function wainscotMat(len) {
    return mat({ map: tiled(wainscotTexture(), len / 1.1, 1), roughness: 0.55 });
  }
  function wallRun(axis, fixed, from, to, inward, gaps = []) {
    // inward: +1 if the room is on the + side of `fixed`.
    const segs = [];
    let a = from;
    for (const [g0, g1] of gaps) { segs.push([a, g0]); a = g1; }
    segs.push([a, to]);
    const place = (along, out, y, len, h, depth, material, name) => {
      const off = fixed + inward * out;
      const size = axis === 'x' ? [len, h, depth] : [depth, h, len];
      const pos = axis === 'x' ? [along, y, off] : [off, y, along];
      return add(box({ name, size, pos, mat: material }));
    };
    for (const [s0, s1] of segs) {
      const len = s1 - s0;
      if (len <= 0.01) continue;
      const mid = (s0 + s1) / 2;
      place(mid, -WALL_T / 2, DG_CEIL / 2, len, DG_CEIL, WALL_T, M_PLASTER, 'dg.wall.core');
      place(mid, 0.006, (WAINSCOT_H + DG_CEIL) / 2, len, DG_CEIL - WAINSCOT_H, 0.012, upperMat(len), 'dg.wall.panelling');
      place(mid, 0.012, WAINSCOT_H / 2, len, WAINSCOT_H, 0.024, wainscotMat(len), 'dg.wall.wainscot');
      place(mid, 0.03, 0.07, len, 0.14, 0.036, M_WALNUT_DARK, 'dg.wall.skirting');
      place(mid, 0.035, WAINSCOT_H + 0.02, len, 0.06, 0.05, M_WALNUT, 'dg.wall.chair-rail');
      place(mid, 0.04, DG_CEIL - 0.06, len, 0.12, 0.08, M_WALNUT_DARK, 'dg.wall.crown');
      if (axis === 'x') solid(s0, Math.min(fixed, fixed - inward * WALL_T), s1, Math.max(fixed, fixed - inward * WALL_T));
      else solid(Math.min(fixed, fixed - inward * WALL_T), s0, Math.max(fixed, fixed - inward * WALL_T), s1);
    }
    for (const [g0, g1] of gaps) {
      const len = g1 - g0;
      const mid = (g0 + g1) / 2;
      place(mid, -WALL_T / 2, (DOOR_H + DG_CEIL) / 2, len, DG_CEIL - DOOR_H, WALL_T, M_PLASTER, 'dg.wall.lintel');
      place(mid, 0.006, (DOOR_H + DG_CEIL) / 2, len, DG_CEIL - DOOR_H, 0.012, upperMat(len), 'dg.wall.panelling');
      place(mid, 0.04, DG_CEIL - 0.06, len, 0.12, 0.08, M_WALNUT_DARK, 'dg.wall.crown');
    }
  }
  wallRun('x', R.z0, R.x0 - WALL_T, R.x1 + WALL_T, +1);                         // north: the board wall
  wallRun('x', R.z1, R.x0 - WALL_T, R.x1 + WALL_T, -1);                         // south
  wallRun('z', R.x1, R.z0, R.z1, -1);                                           // east: the bar
  wallRun('z', R.x0, R.z0, R.z1, +1, [[-DOOR_W / 2, DOOR_W / 2]]);             // west: the door

  /* ================================================================== */
  /* The table                                                           */
  /* ================================================================== */
  const T = DG_TABLE;
  {
    const table = group('dg.table');
    table.position.set(T.x, 0, T.z);
    // Felt: a 5 cm slab whose top is the playing surface. 64 segments, so
    // the rim is a circle from 0.5 m away and not a polygon.
    const feltGeo = new THREE.CylinderGeometry(T.feltR, T.feltR, 0.05, 64);
    const felt = new THREE.Mesh(feltGeo, [M_LEATHER_RAIL, M_FELT, M_UNDER]);
    felt.name = 'dg.table.felt';
    felt.position.y = T.topY - 0.025;
    felt.receiveShadow = true;
    table.add(felt);
    // The rail: padded leather, squashed to 13 cm tall and 17 cm wide, its
    // inner edge lapping the felt by 5 mm so there is no daylight between.
    const rail = new THREE.Mesh(new THREE.TorusGeometry(T.radius - 0.085, 0.085, 16, 96), M_LEATHER_RAIL);
    rail.name = 'dg.table.rail';
    rail.rotation.x = Math.PI / 2;
    rail.scale.set(1, 1, 0.76);
    rail.position.y = T.topY + 0.02;
    rail.castShadow = true;
    rail.receiveShadow = true;
    table.add(rail);
    // Brass: a bead where the felt meets the leather, and one under the rail.
    const bead = new THREE.Mesh(new THREE.TorusGeometry(T.feltR - 0.004, 0.008, 6, 128), M_BRASS);
    bead.name = 'dg.table.brass-bead';
    bead.rotation.x = Math.PI / 2;
    bead.position.y = T.topY + 0.004;
    table.add(bead);
    const lower = new THREE.Mesh(new THREE.TorusGeometry(T.radius - 0.035, 0.008, 6, 128), M_BRASS);
    lower.name = 'dg.table.brass-trim';
    lower.rotation.x = Math.PI / 2;
    lower.position.y = T.topY - 0.045;
    table.add(lower);
    // Walnut apron under the rail.
    table.add(cylinder({ name: 'dg.table.apron', r: T.radius - 0.05, h: 0.11, pos: [0, T.topY - 0.105, 0], mat: M_WALNUT_DARK, seg: 64 }));
    // Pedestal: a turned column with a brass collar on four splayed feet.
    table.add(cylinder({ name: 'dg.table.column', rTop: 0.15, rBottom: 0.21, h: 0.52, pos: [0, 0.36, 0], mat: M_WALNUT }));
    table.add(cylinder({ name: 'dg.table.collar', r: 0.175, h: 0.04, pos: [0, 0.6, 0], mat: M_BRASS }));
    table.add(cylinder({ name: 'dg.table.collar', r: 0.23, h: 0.04, pos: [0, 0.12, 0], mat: M_BRASS }));
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const foot = box({ name: 'dg.table.foot', size: [0.11, 0.09, 0.62], pos: [Math.sin(a) * 0.43, 0.045, Math.cos(a) * 0.43], mat: M_WALNUT_DARK, rotY: a });
      table.add(foot);
      table.add(cylinder({ name: 'dg.table.foot-cap', r: 0.05, h: 0.03, pos: [Math.sin(a) * 0.74, 0.015, Math.cos(a) * 0.74], mat: M_BRASS }));
    }

    // The shoe: a walnut dealing shoe with a brass face plate, off centre so
    // the middle of the felt stays open, and the rest of the deck beside it.
    const shoe = group('dg.table.shoe');
    shoe.position.set(0.16, T.topY, -0.12);
    shoe.rotation.y = 0.5;
    shoe.add(box({ size: [0.11, 0.075, 0.2], pos: [0, 0.0375, 0], mat: M_WALNUT_DARK }));
    shoe.add(box({ size: [0.112, 0.05, 0.006], pos: [0, 0.03, 0.101], mat: M_BRASS }));
    shoe.add(box({ size: [0.09, 0.012, 0.16], pos: [0, 0.08, -0.01], mat: mat({ color: 0x7a1c20, roughness: 0.8 }), rotX: -0.18 }));
    table.add(shoe);
    const deck = box({ name: 'dg.table.deck', size: [0.065, 0.02, 0.09], pos: [-0.14, T.topY + 0.01, 0.1], mat: M_CARD_BACK, rotY: -0.3 });
    table.add(deck);
    for (let k = 0; k < 3; k++) {
      table.add(box({
        name: 'dg.table.card', size: [0.064, 0.002, 0.089],
        pos: [-0.02 + k * 0.05, T.topY + 0.001 + k * 0.002, 0.2 + k * 0.012],
        mat: M_CARD_BACK, rotY: 0.4 + k * 0.5, cast: false,
      }));
    }
    add(table);
    solid(T.x - T.radius, T.z - T.radius, T.x + T.radius, T.z + T.radius, 0, T.topY + 0.09);
  }

  /* ================================================================== */
  /* Chairs, glasses, clue cards, chips                                  */
  /* ================================================================== */

  /**
   * A low club chair in dark leather. Built to the shared seated rig: cushion
   * top at 0.53, arms at 0.66, and the back topping out at 0.98 -- under a
   * seated head (1.10-1.45 m) so it frames the face from behind and never
   * covers it. The front is local +z.
   */
  function makeClubChair(name) {
    const g = group(name);
    // Body: a tub from 0.09 to 0.40 m on four short walnut feet.
    g.add(box({ name: `${name}.body`, size: [0.66, 0.31, 0.6], pos: [0, 0.245, -0.01], mat: M_LEATHER }));
    g.add(box({ name: `${name}.cushion`, size: [0.5, 0.13, 0.52], pos: [0, DG_SIT_Y - 0.065, 0.03], mat: M_LEATHER }));
    g.add(box({ name: `${name}.welt`, size: [0.505, 0.012, 0.525], pos: [0, DG_SIT_Y - 0.004, 0.03], mat: M_LEATHER_SEAM, cast: false }));
    for (const sx of [-1, 1]) {
      g.add(box({ name: `${name}.arm`, size: [0.09, 0.27, 0.6], pos: [sx * 0.29, 0.53, -0.01], mat: M_LEATHER }));
      // Rolled arm front, and the brass nailhead line down it.
      g.add(cylinder({ name: `${name}.arm-roll`, r: 0.06, h: 0.6, pos: [sx * 0.3, 0.66, -0.01], rotX: Math.PI / 2, mat: M_LEATHER }));
      g.add(box({ name: `${name}.nailhead`, size: [0.012, 0.22, 0.006], pos: [sx * 0.29, 0.5, 0.292], mat: M_BRASS, cast: false }));
      for (const sz of [-1, 1]) {
        g.add(cylinder({ name: `${name}.foot`, rTop: 0.03, rBottom: 0.022, h: 0.09, pos: [sx * 0.27, 0.045, sz * 0.24], mat: M_WALNUT_DARK }));
      }
    }
    // Back: raked 0.12 rad, tufted, with a nailhead line along the top.
    const back = group(`${name}.back`);
    back.position.set(0, 0.4, -0.25);
    back.rotation.x = -0.12;
    back.add(box({ name: `${name}.back-pad`, size: [0.66, 0.58, 0.14], pos: [0, 0.29, 0], mat: M_LEATHER }));
    back.add(cylinder({ name: `${name}.back-roll`, r: 0.07, h: 0.66, pos: [0, 0.57, -0.005], rotZ: Math.PI / 2, mat: M_LEATHER }));
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        back.add(sphere({ name: `${name}.tuft`, r: 0.014, pos: [(col - 1) * 0.17, 0.2 + row * 0.18, 0.072], mat: M_LEATHER_SEAM, cast: false }));
      }
    }
    back.add(box({ name: `${name}.nailhead`, size: [0.58, 0.012, 0.006], pos: [0, 0.06, 0.072], mat: M_BRASS, cast: false }));
    g.add(back);
    return g;
  }

  /** A heavy rocks glass with two fingers in it and one cube. 8.6 cm tall. */
  function makeRocksGlass(name) {
    const g = group(name);
    g.add(cylinder({ name: `${name}.wall`, rTop: 0.041, rBottom: 0.037, h: 0.086, pos: [0, 0.043, 0], mat: M_GLASS, seg: 24 }));
    g.add(cylinder({ name: `${name}.base`, r: 0.036, h: 0.014, pos: [0, 0.007, 0], mat: M_GLASS, seg: 24 }));
    const liquid = cylinder({ name: `${name}.whiskey`, rTop: 0.037, rBottom: 0.035, h: 0.03, pos: [0, 0.03, 0], mat: M_WHISKEY, seg: 24 });
    g.add(liquid);
    g.add(box({ name: `${name}.ice`, size: [0.03, 0.028, 0.03], pos: [0.006, 0.045, -0.004], mat: M_GLASS, rotY: 0.4, rotZ: 0.2 }));
    g.userData.liquid = liquid;
    return g;
  }

  const CHIP_R = 0.036;
  const CHIP_H = 0.012;
  const chipGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 32);
  const chipEdge = new THREE.MeshStandardMaterial({ map: chipEdgeTexture(), roughness: 0.5 });
  const chipFace = new THREE.MeshStandardMaterial({
    map: chipFaceTexture(), roughness: 0.42, emissive: new THREE.Color(0x2a1a06), emissiveIntensity: 0.0,
  });
  const chipMats = [chipEdge, chipFace, chipFace];

  const seatAnchors = [];
  const chairs = [];
  const glasses = [];
  const cards = [];
  const stacks = [];
  for (let s = 0; s < SEAT_COUNT; s++) {
    const a = seatAnchor(s);
    seatAnchors.push(a);

    const chair = makeClubChair(`dg.seat.${s}.chair`);
    chair.position.set(a.x, 0, a.z);
    chair.rotation.y = a.faceYaw;
    chair.userData.seat = s;
    add(chair);
    chairs.push(chair);
    const hx = 0.37;
    const hz = 0.36;
    const wx = Math.abs(Math.cos(a.faceYaw)) * hx + Math.abs(Math.sin(a.faceYaw)) * hz;
    const wz = Math.abs(Math.sin(a.faceYaw)) * hx + Math.abs(Math.cos(a.faceYaw)) * hz;
    solid(a.x - wx, a.z - wz, a.x + wx, a.z + wz, 0, 1.0);

    // Glass on the player's right, 0.98 m out: just inside the bead.
    const gp = feltPoint(s, 0.97, 0.24);
    const glass = makeRocksGlass(`dg.seat.${s}.glass`);
    glass.position.set(gp.x, T.topY, gp.z);
    glass.userData.seat = s;
    add(glass);
    glasses.push(glass);

    // Chips on the left.
    const cp = feltPoint(s, 0.97, -0.22);
    const stack = group(`dg.seat.${s}.chips`);
    stack.position.set(cp.x, T.topY, cp.z);
    stack.userData = { seat: s, count: 0, built: 0 };
    add(stack);
    stacks.push(stack);

    // The clue card, standing at 0.80 m, face toward the table centre.
    const cardCanvas = makeCanvas(CARD_PX_W, CARD_PX_H);
    const cardG = cardCanvas.getContext('2d');
    const cardTex = canvasTexture(cardCanvas, { aniso: maxAniso });
    const cardMat = new THREE.MeshStandardMaterial({
      map: cardTex, roughness: 0.85,
      // The same trick as the blackjack cards: a little self-light so ink
      // on card stock stays black-on-cream when the lamp is behind a head.
      emissive: new THREE.Color(0xffffff), emissiveMap: cardTex, emissiveIntensity: 0.3,
    });
    const cardBack = mat({ color: 0xe2d8c0, roughness: 0.9 });
    const kp = feltPoint(s, 0.8, 0);
    const card = group(`dg.seat.${s}.clue`);
    card.position.set(kp.x, T.topY, kp.z);
    card.rotation.y = a.faceYaw + Math.PI;   // local +z toward the OWNER; the inner face is built at -z
    for (const side of [1, -1]) {
      const leaf = group(`dg.seat.${s}.clue.${side > 0 ? 'owner' : 'table'}`);
      leaf.rotation.y = side > 0 ? 0 : Math.PI;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_FACE), cardMat);
      face.name = `dg.seat.${s}.clue.face`;
      face.position.set(0, (CARD_FACE / 2) * Math.cos(CARD_LEAN), (CARD_FACE / 2) * Math.sin(CARD_LEAN));
      face.rotation.x = -CARD_LEAN;
      face.castShadow = true;
      const rear = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_FACE), cardBack);
      rear.name = `dg.seat.${s}.clue.inside`;
      rear.position.copy(face.position).multiplyScalar(0.999);
      rear.rotation.set(-CARD_LEAN, Math.PI, 0);
      leaf.add(face, rear);
      card.add(leaf);
    }
    card.visible = false;
    add(card);
    cards.push({ group: card, canvas: cardCanvas, g: cardG, texture: cardTex, text: null });
  }

  /* ================================================================== */
  /* Pendant: the key light                                              */
  /* ================================================================== */
  const lamp = { rimY: 1.9 };
  {
    const pendant = group('dg.pendant');
    pendant.position.set(T.x, 0, T.z);
    // Ceiling rose and a brass rod down to the drum.
    pendant.add(cylinder({ name: 'dg.pendant.rose', r: 0.12, h: 0.03, pos: [0, DG_CEIL - 0.015, 0], mat: M_BRASS }));
    pendant.add(cylinder({ name: 'dg.pendant.rod', r: 0.012, h: DG_CEIL - 2.18, pos: [0, (DG_CEIL + 2.18) / 2, 0], mat: M_BRASS }));
    // The drum: amber silk over a brass frame, 0.9 m across, 28 cm deep.
    // A 1.1 m drum filled the top fifth of every seated view.
    const silk = new THREE.MeshStandardMaterial({
      color: 0x9a5a1c, roughness: 0.8, side: THREE.DoubleSide,
      emissive: new THREE.Color(0xff9a3a), emissiveIntensity: 0.55,
    });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.45, 0.28, 48, 1, true), silk);
    drum.name = 'dg.pendant.shade';
    drum.position.y = lamp.rimY + 0.14;
    drum.castShadow = false;
    pendant.add(drum);
    for (const [ry, rr] of [[lamp.rimY + 0.28, 0.37], [lamp.rimY, 0.45]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.008, 6, 64), M_BRASS);
      ring.name = 'dg.pendant.frame';
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ry;
      pendant.add(ring);
    }
    // A frosted diffuser across the bottom: what everyone at the table sees
    // when they look up, and the reason nobody looks up for long.
    const diffuser = new THREE.Mesh(new THREE.CircleGeometry(0.43, 48), lit(0xffc27a, 0.75));
    diffuser.name = 'dg.pendant.diffuser';
    diffuser.rotation.x = Math.PI / 2;
    diffuser.position.y = lamp.rimY + 0.03;
    pendant.add(diffuser);
    // Cap on top so the silk does not show the ceiling through it.
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.37, 48), mat({ color: 0x2a1a0c, roughness: 0.8, side: THREE.DoubleSide }));
    cap.name = 'dg.pendant.cap';
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = lamp.rimY + 0.28;
    pendant.add(cap);
    add(pendant);

    // Spot: the cone onto the felt. Reaches r 1.9 at felt height, i.e. the
    // whole table and the players' hands, and stops short of their faces.
    const spot = new THREE.SpotLight(0xffc98a, 22, 5, 0.98, 0.55, 2);
    spot.name = 'dg.light.pendant-spot';
    spot.position.set(T.x, lamp.rimY + 0.02, T.z);
    spot.target.position.set(T.x, 0, T.z);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.2;
    spot.shadow.camera.far = 4;
    add(spot);
    add(spot.target);
    // Faces: an unshadowed point at the drum. At 1.93 m from every face this
    // is the light the whole game is played in.
    const faceLight = new THREE.PointLight(0xffc690, 7.5, 6.5, 2);
    faceLight.name = 'dg.light.pendant-faces';
    faceLight.position.set(T.x, lamp.rimY + 0.04, T.z);
    add(faceLight);
    lamp.spot = spot;
    lamp.faceLight = faceLight;
  }

  // Low, warm, almost nothing: so the far corners are dark, not black.
  add(new THREE.HemisphereLight(0x5a4232, 0x140c08, 0.55));

  /* ================================================================== */
  /* Sconces                                                             */
  /* ================================================================== */
  const sconces = [];
  /** A brass wall sconce: oval backplate, swan arm, amber glass tulip. */
  function sconce(id, wallAxis, fixed, along, inward, y = 1.82) {
    const g = group(`dg.sconce.${id}`);
    const out = (d) => fixed + inward * d;
    if (wallAxis === 'x') { g.position.set(along, y, out(0)); g.rotation.y = inward > 0 ? 0 : Math.PI; } else { g.position.set(out(0), y, along); g.rotation.y = inward > 0 ? Math.PI / 2 : -Math.PI / 2; }
    g.add(box({ name: `dg.sconce.${id}.plate`, size: [0.1, 0.2, 0.018], pos: [0, 0, 0.009], mat: M_BRASS }));
    g.add(cylinder({ name: `dg.sconce.${id}.arm`, r: 0.009, h: 0.14, pos: [0, -0.02, 0.08], rotX: Math.PI / 2, mat: M_BRASS }));
    g.add(cylinder({ name: `dg.sconce.${id}.stem`, r: 0.009, h: 0.08, pos: [0, 0.02, 0.15], mat: M_BRASS }));
    g.add(cylinder({ name: `dg.sconce.${id}.cup`, rTop: 0.03, rBottom: 0.018, h: 0.03, pos: [0, 0.07, 0.15], mat: M_BRASS }));
    const tulip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.035, 0.13, 20, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xa8641e, emissive: new THREE.Color(0xffa64a), emissiveIntensity: 1.3,
        roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.92,
      }),
    );
    tulip.name = `dg.sconce.${id}.glass`;
    tulip.position.set(0, 0.145, 0.15);
    g.add(tulip);
    g.add(sphere({ name: `dg.sconce.${id}.bulb`, r: 0.022, pos: [0, 0.12, 0.15], mat: lit(0xffe0b0, 2.4), cast: false }));
    add(g);
    const light = new THREE.PointLight(0xffb06a, 2.2, 4.2, 2);
    light.name = `dg.light.sconce.${id}`;
    const wp = new THREE.Vector3(0, 0.14, 0.2);
    g.updateMatrixWorld(true);
    g.localToWorld(wp);
    light.position.copy(wp);
    add(light);
    const entry = { group: g, light, glass: tulip, base: light.intensity, baseGlow: 1.3, next: 0, dip: 0 };
    sconces.push(entry);
    return entry;
  }
  sconce('n.w', 'x', R.z0, -1.62, +1);
  sconce('n.e', 'x', R.z0, 1.62, +1);
  sconce('s.w', 'x', R.z1, -1.25, -1);
  const tiredSconce = sconce('s.e', 'x', R.z1, 1.25, -1);
  // One on the door wall, south of the frame, so the door end is a lit wall
  // with a dark doorway in it rather than a dark wall.
  sconce('w', 'z', R.x0, 1.15, +1);
  // The one by the clock has a loose bulb. It has had one since 1987.
  tiredSconce.flicker = true;

  /* ================================================================== */
  /* The board                                                           */
  /* ================================================================== */
  /* As high as the room allows: 1.17-2.43 m, the lamp hood under the crown
   * at 2.54. From the far chairs the line to the board passes the two
   * nearest heads at 3.4 m and climbs 8.5 cm a metre, so it clears a 1.5 m
   * crown by 1.62 m at the wall; at 1.74 m the bottom two rows of the left
   * column were behind seat 1's head from seat 6. Now only the bottom row's
   * lower half can be, and only from those two chairs. */
  const boardAnchor = { x: 0, y: 1.8, z: R.z0 + 0.075, yaw: 0 };
  const board = (() => {
    const g = group('dg.board.assembly');
    g.position.set(boardAnchor.x, boardAnchor.y, R.z0);
    // Walnut frame 9 cm proud of the wall with a brass sight edge.
    g.add(box({ name: 'dg.board.frame', size: [BOARD_W + 0.16, BOARD_H + 0.16, 0.06], pos: [0, 0, 0.03], mat: M_WALNUT_DARK }));
    g.add(box({ name: 'dg.board.sight-edge', size: [BOARD_W + 0.03, BOARD_H + 0.03, 0.068], pos: [0, 0, 0.034], mat: M_BRASS }));
    const canvas = makeCanvas(BOARD_PX_W, BOARD_PX_H);
    const ctx = canvas.getContext('2d');
    const texture = canvasTexture(canvas, { aniso: maxAniso });
    const material = new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.92,
      emissive: new THREE.Color(0xffffff), emissiveMap: texture, emissiveIntensity: 0.45,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), material);
    mesh.name = 'dg.board';
    mesh.position.set(0, 0, 0.075);
    g.add(mesh);
    // Picture lamp: a brass hood over the top rail with a lit strip under it.
    g.add(box({ name: 'dg.board.lamp-arm', size: [0.03, 0.03, 0.2], pos: [-0.5, BOARD_H / 2 + 0.11, 0.1], mat: M_BRASS }));
    g.add(box({ name: 'dg.board.lamp-arm', size: [0.03, 0.03, 0.2], pos: [0.5, BOARD_H / 2 + 0.11, 0.1], mat: M_BRASS }));
    g.add(cylinder({ name: 'dg.board.lamp-hood', r: 0.04, h: 1.3, pos: [0, BOARD_H / 2 + 0.11, 0.2], rotZ: Math.PI / 2, mat: M_BRASS }));
    g.add(box({ name: 'dg.board.lamp-strip', size: [1.24, 0.012, 0.03], pos: [0, BOARD_H / 2 + 0.075, 0.2], mat: lit(0xffe2b0, 2.0), cast: false }));
    add(g);
    solid(-BOARD_W / 2 - 0.1, R.z0, BOARD_W / 2 + 0.1, R.z0 + 0.1, boardAnchor.y - BOARD_H / 2, boardAnchor.y + BOARD_H / 2);
    const state = { category: null, words: [], highlightIndex: null, revealIndex: null, dim: true };
    function paint(next = {}) {
      Object.assign(state, {
        category: next.category ?? null,
        words: Array.isArray(next.words) ? next.words.slice(0, 16) : [],
        highlightIndex: Number.isInteger(next.highlightIndex) ? next.highlightIndex : null,
        revealIndex: Number.isInteger(next.revealIndex) ? next.revealIndex : null,
        dim: !!next.dim,
      });
      paintBoard(ctx, state);
      texture.needsUpdate = true;
      material.emissiveIntensity = state.dim ? 0.3 : 0.45;
    }
    paint({ dim: true });
    return { paint, mesh, texture, canvas, material, state };
  })();

  /* ================================================================== */
  /* The bar (east wall)                                                 */
  /* ================================================================== */
  const barAnchor = { x: R.x1 - 0.85, z: 0 };
  {
    const bar = group('dg.bar');
    const bx0 = R.x1 - 0.56;
    const bz0 = -1.2;
    const bz1 = 1.2;
    const bw = bz1 - bz0;
    // Cabinet: walnut with raised-panel doors, black marble top at 0.96 m.
    bar.add(box({ name: 'dg.bar.cabinet', size: [0.54, 0.92, bw], pos: [bx0 + 0.27, 0.46, 0], mat: M_WALNUT_DARK }));
    bar.add(box({ name: 'dg.bar.doors', size: [0.01, 0.74, bw - 0.08], pos: [bx0 - 0.004, 0.5, 0], mat: wainscotMat(bw) }));
    bar.add(box({ name: 'dg.bar.kick', size: [0.02, 0.1, bw], pos: [bx0 + 0.02, 0.05, 0], mat: M_UNDER }));
    bar.add(box({ name: 'dg.bar.top', size: [0.6, 0.04, bw + 0.06], pos: [bx0 + 0.26, 0.94, 0], mat: mat({ color: 0x141214, roughness: 0.18, metalness: 0.1 }) }));
    bar.add(box({ name: 'dg.bar.brass-edge', size: [0.012, 0.03, bw + 0.06], pos: [bx0 - 0.04, 0.94, 0], mat: M_BRASS }));
    for (const z of [-0.6, 0, 0.6]) {
      bar.add(cylinder({ name: 'dg.bar.pull', r: 0.008, h: 0.12, pos: [bx0 - 0.02, 0.8, z], mat: M_BRASS }));
    }
    // Back bar: a smoked mirror in a walnut surround, two glass shelves.
    bar.add(box({ name: 'dg.bar.surround', size: [0.04, 1.36, bw + 0.1], pos: [R.x1 - 0.02, 1.68, 0], mat: M_WALNUT_DARK }));
    const mirror = box({ name: 'dg.bar.mirror', size: [0.01, 1.2, bw - 0.08], pos: [R.x1 - 0.045, 1.66, 0], mat: mat({ color: 0x2e2a26, roughness: 0.12, metalness: 1.0 }) });
    bar.add(mirror);
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0xbfd0d0, roughness: 0.1, transparent: true, opacity: 0.35 });
    for (const sy of [1.36, 1.8]) {
      bar.add(box({ name: 'dg.bar.shelf', size: [0.24, 0.016, bw - 0.12], pos: [R.x1 - 0.17, sy, 0], mat: shelfMat, cast: false }));
      bar.add(box({ name: 'dg.bar.shelf-light', size: [0.02, 0.01, bw - 0.14], pos: [R.x1 - 0.06, sy - 0.015, 0], mat: lit(0xffc27a, 1.8), cast: false }));
      for (const z of [bz0 + 0.08, bz1 - 0.08]) {
        bar.add(box({ name: 'dg.bar.bracket', size: [0.22, 0.03, 0.02], pos: [R.x1 - 0.16, sy - 0.02, z], mat: M_BRASS }));
      }
    }
    add(bar);
    solid(bx0 - 0.05, bz0 - 0.03, R.x1, bz1 + 0.03, 0, 1.0);

    // Bottles. The square-shouldered ones are the flat's own whiskey; the
    // rest are cut from primitives here: gin, an amaro, sambuca, a rye, and
    // the good scotch nobody is offered.
    const shelfBottles = (sy, list) => {
      list.forEach((spec, i) => {
        const z = bz0 + 0.2 + i * ((bw - 0.4) / (list.length - 1));
        if (spec === 'whiskey') {
          const b = makeWhiskeyBottle(M, { x: R.x1 - 0.17, y: sy + 0.008, z, rotY: -Math.PI / 2 });
          b.group.name = 'dg.bar.bottle.whiskey';
          add(b.group);
        } else {
          add(makeBottle(spec, R.x1 - 0.17, sy + 0.008, z));
        }
      });
    };
    shelfBottles(1.36, ['whiskey', 'gin', 'amaro', 'whiskey', 'rye', 'sambuca', 'whiskey']);
    shelfBottles(1.8, ['scotch', 'amaro', 'gin', 'whiskey', 'rye', 'scotch']);

    // On the bar top: the decanter, an ice bucket, glasses upside-down on a
    // towel, and a bottle that has been opened tonight.
    const topY = 0.96;
    add(makeDecanter(R.x1 - 0.3, topY, -0.5));
    {
      const bucket = group('dg.bar.ice-bucket');
      bucket.position.set(R.x1 - 0.3, topY, 0.35);
      bucket.add(cylinder({ rTop: 0.09, rBottom: 0.075, h: 0.18, pos: [0, 0.09, 0], mat: M_BRASS_DULL }));
      bucket.add(cylinder({ r: 0.085, h: 0.01, pos: [0, 0.175, 0], mat: mat({ color: 0xd8e4ea, roughness: 0.2 }) }));
      add(bucket);
    }
    add(box({ name: 'dg.bar.towel', size: [0.24, 0.006, 0.36], pos: [R.x1 - 0.3, topY + 0.003, -0.02], mat: M_CREAM, cast: false }));
    for (let k = 0; k < 6; k++) {
      const gl = makeRocksGlass(`dg.bar.glass.${k}`);
      gl.remove(gl.userData.liquid);
      gl.rotation.x = Math.PI;
      gl.position.set(R.x1 - 0.36 + (k % 2) * 0.1, topY + 0.087, -0.14 + Math.floor(k / 2) * 0.1);
      add(gl);
    }
    const open = makeWhiskeyBottle(M, { x: R.x1 - 0.3, y: topY, z: 0.85, rotY: -1.2 });
    open.group.name = 'dg.bar.bottle.open';
    add(open.group);
    const shot = makeShotGlass(M, { x: R.x1 - 0.42, y: topY, z: 0.75 });
    shot.group.name = 'dg.bar.shot';
    add(shot.group);

    const barLight = new THREE.PointLight(0xffb873, 1.6, 3.2, 2);
    barLight.name = 'dg.light.back-bar';
    barLight.position.set(R.x1 - 0.5, 1.95, 0);
    add(barLight);
  }

  /** A bottle cut from primitives, by kind. */
  function makeBottle(kind, x, y, z) {
    const SPECS = {
      gin: { colour: 0x7fb0a0, opacity: 0.45, body: 0.2, r: 0.038, neck: 0.07, label: 0xe8e2cc, cap: 0x2a2a2a },
      amaro: { colour: 0x2a1408, opacity: 0.85, body: 0.21, r: 0.04, neck: 0.09, label: 0xd8c7a0, cap: 0x7a1c20 },
      sambuca: { colour: 0xdce6ea, opacity: 0.35, body: 0.24, r: 0.034, neck: 0.1, label: 0x1a3a7a, cap: 0xc9a24c },
      rye: { colour: 0x8a4a14, opacity: 0.7, body: 0.19, r: 0.04, neck: 0.08, label: 0xefe4c8, cap: 0x111111 },
      scotch: { colour: 0x6a3a10, opacity: 0.75, body: 0.2, r: 0.045, neck: 0.06, label: 0x1a1a1a, cap: 0xb48e3e },
    };
    const sp = SPECS[kind] ?? SPECS.rye;
    const g = group(`dg.bar.bottle.${kind}`);
    g.position.set(x, y, z);
    const glassMat = mat({ color: sp.colour, roughness: 0.08, transparent: true, opacity: sp.opacity });
    g.add(cylinder({ r: sp.r, h: sp.body, pos: [0, sp.body / 2, 0], mat: glassMat, seg: 18 }));
    g.add(cylinder({ rTop: 0.014, rBottom: sp.r * 0.9, h: 0.04, pos: [0, sp.body + 0.02, 0], mat: glassMat, seg: 18 }));
    g.add(cylinder({ r: 0.013, h: sp.neck, pos: [0, sp.body + 0.04 + sp.neck / 2, 0], mat: glassMat, seg: 12 }));
    g.add(cylinder({ r: 0.015, h: 0.022, pos: [0, sp.body + 0.04 + sp.neck, 0], mat: mat({ color: sp.cap, roughness: 0.4, metalness: 0.3 }), seg: 12 }));
    g.add(cylinder({ r: sp.r + 0.001, h: sp.body * 0.42, pos: [0, sp.body * 0.48, 0], mat: mat({ color: sp.label, roughness: 0.8 }), seg: 18 }));
    return g;
  }

  /** Cut-crystal decanter, a third full, stopper in. */
  function makeDecanter(x, y, z) {
    const g = group('dg.bar.decanter');
    g.position.set(x, y, z);
    const crystal = new THREE.MeshPhysicalMaterial({
      color: 0xe8eef0, roughness: 0.03, transmission: 0.9, thickness: 0.03, transparent: true, opacity: 0.4,
    });
    g.add(cylinder({ name: 'dg.bar.decanter.foot', r: 0.06, h: 0.02, pos: [0, 0.01, 0], mat: crystal }));
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), crystal);
    body.name = 'dg.bar.decanter.body';
    body.scale.set(1, 0.95, 1);
    body.position.y = 0.1;
    g.add(body);
    const spirit = new THREE.Mesh(new THREE.SphereGeometry(0.079, 18, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), M_WHISKEY);
    spirit.name = 'dg.bar.decanter.spirit';
    spirit.position.y = 0.1;
    g.add(spirit);
    g.add(cylinder({ name: 'dg.bar.decanter.neck', rTop: 0.022, rBottom: 0.03, h: 0.07, pos: [0, 0.2, 0], mat: crystal }));
    g.add(sphere({ name: 'dg.bar.decanter.stopper', r: 0.032, pos: [0, 0.26, 0], mat: crystal }));
    return g;
  }

  /* ================================================================== */
  /* The door and the stairs up                                          */
  /* ================================================================== */
  const doorAnchor = { x: R.x0, z: 0 };
  const stairs = { ...STAIRS };
  {
    const zN = -DOOR_W / 2;
    const zS = DOOR_W / 2;
    // Casing round the opening, on the room side.
    add(box({ name: 'dg.door.casing', size: [0.05, DOOR_H + 0.1, 0.1], pos: [R.x0 + 0.025, (DOOR_H + 0.1) / 2, zN - 0.05], mat: M_WALNUT_DARK }));
    add(box({ name: 'dg.door.casing', size: [0.05, DOOR_H + 0.1, 0.1], pos: [R.x0 + 0.025, (DOOR_H + 0.1) / 2, zS + 0.05], mat: M_WALNUT_DARK }));
    add(box({ name: 'dg.door.casing', size: [0.05, 0.12, DOOR_W + 0.2], pos: [R.x0 + 0.025, DOOR_H + 0.06, 0], mat: M_WALNUT_DARK }));
    add(box({ name: 'dg.door.threshold', size: [WALL_T + 0.04, 0.02, DOOR_W], pos: [R.x0 - WALL_T / 2, 0.01, 0], mat: M_BRASS_DULL }));

    // The leaf: 7 cm of oak with iron straps, a speakeasy grille at eye
    // height, a brass pull. Hung on the north jamb of the stairwell side and
    // standing open OUT onto the landing at 1.3 rad (74 degrees). Hung the
    // other way -- into the room, ajar -- the leaf itself covered all but
    // 18 cm of the doorway as seen from the table, and the stairs were a
    // rumour. Open outward, the whole flight reads from the far chairs, the
    // club's light coming down it, and the door is still there: three
    // inches of oak and iron, pinned back against the stairwell wall.
    const pivot = group('dg.door');
    pivot.position.set(R.x0 - WALL_T, 0, zN + 0.02);
    pivot.rotation.y = -1.3;
    const LW = DOOR_W - 0.02;
    const leafMat = mat({ color: 0x2c1a0f, roughness: 0.62 });
    pivot.add(box({ name: 'dg.door.leaf', size: [0.07, DOOR_H - 0.02, LW], pos: [0.035, (DOOR_H - 0.02) / 2, LW / 2], mat: leafMat }));
    for (const sy of [0.35, 1.0, 1.75]) {
      pivot.add(box({ name: 'dg.door.strap', size: [0.074, 0.06, LW * 0.72], pos: [0.035, sy, LW * 0.36], mat: M_IRON }));
      for (let k = 0; k < 4; k++) {
        pivot.add(sphere({ name: 'dg.door.rivet', r: 0.009, pos: [0.074, sy, 0.08 + k * 0.2], mat: M_IRON, cast: false }));
      }
    }
    pivot.add(box({ name: 'dg.door.grille-plate', size: [0.075, 0.16, 0.22], pos: [0.036, 1.58, LW / 2], mat: M_BRASS_DULL }));
    for (let k = 0; k < 4; k++) {
      pivot.add(cylinder({ name: 'dg.door.grille-bar', r: 0.006, h: 0.12, pos: [0.078, 1.58, LW / 2 - 0.075 + k * 0.05], mat: M_IRON }));
    }
    pivot.add(box({ name: 'dg.door.pull-plate', size: [0.075, 0.3, 0.07], pos: [0.036, 1.05, LW - 0.1], mat: M_BRASS }));
    pivot.add(cylinder({ name: 'dg.door.pull', r: 0.012, h: 0.24, pos: [0.1, 1.05, LW - 0.1], mat: M_BRASS }));
    pivot.add(box({ name: 'dg.door.bolt', size: [0.08, 0.04, 0.16], pos: [0.04, 1.3, LW - 0.12], mat: M_IRON }));
    add(pivot);
    // The doorway is closed to the capsule: the leaf stands open, but the
    // way up is not a place this scene walks anybody.
    solid(R.x0 - WALL_T, -DOOR_W / 2, R.x0, DOOR_W / 2);

    // The stairwell: a landing, 14 treads going west, dark plaster walls, a
    // brass handrail, a bare bulb halfway up, and the club's light coming in
    // at the top.
    const sx0 = STAIRS.x0;
    const xTop = sx0 - STAIRS.run * STAIRS.steps;
    const topY = STAIRS.rise * STAIRS.steps;
    const wellMat = mat({ color: 0x241b16, roughness: 0.95 });
    const treadMat = mat({ color: 0x2a1c12, roughness: 0.7 });
    add(box({ name: 'dg.stairs.landing', size: [R.x0 - WALL_T - sx0, 0.04, STAIRS.z1 - STAIRS.z0], pos: [(R.x0 - WALL_T + sx0) / 2, -0.02, 0], mat: treadMat }));
    for (let i = 0; i < STAIRS.steps; i++) {
      const y = (i + 1) * STAIRS.rise;
      const x = sx0 - (i + 0.5) * STAIRS.run;
      add(box({ name: 'dg.stairs.step', size: [STAIRS.run + 0.02, y, STAIRS.z1 - STAIRS.z0], pos: [x, y / 2, 0], mat: treadMat }));
      add(box({ name: 'dg.stairs.nosing', size: [0.03, 0.02, STAIRS.z1 - STAIRS.z0], pos: [x + STAIRS.run / 2, y - 0.01, 0], mat: M_BRASS_DULL, cast: false }));
    }
    const wellLen = R.x0 - WALL_T - (xTop - 0.6);
    const wellMid = (R.x0 - WALL_T + xTop - 0.6) / 2;
    for (const wz of [STAIRS.z0 - 0.06, STAIRS.z1 + 0.06]) {
      add(box({ name: 'dg.stairs.wall', size: [wellLen, topY + 2.6, 0.12], pos: [wellMid, (topY + 2.6) / 2, wz], mat: wellMat }));
    }
    // Sloped ceiling 2.3 m over the nosings, and the flat over the landing.
    const slopeLen = Math.hypot(STAIRS.run * STAIRS.steps, topY);
    const slope = box({ name: 'dg.stairs.soffit', size: [slopeLen, 0.06, STAIRS.z1 - STAIRS.z0 + 0.12], pos: [(sx0 + xTop) / 2, topY / 2 + 2.3, 0], mat: wellMat, rotZ: -Math.atan2(topY, STAIRS.run * STAIRS.steps), cast: false });
    add(slope);
    add(box({ name: 'dg.stairs.soffit', size: [R.x0 - WALL_T - sx0 + 0.1, 0.06, STAIRS.z1 - STAIRS.z0 + 0.12], pos: [(R.x0 - WALL_T + sx0) / 2, DG_CEIL - 0.1, 0], mat: wellMat, cast: false }));
    add(box({ name: 'dg.stairs.head', size: [0.12, 2.6, STAIRS.z1 - STAIRS.z0 + 0.12], pos: [xTop - 0.66, topY + 1.3, 0], mat: wellMat }));
    add(box({ name: 'dg.stairs.top-landing', size: [0.6, 0.04, STAIRS.z1 - STAIRS.z0], pos: [xTop - 0.3, topY - 0.02, 0], mat: treadMat }));
    // Handrail on the north wall, brass on brackets.
    const rail = cylinder({ name: 'dg.stairs.handrail', r: 0.022, h: slopeLen, pos: [(sx0 + xTop) / 2, topY / 2 + 0.92, STAIRS.z0 + 0.06], rotZ: Math.PI / 2 - Math.atan2(topY, STAIRS.run * STAIRS.steps), mat: M_BRASS });
    add(rail);
    // The club, through a doorway at the top: magenta-red spill on the
    // plaster from the main floor's neon. This is the Bing; the bass comes
    // down the same way.
    // A flat emissive slab read as a pink card stuck to the wall, so the
    // spill is a gradient -- hot at the floor of the corridor up there,
    // gone by head height -- and most of the colour is the light it throws
    // down the top six treads.
    const spillTex = cachedTex('dg.stairs.spill', () => {
      const c = makeCanvas(64, 128);
      const sg = c.getContext('2d');
      const grad = sg.createLinearGradient(0, 128, 0, 0);
      grad.addColorStop(0, 'rgba(255,70,130,1)');
      grad.addColorStop(0.55, 'rgba(200,40,110,0.55)');
      grad.addColorStop(1, 'rgba(90,10,50,0)');
      sg.fillStyle = grad;
      sg.fillRect(0, 0, 64, 128);
      return canvasTexture(c);
    });
    const spill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 2.1),
      new THREE.MeshBasicMaterial({ map: spillTex, transparent: true, depthWrite: false, color: 0xffffff }),
    );
    spill.name = 'dg.stairs.club-spill';
    spill.position.set(xTop - 0.6, topY + 1.05, 0);
    spill.rotation.y = Math.PI / 2;
    add(spill);
    const clubGlow = new THREE.PointLight(0xff3d7a, 5, 4.5, 2);
    clubGlow.name = 'dg.light.stairs-club';
    clubGlow.position.set(xTop - 0.1, topY + 0.8, 0);
    add(clubGlow);
    // The bare bulb, on the south wall a third of the way up: 1.9 m over its
    // tread, under the soffit (which is 2.3 m over the nosings).
    const bulbX = sx0 - 1.2;
    const bulbY = groundAt(bulbX, 0) + 1.9;
    add(box({ name: 'dg.stairs.bulb-fitting', size: [0.08, 0.08, 0.05], pos: [bulbX, bulbY + 0.05, STAIRS.z1 - 0.025], mat: M_BRASS_DULL, cast: false }));
    const bulb = sphere({ name: 'dg.stairs.bulb', r: 0.035, pos: [bulbX, bulbY, STAIRS.z1 - 0.07], mat: lit(0xffe2b0, 2.6), cast: false });
    add(bulb);
    // 3.2 m reach: enough for the flight, short of the chairs through the wall.
    const bulbLight = new THREE.PointLight(0xffcf92, 2.4, 3.2, 2);
    bulbLight.name = 'dg.light.stairs-bulb';
    bulbLight.position.set(bulbX, bulbY - 0.08, STAIRS.z1 - 0.2);
    add(bulbLight);
    stairs.xTop = xTop;
    stairs.topY = topY;
    floorZones.push({
      box: new THREE.Box3(new THREE.Vector3(xTop - 0.6, -1, STAIRS.z0), new THREE.Vector3(R.x0, topY + 1, STAIRS.z1)),
      surface: 'wood',
    });
    // Coat hooks by the door: one hat, one overcoat that has been there all night.
    const hooks = group('dg.coat-hooks');
    hooks.position.set(R.x0 + 0.02, 1.72, -1.35);
    hooks.add(box({ size: [0.03, 0.08, 0.7], pos: [0.015, 0, 0], mat: M_WALNUT }));
    for (const hz of [-0.22, 0, 0.22]) hooks.add(cylinder({ r: 0.008, h: 0.08, pos: [0.06, 0.0, hz], rotZ: Math.PI / 2, mat: M_BRASS }));
    const fedora = group('dg.coat-hooks.fedora');
    fedora.position.set(0.1, -0.03, -0.22);
    fedora.rotation.z = 0.25;
    fedora.add(cylinder({ r: 0.17, h: 0.012, pos: [0, 0, 0], mat: mat({ color: 0x2a2620, roughness: 0.9 }) }));
    fedora.add(cylinder({ rTop: 0.085, rBottom: 0.1, h: 0.12, pos: [0, 0.065, 0], mat: mat({ color: 0x2a2620, roughness: 0.9 }) }));
    fedora.add(cylinder({ r: 0.101, h: 0.025, pos: [0, 0.02, 0], mat: mat({ color: 0x111111, roughness: 0.7 }) }));
    hooks.add(fedora);
    // Camel-hair overcoat on the middle hook: narrow at the hanger, wider at
    // the hem, flattened against the wall.
    const coatMat = mat({ color: 0x4a3a2a, roughness: 0.95 });
    const coat = cylinder({ name: 'dg.coat-hooks.overcoat', rTop: 0.17, rBottom: 0.24, h: 1.02, pos: [0.1, -0.56, 0.02], mat: coatMat, seg: 14 });
    coat.scale.x = 0.32;   // 15 cm deep at the hem
    hooks.add(coat);
    const collar = cylinder({ name: 'dg.coat-hooks.collar', rTop: 0.08, rBottom: 0.17, h: 0.1, pos: [0.1, -0.02, 0.02], mat: coatMat, seg: 14 });
    collar.scale.x = 0.45;
    hooks.add(collar);
    add(hooks);
  }

  /* ================================================================== */
  /* Walls dressed: pictures, sideboard, humidor, safe, clock            */
  /* ================================================================== */
  {
    const art = (key, title, footer, ink, bg) => squatchArt(`dg.${key}`, { title, footer, ink, bg });
    const pictures = [
      // North wall, flanking the board.
      { key: 'n1', x: -3.05, y: 1.72, z: R.z0 + 0.02, rotY: 0, w: 0.62, h: 0.78, tex: art('n1', ['ESTABLISHED'], 'MCMLXXIV', '#c8a24a', '#1a1410') },
      { key: 'n2', x: 3.05, y: 1.72, z: R.z0 + 0.02, rotY: 0, w: 0.62, h: 0.78, tex: art('n2', [], 'NORTH JERSEY', '#b8913e', '#14100e'), roll: 0.02 },
      // South wall: a big one over the sideboard and a pair by the safe.
      { key: 's1', x: -3.1, y: 1.78, z: R.z1 - 0.02, rotY: Math.PI, w: 0.9, h: 0.68, tex: printed('dg.s1', ['MAIN EVENT', 'SATURDAY SEPT. 14'], { w: 640, h: 480, bg: '#1d1712', fg: '#cdb27a', font: '700 52px Georgia, serif', border: '#6a5230' }) },
      { key: 's2', x: 0, y: 1.8, z: R.z1 - 0.02, rotY: Math.PI, w: 0.5, h: 0.62, tex: art('s2', [], 'LOU', '#c8a24a', '#18120e') },
      { key: 's3', x: 2.6, y: 1.74, z: R.z1 - 0.02, rotY: Math.PI, w: 0.44, h: 0.56, tex: art('s3', ['SALUTE'], null, '#a98a4a', '#1a1612'), roll: -0.03 },
      // West wall, south of the door.
      { key: 'w1', x: R.x0 + 0.02, y: 1.7, z: 2.15, rotY: Math.PI / 2, w: 0.56, h: 0.7, tex: art('w1', [], 'BADA BING', '#c8a24a', '#140f0c') },
      // East wall, either side of the back bar.
      { key: 'e1', x: R.x1 - 0.02, y: 1.72, z: -2.15, rotY: -Math.PI / 2, w: 0.5, h: 0.62, tex: art('e1', [], 'MCMLXXXII', '#b8913e', '#14100e') },
      { key: 'e2', x: R.x1 - 0.02, y: 1.72, z: 2.15, rotY: -Math.PI / 2, w: 0.5, h: 0.62, tex: art('e2', [], null, '#c8a24a', '#1a1410') },
    ];
    for (const p of pictures) {
      const f = makeFrame(M, { x: p.x, y: p.y, z: p.z, rotY: p.rotY, w: p.w, h: p.h, texture: p.tex, tint: 0x2a1a0e, roll: p.roll ?? 0 });
      f.group.name = `dg.picture.${p.key}`;
      add(f.group);
    }

    // Sideboard, south-west: walnut credenza with the humidor and the phone.
    const sb = group('dg.sideboard');
    const sbx = -3.1;
    const sbz = R.z1 - 0.24;
    sb.add(box({ name: 'dg.sideboard.body', size: [1.6, 0.8, 0.46], pos: [sbx, 0.42, sbz], mat: M_WALNUT_DARK }));
    sb.add(box({ name: 'dg.sideboard.doors', size: [1.5, 0.62, 0.01], pos: [sbx, 0.44, sbz - 0.235], mat: wainscotMat(1.5) }));
    sb.add(box({ name: 'dg.sideboard.top', size: [1.66, 0.04, 0.5], pos: [sbx, 0.84, sbz], mat: M_WALNUT }));
    for (const lx of [-0.74, 0.74]) sb.add(box({ name: 'dg.sideboard.leg', size: [0.06, 0.04, 0.4], pos: [sbx + lx, 0.02, sbz], mat: M_WALNUT_DARK }));
    add(sb);
    solid(sbx - 0.83, sbz - 0.25, sbx + 0.83, R.z1, 0, 0.9);
    // The humidor: lid up, two rows of cigars, cedar inside.
    const hum = group('dg.humidor');
    hum.position.set(sbx - 0.35, 0.86, sbz - 0.02);
    hum.rotation.y = 0.12;
    const cedar = mat({ color: 0x9a5a34, roughness: 0.8 });
    hum.add(box({ size: [0.34, 0.1, 0.24], pos: [0, 0.05, 0], mat: M_WALNUT }));
    hum.add(box({ size: [0.31, 0.01, 0.21], pos: [0, 0.095, 0], mat: cedar }));
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 6; k++) {
        hum.add(cylinder({ name: 'dg.humidor.cigar', r: 0.011, h: 0.2, pos: [-0.12 + k * 0.048, 0.108 + row * 0.004, -0.04 + row * 0.08], rotX: Math.PI / 2, mat: mat({ color: 0x5a3418, roughness: 0.85 }) }));
        hum.add(cylinder({ name: 'dg.humidor.band', r: 0.0115, h: 0.02, pos: [-0.12 + k * 0.048, 0.108 + row * 0.004, 0.03 + row * 0.08], rotX: Math.PI / 2, mat: mat({ color: 0xb8913e, roughness: 0.5, metalness: 0.4 }) }));
      }
    }
    const lid = group('dg.humidor.lid');
    lid.position.set(0, 0.1, -0.12);
    lid.rotation.x = -1.9;
    lid.add(box({ size: [0.34, 0.025, 0.24], pos: [0, 0, 0.12], mat: M_WALNUT }));
    lid.add(box({ size: [0.1, 0.004, 0.06], pos: [0, 0.014, 0.12], mat: M_BRASS }));
    hum.add(lid);
    add(hum);
    const tray = makeAshtray(M, { x: sbx + 0.15, y: 0.86, z: sbz });
    tray.group.name = 'dg.sideboard.ashtray';
    add(tray.group);
    // A rotary desk phone: the only line down here, and it does not ring.
    const phone = group('dg.sideboard.phone');
    phone.position.set(sbx + 0.52, 0.86, sbz - 0.02);
    phone.rotation.y = -0.3;
    const bake = mat({ color: 0x121112, roughness: 0.3 });
    phone.add(box({ size: [0.2, 0.07, 0.22], pos: [0, 0.035, 0], mat: bake }));
    phone.add(cylinder({ r: 0.055, h: 0.01, pos: [0, 0.075, 0.03], rotX: -0.3, mat: mat({ color: 0xd8d2c0, roughness: 0.6 }) }));
    phone.add(box({ size: [0.22, 0.045, 0.06], pos: [0, 0.1, -0.06], mat: bake }));
    add(phone);

    // The safe, south-east corner: green-black iron, a brass dial, and a
    // handle worn bright.
    const safe = group('dg.safe');
    safe.position.set(R.x1 - 0.42, 0, R.z1 - 0.4);
    safe.rotation.y = -Math.PI * 0.75;
    safe.add(box({ name: 'dg.safe.body', size: [0.7, 1.0, 0.64], pos: [0, 0.52, 0], mat: mat({ color: 0x16201a, roughness: 0.55, metalness: 0.5 }) }));
    safe.add(box({ name: 'dg.safe.plinth', size: [0.74, 0.04, 0.68], pos: [0, 0.02, 0], mat: M_IRON }));
    safe.add(box({ name: 'dg.safe.door', size: [0.56, 0.84, 0.02], pos: [0, 0.54, 0.33], mat: mat({ color: 0x1c2820, roughness: 0.5, metalness: 0.5 }) }));
    safe.add(cylinder({ name: 'dg.safe.dial', r: 0.06, h: 0.03, pos: [0, 0.74, 0.355], rotX: Math.PI / 2, mat: M_BRASS }));
    safe.add(box({ name: 'dg.safe.handle', size: [0.16, 0.025, 0.03], pos: [0, 0.52, 0.355], mat: M_BRASS }));
    safe.add(box({ name: 'dg.safe.pinstripe', size: [0.5, 0.006, 0.002], pos: [0, 0.92, 0.341], mat: mat({ color: 0xb8913e, roughness: 0.6 }), cast: false }));
    add(safe);
    solid(R.x1 - 0.95, R.z1 - 0.92, R.x1, R.z1, 0, 1.05);

    // Wall clock over the safe end: nobody down here wants to know the time.
    const clock = makeWallClock(M, { x: 1.25, y: 2.22, z: R.z1 - 0.03, rotY: Math.PI, r: 0.16 });
    if (clock?.group) { clock.group.name = 'dg.clock'; add(clock.group); }

    // A tall brass smoking stand in the north-west corner, by the door.
    const stand = group('dg.smoking-stand');
    stand.position.set(R.x0 + 0.45, 0, R.z0 + 0.5);
    stand.add(cylinder({ r: 0.16, h: 0.03, pos: [0, 0.015, 0], mat: M_BRASS_DULL }));
    stand.add(cylinder({ r: 0.015, h: 0.62, pos: [0, 0.34, 0], mat: M_BRASS }));
    stand.add(cylinder({ rTop: 0.13, rBottom: 0.06, h: 0.06, pos: [0, 0.68, 0], mat: M_BRASS }));
    stand.add(cylinder({ r: 0.1, h: 0.01, pos: [0, 0.705, 0], mat: mat({ color: 0x3a3632, roughness: 1 }) }));
    add(stand);
    solid(R.x0 + 0.29, R.z0 + 0.34, R.x0 + 0.61, R.z0 + 0.66, 0, 0.72);
  }

  /* ================================================================== */
  /* On the felt: ashtrays, a resting cigar, the cigarettes              */
  /* ================================================================== */
  const embers = [];
  {
    // Four ashtrays, one between every other pair of seats, just inside the bead.
    for (let k = 0; k < 4; k++) {
      const s = k * 2;
      const phi = seatPhi(s) + Math.PI / SEAT_COUNT;
      const r = 0.96;
      const tray = makeAshtray(M, { x: T.x + Math.cos(phi) * r, y: T.topY, z: T.z + Math.sin(phi) * r, rotY: k });
      tray.group.name = `dg.table.ashtray.${k}`;
      add(tray.group);
      if (k === 1 || k === 3) {
        // A cigar left resting on the rim, ember up, going nowhere.
        const cigar = group(`dg.table.cigar.${k}`);
        cigar.position.copy(tray.group.position);
        cigar.rotation.y = phi + 0.6;
        cigar.add(cylinder({ r: 0.0105, h: 0.13, pos: [0, 0.03, 0.07], rotX: Math.PI / 2 - 0.12, mat: mat({ color: 0x5a3418, roughness: 0.85 }) }));
        cigar.add(cylinder({ r: 0.0108, h: 0.018, pos: [0, 0.038, 0.13], rotX: Math.PI / 2 - 0.12, mat: mat({ color: 0x8a8580, roughness: 1 }) }));
        const ember = cylinder({ r: 0.0098, h: 0.004, pos: [0, 0.039, 0.141], rotX: Math.PI / 2 - 0.12, mat: lit(0xff5a1a, 2.2), cast: false });
        cigar.add(ember);
        add(cigar);
        cigar.updateMatrixWorld(true);
        embers.push({ mesh: ember, at: ember.getWorldPosition(new THREE.Vector3()), t: k * 0.37 });
      }
    }
    const pp = feltPoint(5, 0.9, 0.62);
    const pack = makeCigarettePack(M, { x: pp.x, y: T.topY, z: pp.z, rotY: 1.1 });
    pack.group.name = 'dg.table.cigarettes';
    add(pack.group);
  }

  /* ================================================================== */
  /* The spittoon                                                        */
  /* ================================================================== */
  // Between seats 4 and 5, 1.6 m out: on the floor at the rail's edge,
  // in reach of a long spit from any chair and of nobody's feet.
  const spitPhi = seatPhi(4) + Math.PI / SEAT_COUNT;
  const spittoonAnchor = { x: T.x + Math.cos(spitPhi) * 1.6, z: T.z + Math.sin(spitPhi) * 1.6, y: 0.24 };
  {
    const profile = [
      [0.0, 0.0], [0.13, 0.0], [0.14, 0.01], [0.15, 0.05], [0.155, 0.1], [0.14, 0.15],
      [0.1, 0.19], [0.075, 0.21], [0.08, 0.225], [0.13, 0.24], [0.15, 0.25], [0.145, 0.255], [0.07, 0.235],
    ].map(([px, py]) => new THREE.Vector2(px, py));
    const spit = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), M_BRASS);
    spit.name = 'dg.spittoon';
    spit.position.set(spittoonAnchor.x, 0.01, spittoonAnchor.z);
    spit.castShadow = true;
    add(spit);
    const well = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), mat({ color: 0x0e0a06, roughness: 0.6 }));
    well.name = 'dg.spittoon.mouth';
    well.rotation.x = -Math.PI / 2;
    well.position.set(spittoonAnchor.x, 0.236, spittoonAnchor.z);
    add(well);
  }

  /* ================================================================== */
  /* Turn marker                                                         */
  /* ================================================================== */
  const marker = (() => {
    const g = group('dg.marker');
    g.add(cylinder({ name: 'dg.marker.puck', r: 0.05, h: 0.016, pos: [0, 0.008, 0], mat: M_BRASS, seg: 32 }));
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x2a1404, emissive: new THREE.Color(0xffb04a), emissiveIntensity: 1.6, roughness: 0.4,
    });
    const glow = cylinder({ name: 'dg.marker.inlay', r: 0.034, h: 0.004, pos: [0, 0.018, 0], mat: glowMat, seg: 32, cast: false });
    g.add(glow);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 6, 40), M_BRASS);
    lip.name = 'dg.marker.lip';
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.016;
    g.add(lip);
    const light = new THREE.PointLight(0xffa64a, 0.8, 1.1, 2);
    light.name = 'dg.light.marker';
    light.position.set(0, 0.09, 0);
    g.add(light);
    g.visible = false;
    add(g);
    const target = new THREE.Vector3();
    let seat = null;
    function setTurn(next) {
      if (next == null || !Number.isInteger(next) || next < 0 || next >= SEAT_COUNT) {
        seat = null;
        g.visible = false;
        light.visible = false;
        return;
      }
      const p = feltPoint(next, 0.99, 0);
      target.set(p.x, T.topY, p.z);
      if (!g.visible) g.position.copy(target);
      seat = next;
      g.visible = true;
      light.visible = true;
    }
    return {
      group: g, light, glowMat, target,
      setTurn,
      get seat() { return seat; },
    };
  })();

  /* ================================================================== */
  /* Haze                                                                */
  /* ================================================================== */
  // The Bing's motes (club.js makeHaze), fewer and warmer for a smaller room.
  const motes = (() => {
    const COUNT = 90;
    const r = rng(77);
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = R.x0 + 0.6 + r() * (RW - 1.2);
      pos[i * 3 + 1] = 0.5 + r() * (DG_CEIL - 0.9);
      pos[i * 3 + 2] = R.z0 + 0.6 + r() * (RD - 1.2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffd8b0, size: 0.02, transparent: true, opacity: 0.16, depthWrite: false,
    }));
    points.name = 'dg.haze.motes';
    add(points);
    return { points, geo };
  })();
  // Pooled sprites from the shared smoke system: cigar wisps off the
  // ashtrays and a thin layer hanging under the drum. Handed out as
  // `haze`, so actions.js can blow its exhales into the same pool.
  const haze = new SmokeSystem(root);

  /* ================================================================== */
  /* Clues, chips, glasses: the API                                      */
  /* ================================================================== */
  const clues = {
    set(seat, text) {
      const c = cards[seat];
      if (!c) return;
      const t = text == null ? null : String(text).trim();
      c.text = t || null;
      if (!c.text) {
        c.group.visible = false;
        return;
      }
      paintCard(c.g, c.text);
      c.texture.needsUpdate = true;
      c.group.visible = true;
    },
    clear() { for (let s = 0; s < SEAT_COUNT; s++) clues.set(s, null); },
    textAt(seat) { return cards[seat]?.text ?? null; },
    cards,
  };

  const chips = {
    set(seat, n) {
      const stack = stacks[seat];
      if (!stack) return;
      const count = Math.max(0, Math.min(20, Math.floor(Number(n) || 0)));
      const r = rng(1000 + seat * 31 + stack.userData.built);
      while (stack.userData.built < count) {
        const k = stack.userData.built;
        const chip = new THREE.Mesh(chipGeo, chipMats);
        chip.name = `dg.seat.${seat}.chip.${k}`;
        // Stacked by hand: a millimetre or two of drift and a random turn.
        chip.position.set((r() - 0.5) * 0.004, CHIP_H / 2 + k * (CHIP_H + 0.0004), (r() - 0.5) * 0.004);
        chip.rotation.y = r() * Math.PI * 2;
        chip.castShadow = true;
        chip.receiveShadow = true;
        stack.add(chip);
        stack.userData.built++;
      }
      stack.children.forEach((chip, k) => { chip.visible = k < count; });
      stack.userData.count = count;
    },
    countAt(seat) { return stacks[seat]?.userData.count ?? 0; },
    stacks,
  };

  /* ================================================================== */
  /* Update                                                              */
  /* ================================================================== */
  let clock = 0;
  let puffAt = 0;
  const puffDir = new THREE.Vector3();
  const puffAtPos = new THREE.Vector3();
  const flickRand = rng(404);
  function update(dt, _camera) {
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    clock += dt;

    // The loose bulb: steady for 4-14 s, then a 60-200 ms sag.
    for (const s of sconces) {
      if (!s.flicker) continue;
      s.next -= dt;
      if (s.next <= 0) {
        if (s.dip > 0) { s.dip = 0; s.next = 4 + flickRand() * 10; } else { s.dip = 0.35 + flickRand() * 0.4; s.next = 0.06 + flickRand() * 0.14; }
      }
      s.light.intensity = s.base * (1 - s.dip);
      s.glass.material.emissiveIntensity = s.baseGlow * (1 - s.dip * 0.8);
    }

    // Marker: glides to its seat round the rim in ~0.4 s, inlay breathes.
    if (marker.group.visible) {
      marker.group.position.lerp(marker.target, 1 - Math.exp(-dt * 9));
      const pulse = 0.5 + 0.5 * Math.sin(clock * 3.2);
      marker.glowMat.emissiveIntensity = 1.3 + pulse * 0.7;
      marker.light.intensity = 0.65 + pulse * 0.3;
    }

    // Board: the revealed word pulses the whole board's self-light a little.
    if (board.state.revealIndex != null && !board.state.dim) {
      board.material.emissiveIntensity = 0.45 + 0.1 * (0.5 + 0.5 * Math.sin(clock * 2.4));
    }

    // Chips catch the lamp as heads move: a slow shimmer on the brass inlay.
    chipFace.emissiveIntensity = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(clock * 1.7));

    // Embers breathe; cigar smoke curls off them; a slow layer of smoke
    // hangs in the lamplight under the drum.
    for (const e of embers) {
      e.t += dt;
      e.mesh.material.emissiveIntensity = 1.8 + 0.6 * Math.sin(e.t * 2.1) * Math.sin(e.t * 0.7);
    }
    if (haze) {
      puffAt -= dt;
      if (puffAt <= 0) {
        puffAt = 0.35;
        for (const e of embers) haze.wisp(e.at);
        if (flickRand() < 0.4) {
          const a = flickRand() * Math.PI * 2;
          const rr = 0.3 + flickRand() * 0.8;
          puffAtPos.set(T.x + Math.cos(a) * rr, 1.55 + flickRand() * 0.25, T.z + Math.sin(a) * rr);
          puffDir.set(Math.cos(a + 1.6), 0.1, Math.sin(a + 1.6));
          haze.emit(puffAtPos, puffDir, {
            count: 1, speed: 0.04, spread: 0.03, size0: 0.5, size1: 1.3, life: 9, peak: 0.045, rise: 0.015,
          });
        }
      }
      haze.update(dt);
    }

    // Motes rise through the lamp and drop back to the floor (club.js).
    const a = motes.geo.attributes.position.array;
    for (let i = 1; i < a.length; i += 3) {
      a[i] += dt * 0.06;
      if (a[i] > DG_CEIL - 0.3) a[i] = 0.5;
    }
    motes.geo.attributes.position.needsUpdate = true;
  }

  /** Floor height: zero in the room, the tread on the stairs. */
  function groundAt(x, z) {
    if (x < R.x0 && z >= STAIRS.z0 && z <= STAIRS.z1) {
      if (x >= STAIRS.x0) return 0;
      const i = Math.min(STAIRS.steps, Math.floor((STAIRS.x0 - x) / STAIRS.run) + 1);
      return i * STAIRS.rise;
    }
    return 0;
  }

  root.updateMatrixWorld(true);

  return {
    root,
    anchors: {
      table: { x: T.x, z: T.z, topY: T.topY, radius: T.radius, feltR: T.feltR },
      seats: seatAnchors.map((s) => ({ ...s })),
      board: { ...boardAnchor },
      door: { ...doorAnchor },
      spittoon: { ...spittoonAnchor },
      bar: { ...barAnchor },
      // Extras beyond the contract, for the composition root:
      room: { ...R, ceiling: DG_CEIL },
      stairs: { x0: STAIRS.x0, xTop: stairs.xTop, topY: stairs.topY, z0: STAIRS.z0, z1: STAIRS.z1 },
      pendant: { x: T.x, z: T.z, rimY: lamp.rimY },
      // The lobby's slow orbit: 3.0 m out at 2.05 m, looking at the felt.
      // Inside every chair back (2.2 m) would put the lens in the furniture,
      // so it rides over them; tested from all eight compass points.
      lobbyOrbit: { x: T.x, z: T.z, radius: 3.0, y: 2.05, lookY: 0.95 },
    },
    colliders,
    floorZones,
    groundAt,
    board,
    clues,
    chips,
    marker,
    glasses: {
      at(seat) { return glasses[seat] ?? null; },
      all: glasses,
    },
    chairs,
    haze,
    lights: { spot: lamp.spot, faces: lamp.faceLight, sconces: sconces.map((s) => s.light) },
    update,
  };
}
