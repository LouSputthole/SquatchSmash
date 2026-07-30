/**
 * Furniture and prop builders.
 *
 * Each builder returns a THREE.Group positioned in world space, and where a
 * prop has moving or interactive parts it also returns handles to them so
 * apartment.js can wire up interactions without digging through children.
 */
import * as THREE from 'three';
import { box, boxFrom, cylinder, sphere, plane, mat, group } from './build.js';
import { drawSquatchSilhouette, brushedMetal } from './textures.js';

/** Basin interiors reuse the appliance metal, tiled tighter. */
const T_brushed = brushedMetal('#c2c6ca');

/* ------------------------------------------------------------------ */
/* Bedroom                                                             */
/* ------------------------------------------------------------------ */

/** Double bed with rumpled duvet, head against the north wall. */
export function makeBed(M, { x, z, w = 1.4, len = 2.0 }) {
  const g = group('bed');
  const x0 = x - w / 2;
  const z0 = z - len / 2;

  // Frame + legs.
  g.add(boxFrom(x0, 0.10, z0, x0 + w, 0.34, z0 + len, M.darkWood));
  for (const [lx, lz] of [[x0 + 0.08, z0 + 0.08], [x0 + w - 0.08, z0 + 0.08],
                          [x0 + 0.08, z0 + len - 0.08], [x0 + w - 0.08, z0 + len - 0.08]]) {
    g.add(box({ size: [0.09, 0.10, 0.09], pos: [lx, 0.05, lz], mat: M.darkWood }));
  }
  // Headboard.
  g.add(boxFrom(x0, 0.34, z0 - 0.06, x0 + w, 1.05, z0 + 0.04, M.darkWood));

  // Mattress + fitted sheet.
  g.add(boxFrom(x0 + 0.03, 0.34, z0 + 0.04, x0 + w - 0.03, 0.60, z0 + len - 0.03, M.sheet));

  // Duvet, thrown back as if someone just got out.
  const duvet = boxFrom(x0 + 0.01, 0.58, z0 + 0.62, x0 + w - 0.01, 0.72, z0 + len + 0.10, M.fabricBed);
  g.add(duvet);
  // Bunched fold where it was kicked off.
  g.add(box({ size: [w - 0.1, 0.20, 0.34], pos: [x, 0.74, z0 + 0.80], mat: M.fabricBed, rotX: -0.12 }));
  g.add(box({ size: [w - 0.25, 0.14, 0.26], pos: [x + 0.08, 0.84, z0 + 1.02], mat: M.fabricBed, rotX: 0.2, rotY: 0.15 }));

  // Pillows.
  g.add(box({ size: [0.60, 0.15, 0.38], pos: [x - 0.32, 0.67, z0 + 0.30], mat: M.pillow, rotZ: 0.06 }));
  g.add(box({ size: [0.58, 0.14, 0.36], pos: [x + 0.32, 0.66, z0 + 0.33], mat: M.pillow, rotZ: -0.05, rotY: 0.09 }));

  return { group: g, bounds: [[x0, 0, z0], [x0 + w, 0.72, z0 + len]] };
}

export function makeNightstand(M, { x, z }) {
  const g = group('nightstand');
  const w = 0.52, d = 0.44, h = 0.55;
  g.add(box({ size: [w, 0.05, d], pos: [x, h, z], mat: M.darkWood }));
  g.add(box({ size: [w - 0.05, h - 0.14, d - 0.04], pos: [x, h / 2 + 0.04, z], mat: M.lightWood }));
  // Drawer face + pull.
  g.add(box({ size: [w - 0.10, 0.16, 0.02], pos: [x, 0.40, z - d / 2 - 0.005], mat: M.darkWood }));
  g.add(cylinder({ r: 0.018, h: 0.09, pos: [x, 0.40, z - d / 2 - 0.03], rotZ: Math.PI / 2, mat: M.chrome }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box({ size: [0.05, 0.12, 0.05], pos: [x + sx * (w / 2 - 0.05), 0.06, z + sz * (d / 2 - 0.05)], mat: M.darkWood }));
    }
  }
  return { group: g, top: h + 0.025, bounds: [[x - w / 2, 0, z - d / 2], [x + w / 2, h, z + d / 2]] };
}

/** Digital alarm clock. Returns the display mesh so the time can tick. */
export function makeAlarmClock(M, { x, y, z, rotY = 0 }) {
  const g = group('alarmclock');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(box({ size: [0.16, 0.075, 0.10], pos: [0, 0.038, 0], mat: M.plasticBlack }));

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = plane(0.115, 0.048, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(0, 0.042, 0.051);
  g.add(screen);

  const draw = (text, dim = false) => {
    const c = canvas.getContext('2d');
    c.fillStyle = '#120303';
    c.fillRect(0, 0, 256, 128);
    c.font = 'bold 78px "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = '#ff2a1e';
    c.shadowBlur = dim ? 8 : 22;
    c.fillStyle = dim ? '#8e1a12' : '#ff3325';
    c.fillText(text, 128, 66);
    tex.needsUpdate = true;
  };
  draw('6:04');

  return { group: g, draw };
}

/* ------------------------------------------------------------------ */
/* Desk + gaming PC                                                    */
/* ------------------------------------------------------------------ */

/**
 * The desk setup. `screen` is the mesh the arcade game renders onto;
 * apartment.js swaps its material map for the game's CanvasTexture.
 */
export function makeDesk(M, { x, z, w = 2.4, d = 0.70, towerSticker = null }) {
  const g = group('desk');
  const top = 0.74;
  const x0 = x - w / 2;
  const z0 = z - d / 2;

  g.add(boxFrom(x0, top - 0.04, z0, x0 + w, top, z0 + d, M.deskTop));
  // Steel frame legs.
  for (const lx of [x0 + 0.06, x0 + w - 0.06]) {
    g.add(box({ size: [0.05, top - 0.04, 0.05], pos: [lx, (top - 0.04) / 2, z0 + 0.06], mat: M.darkSteel }));
    g.add(box({ size: [0.05, top - 0.04, 0.05], pos: [lx, (top - 0.04) / 2, z0 + d - 0.06], mat: M.darkSteel }));
    g.add(box({ size: [0.04, 0.04, d - 0.12], pos: [lx, 0.08, z], mat: M.darkSteel }));
  }
  // Cable tray + a cable spilling over the back.
  g.add(box({ size: [w - 0.5, 0.03, 0.10], pos: [x, top - 0.12, z0 + 0.12], mat: M.plasticGrey }));

  /* ---- monitor ---- */
  const monX = x - 0.22;
  const monBaseZ = z0 + 0.14;
  g.add(box({ size: [0.34, 0.018, 0.22], pos: [monX, top + 0.009, monBaseZ], mat: M.plasticBlack }));
  g.add(box({ size: [0.062, 0.32, 0.062], pos: [monX, top + 0.17, monBaseZ], mat: M.plasticBlack }));
  // Panel: 16:9, tilted back a touch.
  const panel = group('panel');
  panel.position.set(monX, top + 0.47, monBaseZ + 0.02);
  panel.rotation.x = -0.06;
  panel.add(box({ size: [0.82, 0.48, 0.028], pos: [0, 0, -0.016], mat: M.plasticBlack }));
  const screen = plane(0.780, 0.439, M.screenOff.clone());
  screen.position.set(0, 0.006, 0.001);
  panel.add(screen);
  // Power LED.
  const powerLed = box({ size: [0.012, 0.006, 0.004], pos: [0.37, -0.232, 0.004], mat: M.bulbOff });
  panel.add(powerLed);
  g.add(panel);

  /* ---- second monitor, portrait, for the things that are not the game ----
   * Chat on one screen and the game on the other is the whole aesthetic.
   */
  const sideX = x + 0.62;
  const sideZ = z0 + 0.16;
  g.add(box({ size: [0.20, 0.016, 0.18], pos: [sideX, top + 0.008, sideZ], mat: M.plasticBlack }));
  g.add(box({ size: [0.045, 0.26, 0.045], pos: [sideX, top + 0.14, sideZ], mat: M.plasticBlack }));
  const sidePanel = group('sidepanel');
  /* The panel is turned 24 degrees to face the chair, which means its back
   * plane sweeps diagonally across the neck standing behind it -- one edge
   * ends up in front of the neck and the other behind, so the neck came
   * through the screen. Offsetting along the panel's OWN normal instead of
   * along world Z puts the whole back face clear of the neck at every edge. */
  const SIDE_YAW = -0.42;
  const CLEAR = 0.075;            // > half the neck (0.0225) + panel depth
  sidePanel.position.set(
    sideX + Math.sin(SIDE_YAW) * CLEAR,
    top + 0.40,
    sideZ + 0.02 + Math.cos(SIDE_YAW) * CLEAR,
  );
  sidePanel.rotation.set(-0.04, SIDE_YAW, 0);
  sidePanel.add(box({ size: [0.26, 0.42, 0.024], pos: [0, 0, -0.014], mat: M.plasticBlack }));
  const sideScreen = plane(0.234, 0.376, M.screenOff.clone());
  sideScreen.position.set(0, 0.008, 0.001);
  sidePanel.add(sideScreen);
  g.add(sidePanel);
  /* Live: messages land on the in-game clock. See src/core/chat.js. */
  const chatScreen = chatScreenTexture();
  const sideOn = new THREE.MeshBasicMaterial({ map: chatScreen.texture, toneMapped: false });

  /* ---- keyboard, mouse, pad ---- */
  const kbZ = z0 + d - 0.20;
  // Desk mat with a lit edge, because obviously.
  g.add(box({ size: [0.86, 0.006, 0.36], pos: [x - 0.10, top + 0.003, kbZ], mat: M.black }));
  const matGlow = box({
    size: [0.87, 0.004, 0.37], pos: [x - 0.10, top + 0.0045, kbZ], mat: M.ledBlue.clone(), cast: false,
  });
  g.add(matGlow);
  g.add(box({ size: [0.86, 0.006, 0.36], pos: [x - 0.10, top + 0.007, kbZ], mat: M.black, cast: false }));

  const kb = box({ size: [0.44, 0.022, 0.15], pos: [x - 0.16, top + 0.020, kbZ], mat: M.plasticBlack });
  g.add(kb);
  /* Per-key RGB: a fixed rainbow across the board, so it reads as a gaming
   * keyboard from across the room without needing a per-frame update. */
  const keyRows = 4, keyCols = 14;
  const keyLeds = [];
  for (let r = 0; r < keyRows; r++) {
    for (let c = 0; c < keyCols; c++) {
      const hue = ((c / keyCols) * 0.8 + r * 0.03) % 1;
      const capMat = mat({
        color: 0x24242a, roughness: 0.6,
        emissive: new THREE.Color().setHSL(hue, 0.85, 0.5),
        emissiveIntensity: 0,
      });
      keyLeds.push(capMat);
      g.add(box({
        size: [0.024, 0.006, 0.024],
        pos: [x - 0.16 - 0.205 + c * 0.0315, top + 0.034, kbZ - 0.055 + r * 0.033],
        mat: capMat, cast: false,
      }));
    }
  }
  const mouse = sphere({ r: 0.035, ry: 0.018, rz: 0.055, pos: [x + 0.26, top + 0.020, kbZ], mat: M.plasticBlack });
  g.add(mouse);
  const mouseLed = box({
    size: [0.030, 0.004, 0.018], pos: [x + 0.26, top + 0.036, kbZ + 0.012], mat: M.ledBlue.clone(), cast: false,
  });
  g.add(mouseLed);

  /* ---- headset on a stand ---- */
  const hsX = x - 1.02, hsZ = z0 + 0.54;
  g.add(cylinder({ r: 0.070, h: 0.016, pos: [hsX, top + 0.008, hsZ], mat: M.darkSteel }));
  g.add(cylinder({ r: 0.014, h: 0.30, pos: [hsX, top + 0.16, hsZ], mat: M.darkSteel }));
  const hook = box({ size: [0.03, 0.03, 0.13], pos: [hsX, top + 0.30, hsZ + 0.04], mat: M.darkSteel });
  g.add(hook);
  // Headband arc over the hook, earcups hanging either side.
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.088, 0.011, 8, 20, Math.PI),
    M.plasticBlack,
  );
  band.position.set(hsX, top + 0.30, hsZ + 0.02);
  band.rotation.y = Math.PI / 2;
  g.add(band);
  for (const s of [-1, 1]) {
    g.add(cylinder({
      r: 0.043, h: 0.030, pos: [hsX, top + 0.30, hsZ + 0.02 + s * 0.088],
      rotX: Math.PI / 2, mat: M.plasticBlack,
    }));
  }
  // Boom mic, folded down.
  g.add(box({ size: [0.012, 0.012, 0.09], pos: [hsX + 0.03, top + 0.255, hsZ - 0.02], mat: M.plasticBlack, rotX: 0.7 }));

  /* ---- streaming mic on a boom arm ----
   * Built as a clamp, an upright and a horizontal boom rather than two angled
   * struts. The angled version left the lower strut's end hanging 8cm above
   * the clamp, which reads as a mic floating in mid-air; right angles cannot
   * do that. Every joint below is stated as a shared coordinate, not an angle.
   */
  const armX = x - 1.14;
  const clampZ = z0 + 0.06;
  const clampTop = top + 0.085;
  g.add(box({ size: [0.05, 0.09, 0.05], pos: [armX, top + 0.04, clampZ], mat: M.darkSteel }));

  // Upright: stands on the clamp.
  const postTop = top + 0.56;
  const postH = postTop - clampTop;
  g.add(box({
    size: [0.024, postH, 0.024], pos: [armX, clampTop + postH / 2, clampZ], mat: M.darkSteel,
  }));
  // Knuckle where the boom pivots off the upright.
  g.add(cylinder({ r: 0.019, h: 0.034, pos: [armX, postTop, clampZ], mat: M.plasticBlack, rotZ: Math.PI / 2 }));

  // Boom: out over the desk, dropping very slightly, ending above the keyboard.
  const boomEndZ = clampZ + 0.40;
  const boomLen = boomEndZ - clampZ;
  g.add(box({
    size: [0.020, 0.020, boomLen],
    pos: [armX, postTop - 0.02, clampZ + boomLen / 2], mat: M.darkSteel, rotX: 0.10,
  }));

  // Mic hangs off the boom end on a short yoke, angled back at the chair.
  const micY = postTop - 0.16;
  g.add(box({ size: [0.014, 0.075, 0.014], pos: [armX, postTop - 0.055, boomEndZ], mat: M.plasticBlack }));
  const micBody = cylinder({
    r: 0.035, h: 0.13, pos: [armX, micY, boomEndZ + 0.012], mat: M.darkSteel, rotX: 0.28,
  });
  g.add(micBody);
  const micLed = cylinder({
    r: 0.012, h: 0.010, pos: [armX, micY - 0.030, boomEndZ + 0.046], mat: M.ledRed.clone(), rotX: 0.28,
  });
  g.add(micLed);

  /* ---- PC tower under the desk ----
   * A glass-side case with three lit intake fans, a graphics card with a lit
   * logo, and a radiator up top. All of it faces into the room.
   */
  const towerX = x + 0.94;
  const tower = group('tower');
  const tW = 0.24, tH = 0.52, tD = 0.50;
  tower.add(box({ size: [tW, tH, tD], pos: [towerX, tH / 2, z], mat: M.plasticBlack }));
  const sideGlass = plane(tD - 0.05, tH - 0.05, new THREE.MeshPhysicalMaterial({
    color: 0x11131a, roughness: 0.06, transmission: 0.6, transparent: true, opacity: 0.55, thickness: 0.01,
  }));
  sideGlass.position.set(towerX - tW / 2 - 0.001, tH / 2, z);
  sideGlass.rotation.y = -Math.PI / 2;
  tower.add(sideGlass);

  /* Vinyl sticker slapped on the glass. Transparent PNGs only -- anything with
   * a background reads as a photo taped on rather than a die-cut sticker. */
  if (towerSticker) {
    const sw = 0.20;
    const ar = towerSticker.image
      ? towerSticker.image.width / towerSticker.image.height : 1;
    const decal = plane(sw, sw / (ar || 1), new THREE.MeshBasicMaterial({
      map: towerSticker, transparent: true, alphaTest: 0.06, toneMapped: false,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    decal.position.set(towerX - tW / 2 - 0.004, tH / 2 + 0.06, z - 0.03);
    decal.rotation.set(0, -Math.PI / 2, 0.06);
    tower.add(decal);
  }

  const rgb = [];
  // Three intake fans down the front edge.
  for (let i = 0; i < 3; i++) {
    const fz = z + tD / 2 - 0.10 - i * 0.0001;
    void fz;
    const fy = 0.12 + i * 0.145;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.052, 0.010, 8, 22),
      M.ledBlue.clone(),
    );
    ring.position.set(towerX - 0.055, fy, z + tD / 2 - 0.06);
    tower.add(ring);
    rgb.push(ring);
    // Hub + blades, dark against the glow.
    tower.add(cylinder({
      r: 0.018, h: 0.012, pos: [towerX - 0.055, fy, z + tD / 2 - 0.06],
      rotZ: Math.PI / 2, mat: M.plasticBlack, cast: false,
    }));
  }
  // Graphics card slung across the middle, logo lit.
  tower.add(box({ size: [0.10, 0.05, 0.30], pos: [towerX - 0.03, 0.24, z - 0.04], mat: M.darkSteel }));
  const gpuLogo = box({ size: [0.004, 0.016, 0.11], pos: [towerX - 0.081, 0.253, z - 0.04], mat: M.ledBlue.clone(), cast: false });
  tower.add(gpuLogo);
  rgb.push(gpuLogo);
  // Radiator across the top.
  tower.add(box({ size: [0.16, 0.05, 0.34], pos: [towerX - 0.02, tH - 0.05, z], mat: M.darkSteel }));
  const rgbStrip = box({ size: [0.02, 0.34, 0.02], pos: [towerX - 0.062, 0.26, z - tD / 2 + 0.05], mat: M.ledBlue.clone() });
  tower.add(rgbStrip);
  rgb.push(rgbStrip);
  g.add(tower);

  return {
    group: g,
    top,
    screen,
    panel,
    sideScreen,
    sideOn,
    /** Repaint the chat pane from a Chat feed. */
    repaintChat: chatScreen.repaint,
    sidePanelObject: sidePanel,
    sideOff: sideScreen.material,
    sidePanel,
    powerLed,
    micLed,
    /** Everything that lights up when the tower is on. */
    rgb,
    /** Keyboard key materials, lit as a group. */
    keyLeds: [...keyLeds, matGlow.material, mouseLed.material],
    monitorPos: new THREE.Vector3(monX, top + 0.47, monBaseZ + 0.02),
    bounds: [[x0, 0, z0], [x0 + w, top, z0 + d]],
  };
}

