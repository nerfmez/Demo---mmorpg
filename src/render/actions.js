// Keyframed actions for HumanoidAnimator, one per skill line, and the choice of action for a
// cast (skill id, kind, weapon, combo step). Presentation only.
//
// An action is { hit, keys }: keys = [[t, pose], ...] with t in 0..1, and `hit` is the key
// time when the blow lands or the spell leaves the hand; play() stretches the keys so that
// moment falls exactly on the skill's cast time.
//
// Pose channels (driver bones, Euler XYZ radians): hips, torso, chest, head, legL/R, kneeL/R,
// armL/R, elbowL/R, handL/R, weapon. Conventions: arm x < 0 raises the arm forward, armL
// z > 0 / armR z < 0 lifts it out to the side; elbow x < 0 bends; torso/chest y > 0 twists to
// the character's left; torso x > 0 leans forward; leg x < 0 swings the leg forward.
// Extra channels: drop [m] lowers the body; spin [rad] turns the whole body (not blended, so
// a full turn ends where it began); ikL / ikR [x, y, z] are hand targets in the character's
// root space (x left, y up, z forward, metres) with weights ikw [left, right]; grip [w] puts
// the left hand on the weapon's handle (two-handed weapons); aim [w] stands the weapon up
// facing forward with its grip in the right palm (a drawn bow). swing [angle, elevation, height]
// with weight sw [w] puts the right palm on an arc round the body (angle 0 = forward, + = the
// hero's left; height in metres) with the blade pointing out along it, edge leading
// (hero.js solveWeapon). Melee keys follow the approved slash crescent (vfx.js approvedCut):
// cuts 1 and 3 rise from the hero's lower right to upper left, cut 2 (reversed) from lower left
// to upper right, and the crescent is drawn whole at the hit: the blade reaches the far end of
// its arc on the hit key, then follows through.

import CLIPS from '../../data/action-clips.json';

export const READY = { armR: [-0.28, 0, -0.18], elbowR: [-0.55, 0, 0], armL: [-0.12, 0, 0.16], elbowL: [-0.35, 0, 0] };
// neutral start/end: every channel an action may touch goes back to rest
const REST = { ...READY, weapon: [1.2, 0, 0], torso: [0.05, 0, 0], chest: [0, 0, 0], hips: [0, 0, 0], head: [0, 0, 0], drop: [0, 0, 0], ikw: [0, 0, 0], grip: [0, 0, 0] };
const hold = (pose, extra = {}) => ({ ...pose, ...extra });

// ---------- melee: sword (and staff, wand, bow bash) ----------
const A_WIND = { armR: [-2.3, 0.2, -0.5], elbowR: [-1.3, 0, 0], armL: [-0.9, 0.2, 0.35], elbowL: [-0.8, 0, 0], weapon: [0.6, 0, 0.4], torso: [-0.05, -0.55, 0], chest: [0, -0.3, 0], hips: [0, -0.25, 0], legL: [-0.3, 0, 0], kneeL: [0.45, 0, 0], legR: [0.25, 0, 0], kneeR: [0.4, 0, 0], drop: [-0.05, 0, 0] };
const A_HIT = { armR: [-1.2, -0.9, 0.3], elbowR: [-0.1, 0, 0], armL: [-0.2, 0, 0.6], elbowL: [-0.5, 0, 0], weapon: [1.4, 0, -0.9], torso: [0.25, 0.55, 0], chest: [0.1, 0.3, 0], hips: [0, 0.3, 0], legL: [-0.55, 0, 0], kneeL: [0.75, 0, 0], legR: [0.45, 0, 0], kneeR: [0.25, 0, 0], drop: [-0.1, 0, 0] };
const A_END = { ...A_HIT, armR: [-0.6, -1.1, 0.5], elbowR: [-0.3, 0, 0], armL: [-0.15, 0, 0.5], weapon: [1.5, 0, -0.6], torso: [0.3, 0.75, 0], chest: [0.1, 0.35, 0], hips: [0, 0.35, 0] };
const B_WIND = { armR: [-1.7, 0.3, 0.7], elbowR: [-1.4, 0, 0], weapon: [0.5, 0, -0.4], torso: [0, 0.6, 0], chest: [0, 0.3, 0], hips: [0, 0.3, 0], armL: [-0.3, 0, 0.4], elbowL: [-0.5, 0, 0], legL: [-0.4, 0, 0], kneeL: [0.55, 0, 0], legR: [0.3, 0, 0], kneeR: [0.35, 0, 0], drop: [-0.08, 0, 0] };
const B_HIT = { armR: [-1.0, 0.6, -1.2], elbowR: [-0.1, 0, 0], weapon: [1.4, 0, 0.9], torso: [0.2, -0.55, 0], chest: [0.05, -0.3, 0], hips: [0, -0.3, 0], armL: [-0.4, 0, 0.9], elbowL: [-0.4, 0, 0], legR: [-0.55, 0, 0], kneeR: [0.75, 0, 0], legL: [0.4, 0, 0], kneeL: [0.25, 0, 0], drop: [-0.1, 0, 0] };
const B_END = { ...B_HIT, armR: [-0.6, 0.7, -1.3], elbowR: [-0.25, 0, 0], weapon: [1.45, 0, 0.6], torso: [0.2, -0.7, 0], chest: [0.05, -0.35, 0], hips: [0, -0.35, 0], armL: [-0.3, 0, 0.7] };
const C_WIND = { armR: [-2.9, 0, -0.2], elbowR: [-1.4, 0, 0], weapon: [0.2, 0, 0], armL: [-2.6, 0, 0.3], elbowL: [-1.0, 0, 0], torso: [-0.25, 0, 0], chest: [-0.15, 0, 0], head: [-0.2, 0, 0], hips: [0, 0, 0], legL: [-0.5, 0, 0], kneeL: [1.0, 0, 0], legR: [-0.3, 0, 0], kneeR: [0.9, 0, 0], drop: [-0.12, 0, 0] };
const C_HIT = { armR: [-1.3, 0, -0.1], elbowR: [-0.05, 0, 0], weapon: [1.57, 0, 0], armL: [-0.6, 0, 0.6], elbowL: [-0.5, 0, 0], torso: [0.45, 0, 0], chest: [0.2, 0, 0], head: [0.2, 0, 0], legL: [-0.7, 0, 0], kneeL: [1.0, 0, 0], legR: [0.5, 0, 0], kneeR: [0.3, 0, 0], drop: [-0.15, 0, 0] };

