// Movimiento del jugador: locomoción relativa a cámara, salto/vault/trepar (Y, y también agarrándose en el
// aire a un borde alcanzable), maroma (A en movimiento sin cobertura a tiro, o doble toque de A; si choca
// con una cobertura se pega a ella), agacharse (L3, alterna) y las acciones temporizadas que usa la
// cobertura (entrar corriendo, SWAT turn, deslizar a la contigua). Dueño: controls-camera-engineer.
//
// Todo en paso fijo. La colisión la resuelve physics.moveCapsule; las acciones de transferencia
// (vault, trepar, SWAT, deslizar a contigua) interpolan la posición sin colisión porque physics ya
// validó el destino (queryLedge / querySwat / queryAdjacentCover).

import * as THREE from 'three';

const _delta = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _o = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _down = new THREE.Vector3(0, -1, 0);

/** Modos de acción: bloquean disparo/apuntado y la locomoción normal. */
export const ACTION_MODES = new Set(['evade', 'vault', 'climb', 'swat', 'coverSlide']);

export const yawFromDir = (x, z) => Math.atan2(-x, -z);

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Gira `cur` hacia `target` como mucho `maxStep` rad (camino corto). */
export function turnToward(cur, target, maxStep) {
  const d = wrapAngle(target - cur);
  if (Math.abs(d) <= maxStep) return wrapAngle(target);
  return wrapAngle(cur + Math.sign(d) * maxStep);
}

const smooth = (t) => t * t * (3 - 2 * t);