/**
 * The second monitor's contents: a chat client on the roster's server.
 *
 * Repainted whenever a message lands, which is what makes it the second way
 * to find out about Wednesday -- see src/core/chat.js. The chrome around the
 * message pane is static, so only the pane is redrawn.
 *
 * @returns {{texture: THREE.CanvasTexture, repaint: (chat) => void}}
 */
function chatScreenTexture() {
  const W = 320, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  g.fillStyle = '#2b2d34';
  g.fillRect(0, 0, W, H);
  // Server rail.
  g.fillStyle = '#1c1e22';
  g.fillRect(0, 0, 34, H);
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i === 0 ? '#7a5cc4' : '#3a3d45';
    g.beginPath();
    g.arc(17, 26 + i * 40, 12, 0, 7);
    g.fill();
  }
  // Channel list.
  g.fillStyle = '#22242a';
  g.fillRect(34, 0, 96, H);
  g.fillStyle = '#e8ecf4';
  g.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
  g.fillText('Silver Sasq…', 42, 22);
  g.font = '10px "Segoe UI", system-ui, sans-serif';
  const channels = ['# general', '# purgatory', '# clips', '# recruitment', '# squatch-lounge', '# pinned-copium'];
  channels.forEach((ch, i) => {
    g.fillStyle = i === 0 ? '#dfe4ee' : '#828a99';
    g.fillText(ch, 44, 48 + i * 19);
  });
  g.fillStyle = '#828a99';
  g.font = '9px "Segoe UI", system-ui, sans-serif';
  g.fillText('VOICE — 0 CONNECTED', 42, 190);

  // Message pane, repainted as the day goes on.
  const drawMessages = (chat) => {
    g.fillStyle = '#33363e';
    g.fillRect(130, 0, W - 130, H - 44);

    const msgs = chat
      ? chat.visible(9)
      : [['BOOSKIBRO', '#8fb6ff', 'anyone up']].map(([who, colour, text]) => ({ who, colour, text }));

    let y = 34;
    for (const m of msgs) {
      g.fillStyle = '#4a4d57';
      g.beginPath(); g.arc(146, y - 4, 8, 0, 7); g.fill();
      g.fillStyle = m.colour || '#c6ccd8';
      g.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
      g.fillText(m.who, 160, y - 5);
      g.fillStyle = '#c6ccd8';
      g.font = '11px "Segoe UI", system-ui, sans-serif';
      g.fillText(m.text, 160, y + 9);
      y += 40;
    }
    g.fillStyle = '#6b7280';
    g.font = 'italic 10px "Segoe UI", system-ui, sans-serif';
    g.fillText(chat && chat.unread ? `${chat.unread} unread` : 'No one is typing.', 160, y + 6);
  };
  drawMessages(null);

  // Compose box.
  g.fillStyle = '#42454e';
  g.fillRect(140, H - 40, W - 152, 26);
  g.fillStyle = '#767c88';
  g.font = '10px "Segoe UI", system-ui, sans-serif';
  g.fillText('Message #general', 150, H - 23);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return {
    texture,
    repaint(chat) { drawMessages(chat); texture.needsUpdate = true; },
  };

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Rolling gaming chair. Returns the seat group so it can swivel. */
export function makeChair(M, { x, z, rotY = 0 }) {
  const g = group('chair');
  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  // Base star + castors.
  g.add(cylinder({ r: 0.045, h: 0.34, pos: [0, 0.28, 0], mat: M.darkSteel }));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = box({ size: [0.05, 0.03, 0.30], pos: [Math.sin(a) * 0.15, 0.10, Math.cos(a) * 0.15], mat: M.plasticBlack });
    leg.rotation.y = a;
    g.add(leg);
    g.add(cylinder({ r: 0.032, h: 0.03, pos: [Math.sin(a) * 0.29, 0.035, Math.cos(a) * 0.29], rotX: Math.PI / 2, mat: M.plasticBlack }));
  }
  // Seat + back + racing bolsters.
  g.add(box({ size: [0.50, 0.10, 0.48], pos: [0, 0.48, 0], mat: M.fabricCouch }));
  g.add(box({ size: [0.09, 0.09, 0.44], pos: [-0.22, 0.55, 0], mat: M.fabricCouch }));
  g.add(box({ size: [0.09, 0.09, 0.44], pos: [0.22, 0.55, 0], mat: M.fabricCouch }));
  const back = box({ size: [0.48, 0.62, 0.10], pos: [0, 0.84, -0.20], mat: M.fabricCouch, rotX: 0.10 });
  g.add(back);
  g.add(box({ size: [0.10, 0.58, 0.06], pos: [-0.21, 0.86, -0.16], mat: M.plasticBlack, rotX: 0.10 }));
  g.add(box({ size: [0.10, 0.58, 0.06], pos: [0.21, 0.86, -0.16], mat: M.plasticBlack, rotX: 0.10 }));
  // Armrests.
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.05, 0.16, 0.05], pos: [sx * 0.27, 0.61, -0.02], mat: M.plasticBlack }));
    g.add(box({ size: [0.08, 0.03, 0.26], pos: [sx * 0.27, 0.70, 0.02], mat: M.plasticBlack }));
  }
  // Headrest.
  g.add(box({ size: [0.30, 0.14, 0.09], pos: [0, 1.14, -0.24], mat: M.plasticBlack, rotX: 0.10 }));

  return { group: g, bounds: [[x - 0.32, 0, z - 0.32], [x + 0.32, 0.5, z + 0.32]] };
}

/* ------------------------------------------------------------------ */
/* Kitchen                                                             */
/* ------------------------------------------------------------------ */

/**
 * Fridge against the east wall, door hinged on its north edge.
 * Returns { doorPivot, interior, light, beerSlots }.
 */
export function makeFridge(M, { x, z, w = 0.80, d = 0.72, h = 1.85 }) {
  const g = group('fridge');
  const z0 = z - w / 2;      // north edge (hinge side)
  const x0 = x - d / 2;      // front face (west, faces into the room)

  // Body: an open-fronted box so the interior is visible when the door swings.
  const body = group('fridgeBody');
  body.add(boxFrom(x0, 0, z0, x0 + d, 0.06, z0 + w, M.plasticBlack));           // base
  body.add(boxFrom(x0, h - 0.06, z0, x0 + d, h, z0 + w, M.steel));              // top
  body.add(boxFrom(x0 + d - 0.05, 0.06, z0, x0 + d, h - 0.06, z0 + w, M.plasticGrey)); // back
  body.add(boxFrom(x0, 0.06, z0, x0 + d - 0.05, h - 0.06, z0 + 0.05, M.plasticGrey));  // north side
  body.add(boxFrom(x0, 0.06, z0 + w - 0.05, x0 + d - 0.05, h - 0.06, z0 + w, M.plasticGrey)); // south side
  g.add(body);

  // Interior liner + shelves.
  const liner = mat({ color: 0xe9ebe6, roughness: 0.7 });
  const inX0 = x0 + 0.06, inX1 = x0 + d - 0.06;
  const inZ0 = z0 + 0.06, inZ1 = z0 + w - 0.06;
  g.add(boxFrom(inX1 - 0.01, 0.10, inZ0, inX1, h - 0.10, inZ1, liner, { cast: false }));
  const shelfY = [0.42, 0.78, 1.14, 1.48];
  const shelfMat = new THREE.MeshPhysicalMaterial({
    color: 0xdfe8ee, roughness: 0.1, transmission: 0.7, transparent: true, opacity: 0.5, thickness: 0.01,
  });
  for (const sy of shelfY) {
    g.add(boxFrom(inX0, sy, inZ0, inX1, sy + 0.012, inZ1, shelfMat, { cast: false }));
  }

  // Stock: beers on the second shelf, sad leftovers elsewhere.
  const beerSlots = [];
  for (let i = 0; i < 6; i++) {
    const bx = inX0 + 0.14 + (i % 3) * 0.19;
    const bz = inZ0 + 0.18 + Math.floor(i / 3) * 0.26;
    const can = makeBeerCan(M, { x: bx, y: 0.79, z: bz });
    g.add(can.group);
    beerSlots.push(can.group);
  }
  g.add(cylinder({ r: 0.035, h: 0.20, pos: [inX0 + 0.14, 1.59, inZ1 - 0.16], mat: mat({ color: 0xc23a2a, roughness: 0.4 }) }));
  g.add(cylinder({ r: 0.032, h: 0.17, pos: [inX0 + 0.24, 1.575, inZ1 - 0.16], mat: mat({ color: 0xd8b53a, roughness: 0.4 }) }));
  // Half a lime, going grey.
  g.add(sphere({ r: 0.035, pos: [inX1 - 0.14, 0.455, inZ0 + 0.14], mat: mat({ color: 0x8fa054, roughness: 0.9 }) }));

  // Interior light, off until the door opens.
  const light = new THREE.PointLight(0xfff0d0, 0, 1.4, 2);
  light.position.set(inX1 - 0.10, h - 0.20, (inZ0 + inZ1) / 2);
  g.add(light);

  /* ---- door ----
   * Hinged on the south edge so it swings into the open corner. Hinging it
   * north would sweep the door straight through the counter run.
   * Door geometry runs along local -z from the pivot.
   */
  const doorPivot = new THREE.Group();
  doorPivot.position.set(x0 + 0.02, 0, z0 + w - 0.03);
  const door = group('fridgeDoor');
  const dw = w - 0.06;
  const binMat = mat({ color: 0xdfe2de, roughness: 0.6 });
  door.add(box({ size: [0.06, h - 0.08, dw], pos: [0, h / 2, -dw / 2], mat: M.steel }));
  // Inner shelf lip + condiment door bins.
  door.add(box({ size: [0.09, 0.10, w - 0.16], pos: [0.06, 0.62, -dw / 2], mat: binMat }));
  door.add(box({ size: [0.09, 0.10, w - 0.16], pos: [0.06, 1.05, -dw / 2], mat: binMat }));
  // Vertical bar handle, on the free edge. Named, along with everything else
  // stuck to the outside, so the door face can be checked for overlaps --
  // coplanar decals are invisible to the room's 3D clash pass.
  const bar = cylinder({ r: 0.016, h: 0.85, pos: [-0.075, 1.02, -(w - 0.16)], mat: M.chrome });
  bar.name = 'doorface:handle';
  door.add(bar);
  for (const by of [1.44, 0.60]) {
    const br = box({ size: [0.05, 0.03, 0.03], pos: [-0.05, by, -(w - 0.16)], mat: M.chrome });
    br.name = 'doorface:handle';
    door.add(br);
  }
  doorPivot.add(door);
  g.add(doorPivot);

  // Magnets and a takeout menu on the door front.
  for (const [my, mz, col] of [[1.30, -0.30, 0xff5a3c], [1.22, -0.46, 0x3ca0ff], [1.44, -0.52, 0xffd23c]]) {
    const m = cylinder({
      r: 0.018, h: 0.008, pos: [-0.035, my, mz], rotZ: Math.PI / 2,
      mat: mat({ color: col, roughness: 0.5 }),
    });
    m.name = 'doorface:magnet';
    door.add(m);
  }
  const menu = plane(0.16, 0.22, M.paper);
  menu.name = 'doorface:menu';
  menu.position.set(-0.032, 1.26, -0.40);
  menu.rotation.y = -Math.PI / 2;
  menu.rotation.z = 0.06;
  door.add(menu);

  return {
    group: g,
    doorPivot,
    door,
    light,
    beerSlots,
    handlePos: new THREE.Vector3(x0 - 0.02, 1.02, z0 + 0.13),
    bounds: [[x0, 0, z0], [x0 + d, h, z0 + w]],
    // So the caller can stock the shelves and stand things on the lid.
    interior: { x0: inX0, x1: inX1, z0: inZ0, z1: inZ1, shelfY },
    top: h,
    centre: new THREE.Vector3(x0 + d / 2, 0, z0 + w / 2),
  };
}

/**
 * The wrap for the beer can body. The supplied artwork is portrait, and the
 * can's circumference is nearly twice its height, so the label repeats three
 * times around rather than being stretched into a smear.
 */
let _beerLabelMat = null;
export function beerLabelMaterial(texture) {
  if (!texture) return null;
  const tex = texture.clone();
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.anisotropy = 8;
  _beerLabelMat = mat({ map: tex, roughness: 0.42, metalness: 0.05 });
  return _beerLabelMat;
}

/** A single beer can. */
export function makeBeerCan(M, { x, y, z, crushed = false, rotY = 0 }) {
  const g = group('beer');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  if (crushed) {
    g.add(cylinder({ r: 0.033, h: 0.05, pos: [0, 0.025, 0], mat: M.aluminium, rotZ: 0.4 }));
    return { group: g };
  }
  g.add(cylinder({ r: 0.033, h: 0.115, pos: [0, 0.058, 0], mat: _beerLabelMat || M.beerLabel }));
  g.add(cylinder({ r: 0.030, h: 0.012, pos: [0, 0.121, 0], mat: M.aluminium }));
  g.add(cylinder({ r: 0.030, h: 0.010, pos: [0, 0.005, 0], mat: M.aluminium }));
  return { group: g };
}

/**
 * Counter run with sink, cooktop, upper cabinets and a microwave.
 *
 * Everything on the worktop is laid out from one table of z positions rather
 * than ad-hoc offsets, so nothing ends up sharing space with anything else.
 * The microwave is wall-mounted in a gap in the cabinet run, well clear of
 * the hob, and the free spots either side of the sink are returned so the
 * caller can put the bottle and the smokes down without guessing.
 */
