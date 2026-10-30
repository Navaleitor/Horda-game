// Mapa "Puesto Avanzado" (~90×90 m), hecho a mano. Dueño: level-designer. GDD §13.
//
// Convenciones (docs/arquitectura.md §3.1): metros, Y arriba. Norte = −Z, Este = +X.
// yaw = 0 mira a −Z; forward(yaw) = (−sin yaw, 0, −cos yaw).
//
// Vista cenital (Norte arriba):
//
//   z=-45 ┌──────────────────[ PUERTA N ]──────────────────────┐
//         │  PATIO NORTE (abierto): contenedores, coberturas,   │
//         │  pilares                          TORRE (tiradores) │
//         │                                                    │
//         │ TERRAZA O ─PUENTE─ESCALERA      ┌──────────────┐   │
//   z=-9  │ (spawn O)                 ┌─────┘ cuello A    └───┤
//         │                           │  PATIO INTERIOR       │ cuello B ── CALLEJÓN E (spawn E)
//         │                           │  galería de tiro      │
//         │                           │  ★ playerStart        │
//         │                           │   ┌── BASE (1.2 m) ─┐ │
//         │                           │   │  fabricador     │ │
//   z=45  └───────────────────────────┴───┴─────────────────┴─┴──────────┘
//
// Tipos de caja → material y tags (physics.addBox recibe min/max/tags):
//   floor, perimeter, wall, gate, coverLow, coverHigh, pillar, container, platform, stairs,
//   ramp, pad, tower, bridge, vault, climb.
// Las coberturas llevan siempre 'low' o 'high' explícito: hay coberturas bajas elevadas
// (parapetos de la base, barandillas del puente) cuya topY absoluta supera 1.4 m.

const boxes = [];

const TAGS = {
  floor: ['floor'],
  perimeter: ['wall', 'perimeter'],
  wall: ['wall', 'cover', 'high'],
  gate: ['wall', 'gate'],
  coverLow: ['cover', 'low'],
  coverHigh: ['cover', 'high'],
  pillar: ['pillar', 'cover', 'high'],
  container: ['container', 'cover', 'high'],
  platform: ['floor', 'platform'],
  stairs: ['floor', 'stairs'],
  ramp: ['floor', 'stairs', 'ramp'],
  pad: ['floor', 'turretPad'],
  tower: ['tower', 'pillar'],
  towerDeck: ['floor', 'tower'],
  bridge: ['floor', 'bridge'],
  vault: ['obstacle', 'vault', 'cover', 'low'],
  climb: ['obstacle', 'climb', 'cover', 'high'],
};

/** Caja por rangos: x∈[x0,x1], z∈[z0,z1], y∈[y0,y0+h]. */
function B(type, x0, x1, z0, z1, h, y0 = 0, name = undefined) {
  const tags = TAGS[type];
  if (!tags) throw new Error(`[outpost] tipo de caja desconocido: ${type}`);
  boxes.push({ type, name, tags: tags.slice(), min: [x0, y0, z0], max: [x1, y0 + h, z1] });
}

const H_PERIM = 6;
const H_WALL = 3.5;
const LOW = 1.0;   // cobertura media (§13)
const HIGH = 2.2;  // cobertura alta (§13)
const CONT = 2.6;  // contenedor

// ── Suelo ──────────────────────────────────────────────────────────────────
B('floor', -46, 46, -46, 46, 0.5, -0.5, 'suelo');

// ── Muros perimetrales (6 m) con portones cerrados en las 3 entradas ───────
B('perimeter', -46, -7, -46, -45, H_PERIM, 0, 'perimetro-N-oeste');
B('perimeter', 7, 46, -46, -45, H_PERIM, 0, 'perimetro-N-este');
B('gate', -7, 7, -46, -45.3, 5, 0, 'porton-norte');
B('perimeter', -46, 46, 45, 46, H_PERIM, 0, 'perimetro-S');
B('perimeter', -46, -45, -45, -3, H_PERIM, 0, 'perimetro-O-norte');
B('perimeter', -46, -45, 3, 45, H_PERIM, 0, 'perimetro-O-sur');
B('gate', -46, -45.3, -3, 3, 5.4, 0, 'porton-oeste');
B('perimeter', 45, 46, -45, 5, H_PERIM, 0, 'perimetro-E-norte');
B('perimeter', 45, 46, 8.5, 45, H_PERIM, 0, 'perimetro-E-sur');
B('gate', 45.3, 46, 5, 8.5, 5, 0, 'porton-este');

