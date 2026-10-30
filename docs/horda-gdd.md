# GDD — Modo Horda

> Todas las cifras viven en `src/core/config.js`; este documento es la referencia de diseño. Valores marcados *(prov.)* son provisionales y se ajustan con pruebas/telemetría de QA.

## 1. Controles (E-Day Default adaptado, 3ª persona fija)
Índices de la API Gamepad (standard mapping) entre paréntesis.

| Botón | Combate | Cargando fortificación | Menús (fabricador, radiales) |
|---|---|---|---|
| LS (ejes 0,1) | Mover | Mover (más lento) | Navegar |
| RS (ejes 2,3) | Cámara | Cámara / apuntar el lugar | — (en el radial ↑: elegir) |
| L3 (10) | Sprint **toggle** (se corta al soltar el stick, apuntar o disparar) | — | — |
| R3 (11) | Cambiar hombro | — | — |
| A (0) | Cobertura · A+dirección en cobertura = SWAT turn / deslizar a la cobertura contigua · doble toque = evadir/rodar · A en sprint = deslizar | — | Seleccionar / comprar |
| Y (3) | Saltar · trepar · saltar sobre cobertura | — | — |
| B (1) | Golpe cuerpo a cuerpo | **Soltar** la pieza en el suelo | Atrás / cerrar |
| X (2) | Interactuar: fabricador, montar torreta, recoger, **mantener sobre aliado derribado = revivir**. **Toque sobre fortificación** → radial de fortificación (§12) | — | — |
| RB (5) | Recargar (toque de nuevo = recarga activa) | Rotar +45° | Pestaña → |
| LB (4) | **Toque = granada rápida** (al punto de mira) · **mantener = Tac-Com** | Rotar −45° | Pestaña ← |
| LT (6) | Apuntar | — | — |
| RT (7) | Disparar | **Colocar** (válido = fantasma verde) | — |
| D-pad ←/→ (14/15) | Armas principales: rifle de asalto / arma comprada (si la ranura está vacía, el arma **no cambia** y el HUD muestra "Vacía" un instante) | — | Navegar |
| D-pad ↓ (13) | Pistola, o **pistola de reparación** si la compraste (la reemplaza) | — | Navegar |
| D-pad ↑ (12) | **Mantener** = radial de comodines místicos; elegir con RS; **soltar = activar** (tiempo al 50% con el radial abierto) | — | Navegar |
| View (8) | Mantener = marcador | — | — |
| Menu (9) | Pausa | Pausa | Pausa |

- **A + dirección en el extremo de una cobertura**: si el hueco hasta la siguiente cobertura es de **≤1,5 m** → **SWAT turn**; si es **mayor** → **deslizar a la cobertura contigua**.
- **Tac-Com** (mantener LB): resalta a través de paredes a aliados, fabricador y fortificaciones (con su salud), dibuja rutas de spawn, enemigos restantes y composición de la siguiente oleada.
- **Pistola de reparación**: RT mantenido, haz sobre fortificación (≤6 m).
- **Torreta manual**: X para montar; LT/RT apuntar/disparar; RB cohete (Nv4); B o X desmontar.

## 2. Flujo de partida
1. **Menú de inicio**: elegir **clase** (obligatorio) y **dificultad**. Los 3 bots toman las otras 3 clases.
2. `Preparación (30 s, saltable desde pausa → "Listo")` → `Oleada N` → `Recompensa (+bono)` → repetir.
3. **25 oleadas** en 5 sets de 5. Jefe en 5, 10, 15, 20; la 25 es doble jefe → **victoria**.
4. Cada set sube modificadores enemigos: HP ×1.20, daño ×1.15, presupuesto ×1.25.

**Dificultad**
| | Casual | Normal | Locura |
|---|---|---|---|
| HP enemigo | ×0.75 | ×1 | ×1.4 |
| Daño enemigo | ×0.6 | ×1 | ×1.6 |
| Puntos | ×0.8 | ×1 | ×1.3 |

