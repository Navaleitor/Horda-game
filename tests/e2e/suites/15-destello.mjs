// Suite 15 — Destello de pantalla al disparar (regresión 1a.3). Dueño: qa-tester.
// Bug: la sacudida de cámara al disparar/aterrizar leía un campo sin inicializar → NaN en el
// cuaternión de la cámara → durante la sacudida solo se pintaba el fondo (pantalla naranja).
// Se compara el brillo medio del frame (readPixels tras un render manual) con y sin disparo,
// y se comprueba que la matriz de la cámara es finita.
import { assert, waitFor } from '../lib.mjs';

let E, adv;

const frame = () => E(() => {
  const g = window.__game, r = g.renderer;
  g.camera.updateMatrixWorld();
  r.render(g.scene, g.camera);
  const gl = r.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let s = 0;
  for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return { lum: s / (w * h), finite: g.camera.matrixWorldInverse.elements.every(Number.isFinite) };
});

export default {
  name: 'Destello al disparar',
  waitState: 'menu',
  async setup({ page }) {
    E = (fn, a) => page.evaluate(fn, a);
    adv = (ms) => E((ms) => window.__adv(ms), ms);
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
    await E(() => window.__pad.reset());
    await E(() => window.__game.teleport(0.65, 14, 0));
    await adv(500);
  },
  cases: [
    {
      name: 'brillo medio del frame con y sin disparo (±6 %)',
      async run() {
        const base = await frame();
        assert.ok(base.finite, 'cámara finita en reposo');
        await E(() => window.__pad.trigger('RT', 1));
        let worst = 0;
        for (let i = 0; i < 8; i++) {
          await adv(17);
          const f = await frame();
          assert.ok(f.finite, `cámara finita en el frame ${i} del disparo`);
          worst = Math.max(worst, Math.abs(f.lum - base.lum) / base.lum);
        }
        await E(() => window.__pad.trigger('RT', 0));
        await adv(300);
        assert.ok(worst < 0.06, `variación de brillo al disparar ${(worst * 100).toFixed(1)} % (base ${base.lum.toFixed(1)})`);
      },
    },
    {
      name: 'sacudida de aterrizaje sin NaN',
      async run() {
        await E(() => window.__pad.down('Y')); await adv(80); await E(() => window.__pad.up('Y'));
        for (let i = 0; i < 90; i++) {
          await adv(17);
          if (i % 10 === 0) assert.ok((await frame()).finite, `cámara finita en el frame ${i} del salto`);
        }
      },
    },
  ],
};
