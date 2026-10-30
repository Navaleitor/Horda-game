// Idle, walk, jog, run y crouch. Dueño: locomotion-animator.
//
// Blend por velocidad: Walk puro hasta blend[0], Run puro desde blend[1], con la cadencia calculada
// para que el pie apoyado avance a la velocidad real (common.loco). Encima: inclinación de arranque
// y frenada, alabeo en curvas y giro en el sitio con pasos.

import { remap01, lerp } from '../core/math.js';
import { cfg, loco, dynamics, applyLean, plantFull } from './common.js';

const speedOf = (rig, p) => (p.speed !== undefined ? p.speed : rig.speed);
const dirOf = (rig, p) => (p.dir !== undefined ? p.dir : rig.moveDir);

/** Agachado: cadera baja, tronco inclinado, pies plantados con IK. */
function crouchPose(rig, c) {
  const q = c.crouch;
  rig.hips(0, q.depth, q.back);
  plantFull(rig, 1);
  rig.rot('spine', -q.lean * 0.45, 0, 0);
  rig.rot('spine1', -q.lean * 0.35, 0, 0);
  rig.rot('spine2', -q.lean * 0.2, 0, 0);
  rig.rot('neck', q.lean * 0.25, 0, 0);
  rig.rot('head', q.lean * 0.35, 0, 0);
}

export const idle = {
  update(rig, dt, p) {
    const c = cfg(rig);
    const v = speedOf(rig, p);
    const d = dynamics(rig, dt, v, c);
    applyLean(rig, d, c, v);
    // Giro en el sitio: el cuerpo quieto gira → pasos del ciclo Walk a poca cadencia
    const ts = c.turnSteps;
    const turn = remap01(Math.abs(d.yr), ts.minRate, ts.maxRate) * (1 - remap01(v, ts.maxSpeed * 0.5, ts.maxSpeed));
    if (turn > 0.01) {
      rig.clip('Idle', 1 - turn);
      loco(rig, c, lerp(ts.stepSpeed[0], ts.stepSpeed[1], turn), 0, 0, turn);
    } else {
      rig.clip('Idle');
    }
  },
};

function gait(crouch) {
  return {
    update(rig, dt, p) {
      const c = cfg(rig);
      const v = speedOf(rig, p);
      loco(rig, c, v, dirOf(rig, p), crouch ? 0 : remap01(v, c.blend[0], c.blend[1]), 1);
      const d = dynamics(rig, dt, v, c);
      applyLean(rig, d, c, v);
      if (crouch) crouchPose(rig, c);
    },
  };
}

export const walk = gait(false);
export const jog = gait(false);
export const run = gait(false);
export const crouch = gait(true);
export { crouchPose };