**Derribado, muerte y reaparición**
- Vida a 0 → **derribado** 15 s (te arrastras despacio, sin disparar). Un aliado lo revive manteniendo X 3 s → vuelves con 30% de vida.
- Si nadie llega → **mueres** y reapareces en el fabricador al terminar la oleada.
- Al morir **pierdes**: armas compradas, granadas, pistola de reparación, cargas de comodines y la fortificación que cargabas (cae al suelo, cualquiera la recoge). **Conservas** las pasivas de clase.
- Si los 4 están derribados/muertos a la vez → **fin de partida**.
- Bots: mismas reglas de derribado, pero **no pierden** sus cargas de comodines ni su arma de clase.

## 3. Clases y pasivas
Clase obligatoria al inicio: **Médico, Apoyo, Ingeniero, Reconocimiento**. Las pasivas se compran en el fabricador (pestaña Clase), **rangos 1–5**, y son **permanentes** (no se pierden al morir). Coste por rango *(prov.)*: 300 / 600 / 1000 / 1500 / 2200.

Cada clase tiene 4 pasivas en ranuras P1–P4. La ranura sirve para el reflejo en los bots (§6).

| Ranura | Médico | Apoyo | Ingeniero | Reconocimiento |
|---|---|---|---|---|
| P1 | **Revivir rápido**: −10% tiempo de revivir/rango; R5 revive a 3 m | **+Munición**: +10% capacidad/rango | **Reparación experta**: +15% velocidad y −5% coste de reparar/rango | **Tiro a la cabeza**: +8% daño headshot/rango |
| P2 | **Vitalidad**: +5% salud máx. del escuadrón/rango | **Recarga incendiaria**: recarga activa perfecta prende balas (DoT 5/s × rango, 3 s) | **Blindaje**: +6% HP de fortificaciones/rango | **Ojo marcador**: apuntar marca enemigos 2 s × rango (visibles a través de paredes) |
| P3 | **Regeneración**: +10% velocidad de regeneración y −0.3 s de espera/rango | **Granadero**: +1 granada máx. en R1, R3, R5 | **Cargador**: +10% velocidad al cargar fortificaciones/rango | **Ágil**: +3% velocidad de movimiento/rango |
| P4 | **Dardos curativos**: la pistola cura a aliados 5 HP × rango por impacto | **Aura de daño**: +3% daño a aliados en 8 m/rango | **Descuento**: −4% coste de construir y mejorar/rango | **Cazarrecompensas**: +4% puntos por baja/rango |

## 4. Comodines místicos (radial D-pad ↑)
- Se compran **cargas** en el fabricador (pestaña Místicas), **máx. 2 por comodín**. Usar uno gasta una carga. **Cooldown global de 10 s** entre comodines.
- **Se pierden al morir** (los bots no los pierden).
- El radial muestra solo los comodines con carga; los que están en cooldown salen en gris.

| Comodín | Tipo | Efecto | Precio/carga *(prov.)* |
|---|---|---|---|
| **Llamado del Vínculo** | Compartido | Revive al instante a todos los aliados derribados y cura 30% al escuadrón | 1500 |
| **Escudo Espectral** | Compartido | Domo de 4 m que bloquea proyectiles enemigos 6 s; se puede disparar desde dentro | 1000 |
| **Granada Arcana** | Compartido | Te da 1 granada arcana (la siguiente que lanzas con LB): aturde 3 s en r5, **incluidos jefes** (2 s) | 800 |
| **Aura de Resurrección** | Exclusivo Médico | 10 s: los aliados que caigan a ≤8 m se levantan solos con 50% de vida | 1200 |
| **Lluvia de Suministros** | Exclusivo Apoyo | Rellena munición y granadas del escuadrón + munición infinita 10 s | 1000 |
| **Fortaleza Arcana** | Exclusivo Ingeniero | Todas las fortificaciones se reparan 40% y son invulnerables 8 s | 1500 |
| **Velo de Sombras** | Exclusivo Reconocimiento | Invisible para enemigos 8 s; el primer disparo al salir hace ×3 y revela a todos los enemigos 6 s | 1000 |

Solo puedes comprar el exclusivo de tu clase.

## 5. Fabricador y tienda
Único lugar donde se compra. X para abrir. Menú con pestañas (LB/RB); LS/D-pad navegan, A compra, B sale. Muestra coste, nivel actual y si alcanza la bolsa (gris si no).

