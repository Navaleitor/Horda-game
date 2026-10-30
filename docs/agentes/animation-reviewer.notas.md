# Notas animation-reviewer
Estado: Fase 1a.2 revisada, veredicto APROBADO CON RESERVAS (docs/qa/animacion/fase-1a2.md).
- Script reproducible: tests/anim/fase-1a2.mjs (capturas + datos.json en docs/qa/animacion/fase-1a2/).
- Técnica: loop parado, __adv + __sample (posiciones mundiales de huesos, grip/support); cámara auxiliar propia (no toca la del juego) tras llamar a renderer.render manualmente (el loop parado no renderiza).
- Trampa: no rotar la cámara del juego durante pruebas (el stick es relativo a la cámara). SWAT requiere mantener el stick al pulsar A. No hacer JSON.stringify de payloads de eventos (circulares).
- Pendientes: D1 pop del brazo al salir de la maroma (locomotion), D2 pie hundido -0,17 m tras SWAT y cañón en la caja (cover), D3 deslizamiento de pie en jog/run. Agacharse sin revisar (sin botón).
- Próximo: tras correcciones repetir y medir con rig; habilidades/enemigos en sus fases; rendimiento con suite 90.
