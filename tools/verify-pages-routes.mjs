#!/usr/bin/env node
/**
 * Verify the public HTML routes in the staged GitHub Pages artifact.
 *
 * The preview launcher is the player-facing index for standalone scenes and
 * checkpoints, so its links are the contract. This verifier deliberately
 * runs against the staged directory rather than the source tree: a page can
 * exist locally and still 404 after an explicit-copy deployment omits it.
 *
 *   node tools/verify-pages-routes.mjs _site
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_ROOT = path.resolve(process.argv[2] || process.env.SITE_ROOT || ROOT);

function linkedHtmlRoutes(html) {
  const routes = new Set();
  for (const article of html.matchAll(/<article\b[\s\S]*?<\/article>/gi)) {
    const card = article[0];
    if (!/data-preview-(?:scene|apartment|tool)=/i.test(card)) continue;
    for (const match of card.matchAll(/\bhref=["']([^"']+\.html(?:\?[^"']*)?)["']/gi)) {
      const href = match[1].replaceAll('&amp;', '&');
      const url = new URL(href, 'http://pages.invalid/preview.html');
      routes.add(`${url.pathname}${url.search}`);
    }
  }
  return [...routes].sort();
}

function contentType(file) {
  return path.extname(file).toLowerCase() === '.html'
    ? 'text/html; charset=utf-8'
    : 'application/octet-stream';
}

async function serveSite(root) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.resolve(root, relative || 'index.html');
    if (!file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const body = await fs.readFile(file);
      response.writeHead(200, { 'content-type': contentType(file) }).end(body);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        response.writeHead(404, { 'content-type': 'text/plain' }).end('404 Not Found');
        return;
      }
      response.writeHead(500, { 'content-type': 'text/plain' }).end(String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

const previewPath = path.join(SITE_ROOT, 'preview.html');
const preview = await fs.readFile(previewPath, 'utf8').catch((error) => {
  console.error(`Pages route verifier could not read ${previewPath}: ${error.message}`);
  process.exitCode = 1;
  return null;
});

if (preview !== null) {
  const routes = linkedHtmlRoutes(preview);
  const server = await serveSite(SITE_ROOT);
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const failures = [];

  try {
    for (const route of routes) {
      const response = await fetch(`${base}${route}`, { redirect: 'manual' });
      const result = `${response.status} ${route}`;
      console.log(`${response.ok ? 'ok  ' : 'FAIL'} ${result}`);
      if (!response.ok) failures.push(result);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length}/${routes.length} staged Pages routes failed.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${routes.length} staged Pages routes returned HTTP 200.`);
  }
}
