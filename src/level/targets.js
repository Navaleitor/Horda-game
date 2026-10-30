// Dianas de tiro de la Fase 1a. Dueño: level-designer.
//
// Cada diana es una entidad Damageable (docs/arquitectura.md §3.6):
//   kind 'target', team 'neutral', hp/maxHp (config.targets.hp), alive, applyDamage(amount, info) → { killed },
//   hitboxes [{ part, min, max }] en mundo (TARGET_HITBOXES transformadas por la pose; estáticas mientras está de pie).
// Al morir: se abate con setDown animado (config.targets.fallTime), hitboxes desactivadas (array vacío) y
// emite 'target:down'. Tras config.targets.respawn s desde la muerte se levanta (riseTime) y emite 'target:up'.
//
// Eventos (nuevos, para documentar en §3.8):
//   target:down { target, by, part, weaponId }   level → hud, qa
//   target:up   { target }                       level → hud, qa

import * as THREE from 'three';
import { createTarget, TARGET_HITBOXES } from '../assets/props/index.js';

const UP = 0, FALLING = 1, DOWN = 2, RISING = 3;
const STATE_NAMES = ['up', 'falling', 'down', 'rising'];
const NO_HITBOXES = Object.freeze([]);

/** AABB en mundo de una caja local girada `rot` alrededor de Y y trasladada a `pos`. */
function worldAabb(lmin, lmax, rot, pos, outMin, outMax) {
  const c = Math.cos(rot), s = Math.sin(rot);
  outMin.set(Infinity, Infinity, Infinity);
  outMax.set(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? lmax[0] : lmin[0];
    const y = i & 2 ? lmax[1] : lmin[1];
    const z = i & 4 ? lmax[2] : lmin[2];
    // Matriz de rotación Y de three: x' = c·x + s·z ; z' = −s·x + c·z
    const wx = c * x + s * z + pos.x;
    const wz = -s * x + c * z + pos.z;
    const wy = y + pos.y;
    if (wx < outMin.x) outMin.x = wx; if (wx > outMax.x) outMax.x = wx;
    if (wy < outMin.y) outMin.y = wy; if (wy > outMax.y) outMax.y = wy;
    if (wz < outMin.z) outMin.z = wz; if (wz > outMax.z) outMax.z = wz;
  }
}

/**
 * @param {object} game
 * @param {Array<{id,pos,yaw,group}>} defs
 * @returns {{ list, fixedUpdate(dt), reset(), dispose() }}
 */
export function createTargets(game, defs) {
  const cfg = game.config.targets;
  const physics = game.service('physics');
  const events = game.events;
  const list = [];
  const downPayload = { target: null, by: null, part: null, weaponId: null };
  const upPayload = { target: null };

  for (const def of defs) {
    const prop = createTarget();
    const rot = def.yaw + Math.PI; // la cara frontal del prop mira a +Z local
    prop.root.position.fromArray(def.pos);
    prop.root.rotation.y = rot;
    prop.root.name = `target-${def.id}`;
    // Base, poste y marcas sin sombra: abaratan el pase de sombras.
    prop.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o === prop.body || o === prop.head;
        o.receiveShadow = true;
      }
    });
    game.scene.add(prop.root);

    const pos = new THREE.Vector3().fromArray(def.pos);
    const standing = TARGET_HITBOXES.map((h) => {
      const min = new THREE.Vector3(), max = new THREE.Vector3();
      worldAabb(h.min, h.max, rot, pos, min, max);
      return { part: h.part, min, max };
    });

    const result = { killed: false };
    const e = {
      id: `target-${def.id}`,
      name: def.id,
      group: def.group,
      kind: 'target',
      team: 'neutral',
      pos,
      prevPos: pos.clone(),
      vel: new THREE.Vector3(),
      yaw: def.yaw,
      prevYaw: def.yaw,
      hp: cfg.hp,
      maxHp: cfg.hp,
      alive: true,
      hitboxes: standing,
      object3d: prop.root,
      // internos
      _prop: prop,
      _standing: standing,
      _state: UP,
      _t: 0,
      _deadT: 0,
      _wobble: 0,
      hits: 0,
      kills: 0,
      applyDamage(amount, info) {
        result.killed = false;
        if (!e.alive || !(amount > 0)) return result;
        e.hits++;
        e.hp -= amount;
        if (e.hp <= 0) {
          e.hp = 0;
          e.alive = false;
          e.kills++;
          e.hitboxes = NO_HITBOXES;
          e._state = FALLING;
          e._t = 0;
          e._deadT = 0;
          result.killed = true;
          downPayload.target = e;
          downPayload.by = info ? info.source || null : null;
          downPayload.part = info ? info.part || null : null;
          downPayload.weaponId = info ? info.weaponId || null : null;
          events.emit('target:down', downPayload);
        } else {
          e._wobble = cfg.hitWobbleTime;
        }
        return result;
      },
    };
    list.push(e);
    game.addEntity(e);
    physics.addEntity(e);
  }

  function standUp(e) {
    e._prop.setDown(0);
    e._state = UP;
    e.hp = e.maxHp;
    e.alive = true;
    e.hitboxes = e._standing;
    upPayload.target = e;
    events.emit('target:up', upPayload);
  }

  function fixedUpdate(dt) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      switch (e._state) {
        case UP:
          if (e._wobble > 0) {
            e._wobble = Math.max(0, e._wobble - dt);
            e._prop.setDown(cfg.hitWobble * (e._wobble / cfg.hitWobbleTime));
          }
          break;
        case FALLING: {
          e._t += dt; e._deadT += dt;
          const k = Math.min(1, e._t / cfg.fallTime);
          e._prop.setDown(k * k); // cae acelerando
          if (k >= 1) { e._state = DOWN; e._t = 0; }
          break;
        }
        case DOWN:
          e._deadT += dt;
          if (e._deadT >= cfg.respawn) { e._state = RISING; e._t = 0; }
          break;
        case RISING: {
          e._t += dt;
          const k = Math.min(1, e._t / cfg.riseTime);
          const ease = 1 - (1 - k) * (1 - k);
          e._prop.setDown(1 - ease);
          if (k >= 1) standUp(e);
          break;
        }
      }
    }
  }

  function reset() {
    for (const e of list) { e._wobble = 0; standUp(e); }
  }

  function describe() {
    return list.map((e) => ({
      id: e.name, group: e.group, hp: e.hp, maxHp: e.maxHp, alive: e.alive, state: STATE_NAMES[e._state],
      hits: e.hits, kills: e.kills, pos: [e.pos.x, e.pos.y, e.pos.z], yaw: +e.yaw.toFixed(3),
      hitboxes: e.hitboxes.map((h) => ({ part: h.part, min: h.min.toArray().map((v) => +v.toFixed(3)), max: h.max.toArray().map((v) => +v.toFixed(3)) })),
    }));
  }

  function dispose() {
    for (const e of list) {
      physics.removeEntity(e);
      game.removeEntity(e);
      game.scene.remove(e.object3d);
    }
    list.length = 0;
  }

  return { list, fixedUpdate, reset, describe, dispose };
}
