// Production player build, failed admission only: never construct the resident world.
// Build first with VITE_PRESENCE_URL=ws://127.0.0.1:3001/presence npm run build:player.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const root=resolve('dist'), origin='http://127.0.0.1:4173', out=resolve('tests/browser/out/player-entry');
mkdirSync(out,{recursive:true});
const scripts=readdirSync(resolve(root,'assets')).filter(p=>p.endsWith('.js'));
const gameChunks=scripts.filter(p=>readFileSync(resolve(root,'assets',p),'utf8').includes('__frontier'));
assert.ok(gameChunks.length,'identify the actual game module, rather than the small entry also named main');
const endpoint='ws://127.0.0.1:3001/presence';
assert.ok(scripts.some(p=>readFileSync(resolve(root,'assets',p),'utf8').includes(endpoint)),'rebuild with the documented localhost endpoint');
assert.ok(scripts.every(p=>!readFileSync(resolve(root,'assets',p),'utf8').includes('frontier-presence-prototype.onrender.com')),'restricted host must be absent before opening this build');
const rejected=createServer(); rejected.on('upgrade',(_,s)=>setTimeout(()=>s.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'),700));
const web=createServer((req,res)=>{
  const path=new URL(req.url,origin).pathname, file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+'/')) {res.writeHead(404);return res.end();}
  try {res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));} catch {res.writeHead(404);res.end();}
});
let browser;
try {
  rejected.listen(3001,'127.0.0.1'); await once(rejected,'listening'); web.listen(4173,'127.0.0.1'); await once(web,'listening');
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium'});
  const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true}), requests=[],errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/*',route=>{const u=new URL(route.request().url());assert.equal(u.origin,origin);requests.push(u.pathname);return route.continue();});
  await page.goto(origin+'/'); await page.locator('.online-gate').waitFor();
  await page.screenshot({path:resolve(out,'production-connecting.png')});
  await page.waitForFunction(()=>document.querySelector('.online-gate h1')?.textContent.includes('Failed'));
  assert.equal(await page.evaluate(()=>typeof window.__frontier),'undefined');
  assert.equal(await page.locator('[data-retry]').isVisible(),true);
  assert.equal(await page.locator('.online-card a').getAttribute('href'),'./offline.html');
  assert.equal(requests.some(p=>gameChunks.includes(p.split('/').pop()) || /^\/assets\/game-[^/]+\.js$/.test(p)),false,'game/renderer chunks are not fetched before admission');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:resolve(out,'production-failed.png')});
  const evidence={endpoint,gameConstructed:false,mainChunkFetched:false,gameChunks,requests,errors,assets:Object.fromEntries(scripts.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,'assets',p))).digest('hex')]))};
  writeFileSync(resolve(out,'results.json'),JSON.stringify(evidence,null,2));
  console.log('PASS production player Connecting/Failed/Retry, explicit offline link, zero game chunk/world');
} finally {await browser?.close();if(rejected.listening)await new Promise(r=>rejected.close(r));if(web.listening)await new Promise(r=>web.close(r));}
