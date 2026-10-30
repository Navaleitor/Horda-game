# GDD — Modo Horda

> Todas las cifras viven en `src/core/config.js`; este documento es la referencia de diseño. Valores iniciales, se ajustan con telemetría de QA.

## 1. Controles (E-Day Default, 3ª persona fija)
Índices de la API Gamepad (standard mapping) entre paréntesis.

| Botón | Combate | Modo construcción (con fantasma) | Menú de construcción |
|---|---|---|---|
| LS (ejes 0,1) | Mover | Mover | Navegar |
| RS (ejes 2,3) | Cámara | Cámara/apuntar slot | — |
| L3 (10) | Sprint (hold; opción toggle) | — | — |
| R3 (11) | Cambiar hombro | — | — |
| A (0) | Cobertura · A+dirección en cobertura = SWAT turn/deslizar a cobertura contigua · doble-tap A = evadir/rodar · A en sprint = slide | — | Seleccionar |
| Y (3) | Saltar · trepar · saltar sobre cobertura | — | — |
| B (1) | Golpe cuerpo a cuerpo | **Cancelar** (reembolso 100%) | Atrás/cerrar |
| X (2) | Interactuar (fabricador, montar torreta, recoger) · **mantener X** sobre fortificación = mejorar | — | — |
| RB (5) | Recargar (tap de nuevo = recarga activa) | Rotar +45° | Pestaña → |
| LB (4) | Tac-Com (hold: rutas de spawn, salud de fortificaciones, enemigos restantes) | Rotar −45° | Pestaña ← |
| LT (6) | Apuntar | — | — |
| RT (7) | Disparar / lanzar | **Confirmar colocación** | — |
| D-pad ↑ (12) | Equipo (granada) | — | — |
| D-pad ←/→ (14/15) | Cambiar arma (rifle / pistola / **pistola de reparación**) | — | — |
| D-pad ↓ (13) | Abrir menú de construcción (ver duda D1) | — | — |
| View (8) | Marcador de horda (puntos, bajas, oleada) | — | — |
| Menu (9) | Pausa | Pausa | Pausa |

Pistola de reparación: RT mantenido con haz sobre fortificación (≤6 m).
Montado en torreta manual: LT/RT apuntar/disparar, B o X desmontar.

## 2. Flujo de Horda (máquina de estados)
`Preparación (30 s, saltable con Menu→"Listo")` → `Oleada N` → `Recompensa (+bono)` → repetir. Muerte del jugador = fin (o reaparición si hay aliados; ver D3). Cada 5 oleadas = **jefe**. Cada set de 5 sube modificadores: HP ×1.20, daño ×1.15, presupuesto ×1.25.

## 3. Enemigos (nombres originales, modelos: RobotExpressive.glb de three.js + geometría)
| Tipo | HP | Vel. | Daño | Rol / IA | Puntos |
|---|---|---|---|---|---|
| Rasero (soldado) | 150 | 3.5 m/s | 8×rifle | Avanza de cobertura en cobertura, flanquea | 50 |
| Corredor | 60 | 6 | 15 melee | Rush directo; muy frenado por barreras | 30 |
| Tirador | 120 | 3 | 45 (cada 2.5 s, láser de aviso) | Se queda lejos, prioriza al jugador expuesto | 80 |
| Bruto | 700 | 2.5 | 40 melee / escopeta | Prioriza fortificaciones; daño ×3 a barreras | 200 |
| Explosivo | 40 | 5 | 120 radio 3 m | Busca señuelos/barreras/torretas y se inmola | 40 |
| **Jefe: Coloso** (oleada 5, 15, 25) | 5000 | 2 | Pisotón AoE + cañón | Punto débil en espalda; destruye barreras al pasar | 1000 |
| **Jefe: Matriarca** (oleada 10, 20) | 4000 | 2.5 | Invoca Corredores | Se protege tras escudo; vulnerable al invocar | 1000 |

