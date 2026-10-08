import test from 'node:test';
import assert from 'node:assert/strict';
import {data} from './helpers.js';
import {createCharacter,migrateCharacter,expToNext,CHARACTER_VERSION} from '../../src/core/character.js';
import {Game} from '../../src/core/game.js';
import {dismissQuestCompletion,refreshQuests} from '../../src/core/quests.js';
const finish=(g,target)=>{for(let i=0;i<3;i++)g.notify({type:'kill',target});};
const owned=g=>structuredClone({gold:g.ch.gold,skills:g.ch.skills,materials:g.ch.materials,exp:g.ch.exp,level:g.ch.level,jobExp:g.ch.jobExp,jobLevel:g.ch.jobLevel,statPoints:g.ch.statPoints});
test('two completions queue immutable paid receipts, reload/dismiss never grants twice',()=>{
 const g=new Game(data,{seed:2});finish(g,'salt_slime');finish(g,'reef_crab');
 const queue=g.ch.progress.questJournal.completions;assert.deepEqual(queue.map(r=>r.id),['h_slimes','h_crabs']);
 assert.deepEqual(queue[0].reward.skills,['firebolt']);assert.deepEqual(queue[1].reward.skills,['ward']);
 assert.equal(queue[0].nameTh,data.quests.quests.h_slimes.nameTh);assert.ok(queue[0].objectives[0].count===3);
 const paid=owned(g),saved=JSON.parse(JSON.stringify(g.snapshot()));
 const loaded=new Game(data,{seed:2,character:saved});assert.deepEqual(owned(loaded),paid);
 assert.equal(dismissQuestCompletion(loaded.ch,'h_crabs'),false,'stale/out of order dismiss');
 assert.ok(dismissQuestCompletion(loaded.ch,'h_slimes'));assert.equal(dismissQuestCompletion(loaded.ch,'h_slimes'),false);
 const again=new Game(data,{seed:2,character:structuredClone(loaded.snapshot())});assert.deepEqual(again.ch.progress.questJournal.completions.map(r=>r.id),['h_crabs']);
 again.completeQuests(['h_slimes','h_crabs','h_slimes']);again.completeQuests(refreshQuests(again.ch,data));assert.deepEqual(owned(again),paid);
 assert.ok(dismissQuestCompletion(again.ch,'h_crabs'));assert.deepEqual(again.ch.progress.questJournal.completions,[]);
});
test('receipt reflects capped EXP and already learned skills, not promised rewards',()=>{
 const ch=createCharacter(data);ch.skills.firebolt=4;ch.level=data.progression.character.maxLevel;ch.jobLevel=data.progression.job.maxLevel;
 const g=new Game(data,{character:ch,seed:2});finish(g,'salt_slime');const r=g.ch.progress.questJournal.completions[0].reward;
 assert.equal(r.exp,0);assert.equal(r.jobExp,0);assert.deepEqual(r.skills,[]);assert.equal(g.ch.skills.firebolt,4);
 assert.equal(r.gold,data.quests.quests.h_slimes.reward.gold);
 const near=createCharacter(data);near.level=data.progression.character.maxLevel-1;near.exp=expToNext(data,near.level)-2;
 const n=new Game(data,{character:near,seed:2});finish(n,'salt_slime');assert.equal(n.ch.progress.questJournal.completions[0].reward.exp,2);
});
test('v10 paid history migrates without fabricated popup or payment, pending reward remains payable',()=>{
 const old=createCharacter(data);old.version=10;old.progress.questJournal={version:1,trackedId:null};old.progress.quests.h_slimes={status:'done',progress:3,rewardClaimed:true};
 const m=migrateCharacter(structuredClone(old),data);assert.equal(m.version,CHARACTER_VERSION);assert.deepEqual(m.progress.questJournal.completions,[]);
 const g=new Game(data,{character:m,seed:2});assert.equal(g.ch.gold,old.gold);assert.equal(g.ch.skills.firebolt,undefined);
 old.progress.quests.h_slimes.rewardClaimed=false;
 const pending=new Game(data,{character:old,seed:2});assert.equal(pending.ch.progress.questJournal.completions.length,1);assert.equal(pending.ch.skills.firebolt,1);
});
test('receipt snapshots survive changed quest definitions; malformed and duplicate queue entries are rejected',()=>{
 const g=new Game(data,{seed:2});finish(g,'salt_slime');const ch=structuredClone(g.snapshot()),receipt=structuredClone(ch.progress.questJournal.completions[0]);
 ch.progress.questJournal.completions.push(structuredClone(receipt),null,{id:'h_crabs',reward:{gold:999}});
 const altered=structuredClone(data);altered.quests.quests.h_slimes.reward.gold=9999;altered.quests.quests.h_slimes.nameTh='changed';
 const loaded=new Game(altered,{character:ch,seed:2});assert.deepEqual(loaded.ch.progress.questJournal.completions,[receipt]);assert.equal(loaded.ch.gold,g.ch.gold);
});
