/**
 * Reduce Three's effective mesh draw to the material slots that can actually
 * submit triangles. This stays pure so the adversarial contract can exercise
 * groups, draw ranges, hidden ancestors, and production material semantics
 * without launching a browser.
 */
export function cockpitEvidenceDrawPolicy(mesh) {
  const materials = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
  const geometry = mesh?.geometry;
  const total = Number(geometry?.index?.count ?? geometry?.attributes?.position?.count ?? 0);
  const drawStart = Number(geometry?.drawRange?.start ?? 0);
  const rawDrawCount = geometry?.drawRange?.count ?? Number.POSITIVE_INFINITY;
  const drawCount = Number(rawDrawCount);
  const renderableObject = Boolean(geometry
    && (mesh?.isMesh || mesh?.isSprite || mesh?.isPoints || mesh?.isLine));
  let ancestorsVisible = renderableObject;
  for (let object = mesh; object; object = object.parent) {
    if (object.visible === false) ancestorsVisible = false;
  }
  const instanceVisible = !mesh?.isInstancedMesh || Number(mesh.count) > 0;
  const validRange = Number.isFinite(total) && total > 0
    && Number.isFinite(drawStart) && drawStart >= 0
    && (drawCount === Number.POSITIVE_INFINITY || (Number.isFinite(drawCount) && drawCount > 0));
  const drawEnd = !validRange ? 0
    : drawCount === Number.POSITIVE_INFINITY ? total : Math.min(total, drawStart + drawCount);
  const minimumDrawCount = mesh?.isPoints ? 1 : mesh?.isLine ? 2 : 3;
  const intersects = (start, count) => {
    const groupStart = Number(start);
    const groupCount = Number(count);
    if (!validRange || !Number.isFinite(groupStart) || !Number.isFinite(groupCount)
        || groupCount <= 0) return false;
    return Math.min(drawEnd, groupStart + groupCount) - Math.max(drawStart, groupStart)
      >= minimumDrawCount;
  };
  const activeSlots = new Set();
  if (materials.length > 1 || Array.isArray(mesh?.material)) {
    for (const group of geometry?.groups ?? []) {
      if (intersects(group.start, group.count)) activeSlots.add(Number(group.materialIndex ?? 0));
    }
  } else if (intersects(0, total)) {
    activeSlots.add(0);
  }
  const slots = materials.map((material, index) => {
    const transparent = material?.transparent === true;
    const opacity = Number.isFinite(material?.opacity) ? material.opacity : 1;
    const alphaTest = Number.isFinite(material?.alphaTest) ? material.alphaTest : 0;
    const active = ancestorsVisible && instanceVisible && activeSlots.has(index)
      && Boolean(material) && material.visible !== false;
    return Object.freeze({
      index,
      active,
      transparent,
      effectiveOpacity: transparent ? Math.max(0, Math.min(1, opacity)) : 1,
      alphaTest: Math.max(0, alphaTest),
      preserveAlphaCoverage: Boolean((transparent || alphaTest > 0)
        && (material?.map || material?.alphaMap)),
      colorWrite: material?.colorWrite !== false,
      depthTest: material?.depthTest !== false,
      depthWrite: material?.depthWrite !== false,
      polygonOffset: material?.polygonOffset === true,
      polygonOffsetFactor: Number(material?.polygonOffsetFactor ?? 0),
      polygonOffsetUnits: Number(material?.polygonOffsetUnits ?? 0),
    });
  });
  return Object.freeze({
    renderable: slots.some(({ active }) => active),
    slots: Object.freeze(slots),
  });
}

/**
 * Describe the production deformation features that Three's stock material
 * program must retain for an evidence-mask draw.  This is deliberately pure:
 * the direct suite constructs real InstancedMesh/SkinnedMesh/morph objects and
 * proves that the classification follows the object and geometry actually
 * submitted by the scene.
 */
export function cockpitEvidenceDeformationContract(mesh) {
  const morphAttributes = mesh?.geometry?.morphAttributes ?? {};
  const influences = mesh?.morphTargetInfluences;
  return Object.freeze({
    instanced: mesh?.isInstancedMesh === true,
    instanceCount: mesh?.isInstancedMesh ? Number(mesh.count ?? 0) : 0,
    skinned: mesh?.isSkinnedMesh === true,
    morphTargets: Array.isArray(morphAttributes.position) && morphAttributes.position.length > 0,
    morphNormals: Array.isArray(morphAttributes.normal) && morphAttributes.normal.length > 0,
    morphTargetsRelative: mesh?.geometry?.morphTargetsRelative === true,
    morphInfluenceCount: Array.isArray(influences) ? influences.length : 0,
  });
}

/** Resolve only the real, documented runtime surfaces. */
export function resolveCockpitRuntime(root, scene) {
  if (!['beefrun', 'enola'].includes(scene)) {
    throw new Error(`unsupported cockpit evidence scene: ${scene}`);
  }
  const handleName = scene === 'beefrun' ? 'window.__beefrun' : 'window.__enolaSquatch';
  const handle = scene === 'beefrun' ? root?.__beefrun : root?.__enolaSquatch;
  if (!handle) throw new Error(`${handleName} public runtime handle is unavailable`);
  const camera = handle.camera;
  if (!handle.scene?.isScene || !camera?.isPerspectiveCamera
      || !handle.renderer || !handle.aircraft?.group?.isObject3D) {
    throw new Error(`${handleName} does not expose the required real runtime surface`);
  }
  return {
    handle,
    handleName,
    scene: handle.scene,
    camera,
    renderer: handle.renderer,
    aircraft: handle.aircraft,
  };
}

export function cockpitEvidenceRenderableDescendants(root, selection = 'subtree') {
  if (!root) return [];
  const renderable = (object) => Boolean(object?.material && object?.geometry
    && (object.isMesh || object.isSprite || object.isPoints || object.isLine));
  if (selection === 'root-only') return renderable(root) ? [root] : [];
  if (selection !== 'subtree') throw new Error(`unsupported cockpit owner selection: ${selection}`);
  const found = [];
  root.traverse?.((object) => { if (renderable(object)) found.push(object); });
  return found;
}

/** Assign a distinct, high-chroma ID ray to every semantic root in one shot.
 * Owners remain the contract-facing aggregate, but no sibling root can lend
 * pixels or connected components to another. */
export function buildCockpitRootPalette(spec, ownerMap) {
  const roots = spec.owners.flatMap((owner) => (ownerMap[owner.id] ?? []).map((root) => ({
    owner,
    root,
  })));
  if (!roots.length || roots.length > 96) {
    throw new Error(`cockpit root palette requires 1..96 roots, received ${roots.length}`);
  }
  const channel = (value) => Math.round(255 * Math.max(0, Math.min(1, value)));
  const hsv = (hue) => {
    const saturation = 0.92;
    const value = 1;
    const sector = ((hue % 1) + 1) % 1 * 6;
    const index = Math.floor(sector);
    const fraction = sector - index;
    const p = value * (1 - saturation);
    const q = value * (1 - saturation * fraction);
    const t = value * (1 - saturation * (1 - fraction));
    const [red, green, blue] = [
      [value, t, p], [q, value, p], [p, value, t],
      [p, q, value], [t, p, value], [value, p, q],
    ][index % 6];
    return `#${[red, green, blue].map((entry) => channel(entry).toString(16).padStart(2, '0')).join('')}`;
  };
  return Object.freeze(roots.map(({ owner, root }, index) => Object.freeze({
    id: `${owner.id}:${root.uuid}`,
    ownerId: owner.id,
    ownerColor: owner.color.toLowerCase(),
    rootUuid: root.uuid,
    rootName: root.name || '(unnamed)',
    color: hsv((index + 0.37) / roots.length),
  })));
}

/** Resolve exact named roots from the public aircraft/crew structures. */
export function resolveCockpitVisualOwnerRoots(runtime, spec) {
  const h = runtime?.handle;
  const a = runtime?.aircraft;
  const root = a?.group;
  if (!h || !root) throw new Error('cockpit owner resolver requires a public runtime');
  const all = [];
  root.traverse?.((object) => all.push(object));
  const named = (name) => all.filter((object) => object.name === name);
  const one = (name) => named(name)[0] ?? null;
  const names = (...values) => values.flatMap((name) => named(name));
  const map = {};
  if (spec.scene === 'beefrun') {
    const panel = one('instrument-panel');
    const lou = h.mission?.lou?.group ?? null;
    map['windshield-pane'] = [a.parts.windshield];
    map['windshield-frames'] = names('windshield-frame-header', 'windshield-frame-port',
      'windshield-frame-sill', 'windshield-frame-starboard');
    map['instrument-panel-shell'] = [panel];
    map.gauges = panel?.children?.filter((entry) => entry.material?.map === a.parts.panelTex) ?? [];
    map['pilot-yoke'] = [one('yoke-pilot')];
    map['copilot-yoke'] = [one('yoke-copilot')];
    map['port-window-pane'] = [one('cabin-glass-side-left')];
    map['port-aperture-shell'] = names('fuselage-side-port-header', 'fuselage-side-port-lower',
      'fuselage-side-port-window-wall-1', 'fuselage-side-port-window-wall-2',
      'fuselage-side-port-window-wall-3');
    map['port-frame'] = [one('windshield-frame-port')];
    map['starboard-window-pane'] = [one('cabin-glass-side-right')];
    map['starboard-aperture-shell'] = names('fuselage-side-starboard-header',
      'fuselage-side-starboard-lower-1', 'fuselage-side-starboard-lower-2',
      'fuselage-side-starboard-opening-wall-1', 'fuselage-side-starboard-opening-wall-2',
      'fuselage-side-starboard-opening-wall-3', 'fuselage-side-starboard-opening-wall-4');
    const louObjects = [];
    lou?.traverse?.((object) => louObjects.push(object));
    const louNamed = (name) => louObjects.filter((object) => object.name === name);
    map['sasole-body'] = [...louNamed('captain_lou_sasole-head'), ...louNamed('captain_lou_sasole-torso')];
    map['sasole-boots'] = [...louNamed('captain_lou_sasole-leg-left-boot'),
      ...louNamed('captain_lou_sasole-leg-right-boot')];
    map['supported-footwell'] = names('cockpit-footwell', 'cockpit-footwell-leg-1',
      'cockpit-footwell-leg-2', 'cockpit-footwell-leg-3', 'cockpit-footwell-leg-4');
    map['rudder-pedals'] = names('rudder-pedal-left', 'rudder-pedal-left-mount',
      'rudder-pedal-right', 'rudder-pedal-right-mount');
    map['cargo-door-leaf'] = [one('cargo-door-leaf')];
    map['cargo-threshold'] = [one('cargo-door-threshold')];
    map['cargo-ramp'] = [one('cargo-ramp')];
    map['cargo-door-frame'] = names('cargo-door-frame-head', 'cargo-door-frame-sill',
      'cargo-door-jamb-0', 'cargo-door-jamb-1');
    map['side-shell'] = [one('fuselage-side-shell')];
    map['rolled-hull'] = [one('fuselage-shell')];
    map['nose-shell'] = names('nose-cone', 'nose-fairing');
    map['tail-shell'] = names('tail-boom', 'tail-boom-fairing');
    map['engine-quadrant'] = [one('engine-control-quadrant')];
    map['engine-levers'] = names('lever-mixture-left', 'lever-mixture-right',
      'lever-prop-left', 'lever-prop-right', 'lever-throttle-left', 'lever-throttle-right');
    map['flap-lever'] = [one('flap-lever')];
  } else {
    const crewObjects = (member) => {
      const result = [];
      member?.group?.traverse?.((object) => result.push(object));
      return result;
    };
    const crewNamed = (member, ...wanted) => {
      const objects = crewObjects(member);
      return wanted.flatMap((name) => objects.filter((object) => object.name === name));
    };
    map['windshield-pane'] = [a.parts.windshield];
    map['windshield-frames'] = names('cockpit-windshield-frame-header',
      'cockpit-windshield-frame-post-centre', 'cockpit-windshield-frame-post-port',
      'cockpit-windshield-frame-post-starboard');
    map['side-window-panes'] = names('cockpit-side-window-port', 'cockpit-side-window-starboard');
    map['roof-annuli'] = names('fuselage-roof-astrodome-annulus', 'fuselage-roof-dorsal-annulus');
    map['waist-annuli'] = names('fuselage-waist-annulus-port', 'fuselage-waist-annulus-starboard');
    map['instrument-panel-shell'] = [a.parts.instrumentPanel];
    map['instrument-face'] = [a.parts.instrumentFace];
    map['panel-supports'] = names('cockpit-instrument-panel-support-port',
      'cockpit-instrument-panel-support-starboard');
    map['throttle-quadrant'] = [a.parts.throttleQuadrant];
    map['quadrant-supports'] = names('cockpit-throttle-quadrant-support-port',
      'cockpit-throttle-quadrant-support-starboard');
    map['throttle-levers'] = a.parts.throttleLevers ?? [];
    map['pilot-yoke'] = [a.parts.controlYokes?.[0]?.assembly];
    map['copilot-yoke'] = [a.parts.controlYokes?.[1]?.assembly];
    map['rudder-pedals'] = names('copilot-rudder-pedal-left', 'copilot-rudder-pedal-left-mount',
      'copilot-rudder-pedal-right', 'copilot-rudder-pedal-right-mount',
      'pilot-rudder-pedal-left', 'pilot-rudder-pedal-left-mount',
      'pilot-rudder-pedal-right', 'pilot-rudder-pedal-right-mount');
    map['sasole-body'] = crewNamed(h.crew?.sasole, 'captain_lou_sasole-head', 'captain_lou_sasole-torso');
    map['sasole-boots'] = crewNamed(h.crew?.sasole, 'captain_lou_sasole-leg-left-boot',
      'captain_lou_sasole-leg-right-boot');
    map['sasole-seat'] = (a.anchors.seats?.copilot?.children ?? [])
      .filter((object) => object !== h.crew?.sasole?.group && object.material && object.geometry);
    map['irish-body'] = crewNamed(h.crew?.irish, 'irish-head', 'irish-torso');
    map['irish-boots'] = crewNamed(h.crew?.irish, 'irish-leg-left-boot', 'irish-leg-right-boot');
    map['nav-table'] = [one('nav-table')];
    map['seat-pans'] = names('cockpit-seat-pan');
    map['crew-door-leaf'] = [a.parts.crewDoor];
    map['crew-door-frame'] = names('crew-door-frame-aft-jamb', 'crew-door-frame-forward-jamb',
      'crew-door-frame-header');
    map['crew-threshold'] = [one('crew-door-frame-sill')];
    map['boarding-ladder'] = [a.parts.ladder];
    map['side-shell-panel'] = [one('fuselage-skin-starboard-20')];
    map['belly-shell'] = names('fuselage-belly-aft', 'fuselage-belly-forward');
    map['bomb-bay-edges'] = names('fuselage-bomb-bay-port-edge', 'fuselage-bomb-bay-starboard-edge');
    map['bomb-bay-leaves'] = a.parts.bombBayDoors ?? [];
    map['bombardier-pane'] = [one('bombardier-glazing')];
    map['nose-glazing-frame'] = names('nose-glazing-collar', 'nose-glazing-rib');
    map['rear-gun-trunnions'] = names('rear-gun-left-trunnion', 'rear-gun-right-trunnion');
    map['rear-gun-barrels'] = a.parts.gunBarrels ?? [];
    map['rear-gunner-hands'] = crewNamed(h.crew?.shubes, 'shubes-arm-left-hand', 'shubes-arm-right-hand');
    map['rear-gun-grips'] = names('rear-gun-spade-grip');
    map['rear-gunner-body'] = crewNamed(h.crew?.shubes, 'shubes-torso');
    map['rear-gun-seat'] = [one('rear-gun-seat-pan')];
    map['rear-gun-fairing'] = [one('rear-gun-fairing')];
    map['aft-tail-shell'] = names('fuselage-aft-cap', 'vertical-fin');
    map['rear-turret-pane'] = (a.parts.rearGunTurret?.children ?? [])
      .filter((object) => object.isMesh && object.material?.transparent === true).slice(0, 1);
    map['rear-turret-frames'] = names('rear-gun-frame-equator', 'rear-gun-frame-meridian-left',
      'rear-gun-frame-meridian-right', 'rear-gun-glazing-ring');
    map['gun-tracer'] = [h.gunner?.tracers?.mesh];
    map['pinup-port'] = (a.parts.noseArtPlates ?? []).filter(({ userData }) => userData.noseArtSide === 1);
    map['pinup-starboard'] = (a.parts.noseArtPlates ?? []).filter(({ userData }) => userData.noseArtSide === -1);
    map['name-port'] = (a.parts.noseNamePlates ?? []).filter(({ userData }) => userData.noseArtSide === 1);
    map['name-starboard'] = (a.parts.noseNamePlates ?? []).filter(({ userData }) => userData.noseArtSide === -1);
  }
  return Object.fromEntries(spec.owners.map(({ id }) => [id, (map[id] ?? []).filter(Boolean)]));
}

