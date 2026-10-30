// Tests de unidad del sistema de combate (node:test). Ejecutar: node --test tests/unit/
// Mocks de game, physics y camera; usan el bus y el RNG reales de core/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.__DEBUG__ = false;
const { default: config } = await import('../../src/core/config.js');
const { createEventBus } = await import('../../src/core/events.js');
const { createRng } = await import('../../src/core/rng.js');
const { default: createCombat } = await import('../../src/combat/index.js');
const { classifyActiveReload } = await import('../../src/combat/weapons.js');

const DT = config.core.fixedDt;
const RIFLE = config.weapons.assaultRifle;
const PISTOL = config.weapons.pistol;
const AR = config.activeReload;

/** Diana con hitbox simple; el mock de physics la "golpea" en la parte indicada. */
function makeTarget({ pos = [0, 0, -10], team = 'neutral', hp = 1e6 } = {}) {
  const t = {
    id: 99, kind: 'target', team, pos: new THREE.Vector3(...pos), hp, maxHp: hp, alive: true,
    damage: [],
    applyDamage(amount, info) {
      t.damage.push({ amount, part: info.part, weaponId: info.weaponId });
      t.hp -= amount;
      if (t.hp <= 0) { t.alive = false; return { killed: true }; }
      return { killed: false };
    },
  };
  return t;
}

/**
 * Mundo de prueba: `target` (opcional) en el punto fijo `hitPoint` con la parte `part`;
 * `wall` (opcional): plano z = wall.z que solo bloquea rayos que empiezan en x > wall.minX
 * (sirve para tapar la boca del cañón pero no la mira).
 */
function setup({ target = null, part = 'body', wall = null } = {}) {
  const events = createEventBus();
  const log = [];
  const record = (type) => events.on(type, (p) => log.push({ type, ...p, dir: undefined, origin: undefined }));
  for (const t of ['weapon:fired', 'weapon:ammo', 'weapon:empty', 'weapon:reloadStart', 'weapon:activeReload',
    'weapon:reloaded', 'weapon:reloadCancel', 'weapon:switched', 'melee:swing', 'melee:hit', 'damage:dealt', 'fx:spawn', 'enemy:killed']) {
    record(t);
  }
  const hitPoint = new THREE.Vector3(0, 1.6, -10);
  const rays = [];
  const physics = {
    raycast(origin, dir, maxDist, opts) {
      rays.push({ origin: origin.clone(), dir: dir.clone(), maxDist, entities: !!(opts && opts.entities) });
      if (wall && origin.x > wall.minX && dir.z < 0) {
        const d = (origin.z - wall.z) / -dir.z;
        if (d >= 0 && d <= maxDist) {
          return { point: origin.clone().addScaledVector(dir, d), normal: new THREE.Vector3(0, 0, 1), distance: d, entity: null, part: null, boxId: 1 };
        }
      }
      if (target && opts && opts.entities && target.alive) {
        const d = origin.distanceTo(hitPoint);
        if (d <= maxDist + 1e-6) {
          return { point: hitPoint.clone(), normal: new THREE.Vector3(0, 0, 1), distance: d, entity: target, part, boxId: null };
        }
      }
      return null;
    },
  };
  const camRay = { origin: new THREE.Vector3(0.6, 1.65, 2.8), dir: new THREE.Vector3(0, 0, -1) };
  const camera = { getAimRay: () => camRay };
  const services = new Map([['physics', physics], ['camera', camera]]);
  const debugEntries = new Map();
  const game = {
    events, config, rng: createRng(1), entities: [], player: null,
    time: { now: 0, tick: 0 },
    hasService: (n) => services.has(n),
    service: (n) => services.get(n),
    debug: { register: (n, v) => debugEntries.set(n, v), entries: debugEntries, enabled: false },
  };
  const player = {
    id: 1, kind: 'player', team: 'player', pos: new THREE.Vector3(0, 0, 0), yaw: 0, shoulder: 1,
    alive: true, aiming: false, cover: null, move: { mode: 'idle' },
    intent: { fire: false, firePressed: false, reloadPressed: false, meleePressed: false, aim: false },
    inventory: { slots: ['assaultRifle', null, 'pistol'], current: 0 },
  };
  game.player = player;
  game.entities.push(player);
  if (target) game.entities.push(target);
  const combat = createCombat();
  combat.init(game);
  events.emit('player:spawned', { entity: player });

  const clearPressed = () => {
    player.intent.firePressed = false;
    player.intent.reloadPressed = false;
    player.intent.meleePressed = false;
  };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) { combat.fixedUpdate(DT); clearPressed(); game.time.now += DT; }
  };
  const press = (field) => { player.intent[field] = true; step(1); };
  const count = (type) => log.filter((e) => e.type === type).length;
  const last = (type) => [...log].reverse().find((e) => e.type === type);
  const switchTo = (slot) => {
    player.inventory.current = slot;
    events.emit('weapon:switchRequest', { who: player, slot, weaponId: player.inventory.slots[slot] });
  };
  return { game, player, combat, step, press, count, last, log, rays, switchTo, debug: debugEntries.get('combat') };
}

