/**
 * The staging half of the proven Margo dress-help interaction.
 *
 * `createDressHelpSequence` owns the seven pulls and audio. This owns the
 * player's side while that bar is up: stop movement, pause ordinary look-at
 * interactions, and hold the view on the fastening. E/Q are then routed
 * directly by the scene, exactly as the apartment routes Margo's bar.
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createDressHelpFocus({
  player,
  interaction,
  target,
  /* Optional exact CAMERA position for an authored interaction mark. The
   * ordinary Margo adapter does not need a snap; a fixture adapter can opt in
   * when the usable side of its furniture is otherwise ambiguous. A snap is
   * reversible: Q/completion returns the player to the valid view it replaced. */
  marker = null,
} = {}) {
  let active = false;
  let restoreEnabled = null;
  let restorePaused = false;
  let restoreView = null;
  let lastAim = null;
  let lastMarker = null;

  const point = (value) => {
    const resolved = typeof value === 'function' ? value() : value;
    return Number.isFinite(resolved?.x) && Number.isFinite(resolved?.y)
      && Number.isFinite(resolved?.z) ? resolved : null;
  };

  function distance(from, to) {
    if (!from || !to) return null;
    return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  }

  function captureView() {
    const position = point(player?.position);
    if (!position || !Number.isFinite(player?.yaw) || !Number.isFinite(player?.pitch)) return null;
    return {
      x: position.x,
      y: position.y,
      z: position.z,
      yaw: player.yaw,
      pitch: player.pitch,
    };
  }

  function restoreSnappedView() {
    const prior = restoreView;
    restoreView = null;
    if (!prior || !player?.position) return false;
    player.position.set?.(prior.x, prior.y, prior.z);
    if (typeof player.position.set !== 'function') {
      player.position.x = prior.x;
      player.position.y = prior.y;
      player.position.z = prior.z;
    }
    player.yaw = prior.yaw;
    player.pitch = prior.pitch;
    player.velocity?.set?.(0, 0, 0);
    return true;
  }

  function snap() {
    const at = point(marker);
    const position = point(player?.position);
    if (!at || !position) return false;
    player.position.set?.(at.x, at.y, at.z);
    if (typeof player.position.set !== 'function') {
      player.position.x = at.x;
      player.position.y = at.y;
      player.position.z = at.z;
    }
    player.velocity?.set?.(0, 0, 0);
    lastMarker = { x: at.x, y: at.y, z: at.z };
    return true;
  }

  function aim() {
    const from = player?.position;
    const to = point(target);
    if (!Number.isFinite(from?.x) || !Number.isFinite(from?.y) || !Number.isFinite(from?.z)
      || !Number.isFinite(to?.x) || !Number.isFinite(to?.y) || !Number.isFinite(to?.z)) {
      return false;
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const horizontal = Math.hypot(dx, dz);
    if (horizontal < 1e-6 && Math.abs(dy) < 1e-6) return false;
    /* Player/THREE camera faces -Z at yaw zero. */
    const yaw = Math.atan2(-dx, -dz);
    const rawPitch = Math.atan2(dy, Math.max(1e-6, horizontal));
    const pitch = Number.isFinite(player.pitchMin) && Number.isFinite(player.pitchMax)
      ? clamp(rawPitch, player.pitchMin, player.pitchMax)
      : rawPitch;
    player.yaw = yaw;
    player.pitch = pitch;
    lastAim = { yaw, pitch, distance: Math.hypot(horizontal, dy) };
    return true;
  }

  return Object.freeze({
    begin() {
      if (active) return false;
      active = true;
      restoreEnabled = typeof player?.enabled === 'boolean' ? player.enabled : null;
      restorePaused = interaction?.paused === true;
      player?.clearKeys?.();
      const priorView = captureView();
      restoreView = snap() ? priorView : null;
      if (player && restoreEnabled !== null) player.enabled = false;
      interaction?.setPaused?.(true);
      aim();
      return true;
    },
    end() {
      if (!active) return false;
      active = false;
      restoreSnappedView();
      interaction?.setPaused?.(restorePaused);
      if (player && restoreEnabled !== null) player.enabled = restoreEnabled;
      return true;
    },
    snap,
    aim,
    get active() { return active; },
    get debug() {
      return {
        active,
        aim: lastAim ? { ...lastAim } : null,
        marker: lastMarker ? { ...lastMarker } : (point(marker) ? { ...point(marker) } : null),
        markerDistance: distance(point(player?.position), lastMarker ?? point(marker)),
        targetDistance: distance(point(player?.position), point(target)),
        interactionPaused: interaction?.paused === true,
        playerEnabled: player?.enabled,
      };
    },
  });
}
