// Consultas de cobertura y salientes (vault/climb) sobre las AABB estáticas. Dueño: physics-engineer.
//
// CONVENCIONES (vinculantes para player/cover):
// - Solo las 4 caras verticales de cada caja. `normal` es la normal de la cara: sale de la cobertura
//   hacia el jugador (horizontal, unitaria, ±X o ±Z).
// - `tangent = up × normal = (normal.z, 0, −normal.x)`: es la DERECHA del jugador cuando está de cara
//   a la cobertura (mirando hacia −normal). Coincide con right(yaw) de §3.1 para yaw = mirar a la cobertura.
// - `t` es la coordenada ABSOLUTA a lo largo de la tangente: t = dot(posXZ, tangent). La cara cubre
//   [tMin, tMax] (fusionando cajas coplanares contiguas de la misma altura). `t` del resultado es el del
//   anclaje (posición del jugador proyectada y limitada a [tMin + edgeInset, tMax − edgeInset]).
// - side = +1 → DERECHA (hacia tMax); side = −1 → IZQUIERDA (hacia tMin), siempre desde el punto de
//   vista del jugador mirando a la cobertura. atRightEdge ⇔ anclaje en el límite de tMax; atLeftEdge ⇔ tMin.
// - `point` = anclaje: sobre la línea paralela a la cara a distancia (config.player.radius + skin),
//   con y = pies del jugador.
// - Clasificación: caja con tag 'cover' (cualquier altura útil) o altura relativa a los pies en
//   [cover.coverMinHeight, cover.coverMaxHeight]; 'low' si altura ≤ cover.lowMax, si no 'high'
//   (tags 'low'/'high' fuerzan; 'nocover' excluye).
// Los objetos devueltos se reutilizan entre llamadas (uno por tipo de consulta): copiar si se guardan.

import { Vector3 } from 'three';
import { raycast } from './raycast.js';
import { supportTop, capsuleFree, aabbFree } from './collision.js';

// cara f: 0 = +X, 1 = −X, 2 = +Z, 3 = −Z
const FNX = [1, -1, 0, 0], FNZ = [0, 0, 1, -1];
const TX = [0, 0, 1, -1], TZ = [-1, 1, 0, 0];   // tangent = (nz, 0, −nx)

const cbuf = [], mbuf = [], nbuf = [], lbuf = [];
const _o = new Vector3(), _d = new Vector3();
const rayOut = { point: new Vector3(), normal: new Vector3(), distance: 0, entity: null, part: null, boxId: null };
let _t0 = 0, _t1 = 0;

function planeD(b, f) {
  return f === 0 ? b.maxX : f === 1 ? -b.minX : f === 2 ? b.maxZ : -b.minZ;
}
function tRange(b, f) {
  if (f === 0) { _t0 = -b.maxZ; _t1 = -b.minZ; }
  else if (f === 1) { _t0 = b.minZ; _t1 = b.maxZ; }
  else if (f === 2) { _t0 = b.minX; _t1 = b.maxX; }
  else { _t0 = -b.maxX; _t1 = -b.minX; }
}
function faceFromNormal(n) {
  if (n.x > 0.5) return 0;
  if (n.x < -0.5) return 1;
  return n.z > 0.5 ? 2 : 3;
}

/** 0 = no es cobertura, 1 = low, 2 = high (respecto a unos pies en `y`). */
export function coverClass(w, b, y) {
  if (b.noCover) return 0;
  const P = w.P, C = w.C;
  if (b.minY > y + P.stepHeight) return 0;           // flotando sobre la cabeza/cintura
  const rel = b.maxY - y;
  if (rel <= P.stepHeight) return 0;
  if (!b.coverTag && (rel < C.coverMinHeight || rel > C.coverMaxHeight)) return 0;
  if (b.forced) return b.forced;
  return rel <= C.lowMax ? 1 : 2;
}

