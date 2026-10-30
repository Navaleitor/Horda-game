// Poses de torso con arma (rifle de asalto y pistola). Dueño: weapon-animator.
// Fase 1a.2: apuntar/listo con respiración, retroceso por arma, recarga normal por arma con
// continuación en la recarga activa (perfecta, buena, fallida/encasquillada), cambio de arma
// (guardar a la espalda o a la funda de la cadera y sacar la nueva) y golpe cuerpo a cuerpo
// (culatazo con el rifle, golpe con la pistola).
// Cifras: config.anim.weapons. Convenciones y utilidades del rig: cabecera de src/anim/core/characterRig.js.
//
// Recarga: 'reload' guarda su progreso en rig.mem (rlF fracción, rlDur, rlId). 'activeReload' sigue
// esa misma línea de tiempo desde donde se pulsó, a la velocidad que aplica gameplay
// (config.activeReload.perfectSpeedMult / goodSpeedMult; fallida = encasquillado y luego ritmo ×1),
// así la pose termina a la vez que weapon:reloaded.

import { bell, clamp01, curve, envelope } from '../core/math.js';

const RIFLE = 'assaultRifle';

/** Tabla por arma (cae al rifle si el id no tiene entrada). */
const tbl = (rig, key) => {
  const W = rig.cfg.weapons;
  const id = rig.weapon ? rig.weapon.id : RIFLE;
  return (W[key][id]) || W[key][RIFLE];
};
const wid = (rig) => (rig.weapon ? rig.weapon.id : RIFLE);

/** Giro de columna de la postura de tiro (hombro izq. adelante) y clavícula izq. adelantada. */
function stance(rig, which, k = 1) {
  const h = rig.core.hold[wid(rig)] || rig.core.hold[RIFLE];
  const s = (h.stance && h.stance[which]) || 0;
  if (s) {
    rig.rot('spine', 0, s * 0.3 * k, 0);
    rig.rot('spine1', 0, s * 0.35 * k, 0);
    rig.rot('spine2', 0, s * 0.35 * k, 0);
    rig.rot('neck', 0, -s * 0.5 * k, 0);
    rig.rot('head', 0, -s * 0.5 * k, 0);
  }
  const pr = (h.protract && h.protract[which]) || 0;
  if (pr) rig.rot('lShoulder', 0, -pr * k, 0);
}

/** Respiración: balanceo lento del arma (más amplio en 'ready'). */
function breathe(rig, amp) {
  const B = rig.cfg.weapons.breath;
  const s = Math.sin(rig.t * B.freq * Math.PI * 2);
  const c = Math.cos(rig.t * B.freq * Math.PI);
  rig.holdAdd(c * amp * 0.4, s * amp, 0, s * amp * 0.8, c * amp * 0.5, 0);
}

function basePose(rig, aiming, k = 1) {
  rig.hold(aiming ? 'aim' : 'ready', k);
  stance(rig, aiming ? 'aim' : 'ready', k);
}

// ── Base ─────────────────────────────────────────────────────────────────────
const none = {
  aimWeight: 0.5,
  update(rig) { basePose(rig, false); breathe(rig, rig.cfg.weapons.breath.ready); rig.ik(1, 1); },
};
const aim = {
  aimWeight: 1,
  update(rig) { basePose(rig, true); breathe(rig, rig.cfg.weapons.breath.aim); rig.ik(1, 1); },
};

// ── Disparo ──────────────────────────────────────────────────────────────────
const fire = {
  aimWeight: 1, transient: true,
  enter(rig) {
    const r = tbl(rig, 'recoil');
    rig.mem.shot = (rig.mem.shot || 0) + 1;
    rig.recoil(r.back, r.up);
  },
  update(rig) {
    const r = tbl(rig, 'recoil');
    const fromHip = rig.upperBase !== 'aim';
    // Desde la cadera sube el arma a media altura; apuntando se queda en la mira.
    rig.hold('aim', fromHip ? 0.6 : 1);
    if (fromHip) rig.hold('ready', 0.4);
    stance(rig, 'aim');
    // Patada de muñeca (pistola) y alabeo alterno por disparo (rifle en ráfaga).
    const k = 1 - clamp01(rig.t / r.kickTime);
    const side = rig.mem.shot & 1 ? 1 : -1;
    rig.holdAdd(0, 0, 0, r.wrist * k * k, r.yaw * side * k, r.roll * side * k);
    rig.rot('spine2', r.chest * k, 0, 0);
    rig.ik(1, 1);
    return rig.t >= rig.core.fireHold;
  },
};

