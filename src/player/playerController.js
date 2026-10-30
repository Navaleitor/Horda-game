// Controlador del jugador: orquesta un paso fijo (input → movimiento/cobertura → intent → anim → prompts).
// Dueño: controls-camera-engineer. Contrato: docs/arquitectura.md §3.6–3.8.

import * as THREE from 'three';
import { createMovement, ACTION_MODES, wrapAngle } from './movement.js';
import { createCover } from './cover.js';
import { createInventory } from './inventory.js';

const _promptCover = { swat: false, adjacent: false };
const _q = new THREE.Vector3();

export function createPlayerController(game, e) {
  const P = game.config.player;
  const CC = game.config.cover;
  const IN = game.config.input;
  const ev = game.events;

  const ctx = {
    game, e,
    input: game.service('input'),
    physics: game.service('physics'),
    camera: null,
    camYaw: e.yaw, camPitch: 0,
    stick: null, stickMag: 0,
    wish: new THREE.Vector3(),       // dirección de movimiento en mundo (normalizada)
    camFwd: new THREE.Vector3(),     // forward plano de la cámara
    bodyFwd: new THREE.Vector3(),    // forward del cuerpo
    aimDown: false, fireDown: false,
    setMode,
    rumble,
  };
  const movement = createMovement(ctx);
  const cover = createCover(ctx);
  const inventory = createInventory(ctx);
  ctx.movement = movement;
  ctx.cover = cover;
  ctx.inventory = inventory;

  const modePayload = { who: e, mode: 'idle', prev: 'idle' };
  const shoulderPayload = { who: e, shoulder: 1 };

  function setMode(m) {
    const mv = e.move;
    if (mv.mode === m) return;
    modePayload.prev = mv.mode;
    modePayload.mode = m;
    mv.mode = m;
    ev.emit('player:moveMode', modePayload);
  }

  function rumble(kind) {
    const r = P.rumble[kind];
    if (r) ctx.input.rumble(r[0], r[1], r[2]);
  }

  // ── Rig de animación ─────────────────────────────────────────────────────
  const rigParams = { speed: 0, dir: 0, side: 1, height: 'low', moving: 0, over: false, shoulder: 1, vy: 0 };
  let rigKey = '';
  let upperKey = '';
  function updateRig() {
    const rig = e.rig;
    if (!rig) return;
    const mode = e.move.mode;
    let state = mode;
    if (mode === 'air') state = e.vel.y > 0 ? 'jump' : 'fall';
    else if (mode === 'cover') {
      const c = e.cover;
      state = c && c.peeking ? 'peek' : (c && c.height === 'high' ? 'coverHigh' : 'coverLow');
    } else if ((mode === 'idle' || mode === 'walk' || mode === 'jog' || mode === 'run') && movement.st.landT > 0 && mode === 'idle') {
      state = 'land';
    }
    const c = e.cover;
    rigParams.speed = e.move.speed;
    rigParams.side = c ? c.side : 0;
    rigParams.height = c ? c.height : null;
    rigParams.moving = c ? c.moving : 0;
    rigParams.over = !!(c && c.aimingOver);
    rigParams.shoulder = e.shoulder;
    rigParams.vy = e.vel.y;
    // Dirección de desplazamiento relativa al cuerpo (rad), útil para strafe al apuntar.
    rigParams.dir = e.move.speed > 0.05 ? wrapAngle(Math.atan2(-e.vel.x, -e.vel.z) - e.yaw) : 0;
    const key = `${state}|${rigParams.side}|${rigParams.height}|${rigParams.moving}|${rigParams.over}`;
    if (key !== rigKey) { rigKey = key; rig.setState(state, rigParams); }
    const upper = e.aiming ? 'aim' : 'none';
    if (upper !== upperKey) { upperKey = upper; rig.setUpper(upper, rigParams); }
    rig.setAim(wrapAngle(ctx.camYaw - e.yaw), ctx.camPitch);
  }

  // ── Prompts ──────────────────────────────────────────────────────────────
  const prompts = {
    cover: { id: 'player.cover', button: 'A', text: 'Cubrirse', on: false },
    jump: { id: 'player.jump', button: 'Y', text: 'Saltar', on: false },
    swat: { id: 'player.swat', button: 'A', text: 'Cambiar de cobertura', on: false },
  };
  let promptT = 0;
  function setPrompt(p, on, text) {
    if (on && (!p.on || (text && p.text !== text))) {
      if (text) p.text = text;
      p.on = true;
      ev.emit('prompt:show', p);
    } else if (!on && p.on) {
      p.on = false;
      ev.emit('prompt:hide', p);
    }
  }
  function updatePrompts(dt) {
    promptT -= dt;
    if (promptT > 0) return;
    promptT = P.promptInterval;
    const ph = ctx.physics;
    const busy = movement.busy;
    let coverOn = false, jumpOn = false, jumpText = null, swatOn = false, swatText = null;
    if (!busy && cover.inCover) {
      _q.copy(cover.info.normal).negate();
      const L = ph.queryLedge(e.pos, _q);
      if (L && (L.kind === 'vault' || L.kind === 'climb')) { jumpOn = true; jumpText = L.kind === 'vault' ? 'Saltar' : 'Trepar'; }
      cover.promptInfo(_promptCover);
      if (_promptCover.swat) { swatOn = true; swatText = 'SWAT'; }
      else if (_promptCover.adjacent) { swatOn = true; swatText = 'Deslizar'; }
    } else if (!busy && e.grounded) {
      movement.queryDir(ctx.camFwd, _q);
      if (ph.queryCover(e.pos, _q, CC.snapDistance)) coverOn = true;
      movement.queryDir(ctx.bodyFwd, _q);
      const L = ph.queryLedge(e.pos, _q);
      if (L && (L.kind === 'vault' || L.kind === 'climb')) { jumpOn = true; jumpText = L.kind === 'vault' ? 'Saltar' : 'Trepar'; }
    }
    setPrompt(prompts.cover, coverOn, null);
    setPrompt(prompts.jump, jumpOn, jumpText);
    setPrompt(prompts.swat, swatOn, swatText);
  }
  function hideAllPrompts() { for (const k in prompts) setPrompt(prompts[k], false); }

  // ── Hitboxes ─────────────────────────────────────────────────────────────
  function updateHitboxes() {
    const m = e.move.mode;
    const low = m === 'evade' || (m === 'cover' && e.cover && e.cover.height === 'low' && !e.cover.peeking);
    const h = low ? P.crouchHeight : P.height;
    const r = e.radius;
    const { x, y, z } = e.pos;
    const hb = e.hitboxes;
    const head = hb[0], body = hb[1];
    const hs = P.headSize;
    head.min.set(x - hs, y + h - hs * 2, z - hs);
    head.max.set(x + hs, y + h, z + hs);
    body.min.set(x - r, y, z - r);
    body.max.set(x + r, y + h - hs * 2, z + r);
  }

  // ── Paso ─────────────────────────────────────────────────────────────────
  function step(dt) {
    const I = ctx.input;
    if (!ctx.camera && game.hasService('camera')) ctx.camera = game.service('camera');
    const cam = ctx.camera;
    ctx.camYaw = cam ? cam.yaw : e.yaw;
    ctx.camPitch = cam ? cam.pitch : 0;
    ctx.camFwd.set(-Math.sin(ctx.camYaw), 0, -Math.cos(ctx.camYaw));
    ctx.bodyFwd.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));

    // Stick relativo a cámara.
    const s = I.axis('move');
    ctx.stick = s;
    ctx.stickMag = Math.min(1, Math.hypot(s.x, s.y));
    const rx = Math.cos(ctx.camYaw), rz = -Math.sin(ctx.camYaw);
    ctx.wish.set(ctx.camFwd.x * s.y + rx * s.x, 0, ctx.camFwd.z * s.y + rz * s.x);
    if (ctx.wish.lengthSq() > 1e-8) ctx.wish.normalize();

    // R3: hombro (también en cobertura).
    if (I.pressed('shoulder')) {
      e.shoulder = e.shoulder === 1 ? -1 : 1;
      shoulderPayload.shoulder = e.shoulder;
      ev.emit('player:shoulder', shoulderPayload);
    }

    ctx.aimDown = I.down('aim');
    ctx.fireDown = I.down('fire');

    inventory.step(dt);

    if (movement.busy) movement.step(dt);
    else if (cover.inCover) cover.step(dt);
    else movement.step(dt);

    // Velocidad/dirección expuestas.
    const hs = Math.hypot(e.vel.x, e.vel.z);
    e.move.speed = hs;
    if (hs > 1e-3) e.move.dir.set(e.vel.x / hs, 0, e.vel.z / hs);

    // Intent (lo lee combat).
    const blocked = ACTION_MODES.has(e.move.mode);
    const it = e.intent;
    it.aim = ctx.aimDown && !blocked;
    it.fire = ctx.fireDown && !blocked;
    it.firePressed = I.pressed('fire') && !blocked;
    it.reloadPressed = I.pressed('reload') && e.move.mode !== 'vault' && e.move.mode !== 'climb';
    it.meleePressed = I.pressed('melee') && !blocked;
    e.aiming = it.aim;

    updateHitboxes();
    updateRig();
    updatePrompts(dt);
  }

  /** Recoloca al jugador (debug/QA). y: suelo bajo (x, z) si physics lo encuentra. */
  const _o = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);
  function teleport(x, z, yaw = e.yaw, y = null) {
    cover.reset();
    movement.reset();
    let gy = y;
    if (gy == null) {
      _o.set(x, P.teleportProbeHeight, z);
      const hit = ctx.physics.raycast(_o, _down, P.teleportProbeHeight + 5, { ignore: e });
      gy = hit ? hit.point.y : 0;
    }
    e.pos.set(x, gy, z);
    e.prevPos.copy(e.pos);
    e.yaw = e.prevYaw = yaw;
    e.grounded = true;
    setMode('idle');
    hideAllPrompts();
    if (ctx.camera || game.hasService('camera')) {
      ctx.camera = game.service('camera');
      ctx.camera.setYawPitch(yaw, game.config.camera.spawnPitch);
      ctx.camera.snap();
    }
    updateHitboxes();
  }

  return {
    ctx, movement, cover, inventory, step, teleport, hideAllPrompts,
    dispose() { inventory.dispose(); },
  };
}