| Pestaña | Contenido |
|---|---|
| **Fortificaciones** | Barrera, torreta manual, centinela, señuelo. **Siempre salen en Nv1** a su precio base. Al comprar, la pieza pasa a tus manos. |
| **Desbloqueos** | Por tipo de fortificación: desbloquear Nv2, Nv3, Nv4 (en orden). Habilita mejorar las piezas de ese tipo hasta ese nivel. Precios *(prov., se ajustan con pruebas)*: Nv2 1000 · Nv3 2500 · Nv4 5000. |
| **Armas** | Escopeta, rifle de francotirador, lanzacohetes, ametralladora pesada (ocupan la 2ª ranura principal; comprar otra reemplaza). Pistola de reparación (reemplaza la pistola). |
| **Munición / Granadas** | Rellenar munición; granadas de fragmentación, incendiarias o aturdidoras. |
| **Clase** | Pasivas de tu clase, rangos 1–5. |
| **Místicas** | Cargas de comodines. |

**Precios de equipo** *(prov.)*: escopeta 800 · francotirador 1200 · ametralladora pesada 1800 · lanzacohetes 2000 · pistola de reparación 400 · rellenar munición 200 · granada frag 150 c/u · incendiaria 200 c/u · aturdidora 200 c/u.

**Granadas**: un tipo a la vez, máx. 4 (más con la pasiva Granadero). Comprar otro tipo reemplaza al anterior.

## 6. Escuadrón: bots espejo
- 3 bots con las 3 clases que no elegiste. **Progresan contigo**:
  - Compras rango N de tu pasiva en ranura Pk → cada bot sube a rango N la pasiva Pk de **su** clase.
  - Compras 1 carga de comodín **compartido** → cada bot recibe 1 carga del mismo.
  - Compras 1 carga de tu comodín **exclusivo** → cada bot recibe 1 carga del exclusivo de **su** clase.
  - La IA decide cuándo usarlos (p. ej. Llamado del Vínculo con ≥2 aliados derribados; Escudo Espectral bajo fuego intenso; Fortaleza Arcana con fortificaciones <40%).
- **No usan la tienda.** Armas fijas de clase:

| Clase del bot | Arma |
|---|---|
| Médico | Ametralladora básica |
| Apoyo | Ametralladora ligera |
| Ingeniero | Subfusil |
| Reconocimiento | Rifle de francotirador |

- Comportamiento: siguen al jugador o defienden la base, se cubren, reviven a derribados.
- **El bot Ingeniero repara fortificaciones por su cuenta** con una **herramienta de reparación de clase** (no se compra ni se pierde al morir):
  - Mismo haz y coste que la pistola de reparación (1 punto por cada 4 HP, de la bolsa común). Aplica sus pasivas de Ingeniero (Reparación experta), que suben en espejo con las tuyas.
  - Prioridad: piezas por debajo del 70% de HP, empezando por la más dañada en la ruta con enemigos activos. En preparación repara todo lo que esté por debajo del 100%.
  - No repara si está bajo fuego intenso ni si la bolsa quedaría por debajo de una **reserva mínima** (300 *(prov.)*) para no dejarte sin puntos.
  - No usa la reparación instantánea del radial (×1.5); eso solo lo decides tú.

## 7. Armas (stats base *(prov.)*)
| Arma | Daño | Cadencia | Cargador | Notas |
|---|---|---|---|---|
| Rifle de asalto (inicial) | 20 | 10/s | 60 | — |
| Pistola (inicial) | 35 | semi | 12 | — |
| Escopeta | 15 × 8 perdigones | 1.2/s | 6 | Daño cae >8 m |
| Rifle de francotirador | 150 (headshot ×2.5) | 0.8/s | 4 | Zoom con LT |
| Lanzacohetes | 300 en r3 | 0.5/s | 1 (4 de reserva) | Ideal contra jefes y Brutos |
| Ametralladora pesada | 18 | 15/s | 150 | −30% velocidad, sin cobertura |
| Pistola de reparación | 80 HP/s a fortificaciones | haz | — | 1 punto por cada 4 HP |
| *Bot* Ametralladora básica | 18 | 10/s | 60 | — |
| *Bot* Ametralladora ligera | 16 | 13/s | 100 | — |
| *Bot* Subfusil | 12 | 14/s | 40 | — |

