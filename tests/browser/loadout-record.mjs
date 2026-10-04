// Records native in-game controls. The sample character exists only in this never-saved review session.
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadoutCharacter} from './loadout-fixture.mjs';
import {freezeScene} from './freeze-scene.mjs';
const cli=process.env.AGENT_BROWSER_CLI||'agent-browser',out=path.resolve(process.env.UI_OUT||'evidence/ui-live');
await fs.mkdir(out,{recursive:true});
const endpoint=execFileSync(cli,['get','cdp-url'],{encoding:'utf8'}).trim();
const browser=await chromium.connectOverCDP(endpoint);
const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('fresh=1'));
if(!page)throw Error('Open the local full game with ?fresh=1 before recording');
await page.waitForFunction(()=>__frontier?.modelsReady&&__frontier?.game);
await page.evaluate(ch=>{
 const f=__frontier,g=f.game;Object.assign(g.ch,ch);g.refresh(true);
 const [x,z]=g.world.data.town.workbench;Object.assign(g.player,g.freeSpotNear(x+1.5,z));f.view.snapCamera();f.panels.open('mods');
},loadoutCharacter());
await freezeScene(page);await page.evaluate(()=>document.fonts.ready);
const click=async selector=>{const box=await page.locator(selector).boundingBox();if(!box)throw Error(selector);await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:12});await page.waitForTimeout(180);await page.mouse.click(box.x+box.width/2,box.y+box.height/2);};
const uid=id=>page.evaluate(id=>__frontier.game.ch.mods.find(m=>m.id===id).uid,id);
const steps=[],start=Date.now(),mark=label=>steps.push({label,milliseconds:Date.now()-start});
execFileSync(cli,['record','start',path.join(out,'equip-motion.mp4'),'--fps','30','--cursor','--contact-sheet'],{encoding:'utf8'});
try{
 await page.waitForTimeout(600);
 await click('[data-action="slot"][data-id="0"]');await click(`[data-action="mod"][data-id="${await uid('burning_ground')}"]`);await page.waitForTimeout(500);mark('Insert library coin into actual Slash socket');await click('#atelier [data-action="apply"]');await page.waitForTimeout(1600);
 await click('[data-action="slot"][data-id="2"]');await click(`[data-action="mod"][data-id="${await uid('life_leech')}"]`);await page.waitForTimeout(500);await click('#atelier [data-action="apply"]');await page.waitForTimeout(750);mark('Replace: old coin ejects and new coin seats');await click('[data-action="replace-mod"][data-index="1"]');await page.waitForTimeout(1700);
 mark('Remove: attached coin returns to library');await click('#atelier [data-action="apply"]');await page.waitForTimeout(1500);
 await click(`[data-action="mod"][data-id="${await uid('spiked_ward')}"]`);mark('Incompatible type feedback');await click('#atelier [data-action="apply"]');await page.waitForTimeout(1300);
 await click(`[data-action="mod"][data-id="${await uid('cast_on_dodge')}"]`);mark('Compatible but stat-inactive attachment');await click('#atelier [data-action="apply"]');await page.waitForTimeout(1500);
 await page.mouse.move(640,55,{steps:8});await page.waitForTimeout(700);
}finally{
 execFileSync(cli,['record','stop'],{encoding:'utf8'});
 await fs.writeFile(path.join(out,'motion-sequence.json'),JSON.stringify({source:'full game root entry, never-saved test character, existing paused-world capture helper',steps},null,2));
}
console.log('Recorded actual in-game equip motion');
process.exit(0);
