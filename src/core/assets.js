/**
 * Where the game's JSON manifests come from.
 *
 * Normally: fetched over HTTP from assets/. That needs a server, which is why
 * opening index.html with file:// does not work.
 *
 * But a single-file build (see tools/bundle-preview.mjs) has nothing to fetch
 * from -- every manifest and every image is baked into the HTML. Such a build
 * sets `globalThis.__SQUATCH_INLINE` before the game boots, and this returns
 * out of that instead. Nothing else in the project has to know which it is.
 */

/** @returns {object|null} the baked-in copy, if this is a bundled build. */
export function inlineManifest(dir, name) {
  const bundle = globalThis.__SQUATCH_INLINE;
  return bundle ? (bundle[`${dir}${name}`] ?? null) : null;
}

/** True when the game is running with its assets baked in. */
export function isBundled() {
  return !!globalThis.__SQUATCH_INLINE;
}

/**
 * Fetch a manifest, or hand back the baked-in copy.
 * @returns {Promise<object|null>} null if it is missing or unreadable.
 */
export async function loadJson(dir, name) {
  const inline = inlineManifest(dir, name);
  if (inline) return inline;
  try {
    const res = await fetch(dir + name, { cache: 'no-cache' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Resolve an asset filename against its folder. A bundled build rewrites
 * filenames to data: URIs, which are already absolute and must be left alone.
 */
export function assetUrl(dir, file) {
  return /^data:/.test(file) ? file : dir + file;
}
