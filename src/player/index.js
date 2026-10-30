// Sistema 'player' (docs/arquitectura.md §3.5–3.8). Dueño: controls-camera-engineer.
// Al recibir 'menu:start' crea la entidad jugador en level.playerStart con el soldado de su clase,
// el rig de animación y el rifle montado; registra game.player y emite 'player:spawned'.
// fixedUpdate → playerController.step; update → coloca object3d interpolado.
//
// Debug (--debug): __game.teleport(x, z, yaw), __game.playerState(), __game.playerCtl.

import * as THREE from 'three';
import { interpPos, interpYaw } from '../core/loop.js';
import { createPlayerController } from './playerController.js';

const _p = new THREE.Vector3();

export default function create() {
  let game = null;
  let ctl = null;
  let entity = null;
  const offs = [];
  let nextId = 1;

  function despawn() {
    if (!entity) return;
    if (ctl) { ctl.hideAllPrompts(); ctl.dispose(); }
    if (entity.object3d && entity.object3d.parent) entity.object3d.parent.remove(entity.object3d);
    game.removeEntity(entity);
    if (game.player === entity) game.player = null;
    entity = null;
    ctl = null;
  }

  function spawn({ classId }) {
    despawn();
    const P = game.config.player;
    const cls = classId || game.session.classId || game.config.classOrder[0];
    const start = game.hasService('level') ? game.service('level').playerStart : null;
    const sp = start && start.pos ? start.pos : [0, 0, 0];
    const yaw = start && Number.isFinite(start.yaw) ? start.yaw : 0;

    const soldier = game.service('models').createSoldier(cls);
    const e = {
      id: `player-${nextId++}`,
      kind: 'player',
      team: 'player',
      pos: new THREE.Vector3(sp[0], sp[1], sp[2]),
      prevPos: new THREE.Vector3(sp[0], sp[1], sp[2]),
      vel: new THREE.Vector3(),
      yaw, prevYaw: yaw,
      hp: P.maxHp, maxHp: P.maxHp, alive: true,
      applyDamage(amount, info) {
        // Fase 1a: sin derribado (llega con downed.js en Fase 2). La vida no baja de 0.
        if (!e.alive) return { killed: false };
        e.hp = Math.max(0, e.hp - Math.max(0, amount || 0));
        return { killed: false };
      },
      hitboxes: [
        { part: 'head', min: new THREE.Vector3(), max: new THREE.Vector3() },
        { part: 'body', min: new THREE.Vector3(), max: new THREE.Vector3() },
      ],
      object3d: soldier.root,
      soldier,
      classId: cls,
      radius: P.radius,
      height: P.height,
      grounded: true,
      move: { mode: 'idle', speed: 0, dir: new THREE.Vector3(0, 0, -1) },
      cover: null,
      aiming: false,
      shoulder: 1,
      intent: { fire: false, firePressed: false, reloadPressed: false, meleePressed: false, aim: false },
      inventory: { slots: [...game.config.weapons.startSlots], current: 0 },
      weapon: null,
      ammo: {},
      weaponProp: null,
      rig: null,
    };
    soldier.root.position.copy(e.pos);
    soldier.root.rotation.y = yaw;
    game.scene.add(soldier.root);
    e.rig = game.service('anim').createRig(e, soldier);

    game.addEntity(e);
    game.player = e;
    entity = e;
    ctl = createPlayerController(game, e);
    ctl.inventory.attachVisual(e.inventory.slots[e.inventory.current]);
    ctl.teleport(e.pos.x, e.pos.z, yaw, sp[1]);
    game.events.emit('player:spawned', { entity: e });
  }

  function snapshot() {
    const p = entity;
    if (!p) return null;
    const c = p.cover;
    return {
      pos: [p.pos.x, p.pos.y, p.pos.z], vel: [p.vel.x, p.vel.y, p.vel.z], yaw: p.yaw,
      grounded: p.grounded, mode: p.move.mode, speed: p.move.speed,
      cover: c ? { height: c.height, side: c.side, peeking: c.peeking, aimingOver: c.aimingOver, moving: c.moving,
        boxId: c.info.boxId, atLeftEdge: c.info.atLeftEdge, atRightEdge: c.info.atRightEdge } : null,
      inCover: ctl.cover.inCover,
      aiming: p.aiming, sprint: ctl.movement.sprinting, shoulder: p.shoulder,
      weapon: p.weapon ? p.weapon.id : null, slot: p.inventory.current, slots: [...p.inventory.slots],
      carrying: null, downed: false,
      intent: { ...p.intent },
      action: ctl.movement.act.type,
    };
  }

  return {
    name: 'player',
    init(g) {
      game = g;
      offs.push(g.events.on('menu:start', spawn));
      offs.push(g.events.on('weapon:switched', (ev) => {
        if (entity && ev.who === entity && ctl) ctl.inventory.attachVisual(ev.weaponId);
      }));
      offs.push(g.events.on('weapon:fired', (ev) => {
        if (entity && ev.who === entity && ctl) ctl.ctx.rumble('fire');
      }));
      offs.push(g.events.on('weapon:activeReload', (ev) => {
        if (entity && ev.who === entity && ctl) ctl.ctx.rumble(ev.result === 'perfect' ? 'reloadPerfect' : ev.result === 'failed' ? 'reloadFailed' : 'reloadGood');
      }));
      offs.push(g.events.on('melee:hit', (ev) => {
        if (entity && ev.who === entity && ctl) ctl.ctx.rumble('meleeHit');
      }));
      offs.push(g.events.on('game:state', ({ state }) => {
        if (state === 'menu') despawn();
      }));
      if (g.debug.enabled) {
        g.debug.register('teleport', (x, z, yaw) => { if (ctl) ctl.teleport(+x, +z, yaw == null ? entity.yaw : +yaw); });
        g.debug.register('playerState', snapshot);
        g.debug.register('playerCtl', () => ctl);
      }
    },
    fixedUpdate(dt) {
      if (ctl) ctl.step(dt);
    },
    update(dt, alpha) {
      const e = entity;
      if (!e || !e.object3d) return;
      interpPos(e, alpha, _p);
      e.object3d.position.copy(_p);
      e.object3d.rotation.y = interpYaw(e, alpha);
    },
    dispose() {
      for (const off of offs) off();
      offs.length = 0;
      despawn();
    },
  };
}
