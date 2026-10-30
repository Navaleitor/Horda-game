// Armas hitscan, recarga activa y cambio de arma. Dueño: gameplay-programmer.
// Contrato: docs/arquitectura.md §3.6 (entity.weapon / entity.ammo) y §3.8 (eventos weapon:*).
// Cifras: config.weapons y config.activeReload (GDD §7).
//
// Flujo de un disparo:
//   1. Rayo de la mira (camera.getAimRay o entity.aimRay) con dispersión → punto apuntado.
//      El origen se adelanta hasta la proyección de la boca del cañón sobre el rayo, para no
//      chocar con nada entre la cámara y el tirador.
//   2. Rayo desde la boca del cañón hasta ese punto: si hay algo entre medias, impacta ahí;
//      si llega (± sameHitTolerance), se usa el impacto de la mira (conserva la parte: headshot).
// Sin allocs en el camino caliente: temporales y payloads a nivel de módulo.

import * as THREE from 'three';
import { dealDamage } from './damage.js';

const EPS = 1e-6;

// ── temporales ───────────────────────────────────────────────────────────────
const _aimDir = new THREE.Vector3();
const _rayOrigin = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _shotDir = new THREE.Vector3();
const _end = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _fallbackRay = { origin: new THREE.Vector3(), dir: new THREE.Vector3() };
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

const rayOpts = { ignore: null, entities: true };

// Copia propia del impacto (physics puede reutilizar su objeto entre llamadas).
const hit = {
  point: new THREE.Vector3(), normal: new THREE.Vector3(), distance: 0,
  entity: null, part: null, boxId: null,
};

// ── payloads reutilizados ─────────────────────────────────────────────────────
const pAmmo = { who: null, weaponId: null, mag: 0, reserve: 0, magSize: 0 };
const pFired = { who: null, weaponId: null, origin: _muzzle, dir: _shotDir, hit: null };
// fx:spawn: FX no escucha weapon:fired; combat emite muzzle + tracer + impact por disparo.
const pFx = { type: null, pos: null, dir: null, end: null, color: undefined, decal: true };
const pEmpty = { who: null, weaponId: null };
const pReloadStart = { who: null, weaponId: null, duration: 0, activeWindow: null, goodWindow: null };
const pActive = { who: null, weaponId: null, result: null };
const pReloaded = { who: null, weaponId: null };
const pSwitched = { who: null, weaponId: null, slot: 0 };
const pCancel = { who: null, weaponId: null, reason: null };

/** Estado `entity.weapon` (contrato §3.6 + campos extra documentados). */
export function createWeaponState() {
  return {
    id: null,             // arma equipada
    slot: 0,              // ranura de inventario equipada
    mag: 0, reserve: 0, magSize: 0,
    reloading: false,
    reloadT: 0,           // s de recarga "nominales" transcurridos (0..reloadDur)
    reloadDur: 0,         // s nominales de la recarga del arma
    reloadRate: 1,        // velocidad de avance (buena/perfecta la aceleran)
    activeWindow: [0, 0], // zona perfecta (fracciones)
    goodWindow: [0, 0],   // zona buena (contiene a la perfecta)
    activeTried: false,   // ya se usó el único intento de recarga activa
    activeResult: null,   // 'perfect' | 'good' | 'failed' | null (última recarga)
    jammedT: 0,           // s de encasquillado restantes (pausa la recarga)
    buffT: 0,             // espejo de ammo[id].buffT del arma actual (+daño de recarga perfecta; para el HUD)
    swapT: 0,             // s restantes del cambio de arma
    swapTo: null,         // arma que se está sacando
    swapSlot: -1,
    fireT: 0,             // s hasta poder disparar otra vez (cadencia)
    emptyLatch: false,    // ya se avisó de cargador vacío con este gatillo
    shots: 0,             // disparos totales (debug/QA)
    meleeT: 0,            // s hasta poder golpear otra vez (golpe + cooldown)
    meleeHitT: -1,        // s hasta resolver el golpe en curso (-1 = ninguno)
    meleeDirX: 0, meleeDirZ: -1,
  };
}

