/**
 * Developer scene previews.
 *
 * Preview campaigns deliberately live in page-local memory. They never read
 * localStorage, so opening a later scene cannot migrate, replace, or advance a
 * player's real campaign. A reload gives the scene a clean preview again.
 */

const PREVIEW_RUNTIME_KEY = '__squatchLifePreviewRuntime';
const PREVIEW_VALUE = '1';

/**
 * Canonical apartment checkpoints worth reviewing as distinct scenes.
 *
 * The wake variants are included alongside literal front-door returns because
 * sleep is the chapter transition that changes the flat's dressing, calls,
 * news, and available work. Mission retries and half-finished checkpoints are
 * intentionally excluded: they are recovery states, not authored apartment
 * iterations.
 */
export const APARTMENT_PREVIEW_VARIANTS = Object.freeze([
  'day-one-wake',
  'after-bing-one',
  'after-squatchfather',
  'day-two-wake',
  'after-beef-run',
  'after-motel',
  'day-three-wake',
  'after-no-wake',
  'after-silver-room',
  'day-four-wake',
  'after-golf',
  'after-heist',
]);

export class PreviewMemoryStorage {
  constructor() {
    this.values = new Map();
  }

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key) {
    return this.values.get(String(key)) ?? null;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
}

function searchParams(locationLike) {
  try {
    return new URLSearchParams(locationLike?.search || '');
  } catch {
    return new URLSearchParams();
  }
}

export function isPreviewMode(locationLike = globalThis.location) {
  return searchParams(locationLike).get('preview') === PREVIEW_VALUE;
}

const HEIST_PREVIEW_CHECKPOINTS = Object.freeze([
  'safehouse',
  'bank_lobby',
  'vault_open',
  'street_withdrawal',
  'mercer_garage',
  'vehicle_escape',
  'safehouse_debrief',
]);

/* Beef Run has four durable restart points plus two shareable demo poses.
 * This list deliberately lives beside the preview URL parser rather than the
 * campaign checkpoint list: `preflight` is an on-foot walkaround shortcut and
 * `landing` is the final-approach setup; neither is a new campaign save state. */
const BEEFRUN_PREVIEW_CHECKPOINTS = Object.freeze([
  'preflight',
  'takeoff',
  'approach',
  'departure',
  'return',
  'landing',
]);

export function previewCheckpointForLocation(locationLike = globalThis.location) {
  const value = searchParams(locationLike).get('checkpoint');
  return HEIST_PREVIEW_CHECKPOINTS.includes(value) ? value : 'safehouse';
}

/**
 * A bounded, preview-only flight start.  Do not fold this into the Heist
 * helper above: an unknown `checkpoint` must never cause a Beef Run page to
 * inherit a Heist safehouse value, and non-preview campaign sessions must
 * always resume their actual saved progress.
 */
export function previewBeefRunCheckpointForLocation(locationLike = globalThis.location) {
  if (!isPreviewMode(locationLike)) return null;
  const pathname = String(locationLike?.pathname || '').toLowerCase();
  if (!(pathname.endsWith('/beefrun.html') || pathname.endsWith('beefrun.html'))) return null;
  const value = searchParams(locationLike).get('checkpoint');
  return BEEFRUN_PREVIEW_CHECKPOINTS.includes(value) ? value : null;
}

export function previewDifficultyForLocation(locationLike = globalThis.location) {
  return searchParams(locationLike).get('difficulty') === 'forgiving'
    ? 'forgiving' : 'professional';
}

export function previewApartmentVariantForLocation(locationLike = globalThis.location) {
  const pathname = String(locationLike?.pathname || '').toLowerCase();
  if (!(pathname.endsWith('/index.html') || pathname.endsWith('index.html'))) return null;
  const variant = searchParams(locationLike).get('apartment');
  return APARTMENT_PREVIEW_VARIANTS.includes(variant) ? variant : null;
}

export function previewSceneForLocation(locationLike = globalThis.location) {
  const pathname = String(locationLike?.pathname || '').toLowerCase();
  if (pathname.endsWith('/motel.html') || pathname.endsWith('motel.html')) {
    return 'jerky_motel';
  }
  if (pathname.endsWith('/graveyard.html') || pathname.endsWith('graveyard.html')) {
    return 'squatch_graveyard';
  }
  if (pathname.endsWith('/squatchfather.html') || pathname.endsWith('squatchfather.html')) {
    return 'squatchfather';
  }
  if (pathname.endsWith('/beefrun.html') || pathname.endsWith('beefrun.html')) {
    return 'airstrip_smuggling';
  }
  if (pathname.endsWith('/silver.html') || pathname.endsWith('silver.html')) {
    return 'silver_room';
  }
  if (pathname.endsWith('/golf.html') || pathname.endsWith('golf.html')) {
    return 'silver_pines';
  }
  if (pathname.endsWith('/heist.html') || pathname.endsWith('heist.html')) {
    return 'bank_heist';
  }
  if (pathname.endsWith('/nowake.html') || pathname.endsWith('nowake.html')) {
    return 'no_wake';
  }
  if (pathname.endsWith('/silvercase.html') || pathname.endsWith('silvercase.html')) {
    return 'silver_case';
  }
  if (pathname.endsWith('/mansion-siege.html') || pathname.endsWith('mansion-siege.html')) {
    return 'mansion_siege';
  }
  if (pathname.endsWith('/enolasquatch.html') || pathname.endsWith('enolasquatch.html')) {
    return 'enola_squatch';
  }
  if (pathname.endsWith('/cartel-palace.html') || pathname.endsWith('cartel-palace.html')) {
    return 'cartel_palace';
  }
  /* The Initiation build does not create a campaign yet, so nothing in that
   * page consults this today. It is mapped anyway so the route cannot silently
   * seed an apartment preview the day the scene does claim its own state. */
  if (pathname.endsWith('/initiation.html') || pathname.endsWith('initiation.html')) {
    return 'initiation';
  }
  /* Lou's mansion. The house is walkable with no campaign at all, and only
   * claims one once PROJECT SILENT SQUATCH is actually mounted — but the route
   * is mapped here so a preview of the mission seeds the mission's own scene
   * rather than quietly seeding an apartment. */
  if (pathname.endsWith('/mansion.html') || pathname.endsWith('mansion.html')) {
    return searchParams(locationLike).get('visit') === 'return'
      ? 'mansion_return'
      : 'mansion';
  }
  if (pathname.endsWith('/bing.html') || pathname.endsWith('bing.html')) {
    return searchParams(locationLike).get('visit') === '2'
      ? 'bada_bing_two'
      : 'bada_bing_one';
  }
  return 'apartment';
}

