import { installSpiritReveal, removeSpiritReveal, updateSpiritReveal } from '../render/spirit-reveal.js';
// Skill Lab: the hero, a training dummy and the real effect code on a flat floor, nothing else.
// It replays skills from data/skills.json + data/combat-fx.json the way the game's events drive
// src/render/vfx.js (castStart, projectiles, impact), so the owner can judge an effect live on the
// iPad: slow motion, pause and frame step, backgrounds, element/weapon/projectile count.
// It is a viewing tool only; no game rule runs here. ★ marks skills with a look in combat-fx.json
// 'skills'. lab-source.json (written by the deploy workflow) names the branch/commit shown.
import * as THREE from 'three';
import { Vfx } from '../render/vfx.js';
import { buildHumanoid, HumanoidAnimator, DEFAULT_LOOK } from '../render/hero.js';
import { buildMonster } from '../render/monsters.js';
import { loadModels } from '../render/models.js';
import { toon } from '../render/toon.js';
import { disposeObject } from '../render/dispose.js';
import SKILLS from '../../data/skills.json';
import FX from '../../data/combat-fx.json';
import MODELS from '../../data/models.json';
import { LabTuning } from './tuning.js';
import { mountTuningPanel } from './editor.js';

const CAM_OFFSET = new THREE.Vector3(0, 19, 13.5); // the game's 3/4 camera (src/render/view.js)
const GROUNDS = {
  sand: { label: 'ทราย', floor: '#d9c08f', sky: '#c6e8f2' },
  grass: { label: 'หญ้า', floor: '#86b56c', sky: '#cfe8d4' },
  dark: { label: 'มืด', floor: '#3c424d', sky: '#1b2028' },
};
const ELEMENTS = ['fire', 'cold', 'lightning', 'poison', 'arcane', 'physical'];
// skills the lab can replay; the rest appear disabled until their beats are wired here
const PLAYABLE = new Set(['projectile', 'melee_arc', 'melee_nova', 'ground_area', 'summon', 'nova','chain','buff','heal_zone','dash','blink','leap']);
const LAB_SKILLS={...SKILLS,combat:{...SKILLS.combat,...SKILLS.movement}};

const flat = { surfaceY: () => 0, groundY: () => 0 };
const params = new URLSearchParams(location.search);
const state = {
  skill: params.get('skill') || 'firebolt',
  element: null, // null = the skill's own element
  weapon: 'staff',
  count: 1,
  speed: 1,
  paused: false,
  auto: false,
  ground: 'sand',
  distance: 6,
  zoom: 0.55,
  open: false, // settings rows shown
  editorOpen: false,
  reviewPhase: 'full',
  tuningAuto: true,
  tuningSections: {},
  tuningStatus: '',
  comboMode: null,
  comboStep: 0,
};

if (!PLAYABLE.has(LAB_SKILLS.combat[state.skill]?.kind)) state.skill = 'firebolt';
const isMelee = (s) => s?.kind === 'melee_arc' || s?.kind === 'melee_nova';
if (isMelee(LAB_SKILLS.combat[state.skill])) { state.weapon = 'sword'; state.distance = 2; }
else if (state.skill === 'hunter_shot') state.weapon = 'bow';
let storage = null;
try { storage = window.localStorage; } catch {}
const tuning = new LabTuning(LAB_SKILLS, FX, storage);
tuning.get(state.skill);

// ---------- scene ----------
const canvas = document.getElementById('lab');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.6));
const sun = new THREE.DirectionalLight(0xfff2dc, 1.8);
sun.position.set(-8, 16, 10);
scene.add(sun);
const floorMat = new THREE.MeshToonMaterial({ color: GROUNDS.sand.floor });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
// faint metre grid so sizes can be read
const grid = new THREE.GridHelper(40, 40, 0x000000, 0x000000);
grid.material.transparent = true;
grid.material.opacity = 0.08;
grid.position.y = 0.01;
scene.add(grid);

const vfx = new Vfx(scene, flat, { config: tuning.fx });
const fakeGame = { projectiles: [], areas: [] };
// Keep one real summon rig across replays; changing sliders does not rebuild it.
let wolf = buildMonster('spirit_wolf'); scene.add(wolf.root); wolf.root.visible = false;
let wolfReveal=installSpiritReveal(wolf);
let wolfReplay = null, movementReplay=null;
const wolfPose = { moving: false, speedFactor: 1.2, state: 'idle', lastAttack: 'bite', windup: null, windupT: 0, windupTotal: .25, hurt: 0, lookYaw: 0, turn: 0 };