function weaponCfg(game, id) {
  const c = game.config.weapons[id];
  return c && typeof c === 'object' && c.magSize ? c : null;
}

function ensureAmmo(game, entity, id) {
  let a = entity.ammo[id];
  if (!a) {
    const c = weaponCfg(game, id);
    a = entity.ammo[id] = { mag: c.magSize, reserve: c.reserve, buffT: 0 };
  }
  return a;
}

function syncAmmo(entity) {
  const w = entity.weapon;
  const a = entity.ammo[w.id];
  if (a) { a.mag = w.mag; a.reserve = w.reserve; }
}

export function emitAmmo(game, entity) {
  const w = entity.weapon;
  pAmmo.who = entity;
  pAmmo.weaponId = w.id;
  pAmmo.mag = w.mag;
  pAmmo.reserve = w.reserve;
  pAmmo.magSize = w.magSize;
  game.events.emit('weapon:ammo', pAmmo);
}

function equip(game, entity, id, slot) {
  const w = entity.weapon;
  const c = weaponCfg(game, id);
  const a = ensureAmmo(game, entity, id);
  w.id = id;
  w.slot = slot;
  w.magSize = c.magSize;
  w.mag = a.mag;
  w.reserve = a.reserve;
  w.buffT = a.buffT || 0;
  w.activeWindow[0] = c.activeWindow[0]; w.activeWindow[1] = c.activeWindow[1];
  w.goodWindow[0] = c.goodWindow[0]; w.goodWindow[1] = c.goodWindow[1];
  w.reloadDur = c.reloadTime;
  w.fireT = 0;
  w.emptyLatch = false;
}

/** Inicializa (o reinicia) entity.weapon y entity.ammo según el inventario o config. */
export function initEntityWeapons(game, entity) {
  const wc = game.config.weapons;
  const slots = (entity.inventory && entity.inventory.slots) || wc.startSlots;
  entity.ammo = {};
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i];
    if (id && weaponCfg(game, id)) ensureAmmo(game, entity, id);
  }
  entity.weapon = createWeaponState();
  let cur = entity.inventory ? entity.inventory.current | 0 : 0;
  if (!slots[cur] || !weaponCfg(game, slots[cur])) {
    cur = -1;
    for (let i = 0; i < slots.length; i++) if (slots[i] && weaponCfg(game, slots[i])) { cur = i; break; }
  }
  if (cur >= 0) {
    equip(game, entity, slots[cur], cur);
    emitAmmo(game, entity);
  }
  return entity.weapon;
}

function cancelReload(w) {
  w.reloading = false;
  w.reloadT = 0;
  w.reloadRate = 1;
  w.jammedT = 0;
}

/**
 * Cancela la recarga en curso (melee o cambio de arma): se pierde, la munición no se transfiere
 * y hay que volver a pulsar RB. Emite weapon:reloadCancel { who, weaponId, reason }.
 */
export function abortReload(game, entity, reason) {
  const w = entity.weapon;
  if (!w || !w.reloading) return false;
  cancelReload(w);
  pCancel.who = entity;
  pCancel.weaponId = w.id;
  pCancel.reason = reason;
  game.events.emit('weapon:reloadCancel', pCancel);
  return true;
}

/**
 * weapon:switchRequest. La ranura manda (inventory.slots[slot]); si está vacía, se ignora
 * (el arma no cambia). Cancela la recarga en curso.
 */
export function requestSwitch(game, entity, slot, weaponId) {
  if (!entity || !entity.weapon) return false;
  const slots = entity.inventory && entity.inventory.slots;
  const id = slots ? slots[slot] : weaponId;
  if (!id || !weaponCfg(game, id)) return false;
  const w = entity.weapon;
  if (w.swapT > 0) {
    if (w.swapTo === id) return false;
  } else if (id === w.id) {
    return false;
  }
  abortReload(game, entity, 'swap');
  ensureAmmo(game, entity, id);
  w.swapTo = id;
  w.swapSlot = slot;
  w.swapT = weaponCfg(game, id).swapTime;
  return true;
}

