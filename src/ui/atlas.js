// Data-accurate field guide and map of the whole world. Selections never travel immediately.
// Habitat locations, population counts and level ranges come from the simulation's layout.
import { art, atlasMonsterArt, atlasRegionArt } from './art.js';
import { icon } from './icons.js';
import { worldMapImage } from './mapimage.js';
import { questTarget } from './hud.js';
import { trackedQuest } from '../core/quests.js';
import { discovery, toWorld, worldTotals, waypointUnlocked } from '../core/atlas.js';
import { encounterLayout, zoneEncounters, encounterLevelLabel } from '../core/encounters.js';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const kindName={normal:'ทั่วไป',elite:'Elite',miniboss:'มินิบอส',boss:'บอส'};
// Presentation-only palette; the monster definitions do not contain a color field.
const markerColors={salt_slime:'#279bb4',reef_crab:'#d95b36',shore_gull:'#d1aa46',hermit_crab:'#ae7041',tusk_boar:'#b08058',moss_beetle:'#538341',sporecap:'#cd637d',thornback_wolf:'#647b94',marsh_wisp:'#52c6b0',thicket_mantis:'#80a33d',reed_viper:'#648c56',crag_golem:'#8e8272',gale_hawk:'#d39539',ironhorn_ram:'#b9a377',duskmane_stalker:'#9566b9',rune_sentinel:'#658abc',greyfang:'#555d74',horned_warden:'#a55143'};
const monsterColor=id=>markerColors[id]||'#52695b';
export const atlasKey=(mapId,id)=>mapId+':'+id;
export function atlasView(ui) {
 const {game:g,sel}=ui, data=g.data, here=data.world.id;
 const maps=data.maps||{[here]:data.world}, worlds=g.worlds||{[here]:g.world}, found=discovery(g.ch,data);
 const image=worldMapImage(worlds), W=image.width, H=image.height;
 const L=(m,x,z)=>((toWorld(data,m,x,z)[0]-image.minX)/W*100)+'%', T=(m,x,z)=>((toWorld(data,m,x,z)[1]-image.minZ)/H*100)+'%';
 const populations=Object.fromEntries(Object.entries(maps).map(([mapId,map])=>[mapId,Object.fromEntries(map.zones.map(z=>[z.id,zoneEncounters(worlds[mapId],data,z.id)]))]));
 const [selMap,selId]=(sel.zone||'').split(':');
 const playerZone=g.world.zoneAt(g.player.x,g.player.z);
 const zoneMap=maps[selMap]&&worlds[selMap]?.zoneById(selId)?selMap:here;
 const zone=zoneMap===selMap?worlds[selMap].zoneById(selId):playerZone, zw=worlds[zoneMap], zdata=maps[zoneMap];
 const [wpMap,wpId]=(sel.waypoint||'').split(':');
 const wp=wpId&&maps[wpMap]?worlds[wpMap].waypoints.find(p=>p.id===wpId):zw.waypoints.find(p=>zw.zoneAt(p.x,p.z).id===zone.id);
 const wpAt=wpId&&maps[wpMap]?wpMap:zoneMap;
 const unlocked=wp&&waypointUnlocked(g.ch,data,wpAt,wp.id);
 const entries=populations[zoneMap][zone.id];
 let fog='',labels='',pins='',bosses='',dots='',regions=[];
 for(const [mapId,map] of Object.entries(maps)){
   const w=worlds[mapId],b=w.bounds,known=found[mapId].zones;
   // Zone overlap follows zoneAt priority. Fog never covers a discovered safe area twice.
   const xs=[...new Set([b.minX,b.maxX,...w.zones.flatMap(z=>z.rects.flatMap(r=>r.slice(0,2)))])].filter(x=>x>=b.minX&&x<=b.maxX).sort((a,c)=>a-c);
   const zs=[...new Set([b.minZ,b.maxZ,...w.zones.flatMap(z=>z.rects.flatMap(r=>r.slice(2,4)))])].filter(z=>z>=b.minZ&&z<=b.maxZ).sort((a,c)=>a-c);
   for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++) {
     if(known.includes(w.zoneAt((xs[i-1]+xs[i])/2,(zs[j-1]+zs[j])/2).id))continue;
     fog+=`<div class="fog" style="left:${L(mapId,xs[i-1],0)};top:${T(mapId,0,zs[j-1])};width:${(xs[i]-xs[i-1])/W*100}%;height:${(zs[j]-zs[j-1])/H*100}%"></div>`;
   }
   for(const z of w.zones){
     const r=z.rects.reduce((a,c)=>(c[1]-c[0])*(c[3]-c[2])>(a[1]-a[0])*(a[3]-a[2])?c:a);
     const [lx,lz]=z.label||[(r[0]+r[1])/2,(r[2]+r[3])/2],on=mapId===zoneMap&&zone.id===z.id;
     const population=populations[mapId][z.id],levelText=encounterLevelLabel(population);
     labels+=`<div class="zlabel ${on?'selected':''}" style="left:${L(mapId,lx,lz)};top:${T(mapId,lx,lz)}"><b>${esc(z.nameTh)}</b><small>${z.safe?'เขตปลอดภัย':levelText}</small></div>`;
     regions.push({mapId,z,on,levelText,min:population.length?Math.min(...population.map(p=>p.min)):0,known:known.includes(z.id)});
   }
   for(const p of encounterLayout(w,data)?.points||[]){
     if(!known.includes(p.zone))continue;
     const m=data.monsters.monsters[p.monster],[x,z]=toWorld(data,mapId,p.x,p.z),on=mapId===zoneMap&&p.zone===zone.id;
     dots+=`<circle data-encounter-pin="${mapId}:${p.monster}" data-zone="${atlasKey(mapId,p.zone)}" cx="${x-image.minX}" cy="${z-image.minZ}" r="${on?3.4:1.8}" fill="${monsterColor(p.monster)}" stroke="white" stroke-width=".7" opacity="${on?1:.55}"><title>${esc(m.nameTh)} · ${encounterLevelLabel([{min:p.level[0],max:p.level[1]}])} · ${esc(p.habitat)}</title></circle>`;
   }
   for(const p of w.waypoints){
     const on=found[mapId].waypoints.includes(p.id),picked=wp&&wpAt===mapId&&wp.id===p.id;
     pins+=`<button class="wpt ${on?'on':''} ${picked?'selected':''}" style="left:${L(mapId,p.x,p.z)};top:${T(mapId,p.x,p.z)}" data-act="select-waypoint" data-id="${atlasKey(mapId,p.id)}" data-zone="${atlasKey(mapId,w.zoneAt(p.x,p.z).id)}" aria-label="${esc(p.nameTh)} · ${on?'เดินทางได้':'ยังไม่เปิดใช้'}">${icon('portal')}</button>`;
   }
   bosses+=(map.bosses||[]).filter(bs=>known.includes(w.zoneAt(...bs.pos).id)).map(bs=>`<span class="bossmark" style="left:${L(mapId,...bs.pos)};top:${T(mapId,...bs.pos)}" title="${data.monsters.monsters[bs.monster].nameTh}">${art('monster',bs.monster)}</span>`).join('');
   bosses+=`<span class="townmark" style="left:${L(mapId,...map.town.workbench)};top:${T(mapId,...map.town.workbench)}">${icon('hammer')}</span>`;
 }
 const target=questTarget(g,trackedQuest(g.ch,data)), totals=worldTotals(g.ch,data);
 const cards=regions.sort((a,c)=>a.min-c.min||a.mapId.localeCompare(c.mapId)||a.z.id.localeCompare(c.z.id)).map(({mapId,z,on,known,levelText})=>`<button class="region-card ${on?'on':''}" data-act="select-zone" data-id="${atlasKey(mapId,z.id)}" aria-pressed="${on}">${atlasRegionArt(mapId,z.id)}<span><b>${z.nameTh}</b><small>${z.safe?'ปลอดภัย':levelText} · ${known?'สำรวจแล้ว':'ยังไม่สำรวจ'}</small></span></button>`).join('');
 const creatures=entries.map(entry=>{
   const id=entry.id,m=data.monsters.monsters[id];
   const drops=[...new Map([...m.drops,...zdata.zoneDrops?.[zone.id]||[],...data.items.upgradeMaterialDrops].filter(d=>d.item!=='gold'&&d.chance>0).map(d=>[d.item,d])).values()];
   return `<article class="creature-entry" data-encounter-entry="${id}" data-encounter-count="${entry.count}" data-level-min="${entry.min}" data-level-max="${entry.max}">${atlasMonsterArt(id)}<div><b><span style="display:inline-block;width:.65em;height:.65em;border-radius:50%;background:${monsterColor(id)};margin-right:.35em"></span>${esc(m.nameTh)}</b><small style="display:block;margin-top:.25em">${encounterLevelLabel([entry])} · ${kindName[entry.kind]} · ${entry.count} จุดเกิด</small><p class="muted">${esc(entry.habitats.join(' · '))}</p><div class="drop-pictures">${drops.map(d=>`<span title="${esc(data.items.materials[d.item]?.nameTh||d.item)}">${art('material',d.item)}<small>${esc(data.items.materials[d.item]?.nameTh||d.item)}</small></span>`).join('')}</div></div></article>`;
 }).join('');
 const services=zone.safe&&zdata.town?`<div class="town-services"><div>${icon('hammer')}<span><b>โต๊ะคราฟต์</b><small>คราฟต์ · ตีบวก · อัปเกรดสกิล</small></span></div><div>${icon('person')}<span><b>ครูฝึก</b><small>ตรวจแต้มและพัฒนาตัวละคร</small></span></div></div>`:'';
 const known=found[zoneMap].zones.includes(zone.id),guide=data.encounters?.maps?.[zoneMap],warning=guide?.warnings?.[zone.id];
 const missing=encounterLayout(zw,data)?.failures.filter(f=>f.zone===zone.id).reduce((sum,f)=>sum+f.missing,0)||0;
 return `<div class="atlas-heading"><div><span class="section-kicker">WORLD MAP / FIELD GUIDE</span><h3>แผนที่โลก</h3></div><span class="level-pill">สำรวจ ${totals.zones[0]} / ${totals.zones[1]}</span></div>
 ${ui.lastResult?`<div class="result-pop" role="status">${ui.lastResult}</div>`:''}
 <div class="atlas-layout"><div class="atlas-main"><div class="worldmap" style="aspect-ratio:${W}/${H}">
   <img src="${image.url()}" alt="แผนที่โลก: ชายฝั่งสีคราม เมืองท่า และชายแดนกรีนฮอลโลว์" draggable="false">${fog}
   <svg viewBox="0 0 ${W} ${H}" aria-label="จุดเกิดมอนตั้งต้นในพื้นที่ที่สำรวจแล้ว" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">${dots}</svg>${labels}
   ${bosses}${pins}${target?`<span class="questmark" style="left:${L(here,target.x,target.z)};top:${T(here,target.x,target.z)}">★</span>`:''}
   <span class="youmark" style="left:${L(here,g.player.x,g.player.z)};top:${T(here,g.player.x,g.player.z)};transform:translate(-50%,-50%) rotate(${Math.PI-g.player.facing}rad)"></span>
   <span class="map-north">N<br>↑</span></div>
   <div class="map-legend"><span><i class="legend-player"></i>คุณ</span><span>${icon('portal')}หินวาร์ป</span><span>★ เป้าหมาย</span><span>${icon('hammer')}โต๊ะคราฟต์</span><span>● จุดเกิดตั้งต้น · สีตรงกับรายชื่อมอน</span></div>
   ${guide?`<p class="muted" style="overflow-wrap:anywhere">เส้นทางแนะนำ: ${esc(guide.routeText)}</p>`:''}
   <div class="section-heading"><h3>เลือกพื้นที่</h3><span>แตะดูมอนและวัตถุดิบ</span></div><div class="region-grid">${cards}</div>
 </div><aside class="region-detail">
   <div class="region-cover">${art('zone',zone.id)}<div><span class="section-kicker">${zone.safe?'SETTLEMENT':'EXPLORATION'}</span><h3>${zone.nameTh}</h3><small>${zone.name}</small></div></div>
   <div class="region-detail-body"><div class="section-heading"><span class="level-pill">${zone.safe?'เขตปลอดภัย':encounterLevelLabel(entries)}</span><small>${known?'สำรวจแล้ว':'ยังไม่สำรวจ'}</small></div>
   ${warning?`<p class="no" role="note">${esc(warning)}</p>`:''}${missing?`<p class="no" role="status">จุดเกิดไม่ครบ ${missing} จุด · รายชื่อด้านล่างแสดงเฉพาะที่เกิดได้จริง</p>`:''}
   ${wp?`<div class="travel-card"><b>${wp.nameTh}</b><small>${unlocked?'เปิดใช้แล้ว · เดินทางได้เมื่อพ้นการต่อสู้':'เดินไปแตะหินนี้เพื่อเปิดใช้'}</small><button class="btn primary" data-act="teleport" data-id="${wp.id}" data-map="${wpAt}" ${unlocked?'':'disabled'}>${icon('portal')} เดินทางไปที่นี่</button></div>`:'<p class="muted">พื้นที่นี้ไม่มีหินวาร์ป · เดินตามถนนเข้าไป</p>'}
   ${services}${creatures?`<h3 class="creature-heading">มอนสเตอร์และของดรอป</h3><p class="muted">แสดงจุดเกิดตั้งต้น ไม่ใช่ตำแหน่งเดินปัจจุบัน</p>${creatures}`:''}</div>
 </aside></div>`;
}
