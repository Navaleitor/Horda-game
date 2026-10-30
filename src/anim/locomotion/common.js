// Utilidades compartidas de locomoción. Dueño: locomotion-animator.
// Sin reservas por frame: todo temporal es de módulo y el estado por personaje vive en rig.mem.dyn.
//
//  - loco():     blend Walk↔Run con la cadencia deducida de la velocidad real de contacto (sin patinar).
//  - dynamics(): arranque/frenada (inclinación) y giro (alabeo, pasos en el sitio) a partir de v y yaw.
//  - reachArm(): lleva una mano a un punto en espacio de personaje con rotaciones aditivas (2 huesos).
//  - torsoShoulder(): posición del hombro dada la cadera y el pitch de la columna (para reachArm).
//
// ATENCIÓN (trampa del rig): un clip con rate 0 se queda congelado y three.js deja de reescribir los
// huesos, de modo que los aditivos se ACUMULAN cada frame y la pose explota. Usa siempre rate > 0
// (p. ej. rig.clip('Idle', 1, 0.05)) cuando quieras una pose casi fija.

import * as THREE from 'three';
import { clamp, remap01, wrapAngle, lerp } from '../core/math.js';

export const cfg = (rig) => rig.cfg.locomotion;

// ── Blend Walk↔Run sin patinar ────────────────────────────────────────────────
/**
 * Mezcla Walk/Run con peso `a` (0 = Walk, 1 = Run) y reproduce el ciclo a la cadencia f (ciclos/s)
 * para que el pie apoyado avance exactamente a `v`. rig.locomotion() deduce la cadencia de la
 * velocidad que se le da y de su zancada media (que subestima el contacto del Run), así que se llama
 * dos veces (Walk puro y Run puro) con velocidades ficticias cuya media ponderada da f.
 */
export function loco(rig, c, v, dir, a, w) {
  const walk = rig.actionByName.Walk, run = rig.actionByName.Run;
  if (!walk || !run || !walk.info || !run.info) { rig.locomotion(v, dir, w); return; }
  const kW = c.contactSpeed.walk * walk.clip.duration;
  const kR = c.contactSpeed.run * run.clip.duration;
  if (a < 0.002) a = 0.002; else if (a > 0.998) a = 0.998;
  const sW = walk.info.stride, sR = run.info.stride, vW = walk.info.speed, vR = run.info.speed;
  const m = (sR - sW) / (vR - vW);
  let f = v / ((1 - a) * kW + a * kR), sA = 0, sB = 0;
  // La llamada "Run" arrastra algo de Walk cuando sB < vR; se itera con los pesos reales de cada clip.
  for (let it = 0; it < 4; it++) {
    sA = Math.min(f * sW, vW * 0.97);
    sB = (f * ((1 - a) * sW + a * sR) - (1 - a) * sA) / a;          // Run puro (sB ≥ vR)
    if (sB < vR) {
      const den = a * (1 - f * m);
      const sB2 = Math.abs(den) > 1e-6 ? (f * sW - (1 - a) * sA - f * a * m * vW) / den : -1;
      sB = sB2 >= vW && sB2 <= vR ? sB2 : (f * sW - (1 - a) * sA) / a;
    }
    const tB = sB >= vR ? 1 : sB <= vW ? 0 : (sB - vW) / (vR - vW);
    const wr = a * (1 - 0.5 * (1 - tB));
    f = v / ((1 - wr) * kW + wr * kR);
  }
  rig.locomotion(sA, dir, w * (1 - a));
  rig.locomotion(sB, dir, w * a);
}

// ── Dinámica (arranque, frenada, giro) ───────────────────────────────────────
/** Estado por personaje: velocidad y yaw filtrados. La diferencia con el valor actual ∝ aceleración / giro. */
export function dynOf(rig, v) {
  let d = rig.mem.dyn;
  if (!d) {
    d = rig.mem.dyn = { v, yaw: yawOf(rig), yr: 0, acc: 0, minVy: 0 };
  }
  return d;
}
const yawOf = (rig) => (rig.entity && rig.entity.yaw !== undefined ? rig.entity.yaw : 0);

/** Reinicia el filtro (estados aéreos o de acción que no usan la dinámica). */
export function dynTrack(rig, v) {
  const d = dynOf(rig, v);
  d.v = v; d.yaw = yawOf(rig); d.yr = 0; d.acc = 0;
  return d;
}