// ---------- melee: greatblade and axe (two hands, heavier and lower) ----------
const G = { grip: [1, 0, 0] };
const HA_WIND = { ...A_WIND, ...G, armR: [-2.6, 0.3, -0.4], elbowR: [-1.5, 0, 0], weapon: [0.3, 0, 0.3], torso: [-0.1, -0.5, 0], chest: [-0.1, -0.25, 0], drop: [-0.08, 0, 0], kneeL: [0.55, 0, 0], kneeR: [0.5, 0, 0] };
const HA_HIT = { ...A_HIT, ...G, armR: [-1.0, -0.5, 0.35], weapon: [1.5, 0, -0.4], torso: [0.45, 0.4, 0], chest: [0.2, 0.2, 0], hips: [0, 0.25, 0], legL: [-0.7, 0, 0], kneeL: [1.0, 0, 0], legR: [0.5, 0, 0], kneeR: [0.3, 0, 0], drop: [-0.16, 0, 0] };
const HB_WIND = { ...G, armR: [-1.1, 0.4, -1.2], elbowR: [-0.6, 0, 0], weapon: [1.0, 0, 0.9], torso: [0.05, -0.8, 0], chest: [0, -0.3, 0], hips: [0, -0.4, 0], legL: [-0.35, 0, 0], kneeL: [0.6, 0, 0], legR: [0.35, 0, 0], kneeR: [0.5, 0, 0], drop: [-0.1, 0, 0] };
const HB_HIT = { ...G, armR: [-1.2, -0.8, 0.6], elbowR: [-0.15, 0, 0], weapon: [1.3, 0, -1.0], torso: [0.2, 0.7, 0], chest: [0.05, 0.35, 0], hips: [0, 0.4, 0], legL: [-0.6, 0, 0], kneeL: [0.8, 0, 0], legR: [0.45, 0, 0], kneeR: [0.35, 0, 0], drop: [-0.13, 0, 0] };

// ---------- melee: dagger (quick thrusts; weapon x 1.57 lines the blade up with the forearm) ----------
const SA_WIND = { armR: [-0.6, 0, -0.3], elbowR: [-1.8, 0, 0], weapon: [1.1, 0, 0], armL: [-0.8, 0, 0.4], elbowL: [-1.1, 0, 0], torso: [0, -0.35, 0], chest: [0, -0.15, 0], legL: [-0.2, 0, 0], kneeL: [0.35, 0, 0], kneeR: [0.3, 0, 0], drop: [-0.04, 0, 0] };
const SA_HIT = { armR: [-1.5, -0.2, 0.1], elbowR: [-0.05, 0, 0], weapon: [1.57, 0, 0], armL: [-0.3, 0, 0.6], elbowL: [-0.9, 0, 0], torso: [0.2, 0.3, 0], chest: [0.05, 0.15, 0], legL: [-0.6, 0, 0], kneeL: [0.8, 0, 0], legR: [0.35, 0, 0], kneeR: [0.2, 0, 0], drop: [-0.08, 0, 0] };
const SB_WIND = { armR: [-1.0, 0.2, 0.8], elbowR: [-1.3, 0, 0], weapon: [1.0, 0, -0.6], armL: [-0.4, 0, 0.5], torso: [0, 0.5, 0], chest: [0, 0.25, 0], legR: [-0.25, 0, 0], kneeR: [0.4, 0, 0], kneeL: [0.3, 0, 0], drop: [-0.05, 0, 0] };
const SB_HIT = { armR: [-1.3, 0.4, -1.0], elbowR: [-0.1, 0, 0], weapon: [1.57, 0, 0.8], armL: [-0.5, 0, 0.9], torso: [0.15, -0.5, 0], chest: [0.05, -0.25, 0], legR: [-0.55, 0, 0], kneeR: [0.75, 0, 0], legL: [0.35, 0, 0], kneeL: [0.25, 0, 0], drop: [-0.08, 0, 0] };
const SC_WIND = { armR: [-0.4, 0, -0.4], elbowR: [-2.0, 0, 0], weapon: [1.1, 0, 0], armL: [-1.2, 0, 0.3], elbowL: [-0.6, 0, 0], torso: [0.3, -0.3, 0], legL: [-0.5, 0, 0], kneeL: [1.1, 0, 0], legR: [0.1, 0, 0], kneeR: [0.9, 0, 0], drop: [-0.16, 0, 0] };
const SC_HIT = { armR: [-1.6, -0.1, 0.05], elbowR: [0, 0, 0], weapon: [1.57, 0, 0], armL: [0.4, 0, 0.5], elbowL: [-0.2, 0, 0], torso: [0.35, 0.25, 0], chest: [0.1, 0.1, 0], legL: [-0.95, 0, 0], kneeL: [1.1, 0, 0], legR: [0.6, 0, 0], kneeR: [0.15, 0, 0], drop: [-0.18, 0, 0] };

