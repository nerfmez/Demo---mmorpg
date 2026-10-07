// The hero (from docs/reference/hero-character-sheet.png), customisable in character creation,
// and the town NPCs. Normal proportions (~6.5 heads). Parts are merged per bone (see rig.js).
// HumanoidAnimator drives locomotion (speed-blended walk/run with hip sway, counter-rotation,
// lean into turns), idle breathing and weight shift, keyframed actions with anticipation and
// follow-through, hit reactions, and secondary motion (scarf, ponytail).
import * as THREE from 'three';
import { buildWeapon, buildOffhand, buildGloves, equipmentDetails } from './equipment.js';
import { RigBuilder, damp, clamp01, samplePose, applyPose, Spring, setFlash } from './rig.js';
import { Ribbon } from './ribbon.js';
import GAIT from '../../data/gait.json';
import STAFF_CAST from '../../data/staff-cast.json';
import HOLDS from '../../data/weapon-holds.json';
import { ACTIONS, pickAction, LEAP } from './actions.js';
import { reachArm } from './ik.js';
import { attachHair } from './hair.js';
import { buildOutfit } from './outfit.js';
import { modelInstance, characterBase } from './models.js';
import { attachSkinnedBody, fitParts } from './skinned.js';
import { attachVrmBody } from './vrm-body.js';
import {attachHairSampleBody} from './hairsample.js';

export const DEFAULT_LOOK = {
  hairStyle: 'messy',
  hair: '#262a44',
  skin: '#f6d2b5',
  eyes: '#2b2e44',
  scarf: '#cf3a30',
  tunic: '#f1e3cc',
};

export const LOOK_OPTIONS = {
  hairStyle: ['messy', 'swept', 'ponytail', 'short'],
  hair: ['#262a44', '#3b2a20', '#6a4a2a', '#c9a060', '#e8dcc0', '#a83a2a', '#4a5a8a', '#1e1e24'],
  skin: ['#f6d2b5', '#eec39a', '#d9a67a', '#b07a52', '#8a5a3a'],
  eyes: ['#2b2e44', '#3a6ad0', '#3a8a5a', '#8a4a2a', '#a03a8a', '#c9a030'],
  scarf: ['#cf3a30', '#3b6ad0', '#3a9a5a', '#e0a030', '#8a4ac0', '#e8e0d0', '#2a2a3a', '#d86a9a'],
  tunic: ['#f1e3cc', '#d8e4f0', '#e8d0c0', '#c8d8b8', '#3a3a48'],
};

const LEATHER = '#7a4b2c';
const LEATHER_DARK = '#5b371f';
const METAL = '#b9bcc4';
const PANTS = '#34343f';
const BOOTS = '#8a5634';

const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, -h / 2, 0); // hangs from its pivot
const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);

/**
 * Build a humanoid.
 * @param {object} look appearance (see DEFAULT_LOOK)
 * @param {object} gear {weapon, armor, helm, bases} visual kinds and base content IDs
 * @param {object} o {npc, apron, beard, longHair, procedural}
 * The hero uses the skinned body (skinned.js) once it has loaded; NPCs, and `procedural`,
 * keep the all-procedural body.
 */
