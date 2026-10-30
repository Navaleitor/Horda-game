// Sistema 'level'. Dueño: level-designer.
// Construye el mapa (maps/<config.level.map>.js), la iluminación y las dianas, y provee el servicio:
//   level.data          datos del mapa + coverEdges[] generados
//   level.playerStart   { pos:[x,y,z], yaw }
//   level.targets       entidades diana (solo lectura)
//   level.setMarkersVisible(bool)
// En --debug registra window.__game.level con utilidades de QA (ver createDebugApi).

import * as THREE from 'three';
import { buildLevel } from './levelLoader.js';
import { createLighting } from './lighting.js';
import { createTargets } from './targets.js';
import outpost from './maps/outpost.js';

const MAPS = { outpost };

export default function create() {
  let game = null;
  let built = null;
  let lighting = null;
  let targets = null;

  const api = {
    data: null,
    playerStart: null,
    targets: null,
    setMarkersVisible(v) { if (built) built.setMarkersVisible(v); },
  };

  /** Vista cenital ortográfica (Norte arriba) → data URL PNG. Solo para QA. */
  function topView({ size = 96, markers = true, centerX = 0, centerZ = 0 } = {}) {
    const r = game.renderer;
    const canvas = r.domElement;
    const aspect = canvas.width / canvas.height;
    const half = size / 2;
    const cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 1, 300);
    cam.position.set(centerX, 150, centerZ);
    cam.up.set(0, 0, -1);
    cam.lookAt(centerX, 0, centerZ);
    cam.updateMatrixWorld(true);
    const fog = game.scene.fog;
    const prevMarkers = built.markers.visible;
    game.scene.fog = null;
    lighting.sky.visible = false;
    built.markers.visible = markers;
    r.render(game.scene, cam);
    const url = canvas.toDataURL('image/png');
    game.scene.fog = fog;
    lighting.sky.visible = true;
    built.markers.visible = prevMarkers;
    return url;
  }

  function createDebugApi() {
    return {
      get data() { return api.data; },
      targets: () => targets.describe(),
      damageTarget(id, amount = 1000, part = 'body') {
        const e = targets.list.find((t) => t.name === id || t.id === id);
        if (!e) return null;
        return { ...e.applyDamage(amount, { source: null, part, point: e.pos, weaponId: 'debug' }) };
      },
      resetTargets: () => targets.reset(),
      showMarkers: (v = true) => built.setMarkersVisible(v),
      topView,
      info: () => ({
        map: api.data.id,
        boxes: api.data.boxes.length,
        levelMeshes: built.meshCount,
        coverEdges: api.data.coverEdges.length,
        targets: targets.list.length,
        spawns: api.data.spawns.map((s) => s.id),
        barrierSlots: api.data.barrierSlots.length,
      }),
    };
  }

  return {
    name: 'level',
    init(g) {
      game = g;
      const src = MAPS[g.config.level.map];
      if (!src) throw new Error(`[level] mapa desconocido: ${g.config.level.map}`);
      built = buildLevel(g, src);
      lighting = createLighting(g, src);
      api.data = { ...src, coverEdges: built.coverEdges, boxIds: built.boxIds };
      api.playerStart = src.playerStart;
      g.provide('level', api);
      targets = createTargets(g, src.targets);
      api.targets = targets.list;
      g.debug.register('level', createDebugApi());
    },
    fixedUpdate(dt) {
      targets.fixedUpdate(dt);
    },
    update(dt, alpha) {},
    dispose() {
      if (targets) targets.dispose();
      if (lighting) lighting.dispose();
      if (built) built.dispose();
      targets = lighting = built = null;
    },
  };
}