// ---------- spells (the staff or wand stays in the right hand) ----------
const BOLT_GATHER = { torso: [0, -0.4, 0], chest: [0, -0.2, 0], ikL: [-0.05, 1.3, 0.22], ikw: [1, 0, 0], armR: [-0.3, 0.2, -0.4], elbowR: [-0.5, 0, 0], weapon: [1.2, 0, 0.3], legL: [-0.25, 0, 0], kneeL: [0.35, 0, 0], kneeR: [0.2, 0, 0], drop: [-0.04, 0, 0] };
const BOLT_OUT = { torso: [0.15, 0.3, 0], chest: [0.05, 0.1, 0], ikL: [0.1, 1.4, 0.66], ikw: [1, 0, 0], armR: [0.2, 0, -0.35], elbowR: [-0.3, 0, 0], weapon: [1.2, 0, 0.3], legL: [-0.45, 0, 0], kneeL: [0.55, 0, 0], legR: [0.25, 0, 0], kneeR: [0.15, 0, 0], drop: [-0.07, 0, 0] };
// Staff-only Firebolt: hands support the raised shaft. The animator solves the
// two grips and keeps its head at the forward cast socket; other weapons retain
// their authored bolt/sword actions.
const STAFF_GATHER = { torso: [-.03,-.10,0], chest: [0,-.05,0], armR: [-.3,0,-.4], elbowR: [-.7,0,0], armL: [-.7,0,.3], elbowL: [-1,0,0], staffAim: [1,0,0] };
const STAFF_OUT = { ...STAFF_GATHER, torso: [.07,.08,0], chest: [0,.03,0], staffAim: [1,0,0] };
const ZAP_COIL = { torso: [0.05, -0.55, 0], chest: [0, -0.2, 0], ikL: [-0.15, 1.2, 0.22], ikw: [1, 0, 0], armR: [-0.5, 0, -0.4], elbowR: [-1.0, 0, 0], weapon: [1.0, 0, 0], kneeL: [0.35, 0, 0], kneeR: [0.35, 0, 0], drop: [-0.05, 0, 0] };
const ZAP_FLICK = { torso: [0.1, 0.35, 0], chest: [0, 0.2, 0], head: [0, 0.15, 0], ikL: [0.48, 1.45, 0.45], ikw: [1, 0, 0], armR: [-2.5, 0, -0.5], elbowR: [-0.2, 0, 0], weapon: [0.3, 0, 0], legL: [-0.3, 0, 0], kneeL: [0.4, 0, 0], drop: [-0.04, 0, 0] };
const SLAM_UP = { armR: [-2.8, 0, -0.2], elbowR: [-0.5, 0, 0], weapon: [0.1, 0, 0], armL: [-2.6, 0, 0.3], elbowL: [-0.4, 0, 0], torso: [-0.2, 0, 0], chest: [-0.15, 0, 0], head: [-0.25, 0, 0], drop: [0.02, 0, 0] };
const SLAM_DOWN = { armR: [-1.0, 0, -0.1], elbowR: [-0.1, 0, 0], weapon: [1.57, 0, 0], ikL: [0.15, 0.3, 0.5], ikw: [1, 0, 0], torso: [0.6, 0, 0], chest: [0.25, 0, 0], head: [0.3, 0, 0], legL: [-0.9, 0, 0], kneeL: [1.4, 0, 0], legR: [0.2, 0, 0], kneeR: [1.3, 0, 0], drop: [-0.3, 0, 0] };
const NOVA_CURL = { ikL: [0.05, 1.25, 0.2], ikw: [1, 0, 0], armR: [-0.6, 0.3, 0.3], elbowR: [-1.2, 0, 0], weapon: [1.3, 0, 0], torso: [0.35, 0, 0], chest: [0.2, 0, 0], head: [0.35, 0, 0], legL: [-0.3, 0, 0], kneeL: [0.7, 0, 0], legR: [-0.3, 0, 0], kneeR: [0.7, 0, 0], drop: [-0.12, 0, 0] };
const NOVA_BURST = { armL: [-0.8, 0, 1.3], elbowL: [-0.1, 0, 0], armR: [-0.8, 0, -1.3], elbowR: [-0.1, 0, 0], weapon: [1.2, 0, 0], ikw: [0, 0, 0], torso: [-0.2, 0, 0], chest: [-0.2, 0, 0], head: [-0.3, 0, 0], legL: [0, 0, 0], kneeL: [0.05, 0, 0], legR: [0, 0, 0], kneeR: [0.05, 0, 0], drop: [0, 0, 0] };
const SOW_BACK = { torso: [0.25, -0.6, 0], chest: [0, -0.2, 0], ikL: [-0.25, 0.92, 0.12], ikw: [1, 0, 0], armR: [-0.3, 0, -0.5], elbowR: [-0.4, 0, 0], legL: [-0.3, 0, 0], kneeL: [0.55, 0, 0], kneeR: [0.5, 0, 0], drop: [-0.08, 0, 0] };
const SOW_THROW = { torso: [0.35, 0.45, 0], chest: [0.05, 0.2, 0], ikL: [0.45, 0.92, 0.55], ikw: [1, 0, 0], armR: [-0.2, 0, -0.6], elbowR: [-0.3, 0, 0], legL: [-0.5, 0, 0], kneeL: [0.7, 0, 0], kneeR: [0.45, 0, 0], drop: [-0.12, 0, 0] };
const HEX_DRAW = { armR: [-2.2, 0, -0.5], elbowR: [-0.6, 0, 0], weapon: [0.3, 0, 0], ikL: [0.12, 1.47, 0.22], ikw: [1, 0, 0], torso: [-0.1, -0.2, 0], head: [-0.1, 0, 0] };
const HEX_POINT = { armR: [-2.0, 0, -0.5], elbowR: [-0.5, 0, 0], weapon: [0.3, 0, 0], ikL: [0.15, 1.5, 0.72], ikw: [1, 0, 0], torso: [0.2, 0.2, 0], head: [0.1, -0.1, 0], legL: [-0.35, 0, 0], kneeL: [0.45, 0, 0], drop: [-0.05, 0, 0] };
const HEAL_LOW = { armR: [-0.4, 0, -0.2], elbowR: [-0.3, 0, 0], weapon: [1.57, 0, 0], ikL: [0.1, 1.1, 0.35], ikw: [1, 0, 0], head: [0.3, 0, 0], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0], drop: [-0.04, 0, 0] };
const HEAL_UP = { armR: [-0.4, 0, -0.2], elbowR: [-0.3, 0, 0], weapon: [1.57, 0, 0], ikL: [0.15, 1.78, 0.35], ikw: [1, 0, 0], head: [-0.35, 0, 0], chest: [-0.15, 0, 0], torso: [-0.05, 0, 0] };
const CALL_UP = { armL: [-2.8, 0.2, 0.2], elbowL: [-0.2, 0, 0], head: [-0.3, 0, 0], chest: [-0.1, 0.1, 0], armR: [-0.5, 0, -0.3], elbowR: [-0.4, 0, 0] };
const CALL_POINT = { ikL: [0.3, 0.8, 0.8], ikw: [1, 0, 0], torso: [0.3, 0.1, 0], head: [0.25, 0, 0], armR: [-0.3, 0, -0.4], legL: [-0.4, 0, 0], kneeL: [0.5, 0, 0], drop: [-0.06, 0, 0] };

