// Title screen, save slots and character creation (HTML over the live 3D world).
import { seekerBrand } from './fieldhud.js';
import { icon } from './icons.js';
import { art } from './art.js';
import { LOOK_OPTIONS, DEFAULT_LOOK } from '../render/hero.js';
import { IS_PREVIEW, listSlots, deleteSlot, exportCode, importCode, firstEmptySlot, lastSlot, loadSlot, writeSlot } from '../save.js';
import { createCharacter } from '../core/character.js';
import { characterMap } from '../core/maps.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const HAIR_NAMES = { messy: 'ยุ่งพลิ้ว', swept: 'ปัดข้าง', ponytail: 'หางม้า', short: 'สั้นเรียบ' };

function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h} ชม. ${m} นาที` : `${m} นาที`;
}

export class Menu {
  constructor(root, view, data, { onStart, onQuality, getQuality }) {
    this.root = root;
    this.view = view;
    this.data = data;
    this.onStart = onStart;
    this.onQuality = onQuality;
    this.getQuality = getQuality;
    this.el = document.createElement('div');
    this.el.className = 'menu-layer';
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => this.onInput(e));
  }

  hide() {
    this.el.innerHTML = '';
    this.el.classList.remove('on');
    this.view.hidePreview();
  }

  show(html, cls = '') {
    this.el.className = `menu-layer on ${cls}`;
    this.el.innerHTML = html;
  }

  showTitle() {
    this.view.mode = 'title';
    this.view.hidePreview();
    const last = lastSlot();
    const lastInfo = last ? listSlots()[last - 1] : null;
    this.show(`<div class="title-card">
      <div class="title-brand" role="img" aria-label="SEEKER">${seekerBrand()}</div>
      <div class="logo-sub">Demo · Anime MMORPG + Buildcraft</div>
      <div class="menu-buttons">
        ${lastInfo ? `<button class="mbtn primary" data-act="continue">▶ เล่นต่อ<small>${esc(lastInfo.name)} · Lv.${lastInfo.level}</small></button>` : ''}
        <button class="mbtn ${lastInfo ? '' : 'primary'}" data-act="new">✦ เริ่มการผจญภัยใหม่</button>
        <button class="mbtn" data-act="slots">☰ เลือกเซฟ</button>
        <button class="mbtn" data-act="settings">⚙ ตั้งค่ากราฟิก</button>
      </div>
      <div class="title-foot">${IS_PREVIEW?'ทดลองสมดุล · ใช้เซฟทดลอง 3 ช่อง · นำเข้าโค้ดเซฟหลักเพื่อทดลองได้':'เซฟอัตโนมัติในเบราว์เซอร์นี้ · 3 ช่องเซฟ'}</div>
    </div>`, 'title');
  }

  showSettings() {
    const q = this.getQuality();
    this.show(`<div class="menu-card">
      <h2>ตั้งค่ากราฟิก</h2>
      <div class="switch">${['low', 'medium', 'high'].map((k) => `<button class="btn ${q === k ? 'on' : ''}" data-act="quality" data-q="${k}">${{ low: 'ต่ำ (ลื่นสุด)', medium: 'กลาง', high: 'สูง' }[k]}</button>`).join('')}</div>
      <p class="muted">ถ้า iPad กระตุก ให้เลือก "ต่ำ" (ปิดเงา ลดความละเอียด)</p>
      <button class="mbtn" data-act="title">← กลับ</button></div>`);
  }

  showSlots(mode = 'load') {
    this.mode = mode;
    const slots = listSlots();
    const cards = slots
      .map((s) => {
        if (!s.exists)
          return `<div class="slot-card empty"><div class="slot-n">ช่อง ${s.slot}</div><div class="muted">ว่าง</div>
            <button class="btn primary" data-act="create" data-slot="${s.slot}">สร้างตัวละคร</button></div>`;
        const kit = this.data.progression.start.kits[s.kit];
        return `<div class="slot-card"><div class="slot-n">ช่อง ${s.slot}</div>
          <div class="slot-name">${esc(s.name)}</div>
          <div class="muted">Lv.${s.level} · Job ${s.jobLevel} · ${kit ? kit.nameTh : ''} · ${esc(this.data.maps[characterMap(this.data, s)].nameTh)}</div>
          <div class="muted">เล่นไป ${fmtTime(s.playTime)} · สำรวจ ${s.zones}/${this.data.maps[characterMap(this.data, s)].zones.length} พื้นที่${s.bosses ? ` · ปราบบอส ${s.bosses} ตัว` : ''}${s.bossKills ? ' ★' : ''}</div>
          <div class="muted">บันทึกล่าสุด ${s.savedAt ? new Date(s.savedAt).toLocaleString('th-TH') : '-'}</div>
          <div class="row-btns">
            <button class="btn primary" data-act="load" data-slot="${s.slot}">เล่น</button>
            ${mode === 'new' ? `<button class="btn" data-act="create" data-slot="${s.slot}">เขียนทับ</button>` : ''}
            <button class="btn" data-act="export" data-slot="${s.slot}">โค้ดเซฟ</button>
            <button class="btn danger" data-act="delete" data-slot="${s.slot}">ลบ</button>
          </div></div>`;
      })
      .join('');
    this.show(`<div class="menu-card wide scrolly">
      <h2>${mode === 'new' ? 'เลือกช่องสำหรับตัวละครใหม่' : 'เลือกเซฟ'}</h2>
      <div class="slot-grid">${cards}</div>
      <details class="import"><summary>นำเข้าโค้ดเซฟ (ย้ายเซฟจากอุปกรณ์อื่น)</summary>
        <textarea id="importCode" placeholder="วางโค้ดเซฟที่นี่"></textarea>
        <div class="row-btns">${[1, 2, 3].map((n) => `<button class="btn" data-act="import" data-slot="${n}">นำเข้าช่อง ${n}</button>`).join('')}</div>
      </details>
      <div id="menuMsg" class="muted"></div>
      <button class="mbtn" data-act="title">← กลับ</button></div>`);
  }

  showCreate(slot) {
    this.slot = slot;
    const kits = this.data.progression.start.kits;
    this.look = { ...DEFAULT_LOOK };
    this.kit = this.data.progression.start.defaultKit;
    this.name = '';
    this.view.mode = 'create';
    this.refreshPreview();
    const sw = (key) =>
      `<div class="swatches">${LOOK_OPTIONS[key].map((c) => `<button class="sw ${this.look[key] === c ? 'on' : ''}" style="background:${c}" data-act="look" data-key="${key}" data-val="${c}" aria-label="${c}"></button>`).join('')}</div>`;
    this.show(`<div class="create-panel scrolly">
      <h2>สร้างตัวละคร <small>ช่อง ${slot}</small></h2>
      <label class="field">ชื่อ<input id="heroName" maxlength="14" placeholder="นักเดินทาง" value="${esc(this.name)}" autocomplete="off"></label>
      <div class="field">แนวเริ่มต้น <span class="muted">(เปลี่ยนสกิลและอาวุธทีหลังได้ทั้งหมด · ยังไม่ต้องเลือก Job)</span>
        <div class="kits">${Object.entries(kits)
          .map(([id, k]) => `<button class="kit ${this.kit === id ? 'on' : ''}" data-act="kit" data-kit="${id}">${art('gear',k.weapon)}<b>${k.nameTh}</b><small>${esc(k.descTh)}</small></button>`)
          .join('')}</div></div>
      <div class="field">ทรงผม<div class="switch">${LOOK_OPTIONS.hairStyle.map((h) => `<button class="btn ${this.look.hairStyle === h ? 'on' : ''}" data-act="look" data-key="hairStyle" data-val="${h}">${HAIR_NAMES[h]}</button>`).join('')}</div></div>
      <div class="field">สีผม${sw('hair')}</div>
      <div class="field">สีผิว${sw('skin')}</div>
      <div class="field">สีตา${sw('eyes')}</div>
      <div class="field">ผ้าพันคอ${sw('scarf')}</div>
      <div class="field">เสื้อ${sw('tunic')}</div>
      <div class="row-btns sticky">
        <button class="btn" data-act="random">🎲 สุ่ม</button>
        <button class="btn" data-act="slots-back">← กลับ</button>
        <button class="btn primary big" data-act="start">เริ่มผจญภัย ▶</button>
      </div></div>`, 'create');
  }

  refreshPreview() {
    const kit = this.data.progression.start.kits[this.kit];
    const weapon = this.data.items.gearBases[kit.weapon]?.weaponType || 'sword';
    this.view.showPreview(this.look, { weapon, bases: { weapon: kit.weapon } });
  }

  rerenderCreate() {
    const name = this.el.querySelector('#heroName')?.value || '';
    const scroll = this.el.querySelector('.create-panel')?.scrollTop || 0;
    const slot = this.slot;
    const look = this.look;
    const kit = this.kit;
    this.showCreate(slot);
    this.look = look;
    this.kit = kit;
    this.name = name;
    // re-apply state to the freshly drawn controls
    this.el.querySelector('#heroName').value = name;
    this.el.querySelectorAll('[data-act="look"]').forEach((b) => b.classList.toggle('on', this.look[b.dataset.key] === b.dataset.val));
    this.el.querySelectorAll('[data-act="kit"]').forEach((b) => b.classList.toggle('on', b.dataset.kit === this.kit));
    this.el.querySelector('.create-panel').scrollTop = scroll;
    this.refreshPreview();
  }

  onInput(e) {
    if (e.target.id === 'heroName') this.name = e.target.value;
  }

  onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const slot = Number(t.dataset.slot);
    const msg = (text) => {
      const m = this.el.querySelector('#menuMsg');
      if (m) m.textContent = text;
    };
    switch (act) {
      case 'continue': {
        const n = lastSlot();
        if (n) this.startFromSlot(n);
        return;
      }
      case 'new': {
        const n = firstEmptySlot();
        if (n) this.showCreate(n);
        else this.showSlots('new');
        return;
      }
      case 'slots':
        return this.showSlots('load');
      case 'settings':
        return this.showSettings();
      case 'quality':
        this.onQuality(t.dataset.q);
        return this.showSettings();
      case 'title':
        return this.showTitle();
      case 'create':
        if (loadSlot(slot) && !confirm(`เขียนทับเซฟช่อง ${slot}?`)) return;
        return this.showCreate(slot);
      case 'load':
        return this.startFromSlot(slot);
      case 'delete':
        if (confirm(`ลบเซฟช่อง ${slot} ถาวร?`)) {
          deleteSlot(slot);
          this.showSlots(this.mode);
        }
        return;
      case 'export': {
        const code = exportCode(slot);
        const ta = this.el.querySelector('#importCode');
        if (ta) {
          ta.value = code;
          ta.parentElement.open = true;
          ta.select();
        }
        navigator.clipboard?.writeText(code).then(
          () => msg('คัดลอกโค้ดเซฟแล้ว เก็บไว้ในโน้ตได้'),
          () => msg('เลือกข้อความโค้ดด้านบนแล้วคัดลอกเอง')
        );
        return;
      }
      case 'import': {
        const code = this.el.querySelector('#importCode')?.value || '';
        if (loadSlot(slot) && !confirm(`เขียนทับเซฟช่อง ${slot}?`)) return;
        if (importCode(code, slot)) this.showSlots(this.mode);
        else msg('โค้ดไม่ถูกต้อง');
        return;
      }
      case 'kit':
        this.kit = t.dataset.kit;
        return this.rerenderCreate();
      case 'look':
        this.look[t.dataset.key] = t.dataset.val;
        return this.rerenderCreate();
      case 'random':
        for (const k of Object.keys(LOOK_OPTIONS)) this.look[k] = LOOK_OPTIONS[k][Math.floor(Math.random() * LOOK_OPTIONS[k].length)];
        return this.rerenderCreate();
      case 'slots-back':
        return this.showTitle();
      case 'start': {
        const name = (this.el.querySelector('#heroName')?.value || '').trim().slice(0, 14) || 'นักเดินทาง';
        const ch = createCharacter(this.data, { kit: this.kit, name, appearance: { ...this.look } });
        writeSlot(this.slot, ch);
        this.hide();
        this.onStart(ch, this.slot, true);
        return;
      }
    }
  }

  startFromSlot(n) {
    const s = loadSlot(n);
    if (!s) return;
    this.hide();
    this.onStart(s.character, n, false);
  }
}

