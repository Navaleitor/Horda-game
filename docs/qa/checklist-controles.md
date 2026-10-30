# Checklist de regresión de controles (E-Day Default)

Dueño: `qa-tester`. Fuente: `docs/horda-gdd.md` §1 y `src/input/presets.js`.
Cualquier cambio de botón debe actualizar a la vez `presets.js`, el GDD §1 y esta tabla.

Leyenda de **Verificación**: `auto` = la cubre `tests/e2e/suites/10-controles.mjs` (mando simulado); `manual` = hay que probarla con un mando real; `auto+manual` = la suite cubre el estado y la sensación se revisa a mano.
Leyenda de **Estado**: `PASS` · `FAIL` · `SKIP` (sistema aún no implementado) · `—` (no aplica en esta fase) · `pendiente`.

Fase de referencia: **1a** (base jugable: menú, movimiento, cobertura, armas, dianas). Estado a fecha del último `node tests/e2e/run.mjs` (ver `docs/qa/fase-1a/resultados.json`).

## Combate

| Botón (índice) | Acción | Cómo se verifica | Verif. | Fase | Estado |
|---|---|---|---|---|---|
| LS (ejes 0,1) | Mover | `stick('LS',0,1)` 0,6 s → `player.move.mode ∈ walk/jog/run`, desplazamiento > 0,5 m; al soltar → `idle` | auto | 1a | pendiente |
| LS a media inclinación | Andar (`walk`) vs trotar | `stick('LS',0,0.4)` → `walk`; a fondo → `jog`/`run` | auto (TODO) | 1a | pendiente |
| RS (ejes 2,3) | Cámara | `stick('RS',1,0)` → `player.yaw`/cámara giran; sensibilidad e inversión con mando real | auto+manual | 1a | pendiente |
| L3 (10) | Sin función | LS a fondo + `press('L3')` → el modo sigue en `run` y la velocidad es 4,14 m/s | auto (humo 1a.1) | 1a.2 | ✅ |
| R3 (11) | Cambiar hombro | `press('R3')` → `player.shoulder` cambia de signo; la cámara cambia de lado | auto+manual | 1a | pendiente |
| A (0) | Cobertura media | frente a caja `low` + `press('A')` → `mode='cover'`, `cover.height='low'` | auto | 1a | pendiente |
| A (0) | Cobertura alta | frente a caja `high` + `press('A')` → `cover.height='high'` | auto | 1a | pendiente |
| A (0) + dirección | SWAT turn (hueco ≤ 1,5 m) | en borde de cobertura con hueco ≤ 1,5 m, LS lateral + A → evento `cover:swat`, acaba en la otra cobertura | auto (TODO posiciones) | 1a | pendiente |
| A (0) + dirección | Deslizar a cobertura contigua (hueco > 1,5 m) | en el extremo con hueco > 1,5 m, LS lateral + A → evento `cover:slide` | auto (TODO posiciones) | 1a | pendiente |
| A (0) en movimiento sin cobertura | Maroma | LS + `press('A')` sin cobertura a tiro → `mode='evade'` (maroma en la dirección del stick); quieto → nada | auto (humo 1a.1) | 1a.2 | ✅ |
| A (0) ×2 | Maroma (alias) | `doubleTap('A',120)` con LS lateral → `player:moveMode` con `mode='evade'` | auto (humo 1a.1) | 1a.2 | ✅ |
| A (0) con cobertura a tiro | Entrar corriendo, sin slide | a ≤ `cover.snapDistance` + `press('A')` → `coverSlide` a 4,14 m/s → `cover` | auto | 1a.2 | ✅ |
| LT (6) | Apuntar | `trigger('LT',1)` → `player.aiming=true`, zoom de cámara | auto+manual | 1a | pendiente |
| LT (6) en cobertura | Asomarse / apuntar por encima | en `cover` + LT → `cover.peeking` o `cover.aimingOver` | auto | 1a | pendiente |
| RT (7) | Disparar | LT+RT contra diana → `weapon.mag` baja y `hp` de la diana baja | auto | 1a | pendiente |
| RB (5) | Recargar | `press('RB')` con cargador incompleto → `weapon:reloadStart`, luego `weapon:reloaded` | auto | 1a | pendiente |
| RB (5) ×2 | Recarga activa | segundo RB dentro de `activeWindow` → `weapon:activeReload {result:'perfect'}`; fuera → `failed` (atasco) | auto (+caso failed TODO) | 1a | pendiente |
| B (1) | Melee | `press('B')` → evento `melee:swing`; cerca de diana → `melee:hit` | auto | 1a | pendiente |
| Y (3) | Saltar | `press('Y')` en abierto → `air` y vuelve al suelo | auto | 1a | pendiente |
| Y (3) | Saltar sobre cobertura / trepar | en cobertura `low` + Y → `vault`, termina al otro lado; muro alto → `climb` | auto (TODO) | 1a | pendiente |
| D-pad ← (14) | Rifle de asalto | `press('Left')` → `inventory.current=0`, `weapon.id='assaultRifle'` | auto | 1a | pendiente |
| D-pad → (15) | Arma comprada | Fase 1a: ranura vacía → no cambia de arma (o HUD "vacía") | auto | 1a | pendiente |
| D-pad ↓ (13) | Pistola | `press('Down')` → `inventory.current=2`, `weapon.id='pistol'` | auto | 1a | pendiente |
| D-pad ↓ (13) | Pistola de reparación (si comprada) | la reemplaza en la ranura 2 | auto | 2+ | — |
| D-pad ↑ (12) | Radial de comodines (mantener, RS elegir, soltar activa; tiempo al 50 %) | `hold('Up')` + `stick('RS',…)` + `up('Up')` | auto | 3+ | — |
| X (2) | Interactuar (fabricador, torreta, recoger) | prompt `X` + acción | auto | 2+ | — |
| X (2) mantener | Revivir aliado derribado | `hold('X', ms)` sobre aliado → revive | auto | 3+ | — |
| X (2) toque sobre fortificación | Radial de fortificación | — | auto | 2+ | — |
| LB (4) toque | Granada rápida | `press('LB',80)` → granada al punto de mira | auto | 2+ | — |
| LB (4) mantener | Tac-Com | `hold('LB',600)` → overlay activo; soltar → se cierra | auto | 2+ | — |
| View (8) mantener | Marcador | `hold('View',…)` | auto | 2+ | — |
| Menu (9) | Pausa / reanudar | `press('Menu')` → `state='paused'`, el jugador no se mueve con LS; otra vez → `playing` | auto | 1a | pendiente |