/** Extiende [t0,t1] de la cara f de b por cajas coplanares contiguas de la misma clase. Deja _t0/_t1. */
function mergeExtent(w, b, f, cls, y) {
  const C = w.C, gap = C.mergeGap;
  const pd = planeD(b, f), nx = FNX[f], nz = FNZ[f], tx = TX[f], tz = TZ[f];
  tRange(b, f);
  let t0 = _t0, t1 = _t1;
  for (let dirn = -1; dirn <= 1; dirn += 2) {
    for (let guard = 0; guard < 16; guard++) {
      const te = dirn > 0 ? t1 : t0;
      const px = nx * pd + tx * te, pz = nz * pd + tz * te;
      w.statics.query(px - gap - 0.01, pz - gap - 0.01, px + gap + 0.01, pz + gap + 0.01, mbuf);
      let grew = false;
      for (let i = 0; i < mbuf.length; i++) {
        const c = w.boxes[mbuf[i] - 1];
        if (c === b || Math.abs(planeD(c, f) - pd) > gap) continue;
        if (coverClass(w, c, y) !== cls) continue;
        tRange(c, f);
        if (dirn > 0 && _t0 <= t1 + gap && _t1 > t1 + 1e-4) { t1 = _t1; grew = true; }
        else if (dirn < 0 && _t1 >= t0 - gap && _t0 < t0 - 1e-4) { t0 = _t0; grew = true; }
      }
      if (!grew) break;
    }
  }
  _t0 = t0; _t1 = t1;
}

function anchorLo(C, t0, t1) { return t0 + C.edgeInset <= t1 - C.edgeInset ? t0 + C.edgeInset : (t0 + t1) * 0.5; }
function anchorHi(C, t0, t1) { return t0 + C.edgeInset <= t1 - C.edgeInset ? t1 - C.edgeInset : (t0 + t1) * 0.5; }

function makeInfo() {
  return {
    boxId: 0, height: 'low', topY: 0,
    normal: new Vector3(), point: new Vector3(), tangent: new Vector3(),
    tMin: 0, tMax: 0, t: 0, atLeftEdge: false, atRightEdge: false,
  };
}

function fillInfo(w, info, b, f, cls, t0, t1, tWanted, y) {
  const C = w.C;
  const lo = anchorLo(C, t0, t1), hi = anchorHi(C, t0, t1);
  const tc = tWanted < lo ? lo : (tWanted > hi ? hi : tWanted);
  const off = planeD(b, f) + w.PL.radius + w.P.skin;
  info.boxId = b.id;
  info.height = cls === 1 ? 'low' : 'high';
  info.topY = b.maxY;
  info.normal.set(FNX[f], 0, FNZ[f]);
  info.tangent.set(TX[f], 0, TZ[f]);
  info.tMin = t0; info.tMax = t1; info.t = tc;
  info.point.set(FNX[f] * off + TX[f] * tc, y, FNZ[f] * off + TZ[f] * tc);
  info.atLeftEdge = tc <= lo + C.edgeEpsilon;
  info.atRightEdge = tc >= hi - C.edgeEpsilon;
  return info;
}

/** Rayo estático de a→b a la altura dada; true si hay una caja antes de llegar (menos `slack`). */
function blocked(w, ax, az, bx, bz, y, slack) {
  _o.set(ax, y, az);
  _d.set(bx - ax, 0, bz - az);
  const len = _d.length();
  if (len < 1e-6) return false;
  const hit = raycast(w, _o, _d, len, null, rayOut);
  return !!(hit && hit.boxId && hit.distance < len - slack);
}

// ───────────────────────────── queryCover ─────────────────────────────
const coverInfo = makeInfo();

/**
 * Cara de cobertura más cercana delante de `pos` en la dirección `dir` (XZ, no hace falta normalizar).
 * maxDist: hueco máximo entre la superficie de la cápsula y la cara.
 */
