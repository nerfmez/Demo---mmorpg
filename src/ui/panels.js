import { gradeBadge, optionList, wearRequirements } from './progressionview.js';
import { craftView } from './craftview.js';
// Menu panels: Character, Skills (slots + mods), Job Tree, Bag (equipment), Workbench,
// Journal (quests + progress), World Map (fast travel) and Settings (graphics + save).
// The game is paused while a panel is open (single-player demo).
import { icon } from './icons.js';
import { art } from './art.js';
import { skillsView, modsWorkspace, movementWorkspace, growthWorkspace } from './skillview.js';
import { tagsHtml, rulesHtml } from './buildmeta.js';
import { atlasView } from './atlas.js';
import { jobView, mountJobNetwork } from './jobview.js';
import { questTarget, rewardText } from './hud.js';
import { STATS, allocateStat, allocateJobNode, currentJob, respecCost, respecStats, respecJob, gearStats, gearRequirements, gearEquipState, weaponImplicit, equip, unequip, meetsRequires, expToNext, jobExpToNext } from '../core/character.js';
import { equipSkill, socketMod, unsocketMod, setMovement } from '../core/skills.js';
import { canAfford, craft, craftBatch, promoteGear, recipeBlocker, upgradeGear, upgradeSkill, skillUpgradeCost, upgradeMod, sellMaterial } from '../core/crafting.js';
import { questState, trackedQuest } from '../core/quests.js';
import { inventoryView } from './inventory.js';