export function dynamics(rig, dt, v, c) {
  const d = dynOf(rig, v);
  const yaw = yawOf(rig);
  const diff = wrapAngle(yaw - d.yaw);
  d.yaw += diff * (1 - Math.exp(-c.bank.rate * dt));
  d.yr += (diff * c.bank.rate - d.yr) * (1 - Math.exp(-c.bank.smooth * dt));
  d.acc = v - d.v;
  d.v += (v - d.v) * (1 - Math.exp(-c.lean.rate * dt));
  d.minVy = 0;
  return d;
}

/** Inclinación del tronco: arranque hacia delante, frenada hacia atrás, carrera y alabeo en curvas. */
export function applyLean(rig, d, c, v) {
  const L = c.lean, B = c.bank;
  let x = clamp(-d.acc * L.gain, -L.maxFwd, L.maxBack);
  x -= c.leanRun * remap01(v, 2.5, 4.14);
  const z = clamp(d.yr * v * B.gain, -B.max, B.max) * remap01(v, B.minSpeed, B.minSpeed + 1);
  if (x === 0 && z === 0) return;
  rig.rot('spine', x * 0.4, 0, z * 0.4);
  rig.rot('spine1', x * 0.35, 0, z * 0.35);
  rig.rot('spine2', x * 0.25, 0, z * 0.25);
  rig.rot('neck', -x * L.headComp * 0.5, 0, -z * 0.4);
  rig.rot('head', -x * L.headComp * 0.5, 0, -z * 0.4);
}

/**
 * Acorta el crossfade de entrada de este estado (el rig usa config.anim.crossfade = 0.2 s por defecto, demasiado
 * para una maroma de 0.45 s). Se llama desde enter(): el fade ya está fijado y bodyBlend vale 0.
 */
export function quickFade(rig, sec) {
  if (rig.bodyBlend < 1 && rig.bodyFade > sec) rig.bodyFade = sec;
}

/**
 * Réplica del filtro de primer orden con que el rig suaviza aditivos y cadera (core.poseSmoothing): devuelve
 * el valor que tendrá `name` este frame si su objetivo es `target`. Sirve para calcular dónde están
 * REALMENTE hombros y cadera al llevar las manos a un punto. Estado en rig.mem (`init` si aún no existe).
 */
export function lagged(rig, name, target, dt, init) {
  const m = rig.mem;
  let v = m[name];
  if (v === undefined) v = init;
  v += (target - v) * (1 - Math.exp(-rig.core.poseSmoothing * dt));
  m[name] = v;
  return v;
}

/**
 * Anula el giro de columna de la "postura de tiro" (hombro izq. adelante) que aplica el torso con arma
 * (config.anim.core.hold[arma].stance; mismos coeficientes que src/anim/weapons). En acciones de cuerpo
 * entero (vault, trepar, maroma) el tronco debe quedar simétrico. amount 0..1.
 */
export function cancelStance(rig, amount) {
  const id = rig.weapon ? rig.weapon.id : null;
  if (!id || amount <= 0) return;
  const tbl = rig.core.hold[id] || rig.core.hold.assaultRifle;
  const s = (tbl.stance && tbl.stance[rig.upperBase === 'aim' ? 'aim' : 'ready']) || 0;
  if (!s) return;
  const k = amount;
  rig.rot('spine', 0, -s * 0.3 * k, 0);
  rig.rot('spine1', 0, -s * 0.35 * k, 0);
  rig.rot('spine2', 0, -s * 0.35 * k, 0);
  rig.rot('neck', 0, s * 0.5 * k, 0);
  rig.rot('head', 0, s * 0.5 * k, 0);
  const pr = (tbl.protract && tbl.protract[rig.upperBase === 'aim' ? 'aim' : 'ready']) || 0;
  if (pr) rig.rot('lShoulder', 0, pr * k, 0);
}

/**
 * rig.plantFeet con peso independiente del crossfade del estado (plantFeet suma rig.w, así que durante la
 * entrada el IK de pies tardaba en engancharse y los pies se hundían mientras la cadera ya bajaba).
 */
export function plantFull(rig, amount) {
  rig.plantFeet(amount / (rig.w > 0.02 ? rig.w : 0.02));
}

/** Pulso 0→1 en [0, peak] y 1→0 en [peak, end] (lineal, sin reservas). */
export function pulse(t, peak, end) {
  if (t <= 0 || t >= end) return 0;
  return t < peak ? t / peak : (end - t) / (end - peak);
}

