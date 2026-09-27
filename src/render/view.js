// Scene assembly: renderer, 3/4 top-down camera, light, and syncing game entities to models.
// "Change the camera, not the style": high ARPG camera, same anime cel look.
import * as THREE from 'three';
import { createGround, createWater, tickWater } from './ground.js';
import { createEnvironment } from './environment.js';
import { buildHero, buildNpc, animateHumanoid, updateScarf } from './characters.js';
import { buildMonster } from './monsters.js';
import { Vfx } from './vfx.js';
import { glowTexture } from './monsters.js';
import { toon, seeUniforms } from './toon.js';

const CAM_OFFSET = new THREE.Vector3(0, 19, 13.5);

export class View {
  constructor(canvas, game, { quality = 'high' } = {}) {
    this.game = game;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#9fd3e8');
    this.scene.fog = new THREE.Fog('#bfe3ee', 42, 80);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 200);
    this.zoom = 1;
    this.camTarget = new THREE.Vector3(game.player.x, 0, game.player.z);
    this.shake = 0;

    // light: warm sun from the upper left like the reference, soft sky fill
    const hemi = new THREE.HemisphereLight('#fff6e0', '#6f8f5a', 1.25);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.1);
    this.sun.position.set(-14, 26, 10);
    this.sun.castShadow = true;
    const s = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(s, s);
    const sc = this.sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 22;
    sc.bottom = -22;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    const world = game.world;
    const ground = createGround(world);
    this.ground = ground;
    this.scene.add(ground.mesh);
    this.scene.add(createWater(world));
    this.scene.add(createEnvironment(world));

    this.vfx = new Vfx(this.scene);

    // hero
    this.hero = buildHero();
    this.scene.add(this.hero.root);
    this.scene.add(this.hero.scarf.mesh);
    this.heroState = { action: null, actionT: 0, actionDur: 0, deadT: 0 };

    // town NPCs
    const t = game.data.world.town;
    this.npcs = [];
    const smith = buildNpc({ shirt: '#d9c7a8', pants: '#4a3a30', boots: '#5b3a22', leather: '#6b4a30' }, '#8a4a2a', { apron: '#5b3a22', beard: '#8a4a2a' });
    smith.root.position.set(t.workbench[0] + 1.6, 0, t.workbench[1] + 0.2);
    smith.root.rotation.y = -Math.PI / 2 - 0.4;
    const trainer = buildNpc({ shirt: '#fbf6ee', pants: '#3b4a7a', boots: '#6b4a30', scarf: '#3b6ad0' }, '#f0d48a', { longHair: true, straps: true });
    trainer.root.position.set(t.trainer[0] + 1.2, 0, t.trainer[1] - 0.2);
    trainer.root.rotation.y = -Math.PI / 2 + 0.3;
    for (const n of [smith, trainer]) {
      this.scene.add(n.root);
      this.npcs.push(n);
    }
    this.npcMarkers = [this.marker(t.workbench[0], t.workbench[1], '#ffd166'), this.marker(t.trainer[0], t.trainer[1], '#8fd0ff')];

    this.monsterViews = new Map();
    this.dropViews = new Map();

    // target ring under the soft target
    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ff5a4a', transparent: true, opacity: 0.85, depthWrite: false })
    );
    this.targetRing.renderOrder = 3;
    this.scene.add(this.targetRing);
    // aim reticle for ground-targeted skills
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.8, depthWrite: false })
    );
    this.reticle.visible = false;
    this.scene.add(this.reticle);
    this.aimArrow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({ color: '#fff4c8', transparent: true, opacity: 0.45, depthWrite: false })
    );
    this.aimArrow.visible = false;
    this.scene.add(this.aimArrow);

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.resize();
  }

  marker(x, z, color) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(0.8, 0.8, 1);
    s.position.set(x, 3.2, z);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), toon(color, { emissive: color, emissiveIntensity: 0.6 }));
    gem.position.set(x, 3.2, z);
    this.scene.add(s, gem);
    return gem;
  }

  resize() {
    const c = this.renderer.domElement;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep a similar view width on portrait phones
    this.camera.fov = w / h < 1 ? 52 : 36;
    this.camera.updateProjectionMatrix();
    this.vfx.setPointScale(h * dpr);
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.scene.traverse((o) => {
      if (o.material) o.material.needsUpdate = true;
    });
    this.resize();
  }

  /** Screen point -> ground point. */
  screenToGround(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, p) ? p : null;
  }

  /** World point -> CSS pixel position. */
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top, behind: v.z > 1 };
  }

  handleEvent(e) {
    const g = this.game;
    const v = this.vfx;
    const hs = this.heroState;
    switch (e.type) {
      case 'castStart': {
        const kind = e.kind === 'melee_arc' ? 'slash' : e.kind === 'self_barrier' ? 'ward' : 'cast';
        hs.action = kind;
        hs.actionT = 0;
        hs.actionDur = Math.max(0.3, e.total + 0.2);
        break;
      }
      case 'slash':
        v.slash(e);
        if (e.triggered) this.addShake(0.05);
        break;
      case 'impact':
        v.impact(e);
        break;
      case 'hit': {
        v.hitSpark(e);
        const mv = this.monsterViews.get(e.id);
        if (mv && !e.dot) mv.flash = 0.12;
        if (e.crit) this.addShake(0.08);
        break;
      }
      case 'burst':
        v.burst(e);
        if (e.kind === 'slam') this.addShake(0.45);
        else if (e.kind === 'stone_burst') this.addShake(0.12);
        break;
      case 'monsterSwing':
        v.monsterSwing(e);
        break;
      case 'ward':
        v.ward(e, this.hero.root);
        break;
      case 'movement':
        hs.action = e.kind === 'roll' ? 'roll' : e.kind === 'blink' ? 'blink' : 'dash';
        hs.actionT = 0;
        hs.actionDur = g.move.duration;
        break;
      case 'blinkPlayer':
        v.blink(e.fromX, e.fromZ, e.x, e.z);
        break;
      case 'blink':
        v.blink(e.fromX, e.fromZ, e.x, e.z, 0x8fe4ff);
        break;
      case 'death': {
        v.death(e, e.boss);
        if (e.boss) this.addShake(0.6);
        break;
      }
      case 'levelup':
        v.levelUp(g.player.x, g.player.z);
        break;
      case 'playerHit':
        if (!e.dot && e.amount > 0) {
          hs.hurtT = 0.25;
          this.addShake(Math.min(0.3, e.amount / g.player.maxHp));
        }
        break;
      case 'heal':
        v.heal(e.x, e.z);
        break;
      case 'pickup': {
        const dv = this.dropViews.get(e.id);
        if (dv) v.pickup(dv.position.x, dv.position.z, dv.userData.color);
        break;
      }
      case 'stunned':
        v.fx.burst(e.x, 1.4, e.z, 10, { color: 0xfff2a0, size: 0.25, speed: 2, life: 0.6, up: 0.4 });
        this.addShake(0.15);
        break;
      case 'shell':
        break;
      case 'enrage':
        v.fx.burst(e.x, 2, e.z, 40, { color: 0xb89cff, size: 0.35, speed: 5, life: 0.8, up: 1 });
        this.addShake(0.3);
        break;
    }
  }

  addShake(k) {
    this.shake = Math.min(0.8, this.shake + k);
  }

  syncMonsters(dt, time) {
    const g = this.game;
    const seen = new Set();
    for (const m of g.monsters) {
      seen.add(m.id);
      let mv = this.monsterViews.get(m.id);
      if (!mv) {
        const rig = buildMonster(m.type, m.level);
        rig.root.position.set(m.x, 0, m.z);
        rig.root.rotation.y = m.facing;
        this.scene.add(rig.root);
        mv = { rig, flash: 0, spawnT: 0, lastAttack: null };
        this.monsterViews.set(m.id, mv);
      }
      const r = mv.rig;
      mv.spawnT += dt;
      if (m.windup) mv.lastAttack = m.windup.name;
      r.root.position.x = m.x;
      r.root.position.z = m.z;
      let d = m.facing - r.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.root.rotation.y += d * Math.min(1, dt * 14);
      r.animate(
        r,
        {
          moving: m.moving && ['chase', 'idle', 'return'].includes(m.state),
          speed: m.def.speed,
          state: m.state,
          windup: m.state === 'windup' && m.windup ? m.windup.name : null,
          windupT: m.stateT,
          windupTotal: m.windup?.total || 1,
          enraged: m.enraged,
          lastAttack: mv.lastAttack,
        },
        dt,
        time
      );
      // spawn pop-in, death sink
      let sc = r.baseScale * Math.min(1, 0.3 + mv.spawnT * 2.5);
      if (m.dead) {
        const k = Math.min(1, m.deathT / 1.2);
        sc *= 1 - k * 0.3;
        r.root.position.y = -k * 0.6;
        r.root.rotation.z = k * 0.6;
      }
      r.root.scale.setScalar(sc);
      mv.flash = Math.max(0, mv.flash - dt);
      if (mv.flash > 0) r.pal.flash(0.55);
      else if (m.windup && m.state === 'windup') r.pal.flash(0.12 + 0.12 * Math.max(0, Math.sin(time * 24)), 1, 0.45, 0.15); // warm pulse = about to attack
      else r.pal.flash(0);
    }
    for (const [id, mv] of this.monsterViews) {
      if (!seen.has(id)) {
        mv.rig.root.removeFromParent();
        this.monsterViews.delete(id);
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
      v.position.set(d.x, 0.35 + hop + Math.sin(time * 3 + d.id) * 0.06, d.z);
      v.children[0].rotation.y = time * 2 + d.id;
    }
    for (const [id, v] of this.dropViews) {
      if (!seen.has(id)) {
        v.removeFromParent();
        this.dropViews.delete(id);
      }
    }
  }

  makeDrop(item) {
    const g = new THREE.Group();
    const data = this.game.data.items.materials[item];
    const color = item === 'gold' ? '#ffd24a' : data?.color || '#ffffff';
    g.userData.color = new THREE.Color(color).getHex();
    let mesh;
    if (item === 'gold') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14).rotateX(Math.PI / 2), toon('#ffd24a', { emissive: '#8a6a00', emissiveIntensity: 0.4 }));
    } else if (item === 'boar_tusk' || item === 'warden_horn') {
      mesh = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6).rotateZ(0.9), toon(color));
    } else if (item === 'wisp_core' || item === 'ancient_core' || item === 'glow_dust' || item === 'ruin_shard') {
      mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), toon(color, { emissive: color, emissiveIntensity: 0.5 }));
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.26), toon(color));
    }
    mesh.castShadow = true;
    g.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(0.9, 0.9, 1);
    g.add(glow);
    if (item === 'ancient_core' || item === 'warden_horn') {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 4, 10, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.y = 2;
      g.add(beam);
    }
    return g;
  }

  render(dt, time, ui = {}) {
    const g = this.game;
    const p = g.player;
    const hs = this.heroState;

    // hero
    const r = this.hero;
    r.root.position.set(p.x, 0, p.z);
    let d = p.facing - r.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    r.root.rotation.y += d * Math.min(1, dt * (p.cast || p.dash ? 30 : 16));
    if (hs.action) {
      hs.actionT += dt;
      if (hs.actionT > hs.actionDur) hs.action = null;
    }
    if (p.dead) hs.deadT += dt;
    else hs.deadT = 0;
    hs.hurtT = Math.max(0, (hs.hurtT || 0) - dt);
    animateHumanoid(r, { moving: p.moving && !p.dash, speed: g.derived.moveSpeed, action: hs.action, actionT: hs.actionT, actionDur: hs.actionDur, dead: p.dead, deadT: hs.deadT, hurtT: hs.hurtT }, dt, time);
    r.root.visible = !(p.dash && p.dash.kind === 'blink');
    updateScarf(r, dt, p.moving || p.dash ? 8 : 0);
    if (p.dash && p.dash.kind !== 'blink') this.vfx.dashTrail(p.x, p.z, p.dash.kind);
    this.vfx.updateWard(p.barrier, time);

    for (const n of this.npcs) animateHumanoid(n, { moving: false, speed: 0 }, dt, time + n.root.position.x);
    this.npcMarkers.forEach((m, i) => {
      m.rotation.y = time * 1.5;
      m.position.y = 3.2 + Math.sin(time * 2 + i) * 0.12;
    });

    this.syncMonsters(dt, time);
    this.syncDrops(dt, time);
    this.vfx.syncProjectiles(g, dt, time);
    this.vfx.syncAreas(g, dt, time);
    this.vfx.syncTelegraphs(g);
    this.vfx.update(dt);
    if (this.vfx.shake) {
      this.addShake(this.vfx.shake);
      this.vfx.shake = 0;
    }
    tickWater(time);

    // target ring
    const t = g.target;
    this.targetRing.visible = !!t && !t.dead;
    if (t) {
      this.targetRing.position.set(t.x, 0.06, t.z);
      this.targetRing.scale.setScalar(t.r + 0.35 + Math.sin(time * 6) * 0.04);
    }
    // aim helpers (drag-aim on touch, or pointer aim for ground skills)
    const aim = ui.aim;
    this.reticle.visible = !!(aim && aim.radius);
    this.aimArrow.visible = !!(aim && !aim.radius && aim.angle !== undefined);
    if (aim && aim.radius) {
      this.reticle.position.set(aim.x, 0.08, aim.z);
      this.reticle.scale.setScalar(aim.radius);
    } else if (aim && aim.angle !== undefined) {
      this.aimArrow.position.set(p.x, 0.08, p.z);
      this.aimArrow.rotation.y = aim.angle;
      this.aimArrow.scale.set(1, 1, aim.length || 6);
    }

    // camera follow with a little look-ahead
    const look = new THREE.Vector3(p.x + g.input.moveX * 1.2, 0, p.z + g.input.moveZ * 1.2);
    this.camTarget.lerp(look, 1 - Math.exp(-dt * 6));
    const off = CAM_OFFSET.clone().multiplyScalar(this.zoom);
    this.camera.position.copy(this.camTarget).add(off);
    if (this.shake > 0) {
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    this.camera.lookAt(this.camTarget.x, 0.8, this.camTarget.z);
    this.camera.updateMatrixWorld();
    // canopies in front of the hero dissolve around it
    const sp = new THREE.Vector3(p.x, 1.0, p.z).project(this.camera);
    const db = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    seeUniforms.uSeeCenter.value.set((sp.x * 0.5 + 0.5) * db.x, (sp.y * 0.5 + 0.5) * db.y);
    seeUniforms.uSeeDepth.value = sp.z * 0.5 + 0.5;
    seeUniforms.uSeeRadius.value = 95 * this.renderer.getPixelRatio() / this.zoom;
    // shadow box follows the player
    this.sun.position.set(this.camTarget.x - 14, 26, this.camTarget.z + 10);
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);

    this.renderer.render(this.scene, this.camera);
  }

  /** Compile every material once at load so the first fight does not hitch. */
  warmup() {
    const tmp = new THREE.Group();
    const p = this.game.player;
    for (const type of Object.keys(this.game.data.monsters.monsters)) {
      const rig = buildMonster(type, 1);
      rig.root.position.set(p.x, 0, p.z);
      tmp.add(rig.root);
    }
    this.scene.add(tmp);
    const v = this.vfx;
    const e = { x: p.x, z: p.z, angle: 0, arc: 120, range: 2, element: 'fire', radius: 2, kind: 'x' };
    v.slash(e);
    v.impact(e);
    v.stoneBurst(e);
    v.ring(p.x, p.z, 2, 0xffffff);
    v.levelUp(p.x, p.z);
    for (const kind of ['burning_ground', 'healing_spring', 'stone_burst', 'shockwave']) {
      const a = v.makeArea({ kind, x: p.x, z: p.z, radius: 2, element: 'fire', t: 0, delay: 0, duration: 1 });
      if (a) tmp.add(a.obj);
    }
    const drop = this.makeDrop('boar_hide');
    drop.position.set(p.x, 0, p.z);
    tmp.add(drop, this.makeDrop('gold'), this.makeDrop('ancient_core'), this.makeDrop('wisp_core'), this.makeDrop('boar_tusk'));
    this.vfx.ward({ x: p.x, z: p.z }, this.hero.root);
    this.vfx.fx.burst(p.x, 1, p.z, 3, {});
    this.vfx.dust.burst(p.x, 1, p.z, 3, {});
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    tmp.removeFromParent();
    this.vfx.wardMesh.visible = false;
    for (const a of this.vfx.active) a.obj.removeFromParent();
    this.vfx.active = [];
  }

  /** Render a portrait of the hero's face to a data URL for the HUD. */
  portrait(size = 128) {
    const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#2c3a5c');
    const hero = buildHero();
    scene.add(hero.root);
    scene.add(new THREE.HemisphereLight('#ffffff', '#445566', 2.2));
    const l = new THREE.DirectionalLight('#ffffff', 1.5);
    l.position.set(1, 2, 3);
    scene.add(l);
    const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 10);
    cam.position.set(0.25, 1.72, 1.1);
    cam.lookAt(0, 1.64, 0);
    hero.root.rotation.y = 0.35;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    this.renderer.setRenderTarget(null);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    rt.dispose();
    return c.toDataURL();
  }
}