## Cargando fortificación (Fase 2+)

| Botón | Acción | Cómo se verifica | Verif. | Fase | Estado |
|---|---|---|---|---|---|
| LS | Mover más lento | velocidad < velocidad normal | auto | 2+ | — |
| RS | Apuntar el lugar | fantasma sigue la mira | auto+manual | 2+ | — |
| RT | Colocar (fantasma verde) | fortificación creada en `__game` | auto | 2+ | — |
| B | Soltar en el suelo | pieza en el suelo, recogible con X | auto | 2+ | — |
| RB / LB | Rotar ±45° | yaw del fantasma ±π/4 | auto | 2+ | — |
| Menu | Pausa | `state='paused'` | auto | 2+ | — |

## Menús

| Botón | Acción | Cómo se verifica | Verif. | Fase | Estado |
|---|---|---|---|---|---|
| A | Seleccionar / comprar / empezar partida | en el menú de inicio, A → `menu:start` y `state='playing'` | auto | 1a | pendiente |
| B | Atrás / cerrar | — | auto | 1a/2+ | pendiente |
| D-pad / LS | Navegar (LS con repetición) | la selección cambia | auto (TODO: lectura de selección) | 1a | pendiente |
| RB / LB | Pestaña → / ← | pestaña de la tienda cambia | auto | 2+ | — |

## Solo manual (sensación, con mando real)

- Deadzone del stick (sin deriva en reposo, respuesta progresiva).
- Sensibilidad/aceleración de la cámara con RS y al apuntar.
- Vibración (`input.rumble`) al disparar / recarga activa / melee. La suite solo comprueba que se llama (`__pad.rumbles`).
- Latencia percibida de A (cobertura) y del doble toque (maroma) — ventana `config.input.doubleTapWindow`.
- Cámara siempre en tercera persona, sin atravesar paredes al pegarse a cobertura.
