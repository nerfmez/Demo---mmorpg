// Skill FX test bench (fx-test.html): Slash (new look), Firebolt (the game's renderer), Chain Spark,
// Frost Nova, Flame Stream and Venom Shot (a rule trial of Venom Mire) prototype effects driven by the real combat rules, with real skill mods
// and the prototype skill fusion (data/fusion.json). Separate from the game and the Skill Lab;
// nothing is saved. Tap the floor to aim, hold the cast button to channel Flame Stream.
import * as THREE from 'three';
import { data as gameData } from '../data.js';
import { buildHumanoid, HumanoidAnimator, DEFAULT_LOOK } from '../render/hero.js';
import { loadModels } from '../render/models.js';
import { ACTIONS } from '../render/actions.js';
import MODELS from '../../data/models.json';
import STAFF_CAST from '../../data/staff-cast.json';
import HOLDS from '../../data/weapon-holds.json';
import FUSION from '../../data/fusion.json';
import { Vfx } from '../render/vfx.js';
import { disposeObject } from '../render/dispose.js';
import { createBench, benchMods, BENCH_SKILLS, BENCH_WEAPON, LAYOUTS } from './sandbox.js';
import { fusionPayloads, fusionRecipe } from './fusion.js';
import { FlameSlashFx } from './flame-slash-fx.js';
import { mulberry32 } from '../render/skillfx/fx-common.js';
import { OCCLUDER_LAYER } from '../render/skillfx/flame-fx.js';
import { SkillFx, OWN_PROJECTILES, ELEMENT_COLOR } from '../render/skill-fx.js';

const data = gameData;

const params = new URLSearchParams(location.search);
const state = {
  skill: BENCH_SKILLS.includes(params.get('skill')) ? params.get('skill') : 'slash',
  mods: [], // [{id, level}]
  fusion: null, // linked payload skill id
  speed: 1,
  cam: params.get('cam') === 'game' ? 'game' : 'close',
  auto: false,
  holding: false,
};
const MAX_MODS = data.mods.maxModsPerSkill || 2;
const ELEMENT_TH = { fire: 'ไฟ', cold: 'น้ำแข็ง', lightning: 'สายฟ้า', physical: 'กายภาพ', poison: 'พิษ', arcane: 'เวท' };
const VIEW = { slash: { cx: 4.4, cz: 0.6, w: 13.5, d: 6 }, firebolt: { cx: 5.6, cz: 0, w: 14, d: 6 }, chain_spark: { cx: 5.6, cz: 0.4, w: 16, d: 7 }, frost_nova: { cx: 0.8, cz: 0, w: 12.5, d: 9 }, flame_stream: { cx: 2.8, cz: 0.6, w: 8, d: 5.5 }, venom_mire: { cx: 5.4, cz: 0, w: 14, d: 6.5 }, arrow_rain: { cx: 4.2, cz: 0.6, w: 13, d: 8 }, charged_shot: { cx: 7.5, cz: 0, w: 18, d: 7 }, frontline_split: { cx: 2.4, cz: 0, w: 9, d: 6 }, armor_cleave: { cx: 1.6, cz: 0.4, w: 7.5, d: 5.5 }, interrupt_slam: { cx: 1.4, cz: 0.6, w: 7, d: 5.5 }, weakpoint: { cx: 1.8, cz: 0, w: 7, d: 6.5 }, shield_bash: { cx: 2.0, cz: 0.3, w: 7.5, d: 6 }, riposte: { cx: 1.4, cz: 0.4, w: 7, d: 6 } };

// ---------- renderer / scene ----------
const stage = document.getElementById('stage');
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fc6d8');
scene.fog = new THREE.Fog('#9fc6d8', 26, 48);
const camera = new THREE.PerspectiveCamera(36, 1, 0.3, 120);
// 'game' = the game's 3/4 camera; 'close' = the lower angle the effects were first reviewed at
const CAM_DIRS = { game: new THREE.Vector3(0, 19, 13.5).normalize(), close: new THREE.Vector3(0, 7.4, 8.6).normalize() };
scene.add(new THREE.HemisphereLight('#dce9ff', '#4a6040', 1.1));
const sun = new THREE.DirectionalLight('#fff0dc', 1.8);
sun.position.set(-4, 10, 6);
scene.add(sun);

