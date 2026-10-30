// Cuerpo a cuerpo (B). Dueño: gameplay-programmer. Cifras: config.melee.
// - Al pulsar: emite `melee:swing`, fija la dirección del golpe (la de la mira, horizontal).
// - A los `hitTime` s: busca el objetivo dañable más cercano en un arco corto delante,
//   con línea de visión (physics.raycast sin entidades); aplica `melee.damage` y emite `melee:hit`.
// - B cancela la recarga en curso (también en la ventana activa o encasquillada): el golpe sale
//   al instante y la recarga se pierde (weapon:reloadCancel reason 'melee').
// - No se puede golpear cambiando de arma. Bloqueo total = duration + cooldown.

import * as THREE from 'three';
import { canDamage, dealDamage } from './damage.js';
import { getAimRay, abortReload } from './weapons.js';

const _origin = new THREE.Vector3();
const _center = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _point = new THREE.Vector3();
const losOpts = { ignore: null, entities: false };

const pSwing = { who: null, target: null, point: null };
const pHit = { who: null, target: null, point: null };

/** Centro del objetivo: hitbox 'body' si la hay; si no, a media altura. */
function targetCenter(e, out) {
  const hb = e.hitboxes;
  if (hb) {
    for (let i = 0; i < hb.length; i++) {
      if (hb[i].part === 'body') {
        return out.addVectors(hb[i].min, hb[i].max).multiplyScalar(0.5);
      }
    }
  }
  return out.set(e.pos.x, e.pos.y + (e.height ? e.height * 0.5 : 1), e.pos.z);
}

function resolveHit(game, entity, ctx) {
  const m = game.config.melee;
  const w = entity.weapon;
  const cosHalf = Math.cos(m.arc * 0.5);
  _origin.set(entity.pos.x, entity.pos.y + m.chestHeight, entity.pos.z);
  let best = null;
  let bestD = Infinity;
  const list = game.entities;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!canDamage(entity, e) || !e.pos) continue;
    targetCenter(e, _center);
    if (Math.abs(_center.y - _origin.y) > m.heightTolerance) continue;
    const dx = _center.x - _origin.x, dz = _center.z - _origin.z;
    const d = Math.hypot(dx, dz);
    const reach = m.range + (e.radius != null ? e.radius : m.targetRadius);
    if (d > reach || d >= bestD) continue;
    if (d > 1e-3 && (dx * w.meleeDirX + dz * w.meleeDirZ) / d < cosHalf) continue;
    if (ctx.physics) {
      _dir.subVectors(_center, _origin);
      const len = _dir.length();
      if (len > 1e-3) {
        _dir.multiplyScalar(1 / len);
        losOpts.ignore = entity;
        const h = ctx.physics.raycast(_origin, _dir, len, losOpts);
        if (h && h.distance < len - 0.1) continue;
      }
    }
    best = e;
    bestD = d;
    _point.copy(_center);
  }
  if (!best) return null;
  dealDamage(game, entity, best, m.damage, 'body', _point, 'melee', true);
  pHit.who = entity;
  pHit.target = best;
  pHit.point = _point;
  game.events.emit('melee:hit', pHit);
  return best;
}

export function stepMelee(game, entity, dt, ctx) {
  const w = entity.weapon;
  if (!w) return;
  const m = game.config.melee;
  if (w.meleeT > 0) w.meleeT = Math.max(0, w.meleeT - dt);
  if (w.meleeHitT >= 0) {
    w.meleeHitT -= dt;
    if (w.meleeHitT <= 1e-6) {
      w.meleeHitT = -1;
      resolveHit(game, entity, ctx);
    }
  }
  if (!entity.intent.meleePressed || w.meleeT > 0 || w.swapT > 0) return;
  abortReload(game, entity, 'melee');

  // Dirección del golpe: la de la mira proyectada en horizontal (o el frente del cuerpo).
  const aim = getAimRay(game, entity, ctx.camera);
  let fx = aim.dir.x, fz = aim.dir.z;
  const len = Math.hypot(fx, fz);
  if (len < 1e-4) { fx = -Math.sin(entity.yaw || 0); fz = -Math.cos(entity.yaw || 0); }
  else { fx /= len; fz /= len; }
  w.meleeDirX = fx;
  w.meleeDirZ = fz;
  w.meleeT = m.duration + m.cooldown;
  w.meleeHitT = m.hitTime;
  pSwing.who = entity;
  game.events.emit('melee:swing', pSwing);
}
