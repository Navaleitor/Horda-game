// Proveedores de pose de cobertura (cover-animator). Estados de cuerpo: coverLow, coverHigh, peek, swat,
// coverSlide. Estado de torso: blindfire. Convenciones: cabecera de src/anim/core/characterRig.js.
//
// MARCO DE LA PARED ("wall frame"): +X = derecha del jugador mirando a la pared, −Z = hacia la pared. El
// controlador deja la raíz mirando a la pared (e.yaw = coverFacingYaw) y la cobertura a 0.36 m del anclaje.
// Visualmente el personaje se pega con la ESPALDA a la pared: se gira π (cadera) y todo lo demás cuelga
// de ella. Al asomarse (LT) la raíz sigue a la cámara y el cuerpo vuelve a mirar a la mira (giro 0).
//
// Un único conjunto de escalares suavizados (rig.mem.cv: agazapado, asomado, giro, paso, impacto…) alimenta
// coverLow/coverHigh/peek, así que el crossfade entre ellos es continuo. Se avanza solo desde el proveedor
// dominante (rig.w ≥ 0.5) para no integrar dos veces durante un crossfade.

import * as THREE from 'three';
import { clamp, damp, ease, lerp, remap01, wrapAngle } from '../core/math.js';
import { worldPos } from '../core/ik.js';
import { solveLeg, footCycle } from './legs.js';

const PI = Math.PI;
const COVERISH = new Set(['coverLow', 'coverHigh', 'peek', 'swat', 'coverSlide']);

const _hips = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _cyc = { off: 0, lift: 0 };

// ── Estado compartido por rig ────────────────────────────────────────────────
function cvOf(rig) {
  let c = rig.mem.cv;
  if (!c) {
    c = rig.mem.cv = {
      low: 0, peek: 0, over: 0, turn: 1, turnDir: 1, move: 0, phase: 0, dirSign: 1,
      tc: 9, entry: false, snap: true, kind: 'enter', side: 1, ws: 1, lean: 0, blind: 0, impact: 0, hand: 0,
      px: 0, pz: 0, has: false, vx: 0, vz: 0, psi: 0, wallYaw: 0, topY: 1, edgeL: false, edgeR: false,
      heading: 0, dashSp: 0, lift: 0, leanNow: 0, nx: 1, nz: 0,
    };
  }
  return c;
}
const cfgOf = (rig) => rig.config.anim.cover;

/** Marco de la pared y velocidad en ese marco (suavizada) a partir de la posición interpolada de la raíz. */
function track(rig, cv, dt) {
  const e = rig.entity;
  const info = e && e.cover && e.cover.info;
  const ry = rig.root.rotation.y;
  cv.wallYaw = info ? Math.atan2(info.normal.x, info.normal.z) : ry;
  cv.psi = wrapAngle(cv.wallYaw - ry);
  cv.topY = info && info.topY ? info.topY : 1;
  cv.edgeL = !!(info && info.atLeftEdge);
  cv.edgeR = !!(info && info.atRightEdge);
  const x = rig.root.position.x, z = rig.root.position.z;
  if (cv.has && dt > 0) {
    const dx = x - cv.px, dz = z - cv.pz;
    const cs = Math.cos(cv.wallYaw), sn = Math.sin(cv.wallYaw);
    const vx = (dx * cs - dz * sn) / dt, vz = (dx * sn + dz * cs) / dt;
    if (vx * vx + vz * vz < 144) {
      cv.vx = damp(cv.vx, vx, 30, dt);
      cv.vz = damp(cv.vz, vz, 30, dt);
    }
  }
  cv.px = x; cv.pz = z; cv.has = true;
}