export function makeKitchen(M, { x, z0, z1, d = 0.62, wallX = 5 }) {
  const g = group('kitchen');
  const top = 0.92;
  const x0 = wallX - d;

  // North to south along the run. Ranges do not overlap.
  const L = {
    hob: -1.56,          // 0.52 deep -> -1.82 .. -1.30
    kettle: -1.10,
    mug: -0.93,
    knives: -0.74,
    sink: -0.14,         // basin 0.72 deep -> -0.50 .. 0.22
    soap: 0.37,
    bottle: 0.57,
    shot: 0.73,
    ashtray: 0.91,
    smokes: 1.13,
    microwave: 1.19,     // on the wall, above the clutter
    cabinetEnd: 0.86,    // upper cabinets stop here to leave the appliance gap
  };

  /* A cabinet pull is a bar held off the door by two posts. Drawn as a bare
   * floating cylinder it sits a few millimetres proud of the door with nothing
   * joining it, which is exactly the "not quite right" you cannot name until
   * you look straight at it. `face` is the door's outward face; everything
   * else is measured from there so the posts always land on the door. */
  const pull = (face, y, z, len = 0.11) => {
    const bar = face - 0.030;
    g.add(cylinder({ r: 0.009, h: len, pos: [bar, y, z], mat: M.chrome }));
    for (const dz of [-len / 2 + 0.012, len / 2 - 0.012]) {
      g.add(cylinder({
        r: 0.005, h: 0.030, pos: [face - 0.015, y, z + dz], rotZ: Math.PI / 2, mat: M.chrome,
      }));
    }
  };

  // Toe kick + carcass + counter top.
  g.add(boxFrom(x0 + 0.06, 0, z0, wallX, 0.10, z1, M.plasticGrey));
  g.add(boxFrom(x0, 0.10, z0, wallX, top - 0.04, z1, M.lightWood));
  g.add(boxFrom(x0 - 0.02, top - 0.04, z0, wallX, top, z1, M.counter));

  // Door fronts + pulls.
  const nDoors = Math.max(2, Math.round((z1 - z0) / 0.55));
  const dw = (z1 - z0) / nDoors;
  for (let i = 0; i < nDoors; i++) {
    const cz = z0 + dw * (i + 0.5);
    g.add(box({ size: [0.02, top - 0.22, dw - 0.03], pos: [x0 - 0.012, 0.10 + (top - 0.18) / 2, cz], mat: M.cabinet }));
    pull(x0 - 0.022, top - 0.16, cz);
  }

  /* ---- sink: a real inset basin, not a flat plate ---- */
  const sinkZ = L.sink;
  const bx0 = x0 + 0.10, bx1 = wallX - 0.12;
  const bz0 = sinkZ - 0.36, bz1 = sinkZ + 0.36;
  const DEPTH = 0.17;
  const steelIn = mat({ map: T_brushed, roughness: 0.28, metalness: 0.85 });

  // Basin: four inner walls and a bottom, dropped below the counter, with a
  // narrow rim standing proud of the laminate.
  g.add(boxFrom(bx0 - 0.02, top - 0.01, bz0 - 0.02, bx1 + 0.02, top + 0.008, bz1 + 0.02, M.steel, { cast: false }));
  g.add(boxFrom(bx0, top - DEPTH, bz0, bx1, top - DEPTH + 0.012, bz1, steelIn, { cast: false }));
  g.add(boxFrom(bx0, top - DEPTH, bz0, bx0 + 0.012, top, bz1, steelIn, { cast: false }));
  g.add(boxFrom(bx1 - 0.012, top - DEPTH, bz0, bx1, top, bz1, steelIn, { cast: false }));
  g.add(boxFrom(bx0, top - DEPTH, bz0, bx1, top, bz0 + 0.012, steelIn, { cast: false }));
  g.add(boxFrom(bx0, top - DEPTH, bz1 - 0.012, bx1, top, bz1, steelIn, { cast: false }));
  // Plughole.
  g.add(cylinder({ r: 0.028, h: 0.006, pos: [(bx0 + bx1) / 2, top - DEPTH + 0.014, sinkZ], mat: M.chrome }));

  // Mixer tap: riser, gooseneck spout, lever.
  g.add(cylinder({ r: 0.030, h: 0.018, pos: [wallX - 0.13, top + 0.009, sinkZ], mat: M.chrome }));
  g.add(cylinder({ r: 0.020, h: 0.20, pos: [wallX - 0.13, top + 0.11, sinkZ], mat: M.chrome }));
  const spout = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.018, 8, 20, Math.PI / 2),
    M.chrome,
  );
  spout.position.set(wallX - 0.13, top + 0.21, sinkZ);
  spout.rotation.set(0, Math.PI / 2, Math.PI);
  spout.castShadow = true;
  g.add(spout);
  g.add(cylinder({ r: 0.018, h: 0.035, pos: [wallX - 0.205, top + 0.195, sinkZ], mat: M.chrome }));
  g.add(box({ size: [0.075, 0.014, 0.016], pos: [wallX - 0.17, top + 0.20, sinkZ + 0.045], mat: M.chrome, rotZ: 0.25 }));

  // Washing-up nobody has dealt with, sitting down in the basin.
  g.add(cylinder({ r: 0.095, h: 0.014, pos: [bx0 + 0.16, top - DEPTH + 0.024, sinkZ - 0.05], mat: M.paper, rotZ: 0.05 }));
  g.add(cylinder({ r: 0.088, h: 0.014, pos: [bx0 + 0.17, top - DEPTH + 0.040, sinkZ + 0.04], mat: M.paper, rotZ: -0.04 }));
  g.add(cylinder({ rTop: 0.042, rBottom: 0.034, h: 0.09, pos: [bx1 - 0.13, top - DEPTH + 0.06, sinkZ + 0.09], mat: M.glass }));
  // Washing-up liquid on the rim.
  g.add(cylinder({ rTop: 0.020, rBottom: 0.028, h: 0.15, pos: [wallX - 0.30, top + 0.075, L.soap], mat: mat({ color: 0x2f9c5a, roughness: 0.35 }) }));

  // Cooktop.
  const stoveZ = L.hob;
  g.add(boxFrom(x0 + 0.06, top, stoveZ - 0.26, wallX - 0.06, top + 0.012, stoveZ + 0.26, M.black, { cast: false }));
  for (const [bx, bz] of [[-0.12, -0.13], [0.12, -0.13], [-0.12, 0.13], [0.12, 0.13]]) {
    g.add(cylinder({ r: 0.055, h: 0.006, pos: [x0 + d / 2 + bx, top + 0.019, stoveZ + bz], mat: M.darkSteel }));
  }

  // Upper cabinets.
  const upY0 = 1.48, upY1 = 2.22, upD = 0.34;
  g.add(boxFrom(wallX - upD, upY0, z0, wallX, upY1, L.cabinetEnd, M.lightWood));
  const nUpper = Math.max(2, Math.round((L.cabinetEnd - z0) / 0.55));
  const udw = (L.cabinetEnd - z0) / nUpper;
  for (let i = 0; i < nUpper; i++) {
    const cz = z0 + udw * (i + 0.5);
    g.add(box({ size: [0.02, upY1 - upY0 - 0.04, udw - 0.03], pos: [wallX - upD - 0.012, (upY0 + upY1) / 2, cz], mat: M.cabinet }));
    pull(wallX - upD - 0.022, upY0 + 0.12, cz);
  }

  /* ---- microwave: wall-mounted in the cabinet gap, nowhere near the hob ---- */
  const mwZ = L.microwave;
  const mwY = 1.62;                 // 0.70 of clear air above the worktop
  g.add(box({ size: [0.40, 0.30, 0.48], pos: [wallX - 0.22, mwY, mwZ], mat: M.plasticGrey }));
  /* A cabinet over the top, which is what an over-the-counter microwave hangs
   * from. The upper run stops at cabinetEnd to leave this gap, so without
   * something here the old bracket rose out of the microwave and stopped in
   * mid-air, holding it to nothing. */
  g.add(boxFrom(wallX - upD, mwY + 0.16, mwZ - 0.26, wallX, upY1, mwZ + 0.26, M.lightWood));
  g.add(box({
    size: [0.02, upY1 - (mwY + 0.16) - 0.04, 0.49],
    pos: [wallX - upD - 0.012, (mwY + 0.16 + upY1) / 2, mwZ], mat: M.cabinet,
  }));
  pull(wallX - upD - 0.022, mwY + 0.30, mwZ, 0.14);
  g.add(box({ size: [0.30, 0.05, 0.50], pos: [wallX - 0.20, mwY + 0.175, mwZ], mat: M.darkSteel }));

  const mwDoor = plane(0.30, 0.21, new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.25 }));
  mwDoor.position.set(wallX - 0.421, mwY, mwZ - 0.09);
  mwDoor.rotation.y = -Math.PI / 2;
  g.add(mwDoor);
  // Handle on the door's trailing edge, then the panel, then the clock in it.
  g.add(box({ size: [0.012, 0.20, 0.02], pos: [wallX - 0.418, mwY, mwZ + 0.075], mat: M.chrome }));
  const mwClock = plane(0.085, 0.032, M.ledGreen);
  mwClock.position.set(wallX - 0.421, mwY + 0.075, mwZ + 0.165);
  mwClock.rotation.y = -Math.PI / 2;
  g.add(mwClock);

  // Kettle, mug and knife block, spaced along the run north of the sink.
  g.add(cylinder({ rTop: 0.075, rBottom: 0.085, h: 0.18, pos: [x0 + 0.30, top + 0.09, L.kettle], mat: M.steel }));
  g.add(cylinder({ r: 0.042, h: 0.095, pos: [x0 + 0.22, top + 0.048, L.mug], mat: mat({ color: 0x2f6b8a, roughness: 0.4 }) }));
  g.add(box({ size: [0.14, 0.24, 0.12], pos: [x0 + 0.26, top + 0.12, L.knives], mat: M.darkWood, rotY: 0.2 }));

  return {
    group: g,
    top,
    bounds: [[x0 - 0.04, 0, z0], [wallX, top, z1]],
    upperBounds: [[wallX - upD, upY0, z0], [wallX, upY1, z1]],
    sinkPos: new THREE.Vector3(x0, top + 0.1, sinkZ),
    /** Where water leaves the spout, and where it lands in the basin. */
    tapPos: new THREE.Vector3(wallX - 0.205, top + 0.185, sinkZ),
    basinPos: new THREE.Vector3(wallX - 0.205, top - DEPTH + 0.02, sinkZ),
    microwavePos: new THREE.Vector3(x0 + 0.1, mwY, mwZ),
    /** Clear worktop positions, so callers do not have to guess. */
    /** Centre of the hob, at worktop height, for standing a pan on. */
    hob: new THREE.Vector3(x0 + d / 2, top + 0.025, L.hob),
    spots: {
      bottle: new THREE.Vector3(wallX - 0.30, top, L.bottle),
      shot: new THREE.Vector3(wallX - 0.44, top, L.shot),
      ashtray: new THREE.Vector3(wallX - 0.32, top, L.ashtray),
      smokes: new THREE.Vector3(wallX - 0.30, top, L.smokes),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Living area                                                         */
/* ------------------------------------------------------------------ */

/** Two-seat couch. `facing` is 'east' (arm-to-arm runs along z). */
export function makeCouch(M, { x, z, len = 2.15, depth = 0.88 }) {
  const g = group('couch');
  const x0 = x - depth / 2;
  const z0 = z - len / 2;

  g.add(boxFrom(x0, 0.14, z0, x0 + depth, 0.38, z0 + len, M.fabricCouch));           // base
  g.add(boxFrom(x0, 0.38, z0 + 0.06, x0 + 0.30, 0.86, z0 + len - 0.06, M.fabricCouch)); // backrest
  g.add(boxFrom(x0, 0.38, z0, x0 + depth, 0.66, z0 + 0.16, M.fabricCouch));          // arm
  g.add(boxFrom(x0, 0.38, z0 + len - 0.16, x0 + depth, 0.66, z0 + len, M.fabricCouch)); // arm

  // Seat + back cushions, slightly askew.
  for (let i = 0; i < 2; i++) {
    const cz = z0 + 0.20 + i * (len - 0.40) / 2 + (len - 0.40) / 4;
    g.add(box({ size: [depth - 0.34, 0.16, (len - 0.44) / 2 - 0.03], pos: [x0 + 0.30 + (depth - 0.34) / 2, 0.46, cz], mat: M.fabricCouch, rotY: i ? 0.02 : -0.015 }));
    g.add(box({ size: [0.14, 0.38, (len - 0.44) / 2 - 0.05], pos: [x0 + 0.36, 0.62, cz], mat: M.fabricCouch, rotZ: i ? 0.03 : -0.02 }));
  }
  // Throw blanket over one arm.
  g.add(box({ size: [depth - 0.1, 0.05, 0.34], pos: [x + 0.02, 0.68, z0 + 0.26], mat: mat({ color: 0x8a5a3c, roughness: 1 }), rotZ: 0.04 }));
  // Feet.
  for (const [fx, fz] of [[x0 + 0.10, z0 + 0.10], [x0 + depth - 0.10, z0 + 0.10],
                          [x0 + 0.10, z0 + len - 0.10], [x0 + depth - 0.10, z0 + len - 0.10]]) {
    g.add(cylinder({ r: 0.03, h: 0.14, pos: [fx, 0.07, fz], mat: M.darkWood }));
  }
  return { group: g, bounds: [[x0, 0, z0], [x0 + depth, 0.66, z0 + len]] };
}

export function makeCoffeeTable(M, { x, z, w = 1.05, d = 0.56 }) {
  const g = group('coffeetable');
  const h = 0.42;
  g.add(box({ size: [w, 0.04, d], pos: [x, h, z], mat: M.darkWood }));
  g.add(box({ size: [w - 0.20, 0.03, d - 0.16], pos: [x, 0.16, z], mat: M.darkWood }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box({ size: [0.05, h, 0.05], pos: [x + sx * (w / 2 - 0.06), h / 2, z + sz * (d / 2 - 0.06)], mat: M.darkWood }));
    }
  }
  return { group: g, top: h + 0.02, bounds: [[x - w / 2, 0, z - d / 2], [x + w / 2, h, z + d / 2]] };
}

/** Greasy pizza box, lid ajar. */
export function makePizzaBox(M, { x, y, z, rotY = 0 }) {
  const g = group('pizzabox');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  /*
   * 34cm, not 40. A large pizza box is about fourteen inches and this coffee
   * table is 105 by 56, so a 40cm box with its lid up came out DEEPER than the
   * table it stood on -- it hung four centimetres over the front edge whatever
   * you did with the position.
   *
   * The lid tips back off the base's back edge, and it is hinged there rather
   * than floated near it. It used to lean the wrong way, forward over the
   * pizza, and sit six centimetres behind the box with nothing joining them,
   * because the rotation happens about the panel's own centre -- so the hinge
   * position has to be derived from where that rotation puts the bottom edge,
   * not guessed.
   */
  const W = 0.34, HALF = W / 2, DEEP = 0.045, LEAN = 1.35;
  g.add(box({ size: [W, DEEP, W], pos: [0, DEEP / 2, 0], mat: M.cardboard }));
  // Bottom edge of the tilted panel, relative to its own centre.
  const dy = HALF * Math.sin(LEAN);
  const dz = HALF * Math.cos(LEAN);
  const lid = box({
    size: [W, 0.02, W], mat: M.cardboard, rotX: LEAN,
    pos: [0, DEEP + dy, -HALF - dz],   // lands that edge on the base's back lip
  });
  g.add(lid);
  /*
   * What is left of it.
   *
   * This was one flat sector of a circle in a single colour, which from above
   * is a beige triangle and from any other angle is nothing at all. A pizza is
   * four things stacked -- board, crust, sauce, cheese -- and the reason you
   * can tell one has been eaten is the SLICES: separate wedges with gaps
   * between them where the missing ones were, each sitting slightly differently
   * because somebody picked up the ones next to it.
   */
  const R = 0.148;
  const board = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.003, 28),
    mat({ color: 0xd9cdb4, roughness: 1 }),
  );
  board.position.set(0, DEEP + 0.0015, 0);
  g.add(board);

  const crustMat = mat({ color: 0xc98f45, roughness: 0.88 });
  const sauceMat = mat({ color: 0x9e2d18, roughness: 0.72 });
  const cheeseMat = mat({ color: 0xe0b256, roughness: 0.55 });
  const meatMat = mat({ color: 0x8f2f28, roughness: 0.6 });
  const charMat = mat({ color: 0x6b4a24, roughness: 0.95 });

  /* Three eaten out of eight, and not three in a row -- one from the near
   * side, then two together, which is how a box actually empties. */
  const SLICES = 8;
  const GONE = new Set([0, 3, 4]);
  const wedge = (Math.PI * 2) / SLICES;
  /** Per wedge: the slice, and the mark it leaves when it goes. */
  const wedges = [];

  for (let i = 0; i < SLICES; i++) {
    const a0 = i * wedge + 0.028;             // a hair of gap, so they read apart
    const span = wedge - 0.056;
    const slice = new THREE.Group();
    slice.visible = !GONE.has(i);
    // Each one nudged out from the middle by a different amount.
    const drift = ((i * 37) % 11) / 11;
    /* three's CylinderGeometry lays theta out from +Z toward +X -- its vertex
     * is (sin, cos), not (cos, sin). Everything positioned ON a wedge has to
     * use the same convention or it lands ninety degrees away, which is how
     * the toppings ended up on the bare cardboard where the eaten slices had
     * been. */
    slice.position.set(
      Math.sin(a0 + span / 2) * drift * 0.006,
      DEEP + 0.004,
      Math.cos(a0 + span / 2) * drift * 0.006,
    );
    slice.rotation.y = drift * 0.03;
    g.add(slice);
    wedges[i] = { slice, ghost: null, crumbs: [] };

    // Base, sauce to the edge of the crust, then cheese short of that.
    const baseGeo = new THREE.CylinderGeometry(R, R, 0.008, 10, 1, false, a0, span);
    const base = new THREE.Mesh(baseGeo, crustMat);
    base.castShadow = true;
    slice.add(base);
    slice.add(new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.86, R * 0.86, 0.010, 10, 1, false, a0, span), sauceMat,
    ));
    const cheese = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.82, R * 0.82, 0.013, 10, 1, false, a0, span), cheeseMat,
    );
    cheese.position.y = 0.001;
    slice.add(cheese);

    // Two or three bits of meat per slice, inside the cheese.
    for (let k = 0; k < 2 + (i % 2); k++) {
      const t = 0.30 + ((i * 5 + k * 3) % 7) / 11;
      const ang = a0 + span * (0.22 + ((k * 4 + i) % 5) / 7.5);
      const pep = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.004, 10), meatMat);
      pep.position.set(Math.sin(ang) * R * t, 0.009, Math.cos(ang) * R * t);
      slice.add(pep);
    }
    // One scorched blister on the crust, because ovens.
    if (i % 3 === 0) {
      const ang = a0 + span * 0.5;
      const blister = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), charMat);
      blister.scale.set(1, 0.4, 1);
      blister.position.set(Math.sin(ang) * R * 0.93, 0.006, Math.cos(ang) * R * 0.93);
      slice.add(blister);
    }
  }

  /* Where the eaten ones were: sauce printed on the board, and the crumbs
   * they left. This is what tells you the box was full an hour ago. */
  for (let i = 0; i < SLICES; i++) {
    const a0 = i * wedge + 0.03;
    const span = wedge - 0.06;
    const ghost = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.84, R * 0.84, 0.0016, 10, 1, false, a0, span),
      mat({ color: 0xa8763f, roughness: 1 }),
    );
    ghost.position.y = DEEP + 0.0032;
    ghost.visible = GONE.has(i);
    g.add(ghost);
    const crumbs = [];
    for (let k = 0; k < 3; k++) {
      const ang = a0 + span * (0.2 + k * 0.3);
      const t = 0.45 + k * 0.16;
      const crumb = box({
        size: [0.006, 0.004, 0.005],
        pos: [Math.sin(ang) * R * t, DEEP + 0.005, Math.cos(ang) * R * t],
        mat: crustMat,
      });
      crumb.rotation.y = ang;
      crumb.visible = GONE.has(i);
      g.add(crumb);
      crumbs.push(crumb);
    }
    if (wedges[i]) Object.assign(wedges[i], { ghost, crumbs });
  }

  /**
   * Take the next slice that is still there.
   *
   * Goes round the box rather than picking at random, because a pizza empties
   * in a direction -- you take the one next to the gap. Reveals the sauce mark
   * and crumbs it leaves behind, which is the same thing the three missing at
   * the start already show.
   *
   * @returns {boolean} false when there is nothing left
   */
  function takeSlice() {
    for (let n = 0; n < SLICES; n++) {
      const w = wedges[n];
      if (!w || !w.slice.visible) continue;
      w.slice.visible = false;
      if (w.ghost) w.ghost.visible = true;
      for (const c of w.crumbs) c.visible = true;
      return true;
    }
    return false;
  }

  /** How many are left in the box. */
  function slicesLeft() {
    return wedges.reduce((n, w) => n + (w && w.slice.visible ? 1 : 0), 0);
  }

  // Grease. Two dark patches soaked into the cardboard by the near edge.
  for (const [gx, gz, gr] of [[-0.06, 0.12, 0.035], [0.07, 0.10, 0.024]]) {
    const stain = new THREE.Mesh(
      new THREE.CircleGeometry(gr, 12),
      new THREE.MeshStandardMaterial({
        color: 0x8a6a3c, roughness: 1, transparent: true, opacity: 0.45,
      }),
    );
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(gx, DEEP + 0.0026, gz);
    g.add(stain);
  }
  return { group: g, takeSlice, slicesLeft };
}

/**
 * The bong on the coffee table. Straight tube, ice pinch, a slide in the
 * downstem joint, and about two inches of water that has been in there for
 * longer than anyone wants to think about.
 */
export function makeBong(M, { x, y, z, rotY = 0 }) {
  const g = group('bong');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x8fb4a8, roughness: 0.05, metalness: 0,
    transmission: 0.86, thickness: 0.02, transparent: true, opacity: 0.42,
  });
  const dirty = new THREE.MeshPhysicalMaterial({
    color: 0x6f7c3e, roughness: 0.22, transmission: 0.35,
    thickness: 0.03, transparent: true, opacity: 0.82,
  });

  const BASE_R = 0.052, TUBE_R = 0.030, H = 0.325;

  // Beaker base flaring into the tube.
  g.add(cylinder({ rTop: TUBE_R + 0.004, rBottom: BASE_R, h: 0.105, pos: [0, 0.052, 0], mat: glass }));
  g.add(cylinder({ r: BASE_R, h: 0.008, pos: [0, 0.004, 0], mat: glass }));
  // The water. Not clean.
  g.add(cylinder({ rTop: TUBE_R + 0.012, rBottom: BASE_R - 0.004, h: 0.052, pos: [0, 0.030, 0], mat: dirty }));
  // Tube, with an ice pinch two thirds up.
  g.add(cylinder({ r: TUBE_R, h: H - 0.105, pos: [0, 0.105 + (H - 0.105) / 2, 0], mat: glass }));
  for (const a of [0, 2.1, 4.2]) {
    g.add(sphere({
      r: 0.013, pos: [Math.sin(a) * TUBE_R * 0.75, 0.245, Math.cos(a) * TUBE_R * 0.75], mat: glass,
    }));
  }
  // Flared mouthpiece.
  g.add(cylinder({ rTop: TUBE_R + 0.010, rBottom: TUBE_R, h: 0.022, pos: [0, H + 0.011, 0], mat: glass }));

  // Downstem out the side at an angle, with the slide on the end.
  const stem = new THREE.Group();
  stem.position.set(0, 0.088, 0);
  stem.rotation.z = -0.62;
  g.add(stem);
  stem.add(cylinder({ r: 0.011, h: 0.115, pos: [0, 0.052, 0], mat: glass }));
  const bowl = cylinder({ rTop: 0.026, rBottom: 0.012, h: 0.030, pos: [0, 0.122, 0], mat: glass });
  stem.add(bowl);
  // What is in the bowl. Mostly ash by now.
  stem.add(cylinder({ rTop: 0.021, rBottom: 0.011, h: 0.012, pos: [0, 0.126, 0], mat: mat({ color: 0x4a4238, roughness: 1 }) }));

  // Lighter beside it, because there is always a lighter beside it.
  g.add(box({
    size: [0.024, 0.075, 0.014], pos: [0.085, 0.038, 0.045],
    mat: mat({ color: 0xd8452f, roughness: 0.45 }), rotZ: Math.PI / 2, rotY: 0.4,
  }));

  return { group: g, bowl, height: H + 0.03 };
}

