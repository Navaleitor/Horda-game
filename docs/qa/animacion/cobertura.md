# QA animación — cobertura (cover-animator)

Checklist para `animation-reviewer` (capturas en cierre). Marcar tras revisar.

- [ ] Entrada: carrera → impacto con mano izquierda en la pared, compresión, giro hasta quedar de espalda (media y alta).
- [ ] Media (1 m): agazapado, cabeza bajo el borde (piel 0.84 m, mochila 0.93 m), sin clipping con la caja.
- [ ] Alta (2.2 m): de pie, espalda pegada, arma al pecho (muzzle arriba), sin clipping.
- [ ] Paso lateral en ambos sentidos, sin patinar (deslizamiento de pie apoyado < 0.2 m/s medido).
- [ ] LT en media: se alza y apunta por encima del borde; el cañón no baja del borde (también apuntando abajo).
- [ ] LT en alta: se asoma por el extremo (ambos lados), arma fuera de la caja, hombro del lado del borde.
- [ ] Disparo a ciegas (`setUpper('blindfire')`): media por encima del borde, alta por el extremo; cabeza oculta.
- [ ] SWAT turn y deslizamiento a la contigua: carrera agachada, giro al llegar sin dar la vuelta larga.
- [ ] Cambio de hombro al cambiar cover.side (arma ±0.11 m en x).

Medición reproducible: scripts de /tmp (no en el repo); `window.__game.player.rig.mem.cv` expone los escalares.