/** Profundidad (m) con que sobresale el accesorio de la espalda (mochila…) respecto a la espalda; se mide una vez por rig. */
const _gv = new THREE.Vector3();
function gearDepth(rig, C) {
  if (rig.mem.gear !== undefined) return rig.mem.gear;
  let d = 0;
  const a = rig.soldier && rig.soldier.anchors && rig.soldier.anchors.back;
  if (a) {
    rig.root.updateMatrixWorld(true);
    // Se mide en el plano sagital y se deshace la inclinación del tronco de este instante (corriendo va inclinado).
    worldPos(rig.bones[0], _chest); rig.root.worldToLocal(_chest);
    const hy = _chest.y, hz = _chest.z;
    worldPos(rig.bones[rig.bone('neck')], _chest); rig.root.worldToLocal(_chest);
    const beta = Math.atan2(_chest.z - hz, _chest.y - hy);
    const sn = Math.sin(-beta), cs = Math.cos(-beta);
    a.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        _gv.fromBufferAttribute(pos, i);
        o.localToWorld(_gv);
        rig.root.worldToLocal(_gv);
        const z = (_gv.y - hy) * sn + (_gv.z - hz) * cs + hz;
        if (z > d) d = z;
      }
    });
    d = Math.max(0, d - C.bodyBackZ);
  }
  return (rig.mem.gear = d);
}

const mixP = (C, key, kl, pk) => lerp(lerp(C.high[key], C.low[key], kl), lerp(C.peekHigh[key], C.peekLow[key], kl), pk);

/** Mueve el arma con el giro del cuerpo (yaw respecto a la raíz) y, si mirror>0, al otro hombro. Relativo a la tabla base. */
function weaponFollow(rig, base, yaw, mirror, dPitch, dY, dYaw = 0) {
  const x = base[0] * (1 - 2 * mirror), y = base[1] + dY, z = base[2];
  const c = Math.cos(yaw), s = Math.sin(yaw);
  rig.holdAdd(x * c + z * s - base[0], y - base[1], -x * s + z * c - base[2],
    dPitch, yaw + dYaw - 2 * mirror * base[4], -2 * mirror * base[5]);
}

const holdTable = (rig) => rig.core.hold[rig.weapon ? rig.weapon.id : 'assaultRifle'] || rig.core.hold.assaultRifle;

/** Piernas + cadera + tronco en un marco de cuerpo (yaw respecto a la raíz). u = hacia donde mira el cuerpo. */
function bodyFrame(rig, C, yaw, hx, hz, drop, footC, footF, footW, step, lean, headUp) {
  const L = C.legs;
  const su = Math.sin(yaw), cu = Math.cos(yaw);
  const ux = -su, uz = -cu;          // delante del cuerpo
  const rx = cu, rz = -su;           // derecha del cuerpo
  rig.hips(hx, -drop, hz);
  rig.rot('hips', 0, yaw, 0);
  _hips.set(L.hips[0] + hx, L.hips[1] - drop, L.hips[2] + hz);
  _pole.set(ux, 0, uz);
  for (let i = 0; i < 2; i++) {
    const sg = i === 0 ? 1 : -1;
    let off = 0, lift = 0;
    if (step) {
      footCycle(step.phase + i * 0.5, step.amp, step.lift, _cyc, step.lead);
      off = _cyc.off; lift = _cyc.lift;
    }
    _tgt.set(
      footC.x + ux * footF + rx * sg * footW + (step ? step.tx * off : 0),
      L.ankleH + lift,
      footC.z + uz * footF + rz * sg * footW + (step ? step.tz * off : 0));
    solveLeg(rig, L, i, _hips, yaw, _pole, _tgt);
  }
  // Tronco inclinado hacia delante del cuerpo (eje perpendicular a u); la cabeza compensa para mirar al frente.
  if (lean !== 0 || headUp !== 0) {
    const nx = -uz, nz = ux;
    rig.rotAxis('spine', nx, 0, nz, -lean * 0.34);
    rig.rotAxis('spine1', nx, 0, nz, -lean * 0.33);
    rig.rotAxis('spine2', nx, 0, nz, -lean * 0.33);
    const hu = headUp + C.headComp * lean;
    rig.rotAxis('neck', nx, 0, nz, hu * 0.4);
    rig.rotAxis('head', nx, 0, nz, hu * 0.6);
  }
}