/** Empieza la recarga si procede. */
export function startReload(game, entity) {
  const w = entity.weapon;
  if (w.reloading || w.swapT > 0 || w.mag >= w.magSize || w.reserve <= 0) return false;
  w.reloading = true;
  w.reloadT = 0;
  w.reloadRate = 1;
  w.activeTried = false;
  w.activeResult = null;
  w.reloadDur = weaponCfg(game, w.id).reloadTime;
  pReloadStart.who = entity;
  pReloadStart.weaponId = w.id;
  pReloadStart.duration = w.reloadDur;
  pReloadStart.activeWindow = w.activeWindow;
  pReloadStart.goodWindow = w.goodWindow;
  game.events.emit('weapon:reloadStart', pReloadStart);
  return true;
}

/** Resultado de la recarga activa para la fracción `f` (0..1) de la recarga. */
export function classifyActiveReload(f, activeWindow, goodWindow) {
  if (f >= activeWindow[0] && f <= activeWindow[1]) return 'perfect';
  if (f >= goodWindow[0] && f <= goodWindow[1]) return 'good';
  return 'failed';
}

function tryActiveReload(game, entity) {
  const w = entity.weapon;
  if (!w.reloading || w.activeTried || w.jammedT > 0) return null;
  w.activeTried = true;
  const ar = game.config.activeReload;
  const result = classifyActiveReload(w.reloadT / w.reloadDur, w.activeWindow, w.goodWindow);
  if (result === 'perfect') {
    w.reloadRate = 1 / ar.perfectSpeedMult;
    // El bonus va con el arma recargada (corre aunque se cambie de arma).
    entity.ammo[w.id].buffT = ar.perfectBuffDuration;
    w.buffT = ar.perfectBuffDuration;
  } else if (result === 'good') {
    w.reloadRate = 1 / ar.goodSpeedMult;
  } else {
    w.jammedT = ar.failedJamTime;
  }
  w.activeResult = result;
  pActive.who = entity;
  pActive.weaponId = w.id;
  pActive.result = result;
  game.events.emit('weapon:activeReload', pActive);
  return result;
}

function finishReload(game, entity) {
  const w = entity.weapon;
  const n = Math.min(w.magSize - w.mag, w.reserve);
  w.mag += n;
  w.reserve -= n;
  cancelReload(w);
  syncAmmo(entity);
  pReloaded.who = entity;
  pReloaded.weaponId = w.id;
  game.events.emit('weapon:reloaded', pReloaded);
  emitAmmo(game, entity);
}

// ── disparo ─────────────────────────────────────────────────────────────────

function emitFx(game, type, pos, dir, end, color, decal) {
  pFx.type = type; pFx.pos = pos; pFx.dir = dir; pFx.end = end;
  pFx.color = color; pFx.decal = decal !== false;
  game.events.emit('fx:spawn', pFx);
}

function isLowStance(entity) {
  if (entity.move && entity.move.mode === 'crouch') return true;
  const c = entity.cover;
  return !!(c && c.height === 'low' && !c.aimingOver && !c.peeking);
}

/** Posición de la boca del cañón en la simulación, orientada según `dir` (horizontal). */
export function computeMuzzle(game, entity, dir, out) {
  const m = game.config.weapons.muzzleOffset;
  let fx = dir.x, fz = dir.z;
  const len = Math.hypot(fx, fz);
  if (len < 1e-4) { fx = -Math.sin(entity.yaw || 0); fz = -Math.cos(entity.yaw || 0); }
  else { fx /= len; fz /= len; }
  const side = entity.shoulder === -1 ? -1 : 1;
  // right = (−fz, 0, fx)  (ver §3.1: right(yaw) = (cos yaw, 0, −sin yaw))
  const y = isLowStance(entity) ? m.yLow : m.y;
  out.set(
    entity.pos.x - fz * m.x * side + fx * m.z,
    entity.pos.y + y,
    entity.pos.z + fx * m.x * side + fz * m.z,
  );
  return out;
}

