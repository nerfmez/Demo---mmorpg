// The opening: the new character lies unconscious on Arrival Beach, wakes beside the wreck, takes one
// of three weapons (it brings its basic attack), then one starter skill and one movement skill.
// Rules live in core/character.js (completeOpening); this only asks and shows.
import './opening.css';
import { art } from './art.js';
import { completeOpening, openingSkillChoices, wakeOpening } from '../core/character.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Opening {
  /** @param {{hud:object, input:object, save:Function, refresh:Function}} hooks */
  constructor(root, game, view, hooks) {
    this.game = game;
    this.data = game.data;
    this.view = view;
    this.hooks = hooks;
    this.pick = { kit: null, skill: null, movement: null };
    this.root = root;
    this.el = document.createElement('div');
    this.el.className = 'opening-layer';
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  /** @returns {boolean} true when the opening is running */
  begin() {
    const stage = this.game.ch.opening?.stage;
    if (!stage || stage === 'done') return false;
    this.root.appendChild(this.el); // only while the opening runs: an idle layer would swallow taps
    this.hooks.input.disabled = true;
    this.hooks.input.reset?.();
    const spawn = this.data.world.playerSpawn;
    const wreck = this.data.world.wreck;
    const p = this.game.player;
    // wake facing the wreck
    if (wreck) p.facing = Math.atan2(wreck.at[0] - spawn[0], wreck.at[1] - spawn[1]);
    const saved = this.game.ch.opening;
    this.pick = { kit: saved.kit || null, skill: saved.skill || null, movement: saved.movement || null };
    if (stage === 'wake') this.showWake();
    else if (stage === 'skills' && this.data.progression.start.opening.weapons.includes(this.pick.kit)) this.showSkills();
    else this.showWeapons();
    return true;
  }

  showWake() {
    this.el.className = 'opening-layer wake';
    this.el.innerHTML = `<div class="opening-dark"></div>
      <div class="opening-line"><p>เสียงคลื่นดังอยู่ไกลๆ… กลิ่นเกลือ… และไม้ที่ไหม้เกรียม</p><p class="dim">หัวหนักอึ้ง ร่างกายไม่มีแรง จำอะไรไม่ได้นอกจากเรือที่โคลงเคลงในพายุ</p>
      <button class="obtn primary" data-act="wake">ลืมตาขึ้น</button></div>`;
  }

  wake() {
    if (!wakeOpening(this.game.ch).ok) return;
    this.hooks.save();
    this.view.heroDownTarget = 0; // sits up and stands over a second or two
    this.el.classList.add('waking');
    // the weapons are offered once the hero is on their feet (or after a few seconds on a slow device)
    const t0 = performance.now();
    this.timer = setInterval(() => {
      if (this.view.heroDown > 0.06 && performance.now() - t0 < 4500) return;
      clearInterval(this.timer);
      this.showWeapons();
    }, 100);
  }

  card(id, kind, title, sub, body, on, attrs) {
    return `<button class="ocard ${on ? 'on' : ''}" ${attrs}>${art(kind, id)}<span class="txt"><b>${esc(title)}</b>${sub ? `<em>${esc(sub)}</em>` : ''}<small>${esc(body)}</small></span></button>`;
  }

  showWeapons() {
    const { data } = this, kits = data.progression.start.kits, sk = data.skills.combat;
    this.step = 'weapon';
    this.remember('weapon');
    this.el.className = 'opening-layer sheet';
    this.el.innerHTML = `<div class="osheet">
      <h2>ซากเรือที่เกยหาด</h2>
      <p class="odesc">ของที่ยังพอใช้ได้เหลือแค่อาวุธสามชิ้นปักอยู่บนทราย เลือกหนึ่งอย่างเพื่อเริ่มต้น <span>(เปลี่ยนอาวุธทีหลังได้เสมอ)</span></p>
      <div class="ocards">${data.progression.start.opening.weapons.map((id) => {
        const k = kits[id], b = sk[k.basic];
        return this.card(k.weapon, 'gear', k.nameTh, `ติดมากับท่าตีพื้นฐาน: ${b.nameTh}`, k.descTh, this.pick.kit === id, `data-act="kit" data-kit="${id}"`);
      }).join('')}</div>
      <div class="orow"><button class="obtn primary" data-act="to-skills" ${this.pick.kit ? '' : 'disabled'}>ต่อไป ▶</button></div></div>`;
    for (const [id, o] of Object.entries(this.view.weaponProps || {})) o.scale.setScalar(this.pick.kit === id ? 1.18 : 1);
  }

  showSkills() {
    const { data } = this, sk = data.skills.combat, mv = data.skills.movement, kit = data.progression.start.kits[this.pick.kit];
    this.step = 'skills';
    this.remember('skills');
    const pool = openingSkillChoices(data, this.pick.kit);
    this.el.className = 'opening-layer sheet';
    this.el.innerHTML = `<div class="osheet">
      <h2>วิชาที่ติดตัวมา</h2>
      <p class="odesc">${esc(sk[kit.basic].nameTh)} มากับ${esc(kit.nameTh)}แล้ว เลือกเพิ่ม <b>สกิล 1 อย่าง</b> และ <b>สกิลเคลื่อนที่ 1 อย่าง</b> <span>ลูกไฟและโล่เวทไม่ได้ติดตัวมา แต่ได้จากภารกิจริมหาดหรือสร้างที่โต๊ะคราฟต์ สกิลอื่นสร้างที่โต๊ะคราฟต์ได้ทั้งหมด</span></p>
      <h3>สกิล</h3><div class="ocards small">${pool.map((id) => this.card(id, 'skill', sk[id].nameTh, '', sk[id].desc, this.pick.skill === id, `data-act="skill" data-id="${id}"`)).join('')}</div>
      <h3>สกิลเคลื่อนที่</h3><div class="ocards small">${data.progression.start.opening.movementPool.map((id) => this.card(id, 'skill', mv[id].nameTh, '', mv[id].desc, this.pick.movement === id, `data-act="move" data-id="${id}"`)).join('')}</div>
      <div class="orow"><button class="obtn" data-act="back">◀ กลับ</button><button class="obtn primary" data-act="finish" ${this.pick.skill && this.pick.movement ? '' : 'disabled'}>ออกเดินทาง ▶</button></div></div>`;
  }

  finish() {
    const r = completeOpening(this.game.ch, this.data, { kit: this.pick.kit, skill: this.pick.skill, movement: this.pick.movement });
    if (!r.ok) return;
    this.game.refresh();
    this.view.placeWreck(this.game); // the weapon stakes go away
    this.hooks.input.disabled = false;
    this.el.remove();
    this.hooks.save();
    this.hooks.refresh?.();
    this.hooks.hud.banner('เริ่มผจญภัย', 'ล่าสไลม์ริมหาดเพื่อรับสกิลลูกไฟ แล้วตามดาวทองบนแผนที่ไปยังเมืองท่า', 'long');
  }

  remember(stage) {
    this.game.ch.opening = { stage, ...this.pick };
    this.hooks.save();
  }

  onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    switch (t.dataset.act) {
      case 'wake': return this.wake();
      case 'kit':
        if (this.pick.kit !== t.dataset.kit) this.pick.skill = null; // the pool depends on the weapon
        this.pick.kit = t.dataset.kit;
        return this.showWeapons();
      case 'to-skills': return this.showSkills();
      case 'back': return this.showWeapons();
      case 'skill': this.pick.skill = t.dataset.id; return this.showSkills();
      case 'move': this.pick.movement = t.dataset.id; return this.showSkills();
      case 'finish': return this.finish();
    }
  }
}
