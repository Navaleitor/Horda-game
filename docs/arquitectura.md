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
  player/    playerController.js, movement.js (evade=maroma/jump/vault), cover.js (detección y SWAT turns),
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


## 3. Contratos Fase 1a
> Vinculante para todos los agentes. Si algo no encaja, se pide el cambio a `game-architect`; no se improvisa en el código.

### 3.1 Reglas generales
- Todo son ES modules dentro de `src/`. Importables libremente: `three` (addons como `three/addons/...`), `src/core/**` y `src/assets/**` (fábricas de modelos y props; no son sistemas).
- **Un sistema no importa otro sistema.** Se comunica por `game.events` y por **servicios** (`game.provide(name, api)` / `game.service(name)`), documentados en §3.6.
- Cifras de balance/tuning **solo** en `src/core/config.js`. Hay una sección por agente; cada agente **añade** claves solo dentro de la suya con un Edit puntual (nunca reescribe el archivo).

  | Sección | Dueño |
  |---|---|
  | `core`, `debug` | game-architect |
  | `input`, `player`, `camera`, `cover` | controls-camera-engineer (`cover`: physics-engineer añade las claves de clasificación/geometría; controls las de comportamiento) |
  | `physics` | physics-engineer |
  | `weapons`, `activeReload`, `melee`, `classes`, `classOrder`, `difficulties`, `difficultyOrder`, `defaultDifficulty` | gameplay-programmer (`classes[id].color`: character-artist) |
  | `targets`, `level` | level-designer |
  | `anim` | animation-engineer (y animadores, con subclave por especialidad) |
  | `hud` | ui-hud-designer |
  | `fx` | vfx-artist |
- Los subagentes **no hacen commits**: los hace el coordinador.
- Sin allocaciones por frame en caminos calientes (`fixedUpdate`, `update`, `emit`, raycasts): reusar `Vector3` temporales a nivel de módulo y objetos de resultado.
- Unidades: metros, segundos, radianes. **Y arriba.** `yaw = 0` mira hacia **−Z**; yaw crece girando a la izquierda (mano derecha alrededor de +Y). `forward(yaw) = (−sin yaw, 0, −cos yaw)`; `right(yaw) = (cos yaw, 0, −sin yaw)`.
- Nada de `Math.random` en la simulación: usar `game.rng` (semilla en `config.core.seed`).

### 3.2 Objeto `game` (`src/core/game.js`)
```
game.events        // bus: on(type, fn) → off(), once(type, fn) → off(), off(type, fn), emit(type, payload)
game.config        // = import config from 'core/config.js'
game.renderer, game.scene
game.camera        // THREE.PerspectiveCamera; solo la mueve el sistema de cámara
game.state         // 'loading' | 'menu' | 'playing' | 'paused'
game.setState(s)   // emite 'game:state' { state, prev } (no emite si no cambia)
game.session       // { classId, difficulty } — lo fija core al recibir 'menu:start'
game.entities      // array de entidades vivas. game.addEntity(e) / game.removeEntity(e)
game.player        // entidad del jugador (null antes de 'menu:start'); la asigna player
game.provide(name, api) / game.service(name)   // service() lanza si no existe; game.hasService(name) para opcionales
game.time          // { now, tick, frame }
game.rng           // RNG con semilla (core/rng.js): next(), range(a,b), int(a,b), chance(p), pick(arr), signed()
game.loop          // { start, stop, stepN(n), onFrame(fn), fixedDt }
game.systems       // sistemas registrados, en orden
game.debug.register(name, fn|value)   // se expone como window.__game.<name> solo en --debug (game.debug.enabled)
```
- `time.now`: segundos de simulación; **solo avanza en `'playing'`** (la pausa lo congela). `time.tick`: n.º de pasos fijos ejecutados (avanza siempre). `time.frame`: n.º de frames renderizados.
- Interpolación: utilidades `interpPos(e, alpha, out)` e `interpYaw(e, alpha)` en `core/loop.js`.
- Utilidades: `core/pool.js` (`createPool(create, reset, initial)`, `createRing(size, create)`), `core/rng.js` (`createRng(seed)`).