// ── Cobertura (coverLow / coverHigh / peek) ──────────────────────────────────
function advance(rig, cv, C, dt, p, st) {
  track(rig, cv, dt);
  cv.tc += dt;
  const E = C.entry, S = C.step;
  const low = (p.height || (st === 'coverHigh' ? 'high' : 'low')) === 'low' ? 1 : 0;
  const peeking = st === 'peek' || !!p.peeking;
  const over = !!(p.aimingOver || p.over);
  if (p.side) cv.side = p.side;
  const blind = rig.upper === 'blindfire' ? 1 : 0;

  let lowT = low, turnT = 1;
  if (cv.snap) {
    cv.snap = false; cv.entry = false; cv.tc = 9;
    cv.low = low; cv.peek = peeking ? 1 : 0; cv.turn = 1; cv.turnDir = cv.side >= 0 ? 1 : -1;
    cv.ws = cv.side; cv.lean = 0; cv.move = 0;
  }
  if (cv.entry) {
    lowT *= ease.smooth(remap01(cv.tc, E.squatStart, E.squatStart + E.squatTime));
    turnT = ease.smooth(remap01(cv.tc, E.turnStart, E.turnStart + E.turnTime));
    const k = cv.tc / E.impactTime;
    cv.impact = k >= 1 ? 0 : k < 0.2 ? k / 0.2 : 1 - ease.smooth((k - 0.2) / 0.8);
    cv.hand = 1 - ease.smooth(remap01(cv.tc, E.handTime * 0.5, E.handTime));
    if (cv.tc > 1) { cv.entry = false; cv.impact = 0; cv.hand = 0; }
  } else { cv.impact = 0; cv.hand = 0; }
  cv.low = damp(cv.low, lowT, 16, dt);
  cv.turn = damp(cv.turn, turnT, 20, dt);
  cv.peek = damp(cv.peek, peeking ? 1 : 0, 14, dt);
  cv.over = damp(cv.over, over ? 1 : 0, 14, dt);
  cv.lean = damp(cv.lean, peeking && !over && !low ? cv.side : 0, 14, dt);
  cv.ws = damp(cv.ws, cv.side, 10, dt);
  cv.blind = damp(cv.blind, blind, 10, dt);
  // Guardia de la boca del cañón: al asomarse por encima de una cobertura baja el arma no baja del borde
  // (apuntando hacia abajo se sube el cuerpo). Realimenta con la boca del último frame.
  let liftT = 0;
  if (peeking && over && low && rig.weapon && rig.weapon.muzzle) {
    worldPos(rig.weapon.muzzle, _gv);
    liftT = clamp(cv.lift + cv.topY + C.peekClear - _gv.y, 0, C.peekLiftMax);
  }
  cv.lift = damp(cv.lift, liftT, 12, dt);
  // Paso lateral: la fase avanza con la distancia recorrida (cero patinaje).
  const v = Math.abs(cv.vx);
  cv.move = damp(cv.move, peeking || cv.entry ? 0 : remap01(v, S.minSpeed, S.minSpeed + 0.3), 14, dt);
  if (v > S.minSpeed) {
    cv.dirSign = cv.vx > 0 ? 1 : -1;
    cv.phase += v * dt / (4 * S.amp);
  }
}

