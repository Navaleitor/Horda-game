// Construye el blockout del mapa a partir de los datos (maps/*.js). Dueño: level-designer.
//
// - Geometría fusionada por material (1 draw call por material, + su pase de sombra).
// - UV en espacio de mundo (config.level.uvTile m por baldosa) con una única CanvasTexture de
//   rejilla compartida por todos los materiales (tintada por el color del material).
// - Registra cada caja en physics.addBox({ min, max, tags }).
// - Genera coverEdges[] (caras útiles de cada cobertura) para IA/QA.
// - Marcadores de debug (fabricador, slots, zonas, plataformas, spawns, tiradores, rutas):
//   solo visuales, fusionados en 2 draw calls (cajas con color por vértice + líneas).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Paleta blockout de atardecer industrial. type de caja → material.
const MATERIAL_OF = {
  floor: 'floor',
  perimeter: 'wall', wall: 'wall',
  gate: 'metal', tower: 'metal', towerDeck: 'metal', bridge: 'metal',
  coverLow: 'coverLow',
  coverHigh: 'coverHigh',
  pillar: 'pillar',
  container: 'container',
  platform: 'concrete', stairs: 'concrete', ramp: 'concrete', pad: 'pad',
  vault: 'hazard', climb: 'hazard',
};

const MATERIALS = {
  floor:     { color: 0x6e655c, roughness: 0.95, metalness: 0.0, shadow: false },
  wall:      { color: 0x8a8079, roughness: 0.9,  metalness: 0.0, shadow: true },
  concrete:  { color: 0xa39a8c, roughness: 0.85, metalness: 0.0, shadow: true },
  coverLow:  { color: 0xc98b3c, roughness: 0.7,  metalness: 0.1, shadow: true },
  coverHigh: { color: 0x4f8296, roughness: 0.6,  metalness: 0.2, shadow: true },
  pillar:    { color: 0x77706a, roughness: 0.8,  metalness: 0.1, shadow: true },
  container: { color: 0x9a3f2c, roughness: 0.6,  metalness: 0.3, shadow: true },
  metal:     { color: 0x4a5056, roughness: 0.5,  metalness: 0.55, shadow: true },
  pad:       { color: 0x3c6bb0, roughness: 0.5,  metalness: 0.3, shadow: true },
  hazard:    { color: 0xd8c040, roughness: 0.6,  metalness: 0.1, shadow: true },
};

// Colores de marcadores (debug).
const MARKER_COLORS = {
  fabricator: 0x3fe0ff,
  barrier: 0xff8a1f,
  buildZone: 0x40e070,
  turretPad: 0x4a8cff,
  spawn: 0xff3030,
  sniper: 0xc050ff,
};
const ROUTE_COLORS = [0xff5050, 0xffd040, 0x50d0ff, 0x90ff60, 0xff70ff];

function makeGridTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#dcdcdc';
  g.fillRect(0, 0, S, S);
  // Ruido suave determinista (sin Math.random: LCG local).
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 900; i++) {
    const v = 200 + Math.floor(rnd() * 40);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.floor(rnd() * S), Math.floor(rnd() * S), 2 + Math.floor(rnd() * 5), 2 + Math.floor(rnd() * 5));
  }
  // Línea media (1 m) y borde (2 m).
  g.fillStyle = '#b4b4b4';
  g.fillRect(S / 2 - 1, 0, 2, S);
  g.fillRect(0, S / 2 - 1, S, 2);
  g.fillStyle = '#8c8c8c';
  g.fillRect(0, 0, S, 3);
  g.fillRect(0, 0, 3, S);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  return tex;
}

/** BoxGeometry posicionada en mundo con UV planares de mundo. */
function worldBox(min, max, tile) {
  const sx = max[0] - min[0], sy = max[1] - min[1], sz = max[2] - min[2];
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  geo.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  const k = 1 / tile;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ny > 0.5) uv.setXY(i, x * k, z * k);
    else if (nx > 0.5) uv.setXY(i, z * k, y * k);
    else uv.setXY(i, x * k, y * k);
  }
  return geo;
}

function coloredBox(sx, sy, sz, cx, cy, cz, color, yaw = 0) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  if (yaw) geo.rotateY(yaw);
  geo.translate(cx, cy, cz);
  const col = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Bordes de cobertura: las 4 caras verticales de cada caja con tag 'cover'.
 * normal = sale de la cobertura (lado desde el que se cubre el jugador).
 */
function buildCoverEdges(boxes) {
  const edges = [];
  boxes.forEach((b, i) => {
    if (!b.tags.includes('cover')) return;
    const height = b.tags.includes('low') ? 'low' : 'high';
    const [x0, , z0] = b.min, [x1, topY, z1] = b.max;
    const faces = [
      { a: [x0, z0], b: [x1, z0], normal: [0, -1] },
      { a: [x1, z1], b: [x0, z1], normal: [0, 1] },
      { a: [x0, z1], b: [x0, z0], normal: [-1, 0] },
      { a: [x1, z0], b: [x1, z1], normal: [1, 0] },
    ];
    for (const f of faces) {
      const len = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
      if (len < 0.5) continue; // caras demasiado estrechas para cubrirse
      edges.push({ box: i, name: b.name, height, topY, baseY: b.min[1], len: +len.toFixed(2), ...f });
    }
  });
  return edges;
}

