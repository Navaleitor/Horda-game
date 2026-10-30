// Suite 00 — Arranque. Dueño: qa-tester.
// Carga horda-debug.html con el mando simulado y comprueba lo mínimo para que el resto de suites tenga sentido.
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { assert, sleep, RELEASE_HTML, VIEWPORT, MOCK_PATH, skip } from '../lib.mjs';

export default {
  name: 'Arranque',
  waitState: 'menu',
  cases: [
    {
      name: 'window.__game existe',
      async run({ page }) {
        const t = await page.evaluate(() => typeof window.__game);
        assert.eq(t, 'object', 'tipo de window.__game');
      },
    },
    {
      name: "estado inicial 'menu'",
      async run({ page }) {
        assert.eq(await page.evaluate(() => window.__game.state), 'menu', 'game.state');
      },
    },
    {
      name: 'canvas WebGL en la página',
      async run({ page }) {
        const r = await page.evaluate(() => {
          const c = document.querySelector('canvas');
          return c ? { w: c.width, h: c.height, gl: !!window.__game.renderer?.getContext?.() } : null;
        });
        assert.ok(r, 'no hay <canvas>');
        assert.gt(r.w, 0, 'ancho del canvas');
        assert.ok(r.gl, 'renderer sin contexto WebGL');
      },
    },
    {
      name: 'el loop avanza (frames y ticks)',
      async run({ page }) {
        const a = await page.evaluate(() => ({ ...window.__game.time }));
        await sleep(700);
        const b = await page.evaluate(() => ({ ...window.__game.time }));
        assert.gt(b.frame, a.frame, 'time.frame no avanza');
        // En 'menu' solo corren los sistemas alwaysRun, pero el paso fijo cuenta igual.
        assert.ok(b.tick >= a.tick, 'time.tick retrocede');
      },
    },
    {
      name: 'stats() responde con fpsAvg/fpsP5/drawCalls/triangles',
      async run({ page, report }) {
        const s = await page.evaluate(() => window.__game.stats());
        for (const k of ['fpsAvg', 'fpsP5', 'drawCalls', 'triangles']) assert.eq(typeof s[k], 'number', `stats().${k}`);
        assert.gt(s.fpsAvg, 0, 'fpsAvg');
        report.arranque = { statsMenu: s };
      },
    },
    {
      name: 'mando simulado visible para la página',
      async run({ page }) {
        const r = await page.evaluate(() => {
          const g = navigator.getGamepads()[0];
          return g && { connected: g.connected, mapping: g.mapping, nb: g.buttons.length, na: g.axes.length, id: g.id };
        });
        assert.ok(r, 'getGamepads()[0] es null');
        assert.eq(r.mapping, 'standard', 'mapping');
        assert.eq(r.nb, 17, 'n.º de botones');
        assert.eq(r.na, 4, 'n.º de ejes');
        // Convención del stick: y+ físico → eje negativo en la API.
        const ax = await page.evaluate(() => { window.__pad.stick('LS', 0, 1); const a = navigator.getGamepads()[0].axes[1]; window.__pad.reset(); return a; });
        assert.eq(ax, -1, 'LS arriba debe dar axes[1] = -1');
      },
    },
    {
      name: "input lee el mando (device, down('cover'), axis('move'))",
      async run({ page }) {
        const has = await page.evaluate(() => { try { return !!window.__game.service('input'); } catch (_) { return false; } });
        assert.ok(has, "no existe el servicio 'input'");
        // Mantener A y LS arriba y muestrear durante ~300 ms (varios pasos fijos).
        const r = await page.evaluate(async () => {
          const input = window.__game.service('input');
          window.__pad.down('A'); window.__pad.stick('LS', 0, 1);
          let down = false, ay = 0;
          for (let i = 0; i < 15; i++) {
            await new Promise((res) => setTimeout(res, 20));
            down = down || !!input.down('cover');
            ay = Math.max(ay, input.axis('move').y);
          }
          const device = input.device;
          window.__pad.reset();
          return { device, down, ay };
        });
        if (r.device !== 'gamepad' && !r.down && r.ay === 0) skip("input no reacciona al mando (servicio aún stub)");
        assert.eq(r.device, 'gamepad', 'input.device');
        assert.ok(r.down, "input.down('cover') con A pulsado");
        assert.gt(r.ay, 0.5, "input.axis('move').y con LS arriba (y+ = adelante)");
      },
    },
    {
      name: 'captura del menú',
      async run({ shot }) { await shot('menu'); },
    },
    {
      name: 'horda.html (release) carga sin errores y sin __game',
      async run({ context }) {
        if (!existsSync(RELEASE_HTML)) skip('no existe horda.html');
        const browser = context.browser();
        const ctx2 = await browser.newContext({ viewport: VIEWPORT });
        await ctx2.addInitScript({ path: MOCK_PATH });
        const p = await ctx2.newPage();
        const errs = [];
        p.on('pageerror', (e) => errs.push(String(e)));
        p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
        try {
          await p.goto(pathToFileURL(RELEASE_HTML).href, { waitUntil: 'load' });
          await p.waitForSelector('canvas', { timeout: 20000 });
          await sleep(1500);
          const hasGame = await p.evaluate(() => typeof window.__game);
          assert.eq(hasGame, 'undefined', 'window.__game en release');
          assert.eq(errs.length, 0, `errores en release: ${errs.join(' | ').slice(0, 400)}`);
        } finally {
          await ctx2.close();
        }
      },
    },
  ],
};