// ── Recarga ──────────────────────────────────────────────────────────────────
/**
 * Pose de recarga en la fracción f (0..1) de la línea de tiempo del arma.
 * tilt = peso de la inclinación del arma; slap = golpe extra de la mano izq. al insertar (0..1).
 */
function reloadPose(rig, f, slap) {
  const R = tbl(rig, 'reload');
  rig.hold('ready');
  stance(rig, 'ready', 0.6);
  rig.ik(1, 1);
  const tilt = curve(R.tiltKeys, f);
  const T = R.tilt;
  rig.holdAdd(T[0] * tilt, T[1] * tilt, T[2] * tilt, T[3] * tilt, T[4] * tilt, T[5] * tilt);
  rig.rot('neck', -0.12 * tilt, 0, 0);
  rig.rot('head', -0.1 * tilt, 0.12 * tilt, 0);
  const wpn = rig.weapon;
  if (!wpn || !wpn.magazine) return;
  const home = wpn.magazine.userData.homePosition || wpn.magazine.position;
  const toMag = curve(R.toMag, f);
  const away = curve(R.away, f);
  const s = slap * bell(clamp01((f - R.insertAt) / 0.12));
  // Mano izq.: cargador → cinturón/pecho (cargador nuevo) → cargador → apoyo.
  rig.leftTarget(home.x - 0.03, home.y - 0.12 + 0.05 * s, home.z + 0.03, 'weapon', toMag * (1 - away));
  rig.leftTarget(R.pouch[0], R.pouch[1], R.pouch[2], 'char', away);
  rig.holdAdd(0, 0.025 * s, 0, 0.1 * s, 0, 0.08 * s);
  // El cargador viejo cae (se oculta) y el nuevo sube con la mano.
  const out = curve(R.magOut, f);
  if (wpn.magazine.userData.homePosition) wpn.magazine.position.set(home.x, home.y - R.drop * out, home.z);
  wpn.magazine.visible = out < 0.95;
}

function restoreMag(rig) {
  const w = rig.weapon;
  if (!w || !w.magazine) return;
  const home = w.magazine.userData.homePosition;
  if (home) w.magazine.position.copy(home);
  w.magazine.visible = true;
}

const reload = {
  aimWeight: 0.5, transient: true,
  enter(rig, p) {
    rig.mem.insertDone = false;
    rig.mem.rlF = 0;
    rig.mem.rlDur = p.duration || 2;
  },
  update(rig, dt, p) {
    const dur = rig.mem.rlDur || p.duration || 2;
    const f = rig.phase(dur);
    rig.mem.rlF = f;
    reloadPose(rig, f, 0.4);
    const ins = p.insertPhase !== undefined ? p.insertPhase : tbl(rig, 'reload').insertAt;
    if (!rig.mem.insertDone && f >= ins) { rig.mem.insertDone = true; rig.emit('anim:reload:insert', p.weaponId || null); }
    return rig.t >= dur;
  },
  exit(rig) { if (rig.upper !== 'activeReload') restoreMag(rig); },
};

const activeReload = {
  aimWeight: 0.5, transient: true,
  enter(rig, p) {
    rig.mem.arF0 = rig.mem.rlF || 0;
    rig.mem.arJam = p.result === 'failed' ? rig.config.activeReload.failedJamTime : 0;
  },
  update(rig, dt, p) {
    const AR = rig.config.activeReload;
    const A = rig.cfg.weapons.activeReload;
    const dur = rig.mem.rlDur || 2;
    const jam = rig.mem.arJam;
    let f;
    if (p.result === 'failed') {
      // Encasquillado: el arma se queda trabada, sacudidas y la mano izq. golpea el costado.
      const tj = Math.min(rig.t, jam);
      f = rig.mem.arF0 + Math.max(0, rig.t - jam) / dur;
      reloadPose(rig, Math.min(1, f), 0);
      const k = envelope(tj, 0.06, 0.2, jam) * (rig.t < jam ? 1 : 0);
      const hit = Math.max(0, Math.sin(rig.t * A.jamHitFreq * Math.PI * 2));
      const sh = Math.sin(rig.t * A.jamShakeFreq) * A.jamShake * k;
      rig.holdAdd(-0.02 * k, 0.03 * k - 0.02 * hit * k, 0, sh + 0.12 * k, 0, A.jamRoll * k + sh);
      rig.leftTarget(0.02, 0.0, -0.05 + 0.04 * hit, 'weapon', 0.8 * k);
      rig.rot('head', -0.15 * k, 0.1 * k, 0);
    } else {
      const rate = 1 / (p.result === 'perfect' ? AR.perfectSpeedMult : AR.goodSpeedMult);
      f = rig.mem.arF0 + (rig.t * rate) / dur;
      // Golpe seco del cargador (más enérgico en la perfecta) + pequeño giro de muñeca.
      const pk = p.result === 'perfect' ? A.perfectPunch : A.goodPunch;
      const k = bell(clamp01(rig.t / A.punchTime));
      reloadPose(rig, Math.min(1, f), 1);
      rig.holdAdd(0, 0.03 * k * pk, -0.02 * k * pk, 0.15 * k * pk, 0, 0.35 * k * pk);
      rig.rot('spine2', 0.04 * k * pk, 0, 0);
    }
    if (!rig.mem.insertDone && f >= tbl(rig, 'reload').insertAt) { rig.mem.insertDone = true; rig.emit('anim:reload:insert', null); }
    if (f >= 1) { restoreMag(rig); return true; }
    return rig.t > jam + dur * 2;   // salvaguarda
  },
  exit(rig) { restoreMag(rig); },
};

