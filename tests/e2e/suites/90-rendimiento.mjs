// Suite 90 — Rendimiento. Dueño: qa-tester.
// Mide FPS medio y p5 durante 5 s, draw calls y triángulos (renderer.info vía __game.stats()).
// Escena: "combate" si se puede entrar en 'playing' (moviéndose y disparando); si no, el menú.
import { sleep, measureFps, waitFor, assert } from '../lib.mjs';

export default {
  name: 'Rendimiento',
  waitState: 'menu',
  lowgfx: false, // mide con calidad completa (sombras y antialias)
  caseTimeout: 30000,
  cases: [
    {
      name: 'entrar en partida (si el menú lo permite)',
      async run({ page, pad }) {
        for (let i = 0; i < 4; i++) {
          if (await page.evaluate(() => window.__game.state === 'playing')) break;
          await pad.press('A', 80); await sleep(350);
        }
        if (await page.evaluate(() => window.__game.state === 'playing')) {
          await waitFor(page, () => !!window.__game.player, { what: 'player', timeout: 5000 }).catch(() => {});
        }
      },
    },
    {
      name: 'FPS 5 s + draw calls',
      async run({ page, pad, report, shot }) {
        const playing = await page.evaluate(() => window.__game.state === 'playing' && !!window.__game.player);
        if (playing) {
          // Combate: apuntar, disparar y moverse en círculo con la cámara girando.
          await pad.trigger('LT', 1); await pad.trigger('RT', 1);
          await pad.stick('LS', 0.6, 0.6); await pad.stick('RS', 0.4, 0);
        }
        await sleep(500);
        const m = await measureFps(page, 5000);
        await pad.reset();
        report.perf = { escena: playing ? 'combate' : 'menu', ...m };
        await shot(playing ? 'combate' : 'menu-perf');
        assert.gt(m.raf.frames, 0, 'no se renderizaron frames');
        // Sin umbral de FPS: SwiftShader (CPU) no es representativo del hardware real; se reporta.
      },
    },
  ],
};
