// Cobertura del jugador. Dueño: controls-camera-engineer.
//
// Reglas (Fase 1a, GDD §1):
//  - A con cobertura delante (physics.queryCover en la dirección del stick, o de la cámara si el stick
//    está suelto, ≤ config.cover.snapDistance) → corre hasta el anclaje (move.mode 'coverSlide') y se
//    pega: 'low' (media 1 m, agachado) o 'high' (alta 2.2 m, de pie). Emite cover:enter al llegar.
//  - LS lateral = desplazarse por el borde (physics.coverSlide lo limita). cover.side = último sentido.
//  - LT = asomarse: en 'low' por encima (peeking + aimingOver); en 'high' solo en un extremo, por ese
//    lado (peeking, cover.side = lado del extremo). En el centro de una alta no se asoma (peeking=false).
//  - A + dirección lateral estando en el extremo de ese lado: SWAT turn (physics.querySwat) si hay
//    cobertura al otro lado del hueco; si no, deslizar a la contigua (physics.queryAdjacentCover).
//  - Salir: alejar el stick de la cobertura durante config.cover.exitStickHold, o A + atrás (inmediato).
//  - Y en cobertura: physics.queryLedge hacia la cobertura → vault (baja) / trepar (alta).
// Convención de lado: −1 izquierda, +1 derecha, vista desde el jugador mirando a la cobertura.

import * as THREE from 'three';
import { yawFromDir } from './movement.js';

const _cand = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _bulge = new THREE.Vector3();

function v3(src, out) {
  if (!src) return out.set(0, 0, 0);
  if (Array.isArray(src)) return out.set(src[0] || 0, src[1] || 0, src[2] || 0);
  return out.set(src.x || 0, src.y || 0, src.z || 0);
}

function makeInfo() {
  return {
    boxId: null, height: 'low', topY: 0,
    normal: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3(), tangent: new THREE.Vector3(1, 0, 0),
    tMin: 0, tMax: 0, t: 0, atLeftEdge: false, atRightEdge: false,
  };
}

function copyInfo(src, dst) {
  dst.boxId = src.boxId ?? null;
  dst.height = src.height === 'high' ? 'high' : 'low';
  dst.topY = +src.topY || 0;
  v3(src.normal, dst.normal); dst.normal.y = 0;
  if (dst.normal.lengthSq() < 1e-8) dst.normal.set(0, 0, 1); else dst.normal.normalize();
  v3(src.point, dst.point);
  v3(src.tangent, dst.tangent);
  dst.tMin = +src.tMin || 0; dst.tMax = +src.tMax || 0; dst.t = +src.t || 0;
  dst.atLeftEdge = !!src.atLeftEdge; dst.atRightEdge = !!src.atRightEdge;
  return dst;
}

/** Derecha del jugador mirando a la cobertura (normal sale de la cobertura hacia el jugador). */
export function coverRight(normal, out) {
  const y = Math.atan2(normal.x, normal.z);   // yaw mirando a −normal
  return out.set(Math.cos(y), 0, -Math.sin(y));
}

/** Yaw mirando a la cobertura. */
export const coverFacingYaw = (normal) => yawFromDir(-normal.x, -normal.z);

