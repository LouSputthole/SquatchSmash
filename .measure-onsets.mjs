#!/usr/bin/env node
/* Where is the BOOM in each clip?
 *
 * Decodes the four owner-delivered mp3s in a real browser with an
 * OfflineAudioContext and reports, per clip: peak, the loudest 10 ms window,
 * and the FIRST 10 ms window within 6 dB of the peak — the transient, rather
 * than the loudest sample somewhere in the tail.
 *
 * The probe page is served from the same origin as the audio (a page on
 * about:blank cannot fetch http://localhost/... — CORS).
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const ROOT = '/home/user/SquatchSmash';
const PORT = Number(process.env.PORT) || 5989;
const CLIPS = [
  'assets/sfx/enola.bomb.falling.mp3',
  'assets/sfx/enola.blast.a.mp3',
  'assets/sfx/enola.blast.b.mp3',
  'assets/sfx/enola.blast.c.mp3',
];

const PROBE_HTML = '<title>onset probe</title><p>onset probe</p>';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/probe.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PROBE_HTML);
    return;
  }
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': 'audio/mpeg' }).end(await fsp.readFile(file));
});
await new Promise((r) => server.listen(PORT, r));

const { chromium } = await import('playwright');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('console', (m) => console.log('  [page]', m.text()));
await page.goto(`http://localhost:${PORT}/probe.html`);

const rows = await page.evaluate(async ({ clips }) => {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const out = [];
  for (const clip of clips) {
    const res = await fetch(`/${clip}`);
    const bytes = await res.arrayBuffer();
    // A throwaway context just to decode; length/rate here are irrelevant.
    const ctx = new OAC(1, 1024, 44100);
    const buf = await ctx.decodeAudioData(bytes);
    const rate = buf.sampleRate;
    // Mono sum, so a transient panned to one side is not missed.
    const n = buf.length;
    const mix = new Float32Array(n);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) mix[i] += d[i] / buf.numberOfChannels;
    }
    const win = Math.round(rate * 0.01);          // 10 ms
    const windows = Math.floor(n / win);
    const rms = new Float32Array(windows);
    let peakSample = 0;
    for (let w = 0; w < windows; w++) {
      let sum = 0;
      for (let i = w * win; i < (w + 1) * win; i++) {
        const v = mix[i];
        sum += v * v;
        const a = Math.abs(v);
        if (a > peakSample) peakSample = a;
      }
      rms[w] = Math.sqrt(sum / win);
    }
    let peakRms = 0; let peakWin = 0;
    for (let w = 0; w < windows; w++) if (rms[w] > peakRms) { peakRms = rms[w]; peakWin = w; }
    const six = peakRms * Math.pow(10, -6 / 20);
    const three = peakRms * Math.pow(10, -3 / 20);
    const ten = peakRms * Math.pow(10, -10 / 20);
    const first = (thr) => { for (let w = 0; w < windows; w++) if (rms[w] >= thr) return w * 0.01; return null; };
    // Where the energy first leaves the noise floor at all, for context.
    const floor = (() => {
      const sorted = Array.from(rms).sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length * 0.1)];
    })();
    out.push({
      clip,
      duration: buf.duration,
      rate,
      channels: buf.numberOfChannels,
      peakSample,
      peakRms,
      loudestWindow: peakWin * 0.01,
      onset6: first(six),
      onset3: first(three),
      onset10: first(ten),
      floor,
      // A coarse profile: peak RMS per 100 ms for the first 4 s.
      profile: Array.from({ length: Math.min(40, Math.floor(windows / 10)) }, (_, k) => {
        let m = 0;
        for (let w = k * 10; w < (k + 1) * 10 && w < windows; w++) m = Math.max(m, rms[w]);
        return Number((20 * Math.log10(Math.max(m, 1e-6) / peakRms)).toFixed(1));
      }),
    });
  }
  return out;
}, { clips: CLIPS });

for (const r of rows) {
  console.log(`\n${r.clip}`);
  console.log(`  duration ${r.duration.toFixed(3)}s  ${r.rate}Hz  ${r.channels}ch`);
  console.log(`  peak sample ${r.peakSample.toFixed(4)}  peak 10ms RMS ${r.peakRms.toFixed(4)} at ${r.loudestWindow.toFixed(2)}s`);
  console.log(`  first window within  3 dB of peak: ${r.onset3}s`);
  console.log(`  first window within  6 dB of peak: ${r.onset6}s   <-- ONSET`);
  console.log(`  first window within 10 dB of peak: ${r.onset10}s`);
  console.log(`  dB-rel-peak per 100ms (first 4s): ${r.profile.join(' ')}`);
}
console.log(`\nJSON: ${JSON.stringify(rows.map(({ clip, duration, onset6, onset3, onset10, loudestWindow }) => ({ clip, duration, onset3, onset6, onset10, loudestWindow })))}`);

await browser.close();
server.close();
