// usage (from the repo root): PAGE=frost-nova.html node docs/review/fx-prototypes/capture.mjs <outDir> [fps] [slowFactor]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const out = process.argv[2];
const fps = Number(process.argv[3] || 30);
const slow = Number(process.argv[4] || 1);
fs.mkdirSync(out, { recursive: true });

const server = http.createServer((req, res) => {
  const f = path.join(root, req.url === '/' ? (process.env.PAGE || 'chain-spark.html') : req.url.split('?')[0]);
  res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/html');
  fs.createReadStream(f).on('error', () => { res.statusCode = 404; res.end(); }).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('console', m => console.log('page:', m.text()));
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.ready);
const loop = await page.evaluate(() => window.LOOP);
const n = Math.round(loop * fps * slow);
for (let i = 0; i < n; i++) {
  const t = i / (fps * slow);
  await page.evaluate(t => window.renderAt(t), t);
  await page.locator('canvas').screenshot({ path: path.join(out, `f${String(i).padStart(4, '0')}.png`) });
}
console.log('frames', n);
await browser.close();
server.close();
