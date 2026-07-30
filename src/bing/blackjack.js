/**
 * Blackjack, played at the table rather than on a screen.
 *
 * You sit down in the empty chair, the camera drops to seated height, and the
 * cards and chips are real objects on the felt in front of you. Nothing takes
 * the game over: standing up is one key, and the mission carries on around the
 * table whether or not you are winning.
 *
 * House rules are the ones printed on the felt: dealer draws to 16, stands on
 * all 17s, blackjack pays 3 to 2.
 */
import * as THREE from 'three';
import { mat, box, cylinder, group } from '../world/build.js';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

export const BETS = [25, 50, 100, 500];

const _faceCache = new Map();

function faceTexture(rank, suit) {
  const key = `${rank}${suit}`;
  if (_faceCache.has(key)) return _faceCache.get(key);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 180;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f2e8';
  g.fillRect(0, 0, 128, 180);
  g.strokeStyle = '#d0c8b8';
  g.lineWidth = 3;
  g.strokeRect(3, 3, 122, 174);
  const red = suit === '♥' || suit === '♦';
  g.fillStyle = red ? '#b02028' : '#1a1a20';
  g.font = '900 38px Georgia, serif';
  g.textAlign = 'left';
  g.fillText(rank, 10, 44);
  g.font = '30px Georgia, serif';
  g.fillText(suit, 12, 76);
  g.save();
  g.translate(128, 180);
  g.rotate(Math.PI);
  g.font = '900 38px Georgia, serif';
  g.fillText(rank, 10, 44);
  g.font = '30px Georgia, serif';
  g.fillText(suit, 12, 76);
  g.restore();
  // A big centred rank first — from the seat the corner indices subtend well
  // under half a degree, so the middle of the card does the real reading.
  g.font = '900 92px Georgia, serif';
  g.textAlign = 'center';
  g.fillText(rank, 64, 104);
  g.font = '44px Georgia, serif';
  g.fillText(suit, 64, 150);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _faceCache.set(key, tex);
  return tex;
}

let _backTex = null;
function backTexture() {
  if (_backTex) return _backTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 180;
  const g = c.getContext('2d');
  g.fillStyle = '#7a1420';
  g.fillRect(0, 0, 128, 180);
  g.strokeStyle = '#d9c37a';
  g.lineWidth = 3;
  g.strokeRect(8, 8, 112, 164);
  g.strokeStyle = 'rgba(217,195,122,.5)';
  g.lineWidth = 1.5;
  for (let i = -8; i < 12; i++) {
    g.beginPath();
    g.moveTo(i * 16, 0);
    g.lineTo(i * 16 + 180, 180);
    g.stroke();
    g.beginPath();
    g.moveTo(i * 16, 180);
    g.lineTo(i * 16 + 180, 0);
    g.stroke();
  }
  _backTex = new THREE.CanvasTexture(c);
  _backTex.colorSpace = THREE.SRGBColorSpace;
  return _backTex;
}

/** One card: a thin box, face on top, club's own back underneath. */
function makeCard(rank, suit) {
  const face = mat({ map: faceTexture(rank, suit), roughness: 0.85 });
  const back = mat({ map: backTexture(), roughness: 0.85 });
  const edge = mat({ color: 0xf0ece0, roughness: 0.9 });
  const geo = new THREE.BoxGeometry(0.063, 0.0035, 0.089);
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const m = new THREE.Mesh(geo, [edge, edge, face, back, edge, edge]);
  m.castShadow = true;
  return m;
}

function chipStack(colour, count, x, y, z) {
  const g = group('chips');
  for (let i = 0; i < count; i++) {
    g.add(cylinder({ r: 0.038, h: 0.009, pos: [0, 0.0045 + i * 0.0095, 0], mat: mat({ color: i % 2 ? colour : 0xf0f0f0, roughness: 0.6 }) }));
  }
  g.position.set(x, y, z);
  return g;
}

function cardValue(rank) {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === '10') return 10;
  return Number(rank);
}

/** Best total for a hand, soft aces demoted as needed. */
export function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

const isBlackjack = (cards) => cards.length === 2 && handTotal(cards) === 21;

export class Blackjack {
  /**
   * @param {THREE.Scene} scene
   * @param {{x:number,z:number}} table centre of the felt
   * @param {object} seat where the player is sitting: { x, z }
   * @param {object} hooks { getMoney, spend, win, onState, onNote, onDeal, onChips, onHandDone }
   *   onHandDone is called `(hands, won, outcome)` -- see `_settle` for the
   *   shape of `outcome`. The table's voice lines need to know *how* the hand
   *   went, not just whether it paid, and `message` is display text rather
   *   than something worth parsing.
   */
  constructor(scene, table, seat, hooks = {}) {
    this.scene = scene;
    this.table = table;
    this.seat = seat;
    this.hooks = hooks;

    this.root = group('blackjack');
    scene.add(this.root);

    /** 'off' | 'bet' | 'player' | 'dealer' | 'done' */
    this.state = 'off';
    this.bet = BETS[0];
    this.player = [];
    this.dealer = [];
    this.hands = 0;
    this.net = 0;
    this.message = '';
    this._meshes = [];
    this._timer = 0;
    this._queue = [];
    this._chips = null;
  }

