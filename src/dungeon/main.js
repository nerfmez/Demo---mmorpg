// Pearlshell Grotto (dungeon.html): the dungeon inside the game's Singing Conch, on its own page.
// The game opens it from the conch (save.js stashDungeon: slot or unsaved character, the hero's
// look and gear); the hero starts at the spawn and the pearl gate goes back to the game beside the
// conch. Opened directly (no trip) it is a preview and the gate leads to the title. The monsters only
// idle for now; the boss sleeps in its shell until the hero talks to the pearl on the throne. The rules are
// src/core/dungeon.js; this page only reads them, draws and takes input. ?view=overview starts in
// the whole-map view, ?post=0 turns the screen grade off.
import * as THREE from 'three';
import '@fontsource/mitr/thai-400.css';
import '@fontsource/mitr/latin-400.css';
import GROTTO from '../../data/dungeons/shell-grotto.json';
import RENDERING from '../../data/rendering.json';
import MODELS from '../../data/models.json';
import { createDungeon } from '../core/dungeon.js';
import { peekDungeon, leaveDungeon } from '../save.js';
import { buildGrottoScene } from '../render/grotto/index.js';
import { buildHumanoid, HumanoidAnimator, DEFAULT_LOOK } from '../render/hero.js';
import { loadModels } from '../render/models.js';
import { disposeObject } from '../render/dispose.js';
import { PostFX } from '../render/post.js';
import { GAME_CAMERA_OFFSET } from '../render/game-camera.js';
import { glowTexture } from '../render/grotto/textures.js';
import { loadGrottoKit } from '../render/grotto/kit.js';
import { loadGrottoCave } from '../render/grotto/cave.js';
import { loadGiantClam } from '../render/grotto/clam.js';
import { loadGlowCorals } from '../render/grotto/corals.js';
import { loadPaintedProps } from '../render/grotto/painted.js';
import { loadGrottoMonsters } from '../render/grotto/monsters.js';

const params = new URLSearchParams(location.search);
const trip = peekDungeon();
const SPEED = 6; // m/s, the game's moveSpeed (data/progression.json)
const $ = (id) => document.getElementById(id);

// ---------- renderer ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.info.autoReset = false; // counted per frame (scene, shadows and screen grade together)
renderer.shadowMap.type = THREE.PCFShadowMap;
const usePost = params.get('post') !== '0';
const post = usePost ? new PostFX(renderer, { ...RENDERING.post, hazeAmount: 0.08, sunWash: 0 }) : null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 400);

const hemi = new THREE.HemisphereLight('#ffffff', '#333333', 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------- the grotto (the game outside is the Singing Conch) ----------
const maps = { inside: createDungeon(GROTTO.inside, GROTTO) };
// the scene is built behind the loading card, once the Blender models (models/grotto) have loaded
let views = null;
const woken = new Set(); // what the talking props have woken (the boss)
function buildViews(kit, cave, clam, corals, painted, monsters) {
  views = { inside: buildGrottoScene(maps.inside, { motes: 420, kit, cave, clam, corals, painted, monsters }) };
  for (const v of Object.values(views)) { v.root.visible = false; scene.add(v.root); }
}

// a small warm light that walks with the hero: the cave is dark away from its lamps
const heroLight = new THREE.PointLight('#ffffff', 0, 8, 1.6);
scene.add(heroLight);

// ---------- hero ----------
let hero = null, heroAnim = null;
function buildHero() {
  const action = heroAnim?.action || null, pos = hero?.root.position.clone(), rot = hero?.root.rotation.y ?? 0;
  if (hero) disposeObject(hero.root);
  // the game's hero as it went in (look and gear from the trip); a direct preview uses the default
  hero = buildHumanoid(trip?.look || DEFAULT_LOOK, trip?.gear || { weapon: 'staff', armor: 'tunic', helm: null, bases: {} });
  heroAnim = new HumanoidAnimator(hero);
  heroAnim.action = action;
  hero.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  if (pos) hero.root.position.copy(pos);
  hero.root.rotation.y = rot;
  scene.add(hero.root);
}
buildHero();
const modelsReady = loadModels({ characters: { hero_base: MODELS.characters.hero_base, hero_chibi: MODELS.characters.hero_chibi, hero_chibi_hair: MODELS.characters.hero_chibi_hair }, weapons: MODELS.weapons }, { onWeaponReady: () => buildHero() })
  .then(() => buildHero())
  .catch((e) => console.warn('hero models', e));

// ripples where the hero wades
const ripple = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.75, 28), new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#dffcff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
ripple.rotation.x = -Math.PI / 2;
ripple.renderOrder = 7;
scene.add(ripple);

