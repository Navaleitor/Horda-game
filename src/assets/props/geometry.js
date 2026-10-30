// Utilidades de geometría procedural para props.
//
// - `part(geo, pos, rot, scale)` hornea una transformación en una geometría (la modifica y la devuelve).
// - `merge(parts)` fusiona varias piezas en una sola BufferGeometry (una draw call por material).
// - `shared(key, build)` cachea geometrías a nivel de módulo: todas las instancias de un prop
//   reutilizan la misma BufferGeometry (no se duplica por instancia). No llames a `dispose()`
//   sobre geometrías obtenidas de aquí desde una instancia concreta.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Aplica posición/rotación (Euler XYZ, rad)/escala a la geometría y la devuelve.
 * @param {THREE.BufferGeometry} geo
 * @param {number[]} [pos=[0,0,0]]
 * @param {number[]} [rot=[0,0,0]]
 * @param {number[]} [scale=[1,1,1]]
 */
export function part(geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _p.set(pos[0], pos[1], pos[2]);
  _s.set(scale[0], scale[1], scale[2]);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

/** Caja de tamaño (w, h, d) centrada en `pos`. */
export function box(w, h, d, pos, rot) {
  return part(new THREE.BoxGeometry(w, h, d), pos, rot);
}

/** Cilindro a lo largo de Z (eje del cañón) de radio r y longitud len, centrado en `pos`. */
export function cylZ(r, len, pos, segments = 10, rTop = r) {
  const g = new THREE.CylinderGeometry(rTop, r, len, segments);
  g.rotateX(-Math.PI / 2); // eje Y → −Z (la tapa "top" queda hacia −Z)
  return part(g, pos);
}

/** Cilindro vertical (eje Y) centrado en `pos`. */
export function cylY(r, len, pos, segments = 10, rTop = r) {
  return part(new THREE.CylinderGeometry(rTop, r, len, segments), pos);
}

/** Fusiona piezas en una sola geometría sin grupos y libera las piezas intermedias. */
export function merge(parts) {
  const nonIndexed = parts.some((g) => !g.index);
  const list = nonIndexed ? parts.map((g) => (g.index ? g.toNonIndexed() : g)) : parts;
  const out = mergeGeometries(list, false);
  if (!out) throw new Error('props/geometry: mergeGeometries falló (atributos incompatibles)');
  for (const g of parts) g.dispose();
  if (nonIndexed) for (const g of list) g.dispose();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

const cache = new Map();

/** Devuelve la geometría compartida `key`, construyéndola la primera vez con `build()`. */
export function shared(key, build) {
  let g = cache.get(key);
  if (!g) {
    g = build();
    g.name = key;
    cache.set(key, g);
  }
  return g;
}

/** Libera todas las geometrías compartidas (solo al cerrar el juego). */
export function disposeSharedGeometries() {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}

/** Crea un Mesh con sombras activadas. */
export function mesh(geometry, material, name) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Crea un nodo de anclaje vacío. */
export function anchor(name, pos) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(pos[0], pos[1], pos[2]);
  return o;
}