export function buildHumanoid(look = DEFAULT_LOOK, gear = {}, o = {}) {
  const L = { ...DEFAULT_LOOK, ...look };
  const rb = new RigBuilder({ outline: 0.016, darkness: 0.32, rim: 0.3 });
  const V = o.npc || o.procedural ? null : characterBase('hero_vrm'); // only loaded with ?hero=vrm
  const X = o.npc || o.procedural || V ? null : characterBase('hairsample');
  const T = o.npc || o.procedural || V || X ? null : characterBase('hero_base');
  // driver bones sit on the skinned body's joints when there is one
  const B = (name, parent, pos) => rb.bone(name, parent, (X || T || V)?.joints[name] || pos);
  B('body', 'root');
  B('hips', 'body', [0, 0.93, 0]);
  B('torso', 'hips', [0, 0.02, 0]);
  B('chest', 'torso', [0, 0.24, 0]);
  B('head', 'chest', [0, 0.36, 0]);
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    B(`leg${n}`, 'hips', [s * 0.1, 0, 0]);
    B(`knee${n}`, `leg${n}`, [0, -0.44, 0]);
    B(`foot${n}`, `knee${n}`, [0, -0.4, 0]);
    B(`arm${n}`, 'chest', [s * 0.215, 0.18, 0]);
    B(`elbow${n}`, `arm${n}`, [0, -0.27, 0]);
    B(`hand${n}`, `elbow${n}`, [0, -0.25, 0]);
  }
  const boots = gear.bases?.boots || 'travel_boots';
  const bootColor = boots==='wolf_boots' ? '#8b9183' : boots==='wisp_slippers' ? '#80b4b4' : boots==='crag_greaves' ? '#9fa99d' : BOOTS;
  const armor = gear.armor || 'tunic';
  const tunic = armor === 'pelt' ? '#6f6a64' : armor === 'mantle' ? '#3a5a8a' : armor === 'plate' ? '#8f96a3' : L.tunic;

  if (!T && !V && !X) {
    // legs
    for (const n of ['L', 'R']) {
      rb.add(`leg${n}`, cyl(0.085, 0.072, 0.46), PANTS);
      rb.add(`knee${n}`, sph(0.068, 10, 8), PANTS);
      rb.add(`knee${n}`, cyl(0.068, 0.058, 0.26), PANTS);
      const color = bootColor;
      if(boots!=='wisp_slippers'){
        rb.add(`knee${n}`, cyl(.079,.07,.24), color, {pos:[0,-.14,0]});
        rb.add(`knee${n}`, cyl(.1,.092,.1), boots==='wolf_boots'?'#cfccba':color, {pos:[0,-.06,0]});
      }
      rb.add(`foot${n}`, new THREE.BoxGeometry(.12,.08,.25).translate(0,-.02,.05), color);
      if(boots==='wolf_boots'){
        for(const x of [-.04,.04])rb.add(`foot${n}`,new THREE.ConeGeometry(.016,.07,4).rotateX(Math.PI/2),'#e8dfc3',{pos:[x,-.015,.20]});
      }else if(boots==='wisp_slippers'){
        rb.add(`foot${n}`,new THREE.ConeGeometry(.044,.17,5).rotateX(.95),'#99c9c5',{pos:[0,.03,.20]});
      }else if(boots==='crag_greaves'){
        rb.add(`knee${n}`,new THREE.BoxGeometry(.13,.22,.055),'#b9c4b3',{pos:[0,-.15,.065]});
        rb.add(`knee${n}`,new THREE.OctahedronGeometry(.042),'#d0d7b3',{pos:[0,-.05,.093],plain:true});
      }

    }
    // hips: tunic hem, belt, pouch
    rb.add('hips', new THREE.CylinderGeometry(0.16, 0.205, 0.28, 12, 1, true).translate(0, -0.08, 0).scale(1, 1, 0.8), tunic);
    rb.add('hips', new THREE.CylinderGeometry(0.168, 0.168, 0.07, 12).scale(1, 1, 0.8), LEATHER, { pos: [0, 0.05, 0] });
    rb.add('hips', new THREE.BoxGeometry(0.06, 0.05, 0.02), METAL, { pos: [0, 0.05, 0.138], plain: true });
    rb.add('hips', new THREE.BoxGeometry(0.08, 0.1, 0.05), LEATHER, { pos: [-0.14, -0.01, 0.07], rot: [0, 0.5, 0] });
    // torso and chest
    rb.add('torso', new THREE.CylinderGeometry(0.165, 0.158, 0.26, 12).translate(0, 0.12, 0).scale(1, 1, 0.74), tunic);
    rb.add('chest', new THREE.CylinderGeometry(0.19, 0.166, 0.3, 12).translate(0, 0.12, 0).scale(1, 1, 0.74), tunic);
    rb.add('chest', new THREE.SphereGeometry(0.19, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.45, 0.74).translate(0, 0.27, 0), tunic);
    if (!o.npc || o.straps) {
      rb.add('chest', new THREE.BoxGeometry(0.035, 0.5, 0.014), LEATHER_DARK, { pos: [0, 0.06, 0.128], rot: [0, 0, 0.62], plain: true });
      rb.add('chest', new THREE.BoxGeometry(0.035, 0.5, 0.014), LEATHER_DARK, { pos: [0, 0.06, -0.128], rot: [0, 0, -0.62], plain: true });
    }
    if (armor === 'hide' || armor === 'pelt') {
      rb.add('chest', new THREE.CylinderGeometry(0.198, 0.18, 0.28, 12, 1, true).translate(0, 0.1, 0).scale(1, 1, 0.78), armor === 'hide' ? '#8a5a3a' : '#7f776c');
      if (armor === 'pelt') rb.add('chest', new THREE.TorusGeometry(0.15, 0.06, 6, 14).rotateX(Math.PI / 2), '#b8b0a4', { pos: [0, 0.3, 0] });
    } else if (armor === 'shell') {
      rb.add('chest', new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(1, 0.9, 0.8), '#5d8a3a', { pos: [0, 0.02, 0.01] });
    } else if (armor === 'plate') {
      rb.add('chest', new THREE.BoxGeometry(0.34, 0.26, 0.26).translate(0, 0.12, 0), '#9aa0ad');
      rb.add('chest', new THREE.OctahedronGeometry(0.05), '#8fe0ff', { pos: [0, 0.14, 0.14], glow: true });
    }
    if (o.apron) rb.add('torso', new THREE.BoxGeometry(0.3, 0.55, 0.02), o.apron, { pos: [0, 0.02, 0.13] });
    // arms
    for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
      rb.add(`arm${n}`, sph(0.072, 10, 8), tunic, { pos: [0, -0.02, 0] });
      rb.add(`arm${n}`, cyl(0.064, 0.056, 0.27), tunic);
      rb.add(`elbow${n}`, sph(0.056, 8, 6), L.skin);
      rb.add(`elbow${n}`, cyl(0.064, 0.06, 0.05), tunic, { pos: [0, 0.03, 0] });
      rb.add(`elbow${n}`, cyl(0.048, 0.042, 0.24), L.skin);
      rb.add(`elbow${n}`, cyl(0.058, 0.052, 0.13), LEATHER, { pos: [0, -0.09, 0] });
      rb.add(`hand${n}`, sph(0.048, 8, 6), LEATHER_DARK, { pos: [0, -0.02, 0] });
      void s;
    }
  } // end of the procedural body
  // shoulder guard (left)
  if (!o.npc && !V) {
    rb.add('armL', new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.15, 0.8, 1.1), armor === 'plate' ? '#9aa0ad' : LEATHER, { pos: [0.02, 0.01, 0], rot: [0, 0, -0.35] });
    rb.add('armL', new THREE.TorusGeometry(0.105, 0.012, 5, 16).rotateX(Math.PI / 2).scale(1.1, 1, 1.05), METAL, { pos: [0.02, -0.005, 0], rot: [0, 0, -0.35], plain: true });
  }
  // neck, head, face
  if (!T && !V && !X) {
    rb.add('chest', cyl(0.05, 0.056, 0.1), L.skin, { pos: [0, 0.37, 0] });
    const headGeo = new THREE.SphereGeometry(0.125, 16, 12).scale(0.95, 1.08, 1.0).translate(0, 0.12, 0.005);
    rb.add('head', headGeo, L.skin);
    rb.add('head', new THREE.ConeGeometry(.011,.027,4).rotateX(Math.PI/2), L.skin, {pos:[0,.083,.128],plain:true});
  }
  const paintedFace = !!T?.faceGeo || !!V || !!X;
  for (const s of paintedFace ? [] : [1, -1]) {
    const eye = new THREE.Shape();
    eye.moveTo(-.026,.005);
    eye.quadraticCurveTo(-.003,.022,.027,.009);
    eye.quadraticCurveTo(.012,-.019,-.010,-.014);
    eye.quadraticCurveTo(-.024,-.008,-.026,.005);
    const eyeGeo = new THREE.ShapeGeometry(eye,8).scale(s,1,1);
    rb.add('head',eyeGeo.clone().scale(1.09,1.12,1),'#514638',{pos:[s*.046,.125,.126],rot:[0,s*.22,0],plain:true});
    rb.add('head',eyeGeo,'#fff7df',{pos:[s*.046,.125,.128],rot:[0,s*.22,0],plain:true});
    rb.add('head',new THREE.CircleGeometry(.013,14).scale(.82,1.05,1),L.eyes,{pos:[s*.046,.126,.133],rot:[0,s*.22,0],plain:true});
    rb.add('head',new THREE.CircleGeometry(.006,10).scale(.8,1.12,1),'#30383c',{pos:[s*.046,.127,.135],rot:[0,s*.22,0],plain:true});
    rb.add('head',new THREE.CircleGeometry(.004,6),'#fffbee',{pos:[s*.046+.004,.133,.137],rot:[0,s*.22,0],plain:true});
    rb.add('head',new THREE.BoxGeometry(.044,.005,.004),L.hair,{pos:[s*.046,.162,.119],rot:[0,s*.2,s*-.12],plain:true});
    if (!T) rb.add('head', new THREE.SphereGeometry(0.022, 6, 5).scale(0.6, 1, 0.6), L.skin, { pos: [s * 0.125, 0.12, 0], plain: true }); // ears
  }
  if (!paintedFace) rb.add('head', new THREE.BoxGeometry(0.03, 0.006, 0.004), '#9a5a4a', { pos: [0, 0.055, 0.122], plain: true }); // mouth
  const hairStyle = o.longHair ? 'ponytail' : L.hairStyle;
  if (hairStyle === 'ponytail') rb.bone('tail', 'head', [0, 0.2, -0.12]);
  // scarf wrap (hero only; the VRM hero has none yet)
  if ((!o.npc || o.scarf) && !V) {
    rb.add('chest', new THREE.TorusGeometry(0.1, 0.05, 8, 16).rotateX(Math.PI / 2).scale(1.05, 1.2, 0.95), L.scarf, { pos: [0, 0.35, -0.005] });
    rb.add('chest', sph(0.06, 8, 6), L.scarf, { pos: [0.06, 0.31, -0.08] });
  }
  if (o.beard) rb.add('head', new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), o.beard, { pos: [0, 0.07, 0.05] });
  helm(rb, gear.helm, L);
  const outfit = T || X ? buildOutfit(rb, T || X, gear, { leather: LEATHER, boots: bootColor }) : null;
  const weaponModel = buildWeapon(rb, gear.weapon || (o.npc ? null : 'sword'), gear.bases?.weapon);
  // Left hand: a second light weapon, a shield, or a quiver with a bow.
  const offhandModel = gear.offhand && !['shield', 'quiver'].includes(gear.offhand) ? buildWeapon(rb, gear.offhand, gear.bases?.offhand, 'offhand', 'handL') : buildOffhand(rb, gear.offhand, gear.bases?.offhand);
  buildGloves(rb, gear.gloves);
  equipmentDetails(rb, gear.bases);

  const rig = rb.build();
  rig.importedWeapon = !!weaponModel;
  rig.importedOffhand = !!offhandModel;
  if (weaponModel) rig.bones.weapon.add(modelInstance('weapons', weaponModel, rig.material.userData.flash));
  if (offhandModel) rig.bones.offhand.add(modelInstance('weapons', offhandModel, rig.material.userData.flash));
  // A left-hand weapon is not animated: it keeps the right hand's resting angle (actions.js REST.weapon).
  if (rig.bones.offhand && gear.offhand && !['shield', 'quiver'].includes(gear.offhand)) rig.bones.offhand.rotation.x = 1.2;
  if (!V && !X) attachHair(rig, hairStyle, L.hair, { helm: !!gear.helm && gear.helm !== 'circlet' });
  let neckParts = rig.bones.chest;
  if (T) {
    fitParts(rig.bones.head, T.headFit);
    neckParts = fitParts(rig.bones.chest, T.neckFit, { skip: ['chestWear'] });
    fitParts(rig.bones.armL, T.armFit);
    // sleeves keep the chosen tunic colour; armour colours the body through `vest`
    attachSkinnedBody(rig, T, { skin: L.skin, tunic: L.tunic, pants: PANTS, boots: bootColor, leather: LEATHER, vest: outfit.vest }, L);
  }
  if (X) {
    fitParts(rig.bones.head, X.headFit);
    neckParts = fitParts(rig.bones.chest, X.neckFit, { skip: ['chestWear'] });
    attachHairSampleBody(rig, X, gear, {tunic, pants:PANTS, boots:bootColor, vest:outfit?.vest});
  }
  if (V) {
    fitParts(rig.bones.head, V.headFit);
    attachVrmBody(rig, V);
  }
  rig.look = L;
  rig.kind = o.npc ? 'npc' : 'hero';
  if ((!o.npc || o.scarf) && !V) {
    rig.scarfAnchor = new THREE.Group();
    rig.scarfAnchor.position.set(0.06, 0.31, -0.1);
    neckParts.add(rig.scarfAnchor);
    const m = new THREE.MeshToonMaterial({ color: new THREE.Color(L.scarf), gradientMap: rig.material.gradientMap, side: THREE.DoubleSide });
    m.userData.rig = true; // freed with the rig
    rig.scarf = new Ribbon({ segments: 9, length: 0.95, width: 0.15, material: m });
  }
  rig.weaponKind = gear.weapon || 'sword';
  rig.offhandKind = gear.offhand || null;
  return rig;
}

