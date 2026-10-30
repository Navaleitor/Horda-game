// Vault (cobertura media, ~1 m) y trepar (cobertura alta, ~2.2 m). Dueño: locomotion-animator.
//
// La raíz la mueve player/ (vault: arco sobre la cobertura; trepar: sube en vertical y luego avanza).
// Aquí se baja/sube la cadera VISUAL respecto a esa raíz para que el cuerpo pase por encima de la
// cobertura sin atravesarla, y las manos van a puntos de agarre en la parte superior:
//   altura local de la mano = alturaCobertura − elevación de la raíz   (la mano queda fija en el mundo)
// La trayectoria de la raíz se PREDICE a partir de la fase (misma fórmula que player/movement.js) con un
// pequeño adelanto (config.anim.locomotion.lead) que compensa el suavizado de aditivos del rig (~50 ms),
// así la cadera nunca va por detrás de la raíz y las piernas no cruzan la cobertura.
// La altura de la cobertura sale de params.height (physics.queryLedge → topY) si el llamador la da; si no,
// se estima con la elevación real de la raíz (entity.pos.y) a mitad del gesto. Lo mismo con el avance.

import * as THREE from 'three';
import { clamp, clamp01, remap01, lerp, ease, curve } from '../core/math.js';
import { cfg, releaseIk, dynTrack, reachArm, shoulderPos, quickFade, lagged, cancelStance, plantFull } from './common.js';

const _sh = new THREE.Vector3();
const smooth = (t) => t * t * (3 - 2 * t);
// curvas por tramos (hoisted: sin reservas por frame)
const ARM_REACH = [0, 0.54, 0.3, 0.5, 0.55, 0.3, 0.8, 0.4, 1, 0.5];   // flexión del brazo al subir
const CLIMB_PITCH = [0, 0.12, 0.5, 0.3, 0.8, 0.65, 1, 1.15];          // inclinación del tronco al subir

function ent(rig) { return rig.entity && rig.entity.pos ? rig.entity.pos : null; }

function enter(rig, c, p, kind) {
  const pos = ent(rig);
  const m = rig.mem;
  m.tvY = pos ? pos.y : 0; m.tvX = pos ? pos.x : 0; m.tvZ = pos ? pos.z : 0;
  m.tvH = p.height !== undefined ? p.height : (kind === 'vault' ? c.vault.coverHeight : c.climb.height);
  m.tvD = kind === 'vault' ? c.vault.span : c.climb.span;
  quickFade(rig, c.fade[kind]);
  m.lgHy = rig._hipsSm.y; m.lgHz = rig._hipsSm.z; m.lgP = 0;
}
const lift = (rig) => { const pos = ent(rig); return pos ? pos.y - rig.mem.tvY : 0; };
const travel = (rig) => { const pos = ent(rig); return pos ? Math.hypot(pos.x - rig.mem.tvX, pos.z - rig.mem.tvZ) : 0; };

/**
 * Mano al agarre: mezcla entre posición libre (junto al cuerpo, adelantada) y el punto de agarre. Cadera y
 * tronco se pasan ya filtrados (lagged) para situar el hombro donde está de verdad.
 */
function hand(rig, c, side, hx, hy, hz, pitch, tx, ty, tz, grip) {
  shoulderPos(c, side, hx, hy, hz, -pitch * 0.4, -pitch * 0.35, -pitch * 0.25, _sh);
  const fx = _sh.x + side * 0.03, fy = _sh.y - 0.34, fz = _sh.z - 0.22;
  reachArm(rig, c, side, _sh.x, _sh.y, _sh.z,
    lerp(fx, tx, grip), lerp(fy, ty, grip), lerp(fz, tz, grip), -pitch);
}