## 4. IA: selección de objetivo (utilidad, re-evaluación cada 0.5 s, histéresis +20% al objetivo actual)
```
score(t) = base[tipoEnemigo][tipoObjetivo] × aggroWeight(t) × visibilidad(t)
           × 1/(1 + dist/10) × (1 + 0.5·meDañóRecientemente(t))
```
- Candidatos: jugador, aliados, señuelos, torretas/centinelas, barreras.
- **Señuelo**: dentro de su radio, `aggroWeight` alto (Nv1 ×3 … Nv4 ×6) → atrae a casi todos salvo Tirador (resiste) y quien recibió daño del jugador en los últimos 2 s.
- **Barreras** no son objetivo preferente salvo para Bruto/Explosivo; son **obstáculos**: el navGrid les asigna costo alto. Si la ruta más barata cruza la barrera, el enemigo se detiene y la ataca (y sufre su daño/ralentización).
- Movimiento: A* sobre grilla 1 m del mapa, flow-field por ruta de spawn para muchos enemigos (barato), separación local entre agentes.

## 5. Economía
- Bajas: tabla anterior; **headshot +50%**, **ejecución/melee +25%**.
- Bono fin de oleada: `200 + 50·N`; +25% si ninguna fortificación fue destruida. Puntos iniciales: **600**.
- Coste de colocar / mejorar a Nv2 / Nv3 / Nv4:

| Fortificación | Nv1 | →Nv2 | →Nv3 | →Nv4 |
|---|---|---|---|---|
| Barrera | 300 | 450 | 800 | 1200 |
| Torreta manual | 700 | 600 | 1000 | 1500 |
| Centinela | 1000 | 800 | 1300 | 2000 |
| Señuelo | 400 | 400 | 700 | 1000 |

- Reparar: **1 punto por cada 4 HP** (reparar un daño total cuesta ≈ 35–50% del valor invertido). Destruida = reconstruir al 50% del coste acumulado, conserva nivel.
- Vender (opcional, D5): reembolso 50%.

## 6. Fortificaciones por nivel (máx. 4)
**Barreras** (frenan + dañan + se desgastan con cada contacto)
| Nv | Forma | HP | Ralentiza | DPS contacto | Especial |
|---|---|---|---|---|---|
| 1 | Pinchos | 400 | 30% | 10 | — |
| 2 | Concertina (alambre redondo) | 700 | 50% | 20 | Enganche 0.5 s |
| 3 | Láser rojo | 1000 | 40% | 60 | Corredores no pueden cruzar |
| 4 | Láser azul **o** púrpura | 1500 | — | — | Elección al subir a Nv4 |
- **Propuesta láser púrpura**: Nv4 se ramifica (se respeta el máximo de 4): **Azul = Control** (ralentiza 60%, congela 1.5 s, DPS 80) vs **Púrpura = Daño** (DPS 140, perfora armadura −30% al cruzar, ralentiza 30%). Se puede cambiar de rama pagando 50% del coste de Nv4.

**Torreta manual** (el jugador la monta con X; sobrecalentamiento en vez de munición)
| Nv | Daño/bala | Cadencia | Calor máx | HP | Especial |
|---|---|---|---|---|---|
| 1 | 25 | 8/s | 4 s | 600 | — |
| 2 | 32 | 10/s | 6 s | 800 | Escudo frontal |
| 3 | 40 | 12/s | 8 s | 1100 | Ralentiza 15% al impactar |
| 4 | 40 + explosivo r1.5 | 12/s | 10 s | 1500 | Disparo alterno: cohete (RB) |

**Centinela** (automática)
| Nv | Alcance | Arco | Daño | Cadencia | HP | Especial |
|---|---|---|---|---|---|---|
| 1 | 15 m | 120° | 8 | 4/s | 400 | — |
| 2 | 20 m | 180° | 12 | 5/s | 600 | Prioriza Explosivos |
| 3 | 22 m | 360° | 15 | 6/s | 900 | Blindaje (−25% daño recibido) |
| 4 | 25 m | 360° | 18 | 8/s | 1200 | Balas incendiarias (DoT 10/s 3 s) |

**Señuelo / maniquí**
| Nv | HP | Radio aggro | Peso | Especial |
|---|---|---|---|---|
| 1 | 500 | 8 m | ×3 | — |
| 2 | 900 | 12 m | ×4 | — |
| 3 | 1400 | 15 m | ×5 | Explota al destruirse (150 dmg r4) |
| 4 | 2000 | 18 m | ×6 | Pulso de choque cada 8 s (aturde 1 s r5) |

**Desgaste**: barreras pierden HP al dañar/frenar; láseres consumen "energía" (mismo HP). Torretas/centinelas/señuelos solo pierden HP por daño enemigo.