// ── Recinto interior (3.5 m) con los 2 cuellos de botella ─────────────────
// Cuello A (noroeste): hueco x∈[-14,-6] en el muro norte (z≈-8.5).
B('wall', -21, -14, -9, -8, H_WALL, 0, 'recinto-N-oeste');
B('wall', -6, 21, -9, -8, H_WALL, 0, 'recinto-N-este');
B('pillar', -15.2, -14, -9.2, -7.8, 4.5, 0, 'poste-cuelloA-O');
B('pillar', -6, -4.8, -9.2, -7.8, 4.5, 0, 'poste-cuelloA-E');
// Cuello B (este): hueco z∈[2,10] en el muro este (x≈20.5).
B('wall', -21, -20, -8, 45, H_WALL, 0, 'recinto-O');
B('wall', 20, 21, -8, 2, H_WALL, 0, 'recinto-E-norte');
B('wall', 20, 21, 10, 45, H_WALL, 0, 'recinto-E-sur');
B('pillar', 19.8, 21.2, 0.8, 2, 4.5, 0, 'poste-cuelloB-N');
B('pillar', 19.8, 21.2, 10, 11.2, 4.5, 0, 'poste-cuelloB-S');

// ── Callejón Este (estrecho, 4.5 m) ────────────────────────────────────────
B('wall', 30, 45, 3.5, 4.5, 4, 0, 'callejon-N');
B('wall', 21, 45, 9, 10, 4, 0, 'callejon-S');
B('pillar', 36, 36.8, 4.5, 5.3, 4, 0, 'callejon-tuberia');     // estrecha aún más un tramo
B('coverLow', 39, 40.2, 7.6, 9, LOW, 0, 'callejon-cajas');

// ── Entrada Oeste: terraza elevada (2.4 m) → puente → escalera hacia el este ─
B('platform', -45, -39, -5, 5, 2.4, 0, 'terraza-oeste');
B('coverLow', -45, -39, -5, -4.7, LOW, 2.4, 'terraza-baranda-N');
B('coverLow', -45, -39, 4.7, 5, LOW, 2.4, 'terraza-baranda-S');
B('bridge', -39, -33, -2, 2, 0.45, 1.95, 'puente');
B('coverLow', -39, -33, -2, -1.75, LOW, 2.4, 'puente-baranda-N');
B('coverLow', -39, -33, 1.75, 2, LOW, 2.4, 'puente-baranda-S');
B('tower', -36.3, -35.7, -2.6, -2, 1.95, 0, 'puente-apoyo-N');
B('tower', -36.3, -35.7, 2, 2.6, 1.95, 0, 'puente-apoyo-S');
// Escalones de 0.3 m (física AABB: step-up 0.35) bajando hacia el este.
for (let k = 1; k <= 7; k++) {
  const x0 = -33 + (k - 1) * 0.9;
  B('ramp', x0, x0 + 0.9, -2, 2, +(2.4 - 0.3 * k).toFixed(2), 0, `rampa-oeste-${k}`);
}
B('wall', -45, -21, 14, 15, H_WALL, 0, 'cierre-oeste-sur');

