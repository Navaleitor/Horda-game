// CSS del HUD, inyectado desde JS en <head>. Dueño: ui-hud-designer.
// Estética militar/industrial: acero oscuro, ámbar de aviso, franjas de peligro.
// Todo en em respecto a .hz, cuyo tamaño escala con la altura de la ventana
// (≈14.5 px a 720p, ≈17.7 px a 1080p). Sin fuentes externas (system-ui).

const CSS = `
.hz { position:absolute; inset:0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: calc(0.9vh + 8px); color:#e8e4da; pointer-events:none; --amber:#f0a92e; --steel:#1b1e1f;
  --steel2:#2a2f30; --line:rgba(240,169,46,.35); --red:#e5483a; --green:#6fcf4a; --hit-time:.15s; --prompt-fade:.15s; }
.hz * { box-sizing:border-box; }
.hz-screen { position:absolute; inset:0; display:none; }
.hz-screen.on { display:block; }
.hz-hidden { display:none !important; }

/* ── Glifos ─────────────────────────────────────────────────────────── */
.hz-g { display:inline-flex; align-items:center; justify-content:center; vertical-align:middle; position:relative;
  height:1.6em; min-width:1.6em; font-weight:800; font-size:.85em; line-height:1; color:#fff;
  text-shadow:none; letter-spacing:0; flex:none; }
.hz-g-face { border-radius:50%; width:1.6em; box-shadow: inset 0 -.12em 0 rgba(0,0,0,.35), 0 0 0 .1em rgba(0,0,0,.45); }
.hz-g-a { background:#5aa82a; } .hz-g-b { background:#d8402c; } .hz-g-x { background:#2b6fd1; }
.hz-g-y { background:#e9b218; color:#2a2100; }
.hz-g-bumper { border-radius:.5em .5em .25em .25em; padding:0 .45em; background:#5d6466; font-size:.75em; height:1.7em;
  box-shadow: inset 0 -.12em 0 rgba(0,0,0,.35); }
.hz-g-trigger { border-radius:.75em .75em .2em .2em; padding:0 .4em; background:#5d6466; font-size:.75em; height:1.95em;
  box-shadow: inset 0 -.12em 0 rgba(0,0,0,.35); }
.hz-g-stick { border-radius:50%; width:1.7em; height:1.7em; background:#3d4345; border:.14em solid #7d8588; font-size:.7em; }
.hz-g-click::after { content:''; position:absolute; bottom:-.32em; left:50%; width:.35em; height:.35em; margin-left:-.175em;
  border-radius:50%; background:#cfd5d6; }
.hz-g-sys { border-radius:50%; width:1.6em; background:#5d6466; }
.hz-g-view { display:block; width:.75em; height:.55em; border:.12em solid #fff; border-radius:.1em; position:relative; }
.hz-g-view::before { content:''; position:absolute; left:-.32em; top:-.3em; width:.75em; height:.55em; border:.12em solid #fff;
  border-radius:.1em; background:#5d6466; }
.hz-g-menu { display:block; width:.8em; height:.12em; background:#fff; box-shadow:0 -.25em 0 #fff, 0 .25em 0 #fff; }
.hz-g-dpad { width:1.7em; height:1.7em; }
.hz-g-dpad i { position:absolute; background:#5d6466; border-radius:.12em; }
.hz-g-dpad i:first-child { left:.55em; top:0; width:.6em; height:1.7em; }
.hz-g-dpad i:nth-child(2) { top:.55em; left:0; width:1.7em; height:.6em; }
.hz-g-dpad b { position:absolute; background:#f2f2f2; border-radius:.1em; width:.6em; height:.6em; }
.hz-d-up b { left:.55em; top:0; } .hz-d-down b { left:.55em; bottom:0; }
.hz-d-left b { top:.55em; left:0; } .hz-d-right b { top:.55em; right:0; }
.hz-d-all b { display:none; }
.hz-k { padding:0 .45em; border-radius:.25em; background:#e8e4da; color:#16191a; font-size:.75em; height:1.7em;
  box-shadow: inset 0 -.15em 0 #9a968c; }
.hz-g-sep { margin:0 .15em; opacity:.6; }

/* ── Paneles comunes ────────────────────────────────────────────────── */
.hz-hazard { height:.45em; background: repeating-linear-gradient(-45deg, var(--amber) 0 .6em, #151515 .6em 1.2em); }
.hz-panel { background: linear-gradient(180deg, rgba(36,40,41,.94), rgba(20,22,23,.94)); border:1px solid #3d4446;
  box-shadow: 0 .3em 1.2em rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06); }
.hz-label { font-size:.72em; font-weight:800; letter-spacing:.22em; text-transform:uppercase; color:var(--amber); }
.hz-footer { position:absolute; left:0; right:0; bottom:0; display:flex; gap:2em; justify-content:center; align-items:center;
  padding:.8em 1em; background:linear-gradient(0deg, rgba(0,0,0,.85), rgba(0,0,0,0)); font-size:1em; letter-spacing:.06em; }
.hz-footer span.hz-fi { display:inline-flex; align-items:center; gap:.45em; }

/* ── Menú de inicio ─────────────────────────────────────────────────── */
.hz-menu { pointer-events:auto; background:
  radial-gradient(ellipse at 50% 30%, rgba(60,48,30,.55), rgba(8,9,10,.92) 70%),
  repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 2px, transparent 2px 4px); }
.hz-menu-inner { position:absolute; left:50%; top:4.5%; transform:translateX(-50%); width:min(94vw, 72em); }
.hz-title { text-align:center; }
.hz-title h1 { margin:0; font-size:4.6em; font-weight:900; letter-spacing:.32em; padding-left:.32em; line-height:1;
  color:#efe9dc; text-shadow: 0 .06em 0 #6b4a12, 0 .12em .4em rgba(0,0,0,.8); }
.hz-title .hz-hazard { width:16em; margin:.55em auto .4em; }
.hz-title p { margin:0; color:#a9a397; letter-spacing:.25em; text-transform:uppercase; font-size:.8em; }
.hz-row { margin-top:1.3em; padding:.7em .9em .9em; border-left:.3em solid transparent; transition: background .12s, border-color .12s; }
.hz-row.focus { border-left-color:var(--amber); background: linear-gradient(90deg, rgba(240,169,46,.12), rgba(240,169,46,0) 70%); }
.hz-row-head { display:flex; align-items:baseline; gap:.8em; margin-bottom:.55em; }
.hz-row-head .hz-num { font-weight:900; color:#16191a; background:var(--amber); padding:.05em .45em; font-size:.8em; }
.hz-row-head .hz-hint { margin-left:auto; display:flex; gap:.4em; align-items:center; font-size:.85em; color:#bdb7aa; opacity:0; }
.hz-row.focus .hz-hint { opacity:1; }
.hz-cards { display:grid; grid-template-columns: repeat(4, 1fr); gap:.8em; }
.hz-card { position:relative; padding:.75em .85em .8em; min-height:9.4em; background:linear-gradient(180deg,#262b2c,#17191a);
  border:1px solid #3a4143; opacity:.62; transition: transform .12s, opacity .12s, border-color .12s, box-shadow .12s; cursor:pointer; }
.hz-card::before { content:''; position:absolute; left:0; right:0; top:0; height:.35em; background:var(--cc); }
.hz-card.sel { opacity:1; border-color:var(--cc); box-shadow: 0 0 0 1px var(--cc), 0 0 1.2em -.2em var(--cc); transform:translateY(-.2em); }
.hz-row:not(.focus) .hz-card.sel { box-shadow: 0 0 0 1px var(--cc); transform:none; }
.hz-card h3 { margin:.25em 0 .1em; font-size:1.2em; letter-spacing:.06em; text-transform:uppercase; color:var(--cc); }
.hz-card .hz-role { font-size:.78em; color:#bdb7aa; letter-spacing:.1em; text-transform:uppercase; margin-bottom:.5em; }
.hz-card .hz-kv { font-size:.8em; line-height:1.35; margin-top:.25em; color:#d6d1c5; }
.hz-card .hz-kv b { color:#8f8a7f; font-weight:700; letter-spacing:.06em; text-transform:uppercase; font-size:.85em; margin-right:.3em; }
.hz-card .hz-tick { position:absolute; right:.6em; top:.75em; width:1.1em; height:1.1em; border-radius:50%; border:.15em solid var(--cc);
  opacity:0; } .hz-card.sel .hz-tick { opacity:1; background: radial-gradient(circle, var(--cc) 40%, transparent 45%); }
.hz-diffs { display:grid; grid-template-columns: repeat(3, 1fr); gap:.8em; }
.hz-diff { padding:.6em .9em; background:linear-gradient(180deg,#262b2c,#17191a); border:1px solid #3a4143; opacity:.6; cursor:pointer;
  transition: opacity .12s, border-color .12s, box-shadow .12s; }
.hz-diff.sel { opacity:1; border-color:var(--amber); box-shadow:0 0 0 1px var(--amber); }
.hz-diff h3 { margin:0 0 .2em; font-size:1.1em; letter-spacing:.12em; text-transform:uppercase; }
.hz-diff.sel h3 { color:var(--amber); }
.hz-diff .hz-mult { font-size:.82em; color:#c9c3b6; display:flex; gap:1em; flex-wrap:wrap; }
.hz-diff .hz-mult b { color:#fff; }
.hz-actions { display:flex; gap:1em; align-items:stretch; margin-top:1.1em; padding:0 .9em; }
.hz-btn { position:relative; padding:.65em 1.4em; font-size:1.05em; font-weight:900; letter-spacing:.25em; text-transform:uppercase;
  background:#262b2c; border:1px solid #4a5254; color:#cfcabd; cursor:pointer; display:flex; align-items:center; gap:.7em;
  transition: background .12s, color .12s, box-shadow .12s; }
.hz-btn.primary { flex:1; justify-content:center; font-size:1.35em; }
.hz-btn.focus { background:var(--amber); color:#16191a; border-color:var(--amber); box-shadow:0 0 1.2em -.2em var(--amber); }
.hz-btn.focus .hz-g-face { box-shadow: 0 0 0 .1em rgba(0,0,0,.6); }
.hz-note { margin:.9em .9em 0; font-size:.78em; color:#9d978b; letter-spacing:.04em; }
.hz-note b { color:var(--amber); }

/* ── Pausa / controles / confirmación ───────────────────────────────── */
.hz-pause { pointer-events:auto; background: rgba(6,7,8,.72); backdrop-filter: blur(2px); }
.hz-pause-box { position:absolute; left:8%; top:50%; transform:translateY(-55%); width:22em; }
.hz-pause-box h2 { margin:0; padding:.55em .9em .45em; font-size:1.9em; letter-spacing:.35em; font-weight:900; }
.hz-pause-list { padding:.5em; }
.hz-item { padding:.65em 1em; margin:.25em 0; font-size:1.1em; font-weight:700; letter-spacing:.14em; text-transform:uppercase;
  border-left:.3em solid transparent; color:#c9c3b6; cursor:pointer; display:flex; align-items:center; gap:.6em; }
.hz-item.focus { background:linear-gradient(90deg, rgba(240,169,46,.9), rgba(240,169,46,.55)); color:#16191a; border-left-color:#fff; }
.hz-pause-info { padding:.2em 1.2em .9em; font-size:.8em; color:#9d978b; letter-spacing:.05em; }
.hz-modal { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); }
.hz-confirm { width:26em; }
.hz-confirm h3 { margin:0; padding:.9em 1.1em .3em; font-size:1.25em; letter-spacing:.12em; text-transform:uppercase; }
.hz-confirm p { margin:0; padding:0 1.1em .6em; color:#bdb7aa; font-size:.9em; }
.hz-confirm .hz-pause-list { display:flex; gap:.5em; }
.hz-confirm .hz-item { flex:1; justify-content:center; }
.hz-ctrl { width:min(94vw, 62em); max-height:88vh; display:flex; flex-direction:column; }
.hz-ctrl h3 { margin:0; padding:.6em 1em .4em; font-size:1.25em; letter-spacing:.2em; text-transform:uppercase; display:flex; align-items:center; }
.hz-ctrl h3 small { margin-left:auto; font-size:.6em; color:#9d978b; letter-spacing:.1em; }
.hz-ctrl table { width:100%; border-collapse:collapse; font-size:.8em; }
.hz-ctrl th { text-align:left; color:var(--amber); font-size:.8em; letter-spacing:.18em; text-transform:uppercase; padding:.3em .8em;
  border-bottom:1px solid var(--line); }
.hz-ctrl td { padding:.26em .8em; border-bottom:1px solid rgba(255,255,255,.05); vertical-align:middle; line-height:1.3; }
.hz-ctrl td:first-child { width:5.2em; white-space:nowrap; }
.hz-ctrl td:first-child .hz-g + .hz-g { margin-left:.2em; }
.hz-ctrl tr:nth-child(even) td { background:rgba(255,255,255,.025); }
.hz-ctrl td.hz-dim { color:#8f8a7f; }
.hz-ctrl .hz-kb { padding:.55em 1em .8em; font-size:.75em; color:#9d978b; }
.hz-ctrl-wrap { overflow:hidden; }

/* ── HUD en partida ─────────────────────────────────────────────────── */
.hz-game { text-shadow: 0 1px 2px rgba(0,0,0,.9); }
.hz-paused .hz-game * { animation-play-state: paused !important; }
.hz-vit { position:absolute; left:2.2em; top:2em; width:18em; }
.hz-vit-head { display:flex; align-items:center; gap:.6em; margin-bottom:.35em; }
.hz-classdot { width:.8em; height:.8em; transform:rotate(45deg); background:var(--cc,#888); box-shadow:0 0 .5em var(--cc,#888); }
.hz-vit-head .hz-cname { font-weight:800; letter-spacing:.2em; text-transform:uppercase; font-size:.85em; }
.hz-vit-head .hz-hpnum { margin-left:auto; font-weight:800; font-variant-numeric: tabular-nums; }
.hz-hpbar { position:relative; height:.8em; background:rgba(0,0,0,.55); border:1px solid rgba(255,255,255,.18);
  clip-path: polygon(0 0, 100% 0, calc(100% - .5em) 100%, 0 100%); }
.hz-hpfill { position:absolute; left:0; top:0; bottom:0; width:100%; background:linear-gradient(180deg,#e8e4da,#b9b3a5);
  transform-origin:0 50%; transition: transform .18s ease-out; }
.hz-vit.low .hz-hpfill { background:linear-gradient(180deg,#ff6a5a,#b8261a); animation: hz-pulse .8s ease-in-out infinite; }
.hz-vit.low .hz-hpnum { color:var(--red); }
@keyframes hz-pulse { 50% { opacity:.55; } }

.hz-wpn { position:absolute; right:2.2em; bottom:2em; display:flex; align-items:flex-end; gap:1.2em; }
.hz-wbox { min-width:14em; padding:.55em .9em .65em; border-right:.3em solid var(--amber); }
.hz-wbox .hz-wname { font-size:.8em; font-weight:800; letter-spacing:.2em; text-transform:uppercase; color:#d6d1c5; text-align:right; }
.hz-ammo { display:flex; justify-content:flex-end; align-items:baseline; gap:.3em; font-variant-numeric: tabular-nums; }
.hz-ammo .hz-mag { font-size:2.6em; font-weight:900; line-height:1; }
.hz-ammo .hz-res { font-size:1.15em; color:#a9a397; font-weight:700; }
.hz-ammo .hz-res::before { content:'/ '; opacity:.6; }
.hz-wbox.low .hz-mag { color:var(--amber); } .hz-wbox.empty .hz-mag { color:var(--red); }
.hz-magbar { height:.25em; margin-top:.35em; background:rgba(0,0,0,.5); }
.hz-magfill { height:100%; width:100%; background:#d6d1c5; transform-origin:100% 50%; }
.hz-wbox.low .hz-magfill { background:var(--amber); } .hz-wbox.empty .hz-magfill { background:var(--red); }
.hz-wbox.buff { box-shadow: 0 0 0 1px #ffd36a, 0 0 1.2em -.2em #ffd36a; }
.hz-wbox .hz-buff { display:none; font-size:.7em; font-weight:800; color:#ffd36a; letter-spacing:.15em; text-align:right; }
.hz-wbox.buff .hz-buff { display:block; }

.hz-slots { position:relative; width:7.6em; height:6.4em; font-size:.85em; }
.hz-slot { position:absolute; width:3.2em; height:2em; display:flex; align-items:center; justify-content:center; gap:.2em; flex-direction:column;
  background:rgba(0,0,0,.5); border:1px solid rgba(255,255,255,.18); font-size:.62em; font-weight:800; letter-spacing:.08em;
  text-transform:uppercase; color:#a9a397; text-align:center; line-height:1.05; }
.hz-slot.cur { background:rgba(240,169,46,.85); color:#16191a; border-color:#fff; text-shadow:none; }
.hz-slot.empty { color:#666; border-style:dashed; }
.hz-slot.flash { animation: hz-flash .5s ease-out 2; }
@keyframes hz-flash { 0%,100% { border-color:rgba(255,255,255,.18); } 50% { border-color:var(--red); background:rgba(229,72,58,.35); } }
.hz-slot.s0 { left:0; top:2.2em; } .hz-slot.s1 { right:0; top:2.2em; } .hz-slot.s2 { left:2.2em; top:4.4em; }
.hz-slot.s3 { left:2.2em; top:0; opacity:.35; }
.hz-slots .hz-g-dpad { position:absolute; left:2.95em; top:2.35em; font-size:.95em; }

.hz-toast { position:absolute; left:50%; top:62%; transform:translateX(-50%); padding:.35em 1.1em; font-weight:900;
  letter-spacing:.3em; text-transform:uppercase; background:rgba(0,0,0,.6); border-left:.25em solid var(--red);
  border-right:.25em solid var(--red); opacity:0; }
.hz-toast.show-a { animation: hz-toast-a 1.2s ease-out forwards; } .hz-toast.show-b { animation: hz-toast-b 1.2s ease-out forwards; }
@keyframes hz-toast-a { 0% { opacity:0; transform:translate(-50%,.4em); } 12%,75% { opacity:1; transform:translate(-50%,0); } 100% { opacity:0; } }
@keyframes hz-toast-b { 0% { opacity:0; transform:translate(-50%,.4em); } 12%,75% { opacity:1; transform:translate(-50%,0); } 100% { opacity:0; } }

/* Retícula */
.hz-xh { position:absolute; left:50%; top:50%; width:0; height:0; --gap:.9em; transition: opacity .1s; }
.hz-xh.aim { --gap:.35em; }
.hz-xh.hide { opacity:0; }
.hz-xh i { position:absolute; background:#f4f1ea; box-shadow:0 0 2px rgba(0,0,0,.9); transition: transform .12s ease-out; }
.hz-xh i.t, .hz-xh i.b { width:2px; height:.65em; left:-1px; }
.hz-xh i.l, .hz-xh i.r { height:2px; width:.65em; top:-1px; }
.hz-xh i.t { bottom:0; transform:translateY(calc(-1 * var(--gap))); } .hz-xh i.b { top:0; transform:translateY(var(--gap)); }
.hz-xh i.l { right:0; transform:translateX(calc(-1 * var(--gap))); } .hz-xh i.r { left:0; transform:translateX(var(--gap)); }
.hz-xh .hz-dot { position:absolute; width:3px; height:3px; left:-1.5px; top:-1.5px; background:#f4f1ea; border-radius:50%; opacity:0; transition:opacity .12s; }
.hz-xh.aim .hz-dot { opacity:1; }
.hz-hit { position:absolute; left:50%; top:50%; width:0; height:0; opacity:0; }
.hz-hit i { position:absolute; width:.75em; height:2px; background:#fff; left:-.375em; top:-1px; box-shadow:0 0 2px #000; }
.hz-hit i:nth-child(1) { transform: rotate(45deg) translateX(-.9em); } .hz-hit i:nth-child(2) { transform: rotate(135deg) translateX(-.9em); }
.hz-hit i:nth-child(3) { transform: rotate(225deg) translateX(-.9em); } .hz-hit i:nth-child(4) { transform: rotate(315deg) translateX(-.9em); }
.hz-hit.head i { background:#ff4a36; height:3px; width:1em; left:-.5em; }
.hz-hit.kill i { background:#ff4a36; height:3px; width:1.15em; left:-.575em; }
.hz-hit.ha { animation: hz-hit-a var(--hit-time) ease-out forwards; } .hz-hit.hb { animation: hz-hit-b var(--hit-time) ease-out forwards; }
.hz-hit.head.ha, .hz-hit.kill.ha { animation-duration: calc(var(--hit-time) * 2); }
.hz-hit.head.hb, .hz-hit.kill.hb { animation-duration: calc(var(--hit-time) * 2); }
@keyframes hz-hit-a { 0% { opacity:1; transform:scale(1.35); } 60% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(1); } }
@keyframes hz-hit-b { 0% { opacity:1; transform:scale(1.35); } 60% { opacity:1; transform:scale(1); } 100% { opacity:0; transform:scale(1); } }

/* Recarga activa */
.hz-rl { position:absolute; left:50%; top:calc(50% + 4.2em); transform:translateX(-50%); width:var(--rl-w,220px); opacity:0;
  transition: opacity .15s; }
.hz-rl.on { opacity:1; }
.hz-rl-track { position:relative; height:.7em; background:rgba(0,0,0,.6); border:1px solid rgba(255,255,255,.35); overflow:hidden; }
.hz-rl-good { position:absolute; top:0; bottom:0; background:rgba(200,200,200,.4); }
.hz-rl-perf { position:absolute; top:0; bottom:0; background:#f5f2ea; box-shadow:0 0 .4em #fff; }
.hz-rl-run { position:absolute; inset:0; }
.hz-rl-run.ra { animation: hz-rl-a linear forwards; } .hz-rl-run.rb { animation: hz-rl-b linear forwards; }
.hz-rl.done .hz-rl-run { animation-play-state: paused !important; }
@keyframes hz-rl-a { from { transform:translateX(0); } to { transform:translateX(100%); } }
@keyframes hz-rl-b { from { transform:translateX(0); } to { transform:translateX(100%); } }
.hz-rl-cur { position:absolute; left:-2px; top:-.2em; bottom:-.2em; width:4px; background:var(--red); box-shadow:0 0 .35em var(--red); }
.hz-rl-res { margin-top:.3em; text-align:center; font-weight:900; letter-spacing:.25em; text-transform:uppercase; font-size:.85em; height:1.2em; }
.hz-rl-hint { display:flex; justify-content:center; align-items:center; gap:.4em; font-size:.75em; margin-top:.25em; color:#cfcabd; }
.hz-rl.done .hz-rl-hint { visibility:hidden; }
.hz-rl.perfect .hz-rl-res { color:#ffd36a; } .hz-rl.perfect .hz-rl-track { border-color:#ffd36a; box-shadow:0 0 .6em #ffd36a; }
.hz-rl.good .hz-rl-res { color:var(--green); } .hz-rl.good .hz-rl-track { border-color:var(--green); }
.hz-rl.failed .hz-rl-res { color:var(--red); } .hz-rl.failed .hz-rl-track { border-color:var(--red); }
.hz-ammohint { position:absolute; left:50%; top:calc(50% + 2.6em); transform:translateX(-50%); display:flex; align-items:center; gap:.45em;
  font-weight:800; font-size:.85em; letter-spacing:.2em; text-transform:uppercase; color:var(--amber); }

/* Prompts */
.hz-prompts { position:absolute; left:50%; bottom:22%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:.4em; }
.hz-prompt { display:flex; align-items:center; gap:.55em; padding:.3em .9em .3em .4em; background:rgba(10,11,12,.72);
  border:1px solid rgba(255,255,255,.12); border-left:.2em solid var(--amber); font-weight:700; letter-spacing:.05em; font-size:1.02em;
  opacity:0; transition: opacity var(--prompt-fade); }
.hz-prompt.on { opacity:1; }
.hz-prompt .hz-pg { display:inline-flex; align-items:center; }
`;

let injected = null;

export function injectStyles() {
  if (injected) return injected;
  injected = document.createElement('style');
  injected.id = 'hz-styles';
  injected.textContent = CSS;
  document.head.appendChild(injected);
  return injected;
}

export function removeStyles() {
  if (injected) { injected.remove(); injected = null; }
}