/**
 * A little bag of mushrooms, next to the bong, because of course.
 * Deliberately scruffy: a sandwich bag with the top rolled over.
 */
export function makeMushrooms(M, { x, y, z, rotY = 0 }) {
  const g = group('shrooms');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const bag = new THREE.MeshPhysicalMaterial({
    color: 0xdfe4e2, roughness: 0.55, transmission: 0.55,
    thickness: 0.01, transparent: true, opacity: 0.30, side: THREE.DoubleSide,
  });
  const cap = mat({ color: 0x9a7a52, roughness: 0.95 });
  const stalk = mat({ color: 0xd8cbb2, roughness: 1 });

  // Six of them, tumbled together.
  const SEED = [
    [-0.030, 0.018, -0.012, 0.5], [0.008, 0.016, 0.020, -1.2],
    [0.034, 0.019, -0.016, 2.3], [-0.012, 0.040, 0.006, 0.9],
    [0.022, 0.042, 0.010, -0.4], [-0.034, 0.017, 0.024, 1.8],
  ];
  for (const [mx, my, mz, rot] of SEED) {
    const one = new THREE.Group();
    one.position.set(mx, my, mz);
    one.rotation.set(0.9, rot, 0.35);
    one.add(cylinder({ r: 0.0045, h: 0.036, pos: [0, 0, 0], mat: stalk }));
    one.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.013, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap,
    ).translateY(0.018));
    g.add(one);
  }

  // The bag around them, rolled shut at the top.
  g.add(box({ size: [0.105, 0.062, 0.078], pos: [0, 0.031, 0], mat: bag, cast: false }));
  g.add(cylinder({ r: 0.014, h: 0.100, pos: [0, 0.066, 0], rotZ: Math.PI / 2, mat: bag, cast: false }));

  return { group: g };
}

/**
 * Frying pan on the hob. `contents` is what is in it, so the same pan covers
 * empty, two raw eggs and two cooked ones.
 */
export function makePan(M, { x, y, z, rotY = 0 }) {
  const g = group('pan');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const steel = mat({ color: 0x2a2c30, roughness: 0.42, metalness: 0.55 });
  const R = 0.105;
  g.add(cylinder({ r: R, h: 0.012, pos: [0, 0.006, 0], mat: steel }));
  // Sloped wall, so it reads as a pan rather than a disc.
  g.add(cylinder({ rTop: R + 0.012, rBottom: R, h: 0.042, pos: [0, 0.032, 0], mat: steel }));
  // Handle out to one side.
  g.add(box({ size: [0.022, 0.016, 0.17], pos: [0, 0.040, R + 0.085], mat: M.plasticBlack }));

  // What is in it. Whites are a squashed sphere, yolks sit on top.
  const contents = new THREE.Group();
  contents.position.y = 0.016;
  contents.visible = false;
  g.add(contents);
  const white = mat({ color: 0xf6f1e2, roughness: 0.62 });
  const yolk = mat({ color: 0xf0a821, roughness: 0.45 });
  for (const [ex, ez] of [[-0.036, -0.012], [0.034, 0.018]]) {
    const e = new THREE.Group();
    e.position.set(ex, 0, ez);
    const w = sphere({ r: 0.052, ry: 0.006, pos: [0, 0, 0], mat: white });
    e.add(w);
    e.add(sphere({ r: 0.021, ry: 0.010, pos: [0.004, 0.007, 0.002], mat: yolk }));
    contents.add(e);
  }

  /* The eggs cook rather than switching from raw to done. Whites go from
   * translucent and slack to opaque and set; the yolks tighten and dull; the
   * whole thing shrinks a little, because it does. Driven by main.js from how
   * far through the eleven seconds you are. */
  const whites = [];
  const yolks = [];
  contents.traverse((o) => {
    if (o.material === white) whites.push(o);
    if (o.material === yolk) yolks.push(o);
  });
  // Each gets its own material instance or they all cook as one object.
  for (const w of whites) w.material = white.clone();
  for (const y of yolks) y.material = yolk.clone();

  const _raw = new THREE.Color(0xd9d6c4);
  const _set = new THREE.Color(0xf8f4e8);
  const _yRaw = new THREE.Color(0xf6b62c);
  const _yDone = new THREE.Color(0xd88f14);

  /** @param {number} k 0 = just cracked, 1 = arguably over-done. */
  function cook(k) {
    const e = Math.min(1, Math.max(0, k));
    for (const w of whites) {
      w.material.color.copy(_raw).lerp(_set, Math.min(1, e * 1.6));
      w.material.opacity = 0.72 + e * 0.28;
      w.material.transparent = e < 0.94;
      w.material.roughness = 0.40 + e * 0.34;
      w.scale.setScalar(1 - e * 0.07);
    }
    for (const y of yolks) {
      y.material.color.copy(_yRaw).lerp(_yDone, e);
      y.material.roughness = 0.30 + e * 0.36;
      y.scale.set(1 - e * 0.05, 1 + e * 0.16, 1 - e * 0.05);
    }
  }
  cook(0);

  return { group: g, contents, cook, rimY: 0.055 };
}

/**
 * The index card on the corkboard. Small, and deliberately not eye-catching:
 * the whole point is that it has been there long enough to stop being news.
 */
export function makeCorkNote(M, { x, y, z, rotY = 0 }) {
  const g = group('corknote');
  g.position.set(x, y, z);
  g.rotation.set(0, rotY, -0.05);

  /* 120 tall, not 104. The note grew a line and the plane's aspect is matched
   * to the canvas, so the two have to move together or the handwriting
   * stretches. */
  const W = 152, H = 120;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const d = c.getContext('2d');
  d.fillStyle = '#f2ead2';
  d.fillRect(0, 0, W, H);
  d.strokeStyle = '#d9cfb0';
  d.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    d.beginPath(); d.moveTo(8, 22 + i * 17); d.lineTo(W - 8, 22 + i * 17); d.stroke();
  }
  d.fillStyle = '#2f2a20';
  d.font = 'bold 17px "Courier New", monospace';
  d.textAlign = 'center';
  d.fillText('WED  7PM', W / 2, 32);
  d.font = 'bold 13px "Courier New", monospace';
  d.fillText('SQUATCH MEETING', W / 2, 54);
  d.font = '11px "Courier New", monospace';
  d.fillStyle = '#5c5445';
  d.fillText('booski driving', W / 2, 74);
  d.fillText('bring nothing', W / 2, 90);
  /* The one line on the note that is not logistics. He wrote the rest of it
   * off Booski's messages; he wrote this bit himself, later, on his own. */
  d.font = 'italic 11px "Courier New", monospace';
  d.fillText('this is the one', W / 2, 107);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const card = plane(0.115, 0.115 * (H / W), mat({ map: tex, roughness: 0.9 }));
  g.add(card);
  // The pin holding it up.
  g.add(cylinder({
    r: 0.005, h: 0.010, pos: [0, 0.030, 0.006], rotX: Math.PI / 2,
    mat: mat({ color: 0xd8452f, roughness: 0.4 }),
  }));
  return { group: g };
}

/** Sideboard the radio lives on. */
export function makeSideboard(M, { x, z, w = 1.6, d = 0.44 }) {
  const g = group('sideboard');
  const h = 0.70;
  g.add(box({ size: [w, 0.045, d], pos: [x, h, z], mat: M.darkWood }));
  g.add(box({ size: [w - 0.06, h - 0.20, d - 0.04], pos: [x, h / 2 + 0.05, z], mat: M.lightWood }));
  for (let i = 0; i < 2; i++) {
    const dx = x - w / 4 + i * (w / 2);
    g.add(box({ size: [w / 2 - 0.08, h - 0.28, 0.02], pos: [dx, h / 2 + 0.05, z + d / 2 - 0.005], mat: M.darkWood }));
    g.add(cylinder({ r: 0.012, h: 0.10, pos: [dx, h / 2 + 0.05, z + d / 2 + 0.02], rotZ: Math.PI / 2, mat: M.chrome }));
  }
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.06, 0.14, 0.06], pos: [x + sx * (w / 2 - 0.08), 0.07, z], mat: M.darkWood }));
  }
  // Record crate underneath.
  const crate = group('records');
  crate.position.set(x + w / 2 - 0.32, 0, z - 0.02);
  crate.add(box({ size: [0.34, 0.34, 0.34], pos: [0, 0.17, 0], mat: M.cardboard }));
  for (let i = 0; i < 7; i++) {
    crate.add(box({
      size: [0.31, 0.31, 0.006],
      pos: [0, 0.19, -0.12 + i * 0.03],
      mat: mat({ color: new THREE.Color().setHSL((i * 0.13) % 1, 0.4, 0.4), roughness: 0.8 }),
      rotZ: (i - 3) * 0.008,
    }));
  }
  g.add(crate);

  return { group: g, top: h + 0.023, bounds: [[x - w / 2, 0, z - d / 2], [x + w / 2, h, z + d / 2]] };
}

/**
 * Vintage receiver / boombox. Returns handles for the dial, VU needle and
 * power LED so the radio can animate while playing.
 */
export function makeRadio(M, { x, y, z, rotY = 0 }) {
  const g = group('radio');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const bodyMat = mat({ color: 0x2a2724, roughness: 0.6 });
  const faceMat = mat({ color: 0x3a3530, roughness: 0.5 });
  g.add(box({ size: [0.52, 0.24, 0.22], pos: [0, 0.12, 0], mat: bodyMat }));
  g.add(box({ size: [0.50, 0.22, 0.01], pos: [0, 0.12, 0.111], mat: faceMat }));
  // Wood end caps.
  g.add(box({ size: [0.03, 0.24, 0.22], pos: [-0.262, 0.12, 0], mat: M.lightWood }));
  g.add(box({ size: [0.03, 0.24, 0.22], pos: [0.262, 0.12, 0], mat: M.lightWood }));

  // Speaker grilles.
  const grille = mat({ color: 0x17150f, roughness: 0.95 });
  for (const sx of [-0.17, 0.17]) {
    g.add(cylinder({ r: 0.072, h: 0.008, pos: [sx, 0.115, 0.116], rotX: Math.PI / 2, mat: grille }));
    for (let i = 0; i < 3; i++) {
      g.add(cylinder({ r: 0.062 - i * 0.018, h: 0.010, pos: [sx, 0.115, 0.118], rotX: Math.PI / 2, mat: M.plasticBlack, cast: false }));
    }
  }

  // Tuning scale with a needle.
  const dialFace = plane(0.14, 0.055, mat({ color: 0xd8c89a, roughness: 0.6, emissive: 0x000000 }));
  dialFace.position.set(0, 0.175, 0.117);
  g.add(dialFace);
  const needle = box({ size: [0.004, 0.05, 0.004], pos: [0, 0.175, 0.120], mat: M.ledRed });
  g.add(needle);

  // Knobs + a lit power ring.
  g.add(cylinder({ r: 0.022, h: 0.026, pos: [-0.20, 0.062, 0.118], rotX: Math.PI / 2, mat: M.plasticGrey }));
  g.add(cylinder({ r: 0.022, h: 0.026, pos: [0.20, 0.062, 0.118], rotX: Math.PI / 2, mat: M.plasticGrey }));
  const led = cylinder({ r: 0.008, h: 0.008, pos: [0, 0.055, 0.120], rotX: Math.PI / 2, mat: M.bulbOff });
  g.add(led);

  // Telescopic antenna.
  g.add(cylinder({ r: 0.004, h: 0.42, pos: [-0.22, 0.44, -0.06], rotZ: -0.22, mat: M.chrome }));

  return { group: g, needle, led, dialFace };
}

/* ------------------------------------------------------------------ */
/* Lighting fixtures                                                   */
/* ------------------------------------------------------------------ */

export function makeCeilingLight(M, { x, z, y = 2.62 }) {
  const g = group('ceilinglight');
  g.add(cylinder({ r: 0.012, h: 0.14, pos: [x, y + 0.10, z], mat: M.darkSteel }));
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.20, 24, 1, true),
    M.lampShade,
  );
  shade.position.set(x, y, z);
  shade.rotation.x = Math.PI;
  shade.castShadow = false;
  g.add(shade);
  const bulb = sphere({ r: 0.045, pos: [x, y - 0.05, z], mat: M.bulbOff, cast: false });
  g.add(bulb);
  return { group: g, bulb, pos: new THREE.Vector3(x, y - 0.06, z) };
}

export function makeFloorLamp(M, { x, z }) {
  const g = group('floorlamp');
  g.add(cylinder({ r: 0.14, h: 0.03, pos: [x, 0.015, z], mat: M.darkSteel }));
  g.add(cylinder({ r: 0.015, h: 1.42, pos: [x, 0.72, z], mat: M.darkSteel }));
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.19, 0.24, 20, 1, true),
    M.lampShade,
  );
  shade.position.set(x, 1.52, z);
  g.add(shade);
  const bulb = sphere({ r: 0.04, pos: [x, 1.50, z], mat: M.bulbOff, cast: false });
  g.add(bulb);
  return { group: g, bulb, pos: new THREE.Vector3(x, 1.50, z), bounds: [[x - 0.16, 0, z - 0.16], [x + 0.16, 0.1, z + 0.16]] };
}

/* ------------------------------------------------------------------ */
/* Odds and ends                                                       */
/* ------------------------------------------------------------------ */

export function makePlant(M, { x, z, scale = 1 }) {
  const g = group('plant');
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  g.add(cylinder({ rTop: 0.17, rBottom: 0.13, h: 0.26, pos: [0, 0.13, 0], mat: M.terracotta }));
  g.add(cylinder({ r: 0.155, h: 0.02, pos: [0, 0.26, 0], mat: M.soil }));

  /* Stem from the soil to the top of the foliage. It used to stop at 0.75
   * while leaves sat as high as 0.97, so the top ones hung in the air over
   * nothing. */
  const SOIL = 0.27;
  const TOP = 0.94;
  const stemMat = mat({ color: 0x4a3a24, roughness: 1 });
  g.add(cylinder({ r: 0.018, h: TOP - SOIL, pos: [0, (SOIL + TOP) / 2, 0], mat: stemMat }));

  /* Each leaf gets a stalk running from a point on the stem out to the blade.
   * Without one the blades float in a ring 14cm clear of a 2cm stem, which is
   * what "not attached" looks like. The stalk is oriented by rotating +Y onto
   * the stem-to-leaf direction, so it always lands on both ends whatever the
   * angle. */
  const UP = new THREE.Vector3(0, 1, 0);
  const OUTWARD = new THREE.Vector3(1, 0, 0);   // the blade's own long axis
  const _dir = new THREE.Vector3();
  const _out = new THREE.Vector3();
  const _anchor = new THREE.Vector3();
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + i * 0.7;
    // Higher leaves reach further out, the way a potted plant actually opens.
    const baseY = SOIL + 0.12 + (i % 4) * 0.15;
    const reach = 0.13 + (i % 3) * 0.035;
    const rise = 0.07 + (i % 2) * 0.05;
    const lx = Math.sin(a) * reach;
    const lz = Math.cos(a) * reach;
    const ly = Math.min(TOP + 0.06, baseY + rise);

    _dir.set(lx, ly - baseY, lz);
    const len = _dir.length();
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, len, 6), stemMat);
    stalk.position.set(lx / 2, (baseY + ly) / 2, lz / 2);
    stalk.quaternion.setFromUnitVectors(UP, _dir.normalize());
    g.add(stalk);

    /* The blade grows ALONG its stalk and overlaps the end of it.
     *
     * Three goes at this. It sat at 1.45x the stalk's reach, so there was a
     * gap between the end of the stick and the start of the leaf. Then
     * `rotation.y = a` turned the blade ninety degrees across its own stalk,
     * because the blade's long axis is local X. Then `Math.PI / 2 - a` -- the
     * correction for that -- had the sign backwards: three's Y rotation sends
     * +X to (cos, 0, -sin), so that angle lands the blade on (sin a, 0, -cos a)
     * while the stalk goes out along (sin a, 0, +cos a). The two agree only
     * where cos a is near zero, which is why some of them looked right and
     * most of them looked thrown at the pot.
     *
     * So it is not an Euler triple any more. Point +X at the direction the
     * stalk actually went -- the same vector, not a re-derivation of it -- and
     * droop from there. There is no sign left to get wrong. */
    const blade = 0.10;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(blade, 10, 7), M.leaf);
    leaf.scale.set(1, 0.26, 0.58);
    leaf.quaternion.setFromUnitVectors(OUTWARD, _out.set(Math.sin(a), 0, Math.cos(a)));
    leaf.rotateZ(-0.20);           // tip hangs
    leaf.rotateX(0.30 + i * 0.11); // and each one rolls a little differently

    /* Placed by its INNER END, not by its centre.
     *
     * Putting the centre on a radius and then drooping the blade rotates it
     * about that centre, which swings the inner end off the stalk by three or
     * four centimetres -- small on paper, and the exact size of a visible gap
     * between a stick and a leaf. So the anchor is the end that has to touch:
     * take the point 86% of the way in, and land THAT on the tip. The last
     * 14% carries on past it and buries itself in the stalk, so there is no
     * seam to find. */
    _anchor.set(-blade * 0.86, 0, 0).applyQuaternion(leaf.quaternion);
    leaf.position.set(lx, ly, lz).sub(_anchor);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return { group: g, bounds: [[x - 0.18, 0, z - 0.18], [x + 0.18, 0.3, z + 0.18]] };
}

