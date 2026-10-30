# Plan por fases

## Subagentes (`.claude/agents/*.md`)
Formato: frontmatter `name`, `description`, `tools` (+ `model: inherit`); cuerpo con **Responsabilidades**, **Archivos que posee**, **Contratos que respeta**, **Definición de terminado** (build OK + test e2e propio verde + 0 errores de consola), **No hace**. Todos escriben en español.

| Agente | Dueño de | Herramientas |
|---|---|---|
| `game-architect` | `core/`, `main.js`, `build.js`, `template.html` (estructura), `docs/arquitectura.md`; contratos y eventos; revisa todos los PRs | Read, Grep, Glob, Bash, Edit, Write |
| `controls-camera-engineer` | `input/`, `camera/`, `player/` — esquema E-Day, cobertura, sprint/slide/evade/vault, sensación de control | Read, Grep, Glob, Bash, Edit, Write |
| `gameplay-programmer` | `combat/`, `waves/`, `economy/`, `modes/` — armas, daño, oleadas, puntos, flujo de horda | idem |
| `ai-engineer` | `ai/` — navGrid, flow-fields, selección de objetivo, comportamientos y jefes | idem |
| `fortifications-engineer` | `fortifications/` — barreras, torretas, centinelas, señuelos, reparación, niveles, buildSystem | idem |
| `physics-engineer` | `physics/` — cápsula cinemática, AABB/hash espacial, raycasts, proyectiles, explosiones, ragdoll-lite | idem |
| `animation-engineer` | `anim/` — AnimationMixer, capas/blending, IK, poses procedurales, sincronía con estados del jugador/enemigos | idem |
| `character-artist` | `assets/models.js`, variantes de Soldier/RobotExpressive, materiales, LOD, jefes | idem |
| `weapons-props-artist` | `assets/props/` — armas, torretas, centinelas, barreras Nv1–4, señuelos, fabricador (geometría procedural) | idem |
| `vfx-artist` | `fx/` — trazadoras, fogonazos, láseres, impactos, explosiones, fantasma de construcción (shader) | idem |
| `level-designer` | `level/` — Puesto Avanzado, rutas, slots/zonas, iluminación, coberturas | idem |
| `ui-hud-designer` | `hud/`, CSS/DOM del HUD en `template.html` — HUD de horda, menú radial, prompts, Tac-Com, marcador | idem |
| `qa-tester` | `tests/`, `docs/qa/` — Playwright + gamepad simulado, checklist de controles, reportes de bugs y FPS | Read, Grep, Glob, Bash, Write (no edita `src/`) |


## 5. Plan por fases (cada fase termina jugable con control)

**Fase 0 — Cimientos (esta aprobación)**: agentes, docs, CLAUDE.md. Sin código.

**Fase 1a — Base jugable**
- architect: `package.json` (three, esbuild, playwright dev), `build.js`, `template.html`, `core/` (loop fijo, eventos, debug hooks).
- en paralelo: controls-camera (input E-Day + cámara + movimiento + cobertura) · physics (cápsula/AABB/raycast) · level (blockout Puesto Avanzado) · animation (Soldier con Idle/Walk/Run + IK + pose cobertura) · qa (harness gamepad simulado).
- **Prueba con tu control**: moverte, sprint L3, cobertura A, SWAT turn, evadir, slide, saltar/vault Y, apuntar/disparar a dianas, recarga activa RB, cambio de hombro R3.

**Fase 1b — Horda mínima** (= tu Fase 1)
- gameplay: armas/daño, `hordeMode` (Preparación/Oleada/Recompensa), director oleadas 1–5 (sin jefe aún: oleada 5 = grande), economía.
- ai: Rasero y Corredor (flow-field + objetivo jugador/barrera).
- fortifications + weapons-props: barrera de pinchos Nv1, fabricador, fantasma/rotar/confirmar/cancelar.
- ui: HUD (puntos, oleada, enemigos restantes, vida), menú radial básico, prompts.
- character-artist: enemigos RobotExpressive.
- **Prueba**: sobrevivir 5 oleadas, ganar puntos, comprar y colocar pinchos con el control.

**Fase 2 — Barreras completas + reparación**: barreras Nv2–4 (rama azul/púrpura), mejora con X mantenido, pistola de reparación, desgaste, Bruto, Tac-Com (LB). vfx: láseres. Paralelo: fortifications · ai (Bruto/obstáculos) · vfx · weapons-props · ui.

**Fase 3 — Torretas y centinelas**: torreta manual Nv1–4 (montar/desmontar), centinela Nv1–4, Tirador, IA de objetivos por utilidad completa. Paralelo: fortifications · ai · weapons-props · animation (pose montado).

**Fase 4 — Señuelos, jefes y campaña de 25 oleadas**: señuelo Nv1–4, Explosivo, Coloso y Matriarca, tabla completa + modificadores, pantalla de resultados. Paralelo: ai+character-artist (jefes) · fortifications (señuelo) · gameplay (tabla) · ui.

**Fase 5 — Pulido**: animaciones procedurales finas (evade, slide, muerte, golpes), VFX/audio sintetizado (WebAudio), aliados bot (si D3), rendimiento (InstancedMesh, pools), balance con telemetría de QA.

Revisión: `game-architect` revisa cada fase antes de merge; `qa-tester` corre la suite al final de cada fase.

## 6. Dudas de diseño para decidir antes de la Fase 1a
- **D1** ¿Construir solo en el fabricador (estilo Gears 5) o también en cualquier lugar con D-pad ↓ durante la Preparación? (Propuesta: ambas; durante la oleada solo fabricador.)
- **D2** Esquema E-Day: las guías no oficiales difieren (algunas ponen B = melee + cambio de hombro). Propongo B = melee y R3 = hombro. ¿OK? ¿Sprint mantenido o toggle por defecto?
- **D3** ¿Solo, o con 3 aliados bot (heredando los bots del 4v4)? Afecta revivir (X), dificultad y si la muerte es fin de partida.
- **D4** ¿25 oleadas con fin, o infinita tras la 25?
- **D5** ¿Se puede vender/reubicar fortificaciones?
- **D6** Láser púrpura como rama de Nv4 (Control vs Daño): ¿de acuerdo?
- **D7** ¿Puntos de equipo compartidos o por jugador (pensando en coop futuro)?
- **D8** ¿Estética de enemigos: robots (RobotExpressive) está bien?
- **D9** ¿Nombre del HTML final: mantener `breakout.html` o `horda.html`?

## Verificación (cada fase)
1. `npm install && node build.js` → `breakout.html` sin errores.
2. `node tests/e2e/run.mjs`: Playwright (chromium preinstalado) carga el HTML con `addInitScript` que sobrescribe `navigator.getGamepads` con un mando virtual controlado vía `window.__pad.press('A')`, `.stick('LS', x, y)`, `.hold('RT', ms)`; aserciones sobre `window.__game` (posición, estado de cobertura, puntos, oleada, fortificaciones).
3. 0 errores/warnings de consola; muestreo de FPS (5 s) y nº de draw calls en el reporte; capturas en `docs/qa/fase-N/`.
4. Checklist de regresión de controles (cada fila de §3.1) en `docs/qa/checklist-controles.md`.
5. Resumen al usuario de "cómo probarlo con tu control".

Para esta Fase 0: verificar que los 13 `.md` de agentes tienen frontmatter válido (`name`, `description`, `tools`) y que se ven con `/agents`; commit + push.

Fuentes de controles E-Day: Wikipedia, keymap.io, game8, G2A, Magic Game World, thegameswiki (guías de terceros; verificar en el menú del juego).