function poseCover(rig, cv, C) {
  const E = C.entry;
  const kl = cv.low, pk = cv.peek;
  const base = mixP(C, 'drop', kl, pk);
  const drop = Math.max(0, base - cv.lift * 0.7) + cv.impact * E.impactDrop;
  const back = Math.max(0.02, mixP(C, 'back', kl, pk) - gearDepth(rig, C) * (1 - 0.75 * kl) * (1 - pk));
  const lean = mixP(C, 'lean', kl, pk) + cv.impact * 0.25 - cv.blind * kl * C.blind.lowLeanLess;
  const headUp = mixP(C, 'headUp', kl, pk);
  const footW = mixP(C, 'footW', kl, pk), footF = mixP(C, 'footF', kl, pk);
  const cp = Math.cos(cv.psi), sp = Math.sin(cv.psi);

  // Cuerpo: espalda a la pared (giro π) ↔ de cara a la mira al asomarse.
  const yaw = (1 - pk) * (cv.psi - cv.turnDir * PI * cv.turn);
  // Desplazamientos en el marco de la pared → marco de la raíz. La cadera también se acerca al borde al asomarse/disparar a ciegas.
  const hxw = cv.lean * C.peekShift + cv.blind * (1 - cv.low) * (cv.edgeR ? 1 : cv.edgeL ? -1 : 0) * C.blind.highShift;
  const hzw = -back;
  const hx = hxw * cp + hzw * sp, hz = -hxw * sp + hzw * cp;
  const fcx = hzw * sp, fcz = hzw * cp;           // los pies no siguen la inclinación lateral
  _chest.set(fcx, 0, fcz);

  cv.leanNow = lean; cv.nx = Math.cos(yaw); cv.nz = -Math.sin(yaw);   // eje (perpendicular a u=(−sin,−cos)) para contrarrestar la inclinación en el brazo libre
  const m = cv.move;
  const step = m > 0.001 ? STEP : null;
  if (step) {
    step.phase = cv.phase; step.lead = Math.abs(cv.vx) / (4 * C.step.amp) / rig.core.poseSmoothing; step.amp = C.step.amp * m; step.lift = C.step.lift * m;
    step.tx = cv.dirSign * cp; step.tz = -cv.dirSign * sp;
  }
  bodyFrame(rig, C, yaw, hx, hz, drop, _chest, footF, footW, step, lean, headUp);

  // Inclinación lateral del tronco hacia el borde (alta, asomado)
  if (Math.abs(cv.lean) > 0.001) {
    const su = Math.sin(yaw), cu = Math.cos(yaw);
    rig.rotAxis('spine1', -su, 0, -cu, cv.lean * C.peekRoll * 0.5);
    rig.rotAxis('spine2', -su, 0, -cu, cv.lean * C.peekRoll * 0.5);
  }

  // Arma: cerca del pecho girada con el cuerpo; al asomarse apunta; el hombro sigue al lado (cover.side).
  if (rig.upper !== 'blindfire') {
    const tbl = holdTable(rig);
    const aim = rig.upper === 'aim' || rig.upper === 'fire';
    const mirror = aim ? pk * (1 - cv.ws) * 0.5 : 0;
    weaponFollow(rig, aim ? tbl.aim : tbl.ready, yaw, mirror,
      aim ? 0 : mixP(C, 'gunPitch', kl, pk), mixP(C, 'gunY', kl, pk) + cv.lift * 0.3, aim ? 0 : mixP(C, 'gunYaw', kl, pk));
    if (aim && mirror > 0.001 && tbl.stance) {
      // Hombro contrario: invierte el giro de columna que aplica el torso (postura de tiro).
      const s = tbl.stance.aim * 2 * mirror;
      rig.rot('spine', 0, -s * 0.3, 0); rig.rot('spine1', 0, -s * 0.35, 0); rig.rot('spine2', 0, -s * 0.35, 0);
      rig.rot('neck', 0, s * 0.5, 0); rig.rot('head', 0, s * 0.5, 0);
    }
  }
  // Mano izquierda apoyada en la pared durante el impacto de la entrada.
  if (cv.hand > 0.01) {
    const hy = lerp(1.15, 0.8, kl);
    rig.leftTarget(-0.16 * cp + -0.34 * sp, hy, 0.16 * sp + -0.34 * cp, 'char', cv.hand);
  }
}
const STEP = { phase: 0, lead: 0, amp: 0, lift: 0, tx: 1, tz: 0 };

