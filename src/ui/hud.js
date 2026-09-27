// Heads-up display: player frame, minimap, combat buttons, floating numbers, toasts.
import { icon } from './icons.js';
import { expToNext, jobExpToNext } from '../core/character.js';

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

export class Hud {
  constructor(root, game, view) {
    this.root = root;
    this.game = game;
    this.view = view;
    this.floats = [];
    this.mbars = new Map();
    this.zone = null;

    this.el = {
      frame: h(`<div class="pframe passive">
        <div class="portrait"></div><div class="lvl-badge">1</div>
        <div class="bars">
          <div class="bar hp"><i class="lag"></i><i class="fill"></i><i class="barrier"></i><span></span></div>
          <div class="bar mp"><i class="fill"></i><span></span></div>
          <div class="bar small exp"><i class="fill"></i></div>
          <div class="bar small job"><i class="fill"></i></div>
          <div class="statusline"></div>
        </div></div>`),
      topright: h(`<div class="topright">
        <div class="minimap passive"><canvas width="300" height="300"></canvas></div>
        <div class="menu"></div></div>`),
      zone: h(`<div class="zonebanner passive"><div class="zn"></div><div class="zs"></div></div>`),
      boss: h(`<div class="bossbar passive"><div class="bn"></div><div class="bar"><i class="fill"></i><span></span></div></div>`),
      floats: h(`<div class="floats passive"></div>`),
      toasts: h(`<div class="toasts passive"></div>`),
      prompt: h(`<div class="prompt"></div>`),
      hint: h(`<div class="hint passive">WASD เดิน · เมาส์เล็ง · คลิกซ้ายตี · คลิกขวา/1-4 สกิล · Space หลบ<br>I กระเป๋า · K สกิล · J Job · C ตัวละคร · E ใช้โต๊ะ/คุย</div>`),
      death: h(`<div class="deathveil passive">หมดสติ… กำลังกลับนิคม</div>`),
    };
    for (const k in this.el) root.appendChild(this.el[k]);
    this.hpFill = this.el.frame.querySelector('.hp .fill');
    this.hpLag = this.el.frame.querySelector('.hp .lag');
    this.hpBarrier = this.el.frame.querySelector('.hp .barrier');
    this.hpText = this.el.frame.querySelector('.hp span');
    this.mpFill = this.el.frame.querySelector('.mp .fill');
    this.mpText = this.el.frame.querySelector('.mp span');
    this.expFill = this.el.frame.querySelector('.exp .fill');
    this.jobFill = this.el.frame.querySelector('.job .fill');
    this.lvl = this.el.frame.querySelector('.lvl-badge');
    this.statusLine = this.el.frame.querySelector('.statusline');
    this.portrait = this.el.frame.querySelector('.portrait');
    this.mini = this.el.topright.querySelector('canvas');
    this.menu = this.el.topright.querySelector('.menu');
    this.buildMinimapBase();
  }

  setPortrait(url) {
    this.portrait.style.backgroundImage = `url(${url})`;
  }

  addMenuButton(name, key, onClick) {
    const b = h(`<button class="iconbtn" aria-label="${name}">${icon(name)}<span class="key">${key}</span></button>`);
    b.addEventListener('click', onClick);
    this.menu.appendChild(b);
    return b;
  }

  // ---------- minimap ----------

