// Proveedores por defecto (animation-engineer). Garantizan que TODOS los estados tengan pose.
// Los especialistas los sustituyen desde src/anim/{locomotion,cover,weapons,…}/index.js.
// Convenciones de ejes y utilidades del rig: cabecera de characterRig.js.

import { bell, clamp01, curve, ease, envelope, remap01 } from './math.js';

const PI = Math.PI;

/** Velocidad/dirección del params o, si faltan, las medidas por el rig desde la entidad. */
const spd = (rig, p) => (p.speed !== undefined ? p.speed : rig.speed);
const mdir = (rig, p) => (p.dir !== undefined ? p.dir : rig.moveDir);

/** Giro de columna de la "postura de tiro" (hombro izq. adelante). */
function stance(rig, which, k = 1) {
  const id = rig.weapon ? rig.weapon.id : null;
  if (!id) return;
  const tbl = rig.core.hold[id] || rig.core.hold.assaultRifle;
  const s = (tbl.stance && tbl.stance[which]) || 0;
  if (!s) return;
  rig.rot('spine', 0, s * 0.3 * k, 0);
  rig.rot('spine1', 0, s * 0.35 * k, 0);
  rig.rot('spine2', 0, s * 0.35 * k, 0);
  rig.rot('neck', 0, -s * 0.5 * k, 0);   // la cabeza vuelve a mirar al frente
  rig.rot('head', 0, -s * 0.5 * k, 0);
}

/** Pose agachada base: cadera abajo, pies plantados, tronco algo adelantado. */
function crouchPose(rig, depth, lean) {
  rig.hips(0, depth, 0.06);
  rig.plantFeet(1);
  rig.rot('spine', lean * 0.5, 0, 0);
  rig.rot('spine1', lean * 0.3, 0, 0);
  rig.rot('spine2', lean * 0.2, 0, 0);
}

// ── CUERPO ────────────────────────────────────────────────────────────────────
const body = {};

body.idle = {
  update(rig) { rig.clip('Idle'); },
};

function loco(extraLean) {
  return {
    update(rig, dt, p) {
      rig.locomotion(spd(rig, p), mdir(rig, p));
      if (extraLean) rig.rot('spine', -extraLean * clamp01(spd(rig, p) / 4), 0, 0);
    },
  };
}
body.walk = loco(0);
body.jog = loco(0.05);
body.run = loco(0.08);
body.sprint = {
  aimWeight: 0, lowCarry: 1,
  update(rig, dt, p) {
    rig.locomotion(spd(rig, p), mdir(rig, p));
    rig.rot('spine', -0.18, 0, 0);
    rig.rot('spine1', -0.08, 0, 0);
    rig.rot('neck', 0.15, 0, 0);
  },
};

body.crouch = {
  update(rig, dt, p) {
    const s = spd(rig, p);
    rig.locomotion(s, mdir(rig, p));
    crouchPose(rig, rig.core.crouchHips, -0.3);
  },
};

body.jump = {
  aimWeight: 0.6,
  update(rig, dt, p) {
    rig.clip('Run', 1, 0.0001);
    const k = ease.outQuad(rig.phase(0.25));
    rig.rot('lUpLeg', 0.9 * k, 0, 0); rig.rot('lLeg', -1.3 * k, 0, 0);
    rig.rot('rUpLeg', 0.3 * k, 0, 0); rig.rot('rLeg', -0.6 * k, 0, 0);
    rig.rot('spine', -0.12 * k, 0, 0);
  },
};
body.fall = {
  aimWeight: 0.6,
  update(rig, dt, p) {
    rig.clip('Idle');
    const sway = Math.sin(rig.t * 6) * 0.08;
    rig.rot('lUpLeg', 0.35 + sway, 0, 0); rig.rot('lLeg', -0.55, 0, 0);
    rig.rot('rUpLeg', 0.1 - sway, 0, 0); rig.rot('rLeg', -0.35, 0, 0);
    rig.rot('lArm', 0, 0, -0.3); rig.rot('rArm', 0, 0, 0.3);
  },
};
body.land = {
  update(rig, dt, p) {
    rig.clip('Idle');
    const impact = p.impact !== undefined ? p.impact : 0.6;
    const k = curve(LAND_CURVE, rig.t) * impact;
    rig.hips(0, -0.3 * k, 0.04 * k);
    rig.plantFeet(1);
    rig.rot('spine', -0.3 * k, 0, 0);
  },
};
const LAND_CURVE = [0, 0, 0.08, 1, 0.35, 0];

