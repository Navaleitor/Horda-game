// Servicio 'models' (no es sistema). Dueño: character-artist.
// Contrato: docs/arquitectura.md §3.7 `models`. main.js hace `game.provide('models', await loadModels())`.
//
// ── API ────────────────────────────────────────────────────────────────────────────────────────
//   const models = await loadModels();
//   models.ok                    → true si Soldier.glb cargó; false = marcador de cápsula (ver models.error)
//   models.error                 → null | Error
//   models.height                → altura del soldado en metros (≈1.8)
//   models.createSoldier(classId) → {
//     root,        // Group sin transformar; el consumidor lo posiciona (pies en y=0) y lo gira (yaw 0 = −Z).
//                  //   Por dentro: root → 'soldier:inner' (solo escala; el glb ya mira a −Z) → escena del glb.
//     skinned,     // SkinnedMesh[] ('vanguard_Mesh' cuerpo, 'vanguard_visor' visor). Comparten un Skeleton.
//     animations,  // AnimationClip[] del glb (compartidos entre instancias; no mutarlos)
//     bones,       // Map<nombre, Bone> con los nombres saneados por GLTFLoader (sin ':')
//     anchors: { rightHand, leftHand, head, spine, back,   // contrato
//                leftArm, hips },                          // extra (accesorios de clase)
//     classId,
//   }
//   Cada llamada devuelve una instancia nueva (SkeletonUtils.clone). Geometría, texturas y clips se
//   comparten; el material se clona UNA vez por clase y se cachea (no por instancia).
//
// ── Soldier.glb (three.js r170, examples/models/gltf/Soldier.glb, 2.1 MB) ──────────────────────
//   Clips: 'Idle' (1.97 s), 'Run' (0.70 s), 'TPose' (0.03 s), 'Walk' (1.03 s); 156 pistas c/u
//          (pos/rot/escala de 52 huesos; las pistas usan los mismos nombres saneados).
//   Mallas: 'vanguard_Mesh' (VanguardBodyMat), 'vanguard_visor' (Vanguard_VisorMat); 2 JPEG.
//   Nodo 'Character' (rotX −90°, escala 0.01: el original es Z-arriba en cm) → 1.83 m de alto.
//   Huesos (52, jerarquía Mixamo; en el glb 'mixamorig:X', en three 'mixamorigX'):
//     mixamorigHips
//       mixamorigSpine → Spine1 → Spine2
//         Spine2 → Neck → Head → HeadTop_End
//         Spine2 → LeftShoulder  → LeftArm  → LeftForeArm  → LeftHand
//         Spine2 → RightShoulder → RightArm → RightForeArm → RightHand
//           (Left|Right)Hand → (Thumb|Index|Middle|Ring|Pinky)1..4
//       mixamorigLeftUpLeg  → LeftLeg  → LeftFoot  → LeftToeBase  → LeftToe_End
//       mixamorigRightUpLeg → RightLeg → RightFoot → RightToeBase → RightToe_End
//   Los ejes LOCALES de los huesos Mixamo son incómodos (escala 0.01 heredada, +Y a lo largo del
//   hueso): por eso NO se montan cosas directamente en los huesos, sino en los anchors.
//
// ── Anchors (Object3D hijos de huesos; escala compensada → unidades en metros) ─────────────────
//   Se calculan en la pose de enlace (bind pose = T-pose: brazos en cruz, palmas hacia abajo).
//   En esa pose TODOS los anchors tienen la misma orientación que `root`:
//       −Z = delante del personaje, +Y = arriba, +X = derecha del personaje.
//   Después siguen al hueso, así que en anatomía de la mano eso significa:
//   rightHand  hueso mixamorigRightHand. Origen: centro del puño cerrado (entre muñeca y nudillos,
//              2 cm bajo la palma). −Z = hacia donde apunta el pulgar (dirección del cañón en un
//              agarre de pistola), +Y = dorso de la mano, +X = hacia las puntas de los dedos.
//              → Montar el arma con su −Z (cañón, convención de props) alineado con −Z del anchor
//                y el nodo `grip` del prop en el origen del anchor.
//   leftHand   hueso mixamorigLeftHand. Mismo criterio (−Z pulgar, +Y dorso) pero los dedos
//              apuntan a −X. Pensado para `support` del arma (o IK del brazo izquierdo).
//   head       hueso mixamorigHead. Origen: centro del cráneo (mitad Head–HeadTop_End). −Z = cara.
//   spine      hueso mixamorigSpine2 (pecho). Origen: en el hueso. −Z = pecho, +Y = cuello.
//   back       hueso mixamorigSpine2. Origen: sobre la superficie de la espalda, a la altura de
//              los omóplatos (≈BACK_OFFSET detrás del hueso). −Z = hacia el cuerpo, +Z = hacia
//              fuera de la espalda. Para el arma guardada: rotarla bajo el anchor (p. ej. cañón
//              hacia arriba en diagonal); la mochila de clase ya ocupa ~0.12 m en +Z, así que
//              conviene desplazar el arma ~0.14 m en +Z.
//   leftArm    (extra) hueso mixamorigLeftArm, a 1/3 del brazo: brazalete de clase.
//   hips       (extra) hueso mixamorigHips, a la altura del cinturón.
//
// ── Variante por clase (config.classes[id].color / .accessory) ─────────────────────────────────
//   Cuerpo: textura desaturada y teñida al color de clase (tintShader); visor emisivo del color de clase (legible a 30 m).
//   medic     'medpack'  mochila médica blanca con cruz verde + brazalete blanco/verde.
//   support   'ammo'     mochila de munición + bandolera cruzada al pecho, naranja.
//   engineer  'hardhat'  casco de obra con visera oscura + caja de herramientas a la cadera, amarillo.
//   recon     'antenna'  capucha + antena de radio con punta luminosa, azul oscuro.
//   Todos con castShadow. Si falla el glb, createSoldier devuelve una cápsula de marcador con la
//   misma forma de objeto (anchors en posiciones aproximadas) y se informa con console.error.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import config from '../core/config.js';
import { box, cylY, part, merge } from './props/geometry.js';
import soldierUrl from '../../assets/Soldier.glb';