function helm(rb, kind, L) {
  if (!kind) return;
  if (kind === 'cap') {
    rb.add('head', new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45).translate(0, 0.16, -0.01), '#8a5a3a');
    rb.add('head', new THREE.CylinderGeometry(0.15, 0.15, 0.02, 14, 1, false, -Math.PI / 2, Math.PI).translate(0, 0.19, 0.05), '#6f4a30');
  } else if (kind === 'beetle') {
    rb.add('head', new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).translate(0, 0.16, -0.01), '#5d8a3a');
    rb.add('head', new THREE.ConeGeometry(0.03, 0.12, 5), '#d9c9a0', { pos: [0, 0.32, 0.03], rot: [0.3, 0, 0] });
  } else if (kind === 'circlet') {
    rb.add('head', new THREE.TorusGeometry(0.138, 0.012, 5, 18).rotateX(Math.PI / 2), '#e0c060', { pos: [0, 0.2, 0] });
    for (const s of [1, -1]) rb.add('head', new THREE.ConeGeometry(0.03, 0.16, 4), '#f4f0e8', { pos: [s * 0.13, 0.25, -0.02], rot: [0, 0, -s * 0.6] });
  } else if (kind === 'horned') {
    rb.add('head', new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.15, -0.01), '#6d6f78');
    for (const s of [1, -1]) {
      rb.add('head', new THREE.ConeGeometry(0.035, 0.22, 6).translate(0, 0.11, 0), '#e7dcc0', { pos: [s * 0.12, 0.24, 0], rot: [0.2, 0, -s * 0.9] });
    }
  } else if (kind === 'hood') {
    // a closed crown, then sides and back with the face left open
    rb.add('head', new THREE.SphereGeometry(0.16, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.34).translate(0, 0.14, -0.02), '#a58384');
    rb.add('head', new THREE.SphereGeometry(0.16, 14, 6, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, Math.PI * 0.34, Math.PI * 0.36).translate(0, 0.14, -0.02), '#a58384');
    for(const [x,y] of [[-.07,.24],[.075,.18]]) rb.add('head',new THREE.SphereGeometry(.02,6,4),'#e2caa1',{pos:[x,y,.10],plain:true});
  }
  void L;
}

