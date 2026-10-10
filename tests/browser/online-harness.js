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
  Object.assign(state, { game, view, hud, panels, input, supplies, presence, fullscreen, base: { x, z }, ready: true, render() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.render(scene, camera); } });
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
    floor.position.set(game.player.x, -.02, game.player.z);
    camera.position.set(game.player.x + 4, 3.3, game.player.z + 8); camera.lookAt(game.player.x, .9, game.player.z);
    input.reset();
  };
  state.dispose = () => { presence.dispose(); state.player.dispose(); };
}
state.player = startPlayer({ endpoint: window.__onlineEndpoint, loadGame: fixture });
state.player.client.subscribe('status', s => state.transitions.push(s));