/**
 * Round wall clock. The dial is drawn into a canvas and mapped onto a circle,
 * and each hand hangs off a pivot at the centre so it sweeps properly instead
 * of orbiting its own middle.
 */
export function makeWallClock(M, { x, y, z, rotY = 0, r = 0.15 }) {
  const g = group('wallclock');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  // Case + rim.
  g.add(cylinder({ r, h: 0.045, pos: [0, 0, 0.022], rotX: Math.PI / 2, mat: M.darkWood }));
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(r - 0.006, 0.008, 8, 40),
    mat({ color: 0x1d1712, roughness: 0.5 }),
  );
  rim.position.z = 0.045;
  rim.castShadow = true;
  g.add(rim);

  /* ---- dial ---- */
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const d = c.getContext('2d');
  d.fillStyle = '#f1ead9';
  d.beginPath();
  d.arc(S / 2, S / 2, S / 2, 0, 7);
  d.fill();
  // Minute ticks, with the hour marks heavier.
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const hour = i % 5 === 0;
    const outer = S * 0.44;
    const inner = outer - (hour ? S * 0.055 : S * 0.026);
    d.strokeStyle = hour ? '#20201c' : '#7a766a';
    d.lineWidth = hour ? 9 : 3.5;
    d.beginPath();
    d.moveTo(S / 2 + Math.cos(a) * inner, S / 2 + Math.sin(a) * inner);
    d.lineTo(S / 2 + Math.cos(a) * outer, S / 2 + Math.sin(a) * outer);
    d.stroke();
  }
  d.fillStyle = '#20201c';
  d.font = `bold ${Math.round(S * 0.115)}px "Courier New", monospace`;
  d.textAlign = 'center';
  d.textBaseline = 'middle';
  for (let n = 1; n <= 12; n++) {
    const a = (n / 12) * Math.PI * 2 - Math.PI / 2;
    d.fillText(String(n), S / 2 + Math.cos(a) * S * 0.335, S / 2 + Math.sin(a) * S * 0.335);
  }
  d.fillStyle = '#8a8478';
  d.font = `${Math.round(S * 0.045)}px "Courier New", monospace`;
  d.fillText('SQUATCH', S / 2, S * 0.68);
  const dial = new THREE.CanvasTexture(c);
  dial.colorSpace = THREE.SRGBColorSpace;
  dial.anisotropy = 8;

  const face = new THREE.Mesh(
    new THREE.CircleGeometry(r - 0.014, 48),
    mat({ map: dial, roughness: 0.85 }),
  );
  face.position.z = 0.046;
  face.receiveShadow = true;
  g.add(face);

  /* ---- hands, each on a centre pivot ---- */
  const handMat = mat({ color: 0x1a1a18, roughness: 0.5 });
  const makeHand = (len, width, zOff, matr) => {
    const pivot = new THREE.Group();
    pivot.position.z = zOff;
    // Offset the bar inside the pivot so the pivot itself sits at the centre,
    // with a short counterweight tail past the middle.
    const bar = box({ size: [width, len, 0.004], pos: [0, len / 2 - len * 0.14, 0], mat: matr });
    pivot.add(bar);
    g.add(pivot);
    return pivot;
  };
  const hourHand = makeHand(r * 0.58, 0.011, 0.049, handMat);
  const minHand = makeHand(r * 0.86, 0.008, 0.052, handMat);
  const secHand = makeHand(r * 0.92, 0.004, 0.055, mat({ color: 0xb8402c, roughness: 0.5 }));

  // Centre boss + glass.
  g.add(cylinder({ r: 0.010, h: 0.010, pos: [0, 0, 0.058], rotX: Math.PI / 2, mat: M.chrome }));
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(r - 0.010, 40),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.05, metalness: 0,
      transparent: true, opacity: 0.10,
    }),
  );
  glass.position.z = 0.062;
  g.add(glass);

  return { group: g, hourHand, minHand, secHand };
}

/** Squatch bobblehead — the desk mascot. Head is returned so it can wobble. */
export function makeBobblehead(M, { x, y, z, rotY = 0 }) {
  const g = group('bobblehead');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(cylinder({ rTop: 0.045, rBottom: 0.055, h: 0.018, pos: [0, 0.009, 0], mat: M.black }));
  g.add(box({ size: [0.05, 0.07, 0.035], pos: [0, 0.055, 0], mat: M.fur }));
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.018, 0.06, 0.018], pos: [sx * 0.038, 0.058, 0], mat: M.fur, rotZ: sx * 0.25 }));
    g.add(box({ size: [0.02, 0.05, 0.025], pos: [sx * 0.018, 0.018, 0], mat: M.fur }));
  }
  const head = group('bobbleHead');
  head.position.set(0, 0.098, 0);
  head.add(sphere({ r: 0.042, ry: 0.046, pos: [0, 0, 0], mat: M.fur }));
  head.add(box({ size: [0.062, 0.012, 0.012], pos: [0, 0.014, 0.036], mat: mat({ color: 0x2a1d13, roughness: 1 }) }));
  for (const sx of [-1, 1]) {
    head.add(sphere({ r: 0.006, pos: [sx * 0.015, 0.006, 0.038], mat: mat({ color: 0xf0e8d0, roughness: 0.5 }) }));
  }
  g.add(head);
  return { group: g, head };
}

/** Cheap CRT-era desk speaker / bookshelf unit for the shelf. */
export function makeBooks(M, { x, y, z, count = 9, along = 'x' }) {
  const g = group('books');
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const h = 0.18 + ((i * 37) % 9) / 100;
    const t = 0.022 + ((i * 53) % 5) / 300;
    const col = new THREE.Color().setHSL(((i * 0.17) % 1), 0.35, 0.32 + ((i % 3) * 0.06));
    const lean = i === count - 2 ? 0.22 : 0;
    const b = box({
      size: along === 'x' ? [t, h, 0.15] : [0.15, h, t],
      pos: along === 'x' ? [x + cursor, y + h / 2, z] : [x, y + h / 2, z + cursor],
      mat: mat({ color: col, roughness: 0.9 }),
      rotZ: along === 'x' ? lean : 0,
      rotX: along === 'z' ? lean : 0,
    });
    g.add(b);
    cursor += t + 0.004;
  }
  return { group: g, extent: cursor };
}

/** Wall shelf with brackets. */
export function makeShelf(M, { x, y, z, w = 1.1, d = 0.22, rotY = 0 }) {
  const g = group('shelf');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(box({ size: [w, 0.035, d], pos: [0, 0, 0], mat: M.darkWood }));
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.025, 0.14, 0.16], pos: [sx * (w / 2 - 0.12), -0.085, -d / 2 + 0.08], mat: M.darkSteel }));
  }
  return { group: g };
}

/** Boots by the door. */
export function makeBoots(M, { x, z, rotY = 0 }) {
  const g = group('boots');
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const leather = mat({ color: 0x53381f, roughness: 0.9 });
  for (const sx of [-0.09, 0.09]) {
    g.add(box({ size: [0.11, 0.09, 0.28], pos: [sx, 0.045, 0], mat: leather, rotY: sx > 0 ? 0.12 : -0.1 }));
    g.add(box({ size: [0.11, 0.16, 0.12], pos: [sx, 0.14, -0.07], mat: leather, rotY: sx > 0 ? 0.12 : -0.1 }));
  }
  return { group: g };
}

/** Laundry pile — a few soft lumps. */
export function makeLaundry(M, { x, z }) {
  const g = group('laundry');
  g.position.set(x, 0, z);
  const cols = [0x3b4a58, 0x6a4038, 0x4a4a3c, 0x2f3a3a];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 0.12 + (i % 3) * 0.07;
    const lump = sphere({
      r: 0.13 + (i % 3) * 0.03,
      ry: 0.07 + (i % 2) * 0.02,
      pos: [Math.sin(a) * r, 0.06 + (i % 2) * 0.05, Math.cos(a) * r],
      mat: mat({ color: cols[i % cols.length], roughness: 1 }),
    });
    lump.rotation.set(0.2, a, 0.3);
    g.add(lump);
  }
  return { group: g };
}

/** Corkboard with pinned photos and a map — sets up the squatch-hunter vibe. */
export function makeCorkboard(M, { x, y, z, rotY = 0, w = 0.9, h = 0.66 }) {
  const g = group('corkboard');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  g.add(box({ size: [w, h, 0.02], pos: [0, 0, 0], mat: mat({ color: 0xb2864f, roughness: 1 }) }));
  g.add(box({ size: [w + 0.04, h + 0.04, 0.012], pos: [0, 0, -0.008], mat: M.frame }));

  const notes = [
    [-0.28, 0.16, 0.16, 0.12, 0xe9e0cb, -0.06],
    [-0.02, 0.19, 0.14, 0.18, 0xd8d2bd, 0.05],
    [0.26, 0.12, 0.20, 0.15, 0xe9e0cb, -0.03],
    [-0.24, -0.13, 0.18, 0.14, 0xf0e6a8, 0.08],
    [0.10, -0.16, 0.22, 0.16, 0xe9e0cb, -0.07],
  ];
  for (const [nx, ny, nw, nh, col, rot] of notes) {
    const n = box({ size: [nw, nh, 0.004], pos: [nx, ny, 0.013], mat: mat({ color: col, roughness: 1 }), rotZ: rot });
    g.add(n);
    g.add(cylinder({ r: 0.008, h: 0.012, pos: [nx, ny + nh / 2 - 0.015, 0.021], rotX: Math.PI / 2, mat: M.ledRed }));
  }
  // Red string connecting two of them, obviously.
  const string = box({ size: [0.42, 0.004, 0.004], pos: [-0.02, 0.02, 0.024], mat: mat({ color: 0xc0281e, roughness: 1 }), rotZ: -0.55 });
  g.add(string);
  return { group: g };
}

/**
 * A framed picture. If `texture` is null it renders a procedurally drawn
 * placeholder so the wall is never empty before the player adds their own art.
 */
export function makeFrame(M, { x, y, z, rotY = 0, w = 0.5, h = 0.65, texture = null, tint = 0x1c1712 }) {
  const g = group('frame');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const bezel = 0.035;
  g.add(box({ size: [w + bezel * 2, h + bezel * 2, 0.035], pos: [0, 0, -0.018], mat: mat({ color: tint, roughness: 0.55 }) }));
  // Mount board peeking out around the art.
  g.add(box({ size: [w + 0.012, h + 0.012, 0.004], pos: [0, 0, 0.001], mat: M.paper }));

  const artMat = texture
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.62 })
    : new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8 });
  const art = plane(w, h, artMat);
  art.position.set(0, 0, 0.004);
  g.add(art);

  // Glass sheen.
  const glass = plane(w + 0.01, h + 0.01, new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.06,
  }));
  glass.position.set(0, 0, 0.02);
  g.add(glass);

  return { group: g, art, artMat };
}

/**
 * A photo frame that stands on furniture, with an easel leg behind it.
 * `w`/`h` are the picture size; the frame is built around them.
 */
export function makeStandingFrame(M, { x, y, z, rotY = 0, w = 0.16, h = 0.20, texture = null, tint = 0x2a1d12 }) {
  const g = group('standingFrame');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const bezel = 0.022;
  const panel = group('framePanel');
  /* Leaning BACK: rotX(+t) sends the local +Z face normal to (0,-sin t,cos t),
   * i.e. tips the picture forward onto its face. Negative is the way an easel
   * frame actually stands. */
  panel.rotation.x = -0.13;
  panel.position.y = h / 2 + bezel;

  panel.add(box({ size: [w + bezel * 2, h + bezel * 2, 0.014], pos: [0, 0, -0.007], mat: mat({ color: tint, roughness: 0.5 }) }));
  panel.add(box({ size: [w + 0.008, h + 0.008, 0.003], pos: [0, 0, 0.0005], mat: M.paper }));

  const art = plane(w, h, texture
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55 })
    : new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8 }));
  art.position.set(0, 0, 0.003);
  panel.add(art);

  const glass = plane(w + 0.006, h + 0.006, new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.08,
  }));
  glass.position.set(0, 0, 0.008);
  panel.add(glass);

  /* Easel leg, splayed BACK to meet the surface. rotX(-t) swings the foot
   * toward +Z -- through the glass and out of the front of the picture, which
   * is what it was doing. The foot has to travel the same way the panel leans. */
  /* Sat well behind the panel and pivoting from low down, so that NO part of
   * it -- including the top end, which is what was doing it -- ever reaches
   * forward of the glass. Rotating a strut about its own centre swings one end
   * forward by exactly as much as it swings the other back, which is easy to
   * forget and immediately visible as a bar across somebody's face. */
  const leg = box({
    size: [0.03, h * 0.8, 0.008], pos: [0, -h * 0.18, -0.058],
    mat: mat({ color: tint, roughness: 0.7 }),
  });
  leg.rotation.x = 0.40;
  panel.add(leg);

  g.add(panel);
  /* `leg` is returned so a frame that is not standing up can lose it. One of
   * these lies flat on the floor under the bed, where an easel strut is both
   * wrong and the thing that pokes through the floorboards. */
  return { group: g, art, leg };
}

/**
 * Round wall crest / patch. Alpha-cut so a transparent logo reads as a
 * circular badge rather than a square card, with a thin backing disc.
 */
export function makeRoundCrest(M, { x, y, z, rotY = 0, r = 0.22, texture = null }) {
  const g = group('crest');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  // Backing disc, so the badge has thickness against the wall.
  g.add(cylinder({
    r: r * 0.93, h: 0.018, pos: [0, 0, -0.010], rotX: Math.PI / 2,
    mat: mat({ color: 0x1d1a26, roughness: 0.6 }),
  }));

  const face = plane(r * 2, r * 2, texture
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, transparent: true, alphaTest: 0.35 })
    : new THREE.MeshStandardMaterial({ color: 0x3b3350, roughness: 0.7 }));
  face.position.z = 0.002;
  g.add(face);

  return { group: g, face };
}

/**
 * Flat decal for stickers and fridge magnets. The caller parents it, so it
 * rides along with whatever it is stuck to -- like a swinging fridge door.
 */
export function makeDecal(M, { texture, w = 0.16, h = 0.16, magnet = false, sticker = false }) {
  const g = group('decal');
  /* A sticker is die-cut, so it needs a low alphaTest to keep the soft edge of
   * the outline; a photograph is a rectangle and wants the higher threshold so
   * JPEG mush at the border does not ghost. */
  const face = plane(w, h, texture
    ? new THREE.MeshStandardMaterial({
      map: texture, roughness: sticker ? 0.42 : 0.72,
      transparent: true, alphaTest: sticker ? 0.06 : 0.3,
    })
    : new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 }));
  g.add(face);
  if (magnet) {
    // A little disc at one corner so it reads as held on, not printed on.
    g.add(cylinder({
      r: 0.012, h: 0.006, pos: [w * 0.30, h * 0.32, -0.005], rotX: Math.PI / 2,
      mat: mat({ color: 0x2b2b30, roughness: 0.5 }),
    }));
  }
  return { group: g, face };
}

/**
 * Hanging fabric banner / flag — the other classic way to display gear.
 * Slight wave built into the geometry so it does not read as a flat card.
 */
export function makeBanner(M, { x, y, z, rotY = 0, w = 0.9, h = 1.2, texture = null }) {
  const g = group('banner');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const geo = new THREE.PlaneGeometry(w, h, 14, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    pos.setZ(i, Math.sin((px / w) * Math.PI * 2.2) * 0.016);
  }
  geo.computeVertexNormals();

  const m = texture
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color: 0x2f3a30, roughness: 0.95, side: THREE.DoubleSide });
  const cloth = new THREE.Mesh(geo, m);
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  g.add(cloth);

  // Dowel + cord.
  g.add(cylinder({ r: 0.012, h: w + 0.10, pos: [0, h / 2 + 0.02, 0], rotZ: Math.PI / 2, mat: M.lightWood }));
  return { group: g, cloth, material: m };
}

/** A cap hanging on a wall peg. */
export function makeCapOnPeg(M, { x, y, z, rotY = 0, color = 0x5b3f9e }) {
  const g = group('cap');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const cloth = mat({ color, roughness: 0.92 });
  const dark = mat({ color: 0x2a1d4a, roughness: 0.9 });

  // Peg it hangs off.
  g.add(cylinder({ r: 0.011, h: 0.10, pos: [0, 0, -0.05], rotX: Math.PI / 2, mat: M.lightWood }));
  g.add(sphere({ r: 0.017, pos: [0, 0, 0.005], mat: M.lightWood }));

  // Crown: a squashed dome, wider than it is tall, tipped forward on the peg.
  const cap = new THREE.Group();
  cap.position.set(0, -0.030, 0.020);
  cap.rotation.x = 0.42;
  g.add(cap);

  const R = 0.092;
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(R, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    cloth,
  );
  crown.scale.set(1, 0.74, 1);
  crown.castShadow = true;
  cap.add(crown);

  /*
   * Panel seams, so it is not one smooth blob of colour.
   *
   * These were straight bars standing at a fixed radius, which does not work
   * on a dome: at radius 0.070 the crown is only 0.044 tall and the bar was
   * 0.070, so each one stood two centimetres proud of the fabric. Six of them
   * read as black spokes coming out of a purple disc, which is what got
   * reported -- nobody could tell it was a hat.
   *
   * A seam follows the surface, so it is a sliver of the same sphere at a
   * hair more radius, under the same squash. It cannot stand off something it
   * is a copy of.
   */
  for (let i = 0; i < 6; i++) {
    const seam = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.008, 3, 10, (i / 6) * Math.PI * 2, 0.05, 0, Math.PI / 2),
      dark,
    );
    seam.scale.copy(crown.scale);
    cap.add(seam);
  }
  // Button on the crown.
  cap.add(cylinder({ r: 0.008, h: 0.006, pos: [0, 0.070, 0], mat: dark }));

  /*
   * No sweatband. There was a full torus round the opening, and a complete
   * dark ring under a dome is the silhouette of a bowler hat -- which is what
   * this looked like once the spokes came off. On a real cap the band is on
   * the inside and you never see it from across the room. What tells you it is
   * a cap is the peak, so the peak does the work: wide enough to break the
   * dome's outline, and tipped far enough down to read as a peak rather than a
   * disc seen edge-on.
   */
  const peak = new THREE.Mesh(
    new THREE.CylinderGeometry(0.138, 0.138, 0.009, 24, 1, false, -Math.PI / 2, Math.PI),
    cloth,
  );
  peak.scale.set(1, 1, 0.72);
  peak.position.set(0, -0.010, 0.060);
  peak.rotation.x = -0.46;
  peak.castShadow = true;
  cap.add(peak);
  // Underside of the peak, darker, the way they always are.
  const under = new THREE.Mesh(
    new THREE.CylinderGeometry(0.136, 0.136, 0.003, 24, 1, false, -Math.PI / 2, Math.PI),
    dark,
  );
  under.scale.copy(peak.scale);
  under.position.set(0, -0.016, 0.060);
  under.rotation.x = -0.46;
  cap.add(under);

  return { group: g };
}

