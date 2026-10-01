// Scene assembly: renderer, 3/4 top-down camera, light, and syncing game entities to models.
// "Change the camera, not the style": high ARPG camera, same anime cel look.
// The view is created for a world first (the title screen shows the real map), then a game is
// attached. Camera modes: 'title' (slow flyover), 'create' (close-up of the hero preview),
// 'game' (follow).
import * as THREE from 'three';
import { createTerrain, createWater } from './ground.js';
import { createEnvironment } from './environment.js';
import { batchStatic } from './static-batch.js';
import { bakeGrassColours } from './grass.js';
import { buildHumanoid, HumanoidAnimator, updateScarf, DEFAULT_LOOK } from './hero.js';
import { buildMonster, monsterScale } from './monsters.js';
import { monsterModel } from './models.js';
import { disposeObject } from './dispose.js';
import { Vfx, glowTexture } from './vfx.js';
import { toon, seeUniforms } from './toon.js';
import { timeUniform, attachWindShadow } from './patch.js';
import { renderConfig, qualitySettings, lightingSettings, applyShadowQuality } from './settings.js';
import { syncPaintedLighting } from './painted.js';
import { makeDecal, conform } from './decal.js';
import { setFlash, damp } from './rig.js';
import { dropSprite } from './dropart.js';
import { animeStudy } from './anime-study.js';
import { residentTool } from './districts.js';

const CAM_OFFSET = new THREE.Vector3(0, 19, 13.5);
const VIEW_RADIUS = 58; // monsters farther than this have no model (level of detail)
// Monster models are skinned, so three.js cannot cull them (frustumCulled is off); the view tests a
// sphere around each one against the camera instead. The margin keeps a monster just past the edge
// drawn, so its shadow and wind-up do not pop in.
const CULL_MARGIN = 2;
const _frustum = new THREE.Frustum();
const _viewProj = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

const ZONE_FOG = {
  settlement: '#c4e4ee',
  meadow: '#c4e6ef',
  glade: '#cfe6e8',
  forest: '#a9d2bb',
  wolf_den: '#a4c4b2',
  wetland: '#b6dde0',
  highlands: '#d3e3ec',
  ruins: '#d6d0e8',
  coast: '#c6e8f2',
};

export class View {
  constructor(canvas, world, { quality = 'high' } = {}) {
    this.world = world;
    this.game = null;
    this.quality = qualitySettings(quality).name;
    this.mode = 'title';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: renderConfig.nativeAntialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Native AA is fixed for the context lifetime. All tiers use the same request,
    // so low->high and high->low cannot silently retain different context attributes.
    this.renderer.shadowMap.enabled = qualitySettings(this.quality).shadowMapSize > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.fogColor = new THREE.Color(ZONE_FOG.settlement);
    this.scene.background = this.fogColor.clone();
    this.scene.fog = new THREE.Fog(this.fogColor.clone(), 44, 84);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 220);
    this.zoom = 1;
    const [sx, sz] = world.data.playerSpawn;
    this.camTarget = new THREE.Vector3(sx, world.groundY(sx, sz), sz);
    this.shake = 0;
    this.time = 0;

    const light = lightingSettings(animeStudy ? renderConfig.lighting.active : 'legacy');
    this.lightingProfile = light.name;
    this.hemisphere = new THREE.HemisphereLight(light.ambientSky, light.ambientGround, light.ambientIntensity);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight(light.sunColor, light.sunIntensity);
    this.sun.castShadow = true;
    applyShadowQuality(this.renderer, this.sun, this.quality);
    const sc = this.sun.shadow.camera;
    sc.left = -28;
    sc.right = 28;
    sc.top = 24;
    sc.bottom = -24;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = renderConfig.shadow.bias;
    this.sun.shadow.normalBias = renderConfig.shadow.normalBias;
    this.sun.shadow.intensity = light.shadowIntensity ?? 1;
    this.scene.add(this.sun, this.sun.target);
    syncPaintedLighting(this.hemisphere, this.sun);

    this.terrain = createTerrain(world);
    this.scene.add(this.terrain.group);
    const env = createEnvironment(world);
    this.scene.add(createWater(world, env.root));
    env.root.traverse(attachWindShadow); // one-time setup; no per-frame allocation
    bakeGrassColours(this.renderer, env.root, world); // one GPU pass; blades then just read colours
    // after the water-contact bake: merge fixed scenery that shares a material, per map cell
    this.staticBatch = batchStatic(env.root, { exclude: [...(env.waypoints?.values?.() || [])] });
    this.scene.add(env.root);
    this.waypointStones = env.waypoints;

    this.vfx = new Vfx(this.scene, world);

    // town NPCs
    const t = world.data.town;
    this.npcs = [];
    const smith = buildHumanoid({ skin: '#e8b890', hair: '#8a4a2a', tunic: '#d9c7a8', hairStyle: 'short' }, {}, { npc: true, apron: '#5b3a22', beard: '#8a4a2a' });
    smith.root.position.set(t.workbench[0] + 1.6, world.groundY(t.workbench[0] + 1.6, t.workbench[1] + 0.2), t.workbench[1] + 0.2);
    smith.root.rotation.y = -Math.PI / 2 - 0.4;
    smith.job = 'smith';
    const trainer = buildHumanoid({ skin: '#f6d2b5', hair: '#f0d48a', tunic: '#fbf6ee', scarf: '#3b6ad0', eyes: '#3a6ad0' }, {}, { npc: true, longHair: true, straps: true, scarf: true });
    trainer.root.position.set(t.trainer[0] + 1.2, world.groundY(t.trainer[0] + 1.2, t.trainer[1] - 0.2), t.trainer[1] - 0.2);
    trainer.root.rotation.y = -Math.PI / 2 + 0.3;
    trainer.job = 'trainer';
    const townNpcs = [smith, trainer];
    for (const resident of t.residents || []) {
      const n = buildHumanoid(resident.look, {}, { npc: true, ...(resident.outfit || {}) });
      n.root.position.set(resident.x, world.groundY(resident.x, resident.z), resident.z);
      n.root.rotation.y = resident.angle;
      n.root.userData.residentId = resident.id;
      n.scenery = true;
      n.activity = resident.activity;
      if (resident.tool) n.bones.handR.add(residentTool(resident.tool));
      townNpcs.push(n);
    }
    for (const n of townNpcs) {
      n.anim = new HumanoidAnimator(n);
      n.idleState = { speed: 0, facing: n.root.rotation.y, moving: false, dash: null, dead: false, time: 0 };
      this.scene.add(n.root);
      if (n.scarf) this.scene.add(n.scarf.mesh);
      this.npcs.push(n);
    }
    this.npcMarkers = [this.marker(t.workbench[0], t.workbench[1], '#ffd166'), this.marker(t.trainer[0], t.trainer[1], '#8fd0ff')];

