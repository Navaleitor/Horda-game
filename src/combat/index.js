// Sistema de combate (Fase 1a): hitscan, recarga activa, cambio de arma, melee y daño.
// Dueño: gameplay-programmer. Contrato: docs/arquitectura.md §3 (orden de registro #8).
//
// Procesa cada entidad con `intent` (en 1a, solo el jugador). `player` escribe el intent antes
// (sistema #7). Los servicios 'physics' y 'camera' se resuelven de forma perezosa con
// game.hasService (la cámara se registra después de combat; se toleran stubs/ausencias).

import { initEntityWeapons, requestSwitch, stepWeapon, startReload, emitAmmo } from './weapons.js';
import { stepMelee } from './melee.js';

export default function create() {
  let game = null;
  const offs = [];
  const ctx = { physics: null, camera: null, infiniteAmmo: false };

  function resolveServices() {
    if (!ctx.physics && game.hasService('physics')) ctx.physics = game.service('physics');
    if (!ctx.camera && game.hasService('camera')) ctx.camera = game.service('camera');
  }

  function who(e) { return e || game.player; }

  // window.__game.combat (solo --debug)
  const debugApi = {
    /** Copia del estado del arma y la munición. */
    state(e) {
      e = who(e);
      if (!e || !e.weapon) return null;
      return JSON.parse(JSON.stringify({ weapon: e.weapon, ammo: e.ammo, infiniteAmmo: ctx.infiniteAmmo }));
    },
    /** Fuerza la munición del arma (por defecto la equipada). */
    setAmmo(mag, reserve, weaponId, e) {
      e = who(e);
      if (!e || !e.weapon) return false;
      const w = e.weapon;
      const id = weaponId || w.id;
      const a = e.ammo[id];
      if (!a) return false;
      if (mag != null) a.mag = Math.max(0, mag | 0);
      if (reserve != null) a.reserve = Math.max(0, reserve | 0);
      if (id === w.id) { w.mag = Math.min(a.mag, w.magSize); a.mag = w.mag; w.reserve = a.reserve; emitAmmo(game, e); }
      return true;
    },
    /** Rellena cargador y reserva de todas las armas. */
    refill(e) {
      e = who(e);
      if (!e || !e.weapon) return false;
      for (const id in e.ammo) {
        const c = game.config.weapons[id];
        e.ammo[id].mag = c.magSize;
        e.ammo[id].reserve = c.reserve;
      }
      e.weapon.mag = e.ammo[e.weapon.id].mag;
      e.weapon.reserve = e.ammo[e.weapon.id].reserve;
      emitAmmo(game, e);
      return true;
    },
    infiniteAmmo(on = true) { ctx.infiniteAmmo = !!on; return ctx.infiniteAmmo; },
    reload(e) { e = who(e); return !!(e && e.weapon && startReload(game, e)); },
    /** Bonus de recarga perfecta del arma (por defecto la equipada). */
    setBuff(seconds, weaponId, e) {
      e = who(e);
      if (!e || !e.weapon) return;
      const id = weaponId || e.weapon.id;
      if (e.ammo[id]) e.ammo[id].buffT = seconds;
      if (id === e.weapon.id) e.weapon.buffT = seconds;
    },
    jam(seconds, e) { e = who(e); if (e && e.weapon) e.weapon.jammedT = seconds; },
  };

  return {
    name: 'combat',
    init(g) {
      game = g;
      offs.push(g.events.on('player:spawned', ({ entity }) => {
        if (entity) initEntityWeapons(game, entity);
      }));
      offs.push(g.events.on('weapon:switchRequest', (p) => {
        if (p) requestSwitch(game, p.who, p.slot, p.weaponId);
      }));
      g.debug.register('combat', debugApi);
    },
    fixedUpdate(dt) {
      resolveServices();
      const list = game.entities;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.intent) continue;
        if (!e.weapon) initEntityWeapons(game, e);
        if (e.alive === false) continue;
        stepMelee(game, e, dt, ctx);
        stepWeapon(game, e, dt, ctx);
      }
    },
    update(dt, alpha) {},
    dispose() {
      for (const off of offs) off();
      offs.length = 0;
    },
  };
}