  /* ---------------------------------------------------------------- */

  sitDown() {
    if (this.state !== 'off') return;
    this.state = 'bet';
    this.message = 'Choose a bet.';
    this.hooks.onState?.(this.view);
  }

  standUp() {
    this._clearTable();
    this.state = 'off';
    this.hooks.onState?.(null);
  }

  changeBet(dir) {
    if (this.state !== 'bet') return;
    const i = BETS.indexOf(this.bet);
    this.bet = BETS[Math.max(0, Math.min(BETS.length - 1, i + dir))];
    this.hooks.onState?.(this.view);
  }

  setBet(amount) {
    if (this.state !== 'bet') return;
    if (BETS.includes(amount)) this.bet = amount;
    this.hooks.onState?.(this.view);
  }

  /* ---------------------------------------------------------------- */

  deal() {
    if (this.state !== 'bet') return;
    if ((this.hooks.getMoney?.() ?? 0) < this.bet) {
      this.message = 'Not enough on you.';
      this.hooks.onState?.(this.view);
      return;
    }
    this._clearTable();
    this.hooks.spend?.(this.bet);
    this.net -= this.bet;
    this.player = [];
    this.dealer = [];
    this.message = '';
    this.state = 'dealing';
    this._doubled = false;
    this._chips = chipStack(0xd92e2e, Math.max(1, Math.min(10, Math.round(this.bet / 25))),
      this.seat.x + (this.table.x - this.seat.x) * 0.35,
      0.93,
      this.seat.z + (this.table.z - this.seat.z) * 0.35);
    this.root.add(this._chips);
    this.hooks.onChips?.();

    // Two each, alternating, on a beat, with the dealer's second face down
    this._queue = [
      { at: 0.15, fn: () => this._draw('player') },
      { at: 0.55, fn: () => this._draw('dealer') },
      { at: 0.95, fn: () => this._draw('player') },
      { at: 1.35, fn: () => this._draw('dealer', true) },
      {
        at: 1.75,
        fn: () => {
          if (isBlackjack(this.player)) this._settle();
          else {
            this.state = 'player';
            this.hooks.onState?.(this.view);
          }
        },
      },
    ];
    this._timer = 0;
    this.hooks.onState?.(this.view);
  }

  hit() {
    if (this.state !== 'player') return;
    this._draw('player');
    if (handTotal(this.player) >= 21) this._stand();
    else this.hooks.onState?.(this.view);
  }

  stand() {
    if (this.state !== 'player') return;
    this._stand();
  }

  double() {
    if (this.state !== 'player' || this.player.length !== 2) return;
    if ((this.hooks.getMoney?.() ?? 0) < this.bet) {
      this.message = 'Not enough to double.';
      this.hooks.onState?.(this.view);
      return;
    }
    this.hooks.spend?.(this.bet);
    this.net -= this.bet;
    this.bet *= 2;
    this._doubled = true;
    if (this._chips) {
      this._chips.add(cylinder({ r: 0.038, h: 0.009, pos: [0.06, 0.0045, 0.02], mat: mat({ color: 0x2a2a33, roughness: 0.6 }) }));
    }
    this._draw('player');
    this._stand();
  }

  _stand() {
    this.state = 'dealer';
    // Flip the hole card, then draw to sixteen with a beat between cards
    this._queue = [{ at: 0.3, fn: () => this._revealHole() }];
    let t = 0.9;
    const play = () => {
      if (handTotal(this.dealer) < 17 && handTotal(this.player) <= 21) {
        this._queue.push({ at: t, fn: () => { this._draw('dealer'); play(); } });
        t += 0.7;
      } else {
        this._queue.push({ at: t + 0.35, fn: () => this._settle() });
      }
    };
    play();
    this._timer = 0;
    this.hooks.onState?.(this.view);
  }

  /* ---------------------------------------------------------------- */

