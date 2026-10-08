import { arrowInUse, arrowTotal } from '../core/character.js';

/** Read-only HUD supplies. Actions navigate to existing crafting/shop rules. */
export class Supplies {
  constructor(root,game,{onArrows,onPotions}) {
    this.game=game;
    this.ammo=document.createElement('button');this.ammo.className='ammo-hud';
    this.ammo.innerHTML='<span>ลูกธนู <b class="ammo-count"></b><small class="ammo-total"></small></span><small class="ammo-type"></small><strong>คราฟต์ลูกธนู ›</strong>';
    this.ammo.addEventListener('click',onArrows);root.appendChild(this.ammo);
    this.potions=document.createElement('button');this.potions.className='auto-potions-hud';
    this.potions.innerHTML='<strong>ตั้งค่ายาอัตโนมัติ ›</strong><small></small>';
    this.potions.addEventListener('click',onPotions);root.querySelector('.quickbar').appendChild(this.potions);
    this.count=this.ammo.querySelector('.ammo-count');this.total=this.ammo.querySelector('.ammo-total');this.type=this.ammo.querySelector('.ammo-type');this.status=this.potions.querySelector('small');
    this.update();
  }
  update() {
    const g=this.game,ch=g.ch,bow=!!g.data.items.weaponTypes[g.derived.weaponType]?.ammo;
    this.ammo.hidden=!bow;
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
      this.status.textContent=`HP ${hp.enabled?'≤'+hp.threshold+'%':'ปิด'} · MP ${mp.enabled?'≤'+mp.threshold+'%':'ปิด'}`;
    }
  }
}