const STAT_TH = { STR: 'พลังกาย · ดาเมจประชิด', AGI: 'ความคล่อง · ความเร็ว/คูลดาวน์', VIT: 'ความอึด · HP/ป้องกัน/เกราะ', INT: 'สติปัญญา · พลังเวท/MP', DEX: 'ความแม่น · คริ/กระสุน' };
const TAG_TH = {
  Attack: 'โจมตี', Spell: 'เวท', Melee: 'ประชิด', Projectile: 'กระสุน', Area: 'วงกว้าง', Damage: 'ดาเมจ', Fire: 'ไฟ', Earth: 'ดิน', Cold: 'น้ำแข็ง',
  Lightning: 'สายฟ้า', Poison: 'พิษ', Chain: 'เด้งต่อ', Control: 'ควบคุม', Debuff: 'ดีบัฟ', Curse: 'คำสาป', Guard: 'การ์ด', Buff: 'บัฟ', Warcry: 'คำราม',
  Heal: 'ฮีล', Persistent: 'ค้างพื้น', Summon: 'อัญเชิญ', Minion: 'ลูกสมุน', Movement: 'เคลื่อนที่', Trigger: 'ทริกเกอร์',
};
const REASON_TH = { level: 'เลเวลตัวละครยังไม่ถึงขั้นที่กำหนด', invalid: 'การตั้งค่าคราฟต์ไม่ถูกต้อง', materials: 'วัตถุดิบไม่พอ', learned: 'เรียนแล้ว', max: 'สูงสุดแล้ว', full: 'ช่อง Mod เต็ม', duplicate: 'ใส่ Mod ซ้ำไม่ได้', requires: 'Stat ไม่ถึง', not_learned: 'ยังไม่ได้เรียน' };
const TELEPORT_TH = { combat: 'กำลังต่อสู้อยู่ — ออกจากการต่อสู้ก่อนแล้วค่อยวาร์ป', locked: 'ยังไม่ได้ปลดล็อก — เดินไปแตะหินวาร์ปนั้นก่อน', dead: 'หมดสติอยู่', unknown: 'ไม่พบจุดวาร์ป' };
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
   * @param {{onChange?:Function, onQuality:Function, getQuality:Function, onTitle?:Function, exportSave?:Function, slot?:number|null, onVisibility?:Function}} opts
   */
  constructor(root, game, { onChange, onQuality, getQuality, onTitle, exportSave, slot = null, onVisibility }) {
    this.game = game;
    this.onChange = onChange;
    this.onQuality = onQuality;
    this.getQuality = getQuality;
    this.onTitle = onTitle;
    this.exportSave = exportSave;
    this.slot = slot;
    this.onVisibility = onVisibility;
    this.tab = null;
    this.sel = { gear: 'all', craft: 'weapon', bag: 'gear', skill: 0 };
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `<section class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" tabindex="-1">
      <header class="panel-header"><div><small class="panel-eyebrow">SEEKER · FIELD JOURNAL</small><h2 id="panel-title"></h2></div>
      <div class="panel-meta"><span class="panel-gold"></span><span class="pause-label">พักการเล่น</span></div>
      <button class="panel-close" data-close aria-label="ปิดเมนู">✕</button></header>
      <label class="seeker-mobile-nav">หน้าต่าง <select aria-label="เลือกหน้าต่างเกม" data-page-select></select></label><nav class="tabs" role="tablist" aria-label="หน้าต่างเกม"></nav><div class="pbody" id="panel-content" role="tabpanel"></div>
      <footer class="panel-footer"><span>เลือกดูรายละเอียด แล้วแตะปุ่มเพื่อใช้งาน</span><button class="btn" data-close>กลับเข้าเกม <kbd>Esc</kbd></button></footer></section>`;
    root.appendChild(this.overlay);
    this.tabsEl = this.overlay.querySelector('.tabs');
    this.body = this.overlay.querySelector('.pbody');
    this.overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.close();
    });
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('toggle',e=>{
      if(e.target.matches('[data-craft-repeat]') && e.target.isConnected) {
        const open=this.sel.craftRepeatOpen||(this.sel.craftRepeatOpen={});
        open[e.target.dataset.craftRepeat]=e.target.open;
      }
    },true);
    this.overlay.addEventListener('change', e => {
      if(e.target.matches('[data-page-select]')) return this.open(e.target.value);
      if(e.target.matches('[data-batch-select]')) {
        const id=e.target.dataset.batchSelect,field=e.target.dataset.field;
        const goals=this.sel.craftGoals||(this.sel.craftGoals={});
        const goal=goals[id]||(goals[id]={attempts:5,grade:'A',option:'',quality:0});
        goal[field]=['attempts','quality'].includes(field)?Number(e.target.value):e.target.value;
        this.render();
        const control=this.body.querySelector(`[data-batch-select="${id}"]`);
        if(control)control.closest('details').open=true;
        return;
      }
      if(e.target.matches('[data-workspace-select]')) {
        this.sel[e.target.dataset.workspaceSelect] = e.target.value;
        this.render();
      }
    });
    this.body.addEventListener('submit', e => {
      if(!e.target.matches('.seeker-node-search')) return;
      e.preventDefault();
      this.sel.nodeSearch = new FormData(e.target).get('node-search').toString().trim();
      this.render(true);
    });
    this.tabsEl.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) {
        this.lastResult = null;
        this.open(t.dataset.tab);
        this.tabsEl.querySelector(`[data-tab="${this.tab}"]`)?.focus({ preventScroll: true });
      }
    });
    this.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (e.key === 'Tab') {
        const controls = [...this.overlay.querySelectorAll('button:not(:disabled), select, input, textarea, summary')].filter((el) => el.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === this.overlay.querySelector('.panel'))) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first?.focus();
        }
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) && e.target.matches('[data-tab]')) {
        e.preventDefault();
        e.stopPropagation();
        const tabs = [...this.tabsEl.querySelectorAll('[data-tab]')];
        const idx = tabs.indexOf(e.target);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (idx + (['ArrowRight','ArrowDown'].includes(e.key) ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].click();
      }
    });
  }

  get isOpen() {
    return this.tab !== null;
  }

  open(tab) {
    if (!this.isOpen) {
      const active = document.activeElement;
      this.returnFocus = active?.matches(':focus-visible')
        ? active.closest('#game-menu') ? document.querySelector('.menu-toggle') : active
        : null;
    }
    if (this.tab !== tab) this.sel.detail = false;
    this.tab = tab;
    this.overlay.classList.toggle('is-journal', tab === 'job');
    this.overlay.classList.add('on');
    document.body.classList.add('panel-open');
    this.onVisibility?.(true);
    this.render(true);
    this.overlay.querySelector('.panel').focus({ preventScroll: true });
  }

  close() {
    this.cleanJobNetwork?.();
    this.cleanJobNetwork = null;
    this.tab = null;
    this.overlay.classList.remove('on', 'is-journal');
    document.body.classList.remove('panel-open');
    this.lastResult = null;
    this.sel.socket = undefined;
    this.onVisibility?.(false);
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    else if (this.overlay.contains(document.activeElement)) document.activeElement.blur();
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

  recordCraft(id, items, spent, reason='single') {
    const {data}=this.game,history=this.sel.craftHistory||(this.sel.craftHistory={}),status=this.sel.craftStatus||(this.sel.craftStatus={});
    history[id]=[...items.map(it=>it.uid).reverse(),...(history[id]||[])].slice(0,20);
    const cost=Object.entries(spent).map(([key,n])=>(key==='gold'?'Gold':data.items.materials[key].nameTh)+' ×'+n).join(' · ');
    const message=reason==='single'?`คราฟต์สำเร็จ · เกรด ${items[0].grade} · ${items[0].options.length} ออฟชั่น`:`คราฟต์ ${items.length} ครั้ง · ${reason==='target'?'ได้ตามเป้าหมาย':reason==='materials'?'วัตถุดิบหมด':'ครบจำนวนที่ตั้งไว้'}`;
    status[id]=`<b>${message}</b><small>ใช้จริง ${cost}</small>`;
  }

  badges() {
    const ch = this.game.ch;
    return { char: ch.statPoints, job: ch.jobPoints };
  }

  render(top = false) {
    if (!this.isOpen) return;
    const g = this.game;
    const b = this.badges();
    const tabs = [
      ['char', 'ตัวละคร', b.char],
      ['skills', 'ชุดสกิล'],
      ['mods', 'ม็อด'],
      ['movement', 'เคลื่อนที่'],
      ['growth', 'อัปเลเวล'],
      ['job', 'เส้นทางพาสซีฟ', b.job],
      ['bag', 'กระเป๋า'],
      ['craft', 'โต๊ะคราฟต์'],
      ['journal', 'ภารกิจ'],
      ['map', 'แผนที่'],
      ['settings', 'ตั้งค่า'],
    ];
    const active = document.activeElement;
    const activeData = active?.closest('.panel') ? { ...active.dataset } : null;
    const tabIcon = {char:'person',skills:'book',mods:'hex',movement:'dash',growth:'spark',job:'tree',bag:'bag',craft:'hammer',journal:'scroll',map:'map',settings:'gear'};
    this.tabsEl.innerHTML = tabs.map(([id, label, n]) => `<button class="tab ${this.tab === id ? 'on' : ''}" id="tab-${id}" role="tab" aria-selected="${this.tab === id}" aria-controls="panel-content" data-tab="${id}">${icon(tabIcon[id])}<span>${label}</span>${n ? `<span class="dot">${n}</span>` : ''}</button>`).join('');
    this.tabsEl.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.overlay.querySelector('[data-page-select]').innerHTML = tabs.map(([id,label]) => `<option value="${id}" ${this.tab===id?'selected':''}>${label}</option>`).join('');
    this.overlay.querySelector('#panel-title').textContent = tabs.find(([id]) => id === this.tab)?.[1] || '';
    this.overlay.querySelector('.panel-gold').textContent = `${g.ch.gold.toLocaleString()} G`;
    this.body.dataset.panel = this.tab;
    this.body.setAttribute('aria-labelledby', `tab-${this.tab}`);
    const scroll = top ? 0 : this.body.scrollTop;
    this.cleanJobNetwork?.();
    this.body.innerHTML = this[`render_${this.tab}`]();
    if(this.lastResult && ['skills','mods','movement','growth','job'].includes(this.tab)) this.body.insertAdjacentHTML('afterbegin', `<div class="result-pop" role="status">${this.lastResult}</div>`);
    this.cleanJobNetwork = this.tab === 'job' ? mountJobNetwork(this) : null;
    this.body.scrollTop = scroll;
    if (activeData && Object.keys(activeData).length) {
      const focus = [...this.overlay.querySelectorAll('button, select')].find((el) => Object.entries(activeData).every(([key, val]) => el.dataset[key] === val));
      (focus || this.overlay.querySelector('.panel')).focus({ preventScroll: true });
    }
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
          <span>ฟื้นมานา</span><b>${d.mpRegen.toFixed(2)} MP/วิ</b>
          ${pct('ลดค่าใช้มานา',d.manaCostPct)}
          <span>พลังโจมตี (Attack)</span><b>${d.attack}</b>
          <span>พลังเวท (Magic)</span><b>${d.magic}</b>
          <span>ป้องกัน</span><b>${d.defense}</b>
          <span>โอกาสคริ</span><b>${Math.round(d.critChance * 100)}%</b>
          <span>ความเร็วเดิน</span><b>${d.moveSpeed.toFixed(1)} m/s</b>
          <span>คูลดาวน์เร็วขึ้น</span><b>${d.cooldownPct.toFixed(0)}%</b>
          ${pct('ดาเมจประชิด', d.meleeDamagePct)}${pct('ดาเมจกระสุน', d.projectileDamagePct)}${pct('ดาเมจเวท', d.spellDamagePct)}${pct('ดาเมจวงกว้าง', d.areaDamagePct)}
          ${pct('ดาเมจกายภาพ',d.physicalDamagePct)}${pct('ดาเมจไฟ',d.fireDamagePct)}${pct('ดาเมจน้ำแข็ง',d.coldDamagePct)}${pct('ดาเมจสายฟ้า',d.lightningDamagePct)}${pct('ดาเมจดิน',d.earthDamagePct)}${pct('ดาเมจพิษ',d.poisonDamagePct)}${pct('ดาเมจอัญเชิญ', d.summonDamagePct)}${pct('เกราะเวท', d.barrierPct)}${pct('การฟื้นฟู', d.healPct)}
          ${d.leechPct ? `<span>ดูดเลือด</span><b>${d.leechPct.toFixed(1)}%</b>` : ''}
          ${d.poisonChancePct ? `<span>โอกาสติดพิษ</span><b>${d.poisonChancePct.toFixed(0)}%</b>` : ''}
          <span>Gold</span><b>${ch.gold}</b>
        </div></div></div>`;
  }

  // ---------- Skills ----------
  render_skills() {
    return skillsView(this, { costHtml, describeSkill, tagNames: TAG_TH });
  }

  render_mods() { return modsWorkspace(this, {describeSkill}); }
  render_movement() { return movementWorkspace(this); }
  render_growth() { return growthWorkspace(this, {costHtml,describeSkill}); }

  // ---------- Job tree ----------
  render_job() {
    return jobView(this, { effectText });
  }

  // ---------- Bag + equipment ----------
  gearLine(it) {
    const data = this.game.data;
    const base = data.items.gearBases[it.base];
    const st = gearStats({ ...it, options: [] }, data);
    const imp = weaponImplicit(it, data);
    const wt = base.weaponType ? data.items.weaponTypes?.[base.weaponType] : null;
    return `${gradeBadge(data,it.grade,it.options.length)} <b>${base.nameTh}${it.upgrade ? ` +${it.upgrade}` : ''}</b> <span class="muted">${base.name}</span>
      <div class="muted">${Object.entries(st)
        .map(([k, v]) => effectText(k, v))
        .join(' · ')}</div>
      ${wt ? `<div class="gear-implicit">${wt.nameTh} · ${Object.entries(imp)
        .map(([k, v]) => effectText(k, v))
        .join(' · ')}</div>` : ''}
      ${optionList(data,it.options)}${wearRequirements(this.game.ch,gearRequirements(it,data))}`;
  }

  render_bag() {
    const back=this.sel.returnCraftRecipe?`<button class="btn craft-return" data-act="return-craft">← กลับไปคราฟต์ ${this.game.data.items.gearBases[this.game.data.recipes.recipes[this.sel.returnCraftRecipe].result]?.nameTh||''}</button>`:'';
    const notice=this.game.ch.progress.equipmentNotice?`<div class="result-pop" role="status">${esc(this.game.ch.progress.equipmentNotice)}</div>`:'';
    return `${back}${notice}${this.lastResult ? `<div class="result-pop" role="status">${this.lastResult}</div>` : ''}${inventoryView(this, { costHtml, effectText })}`;
  }

  // ---------- Workbench ----------
  render_craft() {
    return craftView(this, { costHtml, effectText, filters:CRAFT_FILTERS });
  }

  // ---------- Journal ----------
  render_journal() {
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const Q = data.quests;
    const tracked = trackedQuest(ch, data);
    const row = (id) => {
      const q = Q.quests[id], st = questState(ch,id), done = st.status === 'done';
      if (st.status === 'locked') return '';
      const prog = Math.min(st.progress,q.count), target = !done ? questTarget(g,id) : null;
      const far = target ? Math.round(Math.hypot(target.x-g.player.x,target.z-g.player.z)) : 0;
      const picture = q.type==='kill' ? art('monster',q.target) : q.type==='collect' ? art('material',q.target) : q.type==='waypoint'||q.type==='zone' ? art('zone',q.target==='town'?'settlement':q.target) : q.type==='socket' ? art('mod','wide_arc') : q.type==='job' ? art('job','origin') : art('gear','tusk_blade');
      const rewards = Object.entries(q.reward.items||{}).map(([item,n])=>`<span>${art('material',item)} ×${n}</span>`).join('');
      return `<div class="qrow ${done?'done':''} ${id===tracked?'tracked':''}">${picture}<div class="qcontent">
        <b>${done?'✓ ':id===tracked?'★ ':''}${esc(q.nameTh)}</b><div class="muted">${esc(q.descTh)}</div>
        ${!done?`<div class="qbar"><i style="width:${prog/q.count*100}%"></i><span>${prog} / ${q.count}</span></div>`:''}
        <div class="quest-rewards"><span>${rewardText(data,{...q.reward,items:{}})}</span>${rewards}</div>
        ${far>12?`<small class="muted">ห่าง ${far} ม. · ตามดาวบนมินิแมพ</small>`:''}</div></div>`;
    };
    const sideOrder = [...Q.side].sort((a, b) => (questState(ch, a).status === 'done') - (questState(ch, b).status === 'done'));
    const p = ch.progress;
    const kills = Object.values(p.kills).reduce((a, b) => a + b, 0);
    const bosses = (data.world.bosses || []).map((b) => `<span>${data.monsters.monsters[b.monster].name}</span><b>${p.bossKills[b.id] ? `ปราบแล้ว ×${p.bossKills[b.id]}` : '—'}</b>`).join('');
    const doneCount = [...Q.main, ...Q.side].filter((id) => questState(ch, id).status === 'done').length;
    return `<div class="grid2">
      <div class="card"><h3>เนื้อเรื่องหลัก</h3>${Q.main.filter(id=>questState(ch,id).status!=='done').map(row).join('') || '<p class="muted">ทำเนื้อเรื่องหลักครบแล้ว</p>'}<p class="muted">${Q.main.filter(id=>questState(ch,id).status==='locked').length} ภารกิจจะเปิดเมื่อทำเรื่องก่อนหน้าสำเร็จ</p></div>
      <div><div class="card"><h3>ภารกิจรอง</h3>${sideOrder.filter(id=>questState(ch,id).status!=='done').map(row).join('')}</div>
        <details class="journal-completed"><summary>ภารกิจที่สำเร็จแล้ว · ${doneCount}</summary>${[...Q.main,...Q.side].filter(id=>questState(ch,id).status==='done').map(row).join('') || '<p class="muted">ยังไม่มีภารกิจที่สำเร็จ</p>'}</details>
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
    return atlasView(this);
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
        มือถือ/iPad: จอยซ้ายเดิน · แตะปุ่มสกิลเพื่อใช้กับเป้าอัตโนมัติ · ลากปุ่มสกิลเพื่อเล็ง แล้วปล่อยเพื่อใช้ หรือปล่อยในช่อง ✕ เพื่อยกเลิก · ปุ่มเคลื่อนที่แยกจากสกิลต่อสู้ (ปัดเพื่อเลือกทิศ) · สองนิ้วซูม<br>
        PC: WASD เดิน · เมาส์เล็ง · คลิกซ้าย/ขวาใช้สกิล 1/2 · 3,4 (หรือ Q,R) สกิลที่เหลือ · Space หลบ · I/K/J/C/L/M เมนู · E ใช้โต๊ะคราฟต์/หินวาร์ป<br>
        ระบบเป้า: เมื่อมอนเข้าระยะ จะล็อกเป้าให้อัตโนมัติ หันไปหามอนตัวอื่นเพื่อเปลี่ยนเป้า ออกนอกระยะจะปล่อยเป้า ตัวละครไม่วิ่งตามเป้าเอง<br>
        การเดินทาง: เดินแตะหินวาร์ปเพื่อปลดล็อก แล้ววาร์ปจากแผนที่ (M) · ภูมิประเทศมีเนินและหน้าผา ขึ้นหน้าผาชันไม่ได้ ให้หาทางลาดหรือถนน<br>
        เป้าหมาย Demo: ทำภารกิจหลัก (L) → เก็บวัตถุดิบ → คราฟต์ที่นิคม → ปราบ Greyfang ในป่า → ข้ามแม่น้ำ → ปราบ Horned Warden บนซากโบราณ
      </div></div>`;
  }

  // ---------- actions ----------
  onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.tagName === 'SELECT') return;
    const g = this.game;
    const ch = g.ch;
    const data = g.data;
    const act = t.dataset.act;
    let r;
    switch (act) {
      case 'choose-skill':
        r = equipSkill(ch, data, Number(t.dataset.slot), t.dataset.id || null);
        this.sel.socket = undefined;
        if (!r.ok) this.flash(REASON_TH[r.reason] || r.reason);
        return this.changed();
      case 'inventory-back':
        this.sel.detail = false;
        this.render(true);
        this.body.querySelector('.item-tile.on')?.focus({preventScroll:true});
        return;
      case 'select-zone':
        this.sel.zone = t.dataset.id;
        this.sel.waypoint = undefined;
        this.render();
        if (matchMedia('(max-width: 700px)').matches) this.body.querySelector('.region-detail')?.scrollIntoView({block:'start'});
        return;
      case 'select-waypoint':
        this.sel.waypoint = t.dataset.id;
        this.sel.zone = t.dataset.id === 'town' ? 'settlement' : t.dataset.id;
        this.render();
        if (matchMedia('(max-width: 700px)').matches) this.body.querySelector('.region-detail')?.scrollIntoView({block:'start'});
        return;
      case 'workspace':
        return this.open(t.dataset.page);
      case 'mod-filter':
        this.sel.compatibleOnly = !this.sel.compatibleOnly;
        return this.render();
      case 'inspect-mod':
        this.sel.modUid = Number(t.dataset.uid);
        return this.render();
      case 'growth-filter':
        this.sel.growthKind = t.dataset.id;
        return this.render(true);
      case 'close-journal': return this.close();
      case 'dismiss-node': this.sel.node = null; return this.render();
      case 'journal-reset': this.sel.journalReset = !this.sel.journalReset; return this.render();
      case 'constellation':
        this.sel.constellation = t.dataset.id || null;
        this.sel.journalReset = false;
        this.sel.node = null;
        this.sel.nodeSearch = '';
        return this.render(true);
      case 'job-branch':
        this.sel.jobBranch = t.dataset.id;
        this.sel.node = null;
        return this.render();
      case 'clear-node-search':
        this.sel.nodeSearch = '';
        return this.render(true);
      case 'jump-node': {
        const n = data.jobtree.nodes[t.dataset.id];
        if(!n) return;
        this.sel.constellation = n.category;
        this.sel.jobBranch = n.branch || n.requiresJob || this.sel.jobBranch;
        this.sel.node = t.dataset.id;
        this.sel.nodeSearch = '';
        this.focusNextNode = true;
        return this.render(true);
      }
      case 'skill-slot':
        this.sel.skill = Number(t.dataset.slot);
        this.sel.socket = undefined;
        return this.render();
      case 'open-skills':
        return this.open('skills');
      case 'inventory-category':
        this.sel.bag = t.dataset.id;
        this.sel.detail = false;
        this.sel.item = undefined;
        return this.render(true);
      case 'inspect-item':
        this.sel.item = t.dataset.id;
        this.sel.detail = true;
        return this.render(matchMedia('(max-width: 700px)').matches);
      case 'inspect-equipped':
        this.sel.bag = 'gear';
        this.sel.gear = 'all';
        this.sel.item = t.dataset.uid;
        this.sel.detail = true;
        return this.render(matchMedia('(max-width: 700px)').matches);
      case 'stat':
        allocateStat(ch, t.dataset.stat);
        return this.changed();
      case 'respec-stats':
        respecStats(ch, data);
        return this.changed();
      case 'respec-job':
        respecJob(ch, data);
        this.sel.journalReset = false;
        this.sel.node = null;
        return this.changed();
      case 'pick-socket':
        this.sel.skill = Math.max(0, Number(t.dataset.slot));
        return this.open('mods');
      case 'socket':
        r = socketMod(ch, data, Number(t.dataset.slot), Number(t.dataset.uid));
        if (!r.ok) return this.flash(REASON_TH[r.reason] || r.reason);
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
        if(!g.nearby().workbench) return this.flash('กลับโต๊ะคราฟต์เพื่ออัปเลเวล');
        r = upgradeSkill(ch, data, t.dataset.skill);
        if (!r.ok) this.flash(REASON_TH[r.reason] || r.reason);
        return this.changed();
      case 'node':
        this.sel.node = t.dataset.id;
        this.render();

        return;
      case 'take-node':
        r = allocateJobNode(ch, data, t.dataset.id);
        if(!r.done) return this.render();
        g.notify({ type: 'job' });
        return this.changed();
      case 'equip-gear':
        r=equip(ch, data, Number(t.dataset.uid));
        if(!r.ok) return this.flash('สวมใส่ไม่ได้ · ต้องมี '+(r.missing||[]).join(', '));
        return this.changed();
      case 'unequip':
        unequip(ch, data, t.dataset.slot);
        return this.changed();
      case 'gear-filter':
        this.sel.gear = t.dataset.id;
        return this.render();
      case 'craft-filter':
        this.sel.craft = t.dataset.id;
        this.sel.craftRecipe = null;
        this.lastResult = null;
        return this.render(true);
      case 'craft-open':
        if(!data.recipes.recipes[t.dataset.id]) return;
        this.sel.craftRecipe=t.dataset.id;
        this.lastResult=null;
        this.render(true);
        this.body.querySelector('.craft-detail-title')?.focus({preventScroll:true});
        return;
      case 'craft-back': {
        const id=this.sel.craftRecipe;
        this.sel.craftRecipe=null;
        this.lastResult=null;
        this.render(true);
        this.body.querySelector(`[data-act="craft-open"][data-id="${id}"]`)?.focus({preventScroll:true});
        return;
      }
      case 'return-craft':
        this.sel.craftRecipe=this.sel.returnCraftRecipe;
        this.sel.returnCraftRecipe=null;
        this.lastResult=null;
        return this.open('craft');
      case 'craft-ready':
        this.sel.craftReady = !this.sel.craftReady;
        return this.render(true);
      case 'gear-up':
        if(!g.nearby().workbench) return this.flash('กลับโต๊ะคราฟต์เพื่อตีบวก');
        r = upgradeGear(ch, data, Number(t.dataset.uid));
        if (!r.ok) this.flash(REASON_TH[r.reason] || r.reason);
        else this.lastResult=`ตีบวกสำเร็จ +${r.item.upgrade}${r.unequipped.length?' · รีเควสเพิ่ม ยังใส่ไม่ได้ จึงเก็บไว้ในกระเป๋า':''}`;
        return this.changed();
      case 'gear-grade':
        if(!g.nearby().workbench) return this.flash('กลับโต๊ะคราฟต์เพื่อเลื่อนเกรด');
        r=promoteGear(ch,data,Number(t.dataset.uid),g.rng);
        if(!r.ok) return this.flash(REASON_TH[r.reason]||r.reason);
        this.lastResult='เลื่อนเกรดสำเร็จ · ออฟชั่นเดิมอยู่ครบ และสุ่มเพิ่มแล้ว'+(r.unequipped.length?' · สเตตัสไม่ถึง เก็บไว้ในกระเป๋า':'');
        return this.changed();
      case 'mod-up':
        if(!g.nearby().workbench) return this.flash('กลับโต๊ะคราฟต์เพื่ออัปเลเวล');
        r = upgradeMod(ch, data, Number(t.dataset.uid));
        if (!r.ok) this.flash(REASON_TH[r.reason] || r.reason);
        return this.changed();
      case 'sell':
        sellMaterial(ch, data, t.dataset.id, 1);
        return this.changed();
      case 'craft-batch': {
        if(!g.nearby().workbench) return this.flash('กลับโต๊ะคราฟต์ก่อน');
        const goal=this.sel.craftGoals?.[t.dataset.id]||{attempts:5,grade:'A',option:'',quality:0};
        const batch=craftBatch(ch,data,t.dataset.id,g.rng,{...goal,grade:goal.grade||null,option:goal.option||null});
        if(!batch.ok) return this.flash(REASON_TH[batch.reason]||batch.reason);
        for(const item of batch.items)g.notify({type:'craft'});
        this.sel.craftRecipe=t.dataset.id;
        this.recordCraft(t.dataset.id,batch.items,batch.spent,batch.reason);
        this.lastResult=null;
        return this.changed();
      }
      case 'inspect-crafted':
        this.sel.returnCraftRecipe=this.sel.craftRecipe;
        this.sel.bag='gear';this.sel.gear='all';this.sel.item=t.dataset.uid;this.lastResult=null;
        this.open('bag');this.sel.detail=true;
        return this.render(true);
      case 'craft': {
        if (!g.nearby().workbench) return this.flash('กลับไปที่โต๊ะคราฟต์ในนิคมก่อน');
        r = craft(ch, data, t.dataset.id, g.rng);
        if (!r.ok) {
          this.flash(REASON_TH[r.reason] || r.reason);
          return;
        }
        g.notify({ type: 'craft' });
        if (r.kind === 'gear') {
          this.sel.craftRecipe=t.dataset.id;
          this.recordCraft(t.dataset.id,[r.item],data.recipes.recipes[t.dataset.id].cost);
          this.lastResult=null;
        } else if (r.kind === 'mod') this.lastResult = `${art('mod',r.item.id)} ได้ Mod <b>${data.mods.mods[r.item.id].name}</b> — ไปใส่ที่หน้าม็อด`;
        else if (r.kind === 'skill') this.lastResult = `${art('skill',r.id)} เรียนสกิล <b>${data.skills.combat[r.id].name}</b> แล้ว — เลือกใส่ช่องในเมนูสกิล`;
        else this.lastResult = `${art('skill',r.id)} เรียน <b>${data.skills.movement[r.id].name}</b> แล้ว — เลือกใช้ในหน้าเคลื่อนที่`;
        this.changed();
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
      return `<span class="ingredient ${have >= v ? 'ok' : 'no'}">${k==='gold'?'<span class="gold-coin">G</span>':art('material',k)}<span>${name}<b>${have.toLocaleString()} / ${v}</b></span></span>`;
    })
    .join('');
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
  dotDamagePct: 'ดาเมจพื้นที่ต่อเนื่อง %',
  persistentDurationPct: 'ระยะเวลาพื้นที่คงอยู่ %',
  controlDurationPct: 'ระยะเวลาควบคุม/คำสาป %',
  spellDamagePct: 'ดาเมจเวท %',
  physicalDamagePct: 'ดาเมจกายภาพ %',
  fireDamagePct: 'ดาเมจไฟ %',
  coldDamagePct: 'ดาเมจน้ำแข็ง %',
  lightningDamagePct: 'ดาเมจสายฟ้า %',
  earthDamagePct: 'ดาเมจดิน %',
  poisonDamagePct: 'ดาเมจพิษ %',
  arcaneDamagePct: 'ดาเมจอาร์เคน %',
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
  mpRegenPct: 'ฟื้นมานา %',
  manaCostPct: 'ลดค่าใช้มานา %',
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
  const number = v => Math.round(v * 10) / 10;
  if (s.damage !== undefined) parts.push(s.kind === 'dot_zone' ? `ดาเมจ ${Math.round(s.damage)}/วิ × ${s.duration.toFixed(1)} วิ` : `ดาเมจ ${Math.round(s.damage)}`);
  if (s.heal !== undefined) parts.push(`ฮีล ${Math.round(s.heal)}/วิ × ${s.duration.toFixed(1)} วิ`);
  if (s.barrier !== undefined) parts.push(`เกราะ ${Math.round(s.barrier)} (${number(s.duration)} วิ)`);
  if (s.summon) parts.push(`${s.summon.count} ตัว · กัด ${Math.round(s.summon.damage)} · HP ${number(s.summon.hp)} · ${number(s.summon.life)} วิ`);
  if (s.takenMult) parts.push(`รับดาเมจ +${Math.round((s.takenMult - 1) * 100)}% · ตีเบาลง ${Math.round((1 - s.dealtMult) * 100)}% · ${number(s.duration)} วิ`);
  if (s.damageBuff) parts.push(`ดาเมจ +${Math.round(s.damageBuff * 100)}% · เร็ว +${Math.round(s.speedBuff * 100)}% · ${number(s.duration)} วิ`);
  if (s.projectiles > 1) parts.push(`${s.projectiles} ลูก`);
  if (s.pierce) parts.push(`ทะลุ ${s.pierce}`);
  if (s.chain) parts.push(`เด้ง ${s.chain}`);
  if (s.repeats) parts.push(`ฟันซ้ำ ${s.repeats} ครั้ง`);
  if (s.echo) parts.push(`Echo ${Math.round(s.echo.mult * 100)}%`);
  if (s.ground) parts.push('ทิ้งไฟ');
  if (s.manaOnHit) parts.push(`คืน ${number(s.manaOnHit)} MP เมื่อโดน · ครั้งเดียวต่อ ${s.manaOnHitCooldown} วิ`);
  if (s.chill) parts.push(`ช้าลง ${Math.round(s.chill.slow * 100)}%`);
  if (s.slow) parts.push(`ช้าลง ${Math.round(s.slow * 100)}%`);
  if (s.knock) parts.push('กระแทกกระเด็น');
  if (s.leech) parts.push(`ดูดเลือด ${s.leech.toFixed(1)}%`);
  if (s.reflect) parts.push(`สะท้อน ${Math.round(s.reflect * 100)}%`);
  if (s.trigger) parts.push('ร่ายเองเมื่อหลบ');
  if (s.kind === 'melee_arc') parts.push(`ระยะ ${s.range.toFixed(1)} ม. มุม ${Math.round(s.arc)}°`);
  else if (s.range) parts.push(`ระยะ ${number(s.range)} ม.`);
  if (s.radius && s.kind !== 'self_barrier') parts.push(`รัศมี ${s.radius.toFixed(1)}`);
  parts.push(`คูลดาวน์ ${s.cooldown.toFixed(1)} วิ`);
  if (s.cost) parts.push(`MP ${number(s.cost)}`);
  return parts.join(' · ');
}