function traverse(kind) {
  return {
    aimWeight: 0, lowCarry: 1, handsFree: 1,
    update(rig, dt, p) {
      const pc = rig.config.player[kind];
      const dur = p.duration || (pc && pc.duration) || 0.6;
      const t = rig.phase(dur);
      rig.clip('Idle', 1, 0.5);
      const reach = bell(t);
      // Mano izquierda apoyada / ambas arriba al trepar
      rig.rot('lArm', 0.9 * reach, 0, kind === 'climb' ? -1.2 * reach : -0.4 * reach);
      if (kind === 'climb') rig.rot('rArm', 0.6 * reach, 0, 0.6 * reach);
      // Piernas recogidas en el centro del gesto
      const tuck = bell(remap01(t, 0.15, 0.85));
      rig.rot('lUpLeg', 1.1 * tuck, 0, kind === 'vault' ? 0.4 * tuck : 0);
      rig.rot('lLeg', -1.6 * tuck, 0, 0);
      rig.rot('rUpLeg', 0.9 * tuck, 0, kind === 'vault' ? 0.5 * tuck : 0);
      rig.rot('rLeg', -1.4 * tuck, 0, 0);
      rig.rot('spine', -0.35 * reach, 0, kind === 'vault' ? -0.2 * reach : 0);
      // El jugador sube la raíz: aquí solo un pequeño adelanto visual de la cadera
      rig.hips(0, kind === 'climb' ? -0.25 * (1 - t) : 0.05 * reach, -0.1 * reach);
    },
  };
}
body.climb = traverse('climb');
body.vault = traverse('vault');

body.slide = {
  aimWeight: 0.3, lowCarry: 0.7,
  update(rig, dt, p) {
    rig.clip('Run', 1, 0.0001);
    const k = ease.smooth(rig.phase(0.1));
    rig.hips(0, rig.core.slideHips * k, 0.1 * k);
    rig.rot('hips', 0.25 * k, 0, 0);
    rig.rot('spine', 0.15 * k, 0, 0);
    rig.rot('rUpLeg', 1.1 * k, 0, 0); rig.rot('rLeg', -0.2 * k, 0, 0);
    rig.rot('lUpLeg', 0.5 * k, 0, 0.3 * k); rig.rot('lLeg', -1.9 * k, 0, 0);
  },
};

body.evade = {
  aimWeight: 0, lowCarry: 1, handsFree: 1,
  update(rig, dt, p) {
    const dur = p.duration || rig.config.player.evade.duration;
    const t = rig.phase(dur);
    rig.clip('Run', 1, 0.0001);
    const d = p.dir || 0;               // 0 adelante, +π/2 izquierda
    // Voltereta: giro completo alrededor del eje perpendicular a la dirección de la evasión.
    const ang = 2 * PI * ease.inOutSine(t);
    rig.rotAxis('hips', -Math.cos(d), 0, Math.sin(d), ang);
    const tuck = bell(t);
    rig.hips(0, -0.45 * tuck, 0);
    rig.rot('spine', -0.5 * tuck, 0, 0);
    rig.rot('lUpLeg', 1.4 * tuck, 0, 0); rig.rot('lLeg', -2.0 * tuck, 0, 0);
    rig.rot('rUpLeg', 1.4 * tuck, 0, 0); rig.rot('rLeg', -2.0 * tuck, 0, 0);
  },
};