// ---------- state ----------
const state = {
  where: 'inside',
  pos: { x: 0, z: 0, y: 0 },
  facing: 0,
  zoom: 0.8,
  overview: params.get('view') === 'overview',
  region: null,
  armed: true, // a door works once the hero has stepped off the arrival spot
  busy: false,
  speed: 0,
};

function enter(where, spawn, facing) {
  views[state.where].root.visible = false;
  state.where = where;
  const map = maps[where], view = views[where], look = map.def.look;
  view.root.visible = true;
  scene.background = new THREE.Color(look.background);
  scene.fog = new THREE.Fog(look.fog[0], look.fog[1], look.fog[2]);
  if (post) {
    // the map grades its own glow: the dark cave lets its emissive corals and pearls bloom
    post.setHaze(scene.fog.color);
    const g = { ...RENDERING.post, ...look.post };
    post.compositeMat.uniforms.uGlow.value = g.glow;
    post.compositeMat.uniforms.uVignette.value = g.vignette;
    post.glowMat.uniforms.uThreshold.value = g.glowThreshold;
  }
  hemi.color.set(look.hemi[0]);
  hemi.groundColor.set(look.hemi[1]);
  hemi.intensity = look.hemi[2];
  sun.color.set(look.sun[0]);
  sun.intensity = look.sun[1];
  const [hc, hi, hr] = look.heroLight || ['#ffffff', 0, 1];
  heroLight.color.set(hc);
  heroLight.intensity = hi;
  heroLight.distance = hr;
  state.sunDir = new THREE.Vector3(...look.sun[2]).normalize();
  let [x, z] = spawn || map.def.spawn;
  // never stand on nothing: a spot that cannot be stood on moves to the nearest one that can
  for (let r = 0, a = 0; Number.isNaN(map.landY(x, z)) && r < 12; a += 0.7) {
    if (a > Math.PI * 2) { a = 0; r += 0.5; }
    const [sx, sz] = spawn || map.def.spawn;
    x = sx + Math.cos(a) * r; z = sz + Math.sin(a) * r;
  }
  state.pos.x = x; state.pos.z = z;
  state.pos.y = map.landY(x, z);
  state.facing = facing ?? map.def.spawnFacing ?? 0;
  state.region = null;
  $('region').textContent = '';
  state.armed = false;
  hero.root.position.set(x, state.pos.y, z);
  hero.root.rotation.y = state.facing;
  snapCamera = true;
}

// ---------- input: keyboard and a floating joystick on the left half ----------
const keys = new Set();
addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); if (e.key === ' ' || e.key === 'Enter') doAction(); });
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const joy = { id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
const joyEl = $('joy'), knob = joyEl.querySelector('i');
canvas.addEventListener('pointerdown', (e) => {
  if (joy.id !== null || e.clientX > innerWidth * 0.6) return;
  joy.id = e.pointerId; joy.x0 = e.clientX; joy.y0 = e.clientY; joy.dx = joy.dy = 0;
  joyEl.style.left = `${e.clientX}px`; joyEl.style.top = `${e.clientY}px`;
  joyEl.classList.add('show');
  canvas.setPointerCapture(e.pointerId);
  $('help').style.display = 'none';
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.x0, dy = e.clientY - joy.y0;
  const l = Math.hypot(dx, dy), max = 52;
  if (l > max) { dx *= max / l; dy *= max / l; }
  joy.dx = dx / max; joy.dy = dy / max;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
});
const joyEnd = (e) => {
  if (e.pointerId !== joy.id) return;
  joy.id = null; joy.dx = joy.dy = 0;
  knob.style.transform = '';
  joyEl.classList.remove('show');
};
canvas.addEventListener('pointerup', joyEnd);
canvas.addEventListener('pointercancel', joyEnd);

$('zoomIn').onclick = () => { state.zoom = Math.max(0.45, state.zoom - 0.15); };
$('zoomOut').onclick = () => { state.zoom = Math.min(1.5, state.zoom + 0.15); };
const overviewBtn = $('overview');
overviewBtn.onclick = () => { state.overview = !state.overview; overviewBtn.classList.toggle('on', state.overview); };
overviewBtn.classList.toggle('on', state.overview);
const actionBtn = $('action');
actionBtn.onclick = () => doAction();

// messages time out on the wall clock, not game time
let toastTimer = 0, bannerTimer = 0;
function toast(text, seconds = 3) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), seconds * 1000);
}
function banner(r) {
  $('banner').innerHTML = `${r.nameTh}<small>${r.name}</small>`;
  $('banner').classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => $('banner').classList.remove('show'), 2600);
}

