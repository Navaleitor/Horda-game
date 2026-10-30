// Cápsula cinemática vs AABB estáticas. Dueño: physics-engineer.
//
// Modelo: la cápsula es un círculo de radio `r` en XZ con extensión vertical [pos.y, pos.y + height]
// (pos = pies). Por sub-paso:
//   1) horizontal: avanza XZ y resuelve penetración mínima círculo-vs-rectángulo contra cada caja que
//      solapa verticalmente (deslizamiento natural por paredes y esquinas redondeadas). Las cajas cuya
//      cara superior está a ≤ stepHeight sobre los pies (y con hueco libre encima) no bloquean si la
//      cápsula estaba apoyada: se suben en el paso vertical (step-up).
//   2) vertical: techo (si sube) y suelo: busca el soporte más alto cruzado en el sub-paso; apoyada,
//      además se pega al suelo hasta `groundSnap` por debajo y sube escalones hasta `stepHeight`.
// Anti-túnel: sub-pasos de longitud ≤ radius·substepFraction (hasta maxSubsteps); si el delta excede
// eso, un barrido previo (segmento vs cajas expandidas por el radio) recorta el delta al primer contacto.
// Plano de suelo implícito en config.physics.groundY si config.physics.groundPlane.

const cand = [];   // broadphase de moveCapsule
const qbuf = [];   // consultas sueltas (supportTop / capsuleFree / aabbFree)

export function circleOverlaps(b, x, z, r) {
  const qx = x < b.minX ? b.minX : (x > b.maxX ? b.maxX : x);
  const qz = z < b.minZ ? b.minZ : (z > b.maxZ ? b.maxZ : z);
  const dx = x - qx, dz = z - qz;
  return dx * dx + dz * dz < r * r;
}

/** Cara superior más alta en [lo, hi] bajo el círculo (x,z,r); -Infinity si no hay. */
function supportIn(w, list, x, z, r, lo, hi) {
  let best = -Infinity;
  const boxes = w.boxes;
  for (let i = 0; i < list.length; i++) {
    const b = boxes[list[i] - 1];
    const t = b.maxY;
    if (t < lo || t > hi || t <= best) continue;
    if (circleOverlaps(b, x, z, r)) best = t;
  }
  if (w.groundPlane && w.groundY >= lo && w.groundY <= hi && w.groundY > best) best = w.groundY;
  return best;
}

/** ¿Alguna caja de `list` solapa el cilindro (x,z,r) en (yLo, yHi)? */
function blockedIn(w, list, x, z, r, yLo, yHi) {
  const boxes = w.boxes;
  for (let i = 0; i < list.length; i++) {
    const b = boxes[list[i] - 1];
    if (b.maxY <= yLo || b.minY >= yHi) continue;
    if (circleOverlaps(b, x, z, r)) return true;
  }
  return false;
}

export function supportTop(w, x, z, r, lo, hi) {
  w.statics.query(x - r, z - r, x + r, z + r, qbuf);
  return supportIn(w, qbuf, x, z, r, lo, hi);
}

/** true si un cilindro (pies en y, altura h) cabe en (x,z) sin tocar cajas. */
export function capsuleFree(w, x, y, z, r, h) {
  w.statics.query(x - r, z - r, x + r, z + r, qbuf);
  return !blockedIn(w, qbuf, x, z, r, y, y + h);
}

/** true si la caja (abierta) no solapa ninguna caja estática. */
export function aabbFree(w, minX, minY, minZ, maxX, maxY, maxZ) {
  w.statics.query(minX, minZ, maxX, maxZ, qbuf);
  const boxes = w.boxes;
  for (let i = 0; i < qbuf.length; i++) {
    const b = boxes[qbuf[i] - 1];
    if (b.maxX <= minX || b.minX >= maxX || b.maxY <= minY || b.minY >= maxY ||
        b.maxZ <= minZ || b.minZ >= maxZ) continue;
    return false;
  }
  return true;
}

/** Fracción [0,1] del segmento XZ hasta el primer contacto con cajas expandidas por r (no escalones). */
function sweepXZ(w, list, x, y, z, dx, dz, r, h, canStep) {
  const P = w.P;
  let tBest = 1;
  const boxes = w.boxes;
  for (let i = 0; i < list.length; i++) {
    const b = boxes[list[i] - 1];
    if (b.maxY <= y + P.skin || b.minY >= y + h - P.skin) continue;
    if (canStep && b.maxY - y <= P.stepHeight) continue;
    const minX = b.minX - r, maxX = b.maxX + r, minZ = b.minZ - r, maxZ = b.maxZ + r;
    let t0 = 0, t1 = tBest;
    if (Math.abs(dx) < 1e-12) { if (x < minX || x > maxX) continue; }
    else {
      let a = (minX - x) / dx, c = (maxX - x) / dx;
      if (a > c) { const s = a; a = c; c = s; }
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-12) { if (z < minZ || z > maxZ) continue; }
    else {
      let a = (minZ - z) / dz, c = (maxZ - z) / dz;
      if (a > c) { const s = a; a = c; c = s; }
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) continue;
    }
    if (t0 < tBest) tBest = t0;
  }
  return tBest;
}

/**
 * Mueve la cápsula `cap` ({ pos, radius, height }) por `delta` (Vector3, metros de este paso).
 * Muta cap.pos. Devuelve `out` (reutilizado): { grounded, hitWall, wallNormal (Vector3, XZ unitaria
 * apuntando fuera de la pared; (0,0,0) si no hubo choque), hitCeiling, stepped }.
 */