    this.monsterViews = new Map();
    this.cullMonsters = true; // skip monster models outside the camera (off only to measure)
    this.allyViews = new Map();
    this.dropViews = new Map();

    // decals: target ring, aim reticle, aim arrow
    this.targetRing = makeDecal(new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff5a4a', transparent: true, opacity: 0.85, depthWrite: false }), world, 0.07);
    this.scene.add(this.targetRing);
    this.reticle = makeDecal(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.8, depthWrite: false }), world, 0.09);
    this.reticle.visible = false;
    this.scene.add(this.reticle);
    this.aimArrow = makeDecal(new THREE.PlaneGeometry(0.5, 1, 1, 10).rotateX(-Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.45, depthWrite: false }), world, 0.09);
    this.aimArrow.visible = false;
    this.scene.add(this.aimArrow);

    // campfire flame and house chimneys
    this.fires = [];
    if (world.data.camp) {
      const [fx, fz] = world.data.camp.fire;
      const f = this.vfx.sprite(0xffa040, 1.6, 0.9);
      f.position.set(fx, world.groundY(fx, fz) + 0.6, fz);
      this.scene.add(f);
      this.fires.push({ sprite: f, x: fx, z: fz });
    }
    this.chimneys = world.boxes.filter((b) => b.type === 'house').map((b) => new THREE.Vector3(b.x, world.groundY(b.x, b.z) + 4.9, b.z));
    this.ambientT = 0;

    this.raycaster = new THREE.Raycaster();
    this.resize();
  }

  /** Attach (or replace) the running game. */
  attachGame(game) {
    this.game = game;
    for (const v of this.monsterViews.values()) this.releaseRig(v.rig);
    this.monsterViews.clear();
    for (const v of this.allyViews.values()) this.releaseRig(v.rig);
    this.allyViews.clear();
    for (const v of this.dropViews.values()) disposeObject(v);
    this.dropViews.clear();
    this.setHeroLook(game.ch.appearance || DEFAULT_LOOK, game.gearLook());
    const p = game.player;
    this.heroY = this.world.groundY(p.x, p.z);
    this.camTarget.set(p.x, this.heroY, p.z);
  }

  /**
   * Once imported models have loaded: drop the pooled procedural rigs of the types that now have
   * a model, build and compile one model rig for each so the first encounter does not hitch, and
   * rebuild the ones already on screen. Other types keep their warmed pool.
   */
  refreshModelRigs() {
    const tmp = new THREE.Group();
    const [x, z] = this.world.data.playerSpawn;
    const fresh = [];
    for (const [key, pool] of this.rigPool || []) {
      const type = key.split('#')[0];
      if (!monsterModel(type) || pool.every((r) => r.model)) continue;
      for (const rig of pool) disposeObject(rig.root);
      this.rigPool.delete(key);
      const rig = buildMonster(type, 1, key.endsWith('#boss'));
      rig.root.position.set(x, this.world.groundY(x, z), z);
      tmp.add(rig.root);
      fresh.push(rig);
    }
    if (fresh.length) {
      this.scene.add(tmp);
      this.renderer.compile(this.scene, this.camera);
      tmp.removeFromParent();
      for (const rig of fresh) this.releaseRig(rig);
    }
    // monsters already on screen with the procedural body are rebuilt on the next frame
    for (const [id, mv] of this.monsterViews) {
      if (mv.rig.model || !monsterModel(mv.rig.type)) continue;
      disposeObject(mv.rig.root);
      disposeObject(mv.halo);
      this.monsterViews.delete(id);
    }
  }

  /** Monster models are pooled per type: building one costs time and GPU memory. */
  takeRig(type, level, boss) {
    const pool = this.rigPool?.get(type + (boss ? '#boss' : ''));
    const rig = pool?.pop();
    if (!rig) return buildMonster(type, level, boss);
    rig.baseScale = monsterScale(type, level, boss);
    rig.root.scale.setScalar(rig.baseScale);
    rig.root.rotation.set(0, 0, 0);
    rig.root.visible = true;
    setFlash(rig.material, 0, 0, 0);
    return rig;
  }

  releaseRig(rig) {
    rig.root.removeFromParent();
    this.rigPool = this.rigPool || new Map();
    const key = rig.type + (rig.boss ? '#boss' : '');
    const pool = this.rigPool.get(key) || [];
    if (pool.length < 6) {
      pool.push(rig);
      this.rigPool.set(key, pool);
    } else disposeObject(rig.root);
  }

  setHeroLook(look, gear = {}) {
    if (this.hero) {
      if (this.vfx.wardMesh) this.vfx.wardMesh.removeFromParent();
      disposeObject(this.hero.root);
      disposeObject(this.hero.scarf?.mesh);
    }
    this.hero = buildHumanoid(look, gear);
    this.heroAnim = new HumanoidAnimator(this.hero);
    this.scene.add(this.hero.root);
    if (this.hero.scarf) this.scene.add(this.hero.scarf.mesh);
    this.heroLookKey = JSON.stringify([look, gear]);
    if (this.vfx.wardMesh) this.hero.root.add(this.vfx.wardMesh);
  }

  marker(x, z, color) {
    const y = this.world.groundY(x, z);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(0.8, 0.8, 1);
    s.position.set(x, y + 3.2, z);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), toon(color, { emissive: color, emissiveIntensity: 0.6 }));
    gem.position.set(x, y + 3.2, z);
    gem.userData.baseY = y + 3.2;
    this.scene.add(s, gem);
    return gem;
  }

  /** Dynamic-resolution hook: 1 is the preset's full pixel ratio. */
  setRenderScale(scale) {
    if (scale === this.renderScale) return;
    this.renderScale = scale;
    this.resize();
  }

  resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    // dynamic resolution scales the preset's pixel ratio, never below 1 device pixel per CSS pixel
    const base = Math.min(window.devicePixelRatio || 1, qualitySettings(this.quality).pixelRatio);
    const dpr = Math.max(Math.min(1, base), base * (this.renderScale ?? 1));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 52 : 36;
    this.camera.updateProjectionMatrix();
    this.vfx.setPointScale(h * dpr);
  }

  setQuality(q) {
    const next = qualitySettings(q);
    if (next.name === this.quality) return;
    const wasEnabled = this.renderer.shadowMap.enabled;
    this.quality = next.name;
    applyShadowQuality(this.renderer, this.sun, this.quality);
    if (wasEnabled !== this.renderer.shadowMap.enabled) {
      const materials = new Set();
      this.scene.traverse(o => {
        for (const material of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) materials.add(material);
      });
      for (const material of materials) material.needsUpdate = true;
    }
    this.resize();
  }

  /** Screen point -> point on the terrain (ray marched against the heightfield). */
  screenToGround(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    let y = this.camTarget.y;
    const p = new THREE.Vector3();
    for (let i = 0; i < 5; i++) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
      if (!ray.intersectPlane(plane, p)) return null;
      const gy = this.world.surfaceY(p.x, p.z);
      if (Math.abs(gy - y) < 0.05) break;
      y = gy;
    }
    return p;
  }

  /** World point -> CSS pixel position. */
  project(x, y, z) {
    const v = (this._pv || (this._pv = new THREE.Vector3())).set(x, y, z).project(this.camera);
    // the canvas rect is read once per frame (render); reading it here per HP bar forced a layout each call
    const r = this.canvasRect || this.renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top, behind: v.z > 1 };
  }

  groundAt(x, z) {
    return this.world.surfaceY(x, z);
  }

  handleEvent(e) {
    const g = this.game;
    const v = this.vfx;
    switch (e.type) {
      case 'castStart':
        this.heroAnim.play(e.skill, e.total + 0.28, e.weapon, e.step, e.total, e.kind);
        v.beginCast(e, g.skills.find((s) => s && s.id === e.skill)?.element);
        if (e.kind === 'melee_arc' || e.kind === 'melee_nova') v.beginSwing(e, g.skills.find((s) => s && s.id === e.skill)?.element);
        break;
      case 'slash':
        v.slash(e, g.derived.weaponType);
        if (e.finisher) {
          this.addShake(e.hits ? 0.22 : 0.08);
          if (e.hits) this.hitStop = Math.max(this.hitStop || 0, 0.09);
        } else if (e.triggered) this.addShake(0.05);
        break;
      case 'whirl':
        v.whirl(e);
        break;
      case 'nova':
        v.nova(e);
        this.addShake(0.1);
        break;
      case 'chain':
        v.chain(e);
        break;
      case 'summon':
        v.summon(e);
        break;
      case 'buff':
        if (e.kind === 'war_cry') v.warcry(e);
        break;
      case 'curse':
        v.curse(e);
        break;
      case 'howl':
        v.howl(e);
        break;
      case 'lob':
        v.lob(e);
        break;
      case 'impact':
        v.impact(e);
        break;
      case 'hit': {
        v.hitSpark(e);
        const mv = this.monsterViews.get(e.id);
        if (mv && !e.dot) {
          mv.flash = 0.12;
          mv.hurt = 1;
          // jolt away from the hit, springs back in sync()
          const dx = e.x - (e.fromX ?? e.x);
          const dz = e.z - (e.fromZ ?? e.z);
          const d = Math.hypot(dx, dz) || 1;
          const k = (e.crit || e.heavy ? 0.42 : 0.2) * (mv.rig.boss ? 0.3 : 1);
          mv.kx = (mv.kx || 0) + (dx / d) * k;
          mv.kz = (mv.kz || 0) + (dz / d) * k;
        }
        if (!e.dot && !e.byAlly && (e.crit || e.heavy)) this.hitStop = Math.max(this.hitStop || 0, 0.06);
        if (e.crit) this.addShake(0.08);
        break;
      }
      case 'allyHit': {
        const av = this.allyViews.get(e.id);
        if (av) av.hurt = 1;
        break;
      }
      case 'burst':
        v.burst(e);
        if (e.kind === 'slam') this.addShake(0.45);
        else if (e.kind === 'stone_burst') this.addShake(0.12);
        break;
      case 'monsterSwing':
        v.monsterSwing({ ...e, type: g.monsterById(e.id)?.type });
        break;
      case 'ward':
        v.ward(e, this.hero.root);
        break;
      case 'movement':
        break;
      case 'blinkPlayer':
        v.blink(e.fromX, e.fromZ, e.x, e.z);
        break;
      case 'blink':
        v.blink(e.fromX, e.fromZ, e.x, e.z, 0x8fe4ff);
        break;
      case 'death':
        v.death(e, e.boss);
        if (e.boss) this.addShake(0.6);
        break;
      case 'levelup':
        v.levelUp(g.player.x, g.player.z);
        break;
      case 'playerHit':
        if (!e.dot && e.amount > 0) {
          this.heroAnim.hit();
          this.heroFlash = 0.15;
          this.addShake(Math.min(0.3, e.amount / g.player.maxHp));
        }
        break;
      case 'heal':
        v.heal(e.x, e.z);
        break;
      case 'pickup': {
        const dv = this.dropViews.get(e.id);
        if (dv) v.pickup(dv.position.x, dv.position.y, dv.position.z, dv.userData.color);
        break;
      }
      case 'stunned':
        v.fx.burst(e.x, this.groundAt(e.x, e.z) + 1.4, e.z, 10, { color: 0xfff2a0, size: 0.25, speed: 2, life: 0.6, up: 0.4 });
        this.addShake(0.15);
        break;
      case 'enrage':
        v.fx.burst(e.x, this.groundAt(e.x, e.z) + 2, e.z, 40, { color: 0xb89cff, size: 0.35, speed: 5, life: 0.8, up: 1 });
        this.addShake(0.3);
        break;
      case 'waypoint':
        v.waypointUnlock(e.x, e.z);
        break;
      case 'teleport':
        v.teleport(e.x, e.z);
        this.snapCamera();
        break;
      case 'respawn':
        this.snapCamera();
        break;
    }
  }

  snapCamera() {
    if (!this.game) return;
    const p = this.game.player;
    this.heroY = this.world.groundY(p.x, p.z);
    this.camTarget.set(p.x, this.heroY, p.z);
    this.hero?.scarf?.reset();
  }

  addShake(k) {
    this.shake = Math.min(0.8, this.shake + k);
  }

  lookYaw(facing, x, z, tx, tz) {
    let d = Math.atan2(tx - x, tz - z) - facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.max(-0.8, Math.min(0.8, d));
  }

  syncMonsters(dt, time) {
    const g = this.game;
    const p = g.player;
    const seen = new Set();
    // render() has already moved the camera for this frame
    this.camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_viewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    let drawn = 0;
    for (const m of g.monsters) {
      const far = Math.hypot(m.x - p.x, m.z - p.z) > VIEW_RADIUS;
      if (far && !this.monsterViews.has(m.id)) continue;
      if (Math.hypot(m.x - p.x, m.z - p.z) > VIEW_RADIUS + 10) continue;
      seen.add(m.id);
      let mv = this.monsterViews.get(m.id);
      if (!mv) {
        const rig = this.takeRig(m.type, m.level, m.boss);
        rig.root.position.set(m.x, this.groundAt(m.x, m.z), m.z);
        rig.root.rotation.y = m.facing;
        this.scene.add(rig.root);
        let halo = null;
        if (rig.halo) {
          halo = this.vfx.sprite(0x7fdcff, 1.9, 0.85);
          this.scene.add(halo);
        }
        mv = { rig, flash: 0, hurt: 0, spawnT: 0, lastAttack: null, y: rig.root.position.y, halo, prevFacing: m.facing, turn: 0 };
        this.monsterViews.set(m.id, mv);
      }
      const r = mv.rig;
      mv.spawnT += dt || 1 / 60; // models seen while paused still grow in
      if (m.windup) mv.lastAttack = m.windup.name;
      let d = m.facing - r.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.root.rotation.y += d * Math.min(1, dt * 12);
      mv.turn = damp(mv.turn, dt > 0 ? (d * Math.min(1, dt * 12)) / dt : 0, 6, dt);
      const gy = r.flyer || m.def.hover ? this.world.surfaceY(m.x, m.z) : this.world.groundY(m.x, m.z);
      mv.y = gy > mv.y ? damp(mv.y, gy, 20, dt) : damp(mv.y, gy, 12, dt);
      mv.kx = damp(mv.kx || 0, 0, 14, dt);
      mv.kz = damp(mv.kz || 0, 0, 14, dt);
      r.root.position.set(m.x + mv.kx, mv.y, m.z + mv.kz);
      mv.hurt = Math.max(0, mv.hurt - dt * 5);
      // off screen: not drawn and not posed (the simulation still moves it and lets it attack)
      const h = (r.height || 1.5) * (r.baseScale || 1);
      _sphere.center.set(r.root.position.x, r.root.position.y + h * 0.5, r.root.position.z);
      _sphere.radius = Math.max(1.2, h) + CULL_MARGIN;
      const onScreen = !this.cullMonsters || _frustum.intersectsSphere(_sphere);
      r.root.visible = onScreen;
      if (onScreen) drawn++;
      const tgt = m.targetUnit || p;
      if (onScreen) r.animate(
        r,
        {
          moving: m.moving && ['chase', 'idle', 'return', 'circle', 'retreat'].includes(m.state),
          speedFactor: m.aggro ? 1 : 0.4,
          state: m.state,
          windup: m.state === 'windup' && m.windup ? m.windup.name : null,
          windupT: m.stateT,
          windupTotal: m.windup?.total || 1,
          actT: m.stateT,
          actionTotal: m.melee ? m.def.attacks[m.melee.name].duration : m.stateDur,
          hitTime: m.melee ? m.def.attacks[m.melee.name].hitTime : 0,
          enraged: m.enraged,
          lastAttack: mv.lastAttack,
          hurt: mv.hurt,
          lookYaw: m.melee || (m.def.primaryAttack && m.windup && m.stateT >= m.windup.total * .55) ? 0 : m.aggro && !m.dead ? this.lookYaw(r.root.rotation.y, m.x, m.z, tgt.x, tgt.z) : 0,
          turn: mv.turn,
          alt: m.alt,
        },
        dt,
        time
      );
      let sc = r.baseScale * Math.min(1, 0.3 + mv.spawnT * 2.5);
      if (m.dead) {
        const k = Math.min(1, m.deathT / 1.4);
        sc *= 1 - k * 0.35;
        r.root.position.y = mv.y - k * k * 0.7;
        r.root.rotation.z = Math.min(1, m.deathT / 0.4) * 1.2;
      } else r.root.rotation.z = 0;
      r.root.scale.setScalar(sc);
      mv.flash = Math.max(0, mv.flash - dt);
      if (mv.flash > 0) setFlash(r.material, 0.55, 0, 0);
      else if (m.windup && m.state === 'windup') setFlash(r.material, 0, 0.12 + 0.12 * Math.max(0, Math.sin(time * 24)), 0);
      else if (m.statuses?.chill) setFlash(r.material, 0, 0, 0.25);
      else if (m.statuses?.hex) setFlash(r.material, 0, 0, 0.12);
      else setFlash(r.material, 0, 0, 0);
      if (mv.halo) {
        mv.halo.visible = !m.dead && onScreen;
        mv.halo.position.set(m.x, mv.y + 1.25 * r.baseScale, m.z);
        mv.halo.scale.setScalar((r.glowScale || 1.9) * r.baseScale);
      }
      // status sparkles
      if (m.statuses?.burn && Math.random() < dt * 8) this.vfx.fx.add(m.x + (Math.random() - 0.5) * 0.8, mv.y + 0.6 + Math.random() * 0.6, m.z + (Math.random() - 0.5) * 0.8, 0, 1.2, 0, { color: 0xff9a40, size: 0.22, life: 0.5 });
      if (m.statuses?.poison && Math.random() < dt * 6) this.vfx.fx.add(m.x + (Math.random() - 0.5) * 0.8, mv.y + 0.6 + Math.random() * 0.6, m.z + (Math.random() - 0.5) * 0.8, 0, 0.8, 0, { color: 0xa8e04a, size: 0.2, life: 0.6 });
      if (m.statuses?.hex && Math.random() < dt * 5) this.vfx.fx.add(m.x + (Math.random() - 0.5) * 0.6, mv.y + 1.4 * r.baseScale, m.z + (Math.random() - 0.5) * 0.6, 0, 0.5, 0, { color: 0xb88cff, size: 0.22, life: 0.6 });
    }
    this.monstersDrawn = drawn;
    for (const [id, mv] of this.monsterViews) {
      if (!seen.has(id)) {
        this.releaseRig(mv.rig);
        disposeObject(mv.halo);
        this.monsterViews.delete(id);
      }
    }
  }

  syncAllies(dt, time) {
    const g = this.game;
    const seen = new Set();
    for (const a of g.allies || []) {
      seen.add(a.id);
      let av = this.allyViews.get(a.id);
      if (!av) {
        const rig = this.takeRig(a.type, 1, false);
        rig.root.position.set(a.x, this.groundAt(a.x, a.z), a.z);
        rig.root.rotation.y = a.facing;
        this.scene.add(rig.root);
        av = { rig, hurt: 0, y: rig.root.position.y, spawnT: 0, turn: 0 };
        this.allyViews.set(a.id, av);
      }
      const r = av.rig;
      av.spawnT += dt || 1 / 60;
      let d = a.facing - r.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.root.rotation.y += d * Math.min(1, dt * 12);
      const gy = this.world.groundY(a.x, a.z);
      av.y = damp(av.y, gy, 16, dt);
      r.root.position.set(a.x, av.y, a.z);
      av.hurt = Math.max(0, av.hurt - dt * 5);
      r.animate(r, { moving: a.moving, speedFactor: 1.2, state: a.state === 'lunge' ? 'act' : a.state, windup: a.state === 'windup' ? 'bite' : null, windupT: a.stateT, windupTotal: 0.25, hurt: av.hurt, lookYaw: 0, turn: 0 }, dt, time);
      const fade = a.life < 1.2 ? Math.max(0.05, a.life / 1.2) : Math.min(1, av.spawnT * 3);
      r.root.scale.setScalar(r.baseScale * (0.4 + 0.6 * fade));
      if (Math.random() < dt * 12) this.vfx.fx.add(a.x + (Math.random() - 0.5) * 0.8, av.y + 0.5 + Math.random() * 0.7, a.z + (Math.random() - 0.5) * 0.8, 0, 0.6, 0, { color: 0x9fd8ff, size: 0.22, life: 0.5 });
    }
    for (const [id, av] of this.allyViews) {
      if (!seen.has(id)) {
        this.vfx.summon({ x: av.rig.root.position.x, z: av.rig.root.position.z });
        this.releaseRig(av.rig);
        this.allyViews.delete(id);
      }
    }
  }

  syncDrops(dt, time) {
    const g = this.game;
    const seen = new Set();
    for (const d of g.drops) {
      seen.add(d.id);
      let v = this.dropViews.get(d.id);
      if (!v) {
        v = this.makeDrop(d.item);
        v.userData.born = time;
        this.scene.add(v);
        this.dropViews.set(d.id, v);
      }
      const age = time - v.userData.born;
      const hop = age < 0.45 ? Math.sin((age / 0.45) * Math.PI) * 1.2 : 0;
      v.position.set(d.x, this.groundAt(d.x, d.z) + 0.35 + hop + Math.sin(time * 3 + d.id) * 0.06, d.z);
      if (!v.children[0].isSprite) v.children[0].rotation.y = time * 2 + d.id;
    }
    for (const [id, v] of this.dropViews) {
      if (!seen.has(id)) {
        disposeObject(v);
        this.dropViews.delete(id);
      }
    }
  }

  makeDrop(item) {
    const g = new THREE.Group();
    const data = this.world && this.game.data.items.materials[item];
    const color = item === 'gold' ? '#ffd24a' : data?.color || '#ffffff';
    g.userData.color = new THREE.Color(color).getHex();
    const mesh = item === 'gold'
      ? new THREE.Mesh(this.coinGeo || (this.coinGeo = Object.assign(new THREE.CylinderGeometry(0.22,0.22,0.06,14).rotateX(Math.PI/2), { userData: { shared: true } })),toon('#ffd24a',{emissive:'#8a6a00',emissiveIntensity:.4}))
      : dropSprite(item);
    mesh.castShadow = true;
    g.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(0.9, 0.9, 1);
    g.add(glow);
    if (data?.rare) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 4, 10, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.y = 2;
      g.add(beam);
    }
    return g;
  }

  ambient(dt, x, z, zoneId) {
    this.ambientT += dt;
    const v = this.vfx;
    const spawn = (rate, fn) => {
      if (Math.random() < dt * rate) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 16;
        const px = x + Math.sin(a) * r;
        const pz = z + Math.cos(a) * r;
        fn(px, this.groundAt(px, pz), pz);
      }
    };
    if (zoneId === 'meadow' || zoneId === 'glade' || zoneId === 'settlement') spawn(5, (px, py, pz) => v.fx.add(px, py + 0.5 + Math.random() * 1.5, pz, 0.4, 0.15, 0.2, { color: 0xfff4c0, size: 0.1, sizeEnd: 0.1, life: 4, drag: 0, alpha: 0.7 }));
    if (zoneId === 'forest' || zoneId === 'wolf_den') spawn(4, (px, py, pz) => v.dust.add(px, py + 3 + Math.random() * 2, pz, 0.5, -0.4, 0.3, { color: Math.random() < 0.5 ? 0x7ab04a : 0xc89a4a, size: 0.14, sizeEnd: 0.12, life: 5, drag: 0.2, gravity: 0.05 }));
    if (zoneId === 'wetland') spawn(7, (px, py, pz) => v.fx.add(px, py + 0.4 + Math.random() * 1.4, pz, (Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3, { color: 0xd8ff7a, size: 0.14, sizeEnd: 0.05, life: 3, drag: 0 }));
    if (zoneId === 'highlands') spawn(6, (px, py, pz) => v.fx.add(px, py + 0.3 + Math.random() * 2, pz, 2.5, 0, 0.6, { color: 0xffffff, size: 0.08, sizeEnd: 0.02, life: 2, drag: 0, alpha: 0.6 }));
    if (zoneId === 'ruins') spawn(5, (px, py, pz) => v.fx.add(px, py + 0.3, pz, 0, 0.5, 0, { color: 0xc6b4ff, size: 0.12, sizeEnd: 0.04, life: 3.5, drag: 0 }));
    // chimney smoke and the camp fire, only when near
    for (const c of this.chimneys) if (Math.abs(c.x - x) < 40 && Math.abs(c.z - z) < 40 && Math.random() < dt * 1.5) v.dust.add(c.x + 0.8, c.y, c.z - 0.4, 0.3, 0.9, 0.1, { color: 0xd8d8d8, size: 0.6, sizeEnd: 1.4, life: 3, drag: 0.3, alpha: 0.5 });
    for (const f of this.fires) {
      f.sprite.scale.setScalar(1.4 + Math.sin(this.time * 17) * 0.15 + Math.sin(this.time * 7.3) * 0.1);
      if (Math.abs(f.x - x) < 40 && Math.random() < dt * 14) v.fx.add(f.x + (Math.random() - 0.5) * 0.4, this.groundAt(f.x, f.z) + 0.3, f.z + (Math.random() - 0.5) * 0.4, 0, 1.4 + Math.random(), 0, { color: Math.random() < 0.5 ? 0xffa040 : 0xffe07a, size: 0.25, life: 0.7, drag: 1 });
    }
  }

  updateHero(dt, time) {
    const g = this.game;
    const p = g.player;
    const r = this.hero;
    const look = g.ch.appearance || DEFAULT_LOOK;
    const key = JSON.stringify([look, g.gearLook()]);
    if (key !== this.heroLookKey) this.setHeroLook(look, g.gearLook());
    const ground = this.world.groundY(p.x, p.z);
    // falling off ledges looks like a fall, stepping up is quick
    if (ground >= this.heroY) {
      this.heroVy = 0;
      this.heroY = damp(this.heroY, ground, 25, dt);
    } else {
      this.heroVy = (this.heroVy || 0) + 22 * dt;
      this.heroY = Math.max(ground, this.heroY - this.heroVy * dt);
    }
    let y = this.heroY;
    if (p.dash && p.dash.kind === 'leap') y += Math.sin(Math.min(1, p.dash.t / p.dash.dur) * Math.PI) * 1.5;
    const speed = dt > 0 && this.lastHeroPos ? Math.hypot(p.x - this.lastHeroPos.x, p.z - this.lastHeroPos.z) / dt : 0;
    this.lastHeroPos = { x: p.x, z: p.z };
    r.root.position.set(p.x, y, p.z);
    let d = p.facing - r.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    r.root.rotation.y += d * Math.min(1, dt * (p.cast || p.dash ? 30 : 14));
    this.heroAnim.update(dt, { speed: p.dash ? 0 : Math.min(speed, 12), facing: r.root.rotation.y, moving: p.moving && !p.dash, dash: p.dash, dead: p.dead, time });
    this.vfx.updateTrail(dt, r);
    this.vfx.updateCast(dt, r, !p.cast || p.dead || !!p.dash);
    r.root.visible = !(p.dash && p.dash.kind === 'blink');
    this.heroFlash = Math.max(0, (this.heroFlash || 0) - dt);
    setFlash(r.material, this.heroFlash > 0 ? 0.5 : 0, 0, p.statuses?.chill ? 0.25 : 0);
    updateScarf(r, dt, p.moving || p.dash ? 8 : 0);
    if (p.dash && p.dash.kind !== 'blink') this.vfx.dashTrail(p.x, y, p.z, p.dash.kind);
    this.vfx.updateWard(p.barrier, time);
    if (p.buffs?.war_cry) this.vfx.buffAura(p.x, p.z, 0xffc860, dt);
  }

  updateCamera(dt, focus) {
    const look = new THREE.Vector3(focus.x, focus.y, focus.z);
    this.camTarget.lerp(look, 1 - Math.exp(-dt * 6));
    const off = CAM_OFFSET.clone().multiplyScalar(this.zoom);
    this.camera.position.copy(this.camTarget).add(off);
    if (this.shake > 0) {
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + 0.8, this.camTarget.z);
  }

  render(dt, time, ui = {}) {
    this.time = time;
    this.canvasRect = this.renderer.domElement.getBoundingClientRect();
    timeUniform.value = time;
    const world = this.world;
    const g = this.game;
    let focus;
    let zoneId = 'settlement';

    if (this.mode === 'game' && g) {
      const p = g.player;
      this.updateHero(dt, time);
      // the camera moves first, so monsters are culled against this frame's view (also after a snap)
      focus = { x: p.x + g.input.moveX * 1.2, y: this.heroY, z: p.z + g.input.moveZ * 1.2 };
      zoneId = world.zoneAt(p.x, p.z).id;
      this.updateCamera(dt, focus);
      for (const n of this.npcs) {
        if (n.scenery) {
          const dx = n.root.position.x - p.x, dz = n.root.position.z - p.z;
          const range = world.data.town.life?.drawDistance ?? VIEW_RADIUS;
          n.root.visible = dx * dx + dz * dz < range * range;
          if (!n.root.visible) continue;
        }
        n.idleState.time = time + n.root.position.x;
        n.anim.update(dt, n.idleState);
        if (n.activity) {
          const wave = Math.sin(n.idleState.time * Math.PI * 2 / world.data.town.life.gesturePeriod);
          const strength = n.activity === 'work' ? .22 : .06;
          n.bones.armL.rotation.x = -.58;
          n.bones.elbowL.rotation.x = -.82;
          n.bones.armR.rotation.x = -.62 + wave * strength;
          n.bones.elbowR.rotation.x = -.78 - wave * strength;
          n.bones.head.rotation.x = .12;
        }
        if (n.job === 'smith' && !n.anim.action && Math.random() < dt * 0.7) n.anim.play('slashA', 0.9);
        updateScarf(n, dt, 0);
      }
      this.npcMarkers.forEach((m, i) => {
        m.rotation.y = time * 1.5;
        m.position.y = m.userData.baseY + Math.sin(time * 2 + i) * 0.12;
      });
      this.syncMonsters(dt, time);
      this.syncAllies(dt, time);
      this.syncDrops(dt, time);
      this.vfx.syncProjectiles(g, dt, time);
      this.vfx.syncAreas(g, dt, time);
      this.vfx.syncTelegraphs(g);
      // waypoint stones glow once discovered
      for (const [id, stone] of this.waypointStones) {
        const on = g.isWaypointUnlocked?.(id);
        const c = stone.userData.crystal;
        c.material.emissive.set(on ? '#3fb8e8' : '#223344');
        c.material.emissiveIntensity = on ? 0.9 + Math.sin(time * 3) * 0.25 : 1;
        c.position.y = 2.95 + (on ? Math.sin(time * 2) * 0.12 : 0);
        c.rotation.y = on ? time : 0;
      }
      // target ring
      const t = g.target;
      this.targetRing.visible = !!t && !t.dead;
      if (t) {
        this.targetRing.position.set(t.x, 0, t.z);
        const s = t.r + 0.35 + Math.sin(time * 6) * 0.04;
        this.targetRing.scale.set(s, 1, s);
        conform(this.targetRing);
      }
      const aim = ui.aim;
      this.reticle.visible = !!(aim && aim.radius);
      this.aimArrow.visible = !!(aim && !aim.radius && aim.angle !== undefined);
      if (aim && aim.radius) {
        this.reticle.position.set(aim.x, 0, aim.z);
        this.reticle.scale.set(aim.radius, 1, aim.radius);
        conform(this.reticle);
      } else if (aim && aim.angle !== undefined) {
        this.aimArrow.position.set(p.x, 0, p.z);
        this.aimArrow.rotation.y = aim.angle;
        this.aimArrow.scale.set(1, 1, aim.length || 6);
        conform(this.aimArrow);
      }
    } else if (this.mode === 'create' && this.previewHero) {
      // hero preview on the plaza, slow orbit
      const h = this.previewHero;
      h.anim.update(dt, { speed: 0, facing: h.root.rotation.y, moving: false, dash: null, dead: false, time });
      updateScarf(h, dt, 0);
      // swing gently in front of the hero; aim a little left of it so the hero stands clear of the panel
      const a = h.root.rotation.y + Math.sin(time * 0.3) * 0.6;
      const c = h.root.position;
      const wide = this.camera.aspect > 1.1 ? 0.75 : 0;
      this.camera.position.set(c.x + Math.sin(a) * 4.6, c.y + 2.1, c.z + Math.cos(a) * 4.6);
      this.camera.lookAt(c.x - Math.cos(a) * wide, c.y + (this.camera.aspect > 1.1 ? 1.0 : 0.6), c.z + Math.sin(a) * wide);
      focus = c;
    } else {
      // title flyover above the settlement and meadow
      const a = time * 0.035;
      const cx = world.data.town.centre[0] + 30 + Math.sin(a) * 26;
      const cz = Math.cos(a * 0.7) * 14;
      const cy = world.groundY(cx, cz);
      this.camera.position.set(cx - 14, cy + 17, cz + 16);
      this.camera.lookAt(cx, cy, cz);
      focus = { x: cx, y: cy, z: cz };
      zoneId = world.zoneAt(cx, cz).id;
    }

    this.vfx.update(dt);
    if (this.vfx.shake) {
      this.addShake(this.vfx.shake);
      this.vfx.shake = 0;
    }
    this.ambient(dt, focus.x, focus.z, zoneId);
    // zone-tinted fog/sky
    const target = (this._zoneFogTarget ||= new THREE.Color()).set(ZONE_FOG[zoneId] || ZONE_FOG.meadow);
    this.fogColor.lerp(target, 1 - Math.exp(-dt * 1.5));
    this.scene.fog.color.copy(this.fogColor);
    this.scene.background.copy(this.fogColor);

    this.camera.updateMatrixWorld();
    if (this.mode === 'game' && g) {
      const p = g.player;
      const sp = (this._seePosition ||= new THREE.Vector3()).set(p.x, this.heroY + 1.0, p.z).project(this.camera);
      const db = this.renderer.getDrawingBufferSize(this._bufferSize ||= new THREE.Vector2());
      seeUniforms.uSeeCenter.value.set((sp.x * 0.5 + 0.5) * db.x, (sp.y * 0.5 + 0.5) * db.y);
      seeUniforms.uSeeDepth.value = sp.z * 0.5 + 0.5;
      seeUniforms.uSeeRadius.value = (95 * this.renderer.getPixelRatio()) / this.zoom;
    } else seeUniforms.uSeeCenter.value.set(-9999, -9999);
    const sunOffset = renderConfig.shadow.sunOffset;
    this.sun.position.set(focus.x + sunOffset[0], focus.y + sunOffset[1], focus.z + sunOffset[2]);
    this.sun.target.position.set(focus.x, focus.y, focus.z);
    this.renderer.render(this.scene, this.camera);
  }

  /** Character-creation preview: a hero standing on the plaza. */
  showPreview(look, gear) {
    this.hidePreview(); // frees the old preview's per-rig materials, skeleton and scarf
    const h = buildHumanoid(look, gear);
    h.anim = new HumanoidAnimator(h);
    const [cx, cz] = this.world.data.town.centre;
    h.root.position.set(cx + 2, this.world.groundY(cx + 2, cz + 2), cz + 2);
    h.root.rotation.y = 0.3;
    this.scene.add(h.root);
    if (h.scarf) this.scene.add(h.scarf.mesh);
    this.previewHero = h;
    return h;
  }

  hidePreview() {
    if (!this.previewHero) return;
    disposeObject(this.previewHero.root);
    disposeObject(this.previewHero.scarf?.mesh);
    this.previewHero = null;
  }

  /** Compile every material once at load so the first fight does not hitch. */
  warmup() {
    const tmp = new THREE.Group();
    const [x, z] = this.world.data.playerSpawn;
    const y = this.world.groundY(x, z);
    const rigs = [];
    for (const type of new Set([...this.world.data.spawns.map(s => s.monster), ...(this.world.data.bosses || []).map(b => b.monster)])) {
      const rig = buildMonster(type, 1);
      rigs.push(rig);
      rig.root.position.set(x, y, z);
      tmp.add(rig.root);
    }
    const hero = buildHumanoid(DEFAULT_LOOK, { weapon: 'sword' });
    hero.root.position.set(x, y, z);
    tmp.add(hero.root);
    this.scene.add(tmp);
    const v = this.vfx;
    const e = { x, z, angle: 0, arc: 120, range: 2, element: 'fire', radius: 2, kind: 'x', points: [[x, z], [x + 2, z]] };
    v.slash(e, 'sword');
    v.impact(e);
    v.stoneBurst(e);
    v.whirl(e);
    v.nova({ ...e, element: 'cold' });
    v.chain(e);
    v.curse(e);
    v.ring(x, z, 2, 0xffffff);
    v.levelUp(x, z);
    for (const kind of ['burning_ground', 'healing_spring', 'stone_burst', 'shockwave', 'venom_mire', 'spore_cloud']) {
      const a = v.makeArea({ kind, x, z, radius: 2, element: 'fire', t: 0, delay: 0, duration: 1 });
      if (a) tmp.add(a.obj);
    }
    v.fx.burst(x, y + 1, z, 3, {});
    v.dust.burst(x, y + 1, z, 3, {});
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    tmp.removeFromParent();
    for (const rig of rigs) this.releaseRig(rig); // compiled models start the pool
    disposeObject(hero.root);
    for (const a of v.active) disposeObject(a.obj, v.sharedGeo);
    v.active = [];
  }

  /** Render a portrait of a hero face to a data URL for the HUD. */
  portrait(look, gear = {}, size = 128) {
    const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#2c3a5c');
    const hero = buildHumanoid(look, gear);
    scene.add(hero.root);
    scene.add(new THREE.HemisphereLight('#ffffff', '#445566', 2.2));
    const l = new THREE.DirectionalLight('#ffffff', 1.5);
    l.position.set(1, 2, 3);
    scene.add(l);
    const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 10);
    cam.position.set(0.25, 1.72, 1.1);
    cam.lookAt(0, 1.64, 0);
    hero.root.rotation.y = 0.35;
    hero.root.updateMatrixWorld(true);
    this.renderer.setRenderTarget(rt);
    this.renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    this.renderer.setRenderTarget(null);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let yy = 0; yy < size; yy++) img.data.set(px.subarray((size - 1 - yy) * size * 4, (size - yy) * size * 4), yy * size * 4);
    ctx.putImageData(img, 0, 0);
    rt.dispose();
    disposeObject(hero.root);
    disposeObject(hero.scarf?.mesh);
    return c.toDataURL();
  }
}