// ── Base central elevada (1.2 m) ───────────────────────────────────────────
const BASE_Y = 1.2;
B('platform', -10, 10, 18, 32, BASE_Y, 0, 'base');
// Escaleras: norte (frente), oeste y este. Escalones de 0.3 m.
for (let k = 1; k <= 3; k++) {
  const d = 0.6;
  B('stairs', -3, 3, 18 - d * (4 - k), 18 - d * (3 - k), 0.3 * k, 0, `escalera-N-${k}`);
  B('stairs', -10 - d * (4 - k), -10 - d * (3 - k), 23, 27, 0.3 * k, 0, `escalera-O-${k}`);
  B('stairs', 10 + d * (3 - k), 10 + d * (4 - k), 23, 27, 0.3 * k, 0, `escalera-E-${k}`);
}
// Parapetos (cobertura baja sobre la base).
B('coverLow', -10, -4, 18, 18.4, LOW, BASE_Y, 'parapeto-N-O');
B('coverLow', 4, 10, 18, 18.4, LOW, BASE_Y, 'parapeto-N-E');
B('coverLow', -10, -9.6, 18.4, 22.5, LOW, BASE_Y, 'parapeto-O-1');
B('coverLow', -10, -9.6, 27.5, 32, LOW, BASE_Y, 'parapeto-O-2');
B('coverLow', 9.6, 10, 18.4, 22.5, LOW, BASE_Y, 'parapeto-E-1');
B('coverLow', 9.6, 10, 27.5, 32, LOW, BASE_Y, 'parapeto-E-2');
B('coverLow', -10, 10, 31.6, 32, LOW, BASE_Y, 'parapeto-S');
// Plataformas de torreta (0.3 m sobre la base).
B('pad', -8.5, -5.5, 19, 22, 0.3, BASE_Y, 'torreta-O');
B('pad', 5.5, 8.5, 19, 22, 0.3, BASE_Y, 'torreta-E');
// Pilares alrededor del fabricador.
B('pillar', -3.3, -2.7, 23.7, 24.3, 3.5, BASE_Y, 'pilar-fab-1');
B('pillar', 2.7, 3.3, 23.7, 24.3, 3.5, BASE_Y, 'pilar-fab-2');
B('pillar', -3.3, -2.7, 29.7, 30.3, 3.5, BASE_Y, 'pilar-fab-3');
B('pillar', 2.7, 3.3, 29.7, 30.3, 3.5, BASE_Y, 'pilar-fab-4');

// ── Patio interior: zona de pruebas junto a playerStart ────────────────────
// Grupo bajo alineado (z≈10): huecos de 1.2 y 1.5 m → SWAT turn / deslizar a la contigua.
B('coverLow', -10.4, -7.9, 9.7, 10.3, LOW, 0, 'prueba-baja-1');
B('coverLow', -6.7, -4.2, 9.7, 10.3, LOW, 0, 'prueba-baja-2');
B('coverLow', -2.7, -0.2, 9.7, 10.3, LOW, 0, 'prueba-baja-3');
// Grupo alto alineado (z≈10): hueco de 1.2 m.
B('coverHigh', 1.5, 4.0, 9.6, 10.4, HIGH, 0, 'prueba-alta-1');
B('coverHigh', 5.2, 7.7, 9.6, 10.4, HIGH, 0, 'prueba-alta-2');
// Grupo alto orientado en Z (oeste): hueco de 1.2 m.
B('coverHigh', -14.4, -13.6, 11, 13.5, HIGH, 0, 'prueba-alta-3');
B('coverHigh', -14.4, -13.6, 14.7, 17.2, HIGH, 0, 'prueba-alta-4');
// Saltable (0.9 m, Y = vault) y trepable (2.0 m, Y = climb), al este del inicio.
B('vault', 9.5, 10, 12, 16, 0.9, 0, 'obstaculo-saltable');
B('climb', 13, 15, 12.5, 15.5, 2.0, 0, 'obstaculo-trepable');
// Coberturas de la galería de tiro.
B('coverLow', -10, -7, -1, -0.4, LOW, 0, 'galeria-baja');
B('coverHigh', 7.5, 10.4, -2.6, -1.8, HIGH, 0, 'galeria-alta');
B('coverHigh', 13.6, 14.4, -1, 1.5, HIGH, 0, 'defensa-cuelloB');

