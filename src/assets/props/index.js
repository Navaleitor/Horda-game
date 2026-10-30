// Props procedurales (armas, dianas…). Fábricas puras: no son sistemas, no usan eventos.
// Ver la cabecera de cada archivo para convenciones de ejes y nodos de anclaje.
export { createAssaultRifle, createPistol, createWeapon, WEAPON_FACTORIES } from './weapons.js';
export { createTarget, TARGET_HITBOXES, HINGE_Y } from './targets.js';
export { getPropMaterials, disposePropMaterials } from './materials.js';
export { disposeSharedGeometries } from './geometry.js';
