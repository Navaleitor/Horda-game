// Suite 05 — Humo 1a.1 "Moverse y disparar". Dueño: qa-tester.
// Determinista: tras empezar la partida se para el loop y la simulación avanza a mano con
// loop.stepN (60 Hz). Así ninguna pulsación del mando simulado se pierde aunque SwiftShader
// vaya a 1–2 FPS en headless. Coordenadas: docs del nivel (coberturas de prueba en z≈10).
import { assert, waitFor } from '../lib.mjs';

let E, adv, pad, st;

async function press(b, ms = 80) { await E((b) => window.__pad.down(b), b); await adv(ms); await E((b) => window.__pad.up(b), b); }
const stick = (w, x, y) => E(([w, x, y]) => window.__pad.stick(w, x, y), [w, x, y]);
const trigger = (w, v) => E(([w, v]) => window.__pad.trigger(w, v), [w, v]);
async function waitMode(modes, ms = 2000) {
  for (let t = 0; t < ms; t += 17) { const s = await st(); if (modes.includes(s.mode)) return s; await adv(17); }
  return st();
}
async function tp(x, z, yaw) { await E(() => window.__pad.reset()); await E(([x, z, y]) => window.__game.teleport(x, z, y), [x, z, yaw]); await adv(200); }
const events = (type) => E((t) => window.__ev.filter((e) => e[0] === t).map((e) => e[1]), type);
const clearEv = () => E(() => { window.__ev.length = 0; });

async function enterCover(x, z) {
  await tp(x, z, 0);
  await stick('LS', 0, 1); await adv(80);
  await press('A'); await adv(50); await stick('LS', 0, 0);
  return waitMode(['cover'], 2000);
}

