// Diana de tiro de pie (silueta humanoide de ~1.8 m sobre poste y base con bisagra).
//
// CONVENCIÓN DE ESPACIO LOCAL
//   - Origen de `root` en el suelo, en el centro de la base. +Y arriba.
//   - La cara frontal de la silueta mira a +Z local (oriéntala hacia el tirador con root.rotation.y).
//   - Al abatirse cae hacia atrás (−Z), girando sobre la bisagra.
//
// NODOS
//   root   — Group raíz (base fija + pivote).
//   pivot  — Object3D 'hinge' en la bisagra (y = HINGE_Y); es lo que rota `setDown`.
//   head   — Mesh 'head' (solo la cabeza): distingue headshot.
//   body   — Mesh 'body' (torso, brazos y piernas).
//   marks  — Mesh 'marks' con las marcas de puntuación (decorativo, no cuenta para impactos).
//
// `setDown(t)`: t ∈ [0,1]; 0 = de pie, 1 = abatida (−90° sobre X). Sin allocaciones.
//
// TARGET_HITBOXES: cajas locales (espacio de root, diana de pie) con una holgura de profundidad
// para que los raycasts no sean injustos con una placa de 4 cm. Al abatirse, el dueño de la
// entidad debería desactivar o recalcular sus hitboxes.
//
// Draw calls por instancia: 5 (base, poste, cuerpo, cabeza, marcas). Geometrías compartidas.
import * as THREE from 'three';
import { box, cylY, cylZ, merge, shared, mesh } from './geometry.js';
import { getPropMaterials } from './materials.js';

/** Altura de la bisagra sobre el suelo (m). */
export const HINGE_Y = 0.09;
const PLATE_T = 0.04; // grosor de la placa
const HIT_DEPTH = 0.06; // semiprofundidad de los hitboxes (±z)

/** Cajas de impacto locales (diana de pie). `min`/`max` en metros, espacio de `root`. */
export const TARGET_HITBOXES = Object.freeze([
  Object.freeze({ part: 'head', min: Object.freeze([-0.13, 1.54, -HIT_DEPTH]), max: Object.freeze([0.13, 1.8, HIT_DEPTH]) }),
  Object.freeze({ part: 'body', min: Object.freeze([-0.35, 0.5, -HIT_DEPTH]), max: Object.freeze([0.35, 1.54, HIT_DEPTH]) }),
]);

// Las geometrías del pivote se definen en coordenadas de root y se desplazan −HINGE_Y para que
// queden relativas a la bisagra.
function relHinge(geo) {
  geo.translate(0, -HINGE_Y, 0);
  return geo;
}

function baseGeometry() {
  return merge([
    box(0.7, 0.05, 0.45, [0, 0.025, 0]), // placa base
    box(0.5, 0.06, 0.06, [0, 0.07, 0.17]), // larguero delantero
    box(0.06, 0.07, 0.08, [-0.1, HINGE_Y - 0.01, 0]), // soportes de la bisagra
    box(0.06, 0.07, 0.08, [0.1, HINGE_Y - 0.01, 0]),
  ]);
}

function postGeometry() {
  // Eje de la bisagra (a lo largo de X) + poste + brazo de sujeción de la placa.
  const axle = new THREE.CylinderGeometry(0.02, 0.02, 0.26, 8);
  axle.rotateZ(Math.PI / 2);
  axle.translate(0, HINGE_Y, 0);
  return relHinge(merge([
    axle,
    cylY(0.025, 0.55, [0, HINGE_Y + 0.275, -0.04], 8), // poste (detrás de la placa)
    box(0.36, 0.04, 0.03, [0, 0.62, -0.035]), // travesaño de sujeción (detrás de las caderas)
  ]));
}

function bodyGeometry() {
  const z = 0;
  return relHinge(merge([
    box(0.15, 0.42, PLATE_T, [-0.1, 0.71, z]), // pierna izquierda
    box(0.15, 0.42, PLATE_T, [0.1, 0.71, z]), // pierna derecha
    box(0.36, 0.14, PLATE_T, [0, 0.96, z]), // cadera
    box(0.46, 0.5, PLATE_T, [0, 1.27, z]), // torso
    box(0.1, 0.44, PLATE_T, [-0.28, 1.26, z], [0, 0, -0.08]), // brazo izquierdo
    box(0.1, 0.44, PLATE_T, [0.28, 1.26, z], [0, 0, 0.08]), // brazo derecho
    box(0.1, 0.02, PLATE_T, [0, 1.53, z]), // base del cuello (no invade el hitbox de cabeza)
  ]));
}

function headGeometry() {
  return relHinge(merge([
    box(0.08, 0.06, PLATE_T, [0, 1.57, 0]), // cuello
    cylZ(0.12, PLATE_T, [0, 1.68, 0], 16), // cabeza (disco)
  ]));
}

function marksGeometry() {
  // Anillos de puntuación ligeramente por delante de la placa (+Z) para evitar z-fighting.
  const zf = PLATE_T / 2 + 0.002;
  return relHinge(merge([
    cylZ(0.13, 0.004, [0, 1.25, zf], 20), // anillo exterior del pecho
    cylZ(0.05, 0.006, [0, 1.25, zf + 0.001], 14), // centro del pecho
    cylZ(0.04, 0.004, [0, 1.68, zf], 12), // centro de la cabeza
  ]));
}

/**
 * Crea una diana de tiro. Ver convención en la cabecera del archivo.
 * @returns {{ root: THREE.Group, pivot: THREE.Object3D, head: THREE.Mesh, body: THREE.Mesh,
 *             marks: THREE.Mesh, setDown: (t:number) => void }}
 */
export function createTarget() {
  const M = getPropMaterials();
  const root = new THREE.Group();
  root.name = 'target';

  const base = mesh(shared('target.base', baseGeometry), M.targetFrame, 'base');
  root.add(base);

  const pivot = new THREE.Object3D();
  pivot.name = 'hinge';
  pivot.position.set(0, HINGE_Y, 0);
  root.add(pivot);

  const post = mesh(shared('target.post', postGeometry), M.targetFrame, 'post');
  const body = mesh(shared('target.body', bodyGeometry), M.targetPlate, 'body');
  const head = mesh(shared('target.head', headGeometry), M.targetHead, 'head');
  const marks = mesh(shared('target.marks', marksGeometry), M.targetMark, 'marks');
  marks.castShadow = false;
  body.userData.part = 'body';
  head.userData.part = 'head';
  pivot.add(post, body, head, marks);

  function setDown(t) {
    const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
    pivot.rotation.x = -k * (Math.PI / 2); // la parte alta va hacia −Z (cae hacia atrás)
  }

  return { root, pivot, head, body, marks, setDown };
}
