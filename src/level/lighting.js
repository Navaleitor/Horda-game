// Iluminación de atardecer industrial. Dueño: level-designer.
// HemisphereLight + DirectionalLight con sombras (mapa config.core.shadowMapSize, cámara ajustada
// al mapa), niebla lineal, cúpula de cielo con degradado (1 draw call, sin texturas) y dos focos
// sobre el fabricador. Todas las cifras en config.level.

import * as THREE from 'three';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunGlow;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0
    ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55))
    : mix(uHorizon, uGround, clamp(-h * 6.0, 0.0, 1.0));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunGlow * (pow(s, 8.0) * 0.45 + pow(s, 300.0) * 2.5);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * @param {object} game
 * @param {object} data   datos del mapa (fabricator, bounds)
 * @returns {{ group: THREE.Group, sun: THREE.DirectionalLight, sky: THREE.Mesh, dispose(): void }}
 */
export function createLighting(game, data) {
  const cfg = game.config.level;
  const scene = game.scene;
  const group = new THREE.Group();
  group.name = 'level-lighting';

  // Cielo y niebla
  const fog = cfg.fog;
  scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);
  scene.background = new THREE.Color(cfg.sky.horizon);

  const sunDir = new THREE.Vector3().fromArray(cfg.sun.dir).normalize();
  const skyMat = new THREE.ShaderMaterial({
    name: 'sky',
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uZenith: { value: new THREE.Color(cfg.sky.zenith) },
      uHorizon: { value: new THREE.Color(cfg.sky.horizon) },
      uGround: { value: new THREE.Color(cfg.sky.ground) },
      uSunGlow: { value: new THREE.Color(cfg.sky.sunGlow) },
      uSunDir: { value: sunDir },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(cfg.sky.radius, 32, 16), skyMat);
  sky.name = 'sky';
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  sky.matrixAutoUpdate = false;
  group.add(sky);

  // Luz ambiente de hemisferio (cielo cálido, suelo violáceo)
  const hemi = new THREE.HemisphereLight(cfg.hemi.sky, cfg.hemi.ground, cfg.hemi.intensity);
  group.add(hemi);

  // Sol bajo con sombras
  const sun = new THREE.DirectionalLight(cfg.sun.color, cfg.sun.intensity);
  const ext = cfg.sun.shadowExtent;
  sun.position.copy(sunDir).multiplyScalar(ext * 1.5);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  const size = game.config.core.shadowMapSize;
  sun.shadow.mapSize.set(size, size);
  const sc = sun.shadow.camera;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
  sc.near = 1; sc.far = ext * 3;
  sc.updateProjectionMatrix();
  sun.shadow.bias = cfg.sun.shadowBias;
  sun.shadow.normalBias = cfg.sun.shadowNormalBias;
  group.add(sun, sun.target);

  // Focos del fabricador (sin sombras)
  const f = data.fabricator.pos;
  const fl = cfg.fabLights;
  for (const sx of [-1, 1]) {
    const spot = new THREE.SpotLight(fl.color, fl.intensity, 0, fl.angle, fl.penumbra, 2);
    spot.position.set(f[0] + sx * 4, f[1] + fl.height, f[2] - 3);
    spot.target.position.set(f[0], f[1], f[2]);
    spot.castShadow = false;
    spot.name = 'fab-spot';
    group.add(spot, spot.target);
  }

  scene.add(group);
  group.updateMatrixWorld(true);

  return {
    group,
    sun,
    sky,
    dispose() {
      scene.remove(group);
      sky.geometry.dispose();
      skyMat.dispose();
      sun.shadow.dispose();
      if (scene.fog) scene.fog = null;
    },
  };
}
