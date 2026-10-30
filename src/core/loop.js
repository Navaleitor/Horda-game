// Bucle principal: simulación de paso fijo (60 Hz) + render interpolado. Dueño: game-architect.
//
// Por frame:
//   acumulador += frameDt (recortado a config.core.maxFrameDt)
//   mientras acumulador >= fixedDt y pasos < maxStepsPerFrame:
//     1) copia prevPos←pos y prevYaw←yaw de cada entidad
//     2) system.fixedUpdate(fixedDt) en orden de registro (solo alwaysRun si state !== 'playing')
//     3) time.tick++, time.now += fixedDt (solo avanza en 'playing')
//   alpha = acumulador / fixedDt
//   system.update(frameDt, alpha) en orden; renderer.render(scene, camera)

export function createLoop(game) {
  const cfg = game.config.core;
  const fixedDt = cfg.fixedDt;
  const maxSteps = cfg.maxStepsPerFrame;
  const maxFrameDt = cfg.maxFrameDt;

  let acc = 0;
  let last = -1;
  let rafId = 0;
  let running = false;
  const frameListeners = [];   // fn(frameDt) tras render (debug.js mide aquí)

  function snapshotEntities() {
    const ents = game.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.prevPos && e.pos) e.prevPos.copy(e.pos);
      if (e.yaw !== undefined) e.prevYaw = e.yaw;
    }
  }

  function step() {
    const playing = game.state === 'playing';
    snapshotEntities();
    const systems = game.systems;
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      if (s.fixedUpdate && (playing || s.alwaysRun)) s.fixedUpdate(fixedDt);
    }
    if (playing) game.time.now += fixedDt;
    game.time.tick++;
  }

  function frame(tMs) {
    rafId = requestAnimationFrame(frame);
    const t = tMs / 1000;
    let frameDt = last < 0 ? fixedDt : t - last;
    last = t;
    if (frameDt > maxFrameDt) frameDt = maxFrameDt;
    if (frameDt < 0) frameDt = 0;

    acc += frameDt;
    let steps = 0;
    while (acc >= fixedDt && steps < maxSteps) {
      step();
      acc -= fixedDt;
      steps++;
    }
    // Si llegamos al tope, descartamos el atraso para no entrar en espiral.
    if (steps >= maxSteps && acc >= fixedDt) acc = acc % fixedDt;

    const alpha = acc / fixedDt;
    const playing = game.state === 'playing';
    const systems = game.systems;
    for (let i = 0; i < systems.length; i++) {
      const s = systems[i];
      if (s.update && (playing || s.alwaysRun)) s.update(frameDt, alpha);
    }

    game.renderer.render(game.scene, game.camera);
    game.time.frame++;

    for (let i = 0; i < frameListeners.length; i++) frameListeners[i](frameDt);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = -1;
      acc = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
    /** Avanza n pasos fijos de forma síncrona (pruebas). */
    stepN(n = 1) { for (let i = 0; i < n; i++) step(); },
    onFrame(fn) { frameListeners.push(fn); },
    get running() { return running; },
    fixedDt,
  };
}

/** Utilidad de interpolación para el render: out = lerp(e.prevPos, e.pos, alpha). */
export function interpPos(e, alpha, out) {
  return out.lerpVectors(e.prevPos, e.pos, alpha);
}

/** Interpola yaw por el camino corto. */
export function interpYaw(e, alpha) {
  let d = e.yaw - e.prevYaw;
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return e.prevYaw + d * alpha;
}
