// Raycast contra AABB estáticas (hash espacial, recorrido DDA de celdas XZ) y hitboxes de entidades
// registradas (hash dinámico). Dueño: physics-engineer.
//
// - Slab test por caja; las cajas que contienen el origen se ignoran (el rayo "sale" de ellas).
// - Hitboxes: entity.hitboxes = [{ part:'head'|'body', min:Vector3, max:Vector3 }] en mundo.
//   Se ignoran entidades con alive === false y la entidad `opts.ignore`.
// - Plano de suelo implícito (config.physics.groundPlane) → boxId 0.
// - Sin allocaciones: el resultado es el objeto `out` del llamador.

let _t = 0, _axis = 0, _sgn = 0;

function slab(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, tMax) {
  let tN = -Infinity, tF = Infinity, axis = -1, sgn = 0;
  if (Math.abs(dx) < 1e-12) { if (ox < minX || ox > maxX) return false; }
  else {
    let a = (minX - ox) / dx, b = (maxX - ox) / dx;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > tN) { tN = a; axis = 0; sgn = dx > 0 ? -1 : 1; }
    if (b < tF) tF = b;
  }
  if (Math.abs(dy) < 1e-12) { if (oy < minY || oy > maxY) return false; }
  else {
    let a = (minY - oy) / dy, b = (maxY - oy) / dy;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > tN) { tN = a; axis = 1; sgn = dy > 0 ? -1 : 1; }
    if (b < tF) tF = b;
  }
  if (Math.abs(dz) < 1e-12) { if (oz < minZ || oz > maxZ) return false; }
  else {
    let a = (minZ - oz) / dz, b = (maxZ - oz) / dz;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > tN) { tN = a; axis = 2; sgn = dz > 0 ? -1 : 1; }
    if (b < tF) tF = b;
  }
  if (tN > tF || tN < 0 || tN >= tMax || axis < 0) return false;
  _t = tN; _axis = axis; _sgn = sgn;
  return true;
}

/**
 * @param w       mundo de física
 * @param origin  Vector3
 * @param dir     Vector3 (se normaliza internamente; `distance` en metros)
 * @param maxDist metros
 * @param opts    { ignore?: entity, entities?: bool } — entities por defecto false
 * @param out     { point:Vector3, normal:Vector3, distance, entity, part, boxId }
 * @returns out | null
 */
export function raycast(w, origin, dir, maxDist, opts, out) {
  let dx = dir.x, dy = dir.y, dz = dir.z;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (l < 1e-9 || !(maxDist > 0)) return null;
  dx /= l; dy /= l; dz /= l;
  const ox = origin.x, oy = origin.y, oz = origin.z;
  const ignore = opts ? opts.ignore || null : null;
  const useEnt = !!(opts && opts.entities) && w.entities.length > 0;

  let best = maxDist, kind = 0, hitBox = 0, hitEnt = null, hitPart = null, nAxis = 0, nSgn = 0;
  const S = w.statics, D = w.dynamic, boxes = w.boxes, ents = w.entities;
  if (useEnt && w.dynamicDirty) w.rebuildDynamic();
  S.begin();
  if (useEnt) D.begin();

  const cs = S.cellSize, inv = S.inv;
  let cx = Math.floor(ox * inv), cz = Math.floor(oz * inv);
  const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
  const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
  const adx = Math.abs(dx), adz = Math.abs(dz);
  let tMaxX = stepX !== 0 && adx > 1e-12 ? ((cx + (stepX > 0 ? 1 : 0)) * cs - ox) / dx : Infinity;
  let tMaxZ = stepZ !== 0 && adz > 1e-12 ? ((cz + (stepZ > 0 ? 1 : 0)) * cs - oz) / dz : Infinity;
  const tDX = adx > 1e-12 ? cs / adx : Infinity;
  const tDZ = adz > 1e-12 ? cs / adz : Infinity;
  const maxCells = w.P.maxRayCells;

  for (let iter = 0; iter < maxCells; iter++) {
    const list = S.cell(cx, cz);
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const id = list[i];
        if (!S.visit(id)) continue;
        const b = boxes[id - 1];
        if (slab(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, best)) {
          best = _t; kind = 1; hitBox = id; hitEnt = null; hitPart = null; nAxis = _axis; nSgn = _sgn;
        }
      }
    }
    if (useEnt) {
      const el = D.cell(cx, cz);
      if (el) {
        for (let i = 0; i < el.length; i++) {
          const idx = el[i];
          if (!D.visit(idx)) continue;
          const e = ents[idx];
          if (!e || e === ignore || e.alive === false || !e.hitboxes) continue;
          const hbs = e.hitboxes;
          for (let j = 0; j < hbs.length; j++) {
            const hb = hbs[j], mn = hb.min, mx = hb.max;
            if (slab(ox, oy, oz, dx, dy, dz, mn.x, mn.y, mn.z, mx.x, mx.y, mx.z, best)) {
              best = _t; kind = 2; hitBox = 0; hitEnt = e; hitPart = hb.part || 'body'; nAxis = _axis; nSgn = _sgn;
            }
          }
        }
      }
    }
    const tExit = tMaxX < tMaxZ ? tMaxX : tMaxZ;
    if (best <= tExit || tExit >= maxDist) break;
    if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDX; } else { cz += stepZ; tMaxZ += tDZ; }
  }

  if (w.groundPlane && dy < -1e-12 && oy > w.groundY) {
    const t = (w.groundY - oy) / dy;
    if (t < best) { best = t; kind = 3; hitBox = 0; hitEnt = null; hitPart = null; nAxis = 1; nSgn = 1; }
  }

  if (kind === 0) return null;
  out.distance = best;
  out.point.set(ox + dx * best, oy + dy * best, oz + dz * best);
  out.normal.set(nAxis === 0 ? nSgn : 0, nAxis === 1 ? nSgn : 0, nAxis === 2 ? nSgn : 0);
  out.entity = hitEnt;
  out.part = hitPart;
  out.boxId = kind === 2 ? null : hitBox;
  return out;
}
