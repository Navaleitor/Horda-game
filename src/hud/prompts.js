// Prompts contextuales con glifo. Dueño: ui-hud-designer.
// prompt:show { id, button, text }  (button: 'A' | 'LB/RB' | ['LB','RB'] | …) · prompt:hide { id }
// Un elemento por id, reutilizado entre show/hide (sin crear DOM en cada aparición).

import { glyphs, escapeHtml } from './glyphs.js';

export function createPrompts(parent) {
  const el = document.createElement('div');
  el.className = 'hz-prompts';
  parent.appendChild(el);

  /** id → { el, g, t, button, text, on } */
  const items = new Map();
  let device = 'gamepad';

  function renderGlyph(it) {
    it.g.innerHTML = it.button ? glyphs(it.button, device, 'game') : '';
  }

  function show({ id, button, text } = {}) {
    if (id == null) return;
    let it = items.get(id);
    if (!it) {
      const p = document.createElement('div');
      p.className = 'hz-prompt';
      p.innerHTML = '<span class="hz-pg"></span><span class="hz-pt"></span>';
      el.appendChild(p);
      it = { el: p, g: p.firstChild, t: p.lastChild, button: null, text: null, on: false };
      items.set(id, it);
    }
    const btnKey = Array.isArray(button) ? button.join('/') : (button || '');
    if (btnKey !== it.button) { it.button = btnKey; renderGlyph(it); }
    const txt = text == null ? '' : String(text);
    if (txt !== it.text) { it.text = txt; it.t.innerHTML = escapeHtml(txt); }
    if (!it.on) { it.on = true; it.el.classList.add('on'); }
    // El más reciente abajo del todo.
    if (el.lastChild !== it.el) el.appendChild(it.el);
  }

  function hide({ id } = {}) {
    const it = items.get(id);
    if (it && it.on) { it.on = false; it.el.classList.remove('on'); }
  }

  function clear() {
    for (const it of items.values()) { it.on = false; it.el.classList.remove('on'); }
  }

  function setDevice(d) {
    if (d === device) return;
    device = d;
    for (const it of items.values()) renderGlyph(it);
  }

  function list() {
    const out = [];
    for (const [id, it] of items) if (it.on) out.push({ id, button: it.button, text: it.text });
    return out;
  }

  return { el, show, hide, clear, setDevice, list };
}