// painted grass floor
{
  const gc = document.createElement('canvas'); gc.width = gc.height = 512;
  const g2 = gc.getContext('2d'), gr = mulberry32(3);
  g2.fillStyle = '#5f9c48'; g2.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    g2.fillStyle = gr() < 0.5 ? 'rgba(74,132,58,0.5)' : 'rgba(120,176,84,0.35)';
    g2.beginPath(); g2.ellipse(gr() * 512, gr() * 512, 6 + gr() * 26, 4 + gr() * 14, gr() * 3, 0, 7); g2.fill();
  }
  const tex = new THREE.CanvasTexture(gc); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshToonMaterial({ color: '#ffffff', map: tex }));
  floor.rotation.x = -Math.PI / 2; floor.name = 'floor'; scene.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0x000000, 0x000000);
  grid.material.transparent = true; grid.material.opacity = 0.06; grid.position.y = 0.01; scene.add(grid);
}
const ramp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
const toon = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: ramp });

// ---------- training dummies (layer 1 = fire occluders) ----------
const dummyGeo = {
  post: new THREE.CylinderGeometry(0.07, 0.09, 0.7, 8), body: new THREE.CylinderGeometry(0.3, 0.34, 0.8, 14),
  band: new THREE.CylinderGeometry(0.315, 0.335, 0.12, 14), head: new THREE.SphereGeometry(0.24, 14, 10), arm: new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8),
};
const outlineMat = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide });
const ICY = new THREE.Color('#bfe6ff'), CHAR = new THREE.Color('#5a3a2a'), TOXIC = new THREE.Color('#a5d870');
function makeDummy() {
  const g = new THREE.Group(), mats = [];
  const part = (geo, color, line, y, s = 1.06, extra) => {
    const m = new THREE.Mesh(geo, toon(color)); m.position.y = y;
    const o = new THREE.Mesh(geo, outlineMat(line)); o.scale.setScalar(s); m.add(o);
    if (extra) extra(m);
    g.add(m); return m;
  };
  part(dummyGeo.post, '#6e4a2c', '#33200f', 0.35, 1.15);
  mats.push(part(dummyGeo.body, '#d9b56a', '#6d5225', 1.05).material);
  const band = new THREE.Mesh(dummyGeo.band, toon('#b0403a')); band.position.y = 1.0; g.add(band);
  mats.push(part(dummyGeo.head, '#e2c47e', '#6d5225', 1.66).material);
  part(dummyGeo.arm, '#6e4a2c', '#33200f', 1.25, 1.15, (m) => { m.rotation.z = Math.PI / 2; });
  g.traverse((o) => o.isMesh && o.layers.enable(OCCLUDER_LAYER));
  scene.add(g);
  return { g, mats, orig: mats.map((m) => m.color.clone()), pop: 0, popColor: new THREE.Color(), shake: 0, x: 0, z: 0, center: new THREE.Vector3() };
}
const dummies = Array.from({ length: 6 }, makeDummy);

// ---------- hero ----------
let hero = null, heroAnim = null, heroWeapon = 'staff', heroOffhand = null;
function buildHero(weapon = heroWeapon, offhand = heroOffhand) {
  heroWeapon = weapon; heroOffhand = offhand;
  const action = heroAnim?.action || null;
  if (hero) disposeObject(hero.root); // frees the old rig's geometry, materials and skeleton
  hero = buildHumanoid(DEFAULT_LOOK, { weapon, armor: 'tunic', helm: null, offhand, bases: {} });
  heroAnim = new HumanoidAnimator(hero);
  heroAnim.action = action;
  scene.add(hero.root);
}
buildHero();
// the game's hero: the chibi body and its hair (hero_base stays as the fallback rig)
const { hero_base, hero_chibi, hero_chibi_hair, hero_chibi_hair_back } = MODELS.characters;
loadModels({ characters: { hero_base, hero_chibi, hero_chibi_hair, hero_chibi_hair_back }, weapons: MODELS.weapons }, { onWeaponReady: () => buildHero() }).then(() => buildHero()).catch(() => {});
const tip = new THREE.Vector3();
function staffTip() {
  const w = hero.bones?.weapon;
  if (w) { w.updateWorldMatrix(true, false); return w.localToWorld(tip.set(0, 0, STAFF_CAST.tip)); }
  const p = game.player;
  return tip.set(p.x + Math.sin(p.facing) * 0.5, 1.6, p.z + Math.cos(p.facing) * 0.5);
}

// aim marker: a thin arrow on the floor
const aimMark = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }));
aimMark.rotation.x = -Math.PI / 2; aimMark.position.y = 0.025; scene.add(aimMark);

