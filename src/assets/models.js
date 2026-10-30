// STUB: lo reemplaza character-artist
// loadModels() debe decodificar assets/Soldier.glb (import como data URL) y devolver el servicio 'models'.
// Este stub devuelve un soldado de marcador (cápsula) para que nada rompa.

import * as THREE from 'three';

export async function loadModels() {
  return {
    createSoldier(classId) {
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.35, 1.1, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x888888 }),
      );
      mesh.position.y = 0.9;
      root.add(mesh);
      return {
        root,
        skinned: null,
        animations: [],
        bones: {},
        anchors: { rightHand: root, leftHand: root, head: root, spine: root, back: root },
      };
    },
  };
}
