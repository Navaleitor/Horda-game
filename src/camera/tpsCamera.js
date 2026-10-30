// Cámara en tercera persona sobre el hombro (SIEMPRE tercera persona). Dueño: controls-camera-engineer.
//
// Modelo: la cámara orbita alrededor de un pivote en la cabeza del jugador con (yaw, pitch) propios.
//   pivote  = pies interpolados + (0, off.y, 0)
//   lateral = pivote + right(yaw) · off.x · lado        (lado: +1 hombro derecho, −1 izquierdo; suavizado)
//   cámara  = lateral − forward3(yaw, pitch) · off.z
// off (x, y, z) se interpola hacia el preset del contexto: hombro, apuntar, cobertura baja/alta,
// asomarse por encima (baja) o por el borde (alta). Colisión: raycast pivote→cámara con physics.raycast;
// acerca la cámara al instante y la devuelve suavemente. Sacudida rotacional (sumas de senos, sin RNG).
// Convención: yaw = 0 mira a −Z, crece girando a la izquierda; pitch > 0 mira arriba.

import * as THREE from 'three';
import { interpPos } from '../core/loop.js';

const _feet = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _lat = new THREE.Vector3();
const _want = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _target = { x: 0, y: 0, z: 0 };

const expK = (speed, dt) => 1 - Math.exp(-speed * dt);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createTpsCamera(game) {
  const cam = game.camera;
  const C = game.config.camera;
  const IN = game.config.input;

  const st = {
    yaw: 0,
    pitch: 0,
    side: 1,                 // lado suavizado (−1..1)
    off: new THREE.Vector3(C.shoulder.x, C.shoulder.y, C.shoulder.z),
    fov: C.fov,
    len: -1,                 // distancia pivote→cámara tras colisión (suavizada)
    collided: false,
    shakeAmp: 0, shakeDur: 0, shakeT: 0,
    shakeClock: 0,           // s; fase de la sacudida (sin inicializar daba NaN → frame vacío al disparar)
    lookAccelT: 0,
    menuT: 0,
    preset: 'shoulder',
    // pose sin sacudida (para el rayo de apuntado)
    pos: new THREE.Vector3(),
    pivot: new THREE.Vector3(),
  };
  const ray = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };

  function physics() { return game.hasService('physics') ? game.service('physics') : null; }

  /** Elige el preset de offset según el estado del jugador; escribe en _target y devuelve el lado deseado. */
  function chooseTarget(p) {
    const mode = p.move ? p.move.mode : 'idle';
    const cover = p.cover;
    let src = C.shoulder;
    let side = p.shoulder || 1;
    let name = 'shoulder';
    if (cover && (mode === 'cover' || mode === 'swat' || mode === 'coverSlide')) {
      if (cover.height === 'low') {
        if (cover.peeking || cover.aimingOver) { src = C.peekLow; name = 'peekLow'; }
        else { src = C.coverLow; name = 'coverLow'; }
      } else if (cover.peeking) {
        src = C.peekHigh; name = 'peekHigh';
        side = cover.side || side;      // al asomarse por el borde la cámara se va a ese lado
      } else { src = C.coverHigh; name = 'coverHigh'; }
    } else if (p.aiming) {
      src = C.aim; name = 'aim';
    }
    _target.x = src.x; _target.y = src.y; _target.z = src.z;
    st.preset = name;
    return side;
  }

  function forward3(yaw, pitch, out) {
    const cp = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  }

  /** Coloca la cámara detrás del jugador. dt = 0 → sin suavizado (snap). */
  function follow(p, dt, alpha) {
    const input = game.service('input');
    const playing = game.state === 'playing';
    const aiming = !!p.aiming;

    // ── Mirar (RS / ratón) ────────────────────────────────────────────────
    if (playing && dt > 0) {
      const look = input.axis('look');
      const m = Math.hypot(look.x, look.y);
      if (m > 0) {
        const curved = Math.pow(m, IN.lookCurve) / m;
        const sens = aiming ? IN.lookSensitivityAim : IN.lookSensitivity;
        const A = IN.lookAccel;
        if (m >= A.threshold && !aiming) st.lookAccelT += dt; else st.lookAccelT = 0;
        const accel = 1 + (A.max - 1) * clamp((st.lookAccelT - A.delay) / A.time, 0, 1);
        const k = sens * accel * curved * dt;
        // Aceleración solo horizontal (giros rápidos), el pitch no la necesita.
        st.yaw -= look.x * k;
        st.pitch += look.y * sens * curved * dt * (IN.lookInvertY ? -1 : 1);
      } else {
        st.lookAccelT = 0;
      }
      const mouse = input.consumeMouseLook();
      if (mouse.x || mouse.y) {
        const ms = IN.mouseSensitivity * (aiming ? IN.mouseAimScale : 1);
        st.yaw -= mouse.x * ms;
        st.pitch -= mouse.y * ms * (IN.lookInvertY ? -1 : 1);
      }
      st.pitch = clamp(st.pitch, C.pitchMin, C.pitchMax);
      if (st.yaw > Math.PI) st.yaw -= Math.PI * 2; else if (st.yaw < -Math.PI) st.yaw += Math.PI * 2;
    }

    // ── Offsets, lado y FOV ───────────────────────────────────────────────
    const wantSide = chooseTarget(p);
    if (dt <= 0) {
      st.off.set(_target.x, _target.y, _target.z);
      st.side = wantSide;
      st.fov = C.fov;
      st.len = -1;
    } else {
      const k = expK(C.lerpSpeed, dt);
      st.off.x += (_target.x - st.off.x) * k;
      st.off.y += (_target.y - st.off.y) * k;
      st.off.z += (_target.z - st.off.z) * k;
      st.side += (wantSide - st.side) * expK(C.shoulderSwapSpeed, dt);
      const fovT = aiming ? C.fovAim : C.fov;
      st.fov += (fovT - st.fov) * expK(C.fovLerpSpeed, dt);
    }

    // ── Posición deseada ──────────────────────────────────────────────────
    interpPos(p, alpha, _feet);
    _pivot.set(_feet.x, _feet.y + st.off.y, _feet.z);
    _right.set(Math.cos(st.yaw), 0, -Math.sin(st.yaw));
    forward3(st.yaw, st.pitch, _fwd);
    const lateral = st.off.x * st.side;
    _lat.copy(_pivot).addScaledVector(_right, lateral);
    _want.copy(_lat).addScaledVector(_fwd, -st.off.z);

    // ── Colisión: rayo pivote → cámara ────────────────────────────────────
    _dir.subVectors(_want, _pivot);
    const full = _dir.length();
    _dir.multiplyScalar(1 / (full || 1));
    let allowed = full;
    st.collided = false;
    const ph = physics();
    if (ph && full > 1e-4) {
      const hit = ph.raycast(_pivot, _dir, full + C.collisionRadius, { ignore: p });
      if (hit && hit.distance < full + C.collisionRadius) {
        allowed = Math.max(C.minDistance, hit.distance - C.collisionRadius);
        st.collided = true;
      }
    }
    if (st.len < 0 || allowed < st.len || dt <= 0) st.len = allowed;
    else st.len += (allowed - st.len) * expK(C.collisionReturnSpeed, dt);
    if (st.len > full) st.len = full;
    st.pos.copy(_pivot).addScaledVector(_dir, st.len);
    st.pivot.copy(_pivot);

    // ── Aplicar (con sacudida rotacional) ─────────────────────────────────
    let sy = 0, sp = 0;
    if (st.shakeT > 0 && dt > 0) {
      st.shakeT = Math.max(0, st.shakeT - dt);
      const w = st.shakeDur > 0 ? st.shakeT / st.shakeDur : 0;
      const a = st.shakeAmp * w * w;
      st.shakeClock += dt;
      const t = st.shakeClock;
      sy = a * (Math.sin(t * 47.3) + 0.5 * Math.sin(t * 91.7 + 1.3));
      sp = a * (Math.sin(t * 53.1 + 0.7) + 0.5 * Math.sin(t * 83.9 + 2.1));
    }
    cam.position.copy(st.pos);
    _euler.set(st.pitch + sp, st.yaw + sy, 0, 'YXZ');
    cam.quaternion.setFromEuler(_euler);
    applyFov(st.fov);
  }

  function applyFov(f) {
    if (Math.abs(cam.fov - f) > 1e-3) { cam.fov = f; cam.updateProjectionMatrix(); }
  }

  /** Toma lenta del nivel para el menú. */
  function menuShot(dt) {
    const M = C.menuOrbit;
    st.menuT += dt;
    const a = st.menuT * M.speed;
    cam.position.set(M.center[0] + Math.cos(a) * M.radius, M.height, M.center[2] + Math.sin(a) * M.radius);
    cam.lookAt(M.center[0], M.center[1], M.center[2]);
    applyFov(C.fov);
    st.pos.copy(cam.position);
  }

  function shake(amp, dur) {
    // Se queda la más fuerte de las activas.
    const cur = st.shakeDur > 0 ? st.shakeAmp * (st.shakeT / st.shakeDur) : 0;
    if (amp >= cur) { st.shakeAmp = amp; st.shakeDur = Math.max(1e-3, dur); st.shakeT = st.shakeDur; }
  }

  function getAimRay() {
    forward3(st.yaw, st.pitch, ray.dir);
    // Origen en el eje de la cámara, adelantado hasta el plano del jugador para no impactar
    // con lo que haya entre la cámara y él (contrato: rayo desde el centro de la cámara).
    _dir.subVectors(st.pivot, st.pos);
    const ahead = Math.max(0, _dir.dot(ray.dir));
    ray.origin.copy(st.pos).addScaledVector(ray.dir, ahead);
    return ray;
  }

  return {
    state: st,
    follow,
    menuShot,
    shake,
    getAimRay,
    setYawPitch(yaw, pitch) {
      if (Number.isFinite(yaw)) st.yaw = yaw;
      if (Number.isFinite(pitch)) st.pitch = clamp(pitch, C.pitchMin, C.pitchMax);
    },
  };
}
