// Menu panels: Character, Skills (slots + mods), Job Tree, Bag (equipment), Workbench,
// Journal (quests + progress), World Map (fast travel) and Settings (graphics + save).
// The game is paused while a panel is open (single-player demo).
import { icon } from './icons.js';
import { mapImage } from './mapimage.js';
import { questTarget, rewardText } from './hud.js';
import { STATS, allocateStat, jobNodeState, allocateJobNode, currentJob, respecCost, respecStats, respecJob, gearStats, weaponImplicit, equip, unequip, gearItem, meetsRequires, expToNext, jobExpToNext } from '../core/character.js';
import { equipSkill, socketMod, unsocketMod, modFits, setMovement, modSlotOf } from '../core/skills.js';
import { canAfford, craft, recipeBlocker, upgradeGear, gearUpgradeCost, upgradeSkill, skillUpgradeCost, upgradeMod, modUpgradeCost, sellMaterial } from '../core/crafting.js';
import { questState, trackedQuest } from '../core/quests.js';

const STAT_TH = { STR: 'พลังกาย · ดาเมจประชิด', AGI: 'ความคล่อง · ความเร็ว/คูลดาวน์', VIT: 'ความอึด · HP/ป้องกัน/เกราะ', INT: 'สติปัญญา · พลังเวท/MP', DEX: 'ความแม่น · คริ/กระสุน' };
const TAG_TH = {
  Attack: 'โจมตี', Spell: 'เวท', Melee: 'ประชิด', Projectile: 'กระสุน', Area: 'วงกว้าง', Damage: 'ดาเมจ', Fire: 'ไฟ', Earth: 'ดิน', Cold: 'น้ำแข็ง',
  Lightning: 'สายฟ้า', Poison: 'พิษ', Chain: 'เด้งต่อ', Control: 'ควบคุม', Debuff: 'ดีบัฟ', Curse: 'คำสาป', Guard: 'การ์ด', Buff: 'บัฟ', Warcry: 'คำราม',
  Heal: 'ฮีล', Persistent: 'ค้างพื้น', Summon: 'อัญเชิญ', Minion: 'ลูกสมุน', Movement: 'เคลื่อนที่', Trigger: 'ทริกเกอร์',
};
const REASON_TH = { materials: 'วัตถุดิบไม่พอ', learned: 'เรียนแล้ว', max: 'สูงสุดแล้ว', full: 'ช่อง Mod เต็ม', duplicate: 'ใส่ Mod ซ้ำไม่ได้', requires: 'Stat ไม่ถึง', not_learned: 'ยังไม่ได้เรียน' };
const TELEPORT_TH = { combat: 'กำลังต่อสู้อยู่ — ออกจากการต่อสู้ก่อนแล้วค่อยวาร์ป', locked: 'ยังไม่ได้ปลดล็อก — เดินไปแตะหินวาร์ปนั้นก่อน', dead: 'หมดสติอยู่', unknown: 'ไม่พบจุดวาร์ป' };
const GEAR_FILTERS = [
  ['all', 'ทั้งหมด'],
  ['weapon', 'อาวุธ'],
  ['armor', 'เกราะ'],
  ['helm', 'หมวก'],
  ['boots', 'รองเท้า'],
  ['charm', 'เครื่องราง'],
];
const CRAFT_FILTERS = [
  ['weapon', 'อาวุธ'],
  ['armor', 'ชุด/หมวก/รองเท้า'],
  ['charm', 'เครื่องราง'],
  ['skill', 'สกิลใหม่'],
  ['movement', 'สกิลเคลื่อนที่'],
  ['mod', 'Skill Mod'],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtTime = (sec) => {
  const hh = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  return hh ? `${hh} ชม. ${mm} นาที` : `${mm} นาที`;
};

export class Panels {
  /**
   * @param {{onChange?:Function, onQuality:Function, getQuality:Function, onTitle?:Function, exportSave?:Function, slot?:number|null}} opts
   */
  constructor(root, game, { onChange, onQuality, getQuality, onTitle, exportSave, slot = null }) {
    this.game = game;
    this.onChange = onChange;
    this.onQuality = onQuality;
    this.getQuality = getQuality;
    this.onTitle = onTitle;
    this.exportSave = exportSave;
    this.slot = slot;
    this.tab = null;
    this.sel = { gear: 'all', craft: 'weapon' };
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `<div class="panel"><div class="tabs"></div><div class="pbody"></div></div>`;
    root.appendChild(this.overlay);
    this.tabsEl = this.overlay.querySelector('.tabs');
    this.body = this.overlay.querySelector('.pbody');
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.close();
    });
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('change', (e) => this.onSelect(e));
    this.tabsEl.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) {
        this.tab = t.dataset.tab;
        this.lastResult = null;
        this.render(true);
      }
      if (e.target.closest('[data-close]')) this.close();
    });
  }

  get isOpen() {
    return this.tab !== null;
  }

  open(tab) {
    const near = this.game.nearby();
    if (tab === 'craft' && !near.workbench) tab = 'bag';
    this.tab = tab;
    this.overlay.classList.add('on');
    this.render(true);
  }

  close() {
    this.tab = null;
    this.overlay.classList.remove('on');
    this.lastResult = null;
    this.sel.socket = undefined;
  }

  toggle(tab) {
    if (this.tab === tab) this.close();
    else this.open(tab);
  }

  changed() {
    this.game.refresh();
    this.onChange?.();
    this.render();
  }

  badges() {
    const ch = this.game.ch;
    return { char: ch.statPoints, job: ch.jobPoints };
  }

  render(top = false) {
    if (!this.isOpen) return;
    const g = this.game;
    const near = g.nearby();
    const b = this.badges();
    const tabs = [
      ['char', 'ตัวละคร', b.char],
      ['skills', 'สกิล & Mod'],
      ['job', 'Job Tree', b.job],
      ['bag', 'กระเป๋า'],
      ...(near.workbench ? [['craft', '🔨 โต๊ะคราฟต์']] : []),
      ['journal', 'ภารกิจ'],
      ['map', 'แผนที่'],
      ['settings', 'ตั้งค่า'],
    ];
    this.tabsEl.innerHTML =
      tabs.map(([id, label, n]) => `<button class="tab ${this.tab === id ? 'on' : ''}" data-tab="${id}">${label}${n ? `<span class="dot">${n}</span>` : ''}</button>`).join('') +
      `<button class="tab close" data-close="1" aria-label="close">✕</button>`;
    const scroll = top ? 0 : this.body.scrollTop;
    this.body.innerHTML = this[`render_${this.tab}`]();
    this.body.scrollTop = scroll;
  }

  // ---------- Character ----------
  render_char() {
    const g = this.game;
    const ch = g.ch;
    const d = g.derived;
    const data = g.data;
    const near = g.nearby();
    const cost = respecCost(ch, data);
    const job = currentJob(ch, data);
    const kit = data.progression.start.kits?.[ch.kit];
    const rows = STATS.map(
      (s) => `<div class="row"><div class="grow"><b>${s}</b> <span class="muted">${STAT_TH[s]}</span></div><b style="min-width:28px;text-align:right">${ch.stats[s]}</b>
      <button class="stat-plus" data-act="stat" data-stat="${s}" ${ch.statPoints < 1 ? 'disabled' : ''}>+</button></div>`
    ).join('');
    const pct = (label, v) => (v ? `<span>${label}</span><b>+${v.toFixed(0)}%</b>` : '');
    return `<div class="grid2">
      <div class="card"><h3>Stat · เหลือ ${ch.statPoints} แต้ม</h3>
        <div class="muted" style="margin-bottom:6px">ได้จาก Character Level (เลเวลละ ${data.progression.character.statPointsPerLevel} แต้ม) · ใช้เป็นเงื่อนไขของอาวุธ สกิล และ Mod</div>
        ${rows}
        <div class="row"><div class="grow muted">รีแต้ม Stat ด้วยเงินในเกม (ในนิคมเท่านั้น)</div>
          <button class="btn" data-act="respec-stats" ${!near.inTown || ch.gold < cost.stats ? 'disabled' : ''}>รีแต้ม · ${cost.stats} G</button></div>
      </div>
      <div class="card"><h3>${esc(ch.name || 'นักเดินทาง')} <span class="muted">${kit ? `· เริ่มจาก${kit.nameTh}` : ''}</span></h3>
        <div class="kv">
          <span>Character Level</span><b>${ch.level} (${ch.exp}/${expToNext(data, ch.level)})</b>
          <span>Job Level</span><b>${ch.jobLevel} (${ch.jobExp}/${jobExpToNext(data, ch.jobLevel)})</b>
          <span>Job</span><b>${job ? `${job.name} · ${job.nameTh}` : 'ยังไม่เลือก (Job Lv.' + data.progression.job.jobChoiceLevel + ')'}</b>
          <span>อาวุธ</span><b>${data.items.weaponTypes?.[d.weaponType]?.nameTh || '-'}</b>
          <span>HP / MP</span><b>${g.player.maxHp} / ${g.player.maxMp}</b>
          <span>พลังโจมตี (Attack)</span><b>${d.attack}</b>
          <span>พลังเวท (Magic)</span><b>${d.magic}</b>
          <span>ป้องกัน</span><b>${d.defense}</b>
          <span>โอกาสคริ</span><b>${Math.round(d.critChance * 100)}%</b>
          <span>ความเร็วเดิน</span><b>${d.moveSpeed.toFixed(1)} m/s</b>
          <span>คูลดาวน์เร็วขึ้น</span><b>${d.cooldownPct.toFixed(0)}%</b>
          ${pct('ดาเมจประชิด', d.meleeDamagePct)}${pct('ดาเมจกระสุน', d.projectileDamagePct)}${pct('ดาเมจเวท', d.spellDamagePct)}${pct('ดาเมจวงกว้าง', d.areaDamagePct)}
          ${pct('ดาเมจอัญเชิญ', d.summonDamagePct)}${pct('เกราะเวท', d.barrierPct)}${pct('การฟื้นฟู', d.healPct)}
          ${d.leechPct ? `<span>ดูดเลือด</span><b>${d.leechPct.toFixed(1)}%</b>` : ''}
          ${d.poisonChancePct ? `<span>โอกาสติดพิษ</span><b>${d.poisonChancePct.toFixed(0)}%</b>` : ''}
          <span>Gold</span><b>${ch.gold}</b>
        </div></div></div>`;
  }

  // ---------- Skills ----------
  render_skills() {
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const near = g.nearby();
    const learned = Object.keys(ch.skills).filter((id) => data.skills.combat[id]);
    const slotLabels = ['ปุ่มโจมตีหลัก (LMB)', 'สกิล 2 (RMB)', 'สกิล 3', 'สกิล 4'];
    const slots = ch.slots
      .map((slot, i) => {
        const s = g.skills[i];
        const def = slot.skill ? data.skills.combat[slot.skill] : null;
        const opts = [`<option value="">— ว่าง —</option>`]
          .concat(
            learned.map((id) => {
              const sd = data.skills.combat[id];
              const req = meetsRequires(ch, sd.requires);
              return `<option value="${id}" ${slot.skill === id ? 'selected' : ''} ${req.ok ? '' : 'disabled'}>${sd.name} · ${sd.nameTh}${req.ok ? '' : ` (ต้อง ${req.missing.join(', ')})`}</option>`;
            })
          )
          .join('');
        let body = `<div class="muted">ช่องนี้ว่าง — ผู้เล่นเลือกได้ว่าจะไม่ใช้การโจมตีธรรมดาเลยก็ได้</div>`;
        if (def && s) {
          const lvl = ch.skills[slot.skill];
          const upCost = skillUpgradeCost(data, slot.skill, lvl);
          const sockets = [];
          for (let k = 0; k < data.mods.maxModsPerSkill; k++) {
            const uid = slot.mods[k];
            if (uid) {
              const inst = ch.mods.find((m) => m.uid === uid);
              const md = data.mods.mods[inst.id];
              const active = meetsRequires(ch, md.requires).ok;
              sockets.push(`<button class="socket filled ${active ? '' : 'inactive'}" data-act="unsocket" data-uid="${uid}">◆ ${md.name} Lv.${inst.level}<br><span class="muted">${active ? 'แตะเพื่อถอด' : 'Stat ไม่ถึง · ยังไม่ทำงาน'}</span></button>`);
            } else sockets.push(`<button class="socket" data-act="pick-socket" data-slot="${i}">◇ ช่อง Mod ว่าง<br><span class="muted">แตะเพื่อใส่</span></button>`);
          }
          body = `<div><b>${def.name}</b> · ${def.nameTh} <span class="muted">Lv.${lvl}</span></div>
            <div class="muted">${esc(def.desc)}</div>
            <div>${[...s.tags].map((t) => `<span class="tag">${TAG_TH[t] || t}</span>`).join('')}</div>
            <div class="muted">${describeSkill(s)}</div>
            <div class="sockets">${sockets.join('')}</div>
            ${this.sel.socket === i ? this.modPicker(i) : ''}
            <div class="row"><div class="grow cost">${upCost ? `อัปเป็น Lv.${lvl + 1}: ${costHtml(ch, data, upCost)}` : '<span class="muted">เลเวลสูงสุด</span>'}</div>
            ${upCost ? `<button class="btn small" data-act="skill-up" data-skill="${slot.skill}" ${!near.workbench || !canAfford(ch, upCost) ? 'disabled' : ''}>อัปสกิล${near.workbench ? '' : ' (ที่โต๊ะคราฟต์)'}</button>` : ''}</div>`;
        }
        return `<div class="card slotcard"><div class="skicon">${def ? icon(def.icon) : icon('plus')}</div>
          <div><div class="row" style="padding-top:0"><div class="grow"><b>${slotLabels[i]}</b></div><select data-act="equip" data-slot="${i}">${opts}</select></div>${body}</div></div>`;
      })
      .join('');
    const mvOpts = ch.movementSkills
      .map((id) => {
        const md = data.skills.movement[id];
        const req = meetsRequires(ch, md.requires);
        return `<button class="btn ${ch.movement === id ? 'on' : ''}" data-act="movement" data-id="${id}" ${req.ok ? '' : 'disabled'}>${md.name} · ${md.nameTh}${req.ok ? '' : ` (ต้อง ${req.missing.join(', ')})`}</button>`;
      })
      .join('');
    const mv = g.move;
    const notLearned = Object.keys(data.skills.combat).filter((id) => !ch.skills[id]).length;
    return `<div class="grid2">${slots}</div>
      <div class="card" style="margin-top:14px"><h3>สกิลเคลื่อนที่ (ช่องแยก ไม่แย่งช่องต่อสู้)</h3>
        <div class="switch">${mvOpts}</div>
        <div class="muted" style="margin-top:6px">${esc(mv.def.desc)} · ${mv.charges} ชาร์จ · ชาร์จคืน ${mv.recharge.toFixed(1)} วิ${mv.invulnerable ? ' · อมตะระหว่างใช้' : ''}${mv.landing ? ` · ลงพื้นกระแทก ${Math.round(mv.landing.damage)}` : ''}</div></div>
      <div class="muted" style="margin-top:10px">Mod เปลี่ยนพฤติกรรมของสกิล และใส่ได้เฉพาะสกิลที่มี Tag ตรงกัน · ยังมีอีก ${notLearned} สกิลที่คราฟต์เรียนได้ที่โต๊ะคราฟต์ในนิคม</div>`;
  }

  modPicker(slotIndex) {
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const def = data.skills.combat[ch.slots[slotIndex].skill];
    if (!ch.mods.length) return `<div class="card" style="margin-top:6px"><span class="muted">ยังไม่มี Mod — คราฟต์ได้ที่โต๊ะคราฟต์</span></div>`;
    const rows = ch.mods
      .map((inst) => {
        const md = data.mods.mods[inst.id];
        const fit = modFits(def, md);
        const where = modSlotOf(ch, inst.uid);
        return `<div class="row"><div class="grow"><b>${md.name}</b> · ${md.nameTh} Lv.${inst.level}<div class="muted">${esc(md.desc)}${where >= 0 ? ` · ใส่อยู่ที่ช่อง ${where + 1}` : ''}</div></div>
          <button class="btn small" data-act="socket" data-slot="${slotIndex}" data-uid="${inst.uid}" ${fit.ok ? '' : 'disabled'}>${fit.ok ? 'ใส่' : 'Tag ไม่ตรง'}</button></div>`;
      })
      .join('');
    return `<div class="card" style="margin-top:6px"><div class="row" style="padding-top:0"><b class="grow">เลือก Mod</b><button class="btn small" data-act="pick-socket" data-slot="-1">ปิด</button></div>${rows}</div>`;
  }

  // ---------- Job tree ----------
  render_job() {
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const tree = data.jobtree;
    const near = g.nearby();
    const cost = respecCost(ch, data);
    const lines = [];
    for (const [id, n] of Object.entries(tree.nodes))
      for (const l of n.links)
        if (id < l) {
          const m = tree.nodes[l];
          const on = ch.jobNodes.includes(id) && ch.jobNodes.includes(l);
          lines.push(`<line x1="${n.pos[0]}" y1="${n.pos[1]}" x2="${m.pos[0]}" y2="${m.pos[1]}" stroke="${on ? '#ffd166' : '#ffffff40'}" stroke-width="${on ? 1.2 : 0.7}"/>`);
        }
    const nodes = Object.entries(tree.nodes)
      .map(([id, n]) => {
        const taken = ch.jobNodes.includes(id);
        const st = jobNodeState(ch, data, id);
        return `<button class="jnode ${n.type} ${taken ? 'taken' : ''} ${st.can ? 'can' : ''} ${this.sel.node === id ? 'sel' : ''}" style="left:${n.pos[0]}%;top:${n.pos[1]}%" data-act="node" data-id="${id}">${n.type === 'minor' ? '' : n.nameTh}</button>`;
      })
      .join('');
    const sel = this.sel.node ? tree.nodes[this.sel.node] : null;
    let info = `<span class="muted">แตะโหนดเพื่อดูรายละเอียด · เดินต่อจากโหนดที่ได้แล้ว · โหนด Job (สี่เหลี่ยม) คือการเลือก Job ต้องมี Job Lv.${data.progression.job.jobChoiceLevel} และเลือกได้ 1 สาย</span>`;
    if (sel) {
      const st = jobNodeState(ch, data, this.sel.node);
      const eff = Object.entries(sel.effects)
        .map(([k, v]) => effectText(k, v))
        .join(' · ');
      const reason = st.taken ? 'ได้แล้ว' : st.reason === 'not_linked' ? 'ยังไม่เชื่อมกับโหนดที่ได้' : st.reason === 'no_points' ? 'Job Point ไม่พอ' : st.reason === 'job_level' ? `ต้อง Job Lv.${st.need}` : st.reason === 'one_job' ? 'เลือก Job ได้สายเดียว (รีแต้มเพื่อเปลี่ยน)' : '';
      info = `<div><b>${sel.name}</b> · ${sel.nameTh} <span class="tag">${sel.type === 'job' ? 'JOB' : sel.type}</span></div>
        ${sel.descTh ? `<div class="muted">${sel.descTh}</div>` : ''}<div>${eff || '<span class="muted">จุดเริ่มต้น</span>'}</div>
        <div class="row"><div class="grow muted">${reason}</div><button class="btn primary" data-act="take-node" data-id="${this.sel.node}" ${st.can ? '' : 'disabled'}>ลงแต้ม</button></div>`;
    }
    return `<div class="row" style="padding-top:0"><div class="grow"><b>Job Points: ${ch.jobPoints}</b> <span class="muted">· Job Lv.${ch.jobLevel} · ${currentJob(ch, data) ? currentJob(ch, data).name : 'ยังไม่มี Job'}</span></div>
      <button class="btn" data-act="respec-job" ${!near.inTown || ch.gold < cost.job || ch.jobNodes.length <= 1 ? 'disabled' : ''}>รีแต้ม Job · ${cost.job} G</button></div>
      <div class="jobtree"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${lines.join('')}</svg>${nodes}</div>
      <div class="card" style="margin-top:8px">${info}</div>`;
  }

  // ---------- Bag + equipment ----------
  gearLine(it) {
    const data = this.game.data;
    const base = data.items.gearBases[it.base];
    const st = gearStats(it, data);
    const imp = weaponImplicit(it, data);
    const wt = base.weaponType ? data.items.weaponTypes?.[base.weaponType] : null;
    return `<span class="grade" style="color:${data.items.grades.colors[it.grade]}">${it.grade}</span> <b>${base.nameTh}${it.upgrade ? ` +${it.upgrade}` : ''}</b> <span class="muted">${base.name}</span>
      <div class="muted">${Object.entries(st)
        .map(([k, v]) => effectText(k, v))
        .join(' · ')}</div>
      ${wt ? `<div class="muted" style="color:#9fd8ff">${wt.nameTh} · ${Object.entries(imp)
        .map(([k, v]) => effectText(k, v))
        .join(' · ')}</div>` : ''}
      ${it.options.length ? `<div class="muted" style="color:#c59bff">${it.options.map((o) => optionText(data, o)).join(' · ')}</div>` : ''}`;
  }

  render_bag() {
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const near = g.nearby();
    const slots = data.items.slots;
    const eqRows = slots
      .map((slot) => {
        const it = gearItem(ch, ch.equipped[slot]);
        return `<div class="row eqrow"><div class="eqslot">${data.items.slotNames?.[slot] || slot}</div><div class="grow">${it ? this.gearLine(it) : '<span class="muted">— ว่าง —</span>'}</div>
          ${it && slot !== 'weapon' ? `<button class="btn small" data-act="unequip" data-slot="${slot}">ถอด</button>` : ''}</div>`;
      })
      .join('');
    const filter = this.sel.gear;
    const list = ch.gear.filter((it) => filter === 'all' || data.items.gearBases[it.base].slot === filter);
    const gearRows = list.length
      ? list
          .map((it) => {
            const base = data.items.gearBases[it.base];
            const eq = ch.equipped[base.slot] === it.uid;
            const req = meetsRequires(ch, base.requires);
            const up = gearUpgradeCost(data, it);
            return `<div class="row"><div class="grow"><span class="tag">${data.items.slotNames?.[base.slot] || base.slot}</span> ${this.gearLine(it)}
              ${!req.ok ? `<div class="muted" style="color:#ff6b5a">ต้อง ${req.missing.join(', ')}</div>` : ''}
              ${near.workbench && up ? `<div class="cost">ตีบวก +${it.upgrade + 1}: ${costHtml(ch, data, up)} <button class="btn small" data-act="gear-up" data-uid="${it.uid}" ${canAfford(ch, up) ? '' : 'disabled'}>ตีบวก</button></div>` : ''}</div>
              ${eq ? '<span class="tag" style="color:#ffd166">สวมอยู่</span>' : `<button class="btn small" data-act="equip-gear" data-uid="${it.uid}" ${req.ok ? '' : 'disabled'}>สวม</button>`}</div>`;
          })
          .join('')
      : '<div class="muted">ยังไม่มีของในหมวดนี้ — คราฟต์ได้ที่โต๊ะคราฟต์ในนิคม</div>';
    const mats = Object.entries(ch.materials).filter(([, n]) => n > 0);
    const matRows = mats.length
      ? mats
          .map(([id, n]) => {
            const m = data.items.materials[id];
            return `<div class="row"><span class="matdot ${m.rare ? 'rare' : ''}" style="background:${m.color}"></span><div class="grow">${m.nameTh} <span class="muted">${m.name}</span></div><b>×${n}</b>
            ${near.inTown ? `<button class="btn small" data-act="sell" data-id="${id}">ขาย 1 (${m.value}G)</button>` : ''}</div>`;
          })
          .join('')
      : '<div class="muted">ยังไม่มีวัตถุดิบ — ล่ามอนเพื่อเก็บหนัง เขี้ยว และของหายาก</div>';
    const modRows = ch.mods.length
      ? ch.mods
          .map((inst) => {
            const md = data.mods.mods[inst.id];
            const up = modUpgradeCost(data, inst);
            const where = modSlotOf(ch, inst.uid);
            return `<div class="row"><div class="grow"><b>◆ ${md.name}</b> · ${md.nameTh} Lv.${inst.level}<div class="muted">${esc(md.desc)} · ${where >= 0 ? `อยู่ที่สกิลช่อง ${where + 1}` : 'ยังไม่ได้ใส่'}</div>
              ${near.workbench && up ? `<div class="cost">อัป Lv.${inst.level + 1}: ${costHtml(ch, data, up)} <button class="btn small" data-act="mod-up" data-uid="${inst.uid}" ${canAfford(ch, up) ? '' : 'disabled'}>อัป Mod</button></div>` : ''}</div></div>`;
          })
          .join('')
      : '<div class="muted">ยังไม่มี Mod</div>';
    return `<div class="card"><h3>สวมใส่อยู่ · 5 ช่อง</h3>${eqRows}</div>
      <div class="card" style="margin-top:12px"><h3>อุปกรณ์ในกระเป๋า</h3>
        <div class="switch" style="margin-bottom:6px">${GEAR_FILTERS.map(([id, label]) => `<button class="btn small ${filter === id ? 'on' : ''}" data-act="gear-filter" data-id="${id}">${label}</button>`).join('')}</div>
        ${gearRows}<div class="muted" style="margin-top:6px">Grade (C/B/A/S) สุ่มตอนคราฟต์ แยกจากการตีบวก (+N) · อาวุธแต่ละประเภทมีโบนัสในตัว แต่ไม่ล็อกสกิล</div></div>
      <div class="grid2" style="margin-top:12px">
        <div class="card"><h3>วัตถุดิบ · 💰 ${ch.gold} G</h3>${matRows}<div class="muted" style="margin-top:6px">ใช้คราฟต์ อัปสกิล อัป Mod ${near.inTown ? 'และขายได้' : '(ขายได้ในนิคม)'}</div></div>
        <div class="card"><h3>Mod</h3>${modRows}</div></div>`;
  }

  // ---------- Workbench ----------
  render_craft() {
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const cat = this.sel.craft;
    const inCat = (r) => {
      if (r.type !== 'gear') return r.type === cat;
      const slot = data.items.gearBases[r.result].slot;
      if (cat === 'weapon') return slot === 'weapon';
      if (cat === 'charm') return slot === 'charm';
      return cat === 'armor' && (slot === 'armor' || slot === 'helm' || slot === 'boots');
    };
    const rows = Object.entries(data.recipes.recipes)
      .filter(([, r]) => inCat(r))
      .map(([id, r]) => {
        const block = recipeBlocker(ch, data, id);
        let name;
        let desc = '';
        let req = null;
        if (r.type === 'gear') {
          const b = data.items.gearBases[r.result];
          const wt = b.weaponType ? data.items.weaponTypes?.[b.weaponType] : null;
          name = `${b.nameTh} <span class="muted">${b.name} · ${wt ? wt.nameTh : data.items.slotNames?.[b.slot] || b.slot}</span>`;
          desc = `${Object.entries(b.stats)
            .map(([k, v]) => effectText(k, v))
            .join(' · ')} · Option: ${r.optionPool.map((o) => data.items.gearOptions[o].labelTh.replace('{v}', '?')).join(', ')}`;
          req = b.requires;
        } else if (r.type === 'skill') {
          const s = data.skills.combat[r.result];
          name = `${s.name} · ${s.nameTh}`;
          desc = s.desc;
          req = s.requires;
        } else if (r.type === 'movement') {
          const s = data.skills.movement[r.result];
          name = `${s.name} · ${s.nameTh}`;
          desc = s.desc;
          req = s.requires;
        } else {
          const m = data.mods.mods[r.result];
          name = `◆ ${m.name} · ${m.nameTh}`;
          desc = `${m.desc} · ใส่ได้กับ: ${[...(m.requiresAll || []), ...(m.requiresAny ? [m.requiresAny.join('/')] : [])].map((t) => TAG_TH[t] || t).join(' + ')}`;
          req = m.requires;
        }
        const reqTxt = req && Object.keys(req).length ? `<span class="${meetsRequires(ch, req).ok ? 'ok' : 'no'}">ต้อง ${Object.entries(req)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')}</span> · ` : '';
        return `<div class="row ${block ? '' : 'ready'}"><div class="grow"><b>${name}</b><div class="muted">${esc(desc)}</div><div class="cost">${reqTxt}${costHtml(ch, data, r.cost)}</div></div>
          <button class="btn primary" data-act="craft" data-id="${id}" ${block ? 'disabled' : ''}>${block === 'learned' ? 'มีแล้ว' : 'คราฟต์'}</button></div>`;
      })
      .join('');
    return `${this.lastResult ? `<div class="result-pop">${this.lastResult}</div>` : ''}
      <div class="switch" style="margin:8px 0">${CRAFT_FILTERS.map(([id, label]) => `<button class="btn ${cat === id ? 'on' : ''}" data-act="craft-filter" data-id="${id}">${label}</button>`).join('')}</div>
      <div class="card">${rows || '<div class="muted">ไม่มีสูตรในหมวดนี้</div>'}</div>
      <div class="muted" style="margin-top:10px">สูตรที่คราฟต์ได้ตอนนี้มีขอบสีทอง · อัปเลเวลสกิล (เมนูสกิล) ตีบวก และอัป Mod (เมนูกระเป๋า) ได้ขณะอยู่ที่โต๊ะนี้</div>`;
  }

  // ---------- Journal ----------
  render_journal() {
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const Q = data.quests;
    const tracked = trackedQuest(ch, data);
    const row = (id, main) => {
      const q = Q.quests[id];
      const st = questState(ch, id);
      if (st.status === 'locked') return `<div class="qrow locked"><b>🔒 ???</b><div class="muted">ทำภารกิจก่อนหน้าให้เสร็จก่อน</div></div>`;
      const done = st.status === 'done';
      const prog = Math.min(st.progress, q.count);
      const tq = !done ? questTarget(g, id) : null;
      const far = tq ? Math.round(Math.hypot(tq.x - g.player.x, tq.z - g.player.z)) : 0;
      return `<div class="qrow ${done ? 'done' : ''} ${id === tracked ? 'tracked' : ''}">
        <b>${done ? '✔' : id === tracked ? '★' : '•'} ${esc(q.nameTh)}</b> <span class="muted">${esc(q.name)}</span>
        <div class="muted">${esc(q.descTh)}</div>
        ${!done && q.count > 1 ? `<div class="qbar"><i style="width:${(prog / q.count) * 100}%"></i><span>${prog}/${q.count}</span></div>` : ''}
        <div class="muted">รางวัล: ${rewardText(data, q.reward)}${far > 12 ? ` · ห่าง ${far} ม. (ดาวทองบนมินิแมพ)` : ''}</div></div>`;
    };
    const sideOrder = [...Q.side].sort((a, b) => (questState(ch, a).status === 'done') - (questState(ch, b).status === 'done'));
    const p = ch.progress;
    const kills = Object.values(p.kills).reduce((a, b) => a + b, 0);
    const bosses = (data.world.bosses || []).map((b) => `<span>${data.monsters.monsters[b.monster].name}</span><b>${p.bossKills[b.id] ? `ปราบแล้ว ×${p.bossKills[b.id]}` : '—'}</b>`).join('');
    const doneCount = [...Q.main, ...Q.side].filter((id) => questState(ch, id).status === 'done').length;
    return `<div class="grid2">
      <div class="card"><h3>เนื้อเรื่องหลัก</h3>${Q.main.map((id) => row(id, true)).join('')}</div>
      <div><div class="card"><h3>ภารกิจรอง</h3>${sideOrder.map((id) => row(id, false)).join('')}</div>
        <div class="card" style="margin-top:12px"><h3>ความคืบหน้า</h3><div class="kv">
          <span>ภารกิจสำเร็จ</span><b>${doneCount}/${Q.main.length + Q.side.length}</b>
          <span>สำรวจพื้นที่</span><b>${p.zones.length}/${g.world.zones.length}</b>
          <span>หินวาร์ป</span><b>${p.waypoints.length}/${g.world.waypoints.length}</b>
          <span>ล่ามอนแล้ว</span><b>${kills} ตัว</b>
          ${bosses}
          <span>คราฟต์แล้ว</span><b>${p.crafted || 0} ครั้ง</b>
          <span>หมดสติ</span><b>${p.deaths || 0} ครั้ง</b>
          <span>เวลาเล่น</span><b>${fmtTime(p.playTime || 0)}</b>
        </div></div></div></div>`;
  }

  // ---------- World map ----------
  render_map() {
    const g = this.game;
    const w = g.world;
    const data = g.data;
    const img = mapImage(w);
    const b = w.bounds;
    const W = b.maxX - b.minX;
    const H = b.maxZ - b.minZ;
    const L = (x) => `${((x - b.minX) / W) * 100}%`;
    const T = (z) => `${((z - b.minZ) / H) * 100}%`;
    const prog = g.ch.progress;
    const fog = w.zones
      .filter((z) => !prog.zones.includes(z.id))
      .flatMap((z) => z.rects.map((r) => `<div class="fog" style="left:${L(r[0])};top:${T(r[2])};width:${((r[1] - r[0]) / W) * 100}%;height:${((r[3] - r[2]) / H) * 100}%"></div>`))
      .join('');
    const labels = w.zones
      .filter((z) => prog.zones.includes(z.id))
      .map((z) => {
        const r = z.rects.reduce((a, c) => ((c[1] - c[0]) * (c[3] - c[2]) > (a[1] - a[0]) * (a[3] - a[2]) ? c : a));
        return `<div class="zlabel" style="left:${L((r[0] + r[1]) / 2)};top:${T((r[2] + r[3]) / 2)}">${esc(z.nameTh)}<small>Lv.${z.level}${z.safe ? ' · ปลอดภัย' : '+'}</small></div>`;
      })
      .join('');
    const wps = w.waypoints
      .map((wp) => {
        const on = g.isWaypointUnlocked(wp.id);
        return `<button class="wpt ${on ? 'on' : ''}" style="left:${L(wp.x)};top:${T(wp.z)}" data-act="teleport" data-id="${wp.id}">${icon('portal')}<span>${esc(wp.nameTh)}</span></button>`;
      })
      .join('');
    const bosses = (data.world.bosses || [])
      .filter((bs) => prog.zones.includes(w.zoneAt(bs.pos[0], bs.pos[1]).id))
      .map((bs) => `<div class="bossmark" style="left:${L(bs.pos[0])};top:${T(bs.pos[1])}" title="${data.monsters.monsters[bs.monster].name}">☠</div>`)
      .join('');
    const tq = questTarget(g, trackedQuest(g.ch, data));
    const p = g.player;
    const t = data.world.town;
    return `${this.lastResult ? `<div class="result-pop" style="margin:0 0 8px">${this.lastResult}</div>` : ''}
      <div class="worldmap" style="aspect-ratio:${W}/${H}">
        <img src="${img.url()}" alt="" draggable="false">${fog}${labels}
        <div class="townmark" style="left:${L(t.workbench[0])};top:${T(t.workbench[1])}">🔨</div>
        ${bosses}${wps}
        ${tq ? `<div class="questmark" style="left:${L(tq.x)};top:${T(tq.z)}">★</div>` : ''}
        <div class="youmark" style="left:${L(p.x)};top:${T(p.z)};transform:translate(-50%,-50%) rotate(${Math.PI - p.facing}rad)"></div>
      </div>
      <div class="muted" style="margin-top:8px">แตะหินวาร์ปสีฟ้าเพื่อวาร์ป (ระหว่างต่อสู้วาร์ปไม่ได้) · หินสีเทายังไม่ปลดล็อก — เดินไปแตะเพื่อเปิดใช้ · ★ คือเป้าหมายภารกิจ · ☠ บอส · พื้นที่มืดคือที่ยังไม่ได้สำรวจ</div>`;
  }

  // ---------- Settings ----------
  render_settings() {
    const q = this.getQuality();
    const saveCard = this.slot
      ? `<div class="muted">เซฟช่อง ${this.slot} · บันทึกอัตโนมัติทุก 10 วินาที และทุกครั้งที่เลเวลอัป ทำภารกิจ หรือเปลี่ยนของ</div>
        <div class="row"><div class="grow"></div>
          <button class="btn" data-act="save-now">บันทึกตอนนี้</button>
          <button class="btn" data-act="export">คัดลอกโค้ดเซฟ</button>
          <button class="btn primary" data-act="title">กลับหน้าแรก</button></div>
        ${this.exported ? `<textarea class="savecode" readonly>${esc(this.exported)}</textarea><div class="muted">โค้ดนี้ใช้ย้ายเซฟไปเครื่องอื่นได้ (หน้าแรก → เลือกเซฟ → นำเข้า)</div>` : ''}`
      : `<div class="muted">โหมดทดสอบ: ไม่บันทึก</div><div class="row"><div class="grow"></div><button class="btn primary" data-act="title">กลับหน้าแรก</button></div>`;
    return `${this.lastResult ? `<div class="result-pop" style="margin:0 0 10px">${this.lastResult}</div>` : ''}
      <div class="card"><h3>เซฟ</h3>${saveCard}</div>
      <div class="card" style="margin-top:12px"><h3>กราฟิก</h3><div class="switch">
        ${['low', 'medium', 'high'].map((k) => `<button class="btn ${q === k ? 'on' : ''}" data-act="quality" data-q="${k}">${{ low: 'ต่ำ (ลื่นสุด)', medium: 'กลาง', high: 'สูง' }[k]}</button>`).join('')}
      </div><div class="muted" style="margin-top:6px">ถ้า iPad กระตุก ให้ลด "ต่ำ" (ปิดเงา ลดความละเอียด)</div></div>
      <div class="card" style="margin-top:12px"><h3>วิธีเล่น</h3><div class="muted" style="line-height:1.7">
        มือถือ/iPad: จอยซ้ายเดิน · แตะปุ่มสกิลเพื่อใช้กับเป้าอัตโนมัติ · ลากปุ่มสกิลเพื่อเล็ง (สกิลวงกว้างวางวงได้) · ปุ่มเล็กข้าง ๆ คือหลบ (ปัดเพื่อเลือกทิศ) · สองนิ้วซูม<br>
        PC: WASD เดิน · เมาส์เล็ง · คลิกซ้าย/ขวาใช้สกิล 1/2 · 3,4 (หรือ Q,R) สกิลที่เหลือ · Space หลบ · I/K/J/C/L/M เมนู · E ใช้โต๊ะคราฟต์/หินวาร์ป<br>
        ระบบเป้า: เมื่อมอนเข้าระยะ จะล็อกเป้าให้อัตโนมัติ หันไปหามอนตัวอื่นเพื่อเปลี่ยนเป้า ออกนอกระยะจะปล่อยเป้า ตัวละครไม่วิ่งตามเป้าเอง<br>
        การเดินทาง: เดินแตะหินวาร์ปเพื่อปลดล็อก แล้ววาร์ปจากแผนที่ (M) · ภูมิประเทศมีเนินและหน้าผา ขึ้นหน้าผาชันไม่ได้ ให้หาทางลาดหรือถนน<br>
        เป้าหมาย Demo: ทำภารกิจหลัก (L) → เก็บวัตถุดิบ → คราฟต์ที่นิคม → ปราบ Greyfang ในป่า → ข้ามแม่น้ำ → ปราบ Horned Warden บนซากโบราณ
      </div></div>`;
  }

  // ---------- actions ----------
  onSelect(e) {
    const t = e.target;
    if (t.dataset.act === 'equip') {
      const r = equipSkill(this.game.ch, this.game.data, Number(t.dataset.slot), t.value || null);
      this.sel.socket = undefined;
      if (!r.ok) this.flash(REASON_TH[r.reason] || r.reason);
      this.changed();
    }
  }

  onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.tagName === 'SELECT') return;
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const act = t.dataset.act;
    let r;
    switch (act) {
      case 'stat':
        allocateStat(ch, t.dataset.stat);
        return this.changed();
      case 'respec-stats':
        respecStats(ch, data);
        return this.changed();
      case 'respec-job':
        respecJob(ch, data);
        this.sel.node = null;
        return this.changed();
      case 'pick-socket':
        this.sel.socket = Number(t.dataset.slot) >= 0 ? Number(t.dataset.slot) : undefined;
        return this.render();
      case 'socket':
        r = socketMod(ch, data, Number(t.dataset.slot), Number(t.dataset.uid));
        if (!r.ok) this.flash(REASON_TH[r.reason] || r.reason);
        this.sel.socket = undefined;
        g.notify({ type: 'socket' });
        return this.changed();
      case 'unsocket':
        unsocketMod(ch, Number(t.dataset.uid));
        return this.changed();
      case 'movement':
        r = setMovement(ch, data, t.dataset.id);
        if (!r.ok) this.flash(REASON_TH[r.reason] || r.reason);
        g.player.movement.charges = 0;
        g.player.movement.rechargeT = 0;
        return this.changed();
      case 'skill-up':
        r = upgradeSkill(ch, data, t.dataset.skill);
        if (!r.ok) this.flash(REASON_TH[r.reason] || r.reason);
        return this.changed();
      case 'node':
        this.sel.node = t.dataset.id;
        return this.render();
      case 'take-node':
        allocateJobNode(ch, data, t.dataset.id);
        g.notify({ type: 'job' });
        return this.changed();
      case 'equip-gear':
        equip(ch, data, Number(t.dataset.uid));
        return this.changed();
      case 'unequip':
        unequip(ch, data, t.dataset.slot);
        return this.changed();
      case 'gear-filter':
        this.sel.gear = t.dataset.id;
        return this.render();
      case 'craft-filter':
        this.sel.craft = t.dataset.id;
        this.lastResult = null;
        return this.render(true);
      case 'gear-up':
        r = upgradeGear(ch, data, Number(t.dataset.uid));
        if (!r.ok) this.flash(REASON_TH[r.reason] || r.reason);
        return this.changed();
      case 'mod-up':
        r = upgradeMod(ch, data, Number(t.dataset.uid));
        if (!r.ok) this.flash(REASON_TH[r.reason] || r.reason);
        return this.changed();
      case 'sell':
        sellMaterial(ch, data, t.dataset.id, 1);
        return this.changed();
      case 'craft': {
        r = craft(ch, data, t.dataset.id, g.rng);
        if (!r.ok) {
          this.flash(REASON_TH[r.reason] || r.reason);
          return;
        }
        g.notify({ type: 'craft' });
        if (r.kind === 'gear') {
          const it = r.item;
          const base = data.items.gearBases[it.base];
          this.lastResult = `คราฟต์สำเร็จ! ${this.gearLine(it)}
            <button class="btn small" data-act="equip-gear" data-uid="${it.uid}" ${meetsRequires(ch, base.requires).ok ? '' : 'disabled'}>สวมเลย</button>`;
        } else if (r.kind === 'mod') this.lastResult = `ได้ Mod <b>${data.mods.mods[r.item.id].name}</b> — ไปใส่ที่เมนูสกิล`;
        else if (r.kind === 'skill') this.lastResult = `เรียนสกิล <b>${data.skills.combat[r.id].name}</b> แล้ว — เลือกใส่ช่องในเมนูสกิล`;
        else this.lastResult = `เรียน <b>${data.skills.movement[r.id].name}</b> แล้ว — เลือกใช้ในเมนูสกิล`;
        this.changed();
        this.body.scrollTop = 0;
        return;
      }
      case 'teleport': {
        const res = g.teleportTo(t.dataset.id);
        if (res.ok) {
          this.close();
          this.onChange?.();
        } else this.flash(TELEPORT_TH[res.reason] || res.reason);
        return;
      }
      case 'quality':
        this.onQuality(t.dataset.q);
        return this.render();
      case 'save-now':
        this.onChange?.();
        this.lastResult = 'บันทึกแล้ว ✔';
        return this.render();
      case 'export': {
        this.exported = this.exportSave?.() || '';
        navigator.clipboard?.writeText(this.exported).then(
          () => {
            this.lastResult = 'คัดลอกโค้ดเซฟแล้ว เก็บไว้ในโน้ตได้';
            this.render();
          },
          () => {}
        );
        return this.render();
      }
      case 'title':
        this.onTitle?.();
        return;
    }
  }

  flash(msg) {
    this.lastResult = `<span style="color:#ff6b5a">${esc(msg)}</span>`;
    this.render();
  }
}

