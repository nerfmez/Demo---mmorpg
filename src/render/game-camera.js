// The game camera's angle, shared by the game view, the Skill Lab, the FX bench and the effects
// drawn facing it: 40 degrees above the horizon (the owner's camera), 23.3 m from the hero before zoom.
import * as THREE from 'three';

export const CAM_DISTANCE = 23.3, CAM_PITCH = 40;

/** The camera's offset from the hero at `pitch` degrees above the horizon (default the game's). */
export function cameraOffset(pitch = CAM_PITCH, distance = CAM_DISTANCE) {
  const a = (pitch * Math.PI) / 180;
  return new THREE.Vector3(0, distance * Math.sin(a), distance * Math.cos(a));
}

/** The game camera's offset. */
export const GAME_CAMERA_OFFSET = cameraOffset();