/** Suelta las manos del arma de forma gradual (0 = agarrada, 1 = suelta). El IK se promedia con el del torso. */
export function releaseIk(rig, amount) {
  const k = 1 - amount;
  for (let i = 0; i < 24; i++) rig.ik(k, k);
}

// ── Brazo hacia un punto ─────────────────────────────────────────────────────
const _u0 = new THREE.Vector3();
const _f0 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Vector3();
const _u1 = new THREE.Vector3();
const _f1 = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Rota (x = pitch) el vector v alrededor del eje X: x > 0 inclina hacia atrás. */
function rotX(v, a) {
  const cs = Math.cos(a), sn = Math.sin(a);
  const y = v.y * cs - v.z * sn, z = v.y * sn + v.z * cs;
  v.y = y; v.z = z;
  return v;
}

/** Gira `bone` para llevar la dirección `from` a `to` (aditivo en espacio de personaje). Deja la rotación en _q. */
function aimBone(rig, bone, from, to) {
  _q.setFromUnitVectors(from, to);
  const s = Math.sqrt(1 - _q.w * _q.w);
  if (s > 1e-5) rig.rotAxis(bone, _q.x / s, _q.y / s, _q.z / s, 2 * Math.atan2(s, _q.w));
}

/**
 * Lleva la mano del lado `side` (−1 izq., +1 der.) al punto (tx,ty,tz) de espacio de personaje.
 * (sx,sy,sz) = hombro (articulación del brazo) ya con la cadera y la columna aplicadas; `pitch` = giro
 * x acumulado de la columna (para girar las direcciones de reposo del brazo).
 */
export function reachArm(rig, c, side, sx, sy, sz, tx, ty, tz, pitch) {
  const A = c.arm;
  const l = side < 0;
  _u0.fromArray(l ? A.restU.l : A.restU.r);
  _f0.fromArray(l ? A.restF.l : A.restF.r);
  rotX(_u0, pitch); rotX(_f0, pitch);
  _s.set(sx, sy, sz);
  _d.set(tx - sx, ty - sy, tz - sz);
  let dist = _d.length();
  const Lu = A.upper, Lf = A.fore;
  const minD = Math.abs(Lu - Lf) + 1e-3, maxD = (Lu + Lf) * 0.998;
  if (dist < 1e-5) { _d.set(0, -1, 0); dist = minD; } else _d.multiplyScalar(1 / dist);
  dist = clamp(dist, minD, maxD);
  _t.copy(_s).addScaledVector(_d, dist);
  // Codo en el plano (hombro, objetivo, polo); el polo x apunta hacia fuera del cuerpo
  _p.set(A.pole[0] * side, A.pole[1], A.pole[2]);
  _p.addScaledVector(_d, -_p.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1).addScaledVector(_d, -_d.z);
  _p.normalize();
  const a = (Lu * Lu + dist * dist - Lf * Lf) / (2 * dist);
  const h = Math.sqrt(Math.max(0, Lu * Lu - a * a));
  _e.copy(_s).addScaledVector(_d, a).addScaledVector(_p, h);
  _u1.subVectors(_e, _s).normalize();
  _f1.subVectors(_t, _e).normalize();
  aimBone(rig, l ? 'lArm' : 'rArm', _u0, _u1);
  _f0.applyQuaternion(_q);                       // el antebrazo hereda la rotación del brazo
  aimBone(rig, l ? 'lForeArm' : 'rForeArm', _f0, _f1);
}

/**
 * Hombro (articulación del brazo) en espacio de personaje: cadera (hx,hy,hz) y giros x de spine/spine1/spine2
 * (x < 0 = inclinado hacia delante). Devuelve en el Vector3 `out`.
 */
export function shoulderPos(c, side, hx, hy, hz, rs, rs1, rs2, out) {
  const A = c.arm;
  const seg = A.spineSeg;
  const sx = side * A.shoulderX;
  // Cada articulación gira lo que tiene por encima: posición = suma de segmentos girados acumulados.
  let y = hy + seg[0] * 1, z = hz;                      // cadera → spine (sin girar)
  const a1 = rs;
  y += seg[1] * Math.cos(a1); z += seg[1] * Math.sin(a1);
  const a2 = rs + rs1;
  y += seg[2] * Math.cos(a2); z += seg[2] * Math.sin(a2);
  const a3 = rs + rs1 + rs2;
  y += seg[3] * Math.cos(a3); z += seg[3] * Math.sin(a3);
  return out.set(hx + sx, y, z);
}

export { lerp };