// ---------- animation (actions: actions.js) ----------

export class HumanoidAnimator {
  constructor(rig) {
    this.rig = rig;
    this.b = rig.bones;
    this.speed = 0;
    this.runW = 0;
    this.lean = 0;
    this.turn = 0;
    this.prevFacing = null;
    this.action = null; // {name, t, dur}
    this.actionW = 0;
    this.hurt = 0;
    this.combo = 0;
    this.lookYaw = 0;
    this.idleT = Math.random() * 10;
    this.tailSpring = new Spring(80, 9);
    this.tailSpringZ = new Spring(80, 9);
    this.fall = 0;
    this.deadT = 0;
    this.moveW = 0;
    this.gaitU = 0;
    this.buf = poseBuffers();
    this.blinkT = 1.5 + Math.random() * 3;
    this.blink = 0;
  }

  /**
   * Play the action for a cast (see actions.js).
   * @param {string} skill skill id or action name
   * @param {number} dur seconds
   * @param {string} weaponKind
   * @param {number} step combo step of a melee swing (castStart.step)
   * @param {number} hitTime seconds until the skill lands (its cast time); the action's hit key is moved there
   * @param {string} kind skill kind, for skills without their own action
   */
  play(skill, dur, weaponKind, step = this.combo, hitTime = null, kind = null) {
    const weapon = weaponKind || this.rig.weaponKind;
    // a heavy weapon held in both hands (nothing in the left) swings like the greatblade
    const twoHanded = HOLDS.holds[weapon]?.two && !this.rig.offhandKind;
    const name = pickAction(skill, kind, twoHanded && weapon !== 'staff' ? 'greatblade' : weapon, step);
    this.combo = step + 1;
    dur = Math.max(0.25, dur);
    const hit = ACTIONS[name].hit;
    this.action = { name, t: 0, dur, hitAt: hitTime && hit > 0 ? clamp01(hitTime / dur) : hit };
  }

  hit() {
    this.hurt = 1;
  }