## 7. Construcción con control
1. **Abrir**: X en el fabricador (siempre) o D-pad ↓ durante Preparación (ver D1).
2. **Menú radial** con pestañas (LB/RB): Barreras · Torretas · Centinelas · Señuelos. LS/D-pad elige, muestra coste, nivel y si hay puntos (gris si no). A compra → pasas a **modo construcción** con el fantasma.
3. **Fantasma**: se proyecta 3 m delante, hace *snap* al slot/área válido más cercano en la mira. Verde = válido, rojo = inválido (sin slot, colisión, sin puntos). Barreras hacen *snap* a **slots de barrera** predefinidos (líneas en los cuellos de botella); centinelas/señuelos a **zonas de construcción** (rejilla 1 m); torretas manuales a **plataformas** fijas.
4. **Rotar** LB/RB ±45°. **Confirmar** RT (se cobran puntos). **Cancelar** B.
5. **Mejorar**: apuntar a una fortificación (≤3 m) → prompt "Mantén X · Nv2 · 450". En Nv3→4 de barrera, prompt con elección Azul (A) / Púrpura (Y).
6. **Reparar**: pistola de reparación, RT mantenido; HUD muestra HP y coste/seg.

## 8. Mapa fijo: "Puesto Avanzado" (~90×90 m)
- Base central elevada con **fabricador**, 2 plataformas de torreta manual, 3 zonas de construcción.
- **3 entradas** de enemigos (Norte: patio abierto; Este: callejón estrecho; Oeste: rampa/puente) con rutas que convergen en 2 cuellos de botella → 6 slots de barrera.
- Coberturas bajas (1 m, para el sistema de cobertura) y altas (2.2 m), pilares, contenedores; una torre para Tiradores enemigos.
- Iluminación: HemisphereLight + DirectionalLight con sombras (mapa 2048), niebla, focos en el fabricador, emisivos en láseres. Atardecer industrial.
- Datos en `level/maps/outpost.js`: `boxes[]`, `coverEdges[]` (generado), `spawns[]`, `routes[]`, `barrierSlots[]`, `buildZones[]`, `turretPads[]`, `fabricator`, `playerStart`.

## 9. Tabla de oleadas (presupuesto del director)
Coste por enemigo: Rasero 1 · Corredor 0.6 · Tirador 2 · Bruto 4 · Explosivo 1.2. Presupuesto `B(N) = 8 + 3·N` ×1.25 por set. Simultáneos máx. `10 + N` (tope 30).
| Oleada | Disponibles | Notas |
|---|---|---|
| 1–2 | Rasero, Corredor | Solo Norte |
| 3–4 | + Tirador | Norte + Este |
| 5 | **Coloso** + escolta pequeña | Jefe |
| 6–9 | + Bruto, + Explosivo (8+) | 3 entradas |
| 10 | **Matriarca** + Corredores | Jefe |
| 11–25 | Todos, modificadores por set | Jefes en 15/20/25; 25 = doble jefe y fin |

## 10. Personajes y modelos (ligeros, ejemplos de three.js)
- Jugador/aliados: `Soldier.glb` (Idle/Walk/Run) + poses procedurales (agachado en cobertura, apuntado, evade, slide, salto, muerte) vía rotación de huesos + IK de brazos.
- Enemigos: `RobotExpressive.glb` (Idle, Walking, Running, Death, Jump, Punch…) teñido/escalado por tipo; Bruto ×1.4, jefes ×2.5 con piezas de geometría añadidas.
- Armas, torretas, barreras (pinchos, concertina con TubeGeometry helicoidal), láseres (planos emisivos + shader aditivo), señuelo (maniquí de cápsulas), fabricador: **geometría procedural**.


## Fuentes del esquema de control (E-Day)
Guías de terceros, no oficiales; verificar en Ajustes > Controles del juego:
- [Wikipedia — Gears of War: E-Day](https://en.wikipedia.org/wiki/Gears_of_War:_E-Day)
- [keymap.io — Controls: Default Layout & All 5 Schemes](https://keymap.io/controls/gears-of-war-e-day/)
- [Game8 — All Controls List](https://game8.co/games/Gears-of-War-E-Day/archives/630661)
- [G2A — Movement guide](https://www.g2a.com/news/features/guide/gears-of-war-e-day-movement-guide-jumping-sliding-cover-and-what-changed/)
- [Magic Game World — Controls](https://www.magicgameworld.com/gears-of-war-e-day-controls-for-pc-and-controller/)
- [The Games Wiki — Settings and Controls](https://thegameswiki.com/gears-of-war-e-day/wiki/settings-and-controls)
