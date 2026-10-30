// Servicio 'camera' (docs/arquitectura.md §3.7). Dueño: controls-camera-engineer.
//   camera.getAimRay() → { origin, dir }   (objeto reutilizado; desde el eje de la cámara)
//   camera.shake(amp, dur)                 (amp en radianes de sacudida rotacional)
// Extras (lectura para player/QA): camera.yaw, camera.pitch, camera.setYawPitch(yaw, pitch), camera.snap().
// Sistema alwaysRun: en 'menu' hace una toma lenta del nivel; en 'playing' sigue al jugador;
// en 'paused' congela la pose. Siempre tercera persona.

import { createTpsCamera } from './tpsCamera.js';

export default function create() {
  let game = null;
  let tps = null;
  let player = null;
  const offs = [];

  const api = {
    getAimRay() { return tps.getAimRay(); },
    shake(amp, dur) { tps.shake(amp, dur); },
    get yaw() { return tps.state.yaw; },
    get pitch() { return tps.state.pitch; },
    setYawPitch(yaw, pitch) { tps.setYawPitch(yaw, pitch); },
    /** Recoloca la cámara detrás del jugador sin suavizado (spawn, teleport). */
    snap() { if (player) tps.follow(player, 0, 1); },
  };

  return {
    name: 'camera',
    alwaysRun: true,
    init(g) {
      game = g;
      tps = createTpsCamera(g);
      const C = g.config.camera;
      offs.push(g.events.on('player:spawned', ({ entity }) => {
        player = entity;
        tps.setYawPitch(entity.yaw, C.spawnPitch);
        tps.follow(entity, 0, 1);
      }));
      offs.push(g.events.on('weapon:fired', (e) => {
        if (player && e.who === player) tps.shake(C.fireShake.amp, C.fireShake.dur);
      }));
      offs.push(g.events.on('melee:hit', (e) => {
        if (player && e.who === player) tps.shake(C.meleeShake.amp, C.meleeShake.dur);
      }));
      offs.push(g.events.on('game:state', ({ state }) => {
        if (state === 'menu') player = null;
      }));
      g.provide('camera', api);
      if (g.debug.enabled) {
        g.debug.register('cameraState', () => {
          const s = tps.state;
          const c = g.camera;
          return {
            yaw: s.yaw, pitch: s.pitch, fov: c.fov, side: s.side, preset: s.preset, collided: s.collided,
            offset: [s.off.x, s.off.y, s.off.z], distance: s.len,
            pos: [c.position.x, c.position.y, c.position.z],
          };
        });
        g.debug.register('setCamera', (yaw, pitch) => tps.setYawPitch(yaw, pitch));
      }
    },
    fixedUpdate(dt) {},
    update(dt, alpha) {
      const p = player || game.player;
      if (game.state === 'playing' && p) { player = p; tps.follow(p, dt, alpha); }
      else if (game.state === 'menu' || game.state === 'loading' || !p) tps.menuShot(dt);
      // 'paused': se conserva la última pose.
    },
    dispose() { for (const off of offs) off(); offs.length = 0; },
  };
}