// ---------- ranged attacks ----------
// bow in the right hand held out at the target, the left hand draws the string to the chin
const BOW_RAISE = { torso: [0, 0.75, 0], chest: [0, 0.2, 0], head: [0, -0.85, 0], ikR: [-0.05, 1.42, 0.66], ikL: [-0.04, 1.42, 0.5], ikw: [1, 1, 0], aim: [1, 0, 0], weapon: [0, 0, 0], legL: [-0.2, 0, 0], legR: [0.2, 0, 0] };
const BOW_DRAW = { ...BOW_RAISE, ikL: [-0.1, 1.5, 0.12], chest: [-0.05, 0.25, 0] };
const BOW_LOOSE = { ...BOW_RAISE, ikL: [-0.08, 1.45, -0.08], chest: [-0.05, 0.3, 0] };
const THROW_WIND = { armR: [-2.4, 0.3, -0.6], elbowR: [-1.6, 0, 0], weapon: [1.2, 0, 0], armL: [-1.2, 0, 0.3], elbowL: [-0.2, 0, 0], torso: [-0.1, -0.5, 0], chest: [0, -0.2, 0], legL: [-0.3, 0, 0], kneeL: [0.3, 0, 0], legR: [0.25, 0, 0], kneeR: [0.3, 0, 0] };
const THROW_OUT = { armR: [-1.3, -0.4, 0.3], elbowR: [-0.1, 0, 0], weapon: [1.2, 0, 0], armL: [0.2, 0, 0.4], elbowL: [-0.5, 0, 0], torso: [0.25, 0.4, 0], chest: [0.05, 0.2, 0], legL: [-0.5, 0, 0], kneeL: [0.6, 0, 0], legR: [0.35, 0, 0], kneeR: [0.2, 0, 0], drop: [-0.06, 0, 0] };

// ---------- spin, shouts, guards ----------
const WHIRL_ARMS = { armR: [-1.3, 0, -1.3], elbowR: [-0.2, 0, 0], weapon: [1.57, 0, 0], armL: [-0.3, 0, 1.2], elbowL: [-0.3, 0, 0], torso: [0.2, 0, 0], legL: [-0.3, 0, 0], kneeL: [0.55, 0, 0], legR: [0.25, 0, 0], kneeR: [0.5, 0, 0], drop: [-0.1, 0, 0] };

