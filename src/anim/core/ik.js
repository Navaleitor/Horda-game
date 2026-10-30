// IK analítico de dos huesos (brazo-antebrazo-mano, muslo-pierna-pie). Dueño: animation-engineer.
//
// Trabaja en espacio de MUNDO con los `matrixWorld` ya actualizados de la cadena (el rig llama a
// updateMatrixWorld antes de resolver). Escribe solo `quaternion` locales de A, B y (opcional) C;
// no actualiza matrices (lo hace el render o quien lo necesite después).
//
//   A ── B ── C        A = hombro/cadera (raíz de la cadena), B = codo/rodilla, C = muñeca/tobillo
//
// Método: (1) se calcula la posición del codo E en el plano (A, objetivo, polo) por ley de cosenos;
// (2) se gira A para que AB apunte a AE; (3) se gira B para que BC apunte al objetivo; (4) si hay
// orientación deseada para C se fija su rotación de mundo. El peso mezcla (slerp) con la pose previa.
// Sin reservas de memoria: todos los temporales son de módulo.

import * as THREE from 'three';

const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pc = new THREE.Vector3();
const _pt = new THREE.Vector3();
const _pe = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _qPar = new THREE.Quaternion();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _qD = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();
const _qL = new THREE.Quaternion();

/** Rotación de mundo de un objeto a partir de su matrixWorld (sin recorrer padres). */
export function worldQuat(obj, out) {
  obj.matrixWorld.decompose(_s, out, _u);
  return out;
}
/** Posición de mundo a partir de matrixWorld (sin recorrer padres). */
export function worldPos(obj, out) {
  return out.setFromMatrixPosition(obj.matrixWorld);
}

function blendLocal(bone, targetLocal, weight) {
  if (weight >= 0.999) bone.quaternion.copy(targetLocal);
  else bone.quaternion.slerp(targetLocal, weight);
}

/**
 * Resuelve la cadena A-B-C para que C llegue a `target` (Vector3 mundo).
 * @param {THREE.Object3D} a, b, c   huesos (b hijo de a, c hijo de b)
 * @param {THREE.Vector3} target     posición de mundo deseada para C
 * @param {THREE.Vector3} pole       punto de mundo hacia el que se dobla B (codo/rodilla)
 * @param {number} weight            0..1
 * @param {THREE.Quaternion|null} cWorldQuat  orientación de mundo deseada para C (o null)
 * @param {number} cWeight           peso de la orientación de C (0..1)
 * @returns {number} distancia final no alcanzada (0 si llega)
 */
export function solveTwoBone(a, b, c, target, pole, weight = 1, cWorldQuat = null, cWeight = 1) {
  if (weight <= 0) return 0;
  worldPos(a, _pa); worldPos(b, _pb); worldPos(c, _pc);
  const lab = _pa.distanceTo(_pb);
  const lbc = _pb.distanceTo(_pc);
  if (lab < 1e-6 || lbc < 1e-6) return 0;

  _dir.subVectors(target, _pa);
  let dist = _dir.length();
  const want = dist;
  const minD = Math.abs(lab - lbc) + 1e-4;
  const maxD = (lab + lbc) * 0.9995;
  if (dist < 1e-6) _dir.set(0, -1, 0); else _dir.multiplyScalar(1 / dist);
  dist = dist < minD ? minD : dist > maxD ? maxD : dist;
  _pt.copy(_pa).addScaledVector(_dir, dist);

  // Normal del plano de flexión: componente de (polo − A) perpendicular a la dirección A→objetivo.
  _n.subVectors(pole, _pa);
  _n.addScaledVector(_dir, -_n.dot(_dir));
  if (_n.lengthSq() < 1e-10) {
    _n.subVectors(_pb, _pa);
    _n.addScaledVector(_dir, -_n.dot(_dir));
    if (_n.lengthSq() < 1e-10) _n.set(0, 0, 1).addScaledVector(_dir, -_dir.z);
  }
  _n.normalize();

  let cosA = (lab * lab + dist * dist - lbc * lbc) / (2 * lab * dist);
  cosA = cosA < -1 ? -1 : cosA > 1 ? 1 : cosA;
  const sinA = Math.sqrt(1 - cosA * cosA);
  _pe.copy(_pa).addScaledVector(_dir, lab * cosA).addScaledVector(_n, lab * sinA);

  // (2) A: AB → AE
  worldQuat(a.parent, _qPar);
  worldQuat(a, _qA);
  _u.subVectors(_pb, _pa).normalize();
  _v.subVectors(_pe, _pa).normalize();
  _qD.setFromUnitVectors(_u, _v);
  _pc.sub(_pa).applyQuaternion(_qD).add(_pa);      // C tras girar A
  _qA.premultiply(_qD);                            // mundo A'
  _qL.copy(_qPar).invert().multiply(_qA);          // local A'
  blendLocal(a, _qL, weight);

  // (3) B: EC' → E·objetivo
  worldQuat(b, _qB);
  _qB.premultiply(_qD);                            // mundo B tras girar A
  _u.subVectors(_pc, _pe).normalize();
  _v.subVectors(_pt, _pe).normalize();
  _qD.setFromUnitVectors(_u, _v);
  _qB.premultiply(_qD);                            // mundo B''
  _qL.copy(_qA).invert().multiply(_qB);            // local B''
  blendLocal(b, _qL, weight);

  // (4) C: orientación de mundo deseada
  if (cWorldQuat && cWeight > 0) {
    _qInv.copy(_qB).invert();
    _qL.copy(_qInv).multiply(cWorldQuat);
    blendLocal(c, _qL, weight * cWeight);
  }
  return want > maxD ? want - maxD : 0;
}

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
/**
 * Cuaternión de la base ortonormal (x = primary, y = secondary ortogonalizado, z = x × y).
 * Se usa para construir la orientación de la mano a partir de "dirección de dedos" y "normal de palma".
 */
export function basisQuat(primary, secondary, out) {
  _x.copy(primary).normalize();
  _y.copy(secondary).addScaledVector(_x, -secondary.dot(_x));
  if (_y.lengthSq() < 1e-10) _y.set(0, 1, 0).addScaledVector(_x, -_x.y);
  _y.normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
