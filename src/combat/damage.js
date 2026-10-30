// Aplicación de daño (Damageable) y eventos asociados. Dueño: gameplay-programmer.
// Contrato: docs/arquitectura.md §3.6 (applyDamage) y §3.8 (damage:dealt).
//
// - Sin fuego amigo: no se daña a una entidad del mismo equipo que la fuente.
// - La dificultad NO se aplica al daño del jugador (GDD §2 solo escala enemigos y puntos).
// - Payloads e `info` reutilizados (sin allocs): quien quiera guardarlos, copia.

const info = { source: null, part: null, point: null, weaponId: null };
const dealt = { source: null, target: null, amount: 0, part: null, point: null, killed: false };
const killedPayload = { enemy: null, killer: null, headshot: false, melee: false };

/** ¿Puede `source` dañar a `target`? */
export function canDamage(source, target) {
  if (!target || target === source) return false;
  if (target.alive === false) return false;
  if (typeof target.applyDamage !== 'function') return false;
  if (source && source.team && target.team && source.team === target.team) return false;
  return true;
}

/**
 * Aplica `amount` a `target` y emite `damage:dealt` (y `enemy:killed` si muere un enemigo).
 * @returns {null | { killed: boolean }} null si no se aplicó.
 */
export function dealDamage(game, source, target, amount, part, point, weaponId, melee = false) {
  if (!canDamage(source, target)) return null;
  info.source = source;
  info.part = part;
  info.point = point;
  info.weaponId = weaponId;
  const res = target.applyDamage(amount, info);
  const killed = !!(res && res.killed);

  dealt.source = source;
  dealt.target = target;
  dealt.amount = amount;
  dealt.part = part;
  dealt.point = point;
  dealt.killed = killed;
  game.events.emit('damage:dealt', dealt);

  if (killed && target.team === 'enemy') {
    killedPayload.enemy = target;
    killedPayload.killer = source;
    killedPayload.headshot = part === 'head';
    killedPayload.melee = !!melee;
    game.events.emit('enemy:killed', killedPayload);
  }
  return killed ? RES_KILLED : RES_ALIVE;
}

const RES_KILLED = Object.freeze({ killed: true });
const RES_ALIVE = Object.freeze({ killed: false });
