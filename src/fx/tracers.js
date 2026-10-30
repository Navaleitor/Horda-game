// Trazadoras: cintas aditivas orientadas a cámara que viajan de la boca del cañón al impacto.
// Un único InstancedMesh (1 draw call; 0 si no hay ninguna activa). Pool circular fijo.
// Dueño: vfx-artist.

import * as THREE from 'three';
import { createRing } from '../core/pool.js';

const _p = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _camPos = new THREE.Vector3();

export function createTracers(scene, cfg, texture) {
  const N = cfg.tracerPool;

  // Quad unitario: x ∈ [-0.5, 0.5] (ancho), z ∈ [0, 1] (largo, de cola a cabeza).
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, 0,   0.5, 0, 0,   0.5, 0, 1,   -0.5, 0, 1,
  ], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);

  const mat = new THREE.MeshBasicMaterial({
    map: texture, color: 0xffffff, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.name = 'fx.tracers';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));       // crea instanceColor (una vez)
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  scene.add(mesh);

  const ring = createRing(N, () => ({
    active: false, start: new THREE.Vector3(), dir: new THREE.Vector3(),
    dist: 0, t: 0, color: new THREE.Color(),
  }));

  let alive = 0;

  /** start/end: Vector3 (se copian). color: THREE.Color ya resuelto. */
  function spawn(start, end, color) {
    const it = ring.acquire();
    it.start.copy(start);
    it.dir.subVectors(end, start);
    it.dist = it.dir.length();
    if (it.dist < 0.05) { it.active = false; return; }
    it.dir.multiplyScalar(1 / it.dist);
    it.t = 0;
    it.color.copy(color);
    it.active = true;
  }

  function update(dt, camera) {
    camera.getWorldPosition(_camPos);
    const items = ring.items;
    const arr = mesh.instanceMatrix.array;
    const col = mesh.instanceColor.array;
    const speed = cfg.tracerSpeed, len = cfg.tracerLength, w = cfg.tracerWidth;
    let k = 0;
    for (let i = 0; i < N; i++) {
      const it = items[i];
      if (!it.active) continue;
      it.t += dt;
      const head = Math.min(it.t * speed, it.dist);
      const tail = Math.max(0, it.t * speed - len);
      if (tail >= it.dist) { it.active = false; continue; }
      const seg = head - tail;
      if (seg <= 1e-3) continue;

      // Base: z = dir·seg, x = perpendicular a dir y a la vista (cinta de cara a la cámara).
      _p.copy(it.start).addScaledVector(it.dir, tail);
      _toCam.copy(_camPos).sub(_p);
      _x.crossVectors(it.dir, _toCam);
      let xl = _x.length();
      if (xl < 1e-5) { _x.set(it.dir.y, -it.dir.x, 0); xl = _x.length() || 1; }
      _x.multiplyScalar(w / xl);
      _y.crossVectors(it.dir, _x).normalize().multiplyScalar(w);

      const o = k * 16;
      arr[o] = _x.x; arr[o + 1] = _x.y; arr[o + 2] = _x.z; arr[o + 3] = 0;
      arr[o + 4] = _y.x; arr[o + 5] = _y.y; arr[o + 6] = _y.z; arr[o + 7] = 0;
      arr[o + 8] = it.dir.x * seg; arr[o + 9] = it.dir.y * seg; arr[o + 10] = it.dir.z * seg; arr[o + 11] = 0;
      arr[o + 12] = _p.x; arr[o + 13] = _p.y; arr[o + 14] = _p.z; arr[o + 15] = 1;

      // Se apaga un poco al final del recorrido (aditivo: color = intensidad).
      const fade = 1 - 0.6 * (tail / it.dist);
      const c = k * 3;
      col[c] = it.color.r * fade; col[c + 1] = it.color.g * fade; col[c + 2] = it.color.b * fade;
      k++;
    }
    alive = k;
    mesh.count = k;
    mesh.visible = k > 0;
    if (k > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  }

  function dispose() {
    scene.remove(mesh);
    geo.dispose(); mat.dispose(); mesh.dispose();
  }

  return { spawn, update, dispose, get alive() { return alive; }, size: N };
}