/**
 * @param {object} game
 * @param {object} data  datos del mapa
 * @returns {{ group, markers, coverEdges, boxIds, meshCount, setMarkersVisible(v), dispose() }}
 */
export function buildLevel(game, data) {
  const cfg = game.config.level;
  const physics = game.service('physics');
  const group = new THREE.Group();
  group.name = 'level';

  // ── Registro en física ───────────────────────────────────────────────────
  const boxIds = data.boxes.map((b) => physics.addBox({ min: b.min.slice(), max: b.max.slice(), tags: b.tags.slice() }));

  // ── Geometría fusionada por material ─────────────────────────────────────
  const tex = makeGridTexture();
  const byMat = new Map();
  for (const b of data.boxes) {
    const m = MATERIAL_OF[b.type];
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(worldBox(b.min, b.max, cfg.uvTile));
  }
  const materials = [];
  for (const [key, parts] of byMat) {
    const def = MATERIALS[key];
    const geo = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({
      name: `level.${key}`, color: def.color, roughness: def.roughness, metalness: def.metalness, map: tex,
    });
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `level.${key}`;
    mesh.castShadow = def.shadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  const meshCount = byMat.size;

  // ── Marcadores de debug ──────────────────────────────────────────────────
  const markers = new THREE.Group();
  markers.name = 'level-markers';
  const mparts = [];
  const C = MARKER_COLORS;
  {
    const f = data.fabricator.pos;
    mparts.push(coloredBox(2.4, 1.8, 1.4, f[0], f[1] + 0.9, f[2], C.fabricator, data.fabricator.yaw));
    mparts.push(coloredBox(4, 0.04, 4, f[0], f[1] + 0.03, f[2], C.fabricator));
  }
  for (const s of data.barrierSlots) {
    mparts.push(coloredBox(s.width - 0.15, 1.1, 0.25, s.pos[0], s.pos[1] + 0.55, s.pos[2], C.barrier, s.yaw));
    mparts.push(coloredBox(s.width - 0.15, 0.04, 1.2, s.pos[0], s.pos[1] + 0.03, s.pos[2], C.barrier, s.yaw));
  }
  for (const z of data.buildZones) {
    mparts.push(coloredBox(z.size[0], 0.05, z.size[1], z.pos[0], z.pos[1] + 0.04, z.pos[2], C.buildZone));
  }
  for (const t of data.turretPads) {
    mparts.push(coloredBox(1, 1.0, 1, t.pos[0], t.pos[1] + 0.5, t.pos[2], C.turretPad, t.yaw));
  }
  for (const s of data.spawns) {
    mparts.push(coloredBox(1.6, 5, 1.6, s.pos[0], s.pos[1] + 2.5, s.pos[2], C.spawn));
  }
  for (const s of data.sniperPositions || []) {
    mparts.push(coloredBox(0.8, 1.8, 0.8, s.pos[0], s.pos[1] + 0.9, s.pos[2], C.sniper));
  }
  const routePos = [];
  const routeCol = [];
  data.routes.forEach((r, ri) => {
    const col = new THREE.Color(ROUTE_COLORS[ri % ROUTE_COLORS.length]);
    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i];
      mparts.push(coloredBox(0.3, 0.3, 0.3, p[0], p[1] + 0.25, p[2], col.getHex()));
      if (i === 0) continue;
      const a = r.points[i - 1];
      routePos.push(a[0], a[1] + 0.25 + ri * 0.04, a[2], p[0], p[1] + 0.25 + ri * 0.04, p[2]);
      routeCol.push(col.r, col.g, col.b, col.r, col.g, col.b);
    }
  });
  const markerGeo = mergeGeometries(mparts, false);
  for (const p of mparts) p.dispose();
  const markerMat = new THREE.MeshBasicMaterial({
    name: 'level.markers', vertexColors: true, transparent: true, opacity: cfg.markerOpacity,
    depthWrite: false, fog: false,
  });
  const markerMesh = new THREE.Mesh(markerGeo, markerMat);
  markerMesh.name = 'level.markers';
  markerMesh.renderOrder = 10;
  markerMesh.matrixAutoUpdate = false;
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(routePos, 3));
  lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(routeCol, 3));
  const lineMat = new THREE.LineBasicMaterial({
    name: 'level.routes', vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, fog: false,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.name = 'level.routes';
  lines.renderOrder = 11;
  lines.matrixAutoUpdate = false;
  markers.add(markerMesh, lines);
  markers.visible = !!cfg.showDebugMarkers;

  group.add(markers);
  game.scene.add(group);
  group.updateMatrixWorld(true);

  const coverEdges = buildCoverEdges(data.boxes);

  return {
    group,
    markers,
    coverEdges,
    boxIds,
    meshCount,
    setMarkersVisible(v) { markers.visible = !!v; },
    dispose() {
      game.scene.remove(group);
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const m of materials) m.dispose();
      markerMat.dispose();
      lineMat.dispose();
      tex.dispose();
    },
  };
}
