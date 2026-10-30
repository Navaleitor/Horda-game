// Proveedores de locomoción (locomotion-animator). Los importa src/anim/core/registry.js.
//
// Estados: idle walk jog run crouch · jump fall land · vault climb · evade (maroma).
// Cifras ajustables: config.anim.locomotion. Convenciones y trampas: common.js y la cabecera de
// src/anim/core/characterRig.js. Checklist de poses: docs/qa/animacion/locomocion.md.

import { idle, walk, jog, run, crouch } from './gait.js';
import { jump, fall, land } from './air.js';
import { vault, climb } from './traverse.js';
import { evade } from './evade.js';

export default function register(anim) {
  anim.registerProvider(['idle'], idle, 'body');
  anim.registerProvider(['walk'], walk, 'body');
  anim.registerProvider(['jog'], jog, 'body');
  anim.registerProvider(['run'], run, 'body');
  anim.registerProvider(['crouch'], crouch, 'body');
  anim.registerProvider(['jump'], jump, 'body');
  anim.registerProvider(['fall'], fall, 'body');
  anim.registerProvider(['land'], land, 'body');
  anim.registerProvider(['vault'], vault, 'body');
  anim.registerProvider(['climb'], climb, 'body');
  anim.registerProvider(['evade'], evade, 'body');
}
