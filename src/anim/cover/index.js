// Punto de registro de los proveedores de pose de cobertura (cover-animator). Lo importa src/anim/core/registry.js.
// Estados: coverLow, coverHigh, peek, swat, coverSlide (cuerpo) y blindfire (torso). Ver poses.js.

import { registerAll } from './poses.js';

export default function register(anim) {
  registerAll(anim);
}