// ── Cambio de arma ───────────────────────────────────────────────────────────
// Primera mitad: guarda el arma actual (rifle a la espalda por el hombro derecho, pistola a la funda
// de la cadera derecha). En 0.5 se monta la nueva (rig.attachWeapon). Segunda mitad: sale de su funda.
const swap = {
  aimWeight: 0.3, transient: true,
  enter(rig) { rig.mem.swapDone = false; },
  update(rig, dt, p) {
    const id = p.weaponId;
    const dur = p.duration || (id && rig.config.weapons[id] && rig.config.weapons[id].swapTime) || 0.45;
    const t = rig.phase(dur);
    if (!rig.mem.swapDone && t >= 0.5) {
      rig.mem.swapDone = true;
      const w = id ? rig.weaponProp(id) : null;
      if (w && w !== rig.weapon) rig.attachWeapon(w.root, w);
    }
    const S = tbl(rig, 'stow');
    const k = bell(t);              // 0 → 1 (guardado) → 0
    const kk = k * k * (3 - 2 * k);
    rig.hold('ready', 1 - kk);
    rig.hold('low', kk);
    rig.holdAdd(S.offset[0] * kk, S.offset[1] * kk, S.offset[2] * kk, S.offset[3] * kk, S.offset[4] * kk, S.offset[5] * kk);
    rig.rot('spine1', 0, S.twist * kk, 0);
    rig.rot('rShoulder', S.shrug * kk, 0, 0);
    stance(rig, 'ready', 1 - kk);
    rig.ik(1 - kk, 1);            // la mano izq. suelta el arma mientras se guarda
    return t >= 1;
  },
};

// ── Cuerpo a cuerpo ──────────────────────────────────────────────────────────
const melee = {
  aimWeight: 0.6, transient: true,
  update(rig, dt, p) {
    const mc = rig.config.melee;
    const dur = p.duration || mc.duration;
    const t = rig.phase(dur);
    const hit = (p.hitTime || mc.hitTime) / dur;
    const wind = curve([0, 0, hit * 0.7, 1, hit, 0], t);
    const strike = curve([hit * 0.7, 0, hit, 1, hit + 0.15, 1, 1, 0], t);
    const M = tbl(rig, 'melee');
    rig.hold('ready');
    const a = M.wind, b = M.strike;
    rig.holdAdd(a[0] * wind + b[0] * strike, a[1] * wind + b[1] * strike, a[2] * wind + b[2] * strike,
      a[3] * wind + b[3] * strike, a[4] * wind + b[4] * strike, a[5] * wind + b[5] * strike);
    rig.ik(M.leftHand ? 1 : 1 - Math.max(wind, strike), 1);
    rig.rot('spine', 0, -0.35 * wind + 0.35 * strike, 0);
    rig.rot('spine1', -0.1 * strike, -0.25 * wind + 0.25 * strike, 0);
    rig.rot('spine2', 0, M.chestTwist * (strike - wind), 0);
    return t >= 1;
  },
};

export default function register(anim) {
  anim.registerProvider(['none'], none, 'upper');
  anim.registerProvider(['aim'], aim, 'upper');
  anim.registerProvider(['fire'], fire, 'upper');
  anim.registerProvider(['reload'], reload, 'upper');
  anim.registerProvider(['activeReload'], activeReload, 'upper');
  anim.registerProvider(['swap'], swap, 'upper');
  anim.registerProvider(['melee'], melee, 'upper');
}