/** Cobertura genérica (el especialista la sustituye). El personaje mira hacia la cobertura. */
function coverPose(rig, p, forcePeek) {
  const low = (p.height || (rig.state === 'coverHigh' ? 'high' : 'low')) === 'low';
  const side = p.side || 1;
  const peek = forcePeek || !!p.peeking;
  const over = !!(p.aimingOver || p.over);
  const s = spd(rig, p);
  rig.locomotion(s, s > 0.1 ? side * PI * 0.5 : 0, 0.7);
  rig.clip('Idle', 0.3);
  if (low) {
    const up = over ? 0.75 : 0;             // asomarse por encima
    crouchPose(rig, rig.core.coverLowHips * (1 - up), -0.35 * (1 - up));
    if (peek && !over) { rig.hips(0.25 * side, 0.05, 0); rig.rot('spine', 0, 0, -0.25 * side); }
  } else {
    crouchPose(rig, -0.08, -0.1);
    if (peek || over) {
      rig.hips(0.3 * side, 0, 0);
      rig.rot('spine', 0, 0, -0.2 * side);
      rig.rot('spine1', 0, 0, -0.15 * side);
    }
  }
}
body.coverLow = {
  aimWeight: 0.35,
  update(rig, dt, p) { coverPose(rig, p, false); },
};
body.coverHigh = { aimWeight: 0.35, update(rig, dt, p) { coverPose(rig, p, false); } };
body.peek = { aimWeight: 1, update(rig, dt, p) { coverPose(rig, p, true); } };
body.swat = {
  aimWeight: 0, lowCarry: 1,
  update(rig, dt, p) {
    rig.locomotion(p.speed !== undefined ? p.speed : Math.max(rig.speed, 4), mdir(rig, p));
    crouchPose(rig, -0.3, -0.5);
  },
};
body.coverSlide = {
  aimWeight: 0, lowCarry: 0.8,
  update(rig, dt, p) {
    rig.locomotion(spd(rig, p), mdir(rig, p));
    crouchPose(rig, -0.32, -0.45);
  },
};

// ── Provisionales (fases posteriores) ──
body.hit = {
  aimWeight: 0.5,
  update(rig) { rig.clip('Idle'); const k = bell(rig.phase(0.3)); rig.rot('spine', 0.25 * k, 0, 0); rig.rot('neck', 0.2 * k, 0, 0); },
};
body.stun = { aimWeight: 0, update(rig) { rig.clip('Idle', 1, 0.5); rig.rot('spine', 0.1, 0, Math.sin(rig.t * 3) * 0.1); } };
body.frozen = { aimWeight: 0, update(rig) { rig.clip('Idle', 1, 0); } };
body.death = {
  aimWeight: 0, lowCarry: 1, handsFree: 1,
  update(rig) {
    rig.clip('Idle', 1, 0);
    const k = ease.inQuad(rig.phase(0.7));
    rig.hips(0, -0.8 * k, 0.4 * k);
    rig.rot('hips', 1.45 * k, 0, 0);
    rig.rot('lUpLeg', 0.5 * k, 0, 0); rig.rot('rUpLeg', 0.3 * k, 0, 0);
  },
};
body.downed = {
  aimWeight: 0, lowCarry: 1, handsFree: 1,
  update(rig) {
    rig.clip('Idle', 1, 0.3);
    const k = ease.outQuad(rig.phase(0.4));
    rig.hips(0, -0.7 * k, 0.1 * k); rig.plantFeet(0.5);
    rig.rot('spine', -0.5 * k, 0, 0);
  },
};
body.crawl = {
  aimWeight: 0, lowCarry: 1, handsFree: 1,
  update(rig, dt, p) {
    rig.locomotion(Math.min(spd(rig, p), 1), 0);
    rig.hips(0, -0.75, 0.1);
    rig.rot('spine', -0.6, 0, 0);
  },
};
body.revive = { aimWeight: 0.3, handsFree: 1, update(rig) { rig.clip('Idle'); crouchPose(rig, -0.45, -0.5); } };
body.revived = {
  update(rig) { rig.clip('Idle'); const k = 1 - ease.outQuad(rig.phase(0.6)); crouchPose(rig, -0.5 * k, -0.4 * k); },
};
body.carry = { aimWeight: 0.3, handsFree: 1, update(rig, dt, p) { rig.locomotion(spd(rig, p), mdir(rig, p)); rig.rot('spine', 0.08, 0, 0); } };
body.mounted = { aimWeight: 1, update(rig) { rig.clip('Idle'); crouchPose(rig, -0.12, -0.15); } };

// ── TORSO ─────────────────────────────────────────────────────────────────────
const upper = {};