  /**
   * @param {object} s {speed (m/s actual), facing, moving, dash:{kind,t,dur}|null, dead, time}
   */
  update(dt, s) {
    const b = this.b;
    // measured speed, smoothed; turn rate for leaning into turns
    this.speed = damp(this.speed, s.speed, 10, dt);
    const runW = clamp01(this.speed / 5.5);
    this.runW = damp(this.runW, s.moving ? Math.max(0.25, runW) : 0, 8, dt);
    if (this.prevFacing !== null && dt > 0) {
      let d = s.facing - this.prevFacing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.turn = damp(this.turn, d / dt, 6, dt);
    }
    this.prevFacing = s.facing;
    const w = this.runW;
    this.idleT += dt;
    const it = this.idleT;
    const breath = Math.sin(it * 2.1);

    // ---- locomotion: the baked mocap gait (data/gait.json), cadence locked to ground speed ----
    this.moveW = damp(this.moveW, s.moving ? 1 : 0, 9, dt);
    const m = this.moveW;
    const sp = Math.max(this.speed, 0.6);
    const kRun = clamp01((sp - GAIT.walk.speed) / (GAIT.run.speed - GAIT.walk.speed));
    const natural = GAIT.walk.speed + (GAIT.run.speed - GAIT.walk.speed) * kRun;
    // faster than the clip: longer strides a little, quicker steps mostly
    const cycle = (GAIT.walk.cycle + (GAIT.run.cycle - GAIT.walk.cycle) * kRun) * Math.pow(sp / natural, 0.35);
    this.gaitU = (this.gaitU + (sp * dt) / cycle) % 1;
    // base pose buffers are reused every frame (no per-frame allocation on the hot path)
    const gait = sampleGait(this.gaitU, kRun, this.buf.gait);
    const sway = Math.sin(it * 0.55);
    // standing pose: the neutral base plus the weapon's stance (data/weapon-holds.json stances)
    const idle = this.buf.idle;
    const stance = HOLDS.stances[this.holdFor()?.stance ?? 'relaxed'];
    for (const n of IDLE_BONES) {
      const o = idle[n], a = IDLE_BASE[n], d = stance[n] ?? ZERO3;
      o[0] = a[0] + d[0]; o[1] = a[1] + d[1]; o[2] = a[2] + d[2];
    }
    idle.legL[2] -= sway * 0.03;
    idle.legR[2] -= sway * 0.03;
    idle.armL[2] += 0.17 + breath * 0.012;
    idle.armR[2] -= 0.17 + breath * 0.012;
    idle.chest[0] += breath * 0.015;
    idle.head[1] += Math.sin(it * 0.31) * Math.sin(it * 0.17) * 0.35;
    idle.hips[2] += sway * 0.035;
    const pose = this.buf.pose;
    for (const n in pose) if (!(n in idle) && n !== 'weapon') delete pose[n]; // channels an action or dash added
    for (const n in idle) {
      const i = idle[n], g = gait.pose[n], o = (pose[n] = this.buf.base[n]);
      for (let j = 0; j < 3; j++) o[j] = i[j] + (g[j] - i[j]) * m;
    }
    // the sword hand swings less and stays a little bent
    pose.armR[0] *= 1 - 0.3 * m;
    pose.elbowR[0] = Math.min(pose.elbowR[0], -0.22 - 0.25 * m);
    pose.head[1] += this.lookYaw;
    pose.weapon = this.buf.weapon;
    pose.weapon[0] = 1.2 - 0.3 * m;
    let bodyY = gait.by * m + (1 - m) * ((stance.drop ?? 0) - 0.004 * (1 - breath));
    let bodyX = gait.bx * m + (1 - m) * (stance.shift ?? 0);
    let bodyRotZ = clampAbs(-this.turn * 0.045 * m, 0.18);
    let hipsSpinX = 0;
    let spin = 0;
    let ikL = null, ikR = null; // raw hand targets of the current action
    let swingW = 0, swingV = null, actionW = 0; // melee swing arc of the current action (actions.js swing/sw)

    // ---- dashes, rolls, leaps override the whole body ----
    const dash = s.dash;
    if (dash) {
      const t = clamp01(dash.t / dash.dur);
      if (dash.kind === 'roll') {
        hipsSpinX = t * Math.PI * 2;
        Object.assign(pose, { legL: [-1.5, 0, 0], legR: [-1.3, 0, 0], kneeL: [2.1, 0, 0], kneeR: [2.2, 0, 0], armL: [-0.9, 0, 0.3], armR: [-0.9, 0, -0.3], elbowL: [-1.4, 0, 0], elbowR: [-1.4, 0, 0], torso: [0.9, 0, 0], head: [0.4, 0, 0] });
        bodyY = -0.42 * Math.sin(Math.min(1, t * 1.15) * Math.PI);
      } else if (dash.kind === 'leap') {
        const crouch = t < 0.18 ? t / 0.18 : t > 0.82 ? (1 - t) / 0.18 : 0;
        const air = t >= 0.18 && t <= 0.82 ? Math.sin(((t - 0.18) / 0.64) * Math.PI) : 0;
        Object.assign(pose, {
          legL: [-0.6 * air - 0.5 * crouch, 0, 0],
          legR: [0.2 * air - 0.4 * crouch, 0, 0],
          kneeL: [1.2 * air + 1.1 * crouch, 0, 0],
          kneeR: [0.6 * air + 1.1 * crouch, 0, 0],
          armL: [-2.2 * air - 0.3, 0, 0.3],
          armR: [-2.4 * air - 0.3, 0, -0.3],
          elbowL: [-0.4, 0, 0],
          elbowR: [-0.4, 0, 0],
          torso: [0.35 * crouch - 0.15 * air, 0, 0],
        });
        bodyY = -0.3 * crouch;
        // leap slam: sword raised overhead in the air, chopped down on landing
        const land = t > 0.82 ? crouch : 0;
        for (const n of ['armR', 'elbowR', 'armL', 'elbowL', 'weapon', 'chest', 'head']) {
          if (LEAP.air[n]) pose[n] = lerp3(pose[n] || [0, 0, 0], LEAP.air[n], Math.min(1, air * 1.6));
          if (LEAP.land[n]) pose[n] = lerp3(pose[n] || [0, 0, 0], LEAP.land[n], land);
        }
        pose.torso[0] += 0.4 * land;
      } else if (dash.kind === 'blink') {
        // a quick crouch and tuck as the body vanishes
        const k = Math.sin(t * Math.PI);
        pose.torso[0] += 0.35 * k;
        pose.kneeL[0] += 0.6 * k;
        pose.kneeR[0] += 0.6 * k;
        pose.elbowL[0] -= 1.0 * k;
        pose.elbowR[0] -= 1.0 * k;
        bodyY -= 0.1 * k;
      } else {
        Object.assign(pose, { legL: [-0.7, 0, 0], legR: [0.75, 0, 0], kneeL: [0.8, 0, 0], kneeR: [0.4, 0, 0], armL: [0.9, 0, 0.35], armR: [0.9, 0, -0.35], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0], torso: [0.6, 0, 0], head: [-0.35, 0, 0] });
        bodyY = -0.08;
      }
    }