// channels that must read as zero where a key leaves them out (samplePose would otherwise
// borrow the neighbouring key's value, e.g. keep an IK weight on during a wind-up)
const ZERO = { ikw: [0, 0, 0], grip: [0, 0, 0], drop: [0, 0, 0], aim: [0, 0, 0], sw: [0, 0, 0] };
// a swing key: palm on the arc at angle a, blade elevation e, palm height y; sw [weight, lead]: lead -1
// when the cut runs to falling angles, so the solver keeps the cutting edge in front (hero.js)
const arc = (a, e, y, lead = 1) => ({ sw: [1, lead, 0], swing: [a, e, y] });
// the three cuts' arcs (wind-up, just before the hit, hit at the far end, follow-through)
const RISE_L = [arc(-2.0, -0.45, 0.92), arc(-1.0, -0.15, 1.0), arc(0.95, 0.25, 1.12), arc(1.55, 0.35, 1.18)];
const RISE_R = [arc(1.7, -0.4, 0.95), arc(0.85, -0.12, 1.02), arc(-0.95, 0.25, 1.14), arc(-1.6, 0.35, 1.2)];
const RISE_BIG = [arc(-2.25, -0.6, 0.86), arc(-1.1, -0.2, 0.98), arc(1.0, 0.42, 1.24), arc(1.65, 0.55, 1.3)];
const body = (p) => Object.fromEntries(Object.entries(p).filter(([n]) => !['armR', 'elbowR', 'weapon', 'grip'].includes(n)));
// coil(p, k): the same pose wound k times further (twist, lean and crouch) - the anime hold and
// overshoot keys (.claude/skills/anime-action)
const coil = (p, k) => {
  const o = { ...p };
  for (const n of ['torso', 'chest', 'hips']) if (p[n]) o[n] = [p[n][0] * (n === 'torso' ? 1 + (k - 1) * 0.5 : 1), p[n][1] * k, p[n][2]];
  if (p.drop) o.drop = [p.drop[0] * k, 0, 0];
  return o;
};
// A cut in the anime beat: anticipation (load into the wind-up), a hold coiled a little further,
// one very short strike that reaches the contact on the hit key, an overshoot past it, the
// finishing pose held, then recovery.
const cut = (hit, pre, poses, [...arcs], end = 0.66) => {
  // the edge leads the way the strike runs (to rising or falling angles), through the whole cut
  const lead = Math.sign(arcs[2].swing[0] - arcs[1].swing[0]) || 1;
  arcs = arcs.map((k) => arc(...k.swing, lead));
  return act(hit, [
    [0, REST],
    [pre, { ...body(poses[0]), ...arcs[0] }],                         // anticipation
    [hit - 0.08, { ...body(coil(poses[0], 1.3)), ...arcs[0] }],       // hold: the freeze before the blow
    [hit - 0.03, { ...body(poses[0]), ...arcs[1] }],                  // strike: the blade leads, the body follows
    [hit, { ...body(poses[1]), ...arcs[2] }],                         // contact
    [hit + 0.06, { ...body(coil(poses[2], 1.2)), ...arcs[3] }],       // overshoot
    [end, { ...body(poses[2]), ...arcs[3] }],                         // finishing pose
    [Math.min(0.9, end + 0.12), { ...body(poses[2]), ...arcs[3] }],   // held
    [1, REST],
  ]);
};
const act = (hit, keys) => ({ hit, keys: keys.map(([t, p]) => [t, Object.keys(p).length ? { ...ZERO, ...p } : p]) });
export const ACTIONS = {
  staffBolt: { hit: .42, keys: [[0,{...STAFF_GATHER,staffAim:[0,0,0]}],[.16,STAFF_GATHER],[.42,STAFF_OUT],[.58,STAFF_OUT],[1,{...STAFF_GATHER,staffAim:[0,0,0]}]] },
  // combo cuts along the slash crescent: rising cut to the left, rising backhand to the right
  // (swings in a row alternate these two); slashC, a bigger rising cut, is kept for the leap. The body twists with the blade (wind-up away, hit through).
  slashA: cut(0.46, 0.3, [A_WIND, A_HIT, A_END], RISE_L),
  slashB: cut(0.46, 0.28, [B_WIND, B_HIT, B_END], RISE_R),
  slashC: cut(0.48, 0.32, [HA_WIND, HA_HIT, hold(HA_HIT, { torso: [0.4, 0.55, 0], drop: [-0.14, 0, 0] })], RISE_BIG, 0.7),
  // two-handed (greatblade; axe and mace with a free left hand): the same arcs, slower and lower
  heavyA: cut(0.5, 0.32, [HA_WIND, HA_HIT, hold(HA_HIT, { torso: [0.4, 0.5, 0] })], RISE_L, 0.72),
  heavyB: cut(0.5, 0.32, [HB_WIND, HB_HIT, hold(HB_HIT, { torso: [0.2, 0.85, 0] })], RISE_R, 0.72),
  heavyC: cut(0.5, 0.34, [HA_WIND, HA_HIT, hold(HA_HIT, { torso: [0.45, 0.6, 0], drop: [-0.2, 0, 0] })], RISE_BIG, 0.74),
  // dagger: quick, tight cuts on the same arcs with a lunge on the third
  stabA: cut(0.42, 0.26, [SA_WIND, SA_HIT, SA_HIT], RISE_L, 0.6),
  stabB: cut(0.44, 0.26, [SB_WIND, SB_HIT, SB_HIT], RISE_R, 0.62),
  stabC: cut(0.46, 0.3, [SC_WIND, SC_HIT, SC_HIT], RISE_L, 0.7),
  // whirl blade: a real turn toward the hero's left (as the whirl crescents travel) with the
  // blade held straight out to the left, leading the turn
  whirl: act(0.55, [[0, { ...REST, spin: [0, 0, 0] }], [0.25, { ...body(WHIRL_ARMS), torso: [0.2, -0.5, 0], spin: [-0.6, 0, 0], ...arc(1.35, 0, 1.08) }], [0.55, { ...body(WHIRL_ARMS), spin: [Math.PI, 0, 0], ...arc(1.45, 0.05, 1.1) }], [0.8, { ...body(WHIRL_ARMS), spin: [Math.PI * 2, 0, 0], ...arc(1.45, 0.05, 1.1) }], [1, { ...REST, spin: [Math.PI * 2, 0, 0] }]]),
  // ranged
  bow: act(0.56, [[0, REST], [0.24, BOW_RAISE], [0.46, BOW_DRAW], [0.56, BOW_LOOSE], [0.78, BOW_LOOSE], [1, REST]]),
  throw: act(0.45, [[0, REST], [0.28, THROW_WIND], [0.45, THROW_OUT], [0.65, THROW_OUT], [1, REST]]),
  // spells, one per line
  bolt: act(0.5, [[0, REST], [0.3, BOLT_GATHER], [0.5, BOLT_OUT], [0.72, BOLT_OUT], [1, REST]]),
  zap: act(0.45, [[0, REST], [0.3, ZAP_COIL], [0.45, ZAP_FLICK], [0.55, hold(ZAP_FLICK, { ikL: [0.42, 1.5, 0.5] })], [0.72, ZAP_FLICK], [1, REST]]),
  // slam: lift, hang at the top (leaning back), smash down on the hit, sink a little further, hold
  slam: act(0.55, [[0, REST], [0.28, SLAM_UP], [0.44, hold(SLAM_UP, { torso: [-0.3, 0, 0], chest: [-0.22, 0, 0], head: [-0.32, 0, 0], drop: [0.04, 0, 0] })], [0.55, SLAM_DOWN], [0.61, hold(SLAM_DOWN, { torso: [0.72, 0, 0], drop: [-0.36, 0, 0] })], [0.76, SLAM_DOWN], [0.86, SLAM_DOWN], [1, REST]]),
  nova: act(0.5, [[0, REST], [0.32, NOVA_CURL], [0.5, NOVA_BURST], [0.74, NOVA_BURST], [1, REST]]),
  sow: act(0.5, [[0, REST], [0.3, SOW_BACK], [0.5, SOW_THROW], [0.72, SOW_THROW], [1, REST]]),
  hex: act(0.5, [[0, REST], [0.3, HEX_DRAW], [0.5, HEX_POINT], [0.78, HEX_POINT], [1, REST]]),
  heal: act(0.55, [[0, REST], [0.3, HEAL_LOW], [0.55, HEAL_UP], [0.82, HEAL_UP], [1, REST]]),
  summon: act(0.55, [[0, REST], [0.34, CALL_UP], [0.55, CALL_POINT], [0.8, CALL_POINT], [1, REST]]),
  cast: act(0.6, [
    [0, { armL: [-0.3, 0, 0.2], elbowL: [-0.6, 0, 0], chest: [0, 0, 0], torso: [0, 0, 0] }],
    [0.35, { armL: [-0.9, 0.3, 0.5], elbowL: [-1.4, 0, 0], chest: [0, -0.35, 0], torso: [0, -0.15, 0], armR: [-0.1, 0, -0.3] }],
    [0.6, { armL: [-1.55, 0, 0.1], elbowL: [-0.05, 0, 0], chest: [0, 0.35, 0], torso: [0.08, 0.1, 0], armR: [0.2, 0, -0.35], legL: [-0.25, 0, 0], kneeL: [0.25, 0, 0] }],
    [1, { armL: [-0.3, 0, 0.2], elbowL: [-0.5, 0, 0], chest: [0, 0, 0], torso: [0.03, 0, 0] }],
  ]),
  // kept from the first set: they already read well
  ward: act(0.55, [
    [0, { armL: [-0.3, 0, 0.2], armR: [-0.3, 0, -0.2] }],
    [0.4, { armL: [-1.1, 0, 0.6], armR: [-1.1, 0, -0.6], elbowL: [-1.4, 0, 0], elbowR: [-1.4, 0, 0], chest: [-0.1, 0, 0], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0], drop: [-0.05, 0, 0] }],
    [0.7, { armL: [-0.9, 0, 1.1], armR: [-0.9, 0, -1.1], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], chest: [-0.15, 0, 0], drop: [0, 0, 0] }],
    [1, { ...REST, armL: [-0.2, 0, 0.18], elbowL: [-0.4, 0, 0] }],
  ]),
  warcry: act(0.55, [
    [0, { armL: [-0.3, 0, 0.2], armR: [-0.3, 0, -0.2] }],
    [0.3, { armL: [-0.4, 0, 0.3], armR: [-0.4, 0, -0.3], elbowL: [-1.6, 0, 0], elbowR: [-1.6, 0, 0], chest: [0.3, 0, 0], torso: [0.2, 0, 0], head: [0.2, 0, 0], kneeL: [0.5, 0, 0], kneeR: [0.5, 0, 0], drop: [-0.08, 0, 0] }],
    [0.55, { armL: [-0.5, 0, 1.35], armR: [-0.5, 0, -1.35], elbowL: [-0.5, 0, 0], elbowR: [-0.5, 0, 0], chest: [-0.35, 0, 0], torso: [-0.1, 0, 0], head: [-0.45, 0, 0], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0], drop: [-0.03, 0, 0] }],
    [1, { ...REST, armL: [-0.2, 0, 0.18], elbowL: [-0.4, 0, 0] }],
  ]),
  hurt: act(0, [
    [0, { torso: [-0.35, 0.15, 0], head: [-0.3, 0, 0], armL: [0.2, 0, 0.5], armR: [0.2, 0, -0.5] }],
    [1, {}],
  ]),
};