upper.none = {
  aimWeight: 0.5,
  update(rig) { rig.hold('ready'); rig.ik(1, 1); stance(rig, 'ready'); },
};
upper.aim = {
  aimWeight: 1,
  update(rig) { rig.hold('aim'); rig.ik(1, 1); stance(rig, 'aim'); },
};
/** Pose base del estado de torso de fondo (aim o ready). */
function base(rig) {
  const aiming = rig.upperBase === 'aim';
  rig.hold(aiming ? 'aim' : 'ready');
  stance(rig, aiming ? 'aim' : 'ready');
  rig.ik(1, 1);
}
upper.fire = {
  aimWeight: 1, transient: true,
  enter(rig) {
    const r = rig.core.recoil;
    const k = rig.weapon && rig.weapon.id === 'pistol' ? 1.3 : 1;
    rig.recoil(r.back * k, r.up * k);
  },
  update(rig) {
    // Disparando desde la cadera: sube el arma a media altura.
    rig.hold('aim', rig.upperBase === 'aim' ? 1 : 0.6);
    if (rig.upperBase !== 'aim') rig.hold('ready', 0.4);
    stance(rig, 'aim');
    rig.ik(1, 1);
    return rig.t >= rig.core.fireHold;
  },
};

upper.reload = {
  aimWeight: 0.5, transient: true,
  enter(rig, p) { rig.mem.insertDone = false; },
  update(rig, dt, p) {
    const dur = p.duration || 2;
    const t = rig.phase(dur);
    rig.hold('ready');
    stance(rig, 'ready');
    rig.ik(1, 1);
    // Arma inclinada hacia la izquierda y algo levantada para mirar el pozo del cargador
    const tilt = envelope(rig.t, dur * 0.12, dur * 0.18, dur);
    rig.holdAdd(-0.04 * tilt, 0.06 * tilt, 0.04 * tilt, 0.25 * tilt, 0.2 * tilt, 0.5 * tilt);
    // Mano izquierda: support → cargador → cinturón → cargador → support
    const wpn = rig.weapon;
    if (wpn && wpn.magazine) {
      const m = wpn.magazine.userData.homePosition || wpn.magazine.position;
      const toMag = curve(RELOAD_TO_MAG, t);
      const away = curve(RELOAD_AWAY, t);
      rig.leftTarget(m.x - 0.03, m.y - 0.12, m.z + 0.03, 'weapon', toMag * (1 - away));
      rig.leftTarget(-0.18, 0.95, 0.02, 'char', away);
      // El cargador cae y vuelve
      const out = curve(RELOAD_MAG_OUT, t);
      const home = wpn.magazine.userData.homePosition;
      if (home) wpn.magazine.position.set(home.x, home.y - 0.25 * out, home.z);
      wpn.magazine.visible = out < 0.95;
    }
    const ins = p.insertPhase !== undefined ? p.insertPhase : rig.core.reloadInsertPhase;
    if (!rig.mem.insertDone && t >= ins) { rig.mem.insertDone = true; rig.emit('anim:reload:insert', p.weaponId || null); }
    return rig.t >= dur;
  },
  exit(rig) { restoreMag(rig); },
};
const RELOAD_TO_MAG = [0, 0, 0.15, 1, 0.75, 1, 0.9, 0];
const RELOAD_AWAY = [0.2, 0, 0.32, 1, 0.45, 1, 0.57, 0];
const RELOAD_MAG_OUT = [0.18, 0, 0.26, 1, 0.5, 1, 0.6, 0];
function restoreMag(rig) {
  const w = rig.weapon;
  if (!w || !w.magazine) return;
  const home = w.magazine.userData.homePosition;
  if (home) w.magazine.position.copy(home);
  w.magazine.visible = true;
}

