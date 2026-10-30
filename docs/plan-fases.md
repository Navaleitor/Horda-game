# Plan por fases

## Subagentes (`.claude/agents/*.md`) — 19
Formato: frontmatter `name`, `description`, `tools`, `model: inherit`; cuerpo con **Responsabilidades**, **Archivos que posee**, **Contratos**, **Definición de terminado**, **No hace**. Todos escriben en español.

| Agente | Dueño de |
|---|---|
| `game-architect` | `core/`, `main.js`, `build.js`, `template.html` (esqueleto), `docs/arquitectura.md`; contratos y eventos; revisa todo antes de cerrar fase |
| `controls-camera-engineer` | `input/`, `camera/`, `player/` (incl. `inventory.js`, `downed.js`) — esquema E-Day, cobertura, maroma, radial ↑, LB toque/mantener |
| `gameplay-programmer` | `combat/`, `waves/`, `economy/` (incl. `shop.js`, `unlocks.js`), `modes/`, `classes/` (pasivas, comodines, reflejo en bots), dificultad, reglas de muerte |
| `ai-engineer` | `ai/` — navGrid, flow-fields, objetivos, comportamientos, jefes, `squad.js` (bots espejo) |
| `fortifications-engineer` | `fortifications/` — barreras, torretas, centinelas, señuelos, reparación, cargar/colocar, desbloqueo + mejora por pieza, mover |
| `physics-engineer` | `physics/` — cápsula cinemática, AABB/hash, raycasts, proyectiles, explosiones, ragdoll-lite |
| `animation-engineer` | `anim/core/` — **líder de animación**: rig, mixer, capas, IK, máquina de estados, API `setState`; integra a los animadores |
| `locomotion-animator` | `anim/locomotion/` — caminar, trotar, correr, agacharse, salto, escalar, vault, maroma, cargar pieza |
| `cover-animator` | `anim/cover/` — entrar/salir, cobertura media y alta, borde, asomarse, disparo a ciegas, SWAT turn, cambio de hombro |
| `weapon-animator` | `anim/weapons/` — postura/apuntado por arma, retroceso, recargas, cambio de arma, granada, melee, reparación, torreta |
| `abilities-animator` | `anim/abilities/` — gestos de comodines, radial, derribado/arrastrarse, revivir, muerte |
| `enemy-animator` | `anim/enemies/` — robots por tipo, ataques, aturdido/congelado, jefes; animación de bots por clase |
| `animation-reviewer` | `tests/anim/`, `docs/qa/animacion/` — revisión visual de animaciones (solo lectura de `src/`) |
| `character-artist` | `assets/models.js`, `assets/*.glb` — Soldier por clase, robots por tipo, jefes |
| `weapons-props-artist` | `assets/props/` — armas (tienda, iniciales, de clase), granadas, fortificaciones Nv1–4, fabricador |
| `vfx-artist` | `fx/` — trazadoras, impactos, láseres, explosiones, fantasma, efectos de comodines |
| `level-designer` | `level/` — Puesto Avanzado, rutas, slots/zonas, iluminación, coberturas |
| `ui-hud-designer` | `hud/`, DOM/CSS del HUD — HUD, tienda por pestañas, radiales (comodines y fortificación), Tac-Com, marcador, inicio |
| `qa-tester` | `tests/e2e/`, `docs/qa/` — Playwright + mando simulado, checklist de controles, FPS, bugs |

**Modelos**: `game-architect` y `controls-camera-engineer` usan el modelo de la sesión (Opus); los otros 17 usan `sonnet`. Reglas de ahorro de tokens en `CLAUDE.md`.

## Fases (cada una termina jugable con control)

**Fase 0 — Cimientos** ✅: agentes, docs, CLAUDE.md, decisiones de diseño.

**Fase 1a — Base jugable** (partida en 3 sub-fases, cada una en un chat nuevo)
- Ya hecho (rama `fase-1a-base-jugable`): núcleo y build, arnés e2e con mando simulado, Soldier por clase, combate (hitscan, recarga activa, melee), físicas, blockout del nivel con dianas, props.
- **1a.1 — Moverse y disparar**: controls-camera-engineer (input E-Day, cámara, movimiento, cobertura funcional con Soldier en Idle/Walk/Run sin poses finas) + HUD mínimo (vida, arma, munición, recarga activa) + test e2e de humo.
  - **Prueba con tu control**: moverte, sprint L3, cobertura A, SWAT turn, evadir, deslizar, saltar/vault Y, apuntar/disparar a dianas, recarga activa RB, cambio de hombro R3.
- **1a.2 — Animación**: animation-engineer (rig) → locomotion-animator + cover-animator → weapon-animator (máx. 3 a la vez).
  - **Prueba**: lo mismo, con poses de cobertura, agachado, vault, evadir y recargas animadas.
- **1a.3 — Menú, HUD y cierre**: ui-hud-designer (menú de inicio con clase y dificultad, HUD completo) + qa-tester (suite de controles) + animation-reviewer (capturas). Firmas de cierre.
  - **Prueba**: elegir clase y dificultad y jugar el campo de tiro completo.