// ---------- effects ----------
// a short camera shake for heavy hits (cosmetic; the bench camera is otherwise fixed)
const camBase = new THREE.Vector3();
let shakeT = 0, shakeDur = 1, shakeAmp = 0;
const shake = (amp, time) => { if (amp >= shakeAmp * (shakeT / shakeDur)) { shakeAmp = amp; shakeT = shakeDur = time; } };
const flameSlash = new FlameSlashFx(scene, camera);
// the game's own renderer for Firebolt / Arcane Bolt casts, projectiles and impacts
const vfx = new Vfx(scene, { surfaceY: () => 0, groundY: () => 0 });
// the skill effects, driven by the same director as the game (src/render/skill-fx.js)
const fx = new SkillFx({
  scene, camera, renderer, vfx,
  game: () => game, anim: () => heroAnim, rig: () => hero, weapon: () => heroWeapon,
  body: (id) => { const d = dummyOf(id); return d ? { x: d.x, z: d.z, h: 2.0 } : null; },
  float: (x, y, z, text, color, big) => floatNumber(x, y, z, text, color, big),
  banner: (text) => showBanner(text), shake,
  showMarks: () => (state.skill === 'weakpoint' ? game.monsters : []),
});

// ---------- the bench (real rules) ----------
let game = null, aimAngle = Math.PI / 2, simTime = 0;
// projectile kinds the old renderer skips (drawn by the effects); a fused skill's wave too
const skipSets = new Map();
const benchSkip = (k) => skipSets.get(k) || skipSets.set(k, new Set([k, ...OWN_PROJECTILES])).get(k);
const stats = { casts: 0, hits: 0, total: 0, byElement: {}, last: null };
function rebuild() {
  if (state.fusion && !fusionPayloads(data, FUSION, state.skill).includes(state.fusion)) state.fusion = null;
  game = createBench(data, state.skill, state.mods, { fusion: state.fusion, fusionRules: FUSION });
  game.aimAt(aimAngle);
  const off = data.skills.combat[state.skill]?.requiresOffhand || state.offhand || null; // Shield Bash holds a shield; setOffhand a second weapon
  if (BENCH_WEAPON[state.skill] !== heroWeapon || off !== heroOffhand) buildHero(BENCH_WEAPON[state.skill], off);
  clearFx();
  heroAnim.action = null;
  state.holding = false;
  const spots = LAYOUTS[state.skill];
  dummies.forEach((d, i) => { d.g.visible = i < spots.length; if (spots[i]) [d.x, d.z] = spots[i]; d.mats.forEach((m, k) => m.color.copy(d.orig[k])); });
  Object.assign(stats, { casts: 0, hits: 0, total: 0, byElement: {}, last: null });
  lastHp = game.player.hp;
  bannerT = 0; document.getElementById('banner').style.opacity = 0;
  for (const n of numbers) n.t = 9;
  layout();
  renderPanel();
}
const skillDef = () => game.skills[0];
function clearFx() {
  fx.clear(); flameSlash.clear();
  vfx.endCast(); vfx.clearFireballs?.();
  for (const v of vfx.projectiles.values()) disposeObject(v, vfx.sharedGeo);
  vfx.projectiles.clear();
}
const dummyOf = (id) => { const i = game.monsters.findIndex((m) => m.id === id); return i >= 0 ? dummies[i] : null; };

function aimPoint() { const p = game.player; return { x: p.x + Math.sin(aimAngle) * 5, z: p.z + Math.cos(aimAngle) * 5 }; }
function castDown() {
  if (!game) return;
  const s = skillDef();
  game.aimAt(aimAngle);
  if (!game.castSlot(0, aimPoint())) return; // still cooling down
  stats.casts++;
  stats.last = { hits: 0, total: 0 };
  if (s.kind === 'channel_cone' || s.charge) state.holding = true;
  drain();
}
function castUp() {
  if (!state.holding) return;
  state.holding = false;
  const c = game.player.charging;
  if (c) game.releaseCharge(0, aimPoint()); // a charged shot looses at its charge (castStart carries it)
  else game.cancelChannel();
  drain();
}
function dodge() { if (!game) return; game.aimAt(aimAngle); stats.last = { hits: 0, total: 0 }; game.useMovement(); drain(); }
function resetBench() {
  game.cancelChannel(); state.holding = false;
  game.resetDummies(); Object.assign(game.player, { x: 0, z: 0 });
  clearFx();
  Object.assign(stats, { casts: 0, hits: 0, total: 0, byElement: {}, last: null });
  renderStats();
}