/** Semiángulo de dispersión actual. */
export function currentSpread(game, entity, c) {
  const wc = game.config.weapons;
  const aiming = !!((entity.intent && entity.intent.aim) || entity.aiming);
  let s = aiming ? c.spreadAim : c.spread;
  const cov = entity.cover;
  if (cov) s *= (cov.peeking || cov.aimingOver) ? wc.spreadCoverPeekMult : wc.spreadBlindFireMult;
  return s;
}

function applySpread(dir, angle, rng) {
  if (angle <= 0) return;
  const r = Math.tan(angle * Math.sqrt(rng.next()));
  const th = rng.next() * Math.PI * 2;
  _u.crossVectors(dir, Math.abs(dir.y) < 0.99 ? UP : RIGHT).normalize();
  _v.crossVectors(dir, _u);
  dir.addScaledVector(_u, r * Math.cos(th)).addScaledVector(_v, r * Math.sin(th)).normalize();
}

function copyHit(h) {
  hit.point.copy(h.point);
  if (h.normal) hit.normal.copy(h.normal); else hit.normal.set(0, 1, 0);
  hit.distance = h.distance;
  hit.entity = h.entity || null;
  hit.part = h.part || null;
  hit.boxId = h.boxId == null ? null : h.boxId;
  return hit;
}

/** Rayo de la mira: entity.aimRay > cámara (solo el jugador) > frente del cuerpo. */
export function getAimRay(game, entity, camera) {
  if (entity.aimRay) return entity.aimRay;
  if (camera && entity === game.player) return camera.getAimRay();
  const yaw = entity.yaw || 0;
  _fallbackRay.origin.set(entity.pos.x, entity.pos.y + game.config.weapons.muzzleOffset.y, entity.pos.z);
  _fallbackRay.dir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  return _fallbackRay;
}

function fire(game, entity, c, ctx) {
  const w = entity.weapon;
  if (!ctx.infiniteAmmo) { w.mag--; syncAmmo(entity); }
  w.shots++;
  // Fuego continuo: se arrastra el sobrante (< 1 paso). Tras reposo, se parte de 0.
  if (w.fireT <= -game.config.core.fixedDt + 1e-9) w.fireT = 0;
  w.fireT += 1 / c.fireRate;

  const aim = getAimRay(game, entity, ctx.camera);
  _aimDir.copy(aim.dir).normalize();
  applySpread(_aimDir, currentSpread(game, entity, c), game.rng);
  computeMuzzle(game, entity, _aimDir, _muzzle);

  // 1) rayo de la mira, empezando a la altura de la boca del cañón
  const t0 = Math.max(0, _rayOrigin.subVectors(_muzzle, aim.origin).dot(_aimDir));
  _rayOrigin.copy(aim.origin).addScaledVector(_aimDir, t0);
  const physics = ctx.physics;
  rayOpts.ignore = entity;
  let result = null;
  const h1 = physics ? physics.raycast(_rayOrigin, _aimDir, c.range, rayOpts) : null;
  if (h1) { result = copyHit(h1); _aimPoint.copy(hit.point); }
  else _aimPoint.copy(_rayOrigin).addScaledVector(_aimDir, c.range);

  // 2) rayo desde la boca hasta el punto apuntado
  _shotDir.subVectors(_aimPoint, _muzzle);
  const dist = _shotDir.length();
  if (dist > EPS) {
    _shotDir.multiplyScalar(1 / dist);
    const h2 = physics ? physics.raycast(_muzzle, _shotDir, dist, rayOpts) : null;
    if (h2 && h2.distance < dist - game.config.weapons.sameHitTolerance) result = copyHit(h2);
  } else {
    _shotDir.copy(_aimDir);
  }
  _end.copy(result ? result.point : _aimPoint);

  emitFx(game, 'muzzle', _muzzle, _shotDir, null);
  emitFx(game, 'tracer', _muzzle, _shotDir, _end);
  // impact: dir = normal de la superficie; sobre entidades sin calcomanía; rojo en headshot.
  if (result) {
    const onEntity = !!result.entity;
    const color = onEntity && result.part === 'head' ? game.config.weapons.headshotImpactColor : undefined;
    emitFx(game, 'impact', result.point, result.normal, null, color, !onEntity);
  }

  pFired.who = entity;
  pFired.weaponId = w.id;
  pFired.hit = result;
  game.events.emit('weapon:fired', pFired);

  if (result && result.entity) {
    const head = result.part === 'head';
    let dmg = c.damage * (head ? c.headshotMult : 1);
    if (w.buffT > 0) dmg *= game.config.activeReload.perfectDamageMult;
    dealDamage(game, entity, result.entity, dmg, result.part || 'body', result.point, w.id, false);
  }
  emitAmmo(game, entity);
}

