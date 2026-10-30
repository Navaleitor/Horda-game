// IK analítico de piernas y ciclo de paso para cobertura (cover-animator). Sin reservas por frame.
//
// El IK de pies del núcleo (rig.plantFeet) fija la rodilla hacia −Z de la raíz; con el cuerpo girado π
// (espalda a la pared) o de perfil las rodillas saldrían al revés. Aquí se resuelve cada pierna en
// espacio de personaje con el polo (rodilla) hacia donde mira la cadera, y se aplica con rig.rotAxis
// sobre la pose Idle (la geometría de Idle está en config.anim.cover.legs).

import * as THREE from 'three';
import { clamp, ease } from '../core/math.js';

const Y = new THREE.Vector3(0, 1, 0);
const _yq = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _qf = new THREE.Quaternion();
const _P = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _K = new THREE.Vector3();
const _T = new THREE.Vector3();
const _dt = new THREE.Vector3();
const _ds = new THREE.Vector3();
const _rt = new THREE.Vector3();
const _rs = new THREE.Vector3();

const restCache = new WeakMap();
function restDirs(L) {
  let c = restCache.get(L);
  if (c) return c;
  const t = new THREE.Vector3().fromArray(L.restThigh).normalize();
  const s = new THREE.Vector3().fromArray(L.restShin).normalize();
  c = { t: [t, new THREE.Vector3(-t.x, t.y, t.z)], s: [s, new THREE.Vector3(-s.x, s.y, s.z)] };
  restCache.set(L, c);
  return c;
}

/** Aplica un cuaternión como rotación aditiva en espacio de personaje (respeta rig.w). */
export function applyQuat(rig, bone, q) {
  let { x, y, z, w } = q;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.sqrt(x * x + y * y + z * z);
  if (s < 1e-6) return;
  rig.rotAxis(bone, x / s, y / s, z / s, 2 * Math.atan2(s, w));
}

const BONES = [['rUpLeg', 'rLeg', 'rFoot'], ['lUpLeg', 'lLeg', 'lFoot']];

/**
 * Una pierna. i: 0 derecha, 1 izquierda. hips: posición de la cadera (espacio de personaje, ya con offset),
 * yaw: giro de la cadera, pole: dirección horizontal unitaria hacia la que dobla la rodilla,
 * tgt: tobillo objetivo. Pie plano (orientación de Idle girada con la cadera).
 */
export function solveLeg(rig, L, i, hips, yaw, pole, tgt) {
  _yq.setFromAxisAngle(Y, yaw);
  _P.fromArray(L.hipJoint[i]).applyQuaternion(_yq).add(hips);
  _d.copy(tgt).sub(_P);
  const l1 = L.thigh, l2 = L.shin;
  const len = clamp(_d.length(), 0.12, (l1 + l2) * 0.999);
  _d.normalize();
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _n.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_n.lengthSq() < 1e-6) _n.set(0, 0, 1);
  _n.normalize();
  _K.copy(_P).addScaledVector(_d, a).addScaledVector(_n, h);
  _T.copy(_P).addScaledVector(_d, len);
  _dt.copy(_K).sub(_P).normalize();
  _ds.copy(_T).sub(_K).normalize();
  const rd = restDirs(L);
  _rt.copy(rd.t[i]).applyQuaternion(_yq);
  _qt.setFromUnitVectors(_rt, _dt);
  _rs.copy(rd.s[i]).applyQuaternion(_yq).applyQuaternion(_qt);
  _qs.setFromUnitVectors(_rs, _ds);
  _qf.copy(_qs).multiply(_qt).invert();
  applyQuat(rig, BONES[i][0], _qt);
  applyQuat(rig, BONES[i][1], _qs);
  applyQuat(rig, BONES[i][2], _qf);
}

/**
 * Ciclo de un pie. phase ∈ ℝ (fracción de ciclo). Apoyo (0..0.5): el pie va de +amp a −amp con velocidad
 * constante (el cuerpo avanza 2·amp en medio ciclo → cero patinaje si phase avanza a dist/(4·amp)).
 * Vuelo (0.5..1): −amp → +amp con elevación. Devuelve en out.off el desplazamiento y en out.lift la altura.
 * lead = τ·dφ/dt (s·fracción/s): compensa el filtro de primer orden con que el núcleo suaviza los huesos
 * (objetivo = ideal + τ·derivada), así el pie apoyado queda quieto en el mundo.
 */
export function footCycle(phase, amp, lift, out, lead = 0) {
  const p = phase - Math.floor(phase);
  if (p < 0.5) {
    out.off = amp * (1 - 4 * p) + lead * amp * -4;
    out.lift = 0;
  } else {
    const u = (p - 0.5) * 2;
    const ds = 6 * u * (1 - u);
    out.off = amp * (-1 + 2 * ease.smooth(u)) + lead * amp * 2 * ds * 2;
    out.lift = Math.max(0, lift * Math.sin(Math.PI * u) + lead * lift * Math.PI * Math.cos(Math.PI * u) * 2);
  }
  return out;
}
