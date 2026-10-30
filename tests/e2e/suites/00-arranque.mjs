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
      name: "input detecta el mando (input.device = 'gamepad')",
      async run({ page }) {
        const r = await page.evaluate(() => {
          const g = window.__game;
          const input = g.service && (() => { try { return g.service('input'); } catch (_) { return null; } })();
          return input ? { device: input.device, stub: !('device' in input) } : null;
        });
        if (!r || r.stub) skip('servicio input aún es stub');
        await page.evaluate(() => window.__pad.press('A', 80));
        await sleep(150);
        const d = await page.evaluate(() => window.__game.service('input').device);
        assert.eq(d, 'gamepad', 'input.device tras pulsar A');
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