    // ---- keyframed action over the upper body (legs partially) ----
    if (this.action) {
      const a = this.action;
      a.t = (s.charging || s.channeling) ? Math.min(a.dur * a.hitAt * .92, a.t + dt) : a.t + dt;
      const act = ACTIONS[a.name];
      // stretch the keys so the hit key lands at hitAt
      const u = clamp01(a.t / a.dur), h = act.hit, ha = a.hitAt;
      const t = h <= 0 || ha <= 0 || ha >= 1 ? u : u < ha ? (u / ha) * h : h + ((u - ha) / (1 - ha)) * (1 - h);
      const ap = samplePose(act.keys, t);
      const fadeIn = clamp01(a.t / 0.06);
      const fadeOut = clamp01((a.dur - a.t) / 0.1);
      const wA = Math.min(fadeIn, fadeOut);
      spin = ap.spin ? ap.spin[0] : 0;
      ikL = ap.ikL;
      ikR = ap.ikR;
      actionW = wA;
      if (ap.sw && ap.swing) { swingW = ap.sw[0] * wA; swingV = ap.swing; }
      for (const n in ap) {
        if (n === 'spin') continue;
        const lower = n.startsWith('leg') || n.startsWith('knee');
        const k = lower ? wA * (1 - w * 0.7) : wA;
        const cur = pose[n] || [0, 0, 0];
        pose[n] = [cur[0] + (ap[n][0] - cur[0]) * k, cur[1] + (ap[n][1] - cur[1]) * k, cur[2] + (ap[n][2] - cur[2]) * k];
      }
      // keep the planted feet flat while the action bends the legs
      for (const sd of ['L', 'R']) {
        const leg = pose['leg' + sd], knee = pose['knee' + sd];
        if (leg && knee && (ap['leg' + sd] || ap['knee' + sd])) pose['foot' + sd][0] += (-(leg[0] + knee[0]) - pose['foot' + sd][0]) * wA;
      }
      if (pose.drop) bodyY += pose.drop[0];
      if (a.t >= a.dur) this.action = null;
    }
    // hit flinch (additive, decays)
    if (this.hurt > 0) {
      const k = this.hurt;
      pose.torso[0] -= 0.35 * k;
      pose.head[0] -= 0.28 * k;
      pose.chest[1] += 0.15 * k;
      this.hurt = Math.max(0, this.hurt - dt * 4);
    }

