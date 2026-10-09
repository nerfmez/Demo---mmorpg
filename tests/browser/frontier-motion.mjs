// Normal-speed prototype samples, separate from deterministic rule/input tests.
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='tests/browser/out/frontier-content';mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4188','--strictPort'],{stdio:'ignore'});let browser;
try{
 for(let n=0;;n++){try{if((await fetch('http://127.0.0.1:4188/lab.html')).ok)break;}catch{}if(n>40)throw Error('server');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||chromium.executablePath(),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1180,height:820}});const errors=[],samples=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4188/lab.html?skill=flame_stream');await page.waitForFunction(()=>window.__lab);await page.evaluate(()=>document.fonts.ready);
 for(const id of ['charged_shot','flame_stream','arrow_rain','crystal_wall']){
  await page.evaluate(id=>{__lab.selectSkill(id);__lab.state.speed=1;__lab.state.paused=false;__lab.cast();},id);
  for(const [n,delay]of [[1,180],[2,420]]){
   await page.waitForTimeout(delay);samples.push(await page.evaluate(({id,n})=>({id,n,time:__lab.rulesGame.time,paused:__lab.state.paused,speed:__lab.state.speed}),{id,n}));
   await page.screenshot({path:`${out}/motion-${id}-${n}.png`});
  }
  await page.evaluate(()=>__lab.release());await page.waitForTimeout(250);await page.screenshot({path:`${out}/motion-${id}-release.png`});
 }
 if(errors.length)throw Error(errors.join(' | '));writeFileSync(`${out}/motion.json`,JSON.stringify({samples,errors,method:'1x live RAF sampled stills; not continuous visual playback'},null,2));console.log('PASS 1x motion samples');
}finally{await browser?.close();server.kill();}
