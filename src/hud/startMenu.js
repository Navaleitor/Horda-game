// Menú de inicio: clase + dificultad + Empezar (+ Controles). Dueño: ui-hud-designer.
// Navegación: ↑/↓ cambia de fila; ←/→ cambia la opción de la fila; A avanza
// (Clase → Dificultad → Empezar → emite); B retrocede una fila.
// Textos informativos: los números de balance (multiplicadores, colores) se leen de config.

import { NAV } from './nav.js';
import { glyph, hexColor, escapeHtml } from './glyphs.js';

// Texto de presentación de cada clase (GDD §3, §4, §6). Sin cifras de balance.
const CLASS_INFO = {
  medic: {
    role: 'Sostén del escuadrón',
    passives: 'Revivir rápido · Vitalidad · Regeneración · Dardos curativos',
    bot: 'Ametralladora básica',
    mystic: 'Aura de Resurrección',
  },
  support: {
    role: 'Munición y granadas',
    passives: '+Munición · Recarga incendiaria · Granadero · Aura de daño',
    bot: 'Ametralladora ligera',
    mystic: 'Lluvia de Suministros',
  },
  engineer: {
    role: 'Fortificaciones',
    passives: 'Reparación experta · Blindaje · Cargador · Descuento',
    bot: 'Subfusil',
    mystic: 'Fortaleza Arcana',
  },
  recon: {
    role: 'Precisión y movilidad',
    passives: 'Tiro a la cabeza · Ojo marcador · Ágil · Cazarrecompensas',
    bot: 'Rifle de francotirador',
    mystic: 'Velo de Sombras',
  },
};

export const ROWS = ['class', 'difficulty', 'start', 'controls'];

function fmtMult(v) {
  return '×' + String(Math.round(v * 100) / 100).replace('.', ',');
}