const steps = (s) => Math.round(s / DT);

// ── inicialización ──────────────────────────────────────────────────────────
test('player:spawned inicializa weapon y ammo por arma', () => {
  const { player, last } = setup();
  assert.equal(player.weapon.id, 'assaultRifle');
  assert.equal(player.weapon.mag, RIFLE.magSize);
  assert.equal(player.weapon.reserve, RIFLE.reserve);
  assert.deepEqual(player.ammo.pistol, { mag: PISTOL.magSize, reserve: PISTOL.reserve, buffT: 0 });
  assert.equal(last('weapon:ammo').mag, RIFLE.magSize);
});

// ── cadencia ────────────────────────────────────────────────────────────────
test('rifle automático: 10 disparos/s con RT mantenido', () => {
  const { player, step, count } = setup();
  player.intent.fire = true;
  step(60);
  assert.equal(count('weapon:fired'), 10);
  assert.equal(player.weapon.mag, RIFLE.magSize - 10);
  assert.equal(player.ammo.assaultRifle.mag, RIFLE.magSize - 10);
});

test('pistola semiautomática: un disparo por flanco y tope de cadencia', () => {
  const { player, step, count, switchTo } = setup();
  switchTo(2);
  step(steps(PISTOL.swapTime) + 1);
  assert.equal(player.weapon.id, 'pistol');
  player.intent.fire = true;
  player.intent.firePressed = true;
  step(60);                       // mantener: solo el flanco dispara
  assert.equal(count('weapon:fired'), 1);
  for (let i = 0; i < 60; i++) { player.intent.firePressed = true; step(1); } // flanco cada paso
  assert.equal(count('weapon:fired'), 1 + PISTOL.fireRate);
});

function captureFx(s) {
  const fx = [];
  s.game.events.on('fx:spawn', (p) => fx.push({
    type: p.type, pos: p.pos && p.pos.clone(), dir: p.dir && p.dir.clone(),
    end: p.end && p.end.clone(), color: p.color, decal: p.decal,
  }));
  return fx;
}

test('fx por disparo: muzzle + tracer (end = impacto) + impact (dir = normal; diana sin calcomanía, rojo en headshot)', () => {
  const s = setup({ target: makeTarget(), part: 'head' });
  const fx = captureFx(s);
  s.player.intent.fire = true;
  s.step(1);
  assert.deepEqual(fx.map((f) => f.type), ['muzzle', 'tracer', 'impact']);
  assert.ok(fx[1].end.distanceTo(new THREE.Vector3(0, 1.6, -10)) < 1e-6);
  assert.ok(fx[1].pos.equals(fx[0].pos));
  assert.ok(fx[2].dir.equals(new THREE.Vector3(0, 0, 1)));
  assert.equal(fx[2].decal, false);
  assert.equal(fx[2].color, config.weapons.headshotImpactColor);

  const w = setup({ wall: { z: -3, minX: -100 } });
  const fx2 = captureFx(w);
  w.player.intent.fire = true;
  w.step(1);
  assert.equal(fx2[2].type, 'impact');
  assert.equal(fx2[2].decal, true);
  assert.equal(fx2[2].color, undefined);

  const n = setup();               // sin impacto: solo muzzle + tracer
  const fx3 = captureFx(n);
  n.player.intent.fire = true;
  n.step(1);
  assert.deepEqual(fx3.map((f) => f.type), ['muzzle', 'tracer']);
});

