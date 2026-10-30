// Punto único donde se importan los proveedores de los animadores especialistas. Dueño: animation-engineer.
// Cada carpeta exporta `default function register(anim)`. Orden: primero los proveedores por
// defecto del núcleo; después cada especialista (el último registro de un estado gana).
// Para añadir una carpeta nueva (abilities/, enemies/…): importa su index.js y añádelo a SPECIALISTS.

import { registerDefaults } from './providers.js';
import registerLocomotion from '../locomotion/index.js';
import registerCover from '../cover/index.js';
import registerWeapons from '../weapons/index.js';

const SPECIALISTS = [
  ['locomotion', registerLocomotion],   // locomotion-animator
  ['cover', registerCover],             // cover-animator
  ['weapons', registerWeapons],         // weapon-animator
];

export function registerAll(anim) {
  registerDefaults(anim);
  for (const [name, register] of SPECIALISTS) {
    try {
      register(anim);
    } catch (err) {
      // Un especialista roto no tumba el juego: se quedan los proveedores por defecto.
      console.error(`[anim] fallo al registrar proveedores de "${name}":`, err);
    }
  }
}