// ── Patio norte (abierto) ──────────────────────────────────────────────────
B('container', -36, -30, -24, -21.6, CONT, 0, 'contenedor-1');
B('container', -2, 4, -22, -19.6, CONT, 0, 'contenedor-2');
B('container', 32, 34.4, -24, -18, CONT, 0, 'contenedor-3');
B('container', 32, 34.4, -23.5, -18.5, CONT, CONT, 'contenedor-3-apilado');
B('container', 8, 14, -14, -11.6, CONT, 0, 'contenedor-4');
B('coverLow', -9, -6, -34.3, -33.7, LOW, 0, 'patio-baja-1');
B('coverLow', 4, 7, -28.3, -27.7, LOW, 0, 'patio-baja-2');
B('coverLow', -22, -19, -16.3, -15.7, LOW, 0, 'patio-baja-3');
B('coverLow', 23, 26, -20.3, -19.7, LOW, 0, 'patio-baja-4');
B('coverLow', -1.5, 1.5, -14.3, -13.7, LOW, 0, 'patio-baja-5');
B('coverLow', 28, 31, -10.3, -9.7, LOW, 0, 'patio-baja-6');
B('coverLow', 36, 39, -4.3, -3.7, LOW, 0, 'patio-baja-7');
B('coverLow', -33, -30, -8.3, -7.7, LOW, 0, 'patio-baja-8');
B('coverHigh', -14, -11.5, -22.4, -21.6, HIGH, 0, 'patio-alta-1');
B('coverHigh', 14, 16.5, -32.4, -31.6, HIGH, 0, 'patio-alta-2');
B('coverHigh', 33, 35.5, -6.4, -5.6, HIGH, 0, 'patio-alta-3');
B('coverHigh', -30, -29.2, -18, -15.5, HIGH, 0, 'patio-alta-4');
B('pillar', -4.6, -3.4, -12.6, -11.4, 5, 0, 'pilar-1');
B('pillar', 5.4, 6.6, -16.6, -15.4, 5, 0, 'pilar-2');
B('pillar', 23.4, 24.6, -26.6, -25.4, 5, 0, 'pilar-3');
B('pillar', -26.6, -25.4, -26.6, -25.4, 5, 0, 'pilar-4');

// ── Torre de tiradores (cubierta a 6 m) ────────────────────────────────────
B('tower', 27, 27.8, -38, -37.2, 5.6, 0, 'torre-pata-1');
B('tower', 31.2, 32, -38, -37.2, 5.6, 0, 'torre-pata-2');
B('tower', 27, 27.8, -33.8, -33, 5.6, 0, 'torre-pata-3');
B('tower', 31.2, 32, -33.8, -33, 5.6, 0, 'torre-pata-4');
B('towerDeck', 27, 32, -38, -33, 0.4, 5.6, 'torre-cubierta');
B('coverLow', 27, 32, -33.3, -33, LOW, 6, 'torre-parapeto-S');
B('coverLow', 27, 27.3, -38, -33.3, LOW, 6, 'torre-parapeto-O');
B('coverLow', 31.7, 32, -38, -33.3, LOW, 6, 'torre-parapeto-E');
B('tower', 29, 30.5, -38.3, -38, 6, 0, 'torre-escalerilla');

// ── Zonas muertas (decorado de skyline, fuera del recorrido) ───────────────
B('container', 30, 36, 20, 22.4, CONT, 0, 'decor-contenedor-1');
B('container', 34, 36.4, 30, 36, CONT, 0, 'decor-contenedor-2');
B('container', 30, 36, 20.2, 22.2, CONT, CONT, 'decor-contenedor-3');
B('container', -40, -34, 24, 26.4, CONT, 0, 'decor-contenedor-4');

// ── Puntos de juego ────────────────────────────────────────────────────────

/** yaw para mirar desde (x,z) hacia (tx,tz) según el contrato. */
function faceTo(x, z, tx, tz) {
  return Math.atan2(-(tx - x), -(tz - z));
}

const playerStart = { pos: [0.65, 0, 14], yaw: 0 };
const PX = playerStart.pos[0];
const PZ = playerStart.pos[2];

const spawns = [
  { id: 'north', name: 'Norte', kind: 'patio abierto', pos: [0, 0, -41], yaw: Math.PI },
  { id: 'east', name: 'Este', kind: 'callejón estrecho', pos: [42, 0, 6.75], yaw: Math.PI / 2 },
  { id: 'west', name: 'Oeste', kind: 'rampa/puente', pos: [-42, 2.4, 0], yaw: -Math.PI / 2 },
];

// Tramo final común a las rutas que entran por cada cuello.
const insideA = [[-10, 0, -8.5], [-12.5, 0, -3], [-12.5, 0, 8], [-12.5, 0, 25], [-8, 1.2, 25], [-1.5, 1.2, 26]];
const insideB = [[20.5, 0, 6], [16.5, 0, 6], [16.5, 0, 25], [8, 1.2, 25], [1.5, 1.2, 26]];

