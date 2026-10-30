# Notas de locomotion-animator

Estado (fase 1a.2): proveedores completos en `src/anim/locomotion/` (common, gait, air, evade, traverse). FALTA VALIDAR por animation-reviewer (capturas).

Decisiones técnicas
- Cadencia: `common.loco()` llama dos veces a `rig.locomotion` (Walk puro y Run puro, velocidades ficticias) para fijar los ciclos/s = v / (contactSpeed × duración). `contactSpeed.run` medido 3,65 m/s (el núcleo mide 2,74 y haría patinar ~25 %).
- Un clip a rate 0 se congela y three.js deja de reescribir los huesos ⇒ aditivos acumulados (explosión). Usar rate ≥ 0,05.
- crossfade por defecto 0,2 s es excesivo para acciones: `quickFade()` en `enter()` acorta `rig.bodyFade` (evade 0,05, vault 0,07…).
- `plantFeet` suma rig.w ⇒ el IK de pies llega tarde y hunde pies al agacharse/aterrizar: usar `plantFull()` y plantar ya en `fall`.
- Maroma: Ry(dirViva)·Roll·Ry(−c); las flexiones del encogido van con `rotLocal` (ejes de hueso Xbot: +x flexiona columna/rodilla, muslo −x), las de personaje se desarman en maromas laterales.
- Vault/trepar: trayectoria de la raíz PREDICHA desde la fase (misma fórmula que player/movement.js) con adelanto `lead` para compensar el suavizado (~50 ms); altura y avance se estiman de entity.pos si el llamador no da `height`.
- `cancelStance()` anula el giro de columna de la postura de tiro (coeficientes de weapons/) en acciones de cuerpo entero.

Pendiente / peticiones al núcleo
- `provider.fade` (crossfade propio por estado) y `handsFreeR` (mano derecha suelta; hoy `releaseIk` promedia ~4 %).
- autoState debería pasar `height`/`topY`/`landPos` de `physics.queryLedge` en vault/climb.
- Mejorar `measureClip`: umbral de contacto del Run subestima la velocidad.
- Riesgos: dedos de pie ≈ 0,1 m bajo el borde al entrar en la cobertura; manos ≈ 0,15 m del borde al trepar.
