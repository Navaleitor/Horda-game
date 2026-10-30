# Fase 1a.2 — Veredicto de animación (animation-reviewer)

**Veredicto: APROBADO CON RESERVAS.** Sin defectos bloqueantes; 0 errores y 0 avisos de consola en toda la sesión.
Método: `node build.js --debug` + `?lowgfx`, loop parado y avanzado con `loop.stepN`, mando simulado `window.__pad`. Métricas por frame sobre los huesos (posición mundial) y capturas desde cámara lateral/frontal fija (cámara auxiliar, no altera el juego) y la cámara de juego. Script: `tests/anim/fase-1a2.mjs` (reproduce capturas y `datos.json`). Capturas: `docs/qa/animacion/fase-1a2/`.

## Tabla por área
| Área | Estado | Observaciones |
|---|---|---|
| Orientación del modelo (Xbot, color de clase) | OK | De espalda a la cámara en marcha, mochila de médico y articulaciones verdes correctas (`loc-run*.png`). |
| Idle / walk / jog / run | OK con reservas | Run a fondo 4,14 m/s (strafe 4,14; en recta 4,03 medio por la aceleración). Pie más bajo sin hundirse (tobillo ≥ 0,077 m). Deslizamiento mediano del pie apoyado: walk 0,08, run 0,26, strafe 0,25, jog 0,34 m/s (jog ≈ 10 %, sobre el objetivo ≤ 0,15). Ver D3. |
| Agacharse | PENDIENTE | No hay botón de agacharse en E-Day Default ni escenario que lo active; sin revisar. |
| Salto / caída / aterrizaje | OK | jump→fall→land→idle sin saltos (máx. 0,07 m/frame), pies ≥ 0,08 m. `loc-jump-air.png`. |
| Vault (barra 1 m) y trepar (bloque) | OK | Estados vault/climb→idle limpios; mano izq. se desprende del arma (lH–support 0,3–0,5 m, esperado). Saltos máx. 0,21 m/frame (vault) y 0,09 (climb). `loc-vault.png`, `loc-climb.png`. |
| Maroma (evade) | OK con reservas | Gira encogido hacia la dirección del stick y hacia delante si está quieto; pies ≥ 0,06 m. Ver D1. |
| Cobertura media (1 m) | OK | Agazapado, cabeza (hueso) a 0,70 m, bajo el borde; entrada `coverSlide→coverLow` sin saltos > 0,18 m. LT: se alza (cabeza 1,42 m) y apunta por encima del borde (`cov-media-asomar.png`). |
| Cobertura alta (2,2 m) | OK | De pie, espalda al muro, cabeza 1,52 m; LT asoma por el extremo (`peek`/aim) con mano de apoyo a 0,18 m del soporte. |
| SWAT / deslizar a la contigua | OK con reservas | `cover:swat` emitido, llega a la contigua (x −4,08 → −0,58) y termina en `coverLow`. Ver D2. |
| Apuntar / retroceso | OK | Manos sobre el arma: mano der.–grip 0,088 m y izq.–support 0,084 m constantes (desfase hueso-muñeca/empuñadura); en carrera ≤ 0,17 m. |
| Recarga normal / perfecta / fallida | OK | RB y 2º RB: `perfect` en zona, `failed` pronto; la mano izq. va al cargador (0,3–0,6 m, esperado). Sin saltos > 0,38 m/frame. |
| Cambio de arma (↓ pistola, ← rifle) | OK | Transición swap→none y arma final correcta; salto máx. 0,34 m/frame (descenso/subida del arma). |
| Melee rifle / pistola | OK | Pistola a una mano, izquierda suelta (`arm-melee-pistola.png`); el rifle conserva el IK. |

## Defectos
| ID | Sev. | Área / dueño | Descripción |
|---|---|---|---|
| D1 | Media | Maroma · `locomotion-animator` | Pop de un frame: un hueso de brazo (índice 20) salta 0,88 m respecto a la cadera en el frame ~32 (≈0,53 s) al pasar `evade`→`run` (vecinos 0,45–0,56 m/frame). Visible como tirón del brazo al recuperar el arma. |
| D2 | Media-baja | SWAT · `cover-animator` | Al terminar el SWAT (swat→coverLow, frames 24–30) el tobillo baja hasta −0,17 m bajo el suelo (hundimiento de pie). Además el cañón del rifle atraviesa la caja durante el giro (`cov-swat.png`). |
| D3 | Baja | Marcha · `locomotion-animator` | Deslizamiento del pie apoyado en jog/run/strafe (0,25–0,34 m/s mediano) sobre el umbral del checklist (≤ 0,15). La métrica es aproximada (pie más bajo entre frames consecutivos); recomendable revisar con la medición del rig. |
| D4 | Info | Cobertura | Cabeza a 0,70 m en media: oculta bajo el borde con margen (0,3 m); no hay asomo involuntario. Sin defecto. |

Pasos D1: `tp(-5,5,yaw π/2)`, LS adelante 150 ms, `A`; muestrear huesos 40 frames. D2: entrar en cobertura media (-5.45,11.5), LS derecha 1,8 s hasta el borde, pulsar `A` con el stick mantenido; muestrear huesos al final del SWAT.

## No cubierto
Agacharse (sin entrada), desfase `anim:cast:impact`/VFX (habilidades y enemigos son de fases posteriores), rendimiento con 4 personajes y 30 enemigos (suite 90 / `qa-tester`), legibilidad a distancia de la cámara de juego (solo `loc-run-juego.png`, `cov-media-juego.png`, `arm-apuntar-rifle-juego.png`: se leen bien).

## Cierre
Firma animation-reviewer: aprobado con reservas; D1 y D2 deberían corregirse antes de 1a.3 (no bloquean el cierre de 1a.2). Pendiente la firma de `qa-tester` y `game-architect`.