### 3.3 Loop (`src/core/loop.js`)
- Paso fijo `config.core.fixedDt = 1/60`. Acumulador con tope de `maxStepsPerFrame = 5` pasos por frame; si se alcanza el tope se descarta el atraso (sin espiral). Un frame de más de `maxFrameDt = 0.25 s` se recorta. El reloj es `performance.now()`.
- **Por paso**: (1) para cada entidad, `prevPos.copy(pos)` y `prevYaw = yaw`; (2) `system.fixedUpdate(dt)` en orden de registro; (3) `time.tick++` (y `time.now += dt` si `'playing'`).
- **Por frame**: `system.update(frameDt, alpha)` en orden, `renderer.render(scene, camera)`, `time.frame++`. `alpha = acumulador / fixedDt ∈ [0,1)`.
- Sistemas con `alwaysRun: true` (input, camera, hud, debug) corren en todos los estados; el resto solo en `'playing'`.
- Render interpolado: el `object3d` de cada entidad móvil se coloca en `update` con `lerp(prevPos, pos, alpha)` y el yaw interpolado. La simulación nunca lee `object3d` para decidir.

### 3.4 Interfaz de sistema
```js
export default function createXxx() {
  return { name, alwaysRun?, init(game), fixedUpdate(dt), update(dt, alpha), dispose() };
}
```
`init` puede ser `async` (el bootstrap hace `await` en orden). Un sistema que provee servicio llama a `game.provide` dentro de `init`, de modo que los registrados después ya lo encuentran.

### 3.5 Orden de registro (`src/main.js`)
| # | Módulo | Servicio | Dueño |
|---|---|---|---|
| 1 | `input/index.js` | `input` | controls-camera-engineer |
| 2 | `physics/index.js` | `physics` | physics-engineer |
| 3 | `assets/models.js` — **no es sistema**: `game.provide('models', await loadModels())` | `models` | character-artist |
| 4 | `level/index.js` | `level` | level-designer |
| 5 | `anim/core/index.js` | `anim` | animation-engineer |
| 6 | `fx/index.js` | — | vfx-artist |
| 7 | `player/index.js` (controlador, movimiento, cobertura, inventario) | — | controls-camera-engineer |
| 8 | `combat/index.js` (hitscan, recarga activa, melee, daño) | — | gameplay-programmer |
| 9 | `camera/index.js` | `camera` | controls-camera-engineer |
| 10 | `hud/index.js` (menú de inicio, HUD, pausa, prompts) | — | ui-hud-designer |
| 11 | `core/debug.js` (solo `--debug`) | — | game-architect |

Cada dueño exporta `default` desde su `index.js`. Los stubs iniciales llevan `// STUB: lo reemplaza <agente>`; al reemplazarlos se mantiene la interfaz pública.

**Arranque y estados** (main.js): estado inicial `'loading'` → tras registrar todo, `'menu'` y arranca el loop.
- `menu:start`: core fija `game.session` **antes** de que ningún sistema reciba el evento (listener registrado antes de los `init`) y pasa a `'playing'` **después** de que todos lo hayan procesado (listener registrado tras los `init`). Así player ya ha hecho spawn cuando llega `game:state {state:'playing'}`.
- `game:pauseToggle`: `'playing'` ↔ `'paused'`. Lo emite **hud** (es `alwaysRun`, así que también puede despausar; player no corre en pausa). Player no lo emite para evitar dobles toggles con el botón Menu.
- Errores de carga: se muestran en `#boot` y en consola.

### 3.6 Entidades
```
Entity {
  id, kind: 'player'|'target'|…, team: 'player'|'neutral'|'enemy',
  pos, prevPos, vel (Vector3), yaw, prevYaw,
  hp, maxHp, alive, applyDamage(amount, info) → { killed }       // Damageable
  hitboxes: [{ part:'head'|'body', min:Vector3, max:Vector3 }]  // en mundo; las actualiza el dueño de la entidad cada paso
  object3d                                                      // raíz visual
}
```
`pos` es la posición de los **pies**. `info` de `applyDamage` = `{ source, part, point, weaponId? }`.

