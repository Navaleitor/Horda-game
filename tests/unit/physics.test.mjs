// Tests unitarios de src/physics (node --test tests/unit/). Dueño: physics-engineer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import config from '../../src/core/config.js';
import { createPhysicsWorld } from '../../src/physics/world.js';

const R = config.player.radius;
const H = config.player.height;
const SKIN = config.physics.skin;

// Escena de prueba (suelo implícito y = 0):
//  W  pared fina 3 m          x∈[-5,5]   z∈[-5.1,-4.9]
//  S  escalón 0.3 m           x∈[2,3]    z∈[0,1]
//  O  obstáculo 0.6 m         x∈[3.5,4.5] z∈[0,1]
//  A  cobertura baja 1.0      x∈[-3,-1]  z∈[-1,-0.5]   (cara +Z en z=-0.5)
//  B  cobertura baja 1.0      x∈[0,2]    z∈[-1,-0.5]   (contigua a A, hueco 1 m)
//  C  cobertura alta 2.2      x∈[5,7]    z∈[-1,-0.5]
//  D  cobertura alta 2.2      x∈[9,11]   z∈[-2,-1.5]   (paralela a C, hueco 2 m, 1 m más atrás → SWAT)
//  K  bloque trepable 2.0     x∈[-8,-6]  z∈[3,5]
function scene() {
  const { api, world } = createPhysicsWorld(config);
  const ids = {
    W: api.addBox({ min: [-5, 0, -5.1], max: [5, 3, -4.9], tags: ['wall'] }),
    S: api.addBox({ min: [2, 0, 0], max: [3, 0.3, 1] }),
    O: api.addBox({ min: [3.5, 0, 0], max: [4.5, 0.6, 1] }),
    A: api.addBox({ min: [-3, 0, -1], max: [-1, 1, -0.5], tags: ['cover', 'low'] }),
    B: api.addBox({ min: [0, 0, -1], max: [2, 1, -0.5], tags: ['cover', 'low'] }),
    C: api.addBox({ min: [5, 0, -1], max: [7, 2.2, -0.5], tags: ['cover', 'high'] }),
    D: api.addBox({ min: [9, 0, -2], max: [11, 2.2, -1.5], tags: ['cover', 'high'] }),
    K: api.addBox({ min: [-8, 0, 3], max: [-6, 2.0, 5] }),
  };
  return { api, world, ids };
}

function cap(x, y, z) { return { pos: new Vector3(x, y, z), radius: R, height: H }; }
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

test('caminar en diagonal contra una pared desliza a lo largo de ella', () => {
  const { api } = scene();
  const c = cap(0, 0, -4.0);
  const d = new Vector3(0.1, 0, -0.1);
  let last;
  for (let i = 0; i < 30; i++) last = api.moveCapsule(c, d);
  assert.ok(c.pos.z >= -4.9 + R - 1e-3, `z=${c.pos.z} atraviesa la pared`);
  assert.ok(near(c.pos.z, -4.9 + R, 0.01), 'queda pegado a la pared');
  assert.ok(c.pos.x > 2.9, `x=${c.pos.x}: debería deslizar por la pared`);
  assert.equal(last.hitWall, true);
  assert.ok(near(last.wallNormal.z, 1) && near(last.wallNormal.x, 0), 'normal de pared +Z');
  assert.equal(last.grounded, true);
});

test('sube un escalón ≤ stepHeight y no un obstáculo más alto', () => {
  const { api } = scene();
  const c = cap(2.5, 0, 2);
  const d = new Vector3(0, 0, -0.06);   // con un poco de gravedad (el llamador la aplica)
  const g = new Vector3(0, -0.05, -0.06);
  let r;
  for (let i = 0; i < 25; i++) r = api.moveCapsule(c, d);
  assert.ok(near(c.pos.y, 0.3), `y=${c.pos.y}: debería estar encima del escalón`);
  assert.equal(r.grounded, true);
  // bajar del escalón por el otro lado: pega al suelo (groundSnap) o cae
  for (let i = 0; i < 30; i++) api.moveCapsule(c, g);
  assert.ok(near(c.pos.y, 0), `y=${c.pos.y}: de vuelta al suelo`);

  const o = cap(4.0, 0, 2);
  for (let i = 0; i < 25; i++) api.moveCapsule(o, d);
  assert.ok(near(o.pos.y, 0), 'el obstáculo de 0.6 m no se sube');
  assert.ok(o.pos.z >= 1 + R - 1e-3, `z=${o.pos.z}: bloqueado por el obstáculo`);
});

