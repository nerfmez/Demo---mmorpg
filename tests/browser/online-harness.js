// Production UI/transport/actors, one tiny flat review scene; no full-map renderer or monsters.
import * as THREE from 'three';
import { startPlayer } from '../../src/player.js';
import { data } from '../../src/data.js';
import { selectMap } from '../../src/core/maps.js';
import { createCharacter } from '../../src/core/character.js';
import { OpenWorldGame } from '../../src/core/open-world-game.js';
import { Hud } from '../../src/ui/hud.js';
import { Panels } from '../../src/ui/panels.js';
import { Input } from '../../src/ui/input.js';
import { Supplies } from '../../src/ui/supplies.js';
import { createPresence } from '../../src/ui/presence.js';
import { createFullscreen } from '../../src/ui/fullscreen.js';
import { loadModels, weaponModelsReady } from '../../src/render/models.js';
import { frostReady } from '../../src/render/frost-v2.js';
import { approvedClipsReady } from '../../src/render/approved-mesh-clips.js';
import { writeSlot, loadSlot } from '../../src/save.js';
import { prepareSpatialRegion, updateSpatialRegion } from '../../src/render/spatial-region.js';
const state = window.__online = { worldBuilds: 0, ready: false, transitions: [], fullMapOmitted: true };
const initial = window.__onlineInitial || 'moonroot-grove-v1';
state.seedSave = () => { selectMap(data, initial); const ch = createCharacter(data, { name: 'Offline keeper', kit: 'bow' }); ch.gold = 1234; ch.opening.stage = 'done'; writeSlot(1, ch); state.savedBefore = localStorage.getItem('frontier.slot.1'); return ch; };
state.readSave = () => loadSlot(1);
const canvas = document.getElementById('game');
async function fixture() {
  state.worldBuilds++;
  selectMap(data, initial);
  const ch = loadSlot(1)?.character || createCharacter(data, { name: 'Review', kit: 'bow' }); ch.opening.stage = 'done';
  const game = new OpenWorldGame(data, { seed: 7, character: ch }); game.monsters = []; game.spawnPoints = [];
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#253f4b');
  scene.add(new THREE.HemisphereLight('#ffffff', '#597682', 2.4));
  const sun = new THREE.DirectionalLight('#fff1dd', 2.4); sun.position.set(-3, 6, 5); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 20), new THREE.MeshToonMaterial({ color: '#4e6969' })); floor.rotation.x = -Math.PI / 2;
  const [x, z] = data.world.playerSpawn; floor.position.set(x, -.02, z); scene.add(floor);
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 120); camera.position.set(x + 4, 3.3, z + 8); camera.lookAt(x, .9, z);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(1);
  let staticRegion;
  if (window.__onlineCulling) {
    const root = new THREE.Group(); root.name = 'online-static-fixture'; root.position.set(x, 0, z); scene.add(root);
    floor.position.set(0, -.02, 0); floor.receiveShadow = true; root.add(floor);
    const far = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 1), new THREE.MeshToonMaterial({color:'#57746a'}));
    far.position.set(0, .5, 50); far.castShadow = true; root.add(far);
    staticRegion = {root, npcs:[], fires:[], npcMarkers:[]}; prepareSpatialRegion(staticRegion);
    sun.castShadow = true; sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:.1,far:80}); sun.shadow.camera.updateProjectionMatrix();
    sun.position.set(x-3,6,z+5); sun.target.position.set(x,0,z); scene.add(sun.target);
    renderer.shadowMap.enabled = true;
  }
  const view = { renderer, camera, scene, game, world: { groundY: () => 0, surfaceY: () => 0 }, worldPrepared: true, region: { staticReady: true }, hero: {}, zoom: 1, monsterViews: new Map(), project: () => null, screenToGround: () => null };
  const root = document.getElementById('hud'), hud = new Hud(root, game, view);
  const panels = new Panels(root, game, { onChange() {}, onQuality() {}, getQuality: () => 'low' });
  let presence;
  const ui = { blocked: () => state.player.gate.blocked, panelOpen: () => state.player.gate.blocked || panels.isOpen || !!presence?.open, closePanel: () => panels.close(), togglePanel: t => panels.toggle(t), interact() { const n = game.nearby(); if (n.shop) panels.open('shop'); else if (n.workbench) panels.open('craft'); }, configureSkill() {} };
  const input = new Input(root, canvas, game, view, ui);
  const supplies = new Supplies(root, game, { onArrows: () => { if (!ui.panelOpen()) panels.openArrowCraft(); }, onPotions: () => { if (!ui.panelOpen()) panels.openAutoPotions(); } });
  const fullscreen = createFullscreen({ bypass: true, onBlocked: () => input.reset(), onResize() {} });
  hud.onPanel = t => panels.open(t); hud.addMenuButton('bag', 'I', () => panels.toggle('bag'), 'กระเป๋า'); hud.addMenuButton('book', 'K', () => panels.toggle('skills'), 'สกิล');
  await Promise.all([loadModels({ characters: { hairsample: data.models.characters.hairsample }, weapons: data.models.weapons }), frostReady, approvedClipsReady]);
  presence = createPresence(game, view, () => input.reset(), () => true, { client: state.player.client, required: true });
  document.getElementById('loading').classList.add('done');
  Object.assign(state, { game, view, hud, panels, input, supplies, presence, fullscreen, staticRegion, sun, base: { x, z }, ready: true, render() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if(staticRegion)updateSpatialRegion(staticRegion,camera,sun); renderer.render(scene, camera); } });
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!state.freeze) {
      input.update(); if (!ui.panelOpen()) game.update(dt);
      for (const event of game.drainEvents()) presence.handleEvent(event);
      presence.update(dt, game.time); hud.update(dt, ui); supplies.update();
    }
    state.render(); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  state.modelsReady = gear => weaponModelsReady(gear);
  state.sampleAction = (seconds) => { state.freeze = true; presence.actors.update(seconds, game.time); state.render(); };
  state.place = (worldX, worldZ) => {
    const [ox, oz] = game.coordinateOrigin; game.player.x = worldX - ox; game.player.z = worldZ - oz;
    game.activateRegion(game.world.regionAt(game.player.x, game.player.z).id);
    if (staticRegion) {
      staticRegion.root.position.set(game.player.x,0,game.player.z);
      sun.position.set(game.player.x-3,6,game.player.z+5);sun.target.position.set(game.player.x,0,game.player.z);
    } else floor.position.set(game.player.x, -.02, game.player.z);
    camera.position.set(game.player.x + 4, 3.3, game.player.z + 8); camera.lookAt(game.player.x, .9, game.player.z);
    input.reset();
  };
  state.dispose = () => { presence.dispose(); state.player.dispose(); };
  state.cullingProbe = () => {
    const actor = [...presence.actors.actors.values()][0], effect = presence.actors.effects.active[0];
    const objects = staticRegion.spatial.originals.map(r=>r.object), position=camera.position.clone(), rotation=camera.quaternion.clone();
    state.render(); const attached=staticRegion.spatial.stats.attachedObjects;
    camera.position.x+=1000;sun.castShadow=false;state.render();
    const detached=staticRegion.spatial.stats.attachedObjects;
    camera.position.copy(position);camera.quaternion.copy(rotation);sun.castShadow=true;state.render();
    let actorCaptured=false;actor.rig.root.traverse(o=>{if(objects.includes(o)||Object.hasOwn(o,'intersectsFrustum')||o.userData.residentCell)actorCaptured=true;});
    return {staticObjects:objects.length,staticOverrides:objects.every(o=>Object.hasOwn(o,'intersectsFrustum')),attached,detached,restored:staticRegion.spatial.stats.attachedObjects,
      actorCaptured,actorOnScene:actor.rig.root.parent===scene,scarfOnScene:!actor.rig.scarf||actor.rig.scarf.mesh.parent===scene,
      effectOnScene:!!effect&&effect.obj.parent===scene,effectCaptured:!!effect&&objects.includes(effect.obj),uuid:actor.rig.root.uuid};
  };
}
state.player = startPlayer({ endpoint: window.__onlineEndpoint, loadGame: fixture });
state.player.client.subscribe('status', s => state.transitions.push(s));
