// Data-accurate field guide and map: selecting a pin never travels immediately.
import { art } from './art.js';
import { icon } from './icons.js';
import { mapImage } from './mapimage.js';
import { questTarget } from './hud.js';
import { trackedQuest } from '../core/quests.js';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export function atlasView(ui) {
 const {game:g,sel}=ui, w=g.world, data=g.data, prog=g.ch.progress, b=w.bounds;
 const W=b.maxX-b.minX,H=b.maxZ-b.minZ,L=x=>((x-b.minX)/W*100)+'%',T=z=>((z-b.minZ)/H*100)+'%';
 const zone=w.zones.find(z=>z.id===sel.zone)||w.zoneAt(g.player.x,g.player.z);
 const wp=w.waypoints.find(p=>p.id===(sel.waypoint || (zone.id==='settlement'?'town':zone.id)));
 const unlocked=wp&&g.isWaypointUnlocked(wp.id);
 const monsterIds=[...new Set([
   ...data.world.spawns.filter(s=>s.zone===zone.id).map(s=>s.monster),
   ...(data.world.bosses||[]).filter(bs=>w.zoneAt(bs.pos[0],bs.pos[1]).id===zone.id).map(bs=>bs.monster)
 ])];
 // Partition at zone boundaries so overlapping rectangles follow zoneAt priority.
 // An undiscovered coast/meadow must not fog over the discovered landing or town.
 const xs=[...new Set([b.minX,b.maxX,...w.zones.flatMap(z=>z.rects.flatMap(r=>r.slice(0,2)))])].filter(x=>x>=b.minX&&x<=b.maxX).sort((a,b)=>a-b);
 const zs=[...new Set([b.minZ,b.maxZ,...w.zones.flatMap(z=>z.rects.flatMap(r=>r.slice(2,4)))])].filter(z=>z>=b.minZ&&z<=b.maxZ).sort((a,b)=>a-b);
 let fog='';
 for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++) {
   if(prog.zones.includes(w.zoneAt((xs[i-1]+xs[i])/2,(zs[j-1]+zs[j])/2).id))continue;
   fog+=`<div class="fog" style="left:${L(xs[i-1])};top:${T(zs[j-1])};width:${(xs[i]-xs[i-1])/W*100}%;height:${(zs[j]-zs[j-1])/H*100}%"></div>`;
 }
 const labels=w.zones.map(z=>{
   const r=z.rects.reduce((a,c)=>(c[1]-c[0])*(c[3]-c[2])>(a[1]-a[0])*(a[3]-a[2])?c:a);
   const [lx,lz]=z.label||[(r[0]+r[1])/2,(r[2]+r[3])/2];
   return `<div class="zlabel ${zone.id===z.id?'selected':''}" style="left:${L(lx)};top:${T(lz)}"><b>${esc(z.nameTh)}</b><small>${z.safe?'เขตปลอดภัย':'Lv.'+z.level+'+'}</small></div>`;
 }).join('');
 const pins=w.waypoints.map(p=>{
   const on=g.isWaypointUnlocked(p.id);
   return `<button class="wpt ${on?'on':''} ${wp?.id===p.id?'selected':''}" style="left:${L(p.x)};top:${T(p.z)}" data-act="select-waypoint" data-id="${p.id}" aria-label="${esc(p.nameTh)} · ${on?'เดินทางได้':'ยังไม่เปิดใช้'}">${icon('portal')}</button>`;
 }).join('');
 const bosses=(data.world.bosses||[]).filter(bs=>prog.zones.includes(w.zoneAt(...bs.pos).id)).map(bs=>`<span class="bossmark" style="left:${L(bs.pos[0])};top:${T(bs.pos[1])}" title="${data.monsters.monsters[bs.monster].nameTh}">${art('monster',bs.monster)}</span>`).join('');
 const target=questTarget(g,trackedQuest(g.ch,data)),town=data.world.town;
 const regions=[...w.zones].sort((a,b)=>a.level-b.level).map(z=>`<button class="region-card ${z.id===zone.id?'on':''}" data-act="select-zone" data-id="${z.id}" aria-pressed="${z.id===zone.id}">${art('zone',z.id)}<span><b>${z.nameTh}</b><small>${z.safe?'ปลอดภัย':'Lv.'+z.level+'+'} · ${prog.zones.includes(z.id)?'สำรวจแล้ว':'ยังไม่สำรวจ'}</small></span></button>`).join('');
 const creatures=monsterIds.map(id=>{
   const m=data.monsters.monsters[id];
   return `<article class="creature-entry">${art('monster',id)}<div><b>${m.nameTh}</b><div class="drop-pictures">${m.drops.filter(d=>d.item!=='gold').map(d=>`<span title="${data.items.materials[d.item].nameTh}">${art('material',d.item)}<small>${data.items.materials[d.item].nameTh}</small></span>`).join('')}</div></div></article>`;
 }).join('');
 const services=zone.id==='settlement'?`<div class="town-services"><div>${icon('hammer')}<span><b>โต๊ะคราฟต์</b><small>คราฟต์ · ตีบวก · อัปเกรดสกิล</small></span></div><div>${icon('person')}<span><b>ครูฝึก</b><small>ตรวจแต้มและพัฒนาตัวละคร</small></span></div></div>`:'';
 return `<div class="atlas-heading"><div><span class="section-kicker">${esc(w.data.name||'').toUpperCase()} / FIELD GUIDE</span><h3>${esc(w.data.nameTh||'แผนที่')}</h3></div><span class="level-pill">สำรวจ ${prog.zones.length} / ${w.zones.length}</span></div>
 ${ui.lastResult?`<div class="result-pop" role="status">${ui.lastResult}</div>`:''}
 <div class="atlas-layout"><div class="atlas-main"><div class="worldmap" style="aspect-ratio:${W}/${H}">
   <img src="${mapImage(w).url()}" alt="แผนที่ชายหาด เมืองท่า และเส้นทางรอบเมือง" draggable="false">${fog}${labels}
   <span class="townmark" style="left:${L(town.workbench[0])};top:${T(town.workbench[1])}">${icon('hammer')}</span>
   ${bosses}${pins}${w.exits.map(e=>`<span class="exitmark" style="left:${L(e.x)};top:${T(e.z)}" title="ทางไป${esc(e.nameTh)}">${icon('portal')}<small>${esc(e.nameTh)}</small></span>`).join('')}${target?`<span class="questmark" style="left:${L(target.x)};top:${T(target.z)}">★</span>`:''}
   <span class="youmark" style="left:${L(g.player.x)};top:${T(g.player.z)};transform:translate(-50%,-50%) rotate(${Math.PI-g.player.facing}rad)"></span>
   <span class="map-north">N<br>↑</span></div>
   <div class="map-legend"><span><i class="legend-player"></i>คุณ</span><span>${icon('portal')}หินวาร์ป</span><span>★ เป้าหมาย</span><span>${icon('hammer')}โต๊ะคราฟต์</span></div>
   <div class="section-heading"><h3>เลือกพื้นที่</h3><span>แตะดูมอนและวัตถุดิบ</span></div><div class="region-grid">${regions}</div>
 </div><aside class="region-detail">
   <div class="region-cover">${art('zone',zone.id)}<div><span class="section-kicker">${zone.safe?'SETTLEMENT':'EXPLORATION'}</span><h3>${zone.nameTh}</h3><small>${zone.name}</small></div></div>
   <div class="region-detail-body"><div class="section-heading"><span class="level-pill">${zone.safe?'เขตปลอดภัย':'แนะนำ Lv.'+zone.level+'+'}</span><small>${prog.zones.includes(zone.id)?'สำรวจแล้ว':'ยังไม่สำรวจ'}</small></div>
   ${wp?`<div class="travel-card"><b>${wp.nameTh}</b><small>${unlocked?'เปิดใช้แล้ว · เดินทางได้เมื่อพ้นการต่อสู้':'เดินไปแตะหินนี้เพื่อเปิดใช้'}</small><button class="btn primary" data-act="teleport" data-id="${wp.id}" ${unlocked?'':'disabled'}>${icon('portal')} เดินทางไปที่นี่</button></div>`:'<p class="muted">พื้นที่นี้ไม่มีหินวาร์ป · เดินตามถนนจากเมืองท่า</p>'}
   ${services}${creatures?`<h3 class="creature-heading">มอนสเตอร์และของดรอป</h3>${creatures}`:''}</div>
 </aside></div>`;
}

