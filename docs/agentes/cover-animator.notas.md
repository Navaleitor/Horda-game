# cover-animator — notas (Fase 1a.2)

Estado: poses de cobertura listas y verificadas con números (sin capturas). Falta validación visual por `animation-reviewer`.

## Qué hay
- `src/anim/cover/{index,poses,legs}.js`. Config en `config.anim.cover` (geometría de Idle del Xbot, poses por altura, entrada, paso, dash, ciego).
- Estados: coverLow, coverHigh, peek, swat, coverSlide (cuerpo) y blindfire (torso).

## Decisiones técnicas
- Marco de la pared: +X derecha del jugador, −Z hacia la pared. La raíz mira a la pared (lo fija el controlador); el cuerpo se gira π con la cadera (espalda a la pared) y al asomarse vuelve a mirar a la mira. ψ = yaw pared − yaw raíz convierte offsets (peek con cámara oblicua).
- `rig.plantFeet` no sirve con el cuerpo girado (polo de rodilla fijo a −Z): IK analítico propio (legs.js) con rigs.rotAxis sobre Idle. Pasos con fase por distancia (cero patinaje) + compensación del filtro poseSmoothing (objetivo = ideal + τ·derivada).
- Escalares compartidos en `rig.mem.cv` (agazapado, asomado, giro, paso…): coverLow/High/peek son la misma función; solo avanza el proveedor con rig.w ≥ 0.5.
- Velocidad lateral medida de la posición interpolada de la raíz (move.speed vale 0 en cobertura y en SWAT).
- Mochila de espalda: se mide su profundidad (gearDepth) y se descuenta de `back`.
- Guardia del cañón en peek bajo: sube el cuerpo si apuntas hacia abajo (peekClear/peekLiftMax).
- Cambio de hombro: cover.side → cv.ws; el arma pasa al otro hombro (la mano de gatillo sigue siendo la derecha: el rig solo tiene ese agarre).

## Medidas (Xbot, medic)
- Cabeza (piel) baja 0.84, mochila 0.93 < 1.0; alta 1.73. Peek bajo 1.62 (cañón ≥ 1.12). Holgura pared: 0.00–0.01.

## Pendiente / riesgos
- Apuntar hacia el interior de una caja desde el extremo (cámara a lo largo de la pared) atraviesa la caja: límite de cámara/controlador.
- Revisión visual (capturas) en el cierre; ajustar `config.anim.cover` si hace falta.
- blindfire: nadie lo pide aún (playerController); listo con `rig.setUpper('blindfire')`.