export const vault = {
  aimWeight: 0, lowCarry: 1, handsFree: 1,
  enter(rig, p) { enter(rig, cfg(rig), p, 'vault'); },
  update(rig, dt, p) {
    const c = cfg(rig), V = c.vault;
    const pv = rig.config.player.vault;
    const dur = p.duration || pv.duration;
    const k = rig.phase(dur);                           // fase real
    const kp = clamp01((rig.t + c.lead) / dur);         // fase con adelanto (la pose)
    dynTrack(rig, rig.speed);
    const m = rig.mem;
    // Altura de la cobertura y avance: dados/estimados con la raíz real
    if (p.height !== undefined) m.tvH = p.height;
    else if (k > 0.25 && k < 0.75) m.tvH += (clamp(lift(rig) / Math.sin(Math.PI * k) - pv.clearance, 0.3, 1.4) - m.tvH) * 0.25;
    if (k > 0.3 && k < 0.8) m.tvD += (clamp(travel(rig) / smooth(k), 0.8, 4) - m.tvD) * 0.25;
    const H = m.tvH;
    const lf = (H + pv.clearance) * Math.sin(Math.PI * kp);     // elevación prevista de la raíz
    const trv = m.tvD * smooth(kp);
    const s = Math.sin(Math.PI * kp);

    rig.clip('Idle', 1, 0.05);
    cancelStance(rig, 1);

    // La cadera sigue el borde de la cobertura a una distancia fija (no por debajo de la de pie)
    const hy = Math.min(c.arm.hipsY, H - lf + V.hipsClear) - c.arm.hipsY, hz = -0.08 * s;
    rig.hips(0, hy, hz);
    const kh = clamp01((rig.t + c.handLead) / dur);              // las manos, con menos adelanto
    const lfH = (H + pv.clearance) * Math.sin(Math.PI * kh);
    const trvH = m.tvD * smooth(kh);
    // Tronco inclinado sobre la cobertura
    const pitch = V.pitch * Math.pow(s, 0.8);
    const rs = -pitch * 0.4, rs1 = -pitch * 0.35, rs2 = -pitch * 0.25;
    rig.rot('spine', rs, 0, 0.12 * s); rig.rot('spine1', rs1, 0, 0.1 * s); rig.rot('spine2', rs2, 0, 0.08 * s);
    rig.rot('neck', pitch * 0.3, 0, 0); rig.rot('head', pitch * 0.35, 0, 0);

    // Mano izquierda apoyada sobre la cobertura mientras el cuerpo pasa
    const grip = ease.smooth(remap01(kp, 0.04, 0.2)) * (1 - ease.smooth(remap01(kp, 0.55, 0.72)));
    const tz = clamp(-(V.handAhead - trvH), -0.8, 0.5);
    const w = rig.w;
    hand(rig, c, -1, 0, c.arm.hipsY + lagged(rig, 'lgHy', hy * w, dt, 0), lagged(rig, 'lgHz', hz * w, dt, 0),
      lagged(rig, 'lgP', pitch * w, dt, 0), -0.2, H - lfH, tz, grip);

    // Piernas recogidas hacia un costado para pasar sobre la cobertura y luego buscar el suelo
    const kl = clamp01((rig.t + V.legLead) / dur);       // las piernas se recogen antes de llegar a la cobertura
    const tuck = ease.smooth(remap01(kl, 0.0, 0.2)) * (1 - ease.smooth(remap01(kp, 0.62, 0.84)));
    const reach = ease.smooth(remap01(kp, 0.74, 0.94));
    rig.rot('lUpLeg', V.tuckThigh * tuck + 0.45 * reach, -0.5 * tuck, 0);
    rig.rot('rUpLeg', (V.tuckThigh - 0.1) * tuck + 0.2 * reach, -0.38 * tuck, 0);
    rig.rot('lLeg', V.tuckShin * tuck - 0.3 * reach, 0, 0);
    rig.rot('rLeg', V.tuckShin * tuck - 0.5 * reach, 0, 0);
    plantFull(rig, ease.smooth(remap01(kp, 0.8, 0.96)));
    // el arma, en la mano derecha y baja (lowCarry)
  },
};