// training dummy: a post with a straw body; it bounces when hit
const dummy = new THREE.Group();
const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8), toon('#7a5a3a'));
post.position.y = 0.8;
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.6, 4, 10), toon('#d9b56a'));
body.position.y = 1.15;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), toon('#e6c886'));
head.position.y = 1.85;
dummy.add(post, body, head);
scene.add(dummy);
let dummyHit = 0;

// hero: procedural stand-in first, rebuilt once the real model has loaded
let hero = null;
let heroAnim = null;
function buildHero() {
  if (hero) disposeObject(hero.root);
  hero = buildHumanoid(DEFAULT_LOOK, { weapon: state.weapon === 'none' ? null : state.weapon, armor: 'tunic', helm: null, bases: {} });
  heroAnim = new HumanoidAnimator(hero);
  scene.add(hero.root);
  hero.root.rotation.y = -Math.PI / 2; // facing the dummy to the west
}
buildHero();
loadModels({ characters: { hero_base: MODELS.characters.hero_base }, weapons: MODELS.weapons, monsters: { thornback_wolf: MODELS.monsters.thornback_wolf } }).then(() => { buildHero(); removeSpiritReveal(wolfReveal); disposeObject(wolf.root); wolf = buildMonster('spirit_wolf'); scene.add(wolf.root); wolf.root.visible=false; wolfReveal=installSpiritReveal(wolf); wolfReplay=null; });

function placeDummy() {
  dummy.position.set(-state.distance, 0, 0);
}
placeDummy();

// ---------- replaying a skill ----------
let time = 0;
let nextId = 1;
let autoT = 0;
let hitStop = 0;
let shake = 0;
// the lab's own delayed calls (cast release), so it works with any version of vfx.js
const timers = [];
const later = (t, fn) => timers.push({ t, fn });
const fxLook = (id) => tuning.get(id).fx;

const skillDef = () => tuning.get(state.skill).def;
const elementOf = () => state.element || skillDef().element || 'physical';