/**
 * Soft pack of cigarettes, lid flipped open, with a couple standing proud.
 * Returned `pack` is the whole thing so it can be hidden once picked up.
 */
export function makeCigarettePack(M, { x, y, z, rotY = 0 }) {
  const g = group('cigs');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const packMat = mat({ color: 0xb8352c, roughness: 0.62 });
  const foilMat = mat({ color: 0xc9b06a, roughness: 0.35, metalness: 0.5 });
  const paperMat = mat({ color: 0xf2ece0, roughness: 0.9 });
  const filterMat = mat({ color: 0xc59a58, roughness: 0.95 });

  // Body, with a white band round the base like every soft pack.
  g.add(box({ size: [0.056, 0.084, 0.024], pos: [0, 0.042, 0], mat: packMat }));
  g.add(box({ size: [0.058, 0.016, 0.026], pos: [0, 0.010, 0], mat: paperMat }));
  // Foil liner peeking out of the open top.
  g.add(box({ size: [0.048, 0.014, 0.018], pos: [0, 0.090, 0], mat: foilMat }));
  // Flip-top lid, hinged back.
  g.add(box({ size: [0.056, 0.030, 0.024], pos: [0, 0.098, -0.020], mat: packMat, rotX: -0.85 }));

  // Two cigarettes standing up out of the foil.
  for (const [ox, oz, lean] of [[-0.010, 0.002, 0.06], [0.011, -0.004, -0.09]]) {
    g.add(cylinder({ r: 0.0035, h: 0.030, pos: [ox, 0.106, oz], mat: paperMat, rotZ: lean }));
    g.add(cylinder({ r: 0.0035, h: 0.010, pos: [ox, 0.090, oz], mat: filterMat, rotZ: lean }));
  }

  // Lighter lying beside the pack.
  const lighter = group('lighter');
  lighter.position.set(0.062, 0, 0.014);
  lighter.rotation.y = 0.5;
  lighter.add(box({ size: [0.022, 0.012, 0.058], pos: [0, 0.006, 0], mat: mat({ color: 0xd8a11e, roughness: 0.4 }) }));
  lighter.add(box({ size: [0.016, 0.008, 0.012], pos: [0, 0.015, -0.020], mat: M.chrome }));
  g.add(lighter);

  return { group: g, lighter };
}

/**
 * Square-shouldered Tennessee whiskey bottle. `liquid` is returned so the
 * level can drop as it gets drunk.
 *
 * The label is a parody of the obvious one -- same silhouette and black-label
 * look, different name.
 */
export function makeWhiskeyBottle(M, { x, y, z, rotY = 0, labelImage = null }) {
  const g = group('whiskey');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  // Warm brown glass rather than near-black, so the bottle still reads as
  // whiskey in a dim kitchen instead of a silhouette.
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x6b4218, roughness: 0.08, metalness: 0,
    transmission: 0.7, thickness: 0.04, transparent: true, opacity: 0.55,
  });
  const boozeMat = new THREE.MeshPhysicalMaterial({
    color: 0xc4711d, roughness: 0.1, metalness: 0,
    transmission: 0.45, thickness: 0.06, transparent: true, opacity: 0.95,
  });

  const W = 0.075, D = 0.055, BODY = 0.175;

  // Body, shoulders, neck.
  g.add(box({ size: [W, BODY, D], pos: [0, BODY / 2, 0], mat: glassMat }));
  g.add(box({ size: [W * 0.72, 0.030, D * 0.72], pos: [0, BODY + 0.015, 0], mat: glassMat }));
  g.add(cylinder({ rTop: 0.016, rBottom: 0.024, h: 0.028, pos: [0, BODY + 0.044, 0], mat: glassMat }));
  g.add(cylinder({ r: 0.016, h: 0.048, pos: [0, BODY + 0.082, 0], mat: glassMat }));
  // Black screw cap.
  g.add(cylinder({ r: 0.019, h: 0.030, pos: [0, BODY + 0.120, 0], mat: mat({ color: 0x141414, roughness: 0.45 }) }));

  // The whiskey itself, anchored at the base so scaling drops the level.
  const liquid = box({ size: [W - 0.012, BODY - 0.014, D - 0.012], pos: [0, 0, 0], mat: boozeMat });
  const liquidPivot = new THREE.Group();
  liquidPivot.position.y = 0.007;
  liquid.position.y = (BODY - 0.014) / 2;
  liquidPivot.add(liquid);
  g.add(liquidPivot);

  /* ---- label ----
   * The supplied artwork is a wide crest on black. Rather than squash it into
   * a portrait label, it gets composited onto a taller black field -- which is
   * what the real thing is anyway. Without artwork the label is drawn instead.
   */
  const LW = 256, LH = 320;
  const c = document.createElement('canvas');
  c.width = LW; c.height = LH;
  const d = c.getContext('2d');
  d.fillStyle = '#0d0d0d';
  d.fillRect(0, 0, LW, LH);

  if (labelImage) {
    // Fill the width with the crest; the leftover black above and below is
    // where the small print goes, the way it does on the real thing.
    const iw = labelImage.width, ih = labelImage.height;
    const s = (LW - 22) / iw;
    const dh = ih * s;
    const top = (LH - dh) / 2 + 6;
    d.drawImage(labelImage, 11, top, LW - 22, dh);

    d.textAlign = 'center';
    d.fillStyle = '#d8d1bd';
    d.font = 'bold 15px "Courier New", monospace';
    d.fillText('TENNESSEE', LW / 2, top - 26);
    d.font = '12px "Courier New", monospace';
    d.fillStyle = '#9a927c';
    d.fillText('SOUR MASH', LW / 2, top - 10);
    d.font = '13px "Courier New", monospace';
    d.fillStyle = '#b6ae97';
    d.fillText('40% ALC/VOL  ·  750 ML', LW / 2, top + dh + 24);

    // Hairline keyline, so the label has an edge against the glass.
    d.strokeStyle = 'rgba(210,204,186,.55)';
    d.lineWidth = 3;
    d.strokeRect(7, 7, LW - 14, LH - 14);
    return finishBottle();
  }

  d.strokeStyle = '#e8e2d0';
  d.lineWidth = 4;
  d.strokeRect(12, 12, LW - 24, LH - 24);
  d.strokeStyle = '#c9c2ac';
  d.lineWidth = 1.5;
  d.strokeRect(22, 22, LW - 44, LH - 44);

  d.textAlign = 'center';
  d.fillStyle = '#efe8d4';
  d.font = 'bold 22px "Courier New", monospace';
  d.fillText('OLD  No. 7½', LW / 2, 62);
  d.font = 'bold 34px Georgia, "Times New Roman", serif';
  d.fillText('JACK AND', LW / 2, 122);
  d.font = 'bold 40px Georgia, "Times New Roman", serif';
  d.fillText("DANIEL'S", LW / 2, 168);
  d.font = 'bold 17px "Courier New", monospace';
  d.fillStyle = '#c9b273';
  d.fillText('TENNESSEE', LW / 2, 208);
  d.fillText('WHISKEY', LW / 2, 230);
  d.strokeStyle = '#5c5346';
  d.lineWidth = 2;
  d.beginPath(); d.moveTo(60, 250); d.lineTo(LW - 60, 250); d.stroke();
  d.fillStyle = '#9a917c';
  d.font = '13px "Courier New", monospace';
  d.fillText('SOUR MASH', LW / 2, 274);
  d.fillText('40% ALC/VOL', LW / 2, 294);

  return finishBottle();

  function finishBottle() {
    const labelTex = new THREE.CanvasTexture(c);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    labelTex.anisotropy = 8;
    // A touch of emissive keyed to the label itself keeps the white text
    // legible in low light without making the whole label glow.
    const labelMat = mat({
      map: labelTex, roughness: 0.85,
      emissive: 0xffffff, emissiveMap: labelTex, emissiveIntensity: 0.28,
    });

    const front = plane(W - 0.006, 0.095, labelMat);
    front.position.set(0, BODY * 0.48, D / 2 + 0.001);
    g.add(front);
    const back = plane(W - 0.006, 0.095, labelMat);
    back.position.set(0, BODY * 0.48, -D / 2 - 0.001);
    back.rotation.y = Math.PI;
    g.add(back);

    // Neck band.
    g.add(cylinder({ r: 0.0165, h: 0.020, pos: [0, BODY + 0.092, 0], mat: mat({ color: 0x141414, roughness: 0.5 }) }));

    return { group: g, liquid: liquidPivot, height: BODY + 0.135 };
  }
}

/**
 * Carton of pasture-raised eggs for the fridge. The printed top face carries
 * the supplied artwork; the shell underneath is the moulded pulp tray.
 */
export function makeEggCarton(M, { x, y, z, rotY = 0, texture = null }) {
  const g = group('eggcarton');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const L = 0.310, W = 0.118, H = 0.072;
  const pulp = mat({ color: 0x8d9a6a, roughness: 1 });
  const printed = texture
    ? mat({ map: texture, roughness: 0.92 })
    : mat({ color: 0xd8cda2, roughness: 0.95 });

  // Base tray, with the scalloped underside suggested by two rows of bumps.
  g.add(box({ size: [L, H * 0.42, W], pos: [0, H * 0.21, 0], mat: pulp }));
  for (let i = 0; i < 6; i++) {
    const bx = -L / 2 + 0.030 + i * 0.050;
    for (const bz of [-W / 4, W / 4]) {
      g.add(sphere({ r: 0.019, pos: [bx, H * 0.06, bz], mat: pulp }));
    }
  }
  // Lid, slightly proud of the tray, printed on top.
  g.add(box({ size: [L + 0.004, H * 0.56, W + 0.004], pos: [0, H * 0.70, 0], mat: pulp }));
  const face = plane(L, W, printed);
  face.rotation.x = -Math.PI / 2;
  face.position.set(0, H * 0.985, 0);
  g.add(face);
  // The band printed round the front lip.
  const band = plane(L, H * 0.42, printed);
  band.position.set(0, H * 0.66, W / 2 + 0.004);
  g.add(band);

  return { group: g, height: H };
}

/** Cereal box, for on top of the fridge where cereal goes. */
export function makeCerealBox(M, { x, y, z, rotY = 0, texture = null }) {
  const g = group('cereal');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const W = 0.196, H = 0.300, D = 0.070;
  const card = mat({ color: 0x2f6fa8, roughness: 0.9 });
  g.add(box({ size: [W, H, D], pos: [0, H / 2, 0], mat: card }));
  if (texture) {
    const printed = mat({ map: texture, roughness: 0.88 });
    for (const s of [1, -1]) {
      const face = plane(W, H, printed);
      face.position.set(0, H / 2, s * (D / 2 + 0.001));
      if (s < 0) face.rotation.y = Math.PI;
      g.add(face);
    }
  }
  // Folded top flaps, left open because of course they were.
  g.add(box({ size: [W, 0.012, D * 0.5], pos: [0, H + 0.004, -D * 0.18], mat: card, rotX: 0.5 }));

  return { group: g, height: H };
}

/** A shot glass, for when you have standards. */
export function makeShotGlass(M, { x, y, z }) {
  const g = group('shotglass');
  g.position.set(x, y, z);
  g.add(cylinder({
    rTop: 0.021, rBottom: 0.017, h: 0.052, pos: [0, 0.026, 0],
    mat: new THREE.MeshPhysicalMaterial({
      color: 0xd6e0e4, roughness: 0.05, transmission: 0.9,
      thickness: 0.01, transparent: true, opacity: 0.35,
    }),
  }));
  return { group: g };
}

/**
 * Tin of nicotine pouches, lid slightly ajar. Small, so it comes with a
 * generous invisible hit proxy like the bobblehead does.
 */
export function makeZynCan(M, { x, y, z, rotY = 0, lidTexture = null }) {
  const g = group('zyn');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const R = 0.035;
  const shell = mat({ color: 0xe9edf0, roughness: 0.42 });
  const lidMat = mat({ color: 0x2f6fb5, roughness: 0.38 });

  g.add(cylinder({ r: R, h: 0.020, pos: [0, 0.010, 0], mat: shell }));
  // Lid pushed half off, the way it always ends up.
  const lidGroup = new THREE.Group();
  lidGroup.position.set(0.018, 0.025, -0.006);
  lidGroup.rotation.z = 0.12;
  lidGroup.add(cylinder({ r: R, h: 0.010, pos: [0, 0, 0], mat: lidMat }));
  if (lidTexture) {
    // The label sits on the lid's top face.
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(R * 0.985, 28),
      mat({ map: lidTexture, roughness: 0.4 }),
    );
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.0052;
    lidGroup.add(face);
  }
  g.add(lidGroup);
  const lid = lidGroup;

  // Label ring round the side.
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.0008, R + 0.0008, 0.011, 22, 1, true),
    lidMat,
  );
  band.position.y = 0.010;
  g.add(band);

  // A couple of pouches visible in the open half.
  const pouch = mat({ color: 0xf4f2ea, roughness: 0.9 });
  g.add(box({ size: [0.020, 0.006, 0.011], pos: [-0.012, 0.023, 0.004], mat: pouch, rotY: 0.3 }));
  g.add(box({ size: [0.020, 0.006, 0.011], pos: [-0.010, 0.023, -0.010], mat: pouch, rotY: -0.5 }));

  return { group: g, lid };
}

/** Glass ashtray with a couple of dead soldiers in it. */
export function makeAshtray(M, { x, y, z, rotY = 0 }) {
  const g = group('ashtray');
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xb9c6c9, roughness: 0.12, transmission: 0.7,
    transparent: true, opacity: 0.55, thickness: 0.02,
  });
  g.add(cylinder({ rTop: 0.052, rBottom: 0.040, h: 0.022, pos: [0, 0.011, 0], mat: glass }));
  g.add(cylinder({ r: 0.038, h: 0.004, pos: [0, 0.020, 0], mat: mat({ color: 0x4a463f, roughness: 1 }) }));
  const butt = mat({ color: 0xd9cdb4, roughness: 0.95 });
  for (const [bx, bz, r] of [[-0.012, 0.008, 0.5], [0.014, -0.006, 2.1], [0.004, 0.018, 1.2]]) {
    g.add(cylinder({ r: 0.0035, h: 0.020, pos: [bx, 0.024, bz], rotZ: Math.PI / 2, rotY: r, mat: butt }));
  }
  return { group: g };
}

/**
 * The lit cigarette held in view while smoking: a stub with a glowing ember.
 * Parented to the camera by main.js; the smoke itself comes from SmokeSystem.
 */
/**
 * The can and the bottle, in shot.
 *
 * Drinking used to be a progress bar and a sound: nothing came into view, so
 * the beer you were holding was a HUD entry rather than an object. Both of
 * these ride on the camera and tip toward the mouth as the hold fills, which
 * is the whole animation -- there is no armature, just a lift and a rotation
 * driven by how far through you are.
 *
 * Returned hidden. main.js shows whichever one is in his hand.
 */
export function makeHeldDrinks(M) {
  const g = group('heldDrinks');

  /* ---- beer can ---- */
  const can = group('heldCan');
  const alu = mat({ color: 0xb9bec6, roughness: 0.30, metalness: 0.85 });
  can.add(cylinder({ r: 0.033, h: 0.118, pos: [0, 0, 0], mat: alu }));
  can.add(cylinder({ rTop: 0.028, rBottom: 0.033, h: 0.012, pos: [0, 0.063, 0], mat: alu }));
  can.add(cylinder({ rTop: 0.033, rBottom: 0.028, h: 0.012, pos: [0, -0.063, 0], mat: alu }));
  // The label band, so it is not a bare cylinder.
  can.add(cylinder({
    r: 0.0335, h: 0.070, pos: [0, -0.004, 0],
    mat: mat({ color: 0x6d3a1c, roughness: 0.62 }),
  }));
  can.visible = false;
  g.add(can);

  /* ---- whiskey bottle ---- */
  const bottle = group('heldBottle');
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x3c2412, roughness: 0.14, transmission: 0.45,
    transparent: true, opacity: 0.92, thickness: 0.02,
  });
  bottle.add(cylinder({ r: 0.042, h: 0.150, pos: [0, -0.010, 0], mat: glass }));
  bottle.add(cylinder({ rTop: 0.017, rBottom: 0.042, h: 0.052, pos: [0, 0.091, 0], mat: glass }));
  bottle.add(cylinder({ r: 0.017, h: 0.040, pos: [0, 0.135, 0], mat: glass }));
  bottle.add(cylinder({
    r: 0.019, h: 0.018, pos: [0, 0.162, 0],
    mat: mat({ color: 0x17130f, roughness: 0.5 }),
  }));
  bottle.add(cylinder({
    r: 0.0425, h: 0.080, pos: [0, -0.012, 0],
    mat: mat({ color: 0x100d0a, roughness: 0.75 }),
  }));
  bottle.visible = false;
  g.add(bottle);

  return { group: g, can, bottle };
}

export function makeHeldCigarette() {
  const g = group('heldCig');
  const paperMat = mat({ color: 0xf2ece0, roughness: 0.9 });
  /* Laid along Z, not X: it is in his mouth, so the filter is the end nearest
   * the camera (+Z) and the ember is out at the far end (-Z), burning away
   * from the face. Held across the view it read as being brandished. */
  g.add(cylinder({ r: 0.0038, h: 0.052, pos: [0, 0, 0], rotX: Math.PI / 2, mat: paperMat }));
  g.add(cylinder({
    r: 0.0038, h: 0.016, pos: [0, 0, 0.030], rotX: Math.PI / 2,
    mat: mat({ color: 0xc59a58, roughness: 0.95 }),
  }));
  const ember = cylinder({
    r: 0.0042, h: 0.006, pos: [0, 0, -0.028], rotX: Math.PI / 2,
    mat: new THREE.MeshStandardMaterial({
      color: 0x1a0a04, emissive: 0xff5a1e, emissiveIntensity: 2.2, roughness: 1,
    }),
  });
  g.add(ember);
  // Small warm light so the ember actually reads in a dark room.
  const glow = new THREE.PointLight(0xff6a24, 0.35, 0.5, 2);
  glow.position.set(0, 0, -0.030);
  g.add(glow);
  return { group: g, ember, glow };
}

/* ------------------------------------------------------------------ */
/* Bathroom                                                            */
/* ------------------------------------------------------------------ */