const routes = [
  { id: 'north-A', spawn: 'north', choke: 'A', points: [[0, 0, -41], [-4, 0, -28], [-10, 0, -14], ...insideA] },
  { id: 'north-B', spawn: 'north', choke: 'B', points: [[0, 0, -41], [8, 0, -36], [16, 0, -24], [26, 0, -6], [25, 0, 6], ...insideB] },
  { id: 'east-B', spawn: 'east', choke: 'B', points: [[42, 0, 6.75], [25, 0, 6.5], ...insideB] },
  { id: 'west-A', spawn: 'west', choke: 'A', points: [[-42, 2.4, 0], [-36, 2.4, 0], [-25.5, 0, 0], [-25, 0, -12], [-12, 0, -12], ...insideA] },
];

// 6 slots: 3 por cuello, en línea a lo ancho del hueco. yaw = hacia donde llega el enemigo.
const barrierSlots = [
  { id: 'A1', choke: 'A', pos: [-12.67, 0, -8.5], yaw: 0, width: 2.6 },
  { id: 'A2', choke: 'A', pos: [-10, 0, -8.5], yaw: 0, width: 2.6 },
  { id: 'A3', choke: 'A', pos: [-7.33, 0, -8.5], yaw: 0, width: 2.6 },
  { id: 'B1', choke: 'B', pos: [20.5, 0, 3.33], yaw: -Math.PI / 2, width: 2.6 },
  { id: 'B2', choke: 'B', pos: [20.5, 0, 6], yaw: -Math.PI / 2, width: 2.6 },
  { id: 'B3', choke: 'B', pos: [20.5, 0, 8.67], yaw: -Math.PI / 2, width: 2.6 },
];

const buildZones = [
  { id: 'Z1', name: 'Tras el cuello A', pos: [-10, 0, -3], size: [10, 6] },
  { id: 'Z2', name: 'Tras el cuello B', pos: [16, 0, 6], size: [6, 10] },
  { id: 'Z3', name: 'Flanco oeste de la base', pos: [-15, 0, 26], size: [8, 8] },
];

const turretPads = [
  { id: 'T-O', pos: [-7, BASE_Y + 0.3, 20.5], yaw: 0 },
  { id: 'T-E', pos: [7, BASE_Y + 0.3, 20.5], yaw: 0 },
];

const fabricator = { pos: [0, BASE_Y, 27], yaw: 0 };

const sniperPositions = [
  { id: 'torre', pos: [29.5, 6, -34], yaw: faceTo(29.5, -34, 0, 10) },
  { id: 'puente', pos: [-36, 2.4, 0], yaw: faceTo(-36, 0, -10, -8) },
];

// Dianas (Fase 1a). Todas miran a playerStart.
function T(id, group, x, y, z) {
  return { id, group, pos: [x, y, z], yaw: faceTo(x, z, PX, PZ) };
}
const targets = [
  T('D1', 'galeria', -3, 0, 3),        // ~11.6 m
  T('D2', 'galeria', 2.5, 0, 1),       // ~13.1 m
  T('D3', 'galeria', 5, 0, -4),        // ~18.5 m
  T('D4', 'cobertura', -8.5, 0, -2),   // ~18.4 m, tras 'galeria-baja' (solo asoma el torso)
  T('D5', 'cobertura', 11.5, 0, -4),   // ~21 m, medio tapada por 'galeria-alta'
  T('D6', 'galeria', -15, 0, -5),      // ~25 m
  T('D7', 'galeria', 15, 0, -6),       // ~24.6 m
  T('D8', 'galeria', 17, 0, 2),        // ~20.2 m, junto al cuello B
  T('D9', 'lejana', -22, 0, -34),      // ~53 m, visible a través del cuello A
];

const outpost = {
  id: 'outpost',
  name: 'Puesto Avanzado',
  size: 90,
  bounds: { min: [-45, 0, -45], max: [45, 0, 45] },
  boxes,
  spawns,
  routes,
  barrierSlots,
  buildZones,
  turretPads,
  fabricator,
  sniperPositions,
  playerStart,
  targets,
};

export default outpost;
