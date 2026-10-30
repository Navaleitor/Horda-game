// Materiales PBR compartidos por todos los props. Se crean una sola vez (perezosamente) y
// todas las instancias los reutilizan: no clonar por instancia. Si un prop necesita un tinte
// propio (p. ej. estados de daño), que clone UNA vez por variante, no por instancia.
import * as THREE from 'three';

let mats = null;

function build() {
  return {
    // Armas
    gunMetal: new THREE.MeshStandardMaterial({ name: 'gunMetal', color: 0x2b2f33, metalness: 0.75, roughness: 0.4 }),
    gunPolymer: new THREE.MeshStandardMaterial({ name: 'gunPolymer', color: 0x3d4234, metalness: 0.05, roughness: 0.85 }),
    gunAccent: new THREE.MeshStandardMaterial({
      name: 'gunAccent', color: 0x401008, emissive: 0xff5a1f, emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.5,
    }),
    // Dianas
    targetFrame: new THREE.MeshStandardMaterial({ name: 'targetFrame', color: 0x4a4d50, metalness: 0.6, roughness: 0.55 }),
    targetPlate: new THREE.MeshStandardMaterial({ name: 'targetPlate', color: 0xc9a36b, metalness: 0.0, roughness: 0.9 }),
    targetHead: new THREE.MeshStandardMaterial({ name: 'targetHead', color: 0xd8b47c, metalness: 0.0, roughness: 0.9 }),
    targetMark: new THREE.MeshStandardMaterial({ name: 'targetMark', color: 0xb3201a, metalness: 0.0, roughness: 0.7 }),
  };
}

/** Devuelve el diccionario de materiales compartidos. */
export function getPropMaterials() {
  if (!mats) mats = build();
  return mats;
}

/** Libera los materiales compartidos (solo al cerrar el juego). */
export function disposePropMaterials() {
  if (!mats) return;
  for (const m of Object.values(mats)) m.dispose();
  mats = null;
}
