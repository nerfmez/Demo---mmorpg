// Skills are chosen visually. Core functions in Panels still own all mutations.
import { art } from './art.js';
import { icon } from './icons.js';
import { meetsRequires } from '../core/character.js';
import { skillUpgradeCost, canAfford } from '../core/crafting.js';
import { modFits, modSlotOf } from '../core/skills.js';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export function skillsView(ui, {costHtml, describeSkill, tagNames}) {
  const {game:g,sel} = ui, {ch,data} = g, near = g.nearby();
  const selected = sel.skill ?? 0, slot = ch.slots[selected], def = data.skills.combat[slot.skill], s = g.skills[selected];
  const learned = Object.keys(ch.skills).filter(id => data.skills.combat[id]);
  const loadout = ch.slots.map((entry,i) => {
    const sd = data.skills.combat[entry.skill];
    return `<button class="loadout-slot ${i===selected?'on':''}" data-act="skill-slot" data-slot="${i}" aria-pressed="${i===selected}">
      <span class="slot-number">${i+1}</span>${sd?art('skill',entry.skill):icon('plus')}
      <b>${sd?.nameTh || 'ช่องว่าง'}</b><small>${entry.mods.length} / ${data.mods.maxModsPerSkill} ม็อด</small></button>`;
  }).join('');
  let editor = `<div class="empty-skill">${icon('plus')}<h3>ช่องต่อสู้ ${selected+1} ยังว่าง</h3><p>เลือกสกิลจากรายการด้านล่าง</p></div>`;
  if (def && s) {
    const lvl=ch.skills[slot.skill], up=skillUpgradeCost(data,slot.skill,lvl);
    const sockets=Array.from({length:data.mods.maxModsPerSkill},(_,k)=>{
      const uid=slot.mods[k], inst=ch.mods.find(m=>m.uid===uid);
      if(!inst) return `<button class="socket" data-act="pick-socket" data-slot="${selected}">${icon('plus')}<span><b>ใส่ม็อด</b><small>เปลี่ยนวิธีใช้สกิล</small></span></button>`;
      const md=data.mods.mods[inst.id], active=meetsRequires(ch,md.requires).ok;
      return `<button class="socket filled ${active?'':'inactive'}" data-act="unsocket" data-uid="${uid}">${art('mod',inst.id)}<span><b>${md.nameTh}</b><small>Lv.${inst.level} · ${active?'แตะเพื่อถอด':'Stat ไม่ถึง'}</small></span></button>`;
    }).join('');
    editor=`<div class="skill-focus">
      <div class="skill-hero-art">${art('skill',slot.skill)}</div>
      <div><div class="section-kicker">สกิลที่ใส่ · ช่อง ${selected+1}</div><h3>${def.nameTh} <span class="level-pill">Lv.${lvl}</span></h3><small class="muted">${def.name}</small><p>${esc(def.desc)}</p>
        <div class="skill-metrics"><span>MP <b>${s.cost||0}</b></span><span>คูลดาวน์ <b>${s.cooldown.toFixed(1)} วิ</b></span>${s.range?`<span>ระยะ <b>${s.range.toFixed(1)} ม.</b></span>`:''}</div>
      </div></div>
      <div class="section-heading"><h3>ม็อดของสกิลนี้</h3><span>${slot.mods.length} / ${data.mods.maxModsPerSkill} ช่อง</span></div>
      <div class="sockets">${sockets}</div>
      ${sel.socket===selected ? modsView(ui,selected) : ''}
      <details class="skill-more"><summary>ค่าสกิลและการอัปเกรด</summary>
        <div>${[...s.tags].map(t=>`<span class="tag">${tagNames[t]||t}</span>`).join('')}</div>
        <p>${describeSkill(s)}</p>
        ${up?`<div class="cost">${costHtml(ch,data,up)}</div><button class="btn" data-act="skill-up" data-skill="${slot.skill}" ${near.workbench&&canAfford(ch,up)?'':'disabled'}>อัปเป็น Lv.${lvl+1}</button><small class="muted">${near.workbench?'':'อัปเกรดได้ที่โต๊ะคราฟต์'}</small>`:'เลเวลสูงสุด'}
      </details>`;
  }
  const choices=learned.map(id=>{
    const sd=data.skills.combat[id], req=meetsRequires(ch,sd.requires);
    return `<button class="skill-choice ${slot.skill===id?'on':''}" data-act="choose-skill" data-slot="${selected}" data-id="${id}" aria-pressed="${slot.skill===id}" ${req.ok?'':'disabled'}>
      ${art('skill',id)}<span><b>${sd.nameTh}</b><small>Lv.${ch.skills[id]}${req.ok?'':' · ต้อง '+req.missing.join(', ')}</small></span>${slot.skill===id?'<i>✓</i>':''}</button>`;
  }).join('');
  const movement=ch.movementSkills.map(id=>{
    const md=data.skills.movement[id], req=meetsRequires(ch,md.requires);
    return `<button class="skill-choice ${ch.movement===id?'on':''}" data-act="movement" data-id="${id}" aria-pressed="${ch.movement===id}" ${req.ok?'':'disabled'}>${art('skill',id)}<span><b>${md.nameTh}</b><small>${req.ok?md.name:'ต้อง '+req.missing.join(', ')}</small></span></button>`;
  }).join('');
  return `${ui.lastResult ? `<div class="result-pop" role="status">${ui.lastResult}</div>` : ''}<div class="section-heading"><div><h3>ชุดสกิลต่อสู้</h3><p class="muted">แตะช่องที่ต้องการเปลี่ยน แล้วเลือกสกิลหรือม็อด</p></div><span class="level-pill">4 ช่อง</span></div>
    <div class="loadout-bar">${loadout}</div>
    <div class="build-layout"><section class="skill-editor card">${editor}</section>
    <section class="skill-library"><div class="section-heading"><h3>เลือกสกิลใส่ช่อง ${selected+1}</h3><button class="btn small" data-act="choose-skill" data-slot="${selected}" data-id="" ${def?'':'disabled'}>ถอดสกิล</button></div>
      <div class="skill-choices">${choices}</div><p class="muted">เรียนสกิลเพิ่มได้ที่โต๊ะคราฟต์ในนิคม</p></section></div>
    <section class="card movement-card"><div class="section-heading"><h3>สกิลเคลื่อนที่</h3><span class="tag">ช่องแยก</span></div><div class="movement-choices">${movement}</div>
      <p class="muted">${esc(g.move.def.desc)} · ${g.move.charges} ชาร์จ · ชาร์จคืน ${g.move.recharge.toFixed(1)} วิ</p></section>`;
}