/**
 * Probe the four named Enola glazing/ring pairs from aircraft-local space.
 * A Box3 cannot describe a ShapeGeometry hole: its filled rectangle reports
 * zero distance for any pane placed somewhere inside it.  These rays instead
 * require the exact pane at the centre and complete visible surface coverage
 * by that pane, its exact annulus, or the production fuselage around it.
 */
export function measureCockpitAnnulusSurfaceFit(THREE, aircraft, gridSize = 15) {
  if (!THREE?.Raycaster || !aircraft?.group?.isObject3D) {
    throw new Error('annulus surface proof requires Three and the real aircraft group');
  }
  if (!Number.isInteger(gridSize) || gridSize < 5 || gridSize % 2 !== 1) {
    throw new Error('annulus surface proof requires an odd grid of at least five');
  }
  const definitions = [
    { kind: 'roof', annulus: 'fuselage-roof-astrodome-annulus', pane: 'navigator-astrodome',
      axis: 'y', centreA: 0, centreB: 3.1, extentA: 0.38, extentB: 0.38,
      outside: 3.2, inside: 1.3 },
    { kind: 'roof', annulus: 'fuselage-roof-dorsal-annulus', pane: 'dorsal-turret-glazing',
      axis: 'y', centreA: 0, centreB: -2.75, extentA: 0.7, extentB: 0.75,
      outside: 3.2, inside: 1.3 },
    { kind: 'waist', annulus: 'fuselage-waist-annulus-port', pane: 'waist-blister-port',
      axis: 'x', centreA: -0.2, centreB: -5.4, extentA: 0.6, extentB: 0.65,
      outside: 3, inside: 0 },
    { kind: 'waist', annulus: 'fuselage-waist-annulus-starboard', pane: 'waist-blister-starboard',
      axis: 'x', centreA: -0.2, centreB: -5.4, extentA: 0.6, extentB: 0.65,
      outside: -3, inside: 0 },
  ];
  aircraft.group.updateMatrixWorld(true);
  const effectivelyVisible = (object) => {
    for (let node = object; node; node = node.parent) if (node.visible === false) return false;
    return true;
  };
  const materials = (object) => (Array.isArray(object?.material)
    ? object.material : [object?.material]).filter(Boolean);
  const shown = (object) => effectivelyVisible(object)
    && materials(object).some((material) => material.visible !== false && Number(material.opacity ?? 1) > 0.001);
  const opaque = (object) => materials(object).some((material) => material.visible !== false
    && Number(material.opacity ?? 1) > 0.98);
  const ownedBy = (object, root) => {
    for (let node = object; node; node = node.parent) if (node === root) return true;
    return false;
  };
  const localToWorld = (value) => aircraft.group.localToWorld(value);
  const results = definitions.map((definition) => {
    const annulus = aircraft.group.getObjectByName(definition.annulus);
    const pane = aircraft.group.getObjectByName(definition.pane);
    const result = {
      kind: definition.kind,
      annulusName: definition.annulus,
      paneName: definition.pane,
      exactAnnulus: Boolean(annulus?.isMesh),
      exactPane: Boolean(pane?.isMesh),
      transparentPane: Boolean(pane?.isMesh && materials(pane).length > 0
        && materials(pane).every((material) => material.transparent === true
          && Number(material.opacity ?? 1) >= 0.05 && Number(material.opacity ?? 1) <= 0.65)),
      sampleCount: 0,
      coveredSampleCount: 0,
      nakedSampleCount: 0,
      paneSampleCount: 0,
      annulusSampleCount: 0,
      shellSampleCount: 0,
      centreExactPaneHit: false,
    };
    if (!annulus?.isMesh || !pane?.isMesh) return result;
    for (let ai = 0; ai < gridSize; ai += 1) {
      for (let bi = 0; bi < gridSize; bi += 1) {
        const a = -definition.extentA + (2 * definition.extentA * ai) / (gridSize - 1);
        const b = -definition.extentB + (2 * definition.extentB * bi) / (gridSize - 1);
        const originLocal = definition.axis === 'y'
          ? new THREE.Vector3(definition.centreA + a, definition.outside, definition.centreB + b)
          : new THREE.Vector3(definition.outside, definition.centreA + a, definition.centreB + b);
        const insideLocal = definition.axis === 'y'
          ? new THREE.Vector3(definition.centreA + a, definition.inside, definition.centreB + b)
          : new THREE.Vector3(definition.inside, definition.centreA + a, definition.centreB + b);
        const origin = localToWorld(originLocal);
        const inside = localToWorld(insideLocal);
        const direction = inside.clone().sub(origin);
        const distance = direction.length();
        const hits = new THREE.Raycaster(origin, direction.normalize(), 0, distance)
          .intersectObject(aircraft.group, true).filter((hit) => shown(hit.object));
        /* Classify the first relevant rendered surface, never any later hit.
         * A valid pane buried behind an opaque skin is a blocked aperture, not
         * pane coverage. Transparent unrelated surfaces are allowed ahead of
         * the audited opening, while any opaque occluder stops the ray. */
        const first = hits.find((hit) => hit.object === pane || ownedBy(hit.object, pane)
          || hit.object === annulus || ownedBy(hit.object, annulus) || opaque(hit.object));
        const paneHit = Boolean(first
          && (first.object === pane || ownedBy(first.object, pane)));
        const annulusHit = Boolean(first
          && (first.object === annulus || ownedBy(first.object, annulus)));
        /* Any first opaque draw closes the sampled surface. It does not earn
         * pane credit, so an opaque cover across the aperture still fails the
         * centre-pane and minimum-pane-coverage gates. */
        const shellHit = Boolean(first && opaque(first.object));
        const covered = paneHit || annulusHit || shellHit;
        result.sampleCount += 1;
        result.paneSampleCount += Number(paneHit);
        result.annulusSampleCount += Number(annulusHit);
        result.shellSampleCount += Number(shellHit);
        result.coveredSampleCount += Number(covered);
        result.nakedSampleCount += Number(!covered);
        if (ai === (gridSize - 1) / 2 && bi === (gridSize - 1) / 2) {
          result.centreExactPaneHit = paneHit;
        }
      }
    }
    return result;
  });
  return Object.freeze(results.map((result) => Object.freeze(result)));
}

/** Exact authored base-to-column contacts for both production yokes. */
export function measureCockpitYokeJoins(THREE, scene, aircraft) {
  const definitions = scene === 'beefrun'
    ? (aircraft.parts?.yoke ?? []).map((assembly, index) => ({
      id: index ? 'pilot' : 'copilot', assembly,
      base: assembly.children[0], column: assembly.children[1],
    }))
    : (aircraft.parts?.controlYokes ?? []).map(({ assembly }, index) => ({
      id: index ? 'copilot' : 'pilot', assembly,
      base: assembly.getObjectByName('control-yoke-base'),
      column: assembly.getObjectByName('control-yoke-column'),
    }));
  aircraft.group.updateMatrixWorld(true);
  const box = (object) => {
    if (!object?.isObject3D) return null;
    const bounds = new THREE.Box3().setFromObject(object);
    return bounds.isEmpty() || ![bounds.min.x, bounds.min.y, bounds.min.z,
      bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite) ? null : bounds;
  };
  const gap = (left, right) => {
    const a = box(left);
    const b = box(right);
    if (!a || !b) return Number.POSITIVE_INFINITY;
    return Math.hypot(
      Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x),
      Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y),
      Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z),
    );
  };
  return Object.freeze(definitions.map(({ id, assembly, base, column }) => Object.freeze({
    id,
    assemblyUuid: assembly?.uuid ?? null,
    baseUuid: base?.uuid ?? null,
    columnUuid: column?.uuid ?? null,
    gapM: gap(base, column),
  })));
}

/**
 * Conservative oriented-box separation for the real door leaf against the
 * authored fuselage shell throughout its production hinge sweep.  Frame and
 * jamb pieces are deliberately excluded: those are the intended aperture
 * seam, while this proof answers the distinct leaf-vs-shell claim.
 */
export function measureCockpitDoorShellSweep(THREE, scene, aircraft, sampleCount = 257) {
  if (!Number.isInteger(sampleCount) || sampleCount < 3) {
    throw new Error('door shell sweep requires at least three samples');
  }
  const pivot = scene === 'beefrun' ? aircraft.parts?.cargoDoor : aircraft.parts?.crewDoorHinge;
  const leaf = scene === 'beefrun'
    ? pivot?.getObjectByName('cargo-door-leaf') : aircraft.parts?.crewDoor;
  const shellRoots = scene === 'beefrun'
    ? [aircraft.parts?.sideShell, aircraft.parts?.hull]
    : [aircraft.parts?.fuselageShell];
  if (!pivot || !leaf?.isMesh || shellRoots.some((root) => !root?.isObject3D)) return Object.freeze({
    sampleCount, shellMeshCount: 0, currentIntrusionCount: 1, sweptIntrusionCount: 1,
    maximumPenetrationM: Number.POSITIVE_INFINITY,
  });
  const shellMeshes = [];
  for (const shellRoot of shellRoots) shellRoot.traverse((object) => {
    if (object.isMesh && !/(?:cargo|crew)-door|jamb|frame|threshold|ladder/i.test(object.name ?? '')) {
      shellMeshes.push(object);
    }
  });
  const corners = (object) => {
    object.geometry?.computeBoundingBox?.();
    const bounds = object.geometry?.boundingBox;
    if (!bounds || bounds.isEmpty()) return [];
    const result = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          result.push(new THREE.Vector3(x, y, z).applyMatrix4(object.matrixWorld));
        }
      }
    }
    return result;
  };
  const axes = (object) => {
    const elements = object.matrixWorld.elements;
    return [[0, 1, 2], [4, 5, 6], [8, 9, 10]].map(([x, y, z]) => (
      new THREE.Vector3(elements[x], elements[y], elements[z]).normalize()
    ));
  };
  const penetration = (left, right) => {
    const leftCorners = corners(left);
    const rightCorners = corners(right);
    if (leftCorners.length !== 8 || rightCorners.length !== 8) return 0;
    const leftAxes = axes(left);
    const rightAxes = axes(right);
    const candidates = [...leftAxes, ...rightAxes];
    for (const a of leftAxes) for (const b of rightAxes) {
      const cross = new THREE.Vector3().crossVectors(a, b);
      if (cross.lengthSq() > 1e-12) candidates.push(cross.normalize());
    }
    let minimum = Number.POSITIVE_INFINITY;
    for (const axis of candidates) {
      const lp = leftCorners.map((point) => point.dot(axis));
      const rp = rightCorners.map((point) => point.dot(axis));
      const leftMinimum = Math.min(...lp);
      const leftMaximum = Math.max(...lp);
      const rightMinimum = Math.min(...rp);
      const rightMaximum = Math.max(...rp);
      /* Authored skins are commonly PlaneGeometry. On the skin normal their
       * interval has zero width, so ordinary volume SAT calls every crossing
       * zero overlap. Measure how deeply that exact rendered plane straddles
       * the leaf instead; mere seam contact remains zero. */
      const overlap = rightMaximum - rightMinimum <= 1e-8
        ? Math.min(leftMaximum - rightMinimum, rightMinimum - leftMinimum)
        : Math.min(leftMaximum, rightMaximum) - Math.max(leftMinimum, rightMinimum);
      if (overlap <= 1e-6) return 0;
      minimum = Math.min(minimum, overlap);
    }
    return minimum;
  };
  const original = scene === 'beefrun' ? pivot.rotation.z : pivot.rotation.y;
  const currentIndex = Math.round(Math.min(1, Math.abs(original) / (Math.PI / 2))
    * (sampleCount - 1));
  let currentIntrusionCount = 0;
  let sweptIntrusionCount = 0;
  let maximumPenetrationM = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const rotation = -(sample / (sampleCount - 1)) * (Math.PI / 2);
    if (scene === 'beefrun') pivot.rotation.z = rotation;
    else pivot.rotation.y = rotation;
    aircraft.group.updateMatrixWorld(true);
    let sampleIntrusions = 0;
    for (const shell of shellMeshes) {
      const depth = penetration(leaf, shell);
      if (depth > 1e-5) sampleIntrusions += 1;
      maximumPenetrationM = Math.max(maximumPenetrationM, depth);
    }
    sweptIntrusionCount += sampleIntrusions;
    if (sample === currentIndex) currentIntrusionCount = sampleIntrusions;
  }
  if (scene === 'beefrun') pivot.rotation.z = original;
  else pivot.rotation.y = original;
  aircraft.group.updateMatrixWorld(true);
  return Object.freeze({
    sampleCount,
    shellMeshCount: shellMeshes.length,
    currentIntrusionCount,
    sweptIntrusionCount,
    maximumPenetrationM,
  });
}

/* Serialized into the live page by capture-cockpit-visual-evidence.mjs. It
 * may move the public runtime camera and controls, and may temporarily swap
 * materials for an ID render. It never constructs a scene, camera, mesh, or
 * substitute geometry. */