function costHtml(ch, data, cost) {
  return Object.entries(cost)
    .map(([k, v]) => {
      const have = k === 'gold' ? ch.gold : ch.materials[k] || 0;
      const name = k === 'gold' ? 'G' : data.items.materials[k].nameTh;
      return `<span class="${have >= v ? 'ok' : 'no'}">${name} ${have}/${v}</span>`;
    })
    .join(' · ');
}

const EFFECT_TH = {
  attack: 'พลังโจมตี',
  magic: 'พลังเวท',
  defense: 'ป้องกัน',
  maxHp: 'HP',
  maxMp: 'MP',
  meleeDamagePct: 'ดาเมจประชิด %',
  projectileDamagePct: 'ดาเมจกระสุน %',
  areaDamagePct: 'ดาเมจวงกว้าง %',
  spellDamagePct: 'ดาเมจเวท %',
  summonDamagePct: 'ดาเมจอัญเชิญ %',
  maxHpPct: 'HP %',
  maxMpPct: 'MP %',
  barrierPct: 'เกราะเวท %',
  healPct: 'การฟื้นฟู %',
  moveSpeedPct: 'ความเร็วเดิน %',
  cooldownPct: 'คูลดาวน์เร็วขึ้น %',
  critChancePct: 'โอกาสคริ %',
  damageTakenPct: 'ดาเมจที่ได้รับ %',
  hpRegen: 'ฟื้น HP/วิ',
  mpRegenPct: 'ฟื้น MP %',
  projectileSpeedPct: 'ความเร็วกระสุน %',
  areaRadiusPct: 'รัศมีวงกว้าง %',
  echoDamagePct: 'ดาเมจ Echo %',
  extraMovementCharges: 'ชาร์จสกิลเคลื่อนที่',
  meleeHitBarrier: 'เกราะเมื่อตีประชิดโดน',
  healGrantsBarrierPct: 'ฮีลให้เกราะ %',
  meleeArcAdd: 'มุมฟัน°',
  poisonChancePct: 'โอกาสติดพิษ %',
  leechPct: 'ดูดเลือด %',
};