- **Recarga activa** (segundo toque de RB durante la recarga; un solo intento), tres resultados:
  - **Buena** (zona ancha): solo acelera la recarga.
  - **Perfecta** (zona estrecha dentro de la buena): recarga rápida + **10% de daño durante 5 s** (con Recarga incendiaria, además DoT).
  - **Fallida** (fuera de la zona): arma **encasquillada 1.5 s**.
- **Fallida**: la recarga se queda encasquillada 1.5 s y luego termina sola.
- **Bonus de la perfecta** (+10% de daño 5 s): solo para **el arma recargada**. Si cambias de arma, la otra no lo tiene; si vuelves a la recargada antes de 5 s, el bonus sigue (el tiempo corre igual).
- **Melee (B) cancela la recarga** en curso (también durante la ventana de recarga activa): el golpe sale al instante, la recarga se pierde y hay que volver a recargar con RB.
- **Disparo a ciegas** desde cobertura (RT sin LT): permitido, con dispersión ×2.5.
- Cifras *(prov.)*: headshot **×2.0** (rifle de asalto y pistola), golpe cuerpo a cuerpo **50** de daño, munición de reserva inicial **240** (rifle) y **72** (pistola).
- **Granadas**: fragmentación 150 de daño en r4 · incendiaria con zona de fuego de 6 s (20/s) · aturdidora aturde 2 s en r5 (no a jefes).

## 8. Enemigos (robots, `RobotExpressive.glb` + geometría)
| Tipo | HP | Vel. | Daño | Rol / IA | Puntos |
|---|---|---|---|---|---|
| Rasero (soldado) | 150 | 3.5 m/s | 8 × rifle | Avanza de cobertura en cobertura, flanquea | 50 |
| Corredor | 60 | 6 | 15 melee | Rush directo; muy frenado por barreras | 30 |
| Tirador | 120 | 3 | 45 (cada 2.5 s, láser de aviso) | Se queda lejos, prioriza objetivos expuestos | 80 |
| Bruto | 700 | 2.5 | 40 melee / escopeta | Prioriza fortificaciones; daño ×3 a barreras | 200 |
| Explosivo | 40 | 5 | 120 en r3 | Busca señuelos/barreras/torretas y se inmola | 40 |
| **Jefe: Coloso** (oleadas 5, 15, 25) | 5000 | 2 | Pisotón AoE + cañón | Punto débil en la espalda; destruye barreras al pasar | 1000 |
| **Jefe: Matriarca** (oleadas 10, 20, 25) | 4000 | 2.5 | Invoca Corredores | Se protege tras escudo; vulnerable al invocar | 1000 |

## 9. IA: selección de objetivo
Utilidad, re-evaluación cada 0.5 s, histéresis +20% al objetivo actual.
```
score(t) = base[tipoEnemigo][tipoObjetivo] × aggroWeight(t) × visibilidad(t)
           × 1/(1 + dist/10) × (1 + 0.5·meDañóRecientemente(t))
```
- Candidatos: jugador, bots, señuelos, torretas/centinelas, barreras. Objetivos invisibles (Velo de Sombras) se excluyen.
- **Señuelo**: dentro de su radio, `aggroWeight` alto (Nv1 ×3 … Nv4 ×6) → atrae a casi todos salvo Tirador (resiste) y quien recibió daño en los últimos 2 s.
- **Barreras** no son objetivo preferente salvo para Bruto/Explosivo; son **obstáculos** con costo alto en el navGrid. Si la ruta más barata cruza la barrera, el enemigo se detiene y la ataca (y sufre su daño/ralentización).
- Movimiento: A* sobre grilla de 1 m, flow-field por ruta de spawn, separación local entre agentes.

## 10. Economía
- **Bolsa de equipo**: las bajas del jugador y de los bots suman a una bolsa común que gasta el jugador.
- Bajas: tabla §8; **headshot +50%**, **melee +25%**; × multiplicador de dificultad.
- Bono fin de oleada: `200 + 50·N`; +25% si ninguna fortificación fue destruida. Puntos iniciales: **600**.
- **Fortificaciones**: comprar (siempre Nv1) y mejorar **por pieza, en sitio** (X → Mejorar), solo hasta el nivel desbloqueado para su tipo en el fabricador.

