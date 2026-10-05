// Actual Game/View proof for the three owner-requested corrections. Never writes a save.
import {chromium} from 'playwright';import {mkdirSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const out=process.env.REVIEW_OUT||new URL('./out/wolf-leap-warcry-proof/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
const page=await browser.newPage({viewport:{width:960,height:720}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(m.text());});
await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.proofRAF=raf;window.requestAnimationFrame=cb=>raf(t=>{if(!window.proofFreeze)cb(t);});});
await page.goto((process.env.REVIEW_URL||'http://localhost:4193/')+'?fresh=1&kit=staff&seed=9&quality=low&dynres=0');await page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game?.time>.2,null,{timeout:90000});
await page.evaluate(()=>{const f=__frontier,g=f.game,p=g.player;f.paused=true;f.input.reset();f.hud.setQuestCollapsed(true);window.proofFreeze=true;g.spawnPoints=[];g.monsters=[];for(const k in g.ch.stats)g.ch.stats[k]=20;f.view.zoom=1;
const render=f.view.renderer.render.bind(f.view.renderer);f.proofDraw=()=>render(f.view.scene,f.view.camera);f.view.renderer.render=()=>{};
f.proofStep=()=>{g.update(1/60);for(const e of g.drainEvents())f.view.handleEvent(e);f.view.render(1/60,g.time,{});f.hud.update(1/60,{});};});
const results=[];
for(const skill of (process.argv.length>2?process.argv.slice(2):['spirit_wolf','leap','war_cry'])){
mkdirSync(`${out}/${skill}`,{recursive:true});
await page.evaluate(skill=>{const f=__frontier,g=f.game,p=g.player;g.allies=[];p.x=-103;p.z=44;p.facing=Math.PI/2;p.dash=null;p.cast=null;g.player.cooldowns={};if(skill==='leap')g.ch.movement='leap';else{g.ch.skills[skill]=1;g.ch.slots[0]={skill,mods:[]};}g.refresh(true);p.movement.charges=1;g.setAimPoint(p.x+3,p.z);f.view.snapCamera();const ok=skill==='leap'?g.useMovement({x:p.x+3,z:p.z}):g.castSlot(0,{x:p.x,z:p.z});if(!ok)throw Error('cast failed '+skill);},skill);
for(let i=0;i<60;i++){
await page.evaluate(()=>{__frontier.proofStep();__frontier.proofStep();__frontier.proofDraw();});
await page.screenshot({path:`${out}/${skill}/frame-${String(i).padStart(3,'0')}.png`});
}
const info=await page.evaluate(()=>{const f=__frontier,rig=[...f.view.allyViews.values()][0]?.rig;let skinned=0,mapped=0;if(rig)rig.root.traverse(o=>{if(o.isSkinnedMesh){skinned++;if(o.material.map)mapped++;}});return {active:f.view.vfx.active.length,model:rig?.model,source:rig?.modelSource,skinned,mapped};});
assert.equal(info.active,0,skill+' lingering transient');if(skill==='spirit_wolf'){assert.equal(info.source,'thornback_wolf');assert(info.model&&info.skinned>0&&info.mapped>0,'native textured wolf required');}
results.push({skill,...info});console.log(JSON.stringify(results.at(-1)));
}
assert.equal(errors.length,0,errors.join('\n'));writeFileSync(`${out}/report-${process.argv.slice(2).join('-')||'all'}.json`,JSON.stringify({results,errors,review:'Actual Game/View, 30 Hz sampled simulation; frames reviewed, no device FPS claim'},null,2));
}finally{await browser.close();}