// ---------- floating numbers ----------
const numLayer = document.getElementById('numbers');
const numbers = [];
const NUM_POOL = Array.from({ length: 48 }, () => { const el = document.createElement('div'); el.className = 'num'; el.style.display = 'none'; numLayer.append(el); return el; });
let numI = 0;
function floatNumber(x, y, z, text, color, big) {
  const el = NUM_POOL[numI++ % NUM_POOL.length];
  el.textContent = text; el.style.color = color; el.style.display = ''; el.classList.toggle('big', !!big);
  const n = numbers.find((q) => q.el === el) || (numbers.push({ el }), numbers[numbers.length - 1]);
  Object.assign(n, { x: x + (Math.random() - 0.5) * 0.5, y, z, t: 0 });
}
let lastHp = 0, banner = null, bannerT = 0;
function showBanner(text) { banner = text; bannerT = 1.2; const b = document.getElementById('banner'); b.textContent = text; b.style.opacity = 1; }

// ---------- core events -> effects ----------
function drain() {
  for (const e of game.drainEvents()) {
    // bench-only: the Riposte attacker's wind-up (the game's monsters telegraph their own)
    if (e.type === 'benchWindup') { fx.mace.windup(e.id, e.total); continue; }
    if (e.type === 'benchWindupEnd') { fx.mace.windupEnd(e.id); continue; }
    if (e.type === 'fusionCharge') {
      // the charge stance: the swing's wind-up stretched over the charge, the cut landing at its end
      heroAnim.play(e.skill, e.total + 0.3, heroWeapon, fx.nextSwingStep(), e.total, 'melee_arc');
      flameSlash.beginCharge(e.total, game.fusion?.waveElement); // its own look: no Slash crescent, no Firebolt charge
      fx.primarySwing = true;
      continue;
    }
    if (e.type === 'fusionRelease') { flameSlash.release(); continue; }
    if (e.type === 'fusionCancel') { flameSlash.cancel(); heroAnim.action = null; continue; }
    if (e.type === 'trigger') showBanner('ร่ายเมื่อหลบ!');
    if (e.type === 'fusion') fx.mod.burst({ x: e.x, z: e.z, radius: 0.7, element: e.element });
    // a fused skill (bench prototype) keeps the old look on its own events
    if (skillDef().recipe && e.type === 'impact' && e.kind === skillDef().recipe.id) {
      if (e.element === 'cold') fx.frost.chipBurst(e.x, 1.0, e.z, 8, 2.5, 3, 0.8); else if (e.element === 'fire') fx.fire.impact(e.x, 1.0, e.z, true); else vfx.impact(e);
      continue;
    }
    const drawn = fx.event(e);
    if (e.type === 'impact' && !drawn) vfx.impact(e);
    if (e.type === 'hit') {
      const d = dummyOf(e.id); if (!d) continue;
      const el = e.element || 'physical';
      d.pop = 1; d.popColor.set(ELEMENT_COLOR[el] || '#ffffff'); d.shake = 0.3;
      floatNumber(d.x, 2.1, d.z, Math.round(e.amount) + (e.crit ? '!' : ''), ELEMENT_COLOR[el] || '#fff', e.crit);
      stats.hits++; stats.total += e.amount; stats.byElement[el] = (stats.byElement[el] || 0) + e.amount;
      if (stats.last) { stats.last.hits++; stats.last.total += e.amount; }
    }
    if (e.type === 'stunned') showBanner('มึน!');
  }
}

// ---------- input: tap the floor to aim ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function aimFromPointer(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(floorPlane, hitP)) return;
  const p = game.player;
  if (Math.hypot(hitP.x - p.x, hitP.z - p.z) < 0.3) return;
  aimAngle = Math.atan2(hitP.x - p.x, hitP.z - p.z);
  game.aimAt(aimAngle);
}
let aiming = null;
canvas.addEventListener('pointerdown', (ev) => { aiming = ev.pointerId; aimFromPointer(ev); });
canvas.addEventListener('pointermove', (ev) => { if (aiming === ev.pointerId) aimFromPointer(ev); });
const endAim = (ev) => { if (aiming === ev.pointerId) aiming = null; };
canvas.addEventListener('pointerup', endAim); canvas.addEventListener('pointercancel', endAim);

// ---------- walk joystick: drag to walk (the rules' movement); the aim follows the walk ----------
const joy = document.getElementById('joy'), knob = document.getElementById('knob');
const lastPos = { x: 0, z: 0 }, camFollow = { x: 0, z: 0 };
let joyId = null;
function joyMove(ev) {
  const r = joy.getBoundingClientRect(), R = r.width / 2;
  let dx = ev.clientX - (r.left + R), dy = ev.clientY - (r.top + R);
  const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  // the bench camera looks toward -z: screen right is +x, screen down is +z
  const mx = dx / R, mz = dy / R;
  game.setMove(mx, mz);
  if (Math.hypot(mx, mz) > 0.25) { aimAngle = Math.atan2(mx, mz); game.aimAt(aimAngle); }
}
function joyEnd(ev) { if (ev.pointerId !== joyId) return; joyId = null; knob.style.transform = ''; game.setMove(0, 0); }
joy.addEventListener('pointerdown', (ev) => { ev.preventDefault(); joyId = ev.pointerId; try { joy.setPointerCapture(ev.pointerId); } catch {} joyMove(ev); });
joy.addEventListener('pointermove', (ev) => { if (ev.pointerId === joyId) joyMove(ev); });
joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd); joy.addEventListener('lostpointercapture', joyEnd);