| Fortificación | Comprar (Nv1) | Mejorar →Nv2 | →Nv3 | →Nv4 |
|---|---|---|---|---|
| Barrera | 300 | 450 | 800 | 1200 |
| Torreta manual | 700 | 600 | 1000 | 1500 |
| Centinela | 1000 | 800 | 1300 | 2000 |
| Señuelo | 400 | 400 | 700 | 1000 |

- **Reparar**: 1 punto por cada 4 HP con la pistola de reparación; en preparación también desde el radial de fortificación (reparación instantánea a ×1.5).
- **Destruida**: queda un armazón; X → Reconstruir al 50% del coste acumulado, conserva nivel.
- **Mover**: gratis, solo en preparación, conserva nivel. **No se vende.** **Sin límite** de piezas.

## 11. Fortificaciones por nivel (máx. 4)
**Barreras** (frenan, dañan y se desgastan con cada contacto)
| Nv | Forma | HP | Ralentiza | DPS contacto | Especial |
|---|---|---|---|---|---|
| 1 | Pinchos | 400 | 30% | 10 | — |
| 2 | Concertina (alambre redondo) | 700 | 50% | 20 | Enganche 0.5 s |
| 3 | Láser rojo | 1000 | 40% | 60 | Corredores no pueden cruzar |
| 4 | Láser azul (control) | 1500 | 60% | 80 | Congela 1.5 s al cruzar |

**Torreta manual** (sobrecalentamiento en vez de munición)
| Nv | Daño/bala | Cadencia | Calor máx | HP | Especial |
|---|---|---|---|---|---|
| 1 | 25 | 8/s | 4 s | 600 | — |
| 2 | 32 | 10/s | 6 s | 800 | Escudo frontal |
| 3 | 40 | 12/s | 8 s | 1100 | Ralentiza 15% al impactar |
| 4 | 40 + explosivo r1.5 | 12/s | 10 s | 1500 | Cohete alterno (RB) |

**Centinela** (automática)
| Nv | Alcance | Arco | Daño | Cadencia | HP | Especial |
|---|---|---|---|---|---|---|
| 1 | 15 m | 120° | 8 | 4/s | 400 | — |
| 2 | 20 m | 180° | 12 | 5/s | 600 | Prioriza Explosivos |
| 3 | 22 m | 360° | 15 | 6/s | 900 | Blindaje (−25% daño recibido) |
| 4 | 25 m | 360° | 18 | 8/s | 1200 | Balas incendiarias (DoT 10/s, 3 s) |

**Señuelo / maniquí**
| Nv | HP | Radio aggro | Peso | Especial |
|---|---|---|---|---|
| 1 | 500 | 8 m | ×3 | — |
| 2 | 900 | 12 m | ×4 | — |
| 3 | 1400 | 15 m | ×5 | Explota al destruirse (150 de daño, r4) |
| 4 | 2000 | 18 m | ×6 | Pulso de choque cada 8 s (aturde 1 s, r5) |

**Desgaste**: las barreras pierden HP al dañar/frenar (los láseres consumen "energía" = HP). Torretas, centinelas y señuelos solo pierden HP por daño enemigo.

## 12. Construcción con control
1. **Comprar**: en el fabricador (X) → pestaña Fortificaciones → A. La pieza (Nv1) pasa a **tus manos**: caminas más lento y no puedes disparar.
2. **Fantasma**: al acercarte a un lugar válido aparece el fantasma con *snap*: barreras a **slots de barrera** (cuellos de botella), centinelas y señuelos a **zonas de construcción** (rejilla de 1 m), torretas manuales a **plataformas**. Verde = válido, rojo = inválido.
3. **Rotar** LB/RB ±45°. **Colocar** RT. **Soltar** B (la pieza queda en el suelo; X para recogerla).
4. **Radial de fortificación**: toque X sobre una pieza (≤3 m) → radial. Apuntas con RS (o LS), **A confirma**, **B cierra**. El tiempo **no** se ralentiza (no sirve de pausa en plena oleada) y el jugador queda quieto mientras está abierto. El **centro** muestra nombre, nivel, HP y la comparación de stats con el siguiente nivel.