  buildMinimapBase() {
    const w = this.game.world;
    const b = w.bounds;
    const W = 400;
    const H = Math.round((W * (b.maxZ - b.minZ)) / (b.maxX - b.minX));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const sx = W / (b.maxX - b.minX);
    const tx = (x) => (x - b.minX) * sx;
    const tz = (z) => (z - b.minZ) * sx;
    const zoneCol = { settlement: '#8ac25a', meadow: '#94c95a', forest: '#5f9d44', wetland: '#5aa06a', ruins: '#8fa870' };
    for (const zn of w.zones) {
      g.fillStyle = zoneCol[zn.id] || '#7a7';
      g.fillRect(tx(zn.minX), 0, (zn.maxX - zn.minX) * sx, H);
    }
    const line = (pts, width, color) => {
      g.strokeStyle = color;
      g.lineWidth = width * sx;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      pts.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))));
      g.stroke();
    };
    line(w.data.river.points, w.data.river.width, '#4aa3d8');
    for (const [px, pz, pr] of w.data.ponds) {
      g.fillStyle = '#4aa3d8';
      g.beginPath();
      g.arc(tx(px), tz(pz), pr * sx, 0, Math.PI * 2);
      g.fill();
    }
    line(w.data.path.points, w.data.path.width, '#caa06a');
    g.fillStyle = '#3f7a33';
    for (const c2 of w.circles) {
      if (c2.type === 'tree' || c2.type === 'willow') {
        g.beginPath();
        g.arc(tx(c2.x), tz(c2.z), 1.2 * sx, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#9a96a8';
    for (const c2 of w.circles) if (c2.type.startsWith('pillar') || c2.type === 'ruin_block' || c2.type === 'rock') g.fillRect(tx(c2.x) - 1.5, tz(c2.z) - 1.5, 3, 3);
    g.fillStyle = '#e8d8b8';
    for (const bx of w.boxes) if (bx.type === 'house') g.fillRect(tx(bx.x) - 3.2 * sx, tz(bx.z) - 2.6 * sx, 6.4 * sx, 5.2 * sx);
    this.miniBase = { canvas: c, sx, minX: b.minX, minZ: b.minZ };
  }

  drawMinimap() {
    const g = this.mini.getContext('2d');
    const S = this.mini.width;
    const p = this.game.player;
    const mb = this.miniBase;
    const range = 34; // metres shown from centre to edge
    const k = S / 2 / range; // px per metre
    g.save();
    g.fillStyle = '#2f4a2f';
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.scale(k / mb.sx, k / mb.sx);
    g.translate(-(p.x - mb.minX) * mb.sx, -(p.z - mb.minZ) * mb.sx);
    g.drawImage(mb.canvas, 0, 0);
    g.restore();
    const toS = (x, z) => [S / 2 + (x - p.x) * k, S / 2 + (z - p.z) * k];
    // town points
    const t = this.game.data.world.town;
    for (const [pos, col] of [[t.workbench, '#ffd166'], [t.trainer, '#8fd0ff']]) {
      const [x, y] = toS(pos[0], pos[1]);
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
    for (const m of this.game.monsters) {
      if (m.dead) continue;
      const [x, y] = toS(m.x, m.z);
      if (x < -10 || y < -10 || x > S + 10 || y > S + 10) continue;
      g.fillStyle = m.boss ? '#ff3a2a' : m.aggro ? '#ff5a4a' : '#e84a3a';
      g.beginPath();
      g.arc(x, y, m.boss ? 9 : 5, 0, Math.PI * 2);
      g.fill();
      if (m.boss) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.stroke();
      }
    }
    // boss direction marker when off-map
    const boss = this.game.monsters.find((m) => m.boss && !m.dead);
    if (boss) {
      const [x, y] = toS(boss.x, boss.z);
      if (x < 0 || y < 0 || x > S || y > S) {
        const a = Math.atan2(y - S / 2, x - S / 2);
        g.fillStyle = '#ff5a4a';
        g.beginPath();
        g.arc(S / 2 + Math.cos(a) * (S / 2 - 14), S / 2 + Math.sin(a) * (S / 2 - 14), 7, 0, Math.PI * 2);
        g.fill();
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

  // ---------- events ----------

  toast(text, color) {
    const t = h(`<div class="toast"></div>`);
    t.textContent = text;
    if (color) t.style.borderLeftColor = color;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 6) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 3300);
  }

  banner(text, sub = '') {
    const b = h(`<div class="banner passive"></div>`);
    b.textContent = text;
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      b.appendChild(s);
    }
    this.root.appendChild(b);
    setTimeout(() => b.remove(), 2700);
  }

  float(x, y, z, text, cls) {
    const el = h(`<div class="fnum ${cls || ''}"></div>`);
    el.textContent = text;
    this.el.floats.appendChild(el);
    this.floats.push({ el, x, y, z, t: 0, vx: (Math.random() - 0.5) * 30 });
    if (this.floats.length > 60) {
      const f = this.floats.shift();
      f.el.remove();
    }
  }

  handleEvent(e) {
    const g = this.game;
    const d = g.data;
    switch (e.type) {
      case 'hit':
        this.float(e.x, 1.8, e.z, e.amount, e.crit ? 'crit' : e.dot ? 'dot' : e.shell ? 'shell' : e.element === 'cold' ? 'cold' : e.element === 'fire' ? 'fire' : '');
        break;
      case 'playerHit':
        if (e.amount > 0) this.float(e.x, 2.1, e.z, `-${e.amount}`, 'hurt');
        if (e.absorbed > 0) this.float(e.x + 0.4, 2.4, e.z, `(${Math.round(e.absorbed)})`, 'dodge');
        break;
      case 'dodge':
        this.float(e.x, 2.2, e.z, 'หลบ!', 'dodge');
        break;
      case 'heal':
        this.float(e.x, 2.2, e.z, `+${e.amount}`, 'heal');
        break;
      case 'pickup': {
        const name = e.item === 'gold' ? 'Gold' : d.items.materials[e.item]?.nameTh || e.item;
        this.toast(`+${e.qty} ${name}`, e.item === 'gold' ? '#ffd166' : d.items.materials[e.item]?.color);
        break;
      }
      case 'exp':
        this.float(e.x, 2.6, e.z, `+${e.exp} EXP`, 'info');
        break;
      case 'levelup':
        this.banner(`เลเวล ${e.level}!`, `ได้ Stat Point +${d.progression.character.statPointsPerLevel}`);
        break;
      case 'joblevelup':
        this.toast(`Job Level ${e.level} · ได้ Job Point +1`, '#c59bff');
        if (e.level === d.progression.job.jobChoiceLevel) this.banner('เลือก Job ได้แล้ว!', 'เปิด Job Tree (J) แล้วเลือกสายที่เข้ากับ Build');
        break;
      case 'fail':
        if (e.reason === 'mp') this.toast('MP ไม่พอ', '#3f8cff');
        if (e.reason === 'requires') this.toast('Stat ยังไม่ถึงเงื่อนไขของสกิลนี้', '#ff6b5a');
        break;
      case 'playerDeath':
        this.el.death.classList.add('on');
        break;
      case 'respawn':
        this.el.death.classList.remove('on');
        break;
      case 'bossDefeated':
        this.banner('ปราบ Horned Warden สำเร็จ!', e.first ? 'จบ Demo แล้ว — ลองคราฟต์ Horn Greatblade หรือทดลอง Build ใหม่ได้' : 'บอสจะกลับมาใน 90 วินาที');
        break;
      case 'enrage':
        this.toast('Horned Warden คลั่ง! ระวังคลื่นกระแทก — กลิ้งผ่านได้', '#ff6b5a');
        break;
      case 'stunned':
        this.float(e.x, 2.4, e.z, 'มึน!', 'info');
        break;
      case 'shell': {
        const m = g.monsterById(e.id);
        if (m) this.float(m.x, 2, m.z, 'หดกระดอง!', 'shell');
        break;
      }
      case 'trigger':
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
    this.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}${p.barrier > 0.5 ? ` +${Math.round(p.barrier)}` : ''}`;
    this.mpFill.style.width = pct(p.mp, p.maxMp);
    this.mpText.textContent = `${Math.floor(p.mp)} / ${p.maxMp}`;
    this.expFill.style.width = pct(ch.exp, expToNext(g.data, ch.level));
    this.jobFill.style.width = pct(ch.jobExp, jobExpToNext(g.data, ch.jobLevel));
    this.lvl.textContent = ch.level;
    const st = [];
    st.push(`<b>Job ${ch.jobLevel}</b>`);
    st.push(`💰 <b>${ch.gold}</b>`);
    if (p.statuses.poison) st.push('<b style="color:#b6ec5a">ติดพิษ</b>');
    const html = st.join('');
    if (html !== this.lastStatus) {
      this.statusLine.innerHTML = html;
      this.lastStatus = html;
    }

    // zone banner
    const zn = g.zoneAt(p.x);
    if (zn.id !== this.zone) {
      this.zone = zn.id;
      this.el.zone.querySelector('.zn').textContent = zn.nameTh;
      this.el.zone.querySelector('.zs').textContent = zn.safe ? `${zn.name} · เขตปลอดภัย` : `${zn.name} · มอนเลเวล ${zn.level}+`;
      this.el.zone.style.opacity = 1;
      clearTimeout(this.zoneTimer);
      this.zoneTimer = setTimeout(() => (this.el.zone.style.opacity = 0), 3500);
    }

    // boss bar
    const boss = g.monsters.find((m) => m.boss && !m.dead && m.aggro);
    this.el.boss.classList.toggle('on', !!boss);
    if (boss) {
      this.el.boss.querySelector('.bn').textContent = `${boss.def.name} · Lv.${boss.level}${boss.enraged ? ' · คลั่ง' : ''}`;
      this.el.boss.querySelector('.fill').style.width = pct(boss.hp, boss.maxHp);
      this.el.boss.querySelector('span').textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    }

    // interaction prompt
    const near = g.nearby();
    const prompt = near.workbench ? 'workbench' : near.trainer ? 'trainer' : null;
    if (prompt !== this.lastPrompt) {
      this.lastPrompt = prompt;
      this.el.prompt.innerHTML = '';
      this.el.prompt.classList.toggle('on', !!prompt);
      if (prompt) {
        const b = h(`<button class="pbtn">${prompt === 'workbench' ? '🔨 ใช้โต๊ะคราฟต์ (E)' : '📜 คุยกับครูฝึก · รีสเตต (E)'}</button>`);
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
      f.el.style.left = '0px';
      f.el.style.top = '0px';
      f.el.style.opacity = f.t > 0.7 ? 1 - (f.t - 0.7) / 0.5 : 1;
      if (f.t > 1.2) f.el.remove();
      else keep.push(f);
    }
    this.floats = keep;

    // monster name + hp bars (damaged, aggro or targeted; never the boss)
    const seen = new Set();
    for (const m of g.monsters) {
      if (m.dead || m.boss) continue;
      const show = m.id === p.targetId || m.hp < m.maxHp || m.aggro;
      if (!show) continue;
      const d2 = (m.x - p.x) ** 2 + (m.z - p.z) ** 2;
      if (d2 > 30 * 30) continue;
      seen.add(m.id);
      let b = this.mbars.get(m.id);
      if (!b) {
        b = h(`<div class="mbar passive"><div class="mn"></div><div class="bar"><i class="fill"></i></div></div>`);
        b.querySelector('.mn').innerHTML = `<em>Lv.${m.level}</em> ${m.def.nameTh}`;
        this.el.floats.appendChild(b);
        this.mbars.set(m.id, b);
      }
      const s = this.view.project(m.x, (m.def.hover || 0) + (m.type === 'marsh_wisp' ? 1.2 : m.type === 'moss_beetle' ? 1.35 : 1.55), m.z);
      b.style.left = `${s.x}px`;
      b.style.top = `${s.y}px`;
      b.querySelector('.fill').style.width = pct(m.hp, m.maxHp);
      b.classList.toggle('target', m.id === p.targetId);
    }
    for (const [id, b] of this.mbars) {
      if (!seen.has(id)) {
        b.remove();
        this.mbars.delete(id);
      }
    }

    this.miniT = (this.miniT || 0) + dt;
    if (this.miniT > 0.1) {
      this.miniT = 0;
      this.drawMinimap();
    }
  }
}