export function queryCover(w, pos, dir, maxDist) {
  const C = w.C, r = w.PL.radius;
  let fx = dir.x, fz = dir.z;
  const fl = Math.sqrt(fx * fx + fz * fz);
  if (fl < 1e-6) return null;
  fx /= fl; fz /= fl;
  const y = pos.y, px = pos.x, pz = pos.z;
  const reach = maxDist + r;
  const cosMax = Math.cos(C.maxAngle);
  w.statics.query(px - reach, pz - reach, px + reach, pz + reach, cbuf);

  let bestScore = Infinity, bestB = null, bestF = -1, bestCls = 0;
  for (let i = 0; i < cbuf.length; i++) {
    const b = w.boxes[cbuf[i] - 1];
    const cls = coverClass(w, b, y);
    if (!cls) continue;
    for (let f = 0; f < 4; f++) {
      const nx = FNX[f], nz = FNZ[f];
      if (-(nx * fx + nz * fz) < cosMax) continue;        // la cara no está delante
      const d = nx * px + nz * pz - planeD(b, f);           // distancia del centro al plano
      if (d < 0 || d - r > maxDist) continue;
      tRange(b, f);
      if (_t1 - _t0 < C.minFaceWidth) continue;
      const t = TX[f] * px + TZ[f] * pz;
      const lat = t < _t0 ? _t0 - t : (t > _t1 ? t - _t1 : 0);
      if (lat > r) continue;
      const score = (d - r) + lat * 2;
      if (score >= bestScore) continue;
      // oclusión: otra caja entre el jugador y la cara
      const tc = t < _t0 ? _t0 : (t > _t1 ? _t1 : t);
      const fpx = nx * planeD(b, f) + TX[f] * tc, fpz = nz * planeD(b, f) + TZ[f] * tc;
      _o.set(px, y + C.probeHeight, pz);
      _d.set(fpx - px, 0, fpz - pz);
      const len = _d.length();
      if (len > 1e-4) {
        const hit = raycast(w, _o, _d, len + 0.05, null, rayOut);
        if (hit && hit.boxId && hit.boxId !== b.id && hit.distance < len - 0.05) continue;
      }
      bestScore = score; bestB = b; bestF = f; bestCls = cls;
    }
  }
  if (!bestB) return null;
  mergeExtent(w, bestB, bestF, bestCls, y);
  const t = TX[bestF] * px + TZ[bestF] * pz;
  return fillInfo(w, coverInfo, bestB, bestF, bestCls, _t0, _t1, t, y);
}

// ───────────────────────────── coverSlide ─────────────────────────────
const slideOut = { pos: new Vector3(), atEdge: false };

/**
 * Proyecta `pos` (posición deseada) sobre la línea de anclaje de `info` y la limita a los bordes.
 * No muta `pos`; devuelve { pos (Vector3 reutilizado, y = pos.y), atEdge } — atEdge: tocando el borde
 * del lado `side` (side 0: cualquiera). Actualiza info.t / info.point / info.atLeftEdge / info.atRightEdge.
 */
export function coverSlide(w, info, side, pos) {
  const C = w.C;
  const n = info.normal, tg = info.tangent;
  const lo = anchorLo(C, info.tMin, info.tMax), hi = anchorHi(C, info.tMin, info.tMax);
  let t = tg.x * pos.x + tg.z * pos.z;
  if (t < lo) t = lo; else if (t > hi) t = hi;
  // distancia de la línea de anclaje al origen a lo largo de la normal (constante para la cara)
  const off = n.x * info.point.x + n.z * info.point.z;
  slideOut.pos.set(n.x * off + tg.x * t, pos.y, n.z * off + tg.z * t);
  const atL = t <= lo + C.edgeEpsilon, atR = t >= hi - C.edgeEpsilon;
  slideOut.atEdge = side > 0 ? atR : side < 0 ? atL : (atL || atR);
  info.t = t;
  info.point.set(slideOut.pos.x, pos.y, slideOut.pos.z);
  info.atLeftEdge = atL; info.atRightEdge = atR;
  return slideOut;
}

// ─────────────────── cobertura contigua / SWAT (misma orientación) ───────────────────
const adjInfo = makeInfo();
const swatInfo = makeInfo();

