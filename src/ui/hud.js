// Heads-up display: player frame, minimap, quest tracker, combat feedback, prompts, toasts.
import { icon } from './icons.js';
import { trackedQuest } from '../core/quests.js';
import { questNavigation } from '../core/quest-navigation.js';
import { worldMapImage } from './mapimage.js';
import { toWorld, waypointUnlocked } from '../core/atlas.js';
import { loadPref, savePref } from '../save.js';
import { fieldIcon, xpMarkup, xpPresentation, trackerMarkup } from './fieldhud.js';

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// head height (m, before the rig's scale) for the name + HP bar over each monster
const HEAD = { salt_slime: 1.15, shore_gull: 1.4, hermit_crab: 1.8, tusk_boar: 1.35, thornback_wolf: 1.45, greyfang: 1.45, moss_beetle: 1.35, reef_crab: 1.1, marsh_wisp: 1.0, sporecap: 1.45, crag_golem: 2.75, gale_hawk: 1.3, horned_warden: 2.2, fern_ear_hare: 1.25, mirrorwing_moth: 2.2, rootdigger_mole: 1.5 };

/** Reward line for a finished quest. */
export function rewardText(data, r = {}) {
  const parts = [];
  if (r.exp) parts.push(`${r.exp} EXP`);
  if (r.jobExp) parts.push(`${r.jobExp} Job EXP`);
  if (r.gold) parts.push(`${r.gold} G`);
  for (const id of r.skills || []) parts.push(`สกิลใหม่: ${data.skills.combat[id]?.nameTh || id}`);
  for (const [id, n] of Object.entries(r.items || {})) parts.push(`${data.items.materials[id]?.nameTh || id} ×${n}`);
  return parts.join(' · ');
}

/** Where the tracked quest wants the player to go (for the minimap marker), or null. */
export function questTarget(game, id) {
  if (!id) return null;
  const target = questNavigation(game, id);
  return target?.spatial ? target : null;
}