function emitProjectiles(s) {
  const n = state.count, element = elementOf();
  const spread = ((s.spread || 24) * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (n > 1 ? (i - (n - 1) / 2) * (spread / (n - 1)) : 0);
    const dx = Math.sin(a), dz = Math.cos(a);
    fakeGame.projectiles.push({ id: nextId++, owner: 'player', kind: state.skill, element, x: dx * 0.6, z: dz * 0.6, y: 1.05, vx: dx * s.speed, vz: dz * s.speed, speed: s.speed, radius: s.projectileRadius || 0.35, range: (s.range || 12) + 2, travelled: 0 });
  }
}
function cast() {
  const s = skillDef();
  if (!s || !PLAYABLE.has(s.kind)) return;
  const element = elementOf();
  if (isMelee(s)) return castMelee(s, element);
  if (s.kind === 'ground_area') return castGround(s, element);
  if (s.kind === 'summon') return castSummon(s, element);
  if(['dash','blink','leap'].includes(s.kind)){
    hero.root.position.set(0,0,0);hero.root.visible=true;
    const dash={kind:state.skill,t:0,dur:s.duration,vx:-s.distance/s.duration,vz:0,fromX:0,fromZ:0,toX:-s.distance,toZ:0};
    movementReplay={x:0,z:0,dash,total:s.duration,distance:s.distance,landed:false};
    if(s.kind==='blink'){vfx.blink(0,0,-s.distance,0,0xb4a2ff,hero);movementReplay.x=-s.distance;}
    return;
  }
  if(['chain','buff','heal_zone'].includes(s.kind)){
    heroAnim.play(state.skill,s.castTime+.28,state.weapon,0,s.castTime,s.kind);
    later(s.castTime,()=>{
      if(s.kind==='chain')vfx.chain({element,points:[[0,0],[dummy.position.x,0]]});
      if(s.kind==='buff')vfx.warcry({x:0,z:0,radius:s.radius});
      if(s.kind==='heal_zone')fakeGame.areas.push({id:nextId++,owner:'player',kind:state.skill,x:0,z:0,radius:s.radius,t:0,delay:0,duration:s.duration});
    });return;
  }
  if (s.kind === 'nova') {
    const burst=()=>vfx.nova({x:0,z:0,radius:s.radius,element,approvedFrost:true});
    if(state.reviewPhase==='burst'){burst();return;}
    heroAnim.play(state.skill,s.castTime+.28,state.weapon,0,s.castTime,s.kind);
    vfx.beginCast({skill:state.skill,total:s.castTime,weapon:state.weapon},element);
    if(state.reviewPhase!=='cast')later(s.castTime,burst);
    return;
  }
  if (state.reviewPhase === 'impact') {
    impact({ kind: state.skill, element, x: dummy.position.x + 0.75, z: 0, vx: -s.speed, vz: 0 });
    return;
  }
  if (state.reviewPhase === 'projectile') { emitProjectiles(s); return; }
  const e = { type: 'castStart', skill: state.skill, kind: s.kind, angle: -Math.PI / 2, x: dummy.position.x, z: 0, total: s.castTime, weapon: state.weapon };
  heroAnim.play(e.skill, e.total + 0.28, e.weapon, 0, e.total, e.kind);
  vfx.beginCast?.(e, element);
  if (state.reviewPhase !== 'cast') later(s.castTime, () => emitProjectiles(s));
}
function meleeContact(s, step) {
  const dx=dummy.position.x,dz=dummy.position.z,d=Math.hypot(dx,dz);
  const off=Math.abs(Math.atan2(Math.sin(Math.atan2(dx,dz)+Math.PI/2),Math.cos(Math.atan2(dx,dz)+Math.PI/2)));
  return s.kind === 'melee_nova' ? d-.35 <= s.radius : d-.35 <= s.range && (off <= s.arc*Math.PI/360 || d <= .65);
}
function contact(e) {
  vfx.hitSpark(e);
  const f = vfx.contactLook(e.skill, e.element).impact;
  shake = Math.max(shake, f.shake); hitStop = Math.max(hitStop, f.hitStop); dummyHit = 1;
}
function meleeHit(s, element, step) {
  contact({ skill: state.skill, attackKind: s.kind, element, x: dummy.position.x, z: dummy.position.z, fromX:0, fromZ:0, heavy:step===2, crit:false });
  const f=fxLook(state.skill).impact; shake=Math.max(shake,f.shake);hitStop=Math.max(hitStop,f.hitStop);dummyHit=1;
}
function castMelee(s, element) {
  const step=state.comboMode ?? state.comboStep;
  if (state.reviewPhase === 'impact') { meleeHit(s,element,step); return; }
  const e={skill:state.skill,kind:s.kind,total:s.castTime,weapon:state.weapon,step};
  heroAnim.play(e.skill,s.castTime+.28,e.weapon,step,s.castTime,s.kind);
  vfx.beginSwing(e,element);
  if (state.reviewPhase === 'cast') later(s.castTime, () => vfx.endSwing());
  if (state.reviewPhase !== 'cast') {
    later(s.castTime,()=>{
      const hits=meleeContact(s,step)?1:0;
      const hit={skill:e.skill,x:0,z:0,angle:-Math.PI/2,element,range:s.range,arc:s.arc,radius:s.radius,step,finisher:step===2,hits};
      if(s.kind==='melee_nova')vfx.whirl(hit);else vfx.slash(hit,e.weapon);
      if(hits && state.reviewPhase==='full')meleeHit(s,element,step);
    });
  }
  if(state.comboMode===null && state.reviewPhase==='full')state.comboStep=(step+1)%3;
}

function castGround(s, element) {
  const x = dummy.position.x, z = dummy.position.z;
  const burst = () => {
    vfx.burst({ kind: state.skill, element, x, z, radius: s.radius });
    if (state.reviewPhase === 'full' && Math.hypot(dummy.position.x - x, dummy.position.z - z) <= s.radius + .35) {
      contact({ skill: state.skill, attackKind: s.kind, element, x: dummy.position.x, z: dummy.position.z, fromX: x, fromZ: z });
      dummyHit = 1;
    }
  };
  if (state.reviewPhase === 'impact') {
    contact({ skill: state.skill, element, x, z, fromX: 0, fromZ: 0 }); dummyHit = 1; return;
  }
  if (state.reviewPhase === 'burst') { burst(); return; }
  heroAnim.play(state.skill, s.castTime + .28, state.weapon, 0, s.castTime, s.kind);
  later(s.castTime, () => {
    fakeGame.areas.push({ id: nextId++, owner: 'player', kind: state.skill, element, x, z, radius: s.radius, t: 0, delay: s.delay, duration: .35 });
    if (state.reviewPhase === 'full') later(s.delay, burst);
  });
}

