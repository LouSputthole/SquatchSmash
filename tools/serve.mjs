#!/usr/bin/env node
/**
 * Zero-dependency static server for local development.
 *
 *   npm start          -> http://localhost:5173
 *   PORT=8080 npm start
 *
 * The project is plain ES modules with no build step, so any static server
 * works; this one exists so `npm start` does the right thing out of the box.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';

    // Resolve inside ROOT only — no climbing out with ../
    const abs = path.join(ROOT, path.normalize(rel));
    if (!abs.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const stat = await fsp.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('404 Not Found');
      return;
    }

    res.writeHead(200, {
      'content-type': TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'no-cache',
    });
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err));
  }
});

server.listen(PORT, () => {
  console.log(`Squatch Smash → http://localhost:${PORT}`);
});
