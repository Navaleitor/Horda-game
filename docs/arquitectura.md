# Arquitectura — Horda (three.js)

> Dueño: `game-architect`. Cualquier cambio de contrato pasa por este documento.

## 1. Arquitectura actual y deuda técnica
El repo empezó vacío (sin el prototipo 4v4). Deuda **esperable** del prototipo descrito (monolito `main.js`) que el diseño nuevo evita desde el día 1:
- Estado global mutable compartido entre render, input, IA y HUD → sin contratos, difícil de probar.
- Input leído directo de `navigator.getGamepads()` en múltiples sitios → no remapeable, sin edge-detection centralizada.
- Lógica atada a `requestAnimationFrame` con `dt` variable → física/IA inestables. Solución: **paso fijo 60 Hz** + render interpolado.
- Raycasts contra meshes con `THREE.Raycaster` → caro con muchos enemigos. Solución: colisión/raycast contra AABB del mapa con hash espacial.
- Modo 4v4 por rondas acoplado al loop → se sustituye por `GameMode` intercambiable (`HordeMode`).
- Sin ganchos de prueba → se añade `window.__game` (solo en build `--debug`) para QA.

## 2. Arquitectura modular (un solo HTML)
```
src/
  main.js                 bootstrap: crea Game, carga assets, arranca loop
  core/      loop.js (paso fijo + interpolación), events.js (bus pub/sub tipado),
             config.js (tablas de balance), rng.js, pool.js, debug.js (window.__game)
  input/     gamepad.js (polling, deadzones, edges, hold/tap/doble-tap),
             actions.js (acciones lógicas), presets.js (E-Day Default; futuros presets), keyboard.js (fallback dev)
  camera/    tpsCamera.js (hombro, apuntado, cobertura, colisión de cámara, shake)
  player/    playerController.js, movement.js (sprint/slide/evade/jump/vault), cover.js (detección y SWAT turns), loadout.js
  physics/   collision.js (cápsula cinemática vs AABB), spatialHash.js, raycast.js, projectiles.js, explosions.js
  anim/      characterRig.js (AnimationMixer + capas), ik.js (brazos/arma), proceduralPoses.js (cobertura, evade, muerte)
  ai/        navGrid.js (A* con costos), targeting.js (selección por utilidad), behaviors/ (grunt, runner, sniper, brute, exploder, boss), squad.js
  combat/    weapons.js (hitscan, recarga activa), damage.js, melee.js
  fortifications/ fortification.js (base: hp, nivel, desgaste, coste), barrier.js, mannedTurret.js, sentry.js, decoy.js, repairTool.js, buildSystem.js (fantasma/slots)
  waves/     waveTable.js, director.js (presupuesto y spawns), spawner.js
  economy/   wallet.js, prices.js
  hud/       hud.js, buildMenu.js (radial navegable), prompts.js, tacCom.js, scoreboard.js
  fx/        tracers.js, muzzle.js, lasers.js (shader emisivo), explosions.js, decals.js
  level/     levelLoader.js, maps/outpost.js (datos del mapa a mano), lighting.js
  assets/    models.js (glb embebidos), props/ (geometría procedural: armas, torretas, barreras, señuelo, fabricador)
  modes/     hordeMode.js (máquina de estados: Preparación → Oleada → Recompensa → …)
template.html   HUD DOM + pantalla de inicio + <script> inline
build.js        esbuild bundle → inyecta en template → breakout.html (loader dataurl para .glb)
tests/e2e/      Playwright + gamepad simulado
```
Contratos clave (documentados en `docs/arquitectura.md`, dueño: game-architect):
- Sistemas = objetos con `init(game)`, `fixedUpdate(dt)`, `update(dt, alpha)`, `dispose()`.
- Comunicación por `events` (`enemy:killed`, `points:changed`, `fort:damaged`, `wave:started`…) — los sistemas no se importan entre sí salvo `core`.
- `Damageable` (hp, team, `applyDamage`), `Targetable` (posición, `aggroWeight`, `isAlive`), `Buildable` (tipo, nivel, `upgradeCost`, `repairCostPerHp`).
- Todas las cifras de balance en `core/config.js`.