export class Hud {
  constructor(root, game, view) {
    this.root = root;
    this.game = game;
    this.view = view;
    this.floats = [];
    this.mbars = new Map();

    this.el = {
      frame: h(`<button class="pframe" aria-label="เปิดตัวละครและค่าสถานะ" title="ตัวละคร · C">
        <div class="portrait"></div><div class="lvl-badge">1</div>
        <div class="bars">
          <div class="pname"></div>
          <div class="bar hp"><i class="lag"></i><i class="fill"></i><i class="barrier"></i><span></span></div>
          <div class="bar mp"><i class="fill"></i><span></span></div>
          <div class="statusline"></div>
        </div></button>`),
      topright: h(`<div class="topright">
        <div class="map-cluster"><div class="quick-actions"><button class="iconbtn menu-toggle" aria-label="เปิดเมนูหลัก" aria-haspopup="dialog" title="เมนู · Esc">${fieldIcon('menu')}<span class="menu-label">เมนู</span></button></div>
        <button class="minimap" aria-label="เปิดแผนที่โลก" title="แผนที่ · M"><canvas width="300" height="300"></canvas><span class="map-north" aria-hidden="true">N</span><span class="map-open">${fieldIcon('map')}</span></button></div>
        <div class="location-chip passive"></div></div>`),
      quest: h(`<div class="quest-widget"><div class="quest-heading"><span>ภารกิจติดตาม</span><span class="quest-count"></span><button class="quest-collapse" aria-label="ย่อภารกิจ" aria-expanded="true" aria-controls="quest-detail">−</button></div>
        <button class="questtrack" id="quest-detail" aria-label="แสดงหรือซ่อนเส้นทางภารกิจ" aria-pressed="false"></button></div>`),
      zone: h(`<div class="zonebanner passive"><div class="zd"></div><div class="zn"></div><div class="zs"></div></div>`),
      boss: h(`<div class="bossbar passive"><div class="bn"></div><div class="bar"><i class="fill"></i><span></span></div></div>`),
      floats: h(`<div class="floats passive"></div>`),
      toasts: h(`<div class="toasts passive"></div>`),
      prompt: h(`<div class="prompt"></div>`),
      hint: h(`<div class="hint passive"><kbd>WASD</kbd> เดิน <span>·</span> เมาส์เล็ง <span>·</span> <kbd>Esc</kbd> เมนู / วิธีเล่น</div>`),
      death: h(`<div class="deathveil passive">หมดสติ… กำลังกลับจุดวาร์ปที่ใกล้ที่สุด</div>`),
      fade: h(`<div class="fadeveil passive"></div>`),
      hurt: h(`<div class="hurtveil passive"></div>`),
    };
    for (const k in this.el) root.appendChild(this.el[k]);
    this.leftColumn = h('<div class="left-column"></div>');
    this.leftColumn.append(this.el.frame, this.el.quest);
    root.append(this.leftColumn);
    // EXP and Job EXP run along the very bottom edge of the screen (outside the HUD box)
    this.xp = h(xpMarkup());
    document.body.appendChild(this.xp);
    document.body.classList.add('ingame');
    const q = (s) => this.el.frame.querySelector(s);
    this.hpFill = q('.hp .fill');
    this.hpLag = q('.hp .lag');
    this.hpBarrier = q('.hp .barrier');
    this.hpText = q('.hp span');
    this.mpFill = q('.mp .fill');
    this.mpText = q('.mp span');
    this.expFill = this.xp.querySelector('.exp .fill');
    this.jobFill = this.xp.querySelector('.job .fill');
    this.expText = this.xp.querySelector('.exp span');
    this.jobText = this.xp.querySelector('.job span');
    this.expLevel = this.xp.querySelector('.exp .xp-label');
    this.jobLevel = this.xp.querySelector('.job .xp-label');
    this.lvl = q('.lvl-badge');
    this.statusLine = q('.statusline');
    this.portrait = q('.portrait');
    q('.pname').textContent = game.ch.name || '';
    this.mini = this.el.topright.querySelector('canvas');
    this.quickActions = this.el.topright.querySelector('.quick-actions');
    this.menuToggle = this.el.topright.querySelector('.menu-toggle');
    this.menuToggle.addEventListener('click', () => this.onPanel?.('menu'));
    this.el.frame.addEventListener('click', () => this.onPanel?.('char'));
    this.el.topright.querySelector('.minimap').addEventListener('click', () => this.onPanel?.('map'));
    this.questWidget = this.el.quest;
    this.questToggle = this.el.quest.querySelector('.quest-collapse');
    this.questToggle.addEventListener('click', () => this.setQuestCollapsed(!this.questCollapsed));
    this.setQuestCollapsed(loadPref('questCollapsed', 'false') === 'true');
    this.tracker = this.el.quest.querySelector('.questtrack');
    this.map = worldMapImage(game.worlds || { [game.data.world.id]: game.world });
  }

  setPortrait(url) {
    this.portrait.style.backgroundImage = `url(${url})`;
  }

  // quick shortcuts beside the menu button (bag, skills); everything else lives in the main menu
  addMenuButton(name, key, onClick, label = '') {
    const b = h(`<button class="iconbtn" aria-label="${label || name}" title="${label} · ${key}">${fieldIcon(name)}<span class="menu-label">${label}</span><span class="key">${key}</span></button>`);
    b.addEventListener('click', onClick);
    this.quickActions.insertBefore(b, this.menuToggle);
    return b;
  }

  setQuestCollapsed(on) {
    this.questCollapsed = on;
    this.questWidget.classList.toggle('collapsed', on);
    this.questToggle.textContent = on ? '+' : '−';
    this.questToggle.setAttribute('aria-label', on ? 'ขยายภารกิจ' : 'ย่อภารกิจ');
    this.questToggle.setAttribute('aria-expanded', String(!on));
    savePref('questCollapsed', on);
  }

  onTracker(fn) {
    this.tracker.addEventListener('click', fn);
  }

  // ---------- minimap ----------

