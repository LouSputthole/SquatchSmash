import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
const ROOT = '/home/user/SquatchSmash';
const PORT = 5989;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/probe.html') { res.writeHead(200, {'content-type':'text/html'}).end('<title>p</title>'); return; }
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404).end('x'); return; }
  res.writeHead(200, {'content-type':'audio/mpeg'}).end(await fsp.readFile(file));
});
await new Promise((r) => server.listen(PORT, r));
const { chromium } = await import('playwright');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`http://localhost:${PORT}/probe.html`);
const rows = await page.evaluate(async () => {
  const OAC = window.OfflineAudioContext;
  const out = [];
  for (const clip of ['assets/sfx/enola.bomb.falling.mp3','assets/sfx/enola.blast.a.mp3','assets/sfx/enola.blast.b.mp3','assets/sfx/enola.blast.c.mp3']) {
    const buf = await new OAC(1,1024,44100).decodeAudioData(await (await fetch('/'+clip)).arrayBuffer());
    const n = buf.length, rate = buf.sampleRate;
    const mix = new Float32Array(n);
    for (let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<n;i++)mix[i]+=d[i]/buf.numberOfChannels;}
    const win = Math.round(rate*0.05), windows = Math.floor(n/win);
    const rms = new Float32Array(windows);
    for (let w=0;w<windows;w++){let s=0;for(let i=w*win;i<(w+1)*win;i++)s+=mix[i]*mix[i];rms[w]=Math.sqrt(s/win);}
    let peak=0; for(const v of rms) if(v>peak) peak=v;
    const db = (v)=>20*Math.log10(Math.max(v,1e-7)/peak);
    // last window above -20 dB and above -30 dB of peak
    let last20=null,last30=null;
    for(let w=windows-1;w>=0;w--){ if(last20===null&&db(rms[w])>=-20) last20=w*0.05; if(last30===null&&db(rms[w])>=-30){last30=w*0.05;break;} }
    out.push({clip, duration: buf.duration, last20, last30,
      tail: Array.from({length: Math.min(24, windows)}, (_,k)=>Number(db(rms[windows-24+k]||0).toFixed(1)))});
  }
  return out;
});
for (const r of rows) console.log(r.clip, '\n  dur', r.duration.toFixed(3), 'last>-20dB', r.last20, 'last>-30dB', r.last30, '\n  last 1.2s (50ms windows, dB rel peak):', r.tail.join(' '));
await browser.close(); server.close();
