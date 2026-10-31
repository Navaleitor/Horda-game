# Notas de controls-camera-engineer

## Estado (Fase 1a.3)
- Movimiento: run 4,6 m/s, salto 7,6 m/s (cima ≈ 1,3 m, +50 %), maroma 7,8 m/s × 0,6 s ≈ 3,5 m.
- L3 = agacharse (acción `crouch`, teclado KeyZ). `movement.setCrouch(on, force)`; levantarse exige hueco
  (5 rayos verticales). Agachado: `mode='crouch'`, ≤ speed.crouch, `e.height = crouchHeight`, hitbox baja.
  Y/A levantan (y saltan / maroma); correr a fondo no. Cobertura (tryEnter) fuerza de pie. teleport/reset de pie.
- Evento `player:crouch { who, crouched }`; campo `entity.crouched` y `playerState().crouched`.
- Trepar en el aire: `tryAirLedge()` en locomotion cuando mode='air'; dirección = stick > velocidad > cara;
  queryLedge desde los pies actuales + tope `topY − sueloBajo ≤ player.climb.maxHeight` (rayo hacia abajo
  `player.airGrab.groundProbe`). Reusa tryLedge (vault/climb). Sin cambios en physics.
- Maroma → cobertura: cada paso de 'evade' llama cover.tryEnter(dir, cover.evadeSnapDistance=0.25, snapSpeed).
- rigParams.height en vault/climb = topY − from.y (traverse.js lo usa; antes llegaba null).

## Tests
- Humo 05: casos L3, maroma 3,5 m + salto ×1,5, trepar en el aire (bloque 2 m / barra / contenedor 2,6 m no),
  maroma→cobertura. tests/e2e/pendiente-1a3/10-controles.mjs: caso L3 actualizado.

## Pendientes
- Cámara agachado (offset más bajo) no implementada; HUD debe escuchar `player:crouch`.
- animation-reviewer: revisar climb/vault iniciados en el aire (raíz arranca a media altura) y crouch.
- Downed (player/downed.js), cargar pieza, contextos de input de Fase 1b+ sin empezar.
