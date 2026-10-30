// Maroma (evade): voltereta real hacia la dirección del movimiento. Dueño: locomotion-animator.
//
//   0 ── anticipate ── roll[0] ═════ roll[1] ── 1
//   agacharse/lanzarse   giro completo encogido    recuperación de pie (cadera baja, tronco adelantado)
//
// La raíz la mueve player/ (evade.speed en la dirección del stick, el cuerpo gira hacia ella); aquí solo
// se gira la cadera 360° alrededor del eje perpendicular a la dirección de la maroma. La dirección se
// compone como Ry(dirViva)·Roll·Ry(−c(t)): la marcha fija del mundo se conserva aunque el yaw de la
// entidad esté girando hacia ella, y la orientación vuelve a la identidad al final del giro.
// El arma se suelta del IK durante la voltereta y va colgada a la espalda (lowCarry).

import { clamp01, remap01, lerp, ease, bell } from '../core/math.js';
import { cfg, releaseIk, dynTrack, quickFade, cancelStance, plantFull } from './common.js';

const TAU = Math.PI * 2;

export const evade = {
  aimWeight: 0, lowCarry: 1, handsFree: 1,
  enter(rig, p) {
    rig.mem.evadeDir = p.dir !== undefined ? p.dir : rig.moveDir;
    quickFade(rig, cfg(rig).fade.evade);
  },
  update(rig, dt, p) {
    const c = cfg(rig);
    const E = c.evade;
    const dur = p.duration || rig.config.player.evade.duration;
    const t = rig.phase(dur);
    const d0 = rig.mem.evadeDir === undefined ? 0 : rig.mem.evadeDir;
    const dLive = p.dir !== undefined ? p.dir : rig.moveDir;
    dynTrack(rig, rig.speed);

    rig.clip('Idle', 1, 0.05);
    cancelStance(rig, 1);

    const into = ease.smooth(remap01(t, E.delay, E.delay + E.anticipate));          // 0→1 al encogerse
    const r = remap01(t, E.roll[0], E.roll[1]);                      // progreso del giro
    const u = remap01(t, E.roll[1], 1);                              // recuperación
    const tuck = into * (1 - ease.smooth(u));
    const ang = TAU * (1 + E.extraTurns) * (0.75 * r + 0.25 * ease.smooth(r));

    // ── Giro de la cadera (composición Ry(dirViva)·Roll·Ry(−c)) ──
    const cd = lerp(d0, dLive, ease.smooth(r));
    rig.rot('hips', 0, -cd, 0);
    rig.rotAxis('hips', -1, 0, 0, ang);
    rig.rot('hips', 0, dLive, 0);

    // ── Postura encogida ──
    // Ejes LOCALES de hueso (rotLocal): la flexión sigue al cuerpo mientras gira (con ejes de personaje la
    // pose se desarmaría en las maromas laterales). Xbot: local +x flexiona columna/cuello/rodilla hacia
    // delante y lleva el muslo hacia ATRÁS (de ahí el signo negativo del muslo); brazo izq. z+ = adelante,
    // y− = hacia el cuerpo; brazo der. y+ = adelante, z+ = hacia el cuerpo; antebrazo izq. z+ / der. y+ = flexión.
    rig.hips(0, -E.hipsDrop * tuck - 0.12 * (1 - tuck) * into, 0.04 * tuck);
    rig.rotLocal('spine', 0.6 * tuck, 0, 0);
    rig.rotLocal('spine1', 0.55 * tuck, 0, 0);
    rig.rotLocal('spine2', 0.45 * tuck, 0, 0);
    rig.rotLocal('neck', 0.35 * tuck, 0, 0);
    rig.rotLocal('head', 0.3 * tuck, 0, 0);
    // muslos al pecho, talones al glúteo (tras agacharse con los pies plantados)
    const legs = ease.smooth(remap01(t, 0, E.roll[0] - 0.04)) * (1 - ease.smooth(u));
    rig.rotLocal('lUpLeg', -2.1 * legs, 0, 0); rig.rotLocal('rUpLeg', -2.1 * legs, 0, 0);
    rig.rotLocal('lLeg', 2.4 * legs, 0, 0); rig.rotLocal('rLeg', 2.4 * legs, 0, 0);
    // brazos abrazando las espinillas
    rig.rotLocal('lArm', 0, -0.45 * tuck, 1.0 * tuck); rig.rotLocal('rArm', 0, 1.0 * tuck, 0.45 * tuck);
    rig.rotLocal('lForeArm', 0, 0, 1.5 * tuck); rig.rotLocal('rForeArm', 0, 1.5 * tuck, 0);

    // ── Salida: de pie, cadera baja, tronco adelantado, pies apoyados ──
    const out = ease.smooth(u);
    const ready = out * (1 - 0.35 * out);
    rig.hips(0, -0.2 * ready, 0.05 * ready);
    rig.rotLocal('spine', E.fwdLean * 0.5 * ready, 0, 0);
    rig.rotLocal('spine1', E.fwdLean * 0.3 * ready, 0, 0);
    rig.rotLocal('spine2', E.fwdLean * 0.2 * ready, 0, 0);
    // Pies al suelo al incorporarse (nunca atraviesan el suelo)
    plantFull(rig, ease.smooth(remap01(u, -0.1, 0.1)));

    // El arma: suelta del IK y a la espalda mientras dura el giro
    const hold = bell(clamp01((t - 0.02) / 0.96)) ;
    releaseIk(rig, Math.min(1, hold * 1.4));
    rig.holdAdd(0.05 * hold, 0.15 * hold, 0.3 * hold, 0, 0, 0);
  },
};