export function createCover(ctx) {
  const { e } = ctx;
  const CC = ctx.game.config.cover;
  const P = ctx.game.config.player;
  const ev = ctx.game.events;

  let cur = makeInfo();     // cobertura actual
  let next = makeInfo();    // destino (entrar / SWAT / contigua)
  // Objeto que se expone en entity.cover (contrato §3.6).
  const cs = { height: 'low', side: 1, peeking: false, aimingOver: false, info: cur, moving: 0 };
  let inCover = false;      // pegado (mode 'cover'); durante el tránsito de entrada es false
  let exitHold = 0;

  const enterPayload = { who: e, height: 'low', side: 1 };
  const transferPayload = { who: e, from: null, to: null };

  function edgeAt(info, side) { return side < 0 ? info.atLeftEdge : info.atRightEdge; }

  // ── Entrar ───────────────────────────────────────────────────────────────
  /** Busca cobertura en `dir` (≤ maxDist) y empieza a correr/deslizar hacia ella. */
  function tryEnter(dir, maxDist, speed) {
    _dir.set(dir.x, 0, dir.z);
    if (_dir.lengthSq() < 1e-6) return false;
    _dir.normalize();
    const q = ctx.physics.queryCover(e.pos, _dir, maxDist);
    if (!q) return false;
    copyInfo(q, next);
    coverRight(next.normal, _right);
    const lat = ctx.wish.x * _right.x + ctx.wish.z * _right.z;
    cs.side = Math.abs(lat) > 0.3 ? Math.sign(lat) : (e.shoulder || 1);
    cs.height = next.height;
    cs.peeking = false; cs.aimingOver = false; cs.moving = 0;
    cs.info = next;
    e.cover = cs;
    ctx.movement.startMoveTo(next.point, speed, coverFacingYaw(next.normal), 'coverSlide', arriveEnter);
    return true;
  }

  function swap() { const t = cur; cur = next; next = t; cs.info = cur; cs.height = cur.height; }

  function arriveEnter() {
    swap();
    e.pos.x = cur.point.x; e.pos.z = cur.point.z;
    e.vel.set(0, 0, 0);
    e.yaw = coverFacingYaw(cur.normal);
    inCover = true;
    exitHold = 0;
    ctx.setMode('cover');
    enterPayload.height = cs.height; enterPayload.side = cs.side;
    ev.emit('cover:enter', enterPayload);
    ctx.rumble('cover');
  }

  /** El tránsito de entrada no llegó (atasco): se cancela sin emitir eventos. */
  function abortEnter() {
    if (!inCover) { e.cover = null; cs.info = cur; }
  }

  function arriveTransfer() {
    swap();
    e.pos.x = cur.point.x; e.pos.z = cur.point.z;
    e.yaw = coverFacingYaw(cur.normal);
    inCover = true;
    ctx.setMode('cover');
  }

  // ── Salir ────────────────────────────────────────────────────────────────
  function exit(silent = false) {
    if (!e.cover) return;
    const wasIn = inCover;
    inCover = false;
    exitHold = 0;
    e.cover = null;
    cs.peeking = false; cs.aimingOver = false; cs.moving = 0;
    if (wasIn && !silent) {
      enterPayload.height = cs.height; enterPayload.side = cs.side;
      ev.emit('cover:exit', enterPayload);
    }
  }

  // ── En cobertura ─────────────────────────────────────────────────────────
  function startTransfer(q, side, kind) {
    copyInfo(q, next);
    transferPayload.from = cur.boxId;
    transferPayload.to = next.boxId;
    // Abombamiento hacia fuera (bisectriz de las dos normales) para no atravesar la esquina.
    _bulge.copy(cur.normal).add(next.normal);
    if (_bulge.lengthSq() < 1e-6) _bulge.copy(cur.normal);
    _bulge.normalize().multiplyScalar(kind === 'swat' ? CC.swatBulge : CC.adjacentBulge);
    inCover = false;
    cs.side = side; cs.peeking = false; cs.aimingOver = false;
    cs.height = next.height;
    if (kind === 'swat') {
      ctx.movement.startTransfer(next.point, coverFacingYaw(next.normal), 'swat', CC.swatSpeed, CC.swatMinTime, _bulge, arriveTransfer);
      ev.emit('cover:swat', transferPayload);
    } else {
      ctx.movement.startTransfer(next.point, coverFacingYaw(next.normal), 'coverSlide', CC.adjacentSpeed, CC.adjacentMinTime, _bulge, arriveTransfer);
      ev.emit('cover:slide', transferPayload);
    }
    ctx.rumble('cover');
  }

  function step(dt) {
    const I = ctx.input;
    const ph = ctx.physics;
    coverRight(cur.normal, _right);
    const sx = ctx.wish.x * ctx.stickMag, sz = ctx.wish.z * ctx.stickMag;
    const lateral = sx * _right.x + sz * _right.z;
    const away = sx * cur.normal.x + sz * cur.normal.z;

    // A en cobertura: A+atrás = salir · A+lateral en el extremo = SWAT / deslizar a la contigua.
    if (I.pressed('cover')) {
      ctx.movement.st.aUsedForCover = true;
      if (away > CC.exitStickAway) { exit(); return; }
      if (Math.abs(lateral) > CC.transferStickMin) {
        const s = Math.sign(lateral);
        if (edgeAt(cur, s)) {
          const sw = ph.querySwat(cur, s, CC.swatMaxGap);
          if (sw) { startTransfer(sw, s, 'swat'); return; }
          const adj = ph.queryAdjacentCover(cur, s, CC.slideAdjacentMaxGap);
          if (adj) { startTransfer(adj, s, 'slide'); return; }
        }
      }
    }

    // Y: saltar por encima (baja) / trepar (alta).
    if (I.pressed('jump')) {
      _dir.copy(cur.normal).negate();
      const L = ph.queryLedge(e.pos, _dir);
      if (L && (L.kind === 'vault' || L.kind === 'climb')) {
        exit();
        ctx.movement.tryLedge(_dir);
        return;
      }
    }

    // Salir alejando el stick.
    if (away > CC.exitStickAway && ctx.stickMag > CC.exitStickMin) {
      exitHold += dt;
      if (exitHold >= CC.exitStickHold) { exit(); return; }
    } else exitHold = 0;

    // LT: asomarse.
    cs.moving = 0;
    if (ctx.aimDown) {
      if (cur.height === 'low') {
        cs.peeking = true; cs.aimingOver = true;
      } else {
        const l = cur.atLeftEdge, r = cur.atRightEdge;
        let edge = 0;
        if (l && r) edge = cs.side;              // pilar estrecho: el lado actual
        else if (l) edge = -1;
        else if (r) edge = 1;
        cs.aimingOver = false;
        cs.peeking = edge !== 0;
        if (edge) cs.side = edge;
      }
    } else {
      cs.peeking = false; cs.aimingOver = false;
      // Desplazamiento lateral por el borde (no mientras se apunta).
      if (Math.abs(lateral) > CC.moveStickMin && away <= CC.exitStickAway) {
        const s = Math.sign(lateral);
        cs.side = s;
        const speed = P.speed.cover * Math.min(1, Math.abs(lateral) / P.stickRunMin);
        _cand.copy(e.pos).addScaledVector(_right, s * speed * dt);
        const res = ph.coverSlide(cur, s, _cand);
        const np = res && res.pos ? res.pos : _cand;
        const mx = np.x - e.pos.x, mz = np.z - e.pos.z;
        e.pos.x = np.x; e.pos.z = np.z;
        cs.moving = Math.abs(mx * _right.x + mz * _right.z) > 1e-5 ? s : 0;
        // Refresca la info (extremos, altura) y comprueba que sigue habiendo cobertura.
        _dir.copy(cur.normal).negate();
        const q = ph.queryCover(e.pos, _dir, e.radius + CC.refreshDistance);
        if (!q) { exit(); return; }
        copyInfo(q, cur);
        cs.height = cur.height;
        if (res && res.atEdge) { if (s < 0) cur.atLeftEdge = true; else cur.atRightEdge = true; }
      }
    }

    // Pegado: sin velocidad, mirando a la cobertura (al apuntar, el cuerpo sigue a la cámara).
    e.vel.x = 0; e.vel.z = 0;
    ctx.movement.applyGravity(dt);
    if (!e.grounded) ctx.movement.physMove(0, e.vel.y * dt, 0);
    if (ctx.aimDown) e.yaw = ctx.camYaw;
    else e.yaw = coverFacingYaw(cur.normal);
    ctx.setMode('cover');
  }

  /** Prompts contextuales en cobertura (los pide playerController a baja frecuencia). */
  function promptInfo(out) {
    out.swat = false; out.adjacent = false;
    const s = cs.side;
    if (!inCover || !edgeAt(cur, s)) return out;
    if (ctx.physics.querySwat(cur, s, CC.swatMaxGap)) out.swat = true;
    else if (ctx.physics.queryAdjacentCover(cur, s, CC.slideAdjacentMaxGap)) out.adjacent = true;
    return out;
  }

  function reset() { exit(true); }

  return {
    tryEnter, abortEnter, exit, step, reset, promptInfo,
    get inCover() { return inCover; },
    get info() { return cur; },
  };
}