  drawMinimap() {
    const g = this.mini.getContext('2d');
    const S = this.mini.width;
    const game = this.game;
    const p = game.player;
    // One world: the minimap reads the stitched world image in world metres, so it
    // runs on across the border between streamed maps.
    const mb = (this.map = worldMapImage(game.worlds || { [game.data.world.id]: game.world }));
    const data = game.data, [pwx, pwz] = toWorld(data, data.world.id, p.x, p.z);
    const range = 36; // metres from the centre to the edge
    const k = S / 2 / range; // canvas px per metre
    g.save();
    g.fillStyle = '#243a28';
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.scale(k / mb.px, k / mb.px);
    g.translate(-(pwx - mb.minX) * mb.px, -(pwz - mb.minZ) * mb.px);
    g.drawImage(mb.canvas, 0, 0);
    g.restore();
    const toS = (x, z) => [S / 2 + (x - p.x) * k, S / 2 + (z - p.z) * k];
    const toSW = (mapId, x, z) => { const [wx, wz] = toWorld(data, mapId, x, z); return [S / 2 + (wx - pwx) * k, S / 2 + (wz - pwz) * k]; };
    const inView = (x, y, pad = 10) => x > -pad && y > -pad && x < S + pad && y < S + pad;
    const edge = (x, y, color, r) => {
      const a = Math.atan2(y - S / 2, x - S / 2);
      g.fillStyle = color;
      g.beginPath();
      g.arc(S / 2 + Math.cos(a) * (S / 2 - 16), S / 2 + Math.sin(a) * (S / 2 - 16), r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.stroke();
    };
    // waypoints of every map in the world
    for (const [mapId, map] of Object.entries(data.maps || { [data.world.id]: data.world })) for (const wp of map.waypoints) {
      const [x, y] = toSW(mapId, wp.pos[0], wp.pos[1]);
      if (!inView(x, y)) continue;
      const on = waypointUnlocked(game.ch, data, mapId, wp.id);
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI / 4);
      g.fillStyle = on ? '#6fe4ff' : '#8a96a0';
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.fillRect(-6, -6, 12, 12);
      g.strokeRect(-6, -6, 12, 12);
      g.restore();
    }
    // town points of every map
    for (const [mapId, map] of Object.entries(data.maps || { [data.world.id]: data.world })) for (const [pos, col] of [[map.town.workbench, '#ffd166'], [map.town.trainer, '#8fd0ff'], ...(map.town.shop ? [[map.town.shop, '#ff8fa8']] : [])]) {
      const [x, y] = toSW(mapId, pos[0], pos[1]);
      if (!inView(x, y)) continue;
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
    for (const m of game.monsters) {
      if (m.dead) continue;
      const [x, y] = toS(m.x, m.z);
      if (!inView(x, y)) continue;
      g.fillStyle = m.boss ? '#ff3a2a' : m.aggro ? '#ff6a4a' : '#d8483a';
      g.beginPath();
      g.arc(x, y, m.boss ? 9 : 4.5, 0, Math.PI * 2);
      g.fill();
      if (m.boss) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.stroke();
      }
    }
    g.fillStyle = '#9fe0ff';
    for (const a of game.allies) {
      const [x, y] = toS(a.x, a.z);
      g.beginPath();
      g.arc(x, y, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    // the tracked quest's destination (a gold star, or a gold dot on the rim when far)
    const tq = this.questPos;
    if (tq) {
      const [x, y] = toS(tq.x, tq.z);
      if (x < 12 || y < 12 || x > S - 12 || y > S - 12) edge(x, y, '#ffd166', 7);
      else {
        g.fillStyle = '#ffd166';
        g.strokeStyle = '#6a4a10';
        g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 4.5 : 10;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.stroke();
      }
    }
    // player arrow (cyan like the reference)
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(-p.facing + Math.PI);
    g.fillStyle = '#6fd8ff';
    g.strokeStyle = '#fff';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, -14);
    g.lineTo(10, 11);
    g.lineTo(0, 5);
    g.lineTo(-10, 11);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  // ---------- quest tracker ----------

  updateTracker() {
    const g = this.game;
    const d = g.data;
    const id = trackedQuest(g.ch, d);
    this.trackedId = id;
    this.questPos = questTarget(g, id);
    const html = trackerMarkup(g, id, this.questPos);
    const active = [...d.quests.main, ...d.quests.side].filter(key => g.ch.progress.quests[key]?.status === 'active').length;
    const counter = this.el.quest.querySelector('.quest-count');
    const countText = active ? `1 / ${active}` : '✓';
    if (counter.textContent !== countText) counter.textContent = countText;
    if (html !== this.lastTracker) {
      this.tracker.innerHTML = html;
      this.lastTracker = html;
    }
  }

  // ---------- events ----------

  toast(text, color) {
    const t = h(`<div class="toast"></div>`);
    t.textContent = text;
    if (color) t.style.borderLeftColor = color;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 6) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 3300);
  }