**Fase 1b — Horda mínima**
- gameplay: armas, daño, `hordeMode`, oleadas 1–5 (sin jefe aún), bolsa de puntos.
- ai: Rasero y Corredor.
- fortifications + weapons-props: fabricador, pestaña Fortificaciones, **cargar en manos** y colocar pinchos Nv1 (fantasma, rotar, colocar, soltar).
- ui: HUD (puntos, oleada, enemigos, vida), tienda (pestaña Fortificaciones), prompts.
- character-artist + enemy-animator: robots Rasero/Corredor.
- locomotion-animator: caminar cargando pieza.
- **Prueba**: sobrevivir 5 oleadas, ganar puntos, comprar en el fabricador, cargar y colocar pinchos.

**Fase 2 — Barreras completas, reparación y derribado**
- fortifications: barreras Nv2–4 (pinchos → concertina → láser rojo → láser azul), desbloqueos por tipo, radial de fortificación (X), pistola de reparación, desgaste, reconstruir.
- gameplay: pestaña Desbloqueos, reglas de derribado/muerte/reaparición.
- controls: LB toque = granada / mantener = Tac-Com; D-pad ↓ pistola de reparación.
- ai: Bruto; barreras como obstáculos.
- vfx: láseres, haz de reparación. ui: radial de fortificación, Tac-Com, barras de salud de piezas.
- weapon-animator: haz de reparación, granada; abilities-animator: derribado/arrastrarse/revivir.
- **Prueba**: desbloquear y mejorar barreras hasta láser azul, reparar, ser derribado y revivir.

**Fase 3 — Torretas, centinelas, armas de tienda y bots espejo**
- fortifications: torreta manual Nv1–4 (montar/desmontar), centinela Nv1–4.
- gameplay: pestañas Armas y Munición/Granadas (escopeta, francotirador, lanzacohetes, ametralladora pesada; 3 tipos de granada).
- ai: Tirador, IA de objetivos completa, **bots espejo** con clase y arma de clase (seguir, cubrirse, revivir).
- weapons-props: armas de tienda y de clase, granadas. weapon-animator: posturas por arma, torreta.
- enemy-animator: bots por clase. character-artist: Soldier por clase.
- **Prueba**: comprar armas y granadas, montar torreta, ver a los 3 bots pelear y revivirte.

**Fase 4 — Señuelos, jefes, campaña de 25 oleadas, clases y comodines**
- fortifications: señuelo Nv1–4. ai: Explosivo, Coloso, Matriarca, uso de comodines por bots.
- gameplay: tabla completa + modificadores + dificultades + victoria; pestañas Clase y Místicas; pasivas P1–P4; comodines con cargas/cooldown; **reflejo en bots**.
- controls + ui: radial D-pad ↑ con RS y cámara lenta; marcador (View); pantalla de resultados.
- vfx + abilities-animator: los 7 comodines sincronizados (`anim:cast:impact`).
- enemy-animator + character-artist: jefes.
- **Prueba**: partida completa de 25 oleadas con clase, pasivas y comodines.

**Fase 5 — Pulido**
- Todos los animadores: transiciones, pies, IK fino; animation-reviewer pasada completa.
- vfx + audio sintetizado (WebAudio); rendimiento (InstancedMesh, pools); balance con telemetría de QA.

**Revisión por fase**: `game-architect` (contratos y ownership) + `qa-tester` (suite, FPS, consola) + `animation-reviewer` (cuando hay animación nueva).

## Decisiones tomadas
Resumen; el detalle está en `docs/horda-gdd.md`.
- Construcción **solo en el fabricador**; la pieza se **carga en las manos** y se coloca con RT.
- Mejora: **desbloqueo por tipo** en el fabricador + **mejora por pieza** en sitio; las piezas nuevas siempre salen en Nv1.
- **Mover sí** (en preparación), **vender no**, **sin límite** de piezas. Láser Nv4 **azul**, sin púrpura.
- **25 oleadas** con final; **3 dificultades**; **bolsa de equipo**.
- **4 clases** obligatorias (Médico, Apoyo, Ingeniero, Reconocimiento) con pasivas permanentes rango 1–5.
- **7 comodines místicos** en el radial ↑ (3 compartidos + 1 exclusivo por clase), con cargas que se pierden al morir.
- **3 bots espejo** que reflejan tus compras en su clase, con arma fija de clase; no pierden cargas al morir.
- Controles: sin sprint (L3 sin función; maroma con A en movimiento), B melee, R3 hombro, LB toque granada / mantener Tac-Com, View marcador, D-pad ←/→ armas, ↓ pistola o reparación, ↑ radial.
- Enemigos **robots**; archivo final **`horda.html`**.

- El **bot Ingeniero repara fortificaciones solo** con su herramienta de clase (cobra de la bolsa común y respeta una reserva mínima).

### Pendiente
- Precios de desbloqueo y de pasivas/comodines: se ajustan jugando.

## Verificación (cada fase)
1. `npm install && node build.js` → `horda.html` sin errores.
2. `node tests/e2e/run.mjs`: Playwright (Chromium preinstalado) carga el HTML con `addInitScript`, que sobrescribe `navigator.getGamepads` con un mando virtual (`window.__pad.press('A')`, `.stick('LS', x, y)`, `.hold('RT', ms)`); aserciones sobre `window.__game`.
3. 0 errores de consola; FPS (5 s) y draw calls en el reporte; capturas en `docs/qa/fase-N/`.
4. Checklist de regresión de controles en `docs/qa/checklist-controles.md`; checklist de poses en `docs/qa/animacion/`.
5. Resumen de "cómo probarlo con tu control".

Fuentes de controles E-Day: ver `docs/horda-gdd.md`.
