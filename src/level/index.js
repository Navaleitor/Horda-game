// STUB: lo reemplaza level-designer
// Servicio 'level' mínimo: un suelo y luz para que se vea algo.

import * as THREE from 'three';

export default function create() {
  const objects = [];
  const api = {
    data: null,
    playerStart: { pos: [0, 0, 0], yaw: 0 },
  };
  return {
    name: 'level',
    init(game) {
      const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a2e2a, 1.2);
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(90, 90),
        new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.95 }),
      );
      ground.rotation.x = -Math.PI / 2;
      const grid = new THREE.GridHelper(90, 45, 0x777777, 0x444444);
      objects.push(hemi, ground, grid);
      for (const o of objects) game.scene.add(o);
      game.provide('level', api);
    },
    fixedUpdate(dt) {},
    update(dt, alpha) {},
    dispose() {},
  };
}