export function createStartMenu(parent, game, { onStart, onControls }) {
  const cfg = game.config;
  const classIds = cfg.classOrder.slice();
  const diffIds = cfg.difficultyOrder.slice();

  const state = {
    row: 0,
    classIndex: 0,
    diffIndex: Math.max(0, diffIds.indexOf(cfg.defaultDifficulty)),
  };

  const el = document.createElement('div');
  el.className = 'hz-screen hz-menu';
  parent.appendChild(el);

  let rowEls = [];
  let cardEls = [];
  let diffEls = [];
  let btnStart = null;
  let btnCtrl = null;
  let footer = null;
  let device = 'gamepad';

  function build() {
    let cards = '';
    for (let i = 0; i < classIds.length; i++) {
      const id = classIds[i];
      const c = cfg.classes[id] || { name: id, color: 0x888888 };
      const info = CLASS_INFO[id] || { role: '', passives: '', bot: '—', mystic: '—' };
      cards += `<div class="hz-card" data-i="${i}" style="--cc:${hexColor(c.color)}">
        <span class="hz-tick"></span>
        <h3>${escapeHtml(c.name)}</h3>
        <div class="hz-role">${escapeHtml(info.role)}</div>
        <div class="hz-kv"><b>Pasivas</b>${escapeHtml(info.passives)}</div>
        <div class="hz-kv"><b>Arma de bot</b>${escapeHtml(info.bot)}</div>
        <div class="hz-kv"><b>Comodín</b>${escapeHtml(info.mystic)}</div>
      </div>`;
    }
    let diffs = '';
    for (let i = 0; i < diffIds.length; i++) {
      const d = cfg.difficulties[diffIds[i]];
      diffs += `<div class="hz-diff" data-i="${i}">
        <h3>${escapeHtml(d.name)}</h3>
        <div class="hz-mult"><span>HP enemigo <b>${fmtMult(d.enemyHp)}</b></span>
          <span>Daño enemigo <b>${fmtMult(d.enemyDamage)}</b></span><span>Puntos <b>${fmtMult(d.points)}</b></span></div>
      </div>`;
    }
    const lr = `${glyph('Left', device, 'ui')}${glyph('Right', device, 'ui')}<span>Cambiar</span>`;
    el.innerHTML = `
      <div class="hz-menu-inner">
        <div class="hz-title"><h1>HORDA</h1><div class="hz-hazard"></div><p>Modo Horda · Puesto Avanzado</p></div>
        <div class="hz-row" data-row="0">
          <div class="hz-row-head"><span class="hz-num">1</span><span class="hz-label">Clase</span><span class="hz-hint">${lr}</span></div>
          <div class="hz-cards">${cards}</div>
        </div>
        <div class="hz-row" data-row="1">
          <div class="hz-row-head"><span class="hz-num">2</span><span class="hz-label">Dificultad</span><span class="hz-hint">${lr}</span></div>
          <div class="hz-diffs">${diffs}</div>
        </div>
        <div class="hz-actions">
          <div class="hz-btn primary" data-row="2">${glyph('A', device, 'ui')}<span>Empezar</span></div>
          <div class="hz-btn" data-row="3"><span>Controles</span></div>
        </div>
        <div class="hz-note"><b>Fase 1a:</b> la clase solo cambia el aspecto del personaje; las pasivas y comodines llegarán con el fabricador.
          Los 3 bots del escuadrón tomarán las otras clases.</div>
      </div>
      <div class="hz-footer">
        <span class="hz-fi">${glyph('A', device, 'ui')} Seleccionar</span>
        <span class="hz-fi">${glyph('B', device, 'ui')} Atrás</span>
        <span class="hz-fi">${glyph('DPad', device, 'ui')}${device === 'keyboard' ? '' : glyph('LS', device, 'ui')} Navegar</span>
      </div>`;
    rowEls = Array.from(el.querySelectorAll('.hz-row'));
    cardEls = Array.from(el.querySelectorAll('.hz-card'));
    diffEls = Array.from(el.querySelectorAll('.hz-diff'));
    btnStart = el.querySelector('.hz-btn.primary');
    btnCtrl = el.querySelector('.hz-btn[data-row="3"]');
    footer = el.querySelector('.hz-footer');
    refresh();
  }

  function refresh() {
    for (let i = 0; i < rowEls.length; i++) rowEls[i].classList.toggle('focus', state.row === i);
    btnStart.classList.toggle('focus', state.row === 2);
    btnCtrl.classList.toggle('focus', state.row === 3);
    for (let i = 0; i < cardEls.length; i++) cardEls[i].classList.toggle('sel', state.classIndex === i);
    for (let i = 0; i < diffEls.length; i++) diffEls[i].classList.toggle('sel', state.diffIndex === i);
  }

  function start() {
    onStart(classIds[state.classIndex], diffIds[state.diffIndex]);
  }

  function confirm() {
    if (state.row === 0) state.row = 1;
    else if (state.row === 1) state.row = 2;
    else if (state.row === 2) { start(); return; }
    else if (state.row === 3) { onControls(); return; }
    refresh();
  }

  /** Procesa las banderas NAV de este paso. */
  function handle(nav) {
    if (!nav) return;
    let changed = false;
    if (nav & NAV.UP) {
      if (state.row === 3) state.row = 1;
      else if (state.row > 0) state.row--;
      changed = true;
    } else if (nav & NAV.DOWN) {
      if (state.row < 2) state.row++;
      changed = true;
    }
    if (nav & NAV.LEFT) {
      if (state.row === 0) state.classIndex = (state.classIndex + classIds.length - 1) % classIds.length;
      else if (state.row === 1) state.diffIndex = Math.max(0, state.diffIndex - 1);
      else if (state.row === 3) state.row = 2;
      changed = true;
    } else if (nav & NAV.RIGHT) {
      if (state.row === 0) state.classIndex = (state.classIndex + 1) % classIds.length;
      else if (state.row === 1) state.diffIndex = Math.min(diffIds.length - 1, state.diffIndex + 1);
      else if (state.row === 2) state.row = 3;
      changed = true;
    }
    if (changed) refresh();
    if (nav & NAV.CONFIRM) confirm();
    else if (nav & NAV.BACK) {
      if (state.row === 3) state.row = 2;
      else if (state.row > 0) state.row--;
      refresh();
    }
  }

  // Ratón (comodidad de escritorio; el flujo principal es el mando).
  el.addEventListener('click', (e) => {
    const card = e.target.closest('.hz-card');
    const diff = e.target.closest('.hz-diff');
    const btn = e.target.closest('.hz-btn');
    if (card) { state.row = 0; state.classIndex = +card.dataset.i; refresh(); }
    else if (diff) { state.row = 1; state.diffIndex = +diff.dataset.i; refresh(); }
    else if (btn) { state.row = +btn.dataset.row; refresh(); confirm(); }
  });

  function setDevice(d) {
    if (d === device) return;
    device = d;
    build();
  }

  build();

  return {
    el,
    state,
    handle,
    setDevice,
    show() { el.classList.add('on'); },
    hide() { el.classList.remove('on'); },
    get rowName() { return ROWS[state.row]; },
    get classId() { return classIds[state.classIndex]; },
    get difficulty() { return diffIds[state.diffIndex]; },
    select(classId, difficulty) {
      const ci = classIds.indexOf(classId);
      const di = diffIds.indexOf(difficulty);
      if (ci >= 0) state.classIndex = ci;
      if (di >= 0) state.diffIndex = di;
      refresh();
    },
    footer: () => footer,
  };
}
