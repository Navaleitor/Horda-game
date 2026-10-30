// STUB: lo reemplaza animation-engineer
// Servicio 'anim' con createRig() que devuelve un rig no-op.

export default function create() {
  const api = {
    createRig(entity, soldier) {
      return {
        setState(state, params) {},
        setUpper(state, params) {},
        setAim(yawOffset, pitch) {},
        attachWeapon(propRoot, anchors) {},
      };
    },
    registerProvider(states, provider) {},
  };
  return {
    name: 'anim',
    init(game) { game.provide('anim', api); },
    fixedUpdate(dt) {},
    update(dt, alpha) {},
    dispose() {},
  };
}