    // ---- apply ----
    applyPose(b, pose);
    b.hips.rotation.x = hipsSpinX;
    b.body.rotation.y = spin;
    b.body.position.y = bodyY;
    b.body.position.x = bodyX;
    b.body.rotation.z = damp(b.body.rotation.z, bodyRotZ, 8, dt);
    // death: fall backwards with a small bounce
    if (s.dead) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.55);
      const bounce = k >= 1 ? Math.max(0, Math.sin((this.deadT - 0.55) * 14) * Math.exp(-(this.deadT - 0.55) * 6) * 0.08) : 0;
      this.rig.root.rotation.x = -(k * k) * Math.PI * 0.48 + bounce;
      b.armL.rotation.z = 0.9 * k;
      b.armR.rotation.z = -0.9 * k;
    } else {
      this.deadT = 0;
      this.rig.root.rotation.x = 0;
    }
    // secondary motion: ponytail lags behind movement
    if (b.tail) {
      const tx = this.tailSpring.update(0.35 + this.speed * 0.06 + (s.dash ? 0.6 : 0), dt);
      const tz = this.tailSpringZ.update(-this.turn * 0.08, dt);
      b.tail.rotation.x = tx;
      b.tail.rotation.z = tz;
    }
    if (this.rig.setFace) this.rig.setFace(this.expression(dt, s));
    // ---- the weapon hand: a per-weapon carry (data/weapon-holds.json) when not acting, the swing
    // arc of a melee action, and the left hand on the haft of a two-handed weapon ----
    const hold = this.holdFor();
    const ikw = pose.ikw;
    const leftBusy = ikL && ikw?.[0] > 0.01 ? ikw[0] : 0;
    // carry weight: full when idle or moving, handing over to the action's own arm keys
    const busy = s.dead || (s.dash && s.dash.kind !== 'leap') || (this.action && (this.action.name === 'staffBolt' || this.action.name === 'bow'));
    const holdW = busy || !hold ? 0 : swingV ? 1 : s.dash ? 0 : 1 - actionW;
    if (b.weapon) b.weapon.position.copy(b.weapon.userData.rest.pos);
    // through a spell or shout the weapon keeps its carry angle (a staff stays upright, a heavy
    // weapon stays raised): only the hand moves. A two-handed weapon's left hand lets go meanwhile.
    const gesture = this.action && !swingV ? actionW : 0;
    const orientW = (hold?.castHold || hold?.grip !== undefined) && !busy && gesture > 0 ? 1 : holdW;
    if (b.weapon && (orientW > 0.01 || swingW > 0.01)) this.solveWeapon(hold, holdW, swingV, swingW, orientW);
    // the second hand: a two-handed weapon's haft, else the action's own reach (bow string, spells)
    const gripW = hold?.grip !== undefined && !s.dead ? Math.max(0, 1 - leftBusy - gesture) * (s.dash && s.dash.kind !== 'leap' ? 0 : 1) : pose.grip ? pose.grip[0] : 0;
    if ((ikw && (ikw[0] > 0.01 || ikw[1] > 0.01)) || gripW > 0.01) {
      const root = this.rig.root;
      root.updateMatrixWorld(true);
      if (ikR && ikw[1] > 0.01) reachArm(b, 'R', root.localToWorld(IK_T.fromArray(ikR)), ikw[1]);
      if (gripW > 0.01 && b.weapon) reachArm(b, 'L', b.weapon.localToWorld(IK_T.set(0, 0, hold?.grip ?? -0.11)), gripW);
      if (ikL && leftBusy > 0.01) reachArm(b, 'L', root.localToWorld(IK_T.fromArray(ikL)), leftBusy);
    }
    // a drawn bow stands upright and faces the target whatever the hand's angle
    if (b.weapon) {
      const aim = pose.aim ? pose.aim[0] : 0;
      if (aim > 0.01) {
        this.rig.root.updateMatrixWorld(true);
        b.handR.getWorldQuaternion(AIM_Q).invert().multiply(this.rig.root.getWorldQuaternion(AIM_R));
        b.weapon.quaternion.slerp(AIM_Q, aim);
        b.weapon.position.addScaledVector(IK_T.set(0, 0, -0.13).applyQuaternion(b.weapon.quaternion), aim);
      }
    }
    // Staff grip is independent of wrist rotation, like the bow's aim solve.
    // Only staff ready/Firebolt is corrected; melee and other skills stay authored.
    const staffSupport = b.weapon && this.rig.weaponKind === 'staff' && !s.dead && !s.dash && this.action?.name === 'staffBolt';
    if (staffSupport) {
      const root = this.rig.root, aim = pose.staffAim?.[0] ?? 0;
      STAFF_TIP.fromArray(STAFF_CAST.readyTip).lerp(STAFF_TARGET.fromArray(STAFF_CAST.castTip), aim);
      STAFF_DIR.fromArray(STAFF_CAST.shaftDirection).normalize();
      STAFF_GRIP.copy(STAFF_TIP).addScaledVector(STAFF_DIR, -STAFF_CAST.tip);
      root.updateMatrixWorld(true);
      reachArm(b, 'R', root.localToWorld(IK_T.copy(STAFF_GRIP)), 1);
      // Put the handle in the palm; orient the shaft in character space rather
      // than inheriting the downward sword-rest wrist angle.
      root.getWorldQuaternion(AIM_R).multiply(STAFF_Q.setFromUnitVectors(STAFF_Z, STAFF_DIR));
      b.handR.getWorldQuaternion(AIM_Q).invert().multiply(AIM_R);
      b.weapon.quaternion.copy(AIM_Q);
      b.weapon.position.fromArray(STAFF_CAST.palm);
      root.updateMatrixWorld(true);
      reachArm(b, 'L', b.weapon.localToWorld(IK_T.set(0,0,STAFF_CAST.supportGrip)), 1);
      root.updateMatrixWorld(true);
    }
    this.rig.syncSkin?.();
    if (staffSupport && this.rig.hairsample) {
      // Current main seats the weapon in the skinned right palm during syncSkin.
      // Follow that final shaft with the support arm without changing its grip.
      this.rig.root.updateMatrixWorld(true);
      reachArm(b, 'L', b.weapon.localToWorld(IK_T.set(0,0,STAFF_CAST.supportGrip)), 1);
      this.rig.syncSkin();
    }
  }

  /** This weapon's carry: two-handed when the type allows it and the left hand is free. */
  holdFor() {
    const h = HOLDS.holds[this.rig.weaponKind];
    if (!h) return null;
    return (h.two && !this.rig.offhandKind) || !h.one ? h.two : h.one;
  }

  /**
   * Put the right palm and the weapon's long axis where the carry (weight holdW) or the swing
   * arc (weight swingW) wants them, in body space so they follow the body's bob and spin. The
   * blade points out along the arc with its edge leading, so it traces the slash crescent.
   */
  solveWeapon(hold, holdW, swingV, swingW, orientW = holdW) {
    const b = this.b, body = b.body;
    this.rig.root.updateMatrixWorld(true);
    if (hold) {
      W_HAND.fromArray(hold.hand);
      W_DIR.fromArray(hold.dir).normalize();
      W_UP.set(0, 1, 0);
    }
    if (swingV && swingW > 0.01) {
      const [a, e, y] = swingV, r = HOLDS.swing.radius, ce = Math.cos(e);
      W_A.set(Math.sin(a) * r, y, Math.cos(a) * r);
      W_B.set(Math.sin(a) * ce, Math.sin(e), Math.cos(a) * ce); // radial blade
      W_T.set(Math.cos(a), 0, -Math.sin(a)); // the way the hand travels as the angle grows
      W_N.crossVectors(W_B, W_T).normalize(); // swing plane normal: the blade's flat
      const k = hold ? swingW : 1;
      if (hold) {
        W_HAND.lerp(W_A, k);
        W_DIR.lerp(W_B, k).normalize();
        W_UP.lerp(W_N, k).normalize();
      } else {
        W_HAND.copy(W_A); W_DIR.copy(W_B); W_UP.copy(W_N);
      }
    }
    const w = Math.max(holdW, swingW), wo = Math.max(orientW, swingW);
    if (w > 0.01) reachArm(b, 'R', body.localToWorld(IK_T.copy(W_HAND)), w);
    // weapon frame: +Z along the blade, +Y the flat's normal
    if (Math.abs(W_UP.dot(W_DIR)) > 0.97) W_UP.set(0, 0, 1);
    W_X.crossVectors(W_UP, W_DIR).normalize();
    W_UP.crossVectors(W_DIR, W_X);
    W_M.makeBasis(W_X, W_UP, W_DIR);
    W_Q.setFromRotationMatrix(W_M);
    body.getWorldQuaternion(AIM_R).multiply(W_Q);
    b.handR.updateMatrixWorld(true);
    b.handR.getWorldQuaternion(AIM_Q).invert().multiply(AIM_R);
    b.weapon.quaternion.slerp(AIM_Q, wo);
  }

  /** Painted-face expression: blinks, a fierce look while attacking, a wince when hit. */
  expression(dt, s) {
    this.blinkT -= dt;
    this.blink -= dt;
    if (this.blinkT < 0) {
      this.blink = 0.13;
      this.blinkT = 2 + Math.random() * 3.5;
    }
    if (s.dead) return 'blink';
    if (this.hurt > 0.35 || this.action?.name === 'hurt') return 'hurt';
    if (this.action && FIERCE.has(this.action.name)) return 'attack';
    return this.blink > 0 ? 'blink' : 'open';
  }
}

