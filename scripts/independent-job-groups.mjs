import {splitLineGroups} from '../src/ui/skill-journal/line-groups.js';

// Applied after journal-lines generation too: presentation pages are independent
// purchase scopes. Keep retired bridge IDs solely for exact save refunds.
export function independentJobGroups(tree) {
  tree.revision=3;
  tree._doc='Journal chapters are navigation only. Each displayed group is an independent allocation scope; directed prerequisites and investment are local. Retired bridges are refunded once; other saved IDs retain ownership.';
  const definitions=splitLineGroups(tree,tree.presentation.groups);
  for(const stage of tree.presentation.stages){
    stage.gate=0;tree.sections[`stage-${stage.id}`].requiresSpent=0;
    if(stage.nodes)continue;
    stage.paths=definitions.filter(g=>tree.sections[tree.nodes[g.nodes[0]].section].tier===stage.id).map(g=>{
      const {bridges,routeScopeId,hubId,lineId,mastery,...p}=g;
      return p;
    });
    stage.note='เลือกกลุ่มได้อิสระ · ต่อเส้นทางเฉพาะภายในกลุ่ม';
  }
  tree.presentation.groups=tree.presentation.stages.flatMap(s=>s.paths||[]);
  for(const [id,n] of Object.entries(tree.nodes))if(n.bridge)n.retired=true;
  for(const stage of tree.presentation.stages)for(const group of stage.nodes?[{id:'stage-1',nodes:stage.nodes}]:stage.paths){
    const members=new Set(group.nodes);
    for(const id of group.nodes){
      const n=tree.nodes[id];n.allocationGroup=group.id;
      n.requires=(n.requires||[]).filter(k=>members.has(k));
      if(n.requiresAny)n.requiresAny=n.requiresAny.filter(k=>members.has(k));
    }
  }
  const change=(id,effects,name)=>{Object.assign(tree.nodes[id],{effects,name,nameTh:name});};
  change('lesson.strike',{damagePct:2},'พื้นฐานแรง');
  change('path.impact',{castSpeedPct:2},'จังหวะพร้อมใช้');
  change('advanced.power',{castSpeedPct:2.5},'จังหวะต่อยอด');
  change('advanced.flow',{moveSpeedPct:2.5},'จังหวะลื่นไหล');
  change('advanced.guard',{maxHp:12},'ตั้งหลักมั่นคง');
  change('advanced.renew',{healPct:5},'เรียนรู้เยียวยา');
  tree.nodes['lesson.shelter'].requires=['lesson.prepare'];
  tree.nodes['path.recovery'].requires=['path.support'];
  tree.nodes['path.endurance'].requires=['path.support'];
  tree.nodes['advanced.longwalk'].requires=['advanced.endure'];
  change('advanced.continuum',{moveSpeedPct:1.5},'จังหวะต่อเนื่อง');
  tree.nodes['advanced.continuum'].requires=[];
  tree.nodes['advanced.continuum'].requiresAny=['advanced.resonance','advanced.momentum'];
  for(const n of Object.values(tree.nodes))if(n.line==='line.treasure'){
    // Loot investment has value with every weapon; keep existing loot values.
    delete n.effects.projectileDamagePct;
    n.note=n.descTh='ทอง วัตถุดิบ และอุปกรณ์ · ใช้ได้กับทุกอาวุธ';
  }
  for(const [id,n] of Object.entries(tree.nodes))if(n.line && n.allocationGroup){
    if(id.endsWith('.entry') || id.endsWith('.mastery.1')){
      if(n.line==='line.physical') n.effects={castSpeedPct:Math.round(1.2*(id.includes('.mastery.')?1.05:({2:1,3:1.25,4:1.5,5:1.75}[n.stage]))*100)/100};
      if(n.line==='line.damage') n.effects={castSpeedPct:Math.round(1.2*(id.includes('.mastery.')?1.05:({2:1,3:1.25,4:1.5,5:1.75}[n.stage]))*100)/100};
      if(n.line==='line.speed'){const scale=id.includes('.mastery.')?1.05:({2:1,3:1.25,4:1.5,5:1.75}[n.stage]);n.effects={castSpeedPct:Math.round(1.6*scale*100)/100,movementRechargePct:Math.round(.5*scale*100)/100};}
      if(n.line==='line.element' && n.effects.elementalDamagePct) n.effects={damagePct:n.effects.elementalDamagePct};
      n.name=n.nameTh=n.line==='line.speed'?'พร้อมรอบถัดไป':n.line==='line.damage'||n.line==='line.physical'?'จังหวะพลัง':n.line==='line.treasure'?'เตรียมเสบียงล่า':(['line.physical','line.damage','line.element'].includes(n.line)?'พื้นฐานพลัง':n.nameTh);
    }
    if(id.includes('.mastery.')){
      const rank=Number(id.split('.').at(-1));
      n.requires=rank===1?[]:[`${n.line}.mastery.${rank<=3?1:rank-2}`];
      const group=tree.presentation.groups.find(g=>g.id===n.allocationGroup);
      group.grid[id]=rank===1?[.5,0]:[rank%2?0:1,Math.floor(rank/2)];
    }
    if(id.endsWith('.join'))n.localInvestment=n.stage===3||n.stage===4?4:3;
  }
  const groupNotes={impact:'จังหวะร่วม · กระสุนหรือพื้นที่',support:'HP ร่วม · บาเรีย ฟื้นฟู ป้องกัน หรือเคลื่อนที่',power:'จังหวะร่วม · กระสุนหรือพื้นที่',guard:'HP ร่วม · เยียวยาหรือยืนระยะ',flow:'เดินไวร่วม · เวทหรือเคลื่อนที่'};
  for(const group of tree.presentation.groups){if(groupNotes[group.id])group.note=groupNotes[group.id];if(group.id==='support')group.name='ตั้งหลักและก้าวต่อ';}
  for(const [id,n] of Object.entries(tree.nodes))if(n.allocationGroup){
    const names=ids=>ids.map(k=>tree.nodes[k].nameTh).join(' หรือ ');
    n.note=n.descTh=id===tree.origin?'จุดเริ่มต้นร่วม · ไม่ใช้แต้ม':n.requiresAny?.length?`เลือกต่อจาก ${names(n.requiresAny)} ภายในกลุ่มนี้`:n.requires.length?`ต่อจาก ${names(n.requires)} ภายในกลุ่มนี้`:'พื้นฐานร่วมของกลุ่ม · เริ่มได้ทันทีเมื่อมีแต้ม โดยไม่ต้องลงทุนในกลุ่มอื่น';
  }
  // Active links reflect only the directed local graph. No ghost external lines.
  for(const n of Object.values(tree.nodes))if(n.allocationGroup)n.links=[];
  for(const [id,n] of Object.entries(tree.nodes))if(n.allocationGroup)for(const p of [...n.requires,...n.requiresAny||[]]){
    n.links.push(p);tree.nodes[p].links.push(id);
  }
  for(const n of Object.values(tree.nodes))if(n.allocationGroup)n.links=[...new Set(n.links)];
  return tree;
}
