/**
 * BOOSKI'S SHOT — the owner's booked beat, as one system both Bing pages run.
 *
 * Talk to Booski at the bar and he offers a shot. The bartender pours it, then
 * deliberately passes the tray over the counter, and the Prospect ends up
 * holding a whiskey he did not order. One shot per visit. The camera hijack is
 * the gentlest the club allows — the player is frozen only while the bartender
 * makes the pass, and control comes back the moment the glass lands, before
 * the toast.
 *
 * It lived inline in `src/bing/main.js` and was therefore reachable on exactly
 * one of the two nights the player spends in this building. The owner asked
 * for the shot again at the closed party (2026-08-19) and asked for the
 * EXISTING interaction, not a second one — so the props, the poses, the
 * timings and the beat driver moved here whole and both pages mount them. The
 * ordinary night keeps its inventory slot, its drunk meter and its signature
 * record; the closed party has none of those systems and passes no hooks for
 * them. That difference is the only difference.
 *
 * Nothing in here knows about a mission, an inventory or a dialogue tree. It
 * knows about a bar, a bartender, a bottle and a man about to be handed a
 * drink, and it calls back for everything else.
 */
import * as THREE from 'three';

/* These are local to the bartender (who faces across the bar on +local Z).
 * The tray begins just inside the service rail and ends visibly over its
 * front edge. This is an authored counter pass, not an NPC route through the
 * solid bar geometry, so it cannot stall at the counter for sixteen seconds. */
export const SHOT_TRAY_HOME = new THREE.Vector3(0, 1.15, 0.38);
export const SHOT_TRAY_PASS = new THREE.Vector3(0, 1.15, 1.10);
export const SHOT_POUR_SECONDS = 2.2;
export const SHOT_PASS_SECONDS = 1.25;

/**
 * The bottle, the glass, the stream and the two camera props.
 *
 * These deliberately small meshes are staged on the service rail: the
 * bartender tips an unmistakable square whiskey bottle, a narrow stream
 * bridges the neck to the glass, and the amber fill rises from the bottom.
 * They stay hidden outside that one beat, so the permanent bar dressing does
 * not gain another always-rendered prop cluster.
 */