export async function installCockpitVisualEvidencePageApi(
  resolveRuntime, drawPolicy, resolveOwners, measureAnnulusSurfaceFit, rootPalette,
  measureYokeJoins, measureDoorShellSweep,
) {
  if (typeof drawPolicy !== 'function') throw new Error('cockpit draw policy is unavailable');
  if (typeof resolveOwners !== 'function') throw new Error('cockpit owner resolver is unavailable');
  if (typeof measureAnnulusSurfaceFit !== 'function') {
    throw new Error('cockpit annulus surface proof is unavailable');
  }
  if (typeof rootPalette !== 'function') throw new Error('cockpit root palette is unavailable');
  if (typeof measureYokeJoins !== 'function') throw new Error('cockpit yoke join proof is unavailable');
  if (typeof measureDoorShellSweep !== 'function') throw new Error('cockpit door shell proof is unavailable');
  const THREE = await import('three');
  let active = null;
  let renderSerial = 0;

  const round = (value, digits = 6) => (
    Number.isFinite(value) ? Number(value.toFixed(digits)) : null
  );
  const stableValue = (value) => {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
    }
    return value;
  };
  const matrix = (value) => value?.elements?.map((entry) => round(entry, 8)) ?? null;
  const vector = (value) => value?.toArray?.().map((entry) => round(entry, 8)) ?? null;
  const materialState = (material) => material ? {
    uuid: material.uuid,
    type: material.type,
    version: material.version,
    visible: material.visible !== false,
    transparent: material.transparent === true,
    opacity: round(material.opacity ?? 1, 8),
    alphaTest: round(material.alphaTest ?? 0, 8),
    side: material.side,
    blending: material.blending,
    colorWrite: material.colorWrite !== false,
    depthTest: material.depthTest !== false,
    depthWrite: material.depthWrite !== false,
    depthFunc: material.depthFunc,
    polygonOffset: material.polygonOffset === true,
    polygonOffsetFactor: round(material.polygonOffsetFactor ?? 0, 8),
    polygonOffsetUnits: round(material.polygonOffsetUnits ?? 0, 8),
    color: material.color?.getHexString?.() ?? null,
    emissive: material.emissive?.getHexString?.() ?? null,
    mapUuid: material.map?.uuid ?? null,
    mapVersion: material.map?.version ?? null,
    alphaMapUuid: material.alphaMap?.uuid ?? null,
    alphaMapVersion: material.alphaMap?.version ?? null,
  } : null;

  function renderStatePayload(runtime) {
    runtime.scene.updateMatrixWorld(true);
    runtime.camera.updateMatrixWorld(true);
    runtime.camera.updateProjectionMatrix();
    const draws = [];
    runtime.scene.traverse((object) => {
      if (!(object.isMesh || object.isSprite || object.isPoints || object.isLine)
          || !object.geometry || !object.material) return;
      const geometry = object.geometry;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      draws.push({
        uuid: object.uuid,
        parentUuid: object.parent?.uuid ?? null,
        type: object.type,
        name: object.name || '',
        visible: object.visible !== false,
        layers: object.layers?.mask ?? null,
        renderOrder: object.renderOrder,
        frustumCulled: object.frustumCulled !== false,
        castShadow: object.castShadow === true,
        receiveShadow: object.receiveShadow === true,
        matrixWorld: matrix(object.matrixWorld),
        geometry: {
          uuid: geometry.uuid,
          version: geometry.version ?? 0,
          indexCount: geometry.index?.count ?? null,
          positionCount: geometry.attributes?.position?.count ?? null,
          positionVersion: geometry.attributes?.position?.version ?? null,
          normalVersion: geometry.attributes?.normal?.version ?? null,
          drawRange: [geometry.drawRange?.start ?? 0, geometry.drawRange?.count ?? null],
          groups: (geometry.groups ?? []).map(({ start, count, materialIndex }) => (
            [start, count, materialIndex ?? 0]
          )),
        },
        materials: materials.map(materialState),
        instanceCount: object.isInstancedMesh ? object.count : null,
        instanceMatrixVersion: object.instanceMatrix?.version ?? null,
        morphInfluences: object.morphTargetInfluences?.map((value) => round(value, 8)) ?? null,
      });
    });
    draws.sort((left, right) => left.uuid.localeCompare(right.uuid));
    const renderer = runtime.renderer;
    const clearColor = renderer.getClearColor(new THREE.Color());
    const canvas = renderer.domElement;
    const canvasStyle = canvas ? getComputedStyle(canvas) : null;
    const combatHud = document.getElementById('enola-combat');
    const reticle = combatHud?.children?.[0] ?? null;
    const hudStyle = combatHud ? getComputedStyle(combatHud) : null;
    const reticleStyle = reticle ? getComputedStyle(reticle) : null;
    const reticleBox = reticle?.getBoundingClientRect?.();
    const postfx = runtime.handle.postfx;
    return {
      scheduler: window.__cockpitEvidenceScheduler?.snapshot?.() ?? null,
      scene: {
        uuid: runtime.scene.uuid,
        background: runtime.scene.background?.isColor
          ? runtime.scene.background.getHexString() : runtime.scene.background?.uuid ?? null,
        environmentUuid: runtime.scene.environment?.uuid ?? null,
        fog: runtime.scene.fog ? {
          type: runtime.scene.fog.constructor?.name,
          color: runtime.scene.fog.color?.getHexString?.() ?? null,
          near: round(runtime.scene.fog.near, 8),
          far: round(runtime.scene.fog.far, 8),
          density: round(runtime.scene.fog.density, 8),
        } : null,
        overrideMaterial: materialState(runtime.scene.overrideMaterial),
      },
      camera: {
        uuid: runtime.camera.uuid,
        type: runtime.camera.type,
        matrixWorld: matrix(runtime.camera.matrixWorld),
        matrixWorldInverse: matrix(runtime.camera.matrixWorldInverse),
        projectionMatrix: matrix(runtime.camera.projectionMatrix),
        projectionMatrixInverse: matrix(runtime.camera.projectionMatrixInverse),
        near: round(runtime.camera.near, 8),
        far: round(runtime.camera.far, 8),
        fov: round(runtime.camera.fov, 8),
        aspect: round(runtime.camera.aspect, 8),
        zoom: round(runtime.camera.zoom, 8),
      },
      renderer: {
        clearColor: clearColor.getHexString(),
        clearAlpha: round(renderer.getClearAlpha(), 8),
        toneMapping: renderer.toneMapping,
        toneMappingExposure: round(renderer.toneMappingExposure, 8),
        outputColorSpace: renderer.outputColorSpace,
        sortObjects: renderer.sortObjects,
        autoClear: renderer.autoClear,
        shadowEnabled: renderer.shadowMap?.enabled === true,
        shadowType: renderer.shadowMap?.type ?? null,
        pixelRatio: round(renderer.getPixelRatio(), 8),
        size: vector(renderer.getSize(new THREE.Vector2())),
        renderTargetUuid: renderer.getRenderTarget?.()?.texture?.uuid ?? null,
      },
      postfx: postfx ? {
        enabled: postfx.enabled === true,
        composerPresent: Boolean(postfx.composer),
        composerPixelRatio: round(postfx.composer?._pixelRatio, 8),
        bloomPresent: Boolean(postfx.bloom),
        bloomThreshold: round(postfx.bloom?.threshold, 8),
        bloomStrength: round(postfx.bloom?.strength, 8),
        bloomRadius: round(postfx.bloom?.radius, 8),
      } : null,
      canvas: canvas ? {
        width: canvas.width,
        height: canvas.height,
        connected: canvas.isConnected === true,
        display: canvasStyle?.display ?? null,
        visibility: canvasStyle?.visibility ?? null,
        filter: canvasStyle?.filter ?? null,
      } : null,
      hud: {
        combatDisplay: hudStyle?.display ?? null,
        combatVisibility: hudStyle?.visibility ?? null,
        reticleDisplay: reticleStyle?.display ?? null,
        reticleVisibility: reticleStyle?.visibility ?? null,
        reticleBox: reticleBox ? [reticleBox.left, reticleBox.top, reticleBox.width, reticleBox.height]
          .map((value) => round(value, 4)) : null,
      },
      draws,
    };
  }

  async function renderStateFingerprint(runtime) {
    const source = new TextEncoder().encode(JSON.stringify(stableValue(renderStatePayload(runtime))));
    const digest = await crypto.subtle.digest('SHA-256', source);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  const visible = (object) => {
    for (let current = object; current; current = current.parent) {
      if (current.visible === false) return false;
    }
    return true;
  };
  const descendants = (root, predicate = () => true) => {
    const found = [];
    root?.traverse?.((object) => { if (predicate(object)) found.push(object); });
    return found;
  };
  const meshDescendants = (root) => descendants(root, (object) => object.isMesh && object.geometry);
  const renderableDescendants = (root, selection = 'subtree') => {
    const isRenderable = (object) => Boolean(object?.geometry && object?.material
      && (object.isMesh || object.isSprite || object.isPoints || object.isLine));
    if (selection === 'root-only') return isRenderable(root) ? [root] : [];
    if (selection !== 'subtree') throw new Error(`unsupported cockpit owner selection: ${selection}`);
    return descendants(root, isRenderable);
  };
  const named = (root, matcher) => descendants(root, (object) => (
    typeof matcher === 'string' ? object.name === matcher : matcher.test(object.name ?? '')
  ));
  const finiteBox = (root) => {
    if (!root) return null;
    root.updateWorldMatrix?.(true, true);
    const box = new THREE.Box3().setFromObject(root);
    return Number.isFinite(box.min.x) && Number.isFinite(box.max.x) ? box : null;
  };
  const unionBox = (roots) => {
    const box = new THREE.Box3();
    let count = 0;
    for (const root of roots.filter(Boolean)) {
      const candidate = finiteBox(root);
      if (!candidate) continue;
      box.union(candidate);
      count += 1;
    }
    return count ? box : null;
  };
  const pointBoxDistance = (point, box) => {
    if (!box) return Number.POSITIVE_INFINITY;
    const dx = Math.max(box.min.x - point.x, 0, point.x - box.max.x);
    const dy = Math.max(box.min.y - point.y, 0, point.y - box.max.y);
    const dz = Math.max(box.min.z - point.z, 0, point.z - box.max.z);
    return Math.hypot(dx, dy, dz);
  };
  const boxDistance = (left, right) => {
    if (!left || !right) return Number.POSITIVE_INFINITY;
    const dx = Math.max(right.min.x - left.max.x, left.min.x - right.max.x, 0);
    const dy = Math.max(right.min.y - left.max.y, left.min.y - right.max.y, 0);
    const dz = Math.max(right.min.z - left.max.z, left.min.z - right.max.z, 0);
    return Math.hypot(dx, dy, dz);
  };
  const overlapVolume = (left, right) => {
    if (!left || !right) return 0;
    const x = Math.max(0, Math.min(left.max.x, right.max.x) - Math.max(left.min.x, right.min.x));
    const y = Math.max(0, Math.min(left.max.y, right.max.y) - Math.max(left.min.y, right.min.y));
    const z = Math.max(0, Math.min(left.max.z, right.max.z) - Math.max(left.min.z, right.min.z));
    return x * y * z;
  };
  const belongsTo = (object, ancestor) => {
    for (let current = object; current; current = current.parent) if (current === ancestor) return true;
    return false;
  };
  const geometryParameter = (object, key, fallback = 0) => {
    const value = object?.geometry?.parameters?.[key];
    return Number.isFinite(value) ? value : fallback;
  };
  const objectSize = (object) => {
    const box = finiteBox(object);
    const size = new THREE.Vector3();
    box?.getSize(size);
    return { box, size };
  };

  function ownerRoots(runtime, spec) {
    return resolveOwners(runtime, spec);
  }

  function publicPostfxReceipt(postfx) {
    const passes = Array.isArray(postfx?.composer?.passes) ? postfx.composer.passes : [];
    const bloom = postfx?.bloom ?? null;
    const receipt = {
      renderMethodPresent: typeof postfx?.render === 'function',
      enabled: postfx?.enabled === true,
      composerPresent: Boolean(postfx?.composer),
      bloomPresent: Boolean(bloom),
      bloomPassAttached: Boolean(bloom && passes.includes(bloom)),
      bloomEnabled: Boolean(bloom && bloom.enabled !== false),
      bloomType: bloom?.constructor?.name ?? null,
      bloomThreshold: round(bloom?.threshold, 8),
      bloomStrength: round(bloom?.strength, 8),
      bloomRadius: round(bloom?.radius, 8),
    };
    receipt.ready = receipt.renderMethodPresent && receipt.enabled && receipt.composerPresent
      && receipt.bloomPresent && receipt.bloomPassAttached && receipt.bloomEnabled;
    return Object.freeze(receipt);
  }

  async function render(runtime, mode = 'normal') {
    runtime.scene.updateMatrixWorld(true);
    runtime.camera.updateMatrixWorld(true);
    runtime.camera.updateProjectionMatrix();
    const preFingerprint = await renderStateFingerprint(runtime);
    let path = 'raw-webgl';
    let postfx = null;
    if (mode === 'normal' && active?.spec?.scene === 'enola') {
      if (typeof runtime.handle.postfx?.render !== 'function') {
        throw new Error('Enola public post-processing renderer is unavailable');
      }
      postfx = publicPostfxReceipt(runtime.handle.postfx);
      runtime.handle.postfx.render();
      path = postfx.ready ? 'public-postfx' : 'public-postfx-raw-fallback';
    } else {
      runtime.renderer.render(runtime.scene, runtime.camera);
    }
    const postFingerprint = await renderStateFingerprint(runtime);
    renderSerial += 1;
    return Object.freeze({
      serial: renderSerial,
      mode,
      path,
      postfx,
      preFingerprint,
      postFingerprint,
      scheduler: window.__cockpitEvidenceScheduler?.snapshot?.() ?? null,
    });
  }

  function frameObjects(runtime, roots, localOffset, { fov = 54, minimum = 1.2, maximum = 8 } = {}) {
    const box = unionBox(roots);
    if (!box) throw new Error('cannot frame missing cockpit evidence objects');
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(0.35, size.length() / 2);
    const distance = Math.min(maximum, Math.max(minimum, radius * 2.2));
    const direction = new THREE.Vector3(...localOffset).normalize();
    const aircraftRotation = runtime.aircraft.group.getWorldQuaternion(new THREE.Quaternion());
    direction.applyQuaternion(aircraftRotation);
    runtime.camera.position.copy(centre).addScaledVector(direction, distance);
    runtime.camera.up.set(0, 1, 0).applyQuaternion(aircraftRotation);
    runtime.camera.lookAt(centre);
    runtime.camera.fov = fov;
    runtime.camera.updateProjectionMatrix();
  }

  function prepareBeef(runtime, spec) {
    const h = runtime.handle;
    const needsWalk = spec.pose.traversal === 'crouched-ramp-sill';
    if (!needsWalk && h.mission?.flags?.inCockpit !== true) {
      const restored = h.mission?.restoreCheckpoint?.('takeoff');
      if (restored !== true || h.mission?.flags?.inCockpit !== true) {
        throw new Error('Beef Run public mission handle could not enter its real cockpit');
      }
    }
    const controls = h.physics.controls;
    const extreme = spec.pose.controls === 'full-extreme';
    controls.pitch = extreme ? 1 : 0;
    controls.roll = extreme ? 1 : 0;
    controls.yaw = extreme ? 1 : 0;
    controls.throttleL = extreme ? 1 : 0;
    controls.throttleR = extreme ? 1 : 0;
    controls.flaps = extreme ? 1 : 0;
    h.aircraft.syncTo(h.physics);
    if (spec.pose.cargoDoor === 'open') {
      const opened = h.mission?.activeLoad?.setDoor?.(true);
      if (opened !== true) throw new Error('Beef Run active cargo load could not open its real door');
    } else if (spec.pose.cargoDoor === 'closed') {
      const closed = h.mission?.activeLoad?.setDoor?.(false);
      if (closed !== true) throw new Error('Beef Run active cargo load could not close its real door');
    }
    for (let frame = 0; frame < 360; frame += 1) {
      h.aircraft.update(1 / 60, h.physics, h.engines, {
        cargoDoorOpen: spec.pose.cargoDoor === 'open',
        dusk: h.weather?.dusk ?? 0,
        warnings: {},
      });
    }
    h.cameras.view = 'cockpit';
    h.cameras.shake = 0;
    h.cameras.fovPunch = 0;
    h.cameras._bob = 0;
    h.cameras.lookYaw = spec.pose.view === 'pilot-port' ? 1.18
      : spec.pose.view === 'pilot-starboard-down' ? -1.08 : 0;
    h.cameras.lookPitch = spec.pose.view === 'pilot-starboard-down' ? -0.32
      : spec.pose.view === 'pilot-controls' ? -0.38
        : spec.pose.view === 'pilot-forward' ? -0.12 : 0;
    h.cameras.update(0, h.physics, h.aircraft.group, h.aircraft.pilotEye, {});
    h.mission?.updateLou?.(0);
    if (spec.pose.view === 'exterior-cargo-door') {
      frameObjects(runtime, [h.aircraft.parts.cargoDoor, h.aircraft.parts.cargoThreshold,
        h.aircraft.parts.cargoRamp], [-1, 0.45, -0.7], { fov: 48, minimum: 3, maximum: 7 });
    } else if (spec.pose.view === 'interior-cargo-door') {
      frameObjects(runtime, [h.aircraft.parts.cargoDoor, h.aircraft.parts.cargoThreshold,
        h.aircraft.parts.cargoRamp], [1, 0.3, 0.4], { fov: 55, minimum: 1.4, maximum: 3 });
    } else if (spec.pose.view === 'exterior-cargo-traversal') {
      const player = h.player;
      h.mission.flags.inCockpit = false;
      player.enabled = true;
      player.mode = 'walk';
      player.setKey('KeyC', true);
      player.crouching = true;
      player.eyeHeight = 1.02;
      player.targetEye = 1.02;
      const local = new THREE.Vector3(-3.3, 0, -1.05);
      h.aircraft.group.localToWorld(local);
      player.position.set(local.x, h.aircraft.deckHeightAt(local.x, local.z) + player.eyeHeight, local.z);
      player.velocity.set(0, 0, 0);
      frameObjects(runtime, [h.aircraft.parts.cargoDoor, h.aircraft.parts.cargoThreshold,
        h.aircraft.parts.cargoRamp], [-1, 0.55, -0.8], { fov: 52, minimum: 3, maximum: 6 });
    } else if (spec.pose.view === 'exterior-shell-side') {
      frameObjects(runtime, [h.aircraft.parts.sideShell, h.aircraft.parts.hull,
        h.aircraft.parts.cargoDoor], [-1, 0.15, 0.08], { fov: 48, minimum: 7, maximum: 11 });
    } else if (spec.pose.view === 'exterior-shell-nose-tail') {
      frameObjects(runtime, [h.aircraft.group.getObjectByName('nose-cone'),
        h.aircraft.group.getObjectByName('tail-boom')], [0.9, 0.32, -0.28],
      { fov: 45, minimum: 12, maximum: 18 });
    }
    return Object.freeze({ requestedPhase: spec.pose.phase, publicPhase: h.mission?.phase ?? null });
  }

  async function prepareEnola(runtime, spec) {
    const h = runtime.handle;
    const requestedPhase = spec.pose.phase ?? 'preflight';
    const phase = h.go?.(requestedPhase);
    if (phase !== requestedPhase || h.mission?.phase !== requestedPhase) {
      throw new Error(`Enola public runtime handle could not enter phase ${requestedPhase}`);
    }
    const controls = h.physics.controls;
    const extreme = spec.pose.controls === 'full-extreme';
    controls.pitch = extreme ? 1 : 0;
    controls.roll = extreme ? 1 : 0;
    controls.yaw = extreme ? 1 : 0;
    controls.throttleL = extreme ? 1 : 0;
    controls.throttleR = extreme ? 1 : 0;
    controls.flaps = extreme ? 1 : 0;
    h.aircraft.syncTo(h.physics);
    if (spec.pose.crewDoor === 'open') {
      h.aircraft.setCrewDoorOpen(true);
      h.aircraft.parts.ladder.visible = true;
    } else if (spec.pose.crewDoor === 'closed') {
      h.aircraft.setCrewDoorOpen(false);
      h.aircraft.parts.ladder.visible = false;
    }
    if (spec.pose.bombBay === 'open' && h.mission?.bombBayOpen !== true) {
      throw new Error(`${requestedPhase} did not open the Enola public mission bomb bay`);
    }
    if (spec.pose.bombBay === 'closed' && h.mission?.bombBayOpen !== false) {
      throw new Error(`${requestedPhase} did not close the Enola public mission bomb bay`);
    }
    for (let frame = 0; frame < 360; frame += 1) {
      h.aircraft.update(1 / 60, h.physics, h.engines, {
        bombBayOpen: h.mission?.bombBayOpen === true,
        gunManned: h.gunner?.manned === true,
        gunFiring: h.gunner?.firing === true,
        gunAim: h.gunner?.aimPoint?.(new THREE.Vector3()),
      });
    }
    h.crew?.update?.(0, null);
    if (spec.pose.awaitArt) {
      await h.aircraft.artReady;
      const art = h.aircraft.noseArtPresentation?.();
      if (art?.artReady !== true || art?.realArtworkApplied !== 4) {
        throw new Error('Enola public aircraft artReady settled without four owner artworks');
      }
    }
    const gunner = h.gunner;
    const preparation = {
      requestedPhase,
      publicPhase: h.mission?.phase ?? null,
      gunShotsBefore: gunner?.shots ?? 0,
      tracerFiredBefore: gunner?.tracers?.fired ?? 0,
    };
    if (spec.pose.gun) {
      if (h.physics?.onGround === true) throw new Error('Enola rear-gun proof is not airborne');
      if (!gunner.manned && h.gunToggle?.() !== true) {
        throw new Error('Enola public gunToggle refused the airborne rear-gun proof');
      }
      if (spec.pose.gun === 'left-down-limit') gunner.look(100000, 100000);
      if (spec.pose.gun === 'right-up-limit') gunner.look(-100000, -100000);
      h.aircraft.updateRearGun(4, h.physics, {
        gunFiring: false,
        gunManned: true,
        gunAim: gunner.aimPoint(new THREE.Vector3()),
      });
      if (spec.pose.fireGun) h.fireGun?.(0.05);
      gunner.applyCamera(runtime.camera);
    } else {
      h.cameras.view = 'cockpit';
      h.cameras.shake = 0;
      h.cameras.fovPunch = 0;
      h.cameras._bob = 0;
      h.cameras.lookYaw = spec.pose.view === 'cockpit-side-glazing' ? -1.08 : 0;
      h.cameras.lookPitch = spec.pose.view === 'pilot-controls' ? -0.38 : -0.1;
      h.cameras.update(0, h.physics, h.aircraft.group, h.aircraft.pilotEye, {});
    }
    if (spec.pose.view === 'copilot-seat') {
      frameObjects(runtime, [h.aircraft.anchors.seats.copilot,
        h.aircraft.parts.controlYokes?.[1]?.assembly, h.crew.sasole.group],
      [0.8, 0.35, -1], { fov: 55, minimum: 1.2, maximum: 2.2 });
    } else if (spec.pose.view === 'navigator-table') {
      frameObjects(runtime, [h.aircraft.group.getObjectByName('nav-table'), h.crew.irish.group],
        [0.8, 0.45, -0.8], { fov: 58, minimum: 1.2, maximum: 2.4 });
    } else if (spec.pose.view === 'exterior-crew-door') {
      frameObjects(runtime, [h.aircraft.parts.crewDoorHinge, h.aircraft.parts.crewDoorFrame,
        h.aircraft.parts.ladder], [-1, 0.35, -0.6], { fov: 50, minimum: 4, maximum: 7 });
    } else if (spec.pose.view === 'rear-gun-exterior') {
      const side = spec.pose.gun === 'left-down-limit' ? 0.8 : -0.8;
      frameObjects(runtime, [h.aircraft.parts.rearGunTurret, h.aircraft.parts.rearGunYoke,
        ...(h.aircraft.parts.gunBarrels ?? [])], [side, 0.35, -1],
      { fov: 47, minimum: 3, maximum: 6 });
    } else if (spec.pose.view === 'exterior-dome-waist') {
      frameObjects(runtime, [h.aircraft.group.getObjectByName('navigator-astrodome'),
        h.aircraft.parts.dorsalTurret, h.aircraft.group.getObjectByName('waist-blister-port'),
        h.aircraft.group.getObjectByName('waist-blister-starboard')],
      [0.9, 0.7, -0.6], { fov: 46, minimum: 8, maximum: 12 });
    } else if (spec.pose.view === 'exterior-shell-side') {
      frameObjects(runtime, [h.aircraft.group.getObjectByName('fuselage-skin-starboard-20'),
        ...named(h.aircraft.group, /^fuselage-waist-annulus-/)],
      [-1, 0.05, 0], { fov: 45, minimum: 8, maximum: 12 });
    } else if (spec.pose.view === 'exterior-belly') {
      frameObjects(runtime, [h.aircraft.group.getObjectByName('fuselage-belly-aft'),
        h.aircraft.group.getObjectByName('fuselage-belly-forward'),
        ...named(h.aircraft.group, /^fuselage-bomb-bay-(?:port|starboard)-edge$/)],
      [0.2, -1, -0.2], { fov: 47, minimum: 6, maximum: 10 });
    } else if (spec.pose.view === 'exterior-bomb-bay') {
      frameObjects(runtime, [...(h.aircraft.parts.bombBayDoors ?? []),
        ...named(h.aircraft.group, /^fuselage-bomb-bay-(?:port|starboard)-edge$/)],
      [0.25, -1, -0.35], { fov: 48, minimum: 4, maximum: 7 });
    } else if (spec.pose.view === 'exterior-bombardier-nose') {
      frameObjects(runtime, [h.aircraft.group.getObjectByName('bombardier-glazing'),
        h.aircraft.group.getObjectByName('nose-glazing-collar'),
        ...named(h.aircraft.group, 'nose-glazing-rib')],
      [0.7, 0.15, 1], { fov: 48, minimum: 4, maximum: 7 });
    } else if (spec.pose.view === 'exterior-nose-art-port') {
      frameObjects(runtime, [...(h.aircraft.parts.noseArtPlates ?? []),
        ...(h.aircraft.parts.noseNamePlates ?? [])].filter(({ userData }) => userData.noseArtSide === 1),
      [1, 0.05, 0], { fov: 43, minimum: 3, maximum: 5 });
    } else if (spec.pose.view === 'exterior-nose-art-starboard') {
      frameObjects(runtime, [...(h.aircraft.parts.noseArtPlates ?? []),
        ...(h.aircraft.parts.noseNamePlates ?? [])].filter(({ userData }) => userData.noseArtSide === -1),
      [-1, 0.05, 0], { fov: 43, minimum: 3, maximum: 5 });
    }
    return Object.freeze(preparation);
  }

  function supportLedger(runtime) {
    const a = runtime.aircraft;
    const root = a.group;
    const definitions = [];
    if (active.spec.scene === 'beefrun') {
      for (const member of named(root, /^cockpit-footwell-leg-/)) {
        definitions.push({
          category: 'footwell', member,
          endpointA: a.parts.cargoFloor, endpointB: a.parts.cockpitFootwell,
        });
      }
    } else {
      const floor = root.getObjectByName('cabin-floor');
      for (const member of named(root, /^cockpit-instrument-panel-support-/)) {
        definitions.push({ category: 'panel', member, endpointA: floor, endpointB: a.parts.instrumentPanel });
      }
      for (const member of named(root, /^cockpit-throttle-quadrant-support-/)) {
        definitions.push({ category: 'quadrant', member, endpointA: floor, endpointB: a.parts.throttleQuadrant });
      }
    }
    const records = definitions.map(({ category, member, endpointA, endpointB }) => {
      const box = finiteBox(member);
      const gapA = boxDistance(box, finiteBox(endpointA));
      const gapB = boxDistance(box, finiteBox(endpointB));
      const maximumEndpointGapM = Math.max(gapA, gapB);
      return {
        category,
        id: member.name,
        uuid: member.uuid,
        endpointA: endpointA?.name || endpointA?.uuid || null,
        endpointB: endpointB?.name || endpointB?.uuid || null,
        endpointAGapM: round(gapA),
        endpointBGapM: round(gapB),
        attached: belongsTo(member, root) && Number.isFinite(maximumEndpointGapM)
          && maximumEndpointGapM <= 0.03,
        finiteWorldBounds: !!box,
        gapM: round(maximumEndpointGapM),
      };
    });
    return { members: records, unsupported: records.filter((entry) => !entry.attached).map(({ id }) => id) };
  }

  function beefTraversalLedger(runtime) {
    if (active.spec.pose.traversal !== 'crouched-ramp-sill') return null;
    const h = runtime.handle;
    const player = h.player;
    const aircraft = h.aircraft;
    const toLocal = () => aircraft.group.worldToLocal(player.position.clone());
    const start = toLocal();
    const samples = [];
    let maximumStepM = 0;
    let previous = player.position.clone();
    for (let frame = 0; frame < 220; frame += 1) {
      const local = toLocal();
      const target = aircraft.group.localToWorld(new THREE.Vector3(0.35, local.y, -1.05));
      const dx = target.x - player.position.x;
      const dz = target.z - player.position.z;
      player.yaw = Math.atan2(-dx, -dz);
      player.setKey('KeyW', true);
      player.update(1 / 60);
      const step = Math.hypot(player.position.x - previous.x, player.position.z - previous.z);
      maximumStepM = Math.max(maximumStepM, step);
      previous = player.position.clone();
      const posed = toLocal();
      if (frame % 10 === 0 || posed.x >= 0) {
        samples.push({ frame, local: posed.toArray().map(round), stepM: round(step) });
      }
      if (posed.x >= 0) break;
    }
    player.setKey('KeyW', false);
    const end = toLocal();
    const threshold = aircraft.parts.cargoThreshold;
    const leaf = aircraft.parts.cargoDoor?.getObjectByName('cargo-door-leaf');
    const thresholdBox = finiteBox(threshold);
    const leafBox = finiteBox(leaf);
    const insideGround = aircraft.deckHeightAt(player.position.x, player.position.z);
    return {
      id: 'beef-crouched-ramp-sill',
      startLocal: start.toArray().map(round),
      endLocal: end.toArray().map(round),
      frames: samples.at(-1)?.frame ?? 220,
      maximumHorizontalStepM: round(maximumStepM),
      crouching: player.crouching === true,
      eyeHeightM: round(player.eyeHeight),
      crossedSill: end.x >= 0,
      insideFloorErrorM: round(Math.abs((insideGround ?? Number.POSITIVE_INFINITY)
        - (player.position.y - player.eyeHeight))),
      thresholdHeightM: round(thresholdBox?.max.y - thresholdBox?.min.y),
      doorLeafMinimumYM: round(leafBox?.min.y),
      crouchedHeadMarginYM: round(leafBox?.min.y - (thresholdBox?.max.y ?? 0) - player.eyeHeight),
      samples,
    };
  }

  function beefCollisionLedger(runtime) {
    const matrix = active.spec.pose.collisionMatrix;
    if (!matrix) return null;
    const h = runtime.handle;
    const aircraft = h.aircraft;
    const player = h.player;
    const posePlayer = (local, velocity) => {
      const world = aircraft.group.localToWorld(local.clone());
      player.position.set(world.x, world.y + player.eyeHeight, world.z);
      player.velocity.copy(velocity);
      aircraft.resolveOnDeck(player, 'x', 0.3);
      aircraft.resolveOnDeck(player, 'z', 0.3);
      return aircraft.group.worldToLocal(player.position.clone());
    };
    if (matrix === 'nose-tail') {
      const nose = posePlayer(new THREE.Vector3(0, 0, 5.55), new THREE.Vector3(0, 0, -1));
      const tail = posePlayer(new THREE.Vector3(0, 0, -7.25), new THREE.Vector3(0, 0, 1));
      return {
        id: 'beef-nose-tail',
        noseCapsuleLocalZ: round(nose.z),
        noseMinimumZ: 5.65,
        tailCapsuleLocalZ: round(tail.z),
        tailMaximumZ: -7.35,
      };
    }
    const side = posePlayer(new THREE.Vector3(1.15, 0, 0), new THREE.Vector3(-1, 0, 0));
    player.enabled = true;
    player.mode = 'walk';
    player.eyeHeight = 1.66;
    player.targetEye = 1.66;
    const startLocal = new THREE.Vector3(3, 0, 5.8);
    const startWorld = aircraft.group.localToWorld(startLocal.clone());
    const groundAt = player.world?.groundAt?.(startWorld.x, startWorld.z) ?? 0;
    player.position.set(startWorld.x, groundAt + player.eyeHeight, startWorld.z);
    const groundStart = player.position.y - player.eyeHeight;
    let maximumStepM = 0;
    let previous = player.position.clone();
    let frames = 0;
    for (; frames < 360; frames += 1) {
      const local = aircraft.group.worldToLocal(player.position.clone());
      if (local.z < -3.5) break;
      const target = aircraft.group.localToWorld(new THREE.Vector3(3, local.y, -4));
      player.yaw = Math.atan2(-(target.x - player.position.x), -(target.z - player.position.z));
      player.setKey('KeyW', true);
      player.update(1 / 60);
      maximumStepM = Math.max(maximumStepM,
        Math.hypot(player.position.x - previous.x, player.position.z - previous.z));
      previous = player.position.clone();
    }
    player.setKey('KeyW', false);
    const end = aircraft.group.worldToLocal(player.position.clone());
    return {
      id: 'beef-side-underwing',
      sideCapsuleLocalX: round(Math.abs(side.x)),
      sideMinimumAbsX: 1.23,
      underWingStartLocal: startLocal.toArray().map(round),
      underWingEndLocal: end.toArray().map(round),
      underWingFrames: frames,
      underWingGroundDeltaM: round(Math.abs((player.position.y - player.eyeHeight) - groundStart)),
      maximumHorizontalStepM: round(maximumStepM),
    };
  }

  function enolaCollisionLedger(runtime) {
    const matrix = active.spec.pose.collisionMatrix;
    if (!matrix) return null;
    const h = runtime.handle;
    const aircraft = runtime.aircraft;
    const player = h.player;
    if (!player?.position || !player?.velocity) {
      throw new Error('Enola public player capsule is unavailable for collision proof');
    }
    const saved = {
      position: player.position.clone(), velocity: player.velocity.clone(), eyeHeight: player.eyeHeight,
    };
    const panel = aircraft.group.getObjectByName('fuselage-skin-starboard-20');
    const halfWidth = Math.abs(panel?.position?.x ?? 0);
    const bayCentre = aircraft.anchors.bombBayCenter ?? new THREE.Vector3();
    const localStart = matrix === 'enola-belly'
      ? new THREE.Vector3(0, 0, bayCentre.z)
      : new THREE.Vector3(0, 0, 0);
    player.eyeHeight = 1.66;
    player.position.copy(aircraft.group.localToWorld(localStart.clone()));
    player.velocity.set(matrix === 'enola-belly' ? 0 : -1, 0, matrix === 'enola-belly' ? -1 : 0);
    const resolved = aircraft.resolveWalkaroundPlayer(player, 'x', 0.3, {
      bombBayOpen: false,
      crewDoorOpen: aircraft.crewDoorOpen,
    });
    const localEnd = aircraft.group.worldToLocal(player.position.clone());
    player.position.copy(saved.position);
    player.velocity.copy(saved.velocity);
    player.eyeHeight = saved.eyeHeight;
    const clearance = Math.max(0, Math.abs(localEnd.x) - halfWidth);
    if (matrix === 'enola-belly') {
      return {
        id: 'enola-belly-closed',
        bayClosed: h.mission?.bombBayOpen !== true && aircraft.anim?.bombBay <= 0.01,
        capsuleClearanceM: round(clearance),
        resolvedByPublicAircraft: resolved === true,
        intrusions: resolved === true && clearance >= 0.299 ? [] : ['closed-belly-capsule'],
      };
    }
    return {
      id: 'enola-side',
      capsuleClearanceM: round(clearance),
      resolvedByPublicAircraft: resolved === true,
      intrusions: resolved === true && clearance >= 0.299 ? [] : ['side-shell-capsule'],
    };
  }

  function fixtureClearance(runtime) {
    const h = runtime.handle;
    const a = runtime.aircraft;
    const roots = active.spec.scene === 'beefrun'
      ? [a.parts.cockpitFootwell, a.parts.radioStack, a.parts.engineQuadrant,
        a.parts.cockpit?.getObjectByName('instrument-panel'), ...(a.parts.yoke ?? [])]
      : [a.parts.instrumentPanel, a.parts.throttleQuadrant,
        ...(a.parts.controlYokes ?? []).map(({ assembly }) => assembly),
        ...Object.values(a.anchors.seats ?? {}), a.group.getObjectByName('nav-table'),
        a.parts.rearGunYoke, a.parts.rearGunSeatMount];
    const point = runtime.camera.position;
    const distances = [];
    const intrusions = [];
    for (const root of roots.filter(Boolean)) {
      for (const mesh of meshDescendants(root)) {
        const box = finiteBox(mesh);
        const distance = pointBoxDistance(point, box);
        distances.push(distance);
        if (distance <= 1e-5) intrusions.push(mesh.name || root.name || mesh.uuid);
      }
    }
    void h;
    return {
      nearestFixtureClearanceM: round(Math.min(...distances)),
      intrusions: [...new Set(intrusions)].sort(),
    };
  }

  function apertureDefinitions(runtime, ownerMap) {
    const spec = active.spec;
    const a = runtime.aircraft;
    const get = (name) => a.group.getObjectByName(name);
    if (spec.scene === 'beefrun') {
      if (spec.pose.view === 'pilot-forward') {
        return [{ id: 'windshield', ownerId: 'windshield-pane', expectedPaneCount: 1,
          panes: ownerMap['windshield-pane'] ?? [], frames: ownerMap['windshield-frames'] ?? [] }];
      }
      if (spec.pose.view === 'pilot-port') {
        return [{
          id: 'port', ownerId: 'port-window-pane', expectedPaneCount: 1,
          panes: ownerMap['port-window-pane'] ?? [get('cabin-glass-side-left')],
          frames: [...(ownerMap['port-aperture-shell'] ?? []), ...(ownerMap['port-frame'] ?? [])],
        }];
      }
      if (spec.pose.view === 'pilot-starboard-down') {
        return [{
          id: 'starboard', ownerId: 'starboard-window-pane', expectedPaneCount: 1,
          panes: ownerMap['starboard-window-pane'] ?? [get('cabin-glass-side-right')],
          frames: named(a.group, /^fuselage-side-starboard-(?:lower|header|opening-wall-)/),
        }];
      }
      return [];
    }
    if (spec.pose.view === 'pilot-forward') {
      return [{ id: 'windshield', ownerId: 'windshield-pane', expectedPaneCount: 1,
        panes: ownerMap['windshield-pane'] ?? [], frames: ownerMap['windshield-frames'] ?? [] }];
    }
    if (spec.pose.view === 'cockpit-side-glazing') {
      return [{ id: 'side-panes', ownerId: 'side-window-panes', expectedPaneCount: 2,
        panes: ownerMap['side-window-panes'] ?? [],
        frames: named(a.group, /^cockpit-windshield-frame-post-(?:port|starboard)$/) }];
    }
    if (spec.pose.view === 'exterior-bombardier-nose') {
      return [{ id: 'bombardier', ownerId: 'bombardier-pane', expectedPaneCount: 1,
        panes: ownerMap['bombardier-pane'] ?? [], frames: ownerMap['nose-glazing-frame'] ?? [] }];
    }
    if (spec.pose.view === 'rear-gun') {
      return [{
        id: 'rear-turret', ownerId: 'rear-turret-pane', expectedPaneCount: 1,
        panes: ownerMap['rear-turret-pane'] ?? [],
        frames: ownerMap['rear-turret-frames'] ?? [],
      }];
    }
    return [];
  }

  function intersectionMaterial(hit) {
    const materials = Array.isArray(hit.object?.material) ? hit.object.material : [hit.object?.material];
    return materials[hit.face?.materialIndex ?? 0] ?? materials[0] ?? null;
  }

  function opaqueRayHit(hit) {
    if (!visible(hit.object)) return false;
    const policy = drawPolicy(hit.object);
    const slot = policy.slots[hit.face?.materialIndex ?? 0] ?? policy.slots[0];
    if (!slot?.active) return false;
    const material = intersectionMaterial(hit);
    return material?.visible !== false
      && !(material?.transparent === true && Number(material?.opacity ?? 1) < 0.65);
  }

  function renderedRayHit(hit) {
    if (!visible(hit.object)) return false;
    const policy = drawPolicy(hit.object);
    const slot = policy.slots[hit.face?.materialIndex ?? 0] ?? policy.slots[0];
    return slot?.active === true && intersectionMaterial(hit)?.visible !== false;
  }

  function localPaneSamples(pane) {
    pane.geometry?.computeBoundingBox?.();
    const box = pane.geometry?.boundingBox;
    if (!box) return [];
    const size = box.getSize(new THREE.Vector3());
    const axes = ['x', 'y', 'z'].sort((left, right) => size[right] - size[left]).slice(0, 2);
    const centre = box.getCenter(new THREE.Vector3());
    const points = [];
    for (const u of [-0.42, -0.2, 0, 0.2, 0.42]) {
      for (const v of [-0.42, -0.2, 0, 0.2, 0.42]) {
        const point = centre.clone();
        point[axes[0]] += size[axes[0]] * u;
        point[axes[1]] += size[axes[1]] * v;
        points.push(pane.localToWorld(point));
      }
    }
    return points;
  }

  function paneRayProof(runtime, target, panes) {
    const origin = runtime.camera.getWorldPosition(new THREE.Vector3());
    const direction = target.clone().sub(origin);
    const distance = direction.length();
    if (!(distance > 0.05)) return { paneFirst: false, clearBeyond: false };
    const ray = new THREE.Raycaster(origin, direction.normalize(), 0.02, distance + 1.2);
    const hits = ray.intersectObjects(runtime.scene.children, true).filter(renderedRayHit);
    const first = hits[0];
    const paneFirst = Boolean(first && panes.has(first.object));
    const paneDistance = first?.distance ?? distance;
    /* Only grade the immediate glazing fit. A cockpit ray may legitimately
     * reach a wing, engine, terrain, or another aircraft part metres beyond
     * the pane; an opaque skin directly behind the glass is the defect. */
    const blockedBeyond = hits.some((hit) => hit.distance > paneDistance + 0.01
      && hit.distance <= paneDistance + 0.35
      && !panes.has(hit.object) && opaqueRayHit(hit));
    return { paneFirst, clearBeyond: paneFirst && !blockedBeyond };
  }

  function frameRayHits(runtime, frames) {
    const origin = runtime.camera.getWorldPosition(new THREE.Vector3());
    const roots = frames.filter(Boolean).slice(0, 6);
    let hitCount = 0;
    for (const frame of roots) {
      const box = finiteBox(frame);
      if (!box) continue;
      const target = box.getCenter(new THREE.Vector3());
      const direction = target.clone().sub(origin);
      const distance = direction.length();
      if (!(distance > 0.05)) continue;
      const ray = new THREE.Raycaster(origin, direction.normalize(), 0.02, distance + 0.15);
      const first = ray.intersectObjects(runtime.scene.children, true).find(opaqueRayHit);
      if (first && belongsTo(first.object, frame)) hitCount += 1;
    }
    return { frameRayCount: roots.length, frameRayHitCount: hitCount };
  }

  function apertureLedger(runtime, ownerMap) {
    return apertureDefinitions(runtime, ownerMap).map(({
      id, ownerId, expectedPaneCount, panes, frames,
    }) => {
      const paneMeshes = panes.filter(Boolean).flatMap((root) => renderableDescendants(root));
      const primary = paneMeshes.sort((left, right) => {
        const leftSize = finiteBox(left)?.getSize(new THREE.Vector3()).lengthSq() ?? 0;
        const rightSize = finiteBox(right)?.getSize(new THREE.Vector3()).lengthSq() ?? 0;
        return rightSize - leftSize;
      })[0];
      const paneBox = unionBox(panes);
      const size = paneBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3();
      const dimensions = [size.x, size.y, size.z].sort((left, right) => right - left);
      const paneSet = new Set(paneMeshes);
      const samples = paneMeshes.flatMap(localPaneSamples);
      const rayProofs = samples.map((target) => paneRayProof(runtime, target, paneSet));
      const frameBoxes = frames.filter(Boolean).map(finiteBox).filter(Boolean);
      const frameMaxGapM = paneBox && frameBoxes.length
        ? Math.max(...frameBoxes.map((box) => boxDistance(paneBox, box)))
        : Number.POSITIVE_INFINITY;
      const frameAttached = Boolean(paneBox && frameBoxes.length >= 2 && frameMaxGapM <= 0.08);
      const transparentPixelsCredited = active.spec.owners
        .filter(({ id: declaredOwner }) => declaredOwner === ownerId)
        .some(({ id: declaredOwner }) => (ownerMap[declaredOwner] ?? [])
          .flatMap((root) => renderableDescendants(root))
          .some((mesh) => drawPolicy(mesh).slots.some((slot) => slot.active && slot.transparent)));
      const activeMaterials = paneMeshes.flatMap((mesh) => (
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          .filter((material, index) => drawPolicy(mesh).slots[index]?.active && material)
      ));
      const opacities = activeMaterials.map((material) => Number(material.opacity ?? 1));
      return {
        id,
        ownerId,
        expectedPaneCount,
        exactPaneCount: panes.length,
        exactOwnerMatch: panes.length === expectedPaneCount
          && panes.every((pane) => (ownerMap[ownerId] ?? []).some(({ uuid }) => uuid === pane.uuid)),
        clearWidthM: round(dimensions[0]),
        clearHeightM: round(dimensions[1]),
        thicknessM: round(dimensions[2]),
        sampleRayCount: samples.length,
        paneFirstHitCount: rayProofs.filter(({ paneFirst }) => paneFirst).length,
        clearRayCount: rayProofs.filter(({ clearBeyond }) => clearBeyond).length,
        ...frameRayHits(runtime, frames),
        frameAttached,
        frameMaxGapM: round(frameMaxGapM),
        transparentMaterialCount: activeMaterials.filter(({ transparent }) => transparent === true).length,
        activeMaterialCount: activeMaterials.length,
        minimumOpacity: round(Math.min(...opacities, Number.POSITIVE_INFINITY)),
        maximumOpacity: round(Math.max(...opacities, 0)),
        transparentPixelsCredited,
      };
    });
  }

  function runtimeVolume(runtime) {
    if (active.spec.pose.view === 'rear-gun' || active.spec.pose.view === 'rear-gun-exterior') {
      return runtime.aircraft.parts.rearGunTurret;
    }
    return runtime.aircraft.parts.cockpit;
  }

  function shellLedger(runtime, ownerMap) {
    const expected = active.spec.pose.view.startsWith('exterior')
      || active.spec.pose.view.endsWith('exterior') ? 'outside' : 'inside';
    const volume = finiteBox(runtimeVolume(runtime));
    const relation = volume?.containsPoint(runtime.camera.position) ? 'inside' : 'outside';
    return {
      expectedCameraRelation: expected,
      cameraRelation: relation,
      ...fixtureClearance(runtime),
      apertures: apertureLedger(runtime, ownerMap),
    };
  }

  function controlLedger(runtime) {
    const h = runtime.handle;
    const a = runtime.aircraft;
    const yokes = active.spec.scene === 'beefrun'
      ? (a.parts.yoke ?? []).map((object, index) => ({ object, id: index ? 'copilot' : 'pilot' }))
      : (a.parts.controlYokes ?? []).map(({ assembly }, index) => ({ object: assembly, id: index ? 'copilot' : 'pilot' }));
    const obstacles = active.spec.scene === 'beefrun'
      ? [h.mission?.lou?.group, a.parts.cockpitFootwell, a.parts.cockpit?.getObjectByName('instrument-panel')]
      : [h.crew?.sasole?.group, a.parts.instrumentPanel, a.parts.throttleQuadrant];
    let minimum = Number.POSITIVE_INFINITY;
    const intrusions = [];
    const intendedJoins = measureYokeJoins(THREE, active.spec.scene, a);
    const intendedJoinCount = intendedJoins.filter(({ gapM }) => (
      Number.isFinite(gapM) && gapM <= 0.003
    )).length;
    const intendedJoinMaximumGapM = intendedJoins.length
      ? Math.max(...intendedJoins.map(({ gapM }) => gapM)) : Number.POSITIVE_INFINITY;
    for (const { object, id } of yokes) {
      const movableMeshes = active.spec.scene === 'beefrun'
        ? object.children.slice(1).flatMap(meshDescendants)
        : named(object, /^control-yoke-(?:hub|bar|grip)$/).flatMap(meshDescendants);
      for (const yokeMesh of movableMeshes) {
        const yokeBox = finiteBox(yokeMesh);
        for (const obstacle of obstacles.filter(Boolean)) {
          for (const obstacleMesh of meshDescendants(obstacle)) {
            const obstacleBox = finiteBox(obstacleMesh);
            const distance = boxDistance(yokeBox, obstacleBox);
            minimum = Math.min(minimum, distance);
            const overlap = overlapVolume(yokeBox, obstacleBox);
            if (overlap > 1e-6) intrusions.push({ yoke: id, obstacle: obstacleMesh.name || obstacle.name, overlapM3: round(overlap, 8) });
          }
        }
      }
    }
    const mode = active.spec.pose.controls ?? 'neutral';
    const pitch = h.physics.controls.pitch ?? 0;
    const roll = h.physics.controls.roll ?? 0;
    const yaw = h.physics.controls.yaw ?? 0;
    const pedalMountGapM = active.spec.scene === 'beefrun'
      ? Math.max(...(a.parts.pedal ?? []).map((pedal, index) => (
        Math.abs(pedal.position.z - a.parts.pedalMount[index].position.z)
      )), 0)
      : 0;
    if (!Number.isFinite(minimum)) minimum = 0;
    let expectedTransforms = null;
    if (mode === 'full-extreme' && active.spec.scene === 'beefrun') {
      expectedTransforms = {
        yokeZ: round(a.parts.yoke[0].position.z),
        yokeRollRad: round(a.parts.yoke[0].rotation.z),
        pedalZ: a.parts.pedal.map((pedal) => round(pedal.position.z)),
        pedalMountGapM: round(pedalMountGapM),
        engineLeverRad: a.parts.lever.map((lever) => round(lever.rotation.x)),
        flapLeverRad: round(a.parts.flapLever.rotation.x),
        externalFlapRad: round(a.parts.flap[0].rotation.x),
      };
    } else if (mode === 'full-extreme') {
      const pedalErrors = (a.parts.rudderPedals ?? []).flatMap((pedal) => [
        Math.abs(pedal.position.z - (pedal.userData.restZ + pedal.userData.rudderSign * 0.055)),
        Math.abs(pedal.rotation.x - (-0.32 - pedal.userData.rudderSign * 0.12)),
      ]);
      expectedTransforms = {
        yokePitchRad: (a.parts.controlYokes ?? []).map(({ pitchPivot }) => round(pitchPivot.rotation.x)),
        yokeRollRad: (a.parts.controlYokes ?? []).map(({ wheel }) => round(wheel.rotation.z)),
        throttleRad: (a.parts.throttleLevers ?? []).map((lever) => round(lever.rotation.x)),
        pedalZ: (a.parts.rudderPedals ?? []).map((pedal) => round(pedal.position.z)),
        pedalRad: (a.parts.rudderPedals ?? []).map((pedal) => round(pedal.rotation.x)),
        externalFlapRad: round(a.parts.flap?.[0]?.rotation.x),
        maximumYokeError: round(Math.max(...(a.parts.controlYokes ?? []).flatMap(({ pitchPivot, wheel }) => [
          Math.abs(pitchPivot.rotation.x - 0.16), Math.abs(wheel.rotation.z - 0.65),
        ]), 0)),
        maximumThrottleError: round(Math.max(...(a.parts.throttleLevers ?? [])
          .map((lever) => Math.abs(lever.rotation.x - 0.4)), 0)),
        maximumPedalError: round(Math.max(...pedalErrors, 0)),
      };
    }
    return {
      mode,
      pitch: round(pitch),
      roll: round(roll),
      yaw: round(yaw),
      throttleL: round(h.physics.controls.throttleL ?? 0),
      throttleR: round(h.physics.controls.throttleR ?? 0),
      flaps: round(h.physics.controls.flaps ?? 0),
      yokes: yokes.map(({ object, id }, index) => {
        const atRequestedPose = active.spec.scene === 'beefrun'
          ? (mode === 'full-extreme'
            ? Math.abs(object.rotation.z + 0.5) <= 0.01 && Math.abs(object.position.z - 2.35) <= 0.01
            : Math.abs(object.rotation.z) <= 0.01 && Math.abs(object.position.z - 2.42) <= 0.01)
          : Math.abs(a.parts.controlYokes[index].wheel.rotation.z - roll * 0.65) <= 0.02
            && Math.abs(a.parts.controlYokes[index].pitchPivot.rotation.x - (0.28 - pitch * 0.12)) <= 0.02;
        return { id, atRequestedPose };
      }),
      minimumClearanceM: round(minimum),
      intrusions,
      intendedJoinCount,
      intendedJoinMaximumGapM: round(intendedJoinMaximumGapM),
      intendedJoins: intendedJoins.map((entry) => ({ ...entry, gapM: round(entry.gapM) })),
      unintendedIntrusionCount: intrusions.length,
      expectedTransforms,
    };
  }

  function gunLedger(runtime) {
    if (active.spec.scene !== 'enola') {
      return { yaw: 0, pitch: 0, atTraverseLimit: false, atElevationLimit: false,
        minimumClearanceM: 0.08, intrusions: [] };
    }
    const h = runtime.handle;
    const gunner = h.gunner;
    const weaponMeshes = meshDescendants(runtime.aircraft.parts.rearGunYoke);
    const bodyMeshes = meshDescendants(h.crew?.shubes?.group)
      .filter((mesh) => /(?:leg|torso|head)/.test(mesh.name ?? ''));
    let minimum = Number.POSITIVE_INFINITY;
    const intrusions = [];
    for (const weapon of weaponMeshes) {
      const weaponBox = finiteBox(weapon);
      for (const body of bodyMeshes) {
        const bodyBox = finiteBox(body);
        minimum = Math.min(minimum, boxDistance(weaponBox, bodyBox));
        const overlap = overlapVolume(weaponBox, bodyBox);
        if (overlap > 1e-6) intrusions.push({ weapon: weapon.name, body: body.name, overlapM3: round(overlap, 8) });
      }
    }
    if (!Number.isFinite(minimum)) minimum = 0.08;
    const eye = gunner.eyeWorld(new THREE.Vector3());
    const aim = gunner.aimWorld(new THREE.Vector3());
    const cameraForward = runtime.camera.getWorldDirection(new THREE.Vector3()).normalize();
    const muzzle = runtime.aircraft.rearGunMuzzleWorld(new THREE.Vector3());
    const tracers = gunner.tracers;
    const liveRounds = (tracers?.rounds ?? []).filter(Boolean);
    const newestIndex = tracers?.capacity
      ? (tracers._next - 1 + tracers.capacity) % tracers.capacity : -1;
    const newest = newestIndex >= 0 ? tracers.rounds[newestIndex] : null;
    const tracerDirection = newest
      ? newest.to.clone().sub(newest.from).normalize() : new THREE.Vector3();
    const hands = [h.crew?.shubes?.arms?.[0]?.hand, h.crew?.shubes?.arms?.[1]?.hand].filter(Boolean);
    const grips = named(runtime.aircraft.parts.rearGunYoke, 'rear-gun-spade-grip');
    const handGripGaps = hands.map((hand) => Math.min(...grips.map((grip) => (
      boxDistance(finiteBox(hand), finiteBox(grip))
    )), Number.POSITIVE_INFINITY));
    const bodyRoots = [h.crew?.shubes?.group?.getObjectByName('shubes-head'),
      h.crew?.shubes?.group?.getObjectByName('shubes-torso')].filter(Boolean);
    const seat = runtime.aircraft.group.getObjectByName('rear-gun-seat-pan');
    const bodySeatContactGapM = Math.min(...bodyRoots.map((body) => (
      boxDistance(finiteBox(body), finiteBox(seat))
    )), Number.POSITIVE_INFINITY);
    const turretFrames = named(runtime.aircraft.parts.rearGunTurret,
      /^rear-gun-(?:frame-|glazing-ring)/);
    const bodyTurretClearanceM = Math.min(...bodyRoots.flatMap((body) => (
      turretFrames.map((frame) => boxDistance(finiteBox(body), finiteBox(frame)))
    )), Number.POSITIVE_INFINITY);
    const fairingAndTail = [runtime.aircraft.group.getObjectByName('rear-gun-fairing'),
      runtime.aircraft.group.getObjectByName('fuselage-aft-cap'),
      runtime.aircraft.group.getObjectByName('vertical-fin')].filter(Boolean);
    const fairingTailClearanceM = Math.min(...(runtime.aircraft.parts.gunBarrels ?? []).flatMap((barrel) => (
      fairingAndTail.map((shell) => boxDistance(finiteBox(barrel), finiteBox(shell)))
    )), Number.POSITIVE_INFINITY);
    const combatHud = document.getElementById('enola-combat');
    const reticle = combatHud?.children?.[0] ?? null;
    const hudStyle = combatHud ? getComputedStyle(combatHud) : null;
    const reticleStyle = reticle ? getComputedStyle(reticle) : null;
    const reticleBox = reticle?.getBoundingClientRect?.();
    const reticleCentreErrorPx = reticleBox ? Math.hypot(
      reticleBox.left + reticleBox.width / 2 - window.innerWidth / 2,
      reticleBox.top + reticleBox.height / 2 - window.innerHeight / 2,
    ) : Number.POSITIVE_INFINITY;
    return {
      yaw: round(gunner.yaw),
      pitch: round(gunner.pitch),
      atTraverseLimit: Math.abs(Math.abs(gunner.yaw) - 1.02) <= 0.002,
      atElevationLimit: Math.abs(gunner.pitch + 0.38) <= 0.002 || Math.abs(gunner.pitch - 0.58) <= 0.002,
      minimumClearanceM: round(minimum),
      intrusions,
      manned: gunner.manned === true,
      airborne: h.physics?.onGround === false,
      publicCameraIdentity: runtime.camera === h.camera && h.cameras?.camera === runtime.camera,
      cameraEyeDistanceM: round(runtime.camera.position.distanceTo(eye)),
      cameraAimDot: round(cameraForward.dot(aim)),
      muzzleTracerDistanceM: round(newest ? newest.from.distanceTo(muzzle) : Number.POSITIVE_INFINITY),
      tracerAimDot: round(newest ? tracerDirection.dot(aim) : -1),
      shotsFiredDelta: (gunner.shots ?? 0) - (active.preparation?.gunShotsBefore ?? 0),
      tracerFiredDelta: (tracers?.fired ?? 0) - (active.preparation?.tracerFiredBefore ?? 0),
      liveTracerCount: tracers?.live ?? liveRounds.length,
      newestTracer: newest ? {
        from: newest.from.toArray().map(round),
        to: newest.to.toArray().map(round),
      } : null,
      shubesNeckHidden: h.crew?.shubes?.neck?.visible === false,
      reticleVisible: Boolean(combatHud && reticle
        && hudStyle?.display !== 'none' && hudStyle?.visibility !== 'hidden'
        && reticleStyle?.display !== 'none' && reticleStyle?.visibility !== 'hidden'),
      reticleCentreErrorPx: round(reticleCentreErrorPx),
      handGripMaximumGapM: round(Math.max(...handGripGaps, 0)),
      bodySeatContactGapM: round(bodySeatContactGapM),
      bodyTurretClearanceM: round(bodyTurretClearanceM),
      fairingTailClearanceM: round(fairingTailClearanceM),
    };
  }

  function insideOutDoorRayRatio(runtime) {
    const origins = [];
    for (const y of [-0.52, -0.12, 0.28]) {
      for (const z of [-1.5, -1.05, -0.6]) origins.push(new THREE.Vector3(-0.55, y, z));
    }
    const rotation = runtime.aircraft.group.getWorldQuaternion(new THREE.Quaternion());
    const direction = new THREE.Vector3(-1, 0, 0).applyQuaternion(rotation).normalize();
    let clear = 0;
    for (const localOrigin of origins) {
      const origin = runtime.aircraft.group.localToWorld(localOrigin.clone());
      const hits = new THREE.Raycaster(origin, direction, 0.02, 1.5)
        .intersectObjects(runtime.scene.children, true).filter(opaqueRayHit);
      if (!hits.length) clear += 1;
    }
    return origins.length ? clear / origins.length : 0;
  }

  function doorLedger(runtime) {
    const spec = active.spec;
    if (!spec.pose.cargoDoor && !spec.pose.crewDoor) {
      return { id: 'not-required', openFraction: 0 };
    }
    const a = runtime.aircraft;
    if (spec.scene === 'beefrun') {
      const pivot = a.parts.cargoDoor;
      const leaf = a.parts.cargoDoor?.getObjectByName('cargo-door-leaf');
      const frames = named(a.group, /^(?:cargo-door-frame-(?:head|sill)|cargo-door-jamb-[01])$/);
      const shellSweep = measureDoorShellSweep(THREE, spec.scene, a);
      const closedRotationErrorRad = Math.abs(pivot.rotation.z);
      const openFraction = round(a.anim.cargoDoor);
      const leafBox = finiteBox(leaf);
      const openingWidthM = geometryParameter(leaf, 'depth');
      const openingHeightM = geometryParameter(leaf, 'height');
      const capsuleRouteClearanceM = Math.min(
        (openingWidthM - 0.6) / 2,
        openingHeightM - 1.02,
      );
      return {
        id: 'cargo-door',
        state: spec.pose.cargoDoor,
        openFraction,
        openingWidthM: round(openingWidthM),
        openingHeightM: round(openingHeightM),
        thresholdClearanceM: round(geometryParameter(a.parts.cargoThreshold, 'height')),
        egressDeployed: a.cargoRampDown === true,
        egressClearanceM: round(capsuleRouteClearanceM),
        capsuleRouteClearanceM: round(capsuleRouteClearanceM),
        routeWidthM: round(openingWidthM),
        routeHeightM: round(openingHeightM),
        leafShellIntrusionCount: shellSweep.currentIntrusionCount,
        sweptShellIntrusionCount: shellSweep.sweptIntrusionCount,
        shellMaximumPenetrationM: round(shellSweep.maximumPenetrationM, 8),
        sweepSampleCount: shellSweep.sampleCount,
        closedRotationErrorRad: round(closedRotationErrorRad),
        closedSeamMaxGapM: round(Math.max(...frames.map((frame) => boxDistance(leafBox, finiteBox(frame))), 0)),
        insideOutClearRayRatio: spec.pose.view === 'interior-cargo-door'
          ? round(insideOutDoorRayRatio(runtime)) : 0,
      };
    }
    const leaf = a.parts.crewDoor;
    const sill = a.group.getObjectByName('crew-door-frame-sill');
    const leafBox = finiteBox(leaf);
    const frames = named(a.parts.crewDoorFrame, /^crew-door-frame-(?:sill|header|aft-jamb|forward-jamb)$/);
    const shellSweep = measureDoorShellSweep(THREE, spec.scene, a);
    const openingWidthM = geometryParameter(leaf, 'depth');
    const openingHeightM = geometryParameter(leaf, 'height');
    const capsuleRouteClearanceM = Math.min(
      (openingWidthM - 0.6) / 2,
      openingHeightM - 1.02,
    );
    return {
      id: 'crew-door',
      state: spec.pose.crewDoor,
      openFraction: round(Math.abs(a.parts.crewDoorHinge.rotation.y) / (Math.PI / 2)),
      openingWidthM: round(openingWidthM),
      openingHeightM: round(openingHeightM),
      thresholdClearanceM: round(geometryParameter(sill, 'height')),
      egressDeployed: a.parts.ladder.visible === true,
      egressClearanceM: round(capsuleRouteClearanceM),
      capsuleRouteClearanceM: round(capsuleRouteClearanceM),
      routeWidthM: round(openingWidthM),
      routeHeightM: round(openingHeightM),
      leafShellIntrusionCount: shellSweep.currentIntrusionCount,
      sweptShellIntrusionCount: shellSweep.sweptIntrusionCount,
      shellMaximumPenetrationM: round(shellSweep.maximumPenetrationM, 8),
      sweepSampleCount: shellSweep.sampleCount,
      closedRotationErrorRad: round(Math.abs(a.parts.crewDoorHinge.rotation.y)),
      closedSeamMaxGapM: round(Math.max(...frames.map((frame) => boxDistance(leafBox, finiteBox(frame))), 0)),
      insideOutClearRayRatio: 0,
    };
  }

  /**
   * Bind contract-owned semantic gates to raw public-runtime quantities.  No
   * threshold, comparator, or producer-authored pass bit is recorded here;
   * grading stays exclusively in cockpit-visual-evidence-contract.mjs.
   */
  function measurementLedger(runtime, spec, ownerMap, geometry) {
    const measurements = {};
    const put = (key, value) => {
      const numeric = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      if (Number.isFinite(numeric)) measurements[key] = round(numeric);
    };
    const ratio = (numerator, denominator) => (
      Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
        ? numerator / denominator : 0
    );
    const finiteValues = (values) => values.filter(Number.isFinite);
    const maximum = (values, fallback = 0) => {
      const finite = finiteValues(values);
      return finite.length ? Math.max(...finite) : fallback;
    };
    const minimum = (values, fallback = 0) => {
      const finite = finiteValues(values);
      return finite.length ? Math.min(...finite) : fallback;
    };
    const h = runtime.handle;
    const a = runtime.aircraft;

    const inCockpit = spec.scene === 'beefrun'
      ? h.mission?.flags?.inCockpit === true : h.mission?.inCockpit === true;
    const pilotEyeWorld = a.pilotEye?.clone?.();
    if (pilotEyeWorld) a.group.localToWorld(pilotEyeWorld);
    put('camera.public-identity', runtime.camera === h.camera && h.cameras?.camera === runtime.camera);
    put('camera.phase-match', h.mission?.phase === spec.pose.phase);
    put('camera.in-cockpit', inCockpit);
    put('camera.manager-cockpit-view', h.cameras?.view === 'cockpit');
    put('camera.pilot-eye-distance-m', pilotEyeWorld
      ? runtime.camera.getWorldPosition(new THREE.Vector3()).distanceTo(pilotEyeWorld) : null);
    put('camera.port-look-yaw-rad', h.cameras?.lookYaw);
    put('camera.starboard-look-yaw-rad', h.cameras?.lookYaw);

    for (const category of ['footwell', 'panel', 'quadrant']) {
      const members = (geometry.supports?.members ?? []).filter((entry) => entry.category === category);
      put(`supports.${category}.member-count`, members.length);
      put(`supports.${category}.complete-member-count`, members.filter((entry) => (
        entry.attached === true && entry.endpointA && entry.endpointB
      )).length);
      put(`supports.${category}.maximum-endpoint-gap-m`, maximum(members.flatMap((entry) => (
        [entry.endpointAGapM, entry.endpointBGapM]
      ))));
    }

    const controls = geometry.controls ?? {};
    put('controls.max-axis-error', maximum([
      Math.abs(controls.pitch ?? 0), Math.abs(controls.roll ?? 0), Math.abs(controls.yaw ?? 0),
      Math.abs(controls.throttleL ?? 0), Math.abs(controls.throttleR ?? 0),
      Math.abs(controls.flaps ?? 0),
    ]));
    put('controls.intended-yoke-join-count', controls.intendedJoinCount);
    put('controls.intended-yoke-maximum-join-gap-m', controls.intendedJoinMaximumGapM);
    put('controls.unintended-intrusion-count', controls.unintendedIntrusionCount);
    put('controls.movable-clearance-m', controls.minimumClearanceM);
    const transforms = controls.expectedTransforms ?? {};
    if (spec.scene === 'beefrun') {
      const beefErrors = [
        Math.abs((transforms.yokeZ ?? Number.POSITIVE_INFINITY) - 2.35),
        Math.abs((transforms.yokeRollRad ?? Number.POSITIVE_INFINITY) + 0.5),
        ...((transforms.pedalZ ?? []).map((value, index) => (
          Math.abs(value - [2.35, 2.25][index])
        ))),
        Math.abs(transforms.pedalMountGapM ?? Number.POSITIVE_INFINITY),
        ...((transforms.engineLeverRad ?? []).map((value, index) => (
          Math.abs(value - [0.4, 0.4, 0, 0, 0, 0][index])
        ))),
        Math.abs((transforms.flapLeverRad ?? Number.POSITIVE_INFINITY) - 0.5),
        Math.abs((transforms.externalFlapRad ?? Number.POSITIVE_INFINITY) - 0.62),
      ];
      put('controls.beef.engine-lever-count', transforms.engineLeverRad?.length ?? 0);
      put('controls.beef.max-transform-error', maximum(beefErrors, Number.POSITIVE_INFINITY));
      put('controls.beef.pedal-count', a.parts.pedal?.length ?? 0);
      put('controls.beef.pedal-mount-gap-m', transforms.pedalMountGapM ?? 0);
    } else {
      put('controls.enola.yoke-count', a.parts.controlYokes?.length ?? 0);
      put('controls.enola.throttle-count', a.parts.throttleLevers?.length ?? 0);
      put('controls.enola.pedal-count', a.parts.rudderPedals?.length ?? 0);
      put('controls.enola.max-yoke-transform-error', transforms.maximumYokeError);
      put('controls.enola.max-throttle-transform-error', transforms.maximumThrottleError);
      put('controls.enola.max-pedal-transform-error', transforms.maximumPedalError);
    }

    for (const aperture of geometry.shell?.apertures ?? []) {
      const prefix = `aperture.${aperture.id}`;
      put(`${prefix}.exact-pane-count`, aperture.exactPaneCount);
      put(`${prefix}.transparent-pane-ratio`, ratio(
        aperture.transparentMaterialCount, aperture.activeMaterialCount,
      ));
      put(`${prefix}.pane-first-hit-ratio`, ratio(aperture.paneFirstHitCount, aperture.sampleRayCount));
      put(`${prefix}.clear-beyond-ratio`, ratio(aperture.clearRayCount, aperture.sampleRayCount));
      put(`${prefix}.frame-hit-ratio`, ratio(aperture.frameRayHitCount, aperture.frameRayCount));
      put(`${prefix}.frame-max-gap-m`, aperture.frameMaxGapM);
    }
    const apertures = geometry.shell?.apertures ?? [];
    if (apertures.length) {
      put('glazing.exact-pane-owner-match', apertures.every(({ exactOwnerMatch }) => exactOwnerMatch));
      put('glazing.transparent-material-ratio', minimum(apertures.map((entry) => ratio(
        entry.transparentMaterialCount, entry.activeMaterialCount,
      ))));
      put('glazing.minimum-opacity', minimum(apertures.map(({ minimumOpacity }) => minimumOpacity)));
      put('glazing.maximum-opacity', maximum(apertures.map(({ maximumOpacity }) => maximumOpacity)));
      put('glazing.maximum-thickness-m', maximum(apertures.map(({ thicknessM }) => thicknessM)));
    }
    const copyGlazing = (id) => {
      const aperture = apertures.find((entry) => entry.id === id);
      if (!aperture) return;
      put(`glazing.${id}.exact-pane-count`, aperture.exactPaneCount);
      put(`glazing.${id}.transparent-pane-ratio`, ratio(
        aperture.transparentMaterialCount, aperture.activeMaterialCount,
      ));
      put(`glazing.${id}.clear-beyond-ratio`, ratio(aperture.clearRayCount, aperture.sampleRayCount));
      put(`glazing.${id}.frame-max-gap-m`, aperture.frameMaxGapM);
    };
    copyGlazing('bombardier');
    copyGlazing('rear-turret');
    const sideAperture = apertures.find(({ id }) => id === 'side-panes');
    if (sideAperture) {
      put('glazing.side-frame-pane-count', sideAperture.exactPaneCount);
      put('glazing.side-frame-max-gap-m', sideAperture.frameMaxGapM);
    }

    if (spec.scene === 'enola') {
      const fits = measureAnnulusSurfaceFit(THREE, a);
      const fitMeasurements = (prefix) => {
        const pairs = fits.filter(({ kind }) => kind === prefix);
        put(`glazing.${prefix}-annuli-count`, pairs.filter(({ exactAnnulus }) => exactAnnulus).length);
        put(`glazing.${prefix}-annuli-exact-pane-count`, pairs.filter(({ exactPane }) => exactPane).length);
        put(`glazing.${prefix}-annuli-transparent-pane-count`,
          pairs.filter(({ transparentPane }) => transparentPane).length);
        put(`glazing.${prefix}-annuli-centre-pane-hit-count`,
          pairs.filter(({ centreExactPaneHit }) => centreExactPaneHit).length);
        put(`glazing.${prefix}-annuli-surface-coverage-ratio`, minimum(pairs.map((pair) => (
          ratio(pair.coveredSampleCount, pair.sampleCount)
        ))));
        put(`glazing.${prefix}-annuli-pane-coverage-ratio`, minimum(pairs.map((pair) => (
          ratio(pair.paneSampleCount, pair.sampleCount)
        ))));
        put(`glazing.${prefix}-annuli-naked-sample-count`,
          pairs.reduce((sum, pair) => sum + pair.nakedSampleCount, 0));
      };
      fitMeasurements('roof');
      fitMeasurements('waist');
    }

    const crewMember = (id) => spec.scene === 'beefrun'
      ? (id === 'sasole' ? h.mission?.lou : null) : h.crew?.[id];
    const sasole = crewMember('sasole');
    const irish = crewMember('irish');
    const exactTags = (member) => descendants(member?.group, (object) => (
      object.isSprite && object.name === 'name-tag'
    ));
    const sasoleTags = exactTags(sasole);
    const sasoleSeat = spec.scene === 'beefrun'
      ? a.group.getObjectByName('copilot-seat-cushion')
      : a.anchors.seats?.copilot?.getObjectByName('cockpit-seat-pan');
    const irishSeat = a.anchors?.seats?.navigator?.getObjectByName?.('cockpit-seat-pan');
    const sasoleTorsoName = 'captain_lou_sasole-torso';
    const sasoleSeatGap = boxDistance(finiteBox(sasole?.group?.getObjectByName(sasoleTorsoName)),
      finiteBox(sasoleSeat));
    const irishSeatGap = boxDistance(finiteBox(irish?.group?.getObjectByName('irish-torso')),
      finiteBox(irishSeat));
    put('crew.sasole-name-tag-count', sasoleTags.length);
    put('crew.sasole-name-tag-hidden', sasoleTags.length === 1 && sasoleTags.every((tag) => !visible(tag)));
    put('crew.sasole-name-tag-text-match', sasoleTags.length === 1
      && sasoleTags[0].userData?.text === 'CAPT. LOU SASOLE');
    put('crew.sasole-seat-parent-match', spec.scene === 'beefrun'
      ? sasole?.group?.parent === a.group && h.mission?.flags?.louAboard === true
      : sasole?.group?.parent === a.anchors.seats?.copilot);
    put('crew.sasole-seat-contact-gap-m', sasoleSeatGap);
    put('crew.irish-seat-parent-match', irish?.group?.parent === a.anchors?.seats?.navigator);
    const irishTags = exactTags(irish);
    put('crew.irish-name-tag-hidden', irishTags.length === 1 && irishTags.every((tag) => !visible(tag)));
    put('crew.maximum-seat-contact-gap-m', maximum([sasoleSeatGap, irishSeatGap]));
    const floor = spec.scene === 'beefrun' ? a.parts.cargoFloor : a.group.getObjectByName('cabin-floor');
    const floorBox = finiteBox(floor);
    const contactBoots = [sasole, irish].filter(Boolean).flatMap((member) => (
      named(member.group, /-boot$/).filter((object) => object.isMesh)
    ));
    put('crew.minimum-boot-clearance-m', minimum(contactBoots.map((boot) => (
      finiteBox(boot)?.min.y - floorBox?.max.y
    )), Number.POSITIVE_INFINITY));
    const navTable = a.group.getObjectByName('nav-table');
    const irishBody = [irish?.group?.getObjectByName('irish-head'),
      irish?.group?.getObjectByName('irish-torso')].filter(Boolean);
    put('crew.irish-nav-clearance-m', minimum(irishBody.map((body) => (
      boxDistance(finiteBox(body), finiteBox(navTable))
    )), Number.POSITIVE_INFINITY));

    const door = geometry.door ?? {};
    put('door.open-fraction', door.openFraction);
    put('door.egress-deployed', door.egressDeployed === true);
    put('door.route-width-m', door.routeWidthM);
    put('door.route-height-m', door.routeHeightM);
    put('door.capsule-route-clearance-m', door.capsuleRouteClearanceM);
    put('door.open-leaf-shell-intrusion-count', door.leafShellIntrusionCount);
    put('door.swept-shell-intrusion-count', door.sweptShellIntrusionCount);
    put('door.shell-maximum-penetration-m', door.shellMaximumPenetrationM);
    put('door.sweep-sample-count', door.sweepSampleCount);
    put('door.inside-out-clear-ray-ratio', door.insideOutClearRayRatio);
    put('door.closed-rotation-error-rad', door.closedRotationErrorRad);
    put('door.closed-seam-max-gap-m', door.closedSeamMaxGapM);
    put('door.closed-leaf-shell-intrusion-count', door.leafShellIntrusionCount);

    const traversal = geometry.traversal ?? {};
    put('traversal.crossed-sill', traversal.crossedSill === true);
    put('traversal.maximum-horizontal-step-m', traversal.maximumHorizontalStepM);
    put('traversal.inside-floor-error-m', traversal.insideFloorErrorM);
    put('traversal.crouched-head-margin-m', traversal.crouchedHeadMarginYM);
    const collision = geometry.collision ?? {};
    put('collision.beef-nose-z-m', collision.noseCapsuleLocalZ);
    put('collision.beef-tail-z-m', collision.tailCapsuleLocalZ);
    put('collision.beef-side-abs-x-m', collision.sideCapsuleLocalX);
    put('collision.beef-underwing-progress-m', Number.isFinite(collision.underWingStartLocal?.[2])
      && Number.isFinite(collision.underWingEndLocal?.[2])
      ? collision.underWingStartLocal[2] - collision.underWingEndLocal[2] : null);
    put('collision.beef-underwing-ground-delta-m', collision.underWingGroundDeltaM);
    put('collision.enola-side-capsule-clearance-m', collision.capsuleClearanceM);
    put('collision.enola-side-intrusion-count', collision.intrusions?.length ?? 0);
    put('collision.enola-belly-bay-closed', collision.bayClosed === true);
    put('collision.enola-belly-capsule-clearance-m', collision.capsuleClearanceM);
    put('collision.enola-belly-intrusion-count', collision.intrusions?.length ?? 0);

    if (spec.scene === 'enola') {
      const art = a.noseArtPresentation?.();
      if (art) {
        put('art.ready', art.artReady === true && art.loadState === 'ready');
        put('art.load-error-count', art.loadError == null ? 0 : 1);
        put('art.real-artwork-count', art.realArtworkApplied);
        put('art.paired-side-count', (art.sides ?? []).filter(({ pinup, name, outboard, topDelta }) => (
          pinup && name && outboard === true && Number.isFinite(topDelta) && topDelta < 1e-4
        )).length);
        put('art.overlap-count', (art.sides ?? []).filter(({ gap }) => !(gap > 0.0001)).length);
        put('art.minimum-gap-m', art.minimumGap);
      }
      for (const [id, expectedRole, expectedSide] of [
        ['pinup-port', 'pinup', 1], ['pinup-starboard', 'pinup', -1],
        ['name-port', 'name', 1], ['name-starboard', 'name', -1],
      ]) {
        const plates = ownerMap[id] ?? [];
        const localSigns = plates.map((plate) => {
          const local = a.group.worldToLocal(plate.getWorldPosition(new THREE.Vector3()));
          return Math.sign(local.x);
        });
        put(`art.${id}.role-match`, plates.length === 1
          && plates.every((plate) => plate.userData?.noseArtRole === expectedRole));
        put(`art.${id}.side-sign`, plates.length === 1
          && plates[0].userData?.noseArtSide === expectedSide
          && localSigns[0] === expectedSide ? expectedSide : 0);
        put(`art.${id}.visible-textured-owner-count`, plates.filter((plate) => (
          visible(plate) && plate.material?.map && plate.userData?.ownerArtworkApplied === true
        )).length);
      }

      const bayDoors = a.parts.bombBayDoors ?? [];
      const bayEdges = named(a.group, /^fuselage-bomb-bay-(?:port|starboard)-edge$/);
      const bayDoorMeshes = bayDoors.flatMap(meshDescendants);
      /* The leaf's pivot lives on its matching edge, so that hinge contact is
       * intended. Grade only the opposite edge; world-AABB overlap at the
       * authored hinge is not shell penetration. */
      const bayOverlapM3 = bayDoorMeshes.reduce((sum, leaf) => {
        const pivotSide = Math.sign(leaf.parent?.position?.x ?? leaf.getWorldPosition(new THREE.Vector3()).x);
        const oppositeEdges = bayEdges.filter((edge) => Math.sign(edge.position.x) !== pivotSide);
        return sum + oppositeEdges.reduce((edgeSum, edge) => (
          edgeSum + overlapVolume(finiteBox(leaf), finiteBox(edge))
        ), 0);
      }, 0);
      const edgeBoxes = bayEdges.map(finiteBox).filter(Boolean);
      const openingWidthM = edgeBoxes.length === 2
        ? Math.abs(edgeBoxes[0].getCenter(new THREE.Vector3()).x
          - edgeBoxes[1].getCenter(new THREE.Vector3()).x)
        : 0;
      const probeLocal = (a.anchors.bombBayCenter ?? new THREE.Vector3()).clone();
      probeLocal.y = -0.1;
      const probe = {
        position: a.group.localToWorld(probeLocal),
        velocity: new THREE.Vector3(), eyeHeight: 1.66,
      };
      const probeBlocked = a.resolveWalkaroundPlayer?.(probe, 'x', 0.3, {
        bombBayOpen: h.mission?.bombBayOpen === true,
        crewDoorOpen: a.crewDoorOpen,
      }) === true;
      put('bomb-bay.public-open', h.mission?.bombBayOpen === true);
      put('bomb-bay.open-fraction', a.anim?.bombBay);
      put('bomb-bay.leaf-shell-overlap-m3', bayOverlapM3);
      put('bomb-bay.capsule-clearance-m', !probeBlocked
        ? Math.max(0, (openingWidthM - 0.6) / 2) : 0);
    }

    const gun = geometry.gun ?? {};
    put('gun.airborne', gun.airborne === true);
    put('gun.body-seat-contact-gap-m', gun.bodySeatContactGapM);
    put('gun.body-turret-clearance-m', gun.bodyTurretClearanceM);
    put('gun.camera-aim-dot', gun.cameraAimDot);
    put('gun.camera-eye-distance-m', gun.cameraEyeDistanceM);
    put('gun.fairing-tail-clearance-m', gun.fairingTailClearanceM);
    put('gun.hand-grip-maximum-gap-m', gun.handGripMaximumGapM);
    put('gun.live-tracer-count', gun.liveTracerCount);
    put('gun.manned', gun.manned === true);
    put('gun.muzzle-tracer-distance-m', gun.muzzleTracerDistanceM);
    put('gun.public-camera-identity', gun.publicCameraIdentity === true);
    put('gun.reticle-centre-error-px', gun.reticleCentreErrorPx);
    put('gun.reticle-visible', gun.reticleVisible === true);
    put('gun.shots-fired-delta', gun.shotsFiredDelta);
    put('gun.shubes-neck-hidden', gun.shubesNeckHidden === true);
    put('gun.tracer-aim-dot', gun.tracerAimDot);
    put('gun.tracer-fired-delta', gun.tracerFiredDelta);
    return measurements;
  }

  async function captureState() {
    if (!active || active.maskState) throw new Error('cockpit evidence state is not capturable');
    const { runtime, spec, ownerMap } = active;
    runtime.scene.updateMatrixWorld(true);
    runtime.camera.updateMatrixWorld(true);
    const subjects = Object.fromEntries(spec.owners.map(({ id }) => {
      const objects = ownerMap[id] ?? [];
      const requirement = spec.owners.find((owner) => owner.id === id);
      const meshes = [...new Map(objects.flatMap((root) => (
        renderableDescendants(root, requirement.selection)
      ))
        .map((mesh) => [mesh.uuid, mesh])).values()];
      return [id, {
        rootCount: objects.length,
        rootUuids: objects.map(({ uuid }) => uuid),
        rootNames: objects.map(({ name }) => name || '(unnamed)').sort(),
        roots: objects.map((root) => {
          const rootObjects = renderableDescendants(root, requirement.selection);
          return {
            uuid: root.uuid,
            name: root.name || '(unnamed)',
            objectCount: rootObjects.length,
            visibleObjectCount: rootObjects.filter(visible).length,
            finiteWorldBounds: rootObjects.length > 0 && rootObjects.every((object) => !!finiteBox(object)),
          };
        }),
        objectCount: meshes.length,
        objectUuids: meshes.map(({ uuid }) => uuid).sort(),
        visibleObjectCount: meshes.filter(visible).length,
        finiteWorldBounds: meshes.length > 0 && meshes.every((mesh) => !!finiteBox(mesh)),
      }];
    }));
    const cameraSpace = runtime.camera.position.toArray().map(round);
    const geometry = {
      supports: supportLedger(runtime),
      shell: shellLedger(runtime, ownerMap),
      door: doorLedger(runtime),
      controls: controlLedger(runtime),
      gun: gunLedger(runtime),
      traversal: active.traversal,
      collision: active.collision,
    };
    const renderStateFingerprintSha256 = await renderStateFingerprint(runtime);
    return {
      shotId: spec.id,
      runtimeHandle: runtime.handleName,
      sceneUuid: runtime.scene.uuid,
      camera: {
        uuid: runtime.camera.uuid,
        type: runtime.camera.type,
        legalSource: spec.pose.view === 'rear-gun' ? 'public-gunner-camera' : 'public-runtime-camera',
        position: cameraSpace,
        quaternion: runtime.camera.quaternion.toArray().map(round),
        projection: runtime.camera.projectionMatrix.elements.map(round),
      },
      pose: {
        phase: runtime.handle.mission?.phase ?? 'runtime',
        inCockpit: runtime.handle.mission?.flags?.inCockpit ?? runtime.handle.mission?.inCockpit ?? false,
        requested: spec.pose,
      },
      scheduler: window.__cockpitEvidenceScheduler?.snapshot?.() ?? null,
      renderStateFingerprint: renderStateFingerprintSha256,
      subjects,
      geometry,
      measurements: measurementLedger(runtime, spec, ownerMap, geometry),
    };
  }

  async function prepare(spec, viewport) {
    if (active) throw new Error('cockpit evidence shot is already active');
    const runtime = resolveRuntime(window, spec.scene);
    if (window.__cockpitEvidenceScheduler?.snapshot?.().installedBeforeModules !== true) {
      throw new Error('cockpit evidence scheduler was not installed before module execution');
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
    runtime.renderer.setPixelRatio(1);
    runtime.renderer.setSize(viewport.width, viewport.height, false);
    runtime.camera.aspect = viewport.width / viewport.height;
    const preparation = spec.scene === 'beefrun'
      ? prepareBeef(runtime, spec)
      : await prepareEnola(runtime, spec);
    const ownerMap = ownerRoots(runtime, spec);
    const claimedMeshes = new Map();
    for (const owner of spec.owners) {
      const roots = ownerMap[owner.id] ?? [];
      const rootUuids = roots.map(({ uuid }) => uuid);
      const meshes = [...new Map(roots.flatMap((root) => (
        renderableDescendants(root, owner.selection)
      ))
        .map((mesh) => [mesh.uuid, mesh])).values()];
      if (!meshes.length) {
        throw new Error(`${spec.id} cannot resolve public runtime owner ${owner.id}`);
      }
      if (new Set(rootUuids).size !== rootUuids.length) {
        throw new Error(`${spec.id} owner ${owner.id} resolves duplicate root UUIDs`);
      }
      for (const mesh of meshes) {
        const prior = claimedMeshes.get(mesh.uuid);
        if (prior && prior !== owner.id) {
          throw new Error(`${spec.id} owners ${prior}/${owner.id} borrow mesh ${mesh.uuid}`);
        }
        claimedMeshes.set(mesh.uuid, owner.id);
      }
    }
    active = {
      spec, runtime, ownerMap, preparation,
      maskState: null, traversal: null, collision: null,
    };
    active.traversal = beefTraversalLedger(runtime);
    active.collision = spec.scene === 'beefrun'
      ? beefCollisionLedger(runtime)
      : enolaCollisionLedger(runtime);
    await render(runtime);
    return captureState();
  }

  function freeze(spec) {
    if (!active || active.spec.id !== spec.id || active.maskState) {
      throw new Error(`${spec.id} cannot freeze in the current state`);
    }
    const scheduler = window.__cockpitEvidenceScheduler;
    const frozen = scheduler?.freeze?.();
    if (frozen?.frozen !== true || frozen.pendingTimers !== 0
        || frozen.pendingIntervals !== 0 || frozen.pendingAnimationFrames !== 0) {
      throw new Error(`${spec.id} did not reach a frozen callback boundary`);
    }
    return frozen;
  }

  async function renderNormal(spec) {
    if (!active || active.spec.id !== spec.id || active.maskState) {
      throw new Error(`${spec.id} cannot render normal evidence in the current state`);
    }
    if (window.__cockpitEvidenceScheduler?.snapshot?.().frozen !== true) {
      throw new Error(`${spec.id} normal render preceded the scheduler freeze`);
    }
    const receipt = await render(active.runtime, 'normal');
    const binding = await captureState();
    return Object.freeze({ receipt, binding });
  }

  async function beginOwnerMask(spec) {
    if (!active || active.spec.id !== spec.id || active.maskState) {
      throw new Error(`${spec.id} owner mask cannot begin in the current state`);
    }
    const binding = await captureState();
    const palette = rootPalette(spec, active.ownerMap);
    const paletteByRoot = new Map(palette.map((entry, index) => [entry.rootUuid, index]));
    const assignment = new Map();
    for (const owner of spec.owners) {
      for (const root of active.ownerMap[owner.id] ?? []) {
        const paletteIndex = paletteByRoot.get(root.uuid);
        if (!Number.isSafeInteger(paletteIndex)) {
          throw new Error(`${spec.id} root ${root.uuid} is absent from the mask palette`);
        }
        for (const mesh of renderableDescendants(root, owner.selection)) {
          if (assignment.has(mesh.uuid)) {
            throw new Error(`${spec.id} semantic roots borrow mask draw ${mesh.uuid}`);
          }
          assignment.set(mesh.uuid, paletteIndex);
        }
      }
    }
    const allocated = [];
    const invisibleMaterials = new Map();
    const materialKind = (object) => object.isSprite ? 'sprite'
      : object.isPoints ? 'points' : object.isLine ? 'line' : 'mesh';
    const invisibleFor = (object) => {
      const kind = materialKind(object);
      if (invisibleMaterials.has(kind)) return invisibleMaterials.get(kind);
      const material = kind === 'sprite' ? new THREE.SpriteMaterial({ visible: false })
        : kind === 'points' ? new THREE.PointsMaterial({ visible: false })
          : kind === 'line' ? new THREE.LineBasicMaterial({ visible: false })
            : new THREE.MeshBasicMaterial({ visible: false });
      invisibleMaterials.set(kind, material);
      allocated.push(material);
      return material;
    };
    const materialCache = new WeakMap();
    const maskMaterial = (original, color, object) => {
      let colors = materialCache.get(original);
      if (!colors) {
        colors = new Map();
        materialCache.set(original, colors);
      }
      const cacheKey = `${materialKind(object)}:${color}`;
      if (colors.has(cacheKey)) return colors.get(cacheKey);
      const transparent = original.transparent === true;
      const opacity = Number.isFinite(original.opacity) ? original.opacity : 1;
      const alphaTest = Number.isFinite(original.alphaTest) ? Math.max(0, original.alphaTest) : 0;
      const preserveAlphaCoverage = Boolean(original.map || original.alphaMap);
      original.map?.updateMatrix?.();
      original.alphaMap?.updateMatrix?.();
      /* MeshBasicMaterial deliberately retains Three's production vertex path:
       * batching/instanceMatrix, morph targets and normals, skinning, clipping,
       * sidedness, depth semantics, and polygon offset.  Only the final RGB is
       * replaced with the owner ID after stock map/alpha-map coverage has been
       * evaluated, so transparent glass cannot turn its background into owner
       * pixels and cut-outs remain cut-outs. */
      const options = {
        side: original.side,
        depthTest: original.depthTest,
        depthWrite: original.depthWrite,
        depthFunc: original.depthFunc,
        colorWrite: original.colorWrite,
        polygonOffset: original.polygonOffset === true,
        polygonOffsetFactor: original.polygonOffsetFactor ?? 0,
        polygonOffsetUnits: original.polygonOffsetUnits ?? 0,
        transparent,
        opacity: transparent ? Math.max(0, Math.min(1, opacity)) : 1,
        alphaTest,
        map: preserveAlphaCoverage ? (original.map ?? null) : null,
        alphaMap: preserveAlphaCoverage ? (original.alphaMap ?? null) : null,
        blending: original.blending,
        premultipliedAlpha: original.premultipliedAlpha === true,
        toneMapped: false,
        fog: false,
        color: new THREE.Color(color),
      };
      const material = object.isSprite ? new THREE.SpriteMaterial({
        ...options,
        rotation: original.rotation ?? 0,
      }) : object.isPoints ? new THREE.PointsMaterial({
        ...options,
        size: original.size ?? 1,
        sizeAttenuation: original.sizeAttenuation !== false,
      }) : object.isLine ? new THREE.LineBasicMaterial({
        ...options,
        linewidth: original.linewidth ?? 1,
        linecap: original.linecap,
        linejoin: original.linejoin,
      }) : new THREE.MeshBasicMaterial(options);
      material.onBeforeCompile = (shader) => {
        shader.uniforms.cockpitEvidenceIdColor = { value: new THREE.Color(color) };
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 cockpitEvidenceIdColor;')
          .replace(
            '#include <alphamap_fragment>',
            '#include <alphamap_fragment>\ndiffuseColor.rgb = cockpitEvidenceIdColor;',
          );
      };
      material.customProgramCacheKey = () => [
        'cockpit-evidence-id-v2',
        color,
        original.map ? 'map' : 'no-map',
        original.alphaMap ? 'alpha-map' : 'no-alpha-map',
        transparent ? 'transparent' : 'opaque',
        alphaTest,
      ].join('|');
      colors.set(cacheKey, material);
      allocated.push(material);
      return material;
    };
    const originals = [];
    active.runtime.scene.traverse((object) => {
      if (!(object.isMesh || object.isSprite || object.isPoints || object.isLine)
          || !object.material || !object.geometry) return;
      const original = object.material;
      originals.push({ mesh: object, material: original, visible: object.visible });
      const paletteIndex = assignment.get(object.uuid);
      const originalList = Array.isArray(original) ? original : [original];
      const policy = drawPolicy(object);
      const color = paletteIndex == null ? '#000000' : palette[paletteIndex].color;
      const replacements = originalList.map((material, index) => (
        policy.slots[index]?.active ? maskMaterial(material, color, object) : invisibleFor(object)
      ));
      object.material = Array.isArray(original) ? replacements : replacements[0];
      object.visible = policy.renderable;
    });
    const saved = {
      originals,
      background: active.runtime.scene.background,
      fog: active.runtime.scene.fog,
      clearColor: active.runtime.renderer.getClearColor(new THREE.Color()).clone(),
      clearAlpha: active.runtime.renderer.getClearAlpha(),
      toneMapping: active.runtime.renderer.toneMapping,
      toneMappingExposure: active.runtime.renderer.toneMappingExposure,
      materials: allocated,
    };
    active.runtime.scene.background = new THREE.Color(0x000000);
    active.runtime.scene.fog = null;
    active.runtime.renderer.setClearColor(0x000000, 1);
    active.runtime.renderer.toneMapping = THREE.NoToneMapping;
    active.runtime.renderer.toneMappingExposure = 1;
    active.maskState = saved;
    const receipt = await render(active.runtime, 'mask');
    return {
      ownerPalette: palette,
      binding,
      receipt: Object.freeze({ ...receipt, sourceFingerprint: binding.renderStateFingerprint }),
    };
  }

  async function endOwnerMask(spec) {
    if (!active || active.spec.id !== spec.id || !active.maskState) {
      throw new Error(`${spec.id} owner mask is not active`);
    }
    const saved = active.maskState;
    for (const original of saved.originals) {
      original.mesh.material = original.material;
      original.mesh.visible = original.visible;
    }
    active.runtime.scene.background = saved.background;
    active.runtime.scene.fog = saved.fog;
    active.runtime.renderer.setClearColor(saved.clearColor, saved.clearAlpha);
    active.runtime.renderer.toneMapping = saved.toneMapping;
    active.runtime.renderer.toneMappingExposure = saved.toneMappingExposure;
    for (const material of saved.materials) material.dispose();
    active.maskState = null;
    const receipt = await render(active.runtime);
    const binding = await captureState();
    return Object.freeze({ receipt, binding });
  }

  return Object.freeze({ prepare, freeze, renderNormal, capture: captureState, beginOwnerMask, endOwnerMask });
}
