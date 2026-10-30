// Salto, caída en bucle y aterrizaje (suave o fuerte según la velocidad de caída). Dueño: locomotion-animator.
//
// jump y fall comparten la misma pose continua en función de la velocidad vertical (subiendo: piernas
// recogidas y rezagadas; bajando: piernas que buscan el suelo), así el paso jump→fall no tiene salto.
// La zancada en el aire (pierna adelantada / atrasada) crece con la velocidad horizontal.

import { clamp01, remap01, lerp, ease } from '../core/math.js';
import { cfg, loco, dynOf, dynTrack, applyLean, dynamics, quickFade, plantFull, pulse } from './common.js';

const speedOf = (rig, p) => (p.speed !== undefined ? p.speed : rig.speed);

function airPose(rig, c, vy, hSpeed, tuckIn, stretch) {
  const A = c.air;
  const sp = remap01(hSpeed, 0.5, 3.2);
  const desc = clamp01(-vy / A.fallRef);              // 0 en el ápice, 1 cayendo rápido
  const t = rig.t;
  const flail = Math.sin(t * 5.5) * 0.07 * desc;
  const k = tuckIn * (1 - 0.35 * stretch);
  // pierna adelantada (izq.) y atrasada (der.): recogidas → extendidas hacia el suelo al caer
  const lUp = lerp(0.55 + 0.45 * sp, 0.45 + 0.3 * sp, desc) * k + flail;
  const lKn = -lerp(0.8 + 0.5 * sp, 0.35, desc) * k;
  const rUp = lerp(0.5 - 0.85 * sp, 0.2 - 0.2 * sp, desc) * k - flail;
  const rKn = -lerp(0.9 + 0.5 * sp, 0.55 + 0.3 * sp, desc) * k;
  rig.rot('lUpLeg', lUp, 0, 0); rig.rot('lLeg', lKn, 0, 0);
  rig.rot('rUpLeg', rUp, 0, 0); rig.rot('rLeg', rKn, 0, 0);
  // Despegue: cuerpo estirado, pecho arriba; luego tronco ligeramente adelantado
  const lean = -0.1 * sp * tuckIn + 0.12 * stretch - 0.08 * desc;
  rig.rot('spine', lean * 0.5, 0, 0); rig.rot('spine1', lean * 0.3, 0, 0); rig.rot('spine2', lean * 0.2, 0, 0);
  // Brazos (solo se ven sin arma: con arma manda el IK)
  const arms = 0.5 + 0.5 * desc + 0.6 * stretch;
  rig.rot('lArm', arms, 0, -0.55); rig.rot('rArm', arms, 0, 0.55);
  rig.rot('lForeArm', 0.5, 0, 0); rig.rot('rForeArm', 0.5, 0, 0);
}

export const jump = {
  aimWeight: 0.6,
  enter(rig) { dynOf(rig, 0).minVy = 0; quickFade(rig, cfg(rig).fade.jump); },
  update(rig, dt, p) {
    const c = cfg(rig);
    const A = c.air;
    const vy = p.vy !== undefined ? p.vy : rig.vy;
    const d = dynTrack(rig, speedOf(rig, p));
    if (vy < d.minVy) d.minVy = vy;
    rig.clip('Idle', 1, 0.05);
    const stretch = pulse(rig.t, 0.03, A.stretchTime);
    const tuck = ease.smooth(remap01(rig.t, A.stretchTime * 0.6, A.tuckTime));
    airPose(rig, c, vy, speedOf(rig, p), tuck, stretch);
  },
};

export const fall = {
  aimWeight: 0.6,
  update(rig, dt, p) {
    const c = cfg(rig);
    const vy = p.vy !== undefined ? p.vy : rig.vy;
    const d = dynTrack(rig, speedOf(rig, p));
    if (vy < d.minVy) d.minVy = vy;
    rig.clip('Idle', 1, 0.05);
    // Si se entra directamente en caída (sin salto) la pose se arma en ~0.2 s
    const tuck = ease.smooth(remap01(rig.t, 0, 0.2));
    airPose(rig, c, vy, speedOf(rig, p), Math.max(tuck, 0.55), 0);
    plantFull(rig, 1);          // con el IK ya enganchado al caer, el aterrizaje no hunde los pies
  },
};

export const land = {
  enter(rig, p) {
    const c = cfg(rig);
    const d = dynOf(rig, 0);
    const L = c.land;
    let impact = p.impact;
    if (impact === undefined) impact = L.minImpact + (1 - L.minImpact) * remap01(-d.minVy, L.speeds[0], L.speeds[1]);
    rig.mem.landImpact = impact;
    quickFade(rig, L.fade);
    d.minVy = 0;
    if (impact > 0.15) { rig.emit('anim:footstep', 'land', 'left'); rig.emit('anim:footstep', 'land', 'right'); }
  },
  update(rig, dt, p) {
    const c = cfg(rig);
    const L = c.land;
    const I = rig.mem.landImpact === undefined ? 0.5 : rig.mem.landImpact;
    const v = speedOf(rig, p);
    // Si aterriza corriendo, el ciclo de carrera continúa bajo la flexión
    if (v > 0.8) {
      loco(rig, c, v, p.dir !== undefined ? p.dir : rig.moveDir, remap01(v, c.blend[0], c.blend[1]), 1);
      applyLean(rig, dynamics(rig, dt, v, c), c, v);
    } else {
      rig.clip('Idle');
      dynTrack(rig, v);
    }
    const dip = lerp(L.dip[0], L.dip[1], I);
    const total = lerp(L.recover[0], L.recover[1], I);
    const k = pulse(rig.t, L.down, total);
    rig.hips(0, -dip * k, 0.04 * k + 0.08 * I * k);
    plantFull(rig, 1);
    rig.rot('spine', -(0.12 + 0.35 * I) * k * 0.5, 0, 0);
    rig.rot('spine1', -(0.12 + 0.35 * I) * k * 0.3, 0, 0);
    rig.rot('spine2', -(0.12 + 0.35 * I) * k * 0.2, 0, 0);
    rig.rot('head', (0.1 + 0.2 * I) * k, 0, 0);
    // Brazos para equilibrar (sin arma)
    rig.rot('lArm', 0.5 * I * k, 0, -0.45 * I * k); rig.rot('rArm', 0.5 * I * k, 0, 0.45 * I * k);
  },
};