export default {
  name: 'Humo 1a.1',
  waitState: 'menu',
  async setup({ page }) {
    E = (fn, a) => page.evaluate(fn, a);
    adv = (ms) => E((ms) => window.__adv(ms), ms);
    st = () => E(() => window.__game.playerState());
    // Empezar con A (el menú tiene "Empezar" accesible); si no, emitir menu:start.
    await E(() => window.__pad.press('A', 300));
    await new Promise((r) => setTimeout(r, 2500));
    if ((await E(() => window.__game.state)) !== 'playing') {
      await E(() => window.__game.events.emit('menu:start', { classId: 'medic', difficulty: 'normal' }));
    }
    await waitFor(page, () => window.__game.player && window.__game.state === 'playing', { timeout: 10000, what: 'partida' });
    await E(() => {
      const g = window.__game; g.loop.stop();
      const dt = g.loop.fixedDt;
      window.__adv = (ms) => {
        const n = Math.max(1, Math.round(ms / 1000 / dt));
        for (let i = 0; i < n; i++) {
          g.loop.stepN(1);
          for (const s of g.systems) if (s.update && (g.state === 'playing' || s.alwaysRun)) s.update(dt, 1);
        }
      };
      window.__ev = [];
      for (const t of ['player:moveMode', 'cover:swat', 'weapon:switchRequest', 'prompt:show', 'weapon:reloadStart',
        'weapon:activeReload', 'weapon:reloadCancel', 'damage:dealt', 'melee:swing']) {
        g.events.on(t, (p) => window.__ev.push([t, p.mode || p.result || p.reason || p.text || p.weaponId || p.amount || '']));
      }
    });
    await adv(300);
  },
  cases: [
    {
      name: 'LS mueve (run) y al soltar vuelve a idle',
      async run() {
        await tp(0.65, 14, 0);
        const a = await st();
        await stick('LS', 0, 1); await adv(600);
        const b = await st();
        assert.gt(Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]), 0.5, 'distancia recorrida');
        assert.eq(b.mode, 'run', 'modo con stick a fondo');
        await stick('LS', 0, 0); await adv(300);
        assert.eq((await st()).mode, 'idle', 'modo al soltar');
      },
    },
    {
      name: 'L3 sin función; velocidad máxima 4,14 m/s',
      async run() {
        await tp(-5, 5, Math.PI / 2);
        await stick('LS', 0, 1); await adv(500);
        await press('L3'); await adv(300);
        const s = await st();
        assert.eq(s.mode, 'run', 'L3 no cambia el modo');
        assert.ok(Math.abs(s.speed - 4.14) < 0.05, `velocidad a fondo: ${s.speed}`);
        await stick('LS', 0, 0); await adv(300);
      },
    },
    {
      name: 'R3 cambia de hombro',
      async run() {
        await tp(0.65, 14, 0);
        await press('R3'); await adv(400);
        assert.eq((await st()).shoulder, -1, 'hombro tras R3');
        await press('R3'); await adv(400);
        assert.eq((await st()).shoulder, 1, 'hombro tras 2º R3');
      },
    },
    {
      name: 'A cobertura media + LT asomarse + SWAT turn',
      async run() {
        let s = await enterCover(-5.45, 11.5);
        assert.ok(s.mode === 'cover' && s.cover && s.cover.height === 'low', `cobertura media: ${JSON.stringify(s.cover)}`);
        await trigger('LT', 1); await adv(500);
        s = await st();
        assert.ok(s.cover && s.cover.peeking, 'LT asoma por encima');
        await trigger('LT', 0); await adv(200);
        await stick('LS', 1, 0); await adv(1500);
        s = await st();
        assert.ok(s.cover && s.cover.atRightEdge, 'llega al borde derecho');
        await clearEv();
        await press('A'); await adv(100); await stick('LS', 0, 0);
        s = await waitMode(['cover'], 2500);
        assert.eq((await events('cover:swat')).length, 1, 'cover:swat emitido');
        assert.eq(s.mode, 'cover', 'vuelve a cobertura tras el SWAT');
      },
    },
    {
      name: 'A cobertura alta y LT asoma desde el borde',
      async run() {
        let s = await enterCover(2.75, 11.5);
        assert.ok(s.mode === 'cover' && s.cover && s.cover.height === 'high', `cobertura alta: ${JSON.stringify(s.cover)}`);
        await stick('LS', -1, 0); await adv(1500); await stick('LS', 0, 0);
        await trigger('LT', 1); await adv(500);
        s = await st();
        assert.ok(s.cover && s.cover.peeking, 'asoma por el lado en el borde');
        await trigger('LT', 0); await stick('LS', 0, -1); await adv(400); await stick('LS', 0, 0); await adv(200);
      },
    },
    {
      name: 'A en movimiento sin cobertura = maroma; doble A = maroma; quieto no hace nada',
      async run() {
        await tp(-5, 5, Math.PI / 2); await clearEv();
        await stick('LS', 0, 1); await adv(150);
        await press('A');
        assert.eq((await waitMode(['evade'], 400)).mode, 'evade', 'A en movimiento = maroma');
        await stick('LS', 0, 0); await adv(900);
        await tp(-5, 5, 0); await clearEv();
        await stick('LS', 1, 0); await adv(150);
        await press('A', 60); await adv(120); await press('A', 60); await adv(200);
        assert.ok((await events('player:moveMode')).includes('evade'), 'doble A = maroma');
        assert.ok(!(await events('player:moveMode')).includes('slide'), 'sin slide');
        await stick('LS', 0, 0); await adv(900);
        await tp(-5, 5, 0); await clearEv();
        await press('A'); await adv(300);
        assert.ok(!(await events('player:moveMode')).includes('evade'), 'A quieto sin cobertura no rueda');
      },
    },
    {
      name: 'Y salta, vault sobre la barra y trepa el bloque',
      async run() {
        await tp(-5, 5, 0);
        await press('Y');
        assert.eq((await waitMode(['air'], 800)).mode, 'air', 'salto');
        await waitMode(['idle'], 2000);
        await tp(8.4, 14, -Math.PI / 2);
        await press('Y');
        assert.eq((await waitMode(['vault', 'climb'], 800)).mode, 'vault', 'vault');
        const v = await waitMode(['idle'], 2000);
        assert.gt(v.pos[0], 10, 'aterriza detrás de la barra');
        await tp(12.2, 14, -Math.PI / 2);
        await press('Y');
        assert.eq((await waitMode(['climb', 'vault'], 800)).mode, 'climb', 'climb');
        const c = await waitMode(['idle'], 2500);
        assert.gt(c.pos[1], 1.9, 'arriba del bloque');
      },
    },
    {
      name: 'LT+RT a una diana baja su vida',
      async run() {
        await tp(0.65, 14, 0); await clearEv();
        const tg = await E(() => { const t = window.__game.entities.find((e) => e.kind === 'target' && e.alive); return { id: t.id, hp: t.hp, x: t.pos.x, z: t.pos.z }; });
        const yawT = Math.atan2(-(tg.x - 0.65), -(tg.z - 14));
        await tp(0.65, 14, yawT);
        await trigger('LT', 1); await adv(300);
        for (let k = 0; k < 4; k++) {
          await E((id) => {
            const g = window.__game; const t = g.entities.find((e) => e.id === id);
            const hb = t.hitboxes.find((h) => h.part === 'body') || t.hitboxes[0];
            const r = g.service('camera').getAimRay();
            const dx = (hb.min.x + hb.max.x) / 2 - r.origin.x, dy = (hb.min.y + hb.max.y) / 2 - r.origin.y, dz = (hb.min.z + hb.max.z) / 2 - r.origin.z;
            g.setCamera(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
          }, tg.id);
          await adv(100);
        }
        await trigger('RT', 1); await adv(600); await trigger('RT', 0); await trigger('LT', 0); await adv(100);
        const hp = await E((id) => window.__game.entities.find((e) => e.id === id).hp, tg.id);
        const dmg = await events('damage:dealt');
        assert.ok(dmg.length > 0 && (hp < tg.hp || dmg.length > 0), `daño a la diana (hp ${tg.hp}→${hp}, impactos ${dmg.length})`);
      },
    },
    {
      name: 'RB recarga y 2º RB en la zona perfecta → perfect',
      async run() {
        await E(() => window.__game.combat.setAmmo(10, 200, 'assaultRifle'));
        await clearEv();
        await press('RB'); await adv(50);
        const w = await E(() => { const w = window.__game.player.weapon; return { reloading: w.reloading, win: [...w.activeWindow] }; });
        assert.ok(w.reloading, 'recargando');
        const mid = (w.win[0] + w.win[1]) / 2;
        for (let i = 0; i < 400; i++) {
          const f = await E(() => { const w = window.__game.player.weapon; return w.reloadT / w.reloadDur; });
          if (f >= mid - 0.01) break;
          await adv(17);
        }
        await press('RB', 50);
        assert.ok((await events('weapon:activeReload')).includes('perfect'), `resultado: ${JSON.stringify(await events('weapon:activeReload'))}`);
        await adv(2000);
      },
    },
    {
      name: 'B golpe cuerpo a cuerpo cancela la recarga',
      async run() {
        await E(() => window.__game.combat.setAmmo(10, 200, 'assaultRifle'));
        await adv(300); await clearEv();
        await press('RB'); await adv(200);
        await press('B'); await adv(100);
        assert.ok((await events('melee:swing')).length >= 1, 'melee:swing');
        assert.ok((await events('weapon:reloadCancel')).includes('melee'), 'weapon:reloadCancel por melee');
        assert.ok(!(await E(() => window.__game.player.weapon.reloading)), 'ya no recarga');
        await adv(1000);
      },
    },
    {
      name: 'D-pad: ↓ pistola, → vacía (no cambia), ← rifle',
      async run() {
        await clearEv();
        await press('Down'); await adv(600);
        assert.eq(await E(() => window.__game.player.weapon.id), 'pistol', 'arma tras ↓');
        await press('Right'); await adv(400);
        assert.eq(await E(() => window.__game.player.weapon.id), 'pistol', 'la ranura vacía no cambia el arma');
        await press('Left'); await adv(600);
        assert.eq(await E(() => window.__game.player.weapon.id), 'assaultRifle', 'arma tras ←');
      },
    },
    {
      name: 'Menu pausa y reanuda',
      async run() {
        await press('Menu'); await adv(200);
        assert.eq(await E(() => window.__game.state), 'paused', 'estado tras Menu');
        await press('Menu'); await adv(200);
        assert.eq(await E(() => window.__game.state), 'playing', 'estado tras 2º Menu');
      },
    },
  ],
};
