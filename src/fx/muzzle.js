// Fogonazos y destellos: billboards aditivos en un único InstancedMesh (1 draw call; 0 si no
// hay ninguno) + UNA PointLight compartida que parpadea. La luz se añade en init y nunca se
// oculta (solo cambia su intensidad) para no alterar el número de luces → sin recompilar shaders.
// Dueño: vfx-artist.

import * as THREE from 'three';
import { createRing } from '../core/pool.js';

const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _camQ = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

export function createFlashes(scene, cfg, texture, rng) {
  const N = cfg.flashPool;

  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({
    map: texture, color: 0xffffff, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.name = 'fx.flashes';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 21;
  scene.add(mesh);

  const light = new THREE.PointLight(cfg.muzzleColor, 0, cfg.muzzleLightDistance, 2);
  light.name = 'fx.flashLight';
  light.castShadow = false;
  scene.add(light);
  let lightT = 0, lightDur = 1, lightPeak = 0;

  const ring = createRing(N, () => ({
    active: false, pos: new THREE.Vector3(), t: 0, life: 0, frames: 0, minFrames: 0,
    size: 0, roll: 0, flicker: false, color: new THREE.Color(),
  }));

  let alive = 0;

  /**
   * Destello genérico. flicker=true re-aleatoriza giro/escala cada frame (fogonazo).
   * pos se copia; color: THREE.Color ya resuelto.
   */
  function spawn(pos, size, life, color, minFrames = 1, flicker = false) {
    const it = ring.acquire();
    it.active = true;
    it.pos.copy(pos);
    it.t = 0; it.life = life; it.frames = 0; it.minFrames = minFrames;
    it.size = size; it.roll = rng.next() * Math.PI * 2; it.flicker = flicker;
    it.color.copy(color);
  }

  /** Pulso de la luz compartida (el último pulso manda). */
  function flashLight(pos, color, intensity, dur) {
    light.position.copy(pos);
    light.color.copy(color);
    lightPeak = intensity;
    lightDur = Math.max(1e-3, dur);
    lightT = lightDur;
    light.intensity = intensity;
  }

  function update(dt, camera) {
    camera.getWorldQuaternion(_camQ);
    const col = mesh.instanceColor.array;
    const items = ring.items;
    let k = 0;
    for (let i = 0; i < N; i++) {
      const it = items[i];
      if (!it.active) continue;
      it.t += dt;
      it.frames++;
      if (it.t >= it.life && it.frames > it.minFrames) { it.active = false; continue; }
      const u = Math.min(1, it.t / it.life);
      let scale = it.size * (1 - 0.35 * u);
      if (it.flicker) {
        it.roll = rng.next() * Math.PI * 2;
        scale *= 0.8 + 0.4 * rng.next();
      }
      _q.setFromAxisAngle(Z, it.roll).premultiply(_camQ);
      _s.set(scale, scale, scale);
      _m.compose(it.pos, _q, _s);
      mesh.setMatrixAt(k, _m);
      const b = 1 - u * u;
      const c = k * 3;
      col[c] = it.color.r * b; col[c + 1] = it.color.g * b; col[c + 2] = it.color.b * b;
      k++;
    }
    alive = k;
    mesh.count = k;
    mesh.visible = k > 0;
    if (k > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }

    if (lightT > 0) {
      lightT = Math.max(0, lightT - dt);
      const f = lightT / lightDur;
      light.intensity = lightPeak * f * (0.75 + 0.25 * rng.next());
    } else if (light.intensity !== 0) {
      light.intensity = 0;
    }
  }

  function dispose() {
    scene.remove(mesh);
    scene.remove(light);
    geo.dispose(); mat.dispose(); mesh.dispose();
    light.dispose();
  }

  return { spawn, flashLight, update, dispose, get alive() { return alive; }, size: N, light };
}
