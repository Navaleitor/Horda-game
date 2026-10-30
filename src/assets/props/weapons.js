// Armas procedurales (Fase 1a): rifle de asalto y pistola.
//
// CONVENCIÓN DE ESPACIO LOCAL (para todas las armas)
//   - El arma apunta hacia −Z local; +Y arriba; +X a la derecha del tirador.
//   - El origen de `root` es el centro de la empuñadura de la mano derecha (= nodo `grip`).
//   - Escala real en metros.
//
// NODOS DE ANCLAJE (Object3D vacíos, hijos directos de `root`, sin rotación)
//   muzzle   — boca del cañón: origen de trazadoras/fogonazo; su −Z local es la dirección de tiro.
//   grip     — empuñadura de la mano derecha (origen).
//   support  — apoyo de la mano izquierda (guardamanos/empuñadura delantera). En la pistola está
//              junto al grip (agarre a dos manos envolviendo la empuñadura).
//   magazine — Mesh separable (hijo de `root`) con su origen en la boca del pozo del cargador, de
//              modo que trasladarlo en su −Y local lo saca del arma. Su pose de reposo está en
//              `magazine.userData.homePosition` / `homeQuaternion` para restaurarla tras la recarga.
//              El weapon-animator puede re-parentarlo a la mano izquierda durante la recarga.
//
// Draw calls por instancia: rifle 4 (metal, polímero, acento emisivo, cargador),
// pistola 4 (metal, polímero, acento, cargador). Geometrías y materiales compartidos.
import * as THREE from 'three';
import { box, cylZ, merge, shared, mesh, anchor } from './geometry.js';
import { getPropMaterials } from './materials.js';

// ---------------------------------------------------------------------------
// Rifle de asalto (~0.91 m: culata en z=+0.30, boca en z=−0.61)
// ---------------------------------------------------------------------------
const RIFLE = {
  muzzle: [0, 0.1, -0.61],
  support: [0, 0.015, -0.37], // centro de la empuñadura vertical delantera
  magSeat: [0, 0.055, -0.13], // boca del pozo del cargador (parte baja del cajón)
  magTilt: 0.18, // inclinación del cargador hacia delante (rad)
};

function rifleMetalGeometry() {
  return merge([
    box(0.062, 0.09, 0.32, [0, 0.095, -0.06]), // cajón de mecanismos
    box(0.07, 0.012, 0.022, [0.036, 0.12, -0.02]), // maneta de carga (sobresale a la derecha)
    box(0.026, 0.012, 0.22, [0, 0.146, -0.1]), // riel superior
    cylZ(0.022, 0.1, [0, 0.178, -0.06], 12), // cuerpo del visor
    box(0.02, 0.026, 0.02, [0, 0.16, -0.02]), // montura trasera del visor
    box(0.02, 0.026, 0.02, [0, 0.16, -0.1]), // montura delantera del visor
    cylZ(0.013, 0.12, [0, 0.1, -0.52], 10), // cañón
    cylZ(0.021, 0.05, [0, 0.1, -0.585], 8), // freno de boca
    box(0.012, 0.035, 0.03, [0, 0.135, -0.43]), // punto de mira delantero
    box(0.008, 0.012, 0.075, [0, 0.032, -0.015]), // guardamonte (parte baja)
    box(0.006, 0.03, 0.006, [0, 0.04, 0.005], [0.35, 0, 0]), // gatillo
    box(0.03, 0.04, 0.03, [0, 0.13, 0.11]), // adaptador de culata
  ]);
}

function riflePolymerGeometry() {
  return merge([
    box(0.036, 0.11, 0.048, [0, -0.005, 0.012], [-0.28, 0, 0]), // pistolete (inclinado hacia atrás)
    box(0.07, 0.075, 0.24, [0, 0.092, -0.34]), // guardamanos
    box(0.034, 0.075, 0.034, [0, 0.022, -0.37]), // empuñadura vertical delantera
    box(0.05, 0.075, 0.18, [0, 0.085, 0.19]), // culata (cuerpo)
    box(0.04, 0.05, 0.12, [0, 0.03, 0.22], [0.35, 0, 0]), // culata (refuerzo inferior)
    box(0.056, 0.135, 0.028, [0, 0.07, 0.288]), // cantonera
  ]);
}

function rifleAccentGeometry() {
  return merge([
    cylZ(0.016, 0.004, [0, 0.178, -0.006], 12), // lente trasera del visor
    box(0.004, 0.012, 0.16, [0.0335, 0.085, -0.34]), // franja lateral derecha del guardamanos
    box(0.004, 0.012, 0.16, [-0.0335, 0.085, -0.34]), // franja lateral izquierda
    box(0.052, 0.006, 0.006, [0, 0.12, 0.288]), // marca en la cantonera
  ]);
}

function rifleMagazineGeometry() {
  // Origen en la parte superior (asiento); se extiende hacia −Y. La curvatura se simula con dos
  // tramos ligeramente rotados.
  return merge([
    box(0.032, 0.09, 0.07, [0, -0.045, 0]),
    box(0.032, 0.08, 0.066, [0, -0.125, -0.012], [0.22, 0, 0]),
    box(0.04, 0.014, 0.078, [0, -0.168, -0.022], [0.22, 0, 0]), // base del cargador
  ]);
}

/**
 * Rifle de asalto. Ver convención y nodos en la cabecera del archivo.
 * @returns {{ root: THREE.Group, muzzle: THREE.Object3D, grip: THREE.Object3D,
 *             support: THREE.Object3D, magazine: THREE.Mesh }}
 */