test('no atraviesa la pared a ninguna velocidad (sprint, slide, evade, deltas enormes)', () => {
  const { api } = scene();
  const dt = config.core.fixedDt;
  const speeds = [config.player.speed.sprint, config.player.slide.speed, config.player.evade.speed, 30, 120, 600];
  for (const v of speeds) {
    const c = cap(0, 0, -3);
    for (let i = 0; i < 120; i++) api.moveCapsule(c, new Vector3(0, 0, -v * dt));
    assert.ok(c.pos.z >= -4.9 + R - 1e-3, `v=${v}: z=${c.pos.z}`);
  }
  // un solo delta de 100 m (por encima de maxSubsteps → barrido)
  const c = cap(0, 0, -3);
  api.moveCapsule(c, new Vector3(0.5, 0, -100));
  assert.ok(c.pos.z >= -4.9 + R - 1e-3, `delta enorme: z=${c.pos.z}`);
});

test('gravedad: cae, aterriza y queda grounded; el salto choca con el techo', () => {
  const { api } = createPhysicsWorld(config);
  api.addBox({ min: [-1, 2.5, -1], max: [1, 2.7, 1] });   // techo
  const c = cap(5, 3, 5);
  let vy = 0, r;
  for (let i = 0; i < 120; i++) {
    vy = Math.max(vy - config.physics.gravity / 60, -config.physics.terminalVelocity);
    r = api.moveCapsule(c, new Vector3(0, vy / 60, 0));
    if (r.grounded) vy = 0;
  }
  assert.ok(near(c.pos.y, 0) && r.grounded);
  const j = cap(0, 0, 0);
  const rr = api.moveCapsule(j, new Vector3(0, 1.0, 0));
  assert.equal(rr.hitCeiling, true);
  assert.ok(near(j.pos.y, 2.5 - H), `y=${j.pos.y}`);
});

test('raycast contra caja: distancia, normal y boxId', () => {
  const { api, ids } = scene();
  const h = api.raycast(new Vector3(4, 1, 0), new Vector3(0, 0, -1), 50);
  assert.ok(h);
  assert.equal(h.boxId, ids.W);
  assert.ok(near(h.distance, 4.9));
  assert.ok(near(h.normal.z, 1));
  assert.equal(h.entity, null);
  assert.equal(h.part, null);
  // diagonal larga que recorre varias celdas
  const d = api.raycast(new Vector3(40, 1, 40), new Vector3(-1, 0, -1), 200);
  assert.ok(d && d.boxId, 'debe chocar con alguna caja recorriendo celdas');
  // rayo hacia abajo: plano de suelo (boxId 0)
  const g = api.raycast(new Vector3(20, 5, 20), new Vector3(0, -1, 0), 10);
  assert.ok(g && g.boxId === 0 && near(g.distance, 5) && near(g.normal.y, 1));
  // fuera de alcance
  assert.equal(api.raycast(new Vector3(4, 1, 0), new Vector3(0, 0, -1), 4.0), null);
});