// ---------- panel ----------
const panel = document.getElementById('panel');
const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
function renderPanel() {
  panel.textContent = '';
  const tabs = h('div', 'tabs');
  for (const id of BENCH_SKILLS) {
    const b = h('button', 'tab' + (id === state.skill ? ' on' : ''), data.skills.combat[id].nameTh);
    b.addEventListener('click', () => { if (id === state.skill) return; state.skill = id; state.mods = []; state.fusion = null; aimAngle = Math.PI / 2; rebuild(); });
    tabs.append(b);
  }
  panel.append(tabs);
  const s = skillDef(), def = data.skills.combat[state.skill];
  panel.append(h('p', 'desc', def.desc));

  const modBox = h('section', 'mods');
  modBox.append(h('h2', '', `ม็อด (ใส่ได้ ${MAX_MODS})`));
  const sockets = MAX_MODS - (state.fusion ? FUSION.socketsUsed : 0);
  const fits = new Set(benchMods(data, state.skill, state.mods));
  for (const id of benchMods(data, state.skill)) {
    const mod = data.mods.mods[id], sel = state.mods.find((m) => m.id === id);
    const row = h('div', 'mod' + (sel ? ' on' : ''));
    const chip = h('button', 'chip', (sel ? '✓ ' : '') + mod.nameTh);
    chip.disabled = !sel && (state.mods.length >= sockets || !fits.has(id));
    chip.addEventListener('click', () => {
      state.mods = sel ? state.mods.filter((m) => m.id !== id) : [...state.mods, { id, level: 1 }];
      rebuild();
    });
    row.append(chip);
    if (sel) {
      const lv = h('div', 'lv');
      for (const L of [1, 2, 3].slice(0, mod.maxLevel || 3)) {
        const b = h('button', L === sel.level ? 'on' : '', 'Lv' + L);
        b.addEventListener('click', () => { sel.level = L; rebuild(); });
        lv.append(b);
      }
      row.append(lv);
    }
    row.append(h('div', 'mdesc', mod.desc || ''));
    modBox.append(row);
  }
  panel.append(modBox);

  // prototype fusion: link one fast spell into a socket of a physical skill
  const payloads = fusionPayloads(data, FUSION, state.skill);
  if (payloads.length) {
    const fb = h('section', 'mods');
    fb.append(h('h2', '', 'ลิงก์สกิล (ฟิวชั่น · ใช้ช่องม็อด 1 ช่อง)'));
    for (const id of payloads) {
      const def2 = data.skills.combat[id], on = state.fusion === id, recipe = fusionRecipe(FUSION, state.skill, id);
      const row = h('div', 'mod' + (on ? ' on' : ''));
      const chip = h('button', 'chip', (on ? '✓ ' : '') + def2.nameTh + (recipe ? ` → ${recipe.nameTh}` : ''));
      chip.disabled = !on && state.mods.length >= MAX_MODS;
      chip.addEventListener('click', () => { state.fusion = on ? null : id; rebuild(); });
      row.append(chip, h('div', 'mdesc', recipe ? recipe.desc : `ฟันโดนแล้ว${def2.nameTh}ออกจากเป้าที่โดน พุ่งต่อไปข้างหน้า ความสามารถเต็ม ดาเมจ ${Math.round(FUSION.payloadDamageMult * 100)}% · คูลดาวน์ใช้ตัวที่นานกว่า · MP รวมกัน`));
      fb.append(row);
    }
    panel.append(fb);
  }

  // what the rules actually resolved for this slot (after mods)
  const facts = h('section', 'facts');
  facts.append(h('h2', '', 'ค่าจริงหลังใส่ม็อด'));
  const line = (k, v) => { const r = h('div', 'fact'); r.append(h('span', '', k), h('b', '', v)); facts.append(r); };
  line('ธาตุ', ELEMENT_TH[s.element] || s.element);
  line('คูลดาวน์', `${s.cooldown.toFixed(2)} วิ`);
  line('MP', `${s.cost}`);
  if (s.recipe) { line('สกิลฟิวชั่น', s.recipe.nameTh); line('ชาร์จ', `${s.recipe.chargeTime} วิ`); line('คลื่นไฟ', `${(game.fusion.payload.damage * s.recipe.wave.damageMult).toFixed(1)} · ${s.recipe.wave.range} ม. · ทะลุทุกตัว`); }
  else if (game.fusion) line('ลิงก์', `${game.fusion.payload.nameTh} ${(game.fusion.payload.damage * FUSION.payloadDamageMult).toFixed(1)} (${Math.round(FUSION.payloadDamageMult * 100)}%)`);
  if (s.kind === 'melee_arc') line('ระยะ / มุม', `${s.range} ม. × ${s.arc}°`);
  if (s.kind === 'projectile') line('ระยะ / ความเร็ว', `${s.range} ม. · ${s.speed} ม./วิ`);
  line('ดาเมจต่อครั้ง', s.kind === 'channel_cone' ? `${(s.damage * s.channel.tick).toFixed(1)} / ${s.channel.tick} วิ` : s.damage.toFixed(1));
  if (s.kind === 'chain') { line('เด้งต่อ', `${s.chain} ตัว (ระยะ ${s.chainRange} ม.)`); if (s.modEffects?.chainReturn) line('หวนคืน', `${Math.round(s.modEffects.chainReturn * 100)}%`); }
  if (s.kind === 'nova') line('รัศมี', `${s.radius.toFixed(2)} ม.`);
  if (s.kind === 'channel_cone') line('กรวย', `${s.range} ม. × ${s.arc}°`);
  if (s.chill) line('ทำให้ช้า', `${Math.round(s.chill.slow * 100)}% ${s.chill.duration} วิ`);
  if (s.echo) line('สะท้อนซ้ำ', `${Math.round(s.echo.mult * 100)}% หลัง ${s.echo.delay} วิ`);
  if (s.ground) line('ไฟบนพื้น', `${s.ground.radius} ม. ${s.ground.duration} วิ`);
  if (s.knock) line('กระเด็น', `${s.knock} ม.`);
  if (s.modEffects?.pull) line('ดึงเข้า', `${s.modEffects.pull} ม.`);
  if (s.modEffects?.shatter) line('ผลึกแตก', `${Math.round(s.modEffects.shatter * 100)}% (เป้าเย็น ≥${Math.round(s.modEffects.shatterThreshold * 100)}%)`);
  if (s.leech) line('ดูดเลือด', `${s.leech}%`);
  if (s.trigger) line('ร่ายเอง', `เมื่อหลบ · ${Math.round(s.trigger.damageMult * 100)}%`);
  panel.append(facts);

  const ctl = h('section', 'controls');
  const speed = h('div', 'seg');
  for (const v of [1, 0.5, 0.25]) {
    const b = h('button', v === state.speed ? 'on' : '', v === 1 ? 'ปกติ' : `ช้า ×${v}`);
    b.addEventListener('click', () => { state.speed = v; renderPanel(); });
    speed.append(b);
  }
  ctl.append(speed);
  const cams = h('div', 'seg');
  for (const [k, label] of [['close', 'กล้องใกล้'], ['game', 'กล้องเกม']]) {
    const b = h('button', k === state.cam ? 'on' : '', label);
    b.addEventListener('click', () => { state.cam = k; layout(); renderPanel(); });
    cams.append(b);
  }
  ctl.append(cams);
  const auto = h('button', 'toggle' + (state.auto ? ' on' : ''), state.auto ? 'ร่ายวนอัตโนมัติ: เปิด' : 'ร่ายวนอัตโนมัติ: ปิด');
  auto.addEventListener('click', () => { state.auto = !state.auto; autoT = 0; renderPanel(); });
  ctl.append(auto);
  const reset = h('button', 'toggle', 'รีเซ็ตหุ่น');
  reset.addEventListener('click', resetBench);
  ctl.append(reset);
  panel.append(ctl);
  panel.append(h('div', 'stats', ''));
  renderStats();

  const castLabel = document.getElementById('castLabel');
  castLabel.textContent = s.kind === 'channel_cone' ? 'กดค้าง' : s.recipe ? 'ชาร์จ' : 'ร่าย';
  document.getElementById('dodge').classList.toggle('hint', !!s.trigger);
}
function renderStats() {
  const el = panel.querySelector('.stats'); if (!el) return;
  const parts = Object.entries(stats.byElement).map(([k, v]) => `${ELEMENT_TH[k] || k} ${Math.round(v)}`).join(' · ');
  el.textContent = stats.casts || stats.hits ? `ร่าย ${stats.casts} ครั้ง · โดน ${stats.hits} ฮิต · รวม ${Math.round(stats.total)}${parts ? ` (${parts})` : ''}${stats.last ? ` · ล่าสุด ${stats.last.hits} ฮิต ${Math.round(stats.last.total)}` : ''}` : 'แตะพื้นเพื่อเล็ง แล้วกดร่าย';
}