function modsView(ui,index){
 const {game:g}=ui,{ch,data}=g,def=data.skills.combat[ch.slots[index].skill];
 const rows=ch.mods.map(inst=>{
   const md=data.mods.mods[inst.id], fit=modFits(def,md), req=meetsRequires(ch,md.requires), where=modSlotOf(ch,inst.uid);
   return `<div class="mod-choice ${fit.ok?'':'unavailable'}">${art('mod',inst.id)}<div><b>${md.nameTh} <small>Lv.${inst.level}</small></b><p>${esc(md.desc)}</p>
     <small class="muted">${where>=0?'ใส่อยู่ที่ช่อง '+(where+1):'ยังไม่ได้ใส่'}${!req.ok?' · ต้อง '+req.missing.join(', '):''}</small></div>
     <button class="btn" data-act="socket" data-slot="${index}" data-uid="${inst.uid}" ${fit.ok?'':'disabled'}>${fit.ok?'ใส่':'ใช้ไม่ได้'}</button></div>`;
 }).join('');
 return `<div class="mod-picker"><div class="section-heading"><h3>เลือกม็อด</h3><button class="btn small" data-act="pick-socket" data-slot="-1">ปิดรายการ</button></div>${rows||'<p>ยังไม่มีม็อด · คราฟต์ได้ที่โต๊ะคราฟต์</p>'}</div>`;
}

