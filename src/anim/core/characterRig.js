// Rig de personaje: AnimationMixer + capas + máquina de estados + IK. Dueño: animation-engineer.
//
// ════════════════════════════════════════════════════════════════════════════════════════════
// CONVENCIONES (léelas antes de escribir un proveedor)
// ════════════════════════════════════════════════════════════════════════════════════════════
//
// UNIDADES Y EJES
//   Metros, segundos, radianes. "Espacio de personaje" = espacio local de `soldier.root`
//   (models.createSoldier): +Y arriba, el personaje MIRA A −Z, +X es su DERECHA, +Z su espalda.
//   Pies en y = 0, altura ≈ 1.8 m. El rig NO mueve la raíz (sin root motion; los clips de
//   Soldier.glb son in situ): la posición/yaw los pone el sistema `anim` desde la entidad
//   (interpPos/interpYaw). Los proveedores solo hacen offsets VISUALES (cadera, huesos, arma).
//
// ROTACIONES ADITIVAS EN ESPACIO DE PERSONAJE — rig.rot(bone, x, y, z)
//   Se aplican sobre la pose del clip, alrededor del pivote del hueso, como Euler 'YXZ'
//   (R = Ry(y)·Rx(x)·Rz(z)), con ejes del personaje (no del hueso):
//     x > 0  inclina hacia ATRÁS / mira ARRIBA      (x < 0: hacia delante / abajo; doblar el tronco)
//     y > 0  gira a la IZQUIERDA (como el yaw)       (y < 0: a la derecha)
//     z > 0  alabea a la IZQUIERDA (hombro izq. baja) (z < 0: a la derecha)
//   Para extremidades colgando (muslo, brazo en reposo): x > 0 lleva la extremidad hacia DELANTE
//   (−Z); para la tibia/antebrazo x < 0 la lleva hacia atrás (flexión de rodilla).
//   rig.rotLocal(bone, x, y, z): igual pero en ejes LOCALES del hueso (dedos, giros finos).
//   rig.rotAxis(bone, ax, ay, az, angle): eje arbitrario (unitario) en espacio de personaje.
//   Todas se escalan por el peso del proveedor (rig.w) y se acumulan.
//
// HUESOS (Soldier.glb, esqueleto Mixamo; three quita los ':' → 'mixamorigHips')
//   Alias aceptados por rig.rot/rotLocal/bone():
//     hips · spine · spine1 · spine2 (pecho) · neck · head
//     lShoulder lArm lForeArm lHand   ·  rShoulder rArm rForeArm rHand     (clavícula, brazo, antebrazo, mano)
//     lUpLeg lLeg lFoot lToe          ·  rUpLeg rLeg rFoot rToe            (muslo, pierna, pie, punta)
//     lThumb1..3 lIndex1..3 lMiddle1..3 lRing1..3 lPinky1..2  (y r…)     (dedos)
//   También vale el nombre completo ('mixamorigSpine2') o el índice devuelto por rig.bone(alias).
//
// CAPAS (orden por frame, en rig.update(dt))
//   1. Proveedores de CUERPO (estado actual + anterior durante el crossfade) y de TORSO (ídem).
//      Piden clips (rig.clip / rig.locomotion), rotaciones aditivas, offset de cadera, pose del
//      arma, pesos de IK… todo multiplicado por su peso de mezcla rig.w.
//   2. Clips: AnimationMixer con pesos normalizados (Idle/Walk/Run…). Walk/Run van sincronizados
//      en fase y su velocidad de reproducción = velocidad real / zancada medida del clip.
//   3. Capa de torso: columna (spine→head) hacia la mira con setAim(yawOffset, pitch) y el peso de
//      apuntado (aimWeight del cuerpo × aimWeight del torso, ver propiedades de proveedor).
//   4. Aditivos por hueso (suavizados) + offset de cadera; updateMatrixWorld.
//   5. IK de piernas (rig.plantFeet) → arma en su socket (pose de sujeción relativa al pecho,
//      orientada a la mira) → IK de brazos: mano derecha al `grip`, izquierda al `support`
//      (o a rig.leftTarget). Ver ik.js.
//
// ESTADOS
//   Cuerpo (rig.setState):  idle walk jog run sprint crouch jump fall land climb vault slide evade
//                           coverLow coverHigh peek swat coverSlide blindfire*… (+ hit stun frozen
//                           death downed crawl revive revived carry mounted, provisionales)
//   Torso  (rig.setUpper):  aim fire reload activeReload swap melee none (+ grenade blindfire cast
//                           repair, provisionales)
//   Params por estado (todos opcionales; los no dados se derivan de la entidad):
//     idle                  {}
//     walk jog run sprint   { speed (m/s, defecto |vel| de la entidad), dir (rad, dirección de
//                             movimiento relativa al frente: 0 delante, +π/2 izquierda; defecto de vel/yaw) }
//     crouch                { speed, dir }
//     jump fall             { vy (m/s, defecto vel.y) }
//     land                  { impact (0..1, defecto 0.6) }
//     climb vault           { duration (s, defecto config.player.climb/vault.duration), height (m) }
//     slide                 { duration (defecto config.player.slide.duration) }
//     evade                 { duration (defecto config.player.evade.duration), dir (rad, relativo al frente) }
//     coverLow coverHigh    { height:'low'|'high', side:-1|1 (−1 izq., 1 der.), peeking, aimingOver, speed, dir }
//     peek                  { height, side, aimingOver }
//     swat coverSlide       { speed, side, duration }
//     aim none              {}
//     fire                  { weaponId }
//     reload                { duration (s), activeWindow:[a,b] (fracciones), weaponId }
//     activeReload          { result:'perfect'|'good'|'failed' }
//     swap                  { weaponId (el que entra), duration (defecto config.weapons[id].swapTime) }
//     melee                 { duration (defecto config.melee.duration), hitTime }
//   Comunes: { fade (s) } fuerza la duración del crossfade; { restart:true } reinicia el mismo estado.
//   Los params se COPIAN a un búfer del rig (el llamador puede reutilizar su objeto). Llamar a
//   setState con el MISMO estado solo actualiza params (no reinicia, no llama a enter).
//   Torso: los estados `transient` (fire, reload, activeReload, swap, melee…) vuelven solos al
//   estado base (aim/none) cuando su update devuelve true. setUpper('aim'|'none') durante un
//   transitorio solo cambia la base; para cortarlo usa { interrupt:true }. Repetir un transitorio
//   (p. ej. 'fire' en ráfaga) lo reinicia y vuelve a llamar a enter.
//
// CÓMO ESCRIBIR UN PROVEEDOR
//   provider = {
//     enter(rig, params),               // opcional: al entrar (t = 0)
//     update(rig, dt, params) → bool?,  // cada frame mientras tenga peso; torso: true = terminado
//     exit(rig),                        // opcional: cuando su peso llega a 0 tras salir (fin del fade)
//     // propiedades estáticas opcionales (se mezclan por peso):
//     aimWeight: 0..1,   // cuánto sigue la columna a la mira (cuerpo y torso se multiplican). Def. 1
//     lowCarry: 0..1,    // (cuerpo) lleva el arma en posición baja (sprint, vault…). Def. 0
//     handsFree: 0..1,   // (cuerpo) suelta la mano izquierda del arma (climb, vault…). Def. 0
//     transient: bool,   // (torso) estado puntual que vuelve a la base
//   }
//   En update, usa SOLO las utilidades del rig (sin reservar memoria):
//     rig.t, rig.w, rig.params        tiempo en el estado (s), peso de mezcla 0..1, params
//     rig.phase(dur)                  clamp(t / dur, 0, 1)
//     rig.clip(name, weight=1, rate=1)        pide un clip (Idle, Walk, Run…) a ese peso/ritmo
//     rig.locomotion(speed, dir=0, weight=1)  Idle/Walk/Run sincronizados con la velocidad (pasos)
//     rig.rot / rotLocal / rotAxis    aditivos por hueso (ver arriba)
//     rig.hips(x, y, z)               offset visual de la cadera en m (p. ej. y = −0.4 agachado)
//     rig.plantFeet(weight=1)         IK de piernas: los pies se quedan en el suelo pese a hips()
//     rig.hold(pose, weight=1)        pose del arma: 'aim' | 'ready' | 'low' (config.anim.core.hold)
//     rig.holdAdd(px,py,pz, rx,ry,rz) desplazamiento aditivo del arma (m, rad) en el marco de la mira
//     rig.ik(left, right)             peso de IK de cada mano hacia el arma (defecto 1, 1)
//     rig.leftTarget(x,y,z, space, weight)  lleva la mano izq. a un punto ('weapon' = espacio del
//                                     arma, 'char' = espacio de personaje) en vez del support
//     rig.recoil(back, up)            impulso al muelle de retroceso del arma
//     rig.emit(type, id?)             emite un evento { who, id, foot } (anim:footstep, anim:reload:insert…)
//     rig.speed, rig.moveDir, rig.aimYaw, rig.aimPitch, rig.aimW   lecturas útiles
//     rig.weapon                      null | { root, grip, support, muzzle, magazine, id }
//     rig.state / rig.upper / rig.upperBase   estados actuales
//   Utilidades puras (easing, springs, curvas): src/anim/core/math.js.
//
// CÓMO AÑADIR UN ESTADO
//   1. Añádelo a BODY_STATES o UPPER_STATES (abajo) si es nuevo, y documenta sus params aquí.
//   2. Registra un proveedor por defecto en providers.js (para que nunca quede sin proveedor).
//   3. El especialista lo sobrescribe desde su carpeta: src/anim/<carpeta>/index.js exporta
//      `default function register(anim) { anim.registerProvider(['estado'], provider) }`
//      (importado en core/registry.js; el último registro gana).
// ════════════════════════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { solveTwoBone, worldQuat, worldPos, basisQuat } from './ik.js';
import { clamp, clamp01, damp, lerp, remap01, wrapAngle, createSpring, stepSpring } from './math.js';

