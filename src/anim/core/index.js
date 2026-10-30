// Sistema y servicio 'anim'. Dueño: animation-engineer. Contrato: docs/arquitectura.md §3.7.
//
//   anim.createRig(entity, soldier) → rig        (rig.setState / setUpper / setAim / attachWeapon)
//   anim.registerProvider(states[], provider, layer?)   layer se deduce de BODY_STATES/UPPER_STATES
//   anim.destroyRig(rig)
//   anim.states → { body: [...], upper: [...] };  anim.stats() → { rigs, ms, msMax }
//
// Por frame (update interpolado): coloca entity.object3d con interpPos/interpYaw, rellena
// rig.speed/moveDir/vy desde la entidad y avanza cada rig. Escucha weapon:* y melee:* (filtrando
// `who`) para la capa de torso. Convenciones de rig y proveedores: cabecera de characterRig.js.

import * as THREE from 'three';
import { interpPos, interpYaw } from '../../core/loop.js';
import { createWeapon } from '../../assets/props/index.js';
import { CharacterRig, BODY_STATES, UPPER_STATES } from './characterRig.js';
import { registerAll } from './registry.js';
import { wrapAngle } from './math.js';

const _p = new THREE.Vector3();
const BODY_SET = new Set(BODY_STATES);
const UPPER_SET = new Set(UPPER_STATES);