upper.activeReload = {
  aimWeight: 0.5, transient: true,
  update(rig, dt, p) {
    rig.hold('ready'); stance(rig, 'ready'); rig.ik(1, 1);
    restoreMag(rig);
    if (p.result === 'failed') {
      // Encasquillado: sacudida del arma
      const jam = rig.config.activeReload.failedJamTime;
      const k = envelope(rig.t, 0.05, 0.2, jam);
      const s = Math.sin(rig.t * 38) * 0.06 * k;
      rig.holdAdd(0, 0, 0, s, 0, 0.35 * k + s);
      return rig.t >= jam;
    }
    // Perfecta/buena: golpe seco del cargador
    const k = bell(rig.phase(0.3));
    rig.holdAdd(0, 0.03 * k, 0, 0.12 * k, 0, 0.3 * k);
    if (!rig.mem.insertDone && rig.t >= 0.08) { rig.mem.insertDone = true; rig.emit('anim:reload:insert', null); }
    return rig.t >= 0.3;
  },
  exit(rig) { restoreMag(rig); },
};

upper.swap = {
  aimWeight: 0.3, transient: true,
  enter(rig, p) { rig.mem.swapDone = false; },
  update(rig, dt, p) {
    const id = p.weaponId;
    const dur = p.duration || (id && rig.config.weapons[id] && rig.config.weapons[id].swapTime) || 0.45;
    const t = rig.phase(dur);
    if (!rig.mem.swapDone && t >= 0.5) {
      rig.mem.swapDone = true;
      const w = id ? rig.weaponProp(id) : null;
      if (w && w !== rig.weapon) rig.attachWeapon(w.root, w);
    }
    const down = bell(t);
    rig.hold('ready', 1 - down); rig.hold('low', down);
    rig.holdAdd(0.05 * down, -0.1 * down, 0.1 * down, 0, 0, 0);
    rig.ik(1 - down * 0.8, 1);
    return t >= 1;
  },
};

upper.melee = {
  aimWeight: 0.6, transient: true,
  update(rig, dt, p) {
    const mc = rig.config.melee;
    const dur = p.duration || mc.duration;
    const t = rig.phase(dur);
    const hit = (p.hitTime || mc.hitTime) / dur;
    // Culatazo: recoger (hasta hit*0.7), golpe (hasta hit+0.1), recuperar
    const wind = curve([0, 0, hit * 0.7, 1, hit, 0], t);
    const strike = curve([hit * 0.7, 0, hit, 1, hit + 0.15, 1, 1, 0], t);
    rig.hold('ready');
    rig.ik(1, 1);
    rig.holdAdd(0.05 * wind - 0.12 * strike, 0.08 * wind + 0.1 * strike, 0.12 * wind - 0.3 * strike,
      -0.2 * wind - 0.9 * strike, -0.5 * wind + 0.5 * strike, 0);
    rig.rot('spine', 0, -0.35 * wind + 0.35 * strike, 0);
    rig.rot('spine1', -0.1 * strike, -0.25 * wind + 0.25 * strike, 0);
    return t >= 1;
  },
};

// Provisionales
upper.grenade = {
  aimWeight: 0.7, transient: true,
  update(rig, dt, p) {
    const dur = p.duration || 0.8; const t = rig.phase(dur);
    rig.hold('low'); rig.ik(0, 1);
    const k = bell(t);
    rig.rot('lArm', 1.6 * k, 0, -0.4 * k); rig.rot('lForeArm', -0.8 * k, 0, 0);
    return t >= 1;
  },
};
upper.blindfire = {
  aimWeight: 0.3,
  update(rig) { rig.hold('aim'); rig.holdAdd(0, 0.5, 0.1, 0, 0, 0); rig.ik(1, 1); },
};
upper.cast = {
  aimWeight: 0.6, transient: true,
  update(rig, dt, p) {
    const dur = p.duration || 0.8; const t = rig.phase(dur);
    rig.hold('low'); rig.ik(0, 1);
    const k = bell(t);
    rig.rot('lArm', 1.4 * k, 0, 0);
    if (!rig.mem.castDone && t >= 0.5) { rig.mem.castDone = true; rig.emit('anim:cast:impact', p.id || null); }
    return t >= 1;
  },
  enter(rig) { rig.mem.castDone = false; },
};
upper.repair = {
  aimWeight: 0.3,
  update(rig) { rig.hold('low'); rig.ik(0.5, 1); rig.rot('spine', -0.3, 0, 0); },
};

/** Registra todos los proveedores por defecto en el servicio. */
export function registerDefaults(anim) {
  for (const k in body) anim.registerProvider([k], body[k], 'body');
  for (const k in upper) anim.registerProvider([k], upper[k], 'upper');
}