Jugador (dueño controls-camera-engineer) añade:
```
classId, radius, height (cápsula), grounded,
move:   { mode:'idle'|'walk'|'jog'|'run'|'crouch'|'air'|'evade'|'vault'|'climb'|'cover'|'swat'|'coverSlide', speed, dir }
cover:  null | { height:'low'|'high', side:-1|1, peeking:bool, aimingOver:bool, info (de physics.queryCover) }
aiming: bool, shoulder: 1 (derecho) | -1 (izquierdo)
intent: { fire, firePressed, reloadPressed, meleePressed, aim }   // lo escribe player cada paso; lo lee combat
inventory: { slots: ['assaultRifle', null, 'pistol'], current: 0 } // D-pad ←/→ alterna 0/1, ↓ = 2
weapon: { id, mag, reserve, magSize, reloading, reloadT, reloadDur, activeWindow:[a,b], activeTried, jammedT, buffT, swapT, meleeT }  // lo mantiene combat
ammo:   { [weaponId]: { mag, reserve } }                           // munición por arma; la mantiene combat
rig     // devuelto por anim.createRig
```
- `player` decide el slot actual; al cambiarlo emite `weapon:switchRequest { who, slot, weaponId }`. `combat` gestiona `entity.weapon` y `entity.ammo` y emite `weapon:switched`.
- Ranura vacía (slot 1, sin arma comprada): seleccionarla no cambia el arma actual (opcionalmente el HUD muestra "vacía"); nunca se dispara con ella. *(Detalle pendiente de diseño, ver nota al pie.)*
- Escritura: `pos/vel/yaw/move/cover/aiming/shoulder/intent/inventory` → player; `weapon/ammo` → combat; `hp/alive` → `applyDamage` del dueño; `rig` → player lo crea con `anim.createRig`.

### 3.7 Servicios
#### `input` (controls-camera-engineer)
```
input.down(action) / pressed(action) / released(action)   // flancos por paso fijo
input.heldTime(action) (s), input.doubleTap(action)       // dos pulsaciones dentro de config.input.doubleTapWindow
input.axis('move') → {x,y}   input.axis('look') → {x,y}   // deadzone radial aplicada; y+ = adelante (move) / arriba (look). Objeto reutilizado: no guardarlo
input.device → 'gamepad' | 'keyboard'
input.rumble(strong, weak, ms)
```
Acciones (`input/presets.js`, E-Day Default, índices standard): `cover` (A 0) · `melee` (B 1) · `interact` (X 2) · `jump` (Y 3) · `lb` (4) · `reload` (RB 5) · `aim` (LT 6) · `fire` (RT 7) · `view` (8) · `pause` (Menu 9) · `shoulder` (R3 11) · `dpadUp` (12) · `dpadDown` (13) · `dpadLeft` (14) · `dpadRight` (15).
Menú: `uiConfirm` (A) · `uiBack` (B) · `uiUp/uiDown/uiLeft/uiRight` (D-pad y LS con repetición, `config.input.menuRepeat*`).
Teclado (respaldo de desarrollo): WASD mover · ratón mirar (pointer lock) · Espacio cobertura · C saltar · F melee · R recargar · clic der. apuntar · clic izq. disparar · Q hombro · 1/2/3 armas · Esc pausa · Enter confirmar.

#### `physics` (physics-engineer)
```
physics.addBox({ min:[x,y,z], max:[x,y,z], tags:['cover','low'|'high','wall','floor',…] }) → id   // estático
physics.addEntity(entity) / removeEntity(entity)        // hitboxes dinámicas (dianas)
physics.moveCapsule(cap, delta) → { grounded, hitWall, wallNormal }
    // cap = { pos (pies), radius, height }; muta cap.pos; AABB con sliding y step-up (config.physics.stepHeight)
physics.raycast(origin, dir, maxDist, { ignore?: entity, entities?: true })
    → null | { point, normal, distance, entity|null, part:'head'|'body'|null, boxId|null }
physics.queryCover(pos, dir, maxDist) → null | { boxId, height:'low'|'high', topY, normal (sale de la cobertura hacia el jugador),
    point (anclaje a la distancia del radio), tangent, tMin, tMax, t, atLeftEdge, atRightEdge }
physics.coverSlide(info, side, pos) → { pos, atEdge }    // limita el movimiento por el borde
physics.queryAdjacentCover(info, side, maxDist) → info | null   // cobertura contigua (deslizar)
physics.querySwat(info, side, maxGap) → info | null             // cobertura al otro lado del hueco (SWAT turn)
physics.queryLedge(pos, forward) → null | { kind:'vault'|'climb', topY, landPos }
```
Los objetos devueltos pueden ser reutilizados por physics entre llamadas: copiar lo que se quiera conservar.