const castBtn = document.getElementById('cast');
castBtn.addEventListener('pointerdown', (ev) => { ev.preventDefault(); castBtn.setPointerCapture?.(ev.pointerId); castDown(); });
castBtn.addEventListener('pointerup', castUp);
castBtn.addEventListener('pointercancel', castUp);
castBtn.addEventListener('lostpointercapture', castUp);
document.getElementById('dodge').addEventListener('pointerdown', (ev) => { ev.preventDefault(); dodge(); });

// ---------- layout ----------
function layout() {
  const w = stage.clientWidth, hgt = stage.clientHeight;
  renderer.setSize(w, hgt, false);
  camera.aspect = w / Math.max(1, hgt);
  const v = VIEW[state.skill], half = THREE.MathUtils.degToRad(camera.fov / 2);
  const close = state.cam === 'close';
  const dist = Math.max(v.w / (2 * Math.tan(half) * camera.aspect), v.d / (2 * Math.tan(half)) * (close ? 1.1 : 1.5), 7) * (close ? 0.92 : 1);
  camera.position.set(v.cx, 0, v.cz + (close ? 0.6 : 0)).addScaledVector(CAM_DIRS[state.cam], dist);
  camera.lookAt(v.cx, 0.6, v.cz);
  camBase.copy(camera.position);
  camera.updateProjectionMatrix();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  fx.resize(size.x, size.y, w, hgt);
  vfx.setPointScale(hgt * renderer.getPixelRatio());
}
window.addEventListener('resize', layout);
new ResizeObserver(layout).observe(stage);