export default function create() {
  let game = null;
  const rigs = [];
  const byEntity = new Map();
  const providers = new Map();
  const layers = new Map();
  const offs = [];
  const stats = { rigs: 0, ms: 0, msMax: 0, msAvg: 0, frames: 0 };

  const api = {
    states: { body: BODY_STATES, upper: UPPER_STATES },

    createRig(entity, soldier) {
      const rig = new CharacterRig({
        entity, soldier, providers, layers, events: game ? game.events : null, config: game.config,
      });
      rig.weaponFactory = createWeapon;
      rig._ev = makeEventParams();
      rig._auto = { speed: 0, dir: 0, side: 1, height: 'low', peeking: false, aimingOver: false, vy: 0 };
      rig._seen = false;
      rigs.push(rig);
      if (entity) byEntity.set(entity, rig);
      return rig;
    },

    destroyRig(rig) {
      const i = rigs.indexOf(rig);
      if (i >= 0) rigs.splice(i, 1);
      if (rig.entity && byEntity.get(rig.entity) === rig) byEntity.delete(rig.entity);
      rig.dispose();
    },

    /**
     * Registra un proveedor para uno o varios estados. Sobrescribe el anterior (el último gana).
     * layer: 'body' | 'upper'; si se omite se deduce de la lista de estados conocidos (o de
     * provider.layer; por defecto 'body').
     */
    registerProvider(states, provider, layer) {
      if (!provider || typeof provider.update !== 'function') {
        throw new Error('[anim] registerProvider: el proveedor necesita update(rig, dt, params)');
      }
      for (const s of states) {
        const l = layer || (UPPER_SET.has(s) ? 'upper' : BODY_SET.has(s) ? 'body' : provider.layer || 'body');
        providers.set(s, provider);
        layers.set(s, l);
      }
    },

    hasProvider(state) { return providers.has(state); },
    rigOf(entity) { return byEntity.get(entity) || null; },
    stats() { return stats; },
  };

  function makeEventParams() {
    return {
      fire: { weaponId: null },
      reload: { duration: 2, activeWindow: [0.5, 0.6], weaponId: null },
      activeReload: { result: 'good' },
      swap: { weaponId: null, duration: 0 },
      melee: {},
    };
  }

  function on(type, fn) { offs.push(game.events.on(type, fn)); }

  function listen() {
    on('weapon:fired', (e) => {
      const rig = byEntity.get(e.who); if (!rig) return;
      rig._ev.fire.weaponId = e.weaponId;
      rig._setUpper('fire', rig._ev.fire);
    });
    on('weapon:reloadStart', (e) => {
      const rig = byEntity.get(e.who); if (!rig) return;
      const p = rig._ev.reload;
      p.duration = e.duration || 2;
      p.weaponId = e.weaponId;
      if (e.activeWindow) { p.activeWindow[0] = e.activeWindow[0]; p.activeWindow[1] = e.activeWindow[1]; }
      rig._setUpper('reload', p);
    });
    on('weapon:activeReload', (e) => {
      const rig = byEntity.get(e.who); if (!rig) return;
      rig._ev.activeReload.result = e.result;
      rig._setUpper('activeReload', rig._ev.activeReload);
    });
    on('weapon:reloaded', (e) => {
      const rig = byEntity.get(e.who); if (!rig) return;
      if (rig.upper === 'reload') rig.endUpper();
    });
    on('weapon:reloadCancel', (e) => {
      // B (melee) o cambio de arma cancelan la recarga al instante.
      const rig = byEntity.get(e.who); if (!rig) return;
      if (rig.upper === 'reload' || rig.upper === 'activeReload') rig.endUpper();
    });
    on('weapon:switched', (e) => {
      const rig = byEntity.get(e.who); if (!rig) return;
      const p = rig._ev.swap;
      p.weaponId = e.weaponId;
      const wc = game.config.weapons[e.weaponId];
      p.duration = wc && wc.swapTime ? wc.swapTime : 0.45;
      rig._setUpper('swap', p);
    });
    on('melee:swing', (e) => {
      const rig = byEntity.get(e.who); if (!rig) return;
      rig._setUpper('melee', rig._ev.melee);
    });
  }

  /** Lecturas de movimiento desde la entidad (sin reservas). */
  function readEntity(rig, e, yaw) {
    const v = e.vel;
    if (v) {
      const sp = Math.hypot(v.x, v.z);
      rig.speed = sp;
      rig.vy = v.y;
      // dir: 0 = delante, +π/2 = izquierda (forward(yaw) = (−sin, 0, −cos))
      rig.moveDir = sp > 0.05 ? wrapAngle(Math.atan2(-v.x, -v.z) - yaw) : 0;
    }
  }

  /** Respaldo: si nadie llama a setState, el estado se deduce de entity.move / entity.cover. */
  function autoState(rig, e) {
    const m = e.move;
    if (!m) return;
    const a = rig._auto;
    a.speed = m.speed !== undefined ? m.speed : rig.speed;
    a.dir = rig.moveDir;
    a.vy = rig.vy;
    let s = m.mode;
    if (s === 'air') s = rig.vy > 0 ? 'jump' : 'fall';
    else if (s === 'cover') {
      const c = e.cover;
      a.side = c ? c.side : 1;
      a.height = c ? c.height : 'low';
      a.peeking = !!(c && c.peeking);
      a.aimingOver = !!(c && c.aimingOver);
      s = a.peeking ? 'peek' : a.height === 'high' ? 'coverHigh' : 'coverLow';
    }
    if (!providers.has(s)) s = 'idle';
    rig._setBody(s, a);
  }

  function autoAim(rig, yaw) {
    if (!game.hasService('camera')) return;
    const cam = game.service('camera');
    if (!cam.getAimRay) return;
    const ray = cam.getAimRay();
    if (!ray || !ray.dir) return;
    const d = ray.dir;
    const aimYaw = Math.atan2(-d.x, -d.z);
    rig._setAimTarget(wrapAngle(aimYaw - yaw), Math.asin(Math.max(-1, Math.min(1, d.y))));
  }

  return {
    name: 'anim',

    init(g) {
      game = g;
      registerAll(api);
      game.provide('anim', api);
      listen();
      if (game.debug && game.debug.enabled) {
        game.debug.register('anim', api);
        game.debug.register('animStats', () => ({ ...stats }));
      }
    },

    fixedUpdate(dt) {},

    update(dt, alpha) {
      const t0 = performance.now();
      const ents = game.entities;
      const checkAlive = (game.time.frame & 31) === 0;
      for (let i = rigs.length - 1; i >= 0; i--) {
        const rig = rigs[i];
        const e = rig.entity;
        let yaw = 0;
        if (e) {
          if (checkAlive) {
            const inGame = ents.indexOf(e) >= 0;
            if (inGame) rig._seen = true;
            else if (rig._seen) { api.destroyRig(rig); continue; }   // despawn: libera el rig
          }
          if (e.prevPos && e.pos) {
            const o = e.object3d;
            yaw = e.prevYaw !== undefined ? interpYaw(e, alpha) : e.yaw || 0;
            if (o) {
              interpPos(e, alpha, _p);
              o.position.copy(_p);
              o.rotation.y = yaw;
            }
          }
          if (e.object3d && !e.object3d.parent) continue;            // fuera de escena
          readEntity(rig, e, yaw);
          if (rig.autoState) autoState(rig, e);
          if (rig.autoAim && e === game.player) autoAim(rig, yaw);
          if (e.aiming !== undefined && rig.autoUpper) rig._setUpper(e.aiming ? 'aim' : 'none');
        }
        rig.update(dt);
      }
      const ms = performance.now() - t0;
      stats.rigs = rigs.length;
      stats.ms = ms;
      stats.frames++;
      stats.msAvg += (ms - stats.msAvg) * 0.05;
      if (ms > stats.msMax) stats.msMax = ms;
    },

    dispose() {
      for (const off of offs) off();
      offs.length = 0;
      for (const r of rigs.slice()) api.destroyRig(r);
    },
  };
}
