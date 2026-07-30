/**
 * Developer scene previews.
 *
 * Preview campaigns deliberately live in page-local memory. They never read
 * localStorage, so opening a later scene cannot migrate, replace, or advance a
 * player's real campaign. A reload gives the scene a clean preview again.
 */

const PREVIEW_RUNTIME_KEY = '__squatchLifePreviewRuntime';
const PREVIEW_VALUE = '1';

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

export function previewSceneForLocation(locationLike = globalThis.location) {
  const pathname = String(locationLike?.pathname || '').toLowerCase();
  if (pathname.endsWith('/motel.html') || pathname.endsWith('motel.html')) {
    return 'jerky_motel';
  }
  if (pathname.endsWith('/squatchfather.html') || pathname.endsWith('squatchfather.html')) {
    return 'squatchfather';
  }
  if (pathname.endsWith('/beefrun.html') || pathname.endsWith('beefrun.html')) {
    return 'airstrip_smuggling';
  }
  /* The Initiation build does not create a campaign yet, so nothing in that
   * page consults this today. It is mapped anyway so the route cannot silently
   * seed an apartment preview the day the scene does claim its own state. */
  if (pathname.endsWith('/initiation.html') || pathname.endsWith('initiation.html')) {
    return 'initiation';
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
  for (const link of notice.querySelectorAll('a')) {
    Object.assign(link.style, {
      color: '#7de6dc',
      textDecoration: 'none',
      whiteSpace: 'nowrap',
    });
  }
  document.body.appendChild(notice);
}

export function installPreviewNotice(locationLike = globalThis.location) {
  if (isPreviewMode(locationLike)) addPreviewNotice();
}
