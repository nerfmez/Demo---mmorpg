// Real-game HUD visual review and hit testing. No concept image compositing.
// BROWSER=webkit for Safari engine; QUICK=1 for only the iPad viewport.
import assert from 'node:assert/strict';
import {art} from '../../src/ui/art.js';
import {data} from '../core/helpers.js';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const name=process.env.BROWSER==='webkit'?'webkit':'chromium',engine=name==='webkit'?webkit:chromium;
const out=new URL(`./out/fieldhud-${name}/`,import.meta.url).pathname;mkdirSync(out,{recursive:true});
const port=4192,server=spawn('npx',['vite','preview','--port',String(port),'--strictPort'],{stdio:'ignore',detached:true});
let browser;const reports=[];
try {
 for(let i=0;;i++){try{if((await fetch(`http://localhost:${port}/`)).ok)break;}catch{}if(i>60)throw Error('server did not start');await new Promise(r=>setTimeout(r,250));}
 browser=await engine.launch({executablePath:name==='chromium'?process.env.CHROMIUM_EXECUTABLE:undefined,args:name==='chromium'?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const sizes=process.env.QUICK?[['ipad',1180,820,true]]:[['ipad',1180,820,true],['desktop',1600,900,false],['phone-landscape',844,390,true],['phone-portrait',390,844,true]];
 for(const [size,width,height,touch]of sizes){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://localhost:${port}/?fresh=1&seed=7&quality=low`);
  await page.waitForFunction(()=>window.__frontier?.game?.time>.3,null,{timeout:60000});
  await page.waitForFunction(()=>window.__frontier?.modelsReady===true,null,{timeout:90000});
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(async()=>{
   const f=window.__frontier,g=f.game;
   f.paused=true;f.input.reset();
   // Never-saved review fixture: existing world, hero and monsters, only sample progress.
   g.ch.name='นักเดินทาง';f.hud.el.frame.querySelector('.pname').textContent=g.ch.name;g.ch.level=19;g.ch.jobLevel=20;g.ch.gold=2536;
   const curve=g.data.progression.character.expCurve;
   g.ch.exp=Math.round(Math.round(curve.base*Math.pow(19,curve.exponent))*.952);g.ch.jobExp=0;
   for(const s in g.ch.stats)g.ch.stats[s]=20;
   g.ch.slots=[{skill:'slash',mods:[]},{skill:'frost_nova',mods:[]},{skill:'whirl_blade',mods:[]},{skill:'ward',mods:[]}];
   for(const {skill}of g.ch.slots)g.ch.skills[skill]=1;
   g.refresh(true);g.player.hp=Math.round(g.player.maxHp*.82);
   Object.assign(g.player,g.freeSpotNear(-79,4));g.player.facing=1.1;
   const wolves=g.monsters.filter(m=>m.type==='thornback_wolf').slice(0,3);
   wolves.forEach((m,i)=>{m.x=g.player.x+[-2.5,3,2][i];m.z=g.player.z+[0,-1,-4][i];m.aggro=true;m.hp=m.maxHp*(.45+i*.18);m.facing=-1.5+i;});
   g.player.targetId=wolves[0]?.id;f.view.snapCamera();
   f.hud.setQuestCollapsed(false);f.hud.el.zone.style.opacity=0;document.querySelector('.banner')?.remove();
   f.input.refreshButtons();
  });
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await settle();
  const activate=async selector=>touch?page.locator(selector).tap():page.locator(selector).click();
  const targets=['.pframe','.minimap','.quick-actions [aria-label="กระเป๋า"]','.quick-actions [aria-label="สกิล"]','.menu-toggle','.quest-collapse','.questtrack','.sbtn.attack','.sbtn.s1','.sbtn.s2','.sbtn.s3','.sbtn.move'];
  for(const selector of targets){
   const hit=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {w:r.width,h:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom,hit:el.contains(h)};});
   assert.ok(hit.w>=34&&hit.h>=32&&hit.left>=0&&hit.top>=0&&hit.right<=width+1&&hit.bottom<=height+1&&hit.hit,`${size}: ${selector} ${JSON.stringify(hit)}`);
  }
  const controls=await page.locator('.sbtn').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(let a=0;a<controls.length;a++)for(let b=a+1;b<controls.length;b++){
   const A=controls[a],B=controls[b];assert.ok(A.x+A.w<=B.x||B.x+B.w<=A.x||A.y+A.h<=B.y||B.y+B.h<=A.y,`${size}: combat controls overlap ${a}/${b}`);
  }
  const xp=await page.locator('.xpstrip').boundingBox();assert.equal(Math.round(xp.y+xp.height),height);
  assert.equal(await page.locator('.combat .sbtn').count(),5);
  assert.equal(await page.locator('.combat .art-skill').count(),5);
  assert.equal(await page.locator('.combat [data-field-skill]').count(),0);
  const expectedArt=Object.fromEntries([...Object.keys(data.skills.combat),...Object.keys(data.skills.movement)].map(id=>[id,art('skill',id)]));
  const verifiedArt=await page.evaluate(expected=>{
    const f=window.__frontier,g=f.game;
    const saved={slots:g.ch.slots.map(s=>({...s,mods:[...s.mods]})),skills:{...g.ch.skills},movement:g.ch.movement};
    let checked=0;
    const check=(button,id)=>{
      const template=document.createElement('template');template.innerHTML=expected[id];
      if(button.querySelector('.ic').innerHTML!==template.innerHTML)throw Error('Original artwork mismatch: '+id);
      const svg=button.querySelector('.art-skill>svg');
      if(!svg||getComputedStyle(svg).filter!=='none')throw Error('Artwork recoloured: '+id);
      const r=svg.getBoundingClientRect(),b=button.getBoundingClientRect();
      if(r.width<16||r.height<16||r.left<b.left||r.top<b.top||r.right>b.right||r.bottom>b.bottom)throw Error('Artwork clipped: '+id);
      checked++;
    };
    try {
      for(const id of Object.keys(g.data.skills.combat)){
        g.ch.slots[0]={skill:id,mods:[]};g.ch.skills[id]=1;g.refresh();f.input.refreshButtons();
        check(f.input.buttons[0],id);
      }
      for(const id of Object.keys(g.data.skills.movement)){
        g.ch.movement=id;g.refresh();f.input.refreshButtons();check(f.input.moveBtn,id);
      }
    } finally {
      g.ch.slots=saved.slots;g.ch.skills=saved.skills;g.ch.movement=saved.movement;g.refresh();f.input.refreshButtons();
    }
    return checked;
  },expectedArt);
  assert.equal(verifiedArt,Object.keys(expectedArt).length,'all original skill images verified');
  await settle();
  await page.screenshot({path:out+size+'-hud.png',timeout:60000});
  await activate('.quest-collapse');assert.equal(await page.locator('.quest-collapse').getAttribute('aria-expanded'),'false');
  await activate('.quest-collapse');
  await activate('.quick-actions [aria-label="สกิล"]');assert.equal(await page.locator('#panel-title').textContent(),'ชุดสกิล');
  await activate('.panel-close');
  await activate('.menu-toggle');await activate('.menu [aria-label="Job Tree"]');
  const full=await page.locator('.panel').boundingBox();assert.equal(full.width,width);assert.equal(full.height,height);
  await activate('[data-act="close-journal"]');
  await activate('.minimap');assert.equal(await page.evaluate(()=>window.__frontier.panels.isOpen),true);await activate('.panel-close');
  await page.evaluate(()=>{const f=window.__frontier;f.game.player.cooldowns[1]=2;f.game.player.cooldowns[2]=4;f.game.player.mp=0;f.input.refreshButtons();});
  await settle();
  assert.ok(await page.locator('.sbtn.s1').getAttribute('class').then(s=>s.includes('nomp')));
  assert.match(await page.locator('.pframe .mp span').innerText(),/MP\s+0\s*\//);
  await page.screenshot({path:out+size+'-cooldowns.png',timeout:60000});
  await page.evaluate(()=>{const f=window.__frontier;f.game.ch.slots[3]={skill:null,mods:[]};f.game.refresh();f.input.refreshButtons();});
  await activate('.sbtn.s3');assert.equal(await page.locator('#panel-title').textContent(),'ชุดสกิล');
  assert.equal(await page.locator('.loadout-slot.on').getAttribute('data-slot'),'3','empty-slot tap must not click through to a different loadout slot');
  await activate('.panel-close');
  assert.deepEqual(errors,[],size+' page errors');reports.push({size,width,height,touch,ok:true,modelsReady:true,source:'full game renderer, real HUD',controls:5,originalSkillImages:verifiedArt});
  writeFileSync(out+'report.json',JSON.stringify(reports,null,2));console.log('PASS field HUD '+name+' '+size);await ctx.close();
 }
}finally{await browser?.close();try{process.kill(-server.pid);}catch{}}
