import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cameraVisibility, sleepOffscreenMatrices } from '../../src/render/camera-visibility.js';
import { syncMonsterViews } from '../../src/render/monster-views.js';

function cameraAt(x = 0) {
  const camera = new THREE.PerspectiveCamera(90, 1, .1, 100);
  camera.position.set(x, 0, 10);
  camera.lookAt(x, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

test('shared camera frustum retains edge envelopes and immediately follows camera snaps and resize', () => {
  const camera = cameraAt(), visible = cameraVisibility(camera);
  assert.equal(visible.intersectsSphere(0, 0, 0, .5), true);
  assert.equal(visible.intersectsSphere(10.25, 0, 0, .5), true, 'retain an envelope crossing the viewport edge');
  assert.equal(visible.intersectsSphere(20, 0, 0, .5), false);
  assert.equal(cameraVisibility(camera), visible, 'same camera reuses its frustum and scratch');
  camera.position.x = 30;
  camera.lookAt(30, 0, 0);
  assert.equal(cameraVisibility(camera).intersectsSphere(30, 0, 0, .5), true);
  assert.equal(visible.intersectsSphere(0, 0, 0, .5), false, 'snap applies this frame');
  camera.aspect = 3;
  camera.updateProjectionMatrix();
  assert.equal(cameraVisibility(camera).intersectsSphere(0, 0, 0, .5), true, 'new viewport applies this frame');
});

test('NPC visibility uses fixed world parent offsets and sleeping roots resume all descendant matrices', () => {
  const scene = new THREE.Scene(), region = new THREE.Group(), npc = new THREE.Group(), limb = new THREE.Object3D();
  region.position.x = 30;
  limb.position.y = 1;
  scene.add(region); region.add(npc); npc.add(limb);
  sleepOffscreenMatrices(npc);
  let updates = 0;
  const update = limb.updateMatrixWorld;
  limb.updateMatrixWorld = function(force) { updates++; update.call(this, force); };
  const camera = cameraAt(30), visible = cameraVisibility(camera);
  assert.equal(visible.intersectsObject(npc, 3.5, 1), true);
  scene.updateMatrixWorld(true);
  assert.equal(limb.matrixWorld.elements[12], 30);
  npc.visible = false; limb.position.x = 4; region.position.x = 50;
  const before = updates;
  scene.updateMatrixWorld(true);
  assert.equal(updates, before, 'hidden rig does not visit or multiply descendant matrices');
  assert.equal(visible.intersectsObject(npc, 3.5, 1), false, 'culling still reads current root position');
  camera.position.x = 50; camera.lookAt(50, 0, 0);
  npc.visible = cameraVisibility(camera).intersectsObject(npc, 3.5, 1);
  scene.updateMatrixWorld(true);
  assert.equal(npc.visible, true);
  assert.equal(limb.matrixWorld.elements[12], 54, 'reentry restores current pose under moved parent');
  assert.ok(updates > before);
});

test('offscreen monsters retain current motion and timers but skip status emission, pose and trails', () => {
  const monster = { id: 1, type: 'test', x: 30, z: 0, facing: 0, level: 1, state: 'windup', stateT: .2,
    moving: true, windup: { name: 'erupt', total: 1 }, statuses: { burn: 1, poison: 1, hex: 1 }, def: { attacks: {} } };
  const root = new THREE.Group(), flash = new THREE.Vector3();
  let animations = 0, emissions = 0, trailUpdates = 0, trailClears = 0;
  const rig = { root, baseScale: 1, height: 1.5, material: { userData: { flash: { value: flash } } },
    animate() { animations++; }, trails: { look: null, update() { trailUpdates++; }, clear() { trailClears++; } } };
  const ground = () => 0;
  const view = { game: { player: { x: 0, z: 0 }, monsters: [monster] }, cullMonsters: true,
    camera: cameraAt(), scene: new THREE.Scene(), monsterViews: new Map(), groundAt: ground,
    world: { groundY: ground, surfaceY: ground }, takeRig: () => rig, releaseRig() {}, lookYaw: () => 0,
    vfx: { digDust() { emissions++; }, fx: { add() { emissions++; } }, monsterLook: () => null } };
  const random = Math.random;
  Math.random = () => 0;
  try {
    syncMonsterViews(view, 1 / 60, 1);
    const mv = view.monsterViews.get(1), seen = view._monsterSeen;
    assert.equal(root.visible, false);
    assert.equal(animations, 0); assert.equal(emissions, 0); assert.equal(trailUpdates, 0);
    assert.equal(trailClears, 1, 'scene-owned trail clears once when leaving view');
    mv.flash = .1;
    monster.x = 31;
    syncMonsterViews(view, 1 / 60, 2);
    assert.equal(view._monsterSeen, seen);
    assert.equal(trailClears, 1);
    assert.ok(mv.flash < .1); assert.ok(mv.speed > 0, 'motion remains current for reentry');
    view.camera.position.x = 31; view.camera.lookAt(31, 0, 0);
    syncMonsterViews(view, 1 / 60, 3);
    assert.equal(root.visible, true);
    assert.equal(animations, 1); assert.equal(trailUpdates, 1); assert.equal(emissions, 4);
    assert.equal(view.monstersDrawn, 1);
    const state = mv.animationState;
    syncMonsterViews(view, 1 / 60, 4);
    assert.equal(mv.animationState, state, 'visible animation state is reused');
  } finally { Math.random = random; }
});
