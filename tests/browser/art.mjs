import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { ART, art } from '../../src/ui/art.js';
const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out,{recursive:true});
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});
for(const [kind,entries] of Object.entries(ART)){
 await page.setContent('<html><head><style>*{box-sizing:border-box}body{margin:0;padding:30px;color:#413d33;background:#efe9d9;font:14px sans-serif}h1{font-weight:400}main{display:grid;grid-template-columns:repeat(7,1fr);gap:12px}article{display:grid;place-items:center;padding:12px 5px;background:#fbf8ed;border:1px solid #c7c0aa;border-radius:8px;text-align:center;gap:8px}svg{width:120px;height:120px;display:block}.art{display:block}</style></head><body><h1>'+kind+'</h1><main>'+Object.keys(entries).map(id=>'<article>'+art(kind,id)+'<span>'+id+'</span></article>').join('')+'</main></body></html>');
 await page.screenshot({path:out+'art-'+kind+'.png',fullPage:true});
}
await browser.close();