  _draw(who, faceDown = false) {
    const rank = RANKS[(Math.random() * RANKS.length) | 0];
    const suit = SUITS[(Math.random() * SUITS.length) | 0];
    const card = { rank, suit, faceDown };
    const hand = who === 'player' ? this.player : this.dealer;
    hand.push(card);

    const mesh = makeCard(rank, suit);
    // Along the arc in front of whoever it belongs to
    const i = hand.length - 1;
    if (who === 'player') {
      const dx = this.seat.x - this.table.x;
      const dz = this.seat.z - this.table.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = this.table.x + (dx / len) * 0.7 + (i - 1) * 0.1;
      const pz = this.table.z + (dz / len) * 0.7 + (i % 2) * 0.01;
      // Lifted and tilted toward the seat, so the rank reads from the chair
      // instead of presenting a 25-degree grazing sliver of card face.
      mesh.position.set(px, 0.99, pz);
      mesh.rotation.y = Math.atan2(dx, dz) + Math.PI;
    } else {
      mesh.position.set(this.table.x - 0.16 + i * 0.085, 0.935, this.table.z - 0.62);
      mesh.rotation.y = 0;
    }
    if (faceDown) mesh.rotation.z = Math.PI;
    mesh.rotation.x = who === 'player' ? -0.55 : 0;
    // Slide in from the shoe rather than appearing
    mesh.userData.from = new THREE.Vector3(this.table.x + 0.72, 1.02, this.table.z - 0.72);
    mesh.userData.to = mesh.position.clone();
    mesh.userData.k = 0;
    mesh.position.copy(mesh.userData.from);
    card.mesh = mesh;
    this.root.add(mesh);
    this._meshes.push(mesh);
    this.hooks.onDeal?.(who, card);
    this.hooks.onState?.(this.view);
  }

  _revealHole() {
    const hole = this.dealer.find((c) => c.faceDown);
    if (!hole) return;
    hole.faceDown = false;
    hole.mesh.rotation.z = 0;
    this.hooks.onDeal?.('dealer', hole);
    this.hooks.onState?.(this.view);
  }

  _settle() {
    this._revealHole();
    const p = handTotal(this.player);
    const d = handTotal(this.dealer);
    /* The staked amount, read before the doubled bet is halved back below. */
    const staked = this.bet;
    let payout = 0;
    /** 'bust' | 'blackjack' | 'win' | 'push' | 'lose' -- what the table calls it. */
    let kind;
    if (p > 21) {
      kind = 'bust';
      this.message = `Bust. ${p}.`;
    } else if (isBlackjack(this.player) && !isBlackjack(this.dealer)) {
      kind = 'blackjack';
      payout = this.bet * 2.5;
      this.message = 'Blackjack. Pays three to two.';
    } else if (d > 21) {
      kind = 'win';
      payout = this.bet * 2;
      this.message = `Dealer busts with ${d}.`;
    } else if (p > d) {
      kind = 'win';
      payout = this.bet * 2;
      this.message = `${p} beats ${d}.`;
    } else if (p === d) {
      kind = 'push';
      payout = this.bet;
      this.message = `Push on ${p}.`;
    } else {
      kind = 'lose';
      this.message = `${d} beats ${p}.`;
    }
    if (payout > 0) {
      this.hooks.win?.(payout);
      this.net += payout;
    }
    this.hands++;
    this.state = 'done';
    this.bet = BETS.includes(this.bet) ? this.bet : this.bet / 2;
    this.hooks.onState?.(this.view);
    this.hooks.onHandDone?.(this.hands, payout > 0, {
      kind,
      staked,
      payout,
      doubled: this._doubled === true,
      playerTotal: p,
      dealerTotal: d,
      dealerBlackjack: isBlackjack(this.dealer),
    });
    // Back to betting on its own, so the table keeps moving
    this._queue = [{ at: 2.6, fn: () => { if (this.state === 'done') { this._clearTable(); this.state = 'bet'; this.message = ''; this.hooks.onState?.(this.view); } } }];
    this._timer = 0;
  }

  _clearTable() {
    for (const m of this._meshes) this.root.remove(m);
    this._meshes = [];
    if (this._chips) {
      this.root.remove(this._chips);
      this._chips = null;
    }
    this.player = [];
    this.dealer = [];
  }

  update(dt) {
    if (this._queue.length) {
      this._timer += dt;
      while (this._queue.length && this._timer >= this._queue[0].at) {
        this._queue.shift().fn();
      }
    }
    // Cards sliding in from the shoe
    for (const m of this._meshes) {
      if (m.userData.k >= 1) continue;
      m.userData.k = Math.min(1, m.userData.k + dt * 4.5);
      const e = 1 - Math.pow(1 - m.userData.k, 3);
      m.position.lerpVectors(m.userData.from, m.userData.to, e);
      m.position.y = m.userData.to.y + Math.sin(e * Math.PI) * 0.05;
    }
  }

  get view() {
    if (this.state === 'off') return null;
    return {
      state: this.state,
      bet: this.bet,
      bets: BETS,
      player: this.player.map((c) => (c.faceDown ? '??' : c.rank + c.suit)),
      dealer: this.dealer.map((c) => (c.faceDown ? '??' : c.rank + c.suit)),
      playerTotal: handTotal(this.player),
      dealerTotal: handTotal(this.dealer.filter((c) => !c.faceDown)),
      message: this.message,
      hands: this.hands,
      net: this.net,
    };
  }
}