const TARGET_HEIGHT = 1.8;      // m
const SOURCE_HEIGHT = 1.8318;   // m (bbox del vanguard_Mesh × 0.01)
const BACK_OFFSET = 0.13;       // m detrás de Spine2 hasta la superficie de la espalda
const BODY_TINT = 0.85;         // 0 = textura original, 1 = color de clase puro
const BODY_DESAT = 0.9;         // desaturación de la textura antes de teñir (la original es marrón)
const BODY_GAIN = 1.5;          // compensa el oscurecimiento del tinte multiplicativo

const BONE = {
  rightHand: 'mixamorigRightHand',
  rightMiddle: 'mixamorigRightHandMiddle1',
  leftHand: 'mixamorigLeftHand',
  leftMiddle: 'mixamorigLeftHandMiddle1',
  head: 'mixamorigHead',
  headTop: 'mixamorigHeadTop_End',
  spine: 'mixamorigSpine2',
  leftArm: 'mixamorigLeftArm',
  leftForeArm: 'mixamorigLeftForeArm',
  hips: 'mixamorigHips',
};

function dataUrlToArrayBuffer(url) {
  const comma = url.indexOf(',');
  const meta = url.slice(0, comma);
  const payload = url.slice(comma + 1);
  if (!meta.includes(';base64')) return new TextEncoder().encode(decodeURIComponent(payload)).buffer;
  const bin = atob(payload);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function collectBones(root) {
  const map = new Map();
  root.traverse((o) => { if (o.isBone) map.set(o.name, o); });
  return map;
}

function collectSkinned(root) {
  const list = [];
  root.traverse((o) => { if (o.isSkinnedMesh) list.push(o); });
  return list;
}

// ── Plantilla: glb envuelto + anchors calculados en bind pose ────────────────────────────────────
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function buildTemplate(gltf) {
  const root = new THREE.Group();
  root.name = 'soldier';
  const inner = new THREE.Group();
  inner.name = 'soldier:inner';
  // El Soldier.glb de three.js ya mira a −Z (verificado: mano derecha en +X), así que inner
  // no necesita girar; se deja el contenedor para escalar y por si cambia el asset.
  inner.rotation.y = 0;
  inner.scale.setScalar(TARGET_HEIGHT / SOURCE_HEIGHT);
  inner.add(gltf.scene);
  root.add(inner);

  const skinned = collectSkinned(root);
  for (const m of skinned) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;   // la bbox de bind pose no cubre las animaciones
  }
  // Bind pose (T-pose) para medir y colocar anchors.
  if (skinned[0]) skinned[0].skeleton.pose();
  root.updateMatrixWorld(true);

  const bones = collectBones(root);
  const need = (n) => {
    const b = bones.get(n) || root.getObjectByName(n);   // *_End no son Bone (no están en el skin)
    if (!b) throw new Error(`Soldier.glb: falta el hueso '${n}'`);
    return b;
  };
  const wp = (n, out = new THREE.Vector3()) => need(n).getWorldPosition(out);

  // Coloca un anchor en `pos` (marco de root; root = identidad aquí) con orientación de root,
  // y lo cuelga del hueso conservando la transformación de mundo (attach compensa la escala).
  const anchor = (key, boneName, pos) => {
    const a = new THREE.Object3D();
    a.name = `anchor:${key}`;
    a.position.copy(pos);
    root.add(a);
    a.updateMatrixWorld(true);
    need(boneName).attach(a);
    return a;
  };

  const rh = wp(BONE.rightHand).lerp(wp(BONE.rightMiddle, _v), 0.5); rh.y -= 0.02;
  const lh = wp(BONE.leftHand).lerp(wp(BONE.leftMiddle, _v), 0.5); lh.y -= 0.02;
  const head = wp(BONE.head).lerp(wp(BONE.headTop, _v), 0.5);
  const spine = wp(BONE.spine);
  const back = spine.clone().add(_v2.set(0, 0.04, BACK_OFFSET));
  const larm = wp(BONE.leftArm).lerp(wp(BONE.leftForeArm, _v), 0.33);
  const hips = wp(BONE.hips);

  anchor('rightHand', BONE.rightHand, rh);
  anchor('leftHand', BONE.leftHand, lh);
  anchor('head', BONE.head, head);
  anchor('spine', BONE.spine, spine);
  anchor('back', BONE.spine, back);
  anchor('leftArm', BONE.leftArm, larm);
  anchor('hips', BONE.hips, hips);

  const measures = {
    chestY: spine.y, headY: head.y, hipsY: hips.y,
  };
  return { root, measures };
}