function castSummon(s, element) {
  const beginWolf = attackOnly => {
    const x = attackOnly ? dummy.position.x + 1.1 : -1.2, z = attackOnly ? dummy.position.z : .7;
    wolf.root.position.set(x, 0, z); wolf.root.visible = true; wolf.root.scale.setScalar(wolf.baseScale);
    wolfReplay = { phase: attackOnly ? 'windup' : state.reviewPhase === 'cast' ? 'idle' : 'chase', t: 0, age: 0, element };
    if (!attackOnly) vfx.summon({ skill: state.skill, x, z });
  };
  if (state.reviewPhase === 'impact') {
    contact({ skill: state.skill, element, x: dummy.position.x, z: dummy.position.z, fromX: dummy.position.x + 1.1, fromZ: dummy.position.z }); dummyHit = 1; return;
  }
  if (state.reviewPhase === 'attack') { beginWolf(true); return; }
  heroAnim.play(state.skill, s.castTime + .28, state.weapon, 0, s.castTime, s.kind);
  later(s.castTime, () => beginWolf(false));
}

function stepWolf(dt) {
  const r = wolfReplay;
  if (!r) return;
  r.t += dt; r.age += dt;
  const dx = dummy.position.x - wolf.root.position.x, dz = dummy.position.z - wolf.root.position.z, distance = Math.hypot(dx, dz);
  wolf.root.rotation.y = Math.atan2(dx, dz);
  const reach = skillDef().summon.range + .6 + .35;
  if (r.phase === 'chase') {
    if (distance <= reach + 1e-8) { r.phase = 'windup'; r.t = 0; }
    else { const move = Math.min(Math.max(0, distance - reach), skillDef().summon.speed * dt); wolf.root.position.x += dx / distance * move; wolf.root.position.z += dz / distance * move; }
  } else if (r.phase === 'windup' && r.t + 1e-8 >= .25) {
    const e = { skill: state.skill, element: r.element, x: dummy.position.x, z: dummy.position.z, fromX: wolf.root.position.x, fromZ: wolf.root.position.z };
    if (distance <= reach + .5) { vfx.bite(e); if (state.reviewPhase === 'full') { contact(e); } }
    r.phase = 'recover'; r.t = 0;
  }
  wolfPose.moving = r.phase === 'chase'; wolfPose.state = r.phase === 'recover' && r.t < .12 ? 'act' : r.phase;
  wolfPose.windup = r.phase === 'windup' ? 'bite' : null; wolfPose.windupT = r.t;
  wolf.animate(wolf, wolfPose, dt, time);
  // Presentation replay only: this does not run combat AI or deal damage.
  wolf.root.scale.setScalar(wolf.baseScale);
  updateSpiritReveal(wolfReveal,r.age,2-r.age,0);
  if (r.age >= 2) { wolf.root.visible = false; wolfReplay = null; }
}
function clearReplay() {
  timers.length = 0; fakeGame.projectiles.length = 0;
  movementReplay=null;hero.root.position.set(0,0,0);hero.root.visible=true;vfx.movementSource=null;
  vfx.endCast();
  vfx.endSwing(true); vfx.contacts.clear(); vfx.shake = 0;
  wolfReplay = null; wolf.root.visible = false; vfx.chips.clear();
  fakeGame.areas.length = 0;
  for (const area of vfx.areas.values()) disposeObject(area.obj, vfx.sharedGeo);
  vfx.areas.clear();
  if(heroAnim)heroAnim.action=null;
  for (const v of vfx.projectiles.values()) disposeObject(v, vfx.sharedGeo);
  vfx.projectiles.clear();
  for (const a of vfx.active) disposeObject(a.obj, vfx.sharedGeo);
  vfx.active.length = 0;
  vfx.flames.count = 0; vfx.flames.mesh.geometry.instanceCount = 0;
  for (const p of [vfx.fx, vfx.dust]) { p.count = 0; p.points.geometry.setDrawRange(0, 0); }
  hitStop = shake = dummyHit = 0;
  dummy.scale.setScalar(1); dummy.rotation.z = 0;
}
let editTimer = null;
function tuningStatus(text) {
  state.tuningStatus = text;
  const node = document.getElementById('tuning-status');
  if (node) node.textContent = text;
}
function replayPhase(phase = state.reviewPhase, refreshPanel = true) {
  clearTimeout(editTimer); editTimer = null;
  clearReplay(); vfx.refreshFlames();
  state.reviewPhase = phase; state.paused = false;
  autoT = 2.2;
  cast();
  const pause = document.getElementById('lab-pause'), stepButton = document.getElementById('lab-step');
  if (pause) { pause.textContent = '⏸'; pause.classList.remove('on'); }
  if (stepButton) stepButton.disabled = true;
  if (refreshPanel) render();
}
function selectSkill(id) {
  if (!PLAYABLE.has(LAB_SKILLS.combat[id]?.kind)) return;
  clearTimeout(editTimer); editTimer = null; clearReplay();
  const wasMelee=isMelee(LAB_SKILLS.combat[state.skill]), nowMelee=isMelee(LAB_SKILLS.combat[id]);
  state.skill = id; state.element = null; state.reviewPhase = 'full';state.comboStep=0;
  const weapon=nowMelee?'sword':id==='hunter_shot'?'bow':'staff';
  if(state.weapon!==weapon){state.weapon=weapon;buildHero();}
  if(wasMelee!==nowMelee){state.distance=nowMelee?2:6;placeDummy();}
  tuning.get(id); vfx.refreshFlames();
  state.tuningStatus = 'พร้อมทดลอง';
  render();
}
function tuningChanged() {
  // Restart once the touch slider settles; avoid rebuilding meshes on every input tick.
  vfx.refreshFlames();
  const saved = tuning.save(state.skill);
  tuningStatus(saved ? 'จำค่าปรับไว้แล้ว' : 'ทดลองได้ แต่เครื่องนี้บันทึกค่าไม่ได้ — ส่งออกเก็บไว้ได้');
  clearTimeout(editTimer);
  if (state.tuningAuto) editTimer = setTimeout(() => replayPhase(state.reviewPhase, false), 180);
}
function resetTuning(section) {
  tuning.reset(state.skill, section); tuningChanged();
  clearReplay(); vfx.refreshFlames(); render();
}