  banner(text, sub = '', cls = '') {
    // one banner at a time: a newer one replaces the old
    this.bannerEl?.remove();
    const b = h(`<div class="banner passive ${cls}"></div>`);
    b.textContent = text;
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      b.appendChild(s);
    }
    this.root.appendChild(b);
    this.bannerEl = b;
    setTimeout(() => b.remove(), cls === 'long' ? 4200 : 2800);
  }

  float(x, y, z, text, cls) {
    const el = h(`<div class="fnum ${cls || ''}"></div>`);
    el.textContent = text;
    this.el.floats.appendChild(el);
    this.floats.push({ el, x, y: this.game.world.groundY(x, z) + y, z, t: 0, vx: (Math.random() - 0.5) * 30 });
    if (this.floats.length > 60) {
      const f = this.floats.shift();
      f.el.remove();
    }
  }

  showZone(id, discovered = false) {
    const zn = this.game.world.zoneById(id);
    if (!zn) return;
    this.el.zone.querySelector('.zd').textContent = discovered ? '✦ ค้นพบพื้นที่ใหม่ ✦' : '';
    this.el.zone.querySelector('.zn').textContent = zn.nameTh;
    this.el.zone.querySelector('.zs').textContent = zn.safe ? `${zn.name} · เขตปลอดภัย` : `${zn.name} · มอนเลเวล ${zn.level}+`;
    this.el.zone.style.opacity = 1;
    clearTimeout(this.zoneTimer);
    this.zoneTimer = setTimeout(() => (this.el.zone.style.opacity = 0), discovered ? 4200 : 3000);
  }

  /** Red screen edges when the hero is hit; they stay faintly lit while HP is low. */
  hurtFlash(k) {
    const v = this.el.hurt;
    v.style.setProperty('--hit', k.toFixed(2));
    v.classList.remove('hit');
    void v.offsetWidth;
    v.classList.add('hit');
  }

  fade() {
    const f = this.el.fade;
    f.classList.remove('on');
    void f.offsetWidth; // restart the animation
    f.classList.add('on');
  }

  handleEvent(e) {
    const g = this.game;
    const d = g.data;
    switch (e.type) {
      case 'slash':
        if (e.finisher && e.hits) this.float(e.x + Math.sin(e.angle) * 1.6, 2.6, e.z + Math.cos(e.angle) * 1.6, 'ปิดท้าย!', 'finisher');
        break;
      case 'hit':
        this.float(e.x, 1.8, e.z, e.crit ? `${e.amount}!` : e.amount, e.crit ? 'crit' : e.dot ? 'dot' : e.shell ? 'shell' : e.byAlly ? 'ally' : ['cold', 'fire', 'lightning', 'poison'].includes(e.element) ? e.element : '');
        break;
      case 'playerHit':
        if (e.amount > 0) this.float(e.x, 2.1, e.z, `-${e.amount}`, 'hurt');
        if (e.amount > 0 && !e.dot) this.hurtFlash(Math.min(1, 0.35 + e.amount / Math.max(1, g.player.maxHp) * 3));
        if (e.absorbed > 0) this.float(e.x + 0.4, 2.4, e.z, `(${Math.round(e.absorbed)})`, 'dodge');
        break;
      case 'dodge':
        this.float(e.x, 2.2, e.z, 'หลบ!', 'dodge');
        break;
      case 'heal':
        this.float(e.x, 2.2, e.z, `+${e.amount}`, 'heal');
        break;
      case 'potion':
        if (e.hp) this.float(e.x, 2.2, e.z, `+${e.hp}`, 'heal');
        if (e.mp) this.float(e.x, 2.6, e.z, `+${e.mp} MP`, 'mana');
        break;
      case 'bought':
        this.toast(`ซื้อ ${d.items.consumables.types[e.id]?.nameTh || e.id} ×${e.count} · ${e.cost} G`, '#ffd166');
        break;
      case 'pickup': {
        if (e.item === 'gear') {
          this.toast(`ได้ ${d.items.gearBases[e.base]?.nameTh || e.base} · เกรด ${e.grade}`, d.items.grades.colors[e.grade]);
          break;
        }
        const name = e.item === 'gold' ? 'Gold' : d.items.materials[e.item]?.nameTh || e.item;
        this.toast(`+${e.qty} ${name}`, e.item === 'gold' ? '#ffd166' : d.items.materials[e.item]?.color);
        break;
      }
      case 'exp':
        this.float(e.x, 2.6, e.z, `+${e.exp} EXP`, 'info');
        break;
      case 'levelup':
        this.banner(`เลเวล ${e.level}!`, `ได้ Stat Point +${d.progression.character.statPointsPerLevel} · กด C (ตัวละคร) เพื่อลงแต้ม`);
        break;
      case 'joblevelup':
        this.toast(`Job Level ${e.level} · ได้ Job Point +1`, '#c59bff');
        if (e.level === d.progression.job.jobChoiceLevel) this.banner('เลือก Job ได้แล้ว!', 'เปิด Job Tree (J) แล้วเลือกสายที่เข้ากับ Build');
        break;
      case 'questDone': {
        this.lastTracker = null;
        break;
      }
      case 'waypoint':
        this.banner(`ปลดล็อกหินวาร์ป: ${e.name}`, 'เปิดแผนที่ (M) เพื่อวาร์ปมาที่นี่ได้ทุกเมื่อ · ถ้าหมดสติจะฟื้นที่หินใกล้สุด', 'quest');
        break;
      case 'zone':
        if (this.discovered === e.id) break; // the discovery banner already shows it
        this.showZone(e.id);
        break;
      case 'zoneDiscovered':
        this.discovered = e.id;
        this.showZone(e.id, true);
        break;
      case 'teleport':
        this.fade();
        break;
      case 'respawn':
        this.fade();
        this.el.death.classList.remove('on');
        break;
      case 'fail':
        if (e.reason === 'mp') this.toast('MP ไม่พอ', '#3f8cff');
        if (e.reason === 'requires') this.toast('Stat ยังไม่ถึงเงื่อนไขของสกิลนี้', '#ff6b5a');
        if (e.reason === 'offhand') this.toast('สกิลนี้ต้องมีโล่ที่ใช้งานได้', '#ff6b5a');
        if (e.reason === 'weapon') this.toast('สกิลนี้ต้องถือ ' + (e.need || []).map((w) => d.items.weaponTypes[w]?.nameTh || w).join(' / '), '#ff6b5a');
        if (e.reason === 'potion_none') this.toast((d.items.consumables.types[e.item]?.nameTh || 'ยา') + 'หมดแล้ว · ซื้อได้ที่ร้านค้าในเมือง', '#ff9a6a');
        if (e.reason === 'potion_cooldown') this.toast('ยังดื่มยาชนิดนี้ซ้ำไม่ได้ รอสักครู่', '#c8b8a0');
        if (e.reason === 'potion_full') this.toast((d.items.consumables.types[e.item]?.group === 'mp' ? 'MP' : 'HP') + ' เต็มอยู่แล้ว', '#c8b8a0');
        if (e.reason === 'arrows') this.toast('ลูกธนูหมด · คราฟต์ได้ทุกที่นอกการต่อสู้ (กระเป๋า → มือซ้าย)', '#e08a3a');
        break;
      case 'playerDeath':
        this.el.death.classList.add('on');
        break;
      case 'bossDefeated': {
        const boss = (d.world.bosses || []).find((b) => b.id === e.boss);
        let sub = `บอสจะกลับมาใน ${boss?.respawnSeconds || 90} วินาที`;
        if (e.first && e.final) sub = 'จบเนื้อเรื่อง Demo แล้ว! ลองคราฟต์ Horn Greatblade หรือทดลอง Build ใหม่ได้';
        else if (e.first) sub = 'ได้วัตถุดิบบอสแล้ว — กลับไปคราฟต์อาวุธใหม่ที่นิคม';
        this.banner(`ปราบ ${e.name} สำเร็จ!`, sub, 'long');
        break;
      }
      case 'enrage': {
        const m = g.monsterById(e.id);
        this.toast(`${m ? m.def.name : 'บอส'} คลั่ง! โจมตีเร็วและแรงขึ้น — กลิ้งหลบผ่านได้`, '#ff6b5a');
        break;
      }
      case 'howl': {
        const m = g.monsterById(e.id);
        if (m?.boss) this.toast(`${m.def.name} หอนเรียกฝูง!`, '#ff9a6a');
        break;
      }
      case 'stunned':
        this.float(e.x, 2.4, e.z, 'มึน!', 'info');
        break;
      case 'shell': {
        const m = g.monsterById(e.id);
        if (m) this.float(m.x, 2, m.z, 'หดกระดอง!', 'shell');
        break;
      }
      case 'summon':
        this.float(e.x, 1.8, e.z, 'อัญเชิญ!', 'ally');
        break;
    }
  }

  // ---------- per frame ----------

  update(dt, ui) {
    const g = this.game;
    const p = g.player;
    const ch = g.ch;
    const pct = (a, b) => `${Math.max(0, Math.min(100, (a / b) * 100))}%`;
    this.hpFill.style.width = pct(p.hp, p.maxHp);
    this.hpLag.style.width = pct(p.hp, p.maxHp);
    this.hpBarrier.style.width = pct(Math.min(p.barrier, p.maxHp), p.maxHp);
    this.hpText.textContent = `HP  ${Math.ceil(p.hp)} / ${p.maxHp}${p.barrier > 0.5 ? ` +${Math.round(p.barrier)}` : ''}`;
    this.mpFill.style.width = pct(p.mp, p.maxMp);
    const low = !p.dead && p.hp < p.maxHp * 0.3;
    if (low !== this.lowHp) this.el.hurt.classList.toggle('low', (this.lowHp = low));
    this.mpText.textContent = `MP  ${Math.floor(p.mp)} / ${p.maxMp}`;
    const xpKey = `${ch.level}:${ch.exp}:${ch.jobLevel}:${ch.jobExp}`;
    if (xpKey !== this.lastXpKey) {
      this.lastXpKey = xpKey;
      const xp = xpPresentation(ch, g.data);
      this.expFill.style.width = `${xp.exp.percent}%`;
      this.jobFill.style.width = `${xp.job.percent}%`;
      this.expText.textContent = xp.exp.text;
      this.jobText.textContent = xp.job.text;
      this.expLevel.textContent = `Lv. ${ch.level}`;
      this.jobLevel.textContent = `Job ${ch.jobLevel}`;
      this.xp.setAttribute('aria-label', `Lv.${ch.level} ${xp.exp.text} · Job ${ch.jobLevel} ${xp.job.text}`);
    }
    this.lvl.textContent = ch.level;
    const area = g.world.zoneAt(p.x, p.z);
    if (area?.id !== this.locationId) {
      this.locationId = area?.id;
      this.el.topright.querySelector('.location-chip').innerHTML = area ? `${fieldIcon('pin')}<span>${esc(area.nameTh)}<small>${area.safe ? 'เขตปลอดภัย' : `Lv. ${area.level}+`}</small></span>` : '';
    }
    const st = [`<b>Job ${ch.jobLevel}</b>`, `<b class="gold">${fieldIcon('coin')}${ch.gold.toLocaleString('en-US')} G</b>`];
    if (p.statuses.poison) st.push('<b class="st poison">ติดพิษ</b>');
    if (p.statuses.chill) st.push('<b class="st cold">หนาวช้า</b>');
    if (p.buffs.war_cry) st.push('<b class="st buff">คำรามศึก</b>');
    if (g.allies.length) st.push(`<b class="st ally">หมาป่า ×${g.allies.length}</b>`);
    const html = st.join('');
    if (html !== this.lastStatus) {
      this.statusLine.innerHTML = html;
      this.lastStatus = html;
    }

    // boss bar: the nearest boss that is fighting
    let boss = null;
    let bd = 40;
    for (const m of g.monsters) {
      if (!m.boss || m.dead || !m.aggro) continue;
      const dd = Math.hypot(m.x - p.x, m.z - p.z);
      if (dd < bd) {
        bd = dd;
        boss = m;
      }
    }
    this.el.boss.classList.toggle('on', !!boss);
    if (boss) {
      this.el.boss.querySelector('.bn').textContent = `${boss.def.name} · ${boss.def.nameTh} · Lv.${boss.level}${boss.enraged ? ' · คลั่ง' : ''}`;
      this.el.boss.querySelector('.fill').style.width = pct(boss.hp, boss.maxHp);
      this.el.boss.querySelector('span').textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    }

    // interaction prompt
    const near = g.nearby();
    const prompt = near.workbench ? 'workbench' : near.trainer ? 'trainer' : near.shop ? 'shop' : near.waypoint ? 'waypoint' : near.exit ? 'exit:' + near.exit : null;
    if (prompt !== this.lastPrompt) {
      this.lastPrompt = prompt;
      this.el.prompt.innerHTML = '';
      this.el.prompt.classList.toggle('on', !!prompt);
      if (prompt) {
        const exit = near.exit && g.world.exits.find((e) => e.id === near.exit);
        const label = exit ? 'เดินทางไป' + exit.nameTh : { workbench: 'ใช้โต๊ะคราฟต์', trainer: 'คุยกับครูฝึก', shop: 'ร้านค้า · ซื้อยา', waypoint: 'เดินทางผ่านหินวาร์ป' }[prompt];
        const ic = exit ? 'portal' : { workbench: 'hammer', trainer: 'tree', shop: 'bag', waypoint: 'portal' }[prompt];
        const b = h(`<button class="pbtn">${icon(ic)}<span>${label}</span><kbd>E</kbd></button>`);
        b.addEventListener('click', () => ui.interact());
        this.el.prompt.appendChild(b);
      }
    }

    // floating numbers
    const keep = [];
    for (const f of this.floats) {
      f.t += dt;
      const s = this.view.project(f.x, f.y + f.t * 1.2, f.z);
      f.el.style.transform = `translate(calc(-50% + ${s.x + f.vx * f.t}px), calc(-50% + ${s.y}px)) scale(${f.t < 0.1 ? 1.3 - f.t * 3 : 1})`;
      f.el.style.opacity = f.t > 0.7 ? 1 - (f.t - 0.7) / 0.5 : 1;
      if (f.t > 1.2) f.el.remove();
      else keep.push(f);
    }
    this.floats = keep;

    // monster name + hp bars (damaged, fighting or targeted; bosses use the big bar)
    const seen = new Set();
    for (const m of g.monsters) {
      if (m.dead || m.boss) continue;
      const show = m.id === p.targetId || m.hp < m.maxHp || m.aggro;
      if (!show) continue;
      if ((m.x - p.x) ** 2 + (m.z - p.z) ** 2 > 32 * 32) continue;
      const mv = this.view.monsterViews.get(m.id);
      if (!mv) continue;
      seen.add(m.id);
      let b = this.mbars.get(m.id);
      if (!b) {
        b = h(`<div class="mbar"><div class="mn"></div><div class="bar"><i class="fill"></i></div></div>`);
        b.querySelector('.mn').innerHTML = `<em>Lv.${m.level}</em> ${esc(m.def.nameTh)}`;
        this.el.floats.appendChild(b);
        this.mbars.set(m.id, b);
      }
      const sc = mv.rig.baseScale || 1;
      const s = this.view.project(m.x, mv.y + ((m.alt || 0) + (HEAD[m.type] || 1.5)) * sc, m.z);
      b.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      b.querySelector('.fill').style.width = pct(m.hp, m.maxHp);
      b.classList.toggle('target', m.id === p.targetId);
      b.style.visibility = mv.hidden && mv.fade < 0.04 ? 'hidden' : '';
    }
    for (const [id, b] of this.mbars) {
      if (!seen.has(id)) {
        b.remove();
        this.mbars.delete(id);
      }
    }

    this.miniT = (this.miniT ?? 1) + dt;
    if (this.miniT > 0.1) {
      this.miniT = 0;
      this.updateTracker();
      this.drawMinimap();
    }
  }
}
