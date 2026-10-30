// PENDIENTE (Fase 1a.3): suite completa de controles; no la ejecuta run.mjs. La 1a.1 la cubre suites/05-humo-1a1.mjs.
// Suite 10 — Controles E-Day Default (GDD §1, contrato Fase 1a). Dueño: qa-tester.
//
// ESQUELETO: los casos ya contienen la secuencia de mando y las aserciones previstas, pero se
// marcan SKIP mientras falte el sistema del que dependen (menú, jugador, cobertura, combate…).
// Cuando el juego exista, revisar cada TODO y quitar los skip que ya no apliquen.
//
// Lecturas sobre window.__game (contrato §Entidades):
//   state, player.move.mode, player.cover {height, side, peeking, aimingOver}, player.aiming,
//   player.shoulder, player.inventory {slots, current}, player.weapon {id, mag, reserve, reloading…},
//   player.pos, player.yaw, entities (dianas: kind 'target', hp, alive).
// Recolocar al jugador: __game.teleport(x, z, yaw) si lo registra controls-camera-engineer
// (TODO: confirmar el nombre con el dueño); si no, se escribe pos/prevPos a mano.

import { assert, sleep, waitFor, skip } from '../lib.mjs';

// ── Helpers ──────────────────────────────────────────────────────────────────
const P = (page, fn, arg) => page.evaluate(fn, arg);
const player = (page) => P(page, () => {
  const p = window.__game.player;
  if (!p) return null;
  return {
    mode: p.move?.mode, speed: p.move?.speed, pos: p.pos && [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw,
    cover: p.cover && { height: p.cover.height, side: p.cover.side, peeking: p.cover.peeking, aimingOver: p.cover.aimingOver },
    aiming: p.aiming, shoulder: p.shoulder, grounded: p.grounded,
    inventory: p.inventory && { slots: [...p.inventory.slots], current: p.inventory.current },
    weapon: p.weapon && { id: p.weapon.id, mag: p.weapon.mag, reserve: p.weapon.reserve, magSize: p.weapon.magSize, reloading: p.weapon.reloading },
  };
});
const modeIs = (page, modes, timeout = 1500) =>
  waitFor(page, (ms) => ms.includes(window.__game.player?.move?.mode) && window.__game.player.move.mode, { arg: [].concat(modes), timeout, what: `move.mode ∈ ${[].concat(modes)}` });

/** Precondición: hay jugador en 'playing'. Si el sistema aún no existe → SKIP. */
async function needPlayer(ctx) {
  const st = await P(ctx.page, () => window.__game.state);
  if (st !== 'playing' || !(await P(ctx.page, () => !!window.__game.player))) skip('no hay jugador en playing (player/hud aún no implementados)');
}

/** Vuelve al jugador a un punto despejado y lo deja quieto. */
async function resetPlayer(ctx, where) {
  await ctx.pad.reset();
  await P(ctx.page, (w) => {
    const g = window.__game; const p = g.player;
    const start = w || g.service?.('level')?.playerStart || { pos: [0, 0, 0], yaw: 0 };
    if (typeof g.teleport === 'function') g.teleport(start.pos[0], start.pos[2], start.yaw);
    else { p.pos.set(...start.pos); p.prevPos.copy(p.pos); p.yaw = p.prevYaw = start.yaw; p.vel?.set(0, 0, 0); }
  }, where || null);
  await sleep(150);
}

/**
 * Busca una cobertura del nivel de altura 'low'|'high' y devuelve un punto delante de ella
 * mirando hacia ella. TODO: ajustar al formato real de level.data.boxes (min/max/tags).
 */
async function coverSpot(ctx, height) {
  return P(ctx.page, (h) => {
    const lvl = window.__game.service?.('level');
    const boxes = lvl?.data?.boxes || [];
    const b = boxes.find((x) => x.tags?.includes('cover') && x.tags?.includes(h));
    if (!b) return null;
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    // Se coloca a 1,5 m del lado +Z de la caja mirando hacia −Z (yaw = 0 mira a −Z).
    return { pos: [cx, 0, b.max[2] + 1.5], yaw: 0, box: b };
  }, height);
}

// ── Casos ────────────────────────────────────────────────────────────────────
export default {
  name: 'Controles (E-Day Default)',
  waitState: 'menu',
  caseTimeout: 20000,
  cases: [
    {
      name: 'menú: navegar con D-pad/LS y empezar con A',
      async run(ctx) {
        const { page, pad } = ctx;
        // TODO(hud): confirmar estructura del menú (clase/dificultad) y qué se puede leer
        // (p. ej. __game.menu.selection). De momento: navegar y confirmar hasta 'playing'.
        await pad.press('Down', 80); await sleep(120);
        await pad.press('Up', 80); await sleep(120);
        await pad.tilt('LS', 0, -1, 100); await sleep(250); // LS abajo con repetición
        await pad.tilt('LS', 0, 1, 100); await sleep(250);
        for (let i = 0; i < 4; i++) {
          if (await P(page, () => window.__game.state === 'playing')) break;
          await pad.press('A', 80); await sleep(350);
        }
        const st = await P(page, () => window.__game.state);
        if (st === 'menu') skip('A no saca del menú (hud aún no implementado)');
        assert.eq(st, 'playing', 'state tras confirmar');
        await waitFor(page, () => !!window.__game.player, { what: 'player tras menu:start' });
        const s = await P(page, () => ({ ...window.__game.session }));
        assert.ok(s.classId, 'session.classId vacío');
        await ctx.shot('inicio-partida');
      },
    },
    {
      name: 'LS mueve al jugador (walk/jog/run)',
      async run(ctx) {
        await needPlayer(ctx); await resetPlayer(ctx);
        const a = await player(ctx.page);
        await ctx.pad.stick('LS', 0, 1);
        await modeIs(ctx.page, ['walk', 'jog', 'run']);
        await sleep(600);
        const b = await player(ctx.page);
        await ctx.pad.stick('LS', 0, 0);
        const d = Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]);
        assert.gt(d, 0.5, 'distancia recorrida en 0,6 s');
        await modeIs(ctx.page, ['idle'], 1500);
        // TODO: comprobar que LS a media inclinación da 'walk' y a fondo 'jog'/'run' (umbral en config.player).
      },
    },
    {
      name: 'L3 sprint toggle; se corta al soltar el stick',
      async run(ctx) {
        await needPlayer(ctx); await resetPlayer(ctx);
        await ctx.pad.stick('LS', 0, 1); await sleep(200);
        await ctx.pad.press('L3', 80);
        await modeIs(ctx.page, ['sprint']);
        await sleep(300);
        assert.eq((await player(ctx.page)).mode, 'sprint', 'sigue en sprint sin mantener L3 (toggle)');
        await ctx.pad.stick('LS', 0, 0);
        await modeIs(ctx.page, ['idle', 'walk', 'jog', 'run'], 1500);
        // TODO: sprint también se corta al apuntar (LT) o disparar (RT) — GDD §1.
      },
    },
    {
      name: 'R3 cambia de hombro',
      async run(ctx) {
        await needPlayer(ctx);
        const a = (await player(ctx.page)).shoulder;
        await ctx.pad.press('R3', 80); await sleep(150);
        const b = (await player(ctx.page)).shoulder;
        assert.eq(b, -a, 'shoulder tras R3');
        await ctx.pad.press('R3', 80); await sleep(150);
        assert.eq((await player(ctx.page)).shoulder, a, 'shoulder tras segundo R3');
      },
    },
    {
      name: 'A entra en cobertura media (low)',
      async run(ctx) {
        await needPlayer(ctx);
        const spot = await coverSpot(ctx, 'low');
        if (!spot) skip('no hay cobertura low en level.data (TODO)');
        await resetPlayer(ctx, spot);
        await ctx.pad.stick('LS', 0, 1); await sleep(150);
        await ctx.pad.press('A', 80);
        await modeIs(ctx.page, ['cover'], 2000);
        await ctx.pad.stick('LS', 0, 0);
        const p = await player(ctx.page);
        assert.eq(p.cover?.height, 'low', 'cover.height');
        await ctx.shot('cobertura-low');
      },
    },
    {
      name: 'A entra en cobertura alta (high)',
      async run(ctx) {
        await needPlayer(ctx);
        const spot = await coverSpot(ctx, 'high');
        if (!spot) skip('no hay cobertura high en level.data (TODO)');
        await resetPlayer(ctx, spot);
        await ctx.pad.stick('LS', 0, 1); await sleep(150);
        await ctx.pad.press('A', 80);
        await modeIs(ctx.page, ['cover'], 2000);
        await ctx.pad.stick('LS', 0, 0);
        assert.eq((await player(ctx.page)).cover?.height, 'high', 'cover.height');
        await ctx.shot('cobertura-high');
      },
    },
    {
      name: 'LT en cobertura: asomarse/apuntar por encima',
      async run(ctx) {
        await needPlayer(ctx);
        const p0 = await player(ctx.page);
        if (p0.mode !== 'cover') skip('requiere el caso anterior en cobertura');
        await ctx.pad.trigger('LT', 1); await sleep(300);
        const p = await player(ctx.page);
        assert.ok(p.aiming, 'aiming con LT');
        assert.ok(p.cover?.peeking || p.cover?.aimingOver, 'peeking/aimingOver con LT en cobertura');
        await ctx.shot('cobertura-asomarse');
        await ctx.pad.trigger('LT', 0); await sleep(200);
        // TODO: en cobertura alta en el borde → asomarse lateral; en low → aimingOver.
      },
    },
    {
      name: 'A + dirección: SWAT turn y deslizar a la contigua',
      async run(ctx) {
        await needPlayer(ctx);
        // TODO(level): necesito dos coberturas separadas por un hueco (SWAT) y dos contiguas en
        // ángulo (deslizar); pedir a level-designer sus coordenadas o un registro debug
        // (__game.qaSpots?). Secuencia prevista:
        //   en cobertura junto al borde → stick('LS', ±1, 0) + press('A') → mode 'swat' → 'cover' en la otra,
        //   escuchar cover:swat / cover:slide (__game.events.on) y comprobar from !== to.
        skip('TODO: faltan posiciones de prueba de SWAT/deslizar en el nivel');
      },
    },
    {
      name: 'doble toque A: evadir/rodar',
      async run(ctx) {
        await needPlayer(ctx); await resetPlayer(ctx);
        await ctx.pad.stick('LS', 1, 0); await sleep(150);
        const seen = P(ctx.page, () => new Promise((r) => {
          const off = window.__game.events.on('player:moveMode', (e) => { if (e.mode === 'evade') { off?.(); r(true); } });
          setTimeout(() => r(false), 2000);
        }));
        await ctx.pad.doubleTap('A', 120);
        const ok = await seen;
        await ctx.pad.stick('LS', 0, 0);
        assert.ok(ok, "no se vio move.mode 'evade' tras doble toque A");
      },
    },
    {
      name: 'A en sprint: deslizar',
      async run(ctx) {
        await needPlayer(ctx); await resetPlayer(ctx);
        await ctx.pad.stick('LS', 0, 1); await sleep(150);
        await ctx.pad.press('L3', 80);
        await modeIs(ctx.page, ['sprint']);
        await sleep(300);
        await ctx.pad.press('A', 80);
        await modeIs(ctx.page, ['slide', 'coverSlide'], 1500);
        await ctx.pad.stick('LS', 0, 0);
        // TODO: si hay cobertura delante debe ser 'coverSlide' y acabar en 'cover'; en abierto 'slide'.
      },
    },
    {
      name: 'Y salta / vault sobre cobertura baja',
      async run(ctx) {
        await needPlayer(ctx); await resetPlayer(ctx);
        await ctx.pad.press('Y', 80);
        await modeIs(ctx.page, ['air', 'vault', 'climb'], 1000);
        await modeIs(ctx.page, ['idle', 'walk', 'jog', 'run'], 2500);
        // TODO: desde cobertura low, Y → 'vault' y el jugador termina al otro lado (z < box.min.z).
      },
    },
    {
      name: 'LT+RT dispara a una diana (hp baja)',
      async run(ctx) {
        await needPlayer(ctx);
        const tgt = await P(ctx.page, () => {
          const t = window.__game.entities.find((e) => e.kind === 'target' && e.alive);
          return t && { id: t.id, hp: t.hp, pos: [t.pos.x, t.pos.y, t.pos.z] };
        });
        if (!tgt) skip('no hay dianas (level/targets aún no implementado)');
        // TODO: teleport delante de la diana y orientar yaw hacia ella (mirar con RS si no hay teleport con yaw).
        await resetPlayer(ctx, { pos: [tgt.pos[0], 0, tgt.pos[2] + 8], yaw: 0 });
        const mag0 = (await player(ctx.page)).weapon?.mag;
        await ctx.pad.trigger('LT', 1); await sleep(250);
        await ctx.pad.trigger('RT', 1); await sleep(600);
        await ctx.pad.trigger('RT', 0); await ctx.pad.trigger('LT', 0);
        const p = await player(ctx.page);
        assert.lt(p.weapon.mag, mag0, 'el cargador no bajó');
        const hp = await P(ctx.page, (id) => window.__game.entities.find((e) => e.id === id)?.hp, tgt.id);
        assert.lt(hp, tgt.hp, 'hp de la diana no bajó');
        await ctx.shot('disparo-diana');
      },
    },
    {
      name: 'RB recarga y recarga activa (perfect)',
      async run(ctx) {
        await needPlayer(ctx);
        const w = (await player(ctx.page)).weapon;
        if (!w) skip('sin arma (combat aún no implementado)');
        if (w.mag === w.magSize) { await ctx.pad.trigger('RT', 1); await sleep(300); await ctx.pad.trigger('RT', 0); }
        // Escuchar el resultado y pulsar RB de nuevo en mitad de la ventana activa.
        const res = P(ctx.page, () => new Promise((r) => {
          const ev = window.__game.events;
          ev.on('weapon:reloadStart', (e) => {
            const mid = (e.activeWindow[0] + e.activeWindow[1]) / 2;
            setTimeout(() => window.__pad.press('RB', 60), mid * e.duration * 1000 - 30);
          });
          ev.on('weapon:activeReload', (e) => r(e.result));
          setTimeout(() => r(null), 6000);
        }));
        await ctx.pad.press('RB', 80);
        const result = await res;
        assert.eq(result, 'perfect', 'resultado de la recarga activa');
        // TODO: caso 'failed' (pulsar fuera de ventana → jammedT > 0) y recarga normal sin segundo toque.
      },
    },
    {
      name: 'B golpe cuerpo a cuerpo',
      async run(ctx) {
        await needPlayer(ctx);
        const swung = P(ctx.page, () => new Promise((r) => {
          window.__game.events.on('melee:swing', () => r(true));
          setTimeout(() => r(false), 1500);
        }));
        await ctx.pad.press('B', 80);
        assert.ok(await swung, 'no se emitió melee:swing');
      },
    },
    {
      name: 'D-pad ←/→ rifle/arma comprada, ↓ pistola',
      async run(ctx) {
        await needPlayer(ctx);
        const inv0 = (await player(ctx.page)).inventory;
        if (!inv0) skip('sin inventory');
        await ctx.pad.press('Down', 80); await sleep(700);
        let p = await player(ctx.page);
        assert.eq(p.inventory.current, 2, 'slot tras D-pad ↓');
        assert.eq(p.weapon?.id, 'pistol', 'arma tras D-pad ↓');
        await ctx.pad.press('Left', 80); await sleep(700);
        p = await player(ctx.page);
        assert.eq(p.inventory.current, 0, 'slot tras D-pad ←');
        assert.eq(p.weapon?.id, 'assaultRifle', 'arma tras D-pad ←');
        // Slot 1 vacío en Fase 1a: D-pad → no debe cambiar a un arma inexistente.
        await ctx.pad.press('Right', 80); await sleep(700);
        p = await player(ctx.page);
        assert.ok(p.weapon?.id === 'assaultRifle' || p.inventory.slots[1] != null, 'D-pad → con ranura vacía cambió de arma');
      },
    },
    {
      name: 'Menu pausa y reanuda',
      async run(ctx) {
        await needPlayer(ctx);
        await ctx.pad.press('Menu', 80);
        await waitFor(ctx.page, () => window.__game.state === 'paused', { what: "state 'paused'" });
        const t = await P(ctx.page, () => window.__game.time.tick);
        await sleep(400);
        // TODO: confirmar con el arquitecto si time.tick se congela en pausa.
        const pos0 = (await player(ctx.page)).pos;
        await ctx.pad.stick('LS', 0, 1); await sleep(300); await ctx.pad.stick('LS', 0, 0);
        assert.eq(JSON.stringify((await player(ctx.page)).pos), JSON.stringify(pos0), 'el jugador se movió en pausa');
        await ctx.shot('pausa');
        await ctx.pad.press('Menu', 80);
        await waitFor(ctx.page, () => window.__game.state === 'playing', { what: "state 'playing'" });
        void t;
      },
    },
    {
      name: 'sin entradas: el jugador queda en idle',
      async run(ctx) {
        await needPlayer(ctx);
        await ctx.pad.reset(); await sleep(800);
        // TODO: si estaba en cobertura, salir (B o alejar con LS) antes de esta comprobación.
        assert.oneOf((await player(ctx.page)).mode, ['idle', 'cover'], 'modo en reposo');
      },
    },
  ],
};
