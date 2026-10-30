// Pausa (Continuar · Controles · Salir al menú) y panel de controles. Dueño: ui-hud-designer.
// El panel de controles es la tabla E-Day Default del GDD §1 con glifos; se reutiliza desde el menú de inicio.

import { NAV } from './nav.js';
import { glyph, padGlyph } from './glyphs.js';

// GDD §1 (E-Day Default adaptado). [botones, combate, menús]
const CONTROLS = [
  [['LS'], 'Mover', 'Navegar'],
  [['RS'], 'Cámara', '—'],
  [['L3'], 'Sin función', '—'],
  [['R3'], 'Cambiar de hombro', '—'],
  [['A'], 'Cobertura · A + dirección en cobertura = SWAT / deslizar a la contigua · sin cobertura a tiro y moviéndote = maroma · doble toque = maroma', 'Seleccionar / comprar'],
  [['Y'], 'Saltar · trepar · saltar sobre cobertura', '—'],
  [['B'], 'Golpe cuerpo a cuerpo · cargando pieza: soltarla', 'Atrás / cerrar'],
  [['X'], 'Interactuar · mantener sobre aliado derribado = revivir · toque sobre fortificación = radial', '—'],
  [['RB'], 'Recargar (toque de nuevo = recarga activa)', 'Pestaña →'],
  [['LB'], 'Toque = granada rápida · mantener = Tac-Com', 'Pestaña ←'],
  [['LT'], 'Apuntar', '—'],
  [['RT'], 'Disparar · cargando pieza: colocar', '—'],
  [['Left', 'Right'], 'Rifle de asalto / arma comprada', 'Navegar'],
  [['Down'], 'Pistola (o pistola de reparación)', 'Navegar'],
  [['Up'], 'Mantener = radial de comodines (elegir con RS, soltar = activar)', 'Navegar'],
  [['View'], 'Mantener = marcador', '—'],
  [['Menu'], 'Pausa', 'Pausa'],
];

const KEYBOARD_NOTE = 'Teclado (respaldo): WASD mover · ratón mirar · Espacio cobertura · C saltar · '
  + 'F melee · R recargar · clic der. apuntar · clic izq. disparar · Q hombro · 1/2/3 armas · Esc pausa · Enter confirmar.';

export function createControlsPanel(parent) {
  const el = document.createElement('div');
  el.className = 'hz-screen hz-pause';
  let rows = '';
  for (let i = 0; i < CONTROLS.length; i++) {
    const [btns, combat, menus] = CONTROLS[i];
    let g = '';
    for (let j = 0; j < btns.length; j++) g += padGlyph(btns[j]);
    rows += `<tr><td>${g}</td><td>${combat}</td><td class="${menus === '—' ? 'hz-dim' : ''}">${menus}</td></tr>`;
  }
  el.innerHTML = `
    <div class="hz-modal hz-panel hz-ctrl">
      <div class="hz-hazard"></div>
      <h3>Controles · E-Day Default <small class="hz-ctrl-close"></small></h3>
      <div class="hz-ctrl-wrap"><table>
        <thead><tr><th>Botón</th><th>Combate</th><th>Menús</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="hz-kb">${KEYBOARD_NOTE}</div>
    </div>`;
  parent.appendChild(el);
  const close = el.querySelector('.hz-ctrl-close');
  let device = null;

  function setDevice(d) {
    if (d === device) return;
    device = d;
    close.innerHTML = `${glyph('B', d, 'ui')} Volver`;
  }
  setDevice('gamepad');

  return {
    el,
    setDevice,
    show() { el.classList.add('on'); },
    hide() { el.classList.remove('on'); },
    /** true si hay que cerrar el panel. */
    handle(nav) { return !!(nav & (NAV.BACK | NAV.CONFIRM)); },
    onClick(fn) { el.addEventListener('click', fn); },
  };
}

const ITEMS = [
  { id: 'resume', label: 'Continuar' },
  { id: 'controls', label: 'Controles' },
  { id: 'quit', label: 'Salir al menú' },
];