/** ¿El golpe cuerpo a cuerpo está en curso (bloquea disparo y recarga)? */
export function isMeleeSwinging(game, w) {
  return w.meleeT > game.config.melee.cooldown;
}

/**
 * Un paso de arma para `entity` (con intent). Orden: temporizadores → cambio de arma →
 * recarga (y recarga activa) → encasquillado → inicio de recarga → disparo.
 */
export function stepWeapon(game, entity, dt, ctx) {
  const w = entity.weapon;
  if (!w || !w.id) return;
  const intent = entity.intent;
  // Bonus de recarga perfecta por arma: corre para todas, esté equipada o no.
  const ammo = entity.ammo;
  for (const id in ammo) {
    const a = ammo[id];
    if (a.buffT > 0) a.buffT = Math.max(0, a.buffT - dt);
  }
  w.buffT = ammo[w.id] ? ammo[w.id].buffT : 0;
  w.fireT -= dt;
  if (!intent.fire) w.emptyLatch = false;

  if (w.swapT > 0) {
    w.swapT -= dt;
    if (w.swapT <= EPS) {
      w.swapT = 0;
      const id = w.swapTo, slot = w.swapSlot;
      w.swapTo = null; w.swapSlot = -1;
      equip(game, entity, id, slot);
      pSwitched.who = entity;
      pSwitched.weaponId = id;
      pSwitched.slot = slot;
      game.events.emit('weapon:switched', pSwitched);
      emitAmmo(game, entity);
    }
    return;
  }

  if (w.reloading) {
    if (intent.reloadPressed) tryActiveReload(game, entity);
    if (w.jammedT > 0) {
      w.jammedT -= dt;
      if (w.jammedT <= EPS) w.jammedT = 0;
    } else {
      w.reloadT += dt * w.reloadRate;
      if (w.reloadT >= w.reloadDur - EPS) finishReload(game, entity);
    }
    return;
  }

  if (w.jammedT > 0) {
    w.jammedT -= dt;
    if (w.jammedT > EPS) return;
    w.jammedT = 0;
  }
  if (isMeleeSwinging(game, w)) return;

  if (intent.reloadPressed && startReload(game, entity)) return;

  const c = weaponCfg(game, w.id);
  const wants = c.auto ? intent.fire : intent.firePressed;
  if (!wants || w.fireT > EPS) return;

  if (w.mag <= 0) {
    if (!w.emptyLatch) {
      w.emptyLatch = true;
      pEmpty.who = entity;
      pEmpty.weaponId = w.id;
      game.events.emit('weapon:empty', pEmpty);
      startReload(game, entity);
    }
    return;
  }
  fire(game, entity, c, ctx);
}
