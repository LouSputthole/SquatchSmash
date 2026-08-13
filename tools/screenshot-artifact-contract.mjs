import crypto from 'node:crypto';

/** Bind the file actually shipped on disk to Playwright's returned PNG bytes.
 * Length alone permits a same-label overwrite to certify pixels from a
 * different buffer. This exact byte comparison is cheap beside a WebGL shot
 * and returns the one hash both pixel proof and evidence ledger must share. */
export function bindScreenshotArtifact(screenshotBytes, diskBytes) {
  const returned = Buffer.from(screenshotBytes ?? []);
  const stored = Buffer.from(diskBytes ?? []);
  if (!returned.length || returned.length !== stored.length
      || !crypto.timingSafeEqual(returned, stored)) {
    throw new Error('screenshot bytes on disk differ from Playwright capture buffer');
  }
  return Object.freeze({
    bytes: stored.length,
    sha256: crypto.createHash('sha256').update(stored).digest('hex'),
  });
}
