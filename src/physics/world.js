// Mundo de física sin dependencias de `game` (lo usan index.js y los tests). Dueño: physics-engineer.
// Construye la API del servicio `physics` (docs/arquitectura.md §3.7).

import { Vector3 } from 'three';
import { createSpatialHash } from './spatialHash.js';
import { moveCapsule, separateAgents } from './collision.js';
import { raycast } from './raycast.js';
import { queryCover, coverSlide, queryAdjacentCover, querySwat, queryLedge, coverClass } from './cover.js';

function v3(a, i) {
  return Array.isArray(a) || ArrayBuffer.isView(a) ? a[i] : (i === 0 ? a.x : i === 1 ? a.y : a.z);
}

export function createPhysicsWorld(config) {
  const P = config.physics;
  const w = {
    config, P, C: config.cover, PL: config.player,
    boxes: [],      // boxes[id - 1]
    entities: [],   // entidades con hitboxes (índice = id en el hash dinámico)
    statics: createSpatialHash(P.hashCellSize),
    dynamic: createSpatialHash(P.hashCellSize),
    dynamicDirty: false,
    groundPlane: P.groundPlane !== false,
    groundY: P.groundY || 0,
    rebuildDynamic,
  };

  function insertEntity(idx) {
    const e = w.entities[idx];
    const hbs = e.hitboxes;
    if (!hbs || hbs.length === 0) return;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let j = 0; j < hbs.length; j++) {
      const mn = hbs[j].min, mx = hbs[j].max;
      if (mn.x < minX) minX = mn.x; if (mn.z < minZ) minZ = mn.z;
      if (mx.x > maxX) maxX = mx.x; if (mx.z > maxZ) maxZ = mx.z;
    }
    const m = P.dynamicMargin;
    w.dynamic.insert(idx, minX - m, minZ - m, maxX + m, maxZ + m);
  }

  function rebuildDynamic() {
    w.dynamic.clear();
    for (let i = 0; i < w.entities.length; i++) insertEntity(i);
    w.dynamicDirty = false;
  }

  const moveOut = { grounded: false, hitWall: false, wallNormal: new Vector3(), hitCeiling: false, stepped: false };
  const rayOut = { point: new Vector3(), normal: new Vector3(), distance: 0, entity: null, part: null, boxId: null };

  const api = {
    /** Caja estática. desc = { min:[x,y,z]|Vector3, max, tags?:string[] } → id (≥ 1). */
    addBox(desc) {
      const a = desc.min, b = desc.max;
      const tags = desc.tags ? desc.tags.slice() : [];
      const box = {
        id: w.boxes.length + 1,
        minX: Math.min(v3(a, 0), v3(b, 0)), minY: Math.min(v3(a, 1), v3(b, 1)), minZ: Math.min(v3(a, 2), v3(b, 2)),
        maxX: Math.max(v3(a, 0), v3(b, 0)), maxY: Math.max(v3(a, 1), v3(b, 1)), maxZ: Math.max(v3(a, 2), v3(b, 2)),
        tags,
        coverTag: tags.indexOf('cover') >= 0,
        noCover: tags.indexOf('nocover') >= 0 || tags.indexOf('floor') >= 0,
        forced: tags.indexOf('low') >= 0 ? 1 : (tags.indexOf('high') >= 0 ? 2 : 0),
      };
      w.boxes.push(box);
      w.statics.insert(box.id, box.minX, box.minZ, box.maxX, box.maxZ);
      return box.id;
    },
    /** Datos de una caja (solo lectura): { id, minX..maxZ, tags }. */
    getBox(id) { return w.boxes[id - 1] || null; },
    /** Borra todas las cajas (recarga de nivel). */
    clearBoxes() {
      w.boxes.length = 0;
      w.statics.clear();
    },

    addEntity(entity) {
      if (w.entities.indexOf(entity) >= 0) return;
      w.entities.push(entity);
      insertEntity(w.entities.length - 1);
    },
    removeEntity(entity) {
      const i = w.entities.indexOf(entity);
      if (i < 0) return;
      w.entities.splice(i, 1);
      w.dynamicDirty = true;
    },
    /** Reconstruye el índice de hitboxes (lo llama el sistema en cada paso fijo). */
    updateDynamic() { rebuildDynamic(); },

    moveCapsule(cap, delta) { return moveCapsule(w, cap, delta, moveOut); },
    raycast(origin, dir, maxDist, opts) { return raycast(w, origin, dir, maxDist, opts, rayOut); },
    /** Variante con objeto de salida propio (para no pisar el resultado compartido). */
    raycastInto(origin, dir, maxDist, opts, out) { return raycast(w, origin, dir, maxDist, opts, out); },
    /** Línea de visión estática entre dos puntos (true = despejada). */
    lineOfSight(a, b) {
      _d.subVectors(b, a);
      const len = _d.length();
      if (len < 1e-6) return true;
      return raycast(w, a, _d, len, null, losOut) === null;
    },

    queryCover(pos, dir, maxDist) { return queryCover(w, pos, dir, maxDist); },
    coverSlide(info, side, pos) { return coverSlide(w, info, side, pos); },
    queryAdjacentCover(info, side, maxDist) { return queryAdjacentCover(w, info, side, maxDist); },
    querySwat(info, side, maxGap) { return querySwat(w, info, side, maxGap); },
    queryLedge(pos, forward) { return queryLedge(w, pos, forward); },

    /** Clase de cobertura de una caja para unos pies en y: null | 'low' | 'high'. */
    coverClassOf(boxId, y = 0) {
      const b = w.boxes[boxId - 1];
      const c = b ? coverClass(w, b, y) : 0;
      return c === 1 ? 'low' : c === 2 ? 'high' : null;
    },
    separateAgents,
    stats() {
      return { boxes: w.boxes.length, entities: w.entities.length, staticCells: w.statics.stats().cells };
    },
  };
  const _d = new Vector3();
  const losOut = { point: new Vector3(), normal: new Vector3(), distance: 0, entity: null, part: null, boxId: null };

  return { world: w, api };
}
