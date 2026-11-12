'use strict';
/**
 * Собирает автономную демо-версию в один HTML-файл (dist/delete-demo.html):
 * без сервера — данные в браузере, боты отвечают локально.
 *   npm run build:demo
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');
const seed = require('./seed');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist', 'delete-demo.html');

/* ---------- сид в памяти, медиа → data: URI */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-seed-'));
let n = 0;
const db = { users: [], tokens: {}, follows: [], posts: [], stories: [], messages: [] };
seed(db, { mediaDir: tmp, hashPassword: () => ({ salt: '', hash: '' }), id: () => 'x' + (++n).toString(36) });
let json = JSON.stringify(db);
for (const f of fs.readdirSync(tmp)) {
  const uri = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(tmp, f)).toString('base64');
  json = json.split('/media/' + f).join(uri);
}
fs.rmSync(tmp, { recursive: true, force: true });
const data = JSON.parse(json);
for (const u of data.users) { delete u.salt; delete u.hash; }

/* ---------- синтетические «голосовые», чтобы плеер можно было попробовать сразу */
function synthVoice(seedNum, seconds) {
  const rate = 8000, len = Math.floor(rate * seconds);
  const pcm = new Int16Array(len);
  let s = seedNum;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const env = [];
  let t = 0.15;
  while (t < seconds - 0.2) {
    const d = 0.09 + rnd() * 0.18;
    env.push([t, d, 0.5 + rnd() * 0.5, 110 + rnd() * 70]);
    t += d + (rnd() < 0.18 ? 0.25 + rnd() * 0.3 : 0.02 + rnd() * 0.05);
  }
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const time = i / rate;
    const syl = env.find(([a, d]) => time >= a && time < a + d);
    if (!syl) continue;
    const [a, d, amp, f0] = syl;
    const x = (time - a) / d;
    const e = Math.sin(Math.PI * x) ** 0.8 * amp;
    const f = f0 * (1 + 0.08 * Math.sin(2 * Math.PI * 3 * time));
    phase += (2 * Math.PI * f) / rate;
    let v = 0;
    for (let h = 1; h <= 12; h++) {
      const fh = f * h;
      const formant = Math.exp(-((fh - 600) ** 2) / 90000) + 0.6 * Math.exp(-((fh - 1500) ** 2) / 200000) + 0.15;
      v += (Math.sin(phase * h) * formant) / h;
    }
    v += (rnd() - 0.5) * 0.05;
    pcm[i] = Math.max(-32767, Math.min(32767, v * e * 9000));
  }
  const buf = Buffer.alloc(44 + len * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + len * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(len * 2, 40);
  Buffer.from(pcm.buffer).copy(buf, 44);
  const wf = [];
  for (let k = 0; k < 40; k++) {
    let m = 0;
    for (let j = Math.floor((k * len) / 40); j < Math.floor(((k + 1) * len) / 40); j += 8) m = Math.max(m, Math.abs(pcm[j]));
    wf.push(m);
  }
  const mx = Math.max(...wf, 1);
  return { media: 'data:audio/wav;base64,' + buf.toString('base64'), duration: seconds, waveform: wf.map((v) => +Math.max(0.08, v / mx).toFixed(2)) };
}
const now = Date.now();
data.seededAt = now;
const byName = (u) => data.users.find((x) => x.username === u);
const demo = byName('demo');
data.messages.push({ id: 'v1', from: byName('arinka').id, to: demo.id, type: 'voice', text: '', ...synthVoice(7, 6), createdAt: now - 12 * 60e3, readAt: null });
data.messages.push({ id: 'v2', from: byName('delete').id, to: demo.id, type: 'voice', text: '', ...synthVoice(42, 4), createdAt: now - 7 * 60e3, readAt: now - 6 * 60e3 });

/* ---------- бандл */
const redirectApi = {
  name: 'mock-api',
  setup(b) { b.onResolve({ filter: /\/api\.js$/ }, () => ({ path: path.join(ROOT, 'public/js/mock.js') })); },
};
esbuild.build({
  entryPoints: [path.join(ROOT, 'public/js/app.js')],
  bundle: true, format: 'iife', minify: true, write: false, target: ['es2020', 'safari15'],
  plugins: [redirectApi],
}).then((res) => {
  const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  const html = `<title>delete</title>
<meta name="theme-color" content="#000000">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Unbounded:wght@600;700&display=swap" rel="stylesheet">
<style>:root{color-scheme:dark}
${css}</style>
<div id="app"></div>
<div id="sheet-root"></div>
<div id="toast"></div>
<script>window.DELETE_DEMO=true;window.DELETE_SEED=${JSON.stringify(data).replace(/</g, '\\u003c')};</script>
<script>${js}</script>
`;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log('OK', OUT, (html.length / 1024).toFixed(0) + ' KB');
});