test('raycast contra hitboxes de entidad: cabeza y cuerpo, ignore y entities', () => {
  const { api } = scene();
  const target = {
    id: 't1', alive: true,
    hitboxes: [
      { part: 'body', min: new Vector3(-0.25, 0, 9.75), max: new Vector3(0.25, 1.5, 10.25) },
      { part: 'head', min: new Vector3(-0.15, 1.5, 9.85), max: new Vector3(0.15, 1.8, 10.15) },
    ],
  };
  api.addEntity(target);
  const head = api.raycast(new Vector3(0, 1.65, 0), new Vector3(0, 0, 1), 50, { entities: true });
  assert.ok(head && head.entity === target && head.part === 'head' && head.boxId === null);
  assert.ok(near(head.distance, 9.85));
  const body = api.raycast(new Vector3(0, 1.0, 0), new Vector3(0, 0, 1), 50, { entities: true });
  assert.equal(body.part, 'body');
  assert.equal(api.raycast(new Vector3(0, 1.65, 0), new Vector3(0, 0, 1), 50), null, 'sin entities: no las ve');
  assert.equal(api.raycast(new Vector3(0, 1.65, 0), new Vector3(0, 0, 1), 50, { entities: true, ignore: target }), null);
  target.alive = false;
  assert.equal(api.raycast(new Vector3(0, 1.65, 0), new Vector3(0, 0, 1), 50, { entities: true }), null);
  target.alive = true;
  // la caja tapa a la entidad: diana detrás de la pared
  const behind = { id: 't2', hitboxes: [{ part: 'body', min: new Vector3(3.8, 0, -7), max: new Vector3(4.2, 1.5, -6.6) }] };
  api.addEntity(behind);
  const occl = api.raycast(new Vector3(4, 1, 0), new Vector3(0, 0, -1), 50, { entities: true });
  assert.equal(occl.entity, null);
  // la entidad se mueve y se reconstruye el índice
  for (const hb of target.hitboxes) { hb.min.x += 20; hb.max.x += 20; }
  api.updateDynamic();
  const moved = api.raycast(new Vector3(20, 1.65, 0), new Vector3(0, 0, 1), 50, { entities: true });
  assert.ok(moved && moved.part === 'head');
  api.removeEntity(target);
  assert.equal(api.raycast(new Vector3(20, 1.65, 0), new Vector3(0, 0, 1), 50, { entities: true }), null);
});

test('queryCover: baja/alta, normal, tangente (derecha del jugador), anclaje y bordes', () => {
  const { api, ids } = scene();
  const low = api.queryCover(new Vector3(-2, 0, 1.0), new Vector3(0, 0, -1), 2.5);
  assert.ok(low);
  assert.equal(low.boxId, ids.A);
  assert.equal(low.height, 'low');
  assert.ok(near(low.topY, 1));
  assert.deepEqual([low.normal.x, low.normal.z], [0, 1]);
  assert.ok(near(low.tangent.x, 1) && near(low.tangent.z, 0));
  assert.ok(near(low.point.z, -0.5 + R + SKIN) && near(low.point.x, -2));
  assert.ok(near(low.tMin, -3) && near(low.tMax, -1) && near(low.t, -2));
  assert.equal(low.atLeftEdge, false);
  assert.equal(low.atRightEdge, false);

  const high = api.queryCover(new Vector3(6, 0, 0.5), new Vector3(0.2, 0, -1), 2.5);
  assert.ok(high && high.boxId === ids.C && high.height === 'high');

  // mirando hacia otro lado / demasiado lejos → null
  assert.equal(api.queryCover(new Vector3(-2, 0, 1.0), new Vector3(0, 0, 1), 2.5), null);
  assert.equal(api.queryCover(new Vector3(-2, 0, 4.0), new Vector3(0, 0, -1), 2.5), null);
  // pared de 3 m sin tag 'cover' → no es cobertura
  assert.equal(api.queryCover(new Vector3(-3.5, 0, -4.0), new Vector3(0, 0, -1), 2.5), null);

  // borde izquierdo (tMin): pegado al extremo −X de A
  const left = api.queryCover(new Vector3(-3.1, 0, 0.3), new Vector3(0, 0, -1), 2.5);
  assert.ok(left.atLeftEdge && !left.atRightEdge);
  assert.ok(near(left.t, -3 + config.cover.edgeInset));

  // cara lateral: jugador al este de A mirando a −X → normal +X, tangente (0,0,−1)
  const side = api.queryCover(new Vector3(-0.5, 0, -0.75), new Vector3(-1, 0, 0), 2.5);
  assert.ok(side && side.boxId === ids.A && near(side.normal.x, 1) && near(side.tangent.z, -1));
});

