// STUB: lo reemplaza physics-engineer
// Servicio 'physics' con la interfaz del contrato (docs/arquitectura.md §3).
// Sin colisiones: el suelo es y = 0 y no hay cajas, raycasts ni coberturas.

export default function create() {
  let nextId = 1;
  const moveResult = { grounded: true, hitWall: false, wallNormal: null };
  const api = {
    addBox(desc) { return nextId++; },
    addEntity(entity) {},
    removeEntity(entity) {},
    moveCapsule(cap, delta) {
      cap.pos.add(delta);
      moveResult.grounded = cap.pos.y <= 0;
      if (cap.pos.y < 0) cap.pos.y = 0;
      return moveResult;
    },
    raycast(origin, dir, maxDist, opts) { return null; },
    queryCover(pos, dir, maxDist) { return null; },
    coverSlide(info, side, pos) { return { pos, atEdge: true }; },
    queryAdjacentCover(info, side, maxDist) { return null; },
    querySwat(info, side, maxGap) { return null; },
    queryLedge(pos, forward) { return null; },
  };
  return {
    name: 'physics',
    init(game) { game.provide('physics', api); },
    fixedUpdate(dt) {},
    update(dt, alpha) {},
    dispose() {},
  };
}
