// Focused real Game/Panels test: no WebGL dependency; routes real public PNG bytes.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {build} from 'vite';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
const out=new URL('./out/upgrade-materials/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const result=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:new URL('./workspace-harness.js',import.meta.url).pathname,name:'UpgradeIntegration',formats:['iife']}}});
const code=result[0].output.find(f=>f.type==='chunk').code;
let css=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','skill-journal/journal','loadout-workspace'].map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');
for(const w of [400,600])css+=`@font-face{font-family:AtlasThai;src:url(data:font/ttf;base64,${readFileSync(new URL(`../../src/ui/skill-journal/fonts/noto-thai-${w}.ttf`,import.meta.url)).toString('base64')});font-weight:${w}}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});
const reports=[];
try{for(const [label,width,height,touch] of [['desktop',1440,900,false],['ipad',1180,820,true]]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://upgrade.local/**',async route=>{const url=new URL(route.request().url());if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="hud"></div></body></html>'});const file=new URL('../../public/'+url.pathname.slice(1),import.meta.url);return existsSync(file)?route.fulfill({path:file.pathname}):route.fulfill({status:404,body:''});});
 await page.goto('http://upgrade.local/');await page.addStyleTag({content:css});await page.addScriptTag({content:code});
 await page.evaluate(()=>{const {game:g,panels:p}=__frontier;g.ch.level=30;g.ch.gold=2000;for(const k in g.ch.stats)g.ch.stats[k]=100;g.ch.materials={enhancement_stone:16,skill_crystal:15,boar_hide:8,boar_tusk:7};g.ch.mods.push({uid:g.ch.nextUid++,id:'split',level:1,grade:'B'});[g.player.x,g.player.z]=g.data.world.town.workbench;g.refresh();p.open('bag');});
 const tap=async s=>{const e=page.locator(s).first();if(touch)await e.tap();else await e.click();};
 const ready=async()=>{await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.images].every(i=>i.complete));};
 await tap('[data-action="bag-category"][data-id="material"]');await tap('[data-action="material"][data-id="enhancement_stone"]');await ready();
 assert.equal(await page.locator('[data-art="material/enhancement_stone"] img').first().evaluate(i=>i.naturalWidth),512);assert.equal(await page.locator('[data-art="material/skill_crystal"] img').first().evaluate(i=>i.naturalWidth),512);
 await page.screenshot({path:out+label+'-bag.png'});await tap('[data-action="details"]');assert.match(await page.locator('.atelier-dialog').innerText(),/3%/);assert.match(await page.locator('.atelier-dialog').innerText(),/ไม่เปลี่ยนเกรด/);await page.screenshot({path:out+label+'-source.png'});
 // Reopen the bag to clear its material detail and select existing equipment.
 await page.evaluate(()=>{__frontier.panels.close();__frontier.panels.open('bag');});await tap('[data-action="bag-category"][data-id="gear"]');await tap('[data-action="details"]');
 const cost=page.locator('.upgrade-cost');assert.match(await cost.innerText(),/หินเสริมอุปกรณ์/);assert.doesNotMatch(await cost.innerText(),/หนังหมูป่า|ผงเรืองแสง/);await cost.locator('.cost').scrollIntoViewIfNeeded();await ready();await page.screenshot({path:out+label+'-equipment.png'});
 await tap('[data-act="gear-up"]');assert.equal(await page.evaluate(()=>__frontier.game.ch.gear[0].upgrade),1);assert.equal(await page.evaluate(()=>__frontier.game.ch.materials.enhancement_stone),15);
 await page.evaluate(()=>{__frontier.panels.close();__frontier.panels.open('growth');});await page.locator('[data-act="skill-up"][data-skill="slash"]').scrollIntoViewIfNeeded();await ready();await page.screenshot({path:out+label+'-skill.png'});await tap('[data-act="skill-up"][data-skill="slash"]');assert.equal(await page.evaluate(()=>__frontier.game.ch.skills.slash),2);assert.equal(await page.evaluate(()=>__frontier.game.ch.materials.skill_crystal),14);
 await tap('[data-act="growth-filter"][data-id="mod"]');await page.locator('[data-act="mod-up"]').first().scrollIntoViewIfNeeded();await ready();await page.screenshot({path:out+label+'-mod.png'});await tap('[data-act="mod-up"]');assert.equal(await page.evaluate(()=>__frontier.game.ch.mods.find(m=>m.id==='split').level),2);assert.equal(await page.evaluate(()=>__frontier.game.ch.materials.skill_crystal),12);
 await page.evaluate(()=>{__frontier.game.ch.materials.skill_crystal=0;__frontier.panels.render(true);});assert.ok(await page.locator('[data-act="mod-up"]').first().isDisabled());
 assert.deepEqual(errors,[]);reports.push({label,width,height,touch,errors,verified:['512px real PNGs','material source/use','equipment payment','skill payment','mod payment','insufficient crystal disables upgrade']});await context.close();
}writeFileSync(out+'report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));}finally{await browser.close();}