export function createAssaultRifle() {
  const M = getPropMaterials();
  const root = new THREE.Group();
  root.name = 'assaultRifle';

  root.add(
    mesh(shared('rifle.metal', rifleMetalGeometry), M.gunMetal, 'rifleMetal'),
    mesh(shared('rifle.polymer', riflePolymerGeometry), M.gunPolymer, 'riflePolymer'),
    mesh(shared('rifle.accent', rifleAccentGeometry), M.gunAccent, 'rifleAccent'),
  );

  const magazine = mesh(shared('rifle.magazine', rifleMagazineGeometry), M.gunMetal, 'magazine');
  magazine.position.fromArray(RIFLE.magSeat);
  magazine.rotation.x = RIFLE.magTilt; // la base del cargador se adelanta hacia −Z
  storeHome(magazine);
  root.add(magazine);

  const muzzle = anchor('muzzle', RIFLE.muzzle);
  const grip = anchor('grip', [0, 0, 0]);
  const support = anchor('support', RIFLE.support);
  root.add(muzzle, grip, support);

  root.userData.weaponId = 'assaultRifle';
  return { root, muzzle, grip, support, magazine };
}

// ---------------------------------------------------------------------------
// Pistola (~0.22 m: trasera de la corredera en z=+0.045, boca en z=−0.175)
// ---------------------------------------------------------------------------
const PISTOL = {
  muzzle: [0, 0.072, -0.175],
  support: [-0.012, -0.012, 0.018], // mano izquierda envolviendo la empuñadura por debajo/izquierda
  magSeat: [0, 0.042, 0.004], // boca del pozo del cargador (dentro de la empuñadura)
  gripRake: -0.26, // la empuñadura se inclina hacia atrás (+Z)
};

function pistolMetalGeometry() {
  return merge([
    box(0.03, 0.034, 0.215, [0, 0.07, -0.0625]), // corredera
    cylZ(0.009, 0.012, [0, 0.072, -0.169], 10), // boca del cañón
    box(0.008, 0.01, 0.012, [0, 0.091, -0.155]), // mira delantera
    box(0.022, 0.01, 0.012, [0, 0.091, 0.03]), // mira trasera
    box(0.006, 0.026, 0.006, [0, 0.034, -0.03], [0.3, 0, 0]), // gatillo
  ]);
}

function pistolPolymerGeometry() {
  return merge([
    box(0.028, 0.022, 0.17, [0, 0.043, -0.06]), // armazón
    box(0.03, 0.105, 0.042, [0, -0.005, 0.012], [PISTOL.gripRake, 0, 0]), // empuñadura
    box(0.024, 0.006, 0.055, [0, 0.022, -0.04]), // guardamonte (parte baja)
    box(0.024, 0.022, 0.006, [0, 0.032, -0.066]), // guardamonte (frontal)
  ]);
}

function pistolAccentGeometry() {
  return merge([
    box(0.004, 0.004, 0.004, [0, 0.097, -0.155]), // punto de la mira delantera
    box(0.004, 0.004, 0.004, [-0.007, 0.097, 0.03]), // puntos de la mira trasera
    box(0.004, 0.004, 0.004, [0.007, 0.097, 0.03]),
    box(0.0035, 0.008, 0.11, [0.0155, 0.07, -0.07]), // franja lateral derecha de la corredera
    box(0.0035, 0.008, 0.11, [-0.0155, 0.07, -0.07]), // franja lateral izquierda
  ]);
}

function pistolMagazineGeometry() {
  // Origen arriba; dentro de la empuñadura con la base sobresaliendo por abajo.
  return merge([
    box(0.022, 0.1, 0.032, [0, -0.05, 0]),
    box(0.032, 0.012, 0.044, [0, -0.104, 0.002]), // base del cargador
  ]);
}

/**
 * Pistola. Ver convención y nodos en la cabecera del archivo.
 * @returns {{ root: THREE.Group, muzzle: THREE.Object3D, grip: THREE.Object3D,
 *             support: THREE.Object3D, magazine: THREE.Mesh }}
 */
export function createPistol() {
  const M = getPropMaterials();
  const root = new THREE.Group();
  root.name = 'pistol';

  root.add(
    mesh(shared('pistol.metal', pistolMetalGeometry), M.gunMetal, 'pistolMetal'),
    mesh(shared('pistol.polymer', pistolPolymerGeometry), M.gunPolymer, 'pistolPolymer'),
    mesh(shared('pistol.accent', pistolAccentGeometry), M.gunAccent, 'pistolAccent'),
  );

  const magazine = mesh(shared('pistol.magazine', pistolMagazineGeometry), M.gunMetal, 'magazine');
  magazine.position.fromArray(PISTOL.magSeat);
  magazine.rotation.x = PISTOL.gripRake; // alineado con la empuñadura
  storeHome(magazine);
  root.add(magazine);

  const muzzle = anchor('muzzle', PISTOL.muzzle);
  const grip = anchor('grip', [0, 0, 0]);
  const support = anchor('support', PISTOL.support);
  root.add(muzzle, grip, support);

  root.userData.weaponId = 'pistol';
  return { root, muzzle, grip, support, magazine };
}

/** Fábricas por id de arma (coincide con `inventory.slots` / `config.weapons`). */
export const WEAPON_FACTORIES = Object.freeze({
  assaultRifle: createAssaultRifle,
  pistol: createPistol,
});

/** Crea el arma `weaponId` o devuelve null si no hay fábrica. */
export function createWeapon(weaponId) {
  const f = WEAPON_FACTORIES[weaponId];
  return f ? f() : null;
}

function storeHome(obj) {
  obj.userData.homePosition = obj.position.clone();
  obj.userData.homeQuaternion = obj.quaternion.clone();
}
