// Sistema de física: provee el servicio `physics` (docs/arquitectura.md §3.7). Dueño: physics-engineer.
// La lógica vive en world.js (testeable sin `game`); aquí solo se integra en el bucle.

import { Vector3 } from 'three';
import { createPhysicsWorld } from './world.js';

export default function createPhysics() {
  let world = null;
  let api = null;

  return {
    name: 'physics',
    init(game) {
      const created = createPhysicsWorld(game.config);
      world = created.world;
      api = created.api;
      game.provide('physics', api);
      game.debug.register('physics', api);
      if (game.debug.enabled) {
        // Para QA: raycastDebug(ox,oy,oz, dx,dy,dz, maxDist=100, entities=true) → copia plana o null.
        const o = new Vector3(), d = new Vector3();
        game.debug.register('raycastDebug', (ox, oy, oz, dx, dy, dz, maxDist = 100, entities = true) => {
          o.set(ox, oy, oz); d.set(dx, dy, dz);
          const h = api.raycast(o, d, maxDist, { entities, ignore: entities ? game.player : null });
          if (!h) return null;
          return {
            point: [h.point.x, h.point.y, h.point.z],
            normal: [h.normal.x, h.normal.y, h.normal.z],
            distance: h.distance,
            part: h.part,
            boxId: h.boxId,
            entityId: h.entity ? h.entity.id : null,
            tags: h.boxId ? api.getBox(h.boxId).tags.slice() : null,
          };
        });
      }
    },
    fixedUpdate(dt) {
      // Las hitboxes las mueven sus dueños; el índice usa un margen (config.physics.dynamicMargin)
      // que absorbe el desfase de un paso.
      world.rebuildDynamic();
    },
    update(dt, alpha) {},
    dispose() {},
  };
}
