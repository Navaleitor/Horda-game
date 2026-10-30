# Checklist de locomoción (locomotion-animator)

Proveedores: `src/anim/locomotion/` · cifras: `config.anim.locomotion`. Estados cuerpo: idle walk jog run crouch jump fall land vault climb evade.
Verificación numérica (sin capturas) con Playwright + `window.__game.anim.rigOf(player)`: ver "Cómo medir".

## Marcha (sin patinaje)
- [ ] Walk 1,6 / jog 3,4 / run 4,14 m/s: sesgo del pie apoyado ≤ 0,15 m/s (≤ 7 %) y sin hundir pies (tobillo ≥ 0,08 m).
- [ ] Blend walk→run continuo entre 1,75 y 3,1 m/s (sin saltos de pose); strafe y retroceso giran cadera ≤ 70°.
- [ ] `anim:footstep` alterna pie izq./der. a la cadencia (no con speed < 0,5).
- [ ] Arranque: tronco hacia delante; frenada: contrapeso hacia atrás; curvas a ≥ 1,6 m/s: alabeo hacia dentro (≤ 0,16 rad).
- [ ] Giro en el sitio (yaw > 1,3 rad/s con el cuerpo quieto): pasos del ciclo Walk.

## Postura
- [ ] Agachado: cadera −0,40 m, rodillas flexionadas, torso inclinado, pies al suelo (min dedo ≥ −0,02 m) y transición suave pie↔agachado (0,2 s).
- [ ] Salto: despegue estirado y luego piernas recogidas (más zancada cuanto más rápido); caída en bucle; aterrizaje: cadera baja 0,10 (suave) – 0,40 m (fuerte) según velocidad de caída, pies sin hundirse.

## Acciones
- [ ] Maroma (0,45 s, 4 direcciones): giro 360° encogido hacia la dirección del movimiento, mínimo Y de huesos ≥ −0,03 m durante todo el gesto, termina de pie con tronco adelantado y pies plantados; arma suelta del IK a la espalda durante el giro.
- [ ] Vault (1 m): cadera sigue el borde (+0,46 m), mano izq. apoyada sobre la cobertura, piernas recogidas por encima (centro de tobillos ≥ borde), aterriza de pie.
- [ ] Trepar (2,2 m): ambas manos al borde (error medio ≈ 0,15 m), rodillas alternas, encorvado al llegar arriba, incorporación al avanzar.
- [ ] Sin allocaciones por frame (curvas hoisted; sin `new` en `update`).

## Cómo medir
`node build.js --debug`; abrir `horda-debug.html`, emitir `menu:start`, `g.loop.stop()`, `rig = g.anim.rigOf(g.player)`, `rig.autoState = false`, `rig.setState(estado, params)` y avanzar con `rig.update(1/60)`; leer `rig.bones[rig.boneIndex.lFoot]` en espacio de personaje. Trampa: no usar `rig.clip(n, 1, 0)` (clip congelado ⇒ los aditivos se acumulan); usar rate ≥ 0,05.