function locationSignature(locationLike) {
  return `${String(locationLike?.pathname || '')}${String(locationLike?.search || '')}`;
}

/**
 * One runtime per document/location. Keeping the runtime on globalThis lets
 * multiple createCampaign() calls in the same page share the same temporary
 * state without making it survive a reload or navigation.
 */
export function getPreviewRuntime(locationLike = globalThis.location) {
  if (!isPreviewMode(locationLike)) return null;

  const signature = locationSignature(locationLike);
  const existing = globalThis[PREVIEW_RUNTIME_KEY];
  if (existing?.signature === signature) return existing;

  const runtime = {
    signature,
    sceneId: previewSceneForLocation(locationLike),
    apartmentVariant: previewApartmentVariantForLocation(locationLike),
    storage: new PreviewMemoryStorage(),
    seeded: false,
  };
  globalThis[PREVIEW_RUNTIME_KEY] = runtime;
  return runtime;
}

/**
 * Preserve preview mode across campaign navigation. Existing query strings
 * (notably `visit=2`) and hashes are retained.
 */
export function previewNavigationHref(href, locationLike = globalThis.location) {
  if (!isPreviewMode(locationLike)) return href;

  const value = String(href);
  const hashAt = value.indexOf('#');
  const hash = hashAt >= 0 ? value.slice(hashAt) : '';
  const withoutHash = hashAt >= 0 ? value.slice(0, hashAt) : value;
  const [path, query = ''] = withoutHash.split('?');
  const params = new URLSearchParams(query);
  params.set('preview', PREVIEW_VALUE);
  const encoded = params.toString();
  return `${path}${encoded ? `?${encoded}` : ''}${hash}`;
}

function addPreviewNotice() {
  if (typeof document === 'undefined'
    || typeof document.getElementById !== 'function'
    || typeof document.createElement !== 'function'
    || document.getElementById('squatch-preview-notice')) {
    return;
  }
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', addPreviewNotice, { once: true });
    return;
  }

  const notice = document.createElement('aside');
  notice.id = 'squatch-preview-notice';
  notice.setAttribute('role', 'status');
  notice.innerHTML = [
    '<strong>DEVELOPER PREVIEW</strong>',
    '<span>Progress here is temporary</span>',
    '<a href="preview.html">Choose scene</a>',
    '<button type="button" data-preview-reset>Reset</button>',
    '<a href="index.html">Exit to saved game</a>',
  ].join('');
  Object.assign(notice.style, {
    position: 'fixed',
    zIndex: '2147483647',
    top: '10px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    maxWidth: 'calc(100vw - 20px)',
    padding: '7px 10px',
    border: '1px solid rgba(255, 215, 94, .72)',
    borderRadius: '8px',
    background: 'rgba(8, 10, 16, .92)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, .45)',
    color: '#f4f6fb',
    font: '600 12px/1.2 "Segoe UI", sans-serif',
    letterSpacing: '.02em',
    pointerEvents: 'auto',
  });

  const strong = notice.querySelector('strong');
  Object.assign(strong.style, {
    color: '#ffd75e',
    letterSpacing: '.1em',
    whiteSpace: 'nowrap',
  });
  const detail = notice.querySelector('span');
  Object.assign(detail.style, {
    color: '#b9c2d4',
    whiteSpace: 'nowrap',
  });
  for (const control of notice.querySelectorAll('a, button')) {
    Object.assign(control.style, {
      color: '#7de6dc',
      border: '0',
      padding: '0',
      background: 'transparent',
      font: 'inherit',
      cursor: 'pointer',
      textDecoration: 'none',
      whiteSpace: 'nowrap',
    });
  }
  notice.querySelector('[data-preview-reset]')?.addEventListener('click', () => {
    globalThis.location?.reload?.();
  });
  document.body.appendChild(notice);
}

export function installPreviewNotice(locationLike = globalThis.location) {
  if (isPreviewMode(locationLike)) addPreviewNotice();
}