function findAlong(w, info, side, minGap, maxGap, depthTol, out) {
  if (!info || !side) return null;
  const C = w.C, P = w.P, r = w.PL.radius;
  const src = w.boxes[info.boxId - 1];
  if (!src) return null;
  const f = faceFromNormal(info.normal);
  const pd = planeD(src, f);
  const y = info.point.y;
  const tMin = info.tMin, tMax = info.tMax;
  const edge = side > 0 ? tMax : tMin;
  const nx = FNX[f], nz = FNZ[f], tx = TX[f], tz = TZ[f];
  // región de búsqueda (AABB de las 4 esquinas en el plano XZ)
  const a0 = edge, a1 = edge + side * (maxGap + 0.1);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < 4; i++) {
    const a = i & 1 ? a1 : a0;
    const dd = pd + (i & 2 ? depthTol : -depthTol);
    const x = nx * dd + tx * a, z = nz * dd + tz * a;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  w.statics.query(minX, minZ, maxX, maxZ, nbuf);
  let best = null, bestGap = Infinity, bestDepth = Infinity, bestCls = 0;
  for (let i = 0; i < nbuf.length; i++) {
    const c = w.boxes[nbuf[i] - 1];
    if (c === src) continue;
    const cls = coverClass(w, c, y);
    if (!cls) continue;
    const depth = Math.abs(planeD(c, f) - pd);
    if (depth > depthTol) continue;
    tRange(c, f);
    if (_t1 - _t0 < C.minFaceWidth) continue;
    const gap = side > 0 ? _t0 - edge : edge - _t1;
    if (gap < minGap - C.mergeGap || gap > maxGap) continue;
    if (gap < bestGap - 1e-4 || (Math.abs(gap - bestGap) <= 1e-4 && depth < bestDepth)) {
      best = c; bestGap = gap; bestDepth = depth; bestCls = cls;
    }
  }
  if (!best) return null;
  // anclaje de salida (borde actual) antes de escribir `out` (puede ser el mismo objeto que `info`)
  const off = pd + r + P.skin;
  const eT = side > 0 ? anchorHi(C, tMin, tMax) : anchorLo(C, tMin, tMax);
  const ex = nx * off + tx * eT, ez = nz * off + tz * eT;
  mergeExtent(w, best, f, bestCls, y);
  fillInfo(w, out, best, f, bestCls, _t0, _t1, side > 0 ? -Infinity : Infinity, y);
  if (blocked(w, ex, ez, out.point.x, out.point.z, y + C.probeHeight, 0.05)) return null;
  return out;
}

/** Siguiente cobertura coplanar (|Δplano| ≤ cover.adjacentDepthTol) en el lado `side`, hueco ≤ maxDist. */
export function queryAdjacentCover(w, info, side, maxDist) {
  const C = w.C;
  const max = maxDist !== undefined && maxDist !== null ? maxDist : C.slideAdjacentMaxGap;
  return findAlong(w, info, side, 0, max, C.adjacentDepthTol, adjInfo);
}

/** Cobertura paralela al otro lado de un hueco (cover.swatMinGap ≤ hueco ≤ maxGap, |Δplano| ≤ swatDepthTol). */
export function querySwat(w, info, side, maxGap) {
  const C = w.C;
  const max = maxGap !== undefined && maxGap !== null ? maxGap : C.swatMaxGap;
  return findAlong(w, info, side, C.swatMinGap, max, C.swatDepthTol, swatInfo);
}

// ───────────────────────────── queryLedge ─────────────────────────────
const ledgeOut = { kind: 'vault', topY: 0, landPos: new Vector3() };

/**
 * Obstáculo delante de `pos` (pies) en `forward` (XZ):
 *  'vault' si su altura ∈ (stepHeight, vaultMaxHeight], fondo ≤ vaultMaxDepth, hueco libre encima y
 *          la cápsula cabe detrás (landPos = suelo detrás).
 *  'climb' si altura ≤ climbMaxHeight, hay suelo arriba y cabe la cápsula de pie (landPos = encima).
 * El salto se hace perpendicular a la cara (−normal), no según `forward`.
 */
