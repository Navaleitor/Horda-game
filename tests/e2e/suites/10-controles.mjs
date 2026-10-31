// Suite 10 — Controles E-Day Default + HUD de la Fase 1a (GDD §1). Dueño: qa-tester.
// Determinista como la 05: tras empezar se para el loop y la simulación avanza a mano (60 Hz).
// La 05 cubre cobertura, SWAT, maroma, salto/vault/trepar, disparo, recarga, melee, D-pad y pausa;
// esta suite completa la checklist: umbrales del stick, cámara, agacharse (L3) y el HUD
// (vida, arma, munición, recarga activa, prompts e indicador de agachado).
import { assert, waitFor } from '../lib.mjs';

let E, adv, st;

async function press(b, ms = 80) { await E((b) => window.__pad.down(b), b); await adv(ms); await E((b) => window.__pad.up(b), b); }
const stick = (w, x, y) => E(([w, x, y]) => window.__pad.stick(w, x, y), [w, x, y]);
const trigger = (w, v) => E(([w, v]) => window.__pad.trigger(w, v), [w, v]);
const hud = () => E(() => window.__game.hud.state());
async function tp(x, z, yaw) { await E(() => window.__pad.reset()); await E(([x, z, y]) => window.__game.teleport(x, z, y), [x, z, yaw]); await adv(200); }
async function waitMode(modes, ms = 2000) {
  for (let t = 0; t < ms; t += 17) { const s = await st(); if (modes.includes(s.mode)) return s; await adv(17); }
  return st();
}

