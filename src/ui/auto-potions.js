import { automaticPotion, configureAutoPotion, consumableCount } from '../core/consumables.js';

export function autoPotionsView(game) {
  const { ch, data } = game, types = data.items.consumables.types;
  return `<section class="card auto-potions" aria-labelledby="auto-potions-title"><h3 id="auto-potions-title" tabindex="-1">ใช้ยาขวดอัตโนมัติ</h3>
    <p class="muted">เปิด HP และ MP แยกกัน · ใช้เมื่อเหลือเท่ากับหรือต่ำกว่าเปอร์เซ็นต์ที่ตั้งไว้ ใช้ยาจริงจากกระเป๋าและคูลดาวน์เดียวกับการกดเอง</p>
    <div class="auto-potion-grid">${['hp','mp'].map(group => {
      const setting = ch.autoPotions[group], id = automaticPotion(ch,data,group);
      return `<fieldset class="auto-potion-rule" data-auto-rule="${group}"><legend>${group.toUpperCase()} · ${group==='hp'?'เลือด':'มานา'}</legend>
        <label class="auto-potion-toggle"><input type="checkbox" data-auto-group="${group}" data-auto-field="enabled" ${setting.enabled?'checked':''}><span>ใช้ยา ${group.toUpperCase()} อัตโนมัติ</span><b data-auto-state>${setting.enabled?'เปิด':'ปิด'}</b></label>
        <label class="auto-potion-threshold">ใช้เมื่อเหลือ ≤ <input type="number" min="1" max="100" step="1" inputmode="numeric" value="${setting.threshold}" data-auto-group="${group}" data-auto-field="threshold" aria-label="เปอร์เซ็นต์ ${group.toUpperCase()} สำหรับใช้ยาอัตโนมัติ"> %</label>
        <label>เลือกยาที่จะใช้<select data-auto-group="${group}" data-auto-field="potion" aria-label="เลือกยา ${group.toUpperCase()} อัตโนมัติ"><option value="" ${setting.potion===null?'selected':''}>ช่องพร้อมใช้ จากซ้ายไปขวา</option>${Object.entries(types).filter(([,def])=>def.group===group).map(([key,def])=>`<option value="${key}" ${setting.potion===key?'selected':''}>${def.nameTh} · มี ${consumableCount(ch,key)}</option>`).join('')}</select></label>
        <p class="muted">ถ้าเลือกช่องพร้อมใช้ จะใช้ขวดชนิดนี้ที่มีของจากช่องซ้ายสุดก่อน ถ้าเลือกขวดเจาะจง จะไม่เปลี่ยนขนาดยาเอง</p>
        <p data-auto-stock role="status">${id?`พร้อมใช้: ${types[id].nameTh} · มี ${consumableCount(ch,id)}`:'ไม่มียาตามตัวเลือกนี้ — จะไม่ใช้จนกว่าจะมีของ'}</p></fieldset>`;
    }).join('')}</div><p class="muted">ไม่ใช้ยาระหว่างพักเกม เปิดเมนู หรือหมดสติ · ยาเลือดและมานามีคูลดาวน์แยกกัน · ปุ่มยาเดิมยังกดใช้เองได้</p></section>`;
}

/** Delegated input preserves the number field/caret while saving each valid change. */
export function changeAutoPotionControl(ui, control, commit=false) {
  if (!control.matches('[data-auto-group]')) return false;
  const group=control.dataset.autoGroup, field=control.dataset.autoField;
  if (field==='threshold' && control.value==='') {
    if(commit)control.value=ui.game.ch.autoPotions[group].threshold;
    return true;
  }
  const value=field==='enabled'?control.checked:field==='threshold'?Number(control.value):control.value||null;
  if(field==='threshold'&&!commit&&(value<1||value>100||!Number.isInteger(value)))return true;
  const result=configureAutoPotion(ui.game.ch,ui.game.data,group,{[field]:value});
  if (!result.ok) return true;
  if(field==='threshold'&&commit)control.value=ui.game.ch.autoPotions[group].threshold;
  const row=control.closest('[data-auto-rule]'), setting=ui.game.ch.autoPotions[group], id=automaticPotion(ui.game.ch,ui.game.data,group);
  row.querySelector('[data-auto-state]').textContent=setting.enabled?'เปิด':'ปิด';
  row.querySelector('[data-auto-stock]').textContent=id?`พร้อมใช้: ${ui.game.data.items.consumables.types[id].nameTh} · มี ${consumableCount(ui.game.ch,id)}`:'ไม่มียาตามตัวเลือกนี้ — จะไม่ใช้จนกว่าจะมีของ';
  ui.onChange?.();
  return true;
}
