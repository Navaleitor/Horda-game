// Sistema de FX de combate (Fase 1a). Dueño: vfx-artist.
// Contrato: docs/arquitectura.md §3. No importa otros sistemas: solo escucha eventos.
//
// Eventos atendidos:
//   fx:spawn { type, pos, dir, end, color? }
//     'tracer' — cinta de pos (boca del cañón) a end (o pos + dir·tracerMaxDist).
//     'muzzle' — fogonazo en pos (+ pulso de la luz compartida); dir opcional (dirección de tiro).
//     'impact' — chispas + destello + marca en pos; dir = normal de la superficie.
//                Extra opcional: decal:false suprime la marca (p. ej. impacto en una diana).
//     'spark'  — solo chispas (dir opcional = normal).
//     color?   — número hex, string CSS o THREE.Color; sustituye el color por defecto (p. ej. headshot).
//   weapon:activeReload { who, result, pos? } — destello azulado en el arma si result === 'perfect'.
//   melee:hit { who, target?, point? }        — ráfaga de chispas blancas.
// Los Vector3 de los payloads se copian (el emisor puede reutilizarlos).
//
// Draw calls (máx. 4, 0 en reposo): tracers, flashes, sparks, decals.

import * as THREE from 'three';
import { createTracers } from './tracers.js';
import { createFlashes } from './muzzle.js';
import { createSparks, createDecals } from './impacts.js';
import {
  makeTracerTexture, makeFlashTexture, makeSparkTexture, makeDecalTexture, createFxRng,
} from './textures.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();
const _white = new THREE.Color(1, 1, 1);

export default function create() {
  let game = null;
  let cfg = null;
  let tracers = null, flashes = null, sparks = null, decals = null;
  let textures = [];
  const offs = [];
  // Colores por defecto resueltos una vez.
  const colTracer = new THREE.Color();
  const colMuzzle = new THREE.Color();
  const colSpark = new THREE.Color();
  const colMelee = new THREE.Color();
  const colReload = new THREE.Color();

  /** Devuelve `_c` con el color del payload o el de por defecto. */
  function pickColor(color, fallback) {
    if (color === undefined || color === null) return _c.copy(fallback);
    return _c.set(color);
  }

  function onSpawn(e) {
    if (!e || !e.pos) return;
    switch (e.type) {
      case 'tracer': {
        if (e.end) _b.copy(e.end);
        else if (e.dir) _b.copy(e.pos).addScaledVector(e.dir, cfg.tracerMaxDist);
        else return;
        tracers.spawn(e.pos, _b, pickColor(e.color, colTracer));
        break;
      }
      case 'muzzle': {
        const col = pickColor(e.color, colMuzzle);
        flashes.spawn(e.pos, cfg.muzzleSize, cfg.muzzleFlashTime, col, cfg.muzzleMinFrames, true);
        if (e.dir) {
          // Segundo lóbulo un poco adelantado: da forma de cono al fogonazo.
          _a.copy(e.pos).addScaledVector(e.dir, cfg.muzzleSize * 0.35);
          flashes.spawn(_a, cfg.muzzleSize * 0.6, cfg.muzzleFlashTime, col, cfg.muzzleMinFrames, true);
        }
        flashes.flashLight(e.pos, col, cfg.muzzleLightIntensity, cfg.muzzleLightTime);
        break;
      }
      case 'impact': {
        const col = pickColor(e.color, colSpark);
        const normal = e.dir || null;
        sparks.emit(e.pos, normal, cfg.sparkCount, col);
        flashes.spawn(e.pos, cfg.impactFlashSize, cfg.impactLife * 0.25, col, 1, false);
        if (normal && e.decal !== false) decals.spawn(e.pos, normal);
        break;
      }
      case 'spark': {
        sparks.emit(e.pos, e.dir || null, cfg.sparkCount, pickColor(e.color, colSpark));
        break;
      }
      default: break;
    }
  }

  function onActiveReload(e) {
    if (!e || e.result !== 'perfect') return;
    if (e.pos) _a.copy(e.pos);
    else if (e.who && e.who.pos) _a.copy(e.who.pos).y += cfg.activeReloadHeight;
    else return;
    flashes.spawn(_a, cfg.activeReloadSize, 0.18, colReload, 3, false);
    sparks.emit(_a, null, cfg.sparkCount, colReload, cfg.sparkSpeed * 0.5);
    flashes.flashLight(_a, colReload, cfg.muzzleLightIntensity * 0.8, 0.15);
  }

  function onMeleeHit(e) {
    if (!e) return;
    if (e.point) _a.copy(e.point);
    else if (e.target && e.target.pos) _a.copy(e.target.pos).y += 1.2;
    else return;
    sparks.emit(_a, null, cfg.sparkCount * 2, colMelee, cfg.sparkSpeed * 0.8);
    flashes.spawn(_a, cfg.impactFlashSize * 1.3, 0.08, _white, 2, true);
  }

  return {
    name: 'fx',

    init(g) {
      game = g;
      cfg = g.config.fx;
      colTracer.set(cfg.tracerColor);
      colMuzzle.set(cfg.muzzleColor);
      colSpark.set(cfg.sparkColor);
      colMelee.set(cfg.meleeSparkColor);
      colReload.set(cfg.activeReloadColor);

      const rng = createFxRng(g.config.core.seed ^ 0xf00d);
      const tTracer = makeTracerTexture();
      const tFlash = makeFlashTexture();
      const tSpark = makeSparkTexture();
      const tDecal = makeDecalTexture();
      textures = [tTracer, tFlash, tSpark, tDecal];

      decals = createDecals(g.scene, cfg, tDecal, rng);
      tracers = createTracers(g.scene, cfg, tTracer);
      flashes = createFlashes(g.scene, cfg, tFlash, rng);
      sparks = createSparks(g.scene, cfg, tSpark, rng);

      offs.push(
        g.events.on('fx:spawn', onSpawn),
        g.events.on('weapon:activeReload', onActiveReload),
        g.events.on('melee:hit', onMeleeHit),
      );

      g.debug.register('fxStats', () => ({
        tracers: tracers.alive, tracerPool: tracers.size,
        flashes: flashes.alive, flashPool: flashes.size,
        sparks: sparks.alive, sparkPool: sparks.size,
        decals: decals.alive, decalPool: decals.size,
        light: +flashes.light.intensity.toFixed(2),
      }));
    },

    fixedUpdate() {},

    update(dt) {
      const cam = game.camera;
      tracers.update(dt, cam);
      flashes.update(dt, cam);
      sparks.update(dt);
      decals.update(dt);
    },

    dispose() {
      for (const off of offs) off();
      offs.length = 0;
      tracers?.dispose(); flashes?.dispose(); sparks?.dispose(); decals?.dispose();
      for (const t of textures) t.dispose();
      textures = [];
    },
  };
}