function findAnchors(root) {
  const anchors = {};
  root.traverse((o) => {
    if (o.name.startsWith('anchor:')) anchors[o.name.slice(7)] = o;
  });
  return anchors;
}

// Desatura la textura difusa antes de multiplicar por material.color, para que el color de clase
// se lea limpio (la textura del Soldier es marrón/tostada y teñirla sin más da tonos sucios).
function tintShader(mat, key) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float lum = dot( sampledDiffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
  sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, vec3( lum ), ${BODY_DESAT.toFixed(3)} ) * ${BODY_GAIN.toFixed(3)};
  diffuseColor *= sampledDiffuseColor;
#endif`);
  };
  mat.customProgramCacheKey = () => key; // mismo shader para todas las clases
}

// ── Materiales por clase (cacheados) ─────────────────────────────────────────────────────────────
const accMatCache = new Map();
function accMat(key, color, opts = {}) {
  let m = accMatCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, ...opts });
    m.name = `acc:${key}`;
    accMatCache.set(key, m);
  }
  return m;
}

function mesh(geo, mat, name) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ── Accesorios procedurales (marco de cada anchor: −Z delante, +Y arriba, +X derecha) ────────────
// Se construyen una vez por clase y se clonan por instancia (geometría y material compartidos).
const ACCESSORIES = {
  // Médico: mochila médica blanca con cruz verde en la espalda + brazalete en el brazo izquierdo.
  medpack(color) {
    const white = accMat('medic:white', 0xf2f2ee);
    const green = accMat('medic:green', color, { emissive: color, emissiveIntensity: 0.35 });
    const pack = mesh(merge([
      box(0.30, 0.34, 0.14, [0, -0.04, 0.07]),
      box(0.26, 0.10, 0.10, [0, -0.25, 0.06]),         // riñonera inferior
    ]), white, 'acc:medpack');
    const cross = mesh(merge([
      box(0.18, 0.06, 0.02, [0, -0.02, 0.145]),
      box(0.06, 0.18, 0.02, [0, -0.02, 0.145]),
    ]), green, 'acc:medcross');
    const band = mesh(
      part(new THREE.CylinderGeometry(0.068, 0.068, 0.08, 10, 1, true), [0, 0, 0], [0, 0, Math.PI / 2]),
      accMat('medic:band', color, { side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.35 }),
      'acc:armband',
    );
    return { back: [pack, cross], leftArm: [band] };
  },

  // Apoyo: mochila de munición con cajas + bandolera cruzada (pecho), naranja.
  ammo(color) {
    const orange = accMat('support:orange', color);
    const dark = accMat('support:dark', 0x3a3026, { roughness: 0.9 });
    const pack = mesh(merge([
      box(0.34, 0.30, 0.16, [0, -0.06, 0.08]),
      box(0.36, 0.06, 0.18, [0, 0.11, 0.08]),           // tapa
      box(0.12, 0.12, 0.10, [0.20, -0.12, 0.06]),       // cartuchera lateral
      box(0.12, 0.12, 0.10, [-0.20, -0.12, 0.06]),
    ]), orange, 'acc:ammopack');
    // Bandolera: franja diagonal sobre el pecho con cargadores (frente = −Z del anchor 'spine').
    const belt = mesh(merge([
      box(0.07, 0.62, 0.03, [0, -0.06, -0.135], [0, 0, 0.75]),
      box(0.05, 0.08, 0.05, [-0.08, 0.03, -0.155], [0, 0, 0.75]),
      box(0.05, 0.08, 0.05, [0.0, -0.06, -0.155], [0, 0, 0.75]),
      box(0.05, 0.08, 0.05, [0.08, -0.15, -0.155], [0, 0, 0.75]),
    ]), dark, 'acc:bandolier');
    // Hombreras naranjas (sobre el pecho del anchor 'spine', a ambos lados).
    const pads = mesh(merge([
      box(0.14, 0.05, 0.16, [0.17, 0.17, 0.0], [0, 0, -0.35]),
      box(0.14, 0.05, 0.16, [-0.17, 0.17, 0.0], [0, 0, 0.35]),
    ]), orange, 'acc:shoulderpads');
    return { back: [pack], spine: [belt, pads] };
  },

  // Ingeniero: casco de obra amarillo con visera oscura + caja de herramientas en la cadera.
  hardhat(color) {
    const yellow = accMat('engineer:yellow', color, { roughness: 0.45 });
    const visorMat = accMat('engineer:visor', 0x101820, { roughness: 0.15, metalness: 0.6, emissive: 0x204060, emissiveIntensity: 0.6 });
    const hat = mesh(merge([
      part(new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.02, 0.01], [0, 0, 0], [1, 0.85, 1.1]),
      cylY(0.17, 0.02, [0, 0.02, 0.0], 16),                    // ala
      box(0.03, 0.03, 0.26, [0, 0.13, 0.01]),                   // cresta
    ]), yellow, 'acc:hardhat');
    const visor = mesh(box(0.22, 0.06, 0.02, [0, -0.02, -0.14]), visorMat, 'acc:visor');
    const toolbox = mesh(merge([
      box(0.22, 0.14, 0.10, [0.20, -0.12, 0.02]),
      box(0.10, 0.03, 0.02, [0.20, -0.03, 0.02]),               // asa
    ]), yellow, 'acc:toolbox');
    return { head: [hat, visor], hips: [toolbox] };
  },

  // Reconocimiento: capucha azul oscuro + antena alta en la espalda con punta luminosa.
  antenna(color) {
    const blue = accMat('recon:blue', color, { roughness: 0.85 });
    const tipMat = accMat('recon:tip', 0x9fdcff, { emissive: 0x6fc8ff, emissiveIntensity: 1.6 });
    const hood = mesh(merge([
      part(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), [0, 0.0, 0.02], [0.25, 0, 0], [1.0, 1.05, 1.1]),
      box(0.30, 0.10, 0.10, [0, -0.15, 0.08]),                   // cuello de la capucha
    ]), blue, 'acc:hood');
    const mast = mesh(merge([
      box(0.16, 0.20, 0.08, [0.07, -0.05, 0.05]),               // radio
      cylY(0.008, 0.70, [0.12, 0.38, 0.06], 6),                 // mástil
    ]), blue, 'acc:radio');
    const tip = mesh(new THREE.SphereGeometry(0.03, 8, 6), tipMat, 'acc:antennaTip');
    tip.position.set(0.12, 0.74, 0.06);
    return { head: [hood], back: [mast, tip] };
  },
};

