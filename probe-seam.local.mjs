import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 5741;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.mp3': 'audio/mpeg' };
const { chromium } = await import('playwright');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('nf'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await fsp.readFile(file));
});
await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
try {
  await page.goto(`http://localhost:${PORT}/mansion-siege.html?preview=1`, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.mansionSiege?.scene, null, { timeout: 240000 });
  const rows = await page.evaluate(() => {
    const S = window.mansionSiege;
    const out = [];
    for (let z = 47.4; z <= 48.8; z += 0.05) {
      out.push({
        z: +z.toFixed(2),
        atFeet6: S.interior?.floorAt ? +(S.interior.floorAt(7, z, 6.1) ?? NaN).toFixed(3) : 'no api',
        atFeet58: S.interior?.floorAt ? +(S.interior.floorAt(7, z, 5.8) ?? NaN).toFixed(3) : 'no api',
        west: S.interior?.floorAt ? +(S.interior.floorAt(-7, z, 6.1) ?? NaN).toFixed(3) : 'no api',
      });
    }
    return out;
  });
  for (const r of rows) console.log(JSON.stringify(r));
} finally { await browser.close(); server.close(); }