export function moveCapsule(w, cap, delta, out) {
  const P = w.P;
  const pos = cap.pos, r = cap.radius, h = cap.height, skin = P.skin;
  let x = pos.x, y = pos.y, z = pos.z;
  let dx = delta.x, dz = delta.z;
  const dy = delta.y;
  out.grounded = false; out.hitWall = false; out.hitCeiling = false; out.stepped = false;
  out.wallNormal.set(0, 0, 0);

  const len = Math.sqrt(dx * dx + dz * dz);
  let n = Math.ceil(len / (r * P.substepFraction));
  if (n < 1) n = 1;

  // Broadphase única para todo el movimiento.
  const ext = r + skin + 0.01;
  w.statics.query(
    Math.min(x, x + dx) - ext, Math.min(z, z + dz) - ext,
    Math.max(x, x + dx) + ext, Math.max(z, z + dz) + ext, cand);

  const rIn = r - skin;
  const canStep = dy <= 0 && supportIn(w, cand, x, z, rIn, y - P.groundSnap, y + skin) > -Infinity;

  if (n > P.maxSubsteps) {
    const t = sweepXZ(w, cand, x, y, z, dx, dz, r, h, canStep);
    const back = len > 0 ? skin / len : 0;
    const f = t - back > 0 ? t - back : 0;
    dx *= f; dz *= f;
    n = P.maxSubsteps;
  }

  const sx = dx / n, sz = dz / n, sy = dy / n;
  const boxes = w.boxes;
  const iters = P.resolveIterations;
  let wnx = 0, wnz = 0, grounded = false;

  for (let s = 0; s < n; s++) {
    // ── horizontal ──
    x += sx; z += sz;
    for (let it = 0; it < iters; it++) {
      let pushed = false;
      for (let k = 0; k < cand.length; k++) {
        const b = boxes[cand[k] - 1];
        if (b.maxY <= y + skin || b.minY >= y + h - skin) continue;
        if (canStep && b.maxY - y <= P.stepHeight &&
            !blockedIn(w, cand, x, z, rIn, b.maxY + skin, b.maxY + h - skin)) continue;
        const qx = x < b.minX ? b.minX : (x > b.maxX ? b.maxX : x);
        const qz = z < b.minZ ? b.minZ : (z > b.maxZ ? b.maxZ : z);
        const ddx = x - qx, ddz = z - qz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r * r) continue;
        let nx, nz, p;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          nx = ddx / d; nz = ddz / d; p = r - d;
        } else {
          // centro dentro del rectángulo: sale por el lado más cercano
          let m = x - b.minX; nx = -1; nz = 0;
          const e = b.maxX - x, bk = z - b.minZ, f = b.maxZ - z;
          if (e < m) { m = e; nx = 1; nz = 0; }
          if (bk < m) { m = bk; nx = 0; nz = -1; }
          if (f < m) { m = f; nx = 0; nz = 1; }
          p = m + r;
        }
        p += 1e-6;
        x += nx * p; z += nz * p;
        wnx += nx; wnz += nz;
        out.hitWall = true;
        pushed = true;
      }
      if (!pushed) break;
    }

    // ── vertical ──
    let y1 = y + sy;
    if (sy > 0) {
      for (let k = 0; k < cand.length; k++) {
        const b = boxes[cand[k] - 1];
        if (b.minY < y + h - skin || b.minY >= y1 + h) continue;
        if (!circleOverlaps(b, x, z, rIn)) continue;
        y1 = b.minY - h;
        out.hitCeiling = true;
      }
    }
    let lo = y1, hi = y + skin;
    if (canStep) {
      lo = Math.min(y1, y - P.groundSnap);
      hi = y + P.stepHeight;
    }
    grounded = false;
    if (lo <= hi) {
      const top = supportIn(w, cand, x, z, rIn, lo, hi);
      if (top > -Infinity) {
        if (top > y + skin) out.stepped = true;
        y1 = top;
        grounded = true;
      }
    }
    if (w.groundPlane && y1 < w.groundY) { y1 = w.groundY; grounded = true; }
    y = y1;
  }

  pos.x = x; pos.y = y; pos.z = z;
  out.grounded = grounded;
  if (out.hitWall) {
    const l = Math.sqrt(wnx * wnx + wnz * wnz);
    if (l > 1e-9) out.wallNormal.set(wnx / l, 0, wnz / l);
  }
  return out;
}

/**
 * Separa agentes (círculos en XZ) por pares, mitad y mitad. `agents`: [{ pos, radius }].
 * O(n²): pensado para decenas de agentes. No comprueba paredes (llamar después moveCapsule con delta 0).
 */
export function separateAgents(agents) {
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    for (let j = i + 1; j < agents.length; j++) {
      const b = agents[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      if (Math.abs(b.pos.y - a.pos.y) > 1.5) continue;
      let d = Math.sqrt(d2), nx, nz;
      if (d < 1e-6) { nx = 1; nz = 0; d = 0; } else { nx = dx / d; nz = dz / d; }
      const p = (rr - d) * 0.5;
      a.pos.x -= nx * p; a.pos.z -= nz * p;
      b.pos.x += nx * p; b.pos.z += nz * p;
    }
  }
}
