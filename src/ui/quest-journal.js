// Quest-specific journal; layout state is UI-only, tracking is saved by the normal panel callback.
import { questIds, questProgress, questPrerequisites, trackedQuest, trackQuest } from '../core/quests.js';
import { questNavigation } from '../core/quest-navigation.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

// Scoped component styling: no effect on the passive-tree journal or combat HUD.
export const questJournalStyle = `
.quest-journey{--q-ink:#443c31;--q-muted:#756b5b;--q-paper:#f7f2e6;--q-line:#d7cbb6;--q-accent:#4e6c64;color:var(--q-ink);min-width:0;text-align:left}
.quest-journey *{box-sizing:border-box}.quest-journey button{font:inherit;cursor:pointer;touch-action:manipulation}
.quest-journey .qj-cover{padding:20px 22px;border:1px solid var(--q-line);border-radius:12px;background:var(--q-paper);margin-bottom:16px}
.quest-journey .qj-intro-mobile{display:none}.quest-journey .qj-kicker{font-size:11px;letter-spacing:2px;color:var(--q-accent);font-weight:600}.quest-journey h2{font-size:24px;line-height:1.4;margin:6px 0 10px}.quest-journey p{line-height:1.7;margin:6px 0;color:var(--q-muted)}
.quest-journey .qj-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.quest-journey .qj-count{font-size:13px;white-space:nowrap}
.quest-journey .qj-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}.quest-journey .qj-tabs button,.quest-journey .qj-action{border:1px solid var(--q-line);border-radius:8px;padding:10px 14px;min-height:44px;background:#fffaf0;color:var(--q-ink)}
.quest-journey .qj-tabs button[aria-pressed=true],.quest-journey .qj-action.is-tracked{background:var(--q-accent);color:#fff;border-color:var(--q-accent)}
.quest-journey button:focus-visible,.quest-journey summary:focus-visible{outline:3px solid #628c9f;outline-offset:3px}
.quest-journey .qj-layout{display:grid;grid-template-columns:225px minmax(0,1fr);gap:18px;align-items:start}
.quest-journey .qj-chapters{display:flex;flex-direction:column;gap:7px}.quest-journey .qj-chapter{display:grid;grid-template-columns:28px minmax(0,1fr);align-items:center;gap:9px;width:100%;padding:11px 12px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--q-muted);text-align:left;min-height:62px}
.quest-journey .qj-chapter[aria-pressed=true]{border-color:var(--q-line);background:#eee5d2;color:var(--q-ink)}.quest-journey .qj-chapter b{display:block;font-size:13px;line-height:1.5}.quest-journey .qj-chapter small{display:block;margin-top:3px;font-size:11px}.quest-journey .qj-number{font-size:18px;font-weight:600;text-align:center}
.quest-journey .qj-chapter-intro{margin-bottom:14px}.quest-journey h3{font-size:18px;line-height:1.5;margin:0 0 5px}.quest-journey .qj-list{display:grid;gap:12px;min-width:0}
.quest-journey .qj-card{padding:18px;border:1px solid var(--q-line);border-radius:11px;background:#fffaf1;min-width:0}.quest-journey .qj-card.is-tracked{border-left:4px solid var(--q-accent)}.quest-journey .qj-card.is-locked{background:#f0e9da}
.quest-journey .qj-card-head{display:flex;gap:13px;align-items:center}.quest-journey .qj-picture{width:54px;height:54px;flex:0 0 54px}.quest-journey .qj-picture{overflow:hidden}.quest-journey .qj-picture>*,.quest-journey .qj-picture img,.quest-journey .qj-picture svg{display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain}.quest-journey .qj-card-head>div:last-child{min-width:0}.quest-journey h4{font-size:16px;line-height:1.55;margin:3px 0;overflow-wrap:anywhere}
.quest-journey .qj-status{font-size:11px;color:var(--q-accent)}.quest-journey .qj-level{color:var(--q-muted);font-size:11px;margin-left:8px}.quest-journey .qj-description{font-size:13px;margin:12px 0}
.quest-journey .qj-objectives{display:grid;gap:7px;margin:12px 0;padding:0;list-style:none}.quest-journey .qj-objectives li{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:8px;align-items:start;font-size:13px;line-height:1.6}.quest-journey .qj-objectives small{display:block;color:var(--q-muted);font-size:11px}.quest-journey .qj-objectives .is-done{color:var(--q-accent)}
.quest-journey .qj-reward{padding-top:10px;border-top:1px solid var(--q-line);color:var(--q-muted);font-size:11px;line-height:1.8;overflow-wrap:anywhere}.quest-journey .qj-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px}.quest-journey .qj-route{font-size:11px;line-height:1.8;color:var(--q-muted);max-width:100%;overflow-wrap:anywhere}.quest-journey .qj-action{font-size:12px}.quest-journey .qj-lock-note{font-size:12px}.quest-journey .qj-empty{padding:24px;border:1px dashed var(--q-line);border-radius:10px}.quest-journey details{margin-top:14px}.quest-journey summary{min-height:44px;padding:10px 0;cursor:pointer;font-size:13px}.quest-journey .qj-meta{font-size:11px;color:var(--q-muted);margin:14px 0 0}
@media(max-width:700px){.quest-journey .qj-layout{grid-template-columns:minmax(0,1fr)}.quest-journey .qj-chapters{flex-direction:row;overflow-x:auto;scroll-snap-type:x proximity;max-width:100%;padding-bottom:4px}.quest-journey .qj-chapter{flex:0 0 185px;scroll-snap-align:start}.quest-journey .qj-cover>.qj-intro{display:none}.quest-journey .qj-intro-mobile{display:block;margin-top:4px}.quest-journey .qj-chapter{padding:8px;gap:5px}.quest-journey .qj-cover{padding:16px}.quest-journey h2{font-size:21px}.quest-journey .qj-card{padding:14px}.quest-journey .qj-tabs button{flex:1;padding:9px 8px}.quest-journey .qj-level{display:block;margin:2px 0 0}.quest-journey .qj-picture{width:44px;height:44px;flex-basis:44px}}
@media(max-height:500px){.quest-journey .qj-cover{padding:10px 16px}.quest-journey .qj-cover>.qj-intro{display:none}.quest-journey .qj-meta{margin-top:0}.quest-journey .qj-cover h2{font-size:19px;margin:0}.quest-journey .qj-kicker{display:none}.quest-journey .qj-tabs{margin-bottom:10px}}
`;
function worldLabel(data, o) {
  const maps = data.maps || { [data.world.id]: data.world };
  return o.world ? maps[o.world]?.nameTh || o.world : o.worlds ? 'นับต่อเนื่องได้ทั้งสองฝั่งของเส้นทาง' : 'ทำต่อได้ทุกพื้นที่';
}
export function questJournalView(ui, { art, rewardText }) {
  const g = ui.game, { data, ch } = g, Q = data.quests, tracked = trackedQuest(ch, data);
  const mode = ['story', 'optional', 'history'].includes(ui.sel.questMode) ? ui.sel.questMode : 'story';
  const chapters = Q.chapters || [{ id:'journey', nameTh:'การเดินทาง', summaryTh:'', quests:Q.main }];
  const activeStory = Q.main.find(id => ch.progress.quests[id]?.status === 'active');
  const current = chapters.find(c => c.quests.includes(activeStory)) || chapters.at(-1);
  const selected = chapters.find(c => c.id === ui.sel.questChapter) || current;
  const ids = questIds(data), done = id => ch.progress.quests[id]?.status === 'done';
  const card = id => {
    const def = Q.quests[id], progress = questProgress(ch, data, id);
    const locked = progress.status === 'locked', completed = progress.status === 'done';
    const nav = !completed && !locked ? questNavigation(g, id) : null;
    const kind = def.type === 'kill' ? 'monster' : def.type === 'collect' ? 'material' : ['zone','waypoint'].includes(def.type) ? 'zone' : def.type === 'job' ? 'job' : def.type === 'socket' ? 'mod' : 'gear';
    const imageId = def.target || (kind === 'job' ? 'origin' : kind === 'mod' ? 'wide_arc' : 'tusk_blade');
    const picture = art(kind, imageId === 'town' ? 'settlement' : imageId);
    const status = completed ? 'สำเร็จแล้ว' : locked ? 'ขั้นต่อไปของเรื่อง' : id === tracked ? 'กำลังติดตาม' : 'พร้อมทำต่อ';
    const blockers = questPrerequisites(data, id).filter(p => !done(p));
    const goalMap = nav?.world && (data.maps?.[nav.world] || data.world);
    const route = nav?.spatial ? `${nav.remote ? 'ไปต่อทาง '+nav.via+' · ' : ''}${nav.approximate?'สำรวจบริเวณ ':''}${nav.label || goalMap?.nameTh || ''} · ถึงเป้าหมาย ~${Math.round(nav.distance)} ม. (ระยะตรง)` : nav?.label || '';
    return `<article class="qj-card ${locked?'is-locked':''} ${id===tracked?'is-tracked':''}" data-quest-id="${esc(id)}" data-quest-status="${progress.status}"><header class="qj-card-head"><div class="qj-picture">${picture}</div><div><span class="qj-status">${status}</span>${def.level?`<span class="qj-level">แนะนำ Lv.${def.level} · ไม่ใช่เงื่อนไขปลดล็อก</span>`:''}<h4>${esc(def.nameTh)}</h4></div></header><p class="qj-description">${esc(def.descTh)}</p>${locked?`<p class="qj-lock-note">ทำต่อจาก: ${blockers.map(p=>esc(Q.quests[p]?.nameTh||p)).join(' → ')}</p>`:`<ul class="qj-objectives">${progress.objectives.map(o=>`<li class="${o.progress>=o.count?'is-done':''}" data-quest-objective="${esc(o.id)}"><span aria-hidden="true">${o.progress>=o.count?'✓':'○'}</span><span>${esc(o.labelTh||def.descTh)}<small>${esc(worldLabel(data,o))}</small></span><b>${o.progress}/${o.count}</b></li>`).join('')}</ul>`}<div class="qj-reward">รางวัล · ${esc(rewardText(data,def.reward))}${completed?(progress.rewardClaimed?' · รับแล้ว':' · รอรับอัตโนมัติ'):''}</div>${!locked&&!completed?`<footer class="qj-footer"><span class="qj-route">${esc(route)}</span>${nav?.menu&&['skills','job'].includes(nav.menu)?`<button class="qj-action" data-act="quest-menu" data-id="${nav.menu}">${nav.menu==='job'?'เปิดต้นไม้อาชีพ':'เปิดเมนูสกิล'}</button>`:''}<button class="qj-action ${id===tracked?'is-tracked':''}" data-act="quest-track" data-id="${esc(id)}" aria-pressed="${id===tracked}">${id===tracked?'★ ติดตามอยู่':'ติดตามภารกิจนี้'}</button></footer>`:''}</article>`;
  };
  const nav = chapters.map((c,i)=>`<button class="qj-chapter" data-act="quest-chapter" data-id="${esc(c.id)}" aria-pressed="${c.id===selected.id}"><span class="qj-number">${String(i+1).padStart(2,'0')}</span><span><b>${esc(c.nameTh)}</b><small>${c.quests.filter(done).length}/${c.quests.length} ภารกิจ${c.id===current.id&&activeStory?' · เรื่องปัจจุบัน':''}</small></span></button>`).join('');
  const optional = Q.side.filter(id => ch.progress.quests[id]?.status === 'active');
  const upcoming = Q.side.filter(id => !ch.progress.quests[id] || ch.progress.quests[id].status === 'locked');
  const history = [...ids,...(Q.archived||[])].filter(done);
  let body;
  if(mode==='story') body=`<div class="qj-layout"><nav class="qj-chapters" aria-label="บทของการเดินทาง">${nav}</nav><section><header class="qj-chapter-intro"><h3>${esc(selected.nameTh)}</h3><p>${esc(selected.summaryTh)}</p></header><div class="qj-list">${selected.quests.map(card).join('')}</div></section></div>`;
  else if(mode==='optional') body=`<section><h3>เรื่องราวระหว่างทาง</h3><p>ไม่ขวางเนื้อเรื่องหลัก เก็บความคืบหน้าไว้แม้เดินออกจากพื้นที่</p><div class="qj-list">${optional.map(card).join('')||'<div class="qj-empty">ยังไม่มีงานทางเลือกที่เปิดอยู่ เดินเรื่องหลักต่อเพื่อพบงานระหว่างทาง</div>'}</div><details><summary>งานที่จะพบระหว่างทาง · ${upcoming.length}</summary><div class="qj-list">${upcoming.map(card).join('')}</div></details></section>`;
  else body=`<section><h3>บันทึกที่สำเร็จแล้ว</h3><p>เก็บความคืบหน้าและรางวัลเดิมไว้ ไม่มีการจ่ายรางวัลซ้ำเมื่อข้ามพื้นที่หรือโหลดเซฟ</p><div class="qj-list">${history.map(card).join('')||'<div class="qj-empty">ยังไม่มีภารกิจสำเร็จ</div>'}</div></section>`;
  return `<style data-quest-journal-style>${questJournalStyle}</style><section class="quest-journey" aria-label="สมุดการเดินทาง"><header class="qj-cover"><span class="qj-kicker">SEEKER / JOURNEY</span><div class="qj-top"><h2>${esc(Q.titleTh||'บันทึกการเดินทาง')}</h2><span class="qj-count">เรื่องหลัก ${Q.main.filter(done).length}/${Q.main.length} · ทางเลือก ${Q.side.filter(done).length}/${Q.side.length}</span></div><p class="qj-intro">${esc(Q.introTh||'การเดินทางเดียว เชื่อมทุกพื้นที่')}</p><details class="qj-intro-mobile"><summary>เกี่ยวกับการเดินทางนี้</summary><p>${esc(Q.introTh||'การเดินทางเดียว เชื่อมทุกพื้นที่')}</p></details><div class="qj-top"><span class="qj-meta">${ch.progress.questJournal?.trackedId?'ปักภารกิจไว้แล้ว · ข้ามเขตไม่เปลี่ยนเป้าหมาย':'ติดตามเรื่องหลักอัตโนมัติ'}</span><button class="qj-action" data-act="quest-auto">ตามเรื่องหลัก</button></div></header><nav class="qj-tabs" aria-label="หมวดภารกิจ">${[['story','การเดินทางหลัก'],['optional','ระหว่างทาง'],['history','สำเร็จแล้ว']].map(([id,title])=>`<button data-act="quest-mode" data-id="${id}" aria-pressed="${mode===id}">${title}</button>`).join('')}</nav>${body}</section>`;
}
/** Shared by production Panels and isolated touch tests. Read controls never save/move the hero. */
export function handleQuestJournalAction(ui, element) {
  const { act, id } = element.dataset;
  if (act === 'quest-mode') {
    if (!['story','optional','history'].includes(id)) return false;
    ui.sel.questMode = id; ui.render();
  } else if (act === 'quest-chapter') {
    if (!ui.game.data.quests.chapters?.some(c=>c.id===id)) return false;
    ui.sel.questChapter = id; ui.sel.questMode = 'story'; ui.render();
  } else if (act === 'quest-menu') {
    if (!['skills','job'].includes(id)) return false;
    ui.open(id); return true;
  } else if (act === 'quest-track' || act === 'quest-auto') {
    if (!trackQuest(ui.game.ch, ui.game.data, act === 'quest-auto' ? null : id)) return false;
    ui.changed();
  } else return false;
  const selector = act === 'quest-auto' ? '[data-act="quest-auto"]' : `[data-act="${act}"][data-id="${id}"]`;
  ui.body?.querySelector(selector)?.focus({ preventScroll: true });
  return true;
}