const DEFAULT_ACCESSORY = { medic: 'medpack', support: 'ammo', engineer: 'hardhat', recon: 'antenna' };

// ── Servicio ─────────────────────────────────────────────────────────────────────────────────────
export async function loadModels() {
  let template = null;
  let clips = [];
  let error = null;

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(dataUrlToArrayBuffer(soldierUrl), '');
    template = buildTemplate(gltf);
    clips = gltf.animations;
  } catch (e) {
    error = e;
    console.error('[models] No se pudo cargar Soldier.glb; se usan cápsulas de marcador:', e);
  }

  // Material por clase: cuerpo teñido + visor emisivo. Cacheado.
  const classMats = new Map();
  function materialsFor(classId, srcBody, srcVisor) {
    let m = classMats.get(classId);
    if (m) return m;
    const cls = config.classes[classId];
    const color = new THREE.Color(cls ? cls.color : 0xffffff);
    const body = srcBody.clone();
    body.name = `soldier:body:${classId}`;
    body.color.setRGB(1, 1, 1).lerp(color, cls ? BODY_TINT : 0);
    if (cls) tintShader(body, 'soldier-tint');
    const visor = srcVisor.clone();
    visor.name = `soldier:visor:${classId}`;
    if (cls) { visor.emissive = color.clone(); visor.emissiveIntensity = 0.9; }
    m = { body, visor };
    classMats.set(classId, m);
    return m;
  }

  // Accesorios por clase: plantilla construida una vez, clonada por instancia.
  const accCache = new Map();
  function accessoriesFor(classId) {
    if (accCache.has(classId)) return accCache.get(classId);
    const cls = config.classes[classId];
    const kind = cls && (cls.accessory || DEFAULT_ACCESSORY[classId]);
    const build = kind && ACCESSORIES[kind];
    const acc = build ? build(cls.color) : null;
    accCache.set(classId, acc);
    return acc;
  }

  function createSoldier(classId) {
    if (classId != null && !config.classes[classId]) {
      console.warn(`[models] clase desconocida '${classId}': soldier sin variante`);
    }
    if (!template) return createFallback(classId);

    const root = SkeletonUtils.clone(template.root);
    const skinned = collectSkinned(root);
    for (const m of skinned) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    }
    if (skinned.length) {
      const body = skinned.find((m) => m.name === 'vanguard_Mesh') || skinned[0];
      const visor = skinned.find((m) => m.name === 'vanguard_visor');
      const mats = materialsFor(classId, body.material, (visor || body).material);
      body.material = mats.body;
      if (visor) visor.material = mats.visor;
    }
    const anchors = findAnchors(root);
    const acc = accessoriesFor(classId);
    if (acc) {
      for (const key of Object.keys(acc)) {
        const target = anchors[key];
        if (!target) continue;
        for (const piece of acc[key]) target.add(piece.clone());
      }
    }
    return { root, skinned, animations: clips.slice(), bones: collectBones(root), anchors, classId };
  }

  function createFallback(classId) {
    const cls = config.classes[classId];
    const root = new THREE.Group();
    root.name = 'soldier:fallback';
    const m = mesh(
      new THREE.CapsuleGeometry(0.3, TARGET_HEIGHT - 0.6, 4, 8),
      new THREE.MeshStandardMaterial({ color: cls ? cls.color : 0x888888 }),
      'soldier:capsule',
    );
    m.position.y = TARGET_HEIGHT / 2;
    root.add(m);
    const at = (name, x, y, z) => {
      const a = new THREE.Object3D();
      a.name = `anchor:${name}`;
      a.position.set(x, y, z);
      root.add(a);
      return a;
    };
    const anchors = {
      rightHand: at('rightHand', 0.25, 1.05, -0.3),
      leftHand: at('leftHand', -0.1, 1.15, -0.5),
      head: at('head', 0, 1.65, 0),
      spine: at('spine', 0, 1.3, 0),
      back: at('back', 0, 1.34, BACK_OFFSET),
      leftArm: at('leftArm', -0.3, 1.35, 0),
      hips: at('hips', 0, 1.0, 0),
    };
    return { root, skinned: [], animations: [], bones: new Map(), anchors, classId };
  }

  return {
    ok: !!template,
    error,
    height: TARGET_HEIGHT,
    createSoldier,
  };
}
