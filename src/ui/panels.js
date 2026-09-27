// Menu panels: Character (stats), Skills (slots + mods), Job Tree, Bag, Workbench, Settings.
// The game is paused while a panel is open (single-player demo).
import { icon } from './icons.js';
import { STATS, allocateStat, jobNodeState, allocateJobNode, currentJob, respecCost, respecStats, respecJob, gearItem, gearStats, equip, meetsRequires, expToNext, jobExpToNext } from '../core/character.js';
import { equipSkill, socketMod, unsocketMod, modFits, setMovement, modSlotOf } from '../core/skills.js';
import { canAfford, craft, recipeBlocker, upgradeGear, gearUpgradeCost, upgradeSkill, skillUpgradeCost, upgradeMod, modUpgradeCost, sellMaterial } from '../core/crafting.js';

const STAT_TH = { STR: 'พลังกาย · ดาเมจประชิด', AGI: 'ความคล่อง · ความเร็ว/คูลดาวน์', VIT: 'ความอึด · HP/ป้องกัน/เกราะ', INT: 'สติปัญญา · พลังเวท/MP', DEX: 'ความแม่น · คริ/กระสุน' };
const TAG_TH = { Attack: 'โจมตี', Spell: 'เวท', Melee: 'ประชิด', Projectile: 'กระสุน', Area: 'วงกว้าง', Damage: 'ดาเมจ', Fire: 'ไฟ', Earth: 'ดิน', Cold: 'น้ำแข็ง', Guard: 'การ์ด', Buff: 'บัฟ', Heal: 'ฮีล', Persistent: 'ค้างพื้น', Movement: 'เคลื่อนที่', Trigger: 'ทริกเกอร์' };
const REASON_TH = { materials: 'วัตถุดิบไม่พอ', learned: 'เรียนแล้ว', max: 'สูงสุดแล้ว', full: 'ช่อง Mod เต็ม', duplicate: 'ใส่ Mod ซ้ำไม่ได้', requires: 'Stat ไม่ถึง', not_learned: 'ยังไม่ได้เรียน' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Panels {
  constructor(root, game, { onChange, onReset, onQuality, getQuality }) {
    this.game = game;
    this.onChange = onChange;
    this.onReset = onReset;
    this.onQuality = onQuality;
    this.getQuality = getQuality;
    this.tab = null;
    this.sel = {};
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
  }

  get isOpen() {
    return this.tab !== null;
  }

  open(tab) {
    const near = this.game.nearby();
    if (tab === 'craft' && !near.workbench) tab = 'bag';
    this.tab = tab;
    this.overlay.classList.add('on');
    this.render();
  }

  close() {
    this.tab = null;
    this.overlay.classList.remove('on');
    this.lastResult = null;
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

  render() {
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
      ['settings', 'ตั้งค่า'],
    ];
    this.tabsEl.innerHTML =
      tabs.map(([id, label, n]) => `<button class="tab ${this.tab === id ? 'on' : ''}" data-tab="${id}">${label}${n ? `<span class="dot">${n}</span>` : ''}</button>`).join('') +
      `<button class="tab close" data-close="1" aria-label="close">✕</button>`;
    this.tabsEl.onclick = (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) {
        this.tab = t.dataset.tab;
        this.lastResult = null;
        this.render();
      }
      if (e.target.closest('[data-close]')) this.close();
    };
    const scroll = this.body.scrollTop;
    this.body.innerHTML = this[`render_${this.tab}`]();
    this.body.scrollTop = scroll;
  }

  // ---------- Character ----------
  render_char() {
    const g = this.game;
    const ch = g.ch;
    const d = g.derived;
    const near = g.nearby();
    const cost = respecCost(ch, g.data);
    const job = currentJob(ch, g.data);
    const rows = STATS.map(
      (s) => `<div class="row"><div class="grow"><b>${s}</b> <span class="muted">${STAT_TH[s]}</span></div><b style="min-width:28px;text-align:right">${ch.stats[s]}</b>
      <button class="stat-plus" data-act="stat" data-stat="${s}" ${ch.statPoints < 1 ? 'disabled' : ''}>+</button></div>`
    ).join('');
    return `<div class="grid2">
      <div class="card"><h3>Stat · เหลือ ${ch.statPoints} แต้ม</h3>
        <div class="muted" style="margin-bottom:6px">ได้จาก Character Level (เลเวลละ ${g.data.progression.character.statPointsPerLevel} แต้ม) · ใช้เป็นเงื่อนไขของอาวุธ สกิล และ Mod</div>
        ${rows}
        <div class="row"><div class="grow muted">รีแต้ม Stat ด้วยเงินในเกม (ในนิคมเท่านั้น)</div>
          <button class="btn" data-act="respec-stats" ${!near.inTown || ch.gold < cost.stats ? 'disabled' : ''}>รีแต้ม · ${cost.stats} G</button></div>
      </div>
      <div class="card"><h3>สถานะ</h3>
        <div class="kv">
          <span>Character Level</span><b>${ch.level} (${ch.exp}/${expToNext(g.data, ch.level)})</b>
          <span>Job Level</span><b>${ch.jobLevel} (${ch.jobExp}/${jobExpToNext(g.data, ch.jobLevel)})</b>
          <span>Job</span><b>${job ? `${job.name} · ${job.nameTh}` : 'ยังไม่เลือก (Job Lv.' + g.data.progression.job.jobChoiceLevel + ')'}</b>
          <span>HP / MP</span><b>${g.player.maxHp} / ${g.player.maxMp}</b>
          <span>พลังโจมตี (Attack)</span><b>${d.attack}</b>
          <span>พลังเวท (Magic)</span><b>${d.magic}</b>
          <span>ป้องกัน</span><b>${d.defense}</b>
          <span>โอกาสคริ</span><b>${Math.round(d.critChance * 100)}%</b>
          <span>ความเร็วเดิน</span><b>${d.moveSpeed.toFixed(1)} m/s</b>
          <span>คูลดาวน์เร็วขึ้น</span><b>${d.cooldownPct.toFixed(0)}%</b>
          ${d.meleeDamagePct ? `<span>ดาเมจประชิด</span><b>+${d.meleeDamagePct.toFixed(0)}%</b>` : ''}
          ${d.projectileDamagePct ? `<span>ดาเมจกระสุน</span><b>+${d.projectileDamagePct.toFixed(0)}%</b>` : ''}
          ${d.spellDamagePct ? `<span>ดาเมจเวท</span><b>+${d.spellDamagePct.toFixed(0)}%</b>` : ''}
          ${d.areaDamagePct ? `<span>ดาเมจวงกว้าง</span><b>+${d.areaDamagePct.toFixed(0)}%</b>` : ''}
          ${d.barrierPct ? `<span>เกราะเวท</span><b>+${d.barrierPct.toFixed(0)}%</b>` : ''}
          ${d.healPct ? `<span>การฟื้นฟู</span><b>+${d.healPct.toFixed(0)}%</b>` : ''}
          <span>Gold</span><b>${ch.gold}</b>
          <span>ปราบบอส</span><b>${ch.bossKills} ครั้ง</b>
        </div></div></div>`;
  }

  // ---------- Skills ----------
  render_skills() {
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const near = g.nearby();
    const learned = Object.keys(ch.skills);
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
    return `<div class="grid2">${slots}</div>
      <div class="card" style="margin-top:14px"><h3>สกิลเคลื่อนที่ (ช่องแยก ไม่แย่งช่องต่อสู้)</h3>
        <div class="switch">${mvOpts}</div>
        <div class="muted" style="margin-top:6px">${esc(mv.def.desc)} · ${mv.charges} ชาร์จ · ชาร์จคืน ${mv.recharge.toFixed(1)} วิ${mv.invulnerable ? ' · อมตะระหว่างใช้' : ''}</div></div>
      <div class="muted" style="margin-top:10px">Mod เปลี่ยนพฤติกรรมของสกิล และใส่ได้เฉพาะสกิลที่มี Tag ตรงกัน · คราฟต์ Mod และสกิลใหม่ได้ที่โต๊ะคราฟต์ในนิคม</div>`;
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

  // ---------- Bag ----------
  render_bag() {
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const near = g.nearby();
    const mats = Object.entries(ch.materials).filter(([, n]) => n > 0);
    const matRows = mats.length
      ? mats
          .map(([id, n]) => {
            const m = data.items.materials[id];
            return `<div class="row"><span style="width:12px;height:12px;border-radius:3px;background:${m.color};flex:none"></span><div class="grow">${m.nameTh} <span class="muted">${m.name}</span></div><b>×${n}</b>
            ${near.inTown ? `<button class="btn small" data-act="sell" data-id="${id}">ขาย 1 (${m.value}G)</button>` : ''}</div>`;
          })
          .join('')
      : '<div class="muted">ยังไม่มีวัตถุดิบ — ล่ามอนในทุ่งหญ้าเพื่อเก็บหนังและเขี้ยว</div>';
    const gearRows = ch.gear
      .map((it) => {
        const base = data.items.gearBases[it.base];
        const eq = ch.equipped[base.slot] === it.uid;
        const req = meetsRequires(ch, base.requires);
        const st = gearStats(it, data);
        const up = gearUpgradeCost(data, it);
        const statTxt = Object.entries(st)
          .map(([k, v]) => effectText(k, v))
          .join(' · ');
        return `<div class="row"><div class="grow"><span class="grade" style="color:${data.items.grades.colors[it.grade]}">${it.grade}</span> <b>${base.nameTh}${it.upgrade ? ` +${it.upgrade}` : ''}</b> <span class="muted">${base.name}</span>
          <div class="muted">${statTxt}</div>
          ${it.options.length ? `<div class="muted" style="color:#c59bff">${it.options.map((o) => optionText(data, o)).join(' · ')}</div>` : ''}
          ${!req.ok ? `<div class="muted" style="color:#ff6b5a">ต้อง ${req.missing.join(', ')}</div>` : ''}
          ${near.workbench && up ? `<div class="cost">ตีบวก +${it.upgrade + 1}: ${costHtml(ch, data, up)} <button class="btn small" data-act="gear-up" data-uid="${it.uid}" ${canAfford(ch, up) ? '' : 'disabled'}>ตีบวก</button></div>` : ''}</div>
          ${eq ? '<span class="tag" style="color:#ffd166">สวมอยู่</span>' : `<button class="btn small" data-act="equip-gear" data-uid="${it.uid}" ${req.ok ? '' : 'disabled'}>สวม</button>`}</div>`;
      })
      .join('');
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
    return `<div class="grid2">
      <div class="card"><h3>วัตถุดิบ · 💰 ${ch.gold} G</h3>${matRows}<div class="muted" style="margin-top:6px">วัตถุดิบใช้คราฟต์ อัปสกิล อัป Mod และขายได้ ${near.inTown ? '' : '(ขายได้ในนิคม)'}</div></div>
      <div class="card"><h3>อุปกรณ์</h3>${gearRows}<div class="muted" style="margin-top:6px">Grade (C/B/A/S) สุ่มตอนคราฟต์ แยกจากการตีบวก (+N)</div></div>
      <div class="card"><h3>Mod</h3>${modRows}</div></div>`;
  }

  // ---------- Workbench ----------
  render_craft() {
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const groups = { gear: 'อุปกรณ์ (สุ่ม Grade + Option)', skill: 'สกิลใหม่', movement: 'สกิลเคลื่อนที่', mod: 'Skill Mod' };
    const out = [];
    for (const [type, label] of Object.entries(groups)) {
      const rows = Object.entries(data.recipes.recipes)
        .filter(([, r]) => r.type === type)
        .map(([id, r]) => {
          const block = recipeBlocker(ch, data, id);
          let name;
          let desc = '';
          if (type === 'gear') {
            const b = data.items.gearBases[r.result];
            name = `${b.nameTh} <span class="muted">${b.name}</span>`;
            desc = `${Object.entries(b.stats)
              .map(([k, v]) => effectText(k, v))
              .join(' · ')} · Option: ${r.optionPool.map((o) => data.items.gearOptions[o].labelTh.replace('{v}', '?')).join(', ')}`;
          } else if (type === 'skill') {
            const s = data.skills.combat[r.result];
            name = `${s.name} · ${s.nameTh}`;
            desc = s.desc + (Object.keys(s.requires).length ? ` · ต้อง ${Object.entries(s.requires).map(([k, v]) => `${k} ${v}`).join(', ')}` : '');
          } else if (type === 'movement') {
            const s = data.skills.movement[r.result];
            name = `${s.name} · ${s.nameTh}`;
            desc = s.desc;
          } else {
            const m = data.mods.mods[r.result];
            name = `◆ ${m.name} · ${m.nameTh}`;
            desc = `${m.desc} · ใส่ได้กับ: ${[...(m.requiresAll || []), ...(m.requiresAny ? [m.requiresAny.join('/')] : [])].map((t) => TAG_TH[t] || t).join(' + ')}`;
          }
          return `<div class="row"><div class="grow"><b>${name}</b><div class="muted">${esc(desc)}</div><div class="cost">${costHtml(ch, data, r.cost)}</div></div>
            <button class="btn primary" data-act="craft" data-id="${id}" ${block ? 'disabled' : ''}>${block === 'learned' ? 'มีแล้ว' : 'คราฟต์'}</button></div>`;
        })
        .join('');
      out.push(`<div class="card"><h3>${label}</h3>${rows}</div>`);
    }
    return `${this.lastResult ? `<div class="result-pop">${this.lastResult}</div>` : ''}<div class="grid2" style="margin-top:8px">${out.join('')}</div>
      <div class="muted" style="margin-top:10px">อัปเลเวลสกิล (เมนูสกิล) ตีบวก และอัป Mod (เมนูกระเป๋า) ได้ขณะอยู่ที่โต๊ะนี้</div>`;
  }

  // ---------- Settings ----------
  render_settings() {
    const q = this.getQuality();
    return `<div class="card"><h3>กราฟิก</h3><div class="switch">
        ${['low', 'medium', 'high'].map((k) => `<button class="btn ${q === k ? 'on' : ''}" data-act="quality" data-q="${k}">${{ low: 'ต่ำ (ลื่นสุด)', medium: 'กลาง', high: 'สูง' }[k]}</button>`).join('')}
      </div><div class="muted" style="margin-top:6px">ถ้า iPad กระตุก ให้ลด "ต่ำ" (ปิดเงา ลดความละเอียด)</div></div>
      <div class="card" style="margin-top:12px"><h3>วิธีเล่น</h3><div class="muted" style="line-height:1.7">
        มือถือ/iPad: จอยซ้ายเดิน · แตะปุ่มสกิลเพื่อใช้กับเป้าอัตโนมัติ · ลากปุ่มสกิลเพื่อเล็ง (สกิลวงกว้างวางวงได้) · ปุ่มเล็กข้าง ๆ คือหลบ (ปัดเพื่อเลือกทิศ) · สองนิ้วซูม<br>
        PC: WASD เดิน · เมาส์เล็ง · คลิกซ้าย/ขวาใช้สกิล 1/2 · 3,4 (หรือ Q,R) สกิลที่เหลือ · Space หลบ · I/K/J/C เมนู · E ใช้โต๊ะคราฟต์<br>
        ระบบเป้า: เมื่อมอนเข้าระยะ จะล็อกเป้าให้อัตโนมัติ หันไปหามอนตัวอื่นเพื่อเปลี่ยนเป้า ออกนอกระยะจะปล่อยเป้า ตัวละครไม่วิ่งตามเป้าเอง<br>
        เป้าหมาย Demo: เก็บวัตถุดิบ → คราฟต์ของ/Mod ที่นิคม → ข้ามแม่น้ำ → ปราบ Horned Warden ที่ซากโบราณ
      </div></div>
      <div class="card" style="margin-top:12px"><h3>เซฟ</h3><div class="muted">เกมบันทึกอัตโนมัติในเบราว์เซอร์นี้</div>
        <div class="row"><div class="grow"></div><button class="btn" data-act="reset" style="border-color:#ff6b5a">เริ่มใหม่ทั้งหมด</button></div></div>`;
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
        return this.changed();
      case 'equip-gear':
        r = equip(ch, data, Number(t.dataset.uid));
        return this.changed();
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
        if (r.kind === 'gear') {
          const it = r.item;
          const base = data.items.gearBases[it.base];
          const st = gearStats(it, data);
          this.lastResult = `คราฟต์สำเร็จ! <span class="grade" style="color:${data.items.grades.colors[it.grade]}">Grade ${it.grade}</span> <b>${base.nameTh}</b>
            <div class="muted">${Object.entries(st)
              .map(([k, v]) => effectText(k, v))
              .join(' · ')}</div>${it.options.length ? `<div style="color:#c59bff">${it.options.map((o) => optionText(data, o)).join(' · ')}</div>` : '<div class="muted">ไม่มี Option</div>'}
            <button class="btn small" data-act="equip-gear" data-uid="${it.uid}" ${meetsRequires(ch, base.requires).ok ? '' : 'disabled'}>สวมเลย</button>`;
        } else if (r.kind === 'mod') this.lastResult = `ได้ Mod <b>${data.mods.mods[r.item.id].name}</b> — ไปใส่ที่เมนูสกิล`;
        else if (r.kind === 'skill') this.lastResult = `เรียนสกิล <b>${data.skills.combat[r.id].name}</b> แล้ว — เลือกใส่ช่องในเมนูสกิล`;
        else this.lastResult = `เรียน <b>${data.skills.movement[r.id].name}</b> แล้ว — เลือกใช้ในเมนูสกิล`;
        return this.changed();
      }
      case 'quality':
        this.onQuality(t.dataset.q);
        return this.render();
      case 'reset':
        if (confirm('ลบเซฟและเริ่มใหม่ทั้งหมด?')) this.onReset();
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
  if (s.damage !== undefined) parts.push(`ดาเมจ ${Math.round(s.damage)}`);
  if (s.heal !== undefined) parts.push(`ฮีล ${Math.round(s.heal)}/วิ × ${s.duration} วิ`);
  if (s.barrier !== undefined) parts.push(`เกราะ ${Math.round(s.barrier)} (${s.duration} วิ)`);
  if (s.projectiles > 1) parts.push(`${s.projectiles} ลูก`);
  if (s.pierce) parts.push(`ทะลุ ${s.pierce}`);
  if (s.chain) parts.push(`เด้ง ${s.chain}`);
  if (s.echo) parts.push(`Echo ${Math.round(s.echo.mult * 100)}%`);
  if (s.ground) parts.push('ทิ้งไฟ');
  if (s.chill) parts.push(`ช้าลง ${Math.round(s.chill.slow * 100)}%`);
  if (s.reflect) parts.push(`สะท้อน ${Math.round(s.reflect * 100)}%`);
  if (s.trigger) parts.push('ร่ายเองเมื่อหลบ');
  if (s.kind === 'melee_arc') parts.push(`ระยะ ${s.range.toFixed(1)} ม. มุม ${Math.round(s.arc)}°`);
  else if (s.range) parts.push(`ระยะ ${s.range} ม.`);
  if (s.radius && s.kind !== 'self_barrier') parts.push(`รัศมี ${s.radius.toFixed(1)}`);
  parts.push(`คูลดาวน์ ${s.cooldown.toFixed(1)} วิ`);
  if (s.cost) parts.push(`MP ${s.cost}`);
  return parts.join(' · ');
}
