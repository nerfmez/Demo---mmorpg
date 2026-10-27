import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CAMERA_OFFSET, cameraOffset, CAM_PITCH, CAM_DISTANCE } from '../../src/render/game-camera.js';

test('the game camera stands 40 degrees above the horizon, behind the hero', () => {
  assert.equal(CAM_PITCH, 40, "the owner's camera angle");
  const o = GAME_CAMERA_OFFSET;
  assert.ok(Math.abs((Math.atan2(o.y, o.z) * 180) / Math.PI - 40) < 1e-9, 'pitch');
  assert.ok(Math.abs(o.length() - CAM_DISTANCE) < 1e-9 && o.x === 0 && o.z > 0, 'on +Z (toward the screen) at its distance');
  assert.ok(Math.abs(cameraOffset(55).length() - CAM_DISTANCE) < 1e-9, 'another angle keeps the distance');
});
