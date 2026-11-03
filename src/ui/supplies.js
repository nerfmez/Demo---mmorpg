import { arrowInUse, arrowTotal } from '../core/character.js';

/** Read-only HUD supplies. Actions navigate to existing crafting/shop rules. */
export class Supplies {
  constructor(root,game,{onArrows,onPotions}) {
    this.game=game;
    this.ammo=document.createElement('button');this.ammo.className='ammo-hud';
    this.ammo.innerHTML='<span>ลูกธนู <b class="ammo-count"></b><small class="ammo-total"></small></span><small class="ammo-type"></small><strong>คราฟต์ลูกธนู ›</strong>';
    this.ammo.addEventListener('click',onArrows);root.appendChild(this.ammo);
    // a gear over the potion row opens the auto-potion settings (owner, 2026-11-03); its dot lights while one is on
    this.potions=document.createElement('button');this.potions.className='auto-potions-hud';
    this.potions.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2.6h3.4l.5 2.6 1.8.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.8 2.6.5v3.4l-2.6.5-.8 1.8 1.5 2.2-2.4 2.4-2.2-1.5-1.8.8-.5 2.6h-3.4l-.5-2.6-1.8-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.8-2.6-.5v-3.4l2.6-.5.8-1.8-1.5-2.2 2.4-2.4 2.2 1.5 1.8-.8z"/><circle cx="12" cy="12" r="3.4"/></svg><i class="ap-dot"></i>';
    this.potions.addEventListener('click',onPotions);root.querySelector('.quickbar').appendChild(this.potions);
    this.count=this.ammo.querySelector('.ammo-count');this.total=this.ammo.querySelector('.ammo-total');this.type=this.ammo.querySelector('.ammo-type');
    this.update();
  }
  update() {
    const g=this.game,ch=g.ch,bow=!!g.data.items.weaponTypes[g.derived.weaponType]?.ammo;
    if(this.ammo.hidden!==!bow)this.ammo.hidden=!bow; // re-setting the attribute restyles the HUD
    if(bow){
      const use=arrowInUse(ch,g.data),count=ch.arrows.stock[use]||0,total=arrowTotal(ch);
      if(use!==this.lastUse||count!==this.lastCount||total!==this.lastTotal){
        this.lastUse=use;this.lastCount=count;this.lastTotal=total;
        this.count.textContent=count;this.total.textContent=total!==count?` · รวม ${total}`:'';
        this.type.textContent=use?g.data.items.arrows.types[use].nameTh:'ลูกธนูหมด';
        this.ammo.classList.toggle('empty',!total);
        this.ammo.setAttribute('aria-label',`${use?g.data.items.arrows.types[use].nameTh:'ลูกธนูหมด'} เหลือ ${count} ลูก รวม ${total} ลูก · คราฟต์ลูกธนู`);
      }
    }
    const {hp,mp}=ch.autoPotions;
    if(hp.enabled!==this.hpEnabled||hp.threshold!==this.hpThreshold||mp.enabled!==this.mpEnabled||mp.threshold!==this.mpThreshold){
      this.hpEnabled=hp.enabled;this.hpThreshold=hp.threshold;this.mpEnabled=mp.enabled;this.mpThreshold=mp.threshold;
      const status=`HP ${hp.enabled?'≤'+hp.threshold+'%':'ปิด'} · MP ${mp.enabled?'≤'+mp.threshold+'%':'ปิด'}`;
      this.potions.dataset.status=status;this.potions.title=status;this.potions.setAttribute('aria-label',`ตั้งค่ายาอัตโนมัติ · ${status}`);
      this.potions.classList.toggle('on',hp.enabled||mp.enabled);
    }
  }
}
