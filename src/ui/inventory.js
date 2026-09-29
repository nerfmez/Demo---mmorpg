// Presentation only: selection and comparison never mutate the character.
import { icon } from './icons.js';
import { art } from './art.js';
import { gearItem, gearStats, weaponImplicit, meetsRequires } from '../core/character.js';
import { gearUpgradeCost, modUpgradeCost, canAfford } from '../core/crafting.js';
import { rulesHtml } from './buildmeta.js';
import { modSlotOf } from '../core/skills.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const FILTERS = [['all', 'ทั้งหมด'], ['weapon', 'อาวุธ'], ['armor', 'เกราะ'], ['helm', 'หมวก'], ['boots', 'รองเท้า'], ['charm', 'เครื่องราง']];
const comparisonStats = (it, data) => {
  const stats = gearStats(it, data);
  for (const [key, value] of Object.entries(weaponImplicit(it, data))) stats[key] = (stats[key] || 0) + value;
  return stats;
};

export function inventoryView(ui, { costHtml, effectText }) {
  const { game: g, sel } = ui;
  const { ch, data } = g;
  const near = g.nearby();
  const category = sel.bag || 'gear';
  const mats = Object.entries(ch.materials).filter(([, count]) => count > 0);
  const categories = [['gear', 'อุปกรณ์', ch.gear.length], ['materials', 'วัตถุดิบ', mats.length], ['mods', 'ม็อด', ch.mods.length]];
  const equipped = data.items.slots.map((slot) => {
    const it = gearItem(ch, ch.equipped[slot]);
    const base = it && data.items.gearBases[it.base];
    return `<button class="equipment-slot ${it ? '' : 'empty'}" data-act="inspect-equipped" data-uid="${it?.uid || ''}" ${it ? '' : 'disabled'} aria-label="${data.items.slotNames[slot]}: ${base?.nameTh || 'ว่าง'}">
      <span>${data.items.slotNames[slot]}</span>${base ? art('gear',it.base) : icon(slot === 'weapon' ? 'sword' : slot)}<small>${base?.nameTh || 'ว่าง'}</small></button>`;
  }).join('');

  let list = [];
  if (category === 'gear') list = ch.gear.filter((it) => sel.gear === 'all' || data.items.gearBases[it.base].slot === sel.gear).map((it) => {
    const base = data.items.gearBases[it.base];
    return { id: String(it.uid), name: base.nameTh, graphic: art('gear',it.base), badge: it.grade + (it.upgrade ? ' · +'+it.upgrade : ''), color: data.items.grades.colors[it.grade], equipped: ch.equipped[base.slot] === it.uid, item: it };
  });
  if (category === 'materials') list = mats.map(([id, count]) => {
    const m = data.items.materials[id];
    return { id, name: m.nameTh, graphic: art('material',id), badge: `×${count}`, color: m.rare ? '#d0abff' : m.color, item: m };
  });
  if (category === 'mods') list = ch.mods.map((it) => {
    const m = data.mods.mods[it.id];
    return { id: String(it.uid), name: m.nameTh, graphic: art('mod',it.id), badge: `Lv.${it.level}`, color: '#c59bff', equipped: modSlotOf(ch, it.uid) >= 0, item: it };
  });
  const selected = list.find((it) => it.id === sel.item) || list[0];
  let detail = `<div class="inventory-empty">${icon(category === 'mods' ? 'hex' : 'bag')}<h3>ยังไม่มี${categories.find(([id]) => id === category)[1]}</h3><p>เก็บวัตถุดิบจากมอนสเตอร์ แล้วนำไปคราฟต์ที่นิคม</p></div>`;
  if (selected) {
    const it = selected.item;
    let content = '';
    let actions = '';
    if (category === 'gear') {
      const base = data.items.gearBases[it.base];
      const req = meetsRequires(ch, base.requires);
      const old = gearItem(ch, ch.equipped[base.slot]);
      const up = gearUpgradeCost(data, it);
      content = ui.gearLine(it);
      if (old && old.uid !== it.uid) {
        const a = comparisonStats(it, data);
        const b = comparisonStats(old, data);
        const diff = [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => {
          const v = Math.round(((a[key] || 0) - (b[key] || 0)) * 10) / 10;
          if (!v) return '';
          const better = key === 'damageTakenPct' ? v < 0 : v > 0;
          return `<div class="${better ? 'ok' : 'no'}">${v > 0 ? '↑' : '↓'} ${effectText(key, v)}</div>`;
        }).join('');
        content += `<div class="gear-compare"><small>เทียบค่าสถานะกับ ${data.items.gearBases[old.base].nameTh}</small>${diff || '<div class="muted">ค่าสถานะอุปกรณ์เท่ากัน</div>'}</div>`;
      }
      if (!req.ok) content += `<p class="no">ต้อง ${req.missing.join(', ')}</p>`;
      actions = selected.equipped
        ? `<span class="equipped-label">✓ สวมใส่อยู่</span>${base.slot !== 'weapon' ? `<button class="btn" data-act="unequip" data-slot="${base.slot}">ถอดอุปกรณ์</button>` : ''}`
        : `<button class="btn primary" data-act="equip-gear" data-uid="${it.uid}" ${req.ok ? '' : 'disabled'}>สวมใส่</button>`;
      if (up) {
        content += `<div class="upgrade-cost"><small>ตีบวกเป็น +${it.upgrade + 1}</small><div class="cost">${costHtml(ch, data, up)}</div></div>`;
        actions += `<button class="btn" data-act="gear-up" data-uid="${it.uid}" ${near.workbench && canAfford(ch, up) ? '' : 'disabled'}>ตีบวก</button>`;
        if (!near.workbench) content += '<p class="muted">ตีบวกได้ที่โต๊ะคราฟต์ในนิคม</p>';
      }
    } else if (category === 'materials') {
      const uses = Object.values(data.recipes.recipes).filter((r) => r.cost[selected.id]).map((r) => (data.items.gearBases[r.result] || data.skills.combat[r.result] || data.skills.movement[r.result] || data.mods.mods[r.result])?.nameTh).filter(Boolean);
      const sources = Object.entries(data.monsters.monsters).filter(([,m]) => m.drops.some((d) => d.item === selected.id)).map(([id,m]) => `<span class="source-creature">${art('monster',id)}<span>${m.nameTh}</span></span>`);
      content = `<h3>${esc(it.nameTh)}</h3><div class="muted">${esc(it.name)} ${it.rare ? '· วัตถุดิบหายาก' : ''}</div><p>มี ${ch.materials[selected.id]} ชิ้น</p><div class="detail-block"><small>หาได้จาก</small><p class="source-list">${sources.join('') || 'การสำรวจและภารกิจ'}</p></div><div class="detail-block"><small>ใช้คราฟต์</small><p>${uses.length ? uses.join(' · ') : 'ใช้ในการอัปเกรด'}</p></div>`;
      actions = `<button class="btn" data-act="sell" data-id="${selected.id}" ${near.inTown ? '' : 'disabled'}>ขาย 1 ชิ้น · ${it.value} G</button>`;
      if (!near.inTown) content += '<p class="muted">กลับนิคมเพื่อขายวัตถุดิบ</p>';
    } else {
      const md = data.mods.mods[it.id];
      const up = modUpgradeCost(data, it);
      const where = modSlotOf(ch, it.uid);
      content = `<h3>${esc(md.nameTh)} · Lv.${it.level}</h3><div class="muted">${esc(md.name)}</div><p>${esc(md.desc)}</p>${rulesHtml(md)}<p class="equipped-label">${where >= 0 ? `ใส่ในสกิลช่อง ${where + 1}` : 'ยังไม่ได้ใส่'}</p>`;
      actions = '<button class="btn primary" data-act="workspace" data-page="mods">จัดม็อด</button>';
      if(up) actions += '<button class="btn" data-act="workspace" data-page="growth">ไปหน้าอัปเลเวล</button>';
    }
    detail = `<div class="item-detail-top"><div class="item-detail-icon">${selected.graphic}</div><div><span class="section-kicker">${categories.find(([id])=>id===category)[1]}</span><h3>${esc(selected.name)}</h3><span class="level-pill">${selected.badge}</span></div></div><div class="item-actions">${actions}</div><div class="item-description">${content}</div>`;
  }

  return `<div class="inventory-screen ${sel.detail?'detail-open':''}"><div class="inventory-overview"><div class="section-heading"><h3>อุปกรณ์ที่สวมใส่</h3><span>แตะเพื่อดู</span></div><div class="equipment-strip" aria-label="อุปกรณ์ที่สวมใส่">${equipped}</div>
    <div class="inventory-tabs">${categories.map(([id, label, count]) => `<button class="btn ${id === category ? 'on' : ''}" data-act="inventory-category" data-id="${id}" aria-pressed="${id === category}">${label}<span>${count}</span></button>`).join('')}</div>
    </div><div class="inventory-layout"><div class="inventory-list">
    ${category === 'gear' ? `<div class="switch inventory-filter">${FILTERS.map(([id, label]) => `<button class="btn small ${sel.gear === id ? 'on' : ''}" data-act="gear-filter" data-id="${id}">${label}</button>`).join('')}</div>` : ''}
    <div class="item-grid">${list.map((it) => `<button class="item-tile ${it.id === selected?.id ? 'on' : ''}" style="--item-color:${it.color}" data-act="inspect-item" data-id="${it.id}" aria-pressed="${it.id === selected?.id}" aria-label="${esc(it.name)}${it.equipped ? ' · สวมอยู่' : ''}"><span class="item-badge">${it.badge}</span>${it.graphic}<b>${esc(it.name)}</b>${it.equipped ? '<span class="item-equipped">✓</span>' : ''}</button>`).join('')}</div>
    <p class="muted inventory-caption">${list.length ? 'แตะไอเทมเพื่อดูรายละเอียด' : 'ไม่มีไอเทมในหมวดนี้'}</p></div>
    <aside class="item-detail" aria-label="รายละเอียดไอเทม"><button class="btn detail-back" data-act="inventory-back">← กลับไปเลือกของ</button>${detail}</aside></div></div>`;
}
