// STUB: lo reemplaza controls-camera-engineer
// Servicio 'camera' (getAimRay, shake). Deja la cámara fija mirando al origen.

import * as THREE from 'three';

export default function create() {
  let cam = null;
  const ray = { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1) };
  const api = {
    getAimRay() {
      cam.getWorldPosition(ray.origin);
      cam.getWorldDirection(ray.dir);
      return ray;
    },
    shake(amp, dur) {},
  };
  return {
    name: 'camera',
    alwaysRun: true,
    init(game) {
      cam = game.camera;
      cam.position.set(0, 6, 12);
      cam.lookAt(0, 1, 0);
      game.provide('camera', api);
    },
    fixedUpdate(dt) {},
    update(dt, alpha) {},
    dispose() {},
  };
}