export function buildBooskiShotProps({ scene, camera, bartender, barService }) {
  const shotPour = (() => {
    const root = new THREE.Group();
    root.name = 'booski-shot.pour';
    /* The bar's own polished top sits at y=1.145 (`club.js`'s bar-top slab,
     * 1.1 +/- 0.045). The glass used to rest at 1.16 -- only 1.5cm of the
     * open-ended cylinder's own wall above that surface, thin enough that the
     * hollow base read as sunk into the counter from most angles. Raised a
     * few cm clear of it. */
    root.position.set(-19.18, 1.19, barService.z);

    const whiskey = new THREE.MeshStandardMaterial({
      color: 0xb96819, emissive: 0x4b1704, emissiveIntensity: 0.18,
      roughness: 0.24, transparent: true, opacity: 0.92,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xd9edf5, roughness: 0.06, transmission: 0.82,
      thickness: 0.01, transparent: true, opacity: 0.42,
    });
    const bottleGlass = new THREE.MeshPhysicalMaterial({
      color: 0x4a2813, roughness: 0.16, transmission: 0.32,
      thickness: 0.025, transparent: true, opacity: 0.9,
    });

    const bottle = new THREE.Group();
    bottle.name = 'booski-shot.bottle';
    const bottleBody = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.19, 0.075), bottleGlass);
    bottleBody.position.y = 0.095;
    const bottleShoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.045, 0.045, 12), bottleGlass);
    bottleShoulder.position.y = 0.212;
    const bottleNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.075, 12), bottleGlass);
    bottleNeck.name = 'booski-shot.bottle-neck';
    bottleNeck.position.y = 0.270;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.072, 0.085),
      new THREE.MeshStandardMaterial({ color: 0xe9d7ae, roughness: 0.78 }),
    );
    label.position.set(0, 0.105, 0.0382);
    bottle.add(bottleBody, bottleShoulder, bottleNeck, label);
    bottle.position.set(-0.24, 0.09, -0.035);
    bottle.rotation.z = -1.08;
    root.add(bottle);

    const glassShell = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.024, 0.078, 20, 1, true), glass);
    glassShell.name = 'booski-shot.glass';
    glassShell.position.set(0.12, 0.039, 0);
    root.add(glassShell);

    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.021, 0.055, 18), whiskey);
    fill.name = 'booski-shot.fill';
    fill.position.set(0.12, 0.029, 0);
    fill.scale.y = 0.001;
    root.add(fill);

    /* Exact 3D line between the transformed bottle mouth and glass rim. The
     * bottle sits 3.5cm behind the glass as well as left of it, so an X/Y-only
     * angle still visibly missed the neck when viewed down the bar. */
    bottle.updateMatrix();
    const pourMouth = new THREE.Vector3(0, 0.3075, 0).applyMatrix4(bottle.matrix);
    const pourRim = glassShell.position.clone().add(new THREE.Vector3(0, 0.039, 0));
    const pourVector = pourMouth.clone().sub(pourRim);
    const stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.006, pourVector.length(), 8),
      whiskey,
    );
    stream.name = 'booski-shot.stream';
    stream.position.copy(pourMouth).add(pourRim).multiplyScalar(0.5);
    stream.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      pourVector.normalize(),
    );
    root.add(stream);

    root.visible = false;
    scene.add(root);
    return { root, bottle, stream, fill };
  })();

  /* The delivered glass is a separate camera prop. Ordinary bar whiskey is a
   * bottle and still uses the shared held-drink model; Booski hands Tony a
   * filled shot glass, so showing that same bottle here would undo the pour we
   * just watched. */
  const heldShot = (() => {
    const root = new THREE.Group();
    root.name = 'booski-shot.held';
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.027, 0.086, 20, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xd9edf5, roughness: 0.05, transmission: 0.88,
        thickness: 0.012, transparent: true, opacity: 0.48,
      }),
    );
    shell.name = 'booski-shot.held-glass';
    const fill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.029, 0.024, 0.058, 18),
      new THREE.MeshStandardMaterial({
        color: 0xc77821, emissive: 0x4f1b05, emissiveIntensity: 0.2,
        roughness: 0.3, transparent: true, opacity: 0.94,
      }),
    );
    fill.name = 'booski-shot.held-fill';
    fill.position.y = -0.009;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.036, 0.0025, 6, 20),
      new THREE.MeshStandardMaterial({ color: 0xe8f5fa, roughness: 0.12 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.043;
    root.add(shell, fill, rim);
    root.visible = false;
    camera.add(root);
    return { root, fill };
  })();

  const shotDelivery = (() => {
    const root = new THREE.Group();
    root.name = 'booski-shot.delivery';
    root.position.set(0, 1.02, 0.31);
    const tray = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.13, 0.014, 24),
      new THREE.MeshStandardMaterial({ color: 0xbcc3ca, roughness: 0.24, metalness: 0.82 }),
    );
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.031, 0.024, 0.075, 18, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xd9edf5, roughness: 0.06, transmission: 0.82,
        thickness: 0.01, transparent: true, opacity: 0.46,
      }),
    );
    shell.position.y = 0.045;
    const fill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.021, 0.052, 16),
      new THREE.MeshStandardMaterial({ color: 0xc77821, roughness: 0.28 }),
    );
    fill.name = 'booski-shot.delivery-fill';
    fill.position.y = 0.035;
    root.add(tray, fill, shell);
    root.visible = false;
    bartender.group.add(root);
    return { root, fill };
  })();

  function poseHeldShot(progress = 0) {
    const k = Math.max(0, Math.min(1, progress));
    const e = k * k * (3 - 2 * k);
    heldShot.root.visible = true;
    heldShot.root.position.set(
      0.22 - 0.18 * e,
      -0.25 + 0.22 * e,
      -0.36 + 0.18 * e,
    );
    /* Camera space looks down local -Z. A positive pitch brings the rim back
     * toward local +Z (Tony) as it rises; the old negative pitch tipped the
     * glass farther down-range, away from the player. */
    heldShot.root.rotation.set(1.38 * e, 0.08 * e, 0.28 * e);
    /* The last half of the tilt drains the amber toward the rim. It remains a
     * single cheap mesh; the silhouette and motion sell the drink. */
    heldShot.fill.scale.y = 1 - 0.94 * Math.max(0, (e - 0.45) / 0.55);
  }

  function hideHeldShot() {
    heldShot.root.visible = false;
    heldShot.fill.scale.y = 1;
    heldShot.root.position.set(0, 0, 0);
    heldShot.root.rotation.set(0, 0, 0);
  }

  function poseShotPour(progress) {
    const k = Math.max(0, Math.min(1, progress));
    shotPour.root.visible = true;
    shotPour.bottle.visible = true;
    shotPour.stream.visible = k > 0.04 && k < 0.94;
    shotPour.fill.scale.y = Math.max(0.001, k);
    /* Keep the fill sitting on the bottom while its centre-scaled cylinder
     * grows. A rising liquid line is what makes this read as a pour. */
    shotPour.fill.position.y = 0.003 + 0.0275 * Math.max(0.001, k);
  }

  return {
    pour: shotPour,
    held: heldShot,
    delivery: shotDelivery,
    poseHeldShot,
    hideHeldShot,
    poseShotPour,
  };
}