export function createPauseMenu(parent, { onResume, onControls, onQuit }) {
  const el = document.createElement('div');
  el.className = 'hz-screen hz-pause';
  el.innerHTML = `
    <div class="hz-pause-box hz-panel">
      <div class="hz-hazard"></div>
      <h2>PAUSA</h2>
      <div class="hz-pause-list">${ITEMS.map((it, i) => `<div class="hz-item" data-i="${i}">${it.label}</div>`).join('')}</div>
      <div class="hz-pause-info"></div>
    </div>
    <div class="hz-screen hz-confirm-layer">
      <div class="hz-modal hz-panel hz-confirm">
        <div class="hz-hazard"></div>
        <h3>¿Salir al menú?</h3>
        <p>Se perderá el progreso de la partida.</p>
        <div class="hz-pause-list"><div class="hz-item" data-c="0">Cancelar</div><div class="hz-item" data-c="1">Salir</div></div>
      </div>
    </div>
    <div class="hz-footer"></div>`;
  parent.appendChild(el);

  const itemEls = Array.from(el.querySelectorAll('.hz-pause-box .hz-item'));
  const confirmLayer = el.querySelector('.hz-confirm-layer');
  const confirmEls = Array.from(el.querySelectorAll('.hz-confirm .hz-item'));
  const info = el.querySelector('.hz-pause-info');
  const footer = el.querySelector('.hz-footer');

  const state = { index: 0, confirming: false, confirmIndex: 0 };
  let device = null;

  function refresh() {
    for (let i = 0; i < itemEls.length; i++) itemEls[i].classList.toggle('focus', !state.confirming && state.index === i);
    confirmLayer.classList.toggle('on', state.confirming);
    for (let i = 0; i < confirmEls.length; i++) confirmEls[i].classList.toggle('focus', state.confirmIndex === i);
  }

  function activate() {
    if (state.confirming) {
      if (state.confirmIndex === 1) onQuit();
      else { state.confirming = false; refresh(); }
      return;
    }
    const id = ITEMS[state.index].id;
    if (id === 'resume') onResume();
    else if (id === 'controls') onControls();
    else if (id === 'quit') { state.confirming = true; state.confirmIndex = 0; refresh(); }
  }

  function handle(nav) {
    if (!nav) return;
    if (state.confirming) {
      if (nav & (NAV.LEFT | NAV.UP)) { state.confirmIndex = 0; refresh(); }
      else if (nav & (NAV.RIGHT | NAV.DOWN)) { state.confirmIndex = 1; refresh(); }
      if (nav & NAV.CONFIRM) activate();
      else if (nav & NAV.BACK) { state.confirming = false; refresh(); }
      return;
    }
    if (nav & NAV.UP) { state.index = (state.index + ITEMS.length - 1) % ITEMS.length; refresh(); }
    else if (nav & NAV.DOWN) { state.index = (state.index + 1) % ITEMS.length; refresh(); }
    if (nav & NAV.CONFIRM) activate();
    else if (nav & NAV.BACK) onResume();
  }

  el.addEventListener('click', (e) => {
    const it = e.target.closest('.hz-item');
    if (!it) return;
    if (it.dataset.c != null) { state.confirmIndex = +it.dataset.c; }
    else { state.index = +it.dataset.i; }
    refresh();
    activate();
  });

  function setDevice(d) {
    if (d === device) return;
    device = d;
    footer.innerHTML = `<span class="hz-fi">${glyph('A', d, 'ui')} Seleccionar</span>`
      + `<span class="hz-fi">${glyph('B', d, 'ui')} Atrás</span>`
      + `<span class="hz-fi">${glyph('Menu', d, 'ui')} Continuar</span>`;
  }
  setDevice('gamepad');

  return {
    el,
    state,
    handle,
    setDevice,
    setInfo(text) { info.textContent = text; },
    /** reset: al entrar en pausa desde la partida (no al volver del panel de controles). */
    show(reset) {
      if (reset) { state.index = 0; state.confirming = false; }
      refresh();
      el.classList.add('on');
    },
    hide() { el.classList.remove('on'); },
    get itemId() { return state.confirming ? (state.confirmIndex ? 'confirmQuit' : 'confirmCancel') : ITEMS[state.index].id; },
  };
}