const FIERCE = new Set(['staffBolt', 'slashA', 'slashB', 'slashC', 'heavyA', 'heavyB', 'heavyC', 'stabA', 'stabB', 'stabC', 'whirl', 'warcry', 'bow', 'throw', 'bolt', 'zap', 'slam', 'nova', 'sow', 'hex']);
const IK_T = new THREE.Vector3();
const W_HAND = new THREE.Vector3(), W_DIR = new THREE.Vector3(), W_UP = new THREE.Vector3(), W_X = new THREE.Vector3();
const W_A = new THREE.Vector3(), W_B = new THREE.Vector3(), W_T = new THREE.Vector3(), W_N = new THREE.Vector3();
const W_M = new THREE.Matrix4(), W_Q = new THREE.Quaternion();
const AIM_Q = new THREE.Quaternion();
const AIM_R = new THREE.Quaternion();
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

const IDLE_BONES = ['legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR', 'armL', 'armR', 'elbowL', 'elbowR', 'handL', 'handR', 'torso', 'chest', 'head', 'hips'];
const ZERO3 = [0, 0, 0];
// the neutral standing pose; stances add to it
const IDLE_BASE = Object.fromEntries(IDLE_BONES.map((n) => [n, [0, 0, 0]]));
IDLE_BASE.kneeL[0] = IDLE_BASE.kneeR[0] = 0.04;
IDLE_BASE.armL[0] = IDLE_BASE.armR[0] = -0.05;
IDLE_BASE.elbowL[0] = IDLE_BASE.elbowR[0] = -0.22;
IDLE_BASE.torso[0] = 0.05;

/** Per-animator scratch arrays for the locomotion pose. */
function poseBuffers() {
  const set = (f) => Object.fromEntries(IDLE_BONES.map((n) => [n, f(n)]));
  const idle = set(() => [0, 0, 0]); // IDLE_BASE + stance, rewritten every frame
  return { idle, base: set(() => [0, 0, 0]), pose: {}, weapon: [1.2, 0, 0], gait: { pose: set(() => [0, 0, 0]), bx: 0, by: 0 } };
}

/** Gait pose at cycle position u (0..1), blended walk -> run by k, written into out. */
function sampleGait(u, k, out) {
  const pose = out.pose;
  for (const n in pose) pose[n][0] = pose[n][1] = pose[n][2] = 0;
  let bx = 0, by = 0;
  for (const [table, wt] of [[GAIT.walk, 1 - k], [GAIT.run, k]]) {
    if (wt <= 0) continue;
    const n = table.body.length;
    const f = u * n, i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, t = f - Math.floor(f);
    for (const name in table.bones) {
      const a = table.bones[name][i0], b = table.bones[name][i1];
      const p = pose[name];
      if (!p) continue;
      for (let j = 0; j < 3; j++) p[j] += (a[j] + (b[j] - a[j]) * t) * wt;
    }
    bx += (table.body[i0][0] + (table.body[i1][0] - table.body[i0][0]) * t) * wt;
    by += (table.body[i0][1] + (table.body[i1][1] - table.body[i0][1]) * t) * wt;
  }
  out.bx = bx;
  out.by = by;
  return out;
}

function clampAbs(v, m) {
  return v > m ? m : v < -m ? -m : v;
}

/** Update the scarf ribbon in world space. */
export function updateScarf(rig, dt, speed) {
  if (!rig.scarf) return;
  rig.root.updateMatrixWorld(true);
  const anchor = new THREE.Vector3();
  rig.scarfAnchor.getWorldPosition(anchor);
  const q = new THREE.Quaternion();
  rig.root.getWorldQuaternion(q);
  const back = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  rig.scarf.update(dt, anchor, back, side, Math.min(2, speed * 0.2));
}

export { setFlash };

const STAFF_TIP = new THREE.Vector3(), STAFF_TARGET = new THREE.Vector3();
const STAFF_DIR = new THREE.Vector3(), STAFF_GRIP = new THREE.Vector3();
const STAFF_Z = new THREE.Vector3(0,0,1), STAFF_Q = new THREE.Quaternion();