/**
 * The beat itself.
 *
 * `start()` runs the pour, the counter pass and the handover; `update(dt)` is
 * the frame driver the caller parks on whatever "a cinematic is running" hook
 * its page already has; `drink()` is the keypress that throws it back.
 *
 * Every scene-owned consequence is a callback, because the two pages disagree
 * about all of them and about nothing else:
 *
 *   onDeliver     the glass is in his hand — inventory, HUD hand, prompts
 *   hasGlass      is he still holding it? (a page with an inventory can lose it)
 *   onDrinkStart  the frame he actually drinks — the ordinary night spends its
 *                 signature record here rather than on the pour
 *   onDrained     the glass is empty — drunk meter, inventory slot, flags
 *   onHandoff     Booski's landing line, in whatever dialogue system the page has
 *   onAfter       his follow-up, once that system is free again
 *   onBeatEnd     the camera hijack is over and the page may drop its frame hook
 */
export function createBooskiShotBeat({
  props,
  audio,
  player,
  interaction,
  hud,
  bartender,
  booski = null,
  barService,
  cueSeconds = () => 0,
  voiceCue = () => null,
  bartenderLine,
  onDeliver = null,
  hasGlass = () => true,
  onDrinkStart = null,
  onDrained = null,
  onHandoff = null,
  onAfter = null,
  onBeatEnd = null,
  isDialogueBusy = () => false,
} = {}) {
  if (!props || !bartender) throw new TypeError('Booski\'s shot needs its props and a bartender');

  /* The same telemetry object `game.shotBeat` has always been, so the browser
   * verifier can still watch the pour, the pass and the wait for [E]. */
  let beat = null;
  let done = false;
  let frame = null;
  const trayWorld = new THREE.Vector3();

  function drinkTick(dt) {
    if (!beat) return;
    if (beat.pendingAfter && !isDialogueBusy()) {
      beat.pendingAfter = false;
      onAfter?.();
    }
    if (beat.phase !== 'drinking') return;
    beat.drink = Math.min(1, beat.drink + dt / 1.2);
    props.poseHeldShot(beat.drink);
    if (beat.drink < 1) return;

    beat.phase = 'drank';
    beat.drank = true;
    beat.pendingAfter = true;
    props.hideHeldShot();
    audio.play('glass.set', { volume: 0.55, position: barService });
    onDrained?.();
    hud.say('Hot rye, cold room. Booski looks personally vindicated.', 3600);
  }

  return {
    get done() { return done; },
    get running() { return !!frame; },
    get state() { return beat; },
    /* Read/written by the page's own resume and verifier plumbing, exactly as
     * `game.shotBeat` was. */
    set state(next) { beat = next; },

    /** The keypress that throws it back. */
    drink() {
      if (!beat || beat.phase !== 'await-drink' || !hasGlass()) return false;
      beat.phase = 'drinking';
      beat.awaitingDrink = false;
      beat.drink = 0;
      /* The signature record lands HERE, on the press that takes the shot.
       *
       * It used to start on the pour — twelve or more seconds of bartender,
       * bouncer and handover earlier, so by the time Tony actually drank it
       * the record was most of the way through its own window and the moment
       * it was cut for had already gone past. Owner's note, 2026-08-04: *"I
       * want the sound to happen right when I take the shot, like hit E on
       * it."* This is that keypress. */
      onDrinkStart?.();
      audio.play('whiskey.swig', { volume: 0.68 });
      return true;
    },

    /** Frame driver. Safe to call every frame whether or not a beat is live. */
    update(dt) {
      frame?.(dt);
      drinkTick(dt);
    },

    start() {
      if (done || frame) return false;
      done = true;
      const station = {
        x: bartender.group.position.x,
        z: bartender.group.position.z,
        yaw: bartender.group.rotation.y,
        job: bartender.job,
        speed: bartender.speed,
      };
      const hijacked = player.mode === 'walk';
      if (hijacked) {
        player.mode = 'frozen';
        interaction.setPaused(true);
        hud.hidePrompt();
      }
      bartender.job = 'stand';
      bartender.route = null;
      bartender.pouringShot = true;
      bartender.carryingShot = false;
      let phase = 'pour';
      let phaseTime = 0;
      let beatTime = 0;
      let bartenderVoiceUntil = Infinity;
      beat = {
        phase, pour: 0, pass: 0, awaitingDrink: false, drank: false,
        bartenderLine: false, beatTime: 0, bartenderVoiceUntil: null,
      };
      props.delivery.root.position.copy(SHOT_TRAY_HOME);
      props.poseShotPour(0.001);
      audio.play('whiskey.cap', { volume: 0.5, position: barService });
      audio.play('whiskey.pour', { volume: 0.65, delay: 0.18, position: barService });

      /* ---- the framing ----
       * The shot starts where a shot should start: on the bar, on Booski, and
       * on the glass. The aim point only follows the bartender once he comes
       * close enough to be worth looking at, and the yaw is slew-limited, so
       * from any starting view it is a pan rather than a cut. */
      const openAim = new THREE.Vector3(
        barService.x,
        1.35,
        booski ? booski.position.z : barService.z,
      );
      const MAX_SLEW = 1.5;               // radians a second; a head turn, not a snap
      const frameOn = (tx, tz, dt2, lead = 3.0) => {
        const wantYaw = Math.atan2(-(tx - player.position.x), -(tz - player.position.z));
        const dy = Math.atan2(Math.sin(wantYaw - player.yaw), Math.cos(wantYaw - player.yaw));
        const step = dy * Math.min(1, dt2 * lead);
        player.yaw += Math.abs(step) > MAX_SLEW * dt2 ? Math.sign(step) * MAX_SLEW * dt2 : step;
        player.pitch += (-0.04 - player.pitch) * Math.min(1, dt2 * 2.4);
      };
      const startBartenderLine = () => {
        if (beat.bartenderLine) return;
        beat.bartenderLine = true;
        hud.say(`<em>Bartender:</em> ${bartenderLine.text}`, 3600);
        const cueTime = Math.max(3.6, cueSeconds(bartenderLine.cue) + 0.4);
        const take = voiceCue(bartenderLine.cue, { volume: 0.86 });
        /* The dedicated tray pose keeps both hands stable while this gives the
         * bartender a living face for the line -- and the face runs on the take,
         * so it stops when he does. */
        bartender.say(Math.max(1.5, cueTime - 0.4), take);
        bartenderVoiceUntil = beatTime + cueTime;
        beat.bartenderVoiceUntil = bartenderVoiceUntil;
      };

      frame = (dt) => {
        beatTime += dt;
        phaseTime += dt;
        beat.beatTime = beatTime;
        if (phase === 'pour') {
          const pour = Math.min(1, phaseTime / SHOT_POUR_SECONDS);
          props.poseShotPour(pour);
          beat.phase = phase;
          beat.pour = pour;
          if (hijacked) frameOn(openAim.x, openAim.z, dt, 3.2);
          /* Let him make the timing joke while the audience can see why they are
           * looking at him: the pour is still happening. The Booski cue has
           * already ended before this beat exists. */
          if (pour >= 0.3) startBartenderLine();
          if (pour >= 1) {
            props.pour.root.visible = false;
            props.delivery.root.visible = true;
            bartender.pouringShot = false;
            bartender.carryingShot = true;
            bartender.faceToward(player.position.x, player.position.z);
            phase = 'pass';
            beat.phase = phase;
            phaseTime = 0;
            props.delivery.root.position.copy(SHOT_TRAY_HOME);
          }
        } else if (phase === 'pass') {
          const pass = Math.min(1, phaseTime / SHOT_PASS_SECONDS);
          beat.phase = phase;
          beat.pass = pass;
          props.delivery.root.position.lerpVectors(SHOT_TRAY_HOME, SHOT_TRAY_PASS, pass);
          props.delivery.root.getWorldPosition(trayWorld);
          if (hijacked) {
            /* The camera follows the tray itself as it crosses the rail. That
             * makes the four-second beat a readable handoff instead of a held
             * stare at a bartender who cannot walk through his own bar. */
            frameOn(trayWorld.x, trayWorld.z, dt, 4.5);
          }
          if (pass >= 1) {
            phase = 'handoff';
            phaseTime = 0;
          }
        } else if (phase === 'handoff') {
          props.delivery.root.position.copy(SHOT_TRAY_PASS);
          props.delivery.root.getWorldPosition(trayWorld);
          if (hijacked) frameOn(trayWorld.x, trayWorld.z, dt, 4.5);
          /* The counter pass is already complete; this very short held endpoint
           * only protects the bartender's line from Booski's handoff cue. */
          if (beatTime < bartenderVoiceUntil) return;

          props.delivery.root.visible = false;
          props.delivery.root.position.copy(SHOT_TRAY_HOME);
          bartender.group.position.set(station.x, 0, station.z);
          bartender.job = station.job;
          bartender.folded = false;
          bartender.speed = station.speed ?? bartender.speed;
          bartender.group.rotation.y = station.yaw;
          bartender.targetYaw = undefined;
          bartender.pouringShot = false;
          bartender.carryingShot = false;
          audio.play('glass.set', { volume: 0.55, position: barService });
          props.poseHeldShot(0);
          onDeliver?.();
          beat.phase = 'await-drink';
          beat.awaitingDrink = true;
          beat.deliverySeconds = beatTime;
          /* Control back BEFORE the toast -- the club's rule is that nobody
           * important talking ever costs you the sticks. */
          if (hijacked) {
            player.mode = 'walk';
            interaction.setPaused(false);
          }
          onHandoff?.();
          frame = null;
          onBeatEnd?.();
        }
      };
      return true;
    },
  };
}
