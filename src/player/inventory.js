// Inventario del jugador (ranuras del D-pad). Dueño: controls-camera-engineer.
//   D-pad ← → ranura 0 (rifle de asalto) · D-pad → → ranura 1 (arma comprada) · D-pad ↓ → ranura 2 (pistola;
//   en Fase 2 la pistola de reparación la reemplaza).
// player decide la ranura y emite weapon:switchRequest { who, slot, weaponId }; combat gestiona entity.weapon
// y responde con weapon:switched. Ranura vacía (provisional, ver docs/arquitectura.md §3.10): no cambia de
// arma y se muestra un aviso "Vacía" con prompt:show/hide.
// Fase 2+: granada única (la arcana tiene prioridad en el siguiente LB) y pieza cargada.

import { createWeapon } from '../assets/props/index.js';

export function createInventory(ctx) {
  const { e } = ctx;
  const ev = ctx.game.events;
  const P = ctx.game.config.player;
  const props = new Map();          // weaponId → prop { root, muzzle, grip, support, … }
  const req = { who: e, slot: 0, weaponId: null };
  const emptyPrompt = { id: 'player.slotEmpty', button: 'Right', text: 'Vacía' };
  let emptyT = 0;

  function select(slot) {
    const inv = e.inventory;
    const id = inv.slots[slot];
    if (!id) {
      emptyPrompt.button = slot === 1 ? 'Right' : slot === 0 ? 'Left' : 'Down';
      ev.emit('prompt:show', emptyPrompt);
      emptyT = P.emptySlotPromptTime;
      return false;
    }
    if (slot === inv.current) return false;
    inv.current = slot;
    req.slot = slot; req.weaponId = id;
    ev.emit('weapon:switchRequest', req);
    return true;
  }

  function step(dt) {
    const I = ctx.input;
    if (I.pressed('dpadLeft')) select(0);
    else if (I.pressed('dpadRight')) select(1);
    else if (I.pressed('dpadDown')) select(2);
    if (emptyT > 0) {
      emptyT -= dt;
      if (emptyT <= 0) ev.emit('prompt:hide', emptyPrompt);
    }
  }

  /** Prop visual del arma (cacheado por id). */
  function propFor(weaponId) {
    if (!weaponId) return null;
    let p = props.get(weaponId);
    if (p === undefined) { p = createWeapon(weaponId); props.set(weaponId, p); }
    return p;
  }

  /** Monta en el rig el prop del arma `weaponId` y lo expone en entity.weaponProp (muzzle para combat/fx). */
  function attachVisual(weaponId) {
    const p = propFor(weaponId);
    if (!p || !e.rig) return;
    if (e.weaponProp === p) return;
    if (e.weaponProp && e.weaponProp.root.parent) e.weaponProp.root.parent.remove(e.weaponProp.root);
    e.rig.attachWeapon(p.root, p);
    e.weaponProp = p;
  }

  function dispose() {
    for (const p of props.values()) if (p && p.root.parent) p.root.parent.remove(p.root);
    props.clear();
  }

  return { step, select, attachVisual, dispose };
}