#### `models` (character-artist, `src/assets/models.js`)
```
await loadModels()   // decodifica Soldier.glb embebido (import url from '../../assets/Soldier.glb' → data URL)
models.createSoldier(classId) → { root (Object3D), skinned, animations (clips Idle/Walk/Run…), bones (map por nombre),
                                  anchors: { rightHand, leftHand, head, spine, back } }
```
Variante por clase: tinte/accesorio según `config.classes[classId]`.

#### props (weapons-props-artist, `src/assets/props/`)
`createAssaultRifle()`, `createPistol()` → `{ root, muzzle (Object3D), grip, support }`; `createTarget()` → `{ root, head, body, setDown(t 0..1) }`. Geometría procedural ligera, materiales compartidos. No son servicio: se importan directamente.

#### `level` (level-designer)
Crea el blockout desde `level/maps/outpost.js` (`boxes[]`, `spawns[]`, `routes[]`, `barrierSlots[]`, `buildZones[]`, `turretPads[]`, `fabricator`, `playerStart`, `targets[]`), lo registra en physics, crea la iluminación (`level/lighting.js`) y las dianas (`level/targets.js`: entidades Damageable que caen al morir y se levantan tras `config.targets.respawn`). Marcadores de fabricador/slots/zonas solo visuales (debug).
`level.data`, `level.playerStart → { pos:[x,y,z], yaw }`.

#### `anim` (animation-engineer)
```
anim.createRig(entity, soldier) → rig
rig.setState(state, params)    // cuerpo completo/piernas: idle, walk, jog, run, crouch, jump, fall, land, climb, vault,
                               // evade (maroma), coverLow, coverHigh, peek, swat, coverSlide…
rig.setUpper(state, params)    // capa de torso/armas: aim, fire, reload, activeReload, swap, melee, none
rig.setAim(yawOffset, pitch)   // torso hacia la mira
rig.attachWeapon(propRoot, anchors)
anim.registerProvider(states[], provider)   // los animadores especialistas registran sus poses
```
El sistema de animación escucha `weapon:*` / `melee:*` filtrando por `who === entity` para la capa de torso; player llama a `setState` según `entity.move` / `entity.cover`.

#### `camera` (controls-camera-engineer)
`camera.getAimRay() → { origin, dir }` (desde el centro de la cámara; objeto reutilizado), `camera.shake(amp, dur)`. Tercera persona siempre; hombro según `entity.shoulder`; zoom al apuntar; offsets de cobertura; colisión de cámara con `physics.raycast`.

### 3.8 Eventos Fase 1a
| Evento | Payload | Emite → escuchan |
|---|---|---|
| `game:state` | `{ state, prev }` | core → todos |
| `view:resize` | `{ width, height }` | core → camera, hud |
| `menu:start` | `{ classId, difficulty }` | hud → core (session y luego state=playing), player (spawn con clase) |
| `game:pauseToggle` | `{}` | hud (botón Menu / Esc) → core |
| `player:spawned` | `{ entity }` | player → camera, hud, combat |
| `player:moveMode` | `{ who, mode, prev }` | player → anim, hud |
| `player:crouch` | `{ who, crouched }` | player (L3; Y/A/cobertura levantan) → hud (indicador) |
| `cover:enter` / `cover:exit` | `{ who, height, side }` | player → camera, anim, hud |
| `cover:swat` / `cover:slide` | `{ who, from, to }` | player → anim, camera |
| `player:shoulder` | `{ who, shoulder }` | player → camera, anim |
| `weapon:switchRequest` | `{ who, slot, weaponId }` | player → combat |
| `weapon:swapStart` | `{ who, weaponId, slot, duration }` (cambio aceptado; empieza el gesto) | combat → anim |
| `weapon:switched` | `{ who, weaponId, slot }` | combat → anim, hud |
| `weapon:fired` | `{ who, weaponId, origin, dir, hit }` | combat → fx, anim, camera, hud |
| `weapon:ammo` | `{ who, weaponId, mag, reserve, magSize }` | combat → hud |
| `weapon:reloadStart` | `{ who, weaponId, duration, activeWindow:[a,b] }` (fracciones 0..1) | combat → hud, anim |
| `weapon:activeReload` | `{ who, result:'perfect'\|'good'\|'failed' }` | combat → hud, anim, fx |
| `weapon:reloaded` | `{ who, weaponId }` | combat → hud, anim |
| `weapon:empty` | `{ who, weaponId }` | combat → hud |
| `weapon:reloadCancel` | `{ who, weaponId, reason:'melee'\|'swap' }` | combat → hud, anim |
| `target:down` / `target:up` | `{ target, by?, part?, weaponId? }` | level → hud, qa |
| `melee:swing` / `melee:hit` | `{ who, target?, point? }` | combat → anim, fx |
| `damage:dealt` | `{ source, target, amount, part, point, killed }` | combat → hud (hitmarker), level (dianas) |
| `fx:spawn` | `{ type:'tracer'\|'muzzle'\|'impact'\|'spark', pos, dir (en impact: normal), end, color?, decal? }` | cualquiera → fx |
| `prompt:show` / `prompt:hide` | `{ id, button:'A'\|'B'\|'X'\|'Y'\|'LB'\|'RB'\|'LT'\|'RT'\|'L3'\|'R3'\|…, text }` | player → hud |
| `anim:footstep` / `anim:reload:insert` | `{ who }` | anim → fx/audio |