export function queryLedge(w, pos, forward) {
  const P = w.P, r = w.PL.radius, h = w.PL.height, skin = P.skin;
  let fx = forward.x, fz = forward.z;
  const fl = Math.sqrt(fx * fx + fz * fz);
  if (fl < 1e-6) return null;
  fx /= fl; fz /= fl;
  const y = pos.y;
  _o.set(pos.x, y + P.stepHeight + 0.05, pos.z);
  _d.set(fx, 0, fz);
  const hit = raycast(w, _o, _d, r + P.ledgeReach, null, rayOut);
  if (!hit || !hit.boxId) return null;
  const nx = hit.normal.x, nz = hit.normal.z;
  if (-(nx * fx + nz * fz) < 0.5) return null;            // demasiado oblicuo (> 60°)
  const vx = -nx, vz = -nz;                                // dirección del salto
  const hx = hit.point.x, hz = hit.point.z;
  const b = w.boxes[hit.boxId - 1];

  // cima: encadena cajas apiladas en un punto justo dentro de la cara
  const ix = hx + vx * 0.05, iz = hz + vz * 0.05;
  let top = b.maxY;
  for (let guard = 0; guard < 8; guard++) {
    w.statics.query(ix, iz, ix, iz, lbuf);
    let grew = false;
    for (let i = 0; i < lbuf.length; i++) {
      const c = w.boxes[lbuf[i] - 1];
      if (ix < c.minX || ix > c.maxX || iz < c.minZ || iz > c.maxZ) continue;
      if (c.minY <= top + skin && c.maxY > top + 1e-4) { top = c.maxY; grew = true; }
    }
    if (!grew) break;
  }
  const rel = top - y;
  if (rel <= P.stepHeight || rel > P.climbMaxHeight + 1e-6) return null;

  // VAULT
  const depth = (vx !== 0) ? (b.maxX - b.minX) : (b.maxZ - b.minZ);
  if (rel <= P.vaultMaxHeight && depth <= P.vaultMaxDepth) {
    const land = depth + r + skin + 0.1;
    const lx = hx + vx * land, lz = hz + vz * land;
    const gy = supportTop(w, lx, lz, r - skin, y - P.vaultMaxDrop, top - P.stepHeight);
    if (gy > -Infinity && capsuleFree(w, lx, gy + skin, lz, r - skin, h - 2 * skin)) {
      // hueco sobre la cima a lo largo del salto
      const ax = Math.min(hx, lx) - (vz !== 0 ? r * 0.5 : 0), bx = Math.max(hx, lx) + (vz !== 0 ? r * 0.5 : 0);
      const az = Math.min(hz, lz) - (vx !== 0 ? r * 0.5 : 0), bz = Math.max(hz, lz) + (vx !== 0 ? r * 0.5 : 0);
      if (aabbFree(w, ax, top + skin, az, bx, top + P.vaultClearance, bz)) {
        ledgeOut.kind = 'vault';
        ledgeOut.topY = top;
        ledgeOut.landPos.set(lx, gy, lz);
        return ledgeOut;
      }
    }
  }

  // CLIMB (también "mantle" de cajas bajas pero profundas o sin hueco detrás)
  const ins = r + skin + 0.05;
  const cx = hx + vx * ins, cz = hz + vz * ins;
  const sup = supportTop(w, cx, cz, 0.05, top - 0.01, top + 0.01);
  if (sup === -Infinity) return null;
  if (!capsuleFree(w, cx, top + skin, cz, r - skin, h - 2 * skin)) return null;
  // techo sobre el jugador hasta la altura final de la cabeza
  if (!capsuleFree(w, pos.x, y + h, pos.z, r - skin, top - y)) return null;
  ledgeOut.kind = 'climb';
  ledgeOut.topY = top;
  ledgeOut.landPos.set(cx, top, cz);
  return ledgeOut;
}
