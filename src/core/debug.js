// Sistema de depuración (solo en builds --debug). Dueño: game-architect.
// Cuelga window.__game = game y añade:
//   stats() → { fpsAvg, fpsP5, drawCalls, triangles, frames, tick, state }
//   lo registrado por cada agente con game.debug.register(name, fn|value).

/* global __DEBUG__ */

export default function createDebug() {
  let game = null;
  let n = 0;
  let samples = null;   // ring de frameDt (s)
  let head = 0;
  let count = 0;
  let sortBuf = null;
  let lastTime = -1;

  function stats() {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += samples[i];
    const avgDt = count ? sum / count : 0;
    // P5 de FPS = FPS del frame en el percentil 95 de duración.
    for (let i = 0; i < count; i++) sortBuf[i] = samples[i];
    const view = sortBuf.subarray(0, count);
    view.sort();
    const p95dt = count ? view[Math.min(count - 1, Math.floor(count * 0.95))] : 0;
    const info = game.renderer.info;
    return {
      fpsAvg: avgDt > 0 ? +(1 / avgDt).toFixed(1) : 0,
      fpsP5: p95dt > 0 ? +(1 / p95dt).toFixed(1) : 0,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      frames: game.time.frame,
      tick: game.time.tick,
      samples: count,
      state: game.state,
    };
  }

  function attach() {
    if (typeof window === 'undefined') return;
    window.__game = game;
    game.stats = stats;
    for (const [name, value] of game.debug.entries) game[name] = value;
    // Registros posteriores también se exponen.
    const origRegister = game.debug.register;
    game.debug.register = (name, value) => {
      origRegister(name, value);
      game[name] = value;
    };
  }

  return {
    name: 'debug',
    alwaysRun: true,
    init(g) {
      game = g;
      n = g.config.debug.statsWindow;
      samples = new Float32Array(n);
      sortBuf = new Float32Array(n);
      if (__DEBUG__) attach();
    },
    fixedUpdate() {},
    update() {
      // Medimos con performance.now() (no con el dt recortado del loop) para FPS reales.
      const t = performance.now() / 1000;
      if (lastTime >= 0) {
        samples[head] = t - lastTime;
        head = (head + 1) % n;
        if (count < n) count++;
      }
      lastTime = t;
    },
    dispose() {
      if (typeof window !== 'undefined' && window.__game === game) delete window.__game;
    },
  };
}
