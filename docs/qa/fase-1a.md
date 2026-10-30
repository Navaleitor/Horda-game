# Fase 1a.1 — Moverse y disparar: reporte de cierre

## Estado
- `npm install && node build.js` → `horda.html` (3,50 MB, Soldier.glb embebido). `node build.js --debug` → `horda-debug.html`.
- `node tests/e2e/run.mjs` → **27/27 PASS, 0 errores y 0 avisos de consola** (suites `00-arranque`, `05-humo-1a1`, `90-rendimiento`).
- `node --test 'tests/unit/*.test.mjs'` → 40/40 (físicas y combate).
- Rendimiento (headless, Chromium con SwiftShader = render por CPU, sin GPU): 2,5 FPS de media, p5 1,4, **45 draw calls**, ~16,8 k triángulos. La cifra de FPS no es representativa de un navegador con GPU; las draw calls sí.
- La suite `05-humo-1a1` avanza la simulación por pasos fijos (`loop.stepN`) para no perder pulsaciones del mando simulado con SwiftShader. Las suites de controles abren el juego con `?lowgfx` (solo debug: sin sombras ni antialias); `90-rendimiento` mide con calidad completa.

## Qué cubre la 1a.1
Controles E-Day (§1 del GDD), cámara siempre en tercera persona, cobertura media (1 m) y alta (2,2 m) con A, moverse por el borde, asomarse con LT, SWAT turn y deslizar a la contigua, sprint toggle con L3, evadir (doble A), deslizar (A en sprint), saltar/vault/trepar con Y, apuntar y disparar a dianas (headshot ×2), recarga con recarga activa de 3 resultados, B melee (cancela la recarga), R3 hombro, D-pad ←/→/↓, pausa con Menu. Soldier.glb con color/accesorio por clase (Idle/Walk/Run + poses base), nivel "Puesto Avanzado" en blockout con 9 dianas, HUD (vida, arma, munición, recarga activa, ranuras, prompts con glifos Xbox).

## Firmas
- `game-architect` (contratos): contratos §3 en `docs/arquitectura.md`, eventos nuevos (`weapon:reloadCancel`, `target:down/up`) añadidos al catálogo; sin dependencias cruzadas entre sistemas. ✅ (1a.1)
- `qa-tester` (suite, FPS, consola): suite en verde, 0 errores de consola, FPS y draw calls arriba. ✅ (1a.1)
- `animation-reviewer`: pendiente — la animación fina es la 1a.2.

## Pendiente (siguientes sub-fases)
- **1a.2**: animación fina (locomoción, poses de cobertura, armas: apuntar/recargar/cambio/melee con IK). Hoy los proveedores de `src/anim/locomotion|cover|weapons` son stubs con poses por defecto del rig.
- **1a.3**: suite completa de controles (`tests/e2e/pendiente-1a3/10-controles.mjs`) y checklist `docs/qa/checklist-controles.md` al día; revisión del menú de inicio (ya funciona: clase + dificultad).
- Duda de diseño abierta: con huecos de 1,2–1,5 m entre coberturas, A+dirección en el borde da prioridad al **SWAT turn** sobre **deslizar a la contigua**.

## Cómo probarlo con tu control
1. Descarga `horda.html` de la rama `fase-1a-base-jugable` (o genera con `npm install && node build.js`). Ábrelo con doble clic en Chrome o Edge (funciona con `file://`, no necesita servidor).
2. Conecta un mando Xbox (USB o Bluetooth) y **pulsa cualquier botón** para que el navegador lo detecte.
3. En el menú: D-pad/LS para moverte, **A** para elegir clase y dificultad, y **A** en "Empezar". (La clase solo cambia el aspecto en esta fase.)
4. **LS** mueve (caminar/trotar/correr según cuánto inclines), **RS** cámara. **L3** activa sprint (se corta al soltar el stick, apuntar o disparar). **R3** cambia de hombro.
5. Delante del inicio hay coberturas naranjas (medias) y verdes (altas): acércate y pulsa **A** para cubrirte. Con LS lateral te mueves por el borde; **LT** para asomarte (en las altas, desde el extremo). En el extremo, **A + dirección** hace SWAT turn a la siguiente. Aleja el stick para salir.
6. **Doble toque de A** = evadir; **A durante el sprint** = deslizar (si hay cobertura delante, entras deslizando). **Y** salta, salta por encima de la cobertura media, de la barra baja a la derecha del inicio, y trepa el bloque de 2 m que hay al lado.
7. **LT** apunta y **RT** dispara a las dianas (caen al vaciarles la vida y se levantan a los pocos segundos; a la cabeza hacen el doble).
8. **RB** recarga; pulsa **RB otra vez** cuando el cursor pase por la zona: zona estrecha = perfecta (+10% de daño 5 s), ancha = buena (más rápida), fuera = encasquillada 1,5 s. **B** = golpe cuerpo a cuerpo (cancela la recarga).
9. **D-pad ↓** pistola, **←** rifle, **→** ranura vacía (no cambia el arma; el HUD muestra "Vacía"). **Menu** pausa (ahí está la tabla de controles).
10. Teclado solo de respaldo para desarrollo: WASD, ratón (clic para capturarlo), Shift, Espacio, C, F, R, Q, 1/2/3, Esc.