/**
 * Close-coupled toilet. Returns the lid and seat pivots so they can be put
 * up, plus the bowl opening as a box for aim-testing.
 */
export function makeToilet(M, { x, z, rotY = 0 }) {
  const g = group('toilet');
  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  const porcelain = mat({ color: 0xeceee9, roughness: 0.22 });
  const SEAT_Y = 0.40;

  // Pedestal, flaring out to the floor.
  g.add(cylinder({ rTop: 0.14, rBottom: 0.19, h: 0.30, pos: [0, 0.15, 0.02], mat: porcelain }));
  /* The back rises to a shelf for the cistern to stand on. It used to stop at
   * 0.30 and only reach back to -0.25, while the cistern starts at 0.39 and
   * runs to -0.385 -- so the cistern hung nine centimetres clear of the toilet
   * with tiled wall visible underneath it. This is a close-coupled suite; the
   * tank sits on the pan, and now it does. */
  g.add(box({ size: [0.34, 0.40, 0.32], pos: [0, 0.20, -0.21], mat: porcelain }));

  // Bowl: an outer shell with a darker recess for the water.
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.20, 0.155, 0.16, 26),
    porcelain,
  );
  bowl.position.set(0, SEAT_Y - 0.08, 0.02);
  bowl.scale.z = 1.22;
  bowl.castShadow = true;
  bowl.receiveShadow = true;
  g.add(bowl);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.155, 24),
    new THREE.MeshPhysicalMaterial({
      color: 0x9fc4cf, roughness: 0.06, metalness: 0,
      transmission: 0.6, transparent: true, opacity: 0.75, thickness: 0.05,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, SEAT_Y - 0.13, 0.02);
  water.scale.z = 1.22;
  g.add(water);

  // Seat + lid, each on a hinge at the back.
  const seatPivot = new THREE.Group();
  seatPivot.position.set(0, SEAT_Y, -0.175);
  const seat = new THREE.Mesh(
    new THREE.TorusGeometry(0.175, 0.026, 10, 28),
    mat({ color: 0xf2f3f0, roughness: 0.3 }),
  );
  seat.rotation.x = -Math.PI / 2;
  seat.position.set(0, 0.012, 0.196);
  seat.scale.y = 1.2;
  seat.castShadow = true;
  seatPivot.add(seat);
  g.add(seatPivot);

  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, SEAT_Y + 0.034, -0.175);
  /* Shorter than the bowl it covers and hinged further forward, because the
   * old one swept back through the cistern and the pedestal on its way up.
   * The lid has to clear everything behind it through the WHOLE arc, not just
   * at rest. */
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.182, 0.182, 0.022, 26),
    mat({ color: 0xf2f3f0, roughness: 0.3 }),
  );
  lid.position.set(0, 0, 0.196);
  lid.scale.z = 1.10;
  lid.castShadow = true;
  lidPivot.add(lid);
  g.add(lidPivot);

  // Cistern + flush lever.
  g.add(box({ size: [0.40, 0.42, 0.17], pos: [0, 0.60, -0.30], mat: porcelain }));
  g.add(box({ size: [0.42, 0.03, 0.19], pos: [0, 0.82, -0.30], mat: porcelain }));
  const lever = box({ size: [0.05, 0.016, 0.016], pos: [0.15, 0.74, -0.22], mat: M.chrome });
  g.add(lever);

  // Loo roll on a holder to one side.
  g.add(cylinder({ r: 0.008, h: 0.14, pos: [-0.34, 0.62, -0.10], rotZ: Math.PI / 2, mat: M.chrome }));
  g.add(cylinder({ r: 0.055, h: 0.10, pos: [-0.34, 0.62, -0.10], rotZ: Math.PI / 2, mat: M.paper }));

  return {
    group: g,
    lidPivot,
    seatPivot,
    /** World-space centre of the bowl opening. */
    bowl: new THREE.Vector3(x, SEAT_Y, z + 0.02),
    bowlRadius: 0.19,
    bounds: [[x - 0.24, 0, z - 0.42], [x + 0.24, 0.84, z + 0.30]],
  };
}

/** Pedestal basin: recessed bowl, mixer tap, mirrored cabinet, towel rail. */
export function makeBathSink(M, { x, z, rotY = 0 }) {
  const g = group('bathsink');
  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  const porcelain = mat({ color: 0xeceee9, roughness: 0.20 });
  const TOP = 0.84;

  // Pedestal, waisted rather than a plain tube.
  g.add(cylinder({ rTop: 0.11, rBottom: 0.155, h: 0.14, pos: [0, 0.07, 0], mat: porcelain }));
  g.add(cylinder({ rTop: 0.105, rBottom: 0.11, h: 0.42, pos: [0, 0.35, 0], mat: porcelain }));
  g.add(cylinder({ rTop: 0.16, rBottom: 0.105, h: 0.14, pos: [0, 0.63, 0], mat: porcelain }));

  // Counter slab with a rolled front edge.
  g.add(box({ size: [0.54, 0.09, 0.40], pos: [0, TOP - 0.045, 0], mat: porcelain }));
  g.add(cylinder({ r: 0.045, h: 0.54, pos: [0, TOP - 0.045, 0.20], rotZ: Math.PI / 2, mat: porcelain }));

  // Recessed bowl: a rim ring plus a cone dropping into a plughole, so it
  // reads as a basin you could fill rather than a disc painted on the top.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.145, 0.022, 10, 30),
    porcelain,
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(0, TOP, 0.01);
  rim.scale.z = 0.86;
  rim.castShadow = true;
  g.add(rim);

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.145, 0.055, 0.13, 28, 1, true),
    mat({ color: 0xe4e7e3, roughness: 0.16, side: THREE.DoubleSide }),
  );
  bowl.position.set(0, TOP - 0.062, 0.01);
  bowl.scale.z = 0.86;
  g.add(bowl);
  g.add(cylinder({ r: 0.055, h: 0.008, pos: [0, TOP - 0.126, 0.01], mat: porcelain }));
  g.add(cylinder({ r: 0.020, h: 0.006, pos: [0, TOP - 0.120, 0.01], mat: M.chrome }));

  // Mixer tap: riser, curved spout, two handles.
  g.add(cylinder({ r: 0.026, h: 0.02, pos: [0, TOP + 0.005, -0.145], mat: M.chrome }));
  g.add(cylinder({ r: 0.019, h: 0.13, pos: [0, TOP + 0.07, -0.145], mat: M.chrome }));
  const spout = new THREE.Mesh(
    new THREE.TorusGeometry(0.055, 0.017, 8, 20, Math.PI / 2),
    M.chrome,
  );
  spout.position.set(0, TOP + 0.135, -0.145);
  spout.rotation.set(Math.PI / 2, 0, Math.PI);
  spout.castShadow = true;
  g.add(spout);
  g.add(cylinder({ r: 0.017, h: 0.03, pos: [0, TOP + 0.122, -0.090], mat: M.chrome }));
  for (const sx of [-1, 1]) {
    g.add(cylinder({ r: 0.016, h: 0.016, pos: [sx * 0.085, TOP + 0.012, -0.135], mat: M.chrome }));
    g.add(box({ size: [0.012, 0.05, 0.030], pos: [sx * 0.085, TOP + 0.04, -0.135], mat: M.chrome, rotX: -0.3 }));
  }

  // Mirrored cabinet: carcass, frame, then the glass proud of it.
  g.add(box({ size: [0.60, 0.72, 0.13], pos: [0, 1.46, -0.255], mat: mat({ color: 0xdad6cc, roughness: 0.6 }) }));
  g.add(box({ size: [0.62, 0.74, 0.02], pos: [0, 1.46, -0.196], mat: M.trim }));
  const mirror = box({
    size: [0.54, 0.66, 0.012], pos: [0, 1.46, -0.186],
    mat: new THREE.MeshStandardMaterial({ color: 0xc8d2da, roughness: 0.03, metalness: 1.0 }),
  });
  g.add(mirror);
  // Strip light over the cabinet.
  g.add(box({ size: [0.44, 0.05, 0.07], pos: [0, 1.88, -0.24], mat: mat({ color: 0xf0efe6, roughness: 0.7 }) }));

  // Towel on a rail to one side.
  g.add(cylinder({ r: 0.010, h: 0.34, pos: [0.40, 1.02, -0.20], rotZ: Math.PI / 2, mat: M.chrome }));
  const towel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.34, 8, 1),
    mat({ color: 0x8fb0bd, roughness: 0.95, side: THREE.DoubleSide }),
  );
  const tp = towel.geometry.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setZ(i, Math.sin(tp.getX(i) * 22) * 0.012);
  towel.geometry.computeVertexNormals();
  towel.position.set(0.40, 0.85, -0.19);
  towel.castShadow = true;
  g.add(towel);

  // Cup of toothbrushes and a bar of soap.
  g.add(cylinder({ rTop: 0.032, rBottom: 0.026, h: 0.085, pos: [-0.20, TOP + 0.04, 0.05], mat: mat({ color: 0x3aa0c8, roughness: 0.35 }) }));
  for (const [bx, lean] of [[-0.206, 0.12], [-0.194, -0.10]]) {
    g.add(cylinder({ r: 0.005, h: 0.13, pos: [bx, TOP + 0.115, 0.05], mat: M.paper, rotZ: lean }));
  }
  g.add(box({ size: [0.075, 0.026, 0.05], pos: [0.20, TOP + 0.013, 0.06], mat: mat({ color: 0xe4d7b0, roughness: 0.6 }) }));

  return {
    group: g,
    mirror,
    bounds: [[x - 0.30, 0, z - 0.24], [x + 0.30, TOP, z + 0.24]],
  };
}

/** Bath with a shower head and a half-drawn curtain. */
export function makeTub(M, { x0, z0, x1, z1 }) {
  const g = group('tub');
  const porcelain = mat({ color: 0xeceee9, roughness: 0.24 });
  const H = 0.56;

  // Shell: four walls and a floor, so it reads as a tub you could stand in.
  g.add(boxFrom(x0, 0, z0, x1, 0.10, z1, porcelain));
  g.add(boxFrom(x0, 0, z0, x0 + 0.07, H, z1, porcelain));
  g.add(boxFrom(x1 - 0.07, 0, z0, x1, H, z1, porcelain));
  g.add(boxFrom(x0, 0, z0, x1, H, z0 + 0.07, porcelain));
  g.add(boxFrom(x0, 0, z1 - 0.07, x1, H, z1, porcelain));

  const cx = (x0 + x1) / 2;
  /* Shower riser and head, against the short end wall.
   *
   * Head height is measured from the floor, not from the rim: at rim+1.10 it
   * came out level with your chest. A real riser puts the head somewhere over
   * two metres, which is also what keeps it clear of the curtain rail.
   *
   * The cone is wide at the BOTTOM -- that face is where the water leaves.
   * Built the other way up it reads as a funnel bolted on backwards. And the
   * tilt is negative so it sprays into the tub rather than at the wall it is
   * mounted on. */
  const RISER_TOP = 2.06;
  g.add(cylinder({
    r: 0.014, h: RISER_TOP - 0.62, pos: [cx, (RISER_TOP + 0.62) / 2, z0 + 0.09], mat: M.chrome,
  }));
  g.add(cylinder({ r: 0.016, h: 0.10, pos: [cx, 0.62, z0 + 0.09], mat: M.chrome }));
  // Elbow out from the riser to where the head hangs.
  g.add(cylinder({
    r: 0.013, h: 0.17, pos: [cx, RISER_TOP - 0.02, z0 + 0.17], mat: M.chrome, rotX: Math.PI / 2,
  }));
  const headY = RISER_TOP - 0.06;
  const headZ = z0 + 0.26;
  const head = cylinder({ rTop: 0.035, rBottom: 0.078, h: 0.06, pos: [cx, headY, headZ], mat: M.chrome });
  head.rotation.x = -0.45;
  g.add(head);

  // Where the water comes out, so the shower can be pointed at.
  const headPos = new THREE.Vector3(cx, headY - 0.04, headZ + 0.02);

  /* Curtain rail down the OPEN long side of the tub, not down its middle.
   * The tub is against the x0 wall and runs along Z, so the side you step over
   * is x1 -- a rail at cx hangs the curtain through the middle of the bath. */
  const railX = x1 - 0.03;
  g.add(cylinder({ r: 0.012, h: z1 - z0, pos: [railX, 2.05, (z0 + z1) / 2], rotX: Math.PI / 2, mat: M.chrome }));
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry((z1 - z0) * 0.42, 1.45, 10, 1),
    mat({ color: 0xd8e2e6, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.82 }),
  );
  const pos = curtain.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.05);
  }
  curtain.geometry.computeVertexNormals();
  curtain.rotation.y = Math.PI / 2;
  curtain.position.set(railX, 1.32, z1 - (z1 - z0) * 0.22);
  g.add(curtain);

  return {
    group: g,
    headPos,
    /** Where you stand under it. */
    standPos: new THREE.Vector3(cx, 0, z0 + 0.55),
    rimY: H,
    bounds: [[x0, 0, z0], [x1, H, z1]],
  };
}

/**
 * A bottle of PVA and a box of tissues.
 *
 * They live together on the desk because that is where the crooked frame is,
 * and because a box of tissues next to a man working a bottle with both hands
 * is the entire joke. Returned separately so each gets its own hit proxy.
 */
export function makeGlueAndTissues(M, { x, y, z }) {
  const g = group('gluekit');

  /* ---- glue: white body, orange cap, half used ---- */
  const glue = group('glue');
  glue.position.set(x, y, z);
  const body = mat({ color: 0xf4f2ec, roughness: 0.35 });
  glue.add(cylinder({ rTop: 0.026, rBottom: 0.030, h: 0.105, pos: [0, 0.052, 0], mat: body }));
  glue.add(cylinder({ rTop: 0.014, rBottom: 0.026, h: 0.030, pos: [0, 0.119, 0], mat: body }));
  glue.add(cylinder({
    rTop: 0.006, rBottom: 0.015, h: 0.034, pos: [0, 0.150, 0],
    mat: mat({ color: 0xe2691f, roughness: 0.4 }),
  }));
  // The label, and the crust round the nozzle nobody has ever cleaned.
  glue.add(cylinder({
    rTop: 0.0305, rBottom: 0.0305, h: 0.046, pos: [0, 0.050, 0],
    mat: mat({ color: 0xdfe6ef, roughness: 0.7 }),
  }));
  glue.add(cylinder({
    rTop: 0.010, rBottom: 0.013, h: 0.008, pos: [0, 0.134, 0],
    mat: mat({ color: 0xeceae0, roughness: 0.95 }),
  }));
  g.add(glue);

  /* ---- tissues ---- */
  const tissues = group('tissues');
  tissues.position.set(x + 0.16, y, z + 0.03);
  tissues.add(box({
    size: [0.115, 0.075, 0.115], pos: [0, 0.038, 0],
    mat: mat({ color: 0x4a6f9c, roughness: 0.8 }),
  }));
  // One pulled halfway out and left there.
  const sheet = box({
    size: [0.052, 0.055, 0.010], pos: [0, 0.096, 0.006],
    mat: mat({ color: 0xf6f6f2, roughness: 1 }),
  });
  sheet.rotation.set(0.22, 0.4, 0.16);
  tissues.add(sheet);
  g.add(tissues);

  return { group: g, glue, tissues, gluePos: new THREE.Vector3(x, y + 0.10, z) };
}

/** Free-standing "SQUATCH CROSSING" sign leaning in a corner. */
export function makeCrossingSign(M, { x, z, rotY = 0 }) {
  const g = group('sign');
  g.position.set(x, 0, z);
  g.rotation.set(0, rotY, 0.09);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d');
  c.fillStyle = '#e8c11c';
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = '#1a1a1a';
  c.lineWidth = 10;
  c.strokeRect(14, 14, 228, 228);
  drawSquatchSilhouette(c, 128, 176, 128, '#151515');
  c.fillStyle = '#151515';
  c.font = 'bold 26px "Courier New", monospace';
  c.textAlign = 'center';
  c.fillText('CROSSING', 128, 222);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  g.add(cylinder({ r: 0.018, h: 1.1, pos: [0, 0.55, 0], mat: M.darkSteel }));
  const board = box({ size: [0.44, 0.44, 0.014], pos: [0, 1.16, 0.01], mat: mat({ map: tex, roughness: 0.6 }) });
  g.add(board);
  return { group: g, bounds: [[x - 0.24, 0, z - 0.12], [x + 0.24, 1.4, z + 0.12]] };
}

/**
 * A closet: a shallow alcove with a rail across it and things on the rail.
 *
 * The point of it is what is behind the clothes, so the clothes have to be
 * genuinely in the way -- a rail you can see past is a rail with nothing to
 * find. They cover the back wall until you shove them, and then they bunch up
 * at one end the way clothes on a rail actually do rather than sliding as one
 * rigid object.
 *
 * Coordinates are the alcove's interior, in world space. `garments` is a list
 * of { texture, colour, w } — a texture makes it a shirt with a print on it,
 * a colour makes it something plain hanging next to it.
 */