// ── headshot, buff y daño ────────────────────────────────────────────────────
test('daño al cuerpo = daño base; headshot ×headshotMult', () => {
  const body = makeTarget();
  const s1 = setup({ target: body, part: 'body' });
  s1.player.intent.fire = true;
  s1.step(1);
  assert.equal(body.damage[0].amount, RIFLE.damage);
  assert.equal(s1.last('damage:dealt').part, 'body');

  const head = makeTarget();
  const s2 = setup({ target: head, part: 'head' });
  s2.player.intent.fire = true;
  s2.step(1);
  assert.equal(head.damage[0].amount, RIFLE.damage * RIFLE.headshotMult);
  assert.equal(head.damage[0].weaponId, 'assaultRifle');
});

test('buff de recarga perfecta: +10% de daño mientras dura', () => {
  const t = makeTarget();
  const { player, step, debug } = setup({ target: t });
  debug.setBuff(0.5);
  player.intent.fire = true;
  step(1);
  assert.ok(Math.abs(t.damage[0].amount - RIFLE.damage * AR.perfectDamageMult) < 1e-9);
  player.intent.fire = false;
  step(steps(0.6));
  player.intent.fire = true;
  step(1);
  assert.equal(t.damage[1].amount, RIFLE.damage);
});

test('sin fuego amigo: no se daña al mismo equipo', () => {
  const t = makeTarget({ team: 'player' });
  const { player, step, count } = setup({ target: t });
  player.intent.fire = true;
  step(1);
  assert.equal(t.damage.length, 0);
  assert.equal(count('damage:dealt'), 0);
});

test('obstáculo entre la boca del cañón y el punto apuntado: impacta en el obstáculo', () => {
  const t = makeTarget();
  // pared en z = -1 que solo bloquea rayos que salen con x > 0.1 (la boca, hombro derecho)
  const { player, step, last, count } = setup({ target: t, wall: { z: -1, minX: 0.1 } });
  player.intent.fire = true;
  step(1);
  assert.equal(t.damage.length, 0);
  assert.equal(count('damage:dealt'), 0);
  const fired = last('weapon:fired');
  assert.ok(fired.hit && fired.hit.entity === null);
});

test('enemy:killed solo para el equipo enemigo, con headshot', () => {
  const t = makeTarget({ team: 'enemy', hp: 30 });
  const { player, step, last } = setup({ target: t, part: 'head' });
  player.intent.fire = true;
  step(1);
  const k = last('enemy:killed');
  assert.ok(k && k.enemy === t && k.killer === player && k.headshot === true && k.melee === false);
});

// ── recarga y recarga activa ──────────────────────────────────────────────────
test('clasificación de la recarga activa por fracción', () => {
  const a = RIFLE.activeWindow, g = RIFLE.goodWindow;
  assert.ok(g[0] <= a[0] && a[1] <= g[1], 'la zona perfecta está dentro de la buena');
  assert.equal(classifyActiveReload((a[0] + a[1]) / 2, a, g), 'perfect');
  assert.equal(classifyActiveReload((g[0] + a[0]) / 2, a, g), 'good');
  assert.equal(classifyActiveReload((a[1] + g[1]) / 2, a, g), 'good');
  assert.equal(classifyActiveReload(g[0] / 2, a, g), 'failed');
  assert.equal(classifyActiveReload((g[1] + 1) / 2, a, g), 'failed');
});

function reloadSetup() {
  const s = setup();
  s.debug.setAmmo(10, 100);
  return s;
}