/** The contextual button: talk to the pearl, or go through a door. */
function currentAction() {
  const map = maps[state.where];
  const talker = map.talkAt(state.pos.x, state.pos.z, woken);
  if (talker) return { label: talker.talk.labelTh, run: () => talk(talker) };
  const door = (map.def.links || []).find((l) => !l.secret && Math.hypot(state.pos.x - l.at[0], state.pos.z - l.at[1]) <= l.r + 2.2);
  if (door) return { label: door.labelTh, run: () => travel(door) };
  return null;
}
function doAction() { const a = currentAction(); if (a && !state.busy) a.run(); }

function talk(prop) {
  woken.add(prop.talk.wakes);
  if (prop.talk.wakes === 'bossSnail') views[state.where].boss?.wake();
  toast(prop.talk.lineTh, 4.5);
}

function travel(link) {
  if (state.busy) return;
  state.busy = true;
  $('fade').classList.add('on');
  if (link.to === 'game') {
    // back out of the conch: the game reloads the character beside it (or the title for a preview)
    leaveDungeon();
    setTimeout(() => location.assign(new URL('./', location.href).href), 380);
    return;
  }
  setTimeout(() => {
    enter(link.to, link.spawn, link.facing);
    $('fade').classList.remove('on');
    state.busy = false;
  }, 380);
}

// ---------- camera ----------
let snapCamera = true;
const camTarget = new THREE.Vector3(), camWant = new THREE.Vector3(), lookAt = new THREE.Vector3(), tmp = new THREE.Vector3();
function overviewPose(map) {
  const { minX, maxX, minZ, maxZ } = map.bounds;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, w = maxX - minX, d = maxZ - minZ;
  const aspect = camera.aspect, fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = Math.max(d / (2 * Math.tan(fov / 2)) * 1.1, w / (2 * Math.tan(fov / 2) * aspect)) * 1.12;
  const pitch = THREE.MathUtils.degToRad(58);
  lookAt.set(cx, 0, cz + d * 0.04);
  return tmp.set(cx, Math.sin(pitch) * dist, cz + Math.cos(pitch) * dist);
}
function updateCamera(dt) {
  const map = maps[state.where];
  if (state.frame) {
    // a fixed review camera (window.__grotto.frame): target, distance, pitch
    const [x, y, z, dist, pitch] = state.frame, a = THREE.MathUtils.degToRad(pitch);
    lookAt.set(x, y, z);
    camTarget.copy(lookAt);
    camWant.set(x, y + Math.sin(a) * dist, z + Math.cos(a) * dist);
  } else if (state.overview) {
    camWant.copy(overviewPose(map));
    camTarget.lerp(lookAt, snapCamera ? 1 : 1 - Math.exp(-4 * dt));
  } else {
    lookAt.set(state.pos.x, state.pos.y + 0.8, state.pos.z);
    camTarget.lerp(lookAt, snapCamera ? 1 : 1 - Math.exp(-8 * dt));
    camWant.copy(camTarget).addScaledVector(GAME_CAMERA_OFFSET, state.zoom);
  }
  camera.position.lerp(camWant, snapCamera ? 1 : 1 - Math.exp(-6 * dt));
  // the fog belongs to the play camera; the whole-map view looks from much farther
  const fog = maps[state.where].def.look.fog, far = state.overview || state.frame ? camera.position.distanceTo(camTarget) : 0;
  scene.fog.near = fog[1] + far;
  scene.fog.far = fog[2] + far * 1.4;
  camera.lookAt(camTarget);
  snapCamera = false;
  // the shadow box follows what the camera looks at
  sun.target.position.copy(camTarget);
  sun.position.copy(camTarget).addScaledVector(state.sunDir, 40);
  const span = state.overview ? 110 : 26;
  if (sun.shadow.camera.right !== span) Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, far: state.overview ? 200 : 90 }), sun.shadow.camera.updateProjectionMatrix();
}