export function createMovement(ctx) {
  const { e } = ctx;
  const P = ctx.game.config.player;
  const PH = ctx.game.config.physics;
  const CC = ctx.game.config.cover;
  const cap = { pos: e.pos, radius: e.radius, height: e.height };

  const st = {
    airT: 0,          // s sin suelo
    jumped: false,    // el último despegue fue un salto (no una caída)
    landT: 0,         // s restantes de la pose de aterrizaje
    evadeCD: 0,
    aUsedForCover: false,   // la última pulsación de A fue para cobertura → no cuenta para doble toque
    lastFallSpeed: 0,
    crouched: false,  // L3: agachado fuera de cobertura
  };
  const crouchPayload = { who: e, crouched: false };

  // Acción temporizada en curso.
  const act = {
    type: null,       // 'evade' (maroma) | 'vault' | 'climb' | 'moveTo' | 'transfer'
    mode: null,       // move.mode a mostrar
    t: 0, dur: 0, speed: 0,
    from: new THREE.Vector3(), to: new THREE.Vector3(), ctrl: new THREE.Vector3(), dir: new THREE.Vector3(),
    topY: 0, yaw: 0, yaw0: 0,
    onDone: null,
  };

  // ── Física ───────────────────────────────────────────────────────────────
  function physMove(dx, dy, dz) {
    _delta.set(dx, dy, dz);
    cap.height = e.height;
    const r = ctx.physics.moveCapsule(cap, _delta);
    const wasGrounded = e.grounded;
    e.grounded = !!(r && r.grounded);
    if (r && r.hitWall && r.wallNormal) {
      const n = r.wallNormal;
      const nx = n.x ?? n[0] ?? 0, nz = n.z ?? n[2] ?? 0;
      const vn = e.vel.x * nx + e.vel.z * nz;
      if (vn < 0) { e.vel.x -= vn * nx; e.vel.z -= vn * nz; }
    }
    if (e.grounded) {
      if (!wasGrounded) onLand();
      st.airT = 0;
      st.jumped = false;
      if (e.vel.y < 0) e.vel.y = 0;
    }
    return r;
  }

  function onLand() {
    // Caer de un borde agachado: al aterrizar se pone de pie (si hay hueco).
    if (st.crouched) setCrouch(false);
    const fall = -e.vel.y;
    st.lastFallSpeed = fall;
    if (fall > P.landMinSpeed) {
      st.landT = P.landTime;
      if (fall > P.hardLandSpeed) {
        ctx.input.rumble(P.rumble.land[0], P.rumble.land[1], P.rumble.land[2]);
        if (ctx.camera) ctx.camera.shake(P.landShake.amp, P.landShake.dur);
      }
    }
  }

  function applyGravity(dt) {
    if (e.grounded) e.vel.y = -P.groundStick;
    else e.vel.y = Math.max(-PH.terminalVelocity, e.vel.y - PH.gravity * dt);
  }

  // ── Agacharse (L3) ───────────────────────────────────────────────────────
  /** ¿Cabe la cápsula de pie? Rayos verticales (centro + 4 puntos del radio) desde la altura agachado. */
  function headroomFree() {
    const r = e.radius * 0.85;
    const from = P.crouchHeight - 0.05, len = P.height - P.crouchHeight + 0.1;
    for (let i = 0; i < 5; i++) {
      const ox = i === 1 ? r : i === 2 ? -r : 0, oz = i === 3 ? r : i === 4 ? -r : 0;
      _o.set(e.pos.x + ox, e.pos.y + from, e.pos.z + oz);
      if (ctx.physics.raycast(_o, _up, len)) return false;
    }
    return true;
  }

  /** Agacha/levanta. Levantarse exige hueco salvo `force`. Devuelve true si queda en el estado pedido. */
  function setCrouch(on, force = false) {
    if (st.crouched === on) return true;
    if (!on && !force && !headroomFree()) return false;
    st.crouched = on;
    e.crouched = on;
    e.height = on ? P.crouchHeight : P.height;
    crouchPayload.crouched = on;
    ctx.game.events.emit('player:crouch', crouchPayload);
    return true;
  }

  // ── Locomoción ───────────────────────────────────────────────────────────
  /** Dirección para consultas (cobertura, salientes): stick si se inclina; si no, `fallback`. */
  function queryDir(fallback, out) {
    if (ctx.stickMag > P.queryStickMin) return out.copy(ctx.wish);
    return out.copy(fallback);
  }

  function locomotion(dt) {
    const I = ctx.input;
    const mag = ctx.stickMag;

    // A: cobertura a tiro = entrar (corriendo a velocidad normal) · sin cobertura = maroma en la
    // dirección del stick (quieto: hacia donde mira el personaje) · doble toque = maroma (alias).
    // Agachado: A pone de pie (si hay hueco) y hace lo que toque.
    if (I.pressed('cover')) {
      const dbl = I.doubleTap('cover') && !st.aUsedForCover;
      st.aUsedForCover = false;
      if (e.grounded) {
        if (dbl && st.evadeCD <= 0) { setCrouch(false); startEvade(); return; }
        queryDir(ctx.camFwd, _dir);
        if (ctx.cover.tryEnter(_dir, CC.snapDistance, CC.snapSpeed)) { st.aUsedForCover = true; return; }
        if (st.evadeCD <= 0) { setCrouch(false); startEvade(); return; }
      }
    }

    // L3: alterna agachado / de pie (solo en el suelo; levantarse exige hueco).
    if (I.pressed('crouch') && e.grounded) setCrouch(!st.crouched);

    // Y: saliente (vault/trepar) o salto. Agachado: se levanta y salta (sin hueco no hace nada).
    if (I.pressed('jump') && !st.jumped && (e.grounded || st.airT < P.jump.coyoteTime) && setCrouch(false)) {
      queryDir(ctx.bodyFwd, _dir);
      if (!tryLedge(_dir)) {
        e.vel.y = P.jump.velocity;
        e.grounded = false;
        st.jumped = true;
        st.airT = P.jump.coyoteTime;   // sin doble salto por coyote
      } else return;
    }

    // Velocidad objetivo.
    let target = 0;
    let mode = 'idle';
    if (st.crouched) {
      mode = 'crouch';
      if (mag > P.stickIdle) target = P.speed.crouch * Math.min(1, Math.max(0.4, mag / P.stickRunMin));
    } else if (mag > P.stickIdle) {
      if (ctx.aimDown) { target = P.speed.aim * Math.min(1, mag / P.stickRunMin); mode = 'walk'; }
      else if (mag < P.stickWalkMax) { target = P.speed.walk * Math.max(0.4, mag / P.stickWalkMax); mode = 'walk'; }
      else if (mag < P.stickRunMin) { target = P.speed.jog; mode = 'jog'; }
      else { target = P.speed.run; mode = 'run'; }
    }
    const tx = ctx.wish.x * target, tz = ctx.wish.z * target;
    const dvx = tx - e.vel.x, dvz = tz - e.vel.z;
    const dv = Math.hypot(dvx, dvz);
    if (dv > 0) {
      const speeding = target * target > e.vel.x * e.vel.x + e.vel.z * e.vel.z;
      let rate = speeding ? P.accel : P.decel;
      if (!e.grounded) rate *= P.airControl;
      const s = Math.min(1, (rate * dt) / dv);
      e.vel.x += dvx * s;
      e.vel.z += dvz * s;
    }
    applyGravity(dt);
    physMove(e.vel.x * dt, e.vel.y * dt, e.vel.z * dt);
    if (!e.grounded) st.airT += dt;

    if (!e.grounded && (st.jumped || st.airT > P.jump.coyoteTime)) {
      mode = 'air';
      if (tryAirLedge()) return;
    }
    ctx.setMode(mode);

    // Orientación: apuntando/disparando mira con la cámara; si no, hacia donde se mueve.
    if (ctx.aimDown || ctx.fireDown) {
      e.yaw = turnToward(e.yaw, ctx.camYaw, P.aimTurnRate * dt);
    } else {
      const hs = Math.hypot(e.vel.x, e.vel.z);
      if (hs > P.faceMinSpeed && mag > P.stickIdle) {
        e.yaw = turnToward(e.yaw, yawFromDir(ctx.wish.x, ctx.wish.z), P.turnRate * dt);
      }
    }
  }

  // ── Acciones ─────────────────────────────────────────────────────────────
  function begin(type, mode, dur) {
    act.type = type; act.mode = mode; act.t = 0; act.dur = dur; act.onDone = null;
    ctx.setMode(mode);
  }

  function startEvade() {
    queryDir(ctx.bodyFwd, act.dir);
    act.dir.y = 0; act.dir.normalize();
    begin('evade', 'evade', P.evade.duration);
    act.speed = P.evade.speed;
    ctx.rumble('evade');
  }

  /** Y: consulta queryLedge en `dir`. Devuelve true si empieza vault/trepar. */
  function tryLedge(dir, airFull = 0) {
    const L = ctx.physics.queryLedge(e.pos, dir);
    if (!L || (L.kind !== 'vault' && L.kind !== 'climb')) return false;
    const lp = L.landPos;
    act.from.copy(e.pos);
    act.to.set(lp.x ?? lp[0], lp.y ?? lp[1], lp.z ?? lp[2]);
    act.topY = L.topY;
    act.dir.set(act.to.x - e.pos.x, 0, act.to.z - e.pos.z);
    if (act.dir.lengthSq() < 1e-6) act.dir.copy(dir);
    act.dir.y = 0; act.dir.normalize();
    act.yaw = yawFromDir(act.dir.x, act.dir.z);
    if (L.kind === 'vault') begin('vault', 'vault', P.vault.duration);
    else {
      // Agarrado en el aire: la subida dura en proporción a lo que falta (cima − pies) sobre la altura total.
      let dur = P.climb.duration;
      if (airFull > 0) dur = Math.min(P.climb.duration, Math.max(P.climb.minAirDuration, P.climb.duration * (L.topY - e.pos.y) / airFull));
      begin('climb', 'climb', dur);
    }
    e.vel.set(0, 0, 0);
    return true;
  }

  /**
   * En el aire (salto o caída): si delante (stick, velocidad o cara) hay un borde de vault/trepar, se agarra.
   * queryLedge mide desde los pies actuales; además la cima no puede quedar a más de climb.maxHeight
   * sobre el suelo bajo el jugador (un borde inalcanzable desde el suelo tampoco se alcanza saltando).
   */
  function tryAirLedge() {
    if (ctx.stickMag > P.queryStickMin) _dir.copy(ctx.wish);
    else if (Math.hypot(e.vel.x, e.vel.z) > P.faceMinSpeed) _dir.set(e.vel.x, 0, e.vel.z).normalize();
    else _dir.copy(ctx.bodyFwd);
    const L = ctx.physics.queryLedge(e.pos, _dir);
    if (!L || (L.kind !== 'vault' && L.kind !== 'climb')) return false;
    _o.set(e.pos.x, e.pos.y + 0.05, e.pos.z);
    const g = ctx.physics.raycast(_o, _down, P.airGrab.groundProbe);
    const groundY = g ? g.point.y : e.pos.y;
    if (L.topY - groundY > P.climb.maxHeight + 1e-3) return false;
    if (!setCrouch(false)) return false;
    _tmp.copy(_dir);
    return tryLedge(_tmp, Math.max(1e-3, L.topY - groundY));
  }

  /** Correr hasta un punto con colisión (entrar en cobertura). */
  function startMoveTo(to, speed, faceYaw, mode, onDone) {
    act.from.copy(e.pos);
    act.to.set(to.x, e.pos.y, to.z);
    const d = Math.hypot(act.to.x - e.pos.x, act.to.z - e.pos.z);
    begin('moveTo', mode, d / Math.max(0.1, speed) + P.moveToSlack);
    act.speed = speed;
    act.yaw = faceYaw;
    act.onDone = onDone;
  }

  /**
   * Transferencia interpolada (curva de Bézier) sin colisión: SWAT turn / deslizar a la contigua.
   * bulge: vector de abombamiento (sale de la cobertura) aplicado al punto de control.
   */
  function startTransfer(to, faceYaw, mode, speed, minDur, bulge, onDone) {
    act.from.copy(e.pos);
    act.to.set(to.x, e.pos.y, to.z);
    act.ctrl.addVectors(act.from, act.to).multiplyScalar(0.5).add(bulge);
    const d = act.from.distanceTo(act.to);
    begin('transfer', mode, Math.max(minDur, d / Math.max(0.1, speed)));
    act.yaw0 = e.yaw;
    act.yaw = faceYaw;
    act.onDone = onDone;
  }

  function finish() {
    const done = act.onDone;
    act.type = null; act.mode = null; act.onDone = null;
    if (done) done();
  }

  function cancel() { act.type = null; act.mode = null; act.onDone = null; }

  /** Avanza la acción en curso. Devuelve true si hay acción activa este paso. */
  function stepAction(dt) {
    if (!act.type) return false;
    act.t += dt;
    const k = Math.min(1, act.t / act.dur);
    switch (act.type) {
      case 'evade': {
        const s = act.speed * (1 - P.evade.endFalloff * k);
        e.vel.x = act.dir.x * s; e.vel.z = act.dir.z * s;
        applyGravity(dt);
        physMove(e.vel.x * dt, e.vel.y * dt, e.vel.z * dt);
        e.yaw = turnToward(e.yaw, yawFromDir(act.dir.x, act.dir.z), P.actionTurnRate * dt);
        // Choca con una cobertura en la dirección de la maroma → se pega (mismo flujo que A, tramo corto).
        _tmp.copy(act.dir);
        if (ctx.cover.tryEnter(_tmp, CC.evadeSnapDistance, CC.snapSpeed)) {
          st.evadeCD = P.evade.cooldown; st.aUsedForCover = true;
          break;
        }
        if (k >= 1) { st.evadeCD = P.evade.cooldown; e.vel.x *= 0.4; e.vel.z *= 0.4; finish(); }
        break;
      }
      case 'vault': {
        const s = smooth(k);
        const base = act.from.y + (act.to.y - act.from.y) * s;
        const peak = Math.max(0, act.topY + P.vault.clearance - Math.max(act.from.y, act.to.y));
        e.pos.x = act.from.x + (act.to.x - act.from.x) * s;
        e.pos.z = act.from.z + (act.to.z - act.from.z) * s;
        e.pos.y = base + peak * Math.sin(Math.PI * k);
        e.yaw = turnToward(e.yaw, act.yaw, P.actionTurnRate * dt);
        if (k >= 1) {
          e.pos.copy(act.to);
          e.vel.set(act.dir.x * P.vault.exitSpeed, 0, act.dir.z * P.vault.exitSpeed);
          e.grounded = false;
          physMove(0, -P.groundStick * dt, 0);
          finish();
        }
        break;
      }
      case 'climb': {
        // Fase 1: subir en vertical hasta topY. Fase 2: avanzar hasta landPos.
        const split = P.climb.upFraction;
        if (k < split) {
          const s = smooth(k / split);
          e.pos.y = act.from.y + (act.topY - act.from.y) * s;
        } else {
          const s = smooth((k - split) / (1 - split));
          e.pos.x = act.from.x + (act.to.x - act.from.x) * s;
          e.pos.z = act.from.z + (act.to.z - act.from.z) * s;
          e.pos.y = act.topY + (act.to.y - act.topY) * s;
        }
        e.yaw = turnToward(e.yaw, act.yaw, P.actionTurnRate * dt);
        if (k >= 1) {
          e.pos.copy(act.to);
          e.vel.set(0, 0, 0);
          e.grounded = false;
          physMove(0, -P.groundStick * dt, 0);
          finish();
        }
        break;
      }
      case 'moveTo': {
        _tmp.set(act.to.x - e.pos.x, 0, act.to.z - e.pos.z);
        const d = _tmp.length();
        const stepLen = act.speed * dt;
        if (d <= stepLen + 1e-3) {
          applyGravity(dt);
          physMove(_tmp.x, e.vel.y * dt, _tmp.z);
          e.vel.x = 0; e.vel.z = 0;
          finish();
          break;
        }
        _tmp.multiplyScalar(1 / d);
        e.vel.x = _tmp.x * act.speed; e.vel.z = _tmp.z * act.speed;
        applyGravity(dt);
        physMove(e.vel.x * dt, e.vel.y * dt, e.vel.z * dt);
        e.yaw = turnToward(e.yaw, act.yaw, P.actionTurnRate * dt);
        if (act.t >= act.dur) {
          // Atascado: si estamos cerca, se completa; si no, se cancela.
          const rest = Math.hypot(act.to.x - e.pos.x, act.to.z - e.pos.z);
          if (rest < P.moveToSnap) { e.pos.x = act.to.x; e.pos.z = act.to.z; e.vel.set(0, 0, 0); finish(); }
          else { cancel(); ctx.cover.abortEnter(); }
        }
        break;
      }
      case 'transfer': {
        const s = smooth(k);
        const a = 1 - s;
        e.pos.x = a * a * act.from.x + 2 * a * s * act.ctrl.x + s * s * act.to.x;
        e.pos.z = a * a * act.from.z + 2 * a * s * act.ctrl.z + s * s * act.to.z;
        e.yaw = wrapAngle(act.yaw0 + wrapAngle(act.yaw - act.yaw0) * s);
        e.vel.set(0, 0, 0);
        if (k >= 1) { e.pos.x = act.to.x; e.pos.z = act.to.z; finish(); }
        break;
      }
      default: cancel();
    }
    if (act.type) ctx.setMode(act.mode);
    return true;
  }

  function step(dt) {
    if (st.evadeCD > 0) st.evadeCD -= dt;
    if (st.landT > 0) st.landT -= dt;
    if (stepAction(dt)) return;
    locomotion(dt);
  }

  function reset() {
    cancel();
    st.airT = 0; st.jumped = false; st.landT = 0; st.evadeCD = 0; st.aUsedForCover = false;
    setCrouch(false, true);
    e.vel.set(0, 0, 0);
  }

  return {
    st, act, step, reset, cancel, tryLedge, setCrouch, startMoveTo, startTransfer, physMove, applyGravity, queryDir,
    get busy() { return act.type !== null; },
  };
}