// Skill-specific actions built from the bow's keys (first made on the FX test bench); the bow skills
// themselves play clips (data/action-clips.json: bowShot, bowSkyShot, bowDrawHold, bowLooseShot).
{
  const [rest] = ACTIONS.bow.keys.map((k) => k[1]);
  // Flank Thrust: a straight stab (pull the dagger back at the hip, lunge and drive it out), not a cut
  const thWind = { ...rest, armR: [-0.5, 0, -0.25], elbowR: [-2.0, 0, 0], weapon: [1.57, 0, 0], armL: [-0.8, 0, 0.4], elbowL: [-1.1, 0, 0], torso: [0, -0.35, 0], chest: [0, -0.15, 0], legL: [-0.2, 0, 0], kneeL: [0.35, 0, 0], kneeR: [0.3, 0, 0], drop: [-0.04, 0, 0] };
  const thHit = { ...rest, armR: [-1.55, -0.1, 0.05], elbowR: [0, 0, 0], weapon: [1.57, 0, 0], armL: [0.3, 0, 0.5], elbowL: [-0.3, 0, 0], torso: [0.3, 0.35, 0], chest: [0.08, 0.15, 0], legL: [-0.8, 0, 0], kneeL: [1.0, 0, 0], legR: [0.45, 0, 0], kneeR: [0.2, 0, 0], drop: [-0.12, 0, 0] };
  // anticipation, hold (drawn further back), a snap to the stab, an overshoot lunge, the pose held
  ACTIONS.thrust = { hit: 0.45, keys: [[0, rest], [0.26, thWind], [0.38, coil(thWind, 1.25)], [0.45, thHit], [0.52, { ...coil(thHit, 1.2), armR: [-1.6, -0.1, 0.05] }], [0.68, thHit], [0.8, thHit], [1, rest]] };
  // Shield Bash: load the shield arm back across the body, then drive the shield straight out
  const bashWind = { ...rest, armL: [-0.7, 0, 0.7], elbowL: [-1.7, 0, 0], torso: [0.05, 0.5, 0], chest: [0, 0.25, 0], legL: [-0.15, 0, 0], kneeL: [0.4, 0, 0], kneeR: [0.35, 0, 0], drop: [-0.06, 0, 0] };
  const bashHit = { ...rest, armL: [-1.5, 0, 0.15], elbowL: [-0.15, 0, 0], torso: [0.3, -0.45, 0], chest: [0.08, -0.2, 0], legL: [-0.75, 0, 0], kneeL: [0.9, 0, 0], legR: [0.4, 0, 0], kneeR: [0.2, 0, 0], drop: [-0.12, 0, 0] };
  ACTIONS.shieldBash = { hit: 0.42, keys: [[0, rest], [0.24, bashWind], [0.35, coil(bashWind, 1.25)], [0.42, bashHit], [0.49, coil(bashHit, 1.2)], [0.66, bashHit], [0.8, bashHit], [1, rest]] };
  // Measured Riposte's guard: a high guard, the blade upright before the chest in both hands, the
  // legs set wide (Quaternius Sword_Regular_A_Rec at 0.05 s, the action keys of scripts/pose-retarget)
  const guardUp = { ...rest, armR: [-1.804, 0.477, 0.077], elbowR: [-0.488, 0, 0], weapon: [0.411, -0.457, -0.193], armL: [0.281, -0.907, 1.363], elbowL: [-1.674, 0, 0], hips: [0, -0.014, 0.19], torso: [-0.164, 0.423, -0.006], chest: [0.156, 0.18, -0.01], head: [0.1, -0.589, 0], legL: [-0.596, -0.129, 0.166], kneeL: [0.435, 0, 0], legR: [-0.572, -0.36, -0.802], kneeR: [0.955, 0, 0], drop: [-0.109, 0, 0] };
  ACTIONS.guardBlock = { hit: 0.2, keys: [[0, rest], [0.15, guardUp], [0.85, guardUp], [1, rest]] };
}

