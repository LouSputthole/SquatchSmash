import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/**
 * Launch the Chromium Playwright can actually find on this machine.
 *
 * Playwright pins an exact browser revision and refuses to start if the
 * installed build does not match — which is what happens on a container whose
 * browser cache was baked against a different Playwright than the one in
 * `node_modules`. There is no network in here to `npx playwright install` with,
 * so rather than have every browser gate die on a version number, fall back to
 * whatever Chromium is actually present under the browsers path.
 *
 * The default is always tried first, so a correctly provisioned machine gets
 * the pinned build and nothing about this changes.
 */
function discoverChromium() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    path.join(process.env.HOME ?? '/root', '.cache', 'ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const builds = fs.readdirSync(root)
      .filter((name) => name.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const build of builds) {
      for (const candidate of [
        path.join(root, build, 'chrome-linux', 'chrome'),
        path.join(root, build, 'chrome-linux', 'headless_shell'),
      ]) {
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

export async function launchChromium(options = {}) {
  try {
    return await chromium.launch(options);
  } catch (error) {
    const executablePath = discoverChromium();
    if (!executablePath) throw error;
    console.log(`  note  Playwright's pinned Chromium is missing; using ${executablePath}`);
    return chromium.launch({ ...options, executablePath });
  }
}
