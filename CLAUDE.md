# Horda — shooter en tercera persona (three.js)

Modo Horda inspirado en Gears of War, en un solo HTML autocontenido. Responde y documenta **en español**.

## Documentos de referencia
- `docs/arquitectura.md` — módulos, contratos entre sistemas, eventos. Dueño: `game-architect`.
- `docs/horda-gdd.md` — controles, enemigos, IA, economía, fortificaciones, mapa, oleadas.
- `docs/plan-fases.md` — fases, agentes por fase, dudas abiertas, verificación.

## Build y pruebas
- `npm install` → `node build.js` genera `horda.html` (esbuild; `.glb` embebidos como data URL).
- `node build.js --debug` expone `window.__game` para las pruebas.
- `node tests/e2e/run.mjs` — Playwright headless con mando simulado (`navigator.getGamepads` sobrescrito, controlado vía `window.__pad`). Chromium ya está instalado: no ejecutar `playwright install`.
- Al cerrar cada fase: build OK, suite e2e verde, **0 errores de consola**, reporte de FPS y un resumen de cómo probarlo con el control.

## Reglas
- Cámara **siempre en tercera persona**. Esquema de control = E-Day Default (`docs/horda-gdd.md` §1). No romper controles existentes: cualquier cambio de botón actualiza `src/input/presets.js`, el GDD y `docs/qa/checklist-controles.md`.
- Bucle de simulación de paso fijo (60 Hz); render interpolado.
- Los sistemas se comunican por `core/events.js`; no importan otros sistemas salvo `core/`.
- Cifras de balance solo en `src/core/config.js`.
- Modelos ligeros: glTF de los ejemplos de three.js (`Soldier.glb`, `RobotExpressive.glb`) o geometría procedural. Nada pesado.
- Cada agente edita solo los archivos que posee (ver `.claude/agents/` y la tabla en `docs/plan-fases.md`). Si necesitas un cambio fuera de tu área, pídelo al dueño o propónlo al `game-architect`.
- Animación: `animation-engineer` posee `src/anim/core/`; cada animador especialista posee su subcarpeta (`locomotion/`, `cover/`, `weapons/`, `abilities/`, `enemies/`). Todo cambio de animación lo revisa `animation-reviewer` antes de cerrar la fase.
- Cierre de fase: lo firman `game-architect` (contratos), `qa-tester` (suite, FPS, consola) y `animation-reviewer` (si hubo animación nueva).
- Nada de identificadores de modelo de IA en commits ni código.