export function makeCloset(M, { x0, x1, z0, z1, h = 2.05, garments = [], back = null }) {
  const g = group('closet');
  const shell = mat({ color: 0xcfc7ba, roughness: 0.95 });
  const W = x1 - x0, D = z1 - z0;
  const cx = (x0 + x1) / 2;

  // Its own box, since this is carved out beyond the room's shell.
  g.add(boxFrom(x0, -0.1, z0, x1, 0, z1, M.floor, { cast: false }));
  g.add(boxFrom(x0, h, z0, x1, h + 0.1, z1, shell, { cast: false }));
  g.add(boxFrom(x0 - 0.14, 0, z1, x1 + 0.14, h, z1 + 0.14, shell, { cast: false }));   // back
  g.add(boxFrom(x0 - 0.14, 0, z0, x0, h, z1, shell, { cast: false }));                 // sides
  g.add(boxFrom(x1, 0, z0, x1 + 0.14, h, z1, shell, { cast: false }));
  // Skirting, so it belongs to the same flat.
  g.add(boxFrom(x0, 0, z1 - 0.02, x1, 0.09, z1, M.trim, { cast: false }));

  /* What is on the back wall. Hung high enough that the clothes cover it and
   * low enough that it is at eye height once they are out of the way. */
  let picture = null;
  if (back) {
    picture = plane(back.w, back.h, back.texture
      ? new THREE.MeshStandardMaterial({ map: back.texture, roughness: 0.62 })
      : new THREE.MeshStandardMaterial({ color: 0x4a4030, roughness: 0.8 }));
    picture.position.set(cx, back.y ?? 1.30, z1 - 0.012);
    picture.rotation.y = Math.PI;
    g.add(picture);
    // A frame with some depth, so it is an object and not a decal.
    const f = 0.024;
    for (const [px, py, sw, sh] of [
      [0, back.h / 2 + f / 2, back.w + f * 2, f],
      [0, -back.h / 2 - f / 2, back.w + f * 2, f],
      [-back.w / 2 - f / 2, 0, f, back.h],
      [back.w / 2 + f / 2, 0, f, back.h],
    ]) {
      g.add(box({
        size: [sw, sh, 0.022], pos: [cx + px, (back.y ?? 1.30) + py, z1 - 0.022], mat: M.darkWood,
      }));
    }
  }

  // Rail, and a shelf over it.
  const RAIL_Y = 1.74;
  g.add(cylinder({ r: 0.016, h: W, pos: [cx, RAIL_Y, z0 + D * 0.5], rotZ: Math.PI / 2, mat: M.chrome }));
  g.add(box({ size: [W, 0.030, D * 0.86], pos: [cx, RAIL_Y + 0.20, z0 + D * 0.5], mat: M.darkWood }));

  /* The clothes. One group so they can be shoved as a unit, but each garment
   * keeps its own offset inside it, which is what lets them bunch. */
  const clothes = new THREE.Group();
  g.add(clothes);
  const hangers = [];
  const span = W - 0.26;
  const step = garments.length > 1 ? span / (garments.length - 1) : 0;
  const startX = cx - span / 2;

  for (let i = 0; i < garments.length; i++) {
    const item = garments[i];
    const gx = startX + i * step;
    const hung = new THREE.Group();
    hung.position.set(gx, 0, z0 + D * 0.5);
    clothes.add(hung);
    hangers.push({ mesh: hung, home: gx, bunch: startX + span - i * 0.055 });

    // Hanger: hook and two shoulders.
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0045, 6, 12, Math.PI * 1.5), M.chrome);
    hook.position.set(0, RAIL_Y + 0.026, 0);
    hook.rotation.y = Math.PI / 2;
    hung.add(hook);
    const wire = mat({ color: 0xbfc4c9, roughness: 0.4, metalness: 0.6 });
    const gw = item.w ?? 0.42;
    for (const s of [-1, 1]) {
      const arm = box({ size: [gw * 0.52, 0.006, 0.006], pos: [s * gw * 0.26, RAIL_Y - 0.075, 0], mat: wire });
      arm.rotation.z = s * 0.30;
      hung.add(arm);
    }
    hung.add(box({ size: [gw * 0.98, 0.006, 0.006], pos: [0, RAIL_Y - 0.135, 0], mat: wire }));

    /* The garment. A shirt with a print gets a plane on the front so the print
     * reads, over a body with real thickness -- a bare plane on a rail looks
     * like a photograph of a shirt, which is exactly what it would be. */
    const gh = item.h ?? 0.62;
    if (item.cut) {
      /* A garment with real artwork is hung as its own shape, cut out of the
       * product shot -- sleeves, collar, hem and all. Boxing it and printing
       * the photo on the front instead gives you a rectangle of studio white
       * with a shirt on it, which reads as a photograph of a shirt hanging on
       * a rail. See dieCut() in textures.js.
       *
       * Double-sided and given a hair of thickness by a second copy behind it,
       * so it is not a zero-width sheet when you look along the rail. */
      const shirt = plane(gw * 1.55, gh * 1.55, new THREE.MeshStandardMaterial({
        map: item.cut, roughness: 0.92, transparent: true, alphaTest: 0.42,
        side: THREE.DoubleSide,
      }));
      shirt.position.set(0, RAIL_Y - 0.10 - gh * 0.72, 0);
      shirt.rotation.y = Math.PI;
      shirt.castShadow = true;
      hung.add(shirt);
      const back = shirt.clone();
      back.position.z = 0.026;
      hung.add(back);
    } else {
      const body = box({
        size: [gw, gh, 0.055], pos: [0, RAIL_Y - 0.135 - gh / 2, 0],
        mat: mat({ color: item.colour ?? 0x2b2f36, roughness: 0.95 }),
      });
      body.castShadow = true;
      hung.add(body);
      // Sleeves, so the silhouette is not a rectangle.
      for (const s of [-1, 1]) {
        const sleeve = box({
          size: [gw * 0.30, gh * 0.34, 0.05],
          pos: [s * (gw * 0.54), RAIL_Y - 0.135 - gh * 0.24, 0],
          mat: mat({ color: item.colour ?? 0x2b2f36, roughness: 0.95 }),
        });
        sleeve.rotation.z = s * 0.16;
        hung.add(sleeve);
      }
    }
  }

  return {
    group: g,
    clothes,
    hangers,
    picture,
    railY: RAIL_Y,
    /** Where the player has to be looking to shove them. */
    centre: new THREE.Vector3(cx, 1.35, z0 + D * 0.5),
    bounds: [[x0, 0, z0], [x1, h, z1]],
  };
}

/**
 * A candle, lit.
 *
 * The flame is two crossed quads rather than a sphere: from any angle you see
 * at least one of them close to face-on, and a flame has no thickness anyway.
 * Additive and unlit, so it glows instead of being shaded like an object.
 *
 * Returns `flicker(t)` for the caller to drive. It is not on a timer of its
 * own because there is more than one of these in a row and they must not
 * breathe in unison -- which is exactly what independent timers started on the
 * same frame would do.
 */
export function makeCandle(M, { x, y, z, h = 0.10, r = 0.021, colour = 0xf0e6d2, phase = 0 }) {
  const g = group('candle');
  g.position.set(x, y, z);

  const wax = mat({ color: colour, roughness: 0.62 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, h, 14), wax);
  body.position.y = h / 2;
  body.castShadow = true;
  g.add(body);
  // The pool of melted wax at the top, and one run down the side.
  g.add(new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.004, 14),
    mat({ color: 0xfbf4e6, roughness: 0.35 }),
  ).translateY(h + 0.001));
  const run = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.16, h * 0.34, 3, 6), wax);
  run.position.set(r * 0.92, h * 0.72, 0);
  g.add(run);

  const wick = box({ size: [0.0018, 0.011, 0.0018], pos: [0, h + 0.006, 0], mat: mat({ color: 0x1c1a17 }) });
  g.add(wick);

  const flame = new THREE.Group();
  flame.position.y = h + 0.019;
  g.add(flame);
  /* Two additive quads crossed at right angles, so a flame seen from any
   * angle has depth. Additive is also why these bloom: two of them overlapping
   * sum well past 1.0 at the centre, and the bloom threshold is 0.82. Kept
   * additive, because a flame that is not additive looks like a sticker, but
   * dimmer and less opaque so the sum lands under the threshold instead of
   * pouring light out of a cupboard. */
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xe8a94e, transparent: true, opacity: 0.62,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 2; i++) {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.030), flameMat);
    quad.rotation.y = i * Math.PI / 2;
    flame.add(quad);
  }
  // The blue at the base, which is the bit that says "burning" rather than "orange".
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.0055, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0x6f9edd, transparent: true, opacity: 0.30, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  core.position.y = -0.010;
  flame.add(core);

  /* Three of these stand in a 60cm closet that already has a bulb in the
   * ceiling, and at candle-scale intensity they simply washed it out -- the
   * whole point is that they are the only warm thing in a cupboard, which does
   * not survive them lighting it like a room. Dim, and tight: the fall-off
   * matters more than the brightness, so the pool stays on the shrine. */
  const light = new THREE.PointLight(0xffb367, 0.11, 0.38, 2.4);
  light.position.y = h + 0.03;
  g.add(light);

  return {
    group: g,
    flame,
    light,
    /**
     * @param {number} t seconds; the same clock for every candle, with each
     *   one's own `phase` keeping them out of step.
     */
    flicker(t) {
      const s = t * 7.3 + phase;
      const wobble = Math.sin(s) * 0.5 + Math.sin(s * 2.7 + 1.1) * 0.32 + Math.sin(s * 6.1) * 0.18;
      flame.scale.set(1 + wobble * 0.10, 1 + wobble * 0.22, 1 + wobble * 0.10);
      flame.position.x = wobble * 0.0016;
      light.intensity = 0.11 + wobble * 0.04;
    },
  };
}

/**
 * The revolver on the coffee table.
 *
 * Snub-nosed, six rounds, and nothing in the flat to reload it with once they
 * are gone. Built pointing along -Z so that dropping it into the camera's hand
 * needs no correction, and so the muzzle position it hands back is simply the
 * far end of the barrel.
 */
export function makeRevolver(M, { x, y, z, rotY = 0 }) {
  const g = group('revolver');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const steel = mat({ color: 0x3a3f45, roughness: 0.34, metalness: 0.82 });
  const dark = mat({ color: 0x22262b, roughness: 0.5, metalness: 0.6 });
  const wood = mat({ color: 0x5a3520, roughness: 0.62 });

  const BARREL = 0.115;
  // Barrel, with the rib along the top and the bore in the end.
  const barrel = cylinder({ r: 0.011, h: BARREL, pos: [0, 0.028, -0.085], rotX: Math.PI / 2, mat: steel });
  g.add(barrel);
  g.add(box({ size: [0.012, 0.008, BARREL], pos: [0, 0.038, -0.085], mat: steel }));
  g.add(cylinder({ r: 0.0055, h: 0.012, pos: [0, 0.028, -0.142], rotX: Math.PI / 2, mat: mat({ color: 0x0a0b0c, roughness: 1 }) }));
  // Front sight.
  g.add(box({ size: [0.004, 0.010, 0.010], pos: [0, 0.045, -0.136], mat: dark }));

  // Cylinder, fluted, with the chambers showing at the front face.
  const cyl = cylinder({ r: 0.021, h: 0.040, pos: [0, 0.028, -0.008], rotX: Math.PI / 2, mat: steel });
  g.add(cyl);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(cylinder({
      r: 0.0042, h: 0.006,
      pos: [Math.cos(a) * 0.0135, 0.028 + Math.sin(a) * 0.0135, -0.029],
      rotX: Math.PI / 2, mat: mat({ color: 0x131518, roughness: 0.9 }),
    }));
  }

  // Frame, top strap and rear sight.
  g.add(box({ size: [0.020, 0.030, 0.075], pos: [0, 0.028, 0.020], mat: steel }));
  g.add(box({ size: [0.016, 0.007, 0.055], pos: [0, 0.045, 0.014], mat: steel }));
  g.add(box({ size: [0.014, 0.008, 0.006], pos: [0, 0.048, 0.040], mat: dark }));

  // Hammer, back and slightly up, and the trigger inside its guard.
  const hammer = box({ size: [0.010, 0.020, 0.012], pos: [0, 0.050, 0.050], mat: dark });
  hammer.rotation.x = -0.30;
  g.add(hammer);
  g.add(box({ size: [0.006, 0.016, 0.006], pos: [0, 0.010, 0.028], mat: dark, rotX: 0.2 }));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.0035, 6, 14, Math.PI), steel);
  guard.position.set(0, 0.009, 0.030);
  guard.rotation.set(Math.PI / 2, 0, Math.PI);
  guard.rotateX(Math.PI / 2);
  g.add(guard);

  /* Grip, raked back the way a revolver's is. Two panels with the frame's
   * backstrap between them, so it is not one lump of wood. */
  const grip = new THREE.Group();
  grip.position.set(0, 0.012, 0.055);
  grip.rotation.x = 0.42;
  g.add(grip);
  grip.add(box({ size: [0.026, 0.078, 0.030], pos: [0, -0.030, 0], mat: wood }));
  grip.add(box({ size: [0.030, 0.070, 0.012], pos: [0, -0.028, -0.012], mat: dark }));

  for (const m of [barrel, cyl]) m.castShadow = true;

  return {
    group: g,
    hammer,
    /** Where the flash happens and where a shot starts, in local space. */
    muzzle: new THREE.Vector3(0, 0.028, -0.148),
  };
}

/**
 * The television, on its stand, facing the couch.
 *
 * `screen` is the mesh the channel canvas maps onto -- same arrangement as the
 * desk monitor, so whatever drives it only has to hand over a texture. The
 * standby light is on the front edge where you can see it from the couch,
 * which is the only place anybody ever looks at this thing from.
 */
export function makeTv(M, { x, z, rotY = 0, w = 1.12 }) {
  const g = group('tv');
  g.position.set(x, 0, z);
  g.rotation.y = rotY;

  const h = w * 0.5625;                 // 16:9, panel height
  const STAND_H = 0.44;
  const black = mat({ color: 0x14161a, roughness: 0.42 });

  // Low unit it sits on, with a shelf and a gap full of cables.
  g.add(box({ size: [w + 0.22, 0.04, 0.40], pos: [0, STAND_H, 0], mat: M.darkWood }));
  g.add(box({ size: [w + 0.18, 0.032, 0.36], pos: [0, STAND_H - 0.22, 0], mat: M.darkWood }));
  for (const sx of [-1, 1]) {
    g.add(box({ size: [0.035, STAND_H, 0.36], pos: [sx * (w / 2 + 0.06), STAND_H / 2, 0], mat: M.darkWood }));
  }

  // Pedestal and panel.
  const baseY = STAND_H + 0.02;
  g.add(box({ size: [0.30, 0.018, 0.20], pos: [0, baseY + 0.009, 0], mat: black }));
  g.add(box({ size: [0.05, 0.10, 0.05], pos: [0, baseY + 0.06, 0], mat: black }));

  const panelY = baseY + 0.11 + h / 2;
  g.add(box({ size: [w + 0.03, h + 0.03, 0.035], pos: [0, panelY, -0.012], mat: black }));

  const screen = plane(w, h, M.screenOff.clone());
  screen.position.set(0, panelY, 0.008);
  g.add(screen);

  // Standby light, and the brand nobody has ever heard of.
  const led = box({
    size: [0.012, 0.006, 0.004], pos: [0, panelY - h / 2 - 0.014, 0.012],
    mat: mat({ color: 0x401010, roughness: 0.4 }),
  });
  g.add(led);

  return {
    group: g,
    screen,
    led,
    /** Where the glow comes from, and where the remote is pointed. */
    screenPos: new THREE.Vector3(x, panelY, z),
    /** Standing in front of it, for the interaction prompt. */
    bounds: [[x - w / 2 - 0.16, 0, z - 0.22], [x + w / 2 + 0.16, panelY + h / 2, z + 0.22]],
  };
}

/**
 * A box of rounds, with a few loose beside it.
 *
 * Cardboard carton, lid off, brass showing. `count` is only how many are drawn
 * standing in it -- how many you actually get is the caller's business, since
 * a box that looks half full and gives you six is better than counting them.
 */
export function makeAmmoBox(M, { x, y, z, rotY = 0, count = 8, loose = 2 }) {
  const g = group('ammobox');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const card = mat({ color: 0x6f4a2c, roughness: 0.95 });
  const brass = mat({ color: 0xb08a3c, roughness: 0.32, metalness: 0.85 });
  const lead = mat({ color: 0x6b6259, roughness: 0.6, metalness: 0.4 });

  const W = 0.085, D = 0.055, H = 0.032;
  // Carton: floor and four walls, so it is open at the top and has a thickness.
  g.add(box({ size: [W, 0.004, D], pos: [0, 0.002, 0], mat: card }));
  for (const [sx, sz, sw, sd] of [
    [0, -D / 2, W, 0.004], [0, D / 2, W, 0.004],
    [-W / 2, 0, 0.004, D], [W / 2, 0, 0.004, D],
  ]) {
    g.add(box({ size: [sw, H, sd], pos: [sx, H / 2, sz], mat: card }));
  }
  // The lid, off, leaning against the side.
  const lid = box({ size: [W + 0.006, 0.004, D + 0.006], pos: [W * 0.78, H * 0.42, 0], mat: card });
  lid.rotation.z = 1.16;
  g.add(lid);

  /** One round: brass case, lead nose. */
  const round = (rx, ry, rz, tipUp = true, rot = 0) => {
    const r = new THREE.Group();
    r.position.set(rx, ry, rz);
    r.rotation.y = rot;
    r.add(cylinder({ r: 0.0045, h: 0.019, pos: [0, 0.0095, 0], mat: brass }));
    r.add(cylinder({ rTop: 0.0032, rBottom: 0.0045, h: 0.007, pos: [0, 0.0225, 0], mat: lead }));
    if (!tipUp) r.rotation.z = Math.PI / 2;
    g.add(r);
    return r;
  };

  // Standing in the box, in rows, with the back row lower so it reads as full.
  const cols = 4;
  for (let i = 0; i < count; i++) {
    const cx = (i % cols) - (cols - 1) / 2;
    const cz = Math.floor(i / cols) - 0.5;
    round(cx * 0.019, 0.004, cz * 0.022);
  }
  // A couple that never made it back in, lying on their sides.
  for (let i = 0; i < loose; i++) {
    const r = round(-W * 0.85 - i * 0.016, 0.0045, (i % 2 ? 1 : -1) * 0.012, false, 0.4 + i * 0.9);
    r.rotation.z = Math.PI / 2;
  }

  return { group: g };
}

/**
 * The phone. A slab with a screen on it.
 *
 * `screen` is the mesh the phone's canvas maps onto, same arrangement as the
 * monitor and the telly. Built face-up along +Y so it can lie on a surface, and
 * the held version just tips it toward the camera.
 */
export function makePhone(M, { x, y, z, rotY = 0, w = 0.072 }) {
  const g = group('phone');
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const h = w * 2.06;                    // a phone, not a card
  const body = mat({ color: 0x14161b, roughness: 0.36, metalness: 0.5 });
  const T = 0.008;

  g.add(box({ size: [w, T, h], pos: [0, T / 2, 0], mat: body }));
  // Rail round the edge, so it is not a domino.
  for (const [sx, sz, sw, sd] of [
    [0, -h / 2, w, 0.003], [0, h / 2, w, 0.003],
    [-w / 2, 0, 0.003, h], [w / 2, 0, 0.003, h],
  ]) {
    g.add(box({ size: [sw, T + 0.001, sd], pos: [sx, T / 2, sz], mat: mat({ color: 0x2a2e36, roughness: 0.3, metalness: 0.7 }) }));
  }

  const screen = plane(w * 0.90, h * 0.94, M.screenOff.clone());
  screen.rotation.x = -Math.PI / 2;      // face up
  screen.position.set(0, T + 0.0008, 0);
  g.add(screen);

  // Camera bump, on the back, so the thing has an up and a down.
  g.add(box({ size: [w * 0.30, 0.002, w * 0.30], pos: [-w * 0.24, -0.001, -h * 0.36], mat: body }));

  return { group: g, screen, w, h };
}
