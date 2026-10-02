// Silent local interaction evidence; the real journal, rules and animation modules.
import {chromium} from 'playwright';
import {build} from 'vite';
import {readFileSync,renameSync,mkdirSync} from 'node:fs';
const out=process.env.FULLSCREEN_OUT||new URL('./out/fullscreen-review/',import.meta.url).pathname;mkdirSync(out+'video',{recursive:true});
const b=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:new URL('./workspace-harness.js',import.meta.url).pathname,name:'Review',formats:['iife']}}}),code=b[0].output.find(x=>x.type==='chunk').code;
let css=['style','ux','art','workspaces','minimal','journal','overlays','fieldhud','skill-journal/journal','fullscreen'].map(n=>readFileSync(new URL('../../src/ui/'+n+'.css',import.meta.url),'utf8')).join('\n');
for(const w of [400,600])css+=`@font-face{font-family:AtlasThai;src:url(data:font/ttf;base64,${readFileSync(new URL(`../../src/ui/skill-journal/fonts/noto-thai-${w}.ttf`,import.meta.url)).toString('base64')});font-weight:${w}}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox']});
try{const c=await browser.newContext({viewport:{width:776,height:540},hasTouch:true,isMobile:true,recordVideo:{dir:out+'video',size:{width:776,height:540}}}),p=await c.newPage();
await p.setContent('<html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="hud"></div></body></html>');await p.addStyleTag({content:css});await p.addScriptTag({content:code});await p.evaluate(()=>{Object.assign(__frontier.game.ch,{jobLevel:20,jobPoints:19});__frontier.panels.open('job')});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1200);
await p.locator('[data-action="zoom-in"]').tap();await p.waitForTimeout(700);await p.mouse.move(340,290);await p.mouse.down();await p.mouse.move(410,330,{steps:18});await p.mouse.up();await p.waitForTimeout(700);await p.locator('[data-action="fit"]').tap();await p.waitForTimeout(800);
await p.locator('#plane > [data-node="v1"]').tap();await p.waitForTimeout(1700);await p.screenshot({path:out+'clip-book-detail.png'});await p.locator('[data-action="close-detail"]').tap();await p.locator('[data-action="fit"]').tap();await p.waitForTimeout(800);
await p.locator('#chapter-tabs [data-stage="2"]').tap();await p.waitForTimeout(1200);await p.locator('#chapter-tabs [data-stage="1"]').tap();await p.waitForTimeout(1000);
const path=await p.video().path();await c.close();renameSync(path,out+'book-interaction.webm');console.log('Recorded actual journal interaction at the reference size');}finally{await browser.close();}