test('recarga normal: dura reloadTime y rellena desde la reserva', () => {
  const { player, step, press, count, last } = reloadSetup();
  press('reloadPressed');
  assert.equal(count('weapon:reloadStart'), 1);
  assert.deepEqual([...last('weapon:reloadStart').activeWindow], RIFLE.activeWindow);
  assert.equal(last('weapon:reloadStart').duration, RIFLE.reloadTime);
  step(steps(RIFLE.reloadTime) - 3);
  assert.equal(count('weapon:reloaded'), 0);
  player.intent.fire = true;
  step(1);
  assert.equal(count('weapon:fired'), 0, 'no dispara recargando');
  player.intent.fire = false;
  step(3);
  assert.equal(count('weapon:reloaded'), 1);
  assert.equal(player.weapon.mag, RIFLE.magSize);
  assert.equal(player.weapon.reserve, 100 - (RIFLE.magSize - 10));
  assert.equal(player.ammo.assaultRifle.reserve, player.weapon.reserve);
});

/** Pulsa RB a la fracción f y devuelve { result, totalSteps hasta reloaded }. */
function activeAt(f) {
  const s = reloadSetup();
  s.press('reloadPressed');
  const start = s.game.time.now;
  s.step(Math.max(0, Math.round((f * RIFLE.reloadTime) / DT) - 1));
  s.press('reloadPressed');
  const result = s.last('weapon:activeReload').result;
  let n = 0;
  while (s.count('weapon:reloaded') === 0 && n < 1000) { s.step(1); n++; }
  return { s, result, total: s.game.time.now - start };
}

test('recarga activa perfecta: acelera la recarga y da el buff de daño', () => {
  const f = (RIFLE.activeWindow[0] + RIFLE.activeWindow[1]) / 2;
  const { s, result, total } = activeAt(f);
  assert.equal(result, 'perfect');
  const expected = f * RIFLE.reloadTime + (1 - f) * RIFLE.reloadTime * AR.perfectSpeedMult;
  assert.ok(Math.abs(total - expected) < 3 * DT, `total ${total} ≈ ${expected}`);
  assert.ok(s.player.weapon.buffT > AR.perfectBuffDuration - 1);
  assert.equal(s.player.weapon.mag, RIFLE.magSize);
});

test('recarga activa buena: acelera sin buff', () => {
  const f = (RIFLE.goodWindow[0] + RIFLE.activeWindow[0]) / 2;
  const { s, result, total } = activeAt(f);
  assert.equal(result, 'good');
  const expected = f * RIFLE.reloadTime + (1 - f) * RIFLE.reloadTime * AR.goodSpeedMult;
  assert.ok(Math.abs(total - expected) < 3 * DT, `total ${total} ≈ ${expected}`);
  assert.equal(s.player.weapon.buffT, 0);
});

test('recarga activa fallida: encasquilla failedJamTime y no dispara', () => {
  const f = RIFLE.goodWindow[0] / 2;
  const s = reloadSetup();
  s.press('reloadPressed');
  s.step(Math.round((f * RIFLE.reloadTime) / DT) - 1);
  s.press('reloadPressed');
  assert.equal(s.last('weapon:activeReload').result, 'failed');
  assert.ok(s.player.weapon.jammedT > 0);
  s.player.intent.fire = true;
  s.step(steps(AR.failedJamTime));
  assert.equal(s.count('weapon:fired'), 0);
  let n = 0;
  while (s.count('weapon:reloaded') === 0 && n < 1000) { s.step(1); n++; }
  const total = s.game.time.now;
  const expected = RIFLE.reloadTime + AR.failedJamTime;
  assert.ok(Math.abs(total - expected) < 3 * DT, `total ${total} ≈ ${expected}`);
});

test('recarga activa: un solo intento', () => {
  const s = reloadSetup();
  s.press('reloadPressed');
  s.step(5);
  s.press('reloadPressed');       // fallida
  s.step(steps(AR.failedJamTime) + Math.round(0.5 * RIFLE.reloadTime / DT));
  s.press('reloadPressed');       // ignorada
  assert.equal(s.count('weapon:activeReload'), 1);
});

test('encasquillado (debug jam) bloquea el disparo', () => {
  const { player, step, count, debug } = setup();
  debug.jam(0.5);
  player.intent.fire = true;
  step(steps(0.5) - 1);
  assert.equal(count('weapon:fired'), 0);
  step(2);
  assert.equal(count('weapon:fired'), 1);
});

