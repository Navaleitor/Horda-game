// Impactos: chispas (THREE.Points con buffers fijos, 1 draw call) y marcas orientadas por la
// normal (InstancedMesh de quads en pool circular, 1 draw call). Sin allocaciones por frame.
// Dueño: vfx-artist.

import * as THREE from 'three';
import { createRing } from '../core/pool.js';

const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _n = new THREE.Vector3();
const _v = new THREE.Vector3();

// ───────────────────────────── Chispas ─────────────────────────────
export function createSparks(scene, cfg, texture, rng) {
  const N = cfg.sparkPool;
  // Estado de simulación (visual) en arrays planos.
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const rgb = new Float32Array(N * 3);
  const age = new Float32Array(N);
  const life = new Float32Array(N);    // 0 = libre
  let head = 0;

  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('color', aCol);
  geo.setDrawRange(0, 0);

  const mat = new THREE.PointsMaterial({
    size: cfg.sparkSize, map: texture, vertexColors: true, sizeAttenuation: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    toneMapped: false, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'fx.sparks';
  points.frustumCulled = false;
  points.visible = false;
  points.renderOrder = 22;
  scene.add(points);

  let alive = 0;

  /** Emite `count` chispas en el hemisferio de `normal` (o esfera si es null). */
  function emit(p, normal, count, color, speed = cfg.sparkSpeed) {
    for (let n = 0; n < count; n++) {
      const i = head;
      head = (head + 1) % N;
      _v.set(rng.signed(), rng.signed(), rng.signed());
      if (_v.lengthSq() < 1e-4) _v.set(0, 1, 0);
      _v.normalize();
      if (normal) {
        if (_v.dot(normal) < 0) _v.addScaledVector(normal, -2 * _v.dot(normal));
        _v.addScaledVector(normal, 0.8).normalize();
      }
      const sp = speed * (0.45 + 0.55 * rng.next());
      const o = i * 3;
      pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
      vel[o] = _v.x * sp; vel[o + 1] = _v.y * sp + 0.6; vel[o + 2] = _v.z * sp;
      // Variación de tono: algunas chispas más blancas.
      const w = rng.next() * 0.35;
      rgb[o] = color.r + (1 - color.r) * w;
      rgb[o + 1] = color.g + (1 - color.g) * w;
      rgb[o + 2] = color.b + (1 - color.b) * w;
      age[i] = 0;
      life[i] = cfg.sparkLife * (0.7 + 0.6 * rng.next());
    }
  }

  function update(dt) {
    const g = cfg.sparkGravity * dt;
    const drag = Math.max(0, 1 - cfg.sparkDrag * dt);
    const outP = aPos.array, outC = aCol.array;
    let k = 0;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      if (age[i] >= life[i]) { life[i] = 0; continue; }
      const o = i * 3;
      vel[o] *= drag; vel[o + 1] = vel[o + 1] * drag - g; vel[o + 2] *= drag;
      pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
      const f = 1 - age[i] / life[i];
      const b = f * f;
      const w = k * 3;
      outP[w] = pos[o]; outP[w + 1] = pos[o + 1]; outP[w + 2] = pos[o + 2];
      outC[w] = rgb[o] * b; outC[w + 1] = rgb[o + 1] * b; outC[w + 2] = rgb[o + 2] * b;
      k++;
    }
    alive = k;
    geo.setDrawRange(0, k);
    points.visible = k > 0;
    if (k > 0) { aPos.needsUpdate = true; aCol.needsUpdate = true; }
  }

  function dispose() {
    scene.remove(points);
    geo.dispose(); mat.dispose();
  }

  return { emit, update, dispose, get alive() { return alive; }, size: N };
}

// ───────────────────────────── Marcas ─────────────────────────────
export function createDecals(scene, cfg, texture, rng) {
  const N = cfg.decalPool;
  const geo = new THREE.PlaneGeometry(1, 1);   // normal +Z
  const mat = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.name = 'fx.decals';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);

  const ring = createRing(N, () => ({
    active: false, pos: new THREE.Vector3(), q: new THREE.Quaternion(), size: 0, age: 0,
  }));
  let alive = 0;
  let dirty = false;

  function spawn(p, normal) {
    const it = ring.acquire();
    _n.copy(normal);
    if (_n.lengthSq() < 1e-6) return;
    _n.normalize();
    it.active = true;
    it.pos.copy(p).addScaledVector(_n, 0.006);
    _qr.setFromAxisAngle(Z, rng.next() * Math.PI * 2);
    it.q.setFromUnitVectors(Z, _n).multiply(_qr);
    it.size = cfg.decalSize * (0.8 + 0.4 * rng.next());
    it.age = 0;
    dirty = true;
  }

  function update(dt) {
    const life = cfg.decalLife;
    const items = ring.items;
    let k = 0;
    let fading = false;
    for (let i = 0; i < N; i++) {
      const it = items[i];
      if (!it.active) continue;
      it.age += dt;
      if (it.age >= life) { it.active = false; dirty = true; continue; }
      const rem = life - it.age;
      let sc = it.size;
      if (rem < 1) { sc *= rem; fading = true; }
      if (dirty || fading) {
        _s.set(sc, sc, sc);
        _m.compose(it.pos, it.q, _s);
        mesh.setMatrixAt(k, _m);
      }
      k++;
    }
    // Las matrices solo se reescriben si algo cambió (alta, baja o encogiéndose).
    if (dirty || fading) mesh.instanceMatrix.needsUpdate = true;
    dirty = false;
    alive = k;
    mesh.count = k;
    mesh.visible = k > 0;
  }

  function dispose() {
    scene.remove(mesh);
    geo.dispose(); mat.dispose(); mesh.dispose();
  }

  return { spawn, update, dispose, get alive() { return alive; }, size: N };
}
