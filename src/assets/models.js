// Servicio 'models' (no es sistema). Dueño: character-artist.
// Contrato: docs/arquitectura.md §3.7 `models`. main.js hace `game.provide('models', await loadModels())`.
//
// ── API ────────────────────────────────────────────────────────────────────────────────────────
//   const models = await loadModels();
//   models.ok                    → true si Xbot.glb cargó; false = marcador de cápsula (ver models.error)
//   models.error                 → null | Error
//   models.height                → altura del soldado en metros (≈1.8)
//   models.createSoldier(classId) → {
//     root,        // Group sin transformar; el consumidor lo posiciona (pies en y=0) y lo gira (yaw 0 = −Z).
//                  //   Por dentro: root → 'soldier:inner' (escala + giro de π: el Xbot mira a +Z) → escena del glb.
//     skinned,     // SkinnedMesh[] ('Beta_Surface' carcasa, 'Beta_Joints' articulaciones). Comparten un Skeleton.
//     animations,  // AnimationClip[] del glb (compartidos; no mutarlos). Renombrados a 'Idle'/'Walk'/'Run'
//     bones,       // Map<nombre, Bone> con los nombres saneados por GLTFLoader (sin ':')
//     anchors: { rightHand, leftHand, head, spine, back,   // contrato
//                leftArm, hips },                          // extra (accesorios de clase)
//     classId,
//   }
//   Cada llamada devuelve una instancia nueva (SkeletonUtils.clone). Geometría, texturas y clips se
//   comparten; el material se clona UNA vez por clase y se cachea (no por instancia).
//
// ── Xbot.glb (three.js r170, examples/models/gltf/Xbot.glb, 2.9 MB, sin texturas) ────────────
//   Maniquí estilizado. Clips originales: 'idle' (2.50 s), 'walk' (0.97 s), 'run' (0.70 s) — se
//   renombran a 'Idle'/'Walk'/'Run' (contrato del rig) — y poses sueltas 'agree', 'headShake',
//   'sad_pose', 'sneak_pose' (se conservan con su nombre). 201 pistas (pos/rot/escala de 67 huesos).
//   Clips in situ (sin root motion: la cadera no avanza).
//   Mallas: 'Beta_Surface' (carcasa) y 'Beta_Joints' (articulaciones), MeshStandardMaterial lisos.
//   Nodo 'Armature' (escala 0.01: el original está en cm) → 1.806 m de alto en la pose de reposo
//   (T-pose de los nodos). Mira a +Z (mano derecha en −X) → inner gira π.
//   OJO: skeleton.pose() con este glb deforma la escala (inverse bind matrices); la pose de reposo
//   se mide con las TRS de los nodos tal como las deja GLTFLoader.
//   Huesos (67, jerarquía Mixamo; en el glb 'mixamorig:X', en three 'mixamorigX'), como Soldier.glb
//   más 'mixamorigLeftEye' / 'mixamorigRightEye' bajo Head:
//     mixamorigHips
//       mixamorigSpine → Spine1 → Spine2
//         Spine2 → Neck → Head → HeadTop_End (+ LeftEye, RightEye)
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
//   Carcasa (Beta_Surface): gris claro mezclado con el color de clase (BODY_TINT). Articulaciones
//   (Beta_Joints) = placas: color de clase con brillo emisivo suave (legible a 30 m).
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
import soldierUrl from '../../assets/Xbot.glb';

const TARGET_HEIGHT = 1.8;      // m
const SOURCE_HEIGHT = 1.806;    // m (bbox de Beta_Surface en reposo × 0.01)
const BACK_OFFSET = 0.13;       // m detrás de Spine2 hasta la superficie de la espalda
const BODY_BASE = 0xc9ccd1;     // gris maniquí de la carcasa
const BODY_TINT = 0.35;         // 0 = gris maniquí, 1 = color de clase puro
const JOINT_EMISSIVE = 0.25;    // brillo de las placas (articulaciones) del color de clase
const CLIP_RENAME = { idle: 'Idle', walk: 'Walk', run: 'Run' };

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
  // El Xbot.glb mira a +Z (mano derecha en −X): se gira π para cumplir −Z = delante.
  inner.rotation.y = Math.PI;
  inner.scale.setScalar(TARGET_HEIGHT / SOURCE_HEIGHT);
  inner.add(gltf.scene);
  root.add(inner);

  const skinned = collectSkinned(root);
  for (const m of skinned) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;   // la bbox de bind pose no cubre las animaciones
  }
  // Pose de reposo de los nodos (T-pose) para medir y colocar anchors. No usar skeleton.pose().
  root.updateMatrixWorld(true);

  const bones = collectBones(root);
  const need = (n) => {
    const b = bones.get(n) || root.getObjectByName(n);   // *_End no son Bone (no están en el skin)
    if (!b) throw new Error(`Xbot.glb: falta el hueso '${n}'`);
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
    for (const c of clips) if (CLIP_RENAME[c.name]) c.name = CLIP_RENAME[c.name];
  } catch (e) {
    error = e;
    console.error('[models] No se pudo cargar Xbot.glb; se usan cápsulas de marcador:', e);
  }

  // Material por clase: carcasa gris maniquí teñida + placas (articulaciones) del color de clase. Cacheado.
  const classMats = new Map();
  function materialsFor(classId, srcBody, srcJoints) {
    let m = classMats.get(classId);
    if (m) return m;
    const cls = config.classes[classId];
    const color = new THREE.Color(cls ? cls.color : 0x5a5f66);
    const body = srcBody.clone();
    body.name = `soldier:body:${classId}`;
    body.color.set(BODY_BASE).lerp(color, cls ? BODY_TINT : 0);
    body.roughness = 0.55; body.metalness = 0.1;
    const joints = srcJoints.clone();
    joints.name = `soldier:joints:${classId}`;
    joints.color.copy(color);
    joints.roughness = 0.4; joints.metalness = 0.2;
    if (cls) { joints.emissive = color.clone(); joints.emissiveIntensity = JOINT_EMISSIVE; }
    m = { body, joints };
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
      const body = skinned.find((m) => m.name === 'Beta_Surface') || skinned[0];
      const joints = skinned.find((m) => m.name === 'Beta_Joints');
      const mats = materialsFor(classId, body.material, (joints || body).material);
      body.material = mats.body;
      if (joints) joints.material = mats.joints;
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