Reglas de payload: los `Vector3` de un payload (`origin`, `dir`, `point`, `pos`, `end`…) pueden ser temporales reutilizados por el emisor; el receptor que quiera guardarlos **copia** (`v.clone()` fuera del camino caliente, o `.copy()` a uno propio). El bus no aloca en `emit`; un listener puede hacer `off` durante el emit sin problemas.

### 3.9 Build y pruebas
- `node build.js` → `horda.html` (minificado, `__DEBUG__ = false`; el código de debug se elimina). `node build.js --debug` → `horda-debug.html` (sin minificar, `__DEBUG__ = true`). Formato IIFE, `target es2020`, sin sourcemap. Loader `dataurl` para `.glb/.gltf/.png/.jpg`. El JS se inyecta en `template.html` en el marcador `<!--BUNDLE-->` (se escapan `</script` y `<!--`). El build imprime tamaño y las 5 entradas más pesadas.
- `template.html`: `#app` (canvas), `#ui-root` (el HUD inyecta aquí su DOM y CSS desde JS; `pointer-events: none` por defecto, el HUD lo activa en sus paneles), `#boot` (mensaje de carga/errores, lo gestiona main.js).
- `window.__game` (solo `--debug`): el objeto game + `stats() → { fpsAvg, fpsP5, drawCalls, triangles, geometries, textures, frames, tick, samples, state }` (ventana de `config.debug.statsWindow` frames medidos con `performance.now()`; `fpsP5` = FPS del frame en el percentil 95 de duración) + todo lo registrado con `game.debug.register` (p. ej. `teleport(x, z, yaw)`).
- `scripts/smoke.mjs` (game-architect): humo rápido sobre `horda-debug.html` (0 errores de consola, `stats()`, Enter → `'playing'`); `node scripts/smoke.mjs horda.html` comprueba solo el arranque del release.
- Mando simulado (`tests/e2e/gamepad-mock.js`, `addInitScript`, dueño qa-tester): `__pad.press(btn, ms=80)`, `__pad.hold(btn, ms)`, `__pad.down(btn)`, `__pad.up(btn)`, `__pad.stick('LS'|'RS', x, y)`, `__pad.trigger('LT'|'RT', v)`. Nombres Xbox: A B X Y LB RB LT RT View Menu L3 R3 Up Down Left Right.
- En Chromium headless usar `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. El rAF headless tiene parones: los FPS de QA son orientativos, el loop recorta frames > 0.25 s.

### 3.10 Pendiente de diseño (no técnico)
- Ranura vacía (slot 1): ¿no hace nada o muestra "vacía" en el HUD?
- Resultado `'good'` de la recarga activa: el GDD §7 solo define perfecta y fallida. Provisional en config: `good` acelera la recarga sin bonus de daño.
- Multiplicador de headshot del rifle y la pistola, daño melee y munición de reserva: el GDD no los fija; valores *(prov.)* en `config.js`.
