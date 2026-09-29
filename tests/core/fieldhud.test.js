import {test} from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter, expToNext, jobExpToNext} from '../../src/core/character.js';
import {xpPresentation, trackerMarkup} from '../../src/ui/fieldhud.js';
import {art, hasArt} from '../../src/ui/art.js';
import {readFileSync} from 'node:fs';
test('all combat and movement skills retain the original authored illustrations',()=>{
 for(const id of [...Object.keys(data.skills.combat),...Object.keys(data.skills.movement)]){
  assert.ok(hasArt('skill',id),id);
  assert.ok(art('skill',id).includes('data-art="skill/'+id+'"'),id);
 }
});
test('HUD uses original skill art rather than replacement glyphs',()=>{
 const input=readFileSync(new URL('../../src/ui/input.js',import.meta.url),'utf8');
 assert.ok(input.includes("s ? art('skill',s.id) : icon('plus')"));
 assert.ok(input.includes("innerHTML = art('skill',mv.id);"));
 assert.ok(!input.includes('skillSymbol('));
});
test('field progress follows real EXP and independent Job EXP; caps show MAX',()=>{
 const ch=createCharacter(data);ch.level=19;ch.jobLevel=12;
 ch.exp=expToNext(data,ch.level)*.952;ch.jobExp=jobExpToNext(data,ch.jobLevel)*.3;
 const xp=xpPresentation(ch,data);assert.ok(Math.abs(xp.exp.percent-95.2)<1e-9);assert.equal(xp.exp.text,'EXP 95.2%');assert.equal(xp.job.text,'30.0%');
 ch.level=data.progression.character.maxLevel;ch.jobLevel=data.progression.job.maxLevel;ch.exp=0;ch.jobExp=0;
 const max=xpPresentation(ch,data);assert.equal(max.exp.percent,100);assert.equal(max.exp.text,'MAX');assert.equal(max.job.percent,100);assert.equal(max.job.text,'MAX');
});
test('tracker shows at most two actual active quests, escapes text, and never mutates state',()=>{
 const ch=createCharacter(data),[id,...others]=data.quests.main;ch.progress.quests[id]={status:'active',progress:0};
 ch.progress.quests[others[0]]={status:'done',progress:99};
 const side=data.quests.side[0];ch.progress.quests[side]={status:'active',progress:2};
 const g={ch,data,player:{x:0,z:0}};const before=JSON.stringify(ch);
 const html=trackerMarkup(g,id,{x:3,z:4});assert.equal((html.match(/class="field-quest-row /g)||[]).length,2);
 assert.ok(html.includes(data.quests.quests[id].nameTh));assert.ok(html.includes('5 ม.'));assert.equal(JSON.stringify(ch),before);
 const copy=structuredClone(data);copy.quests.quests[id].nameTh='<img src=x onerror=1>';
 assert.ok(!trackerMarkup({...g,data:copy},id,null).includes('<img'));
 assert.ok(trackerMarkup(g,null,null).includes('ภารกิจครบแล้ว'));
});
