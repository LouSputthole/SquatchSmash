/**
 * DOOM.
 *
 * mrdoob's Three.js source port, running from where it is published rather
 * than from here.
 *
 * That is deliberate and it is a licensing decision, not laziness. three-doom
 * is GPL v2 and this repository is MIT; copying it in would make the combined
 * work GPL, which is not a choice to make on somebody's behalf in a commit
 * about a desk PC. It also ships doom1.wad, and game data is not ours to
 * redistribute. Framing the published page copies nothing, links to the
 * original, and leaves both licences where they are.
 *
 * The cost is that this one needs the network, and that it is cross-origin --
 * a sealed box. We cannot listen for a key inside it, so the way out is the
 * parent's own button in the corner of the frame (see webapp.js), which works
 * regardless of what is running.
 */
import { WebApp } from './webapp.js';

/** mrdoob/three-doom, as published. Not vendored -- see above. */
const DOOM_URL = 'https://mrdoob.github.io/three-doom/';

export class Doom extends WebApp {
  constructor(opts = {}) {
    super({
      ...opts,
      id: 'doom',
      label: 'DOOM.exe',
      src: DOOM_URL,
      sameOrigin: false,
      loading: 'connecting…',
    });
  }

  /** Icon: the obvious one, without drawing anybody's actual artwork. */
  drawIcon(g, cx, cy, s) {
    g.save();
    g.translate(cx, cy);
    const r = s * 0.42;

    g.fillStyle = '#150606';
    g.fillRect(-r, -r, r * 2, r * 2);
    const glow = g.createRadialGradient(0, r * 0.1, 1, 0, r * 0.1, r * 1.1);
    glow.addColorStop(0, 'rgba(200,40,20,0.85)');
    glow.addColorStop(1, 'rgba(80,10,6,0)');
    g.fillStyle = glow;
    g.fillRect(-r, -r, r * 2, r * 2);

    g.fillStyle = '#e8e2d6';
    g.font = `900 ${Math.round(r * 0.62)}px ui-monospace, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('DOOM', 0, r * 0.05);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';

    g.strokeStyle = 'rgba(120,30,20,0.9)';
    g.lineWidth = Math.max(1, r * 0.08);
    g.strokeRect(-r + 1, -r + 1, r * 2 - 2, r * 2 - 2);
    g.restore();
  }

  glow() {
    return { colour: 0xc4442a, intensity: 1.35 };
  }
}