test('sin munición: weapon:empty una vez y auto-recarga si hay reserva', () => {
  const { player, step, count, debug } = setup();
  debug.setAmmo(0, 50);
  player.intent.fire = true;
  step(10);
  assert.equal(count('weapon:empty'), 1);
  assert.equal(count('weapon:reloadStart'), 1);
  assert.equal(count('weapon:fired'), 0);
});

test('sin munición ni reserva: weapon:empty y no recarga', () => {
  const { player, step, count, debug } = setup();
  debug.setAmmo(0, 0);
  player.intent.fire = true;
  step(10);
  assert.equal(count('weapon:empty'), 1);
  assert.equal(count('weapon:reloadStart'), 0);
});

// ── cambio de arma ───────────────────────────────────────────────────────────
test('cambio de arma conserva la munición por arma', () => {
  const { player, step, switchTo, count, last } = setup();
  player.intent.fire = true;
  step(steps(0.5) - 2);            // 5 disparos
  player.intent.fire = false;
  assert.equal(player.weapon.mag, RIFLE.magSize - 5);

  switchTo(2);
  player.intent.fire = true;
  step(steps(PISTOL.swapTime) - 1);
  assert.equal(count('weapon:switched'), 0, 'no hay switched antes del swapTime');
  assert.equal(count('weapon:fired'), 5, 'no dispara cambiando de arma');
  player.intent.fire = false;
  step(2);
  assert.equal(last('weapon:switched').weaponId, 'pistol');
  assert.equal(last('weapon:switched').slot, 2);
  player.intent.firePressed = true; step(1);
  step(20);
  player.intent.firePressed = true; step(1);
  assert.equal(player.weapon.mag, PISTOL.magSize - 2);

  switchTo(0);
  step(steps(RIFLE.swapTime) + 1);
  assert.equal(player.weapon.id, 'assaultRifle');
  assert.equal(player.weapon.mag, RIFLE.magSize - 5);
  assert.equal(player.ammo.pistol.mag, PISTOL.magSize - 2);
});

test('ranura vacía: el arma no cambia', () => {
  const { player, step, switchTo, count } = setup();
  switchTo(1);
  step(60);
  assert.equal(player.weapon.id, 'assaultRifle');
  assert.equal(player.weapon.swapT, 0);
  assert.equal(count('weapon:switched'), 0);
});

test('cambiar de arma cancela la recarga', () => {
  const s = reloadSetup();
  s.press('reloadPressed');
  s.step(10);
  s.switchTo(2);
  s.step(steps(PISTOL.swapTime) + 1);
  assert.equal(s.player.weapon.reloading, false);
  assert.equal(s.count('weapon:reloaded'), 0);
  assert.equal(s.player.ammo.assaultRifle.mag, 10);
  const c = s.last('weapon:reloadCancel');
  assert.ok(c && c.reason === 'swap' && c.weaponId === 'assaultRifle');
  assert.equal(s.count('weapon:reloadCancel'), 1);
});

// ── melee ──────────────────────────────────────────────────────────────────
test('melee: golpe, daño y cooldown', () => {
  const t = makeTarget({ pos: [0, 0, -1.2] });
  t.height = 1.8;
  const { player, step, press, count, last } = setup({ target: t });
  press('meleePressed');
  assert.equal(count('melee:swing'), 1);
  step(steps(config.melee.hitTime));
  assert.equal(count('melee:hit'), 1);
  assert.equal(last('melee:hit').target, t);
  assert.equal(t.damage[0].amount, config.melee.damage);
  assert.equal(t.damage[0].weaponId, 'melee');

  press('meleePressed');           // dentro del bloqueo: ignorado
  assert.equal(count('melee:swing'), 1);
  player.intent.fire = true;
  step(1);
  assert.equal(count('weapon:fired'), 0, 'no dispara durante el golpe');
  player.intent.fire = false;
  step(steps(config.melee.duration + config.melee.cooldown));
  press('meleePressed');
  assert.equal(count('melee:swing'), 2);
});

