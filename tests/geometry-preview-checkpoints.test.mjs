import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { GEOMETRY_SCENE_STATES } from '../tools/geometry-scenes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function launcherIdFor(url) {
  const page = path.posix.basename(url.pathname, '.html');
  if (page === 'bing' && url.searchParams.get('visit') === '2') return 'bing-two';
  return page;
}

async function publicCheckpointLinks() {
  const html = await readFile(path.join(ROOT, 'preview.html'), 'utf8');
  const links = [...html.matchAll(/href="([^"]*\bcheckpoint=[^"]+)"/g)]
    .map(([, encodedHref]) => {
      const url = new URL(encodedHref.replaceAll('&amp;', '&'), 'https://preview.invalid/');
      return Object.freeze({
        launcherId: launcherIdFor(url),
        checkpoint: url.searchParams.get('checkpoint'),
        href: `${url.pathname.slice(1)}${url.search}`,
      });
    });
  const unique = new Map(
    links.map((link) => [`${link.launcherId}:${link.checkpoint}`, link]),
  );
  return [...unique.values()].sort((left, right) => (
    left.launcherId.localeCompare(right.launcherId)
    || left.checkpoint.localeCompare(right.checkpoint)
  ));
}

test('every public preview checkpoint has exactly one headless geometry state', async () => {
  const publicLinks = await publicCheckpointLinks();
  assert.ok(publicLinks.length > 0, 'preview.html exposed no checkpoint links');
  for (const link of publicLinks) {
    const matches = GEOMETRY_SCENE_STATES.filter(({ launcherIds, checkpoint, checkpointAliases = [] }) => (
      launcherIds.includes(link.launcherId)
      && (checkpoint === link.checkpoint || checkpointAliases.includes(link.checkpoint))
    ));
    assert.equal(
      matches.length,
      1,
      `${link.href} must map to exactly one geometry descriptor; got ${matches.map(({ id }) => id)}`,
    );
  }

  const publicKeys = new Set(
    publicLinks.map(({ launcherId, checkpoint }) => `${launcherId}:${checkpoint}`),
  );
  for (const descriptor of GEOMETRY_SCENE_STATES.filter(({ checkpoint }) => checkpoint)) {
    for (const launcherId of descriptor.launcherIds) {
      for (const checkpoint of [descriptor.checkpoint, ...(descriptor.checkpointAliases ?? [])]) {
        assert.ok(
          publicKeys.has(`${launcherId}:${checkpoint}`),
          `${descriptor.id} invents non-public checkpoint ${launcherId}:${checkpoint}`,
        );
      }
    }
  }
});