function impact(pr) {
  const e = { type: 'impact', kind: pr.kind, element: pr.element, x: pr.x, z: pr.z, vx: pr.vx, vz: pr.vz };
  vfx.impact(e);
  const hit = fxLook(pr.kind)?.impact;
  if (hit) {
    shake = Math.max(shake, hit.shake || 0);
    hitStop = Math.max(hitStop, hit.hitStop || 0);
  }
  dummyHit = 1;
}

function stepProjectiles(dt) {
  const keep = [];
  for (const pr of fakeGame.projectiles) {
    pr.x += pr.vx * dt;
    pr.z += pr.vz * dt;
    pr.travelled += pr.speed * dt;
    const d = Math.hypot(pr.x - dummy.position.x, pr.z - dummy.position.z);
    // like the game: only a hit explodes; running out of range just ends the projectile
    if (d < 0.45 + pr.radius) impact(pr);
    else if (pr.travelled <= pr.range) keep.push(pr);
  }
  fakeGame.projectiles = keep;
}

function step(dt) {
  time += dt;
  for (let i = timers.length - 1; i >= 0; i--) {
    timers[i].t -= dt;
    if (timers[i].t <= 0) timers.splice(i, 1)[0].fn();
  }
  if (state.auto) {
    autoT -= dt;
    if (autoT <= 0) {
      cast();
      autoT = 2.2;
    }
  }
  stepProjectiles(dt);
  for (let i = fakeGame.areas.length - 1; i >= 0; i--) {
    const area = fakeGame.areas[i]; area.t += dt;
    if (area.t >= area.delay + area.duration) fakeGame.areas.splice(i, 1);
  }
  stepWolf(dt);
  if(movementReplay){const p=movementReplay,d=p.dash;
    if(d){d.t=Math.min(d.dur,d.t+dt);const k=d.t/d.dur;p.x=-p.distance*(d.kind==='blink'?1:k);hero.root.position.set(p.x,d.kind==='leap'?Math.sin(Math.PI*k)*2:0,0);hero.root.visible=d.kind!=='blink'||k>=1;
      if(k>=1){if(d.kind==='leap')vfx.leapLand({x:p.x,z:0,radius:skillDef().radius});p.dash=null;}}
  }
  heroAnim.update(dt, { speed: 0, facing: hero.root.rotation.y, moving: false, dash: movementReplay?.dash||null, dead: false, time });
  if(movementReplay)vfx.syncMovement(movementReplay,0,dt,hero);
  vfx.updateTrail(dt, hero);
  vfx.updateCast?.(dt, hero);
  vfx.syncProjectiles(fakeGame, dt, time);
  vfx.syncAreas(fakeGame, dt, time);
  vfx.update(dt);
  if (vfx.shake) { shake = Math.max(shake, vfx.shake); vfx.shake = 0; }
  dummyHit = Math.max(0, dummyHit - dt * 4);
  const k = Math.sin(dummyHit * Math.PI) * 0.25;
  dummy.scale.set(1 + k, 1 - k * 0.6, 1 + k);
  dummy.rotation.z = -k * 0.6;
}