export default {
  name: 'Controles y HUD',
  waitState: 'menu',
  async setup({ page }) {
    E = (fn, a) => page.evaluate(fn, a);
    adv = (ms) => E((ms) => window.__adv(ms), ms);
    st = () => E(() => window.__game.playerState());
    await E(() => window.__game.events.emit('menu:start', { classId: 'medic', difficulty: 'normal' }));
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
    });
    await adv(300);
  },
  cases: [
    {
      name: 'LS: poca inclinación = walk, media = jog, a fondo = run (4,6 m/s)',
      async run() {
        const out = {};
        for (const [k, y] of [['walk', 0.4], ['jog', 0.75], ['run', 1]]) {
          await tp(-5, 5, Math.PI / 2);
          await stick('LS', 0, y); await adv(700);
          const s = await st();
          out[k] = s;
          assert.eq(s.mode, k, `modo con LS=${y}`);
        }
        assert.ok(Math.abs(out.run.speed - 4.6) < 0.05, `velocidad a fondo ${out.run.speed}`);
        assert.ok(out.walk.speed < out.jog.speed && out.jog.speed < out.run.speed, 'walk < jog < run');
        await stick('LS', 0, 0); await adv(300);
      },
    },
    {
      name: 'RS gira la cámara',
      async run() {
        await tp(-5, 5, 0);
        const a = await E(() => window.__game.cameraState().yaw);
        await stick('RS', 1, 0); await adv(400); await stick('RS', 0, 0); await adv(100);
        const b = await E(() => window.__game.cameraState().yaw);
        assert.gt(Math.abs(b - a), 0.2, `giro de cámara ${(b - a).toFixed(2)} rad`);
      },
    },
    {
      name: 'sin entradas el jugador queda en idle',
      async run() {
        await tp(0.65, 14, 0); await adv(600);
        assert.eq((await st()).mode, 'idle', 'modo sin entradas');
      },
    },
    {
      name: 'L3 alterna agachado/de pie; agachado ≤ speed.crouch; indicador en el HUD',
      async run() {
        await tp(-5, 5, Math.PI / 2);
        await press('L3'); await adv(200);
        let s = await st();
        assert.ok(s.crouched, 'agachado tras L3');
        assert.ok((await hud()).crouched, 'HUD muestra "Agachado"');
        await stick('LS', 0, 1); await adv(700);
        s = await st();
        const max = await E(() => window.__game.config.player.speed.crouch);
        assert.ok(s.speed <= max + 0.05, `velocidad agachado ${s.speed} ≤ ${max}`);
        await stick('LS', 0, 0); await adv(300);
        await press('L3'); await adv(200);
        assert.ok(!(await st()).crouched, 'de pie tras el 2º L3');
        assert.ok(!(await hud()).crouched, 'HUD sin indicador');
      },
    },
    {
      name: 'agachado: la cámara baja ~0,35 m con transición suave',
      async run() {
        await tp(-5, 5, Math.PI / 2); await adv(400);
        const y0 = await E(() => window.__game.cameraState().offset[1]);
        await press('L3'); await adv(50);
        const yMid = await E(() => window.__game.cameraState().offset[1]);
        await adv(800);
        const cs = await E(() => window.__game.cameraState());
        assert.eq(cs.preset, 'crouch', 'preset de cámara agachado');
        assert.ok(Math.abs((y0 - cs.offset[1]) - 0.35) < 0.03, `baja ${(y0 - cs.offset[1]).toFixed(3)} m`);
        assert.ok(yMid < y0 && yMid > cs.offset[1] + 0.02, 'transición suave (no salta)');
        await press('L3'); await adv(800);
        assert.ok(Math.abs(await E(() => window.__game.cameraState().offset[1]) - y0) < 0.02, 'vuelve a la altura de pie');
      },
    },
    {
      name: 'caer de un borde agachado → de pie al aterrizar',
      async run() {
        // Bloque trepable x∈[13,15] (2 m): subir, agacharse y bajar andando por el borde oeste.
        await tp(11.2, 14, -Math.PI / 2);
        await stick('LS', 0, 1); await press('Y', 40);
        await waitMode(['climb'], 1200); await stick('LS', 0, 0);
        let s = await waitMode(['idle'], 2500);
        assert.gt(s.pos[1], 1.9, 'encima del bloque');
        await E(() => window.__game.teleport(13.4, 14, Math.PI / 2)); await adv(200);
        await press('L3'); await adv(200);
        assert.ok((await st()).crouched, 'agachado arriba');
        await stick('LS', 0, 1); await adv(1500); await stick('LS', 0, 0); await adv(500);
        s = await st();
        assert.lt(s.pos[1], 0.3, `en el suelo (y=${s.pos[1].toFixed(2)})`);
        assert.ok(!s.crouched, 'de pie tras aterrizar');
      },
    },
    {
      name: 'subida agarrado en el aire ∝ altura que falta (0,35–0,8 s)',
      async run() {
        await tp(11.2, 14, -Math.PI / 2);
        await stick('LS', 0, 1); await press('Y', 40);
        const s = await waitMode(['climb'], 1200);
        assert.eq(s.mode, 'climb', 'se agarra');
        const P = await E(() => window.__game.config.player.climb);
        let t = 0;
        while ((await st()).mode === 'climb' && t < 2000) { await adv(17); t += 17; }
        await stick('LS', 0, 0); await adv(300);
        assert.ok(t >= P.minAirDuration * 1000 - 40 && t < P.duration * 1000 - 40, `duración de la subida ${t} ms`);
      },
    },
    {
      name: 'L3 en cobertura no cambia la pose (manda la cobertura)',
      async run() {
        await tp(-5.45, 11.5, 0);
        await stick('LS', 0, 1); await adv(80);
        await press('A'); await adv(50); await stick('LS', 0, 0);
        let s = await waitMode(['cover'], 2000);
        assert.eq(s.mode, 'cover', 'en cobertura');
        await press('L3'); await adv(200);
        s = await st();
        assert.eq(s.mode, 'cover', 'sigue en cobertura');
        assert.ok(!(await hud()).crouched, 'el HUD no muestra "Agachado" en cobertura');
        await stick('LS', 0, -1); await adv(500); await stick('LS', 0, 0); await adv(300);
      },
    },
    {
      name: 'HUD: vida, arma y munición',
      async run() {
        await tp(0.65, 14, 0);
        await E(() => window.__game.combat.setAmmo(30, 120, 'assaultRifle'));
        await adv(100);
        const h = await hud();
        assert.ok(h.hp.hp > 0 && h.hp.hp === h.hp.maxHp, `vida ${JSON.stringify(h.hp)}`);
        assert.eq(h.weapon.weaponId, 'assaultRifle', 'arma en el HUD');
        assert.eq(h.weapon.mag, 30, 'cargador en el HUD');
        assert.eq(h.weapon.reserve, 120, 'reserva en el HUD');
        await trigger('RT', 1); await adv(400); await trigger('RT', 0); await adv(100);
        const w = await E(() => window.__game.player.weapon.mag);
        const h2 = await hud();
        assert.ok(h2.weapon.mag < 30, `el cargador baja al disparar (${h2.weapon.mag})`);
        assert.eq(h2.weapon.mag, w, 'HUD = munición real');
      },
    },
    {
      name: 'HUD: recarga activa (barra y resultado)',
      async run() {
        await E(() => window.__game.combat.setAmmo(5, 120, 'assaultRifle'));
        await adv(100);
        await press('RB'); await adv(100);
        assert.ok((await hud()).weapon.reloading, 'HUD en recarga');
        const win = await E(() => [...window.__game.player.weapon.activeWindow]);
        const mid = (win[0] + win[1]) / 2;
        for (let i = 0; i < 400; i++) {
          const f = await E(() => { const w = window.__game.player.weapon; return w.reloadT / w.reloadDur; });
          if (f >= mid - 0.01) break;
          await adv(17);
        }
        await press('RB', 50);
        assert.eq((await hud()).weapon.reloadResult, 'perfect', 'resultado de la recarga en el HUD');
        await adv(2000);
        assert.ok(!(await hud()).weapon.reloading, 'la barra se cierra');
      },
    },
    {
      name: 'HUD: prompt «Cubrirse» (A) junto a una cobertura',
      async run() {
        await tp(-5.45, 11.8, 0);
        await stick('LS', 0, 0.3); await adv(150); await stick('LS', 0, 0); await adv(600);
        const p = (await hud()).prompts;
        assert.ok(p.some((x) => x.button === 'A'), `prompts: ${JSON.stringify(p)}`);
        await tp(-5, 5, 0); await adv(600);
        assert.ok(!(await hud()).prompts.some((x) => x.id === 'player.cover'), 'el prompt se oculta lejos');
      },
    },
  ],
};
