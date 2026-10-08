// Test/save fixture only. Production never grants these items or changes this state.
import {loadData} from '../../src/core/data-node.js';
import {createCharacter, equip} from '../../src/core/character.js';
import {equipSkill, socketMod} from '../../src/core/skills.js';
export function loadoutCharacter() {
  const data=loadData(),ch=createCharacter(data,{name:'Aerin',kit:'sword'});
  ch.skills={slash:1,hunter_shot:1,firebolt:1,ward:1};ch.slots=['slash','ward','firebolt',null].map(skill=>({skill,mods:[]}));ch.movementSkills=['dash','roll'];ch.movement='dash';
  Object.assign(ch,{level:12,gold:1280,stats:{STR:8,AGI:7,VIT:7,INT:6,DEX:6}});
  for(const base of ['tusk_blade','hunter_bow','wisp_staff','hide_vest','shell_guard','wolfpelt_coat','leather_cap','beetle_helm','spore_hood','wolf_boots','wisp_slippers','crag_axe','storm_bow','spore_wand','fang_dagger','tusk_charm','wisp_pendant','spore_amulet'])ch.gear.push({uid:ch.nextUid++,base,itemLevel:data.items.gearBases[base].itemLevel,grade:base==='tusk_blade'?'A':'B',upgrade:base==='tusk_blade'?2:0,options:[]});
  for(const base of ['leather_cap','hide_vest','tusk_charm'])equip(ch,data,ch.gear.find(i=>i.base===base).uid);
  for(const id of ['whirl_blade','chain_spark','stone_burst','frost_nova','venom_mire','hex','war_cry','healing_spring'])ch.skills[id]=1;
  ch.skills.firebolt=2;
  ch.mods=Object.keys(data.mods.mods).map(id=>({uid:ch.nextUid++,id,level:1,grade:data.recipes.recipes['mod_'+id].grade}));
  for(let i=0;i<7;i++)ch.mods.push({uid:ch.nextUid++,id:'wide_arc',level:1,grade:'C'});
  ch.materials=Object.fromEntries(Object.keys(data.items.materials).map(id=>[id,30]));
  equipSkill(ch,data,3,'chain_spark');
  for(const [index,id] of [[0,'wide_arc'],[1,'spiked_ward'],[2,'split'],[2,'pierce'],[3,'bounce']])socketMod(ch,data,index,ch.mods.find(m=>m.id===id).uid);
  ch.pos=[data.world.town.workbench[0]+1.5,data.world.town.workbench[1]];
  return ch;
}