test('coverSlide limita el desplazamiento al borde del lado pedido', () => {
  const { api } = scene();
  const info = api.queryCover(new Vector3(-2, 0, 1.0), new Vector3(0, 0, -1), 2.5);
  const r1 = api.coverSlide(info, 1, new Vector3(-1.5, 0, 0.0));
  assert.ok(near(r1.pos.x, -1.5) && near(r1.pos.z, -0.5 + R + SKIN) && r1.atEdge === false);
  const r2 = api.coverSlide(info, 1, new Vector3(0.4, 0, 0.0));
  assert.ok(near(r2.pos.x, -1 - config.cover.edgeInset) && r2.atEdge === true);
  assert.equal(info.atRightEdge, true);
  const r3 = api.coverSlide(info, -1, new Vector3(-9, 0, 0.0));
  assert.ok(near(r3.pos.x, -3 + config.cover.edgeInset) && r3.atEdge === true && info.atLeftEdge);
});

test('cajas coplanares contiguas se fusionan en una sola cara', () => {
  const { api } = createPhysicsWorld(config);
  const a = api.addBox({ min: [0, 0, -1], max: [2, 1, -0.5], tags: ['cover'] });
  api.addBox({ min: [2, 0, -1], max: [4, 1, -0.5], tags: ['cover'] });
  const info = api.queryCover(new Vector3(1, 0, 0.5), new Vector3(0, 0, -1), 2.5);
  assert.equal(info.boxId, a);
  assert.ok(near(info.tMin, 0) && near(info.tMax, 4));
});

test('queryAdjacentCover: deslizar a la cobertura contigua del mismo lado', () => {
  const { api, ids } = scene();
  const info = api.queryCover(new Vector3(-1.2, 0, 0.3), new Vector3(0, 0, -1), 2.5);
  assert.ok(info.atRightEdge);
  const adj = api.queryAdjacentCover(info, 1, config.cover.slideAdjacentMaxGap);
  assert.ok(adj && adj.boxId === ids.B, 'A → B por la derecha');
  assert.ok(near(adj.t, 0 + config.cover.edgeInset) && adj.atLeftEdge);
  assert.equal(api.queryAdjacentCover(info, -1), null, 'nada a la izquierda de A');
  // C → D no es contigua (plano 1 m más atrás)
  const c = api.queryCover(new Vector3(6.8, 0, 0.3), new Vector3(0, 0, -1), 2.5);
  assert.equal(api.queryAdjacentCover(c, 1), null);
});

test('querySwat: cobertura paralela al otro lado del hueco', () => {
  const { api, ids } = scene();
  const c = api.queryCover(new Vector3(6.8, 0, 0.3), new Vector3(0, 0, -1), 2.5);
  assert.ok(c && c.boxId === ids.C && c.atRightEdge);
  const s = api.querySwat(c, 1, config.cover.swatMaxGap);
  assert.ok(s && s.boxId === ids.D, 'C → D');
  assert.ok(near(s.point.z, -1.5 + R + SKIN) && near(s.point.x, 9 + config.cover.edgeInset));
  assert.equal(api.querySwat(c, 1, 1.0), null, 'hueco mayor que maxGap');
  // a la izquierda de C está B (coplanar, hueco 3 m): también vale para SWAT si cabe en maxGap
  assert.equal(api.querySwat(c, -1, 4).boxId, ids.B);
  assert.equal(api.querySwat(c, -1, 2.5), null);
  // hueco bloqueado por un pilar → null
  api.addBox({ min: [7.8, 0, -1.0], max: [8.2, 3, 0.0], tags: ['nocover'] });
  assert.equal(api.querySwat(c, 1, 4), null);
});

