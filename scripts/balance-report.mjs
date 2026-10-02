// Reproducible unmodded power audit. No affixes or Job bonuses: isolate stacked level/gear multipliers.
import {loadData} from '../src/core/data-node.js';
import {createCharacter,derive} from '../src/core/character.js';
import {computeSkill} from '../src/core/skills.js';
const data=loadData(),out=[];
for(const kit of ['sword','bow','staff'])for(const level of [1,10,20,40]){
 const ch=createCharacter(data,{kit});for(const item of ch.gear)item.options=[];ch.level=level;const points=(level-1)*3+4;
 const stat=kit==='sword'?'STR':kit==='bow'?'DEX':'INT';ch.stats[stat]+=Math.floor(points*.65);ch.stats.VIT+=Math.floor(points*.2);
 const id=kit==='sword'?'slash':kit==='bow'?'hunter_shot':'firebolt';ch.slots[0]={skill:id,mods:[]};
 // Equal-investment comparison deliberately retains rank 5/+5 at high levels, including legacy saves.
 ch.skills[id]=level===1?1:5;
 if(level>1){ch.gear[0].base=kit==='sword'?(level<20?'tusk_blade':'horn_greatblade'):kit==='bow'?(level<20?'hunter_bow':'storm_bow'):(level<20?'wisp_staff':'ancient_staff');ch.gear[0].grade=level<20?'B':'S';ch.gear[0].upgrade=level<20?2:5;}
 const d=derive(ch,data),s=computeSkill(ch,data,d,0);
 out.push({kit,level,rank:s.level,enhancement:ch.gear[0].upgrade,attack:d.attack,magic:d.magic,hp:d.maxHp,damage:Math.round(s.damage*10)/10,burstDps:Math.round(s.damage/s.cooldown*10)/10,sustainedDps:Math.round(s.damage*Math.min(1/s.cooldown,s.cost?d.mpRegen/s.cost:Infinity)*10)/10});
}
console.log(JSON.stringify(out,null,2));