// skill id -> action (or a family resolved by weapon / combo step)
const BY_SKILL = {
  slash: 'combo', whirl_blade: 'whirlSpin', hunter_shot: 'shoot', charged_shot: 'bowLooseShot', arcane_bolt: 'boltCast', firebolt: 'boltCast', chain_spark: 'zap',
  stone_burst: 'boltCast', frost_nova: 'nova', venom_mire: 'shoot', venom_bolt: 'boltCast', hex: 'boltCast', ward: 'nova',
  arrow_rain: 'bowSkyShot', frontline_split: 'splitChop', armor_cleave: 'sunderChop', interrupt_slam: 'breakbeatSlam', sky_shatter: 'skyPry', weakpoint: 'flankStab', shield_bash: 'shieldShove', riposte: 'riposteGuard',
  war_cry: 'warCryRoar', healing_spring: 'nova', spirit_wolf: 'zap',
  // the owner's approved spells are the base of the alike ones: Firebolt's push (boltCast, staffCast with
  // a staff) for spells aimed at a spot, Chain Spark's flick (zap) for calling a summon, Frost Nova's
  // burst (nova) for spells around the hero
  crystal_wall: 'boltCast', stone_guardian: 'zap', cleanse: 'nova', battle_aura: 'nova', flame_stream: 'staffCastHeld',
};
// skill kind -> action, for skills without their own entry
const BY_KIND = {
  counter_stance:'ward',melee_line:'heavyC',channel_cone:'staffCastHeld',wall:'boltCast',heal_target:'nova',aura:'nova',
  melee_arc: 'combo', melee_nova: 'whirlSpin', chain: 'zap', ground_area: 'slam', nova: 'nova', dot_zone: 'sow',
  curse_zone: 'boltCast', self_barrier: 'nova', buff: 'warCryRoar', heal_zone: 'nova', summon: 'zap',
};
// Heavy weapons (axe, mace) swing one-handed like a sword when a shield is in the left hand; with the
// left hand free they are held in both and play the greatblade combo (hero.js play).
// The sword and the dagger cut with clips retargeted from reference animations (data/action-clips.json,
// owner picks): one cut for every step, the slash effect following its sweep. The greatblade keeps its
// hand-made alternating cuts (the owner preferred them to the KayKit two-handed slice).
const COMBOS = { greatblade: ['heavyA', 'heavyB'], sword: ['swordCut'], dagger: ['daggerCut'] };
/**
 * Register an action from clip data ({hit, sweep?, keys: [[t, pose]]}, absolute channels over REST).
 * A clip moves the weapon itself (own, unless it says own: false): its weapon channel is not held at
 * the carry angle, and a two-handed weapon's second hand holds the haft as the clip's grip channel says.
 * own: false keeps a staff upright through a spell gesture (the carry's castHold). ends: 'carry' eases
 * the action in from the hero's carry over the first segment and back over the last (hero.js).
 */