// ---------- loop ----------
const clock = new THREE.Timer();
const proj = new THREE.Vector3(), tint = new THREE.Color(), mouth = new THREE.Vector3();
let autoT = 0, statT = 0;
function frame() {
  clock.update();
  if (!state.frozen) tick(Math.min(0.05, clock.getDelta()));
  requestAnimationFrame(frame);
}
function tick(real, draw = true) {
  const dt = real * state.speed;
  simTime += dt;
  // auto cast: whenever the skill is ready (at most every 1.2 s); Flame Stream held 1.4 s
  if (state.auto) {
    autoT -= dt;
    if (autoT <= 0 && !(game.player.cooldowns[0] > 0)) { castDown(); autoT = skillDef().kind === 'channel_cone' ? 2.4 : skillDef().charge ? 2.8 : 1.2; }
    if (state.holding && autoT < 1.0 && !castBtn.matches(':active')) castUp();
  }
  game.benchStep(dt);
  drain();
  const p = game.player;
  if (p.hp > lastHp + 0.5) floatNumber(p.x, 2.3, p.z, '+' + Math.round(p.hp - lastHp), '#7dff9a');
  lastHp = p.hp;
  if (lastHp > p.maxHp * 0.9) { p.hp = p.maxHp * 0.6; lastHp = p.hp; } // keep room for Life Leech to show

  hero.root.position.set(p.x, 0, p.z);
  hero.root.rotation.y = p.facing;
  const walked = Math.hypot(p.x - lastPos.x, p.z - lastPos.z) / Math.max(dt, 1e-4); lastPos.x = p.x; lastPos.z = p.z;
  heroAnim.update(dt, { speed: p.dash ? 8 : Math.min(walked, 12), facing: p.facing, moving: !!p.moving, dash: p.dash ? { kind: p.dash.kind, t: p.dash.t, dur: p.dash.dur } : null, channeling: p.channeling, dead: false, time: simTime });
  aimMark.position.set(p.x + Math.sin(aimAngle) * 2.2, 0.025, p.z + Math.cos(aimAngle) * 2.2);
  camFollow.x = p.x; camFollow.z = p.z;

  // dummies follow the rules (knockback / pull), react to hits, show chill / burn
  game.monsters.forEach((m, i) => {
    const d = dummies[i];
    d.x += (m.x - d.x) * Math.min(1, dt * 14); d.z += (m.z - d.z) * Math.min(1, dt * 14);
    if (Math.hypot(m.x - d.x, m.z - d.z) > 6) { d.x = m.x; d.z = m.z; }
    d.center.set(d.x, 1.1, d.z);
    d.pop = Math.max(0, d.pop - dt / 0.12); d.shake = Math.max(0, d.shake - dt);
    const chill = m.statuses.chill ? Math.min(1, m.statuses.chill.slow / 0.55) : 0;
    const burn = m.statuses.burn ? 1 : 0, stacks = m.statuses.poison?.stacks || (m.statuses.poison ? 1 : 0), toxic = Math.min(1, stacks / 3);
    d.mats.forEach((mat, k) => { mat.color.copy(d.orig[k]).lerp(ICY, 0.6 * chill).lerp(CHAR, 0.4 * burn).lerp(TOXIC, 0.3 * toxic); mat.emissive.copy(d.popColor).multiplyScalar(0.8 * d.pop).add(tint.setRGB(0.08 * chill + 0.03 * toxic, 0.16 * chill + 0.08 * toxic, 0.25 * chill)); });
    const sh = d.shake > 0 ? Math.sin(d.shake * 90) * 0.05 * (d.shake / 0.3) : 0;
    d.g.position.set(d.x + sh, 0, d.z);
    d.g.rotation.z = sh * 1.2;
  });

  fx.update(dt);
  castBtn.classList.toggle('ready', fx.counterReady);
  const recipeKind = skillDef().recipe?.id;
  flameSlash.update(dt, hero.bones?.weapon, fx.bladeBase, fx.bladeTip, game.projectiles, recipeKind);
  vfx.updateCast(dt, hero, !p.cast, p);
  vfx.syncProjectiles(game, dt, simTime, recipeKind ? benchSkip(recipeKind) : OWN_PROJECTILES);
  vfx.update(dt);
  const cd = p.cooldowns[0] || 0;
  castBtn.classList.toggle('cooling', cd > 0.02);
  castBtn.style.setProperty('--cd', String(Math.min(1, cd / Math.max(0.01, skillDef().cooldown))));

  // numbers
  const w = stage.clientWidth, hgt = stage.clientHeight;
  for (const n of numbers) {
    if (n.t === undefined || n.t > 0.9) { if (n.el.style.display !== 'none') n.el.style.display = 'none'; continue; }
    n.t += real;
    proj.set(n.x, n.y + n.t * 0.9, n.z).project(camera);
    n.el.style.transform = `translate(${((proj.x + 1) / 2) * w}px, ${((1 - proj.y) / 2) * hgt}px) translate(-50%, -50%)`;
    n.el.style.opacity = String(Math.min(1, (0.9 - n.t) / 0.3));
  }
  if (bannerT > 0) { bannerT -= real; if (bannerT <= 0) document.getElementById('banner').style.opacity = 0; }
  statT -= real; if (statT <= 0) { statT = 0.25; renderStats(); }

  if (!draw) return;
  fx.prerender();
  if (shakeT > 0) { shakeT = Math.max(0, shakeT - dt); const k = shakeAmp * (shakeT / shakeDur); camera.position.set(camBase.x + (Math.random() - 0.5) * 2 * k, camBase.y + (Math.random() - 0.5) * 2 * k, camBase.z + (Math.random() - 0.5) * 2 * k); }
  else camera.position.copy(camBase);
  camera.position.x += camFollow.x; camera.position.z += camFollow.z; // the camera walks with the hero
  // review hook: a fixed close-up (pose reviews), {pos: [x, y, z], look: [x, y, z]} around the hero
  if (state.camOverride) { const o = state.camOverride; camera.position.set(p.x + o.pos[0], o.pos[1], p.z + o.pos[2]); camera.lookAt(p.x + o.look[0], o.look[1], p.z + o.look[2]); }
  renderer.render(scene, camera);
}

rebuild();
requestAnimationFrame(frame);
window.__fxtest = { state, get game() { return game; }, get hero() { return hero; }, castDown, castUp, dodge, resetBench, setSkill: (id) => { state.skill = id; state.mods = []; state.fusion = null; rebuild(); }, setFusion: (id) => { state.fusion = id; rebuild(); }, setMods: (mods) => { state.mods = mods; rebuild(); }, setAim: (a) => { aimAngle = a; game.aimAt(a); }, renderer, fx,
  // review hooks: freeze the clock and advance fixed 60 Hz steps, rendering only the last one
  freeze: (on = true) => { state.frozen = on; }, advance: (sec) => { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) tick(1 / 60, i === n - 1); }, vfx, staffTip,
  hideDummies: () => dummies.forEach((d) => { d.g.visible = false; }),
  stances: HOLDS.stances, // the animator's stance table (pose tools add trial stances to it)
  setOffhand: (kind) => { state.offhand = kind; rebuild(); } }; // a second weapon (dual carry) or null