function effectText(k, v) {
  const sign = v > 0 ? '+' : '';
  return `${EFFECT_TH[k] || k} ${sign}${Math.round(v * 10) / 10}`;
}

function optionText(data, o) {
  return data.items.gearOptions[o.id].labelTh.replace('{v}', o.value);
}

function describeSkill(s) {
  const parts = [];
  if (s.damage !== undefined) parts.push(s.kind === 'dot_zone' ? `ดาเมจ ${Math.round(s.damage)}/วิ × ${s.duration.toFixed(1)} วิ` : `ดาเมจ ${Math.round(s.damage)}`);
  if (s.heal !== undefined) parts.push(`ฮีล ${Math.round(s.heal)}/วิ × ${s.duration.toFixed(1)} วิ`);
  if (s.barrier !== undefined) parts.push(`เกราะ ${Math.round(s.barrier)} (${s.duration} วิ)`);
  if (s.summon) parts.push(`${s.summon.count} ตัว · กัด ${Math.round(s.summon.damage)} · HP ${s.summon.hp} · ${s.summon.life} วิ`);
  if (s.takenMult) parts.push(`รับดาเมจ +${Math.round((s.takenMult - 1) * 100)}% · ตีเบาลง ${Math.round((1 - s.dealtMult) * 100)}% · ${s.duration} วิ`);
  if (s.damageBuff) parts.push(`ดาเมจ +${Math.round(s.damageBuff * 100)}% · เร็ว +${Math.round(s.speedBuff * 100)}% · ${s.duration} วิ`);
  if (s.projectiles > 1) parts.push(`${s.projectiles} ลูก`);
  if (s.pierce) parts.push(`ทะลุ ${s.pierce}`);
  if (s.chain) parts.push(`เด้ง ${s.chain}`);
  if (s.repeats) parts.push(`ฟันซ้ำ ${s.repeats} ครั้ง`);
  if (s.echo) parts.push(`Echo ${Math.round(s.echo.mult * 100)}%`);
  if (s.ground) parts.push('ทิ้งไฟ');
  if (s.chill) parts.push(`ช้าลง ${Math.round(s.chill.slow * 100)}%`);
  if (s.slow) parts.push(`ช้าลง ${Math.round(s.slow * 100)}%`);
  if (s.knock) parts.push('กระแทกกระเด็น');
  if (s.leech) parts.push(`ดูดเลือด ${s.leech.toFixed(1)}%`);
  if (s.reflect) parts.push(`สะท้อน ${Math.round(s.reflect * 100)}%`);
  if (s.trigger) parts.push('ร่ายเองเมื่อหลบ');
  if (s.kind === 'melee_arc') parts.push(`ระยะ ${s.range.toFixed(1)} ม. มุม ${Math.round(s.arc)}°`);
  else if (s.range) parts.push(`ระยะ ${s.range} ม.`);
  if (s.radius && s.kind !== 'self_barrier') parts.push(`รัศมี ${s.radius.toFixed(1)}`);
  parts.push(`คูลดาวน์ ${s.cooldown.toFixed(1)} วิ`);
  if (s.cost) parts.push(`MP ${s.cost}`);
  return parts.join(' · ');
}