// ---------- frame loop ----------
let last = performance.now();
let fps = 60;
const camTarget = new THREE.Vector3();
let panelH = 0;
let panelW = 0;
let viewFit = 1;
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Preserve horizontal room for caster and target when a portrait inspector
  // reduces the available view. The owner's selected zoom remains the base.
  viewFit = Math.max(w, h) / Math.max(1, w - panelW);
  // keep the action centred in the part of the screen above the touch panel
  camera.setViewOffset(w, h, panelW / 2, panelH / 2, w, h);
  camera.updateProjectionMatrix();
  vfx.setPointScale(h * renderer.getPixelRatio());
}
window.addEventListener('resize', measurePanel);
resize();

function frame(now) {
  // The first RAF timestamp may predate initialization's performance.now().
  // Never advance the rig backwards (a negative gait phase indexes before its clip).
  const real = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  fps += (1 / Math.max(real, 0.001) - fps) * 0.05;
  if (!state.paused) {
    let dt = real * state.speed;
    if (hitStop > 0) {
      hitStop -= dt;
      dt *= 0.08;
    }
    step(dt);
  }
  const areaPad = skillDef()?.kind === 'ground_area' ? skillDef().radius : 0;
  const target = camTarget.set(['nova','buff','heal_zone'].includes(skillDef()?.kind) ? 0 : -(state.distance + areaPad) / 2, 0, 0);
  camera.position.copy(target).addScaledVector(CAM_OFFSET, state.zoom * viewFit * (1 + areaPad / Math.max(2, state.distance)));
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.35;
    camera.position.y += (Math.random() - 0.5) * shake * 0.35;
    if (!state.paused) shake = Math.max(0, shake - real * state.speed * 2.2);
  }
  camera.lookAt(target.x, 0.8, target.z);
  renderer.render(scene, camera);
  info.textContent = `${skillDef()?.nameTh || state.skill} · ${elementOf()} · ${state.speed}× · ${Math.round(fps)} fps${source}`;
  requestAnimationFrame(frame);
}