export const BODY_STATES = [
  'idle', 'walk', 'jog', 'run', 'sprint', 'crouch', 'jump', 'fall', 'land', 'climb', 'vault',
  'slide', 'evade', 'coverLow', 'coverHigh', 'peek', 'swat', 'coverSlide',
  'hit', 'stun', 'frozen', 'death', 'downed', 'crawl', 'revive', 'revived', 'carry', 'mounted',
];
export const UPPER_STATES = [
  'none', 'aim', 'fire', 'reload', 'activeReload', 'swap', 'melee',
  'grenade', 'blindfire', 'cast', 'repair',
];

const SIDES = { l: 'Left', r: 'Right' };
const LIMB = {
  Shoulder: 'Shoulder', Arm: 'Arm', ForeArm: 'ForeArm', Hand: 'Hand',
  UpLeg: 'UpLeg', Leg: 'Leg', Foot: 'Foot', Toe: 'ToeBase',
};
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
/** alias → sufijo Mixamo */
export const BONE_ALIASES = (() => {
  const a = { hips: 'Hips', spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head' };
  for (const s in SIDES) {
    for (const k in LIMB) a[s + k] = SIDES[s] + LIMB[k];
    for (const f of FINGERS) for (let i = 1; i <= 3; i++) a[s + f + i] = SIDES[s] + 'Hand' + f + i;
  }
  return a;
})();

const AIM_BONES = ['spine', 'spine1', 'spine2', 'neck', 'head'];
const CURL_FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

// Calibración de clips (zancada y contactos), compartida entre rigs. clave → { speed, stride, contacts:[l,r] }
const clipInfoCache = new Map();
const clipKey = (clip) => `${clip.name}:${clip.duration.toFixed(4)}:${clip.tracks.length}`;

// Temporales de módulo (sin reservas por frame)
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qInv = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _axis = new THREE.Vector3();
const _ID = new THREE.Quaternion();

function makeSlot() {
  return { state: null, provider: null, params: {}, t: 0 };
}
function clearObj(o) { for (const k in o) delete o[k]; }

export class CharacterRig {
  /**
   * @param {object} o
   * @param {object} o.entity      entidad (puede ser null en pruebas)
   * @param {object} o.soldier     resultado de models.createSoldier
   * @param {Map<string,object>} o.providers  estado → proveedor (compartido por el servicio)
   * @param {object} o.events      bus (game.events) o null
   * @param {object} o.config      game.config
   */
  constructor({ entity, soldier, providers, events, config }) {
    this.entity = entity || null;
    this.soldier = soldier;
    this.root = soldier.root;
    this.providers = providers;
    this.events = events || null;
    this.config = config;
    this.cfg = config.anim;
    this.core = config.anim.core;

    // ── Huesos ──────────────────────────────────────────────────────────
    this._collectBones();

    // ── Mixer y acciones ───────────────────────────────────────────────
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = [];          // [{ name, action, w, req, rate, info }]
    this.actionByName = Object.create(null);
    const clips = soldier.animations || [];
    for (const clip of clips) {
      if (clip.name === 'TPose') continue;
      const action = this.mixer.clipAction(clip);
      action.play();
      action.weight = 0;
      const rec = { name: clip.name, clip, action, w: 0, req: 0, rate: 1, info: null };
      this.actions.push(rec);
      this.actionByName[clip.name] = rec;
    }
    this._calibrateClips();
    const idle = this.actionByName.Idle;
    if (idle) { idle.w = 1; idle.action.weight = 1; }

    // ── Estado de capas ────────────────────────────────────────────────
    this.body = makeSlot(); this.bodyPrev = makeSlot(); this.bodyBlend = 1; this.bodyFade = 0;
    this.up = makeSlot(); this.upPrev = makeSlot(); this.upBlend = 1; this.upFade = 0;
    this.upperBase = 'none';
    this.upperBaseParams = {};
    this.t = 0; this.w = 1; this.params = null;

    // Mira
    this.aimYawTarget = 0; this.aimPitchTarget = 0;
    this.aimYaw = 0; this.aimPitch = 0; this.aimW = 0;
    this.autoAim = true;        // index.js deriva la mira de la cámara hasta que alguien llame a setAim
    this.autoState = true;      // index.js deriva el estado de entity.move hasta que alguien llame a setState

    // Lecturas de movimiento (las rellena index.js o el llamador)
    this.speed = 0; this.moveDir = 0; this.vy = 0;

    // Acumuladores por frame
    this._hipsAcc = new THREE.Vector3();
    this._hipsSm = new THREE.Vector3();
    this._plant = 0; this._plantSm = 0;
    this._aimWBody = 0; this._aimWUp = 0; this._lowCarry = 0; this._handsFree = 0;
    this._holdAcc = new Float32Array(6); this._holdW = 0;
    this._holdAdd = new Float32Array(6);
    this._hold = new Float32Array(6); this._holdInit = false;
    this._ikL = 0; this._ikR = 0; this._ikWSum = 0; this._ikLSm = 0; this._ikRSm = 0;
    this._ltAcc = new THREE.Vector3(); this._ltW = 0; this._ltSpace = 'weapon';
    this._loco = { w: 0, speed: 0, stride: 0, back: 0, n: 0 };
    this.locoPhase = 0;
    this._lastFootPhase = 0;

    // Retroceso (muelles)
    const rc = this.core.recoil;
    this._recBack = createSpring(rc.stiffness, rc.damping);
    this._recUp = createSpring(rc.stiffness, rc.damping);

    // Arma
    this.weapon = null;
    this.weaponFactory = null;  // (weaponId) → prop; lo inyecta index.js
    this._weaponCache = Object.create(null);
    this._gripQ = { right: new THREE.Quaternion(), left: new THREE.Quaternion() };
    this._gripWrist = { right: new THREE.Vector3(), left: new THREE.Vector3() };

    // Eventos de tiempo: payload reutilizado
    this._evt = { who: this.entity, id: null, foot: null };

    // Medición
    this.lastMs = 0;
  }

  // ════════════════════════════════════════════════════════════════════
  // API pública (contrato §3.7)
  // ════════════════════════════════════════════════════════════════════

  /** Estado de cuerpo/piernas. Ver params en la cabecera. */
  setState(state, params) {
    this.autoState = false;
    this._setBody(state, params);
  }

  /** Capa de torso/armas. */
  setUpper(state, params) {
    const prov = this.providers.get(state);
    if (!prov) { this._warnMissing(state); return; }
    if (!prov.transient) {
      // Estado base
      if (this.upperBase !== state) {
        this.upperBase = state;
        clearObj(this.upperBaseParams);
      }
      if (params) Object.assign(this.upperBaseParams, params);
      const cur = this.up.provider;
      if (cur && cur.transient && !(params && params.interrupt)) return; // no cortar un transitorio
      this._switchUpper(state, this.upperBaseParams, false);
      return;
    }
    this._switchUpper(state, params, true);
  }

  /** Columna hacia la mira. yawOffset: rad respecto al frente del cuerpo (+ izquierda); pitch: + arriba. */
  setAim(yawOffset, pitch) {
    this.autoAim = false;
    this._setAimTarget(yawOffset, pitch);
  }

  /**
   * Monta un arma. `anchors` = { grip, support, muzzle?, magazine? } (lo que devuelven las fábricas
   * de props); si se omite se buscan por nombre dentro de propRoot. El arma se coloca en un socket
   * relativo al pecho orientado a la mira; el IK lleva la mano derecha al grip y la izquierda al support.
   * attachWeapon(null) desmonta.
   */
  attachWeapon(propRoot, anchors) {
    if (this.weapon && this.weapon.root !== propRoot) {
      this.weapon.root.visible = false;
      if (this.weapon.root.parent) this.weapon.root.parent.remove(this.weapon.root);
    }
    if (!propRoot) { this.weapon = null; return; }
    const w = this._registerWeapon(propRoot, anchors);
    this.weapon = w;
    propRoot.visible = true;
    if (propRoot.parent !== this.root) this.root.add(propRoot);
    this._setupGrip(w.id);
  }

  /** Avanza la animación. dt = dt de render (s). Llamar después de colocar entity.object3d. */
  update(dt) {
    const t0 = performance.now();
    if (dt > 0.1) dt = 0.1;
    this._resetAccumulators();
    this._runLayers(dt);
    this._applyClips(dt);
    this._applyAim(dt);
    this._applyPose(dt);
    (this.entity && this.entity.object3d ? this.entity.object3d : this.root).updateMatrixWorld(true);
    this._applyFeetIK();
    this._applyWeaponAndArms(dt);
    this.lastMs = performance.now() - t0;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    for (const id in this._weaponCache) {
      const w = this._weaponCache[id];
      if (w.root.parent) w.root.parent.remove(w.root);
    }
    this.weapon = null;
  }

  // ════════════════════════════════════════════════════════════════════
  // Utilidades para proveedores (ver cabecera)
  // ════════════════════════════════════════════════════════════════════

  get state() { return this.body.state; }
  get upper() { return this.up.state; }

  /** Índice de hueso por alias o nombre (−1 si no existe). */
  bone(name) {
    if (typeof name === 'number') return name;
    const i = this.boneIndex[name];
    return i === undefined ? -1 : i;
  }
  phase(dur) { return dur > 0 ? clamp01(this.t / dur) : 1; }

  clip(name, weight = 1, rate = 1) {
    const rec = this.actionByName[name];
    if (!rec) return;
    const w = this.w * weight;
    rec.req += w;
    rec.rate = rate;
  }

  /**
   * Locomoción: mezcla Idle→Walk→Run según `speed`, reproducción sincronizada con la velocidad
   * real (pasos sin patinar) y caderas giradas hacia `dir` (strafe/retroceso).
   */
  locomotion(speed, dir = 0, weight = 1) {
    const w = this.w * weight;
    if (w <= 0) return;
    const c = this.core;
    const walk = this.actionByName.Walk, run = this.actionByName.Run, idle = this.actionByName.Idle;
    const sp = Math.abs(speed);
    // Dirección: hacia atrás si |dir| supera backpedalAngle
    let d = wrapAngle(dir);
    let back = 0;
    if (Math.abs(d) > c.backpedalAngle) { back = 1; d = wrapAngle(d - Math.PI); }
    d = clamp(d, -c.strafeMaxHips, c.strafeMaxHips);
    const vW = walk && walk.info ? walk.info.speed : this.cfg.playbackRef.walk;
    const vR = run && run.info ? run.info.speed : this.cfg.playbackRef.run;
    const tRun = run ? remap01(sp, vW, vR) : 0;
    const moving = remap01(sp, c.idleToWalk[0], c.idleToWalk[1]);
    if (idle) idle.req += w * (1 - moving);
    if (walk) walk.req += w * moving * (1 - tRun);
    if (run) run.req += w * moving * tRun;
    const sW = walk && walk.info ? walk.info.stride : vW;
    const sR = run && run.info ? run.info.stride : vR * 0.7;
    const L = this._loco;
    L.w += w * moving;
    L.speed += w * sp;
    L.stride += w * lerp(sW, sR, tRun);
    L.back += w * back;
    L.n += w;
    // Caderas hacia la dirección de marcha, columna compensa (el torso sigue mirando al frente).
    const hy = d * moving;
    if (hy !== 0) {
      const ww = weight;
      this.rot('hips', 0, hy * ww, 0);
      this.rot('spine', 0, -hy * 0.45 * ww, 0);
      this.rot('spine1', 0, -hy * 0.3 * ww, 0);
      this.rot('spine2', 0, -hy * 0.25 * ww, 0);
    }
  }

  /** Rotación aditiva en espacio de personaje (Euler YXZ), escalada por rig.w. */
  rot(bone, x, y, z) {
    const i = this.bone(bone);
    if (i < 0) return;
    const w = this.w;
    _e.set(x * w, y * w, z * w, 'YXZ');
    _q.setFromEuler(_e);
    this._offC[i].premultiply(_q);
  }
  /** Rotación aditiva en ejes locales del hueso (Euler YXZ), escalada por rig.w. */
  rotLocal(bone, x, y, z) {
    const i = this.bone(bone);
    if (i < 0) return;
    const w = this.w;
    _e.set(x * w, y * w, z * w, 'YXZ');
    _q.setFromEuler(_e);
    this._offL[i].multiply(_q);
  }
  /** Rotación aditiva eje-ángulo (eje unitario en espacio de personaje), escalada por rig.w. */
  rotAxis(bone, ax, ay, az, angle) {
    const i = this.bone(bone);
    if (i < 0) return;
    _axis.set(ax, ay, az);
    _q.setFromAxisAngle(_axis, angle * this.w);
    this._offC[i].premultiply(_q);
  }
  /** Offset visual de la cadera (m, espacio de personaje), escalado por rig.w. */
  hips(x, y, z) {
    const w = this.w;
    this._hipsAcc.x += x * w; this._hipsAcc.y += y * w; this._hipsAcc.z += z * w;
  }
  plantFeet(weight = 1) { this._plant += this.w * weight; }

  hold(pose, weight = 1) {
    const w = this.w * weight;
    if (w <= 0) return;
    const id = this.weapon ? this.weapon.id : 'assaultRifle';
    const table = this.core.hold[id] || this.core.hold.assaultRifle;
    const p = table[pose] || table.ready;
    const acc = this._holdAcc;
    for (let k = 0; k < 6; k++) acc[k] += p[k] * w;
    this._holdW += w;
  }
  holdAdd(px, py, pz, rx, ry, rz) {
    const w = this.w, a = this._holdAdd;
    a[0] += px * w; a[1] += py * w; a[2] += pz * w; a[3] += rx * w; a[4] += ry * w; a[5] += rz * w;
  }
  ik(left, right) {
    const w = this.w;
    this._ikL += left * w; this._ikR += right * w; this._ikWSum += w;
  }
  leftTarget(x, y, z, space = 'weapon', weight = 1) {
    const w = this.w * weight;
    if (w <= 0) return;
    this._ltAcc.x += x * w; this._ltAcc.y += y * w; this._ltAcc.z += z * w;
    this._ltW += w;
    this._ltSpace = space;
  }
  recoil(back, up) {
    this._recBack.v += back;
    this._recUp.v += up;
  }
  emit(type, id = null, foot = null) {
    if (!this.events) return;
    const e = this._evt;
    e.who = this.entity; e.id = id; e.foot = foot;
    this.events.emit(type, e);
  }
  /** Registro cacheado del arma `id` ({ root, grip, support, muzzle, magazine, id }); lo crea con
   *  weaponFactory (inyectada por index.js) la primera vez. No lo monta. */
  weaponProp(id) {
    let w = this._weaponCache[id];
    if (!w && this.weaponFactory) {
      const p = this.weaponFactory(id);
      if (p) w = this._registerWeapon(p.root, p);
    }
    return w || null;
  }

  _registerWeapon(propRoot, anchors) {
    const a = anchors || {};
    const id = propRoot.userData.weaponId || a.id || 'assaultRifle';
    let w = this._weaponCache[id];
    if (w && w.root === propRoot) return w;
    w = {
      root: propRoot,
      grip: a.grip || propRoot.getObjectByName('grip') || propRoot,
      support: a.support || propRoot.getObjectByName('support') || a.grip || propRoot,
      muzzle: a.muzzle || propRoot.getObjectByName('muzzle') || null,
      magazine: a.magazine || propRoot.getObjectByName('magazine') || null,
      id,
    };
    this._weaponCache[id] = w;
    return w;
  }

  // ════════════════════════════════════════════════════════════════════
  // Internos
  // ════════════════════════════════════════════════════════════════════

  _warnMissing(state) {
    if (!this._warned) this._warned = Object.create(null);
    if (this._warned[state]) return;
    this._warned[state] = true;
    console.warn(`[anim] estado sin proveedor: "${state}"`);
  }

  _setAimTarget(yaw, pitch) {
    const c = this.core;
    this.aimYawTarget = clamp(wrapAngle(yaw), -c.aimYawMax, c.aimYawMax);
    this.aimPitchTarget = clamp(pitch, c.aimPitchMin, c.aimPitchMax);
  }

  _setBody(state, params) {
    let prov = this.providers.get(state);
    if (!prov || prov.layer === 'upper') {
      this._warnMissing(state);
      state = 'idle';
      prov = this.providers.get('idle');
      if (!prov) return;
    }
    const cur = this.body;
    if (cur.state === state && !(params && params.restart)) {
      if (params) Object.assign(cur.params, params);
      return;
    }
    const fade = params && params.fade !== undefined ? params.fade : this.cfg.crossfade;
    this._switch('body', state, prov, params, fade);
  }

  _switchUpper(state, params, restartSame) {
    const prov = this.providers.get(state);
    const cur = this.up;
    if (cur.state === state && !restartSame && !(params && params.restart)) {
      if (params && params !== cur.params) Object.assign(cur.params, params);
      return;
    }
    if (cur.state === state && restartSame) {
      // Reinicio inmediato (ráfagas): sin crossfade
      if (params && params !== cur.params) { clearObj(cur.params); Object.assign(cur.params, params); }
      cur.t = 0;
      if (prov.enter) { this._bind(cur, 1); prov.enter(this, cur.params); }
      return;
    }
    const fade = params && params.fade !== undefined ? params.fade : this.cfg.upperCrossfade;
    this._switch('up', state, prov, params, fade);
  }

  /** Cambio genérico de estado con crossfade entre dos ranuras (sin reservas: se reciclan). */
  _switch(layer, state, prov, params, fade) {
    const curKey = layer, prevKey = layer + 'Prev', blendKey = layer + 'Blend', fadeKey = layer + 'Fade';
    let cur = this[curKey], prev = this[prevKey];
    const blend = this[blendKey];
    // Si había un fade en curso, se conserva como "anterior" la ranura con más peso.
    if (prev.provider && blend < 1) {
      if (blend >= 0.5) { this._exitSlot(prev); }
      else { this._exitSlot(cur); const tmp = cur; cur = prev; prev = tmp; }
    } else if (prev.provider) {
      this._exitSlot(prev);
    }
    // cur pasa a prev; la ranura libre se convierte en la nueva cur
    const free = prev;
    this[prevKey] = cur;
    this[curKey] = free;
    free.state = state;
    free.provider = prov;
    free.t = 0;
    clearObj(free.params);
    if (params) Object.assign(free.params, params);
    if (fade > 0 && this[prevKey].provider) {
      this[blendKey] = 0;
      this[fadeKey] = fade;
    } else {
      this._exitSlot(this[prevKey]);
      this[blendKey] = 1;
    }
    if (prov.enter) { this._bind(free, 1); prov.enter(this, free.params); }
  }

  _exitSlot(slot) {
    if (slot.provider && slot.provider.exit) { this._bind(slot, 0); slot.provider.exit(this); }
    slot.provider = null;
    slot.state = null;
  }

  _bind(slot, w) {
    this.t = slot.t; this.w = w; this.params = slot.params;
  }

  _resetAccumulators() {
    const n = this.bones.length;
    for (let i = 0; i < n; i++) { this._offC[i].identity(); this._offL[i].identity(); }
    this._hipsAcc.set(0, 0, 0);
    this._plant = 0;
    this._aimWBody = 0; this._aimWUp = 0; this._lowCarry = 0; this._handsFree = 0;
    this._holdAcc.fill(0); this._holdW = 0; this._holdAdd.fill(0);
    this._ikL = 0; this._ikR = 0; this._ikWSum = 0;
    this._ltAcc.set(0, 0, 0); this._ltW = 0;
    const L = this._loco; L.w = 0; L.speed = 0; L.stride = 0; L.back = 0; L.n = 0;
    for (let i = 0; i < this.actions.length; i++) { this.actions[i].req = 0; this.actions[i].rate = 1; }
  }

  _runLayers(dt) {
    // ── Cuerpo ──
    if (this.body.provider === null) this._setBody('idle', null);
    if (this.bodyBlend < 1) {
      this.bodyBlend = this.bodyFade > 0 ? Math.min(1, this.bodyBlend + dt / this.bodyFade) : 1;
    }
    const bb = this.bodyBlend;
    if (this.bodyPrev.provider) {
      if (bb >= 1) this._exitSlot(this.bodyPrev);
      else this._runSlot(this.bodyPrev, 1 - bb, dt, true);
    }
    this._runSlot(this.body, bb, dt, true);

    // ── Torso ──
    if (this.up.provider === null) this._switchUpper(this.upperBase, this.upperBaseParams, false);
    if (this.upBlend < 1) {
      this.upBlend = this.upFade > 0 ? Math.min(1, this.upBlend + dt / this.upFade) : 1;
    }
    const ub = this.upBlend;
    if (this.upPrev.provider) {
      if (ub >= 1) this._exitSlot(this.upPrev);
      else this._runSlot(this.upPrev, 1 - ub, dt, false);
    }
    const done = this._runSlot(this.up, ub, dt, false);
    if (done && this.up.provider && this.up.provider.transient) {
      this._switchUpper(this.upperBase, this.upperBaseParams, false);
    }
  }

  _runSlot(slot, w, dt, isBody) {
    const p = slot.provider;
    slot.t += dt;
    this._bind(slot, w);
    const aw = p.aimWeight !== undefined ? p.aimWeight : 1;
    if (isBody) {
      this._aimWBody += aw * w;
      if (p.lowCarry) this._lowCarry += p.lowCarry * w;
      if (p.handsFree) this._handsFree += p.handsFree * w;
    } else {
      this._aimWUp += aw * w;
    }
    return p.update ? p.update(this, dt, slot.params) : false;
  }

  _applyClips(dt) {
    const acts = this.actions;
    let total = 0;
    for (let i = 0; i < acts.length; i++) total += acts[i].req;
    const idle = this.actionByName.Idle;
    if (total < 1e-4 && idle) { idle.req = 1; total = 1; }
    const rate = 1 / Math.max(0.05, this.cfg.crossfade * 0.5);
    // Fase de locomoción (Walk/Run sincronizados)
    const L = this._loco;
    const lw = L.w;
    let locoActive = false;
    if (L.n > 0) {
      // speed y stride van ponderados por el mismo peso: su cociente es el ritmo de fase.
      const speed = L.n > 0 ? L.speed / L.n : 0, stride = L.stride;
      const dir = L.n > 0 && L.back / L.n > 0.5 ? -1 : 1;
      if (stride > 1e-3 && lw > 1e-3) {
        const prev = this.locoPhase;
        let ph = prev + dir * dt * L.speed / stride;
        ph -= Math.floor(ph);
        this.locoPhase = ph;
        locoActive = true;
        this._footsteps(prev, ph, dir, speed, lw);
      }
    }
    for (let i = 0; i < acts.length; i++) {
      const r = acts[i];
      const target = total > 0 ? r.req / total : 0;
      r.w = damp(r.w, target, rate, dt);
      if (r.w < 1e-3 && target === 0) r.w = 0;
      r.action.weight = r.w;
      if (r.info && locoActive) {
        // Clip de locomoción: tiempo dirigido por la fase común (contacto izq. en fase 0)
        r.action.timeScale = 0;
        let ph = this.locoPhase + r.info.contacts[0];
        ph -= Math.floor(ph);
        r.action.time = ph * r.clip.duration;
      } else {
        r.action.timeScale = r.rate;
      }
    }
    this.mixer.update(dt);
  }

  _footsteps(prev, ph, dir, speed, lw) {
    if (lw < 0.5 || speed < this.cfg.footstepMinSpeed) return;
    // Contactos en fase 0 (izq.) y en la fase del contacto der. del clip dominante
    const walk = this.actionByName.Walk, run = this.actionByName.Run;
    const dom = run && walk ? (run.w > walk.w ? run : walk) : (walk || run);
    let rPhase = 0.5;
    if (dom && dom.info) { rPhase = dom.info.contacts[1] - dom.info.contacts[0]; rPhase -= Math.floor(rPhase); }
    if (crossed(prev, ph, 0, dir)) this.emit('anim:footstep', null, 'left');
    if (crossed(prev, ph, rPhase, dir)) this.emit('anim:footstep', null, 'right');
  }

  _applyAim(dt) {
    const c = this.core;
    const k = this.cfg.aimBlendSpeed;
    this.aimYaw = damp(this.aimYaw, this.aimYawTarget, k * 1.5, dt);
    this.aimPitch = damp(this.aimPitch, this.aimPitchTarget, k * 1.5, dt);
    const target = clamp01(this._aimWBody) * clamp01(this._aimWUp);
    this.aimW = damp(this.aimW, target, k, dt);
    const aw = this.aimW;
    const head = Math.max(aw, c.headLook * clamp01(this._aimWBody));
    const ys = c.aimYawSplit, ps = c.aimPitchSplit;
    const saveW = this.w;
    this.w = 1;
    for (let j = 0; j < AIM_BONES.length; j++) {
      const wj = j < 3 ? aw : head;
      const y = this.aimYaw * ys[j] * wj;
      const x = this.aimPitch * ps[j] * wj;
      if (x !== 0 || y !== 0) this.rot(AIM_BONES[j], x, y, 0);
    }
    // Dedos cerrados sobre el arma
    if (this.weapon) {
      const fc = c.fingerCurl;
      const wl = clamp01(this._ikLSm), wr = clamp01(this._ikRSm);
      for (let f = 0; f < CURL_FINGERS.length; f++) {
        for (let s = 1; s <= 3; s++) {
          const a = fc.amount[s - 1];
          this.w = wr; this._curl('r' + CURL_FINGERS[f] + s, a * fc.right);
          this.w = wl; this._curl('l' + CURL_FINGERS[f] + s, a * fc.left);
        }
      }
      this.w = wr; this._curl('rThumb2', fc.thumb * fc.right);
      this.w = wl; this._curl('lThumb2', fc.thumb * fc.left);
    }
    this.w = saveW;
  }

  _curl(bone, angle) {
    const ax = this.core.fingerCurl.axis;
    if (ax === 'x') this.rotLocal(bone, angle, 0, 0);
    else if (ax === 'y') this.rotLocal(bone, 0, angle, 0);
    else this.rotLocal(bone, 0, 0, angle);
  }

  /** Aplica aditivos (suavizados) recorriendo la jerarquía en orden; offset de cadera. */
  _applyPose(dt) {
    const n = this.bones.length;
    const k = 1 - Math.exp(-this.core.poseSmoothing * dt);
    const bones = this.bones, par = this.parent, W = this._worldQ;
    for (let i = 0; i < n; i++) {
      const smC = this._smC[i], smL = this._smL[i];
      smC.slerp(this._offC[i], k);
      smL.slerp(this._offL[i], k);
      const b = bones[i];
      const Wp = par[i] < 0 ? this._baseQ : W[par[i]];
      const L = b.quaternion;
      L.multiply(smL);
      // L' = Wp⁻¹ · R · Wp · L
      if (Math.abs(smC.w) < 0.999999) {
        _qInv.copy(Wp).invert();
        _q2.copy(Wp).premultiply(smC).premultiply(_qInv);
        L.premultiply(_q2);
      }
      W[i].copy(Wp).multiply(L);
    }
    // Cadera
    this._hipsSm.x = damp(this._hipsSm.x, this._hipsAcc.x, this.core.poseSmoothing, dt);
    this._hipsSm.y = damp(this._hipsSm.y, this._hipsAcc.y, this.core.poseSmoothing, dt);
    this._hipsSm.z = damp(this._hipsSm.z, this._hipsAcc.z, this.core.poseSmoothing, dt);
    if (this._hipsSm.lengthSq() > 1e-10) {
      _v.copy(this._hipsSm).applyMatrix3(this._charToHipsParent);
      this.bones[0].position.add(_v);
    }
    this._plantSm = damp(this._plantSm, clamp01(this._plant), this.core.ikBlendSpeed, dt);
  }

  _applyFeetIK() {
    const w = this._plantSm;
    if (w < 0.01) return;
    // Pies a su posición antes del offset de cadera (y nunca por debajo del suelo).
    _v2.copy(this._hipsSm).applyQuaternion(this._rootWorldQ(_qw));
    for (let s = 0; s < 2; s++) {
      const up = this.bones[this._legs[s][0]], lo = this.bones[this._legs[s][1]], ft = this.bones[this._legs[s][2]];
      worldPos(ft, _tgt).sub(_v2);
      worldQuat(ft, _q);              // conservar orientación de mundo del pie
      // Polo: rodilla hacia delante del personaje
      worldPos(lo, _pole);
      _v3.set(0, 0, -1).applyQuaternion(_qw);
      _pole.addScaledVector(_v3, 0.6);
      solveTwoBone(up, lo, ft, _tgt, _pole, w, _q, 1);
      up.updateMatrixWorld(true);
    }
  }

  _rootWorldQ(out) { return worldQuat(this.root, out); }

  _applyWeaponAndArms(dt) {
    const wpn = this.weapon;
    const c = this.core;
    // Pesos de IK (suavizados): si ningún proveedor pidió IK, por defecto 1/1 con arma.
    let ikL = 1, ikR = 1;
    if (this._ikWSum > 1e-4) { ikL = this._ikL / this._ikWSum; ikR = this._ikR / this._ikWSum; }
    ikL *= 1 - clamp01(this._handsFree);
    if (!wpn) { ikL = 0; ikR = 0; }
    this._ikLSm = damp(this._ikLSm, ikL, c.ikBlendSpeed, dt);
    this._ikRSm = damp(this._ikRSm, ikR, c.ikBlendSpeed, dt);
    if (!wpn) return;

    // ── Pose de sujeción objetivo (marco de la mira, relativo al pecho) ──
    const tbl = c.hold[wpn.id] || c.hold.assaultRifle;
    const acc = this._holdAcc, hw = this._holdW;
    const low = clamp01(this._lowCarry);
    const H = this._hold;
    const kk = 1 - Math.exp(-c.holdBlendSpeed * dt);
    for (let j = 0; j < 6; j++) {
      let v = hw > 1e-4 ? acc[j] / hw : tbl.ready[j];
      v = lerp(v, tbl.low[j], low);
      H[j] = this._holdInit ? H[j] + (v - H[j]) * kk : v;
    }
    this._holdInit = true;
    const rb = stepSpring(this._recBack, dt), ru = stepSpring(this._recUp, dt);
    const A = this._holdAdd;

    // Pivote: pecho (spine2) en espacio de personaje
    const chest = this.bones[this._chest];
    worldPos(chest, _v);
    this.root.worldToLocal(_v);
    // Marco de la mira: yaw y pitch escalados por el peso de apuntado
    const aw = this.aimW;
    _e.set(this.aimPitch * aw, this.aimYaw * aw, 0, 'YXZ');
    _qw.setFromEuler(_e);
    _v2.set(H[0] + A[0], H[1] + A[1], H[2] + A[2] + rb).applyQuaternion(_qw);
    const root = wpn.root;
    root.position.copy(_v).add(_v2);
    _e.set(H[3] + A[3] + ru, H[4] + A[4], H[5] + A[5], 'YXZ');
    _q.setFromEuler(_e);
    root.quaternion.copy(_qw).multiply(_q);
    root.updateMatrixWorld(true);

    // ── IK de brazos ──
    const wq = worldQuat(root, _q2);
    const rs = this._arms[1], ls = this._arms[0];
    if (this._ikRSm > 0.01) {
      _tgt.copy(this._gripWrist.right).applyQuaternion(wq);
      worldPos(wpn.grip, _v3).add(_tgt);
      _q.copy(wq).multiply(this._gripQ.right);
      this._armPole(1, _pole);
      solveTwoBone(this.bones[rs[0]], this.bones[rs[1]], this.bones[rs[2]], _v3, _pole, this._ikRSm, _q, 1);
    }
    if (this._ikLSm > 0.01) {
      _tgt.copy(this._gripWrist.left).applyQuaternion(wq);
      worldPos(wpn.support, _v3).add(_tgt);
      if (this._ltW > 1e-4) {
        // Objetivo alternativo (cargador, cinturón…)
        _v.copy(this._ltAcc).multiplyScalar(1 / this._ltW);
        if (this._ltSpace === 'char') this.root.localToWorld(_v);
        else root.localToWorld(_v);
        _v3.lerp(_v, clamp01(this._ltW));
      }
      _q.copy(wq).multiply(this._gripQ.left);
      this._armPole(-1, _pole);
      solveTwoBone(this.bones[ls[0]], this.bones[ls[1]], this.bones[ls[2]], _v3, _pole, this._ikLSm, _q, 1);
    }
  }

  /** Polo del codo: hacia fuera, abajo y atrás del hombro (espacio de personaje → mundo). */
  _armPole(side, out) {
    const arm = this.bones[side > 0 ? this._arms[1][0] : this._arms[0][0]];
    worldPos(arm, out);
    const p = this.core.elbowPole;
    _v.set(p[0] * side, p[1], p[2]).applyQuaternion(this._rootWorldQ(_qw));
    return out.add(_v);
  }

  _setupGrip(id) {
    const g = this.core.grip;
    const over = g[id] || {};
    for (const side of ['right', 'left']) {
      const d = over[side] || g.default[side];
      _v.fromArray(d.finger); _v2.fromArray(d.palm);
      basisQuat(_v, _v2, _q);                    // marco deseado en espacio del arma
      const hb = side === 'right' ? this._handBasis.right : this._handBasis.left;
      this._gripQ[side].copy(_q).multiply(_q2.copy(hb).invert());
      this._gripWrist[side].fromArray(d.wrist);
    }
  }

  _collectBones() {
    const byName = Object.create(null);
    this.root.updateMatrixWorld(true);
    let hips = null;
    this.root.traverse((o) => {
      if (o.isBone || (o.name && o.name.startsWith('mixamorig'))) {
        byName[o.name] = o;
        if (!hips && /Hips$/.test(o.name)) hips = o;
      }
    });
    if (!hips) throw new Error('[anim] el modelo no tiene hueso Hips (esqueleto Mixamo esperado)');
    const prefix = hips.name.slice(0, hips.name.length - 4); // 'mixamorig'
    // Orden topológico desde la cadera
    const bones = [], parent = [];
    const idx = new Map();
    const visit = (o, p) => {
      if (!(o.isBone || (o.name && o.name.startsWith(prefix)))) return;
      idx.set(o, bones.length);
      bones.push(o); parent.push(p);
      const me = bones.length - 1;
      for (const ch of o.children) visit(ch, me);
    };
    visit(hips, -1);
    this.bones = bones;
    this.parent = parent;
    this.boneIndex = Object.create(null);
    for (let i = 0; i < bones.length; i++) this.boneIndex[bones[i].name] = i;
    for (const alias in BONE_ALIASES) {
      const o = byName[prefix + BONE_ALIASES[alias]];
      if (o) this.boneIndex[alias] = idx.get(o);
    }
    const n = bones.length;
    this._offC = []; this._offL = []; this._smC = []; this._smL = []; this._worldQ = [];
    for (let i = 0; i < n; i++) {
      this._offC.push(new THREE.Quaternion()); this._offL.push(new THREE.Quaternion());
      this._smC.push(new THREE.Quaternion()); this._smL.push(new THREE.Quaternion());
      this._worldQ.push(new THREE.Quaternion());
    }
    // Rotación (respecto a root) del padre de la cadera y conversión de offsets m → local del padre.
    const rootInv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const rel = new THREE.Matrix4().multiplyMatrices(rootInv, hips.parent.matrixWorld);
    const pos = new THREE.Vector3(), scl = new THREE.Vector3();
    this._baseQ = new THREE.Quaternion();
    rel.decompose(pos, this._baseQ, scl);
    this._charToHipsParent = new THREE.Matrix3().setFromMatrix4(rel).invert();

    const b = (a) => this.boneIndex[a];
    this._chest = b('spine2') ?? b('spine1') ?? 0;
    this._arms = [[b('lArm'), b('lForeArm'), b('lHand')], [b('rArm'), b('rForeArm'), b('rHand')]];
    this._legs = [[b('lUpLeg'), b('lLeg'), b('lFoot')], [b('rUpLeg'), b('rLeg'), b('rFoot')]];

    // Ejes de la mano en reposo: dedos (hacia Middle1) y palma (abajo del personaje en pose T).
    this._handBasis = { right: new THREE.Quaternion(), left: new THREE.Quaternion() };
    const rootQ = new THREE.Quaternion(); worldQuat(this.root, rootQ);
    for (const [side, s] of [['right', 'r'], ['left', 'l']]) {
      const hand = bones[b(s + 'Hand')], mid = bones[b(s + 'Middle1')];
      if (!hand || !mid) continue;
      const finger = mid.position.clone().normalize();
      const hq = new THREE.Quaternion(); worldQuat(hand, hq);
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(rootQ).applyQuaternion(hq.clone().invert());
      basisQuat(finger, down, this._handBasis[side]);
    }
  }

  /** Mide zancada (m) y contactos de pie (fase) de Walk/Run muestreando el clip una vez. */
  _calibrateClips() {
    const names = this.core.locoClips;
    const lf = this.bones[this.boneIndex.lFoot], rf = this.bones[this.boneIndex.rFoot];
    if (!lf || !rf) return;
    for (const name of names) {
      const rec = this.actionByName[name];
      if (!rec) continue;
      const key = clipKey(rec.clip);
      let info = clipInfoCache.get(key);
      if (!info) {
        info = measureClip(this, rec, lf, rf);
        clipInfoCache.set(key, info);
      }
      rec.info = info;
    }
    for (const r of this.actions) { r.action.weight = 0; r.action.time = 0; }
    this.mixer.update(0);
  }
}

function crossed(prev, cur, mark, dir) {
  if (dir > 0) {
    if (cur >= prev) return prev < mark && cur >= mark;
    return prev < mark || cur >= mark;          // vuelta de 1 → 0
  }
  if (cur <= prev) return prev > mark && cur <= mark;
  return prev > mark || cur <= mark;
}

function measureClip(rig, rec, lf, rf) {
  const N = 60;
  const dur = rec.clip.duration;
  for (const r of rig.actions) r.action.weight = 0;
  rec.action.weight = 1;
  const inv = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const ys = [[], []], zs = [[], []];
  for (let k = 0; k < N; k++) {
    rec.action.time = (k / N) * dur;
    rig.mixer.update(0);
    rig.root.updateMatrixWorld(true);
    inv.copy(rig.root.matrixWorld).invert();
    for (let s = 0; s < 2; s++) {
      p.setFromMatrixPosition((s === 0 ? lf : rf).matrixWorld).applyMatrix4(inv);
      ys[s].push(p.y); zs[s].push(p.z);
    }
  }
  const contacts = [0, 0.5];
  let vSum = 0, vN = 0;
  const dtS = dur / N;
  for (let s = 0; s < 2; s++) {
    const y = ys[s];
    let mn = Infinity, mx = -Infinity;
    for (const v of y) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    const thr = mn + 0.2 * (mx - mn);
    let found = -1;
    for (let k = 0; k < N; k++) {
      const a = y[(k - 1 + N) % N], b = y[k];
      if (a >= thr && b < thr) { found = k; break; }
    }
    if (found < 0) { let mi = 0; for (let k = 1; k < N; k++) if (y[k] < y[mi]) mi = k; found = mi; }
    contacts[s] = found / N;
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      if (y[k] < thr && y[k2] < thr) { vSum += Math.abs(zs[s][k2] - zs[s][k]) / dtS; vN++; }
    }
  }
  const ref = rec.name === 'Run' ? rig.cfg.playbackRef.run : rig.cfg.playbackRef.walk;
  let speed = vN ? vSum / vN : ref;
  if (!(speed > 0.3 && speed < 12)) speed = ref;
  return { speed, stride: speed * dur, contacts, duration: dur };
}

export function createCharacterRig(opts) {
  return new CharacterRig(opts);
}