| Opción | Disponible | Efecto |
|---|---|---|
| **Mejorar** | Siempre, si el siguiente nivel está desbloqueado para el tipo | Sube un nivel pagando el coste de la tabla §10. Si no está desbloqueado: gris con "Desbloquéalo en el fabricador". |
| **Reparar** | Solo en preparación | Repara al 100% al instante a **×1.5** el coste de la pistola de reparación (la pistola sigue siendo la opción barata y la única durante la oleada). |
| **Mover** | Solo en preparación | La pieza vuelve a tus manos con su nivel. |
| **Rotar 90°** | Solo en preparación | Gira la pieza en sitio, si la nueva orientación es válida. |
| **Opción de tipo** | Siempre | Torreta manual: **Montar**. Centinela: **Prioridad** (más cercano → más fuerte → Explosivos primero, cíclico). Señuelo: **Provocar** (Nv2+: duplica su radio de aggro 5 s; cooldown 30 s). Barrera: **Info de desgaste** (HP/s perdido en la última oleada). |
| **Reconstruir** | Solo si está destruida (sustituye a todas las demás) | Reconstruye al 50% del coste acumulado, conserva nivel. |

5. **Reparar en oleada**: pistola de reparación, RT mantenido; el HUD muestra HP y coste/s.

## 13. Mapa fijo: "Puesto Avanzado" (~90×90 m)
- Base central elevada con **fabricador**, 2 plataformas de torreta manual y 3 zonas de construcción.
- **3 entradas** enemigas (Norte: patio abierto; Este: callejón estrecho; Oeste: rampa/puente) con rutas que convergen en 2 cuellos de botella → 6 slots de barrera.
- Coberturas **medias (1 m)** y **altas (2.2 m)**, pilares, contenedores; una torre para Tiradores enemigos.
- Iluminación: HemisphereLight + DirectionalLight con sombras (mapa 2048), niebla, focos en el fabricador, emisivos en láseres. Atardecer industrial.
- Datos en `level/maps/outpost.js`: `boxes[]`, `coverEdges[]` (generado), `spawns[]`, `routes[]`, `barrierSlots[]`, `buildZones[]`, `turretPads[]`, `fabricator`, `playerStart`.

## 14. Tabla de oleadas (presupuesto del director)
Coste por enemigo: Rasero 1 · Corredor 0.6 · Tirador 2 · Bruto 4 · Explosivo 1.2. Presupuesto `B(N) = 8 + 3·N`, ×1.25 por set. Simultáneos máx. `10 + N` (tope 30).
| Oleada | Disponibles | Notas |
|---|---|---|
| 1–2 | Rasero, Corredor | Solo Norte |
| 3–4 | + Tirador | Norte + Este |
| 5 | **Coloso** + escolta pequeña | Jefe |
| 6–9 | + Bruto, + Explosivo (8+) | 3 entradas |
| 10 | **Matriarca** + Corredores | Jefe |
| 11–24 | Todos, modificadores por set | Jefes en 15 y 20 |
| 25 | **Coloso + Matriarca** | Final → victoria |

## 15. Personajes y modelos (ligeros, ejemplos de three.js)
- Jugador y bots: `Soldier.glb` (Idle/Walk/Run) + poses procedurales, IK de brazos; color/accesorio por clase.
- Enemigos: `RobotExpressive.glb` (Idle, Walking, Running, Death, Jump, Punch…) teñido/escalado por tipo; Bruto ×1.4, jefes ×2.5 con piezas añadidas.
- Armas, torretas, barreras (pinchos, concertina con TubeGeometry helicoidal), láseres (shader aditivo), señuelo (maniquí de cápsulas), fabricador: **geometría procedural**.

## Fuentes del esquema de control (E-Day)
Guías de terceros, no oficiales; verificar en Ajustes > Controles del juego:
- [Wikipedia — Gears of War: E-Day](https://en.wikipedia.org/wiki/Gears_of_War:_E-Day)
- [keymap.io — Controls: Default Layout & All 5 Schemes](https://keymap.io/controls/gears-of-war-e-day/)
- [Game8 — All Controls List](https://game8.co/games/Gears-of-War-E-Day/archives/630661)
- [G2A — Movement guide](https://www.g2a.com/news/features/guide/gears-of-war-e-day-movement-guide-jumping-sliding-cover-and-what-changed/)
- [Magic Game World — Controls](https://www.magicgameworld.com/gears-of-war-e-day-controls-for-pc-and-controller/)
- [The Games Wiki — Settings and Controls](https://thegameswiki.com/gears-of-war-e-day/wiki/settings-and-controls)