test('melee: no golpea fuera del arco ni del alcance', () => {
  const behind = makeTarget({ pos: [0, 0, 1.2] });
  behind.height = 1.8;
  const s1 = setup({ target: behind });
  s1.press('meleePressed');
  s1.step(steps(config.melee.hitTime) + 1);
  assert.equal(s1.count('melee:hit'), 0);

  const far = makeTarget({ pos: [0, 0, -5] });
  far.height = 1.8;
  const s2 = setup({ target: far });
  s2.press('meleePressed');
  s2.step(steps(config.melee.hitTime) + 1);
  assert.equal(s2.count('melee:hit'), 0);
});

// ── bonus por arma y cancelación por melee ──────────────────────────────────────
test('el bonus de recarga perfecta va solo con el arma recargada y corre aunque se cambie', () => {
  const t = makeTarget();
  const s = setup({ target: t });
  s.debug.setAmmo(10, 100);
  s.press('reloadPressed');
  const f = (RIFLE.activeWindow[0] + RIFLE.activeWindow[1]) / 2;
  s.step(Math.round((f * RIFLE.reloadTime) / DT) - 1);
  s.press('reloadPressed');
  assert.equal(s.last('weapon:activeReload').result, 'perfect');
  while (s.count('weapon:reloaded') === 0) s.step(1);
  assert.ok(s.player.ammo.assaultRifle.buffT > 0);
  assert.equal(s.player.weapon.buffT, s.player.ammo.assaultRifle.buffT);

  s.switchTo(2);
  s.step(steps(PISTOL.swapTime) + 1);
  assert.equal(s.player.weapon.id, 'pistol');
  assert.equal(s.player.weapon.buffT, 0, 'la pistola no hereda el bonus');
  s.player.intent.firePressed = true; s.step(1);
  assert.equal(t.damage.at(-1).amount, PISTOL.damage);

  const before = s.player.ammo.assaultRifle.buffT;
  s.switchTo(0);
  s.step(steps(RIFLE.swapTime) + 1);
  const after = s.player.ammo.assaultRifle.buffT;
  assert.ok(after > 0 && after < before, 'el tiempo corre con el arma guardada');
  assert.equal(s.player.weapon.buffT, after);
  s.player.intent.fire = true; s.step(1); s.player.intent.fire = false;
  assert.ok(Math.abs(t.damage.at(-1).amount - RIFLE.damage * AR.perfectDamageMult) < 1e-9);

  s.step(steps(AR.perfectBuffDuration));
  assert.equal(s.player.weapon.buffT, 0);
  s.player.intent.fire = true; s.step(1);
  assert.equal(t.damage.at(-1).amount, RIFLE.damage);
});

test('B cancela la recarga (también en la ventana activa): golpe inmediato, sin transferir munición', () => {
  const s = reloadSetup();
  s.press('reloadPressed');
  s.step(Math.round(((RIFLE.activeWindow[0] + RIFLE.activeWindow[1]) / 2) * RIFLE.reloadTime / DT) - 1);
  s.press('meleePressed');
  assert.equal(s.count('melee:swing'), 1, 'el golpe sale al instante');
  const c = s.last('weapon:reloadCancel');
  assert.ok(c && c.reason === 'melee' && c.weaponId === 'assaultRifle');
  assert.equal(s.player.weapon.reloading, false);
  assert.equal(s.player.weapon.mag, 10);
  assert.equal(s.player.weapon.reserve, 100);
  s.step(steps(RIFLE.reloadTime) + 10);
  assert.equal(s.count('weapon:reloaded'), 0, 'hay que volver a pulsar RB');
  assert.equal(s.count('weapon:activeReload'), 0);
  s.press('reloadPressed');
  assert.equal(s.count('weapon:reloadStart'), 2);
});

test('B también cancela una recarga encasquillada', () => {
  const s = reloadSetup();
  s.press('reloadPressed');
  s.step(3);
  s.press('reloadPressed');
  assert.equal(s.last('weapon:activeReload').result, 'failed');
  s.press('meleePressed');
  assert.equal(s.count('melee:swing'), 1);
  assert.equal(s.player.weapon.reloading, false);
  assert.equal(s.player.weapon.jammedT, 0);
  assert.equal(s.last('weapon:reloadCancel').reason, 'melee');
});