export const climb = {
  aimWeight: 0, lowCarry: 1, handsFree: 1,
  enter(rig, p) { enter(rig, cfg(rig), p, 'climb'); },
  update(rig, dt, p) {
    const c = cfg(rig), C = c.climb;
    const pc = rig.config.player.climb;
    const dur = p.duration || pc.duration;
    const split = pc.upFraction;
    const k = rig.phase(dur);
    const kp = clamp01((rig.t + c.lead) / dur);
    const u = clamp01(kp / split);                      // fase de subida 0..1
    const f = remap01(kp, split, 1);                    // fase de avance sobre el borde 0..1
    dynTrack(rig, rig.speed);
    const m = rig.mem;
    const ur = clamp01(k / split);
    if (p.height !== undefined) m.tvH = p.height;
    else if (ur > 0.3 && ur < 0.97) m.tvH += (clamp(lift(rig) / smooth(ur), 1.2, 2.6) - m.tvH) * 0.2;
    if (k > split + 0.1 && k < 0.95) m.tvD += (clamp(travel(rig) / smooth(remap01(k, split, 1)), 0.4, 3) - m.tvD) * 0.25;
    const H = m.tvH;
    const lf = H * smooth(u);                           // elevación prevista de la raíz
    const trv = m.tvD * smooth(f);

    rig.clip('Idle', 1, 0.05);
    cancelStance(rig, 1);

    // Cadera local deseada: bajo los agarres (brazo extendido → flexionado) y encogida al subir
    const handY = H - lf;                               // altura local del borde
    const arm = curve(ARM_REACH, u);
    let hipsLoc = handY - arm - 0.42;
    hipsLoc = Math.max(hipsLoc, lerp(0.52, C.bentHips, ease.smooth(remap01(u, 0.7, 1))));
    hipsLoc = Math.min(hipsLoc, c.arm.hipsY + C.reachHips);
    const stand = ease.smooth(f);                       // en el avance, de encorvado a de pie
    hipsLoc = lerp(hipsLoc, c.arm.hipsY, stand);
    const hy = hipsLoc - c.arm.hipsY;
    const pitch = lerp(curve(CLIMB_PITCH, u), 0, stand);
    const hz = lerp(0.04, -0.1, ease.smooth(remap01(u, 0.5, 1))) * (1 - stand);
    rig.hips(0, hy, hz);
    const rs = -pitch * 0.4, rs1 = -pitch * 0.35, rs2 = -pitch * 0.25;
    rig.rot('spine', rs, 0, 0); rig.rot('spine1', rs1, 0, 0); rig.rot('spine2', rs2, 0, 0);
    const kh = clamp01((rig.t + c.handLead) / dur);              // las manos, con menos adelanto
    const uh = clamp01(kh / split), fh = remap01(kh, split, 1);
    const handYH = H - H * smooth(uh);
    const trvH = m.tvD * smooth(fh);
    rig.rot('neck', pitch * 0.3, 0, 0); rig.rot('head', pitch * 0.4, 0, 0);

    // Ambas manos al borde (fijas en el mundo); al avanzar, el borde queda atrás y se sueltan
    const grip = 1 - ease.smooth(remap01(f, 0.15, 0.55));
    const tz = clamp(-(C.handAhead - trvH), -0.8, 0.3);
    const w = rig.w;
    const hyE = c.arm.hipsY + lagged(rig, 'lgHy', hy * w, dt, 0), hzE = lagged(rig, 'lgHz', hz * w, dt, 0);
    const pE = lagged(rig, 'lgP', pitch * w, dt, 0);
    hand(rig, c, -1, 0, hyE, hzE, pE, -C.handSide, handYH, tz, grip);
    hand(rig, c, 1, 0, hyE, hzE, pE, C.handSide, handYH, tz, grip);

    // Piernas: rodillas arriba alternadas apoyando en el muro; encogidas al final de la subida
    const cyc = Math.sin(u * Math.PI * 2 * 1.5);
    const climbing = 1 - ease.smooth(remap01(u, 0.78, 0.95));
    const lk = Math.max(0, cyc) * climbing, rk = Math.max(0, -cyc) * climbing;
    const folded = ease.smooth(remap01(u, 0.78, 1)) * (1 - stand);
    const open = 1 - stand;
    rig.rot('lUpLeg', (0.35 + 0.95 * lk + 0.9 * folded) * open, 0, 0);
    rig.rot('rUpLeg', (0.35 + 0.95 * rk + 0.9 * folded) * open, 0, 0);
    rig.rot('lLeg', -(0.5 + 1.0 * lk + 1.3 * folded) * open, 0, 0);
    rig.rot('rLeg', -(0.5 + 1.0 * rk + 1.3 * folded) * open, 0, 0);
    plantFull(rig, ease.smooth(remap01(f, 0.35, 0.8)));

    // Arma colgada a la espalda, manos libres
    releaseIk(rig, 1);
    rig.holdAdd(0.05, 0.12, 0.32, 0, 0, 0);
  },
};