test('queryLedge: vault sobre cobertura baja, climb a bloque de 2 m, null en pared/escalón', () => {
  const { api } = scene();
  const v = api.queryLedge(new Vector3(-2, 0, -0.5 + R + 0.1), new Vector3(0, 0, -1));
  assert.ok(v && v.kind === 'vault', JSON.stringify(v));
  assert.ok(near(v.topY, 1));
  assert.ok(v.landPos.z < -1 - R && near(v.landPos.y, 0));

  const k = api.queryLedge(new Vector3(-7, 0, 5 + R + 0.2), new Vector3(0, 0, -1));
  assert.ok(k && k.kind === 'climb', JSON.stringify(k));
  assert.ok(near(k.topY, 2) && near(k.landPos.y, 2) && k.landPos.z < 5 && k.landPos.z > 3);

  const hc = api.queryLedge(new Vector3(6, 0, -0.5 + R + 0.1), new Vector3(0, 0, -1));
  assert.ok(hc && hc.kind === 'climb', 'cobertura alta 2.2 m → climb');

  assert.equal(api.queryLedge(new Vector3(0, 0, -4.9 + R + 0.1), new Vector3(0, 0, -1)), null, 'pared de 3 m');
  assert.equal(api.queryLedge(new Vector3(2.5, 0, 1 + R + 0.1), new Vector3(0, 0, -1)), null, 'escalón');
  assert.equal(api.queryLedge(new Vector3(20, 0, 20), new Vector3(0, 0, -1)), null, 'nada delante');

  // caja baja pero profunda (> vaultMaxDepth) → climb (mantle)
  const { api: api2 } = createPhysicsWorld(config);
  api2.addBox({ min: [-1, 0, -3], max: [1, 1, -0.5] });
  const m = api2.queryLedge(new Vector3(0, 0, -0.5 + R + 0.1), new Vector3(0, 0, -1));
  assert.ok(m && m.kind === 'climb', JSON.stringify(m));
  // caja baja con una pared pegada detrás: ni vault (no cabe detrás) ni climb (no cabe encima)
  const { api: api3 } = createPhysicsWorld(config);
  api3.addBox({ min: [-1, 0, -1], max: [1, 1, -0.5] });
  api3.addBox({ min: [-1, 0, -1.6], max: [1, 3, -1.0] });
  assert.equal(api3.queryLedge(new Vector3(0, 0, -0.5 + R + 0.1), new Vector3(0, 0, -1)), null);
});

test('rendimiento: 200 raycasts por frame', () => {
  const { api } = createPhysicsWorld(config);
  // mapa ~90×90 con 300 cajas y 30 dianas
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 300; i++) {
    const x = rnd() * 90 - 45, z = rnd() * 90 - 45, w = 0.5 + rnd() * 3, d = 0.5 + rnd() * 3, h = 0.5 + rnd() * 4;
    api.addBox({ min: [x, 0, z], max: [x + w, h, z + d] });
  }
  for (let i = 0; i < 30; i++) {
    const x = rnd() * 80 - 40, z = rnd() * 80 - 40;
    api.addEntity({ id: i, hitboxes: [
      { part: 'body', min: new Vector3(x - 0.3, 0, z - 0.3), max: new Vector3(x + 0.3, 1.5, z + 0.3) },
      { part: 'head', min: new Vector3(x - 0.15, 1.5, z - 0.15), max: new Vector3(x + 0.15, 1.8, z + 0.15) },
    ] });
  }
  const o = new Vector3(), d = new Vector3();
  const frames = 60;
  // calentamiento
  for (let i = 0; i < 2000; i++) { o.set(rnd() * 80 - 40, 1.5, rnd() * 80 - 40); d.set(rnd() - 0.5, rnd() * 0.2 - 0.1, rnd() - 0.5); api.raycast(o, d, 120, { entities: true }); }
  const t0 = performance.now();
  let hits = 0;
  for (let f = 0; f < frames; f++) {
    api.updateDynamic();
    for (let i = 0; i < 200; i++) {
      o.set(rnd() * 80 - 40, 1.5, rnd() * 80 - 40);
      d.set(rnd() - 0.5, rnd() * 0.2 - 0.1, rnd() - 0.5);
      if (api.raycast(o, d, 120, { entities: true })) hits++;
    }
  }
  const msPerFrame = (performance.now() - t0) / frames;
  console.log(`  200 raycasts/frame: ${msPerFrame.toFixed(3)} ms (${hits} impactos en ${frames} frames)`);
  assert.ok(msPerFrame < 4, `demasiado lento: ${msPerFrame} ms`);
});