export function registerClip(name, c) {
  ACTIONS[name] = { hit: c.hit, sweep: c.sweep, own: c.own ?? true, ends: c.ends, keys: c.keys.map(([t, pose]) => [t, { ...REST, ...pose }]) };
}
for (const [name, c] of Object.entries(CLIPS)) if (name !== '_doc') registerClip(name, c);
// Breakbeat Slam with a shield in the left hand: the same jumping smash, the left hand kept off the haft
ACTIONS.breakbeatSlam1H = { ...ACTIONS.breakbeatSlam, keys: ACTIONS.breakbeatSlam.keys.map(([t, p]) => [t, { ...p, grip: [0, 0, 0] }]) };
// Flame Stream: the staff's Firebolt push held while channelling. A channel freezes the action at 0.92 of
// its hit (hero.js), so the full reach comes a little earlier and is held to the hit.
{
  const c = ACTIONS.staffCast, i = c.keys.findIndex(([t]) => t === c.hit);
  ACTIONS.staffCastHeld = { ...c, keys: [...c.keys.slice(0, i), [c.hit * 0.9, c.keys[i][1]], ...c.keys.slice(i)] };
}

// The same action struck with the left hand (a dual carry alternates its hands): the body mirrored left
// to right, the weapon channel moved to the left hand's weapon (offhand) and the right hand's weapon
// left resting in its fist. A rotation mirrors as [x, -y, -z] (the driver hands share one rest frame);
// the blade also turns half a turn about its length so its edge, not its back, still leads the cut.
// A swing arc mirrors its angle and its lead, and sw[2] = 1 hands it to the left hand (hero.js).
const SIDE = { armL: 'armR', armR: 'armL', elbowL: 'elbowR', elbowR: 'elbowL', handL: 'handR', handR: 'handL', legL: 'legR', legR: 'legL', kneeL: 'kneeR', kneeR: 'kneeL', footL: 'footR', footR: 'footL' };
function mirrorPose(p) {
  const o = {};
  for (const n in p) {
    const v = p[n];
    if (n === 'weapon') o.offhand = [v[0], -v[1], -v[2] + Math.PI];
    else if (n === 'ikL' || n === 'ikR') o[n === 'ikL' ? 'ikR' : 'ikL'] = [-v[0], v[1], v[2]]; // positions: x flips
    else if (n === 'ikw') o.ikw = [v[1], v[0], v[2]]; // [left, right]
    else if (n === 'spin' || n === 'swing') o[n] = [-v[0], v[1], v[2]];
    else if (n === 'sw') o.sw = [v[0], -v[1], 1];
    else if (['drop', 'grip', 'aim', 'gripSlide', 'staffAim'].includes(n)) o[n] = v;
    else o[SIDE[n] || n] = [v[0], -v[1], -v[2]];
  }
  o.weapon = REST.weapon;
  return o;
}
/** The left-hand version of action `name` (made once): eased in from the carry and back (ends 'carry'). */
export function leftHanded(name) {
  const m = name + '_L', a = ACTIONS[name];
  if (!ACTIONS[m] && a) {
    const swing = a.keys.some(([, p]) => p.swing);
    ACTIONS[m] = { hit: a.hit, sweep: -(a.sweep ?? 1), own: a.own, ends: 'carry', mirrorOf: name, keys: a.keys.map(([t, p]) => [t, mirrorPose(p)]) };
    if (swing) ACTIONS[m].own = false;
  }
  return ACTIONS[m] ? m : name;
}

/**
 * The action for a cast.
 * @param {string} skill skill id (castStart.skill), or an action name
 * @param {string} kind skill kind (castStart.kind)
 * @param {string} weapon weapon type
 * @param {number} step combo step for melee swings
 * @param {boolean} dual a second weapon in the left hand: the basic cut alternates its hands
 */
export function pickAction(skill, kind, weapon, step = 0, dual = false) {
  if (ACTIONS[skill] && skill !== 'hex' && skill !== 'ward') return skill; // an action named directly (or registered for the skill); Hex and Ward share their ids with generic actions
  let a = BY_SKILL[skill] || BY_KIND[kind] || (kind === 'projectile' ? (skill === 'hunter_shot' ? 'shoot' : 'bolt') : 'cast');
  // the staff points its head at the target with the arm pushed out (owner: the release arm goes forward)
  if (a === 'boltCast' && weapon === 'staff') a = 'staffCast';
  if (a === 'staffCastHeld' && weapon !== 'staff') a = 'boltCast'; // a held push needs the staff's own clip
  if (a === 'combo') {
    const c = COMBOS[weapon] || ['slashA', 'slashB'];
    // two weapons: the first cut, struck by the right and the left hand in turn; else one plain strike, alternating
    a = dual ? (step % 2 ? leftHanded(c[0]) : c[0]) : c[step % c.length];
  }
  if (a === 'shoot') a = weapon === 'bow' ? 'bowShot' : 'throw';
  if (a === 'boltCast' && weapon === 'bow') a = 'bolt';
  if (a === 'breakbeatSlam' && weapon !== 'greatblade') a = 'breakbeatSlam1H'; // a mace with a shield (play() names a two-handed mace greatblade)
  if (a === 'sunderChop' && weapon !== 'greatblade') a = 'sunderChop1H'; // an axe with a shield: the left arm stays on it (play() names a two-handed axe greatblade) // the wand's cast would turn the bow flat across the body
  return a;
}

