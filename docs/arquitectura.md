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
  player/    playerController.js, movement.js (sprint/slide/evade/jump/vault), cover.js (detección y SWAT turns),
             inventory.js (ranuras D-pad, granada, pieza cargada), downed.js (derribado/revivir/muerte)
  physics/   collision.js (cápsula cinemática vs AABB), spatialHash.js, raycast.js, projectiles.js, explosions.js
  anim/      core/ (characterRig.js: mixer + capas + máquina de estados, ik.js)   ← animation-engineer
             locomotion/ · cover/ · weapons/ · abilities/ · enemies/           ← animadores especialistas
  ai/        navGrid.js (A* con costos), targeting.js (selección por utilidad), behaviors/ (grunt, runner, sniper, brute, exploder, boss),
             squad.js (bots espejo: arma de clase, comodines, revivir, seguir/defender)
  combat/    weapons.js (hitscan, recarga activa), grenades.js, damage.js, melee.js
  classes/   classes.js (4 clases), passives.js (P1–P4, rangos 1–5), mystics.js (comodines, cargas, cooldown), mirror.js (reflejo en bots)
  fortifications/ fortification.js (base: hp, nivel, desgaste, coste), barrier.js, mannedTurret.js, sentry.js, decoy.js, repairTool.js,
             carry.js (cargar/soltar/colocar), buildSystem.js (fantasma/slots, opciones del radial de fortificación)
  waves/     waveTable.js, director.js (presupuesto y spawns), spawner.js
  economy/   wallet.js (bolsa de equipo), prices.js, shop.js (pestañas del fabricador), unlocks.js (desbloqueo de nivel por tipo)
  hud/       hud.js, shopMenu.js (pestañas), radial.js (comodines ↑), fortRadial.js (radial de fortificación X), prompts.js, tacCom.js, scoreboard.js, startMenu.js (clase + dificultad)
  fx/        tracers.js, muzzle.js, lasers.js (shader emisivo), explosions.js, decals.js
  level/     levelLoader.js, maps/outpost.js (datos del mapa a mano), lighting.js
  assets/    models.js (glb embebidos), props/ (geometría procedural: armas, torretas, barreras, señuelo, fabricador)
  modes/     hordeMode.js (máquina de estados: Preparación → Oleada → Recompensa → …)
template.html   esqueleto (#app, #ui-root, #boot) + marcador <!--BUNDLE--> (el HUD inyecta su DOM/CSS desde JS)
build.js        esbuild bundle → inyecta en template → horda.html (loader dataurl para .glb)
tests/e2e/      Playwright + gamepad simulado
tests/anim/     capturas por estado/transición para revisión de animación
```
Contratos clave (documentados en `docs/arquitectura.md`, dueño: game-architect):
- Sistemas = objetos con `init(game)`, `fixedUpdate(dt)`, `update(dt, alpha)`, `dispose()`.
- Comunicación por `events` — los sistemas no se importan entre sí salvo `core`.
- `Damageable` (hp, team, `applyDamage`), `Targetable` (posición, `aggroWeight`, `isAlive`, `isVisible`), `Buildable` (tipo, nivel, `upgradeCost`, `repairCostPerHp`), `Carryable` (pieza en manos).
- Todas las cifras de balance en `core/config.js`.

### Catálogo inicial de eventos
| Evento | Payload | Emite → escuchan |
|---|---|---|
| `enemy:killed` | `{ enemy, killer, headshot, melee }` | combat → economy, hud, waves |
| `points:changed` | `{ total, delta, reason }` | economy → hud |
| `wave:started` / `wave:ended` | `{ n, boss }` | modes → hud, ai, fx |
| `player:downed` / `player:revived` / `player:died` | `{ who, by? }` | player/ai → classes, hud, anim |
| `shop:purchased` | `{ item, cost, buyer }` | economy → classes (mirror), fortifications, player |
| `unlock:bought` | `{ fortType, level }` | economy → fortifications, hud |
| `mystic:used` | `{ id, who, pos }` | classes → fx, anim, ai, hud |
| `fort:pickedUp` / `fort:placed` / `fort:dropped` | `{ fort, who, pos, rot }` | fortifications → hud, ai (navGrid) |
| `fort:damaged` / `fort:destroyed` / `fort:upgraded` | `{ fort, hp, level }` | fortifications → hud, ai, fx |
| `build:radialOptions` | `{ fort, options: [{ id, enabled, reason, cost }] }` | fortifications → hud |
| `anim:cast:impact` | `{ id, who }` | anim → fx, classes (sincroniza efecto con el gesto) |
| `fx:spawn` | `{ type, pos, dir }` | cualquiera → fx |