function coverBody(rig, dt, p, st) {
  const C = cfgOf(rig), cv = cvOf(rig);
  if (rig.w >= 0.5 || cv.snap) advance(rig, cv, C, dt, p, st);
  poseCover(rig, cv, C);
}

function coverEnter(rig, p) {
  const cv = cvOf(rig);
  const prev = rig.bodyPrev.state;
  if (p && p.side) cv.side = p.side;
  if (!COVERISH.has(prev)) { cv.snap = true; cv.entry = false; return; }
  if (prev === 'coverSlide' && cv.kind === 'enter') {
    // Llegada de la carrera: impacto contra la pared y giro hasta quedar con la espalda a ella.
    cv.entry = true; cv.tc = 0; cv.snap = false;
    cv.low = 0; cv.peek = 0; cv.over = 0; cv.turn = 0; cv.lean = 0; cv.move = 0;
    cv.turnDir = cv.side >= 0 ? 1 : -1;
    cv.ws = cv.side;
  }
}

function makeCover(st, aimWeight) {
  return {
    aimWeight,
    enter(rig, p) { coverEnter(rig, p); },
    update(rig, dt, p) { coverBody(rig, dt, p, st); },
  };
}

// ── Entrada (carrera hacia la pared) y deslizamiento a la contigua ───────────
function runIn(rig, dt, p) {
  const C = cfgOf(rig), cv = cvOf(rig), E = C.entry;
  const e = rig.entity;
  const info = e && e.cover && e.cover.info;
  const sp = p.speed !== undefined ? p.speed : rig.speed;
  rig.locomotion(sp, p.dir !== undefined ? p.dir : rig.moveDir);
  if (rig.w >= 0.5) track(rig, cv, dt);
  // Preparación del impacto: cuanto más cerca del anclaje, más compresión y brazo hacia la pared.
  const dRem = info && e.pos ? Math.hypot(e.pos.x - info.point.x, e.pos.z - info.point.z) : 9;
  const b = ease.smooth(clamp(1 - dRem / E.braceDist, 0, 1));
  rig.hips(0, -0.09 * b, -0.04 * b);
  rig.plantFeet(1);
  rig.rot('spine', -0.10 * b, 0, 0); rig.rot('spine1', -0.14 * b, 0, 0); rig.rot('spine2', -0.12 * b, 0, 0);
  rig.rot('head', 0.2 * b, 0, 0);
  if (b > 0.05) {
    const cp = Math.cos(cv.psi), spn = Math.sin(cv.psi);
    rig.leftTarget(-0.16 * cp + -0.34 * spn, 1.12, 0.16 * spn + -0.34 * cp, 'char', b * b);
  }
}

const body = {};
body.coverLow = makeCover('coverLow', 0);
body.coverHigh = makeCover('coverHigh', 0);
body.peek = makeCover('peek', 1);

body.coverSlide = {
  aimWeight: 0, lowCarry: 0.6,
  enter(rig, p) {
    const cv = cvOf(rig);
    const prev = rig.bodyPrev.state;
    if (prev === 'coverSlide') return;
    cv.kind = COVERISH.has(prev) ? 'transfer' : 'enter';
    if (cv.kind === 'transfer') dashInit(rig, cv, p);
  },
  update(rig, dt, p) {
    const cv = cvOf(rig);
    if (cv.kind === 'enter') runIn(rig, dt, p);
    else dash(rig, dt, 'slide');
  },
};
body.swat = {
  aimWeight: 0, lowCarry: 1,
  enter(rig, p) { dashInit(rig, cvOf(rig), p); },
  update(rig, dt) { dash(rig, dt, 'swat'); },
};