// ---------- touch panel ----------
const info = document.getElementById('info');
const panel = document.getElementById('panel');
function row(label, items, isOn, onTap) {
  const r = document.createElement('div');
  r.className = 'row';
  if (label) {
    const s = document.createElement('span');
    s.textContent = label;
    r.append(s);
  }
  for (const [value, text, disabled] of items) {
    const b = document.createElement('button');
    b.textContent = text;
    b.disabled = !!disabled;
    b.classList.toggle('on', isOn(value));
    b.addEventListener('click', () => {
      onTap(value);
      render();
    });
    r.append(b);
  }
  panel.append(r);
}
function button(parent, text, cls, onTap, disabled = false) {
  const b = document.createElement('button');
  b.textContent = text;
  if (cls) b.className = cls;
  b.disabled = disabled;
  b.addEventListener('click', () => {
    onTap();
    render();
  });
  parent.append(b);
  return b;
}
function render() {
  panel.textContent = '';
  panel.classList.toggle('editing', state.editorOpen);
  const top = document.createElement('div');
  top.className = 'row';
  panel.append(top);
  button(top, 'ใช้สกิล', 'go', cast);
  button(top, 'วนอัตโนมัติ', state.auto ? 'on' : '', () => {
    state.auto = !state.auto;
    autoT = 0;
  });
  button(top, state.paused ? '▶' : '⏸', state.paused ? 'on' : '', () => (state.paused = !state.paused)).id = 'lab-pause';
  button(top, '+1 เฟรม', '', () => step(1 / 60), !state.paused).id = 'lab-step';
  for (const [v, t] of [[1, '1×'], [0.5, '½×'], [0.25, '¼×'], [0.1, '⅒×']]) button(top, t, v === state.speed ? 'on' : '', () => (state.speed = v));
  button(top, state.open ? '▾ ซ่อน' : '⚙ ตั้งค่า', '', () => (state.open = !state.open));
  button(top, state.editorOpen ? 'ปิดตัวปรับ' : 'ปรับเอฟเฟกต์', state.editorOpen ? 'on' : '', () => {
    state.editorOpen = !state.editorOpen;
    state.reviewPhase = 'full'; clearReplay();
    if (state.editorOpen) state.element = null;
  });
  if (state.open) {
    row('สกิล', Object.entries(LAB_SKILLS.combat).map(([id, s]) => [id, `${FX.skills?.[id] ? '★ ' : ''}${s.nameTh || s.name}`, !PLAYABLE.has(s.kind)]), (v) => v === state.skill, (v) => {
      selectSkill(v);
    });
    row('ธาตุ', [[null, 'ตามสกิล'], ...ELEMENTS.map((e) => [e, e])], (v) => v === state.element, (v) => { state.element = v; state.editorOpen = false; state.reviewPhase = 'full'; clearReplay(); });
    if (skillDef().kind === 'projectile') row('จำนวนลูก', [[1, '1'], [3, '3'], [5, '5']], (v) => v === state.count, (v) => (state.count = v));
    row('อาวุธ', [['sword', 'ดาบ'], ['dagger', 'มีด'], ['axe', 'ขวาน'], ['greatblade', 'ดาบใหญ่'], ['staff', 'ไม้เท้า'], ['wand', 'คทา'], ['bow', 'ธนู'], ['none', 'มือเปล่า']], (v) => v === state.weapon, (v) => {
      clearReplay();
      state.weapon = v;
      buildHero();
    });
    row('พื้น', Object.entries(GROUNDS).map(([k, g]) => [k, g.label]), (v) => v === state.ground, (v) => {
      state.ground = v;
      floorMat.color.set(GROUNDS[v].floor);
      scene.background = new THREE.Color(GROUNDS[v].sky);
    });
    row('ระยะ', isMelee(skillDef()) ? [[1.6,'1.6 ม.'],[2.2,'2.2 ม.'],[3.4,'3.4 ม.']] : [[4, '4 ม.'], [6, '6 ม.'], [9, '9 ม.']], (v) => v === state.distance, (v) => {
      state.distance = v;
      placeDummy();
    });
    if(isMelee(skillDef()))row('คอมโบ',[[null,'ต่อเนื่อง'],[0,'1'],[1,'2'],[2,'3 หนัก']],v=>v===state.comboMode,v=>{state.comboMode=v;state.comboStep=0;clearReplay();});
    row('กล้อง', [[0.4, 'ใกล้'], [0.55, 'กลาง'], [0.8, 'เกม']], (v) => v === state.zoom, (v) => (state.zoom = v));
  }
  if (state.editorOpen) mountTuningPanel(panel, {
    tuning, state, skills: LAB_SKILLS.combat, playable: (skill) => PLAYABLE.has(skill?.kind),
    onSkill: selectSkill, onChange: tuningChanged, onPreview: replayPhase, onReset: resetTuning, onStatus: tuningStatus,
  });
  measurePanel();
}
let source = '';
fetch('./lab-source.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => j && (source = ` · ${j.branch} ${String(j.sha).slice(0, 7)}`))
  .catch(() => {});
scene.background = new THREE.Color(GROUNDS.sand.sky);
render();
window.__lab = { state, cast, step, vfx, tuning, setWeapon: (w) => { state.weapon = w; buildHero(); }, preview: replayPhase, clear: clearReplay, view: { camera, get hero(){ return hero.root; }, get wolf(){return wolf.root;}, dummy }, stats: () => ({ ...renderer.info.memory }) };
requestAnimationFrame(frame);


// Accordion height changes also keep the action above the touch panel.
function measurePanel() {
  const rect = panel.getBoundingClientRect();
  const side = state.editorOpen && window.innerWidth >= 980;
  panelH = side ? 0 : rect.height;
  panelW = side ? rect.width : 0;
  resize();
}
new ResizeObserver(measurePanel).observe(panel);