// ---------- frame ----------
function step(dt, t) {
  const map = maps[state.where];
  let mx = joy.dx, mz = joy.dy;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (keys.has('w') || keys.has('arrowup')) mz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) mz += 1;
  const l = Math.hypot(mx, mz);
  const moving = l > 0.15 && !state.busy;
  const before = { x: state.pos.x, z: state.pos.z };
  if (moving) {
    const k = Math.min(1, l) / l;
    mx *= k; mz *= k;
    state.facing = Math.atan2(mx, mz);
    map.move(state.pos, mx * SPEED * dt, mz * SPEED * dt);
  }
  state.speed = dt > 0 ? Math.hypot(state.pos.x - before.x, state.pos.z - before.z) / dt : 0;
  hero.root.position.set(state.pos.x, state.pos.y, state.pos.z);
  heroLight.position.set(state.pos.x, state.pos.y + 2.4, state.pos.z + 0.6);
  let d = state.facing - hero.root.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  hero.root.rotation.y += d * Math.min(1, dt * 14);
  heroAnim.update(dt, { speed: state.speed, facing: hero.root.rotation.y, moving: moving && state.speed > 0.3, dash: null, dead: false, time: t });

  // wading ripples
  const s = map.surfaceAt(state.pos.x, state.pos.z);
  const wet = s?.waterY != null && s.waterY > state.pos.y + 0.05;
  ripple.visible = wet;
  if (wet) {
    ripple.position.set(state.pos.x, s.waterY + 0.02, state.pos.z);
    const k = (t * (moving ? 1.6 : 0.7)) % 1;
    ripple.scale.setScalar(0.8 + k * (moving ? 1.6 : 0.8));
    ripple.material.opacity = (1 - k) * 0.6;
  }

  // doors: walking into one goes through (once the hero has left the arrival spot)
  const door = map.linkAt(state.pos.x, state.pos.z);
  if (!door) state.armed = true;
  else if (state.armed && !state.busy) travel(door);
  const region = map.regionAt(state.pos.x, state.pos.z);
  if (region && region !== state.region) banner(region);
  if (region !== state.region) $('region').textContent = region?.nameTh ?? '';
  state.region = region;
  const a = currentAction();
  actionBtn.classList.toggle('show', !!a);
  if (a) actionBtn.textContent = a.label;
  views[state.where].update(dt, t);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const pr = renderer.getPixelRatio();
  post?.setSize(w * pr, h * pr);
}
addEventListener('resize', resize);
resize();

let last = performance.now(), time = 0, frames = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // the first rAF time can precede performance.now()
  last = now;
  time += dt;
  step(dt, time);
  updateCamera(dt);
  renderer.info.reset();
  if (post) post.render(scene, camera, time); else renderer.render(scene, camera);
  if (++frames === 2) $('loading').classList.add('gone');
  requestAnimationFrame(frame);
}
Promise.all([
  loadGrottoKit().catch((e) => { console.warn('grotto kit', e); return null; }),
  loadGrottoCave().catch((e) => { console.warn('grotto cave', e); return null; }),
  loadGiantClam().catch((e) => { console.warn('giant clam', e); return null; }),
  loadGlowCorals().catch((e) => { console.warn('glow corals', e); return null; }),
  loadPaintedProps().catch((e) => { console.warn('grotto props', e); return null; }),
  loadGrottoMonsters().catch((e) => { console.warn('grotto monsters', e); return null; }),
])
  .then(([kit, cave, clam, corals, painted, monsters]) => {
    buildViews(kit, cave, clam, corals, painted, monsters);
    enter(state.where);
    last = performance.now();
    requestAnimationFrame(frame);
  });

// for the focused capture (tests/browser/grotto.mjs)
window.__grotto = {
  state, maps, trip, woken, ready: () => modelsReady,
  get views() { return views; },
  go(where, x, z, facing = 0) { enter(where, [x, z], facing); },
  overview(on = true) { state.overview = on; overviewBtn.classList.toggle('on', on); snapCamera = true; },
  zoom(z) { state.zoom = z; snapCamera = true; },
  info: () => ({ ...renderer.info.render }),
  frame(x, y, z, dist = 14, pitch = 30) { state.frame = x == null ? null : [x, y, z, dist, pitch]; snapCamera = true; },
};