// ── SWAT / deslizar: carrera agachada en el sentido de la marcha ─────────────
function dashInit(rig, cv, p) {
  if (p && p.side) cv.side = p.side;
  cv.heading = Math.atan2(-cv.side, 0);        // yawFromDir(±X): inicial hasta medir la velocidad
  cv.turnDir = cv.side >= 0 ? 1 : -1;          // al llegar, el giro de espalda a la pared parte del mismo lado (sin dar la vuelta larga)
  cv.dashSp = 0;
}
const DASH_STEP = { phase: 0, lead: 0, amp: 0, lift: 0, tx: 0, tz: 0 };
function dash(rig, dt, kind) {
  const C = cfgOf(rig), cv = cvOf(rig), D = C.dash[kind];
  if (rig.w >= 0.5) {
    track(rig, cv, dt);
    const sp = Math.hypot(cv.vx, cv.vz);
    cv.dashSp = sp;
    if (sp > 0.8) {
      const h = Math.atan2(-cv.vx, -cv.vz);
      cv.heading += wrapAngle(h - cv.heading) * (1 - Math.exp(-C.dash.headTurn * dt));
    }
    cv.phase += sp * dt / (4 * D.amp);
  }
  const k = ease.smooth(clamp(cv.dashSp / 2, 0, 1));
  const yaw = cv.psi + cv.heading;
  const cp = Math.cos(cv.psi), sp = Math.sin(cv.psi);
  const hzw = -C.high.back;
  _chest.set(hzw * sp, 0, hzw * cp);
  const su = Math.sin(yaw), cu = Math.cos(yaw);
  DASH_STEP.phase = cv.phase; DASH_STEP.lead = cv.dashSp / (4 * D.amp) / rig.core.poseSmoothing; DASH_STEP.amp = D.amp * k; DASH_STEP.lift = D.lift * k;
  DASH_STEP.tx = -su; DASH_STEP.tz = -cu;
  bodyFrame(rig, C, yaw, 0, 0, D.drop * lerp(0.6, 1, k), _chest.set(0, 0, 0), 0, D.footW, DASH_STEP, D.lean, 0);
  weaponFollow(rig, holdTable(rig).low, yaw, 0, 0, 0);
}

// ── Disparo a ciegas (torso) ─────────────────────────────────────────────────
const upper = {};
upper.blindfire = {
  aimWeight: 0.3,
  update(rig, dt) {
    const tbl = holdTable(rig);
    rig.hold('aim');
    if (!COVERISH.has(rig.state)) {
      rig.holdAdd(0, 0.5, 0.1, 0, 0, 0); rig.ik(1, 1);
      return;
    }
    const C = cfgOf(rig), cv = cvOf(rig), B = C.blind;
    // Posición objetivo del arma en el marco de la pared (sobre el borde / más allá del extremo) → raíz,
    // relativa al pecho tal como quedó en el último frame.
    const high = cv.low < 0.5;
    const edge = cv.edgeR ? 1 : cv.edgeL ? -1 : 0;
    let xw, yw;
    if (high && edge) { xw = edge * B.highReach; yw = B.highY; }
    else if (high) { xw = 0; yw = 1.2; }
    else { xw = -B.lowX; yw = cv.topY + B.lowClear; }
    const zw = high && !edge ? -0.1 : B.wallZ;
    const cp = Math.cos(cv.psi), sp = Math.sin(cv.psi);
    worldPos(rig.bones[rig._chest], _chest);
    rig.root.worldToLocal(_chest);
    const a = tbl.aim;
    const tx = xw * cp + zw * sp, tz = -xw * sp + zw * cp;
    rig.holdAdd(tx - _chest.x - a[0], yw - _chest.y - a[1], tz - _chest.z - a[2], B.pitch, cv.psi, 0);
    // Un brazo: la mano izquierda se queda a cubierto (no acompaña al arma, que está fuera).
    rig.ik(0, 1);
    // El brazo libre cuelga vertical (sin esto sigue la inclinación del tronco y atraviesa la pared).
    rig.rotAxis('lArm', cv.nx, 0, cv.nz, cv.leanNow * 0.75);
  },
};

export function registerAll(anim) {
  for (const k in body) anim.registerProvider([k], body[k], 'body');
  for (const k in upper) anim.registerProvider([k], upper[k], 'upper');
}
